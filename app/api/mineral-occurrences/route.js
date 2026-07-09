// Proxies a bbox query to public mineral-occurrence ArcGIS REST services
// so the browser never has to deal with ArcGIS's inconsistent CORS
// support (WMS <img> tiles don't need CORS; vector `query` endpoints
// often do, and frequently don't send the header). The candidate
// URLs/layer indices live in lib/geores-sources.js (not here — Next's
// route-export type checker rejects any export from a route.js beyond
// its recognized fields) and could not be verified from the dev sandbox
// that built this (outbound blocked to *.qld.gov.au); run
// `npm run verify:endpoints` from an environment with real internet
// access to check them.
//
// Response shape: { source, features: [{ id, lat, lng, name, commodity }] }
// or { error } with a non-200 status on total failure.

import { MINERAL_OCCURRENCE_CANDIDATES as CANDIDATES } from '@/lib/geores-sources';

const MAX_FEATURES = 500;

const COMMODITY_FIELD_CANDIDATES = [
  'commodity', 'commod', 'commod1', 'main_commodity', 'maincommodity',
  'mineral', 'minerals', 'resource', 'commodities', 'target_commodity',
];

const COMMODITY_TOKENS = [
  ['Gold', ['gold', ' au ', '(au)', 'au,', 'au-']],
  ['Copper', ['copper', ' cu ', '(cu)']],
  ['Silver', ['silver', ' ag ', '(ag)']],
  ['Tin', ['tin', ' sn ', '(sn)']],
  ['Tungsten', ['tungsten', ' w ', '(w)']],
  ['Zinc', ['zinc', ' zn ', '(zn)']],
  ['Lead', ['lead', ' pb ', '(pb)']],
  ['Nickel', ['nickel', ' ni ', '(ni)']],
  ['Cobalt', ['cobalt', ' co ', '(co)']],
  ['Rare earths', ['rare earth', 'ree']],
];

// Flexible field detection, same spirit as detectElementColumns() in
// project-store.js: the upstream schema's exact field name is unknown,
// so scan candidates case-insensitively rather than hardcode one.
function detectCommodity(properties) {
  const entries = Object.entries(properties || {});
  for (const candidate of COMMODITY_FIELD_CANDIDATES) {
    const hit = entries.find(([k]) => k.toLowerCase().replace(/[^a-z0-9]/g, '') === candidate.replace(/[^a-z0-9]/g, ''));
    if (hit && hit[1]) return classifyCommodity(String(hit[1]));
  }
  // Fallback: scan every string value for a recognisable commodity token.
  for (const [, v] of entries) {
    if (typeof v !== 'string') continue;
    const guess = classifyCommodity(v);
    if (guess !== 'Unknown') return guess;
  }
  return 'Unknown';
}

function classifyCommodity(raw) {
  const s = ` ${raw.toLowerCase()} `;
  for (const [label, tokens] of COMMODITY_TOKENS) {
    if (tokens.some(t => s.includes(t))) return label;
  }
  return 'Unknown';
}

function normalizeFeature(feature, i) {
  const geom = feature.geometry;
  if (!geom || geom.type !== 'Point' || !Array.isArray(geom.coordinates)) return null;
  const [lng, lat] = geom.coordinates;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  const props = feature.properties || {};
  const name = props.NAME || props.name || props.SITE_NAME || props.site_name || props.DEPOSIT_NAME || `Occurrence ${i + 1}`;
  return { id: props.OBJECTID ?? props.objectid ?? `f${i}`, lat, lng, name: String(name), commodity: detectCommodity(props) };
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
    { error: 'Mineral occurrence services unavailable for this view.' },
    { status: 502 }
  );
}
