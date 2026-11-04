import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MicIcon, RecordIcon, ScreenIcon, VideoIcon } from './icons';
import {
  buildRecordingFileName,
  formatRecordingTime,
  levelFromSamples,
  pickRecorderMimeType,
  type RecordMode,
} from '../utils/recorder';

interface RecorderModalProps {
  onClose: () => void;
  /** Gets the finished recording as a file, like an upload. */
  onRecorded: (file: File) => void;
  /**
   * 'dialog' is the full recorder. 'voiceover' is a small panel docked in the corner that records the microphone
   * only, leaves the editor visible, and can play the timeline while recording.
   */
  variant?: 'dialog' | 'voiceover';
  /** The take has begun (after the countdown). `playAlong` is the voiceover "play the video" choice. */
  onRecordingStart?: (playAlong: boolean) => void;
  /** The take has ended (stopped, or the device went away). */
  onRecordingStop?: () => void;
}

type Phase = 'setup' | 'countdown' | 'recording' | 'saving';
type CaptureSource = { id: string; name: string; kind: 'screen' | 'window'; thumbnail: string | null };

const MODES: Array<{ id: RecordMode; label: string; hint: string; Icon: React.FC<{ className?: string }> }> = [
  { id: 'camera', label: 'Camera', hint: 'Webcam and microphone', Icon: VideoIcon },
  { id: 'screen', label: 'Screen', hint: 'A screen or window, with your voice if you like', Icon: ScreenIcon },
  { id: 'audio', label: 'Voice', hint: 'Microphone only, for voiceover', Icon: MicIcon },
];

