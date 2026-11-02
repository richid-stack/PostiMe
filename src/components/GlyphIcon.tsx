import React from 'react';
import {
  AlertTriangleIcon, BoltIcon, BoxIcon, BrushIcon, BuildingIcon, CameraIcon, CheckCircleIcon, CircleIcon, ClapperboardIcon, CoinIcon,
  ExportIcon, FolderIcon, GlobeIcon, GridIcon, HandIcon, ImageIcon, LandscapeIcon, LibraryIcon, LightBulbIcon, LockIcon, MapIcon,
  MegaphoneIcon, MessageIcon, MusicNoteIcon, PaletteIcon, PhoneIcon, PinIcon, ScissorsIcon, SearchIcon, SettingsIcon, ShoppingBagIcon,
  SparklesIcon, SpeakerIcon, SquareIcon, StarIcon, SunIcon, TargetIcon, TransformIcon, UnlockIcon, UserCircleIcon, VideoIcon,
} from './icons';

type Glyph = React.FC<{ className?: string }>;

/**
 * Icons that can be chosen by name (moodboard categories, scene elements, extra assets, badges).
 * Data stores the name, never an emoji. Names that used to be emoji are mapped in LEGACY_EMOJI so saved projects still render.
 */
export const GLYPHS: Record<string, Glyph> = {
  clapperboard: ClapperboardIcon,
  image: ImageIcon,
  video: VideoIcon,
  camera: CameraIcon,
  board: GridIcon,
  folder: FolderIcon,
  palette: PaletteIcon,
  brush: BrushIcon,
  bulb: LightBulbIcon,
  layout: TransformIcon,
  globe: GlobeIcon,
  landscape: LandscapeIcon,
  library: LibraryIcon,
  building: BuildingIcon,
  user: UserCircleIcon,
  wardrobe: ShoppingBagIcon,
  speaker: SpeakerIcon,
  music: MusicNoteIcon,
  sparkles: SparklesIcon,
  scissors: ScissorsIcon,
  box: BoxIcon,
  square: SquareIcon,
  phone: PhoneIcon,
  megaphone: MegaphoneIcon,
  pin: PinIcon,
  star: StarIcon,
  bolt: BoltIcon,
  coin: CoinIcon,
  target: TargetIcon,
  map: MapIcon,
  sun: SunIcon,
  hand: HandIcon,
  lock: LockIcon,
  unlock: UnlockIcon,
  search: SearchIcon,
  chat: MessageIcon,
  export: ExportIcon,
  settings: SettingsIcon,
  alert: AlertTriangleIcon,
  check: CheckCircleIcon,
  circle: CircleIcon,
};

export const GLYPH_NAMES = Object.keys(GLYPHS);

const LEGACY_EMOJI: Record<string, string> = {
  '🎬': 'clapperboard', '🖼': 'image', '🖼️': 'image', '🎥': 'video', '📷': 'camera', '🗂': 'board', '🗂️': 'board', '📁': 'folder',
  '🎨': 'palette', '💄': 'brush', '💡': 'bulb', '📐': 'layout', '🌍': 'globe', '🌌': 'landscape', '🏛': 'library', '🏛️': 'library',
  '🏗': 'building', '🏗️': 'building', '👤': 'user', '👔': 'wardrobe', '🔊': 'speaker', '🎵': 'music', '✨': 'sparkles', '✂': 'scissors',
  '✂️': 'scissors', '📦': 'box', '⬜': 'square', '📱': 'phone', '📢': 'megaphone', '📌': 'pin', '⭐': 'star', '⚡': 'bolt',
  '💸': 'coin', '💰': 'coin', '🎯': 'target', '🗺': 'map', '🗺️': 'map', '🌅': 'sun', '✋': 'hand', '🔒': 'lock', '🔓': 'unlock',
};

export const resolveGlyph = (value: string | undefined | null): Glyph => {
  if (!value) return FolderIcon;
  return GLYPHS[value] ?? GLYPHS[LEGACY_EMOJI[value]] ?? FolderIcon;
};

export const GlyphIcon: React.FC<{ name: string | undefined | null; className?: string }> = ({ name, className = 'w-4 h-4' }) => {
  const Component = resolveGlyph(name);
  return <Component className={className} />;
};

export default GlyphIcon;
