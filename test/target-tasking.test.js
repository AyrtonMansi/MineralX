// Unit tests for the field-tasking helpers: distance, sample↔target
// auto-linking, field-walk ordering, and waypoint export. These decide
// which target a sample counts as, and the order a crew walks the ground.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  metersBetween,
  autoLinkSamples,
  orderTargetsForField,
  targetsToGpx,
  targetsToWaypointCsv,
  LINK_RADIUS_M,
} from '../components/mineralx/target-tasking.js';

test('metersBetween: ~111m per 0.001° of latitude near the equator/QLD', () => {
  const d = metersBetween(-20.0, 146.0, -20.001, 146.0);
  assert.ok(d > 108 && d < 113, `expected ~111 m, got ${d}`);
});

test('autoLinkSamples: a sample within range links and advances the target to sampled', () => {
  const targets = [{ id: 'T1', lat: -20.0, lng: 146.0, status: 'proposed', linkedSampleIds: [] }];
  // ~55 m north — inside the 100 m link radius.
  const samples = [{ id: 'S1', lat: -20.0005, lng: 146.0 }];
  const out = autoLinkSamples(targets, samples);
  assert.deepEqual(out[0].linkedSampleIds, ['S1']);
  assert.equal(out[0].status, 'sampled');
});

test('autoLinkSamples: a sample beyond range does not link, array identity preserved', () => {
  const targets = [{ id: 'T1', lat: -20.0, lng: 146.0, status: 'proposed', linkedSampleIds: [] }];
  const samples = [{ id: 'S9', lat: -20.01, lng: 146.0 }]; // ~1.1 km away
  const out = autoLinkSamples(targets, samples);
  assert.equal(out, targets); // unchanged reference → no needless re-render
});

test('autoLinkSamples: never drags a confirmed/barren target backwards', () => {
  const targets = [{ id: 'T1', lat: -20.0, lng: 146.0, status: 'confirmed', linkedSampleIds: [] }];
  const samples = [{ id: 'S1', lat: -20.0004, lng: 146.0 }];
  const out = autoLinkSamples(targets, samples);
  assert.deepEqual(out[0].linkedSampleIds, ['S1']); // still records the sample
  assert.equal(out[0].status, 'confirmed'); // but keeps the assessment
});

test('autoLinkSamples: does not double-link a sample already linked', () => {
  const targets = [{ id: 'T1', lat: -20.0, lng: 146.0, status: 'sampled', linkedSampleIds: ['S1'] }];
  const samples = [{ id: 'S1', lat: -20.0004, lng: 146.0 }];
  const out = autoLinkSamples(targets, samples);
  assert.equal(out, targets); // no change
});

test('LINK_RADIUS_M boundary: just inside links, just outside does not', () => {
  const base = [{ id: 'T', lat: -20.0, lng: 146.0, status: 'proposed', linkedSampleIds: [] }];
  const inside = metersBetween(-20.0, 146.0, -20.0008, 146.0); // ~89 m
  const outside = metersBetween(-20.0, 146.0, -20.0012, 146.0); // ~133 m
  assert.ok(inside < LINK_RADIUS_M && outside > LINK_RADIUS_M);
  assert.equal(autoLinkSamples(base, [{ id: 'A', lat: -20.0008, lng: 146.0 }])[0].linkedSampleIds.length, 1);
  // Just outside the radius: nothing links, and the original array is
  // returned by reference (no change).
  assert.equal(autoLinkSamples(base, [{ id: 'B', lat: -20.0012, lng: 146.0 }]), base);
});

test('orderTargetsForField: best cluster first, nearest-neighbour within a cluster', () => {
  // Two tight clusters far apart. Cluster A has the top score.
  const targets = [
    { id: 'A1', lat: -20.000, lng: 146.000, score: 9 },
    { id: 'A2', lat: -20.001, lng: 146.000, score: 3 },
    { id: 'A3', lat: -20.002, lng: 146.000, score: 5 },
    { id: 'B1', lat: -20.500, lng: 146.500, score: 8 },
    { id: 'B2', lat: -20.501, lng: 146.500, score: 2 },
  ];
  const order = orderTargetsForField(targets, 600).map(t => t.id);
  // Cluster A (best score 9) comes before cluster B (best 8).
  assert.ok(order.indexOf('A1') < order.indexOf('B1'));
  // Within A, start at the highest score (A1) then walk to the nearest
  // (A2 at 0.001° over A3 at 0.002°).
  assert.deepEqual(order.slice(0, 3), ['A1', 'A2', 'A3']);
  // All five targets are present exactly once.
  assert.equal(new Set(order).size, 5);
});

test('orderTargetsForField: trivial inputs pass through', () => {
  assert.deepEqual(orderTargetsForField([]), []);
  assert.deepEqual(orderTargetsForField([{ id: 'X', lat: 0, lng: 0, score: 1 }]).map(t => t.id), ['X']);
});

test('targetsToGpx: valid GPX with one wpt per target, in order, XML-escaped', () => {
  const gpx = targetsToGpx([
    { id: 'CT-TG-0001', lat: -20.07, lng: 146.26, status: 'planned', score: 4.2, provenance: { sample: true, occurrence: true, element: 'Au' } },
  ]);
  assert.match(gpx, /<gpx[^>]*version="1.1"/);
  assert.match(gpx, /<wpt lat="-20.07" lon="146.26">/);
  assert.match(gpx, /<name>CT-TG-0001<\/name>/);
  assert.match(gpx, /occurrence and your anomalous sample/);
});

test('targetsToWaypointCsv: ordered rows with a header', () => {
  const csv = targetsToWaypointCsv([
    { id: 'T1', lat: -20.07, lng: 146.26, status: 'proposed', score: 5, provenance: {} },
    { id: 'T2', lat: -20.08, lng: 146.27, status: 'visited', score: 3, provenance: {} },
  ]);
  const lines = csv.split('\n');
  assert.equal(lines[0], 'order,target_id,lat,lng,status,score,evidence');
  assert.match(lines[1], /^1,T1,-20.07,146.26,proposed,5.0,/);
  assert.match(lines[2], /^2,T2,/);
});
