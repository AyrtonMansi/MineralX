// Unit tests for lib/extract-normalize.js — the post-processing that
// enforces CLAUDE.md hard rule 1 (never silently reproject; a
// projected-magnitude coordinate goes to `skipped[]`, not auto-converted)
// and hard rule 9 (a below-detection assay result is real data, never
// dropped) for the AI-extraction ingestion path. This logic previously
// lived unexported inside app/api/extract/route.js and had no test
// coverage at all — e2e mocks /api/extract at the network layer
// (page.route, see e2e/extract.spec.js), so it never actually exercised
// this code, and the one e2e test that hits the real route exits at the
// missing-API-key check before ever reaching normalise().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isProjected, inRange, assaysToMaps, normalise } from '../lib/extract-normalize.js';

test('isProjected: decimal degrees are not flagged, MGA-scale magnitudes are', () => {
  assert.equal(isProjected(-20.09, 146.47), false);
  assert.equal(isProjected(7778000, 445000), true);
});

test('inRange: rejects non-numbers, NaN, and out-of-range values', () => {
  assert.equal(inRange(-20, 146), true);
  assert.equal(inRange('not-a-number', 146), false);
  assert.equal(inRange(NaN, 146), false);
  assert.equal(inRange(91, 146), false);
  assert.equal(inRange(-20, 181), false);
});

test('assaysToMaps: a real value goes to assays, a below-detection pair goes to detectionLimits, never both', () => {
  const { assays, detectionLimits } = assaysToMaps([
    { element: 'Au', value: 4.2, detectionLimit: null },
    { element: 'Ag', value: null, detectionLimit: 0.5 },
  ]);
  assert.deepEqual(assays, { Au: 4.2 });
  assert.deepEqual(detectionLimits, { Ag: 0.5 });
});

test('assaysToMaps: a pair with neither a value nor a detection limit is dropped, and an empty/missing element is skipped', () => {
  const { assays, detectionLimits } = assaysToMaps([
    { element: 'Cu', value: null, detectionLimit: null },
    { element: '', value: 1, detectionLimit: null },
    { element: null, value: 1, detectionLimit: null },
  ]);
  assert.deepEqual(assays, {});
  assert.deepEqual(detectionLimits, {});
});

test('assaysToMaps: a negative value or detection limit is rejected, not stored as a real result', () => {
  const { assays, detectionLimits } = assaysToMaps([
    { element: 'Pb', value: -1, detectionLimit: null },
    { element: 'Zn', value: null, detectionLimit: -0.1 },
  ]);
  assert.deepEqual(assays, {});
  assert.deepEqual(detectionLimits, {});
});

test('assaysToMaps: undefined/empty input is handled without throwing', () => {
  assert.deepEqual(assaysToMaps(undefined), { assays: {}, detectionLimits: {} });
  assert.deepEqual(assaysToMaps([]), { assays: {}, detectionLimits: {} });
});

test('normalise: a sample with decimal-degree coordinates imports; one with projected-magnitude coordinates is skipped, never reprojected', () => {
  const raw = {
    samples: [
      { id: 'S1', lat: -20.07, lng: 146.26, assays: [{ element: 'Au', value: 4.2, detectionLimit: null }], lith: 'Quartz', notes: '' },
      { id: 'S2', lat: 7778000, lng: 445000, assays: [], lith: '', notes: '' },
    ],
    collars: [], intervals: [], boundary: null, confidence: 0.8, sourceHighlights: [],
  };
  const { extracted, skipped } = normalise(raw);
  assert.equal(extracted.samples.length, 1);
  assert.equal(extracted.samples[0].id, 'S1');
  assert.deepEqual(extracted.samples[0].assays, { Au: 4.2 });
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].kind, 'sample');
  assert.equal(skipped[0].id, 'S2');
  assert.match(skipped[0].reason, /projected/);
  // The rejected row's coordinates are nowhere in the output — nothing
  // silently reprojects them.
  assert.equal(JSON.stringify(extracted).includes('7778000'), false);
});

