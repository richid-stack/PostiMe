'use strict';

/**
 * Screen and window capture for the in-app recorder.
 *
 * The browser's getDisplayMedia needs the desktop app to say which screen or window to give it. The recorder window
 * lists the sources here, the person picks one, and the next getDisplayMedia call is answered with that pick.
 */

const toSourceInfo = (source) => ({
    id: source.id,
    name: source.name,
    kind: String(source.id).startsWith('screen:') ? 'screen' : 'window',
    thumbnail: source.thumbnail && !source.thumbnail.isEmpty() ? source.thumbnail.toDataURL() : null,
});

const pickSource = (sources, selectedId) => (
    sources.find((source) => source.id === selectedId)
    || sources.find((source) => String(source.id).startsWith('screen:'))
    || sources[0]
    || null
);

const registerCaptureHandlers = ({ ipcMain, session, desktopCapturer }) => {
    let selectedId = null;

    ipcMain.handle('capture:listSources', async () => {
        const sources = await desktopCapturer.getSources({
            types: ['screen', 'window'],
            thumbnailSize: { width: 320, height: 180 },
            fetchWindowIcons: false,
        });
        return sources.map(toSourceInfo);
    });

    ipcMain.handle('capture:selectSource', (_event, id) => {
        selectedId = typeof id === 'string' && id ? id : null;
        return true;
    });

    session.setDisplayMediaRequestHandler(async (_request, callback) => {
        try {
            const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
            const source = pickSource(sources, selectedId);
            selectedId = null;
            callback(source ? { video: source } : {});
        } catch (error) {
            console.error('Screen capture source lookup failed', error);
            callback({});
        }
    });
};

module.exports = { registerCaptureHandlers, toSourceInfo, pickSource };
