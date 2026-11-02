import React from 'react';
import { BoltIcon, ClapperboardIcon, CoinIcon, StarIcon } from './icons';

const BADGE_ICONS: Array<[string, React.FC<{ className?: string }>]> = [
  ['Recommended', StarIcon],
  ['Quality', StarIcon],
  ['Cheap', CoinIcon],
  ['Fast', BoltIcon],
  ['Cinematic', ClapperboardIcon],
];

/** A model's one-word strength, with a line icon instead of an emoji. */
export const ModelBadge: React.FC<{ badge: string }> = ({ badge }) => {
  const match = BADGE_ICONS.find(([key]) => badge.includes(key));
  const Glyph = match?.[1];
  return (
    <span className="model-badge">
      {Glyph && <Glyph className="w-3 h-3" />}
      {badge}
    </span>
  );
};

export default ModelBadge;
