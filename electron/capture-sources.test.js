const test = require('node:test');
const assert = require('node:assert/strict');

const { registerCaptureHandlers, toSourceInfo, pickSource } = require('./capture-sources');

const image = (empty, url) => ({ isEmpty: () => empty, toDataURL: () => url });
const sources = [
    { id: 'window:7:0', name: 'Notes', thumbnail: image(false, 'data:image/png;base64,AAA') },
    { id: 'screen:1:0', name: 'Screen 1', thumbnail: image(true, '') },
];

const setup = () => {
    const handlers = {};
    let displayHandler = null;
    registerCaptureHandlers({
        ipcMain: { handle: (name, fn) => { handlers[name] = fn; } },
        session: { setDisplayMediaRequestHandler: (fn) => { displayHandler = fn; } },
        desktopCapturer: { getSources: async () => sources },
    });
    const ask = () => new Promise((resolve) => displayHandler({}, resolve));
    return { handlers, ask };
};

test('sources are described for the picker, with a thumbnail when there is one', () => {
    assert.deepEqual(toSourceInfo(sources[0]), { id: 'window:7:0', name: 'Notes', kind: 'window', thumbnail: 'data:image/png;base64,AAA' });
    assert.deepEqual(toSourceInfo(sources[1]), { id: 'screen:1:0', name: 'Screen 1', kind: 'screen', thumbnail: null });
});

test('without a pick the first screen is used, and a pick is honoured once', async () => {
    const { handlers, ask } = setup();
    assert.equal((await handlers['capture:listSources']()).length, 2);
    assert.equal((await ask()).video.id, 'screen:1:0');
    await handlers['capture:selectSource']({}, 'window:7:0');
    assert.equal((await ask()).video.id, 'window:7:0');
    assert.equal((await ask()).video.id, 'screen:1:0', 'the pick does not stick');
});

test('a pick that no longer exists falls back, and no sources gives an empty answer', async () => {
    assert.equal(pickSource(sources, 'window:gone').id, 'screen:1:0');
    assert.equal(pickSource([], null), null);
    const { handlers } = setup();
    assert.equal(await handlers['capture:selectSource']({}, 42), true);
});
