// The single source of truth for "what layers exist and how are they
// grouped" — replacing four incompatible ad hoc systems that grew up
// independently (project markers, the GeoResGlobe WMS catalog, Target
// Analysis's computed sub-layers, and the never-rendered per-project
// targets row). Pure data + pure helper functions only: no React, no
// MapLibre calls, mirroring the existing split between
// project-store.js/terrain-flow.js (pure logic) and the components that
// apply their output to the map.
//
// Every descriptor also carries `engine`/`toggle`/`supportsOpacity`/
// `errorCapable`/`vectorQuery` fields describing what COULD be done with a
// layer — but today only `id`/`label`/`parent`/`defaultOn`/`defaultOpacity`
// (plus `theme`/`wms` for WMS rows, and `manage` for project rows) are
// actually read by any consumer; the rest is declared, honest metadata for
// a future MapLibre-apply dispatcher (deliberately not built yet — see
// MineralXWorkspace.jsx's ErrorBadge comment) rather than something
// currently enforced. Don't assume setting `supportsOpacity: false` on a
// new descriptor gates a slider anywhere — it doesn't yet; the panel
// decides that itself, independently, in MineralXWorkspace.jsx.
//
// A layer descriptor's `id` is the stable, load-bearing key: it is what a
// future localStorage persistence layer keys expand/toggle/opacity state
// on (CLAUDE.md hard rule 5), so ids here intentionally reuse every id the
// app already uses today (`pub`, `flow`, `flow:hydraulics`, `drainage`,
// `heatmap`, `targets`, `correlated`, `historicMines`, `occ:${commodity}`,
// `chips:${pid}`, `holes:${pid}`, `bnd:${pid}`, `targets:${pid}`, and every
// WMS layer id already in layer-data.js) rather than inventing new ones —
// so turning persistence on later doesn't reset anyone's state.
//
// `group` is the layer's VISUAL placement in the tree ('pub' | 'flow' |
// 'project'). `engine` is how it actually reaches MapLibre (`wms` raster
// tiles, `vector-query` GEORES occurrence/historic-mine points,
// `computed-raster`/`computed-points` from Target Analysis's own terrain
// model, `project-marker`/`project-boundary` for a project's own data).
// These are deliberately independent: Mineral Occurrences and Historic
// Mines are visually grouped under GeoResGlobe (group: 'pub') because
// that's where a user expects published reference data to live, even
// though they're fetched/cached/owned by the Target Analysis engine
// (engine: 'vector-query') — a fact that previously only lived in a code
// comment. This split is what makes that honest without moving the rows
// in the tree (which e2e/layers-panel.spec.js locks in).
import { PUBLIC_DATA_CATALOG, THEME_ORDER } from './layer-data.js';

// ── Static descriptors ───────────────────────────────────────────────────
// Everything whose existence doesn't depend on runtime store/viewport
// state: the two top-level group headers, the Hydraulics subgroup, the
// GeoResGlobe WMS catalog (wrapped from layer-data.js — not duplicated;
// scripts/verify-endpoints.mjs still imports PUBLIC_DATA_CATALOG directly
// as the source of truth for URLs/indices), and the fixed Target Analysis
// rows (drainage/heatmap/targets/correlated/historicMines).

const GROUP_HEADERS = [
  { id: 'pub', label: 'GeoResGlobe', group: 'pub', parent: null, engine: null, toggle: 'group', defaultOn: true, supportsOpacity: false, defaultOpacity: null, errorCapable: false },
  { id: 'flow', label: 'Target Analysis', group: 'flow', parent: null, engine: null, toggle: 'group', defaultOn: true, supportsOpacity: false, defaultOpacity: null, errorCapable: false },
  { id: 'flow:hydraulics', label: 'Hydraulics / Metal Concentration', group: 'flow', parent: 'flow', engine: null, toggle: 'group', defaultOn: true, supportsOpacity: false, defaultOpacity: null, errorCapable: false },
];

