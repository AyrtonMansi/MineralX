// Unit tests for the pure, side-effect-free data functions in
// project-store.js — the coordinate-safety logic in particular is the
// single highest-consequence bug class in this app (a wrong reprojection
// silently puts a real drill hole on the wrong side of the country).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isProjectedCoord,
  reprojectEastingNorthing,
  gradeOf,
  detectCsvKind,
  parseSampleCsv,
  parseIntervalCsv,
  validateCoordinates,
  validateAssayValue,
  pushUndo,
  undo,
  redo,
  undoAvailable,
  redoAvailable,
  clearUndo,
} from '../components/mineralx/project-store.js';

test('isProjectedCoord: decimal degrees are not flagged', () => {
  assert.equal(isProjectedCoord(-20.09, 146.47), false);
  assert.equal(isProjectedCoord(89.9, 179.9), false);
  assert.equal(isProjectedCoord(-89.9, -179.9), false);
});

test('isProjectedCoord: MGA easting/northing magnitudes are flagged', () => {
  // A real Charters Towers-area MGA55 pair: easting ~445000, northing ~7778000.
  assert.equal(isProjectedCoord(7778000, 445000), true);
  assert.equal(isProjectedCoord(0, 500000), true); // easting alone is enough
  assert.equal(isProjectedCoord(8000000, 0), true); // northing alone is enough
});

test('reprojectEastingNorthing: MGA Zone 55 round-trips to the expected North QLD location', () => {
  const { lat, lng } = reprojectEastingNorthing(445000, 7778000, 55);
  // Known-good MGA55 -> WGS84 conversion for this pair (matches the
  // e2e durability test's expectation).
  assert.ok(Math.abs(lat - -20.0943) < 0.01, `lat ${lat} not near -20.09`);
  assert.ok(Math.abs(lng - 146.4739) < 0.01, `lng ${lng} not near 146.47`);
});

test('reprojectEastingNorthing: rejects an unsupported zone rather than silently guessing one', () => {
  assert.throws(() => reprojectEastingNorthing(445000, 7778000, 99), /Unsupported MGA zone/);
});

test('gradeOf: pending when no assays at all', () => {
  assert.equal(gradeOf({ assays: {} }, 'Au'), 'pending');
  assert.equal(gradeOf({}, 'Au'), 'pending');
});

test('gradeOf: none when assayed but not for the requested element', () => {
  assert.equal(gradeOf({ assays: { Ag: 5 } }, 'Au'), 'none');
});

test('gradeOf: thresholds classify high/anom/background correctly for Au', () => {
  assert.equal(gradeOf({ assays: { Au: 5 } }, 'Au'), 'high'); // >= 3
  assert.equal(gradeOf({ assays: { Au: 1 } }, 'Au'), 'anom'); // >= 0.5
  assert.equal(gradeOf({ assays: { Au: 0.1 } }, 'Au'), 'bg'); // < 0.5
});

test('detectCsvKind: distinguishes intervals, collars, chips, assays by header shape', () => {
  assert.equal(detectCsvKind(['hole_id', 'from', 'to', 'au']), 'intervals');
  assert.equal(detectCsvKind(['hole_id', 'lat', 'lng', 'azimuth']), 'collars');
  assert.equal(detectCsvKind(['sample_id', 'lat', 'lng', 'au']), 'chips');
  assert.equal(detectCsvKind(['sample_id', 'au', 'ag']), 'assays');
  assert.equal(detectCsvKind(['foo', 'bar']), null);
});

test('parseSampleCsv: refuses to silently misplace an MGA coordinate as decimal degrees', () => {
  const csv = 'sample_id,lat,lng,au\nZ-1,7778000,445000,5.5\n';
  const result = parseSampleCsv(csv, [], 'TN-RC-');
  assert.equal(result.needsProjection, true);
  assert.equal(result.samples.length, 0); // no sample produced without a confirmed zone
  assert.equal(result.easting, 445000);
  assert.equal(result.northing, 7778000);
});

test('parseSampleCsv: with a confirmed zone, reprojects into a real sample at the right place', () => {
  const csv = 'sample_id,lat,lng,au\nZ-1,7778000,445000,5.5\n';
  const result = parseSampleCsv(csv, [], 'TN-RC-', 55);
  assert.equal(result.error, null);
  assert.equal(result.samples.length, 1);
  const s = result.samples[0];
  assert.ok(Math.abs(s.lat - -20.0943) < 0.01);
  assert.ok(Math.abs(s.lng - 146.4739) < 0.01);
  assert.equal(s.assays.Au, 5.5);
});

