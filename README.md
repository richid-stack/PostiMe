# PostiMe

Research it, create it, post it, learn from it. PostiMe is an AI video production studio: script, world, storyboard, generation, edit, grade, sound and delivery in one desktop and web app.

The engine and workspaces come from the [AI Video Production Editor](https://github.com/LudwigKienle/ai-video-production-editor) by Ludwig Maximillian Kienle (GPL-3.0-or-later). PostiMe re-skins it in its own design language and upgrades the weak spots. See [UPSTREAM.md](UPSTREAM.md) for exactly what is inherited and what changed.

## What is different from upstream

- **PostiMe design language.** Graphite dark (never purple), PostiMe white for light, DM Sans with a 12px floor, large radii, hairlines instead of boxes in boxes. See [DESIGN.md](DESIGN.md).
- **One accent, real clay.** The default accent is clay (a brick red-brown with a stippled grain), not orange. Settings → Appearance, the account menu and onboarding all let you switch it to rose, gold, moss, teal, steel, plum or graphite. There is only ever one accent per theme.
- **Icons.** The editor's own line icons are kept as they were. Anywhere upstream used an emoji, it now uses an icon drawn in the same style.
- **Build-time CSS.** Tailwind is compiled at build time (no CDN), and fonts are bundled.
- **Single source of tokens.** `theme/postime.css` and `src/theme/accents.json` are the only places colours are defined.

## Run it

```bash
npm install
npm run dev            # http://localhost:5173/studio.html
npm run build:web      # typecheck + production build
npm test               # unit tests
```

Add a Gemini API key in Settings → API keys to use the AI features. Electron scripts are in `package.json` (`npm run` lists them).

## Project map

| Path | What lives there |
| --- | --- |
| `src/workspaces/` | One file per page: Project Hub, Images, Video, Nodes, Timeline, Color, Export and so on |
| `src/components/icons.tsx` | The editor's icon set. Append new icons in the same 24px, 1.5 stroke style |
| `src/components/GlyphIcon.tsx` | Maps stored glyph names (and legacy emoji) to icons |
| `src/theme/` | Accent definitions, the accent switcher and its boot script |
| `theme/postime.css` | PostiMe tokens and component overrides |
| `scripts/gen-accents.mjs` | Generates `theme/accents.css` from `accents.json` |
| `design/PostiMe.html` | The original PostiMe design reference |
| `docs/ROADMAP.md` | Features still to build |

## Licence

GPL-3.0-or-later. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Distributing a build means distributing its source under the same licence.
