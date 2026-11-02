/**
 * Scene Map Types and Utilities
 *
 * Provides helper functions and defaults for the 2D top-down scene map view.
 */

import type { SceneMapState, SceneMapScene, SceneMapElement, SceneMapElementType, SceneMapViewport } from '../types';

// ============================================
// Default Values
// ============================================

export const DEFAULT_SCENE_MAP_VIEWPORT: SceneMapViewport = {
    x: 0,
    y: 0,
    zoom: 1,
};

export const DEFAULT_SCENE_MAP_STATE: SceneMapState = {
    scenes: [],
    activeSceneId: undefined,
    viewport: { ...DEFAULT_SCENE_MAP_VIEWPORT },
};

export const DEFAULT_GRID_SIZE = 50; // pixels per grid cell

// ============================================
// Element Templates
// ============================================

export interface ElementTemplate {
    type: SceneMapElementType;
    label: string;
    icon: string;
    defaultSize: { width: number; height: number };
    defaultColor: string;
}

export const ELEMENT_TEMPLATES: ElementTemplate[] = [
    {
        type: 'character',
        label: 'Character',
        icon: 'user',
        defaultSize: { width: 40, height: 40 },
        defaultColor: '#e6e6ea',
    },
    {
        type: 'prop',
        label: 'Prop',
        icon: 'box',
        defaultSize: { width: 30, height: 30 },
        defaultColor: '#b9b9c1',
    },
    {
        type: 'camera',
        label: 'Camera',
        icon: 'video',
        defaultSize: { width: 50, height: 30 },
        defaultColor: '#9a9aa3',
    },
    {
        type: 'light',
        label: 'Light',
        icon: 'bulb',
        defaultSize: { width: 35, height: 35 },
        defaultColor: '#cfcfd6',
    },
    {
        type: 'environment',
        label: 'Environment',
        icon: 'globe',
        defaultSize: { width: 100, height: 100 },
        defaultColor: '#75757e',
    },
    {
        type: 'area',
        label: 'Area',
        icon: 'square',
        defaultSize: { width: 80, height: 80 },
        defaultColor: '#dcdce2',
    },
];

// ============================================
// Factory Functions
// ============================================

let elementIdCounter = 0;
let sceneIdCounter = 0;

export const generateElementId = (): string => {
    return `elem-${Date.now()}-${++elementIdCounter}`;
};

export const generateSceneId = (): string => {
    return `scene-${Date.now()}-${++sceneIdCounter}`;
};

export const createSceneMapElement = (
    type: SceneMapElementType,
    position: { x: number; y: number } = { x: 0, y: 0 },
    overrides?: Partial<SceneMapElement>
): SceneMapElement => {
    const template = ELEMENT_TEMPLATES.find((t) => t.type === type);
    return {
        id: generateElementId(),
        type,
        label: overrides?.label || template?.label || type,
        position,
        size: overrides?.size || template?.defaultSize || { width: 40, height: 40 },
        rotation: 0,
        color: overrides?.color || template?.defaultColor || '#b9b9c1',
        linkedShotNumbers: [],
        ...overrides,
    };
};

export const createDefaultScene = (name: string = 'New Scene'): SceneMapScene => {
    return {
        id: generateSceneId(),
        name,
        description: '',
        elements: [],
        gridSize: DEFAULT_GRID_SIZE,
        backgroundUrl: undefined,
        linkedEnvironmentId: undefined,
    };
};

export const createDefaultSceneMapState = (): SceneMapState => {
    const defaultScene = createDefaultScene('Scene 1');
    return {
        scenes: [defaultScene],
        activeSceneId: defaultScene.id,
        viewport: { ...DEFAULT_SCENE_MAP_VIEWPORT },
    };
};

// ============================================
// Utility Functions
// ============================================

export const getActiveScene = (state: SceneMapState): SceneMapScene | undefined => {
    return state.scenes.find((s) => s.id === state.activeSceneId);
};

export const getSceneById = (state: SceneMapState, id: string): SceneMapScene | undefined => {
    return state.scenes.find((s) => s.id === id);
};

export const getElementById = (scene: SceneMapScene, id: string): SceneMapElement | undefined => {
    return scene.elements.find((e) => e.id === id);
};

export const getElementsByType = (scene: SceneMapScene, type: SceneMapElementType): SceneMapElement[] => {
    return scene.elements.filter((e) => e.type === type);
};

export const getLinkedElements = (scene: SceneMapScene, shotNumber: number): SceneMapElement[] => {
    return scene.elements.filter((e) => e.linkedShotNumbers?.includes(shotNumber));
};

export const snapToGrid = (value: number, gridSize: number): number => {
    return Math.round(value / gridSize) * gridSize;
};

export const getTemplateByType = (type: SceneMapElementType): ElementTemplate | undefined => {
    return ELEMENT_TEMPLATES.find((t) => t.type === type);
};
