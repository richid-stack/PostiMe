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

test('HQ export renders transitions between clips', { skip: !ffmpegPath && 'no FFmpeg binary' }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'postime-hq-trans-'));
    const solid = (name, hex) => run(['-f', 'lavfi', '-i', `color=c=0x${hex}:s=320x180:r=30:d=3`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(dir, `${name}.mp4`)]);
    solid('a', 'c82828');
    solid('b', '283cc8');
    const A = [200, 40, 40];
    const B = [40, 60, 200];

    const { renderTimeline } = require('./ffmpeg-handler.js');
    const mediaItems = [{ id: 'a', type: 'video', path: 'a.mp4' }, { id: 'b', type: 'video', path: 'b.mp4' }];
    const timelineTracks = [{ id: 'v1', type: 'video', isMuted: false }];
    const clip = (id, mediaId, start, extra = {}) => ({ id, mediaId, trackId: 'v1', start, end: start + 3, duration: 3, speed: 1, sourceIn: 0, sourceOut: 3, effect: null, ...extra });
    const render = (type, duration = 1) => renderTimeline(dir, {
        mediaItems,
        timelineTracks,
        timelineClips: [clip('a', 'a', 0, { transitionOut: { type, duration } }), clip('b', 'b', 3)],
    }, { width: 320, height: 180, fps: 30, bitrateKbps: 3000, videoCodec: 'h264', container: 'mp4', filename: `t-${type.replace(/ /g, '')}.mp4`, gpuAcceleration: 'off' });
    const mix = (c1, c2, a) => c1.map((v, i) => v * (1 - a) + c2[i] * a);
    const near = (actual, expected, label) => actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) <= 9, `${label}: expected about ${expected.map(Math.round)}, got ${actual}`));
    const frame = (file, t, x = 160) => pixelAt(file, t, x, 90, 320, 180);

    // half way through a one second transition at t = 2.5; before it the first clip is plain, after it the second is
    const cross = await render('Cross Fade');
    near(frame(cross, 1.5), A, 'before the transition');
    near(frame(cross, 2.5), mix(mix([0, 0, 0], A, 0.5), B, 0.5), 'cross fade');
    near(frame(cross, 3.5), B, 'after the transition');

    near(frame(await render('Fade to Black'), 2.5), mix([0, 0, 0], A, 0.5), 'fade to black');
    near(frame(await render('Dip to White'), 2.5), [204, 204, 204], 'dip to white');

    const swipe = await render('Swipe Left');
    near(frame(swipe, 2.5, 80), A, 'swipe: ending clip still on the left');
    near(frame(swipe, 2.5, 240), B, 'swipe: next clip arriving on the right');

    const whip = await render('Whip Pan');
    near(frame(whip, 2.5, 160), [0, 0, 0], 'whip pan: nothing in the middle at the half way point');

    const flash = await render('Lightning Flash');
    near(frame(flash, 2.5), mix(mix(mix([0, 0, 0], A, 0.35), B, 0.2424), [255, 255, 255], 0.95), 'lightning flash');

    const burn = await render('Film Burn');
    const c2 = mix(mix([0, 0, 0], A, 0.54), B, 0.3902);
    const gradient = [255, 146, 52];
    const screened = c2.map((v, i) => 255 - ((255 - v) * (255 - gradient[i])) / 255);
    near(frame(burn, 2.5), mix(c2, screened, (142 / 255) * 0.85), 'film burn');

    await assert.rejects(render('Star Wipe'), /Star Wipe/);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('HQ export fills a vertical frame from a wide picture, around the chosen focus, and leaves small overlays alone', { skip: !ffmpegPath && 'no FFmpeg binary' }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'postime-hq-reframe-'));
    // left half red, right half blue, with a white square in the middle
    run(['-f', 'lavfi', '-i', 'color=c=0xff0000:s=320x180:r=30:d=2,drawbox=x=160:y=0:w=160:h=180:color=0x0000ff:t=fill', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(dir, 'wide.mp4')]);
    run(['-f', 'lavfi', '-i', 'color=c=0x00ff00:s=160x90:r=30:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(dir, 'logo.mp4')]);
    const { renderTimeline } = require('./ffmpeg-handler.js');
    const mediaItems = [{ id: 'wide', type: 'video', path: 'wide.mp4' }, { id: 'logo', type: 'video', path: 'logo.mp4' }];
    const timelineTracks = [{ id: 'v1', type: 'video', isMuted: false }, { id: 'v2', type: 'video', isMuted: false }];
    const base = { speed: 1, sourceIn: 0, sourceOut: 2, start: 0, end: 2, duration: 2, effect: null, volume: 0 };
    const render = (reframe, withLogo, name) => renderTimeline(dir, {
        mediaItems,
        timelineTracks,
        timelineClips: [
            { id: 'w', mediaId: 'wide', trackId: 'v1', ...base },
            ...(withLogo ? [{ id: 'l', mediaId: 'logo', trackId: 'v2', ...base, transform: { scale: 0.5, opacity: 1, position: { x: 50, y: 20 } } }] : []),
        ],
    }, { width: 180, height: 320, fps: 30, bitrateKbps: 2000, videoCodec: 'h264', container: 'mp4', filename: name, gpuAcceleration: 'off', reframe });
    const at = (file, x, y) => pixelAt(file, 0.5, x, y, 180, 320);
    const is = (px, expected, label) => px.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) <= 14, `${label}: expected ${expected}, got ${px}`));

    const fit = await render({ mode: 'fit' }, false, 'fit.mp4');
    is(at(fit, 90, 10), [0, 0, 0], 'fit leaves a bar at the top');
    is(at(fit, 90, 310), [0, 0, 0], 'fit leaves a bar at the bottom');

    const left = await render({ mode: 'fill', focusX: 0, focusY: 0.5 }, false, 'left.mp4');
    is(at(left, 90, 10), [255, 0, 0], 'fill covers the top, focused left');
    is(at(left, 90, 310), [255, 0, 0], 'fill covers the bottom, focused left');
    is(at(left, 170, 160), [255, 0, 0], 'only the left part of the picture is shown');

    const right = await render({ mode: 'fill', focusX: 1, focusY: 0.5 }, false, 'right.mp4');
    is(at(right, 90, 160), [0, 0, 255], 'focused right shows the blue half');

    const centre = await render({ mode: 'fill', focusX: 0.5, focusY: 0.5 }, false, 'centre.mp4');
    is(at(centre, 10, 160), [255, 0, 0], 'centred: red on the left');
    is(at(centre, 170, 160), [0, 0, 255], 'centred: blue on the right');

    // a small overlay is not cropped: the whole green logo (half the frame width) is still a green block
    const withLogo = await render({ mode: 'fill', focusX: 0, focusY: 0.5 }, true, 'logo.mp4');
    is(at(withLogo, 90, 64), [0, 255, 0], 'logo centre');
    is(at(withLogo, 50, 64), [0, 255, 0], 'logo left part is still there');
    is(at(withLogo, 90, 120), [255, 0, 0], 'below the logo the filled picture shows');
    fs.rmSync(dir, { recursive: true, force: true });
});

