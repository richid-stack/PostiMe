import { readProjectMetaFile, writeProjectMetaFile } from './projectService';
import { parseRestorePoints, type RestorePoint } from '../utils/restorePoints';

const FILE = 'restore-points.json';
const LOCAL_PREFIX = 'postime.restorePoints:';

const hasProjectFiles = (projectPath?: string | null): projectPath is string =>
  Boolean(projectPath) && typeof window !== 'undefined' && Boolean((window.electron?.project as { writeProjectFile?: unknown } | undefined)?.writeProjectFile);

/**
 * Restore points live in the project folder so they travel with the project. With no folder (the browser, or a project
 * not saved yet) they stay in this computer's browser storage under the project's name.
 */
export const loadRestorePoints = async (projectPath: string | null | undefined, fallbackKey: string): Promise<RestorePoint[]> => {
  if (hasProjectFiles(projectPath)) {
    try {
      const text = await readProjectMetaFile(projectPath, FILE);
      return text ? parseRestorePoints(text) : [];
    } catch {
      return [];
    }
  }
  try {
    return parseRestorePoints(window.localStorage.getItem(LOCAL_PREFIX + fallbackKey));
  } catch {
    return [];
  }
};

export const saveRestorePoints = async (projectPath: string | null | undefined, fallbackKey: string, points: RestorePoint[]): Promise<boolean> => {
  const text = JSON.stringify({ version: 1, points });
  if (hasProjectFiles(projectPath)) {
    try {
      await writeProjectMetaFile(projectPath, FILE, text);
      return true;
    } catch {
      return false;
    }
  }
  try {
    window.localStorage.setItem(LOCAL_PREFIX + fallbackKey, text);
    return true;
  } catch {
    return false;
  }
};
