import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SearchIcon } from './icons';
import { rankCommands, type SearchableCommand } from '../utils/commandSearch';

export interface PaletteCommand extends SearchableCommand {
  icon?: React.FC<{ className?: string }>;
  /** Shown on the right, e.g. a shortcut. */
  shortcut?: string;
  run: () => void;
}

interface CommandPaletteProps {
  commands: PaletteCommand[];
  onClose: () => void;
}

const RECENT_KEY = 'postime.palette.recent';
const RECENT_LIMIT = 5;

const readRecent = (): string[] => {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(value) ? value.filter((id) => typeof id === 'string').slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
};

const rememberRecent = (id: string) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...readRecent().filter((existing) => existing !== id)].slice(0, RECENT_LIMIT)));
  } catch {
    // recents are a nicety
  }
};

/** Ctrl or Cmd + K: type to find a page or action, Enter to run it. */
const CommandPalette: React.FC<CommandPaletteProps> = ({ commands, onClose }) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [recent] = useState(readRecent);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const results = useMemo(() => {
    if (query.trim()) return rankCommands(query, commands);
    // with nothing typed, recent commands come first
    const recentOnes = recent.map((id) => commands.find((command) => command.id === id)).filter((c): c is PaletteCommand => Boolean(c));
    return [...recentOnes, ...commands.filter((command) => !recentOnes.includes(command))];
  }, [query, commands, recent]);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, results]);

  const run = (command: PaletteCommand | undefined) => {
    if (!command) return;
    rememberRecent(command.id);
    onClose();
    // after the palette has closed, so focus and dialogs the command opens are not fought over
    window.setTimeout(command.run, 0);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => Math.min(results.length - 1, i + 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (event.key === 'Enter') { event.preventDefault(); run(results[active]); }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center pt-[14vh] bg-black/60 backdrop-blur-sm"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
      role="dialog"
      aria-label="Command palette"
    >
      <div className="app-modal w-full max-w-xl overflow-hidden" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
          <SearchIcon className="w-5 h-5 app-muted shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pages and actions"
            className="flex-1 bg-transparent text-base"
            style={{ outline: 'none', boxShadow: 'none', border: 'none', padding: 0 }}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={results[active] ? `palette-${results[active].id}` : undefined}
            aria-label="Search commands"
          />
          <kbd className="text-[10px] app-muted border border-white/15 rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        <div ref={listRef} id="command-palette-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 && <p className="px-3 py-6 text-center text-sm app-muted">Nothing matches "{query}".</p>}
          {results.map((command, index) => {
            const Icon = command.icon;
            const selected = index === active;
            return (
              <div
                key={command.id}
                id={`palette-${command.id}`}
                role="option"
                aria-selected={selected}
                onMouseMove={() => { if (!selected) setActive(index); }}
                onClick={() => run(command)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer ${selected ? 'bg-white/10' : ''}`}
              >
                {Icon ? <Icon className="w-4 h-4 app-muted shrink-0" /> : <span className="w-4 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{command.title}</div>
                  {command.hint && <div className="text-xs app-muted truncate">{command.hint}</div>}
                </div>
                {command.group && <span className="text-[10px] uppercase tracking-wide app-muted shrink-0">{command.group}</span>}
                {command.shortcut && <kbd className="text-[10px] app-muted border border-white/15 rounded px-1.5 py-0.5 shrink-0">{command.shortcut}</kbd>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