test('HQ export plays a speed ramp: the piece lengths add up and each moment shows the right part of the source', { skip: !ffmpegPath && 'no FFmpeg binary' }, async () => {
    const { buildRampSegments, totalRampLength } = await import('../src/utils/speedRamp.ts');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'postime-ramp-'));
    // The red level of every frame is the source time: 0 at the start, 255 at 10 seconds.
    run(['-f', 'lavfi', '-i', "color=c=black:s=160x90:r=30:d=10,geq=r='255*T/10':g=0:b=0", '-f', 'lavfi', '-i', 'sine=frequency=300:sample_rate=44100:duration=10', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv444p', '-crf', '12', '-c:a', 'aac', path.join(dir, 'ramp.mp4')]);

    const segments = buildRampSegments({ sourceIn: 0, sourceOut: 10, preset: 'slow-hit' });
    const total = totalRampLength(segments);
    let cursor = 0;
    const timelineClips = segments.map((segment, index) => {
        const start = cursor;
        cursor += segment.length;
        return { id: `r${index}`, mediaId: 'src', trackId: 'v1', start, end: cursor, duration: segment.sourceOut - segment.sourceIn, speed: segment.speed, sourceIn: segment.sourceIn, sourceOut: segment.sourceOut, effect: null, volume: 1 };
    });
    const { renderTimeline } = require('./ffmpeg-handler.js');
    const output = await renderTimeline(dir, {
        mediaItems: [{ id: 'src', type: 'video', path: 'ramp.mp4' }],
        timelineTracks: [{ id: 'v1', type: 'video', isMuted: false }],
        timelineClips,
    }, { width: 160, height: 90, fps: 30, bitrateKbps: 4000, videoCodec: 'h264', container: 'mp4', filename: 'ramp-out.mp4', gpuAcceleration: 'off' });

    const probe = spawnSync(ffmpegPath, ['-hide_banner', '-i', output], { encoding: 'utf8' });
    const match = String(probe.stderr).match(/Duration: (\d+):(\d+):([\d.]+)/);
    const length = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    assert.ok(Math.abs(length - total) < 0.25, `output is ${length}s, the pieces add up to ${total}s`);
    assert.ok(total > 12, 'a slow-mo hit makes the clip longer');
    assert.ok(streamTypes(output).audio, 'sound is kept');

    const sourceTimeAt = (outputSeconds) => {
        let elapsed = 0;
        for (const segment of segments) {
            if (outputSeconds <= elapsed + segment.length) return segment.sourceIn + (outputSeconds - elapsed) * segment.speed;
            elapsed += segment.length;
        }
        return 10;
    };
    for (const fraction of [0.1, 0.35, 0.5, 0.7, 0.9]) {
        const at = total * fraction;
        const [red] = pixelAt(output, at, 80, 45, 160, 90);
        const shown = (red / 255) * 10;
        const expected = sourceTimeAt(at);
        assert.ok(Math.abs(shown - expected) < 0.35, `at ${at.toFixed(2)}s the picture is from source ${shown.toFixed(2)}s, expected ${expected.toFixed(2)}s`);
    }
    fs.rmSync(dir, { recursive: true, force: true });
});

