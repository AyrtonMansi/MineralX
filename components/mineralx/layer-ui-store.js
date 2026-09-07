// Existing layer IDs and storage key remain stable across the panel redesign.
export const LAYER_UI_STORE_KEY = 'mx-layers-v1';
const EMPTY_STATE = { layerOn: {}, layerOpacity: {}, layerExpanded: {} };
const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
function safeState(value) {
  const filter = (object, valid) => Object.fromEntries(Object.entries(record(object)).filter(([key, entry]) => !['__proto__', 'constructor', 'prototype'].includes(key) && valid(entry)));
  return {
    layerOn: filter(value?.layerOn, entry => typeof entry === 'boolean'),
    layerOpacity: filter(value?.layerOpacity, entry => Number.isFinite(entry) && entry >= 0 && entry <= 1),
    layerExpanded: filter(value?.layerExpanded, entry => typeof entry === 'boolean'),
    ...(value?.basemap === 'satellite' || value?.basemap === 'topo' ? { basemap: value.basemap } : {}),
    ...(typeof value?.activeElement === 'string' && /^[A-Z][a-z]?$/.test(value.activeElement) ? { activeElement: value.activeElement } : {}),
  };
}
export function loadLayerUiState() {
  if (typeof window === 'undefined') return EMPTY_STATE;
  try { const raw = window.localStorage.getItem(LAYER_UI_STORE_KEY); return raw ? safeState(JSON.parse(raw)) : EMPTY_STATE; }
  catch { return EMPTY_STATE; }
}
// Failure is visible in the layers panel; it must not masquerade as a saved preference.
export function saveLayerUiState(state) {
  if (typeof window === 'undefined') return false;
  try { window.localStorage.setItem(LAYER_UI_STORE_KEY, JSON.stringify(safeState(state))); return true; }
  catch { return false; }
}
