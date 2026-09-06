// Pure feature-normalization logic shared by app/api/mineral-occurrences
// and app/api/historic-mines — lives outside app/api for the same reason
// geores-sources.js does: Next.js's route-export type checker rejects any
// export from a route.js that isn't one of its recognized fields (GET,
// POST, runtime, etc.), so these functions can't be exported from the
// route files themselves and therefore can't be unit-tested from there.
// scripts/verify-endpoints.mjs doesn't touch this file — it only checks
// that the candidate URLs/layer indices in geores-sources.js are live;
// this file is about making sense of whatever those services return.

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

function classifyCommodity(raw) {
  const s = ` ${raw.toLowerCase()} `;
  for (const [label, tokens] of COMMODITY_TOKENS) {
    if (tokens.some(t => s.includes(t))) return label;
  }
  return 'Unknown';
}

// Flexible field detection, same spirit as detectElementColumns() in
// project-store.js: the upstream ArcGIS schema's exact field name is
// unknown, so scan candidates case-insensitively rather than hardcode
// one — see CLAUDE.md's "Data-source integrity" section.
export function detectCommodity(properties) {
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

const TYPE_FIELD_CANDIDATES = [
  'minetype', 'mine_type', 'feature_type', 'featuretype', 'type', 'category', 'status',
];

// Same flexible-field-detection spirit as detectCommodity() above — no
// token classification here, the raw field value is descriptive enough
// on its own (e.g. "Abandoned shaft", "Open cut") to show directly.
export function detectMineType(properties) {
  const entries = Object.entries(properties || {});
  for (const candidate of TYPE_FIELD_CANDIDATES) {
    const hit = entries.find(([k]) => k.toLowerCase().replace(/[^a-z0-9]/g, '') === candidate.replace(/[^a-z0-9]/g, ''));
    if (hit && hit[1]) return String(hit[1]).trim() || 'Historic mine';
  }
  return 'Historic mine';
}

// A malformed or non-point upstream feature (wrong geometry type, missing
// coordinates, non-numeric lat/lng) is dropped, not passed through — a
// bad value here would otherwise crash MapLibre's marker placement.
function normalizeFeature(feature, i, { nameFallbackPrefix, nameFields, extra }) {
  const geom = feature.geometry;
  if (!geom || geom.type !== 'Point' || !Array.isArray(geom.coordinates)) return null;
  const [lng, lat] = geom.coordinates;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  const props = feature.properties || {};
  let name;
  for (const f of nameFields) { if (props[f]) { name = props[f]; break; } }
  if (name == null) name = `${nameFallbackPrefix} ${i + 1}`;
  return { id: props.OBJECTID ?? props.objectid ?? `f${i}`, lat, lng, name: String(name), ...extra(props) };
}

export function normalizeOccurrenceFeature(feature, i) {
  return normalizeFeature(feature, i, {
    nameFallbackPrefix: 'Occurrence',
    nameFields: ['NAME', 'name', 'SITE_NAME', 'site_name', 'DEPOSIT_NAME'],
    extra: (props) => ({ commodity: detectCommodity(props) }),
  });
}

export function normalizeHistoricMineFeature(feature, i) {
  return normalizeFeature(feature, i, {
    nameFallbackPrefix: 'Historic mine',
    nameFields: ['NAME', 'name', 'SITE_NAME', 'site_name', 'MINE_NAME'],
    extra: (props) => ({ mineType: detectMineType(props) }),
  });
}