const WMS_LAYERS = PUBLIC_DATA_CATALOG.flatMap(catalogGroup => catalogGroup.layers.map(layer => ({
  id: layer.id,
  label: layer.name,
  group: 'pub',
  parent: 'pub',
  theme: layer.theme,
  engine: 'wms',
  toggle: 'boolean',
  defaultOn: false,
  supportsOpacity: true,
  defaultOpacity: 0.7,
  errorCapable: true,
  wms: { url: layer.url, wmsLayers: layer.wmsLayers, attribution: layer.attribution },
})));

const FLOW_FIXED_LAYERS = [
  { id: 'drainage', label: 'Drainage channels', group: 'flow', parent: 'flow:hydraulics', engine: 'computed-raster', toggle: 'boolean', defaultOn: false, supportsOpacity: true, defaultOpacity: 0.65, errorCapable: false },
  { id: 'heatmap', label: 'Water concentration heatmap', group: 'flow', parent: 'flow:hydraulics', engine: 'computed-raster', toggle: 'boolean', defaultOn: false, supportsOpacity: true, defaultOpacity: 0.5, errorCapable: false },
  { id: 'targets', label: 'Metal Concentration Zones', group: 'flow', parent: 'flow', engine: 'computed-points', toggle: 'boolean', defaultOn: false, supportsOpacity: false, defaultOpacity: null, errorCapable: false },
  { id: 'correlated', label: 'Correlated Targets', group: 'flow', parent: 'flow', engine: 'computed-points', toggle: 'boolean', defaultOn: false, supportsOpacity: false, defaultOpacity: null, errorCapable: false },
  { id: 'historicMines', label: 'Historic mine sites', group: 'pub', parent: 'pub', engine: 'vector-query', toggle: 'boolean', defaultOn: false, supportsOpacity: false, defaultOpacity: null, errorCapable: true, vectorQuery: { sourceKey: 'historicMines' } },
];

// Every layer whose existence does NOT depend on runtime store/viewport
// state, keyed by id. Order matches current render order (theme order for
// WMS, then fixed flow rows) so a future renderer can iterate this
// directly instead of re-deriving order at render time.
export const STATIC_LAYERS = [...GROUP_HEADERS, ...WMS_LAYERS, ...FLOW_FIXED_LAYERS];

export const STATIC_LAYERS_BY_ID = new Map(STATIC_LAYERS.map(l => [l.id, l]));

// WMS layers grouped by theme, in THEME_ORDER — the panel's own iteration
// order, computed once here instead of flatten+filtering the whole catalog
// per theme on every render.
export const WMS_LAYERS_BY_THEME = new Map(
  THEME_ORDER.map(theme => [theme, WMS_LAYERS.filter(l => l.theme === theme)]),
);

// ── Dynamic descriptor factories ─────────────────────────────────────────
// A project's rows (and how many there are) depend on runtime store state;
// an occurrence commodity row only exists once Target Analysis has fetched
// and found that commodity in view. These genuinely can't be static data —
// the factories make that explicit instead of forcing fake staticness.

// One project's tree rows: the group header plus its four children.
// `targets:${pid}` is included here — previously checked by the visibility
// effect (MineralXWorkspace.jsx:648) but never rendered by ProjectTree, a
// dead/half-wired row this registry fixes by finally describing it.
export function projectLayerDescriptors(project) {
  const pid = project.id;
  return [
    { id: `proj:${pid}`, label: project.name, group: 'project', parent: null, engine: null, toggle: 'group', defaultOn: true, supportsOpacity: false, defaultOpacity: null, errorCapable: false },
    { id: `chips:${pid}`, label: 'Rock chips', group: 'project', parent: `proj:${pid}`, engine: 'project-marker', toggle: 'boolean', defaultOn: true, supportsOpacity: false, defaultOpacity: null, errorCapable: false, manage: 'chips' },
    { id: `holes:${pid}`, label: 'Drill holes', group: 'project', parent: `proj:${pid}`, engine: 'project-marker', toggle: 'boolean', defaultOn: true, supportsOpacity: false, defaultOpacity: null, errorCapable: false, manage: 'holes' },
    { id: `bnd:${pid}`, label: project.boundary ? project.boundary.name : 'Boundary', group: 'project', parent: `proj:${pid}`, engine: 'project-boundary', toggle: 'boolean', defaultOn: true, supportsOpacity: false, defaultOpacity: null, errorCapable: false, manage: 'boundary' },
    { id: `targets:${pid}`, label: 'Targets', group: 'project', parent: `proj:${pid}`, engine: 'project-marker', toggle: 'boolean', defaultOn: true, supportsOpacity: false, defaultOpacity: null, errorCapable: false, manage: null },
  ];
}

