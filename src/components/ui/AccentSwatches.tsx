import React from 'react';
import { ACCENTS, type AccentId } from '../../theme/accent';
import { CheckIcon } from '../icons';

interface AccentSwatchesProps {
  value: AccentId;
  onChange: (id: AccentId) => void;
  /** show the accent name under each swatch */
  labels?: boolean;
  size?: 'sm' | 'md';
}

/** Round clay-grain swatches. Each paints itself with its own colours, whatever accent is active. */
export const AccentSwatches: React.FC<AccentSwatchesProps> = ({ value, onChange, labels = false, size = 'md' }) => {
  const move = (event: React.KeyboardEvent, index: number) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = ACCENTS[(index + step + ACCENTS.length) % ACCENTS.length];
    onChange(next.id as AccentId);
    (event.currentTarget.parentElement?.querySelectorAll('button')[ACCENTS.indexOf(next)] as HTMLElement | undefined)?.focus();
  };
  return (
    <div className="accent-swatches" role="radiogroup" aria-label="Accent colour">
      {ACCENTS.map((accent, index) => {
        const selected = accent.id === value;
        return (
          <div key={accent.id} className="accent-swatches__item">
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={accent.label}
              title={accent.label}
              tabIndex={selected ? 0 : -1}
              className={`accent-swatch accent-swatch--${size}`}
              style={{ '--ac-a': accent.a, '--ac-b': accent.b, '--ac-c': accent.c } as React.CSSProperties}
              onClick={() => onChange(accent.id as AccentId)}
              onKeyDown={(event) => move(event, index)}
            >
              {selected && <CheckIcon className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-[18px] h-[18px]'} />}
            </button>
            {labels && <span className={selected ? 'is-selected' : undefined}>{accent.label}</span>}
          </div>
        );
      })}
    </div>
  );
};

export default AccentSwatches;
