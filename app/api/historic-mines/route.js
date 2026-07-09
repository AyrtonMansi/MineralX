// Proxies a bbox query to public historic-mines ArcGIS REST services.
// Same rationale as app/api/mineral-occurrences/route.js: WMS <img>
// tiles don't need CORS but vector `query` endpoints often do, so this
// isolates the fetch server-side. The candidate URLs/layer index live in
// lib/geores-sources.js (not here — Next's route-export type checker
// rejects any export from a route.js beyond its recognized fields) and
// could not be verified from the dev sandbox that built this (outbound
// blocked to *.qld.gov.au); run `npm run verify:endpoints` from an
// environment with real internet access to check them.
//
// Response shape: { source, features: [{ id, lat, lng, name, mineType }] }
// or { error } with a non-200 status on total failure.

import { HISTORIC_MINE_CANDIDATES as CANDIDATES } from '@/lib/geores-sources';

const MAX_FEATURES = 500;

const TYPE_FIELD_CANDIDATES = [
  'minetype', 'mine_type', 'feature_type', 'featuretype', 'type', 'category', 'status',
];

// Flexible field detection, same spirit as detectCommodity() in the
// mineral-occurrences route and detectElementColumns() in
// project-store.js: the upstream schema's exact field name is unknown.
function detectMineType(properties) {
  const entries = Object.entries(properties || {});
  for (const candidate of TYPE_FIELD_CANDIDATES) {
    const hit = entries.find(([k]) => k.toLowerCase().replace(/[^a-z0-9]/g, '') === candidate.replace(/[^a-z0-9]/g, ''));
    if (hit && hit[1]) return String(hit[1]).trim() || 'Historic mine';
  }
  return 'Historic mine';
}

function normalizeFeature(feature, i) {
  const geom = feature.geometry;
  if (!geom || geom.type !== 'Point' || !Array.isArray(geom.coordinates)) return null;
  const [lng, lat] = geom.coordinates;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  const props = feature.properties || {};
  const name = props.NAME || props.name || props.SITE_NAME || props.site_name || props.MINE_NAME || `Historic mine ${i + 1}`;
  return { id: props.OBJECTID ?? props.objectid ?? `f${i}`, lat, lng, name: String(name), mineType: detectMineType(props) };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const w = searchParams.get('w'), s = searchParams.get('s'), e = searchParams.get('e'), n = searchParams.get('n');
  if (!w || !s || !e || !n) {
    return Response.json({ error: 'bbox required: w,s,e,n' }, { status: 400 });
  }
  const bbox = `${w},${s},${e},${n}`;

  for (const candidate of CANDIDATES) {
    try {
      const res = await fetch(candidate.url(bbox), {
        headers: { Accept: 'application/json' },
        next: { revalidate: 300 },
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data.features)) continue;
      const features = data.features
        .slice(0, MAX_FEATURES)
        .map(normalizeFeature)
        .filter(Boolean);
      return Response.json({ source: candidate.source, features });
    } catch {
      continue; // try the next candidate
    }
  }

  return Response.json(
    { error: 'Historic mines service unavailable for this view.' },
    { status: 502 }
  );
}
