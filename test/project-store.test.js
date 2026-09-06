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
  migrateV2,
  migrateV3,
  migrateV4,
  migrateV5,
  migrateV6,
  migrateV7,
  createDemoStore,
  targetKey,
  targetPrefix,
  nextId,
  targetHitRate,
  bestLinkedGrade,
  targetsToCsv,
  crsLabel,
  samplesToCsv,
  isValidSampleType,
  isValidQaqcType,
  isValidCoordSource,
  SAMPLE_TYPES,
  QAQC_TYPES,
  COORD_SOURCES,
  parseAssayCell,
  parseAssayCsv,
  assayDisplay,
  elementsInStore,
  intervalsToCsv,
  parseSurveyCsv,
  surveysToCsv,
  parseGeologyCsv,
  geologyToCsv,
  parseCollarCsv,
  collarsToCsv,
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
  assert.throws(() => reprojectEastingNorthing(445000, 7778000, { system: 'mga2020', zone: 40 }), /Unsupported MGA zone/);
  assert.throws(() => reprojectEastingNorthing(445000, 7778000, { system: 'nonsense', zone: 5 }), /Unsupported coordinate system/);
});

test('reprojectEastingNorthing: worldwide grids reproject to the right country', () => {
  // Western Australia, MGA2020 zone 50 (zone covers ~114–120°E): a valid
  // WA location well away from the QLD zones this app used to be limited to.
  const wa = reprojectEastingNorthing(353000, 6597000, { system: 'mga2020', zone: 50 });
  assert.ok(wa.lat > -32 && wa.lat < -29 && wa.lng > 114 && wa.lng < 118, `WA got ${wa.lat},${wa.lng}`);

  // Ghana (Ashanti gold belt), WGS84 UTM zone 30N ~ 6.7N, 1.6W.
  const gh = reprojectEastingNorthing(650000, 740000, { system: 'utm-north', zone: 30 });
  assert.ok(gh.lat > 6 && gh.lat < 7.5 && gh.lng > -2.5 && gh.lng < -0.5, `Ghana got ${gh.lat},${gh.lng}`);

  // Nevada (Carlin trend), WGS84 UTM zone 11N ~ 40.8N, 116.3W.
  const nv = reprojectEastingNorthing(560000, 4517000, { system: 'utm-north', zone: 11 });
  assert.ok(nv.lat > 40 && nv.lat < 41.5 && nv.lng > -117.5 && nv.lng < -115.5, `Nevada got ${nv.lat},${nv.lng}`);
});

test('crsLabel: reads back each supported system', () => {
  assert.equal(crsLabel(55), 'MGA Zone 55');
  assert.equal(crsLabel({ system: 'mga2020', zone: 50 }), 'MGA Zone 50');
  assert.equal(crsLabel({ system: 'utm-north', zone: 30 }), 'UTM Zone 30N');
  assert.equal(crsLabel({ system: 'utm-south', zone: 34 }), 'UTM Zone 34S');
});

