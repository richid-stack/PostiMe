# Upstream

PostiMe is a derivative of the **AI Video Production Editor**.

- Upstream: https://github.com/LudwigKienle/ai-video-production-editor
- Author: Ludwig Maximillian Kienle
- Licence: GPL-3.0-or-later (kept; see `LICENSE`, `NOTICE`, `AUTHORS.md`)

## Inherited unchanged

The engine, the AI tool layer, the Electron shell, the server and API code, the workspace logic and the editor's line icon set.

## Changed in PostiMe

- Visual layer: tokens, typography, radii, grain, motion, light and dark themes (`theme/postime.css`, `index.css`).
- Single accent system with a Settings → Appearance picker (`src/theme/`, `theme/accents.css`).
- Every emoji replaced by an icon in the editor's own style (`src/components/GlyphIcon.tsx`, new entries at the end of `src/components/icons.tsx`).
- Tailwind compiled at build time; hue utilities collapse onto the single accent.
- Onboarding, account menu and Settings → Appearance rebuilt.
- Export and keying: timeline chroma key now renders in the preview (GPU shader) and in HQ export; HQ FFmpeg export and Quick Export now carry audio (upstream dropped it). Modules: `src/utils/chromaKey*.ts`, `electron/ffmpeg-audio-graph.js`, `electron/ffmpeg-chroma.js`, `electron/ffmpeg-composite.js`. HQ export also now renders blend modes, custom LUTs, opacity keyframes and titles (`electron/ffmpeg-title.js`, `src/utils/title*.ts`) instead of refusing them, and Quick Export no longer records the title-safe guides.
- Fixes: assistant auto-scroll no longer scrolls the whole app frame; side panels keep a usable minimum width; translucent gray surfaces follow the theme.

## Branding

Upstream's `TRADEMARK.md` reserves its name, logos and icons for official releases. PostiMe ships its own name and app icon (`build/icon.png`). The in-app logo component is still upstream's and should be replaced before any public release.

Upstream's `npm run check:public-release` also flags the default plugin registry entry in `src/services/pluginService.ts` ("Buckswood Post Plugins", pointing at the upstream author's repository). PostiMe still ships it; point it at your own registry or remove it before a public release.

This file is a record of provenance, not legal advice.
