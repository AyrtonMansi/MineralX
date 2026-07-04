// Proxies a bbox query to public historic-mines ArcGIS REST services.
// Same rationale as app/api/mineral-occurrences/route.js: WMS <img>
// tiles don't need CORS but vector `query` endpoints often do, so this
// isolates the fetch server-side. Also the one place holding the exact
// unverified upstream URL/layer index (outbound to *.qld.gov.au is
// blocked from the dev sandbox that built this).
//
// Response shape: { source, features: [{ id, lat, lng, name, mineType }] }
// or { error } with a non-200 status on total failure.

const CANDIDATES = [
  {
    // QLD GeoResGlobe — abandoned mines / historic workings layer.
    // Naming mirrors the sibling services in layer-data.js and the
    // mineral-occurrences route. Layer index 0 is a guess.
    source: 'qld-geores',
    url: (bbox) =>
      `https://gisservices.information.qld.gov.au/arcgis/rest/services/GeoscientificInformation/AbandonedMines/MapServer/0/query` +
      `?f=geojson&outFields=*&returnGeometry=true&geometryType=esriGeometryEnvelope&inSR=4326&outSR=4326&spatialRel=esriSpatialRelIntersects` +
      `&geometry=${encodeURIComponent(bbox)}`,
  },
  {
    // Geoscience Australia national historic mines dataset — broader
    // coverage fallback if the QLD-specific service above doesn't
    // resolve or isn't the right path/layer.
    source: 'ga-national',
    url: (bbox) =>
      `https://services.ga.gov.au/gis/rest/services/HistoricMines/MapServer/0/query` +
      `?f=geojson&outFields=*&returnGeometry=true&geometryType=esriGeometryEnvelope&inSR=4326&outSR=4326&spatialRel=esriSpatialRelIntersects` +
      `&geometry=${encodeURIComponent(bbox)}`,
  },
];

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