test('parseSampleCsv: reprojects a non-Australian UTM file once its CRS is confirmed', () => {
  // A Ghana rock-chip file in UTM 30N metres.
  const csv = 'sample_id,easting,northing,au\nGH-RC-1,650000,740000,5.5\n';
  const flagged = parseSampleCsv(csv, [], 'GH-RC-');
  assert.equal(flagged.needsProjection, true); // never guessed
  const done = parseSampleCsv(csv, [], 'GH-RC-', { system: 'utm-north', zone: 30 });
  assert.equal(done.error, null);
  assert.equal(done.samples.length, 1);
  assert.ok(done.samples[0].lat > 6 && done.samples[0].lat < 7.5, `lat ${done.samples[0].lat}`);
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

// ── Target worklist (v4) ────────────────────────────────────────────────

test('migrateV3: adds empty target/dismissed lists to every project, touching nothing else', () => {
  const v3 = {
    version: 3,
    activeProjectId: 'p1',
    projects: [
      { id: 'p1', name: 'A', samples: [{ id: 'S1', assays: { Au: 2 } }], collars: [], intervals: [] },
    ],
  };
  const v4 = migrateV3(v3);
  assert.equal(v4.version, 4);
  assert.deepEqual(v4.projects[0].targets, []);
  assert.deepEqual(v4.projects[0].dismissedTargets, []);
  // Existing data is carried through untouched.
  assert.deepEqual(v4.projects[0].samples, v3.projects[0].samples);
  assert.equal(v4.activeProjectId, 'p1');
});

test('migrateV3: preserves targets a project already has (idempotent forward)', () => {
  const already = { version: 4, projects: [{ id: 'p', targets: [{ id: 'T1' }], dismissedTargets: ['1:2'] }] };
  const out = migrateV3(already);
  assert.deepEqual(out.projects[0].targets, [{ id: 'T1' }]);
  assert.deepEqual(out.projects[0].dismissedTargets, ['1:2']);
});

test('migrateV2 → migrateV3: a v2 store lands at v4 with assays maps and target lists', () => {
  const v2 = { version: 2, projects: [{ id: 'p', samples: [{ id: 'S1', au: 3.4 }], intervals: [{ holeId: 'H', from: 1, to: 2, au: 5 }] }] };
  const v4 = migrateV3(migrateV2(v2));
  assert.equal(v4.version, 4);
  assert.deepEqual(v4.projects[0].samples[0].assays, { Au: 3.4 });
  assert.equal(v4.projects[0].samples[0].au, undefined);
  assert.deepEqual(v4.projects[0].targets, []);
});

test('createDemoStore: every project carries the target lists', () => {
  const store = createDemoStore();
  store.projects.forEach((p) => {
    assert.ok(Array.isArray(p.targets));
    assert.ok(Array.isArray(p.dismissedTargets));
  });
});

test('targetKey: same spot to ~1m collides, genuinely distinct spots do not', () => {
  // Sub-1e-5 jitter (what an analysis re-run produces) lands in the same cell.
  assert.equal(targetKey(-20.066512, 146.257013), targetKey(-20.066514, 146.257011));
  // A genuinely different target (~1m+ away) keys distinctly.
  assert.notEqual(targetKey(-20.0665, 146.2570), targetKey(-20.0675, 146.2570));
});

test('targetPrefix: derives a -TG- id prefix from the sample prefix', () => {
  assert.equal(targetPrefix('CT-RC-'), 'CT-TG-');
  assert.equal(targetPrefix('XY-RC-'), 'XY-TG-');
  // nextId then produces a clean sequence off the target prefix.
  assert.equal(nextId([], targetPrefix('CT-RC-')), 'CT-TG-0001');
  assert.equal(nextId([{ id: 'CT-TG-0003' }], targetPrefix('CT-RC-')), 'CT-TG-0004');
});

test('targetHitRate: counts only assessed targets, from the store alone', () => {
  const store = {
    projects: [
      { targets: [{ status: 'confirmed' }, { status: 'barren' }, { status: 'proposed' }, { status: 'sampled' }] },
      { targets: [{ status: 'confirmed' }] },
      { targets: [] },
    ],
  };
  assert.deepEqual(targetHitRate(store), { assessed: 3, confirmed: 2, barren: 1 });
});

test('targetHitRate: zero when nothing has been assessed (no fabricated number)', () => {
  const store = { projects: [{ targets: [{ status: 'proposed' }, { status: 'planned' }] }] };
  assert.deepEqual(targetHitRate(store), { assessed: 0, confirmed: 0, barren: 0 });
});

test('targetsToCsv: emits a report row per target with status, links and evidence', () => {
  const csv = targetsToCsv([
    { id: 'CT-TG-0001', lat: -20.07, lng: 146.26, status: 'confirmed', score: 12.3, linkedSampleIds: ['CT-RC-9001', 'CT-RC-9002'], provenance: { sample: true, occurrence: true, element: 'Au', analysedAt: '2026-07-10' } },
  ]);
  const [header, row] = csv.split('\n');
  assert.equal(header, 'target_id,lat,lng,status,score,element,linked_samples,flagged,evidence');
  assert.match(row, /^CT-TG-0001,-20.07,146.26,confirmed,12.3,Au,CT-RC-9001 CT-RC-9002,2026-07-10,/);
  assert.match(row, /occurrence and your anomalous sample/);
});

test('bestLinkedGrade: returns the top valid grade for the element, or null when unassayed', () => {
  const samples = [
    { id: 'A', assays: { Au: 1.2 } },
    { id: 'B', assays: { Au: 4.8, Ag: 20 } },
    { id: 'C', assays: {} }, // awaiting assay
  ];
  assert.equal(bestLinkedGrade(samples, 'Au'), 4.8);
  assert.equal(bestLinkedGrade(samples, 'Cu'), null); // none assayed for Cu
  assert.equal(bestLinkedGrade([{ assays: {} }], 'Au'), null);
  // A below-detection negative value is not a grade.
  assert.equal(bestLinkedGrade([{ assays: { Au: -0.01 } }], 'Au'), null);
});

// ── Sample provenance / QAQC (v5) ───────────────────────────────────────

test('migrateV4: gives every sample conservative provenance/QAQC defaults', () => {
  const v4 = {
    version: 4,
    projects: [{ id: 'p1', samples: [{ id: 'S1', assays: { Au: 2 } }, { id: 'S2', assays: {}, sampleType: 'soil' }], targets: [], dismissedTargets: [] }],
  };
  const v5 = migrateV4(v4);
  assert.equal(v5.version, 5);
  // No prior tag at all -> the conservative defaults.
  assert.deepEqual(
    { sampleType: v5.projects[0].samples[0].sampleType, qaqcType: v5.projects[0].samples[0].qaqcType, coordSource: v5.projects[0].samples[0].coordSource },
    { sampleType: 'rock_chip', qaqcType: 'none', coordSource: 'unknown' },
  );
  // An existing value (however it got there) is never clobbered by the default.
  assert.equal(v5.projects[0].samples[1].sampleType, 'soil');
});

test('createDemoStore: every demo sample carries the provenance fields', () => {
  const store = createDemoStore();
  store.projects.forEach(p => p.samples.forEach(s => {
    assert.equal(isValidSampleType(s.sampleType), true);
    assert.equal(isValidQaqcType(s.qaqcType), true);
    assert.equal(isValidCoordSource(s.coordSource), true);
  }));
});

test('isValidSampleType/isValidQaqcType/isValidCoordSource: accept only the known enums', () => {
  SAMPLE_TYPES.forEach(t => assert.equal(isValidSampleType(t), true));
  QAQC_TYPES.forEach(t => assert.equal(isValidQaqcType(t), true));
  COORD_SOURCES.forEach(t => assert.equal(isValidCoordSource(t), true));
  assert.equal(isValidSampleType('nonsense'), false);
  assert.equal(isValidQaqcType(''), false);
  assert.equal(isValidCoordSource(undefined), false);
});

test('parseSampleCsv: reads QAQC/provenance columns, recognising common lab abbreviations', () => {
  const csv = 'sample_id,lat,lng,au,sample_type,qaqc_type,duplicate_of,coord_source\n'
    + 'CT-RC-0001,-20.07,146.26,4.2,rock_chip,none,,dgps\n'
    + 'CT-RC-0002,-20.08,146.27,4.1,,dup,CT-RC-0001,gps\n' // common lab abbreviations
    + 'CT-RC-0003,-20.09,146.28,0.01,soil,std,,survey\n';
  const r = parseSampleCsv(csv, [], 'CT-RC-');
  assert.equal(r.error, null);
  assert.equal(r.samples.length, 3);
  assert.equal(r.samples[0].coordSource, 'dgps');
  assert.equal(r.samples[1].qaqcType, 'duplicate'); // "dup" alias recognised
  assert.equal(r.samples[1].duplicateOf, 'CT-RC-0001');
  assert.equal(r.samples[1].coordSource, 'gps_handheld'); // "gps" alias recognised
  assert.equal(r.samples[2].sampleType, 'soil');
  assert.equal(r.samples[2].qaqcType, 'standard'); // "std" alias recognised
});

test('parseSampleCsv: an unrecognised QAQC/type value falls back to the safe default and warns, without dropping the row', () => {
  const csv = 'sample_id,lat,lng,au,qaqc_type\nCT-RC-0001,-20.07,146.26,4.2,not_a_real_type\n';
  const r = parseSampleCsv(csv, [], 'CT-RC-');
  assert.equal(r.error, null);
  assert.equal(r.samples.length, 1); // row still imports
  assert.equal(r.samples[0].qaqcType, 'none'); // safe default
  assert.equal(r.samples[0].assays.Au, 4.2); // assay data intact
  assert.match(r.warnings, /not recognised/);
  assert.match(r.warnings, /not_a_real_type/);
});

test('parseSampleCsv: samples with no QAQC/type columns at all get the conservative defaults', () => {
  const csv = 'sample_id,lat,lng,au\nCT-RC-0001,-20.07,146.26,4.2\n';
  const r = parseSampleCsv(csv, [], 'CT-RC-');
  assert.equal(r.samples[0].sampleType, 'rock_chip');
  assert.equal(r.samples[0].qaqcType, 'none');
  assert.equal(r.samples[0].coordSource, 'unknown');
  assert.equal(r.samples[0].duplicateOf, undefined); // no phantom field when absent
});

test('samplesToCsv: round-trips sample_type/qaqc_type/duplicate_of/coord_source', () => {
  const samples = [
    { id: 'CT-RC-0001', lat: -20.07, lng: 146.26, assays: { Au: 4.2 }, lith: 'Quartz', notes: '', date: '2026-07-01', sampleType: 'soil', qaqcType: 'duplicate', duplicateOf: 'CT-RC-0000', coordSource: 'dgps' },
  ];
  const csv = samplesToCsv(samples);
  const [header, row] = csv.split('\n');
  assert.match(header, /sample_type,qaqc_type,duplicate_of,coord_source/);
  const cells = row.split(',');
  assert.ok(cells.includes('soil'));
  assert.ok(cells.includes('duplicate'));
  assert.ok(cells.includes('CT-RC-0000'));
  assert.ok(cells.includes('dgps'));

  // Round-trip through parseSampleCsv recovers the same values.
  const reparsed = parseSampleCsv(csv, [], 'CT-RC-');
  assert.equal(reparsed.samples[0].sampleType, 'soil');
  assert.equal(reparsed.samples[0].qaqcType, 'duplicate');
  assert.equal(reparsed.samples[0].duplicateOf, 'CT-RC-0000');
  assert.equal(reparsed.samples[0].coordSource, 'dgps');
});

// ── Collar CSV ────────────────────────────────────────────────────────
// No prior coverage existed for parseCollarCsv/collarsToCsv at all —
// added alongside the new `notes` field (matching the field-note pattern
// already established for samples/geology) rather than leaving it as the
// one CSV path with zero round-trip test, per CLAUDE.md's testing rule
// that anything touching CSV parsing needs a unit test.

test('collarsToCsv / parseCollarCsv: round-trips a collar including notes, preserving quoted commas in notes', () => {
  const collars = [
    { id: 'CT-DD-004', lat: -20.07, lng: 146.26, azimuth: 90, dip: -60, depth: 300, date: '2026-07-01', notes: 'Rig moved off, resume next visit' },
  ];
  const csv = collarsToCsv(collars);
  const [header, row] = csv.split('\n');
  assert.match(header, /hole_id,lat,lng,azimuth,dip,depth,notes,date/);
  // CSV quoting must preserve the original text rather than silently changing it.
  assert.equal(row.includes('Rig moved off, resume'), true);
  assert.ok(row.includes('"Rig moved off, resume next visit"'));

  const reparsed = parseCollarCsv(csv, [], 'CT-DD-');
  assert.equal(reparsed.collars[0].id, 'CT-DD-004');
  assert.equal(reparsed.collars[0].notes, 'Rig moved off, resume next visit');
  assert.equal(reparsed.collars[0].date, '2026-07-01');
  assert.equal(reparsed.collars[0].depth, 300);
});

test('parseCollarCsv: notes column is optional — collars without one get an empty string, not undefined', () => {
  const csv = 'hole_id,lat,lng\nCT-DD-005,-20.07,146.26';
  const { collars } = parseCollarCsv(csv, [], 'CT-DD-');
  assert.equal(collars[0].notes, '');
});

test('parseCollarCsv: refuses to silently misplace an MGA coordinate as decimal degrees', () => {
  const csv = 'hole_id,lat,lng\nCT-DD-006,7778000,445000';
  const result = parseCollarCsv(csv, [], 'CT-DD-');
  assert.equal(result.needsProjection, true);
  assert.equal(result.collars.length, 0);
});

// ── Detection limits ────────────────────────────────────────────────────
// Real lab certificates report below-detection results as "<0.01" or a
// negative-number convention — before this, both silently vanished
// (parseFloat("<0.01") is NaN, and the old validateAssayValue-only gate
// rejected negatives outright). That's real lab data lost, not just an
// edge case: every below-detection cell in a real assay CSV hit this.

test('parseAssayCell: a plain positive number is a real measured value', () => {
  assert.deepEqual(parseAssayCell('4.2'), { value: 4.2, detectionLimit: null });
  assert.deepEqual(parseAssayCell(' 0 '), { value: 0, detectionLimit: null });
});

test('parseAssayCell: "<X" and "< X" are read as a detection limit, not dropped', () => {
  assert.deepEqual(parseAssayCell('<0.01'), { value: null, detectionLimit: 0.01 });
  assert.deepEqual(parseAssayCell('< 0.5'), { value: null, detectionLimit: 0.5 });
  assert.deepEqual(parseAssayCell('≤0.01'), { value: null, detectionLimit: 0.01 });
});

test('parseAssayCell: a negative number is the legacy below-detection convention', () => {
  assert.deepEqual(parseAssayCell('-0.01'), { value: null, detectionLimit: 0.01 });
});

test('parseAssayCell: blank or unparseable cells stay absent, not a phantom zero limit', () => {
  assert.deepEqual(parseAssayCell(''), { value: null, detectionLimit: null });
  assert.deepEqual(parseAssayCell(undefined), { value: null, detectionLimit: null });
  assert.deepEqual(parseAssayCell('n/a'), { value: null, detectionLimit: null });
});

test('parseSampleCsv: a below-detection cell keeps the row (and its other assays), recorded as a detection limit', () => {
  const csv = 'sample_id,lat,lng,au,ag\nCT-RC-0001,-20.07,146.26,<0.01,12\n';
  const r = parseSampleCsv(csv, [], 'CT-RC-');
  assert.equal(r.error, null);
  assert.equal(r.samples.length, 1);
  assert.equal(r.samples[0].assays.Au, undefined); // not a measured value
  assert.equal(r.samples[0].assays.Ag, 12); // sibling column unaffected
  assert.equal(r.samples[0].detectionLimits.Au, 0.01);
});

test('parseIntervalCsv: below-detection intervals are recorded, not dropped', () => {
  const csv = 'hole_id,from,to,au\nCT-DD-001,10,12,<0.005\n';
  const r = parseIntervalCsv(csv);
  assert.equal(r.error, null);
  assert.equal(r.intervals.length, 1);
  assert.equal(r.intervals[0].assays.Au, undefined);
  assert.equal(r.intervals[0].detectionLimits.Au, 0.005);
});

test('gradeOf: a below-detection-only element grades as background, not "none" or "pending"', () => {
  const sample = { assays: {}, detectionLimits: { Au: 0.01 } };
  assert.equal(gradeOf(sample, 'Au'), 'bg');
  // Still 'none' for a genuinely untested element on that same sample.
  assert.equal(gradeOf(sample, 'Cu'), 'none');
});

test('gradeOf: a sample with no result of any kind is still pending', () => {
  assert.equal(gradeOf({ assays: {} }, 'Au'), 'pending');
  assert.equal(gradeOf({ assays: {}, detectionLimits: {} }, 'Au'), 'pending');
});

test('assayDisplay: prefers a real value, falls back to "<limit", else null', () => {
  assert.equal(assayDisplay({ assays: { Au: 4.2 } }, 'Au'), '4.2 g/t Au');
  assert.equal(assayDisplay({ assays: {}, detectionLimits: { Au: 0.01 } }, 'Au'), '<0.01 g/t Au');
  assert.equal(assayDisplay({ assays: {}, detectionLimits: {} }, 'Au'), null);
});

test('elementsInStore: an element that only ever came back below detection still appears', () => {
  const store = { projects: [{ samples: [{ assays: {}, detectionLimits: { Sb: 50 } }], intervals: [] }] };
  assert.ok(elementsInStore(store).includes('Sb'));
});

test('samplesToCsv / parseSampleCsv: a below-detection value round-trips losslessly', () => {
  const samples = [{ id: 'CT-RC-0001', lat: -20.07, lng: 146.26, assays: {}, detectionLimits: { Au: 0.01 }, lith: '', notes: '', date: '2026-07-01' }];
  const csv = samplesToCsv(samples);
  assert.match(csv.split('\n')[1], /<0\.01/);
  const reparsed = parseSampleCsv(csv, [], 'CT-RC-');
  assert.equal(reparsed.samples[0].assays.Au, undefined);
  assert.equal(reparsed.samples[0].detectionLimits.Au, 0.01);
});

test('intervalsToCsv: exports the from-to-grade table (previously not exportable at all), detection-limit aware', () => {
  const intervals = [
    { holeId: 'CT-DD-001', from: 10, to: 12.5, assays: { Au: 3.1 } },
    { holeId: 'CT-DD-001', from: 12.5, to: 14, assays: {}, detectionLimits: { Au: 0.01 } },
  ];
  const csv = intervalsToCsv(intervals);
  const lines = csv.split('\n');
  assert.equal(lines[0], 'hole_id,sample_id,from,to,width_m,Au_gpt');
  assert.equal(lines[1], 'CT-DD-001,,10,12.5,2.50,3.1');
  assert.equal(lines[2], 'CT-DD-001,,12.5,14,1.50,<0.01');
});

test('parseAssayCsv: a fresh measured value supersedes a stale detection limit for the same element', () => {
  const samples = [{ id: 'CT-RC-0001', assays: {}, detectionLimits: { Au: 0.01 } }];
  const csv = 'sample_id,au\nCT-RC-0001,2.4\n'; // a re-assay came back with a real grade
  const r = parseAssayCsv(csv, samples);
  assert.equal(r.matched, 1);
  assert.equal(r.updated[0].assays.Au, 2.4);
  assert.equal(r.updated[0].detectionLimits, undefined); // stale limit cleared, not left dangling
});

test('parseAssayCsv: a new detection limit clears any stale measured value for that element', () => {
  const samples = [{ id: 'CT-RC-0001', assays: { Au: 4.2 } }];
  const csv = 'sample_id,au\nCT-RC-0001,<0.01\n';
  const r = parseAssayCsv(csv, samples);
  assert.equal(r.updated[0].assays.Au, undefined);
  assert.equal(r.updated[0].detectionLimits.Au, 0.01);
});

// ── Downhole survey shots ────────────────────────────────────────────────
// A collar's own azimuth/dip is only the planned/collar orientation — a
// real diamond/RC hole deviates with depth. Surveys are stored flat (like
// intervals), keyed by holeId, not nested inside the collar.

test('migrateV5: every project gains an empty surveys list, existing ones preserved', () => {
  const v5 = { version: 5, projects: [{ id: 'p1', samples: [], collars: [], intervals: [] }, { id: 'p2', samples: [], collars: [], intervals: [], surveys: [{ holeId: 'H1', depth: 10, azimuth: 90, dip: -60 }] }] };
  const v6 = migrateV5(v5);
  assert.equal(v6.version, 6);
  assert.deepEqual(v6.projects[0].surveys, []);
  assert.equal(v6.projects[1].surveys.length, 1); // pre-existing data untouched
});

test('createDemoStore: every project has a surveys array (empty — no invented downhole data)', () => {
  const store = createDemoStore();
  store.projects.forEach(p => assert.ok(Array.isArray(p.surveys)));
});

test('parseSurveyCsv: reads hole_id/depth/azimuth/dip, wraps azimuth into 0-360', () => {
  const csv = 'hole_id,depth,azimuth,dip\nCT-DD-001,50,92.5,-58\nCT-DD-001,100,-10,-61\n';
  const r = parseSurveyCsv(csv);
  assert.equal(r.error, null);
  assert.equal(r.surveys.length, 2);
  assert.deepEqual(r.surveys[0], { holeId: 'CT-DD-001', depth: 50, azimuth: 92.5, dip: -58 });
  assert.equal(r.surveys[1].azimuth, 350); // -10 wrapped to 350
});

test('parseSurveyCsv: rejects an out-of-range dip per row, without failing the whole file', () => {
  const csv = 'hole_id,depth,azimuth,dip\nCT-DD-001,50,90,-60\nCT-DD-001,100,90,-140\n'; // -140 is not a valid inclination
  const r = parseSurveyCsv(csv);
  assert.equal(r.error, null);
  assert.equal(r.surveys.length, 1);
  assert.match(r.warnings, /Skipped 1 row/);
});

test('parseSurveyCsv: a negative depth is rejected, a missing hole_id/depth/azimuth/dip column set is a fatal error', () => {
  const badDepth = parseSurveyCsv('hole_id,depth,azimuth,dip\nCT-DD-001,-5,90,-60\n');
  assert.equal(badDepth.surveys.length, 0);
  assert.match(badDepth.error, /No importable rows|No valid survey rows/);

  const missingCols = parseSurveyCsv('hole_id,depth\nCT-DD-001,50\n');
  assert.match(missingCols.error, /needs hole_id, depth, azimuth and dip/);
});

test('surveysToCsv: sorts by hole then depth and round-trips through parseSurveyCsv', () => {
  const surveys = [
    { holeId: 'CT-DD-002', depth: 20, azimuth: 88, dip: -55 },
    { holeId: 'CT-DD-001', depth: 100, azimuth: 91, dip: -59 },
    { holeId: 'CT-DD-001', depth: 50, azimuth: 90, dip: -60 },
  ];
  const csv = surveysToCsv(surveys);
  const lines = csv.split('\n');
  assert.equal(lines[0], 'hole_id,depth,azimuth,dip');
  // CT-DD-001 shots sorted by depth (50 before 100), then CT-DD-002.
  assert.equal(lines[1], 'CT-DD-001,50,90,-60');
  assert.equal(lines[2], 'CT-DD-001,100,91,-59');
  assert.equal(lines[3], 'CT-DD-002,20,88,-55');

  const reparsed = parseSurveyCsv(csv);
  assert.equal(reparsed.surveys.length, 3);
});

// ── Geological logging ───────────────────────────────────────────────────
// The assay-interval table only carries lab grades for a from-to; it was
// never a substitute for the geologist's own logging of what's in the
// core/chip tray — lithology, alteration, structure. Stored flat (like
// intervals and surveys), keyed by holeId.

test('migrateV6: every project gains an empty geology list, existing ones preserved', () => {
  const v6 = { version: 6, projects: [{ id: 'p1', samples: [], collars: [], intervals: [], surveys: [] }, { id: 'p2', samples: [], collars: [], intervals: [], surveys: [], geology: [{ holeId: 'H1', from: 10, to: 20, lithology: 'Granodiorite', alteration: '', structure: '', notes: '' }] }] };
  const v7 = migrateV6(v6);
  assert.equal(v7.version, 7);
  assert.deepEqual(v7.projects[0].geology, []);
  assert.equal(v7.projects[1].geology.length, 1); // pre-existing data untouched
});

test('createDemoStore: every project has a geology array (empty — no invented logging data)', () => {
  const store = createDemoStore();
  store.projects.forEach(p => assert.ok(Array.isArray(p.geology)));
});

test('migrateV7: every collar gains an empty notes string, existing ones preserved', () => {
  const v7 = {
    version: 7,
    projects: [
      { id: 'p1', samples: [], collars: [{ id: 'H1', lat: -20, lng: 146, azimuth: 90, dip: -60, depth: 100 }], intervals: [], surveys: [], geology: [] },
      { id: 'p2', samples: [], collars: [{ id: 'H2', lat: -20, lng: 146, notes: 'Rig moved off' }], intervals: [], surveys: [], geology: [] },
    ],
  };
  const v8 = migrateV7(v7);
  assert.equal(v8.version, 8);
  assert.equal(v8.projects[0].collars[0].notes, ''); // no note existed, not invented
  assert.equal(v8.projects[1].collars[0].notes, 'Rig moved off'); // pre-existing data untouched
});

test('createDemoStore: every collar has a notes string (possibly empty — no invented field notes)', () => {
  const store = createDemoStore();
  store.projects.forEach(p => p.collars.forEach(c => assert.equal(typeof c.notes, 'string')));
});

test('parseGeologyCsv: reads hole_id/from/to/lithology/alteration/structure/notes', () => {
  const csv = 'hole_id,from,to,lithology,alteration,structure,notes\nCT-DD-001,100,110,Quartz vein,Silicification,Sheared contact,Coarse sulphides\n';
  const r = parseGeologyCsv(csv);
  assert.equal(r.error, null);
  assert.equal(r.geology.length, 1);
  assert.deepEqual(r.geology[0], {
    holeId: 'CT-DD-001', from: 100, to: 110,
    lithology: 'Quartz vein', alteration: 'Silicification', structure: 'Sheared contact', notes: 'Coarse sulphides',
  });
});

test('parseGeologyCsv: free-text columns may be blank; only hole_id/from/to are required', () => {
  const csv = 'hole_id,from,to,lithology\nCT-DD-001,10,20,Siltstone\n';
  const r = parseGeologyCsv(csv);
  assert.equal(r.error, null);
  assert.equal(r.geology[0].lithology, 'Siltstone');
  assert.equal(r.geology[0].alteration, '');
  assert.equal(r.geology[0].structure, '');
});

test('parseGeologyCsv: an inverted from/to is rejected per row, a missing hole_id/from/to column set is a fatal error', () => {
  const badRange = parseGeologyCsv('hole_id,from,to,lithology\nCT-DD-001,50,40,Granite\n');
  assert.equal(badRange.geology.length, 0);
  assert.match(badRange.error, /No importable rows|No valid geology rows/);

  const missingCols = parseGeologyCsv('hole_id,lithology\nCT-DD-001,Granite\n');
  assert.match(missingCols.error, /needs hole_id, from and to/);
});

test('geologyToCsv: sorts by hole then from, escapes commas in free text, and round-trips through parseGeologyCsv', () => {
  const geology = [
    { holeId: 'CT-DD-002', from: 5, to: 15, lithology: 'Siltstone, minor sand', alteration: '', structure: '', notes: '' },
    { holeId: 'CT-DD-001', from: 100, to: 110, lithology: 'Quartz vein', alteration: 'Silicification', structure: '', notes: '' },
    { holeId: 'CT-DD-001', from: 50, to: 60, lithology: 'Granodiorite', alteration: '', structure: '', notes: '' },
  ];
  const csv = geologyToCsv(geology);
  const lines = csv.split('\n');
  assert.equal(lines[0], 'hole_id,from,to,lithology,alteration,structure,notes');
  // CT-DD-001 rows sorted by from (50 before 100), then CT-DD-002.
  assert.equal(lines[1], 'CT-DD-001,50,60,Granodiorite,,,');
  assert.equal(lines[2], 'CT-DD-001,100,110,Quartz vein,Silicification,,');
  assert.equal(lines[3], 'CT-DD-002,5,15,"Siltstone, minor sand",,,');

  const reparsed = parseGeologyCsv(csv);
  assert.equal(reparsed.geology.length, 3);
  assert.equal(reparsed.geology[2].lithology, 'Siltstone, minor sand');
});
