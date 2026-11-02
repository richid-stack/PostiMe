# DESIGN.md: the PostiMe design language

Source of truth: `design/PostiMe.html` (reference), `theme/postime.css` (tokens and overrides), `src/theme/accents.json` (accent colours).

## Principles

1. **Calm, then confident.** A neutral graphite workspace where media is the loudest thing on screen.
2. **One accent.** Exactly one accent colour per theme. It marks selection, progress and the hero surface. It is never decoration. No second hue for "variety".
3. **Clay is the signature.** The default accent is real clay: a brick red-brown (`#a8442f`, hue about 11 degrees), not orange. It is painted with a stippled grain wherever a surface is the hero (active tab, current phase, "next step" card).
4. **Hairlines, not boxes in boxes.** Separate with 1px lines and space before adding another fill.
5. **The primary action is an inverse pill** (light on dark, black on light). Accent fills mean "selected", not "click me".

## Colour

| Token | Dark | Light |
| --- | --- | --- |
| `--pm-bg` | `#131314` | `#ffffff` |
| `--pm-surface` | `#18181a` | `#f7f7f9` |
| `--pm-raised` | `#1f1f23` | `#f3f3f6` |
| `--pm-line` / `--pm-line-strong` | `#34343b` / `#4a4a52` | `#dcdce4` / `#bfbfca` |
| `--pm-tx` / `--pm-mu` | `#e6e6ea` / `#9a9aa3` | `#1b1b1f` / `#6b6b72` |
| `--pm-danger` | `#e2483d` | same |

- The dark theme is neutral graphite. **Never purple, never a blue cast.**
- Status is carried by icon and label, not by a second colour. Danger red is the only other hue in the chrome.
- Content colours stay as they are because they are the user's material: chroma-key green, annotation pens, sticky notes, 3D object colours, the colour wheel, world palettes.

### Accents

`clay` (default), `rose`, `gold`, `moss`, `teal`, `steel`, `plum`, `graphite`. Each defines `a` (body), `b` (grain shadow), `c` (grain highlight) and light and dark text variants. `scripts/gen-accents.mjs` builds `theme/accents.css`, which exposes `--ac-a/b/c/strong/text/rgb` and a 50 to 950 scale. Tailwind's hue names (`indigo`, `blue`, `sky`, `orange` and so on) all resolve to that scale, so no component can introduce a second hue by accident.

The choice is stored in `localStorage` (`ui_accent_v1`) and applied as `<html data-accent="...">` before first paint.

To add an accent: add an entry to `accents.json`, run `node scripts/gen-accents.mjs`, check contrast of white text on `a` and of `text-d`/`text-l` on the surfaces.

## Type

DM Sans for UI, IBM Plex Mono for timecode and code. Sentence case. Weight 500 for titles.

| Token | Size | Use |
| --- | --- | --- |
| `--fs-2xs` | 12px | captions, key hints, badges. **The floor: nothing is smaller.** |
| `--fs-xs` | 13px | meta, helper copy |
| `--fs-sm` | 14px | dense UI, list rows, inspector |
| `--fs-md` | 16px | body, panel titles |
| `--fs-lg` | 17px | buttons, controls |
| `--fs-xl` | 22px | section titles |
| `--fs-2xl` | 29px | screen titles |

## Shape and motion

- Radii: 12 / 16 / 22 / 28 and pill.
- Motion answers an action. 280ms, `cubic-bezier(0.2, 0.8, 0.2, 1)`. `prefers-reduced-motion` turns it off.
- Shadows are soft and rare. Elevation comes from surface tone first.

## Icons

- The editor's existing icon set in `src/components/icons.tsx` is **kept as it is** (24px grid, 1.5 stroke, round caps and joins).
- **No emoji anywhere in the UI.** Where upstream used one, there is an icon drawn in the same style, appended to the end of `icons.tsx`.
- New icons: 24px grid, `fill="none"`, `stroke="currentColor"`, stroke width 1.5, round joins, no fills, no gradients, one idea per icon.
- Stored data holds glyph names, not emoji. `GlyphIcon` renders them and still understands legacy emoji from old projects.

## Things that read as "AI-made" and are not allowed

Gradient text, gradient buttons, glow halos, purple-to-blue washes, emoji as bullets or headers, sparkle badges used as decoration, rainbow category dots, identical rounded cards stacked with no hierarchy.

## Checklist for a new screen

- One accent only; no new hue.
- Nothing under 12px.
- Works in dark and light, and with graphite, clay and rose accents.
- Empty, loading and error states are designed.
- Keyboard focus is visible; icon-only controls have an accessible name.
- Uses existing icons first.
