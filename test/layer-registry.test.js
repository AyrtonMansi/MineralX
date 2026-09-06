// Unit tests for the unified layer registry — components/mineralx/layer-registry.js.
// This registry replaces four incompatible ad hoc toggle-state systems
// (project `hidden`, WMS `publicOn`, Target Analysis `flowSubOn`, and a
// never-rendered `targets:${pid}` row) with one schema and one set of
// polarity-safe helpers. These tests lock in every id the rest of the app
// already depends on (so a future persistence layer keyed on these ids
// doesn't shift under it) and the parent-chain/opacity fallback behavior.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEME_ORDER } from '../components/mineralx/layer-data.js';
import {
  STATIC_LAYERS,
  STATIC_LAYERS_BY_ID,
  WMS_LAYERS_BY_THEME,
  projectLayerDescriptors,
  occurrenceLayerDescriptors,
  buildLayerIndex,
  isLayerOn,
  effectiveOn,
  layerOpacityOf,
} from '../components/mineralx/layer-registry.js';

test('STATIC_LAYERS: every id the app already relies on is present exactly once', () => {
  const expectedIds = [
    'pub', 'flow', 'flow:hydraulics',
    'drainage', 'heatmap', 'targets', 'correlated', 'historicMines',
    'qld-geology-detailed', 'qld-structural', 'qld-geophysics-mag', 'qld-geophysics-radio',
    'qld-geochem', 'qld-groundwater', 'qld-mines-permits', 'qld-boreholes',
  ];
  const ids = STATIC_LAYERS.map(l => l.id);
  expectedIds.forEach(id => {
    assert.equal(ids.filter(x => x === id).length, 1, `expected exactly one entry for id "${id}"`);
  });
  assert.equal(ids.length, expectedIds.length); // no unexpected extras
});

test('STATIC_LAYERS_BY_ID: matches STATIC_LAYERS 1:1', () => {
  assert.equal(STATIC_LAYERS_BY_ID.size, STATIC_LAYERS.length);
  STATIC_LAYERS.forEach(l => assert.equal(STATIC_LAYERS_BY_ID.get(l.id), l));
});

test('WMS_LAYERS_BY_THEME: every THEME_ORDER theme maps to at least one WMS layer, all themed correctly', () => {
  THEME_ORDER.forEach(theme => {
    const layers = WMS_LAYERS_BY_THEME.get(theme);
    assert.ok(layers && layers.length > 0, `theme "${theme}" should have at least one layer`);
    layers.forEach(l => assert.equal(l.theme, theme));
  });
});

test('WMS layer descriptors carry engine/opacity/error metadata the panel needs', () => {
  const geology = STATIC_LAYERS_BY_ID.get('qld-geology-detailed');
  assert.equal(geology.engine, 'wms');
  assert.equal(geology.group, 'pub');
  assert.equal(geology.parent, 'pub');
  assert.equal(geology.supportsOpacity, true);
  assert.equal(geology.defaultOpacity, 0.7);
  assert.equal(geology.errorCapable, true);
  assert.equal(geology.defaultOn, false);
});

test('Flow fixed layers: drainage/heatmap support opacity, targets/correlated do not', () => {
  assert.equal(STATIC_LAYERS_BY_ID.get('drainage').supportsOpacity, true);
  assert.equal(STATIC_LAYERS_BY_ID.get('heatmap').supportsOpacity, true);
  assert.equal(STATIC_LAYERS_BY_ID.get('targets').supportsOpacity, false);
  assert.equal(STATIC_LAYERS_BY_ID.get('correlated').supportsOpacity, false);
});

test('historicMines: visually grouped under "pub" but fetched via vector-query engine, not the WMS catalog', () => {
  const hm = STATIC_LAYERS_BY_ID.get('historicMines');
  assert.equal(hm.group, 'pub');
  assert.equal(hm.parent, 'pub');
  assert.equal(hm.engine, 'vector-query');
  assert.equal(hm.errorCapable, true);
});

test('projectLayerDescriptors: returns group header + 4 children including the previously-dead targets row', () => {
  const project = { id: 'p1', name: 'Test Project', boundary: { name: 'EPM 1' } };
  const rows = projectLayerDescriptors(project);
  assert.equal(rows.length, 5);
  const ids = rows.map(r => r.id);
  assert.deepEqual(ids, ['proj:p1', 'chips:p1', 'holes:p1', 'bnd:p1', 'targets:p1']);
  rows.slice(1).forEach(r => assert.equal(r.parent, 'proj:p1'));
  assert.equal(rows[0].toggle, 'group');
  assert.equal(rows.find(r => r.id === 'targets:p1').engine, 'project-marker');
});

test('projectLayerDescriptors: boundary label falls back to "Boundary" when unset', () => {
  const project = { id: 'p2', name: 'No Boundary Yet', boundary: null };
  const rows = projectLayerDescriptors(project);
  assert.equal(rows.find(r => r.id === 'bnd:p2').label, 'Boundary');
});

