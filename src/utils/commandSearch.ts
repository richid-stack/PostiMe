/**
 * Search for the command palette.
 *
 * Every word the person types has to match somewhere in the command's title, hint or group. Matches at the start of
 * the title rank highest, then the start of a word, then anywhere in the text, then letters in order ("edv" finds
 * "Edit Video"). Commands that do not match every word are left out.
 */

export interface SearchableCommand {
  id: string;
  title: string;
  hint?: string;
  group?: string;
  /** Extra words that should find this command (synonyms). */
  keywords?: string[];
}

const normalise = (text: string) => text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

const isSubsequence = (needle: string, haystack: string): boolean => {
  let at = 0;
  for (let i = 0; i < haystack.length && at < needle.length; i += 1) {
    if (haystack[i] === needle[at]) at += 1;
  }
  return at === needle.length;
};

/** Score of one word against one piece of text, 0 for no match. */
const scoreWord = (word: string, text: string): number => {
  if (!text) return 0;
  if (text.startsWith(word)) return 100;
  if (text.split(/[\s\-_/:.,]+/).some((part) => part.startsWith(word))) return 80;
  if (text.includes(word)) return 55;
  if (word.length >= 3 && isSubsequence(word, text)) return 25;
  return 0;
};

export const scoreCommand = (query: string, command: SearchableCommand): number => {
  const words = normalise(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;
  const title = normalise(command.title);
  const rest = [command.hint, command.group, ...(command.keywords ?? [])].filter(Boolean).map((text) => normalise(String(text)));
  let total = 0;
  for (const word of words) {
    const inTitle = scoreWord(word, title);
    const inRest = Math.max(0, ...rest.map((text) => scoreWord(word, text))) * 0.6;
    const best = Math.max(inTitle * 1.5, inRest);
    if (best === 0) return 0;
    total += best;
  }
  return total / words.length;
};

/** Matching commands, best first. Ties keep the order they were given in. An empty query keeps every command. */
export const rankCommands = <T extends SearchableCommand>(query: string, commands: T[]): T[] => {
  if (!normalise(query).trim()) return commands;
  return commands
    .map((command, index) => ({ command, index, score: scoreCommand(query, command) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.command);
};
