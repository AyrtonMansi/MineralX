// Persists the Layers panel's own UI state — which layers are on, their
// opacity, which tree nodes are expanded — across a reload. CLAUDE.md's
// hard rule 5 has long documented this as the app's behavior ("layer-tree
// node ids are persistence keys... live in users' localStorage
// expand/toggle state"), but until this file existed it was never actually
// implemented: `layerOn`/`layerOpacity`/`layerExpanded` (formerly `hidden`/
// `publicOn`/`publicOpacity`/`expanded`/`flowSubOn`/`flowOpacity`) were
// plain `useState({})`, reset to defaults on every reload.
//
// Deliberately a SEPARATE localStorage key from project-store.js's
// `mx-store-v7`, not folded into its migration chain. That chain
// (migrateV2..V6) exists to protect real project data — samples, collars,
// intervals, surveys, geology, targets — where a wrong migration can
// silently corrupt or lose a geologist's field data. Layer-tree UI state
// (what's expanded, what's toggled on, slider positions) is comparatively
// low-stakes and purely presentational: losing it means re-clicking a few
// eyes, not losing data. It also changes shape completely differently —
// it grows by "one more boolean/opacity key" as new layer types are added,
// never by "restructure a nested array of geology records" — so forcing
// every new layer type through project-store's version-bump-plus-migration
// ceremony would be pure churn for a key that's supposed to mean something
// else. A flat, ungated merge is correct here: an unknown/stale id is
// simply ignored (harmless), a missing id falls back to the layer
// registry's own `defaultOn`/`defaultOpacity`/collapsed-by-default via
// isLayerOn/effectiveOn/layerOpacityOf — nothing can "break" the way a
// malformed `project.samples` array would. If a future change ever needs
// real UI-state migrations, this key can grow its own v2, independently of
// and without blocking mx-store-v7's chain.
export const LAYER_UI_STORE_KEY = 'mx-layers-v1';

const EMPTY_STATE = { layerOn: {}, layerOpacity: {}, layerExpanded: {} };

// Returns the saved state, or the empty defaults if nothing was saved yet
// or the saved value is corrupt — callers then read every actual layer's
// visibility/opacity/expand-state through the registry's own fallback
// helpers, so an empty object here just means "everything at its
// registry default," not "broken."
export function loadLayerUiState() {
  if (typeof window === 'undefined') return EMPTY_STATE;
  try {
    const raw = window.localStorage.getItem(LAYER_UI_STORE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw);
    return {
      layerOn: parsed?.layerOn && typeof parsed.layerOn === 'object' ? parsed.layerOn : {},
      layerOpacity: parsed?.layerOpacity && typeof parsed.layerOpacity === 'object' ? parsed.layerOpacity : {},
      layerExpanded: parsed?.layerExpanded && typeof parsed.layerExpanded === 'object' ? parsed.layerExpanded : {},
    };
  } catch {
    return EMPTY_STATE;
  }
}

// Best-effort write. Unlike saveStore() (project-store.js), this has no
// boolean return / save-failed banner: losing this key to a quota error or
// disabled storage is not data loss worth surfacing to the user the way a
// failed project-data save is — the layer tree just falls back to
// registry defaults next load, same as a first-ever visit.
export function saveLayerUiState({ layerOn, layerOpacity, layerExpanded }) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LAYER_UI_STORE_KEY, JSON.stringify({ layerOn, layerOpacity, layerExpanded }));
  } catch { /* not worth surfacing — see comment above */ }
}
