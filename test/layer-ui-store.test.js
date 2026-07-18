// Unit tests for components/mineralx/layer-ui-store.js — the Layers
// panel's own localStorage persistence (mx-layers-v1), deliberately
// separate from project-store.js's mx-store-v7 (see that file's header
// comment for why). No window/localStorage exists in the node:test
// environment, so a minimal fake is installed on the global for the
// round-trip tests and removed afterwards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYER_UI_STORE_KEY, loadLayerUiState, saveLayerUiState } from '../components/mineralx/layer-ui-store.js';

function withFakeWindow(fn) {
  const store = new Map();
  global.window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
  };
  try {
    fn(global.window.localStorage);
  } finally {
    delete global.window;
  }
}

test('loadLayerUiState: with no window (SSR), returns empty defaults rather than throwing', () => {
  assert.equal(typeof window, 'undefined');
  const state = loadLayerUiState();
  assert.deepEqual(state, { layerOn: {}, layerOpacity: {}, layerExpanded: {} });
});

test('saveLayerUiState: with no window (SSR), is a silent no-op rather than throwing', () => {
  assert.equal(typeof window, 'undefined');
  assert.doesNotThrow(() => saveLayerUiState({ layerOn: { drainage: true }, layerOpacity: {}, layerExpanded: {} }));
});

test('loadLayerUiState: nothing saved yet returns empty defaults', () => {
  withFakeWindow(() => {
    const state = loadLayerUiState();
    assert.deepEqual(state, { layerOn: {}, layerOpacity: {}, layerExpanded: {} });
  });
});

test('save then load round-trips layerOn/layerOpacity/layerExpanded exactly', () => {
  withFakeWindow(() => {
    const saved = {
      layerOn: { 'qld-geology-detailed': true, drainage: false },
      layerOpacity: { 'qld-geology-detailed': 0.4 },
      layerExpanded: { pub: true, flow: false },
    };
    saveLayerUiState(saved);
    assert.deepEqual(loadLayerUiState(), saved);
  });
});

test('loadLayerUiState: tolerates a corrupted (non-JSON) saved value by falling back to empty defaults', () => {
  withFakeWindow((localStorage) => {
    localStorage.setItem(LAYER_UI_STORE_KEY, '{not valid json');
    assert.deepEqual(loadLayerUiState(), { layerOn: {}, layerOpacity: {}, layerExpanded: {} });
  });
});

test('loadLayerUiState: tolerates a saved value missing one of the three keys', () => {
  withFakeWindow((localStorage) => {
    localStorage.setItem(LAYER_UI_STORE_KEY, JSON.stringify({ layerOn: { drainage: true } }));
    const state = loadLayerUiState();
    assert.deepEqual(state.layerOn, { drainage: true });
    assert.deepEqual(state.layerOpacity, {});
    assert.deepEqual(state.layerExpanded, {});
  });
});

test('loadLayerUiState: tolerates a saved value where a key is the wrong type', () => {
  withFakeWindow((localStorage) => {
    localStorage.setItem(LAYER_UI_STORE_KEY, JSON.stringify({ layerOn: 'not-an-object', layerOpacity: null, layerExpanded: {} }));
    const state = loadLayerUiState();
    assert.deepEqual(state.layerOn, {});
    assert.deepEqual(state.layerOpacity, {});
    assert.deepEqual(state.layerExpanded, {});
  });
});

test('an unknown id in saved layerOn is preserved as-is (registry helpers, not this module, decide what to do with it)', () => {
  withFakeWindow(() => {
    saveLayerUiState({ layerOn: { 'totally-unknown-id': true }, layerOpacity: {}, layerExpanded: {} });
    const state = loadLayerUiState();
    assert.equal(state.layerOn['totally-unknown-id'], true);
  });
});