// One row per commodity actually present in the last Target Analysis run —
// genuinely can't exist before that fetch happens.
export function occurrenceLayerDescriptors(commodities) {
  return commodities.map(commodity => ({
    id: `occ:${commodity}`, label: commodity, group: 'pub', parent: 'pub', engine: 'vector-query', toggle: 'boolean',
    defaultOn: false, supportsOpacity: false, defaultOpacity: null, errorCapable: false,
    vectorQuery: { sourceKey: 'occurrences', commodity },
  }));
}

// ── Combined index + toggle-state helpers ────────────────────────────────
// Builds one id -> descriptor map covering static layers plus whatever
// dynamic rows currently exist (every project's rows, every commodity
// currently in view) — the single place a caller resolves "what do I know
// about layer X right now."
export function buildLayerIndex(store, commodities = []) {
  const index = new Map(STATIC_LAYERS_BY_ID);
  (store?.projects || []).forEach(p => {
    projectLayerDescriptors(p).forEach(d => index.set(d.id, d));
    (p.spatialLayers || []).filter(l=>!l.archivedAt).forEach(l=>index.set(`spatial:${p.id}:${l.recordId}`,{id:`spatial:${p.id}:${l.recordId}`,label:l.name,parent:`proj:${p.id}`,group:'project',engine:'project-vector',defaultOn:true,supportsOpacity:true,defaultOpacity:1}));
  });
  occurrenceLayerDescriptors(commodities).forEach(d => index.set(d.id, d));
  return index;
}

// Normal polarity everywhere: `layerOn[id]` explicit true/false wins;
// missing falls back to the descriptor's own `defaultOn`. Unknown id (not
// in the index at all) fails open to visible rather than surprising a
// caller with a silently-hidden row. This replaces three different
// pre-existing conventions at once: `hidden` (inverted — absence meant
// visible), `publicOn` (absence meant off), and `flowSubOn` (absence meant
// off) — callers no longer need to know which polarity applies to which id.
export function isLayerOn(layerOn, layerIndex, id) {
  if (Object.prototype.hasOwnProperty.call(layerOn, id)) return Boolean(layerOn[id]);
  const descriptor = layerIndex.get(id);
  return descriptor ? descriptor.defaultOn : true;
}

// Whether a layer is actually visible right now, accounting for every
// ancestor being on too — replaces the one hand-coded two-level special
// case for project hide (`!projectHidden && !hidden[nodeId]`,
// MineralXWorkspace.jsx:651) with a general walk that also covers
// `flow:hydraulics` -> `drainage`/`heatmap` for free, should a group-level
// hide toggle ever be added there.
export function effectiveOn(layerOn, layerIndex, id) {
  let current = id;
  while (current) {
    if (!isLayerOn(layerOn, layerIndex, current)) return false;
    current = layerIndex.get(current)?.parent ?? null;
  }
  return true;
}

// Same fallback rule as isLayerOn, for slider position: explicit value
// wins, else the descriptor's defaultOpacity, else a neutral 0.7 for any
// opacity-capable layer the index doesn't recognise.
export function layerOpacityOf(layerOpacity, layerIndex, id) {
  if (Object.prototype.hasOwnProperty.call(layerOpacity, id)) return layerOpacity[id];
  return layerIndex.get(id)?.defaultOpacity ?? 0.7;
}
