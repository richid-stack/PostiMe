export type PromptToken = { text: string; kind: 'same' | 'added' | 'removed' };

const words = (text: string): string[] => text.split(/\s+/).filter(Boolean);

/**
 * Word by word differences between two prompts: words only in `from` are removed, words only in `to` are added.
 * Uses the longest common run of words, so moving a phrase shows as a removal and an addition.
 */
export const diffPrompts = (from: string, to: string): PromptToken[] => {
  const a = words(from);
  const b = words(to);
  // Very long prompts: fall back to a plain before/after so the table stays small.
  if (a.length * b.length > 250_000) {
    return [...a.map((text) => ({ text, kind: 'removed' as const })), ...b.map((text) => ({ text, kind: 'added' as const }))];
  }
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: PromptToken[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ text: a[i], kind: 'same' });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ text: a[i++], kind: 'removed' });
    } else {
      out.push({ text: b[j++], kind: 'added' });
    }
  }
  while (i < a.length) out.push({ text: a[i++], kind: 'removed' });
  while (j < b.length) out.push({ text: b[j++], kind: 'added' });
  return out;
};

export type SettingRow = { label: string; a: string; b: string; changed: boolean };

/** Lines up two sets of settings by name. A setting only one side has shows as a dash on the other. */
export const diffSettings = (a: Array<[string, string]>, b: Array<[string, string]>): SettingRow[] => {
  const mapA = new Map(a);
  const mapB = new Map(b);
  const labels = [...new Set([...a.map(([label]) => label), ...b.map(([label]) => label)])];
  return labels.map((label) => {
    const left = (mapA.get(label) ?? '').trim();
    const right = (mapB.get(label) ?? '').trim();
    return { label, a: left || '—', b: right || '—', changed: left !== right };
  });
};

export type Pinnable = { id: string; pinned?: boolean };

export const togglePin = <T extends Pinnable>(entries: T[], id: string): T[] =>
  entries.map((entry) => (entry.id === id ? { ...entry, pinned: !entry.pinned } : entry));

/** Newest first. Pinned entries are always kept; only the unpinned ones are cut to `limit`. */
export const trimHistory = <T extends Pinnable>(entries: T[], limit: number): T[] => {
  let unpinned = 0;
  return entries.filter((entry) => {
    if (entry.pinned) return true;
    unpinned += 1;
    return unpinned <= limit;
  });
};

export const addToHistory = <T extends Pinnable>(entries: T[], entry: T, limit: number): T[] => trimHistory([entry, ...entries.filter((e) => e.id !== entry.id)], limit);

/** Ticking a third entry for comparison drops the one ticked first, so two are always the most recent picks. */
export const pickForCompare = (selected: string[], id: string): string[] => {
  if (selected.includes(id)) return selected.filter((item) => item !== id);
  return [...selected, id].slice(-2);
};
