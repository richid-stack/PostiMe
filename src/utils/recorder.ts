/**
 * Small pure helpers for the in-app recorder (camera, screen, microphone).
 * Kept free of browser objects so they can be tested directly.
 */

export type RecordMode = 'camera' | 'screen' | 'audio';

const VIDEO_TYPES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
const AUDIO_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

/** The first recording format the browser supports for this kind of recording, or '' to let it choose. */
export const pickRecorderMimeType = (mode: RecordMode, isSupported: (type: string) => boolean): string => {
  const candidates = mode === 'audio' ? AUDIO_TYPES : VIDEO_TYPES;
  return candidates.find((type) => {
    try {
      return isSupported(type);
    } catch {
      return false;
    }
  }) ?? '';
};

export const extensionForMimeType = (mimeType: string, mode: RecordMode): string => {
  const base = mimeType.split(';')[0].trim().toLowerCase();
  if (base === 'video/mp4') return 'mp4';
  if (base === 'audio/mp4') return 'm4a';
  if (base === 'audio/ogg') return 'ogg';
  if (base === 'audio/webm' || base === 'video/webm') return 'webm';
  return mode === 'audio' ? 'webm' : 'webm';
};

const pad = (value: number) => String(value).padStart(2, '0');

const MODE_LABEL: Record<RecordMode, string> = { camera: 'Camera', screen: 'Screen', audio: 'Voice' };

/** "Camera 2026-11-04 14.05.09.webm": readable in the media bin, and valid on every file system. */
export const buildRecordingFileName = (mode: RecordMode, mimeType: string, now: Date): string => {
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}`;
  return `${MODE_LABEL[mode]} ${stamp}.${extensionForMimeType(mimeType, mode)}`;
};

/** 0:07, 12:03, 1:02:03 */
export const formatRecordingTime = (seconds: number): string => {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

/** Microphone loudness from time-domain samples (bytes, 128 = silence) as 0 to 1, for the level meter. */
export const levelFromSamples = (samples: ArrayLike<number>): number => {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const centred = (samples[i] - 128) / 128;
    sum += centred * centred;
  }
  const rms = Math.sqrt(sum / samples.length);
  // a gentle curve so ordinary speech moves the meter instead of sitting near the bottom
  return Math.max(0, Math.min(1, Math.sqrt(rms) * 1.4));
};
