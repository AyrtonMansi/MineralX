// Unit tests for the pure D8 hydrology core in terrain-flow.js —
// computeFlow (flow direction/accumulation/seed propagation) and
// findTargets (trap-target detection + sample/occurrence score boost).
// This is the model that decides where a geologist walks with a
// detector; the module's own header comment already calls it out as
// "pure — unit-testable without a browser," but until this file existed
// nothing tested it at all. renderDrainageOverlay/renderConcentrationHeatmap
// and the fetch*/DOM-touching functions are excluded — they need a canvas
// or network and are exercised by e2e instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeFlow, findTargets } from '../components/mineralx/terrain-flow.js';

// A synthetic ramp: elevation strictly decreases left-to-right and is
// identical on every row, so there is exactly one predictable flow line
// per row (no cross-row merging to reason about) — the same trick
// e2e/helpers.js uses for its terrarium tile mock ("a synthetic ridge so
// D8 flow routing has real relief"), just expressed directly as an
// elevation array instead of an encoded PNG.
function rampGrid(profile, h) {
  const w = profile.length;
  const elev = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) elev[y * w + x] = profile[x];
  }
  return { elev, w, h };
}

test('computeFlow: on a strict left-to-right downhill ramp, every cell flows one step right', () => {
  const { elev, w, h } = rampGrid([100, 90, 80, 70, 60], 3);
  const { down } = computeFlow(elev, w, h, 1, null, null);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w - 1; x++) {
      assert.equal(down[y * w + x], y * w + x + 1, `(${x},${y}) should flow to its right neighbor`);
    }
    // The last column has no lower neighbor (every column is uniform
    // down its own row) — it's the outlet, not flowing anywhere.
    assert.equal(down[y * w + (w - 1)], -1);
  }
});

test('computeFlow: accumulation grows by exactly 1 per upstream cell along a single flow line', () => {
  const { elev, w, h } = rampGrid([100, 90, 80, 70, 60], 3);
  const { accum } = computeFlow(elev, w, h, 1, null, null);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      assert.equal(accum[y * w + x], x + 1, `accum at (${x},${y})`);
    }
  }
});

test('computeFlow: a seed propagates downstream along its own flow line, never sideways into another row', () => {
  const { elev, w, h } = rampGrid([100, 90, 80, 70, 60], 3);
  // Seed row 1 only, at the top of the ramp.
  const seedIdx = 1 * w + 0;
  const { sampleSeed, occurrenceSeed } = computeFlow(elev, w, h, 1, [seedIdx], [4 /* row 0, x=4 */]);
  for (let x = 0; x < w; x++) {
    assert.equal(sampleSeed[1 * w + x], 1, `row 1, x=${x} should be sample-seeded`);
    assert.equal(sampleSeed[0 * w + x], 0, `row 0, x=${x} must not pick up row 1's seed`);
    assert.equal(sampleSeed[2 * w + x], 0, `row 2, x=${x} must not pick up row 1's seed`);
  }
  // The occurrence seed was planted directly at the outlet (row 0, x=4)
  // with nothing upstream of it, so it marks only itself.
  assert.equal(occurrenceSeed[0 * w + 4], 1);
  assert.equal(occurrenceSeed[0 * w + 3], 0);
});

test('computeFlow: upSlope remembers the steepest slope seen anywhere upstream, even after the terrain flattens', () => {
  // Steep for the first four steps (drop 20/cell), then near-flat
  // (drop 1/cell) for the rest — a river reaching a floodplain.
  const { elev, w, h } = rampGrid([100, 80, 60, 40, 20, 15, 12, 10, 9, 8], 3);
  const { slope, upSlope } = computeFlow(elev, w, h, 1, null, null);
  // Each cell's own outgoing slope matches its local drop.
  assert.equal(slope[1 * w + 0], 20);
  assert.equal(slope[1 * w + 7], 1);
  // But upSlope at the flat tail still shows the steep run upstream —
  // this is exactly what lets findTargets recognise "flat now, steep
  // before" as a trap, not just "flat."
  assert.equal(upSlope[1 * w + 7], 20);
  assert.equal(upSlope[1 * w + 8], 20);
});

test('findTargets: flags a flat cell downstream of a steep run as a trap target, not a merely-flat one upstream', () => {
  const { elev, w, h } = rampGrid([100, 80, 60, 40, 20, 15, 12, 10, 9, 8], 3);
  const flow = computeFlow(elev, w, h, 1, null, null);
  const targets = findTargets(flow, w, h, {
    streamThresh: 5, flatMax: 1.5, steepMin: 15, window: 1, maxTargets: 10,
  });
  const xs = targets.map(t => t.x);
  // x=7 and x=8 are flat (slope 1) with a steep upstream run (upSlope
  // 20) and enough accumulation (8, 9) — both should surface.
  assert.ok(xs.includes(7), `expected x=7 among targets, got ${xs}`);
  assert.ok(xs.includes(8), `expected x=8 among targets, got ${xs}`);
  // x=1..3 are steep themselves (slope 20 > flatMax) — never targets,
  // no matter how much upstream accumulation they carry.
  assert.ok(!xs.includes(1) && !xs.includes(2) && !xs.includes(3));
});

test('findTargets: a target seeded by both a sample and an occurrence scores higher than one seeded by neither', () => {
  // h=4 so both row 1 (seeded) and row 2 (control) are interior rows —
  // findTargets only scans y from 1 to h-2, so the h=3 grid the other
  // tests use would silently skip row 2 entirely.
  const { elev, w, h } = rampGrid([100, 80, 60, 40, 20, 15, 12, 10, 9, 8], 4);
  // Seed the row-1 flow line at its source so every downstream cell in
  // that row (including the x=7/x=8 targets) inherits both seeds; leave
  // row 2's identical ramp unseeded as the control.
  const flow = computeFlow(elev, w, h, 1, [1 * w + 0], [1 * w + 0]);
  const targets = findTargets(flow, w, h, {
    streamThresh: 5, flatMax: 1.5, steepMin: 15, window: 1, maxTargets: 10,
  });
  const seeded = targets.find(t => t.x === 7 && t.y === 1);
  const unseeded = targets.find(t => t.x === 7 && t.y === 2);
  assert.ok(seeded && unseeded, 'expected a target at x=7 on both the seeded and control row');
  assert.equal(seeded.sample, true);
  assert.equal(seeded.occurrence, true);
  assert.equal(unseeded.sample, false);
  assert.equal(unseeded.occurrence, false);
  // Same geometry, same accumulation/slope on both rows — the only
  // difference is seeding, so the boost (2.5x for both vs 1x for
  // neither) must be the entire reason the seeded one scores higher.
  assert.ok(seeded.score > unseeded.score, `seeded ${seeded.score} should exceed unseeded ${unseeded.score}`);
});