test('normalise: a below-detection sample result survives as a detectionLimits entry, not a dropped/blank element', () => {
  const raw = {
    samples: [{ id: 'S1', lat: -20.07, lng: 146.26, assays: [{ element: 'Au', value: null, detectionLimit: 0.01 }], lith: '', notes: '' }],
    collars: [], intervals: [], boundary: null, confidence: 0.8, sourceHighlights: [],
  };
  const { extracted } = normalise(raw);
  assert.deepEqual(extracted.samples[0].assays, {});
  assert.deepEqual(extracted.samples[0].detectionLimits, { Au: 0.01 });
});

test('normalise: a sample with no assays at all has no detectionLimits key (not an empty object) — same as the CSV path', () => {
  const raw = {
    samples: [{ id: 'S1', lat: -20.07, lng: 146.26, assays: [], lith: '', notes: '' }],
    collars: [], intervals: [], boundary: null, confidence: 0.8, sourceHighlights: [],
  };
  const { extracted } = normalise(raw);
  assert.equal('detectionLimits' in extracted.samples[0], false);
});

test('normalise: a collar with non-numeric coordinates (neither projected-magnitude nor in-range) is skipped with its own reason', () => {
  // Any |lat|>90 or |lng|>180 is caught by the projected check first, so
  // the only way to reach the separate "invalid coordinates" branch is a
  // non-numeric/NaN value — defensive coverage for a malformed upstream
  // value even though the structured-output schema is supposed to
  // guarantee `type: 'number'`.
  const raw = {
    samples: [], collars: [{ id: 'H1', lat: NaN, lng: 146, azimuth: null, dip: null, depth: null }],
    intervals: [], boundary: null, confidence: 0.8, sourceHighlights: [],
  };
  const { extracted, skipped } = normalise(raw);
  assert.equal(extracted.collars.length, 0);
  assert.equal(skipped[0].kind, 'collar');
  assert.match(skipped[0].reason, /invalid coordinates/);
});

test('normalise: an interval with from > to is rejected, not silently swapped or imported inverted', () => {
  const raw = {
    samples: [], collars: [], intervals: [{ holeId: 'H1', from: 50, to: 10, assays: [] }],
    boundary: null, confidence: 0.8, sourceHighlights: [],
  };
  const { extracted, skipped } = normalise(raw);
  assert.equal(extracted.intervals.length, 0);
  assert.equal(skipped[0].kind, 'interval');
});

test('normalise: a boundary needs at least 3 usable vertices; fewer is skipped (with a reason ExtractPanel shows the user), not silently dropped', () => {
  const tooFew = normalise({
    samples: [], collars: [], intervals: [],
    boundary: { name: 'EPM 1', coords: [[-20, 146], [-20.1, 146.1]] },
    confidence: 0.8, sourceHighlights: [],
  });
  assert.equal(tooFew.extracted.boundary, null);
  assert.equal(tooFew.skipped[0].kind, 'boundary');

  const enough = normalise({
    samples: [], collars: [], intervals: [],
    boundary: { name: 'EPM 1', coords: [[-20, 146], [-20.1, 146.1], [-20.1, 146]] },
    confidence: 0.8, sourceHighlights: [],
  });
  assert.equal(enough.extracted.boundary.coords.length, 3);
});

test('normalise: confidence is clamped to [0,1] and defaults to 0 when not a number', () => {
  const over = normalise({ samples: [], collars: [], intervals: [], boundary: null, confidence: 1.5, sourceHighlights: [] });
  const under = normalise({ samples: [], collars: [], intervals: [], boundary: null, confidence: -0.5, sourceHighlights: [] });
  const missing = normalise({ samples: [], collars: [], intervals: [], boundary: null, confidence: 'high', sourceHighlights: [] });
  assert.equal(over.extracted.confidence, 1);
  assert.equal(under.extracted.confidence, 0);
  assert.equal(missing.extracted.confidence, 0);
});

test('normalise: sourceHighlights is capped at 20 entries', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ text: `quote ${i}`, type: 'assay' }));
  const { extracted } = normalise({ samples: [], collars: [], intervals: [], boundary: null, confidence: 0.8, sourceHighlights: many });
  assert.equal(extracted.sourceHighlights.length, 20);
});