test('HQ export applies a clip EQ and compressor to the sound', { skip: !ffmpegPath && 'no FFmpeg binary' }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'postime-fx-'));
    // Three steady tones, and a second file whose tone is at -20 dBFS for 2 s then 20 dB quieter (-40 dBFS) for 2 s; the compressor threshold sits below both.
    run(['-f', 'lavfi', '-i', 'color=c=black:s=160x90:r=30:d=4', '-f', 'lavfi', '-i', 'sine=frequency=100:sample_rate=48000:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=1200:sample_rate=48000:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=8000:sample_rate=48000:duration=4', '-filter_complex', '[1:a][2:a][3:a]amix=inputs=3:normalize=0[a]', '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '256k', path.join(dir, 'tones.mp4')]);
    run(['-f', 'lavfi', '-i', 'color=c=black:s=160x90:r=30:d=4', '-f', 'lavfi', '-i', "sine=frequency=1000:sample_rate=48000:duration=4,volume='if(lt(t,2),0.8,0.08)':eval=frame", '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '256k', path.join(dir, 'steps.mp4')]);

    const { renderTimeline } = require('./ffmpeg-handler.js');
    const render = (media, audioFx, filename) => renderTimeline(dir, {
        mediaItems: [{ id: 'src', type: 'video', path: media }],
        timelineTracks: [{ id: 'v1', type: 'video', isMuted: false }],
        timelineClips: [{ id: 'c1', mediaId: 'src', trackId: 'v1', start: 0, end: 4, duration: 4, speed: 1, sourceIn: 0, sourceOut: 4, effect: null, volume: 1, ...(audioFx ? { audioFx } : {}) }],
    }, { width: 160, height: 90, fps: 30, bitrateKbps: 1000, videoCodec: 'h264', container: 'mp4', filename, gpuAcceleration: 'off' });

    const flat = await render('tones.mp4', null, 'flat.mp4');
    const tone = await render('tones.mp4', { lowCutHz: 300, midDb: -12, highDb: 9 }, 'tone.mp4');
    const at = (file, hz) => bandLevel(file, 0.5, 3, hz);
    const change = (hz) => at(tone, hz) - at(flat, hz);
    assert.ok(change(100) < -15, `the low cut takes the 100 Hz tone down (${change(100).toFixed(1)} dB)`);
    assert.ok(change(1200) < -8, `the mid cut takes the 1.2 kHz tone down (${change(1200).toFixed(1)} dB)`);
    assert.ok(change(8000) > 5, `the high boost lifts the 8 kHz tone (${change(8000).toFixed(1)} dB)`);

    // An effect with every setting at zero must leave the sound alone.
    const neutral = await render('tones.mp4', { lowCutHz: 0, lowDb: 0, midDb: 0, highDb: 0, compressor: { enabled: false } }, 'neutral.mp4');
    for (const hz of [100, 1200, 8000]) assert.ok(Math.abs(at(neutral, hz) - at(flat, hz)) < 0.5, `neutral EQ leaves ${hz} Hz alone`);

    const stepsFlat = await render('steps.mp4', null, 'steps-flat.mp4');
    const stepsComp = await render('steps.mp4', { compressor: { enabled: true, thresholdDb: -44, ratio: 8, attackMs: 5, releaseMs: 50, makeupDb: 0 } }, 'steps-comp.mp4');
    const spread = (file) => bandLevel(file, 0.3, 1.4, 1000) - bandLevel(file, 2.4, 1.4, 1000);
    assert.ok(spread(stepsFlat) > 17, `the source has a wide gap between loud and quiet (${spread(stepsFlat).toFixed(1)} dB)`);
    assert.ok(spread(stepsComp) < spread(stepsFlat) - 10, `the compressor narrows it (${spread(stepsComp).toFixed(1)} dB from ${spread(stepsFlat).toFixed(1)} dB)`);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('HQ export applies an adjustment layer to everything below it, only while the layer lasts', { skip: !ffmpegPath && 'no FFmpeg binary' }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'postime-adj-'));
    run(['-f', 'lavfi', '-i', 'color=c=0xd02828:s=320x180:r=30:d=4,drawbox=x=160:y=0:w=160:h=180:color=0x2850d0:t=fill', '-c:v', 'libx264', '-pix_fmt', 'yuv444p', '-crf', '10', path.join(dir, 'base.mp4')]);
    run(['-f', 'lavfi', '-i', 'color=c=0x20c040:s=320x180:r=30:d=4', '-c:v', 'libx264', '-pix_fmt', 'yuv444p', '-crf', '10', path.join(dir, 'over.mp4')]);

    const { renderTimeline } = require('./ffmpeg-handler.js');
    const render = (adjustment, filename, extra = []) => renderTimeline(dir, {
        mediaItems: [
            { id: 'base', type: 'video', path: 'base.mp4' },
            { id: 'over', type: 'video', path: 'over.mp4' },
            { id: 'adj', type: 'image', url: 'data:image/png;base64,AAAA', source: 'generated' },
        ],
        timelineTracks: [{ id: 'v1', type: 'video', isMuted: false }, { id: 'v2', type: 'video', isMuted: false }, { id: 'v3', type: 'video', isMuted: false }],
        timelineClips: [
            { id: 'c1', mediaId: 'base', trackId: 'v1', start: 0, end: 4, duration: 4, speed: 1, sourceIn: 0, sourceOut: 4, effect: null },
            ...extra,
            ...(adjustment ? [{ id: 'adj1', mediaId: 'adj', trackId: 'v3', start: 1, end: 3, duration: 2, speed: 1, sourceIn: 0, sourceOut: 2, effect: null, adjustment: true, ...adjustment }] : []),
        ],
    }, { width: 320, height: 180, fps: 30, bitrateKbps: 6000, videoCodec: 'h264', container: 'mp4', filename, gpuAcceleration: 'off' });
    const spread = (pixel) => Math.max(...pixel) - Math.min(...pixel);

    const plain = await render(null, 'adj-plain.mp4');
    const grey = await render({ filters: { saturate: 0 } }, 'adj-grey.mp4');
    for (const time of [0.5, 2, 3.5]) {
        const [r, g, b] = pixelAt(plain, time, 40, 90, 320, 180);
        assert.ok(r > 170 && g < 80 && b < 80, `without the layer the left side is red at ${time}s, got ${[r, g, b]}`);
    }
    assert.ok(spread(pixelAt(grey, 0.5, 40, 90, 320, 180)) > 90, 'before the layer the picture keeps its colour');
    assert.ok(spread(pixelAt(grey, 3.5, 40, 90, 320, 180)) > 90, 'after the layer the picture keeps its colour');
    assert.ok(spread(pixelAt(grey, 2, 40, 90, 320, 180)) < 25, `inside the layer the left side is grey, got ${pixelAt(grey, 2, 40, 90, 320, 180)}`);
    assert.ok(spread(pixelAt(grey, 2, 280, 90, 320, 180)) < 25, 'inside the layer the right side is grey too');

    // Half strength is halfway between the graded and the plain picture.
    const half = await render({ filters: { saturate: 0 }, transform: { scale: 1, opacity: 0.5, position: { x: 50, y: 50 } } }, 'adj-half.mp4');
    const full = spread(pixelAt(plain, 2, 40, 90, 320, 180));
    const partial = spread(pixelAt(half, 2, 40, 90, 320, 180));
    assert.ok(partial > 25 && partial < full - 25, `half strength leaves some colour (${partial} of ${full})`);

    // It grades what is on the tracks below it, including a clip above the base picture, but not a clip on a higher track.
    const mixed = await render({ filters: { saturate: 0 } }, 'adj-mixed.mp4', [
        { id: 'c2', mediaId: 'over', trackId: 'v2', start: 0, end: 4, duration: 4, speed: 1, sourceIn: 0, sourceOut: 4, effect: null, transform: { scale: 0.5, opacity: 1, position: { x: 50, y: 50 } } },
    ]);
    assert.ok(spread(pixelAt(mixed, 2, 160, 90, 320, 180)) < 25, 'the clip on the middle track is graded as well');
    assert.ok(spread(pixelAt(mixed, 0.5, 160, 90, 320, 180)) > 90, 'and keeps its colour outside the layer');
    fs.rmSync(dir, { recursive: true, force: true });
});

test('HQ export treats zero as a real setting: black and white, and an effect turned all the way down', { skip: !ffmpegPath && 'no FFmpeg binary' }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'postime-zero-'));
    run(['-f', 'lavfi', '-i', 'color=c=0xd02828:s=160x90:r=30:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv444p', '-crf', '10', path.join(dir, 'red.mp4')]);
    const { renderTimeline } = require('./ffmpeg-handler.js');
    const render = (overrides, filename) => renderTimeline(dir, {
        mediaItems: [{ id: 'm', type: 'video', path: 'red.mp4' }],
        timelineTracks: [{ id: 'v1', type: 'video', isMuted: false }],
        timelineClips: [{ id: 'c1', mediaId: 'm', trackId: 'v1', start: 0, end: 2, duration: 2, speed: 1, sourceIn: 0, sourceOut: 2, effect: null, ...overrides }],
    }, { width: 160, height: 90, fps: 30, bitrateKbps: 4000, videoCodec: 'h264', container: 'mp4', filename, gpuAcceleration: 'off' });
    const spread = (file) => { const p = pixelAt(file, 1, 80, 45, 160, 90); return Math.max(...p) - Math.min(...p); };
    assert.ok(spread(await render({ filters: { saturate: 0 } }, 'z-bw.mp4')) < 25, 'saturation 0 gives black and white');
    assert.ok(spread(await render({}, 'z-plain.mp4')) > 90, 'untouched stays red');
    assert.ok(spread(await render({ effects: [{ id: 'e1', effect: 'Grayscale', intensity: 0, enabled: true }] }, 'z-fx0.mp4')) > 90, 'a Grayscale effect at 0 does nothing');
    assert.ok(spread(await render({ effects: [{ id: 'e1', effect: 'Grayscale', intensity: 100, enabled: true }] }, 'z-fx100.mp4')) < 25, 'a Grayscale effect at 100 greys the picture');
    fs.rmSync(dir, { recursive: true, force: true });
});
