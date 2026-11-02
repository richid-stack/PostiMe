// Runs before React renders so the saved accent is in place on the first paint (no flash of clay).
import { applyAccent, readStoredAccent } from './accent';

if (typeof document !== 'undefined') {
  document.documentElement.dataset.accent = readStoredAccent();
}
export { applyAccent };
