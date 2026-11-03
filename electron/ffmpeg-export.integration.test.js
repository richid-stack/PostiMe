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

test('HQ export applies blend modes, custom LUTs and opacity keyframes', { skip: !ffmpegPath && 'no FFmpeg binary' }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'postime-hq-comp-'));
    const solid = (name, hex) => run(['-f', 'lavfi', '-i', `color=c=0x${hex}:s=320x180:r=30:d=3`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(dir, `${name}.mp4`)]);
    solid('back', '804020');
    solid('front', 'c86432');
    solid('white', 'ffffff');
    run(['-f', 'lavfi', '-i', 'color=c=0x00c030:s=320x180:r=30:d=3,drawbox=x=100:y=50:w=80:h=100:color=0xd9a07a:t=fill', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(dir, 'green.mp4')]);

    const { renderTimeline } = require('./ffmpeg-handler.js');
    const mediaItems = ['back', 'front', 'white', 'green'].map((id) => ({ id, type: 'video', path: `${id}.mp4` }));
    const timelineTracks = [{ id: 'v1', type: 'video', isMuted: false }, { id: 'v2', type: 'video', isMuted: false }];
    const clip = (id, mediaId, trackId, extra = {}) => ({ id, mediaId, trackId, start: 0, end: 3, duration: 3, speed: 1, sourceIn: 0, sourceOut: 3, effect: null, ...extra });
    // .cube order has red varying fastest, so each output triple here is (b, g, r): a red/blue swap.
    const swapLut = { title: 'swap', size: 2, is3d: true, domainMin: [0, 0, 0], domainMax: [1, 1, 1], data: Float32Array.from(Array.from({ length: 8 }, (_, i) => [(i >> 2) & 1, (i >> 1) & 1, i & 1]).flat()) };
    const options = (filename) => ({ width: 320, height: 180, fps: 30, bitrateKbps: 3000, videoCodec: 'h264', container: 'mp4', filename, gpuAcceleration: 'off' });
    const render = (filename, top) => renderTimeline(dir, { mediaItems, timelineTracks, timelineClips: [clip('b', 'back', 'v1'), top] }, options(filename));
    const near = (actual, expected, label, tolerance = 8) => {
        actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) <= tolerance, `${label}: expected about ${expected}, got ${actual}`));
    };

    near(pixelAt(await render('multiply.mp4', clip('f', 'front', 'v2', { blendMode: 'multiply' })), 1, 160, 90, 320, 180), [100, 25, 6], 'multiply');
    near(pixelAt(await render('screen.mp4', clip('f', 'front', 'v2', { blendMode: 'screen' })), 1, 160, 90, 320, 180), [227, 139, 75], 'screen');

    const ramp = [
        { id: 'k1', time: 0, value: 0, property: 'opacity', easing: 'linear' },
        { id: 'k2', time: 2, value: 1, property: 'opacity', easing: 'linear' },
    ];
    near(pixelAt(await render('opacity.mp4', clip('f', 'white', 'v2', { keyframes: ramp })), 1, 160, 90, 320, 180), [191, 159, 143], 'half-way opacity');

    near(pixelAt(await render('lut.mp4', clip('f', 'front', 'v2', { filters: { lut: 'custom', customLut: swapLut, lutIntensity: 100 } })), 1, 160, 90, 320, 180), [50, 100, 200], 'custom LUT');
    near(pixelAt(await render('lut-half.mp4', clip('f', 'front', 'v2', { filters: { lut: 'custom', customLut: swapLut, lutIntensity: 50 } })), 1, 160, 90, 320, 180), [125, 100, 125], 'custom LUT at 50%');

    // A keyed clip must stay transparent after a grade and a LUT: the screen shows the background, the subject is graded.
    const keyed = await render('key-lut.mp4', clip('f', 'green', 'v2', {
        chromaKey: { color: '#00c030', tolerance: 0.35, softness: 0.25, despill: 0.5 },
        filters: { brightness: 100, lut: 'custom', customLut: swapLut, lutIntensity: 100 },
    }));
    near(pixelAt(keyed, 1, 10, 10, 320, 180), [128, 64, 32], 'keyed screen shows the background', 10);
    near(pixelAt(keyed, 1, 160, 90, 320, 180), [122, 160, 217], 'keyed subject is graded', 12);

    // A blend mode the export cannot reproduce is refused with a message rather than rendered wrong.
    await assert.rejects(render('bad.mp4', clip('f', 'front', 'v2', { blendMode: 'hue' })), /blend/i);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('HQ export draws titles from the images the app sends, and refuses a title that was never drawn', { skip: !ffmpegPath && 'no FFmpeg binary' }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'postime-hq-title-'));
    run(['-f', 'lavfi', '-i', 'color=c=0x304050:s=320x180:r=30:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(dir, 'back.mp4')]);
    // stands in for the PNG the app draws for a title: a red 100 x 40 block
    run(['-f', 'lavfi', '-i', 'color=c=0xff0000:s=100x40,format=rgba', '-frames:v', '1', path.join(dir, 'title.png')]);
    const dataUrl = `data:image/png;base64,${fs.readFileSync(path.join(dir, 'title.png')).toString('base64')}`;

    const { renderTimeline } = require('./ffmpeg-handler.js');
    const mediaItems = [
        { id: 'back', type: 'video', path: 'back.mp4' },
        // what the app stores behind a title: a transparent picture, not a file on disk
        { id: 'title', type: 'image', url: 'data:image/png;base64,iVBORw0KGgo=' },
    ];
    const timelineTracks = [{ id: 'v1', type: 'video', isMuted: false }, { id: 'v2', type: 'video', isMuted: false }];
    const backClip = { id: 'b', mediaId: 'back', trackId: 'v1', start: 0, end: 3, duration: 3, speed: 1, sourceIn: 0, sourceOut: 3, effect: null };
    const titleClip = (extra = {}) => ({
        id: 't', mediaId: 'title', trackId: 'v2', start: 0, end: 3, duration: 3, speed: 1, sourceIn: 0, sourceOut: 3, effect: null,
        textConfig: { content: 'Title', font: 'Arial', size: 40, color: '#ffffff', position: 'center' },
        textRaster: { data: dataUrl, width: 100, height: 40, centerX: 25, centerY: 75 },
        ...extra,
    });
    const options = (filename) => ({ width: 320, height: 180, fps: 30, bitrateKbps: 3000, videoCodec: 'h264', container: 'mp4', filename, gpuAcceleration: 'off' });
    const render = (filename, clip) => renderTimeline(dir, { mediaItems, timelineTracks, timelineClips: [backClip, clip] }, options(filename));
    const isRed = (pixel) => pixel[0] > 200 && pixel[1] < 60 && pixel[2] < 60;
    const isBackground = (pixel) => Math.abs(pixel[0] - 48) < 14 && Math.abs(pixel[1] - 64) < 14 && Math.abs(pixel[2] - 80) < 14;

    // centre at 25 percent across and 75 percent down: the block covers x 30..130, y 115..155
    const placed = await render('title-placed.mp4', titleClip());
    assert.ok(isRed(pixelAt(placed, 1, 80, 135, 320, 180)), 'title block is where the app said its middle is');
    assert.ok(isBackground(pixelAt(placed, 1, 250, 135, 320, 180)), 'nothing to the right of it');
    assert.ok(isBackground(pixelAt(placed, 1, 80, 40, 320, 180)), 'nothing above it');

    // a title position of 70 percent across is an offset from the usual 50, so the block middle lands at 25 + 20 = 45 percent
    const offset = await render('title-offset.mp4', titleClip({ transform: { scale: 1, opacity: 1, position: { x: 70, y: 50 } } }));
    assert.ok(isRed(pixelAt(offset, 1, 144, 135, 320, 180)), 'transform offset moves the title');
    assert.ok(isBackground(pixelAt(offset, 1, 80, 135, 320, 180)), 'and it left its old place');

    // opacity ramp: half way at one second
    const fading = await render('title-fade.mp4', titleClip({ keyframes: [
        { id: 'k1', time: 0, value: 0, property: 'opacity', easing: 'linear' },
        { id: 'k2', time: 2, value: 1, property: 'opacity', easing: 'linear' },
    ] }));
    const half = pixelAt(fading, 1, 80, 135, 320, 180);
    assert.ok(half[0] > 120 && half[0] < 180 && half[1] > 10 && half[1] < 60, `title is half faded, got ${half}`);

    // a title with no text draws nothing but does not stop the export
    const empty = await render('title-empty.mp4', titleClip({ textRaster: { empty: true } }));
    assert.ok(isBackground(pixelAt(empty, 1, 80, 135, 320, 180)));

    await assert.rejects(render('title-missing.mp4', titleClip({ textRaster: undefined })), /title was not drawn/i);
    fs.rmSync(dir, { recursive: true, force: true });
});
