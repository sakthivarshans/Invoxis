/**
 * Explicit runtime mode selection.
 *   VITE_APP_MODE=demo     -> existing localStorage/mock services (default; works with no backend)
 *   VITE_APP_MODE=backend  -> FastAPI at VITE_API_BASE_URL. There is NO silent fallback to demo data.
 */
export type AppMode = 'demo' | 'backend';

const rawMode = (import.meta.env.VITE_APP_MODE as string | undefined)?.trim().toLowerCase();
export const APP_MODE: AppMode = rawMode === 'backend' ? 'backend' : 'demo';
export const IS_BACKEND = APP_MODE === 'backend';

export const API_BASE_URL: string = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:8000/api/v1'
).replace(/\/+$/, '');

if (rawMode && rawMode !== 'demo' && rawMode !== 'backend') {
  console.warn(`Unknown VITE_APP_MODE "${rawMode}"; using demo mode.`);
}
