/** Temporary UI access only. No server authentication or authorisation uses this flag. */
export const DEVELOPMENT_ACCESS_ENABLED = true;
export const DEVELOPMENT_MODE_COOKIE = 'mx-ops-workspace-mode';
export const DEVELOPMENT_ACTOR = 'de000000-0000-4000-8000-000000000001';
export const DEVELOPMENT_ORG = 'de000000-0000-4000-8000-000000000002';
export const DEVELOPMENT_FACILITY = 'de000000-0000-4000-8000-000000000003';
export const DEVELOPMENT_PROJECT = 'de000000-0000-4000-8000-000000000004';
export function developmentPage(path: string, preference?: string, enabled = DEVELOPMENT_ACCESS_ENABLED) {
  return enabled && preference !== 'staff' && (path === '/ops' || path.startsWith('/ops/')) &&
    !/^\/ops\/(login|account|auth)(\/|$)/.test(path) && path !== '/ops/sw.js';
}
export function developmentSession(): boolean {
  return typeof document !== 'undefined' && document.querySelector('[data-mineralx-ops-mode]')?.getAttribute('data-mineralx-ops-mode') === 'development';
}
