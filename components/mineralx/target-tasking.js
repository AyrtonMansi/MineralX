import {isControl} from './record-rules.js';
// Field-tasking helpers for the target worklist: turn a set of targets
// into a walkable waypoint sequence for a handheld GPS, and link samples
// to the target they were taken at. All pure and side-effect-free so the
// ordering and the auto-link rules can be unit-tested directly — the
// coordinate maths here decides where a geologist walks, so it earns tests.
// Explicit .js extension: this module is unit-tested under raw Node ESM,
// which (unlike the Next bundler) requires it to resolve the import.
import { evidenceSummary } from './project-store.js';

// Retained for proximity suggestions only, never evidence of sampling completion.
export const LINK_RADIUS_M = 100;

const R_EARTH_M = 6_371_000;
const toRad = (d) => (d * Math.PI) / 180;

// Great-circle distance in metres. Haversine (not equirectangular) so it
// stays correct anywhere, though at target spacing the difference is tiny.
export function metersBetween(aLat, aLng, bLat, bLng) {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Link only explicitly assigned primary field samples; proximity is not evidence.
// Then
// advance that target to 'sampled' if it was still earlier in the pipeline
// (never drags a confirmed/barren target backwards). Returns a new targets
// array only where something actually changed, so React can skip work.
export function autoLinkSamples(targets, newSamples) {
  if (!targets?.length || !newSamples?.length) return targets;
  const advanceable = new Set(['proposed', 'planned', 'visited']);
  let changed = false;
  const next = targets.map((t) => {
    const existing = new Set(t.linkedSampleIds || []);
    const hits = newSamples.filter(
      (s) => s.id && !isControl(s) && !s.archivedAt && s.lifecycle==='collected' && ((s.targetRecordId && s.targetRecordId===t.recordId) || (s.targetId && s.targetId===t.id)) && !existing.has(s.id),
    );
    if (!hits.length) return t;
    changed = true;
    return {
      ...t,
      linkedSampleIds: [...(t.linkedSampleIds || []), ...hits.map((s) => s.id)],
      status: advanceable.has(t.status) ? 'sampled' : t.status,
    };
  });
  return changed ? next : targets;
}

// Order targets into a field-walkable sequence: cluster nearby targets
// (single-linkage under `clusterM`), visit the most promising cluster
// first (by its best score), and within a cluster take a greedy
// nearest-neighbour path from its highest-scoring target. Not a true TSP
// optimiser — deliberately: a two-person crew needs a sensible order, not
// a solver, and this keeps each cluster's walk short while front-loading
// the best ground.
export function orderTargetsForField(targets, clusterM = 600) {
  const pts = [...targets];
  if (pts.length <= 1) return pts;

  // Single-linkage clustering by proximity.
  const clusters = [];
  const assigned = new Set();
  for (let i = 0; i < pts.length; i++) {
    if (assigned.has(i)) continue;
    const cluster = [i];
    assigned.add(i);
    for (let k = 0; k < cluster.length; k++) {
      const a = pts[cluster[k]];
      for (let j = 0; j < pts.length; j++) {
        if (assigned.has(j)) continue;
        if (metersBetween(a.lat, a.lng, pts[j].lat, pts[j].lng) <= clusterM) {
          cluster.push(j);
          assigned.add(j);
        }
      }
    }
    clusters.push(cluster.map((idx) => pts[idx]));
  }

  const scoreOf = (t) => t.score ?? 0;
  const bestScore = (c) => c.reduce((m, t) => Math.max(m, scoreOf(t)), -Infinity);
  clusters.sort((a, b) => bestScore(b) - bestScore(a));

  const ordered = [];
  clusters.forEach((cluster) => {
    const remaining = [...cluster].sort((a, b) => scoreOf(b) - scoreOf(a));
    let current = remaining.shift(); // start from the best target in the cluster
    ordered.push(current);
    while (remaining.length) {
      let nearest = 0;
      let nearestD = Infinity;
      remaining.forEach((t, idx) => {
        const d = metersBetween(current.lat, current.lng, t.lat, t.lng);
        if (d < nearestD) { nearestD = d; nearest = idx; }
      });
      current = remaining.splice(nearest, 1)[0];
      ordered.push(current);
    }
  });
  return ordered;
}

const xmlEsc = (t) => String(t ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

// GPX 1.1 waypoints — the format every handheld GPS (Garmin, etc.) and
// field-mapping app imports. One <wpt> per target, in field-walk order.
export function targetsToGpx(orderedTargets, programName = 'MineralX targets') {
  const wpts = orderedTargets.map((t, i) => `  <wpt lat="${t.lat}" lon="${t.lng}">
    <name>${xmlEsc(t.id)}</name>
    <desc>${xmlEsc(`#${i + 1} · ${t.status} · score ${Number(t.score ?? 0).toFixed(1)} · ${evidenceSummary(t)}`)}</desc>
    <sym>Flag, Red</sym>
  </wpt>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="MineralX" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${xmlEsc(programName)}</name></metadata>
${wpts}
</gpx>`;
}

// A plain waypoint CSV alongside the GPX, for units/apps that prefer it.
export function targetsToWaypointCsv(orderedTargets) {
  const header = 'order,target_id,lat,lng,status,score,evidence';
  const rows = orderedTargets.map((t, i) =>
    [i + 1, t.id, t.lat, t.lng, t.status, Number(t.score ?? 0).toFixed(1), `"${evidenceSummary(t).replace(/"/g, "'")}"`].join(','),
  );
  return [header, ...rows].join('\n');
}