test('parseSampleCsv: ordinary decimal-degree CSV imports without any zone prompt', () => {
  const csv = 'sample_id,lat,lng,au\nCT-1,-20.09,146.47,2.1\n';
  const result = parseSampleCsv(csv, [], 'TN-RC-');
  assert.equal(result.needsProjection, undefined);
  assert.equal(result.error, null);
  assert.equal(result.samples.length, 1);
});

test('validateCoordinates: accepts real WGS84, rejects NaN and out-of-range', () => {
  assert.equal(validateCoordinates(-20.09, 146.47), true);
  assert.equal(validateCoordinates(NaN, 146.47), false);
  assert.equal(validateCoordinates('-20.09', 146.47), false);
  assert.equal(validateCoordinates(-91, 0), false);
  assert.equal(validateCoordinates(0, 181), false);
});

test('validateAssayValue: negative lab values (below-detection markers) are not grades', () => {
  assert.equal(validateAssayValue(4.2), true);
  assert.equal(validateAssayValue(0), true);
  assert.equal(validateAssayValue(-0.01), false);
  assert.equal(validateAssayValue(NaN), false);
});

test('parseSampleCsv: a bad row is skipped with a row-numbered warning, good rows still import', () => {
  const csv = 'sample_id,lat,lng,au\nA-1,-20.09,146.47,2.1\nA-2,not-a-number,146.5,1.0\nA-3,-20.10,146.48,0.3\n';
  const r = parseSampleCsv(csv, [], 'TN-RC-');
  assert.equal(r.error, null);
  assert.equal(r.samples.length, 2);
  assert.match(r.warnings, /row 3: invalid coordinates/);
});

test('parseSampleCsv: negative assay is dropped from the sample, not imported as a grade', () => {
  const csv = 'sample_id,lat,lng,au\nA-1,-20.09,146.47,-0.01\n';
  const r = parseSampleCsv(csv, [], 'TN-RC-');
  assert.equal(r.samples.length, 1);
  assert.equal(r.samples[0].assays.Au, undefined);
});

test('parseIntervalCsv: from > to is rejected per-row with a warning', () => {
  const csv = 'hole_id,from,to,au\nDD-1,10,20,1.5\nDD-1,30,25,2.0\n';
  const r = parseIntervalCsv(csv);
  assert.equal(r.error, null);
  assert.equal(r.intervals.length, 1);
  assert.match(r.warnings, /row 3: invalid interval/);
});

test('undo/redo: round trip preserves history and snapshots are isolated clones', () => {
  clearUndo();
  const v1 = { projects: [{ id: 'p1', samples: [] }] };
  const v2 = { projects: [{ id: 'p1', samples: [{ id: 's1' }] }] };

  pushUndo(v1); // about to mutate v1 -> v2
  assert.equal(undoAvailable(), true);
  assert.equal(redoAvailable(), false);

  const back = undo(v2); // current state is v2
  assert.deepEqual(back, v1);
  assert.equal(redoAvailable(), true);

  const fwd = redo(back); // current state is now v1 again
  assert.deepEqual(fwd, v2);
  assert.equal(undoAvailable(), true); // v1 went back onto the undo stack

  // Second undo after the round trip must still return v1 — this is the
  // exact sequence a naive redo() (that doesn't capture current state)
  // corrupts.
  const back2 = undo(fwd);
  assert.deepEqual(back2, v1);

  // Snapshots are clones: mutating the original object after pushUndo
  // must not alter history.
  clearUndo();
  const live = { projects: [{ id: 'p1', samples: [] }] };
  pushUndo(live);
  live.projects[0].samples.push({ id: 'mutated' });
  const restored = undo(live);
  assert.equal(restored.projects[0].samples.length, 0);
  clearUndo();
});

test('undo/redo: a new action clears the redo branch', () => {
  clearUndo();
  const v1 = { n: 1 };
  const v2 = { n: 2 };
  pushUndo(v1);
  undo(v2); // redo stack now holds v2
  assert.equal(redoAvailable(), true);
  pushUndo(v1); // new action from the restored state
  assert.equal(redoAvailable(), false);
  clearUndo();
});
