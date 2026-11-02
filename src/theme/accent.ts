import accents from './accents.json';

export interface AccentDef {
  id: string;
  label: string;
  /** body of the grain */
  a: string;
  /** shadow corner */
  b: string;
  /** highlight corner */
  c: string;
}

export const ACCENTS: AccentDef[] = accents as AccentDef[];
export type AccentId = (typeof accents)[number]['id'];

/** Clay is PostiMe's signature and the default. */
export const DEFAULT_ACCENT: AccentId = 'clay';
export const ACCENT_STORAGE_KEY = 'ui_accent_v1';

export const isAccentId = (value: unknown): value is AccentId => ACCENTS.some((accent) => accent.id === value);

export const readStoredAccent = (): AccentId => {
  try {
    const stored = window.localStorage.getItem(ACCENT_STORAGE_KEY);
    return isAccentId(stored) ? stored : DEFAULT_ACCENT;
  } catch {
    return DEFAULT_ACCENT;
  }
};

/** The accent lives on <html data-accent>; theme/accents.css turns it into the --ac-* variables. */
export const applyAccent = (id: AccentId): void => {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.accent = id;
  try {
    window.localStorage.setItem(ACCENT_STORAGE_KEY, id);
  } catch {
    /* storage unavailable: the choice still applies for this session */
  }
};

/** Resolved accent colours for places that cannot use CSS variables (canvas, three.js). */
export const accentColor = (token: 'a' | 'c' | 'text-d' = 'text-d'): string => {
  if (typeof document === 'undefined') return '#e2917c';
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--ac-${token}`).trim();
  return value || '#e2917c';
};
