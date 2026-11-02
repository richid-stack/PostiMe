/**
 * PostiMe Tailwind config.
 *
 * The app used the Tailwind Play CDN at runtime, which fails offline and ships Tailwind's default
 * blue-tinted greys and its indigo/purple. Here the same utility names resolve to PostiMe's palette,
 * so legacy `bg-gray-800`, `text-indigo-300` and friends become graphite and clay without touching
 * every component:
 *   gray / slate / zinc / neutral  -> PostiMe graphite (neutral, no blue or purple cast)
 *   every other hue (indigo, violet, purple, fuchsia, pink, rose, blue, sky, cyan, teal, emerald, green,
 *   lime, yellow, amber, orange) -> the ONE accent. Its scale is driven by CSS variables (theme/accents.css),
 *   so bg-indigo-600/20 follows Settings > Appearance > Accent. Red is kept for destructive states only.
 */
const graphite = {
  50: '#f6f6f7',
  100: '#eeeef0',
  200: '#dcdce2',
  300: '#b9b9c1',
  400: '#9a9aa3',
  500: '#75757e',
  600: '#54545c',
  700: '#34343b',
  800: '#1f1f23',
  900: '#18181a',
  950: '#131314',
};

// accent scale: rgb triples from CSS variables so opacity modifiers (bg-accent-600/20) keep working
const accent = Object.fromEntries(
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((n) => [n, `rgb(var(--ac-${n}) / <alpha-value>)`]),
);

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./studio.html', './embed.html', './src/**/*.{ts,tsx}'],
  // The scanner reads regex literals in source as class names; keep those out of the stylesheet.
  blocklist: ['[-:\u2013\u2014]'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        gray: graphite,
        slate: graphite,
        zinc: graphite,
        neutral: graphite,
        accent,
        indigo: accent,
        violet: accent,
        purple: accent,
        fuchsia: accent,
        pink: accent,
        rose: accent,
        blue: accent,
        sky: accent,
        cyan: accent,
        teal: accent,
        emerald: accent,
        green: accent,
        lime: accent,
        yellow: accent,
        amber: accent,
        orange: accent,
        // PostiMe semantic tokens (switch with the theme through CSS variables)
        pm: {
          bg: 'var(--pm-bg)',
          surface: 'var(--pm-surface)',
          raised: 'var(--pm-raised)',
          line: 'var(--pm-line)',
          tx: 'var(--pm-tx)',
          mu: 'var(--pm-mu)',
          fab: 'var(--pm-fab)',
          fabt: 'var(--pm-fabt)',
          accent: 'var(--ac-a)',
        },
      },
      borderRadius: {
        pm: '16px',
        'pm-lg': '22px',
        'pm-xl': '28px',
      },
    },
  },
  plugins: [],
};
