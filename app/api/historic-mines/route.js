// Proxies a bbox query to public historic-mines ArcGIS REST services.
// Same rationale as app/api/mineral-occurrences/route.js: WMS <img>
// tiles don't need CORS but vector `query` endpoints often do, so this
// isolates the fetch server-side. The candidate URLs/layer index live in
// lib/geores-sources.js, and the mine-type-detection/feature-
// normalization logic lives in lib/geores-normalize.js (neither here —
// Next's route-export type checker rejects any export from a route.js
// beyond its recognized fields, and both need to be importable for unit
// tests). The URLs/indices could not be verified from the dev sandbox
// that built this (outbound blocked to *.qld.gov.au); run
// `npm run verify:endpoints` from an environment with real internet
// access to check them.
//
// Response shape: { source, features: [{ id, lat, lng, name, mineType }] }
// or { error } with a non-200 status on total failure.

import { HISTORIC_MINE_CANDIDATES as CANDIDATES } from '@/lib/geores-sources';
import { normalizeHistoricMineFeature as normalizeFeature } from '@/lib/geores-normalize';

const MAX_FEATURES = 500;

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