const errorText = (error: unknown): string => {
  const name = (error as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Access was blocked. Allow the camera, microphone or screen for PostiMe in your system settings, then try again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'That camera or microphone could not be found. Check it is plugged in and pick it again.';
  if (name === 'NotReadableError') return 'Another app is using that device. Close it and try again.';
  return error instanceof Error && error.message ? error.message : 'Recording could not start.';
};

const RecorderModal: React.FC<RecorderModalProps> = ({ onClose, onRecorded, variant = 'dialog', onRecordingStart, onRecordingStop }) => {
  const compact = variant === 'voiceover';
  const [playAlong, setPlayAlong] = useState(true);
  const [mode, setMode] = useState<RecordMode>(compact ? 'audio' : 'camera');
  const [phase, setPhase] = useState<Phase>('setup');
  const [devices, setDevices] = useState<{ cams: MediaDeviceInfo[]; mics: MediaDeviceInfo[] }>({ cams: [], mics: [] });
  const [cameraId, setCameraId] = useState('');
  const [micId, setMicId] = useState('');
  const [useMic, setUseMic] = useState(true);
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [countdown, setCountdown] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // bumped when the preview needs to open again (after a failed or cancelled take)
  const [previewKey, setPreviewKey] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const meterFrameRef = useRef(0);
  const startedAtRef = useRef(0);
  const mimeRef = useRef('');
  const cancelledRef = useRef(false);
  // the latest callbacks, so a parent re-render never restarts the countdown
  const callbacksRef = useRef({ onRecorded, onRecordingStart, onRecordingStop, onClose });
  callbacksRef.current = { onRecorded, onRecordingStart, onRecordingStop, onClose };

  const stopStream = useCallback(() => {
    cancelAnimationFrame(meterFrameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setLevel(0);
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices({ cams: all.filter((d) => d.kind === 'videoinput'), mics: all.filter((d) => d.kind === 'audioinput') });
    } catch {
      // the lists just stay empty; the default devices still work
    }
  }, []);

  const startMeter = useCallback((stream: MediaStream) => {
    if (stream.getAudioTracks().length === 0) return;
    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(samples);
        setLevel(levelFromSamples(samples));
        meterFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // no meter is not a reason to stop recording
    }
  }, []);

  const openStream = useCallback(async (): Promise<MediaStream> => {
    if (mode === 'screen') {
      if (sourceId) await window.electron?.capture?.selectSource(sourceId);
      const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
      if (!useMic) return display;
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: micId ? { deviceId: { exact: micId } } : true });
        return new MediaStream([...display.getVideoTracks(), ...mic.getAudioTracks()]);
      } catch (micError) {
        display.getTracks().forEach((track) => track.stop());
        throw micError;
      }
    }
    return navigator.mediaDevices.getUserMedia({
      video: mode === 'camera' ? { width: { ideal: 1920 }, height: { ideal: 1080 }, ...(cameraId ? { deviceId: { exact: cameraId } } : {}) } : false,
      audio: micId ? { deviceId: { exact: micId } } : true,
    });
  }, [mode, sourceId, useMic, micId, cameraId]);

  // Camera and voice show a live preview (and the level meter) while setting up; screen opens only at record time
  useEffect(() => {
    if (mode === 'screen') {
      return undefined;
    }
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        const stream = await openStream();
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current && mode === 'camera') {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => undefined);
        }
        startMeter(stream);
        refreshDevices();
      } catch (e) {
        if (!cancelled) setError(errorText(e));
      }
    })();
    return () => { cancelled = true; stopStream(); };
  }, [previewKey, mode, cameraId, micId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode !== 'screen') return;
    refreshDevices();
    window.electron?.capture?.listSources().then((list) => {
      setSources(list);
      setSourceId((current) => current || list.find((s) => s.kind === 'screen')?.id || list[0]?.id || '');
    }).catch(() => setSources([]));
  }, [mode, refreshDevices]);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
    cancelledRef.current = true;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    stopStream();
    };
  }, [stopStream]);

  const beginRecording = useCallback(async () => {
    try {
      let stream = streamRef.current;
      if (!stream) {
        stream = await openStream();
        streamRef.current = stream;
        startMeter(stream);
      }
      if (videoRef.current && mode !== 'audio') {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => undefined);
      }
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      });
      const mimeType = pickRecorderMimeType(mode, (type) => MediaRecorder.isTypeSupported(type));
      mimeRef.current = mimeType;
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeRef.current || (mode === 'audio' ? 'audio/webm' : 'video/webm');
        const blob = new Blob(chunksRef.current, { type });
        stopStream();
        if (!cancelledRef.current) callbacksRef.current.onRecordingStop?.();
        if (cancelledRef.current) return;
        if (blob.size === 0) {
          setError('Nothing was recorded.');
          setPhase('setup');
          setPreviewKey((k) => k + 1);
          return;
        }
        callbacksRef.current.onRecorded(new File([blob], buildRecordingFileName(mode, type, new Date()), { type, lastModified: Date.now() }));
        callbacksRef.current.onClose();
      };
      recorderRef.current = recorder;
      recorder.start(1000);
      startedAtRef.current = performance.now();
      setElapsed(0);
      setPhase('recording');
      callbacksRef.current.onRecordingStart?.(playAlong);
    } catch (e) {
      stopStream();
      setError(errorText(e));
      setPhase('setup');
      setPreviewKey((k) => k + 1);
    }
  }, [mode, openStream, startMeter, stopStream, playAlong]);
  const beginRecordingRef = useRef(beginRecording);
  beginRecordingRef.current = beginRecording;

  // 3, 2, 1 then go
  useEffect(() => {
    if (phase !== 'countdown') return undefined;
    if (countdown <= 0) { beginRecordingRef.current(); return undefined; }
    const timer = window.setTimeout(() => setCountdown((n) => n - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [phase, countdown]);

  useEffect(() => {
    if (phase !== 'recording') return undefined;
    const timer = window.setInterval(() => setElapsed((performance.now() - startedAtRef.current) / 1000), 250);
    return () => window.clearInterval(timer);
  }, [phase]);

  const start = () => {
    setError(null);
    setCountdown(3);
    setPhase('countdown');
  };
  const stop = () => {
    setPhase('saving');
    recorderRef.current?.stop();
  };

  const busy = phase !== 'setup';
  const showPreview = mode !== 'audio';
  const selectClass = 'w-full text-sm';

  return (
    <div
      className={compact ? 'fixed bottom-6 right-6 z-[80] w-[22rem]' : 'fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[80]'}
      role="dialog"
      aria-label={compact ? 'Record voiceover' : 'Record'}
    >
      <div className={`app-modal w-full flex flex-col overflow-hidden ${compact ? 'shadow-2xl' : 'max-w-2xl'}`}>
        <header className="flex justify-between items-center p-5 app-modal-header">
          <div>
            <h2 className="text-lg font-bold">{compact ? 'Record voiceover' : 'Record'}</h2>
            <p className="text-xs app-muted">{compact ? 'It lands on an audio track at the playhead.' : 'The recording is added to your media bin when you stop.'}</p>
          </div>
          <button onClick={() => { if (!busy || phase === 'countdown') { stopStream(); onClose(); } }} disabled={phase === 'recording' || phase === 'saving'} className="app-muted hover:text-white disabled:opacity-30" aria-label="Close">&times;</button>
        </header>

        <div className="p-5 space-y-4">
          {!compact && <div className="grid grid-cols-3 gap-2" role="tablist">
            {MODES.map(({ id, label, hint, Icon }) => (
              <button
                key={id}
                role="tab"
                aria-selected={mode === id}
                disabled={busy}
                onClick={() => { if (id === mode) return; stopStream(); setError(null); setMode(id); }}
                style={mode === id ? { boxShadow: '0 0 0 2px var(--app-accent)' } : undefined}
                className={`app-card p-3 text-left transition-colors disabled:opacity-50 ${mode === id ? '' : 'hover:bg-white/5'}`}
              >
                <Icon className="w-5 h-5 mb-1" />
                <div className="text-sm font-bold">{label}</div>
                <div className="text-[11px] app-muted leading-snug">{hint}</div>
              </button>
            ))}
          </div>}

          {compact && (phase === 'countdown' || phase === 'recording' || phase === 'saving') && (
            <div className="flex items-center justify-center gap-3 bg-black rounded-xl py-4 text-lg font-bold" aria-live="assertive">
              {phase === 'countdown' ? <span>Starting in {countdown}</span> : (
                <>
                  <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                  <span className="font-mono" data-testid="recorder-time">{formatRecordingTime(elapsed)}</span>
                </>
              )}
            </div>
          )}

          {!compact && <div className="relative bg-black rounded-xl overflow-hidden aspect-video flex items-center justify-center">
            {showPreview && <video ref={videoRef} muted playsInline className="w-full h-full object-contain" data-testid="recorder-preview" />}
            {mode === 'audio' && <MicIcon className="w-14 h-14 text-white/30" />}
            {mode === 'screen' && phase === 'setup' && sources.length === 0 && (
              <p className="absolute text-sm app-muted px-6 text-center">Press Record and choose what to share.</p>
            )}
            {phase === 'countdown' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-7xl font-bold" aria-live="assertive">{countdown}</div>
            )}
            {phase === 'recording' && (
              <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 rounded-full px-3 py-1 text-sm font-mono">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <span data-testid="recorder-time">{formatRecordingTime(elapsed)}</span>
              </div>
            )}
          </div>}

          {(mode !== 'screen' || useMic) && (
            <div className="flex items-center gap-3" aria-label="Microphone level">
              <MicIcon className="w-4 h-4 app-muted shrink-0" />
              <div className="h-2 flex-1 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-emerald-400 transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} data-testid="recorder-level" />
              </div>
            </div>
          )}

          {phase === 'setup' && (
            <div className="grid sm:grid-cols-2 gap-3">
              {mode === 'camera' && (
                <label className="text-xs app-muted space-y-1">Camera
                  <select className={selectClass} value={cameraId} onChange={(e) => setCameraId(e.target.value)}>
                    <option value="">Default camera</option>
                    {devices.cams.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}
                  </select>
                </label>
              )}
              {mode === 'screen' && (
                <label className="text-xs app-muted space-y-1">Screen or window
                  {sources.length > 0 ? (
                    <select className={selectClass} value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                      {sources.map((s) => <option key={s.id} value={s.id}>{s.kind === 'screen' ? 'Screen: ' : 'Window: '}{s.name}</option>)}
                    </select>
                  ) : (
                    <div className="text-sm text-white/70 py-1.5">You choose when you press Record.</div>
                  )}
                </label>
              )}
              {mode === 'screen' && (
                <label className="text-xs app-muted flex items-center gap-2 pt-5">
                  <input type="checkbox" checked={useMic} onChange={(e) => setUseMic(e.target.checked)} /> Add my microphone
                </label>
              )}
              {(mode !== 'screen' || useMic) && (
                <label className="text-xs app-muted space-y-1">Microphone
                  <select className={selectClass} value={micId} onChange={(e) => setMicId(e.target.value)}>
                    <option value="">Default microphone</option>
                    {devices.mics.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>)}
                  </select>
                </label>
              )}
            </div>
          )}

          {compact && phase === 'setup' && (
            <label className="text-xs app-muted flex items-start gap-2">
              <input type="checkbox" className="mt-0.5" checked={playAlong} onChange={(e) => setPlayAlong(e.target.checked)} />
              <span>Play the video while I record. Wear headphones so the sound does not leak into the microphone.</span>
            </label>
          )}

          {error && <p role="alert" className="text-sm text-red-300 bg-red-500/10 border border-red-400/30 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <footer className="flex justify-end gap-2 p-4 bg-black/20">
          {phase === 'recording' || phase === 'saving' ? (
            <button onClick={stop} disabled={phase === 'saving'} className="app-button app-primary flex items-center gap-2 disabled:opacity-60">
              <span className="w-3 h-3 bg-white rounded-sm" /> {phase === 'saving' ? 'Saving…' : 'Stop and add'}
            </button>
          ) : phase === 'countdown' ? (
            <button onClick={() => setPhase('setup')} className="app-button">Cancel</button>
          ) : (
            <>
              <button onClick={() => { stopStream(); onClose(); }} className="app-button">Close</button>
              <button onClick={start} className="app-button app-primary flex items-center gap-2"><RecordIcon className="w-4 h-4" /> Record</button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
};

export default RecorderModal;