test('occurrenceLayerDescriptors: one row per commodity, ids match the existing occ:${commodity} convention', () => {
  const rows = occurrenceLayerDescriptors(['Gold', 'Copper']);
  assert.deepEqual(rows.map(r => r.id), ['occ:Gold', 'occ:Copper']);
  rows.forEach(r => {
    assert.equal(r.group, 'pub');
    assert.equal(r.parent, 'pub');
    assert.equal(r.engine, 'vector-query');
    assert.equal(r.vectorQuery.sourceKey, 'occurrences');
  });
  assert.equal(rows[0].vectorQuery.commodity, 'Gold');
});

test('occurrenceLayerDescriptors: empty commodity list returns no rows', () => {
  assert.deepEqual(occurrenceLayerDescriptors([]), []);
});

test('buildLayerIndex: combines static + per-project + per-commodity rows into one lookup', () => {
  const store = { projects: [{ id: 'p1', name: 'Charters Towers', boundary: null }] };
  const index = buildLayerIndex(store, ['Gold']);
  assert.ok(index.has('pub'));
  assert.ok(index.has('qld-geology-detailed'));
  assert.ok(index.has('chips:p1'));
  assert.ok(index.has('targets:p1'));
  assert.ok(index.has('occ:Gold'));
  assert.equal(index.size, STATIC_LAYERS.length + 5 + 1);
});

test('isLayerOn: explicit true/false wins over the descriptor default', () => {
  const index = buildLayerIndex({ projects: [] });
  assert.equal(isLayerOn({}, index, 'qld-geology-detailed'), false); // registry default: WMS off
  assert.equal(isLayerOn({ 'qld-geology-detailed': true }, index, 'qld-geology-detailed'), true);
  assert.equal(isLayerOn({ 'qld-geology-detailed': false }, index, 'qld-geology-detailed'), false);
});

test('isLayerOn: falls back to registry defaultOn when absent from state, normal polarity throughout', () => {
  const store = { projects: [{ id: 'p1', name: 'X', boundary: null }] };
  const index = buildLayerIndex(store);
  // Project rows default ON (unlike the old `hidden` shape, where absence
  // ALSO meant visible but via an inverted boolean — same visible outcome,
  // now expressed with normal polarity so no call site has to remember
  // which convention applies to which id).
  assert.equal(isLayerOn({}, index, 'chips:p1'), true);
  assert.equal(isLayerOn({}, index, 'targets:p1'), true);
  // WMS/flow rows default OFF.
  assert.equal(isLayerOn({}, index, 'drainage'), false);
});

test('isLayerOn: unknown id fails open to visible rather than surprising a caller', () => {
  const index = buildLayerIndex({ projects: [] });
  assert.equal(isLayerOn({}, index, 'totally-unknown-id'), true);
});

test('effectiveOn: a hidden project hides its children (replaces the old two-level hand-coded AND)', () => {
  const store = { projects: [{ id: 'p1', name: 'X', boundary: null }] };
  const index = buildLayerIndex(store);
  assert.equal(effectiveOn({}, index, 'chips:p1'), true);
  assert.equal(effectiveOn({ 'proj:p1': false }, index, 'chips:p1'), false);
  // Explicitly hiding just the child, project still visible.
  assert.equal(effectiveOn({ 'chips:p1': false }, index, 'chips:p1'), false);
  assert.equal(effectiveOn({ 'chips:p1': false }, index, 'holes:p1'), true);
});

test('effectiveOn: walks a two-level parent chain (flow:hydraulics -> flow)', () => {
  const index = buildLayerIndex({ projects: [] });
  assert.equal(effectiveOn({}, index, 'drainage'), false); // drainage itself defaults off
  assert.equal(effectiveOn({ drainage: true }, index, 'drainage'), true);
  assert.equal(effectiveOn({ drainage: true, 'flow:hydraulics': false }, index, 'drainage'), false);
  assert.equal(effectiveOn({ drainage: true, flow: false }, index, 'drainage'), false); // top-level ancestor too
});

test('layerOpacityOf: explicit value wins, else registry default, else neutral fallback for an unknown opacity-capable id', () => {
  const index = buildLayerIndex({ projects: [] });
  assert.equal(layerOpacityOf({}, index, 'qld-geology-detailed'), 0.7);
  assert.equal(layerOpacityOf({ 'qld-geology-detailed': 0.4 }, index, 'qld-geology-detailed'), 0.4);
  assert.equal(layerOpacityOf({}, index, 'drainage'), 0.65);
  assert.equal(layerOpacityOf({}, index, 'heatmap'), 0.5);
  assert.equal(layerOpacityOf({}, index, 'unknown-id'), 0.7);
});
