// Renders a small real timeline through the HQ export and checks the file. Skipped when no FFmpeg binary is available.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

let ffmpegPath = null;
try {
    const candidate = require('ffmpeg-static');
    if (candidate && fs.existsSync(candidate)) ffmpegPath = candidate;
} catch { /* not installed */ }

const run = (args) => execFileSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
const streamTypes = (file) => {
    try { execFileSync(ffmpegPath, ['-hide_banner', '-i', file], { stdio: 'pipe' }); } catch (error) {
        const text = String(error.stderr);
        return { video: /Stream #\d+:\d+.*: Video:/.test(text), audio: /Stream #\d+:\d+.*: Audio:/.test(text) };
    }
    return { video: false, audio: false };
};
const pixelAt = (file, seconds, x, y, width, height) => {
    const raw = execFileSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-ss', String(seconds), '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 26 });
    const offset = (y * width + x) * 3;
    return [raw[offset], raw[offset + 1], raw[offset + 2]];
};
const bandLevel = (file, seconds, length, hz) => {
    const out = spawnSync(ffmpegPath, ['-hide_banner', '-nostats', '-ss', String(seconds), '-t', String(length), '-i', file, '-vn', '-af', `bandpass=f=${hz}:width_type=h:w=60,volumedetect`, '-f', 'null', '-'], { encoding: 'utf8' });
    const match = String(out.stderr).match(/max_volume: (-?[\d.]+) dB/);
    return match ? Number(match[1]) : -Infinity;
};

test('HQ export keeps audio at the right place and keys the green screen', { skip: !ffmpegPath && 'no FFmpeg binary' }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'postime-hq-'));
    run(['-f', 'lavfi', '-i', 'color=c=0x00c030:s=320x180:r=30:d=3,drawbox=x=0:y=0:w=160:h=180:color=0x007a1e:t=fill,drawbox=x=100:y=50:w=80:h=100:color=0xd9a07a:t=fill', '-f', 'lavfi', '-i', 'sine=frequency=200:sample_rate=44100:duration=3', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', path.join(dir, 'green.mp4')]);
    run(['-f', 'lavfi', '-i', 'color=c=0xff00ff:s=320x180:r=30:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(dir, 'bg.mp4')]);
    run(['-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000:duration=2', '-c:a', 'libmp3lame', path.join(dir, 'music.mp3')]);

    const { renderTimeline } = require('./ffmpeg-handler.js');
    const output = await renderTimeline(dir, {
        mediaItems: [
            { id: 'bg', type: 'video', path: 'bg.mp4' },
            { id: 'gs', type: 'video', path: 'green.mp4' },
            { id: 'mu', type: 'audio', path: 'music.mp3' },
        ],
        timelineTracks: [
            { id: 'v1', type: 'video', isMuted: false },
            { id: 'v2', type: 'video', isMuted: false },
            { id: 'a1', type: 'audio', isMuted: false },
        ],
        timelineClips: [
            { id: 'c1', mediaId: 'bg', trackId: 'v1', start: 0, end: 3, duration: 3, speed: 1, sourceIn: 0, sourceOut: 3, effect: null, volume: 0 },
            { id: 'c2', mediaId: 'gs', trackId: 'v2', start: 0, end: 3, duration: 3, speed: 1, sourceIn: 0, sourceOut: 3, effect: null, volume: 1, chromaKey: { color: '#00c030', tolerance: 0.35, softness: 0.25, despill: 0.5 } },
            { id: 'c3', mediaId: 'mu', trackId: 'a1', start: 1, end: 2, duration: 1, speed: 1, sourceIn: 0, sourceOut: 1, effect: null, volume: 1 },
        ],
    }, { width: 320, height: 180, fps: 30, bitrateKbps: 2000, videoCodec: 'h264', container: 'mp4', filename: 'out.mp4', gpuAcceleration: 'off' });

    const streams = streamTypes(output);
    assert.ok(streams.video, 'has picture');
    assert.ok(streams.audio, 'has sound');

    const light = pixelAt(output, 1, 250, 20, 320, 180);
    const dark = pixelAt(output, 1, 40, 20, 320, 180);
    const subject = pixelAt(output, 1, 140, 100, 320, 180);
    for (const [name, pixel] of [['light screen', light], ['dark screen', dark]]) {
        assert.ok(pixel[0] > 200 && pixel[1] < 60 && pixel[2] > 200, `${name} should show the magenta background, got ${pixel}`);
    }
    assert.ok(subject[0] > 180 && subject[1] > 120 && subject[2] < 160, `subject should stay skin-coloured, got ${subject}`);

    // The 200 Hz sound from the green-screen clip leaks a little into the 880 Hz band, so compare levels instead of testing for silence.
    const inside = bandLevel(output, 1.2, 0.6, 880);
    assert.ok(inside > -40, `music is present inside its clip (${inside} dB)`);
    assert.ok(bandLevel(output, 0.1, 0.6, 880) < inside - 25, 'music is absent before its clip');
    assert.ok(bandLevel(output, 2.3, 0.6, 880) < inside - 25, 'music is absent after its clip');
    assert.ok(bandLevel(output, 0.1, 0.6, 200) > -40, "the green-screen clip's own sound is kept");
    fs.rmSync(dir, { recursive: true, force: true });
});
