/**
 * Moodboard Category Types
 *
 * Defines the structure for organizing moodboard images
 * into production-relevant categories.
 */

export type MoodboardCategoryId =
    | 'color_palette'
    | 'lighting'
    | 'composition'
    | 'environment'
    | 'set_design'
    | 'architecture'
    | 'character_design'
    | 'costume'
    | 'hair_makeup'
    | 'sound_design'
    | 'music'
    | 'vfx'
    | 'editing'
    | 'world_building'
    | 'uncategorized'
    | 'custom';

export interface MoodboardCategory {
    id: MoodboardCategoryId | string;
    label: string;
    icon: string;
    description: string;
    color?: string;
    isCustom?: boolean;
}

export type MoodboardConnector = {
    id: string;
    from: string;
    to: string;
    categoryId: string;
    label?: string;
    style?: 'arrow' | 'line';
};

export interface MoodboardItem {
    id: string;
    kind?: 'image' | 'text' | 'note';
    /** Sticky-note tint or text colour. */
    color?: string;
    fontSize?: number;
    locked?: boolean;
    url?: string;
    text?: string;
    label?: string;
    categoryId: string;
    notes?: string;
    createdAt?: string;
    thumbnailUrl?: string;
    sourceUrl?: string;
    sourceLabel?: string;
    sourceType?: 'upload' | 'search' | 'web' | 'video_frame' | 'library';
    query?: string;
    layout?: {
        x: number;
        y: number;
        width: number;
        height: number;
        zIndex?: number;
    };
}

export interface CategorizedMoodboard {
    categories: MoodboardCategory[];
    items: MoodboardItem[];
    connectors?: MoodboardConnector[];
}

export const DEFAULT_MOODBOARD_CATEGORIES: MoodboardCategory[] = [
    {
        id: 'color_palette',
        label: 'Color Palette',
        icon: 'palette',
        description: 'Color schemes, mood tones, and contrast references',
        color: '#9a9aa3',
    },
    {
        id: 'lighting',
        label: 'Lighting',
        icon: 'bulb',
        description: 'Lighting setups, time of day, and atmosphere',
        color: '#9a9aa3',
    },
    {
        id: 'composition',
        label: 'Composition',
        icon: 'layout',
        description: 'Framing, camera angles, and visual hierarchy',
        color: '#9a9aa3',
    },
    {
        id: 'environment',
        label: 'Environment',
        icon: 'globe',
        description: 'Landscapes, locations, and backgrounds',
        color: '#9a9aa3',
    },
    {
        id: 'set_design',
        label: 'Set Design',
        icon: 'library',
        description: 'Interior/exterior design, props, and decoration',
        color: '#9a9aa3',
    },
    {
        id: 'architecture',
        label: 'Architecture',
        icon: 'building',
        description: 'Buildings, structures, and spatial design',
        color: '#9a9aa3',
    },
    {
        id: 'character_design',
        label: 'Character Design',
        icon: 'user',
        description: 'Character appearance, body types, and features',
        color: '#9a9aa3',
    },
    {
        id: 'costume',
        label: 'Costume',
        icon: 'wardrobe',
        description: 'Wardrobe, accessories, and styling',
        color: '#9a9aa3',
    },
    {
        id: 'hair_makeup',
        label: 'Hair & Makeup',
        icon: 'brush',
        description: 'Hairstyles, makeup, and grooming',
        color: '#9a9aa3',
    },
    {
        id: 'sound_design',
        label: 'Sound Design',
        icon: 'speaker',
        description: 'Audio mood references and soundscapes',
        color: '#9a9aa3',
    },
    {
        id: 'music',
        label: 'Music',
        icon: 'music',
        description: 'Soundtrack mood, genre, and tempo references',
        color: '#9a9aa3',
    },
    {
        id: 'vfx',
        label: 'VFX',
        icon: 'sparkles',
        description: 'Visual effects style and CGI references',
        color: '#9a9aa3',
    },
    {
        id: 'editing',
        label: 'Editing',
        icon: 'scissors',
        description: 'Cutting pace and transition styles',
        color: '#9a9aa3',
    },
    {
        id: 'world_building',
        label: 'World Building',
        icon: 'landscape',
        description: 'Overall world design and lore references',
        color: '#9a9aa3',
    },
    {
        id: 'uncategorized',
        label: 'Uncategorized',
        icon: 'folder',
        description: 'Unsorted references',
        color: '#9a9aa3',
    },
];

export const createDefaultCategorizedMoodboard = (): CategorizedMoodboard => ({
    categories: [...DEFAULT_MOODBOARD_CATEGORIES],
    items: [],
});

export const getCategoryById = (
    categories: MoodboardCategory[],
    id: string
): MoodboardCategory | undefined => {
    return categories.find((cat) => cat.id === id);
};

export const getItemsByCategory = (
    items: MoodboardItem[],
    categoryId: string
): MoodboardItem[] => {
    return items.filter((item) => item.categoryId === categoryId);
};

export const getCategoryItemCount = (
    items: MoodboardItem[],
    categoryId: string
): number => {
    return items.filter((item) => item.categoryId === categoryId).length;
};
