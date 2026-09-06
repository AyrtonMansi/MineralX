// Pure post-processing for app/api/extract's structured-output response —
// lives outside app/api for the same reason lib/geores-normalize.js and
// lib/geores-sources.js do: Next's route-export type checker rejects any
// export from a route.js beyond its recognized fields, so this couldn't
// be unit-tested from inside the route file. Worth the extraction more
// than most: this is where CLAUDE.md hard rule 1 (never silently
// reproject — a row with projected-magnitude coordinates goes to
// `skipped[]`, not auto-converted) and hard rule 9 (a below-detection
// result is real data, never dropped) actually get enforced for the AI
// extraction ingestion path specifically.

export const MAX_FEATURES = 500;

export const isProjected = (lat, lng) => Math.abs(lat) > 90 || Math.abs(lng) > 180;
export const inRange = (lat, lng) =>
  typeof lat === 'number' && typeof lng === 'number' &&
  !Number.isNaN(lat) && !Number.isNaN(lng) &&
  lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

// Mirrors the client-side readAssays()/parseAssayCell() contract in
// project-store.js: a below-detection result becomes a detectionLimits
// entry, never a dropped element.
export function assaysToMaps(pairs) {
  const assays = {};
  const detectionLimits = {};
  (pairs || []).forEach(({ element, value, detectionLimit }) => {
    if (!element) return;
    const el = element.trim();
    if (typeof value === 'number' && !Number.isNaN(value) && value >= 0) {
      assays[el] = value;
    } else if (typeof detectionLimit === 'number' && !Number.isNaN(detectionLimit) && detectionLimit >= 0) {
      detectionLimits[el] = detectionLimit;
    }
  });
  return { assays, detectionLimits };
}

// Applies the same coordinate-safety contract as the CSV parsers: rows
// with projected-magnitude coordinates are separated out with an
// explanation instead of being imported (or worse, guessed at).
export function normalise(raw) {
  const skipped = [];

  const samples = [];
  (raw.samples || []).slice(0, MAX_FEATURES).forEach((s, i) => {
    if (isProjected(s.lat, s.lng)) {
      skipped.push({ kind: 'sample', id: s.id || `#${i + 1}`, reason: 'projected easting/northing — import via CSV so the MGA zone can be confirmed' });
      return;
    }
    if (!inRange(s.lat, s.lng)) {
      skipped.push({ kind: 'sample', id: s.id || `#${i + 1}`, reason: 'invalid coordinates' });
      return;
    }
    const { assays, detectionLimits } = assaysToMaps(s.assays);
    samples.push({
      id: (s.id || '').trim(), lat: s.lat, lng: s.lng, assays,
      ...(Object.keys(detectionLimits).length ? { detectionLimits } : {}),
      lith: s.lith || '', notes: s.notes || '',
    });
  });

  const collars = [];
  (raw.collars || []).slice(0, MAX_FEATURES).forEach((c, i) => {
    if (isProjected(c.lat, c.lng)) {
      skipped.push({ kind: 'collar', id: c.id || `#${i + 1}`, reason: 'projected easting/northing — import via CSV so the MGA zone can be confirmed' });
      return;
    }
    if (!inRange(c.lat, c.lng)) {
      skipped.push({ kind: 'collar', id: c.id || `#${i + 1}`, reason: 'invalid coordinates' });
      return;
    }
    collars.push({ id: (c.id || '').trim(), lat: c.lat, lng: c.lng, azimuth: c.azimuth ?? null, dip: c.dip ?? null, depth: c.depth ?? null });
  });

  const intervals = [];
  (raw.intervals || []).slice(0, MAX_FEATURES).forEach((iv, i) => {
    if (!iv.holeId || typeof iv.from !== 'number' || typeof iv.to !== 'number' || iv.from > iv.to) {
      skipped.push({ kind: 'interval', id: iv.holeId || `#${i + 1}`, reason: 'invalid interval' });
      return;
    }
    const { assays, detectionLimits } = assaysToMaps(iv.assays);
    intervals.push({
      holeId: iv.holeId.trim(), from: iv.from, to: iv.to, assays,
      ...(Object.keys(detectionLimits).length ? { detectionLimits } : {}),
    });
  });

  let boundary = null;
  if (raw.boundary) {
    // A boundary the model found fewer than 3 raw vertices for is exactly
    // as unusable as one that has 3+ but fails the coordinate filter —
    // both need a `skipped` entry, or ExtractPanel (which lists every
    // skip reason to the user) shows nothing at all for an attempted
    // boundary extraction that silently produced no polygon.
    const coords = (raw.boundary.coords || []).filter(pt => Array.isArray(pt) && pt.length >= 2 && inRange(pt[0], pt[1]));
    if (coords.length >= 3) boundary = { name: raw.boundary.name || 'Extracted boundary', coords: coords.map(pt => [pt[0], pt[1]]) };
    else skipped.push({ kind: 'boundary', id: raw.boundary.name || 'boundary', reason: 'fewer than 3 usable decimal-degree vertices' });
  }

  const confidence = typeof raw.confidence === 'number' ? Math.min(1, Math.max(0, raw.confidence)) : 0;
  const sourceHighlights = (raw.sourceHighlights || []).slice(0, 20);

  return { extracted: { samples, collars, intervals, boundary, confidence, sourceHighlights }, skipped };
}
