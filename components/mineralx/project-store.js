// ── MineralX project store ─────────────────────────────────────────────
// Single source of truth for all user data. Persisted to localStorage
// now; the API surface (load/save/mutators below) is the seam where a
// real backend slots in later without touching any component.

import proj4 from 'proj4';

// GDA2020 MGA zones covering Queensland (54/55/56). Definitions per the
// standard EPSG registry; used only after a human confirms the zone —
// see isProjectedCoord()/reprojectEastingNorthing() below.
proj4.defs('EPSG:28354', '+proj=utm +zone=54 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
proj4.defs('EPSG:28355', '+proj=utm +zone=55 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
proj4.defs('EPSG:28356', '+proj=utm +zone=56 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
const MGA_ZONE_EPSG = { 54: 'EPSG:28354', 55: 'EPSG:28355', 56: 'EPSG:28356' };

// A decimal-degree lat is always -90..90, lng -180..180 — an MGA/UTM
// easting (~100,000-900,000) or northing (~1,000,000-10,000,000) is off
// by orders of magnitude, so this cheap magnitude check reliably catches
// projected coordinates without guessing from column names.
export function isProjectedCoord(lat, lng) {
  return Math.abs(lat) > 90 || Math.abs(lng) > 180;
}

// Converts a GDA2020 MGA easting/northing to WGS84 lon/lat. Only ever
// called after a human has confirmed the zone — never guessed silently.
export function reprojectEastingNorthing(easting, northing, zone) {
  const epsg = MGA_ZONE_EPSG[zone];
  if (!epsg) throw new Error(`Unsupported MGA zone: ${zone}`);
  const [lng, lat] = proj4(epsg, 'WGS84', [easting, northing]);
  return { lat, lng };
}

export const STORE_KEY = 'mx-store-v3';
const LEGACY_KEY = 'mx-store-v2';

export const PROJECT_COLORS = ['#C15F3C', '#6E7A5E', '#5E6E7A', '#B08A3E', '#8A5E7A'];

// ── Elements ───────────────────────────────────────────────────────────
// Samples carry an `assays` map, e.g. { Au: 4.2, Ag: 12 }. Thresholds
// drive marker colouring per element (anomalous / high). Elements not
// listed here still work — they get the generic fallback thresholds.
export const ELEMENTS = {
  Au: { unit: 'g/t', anom: 0.5, high: 3 },
  Ag: { unit: 'g/t', anom: 10, high: 50 },
  Cu: { unit: '%', anom: 0.1, high: 1 },
  Pb: { unit: '%', anom: 0.5, high: 2 },
  Zn: { unit: '%', anom: 0.5, high: 2 },
  Ni: { unit: '%', anom: 0.2, high: 1 },
  Co: { unit: '%', anom: 0.05, high: 0.2 },
  Li: { unit: '%', anom: 0.3, high: 1 },
  Sn: { unit: '%', anom: 0.1, high: 0.5 },
  W: { unit: '%', anom: 0.1, high: 0.5 },
  Mo: { unit: 'ppm', anom: 100, high: 500 },
  U: { unit: 'ppm', anom: 100, high: 500 },
  As: { unit: 'ppm', anom: 100, high: 1000 },
  Sb: { unit: 'ppm', anom: 50, high: 500 },
};

export const ELEMENT_SYMBOLS = Object.keys(ELEMENTS);
const GENERIC_THRESHOLDS = { unit: '', anom: 0.5, high: 3 };

export function elementInfo(el) {
  return ELEMENTS[el] || GENERIC_THRESHOLDS;
}

// Grade of a sample for one element. 'pending' = no assays at all.
export function gradeOf(sample, element) {
  const assays = sample?.assays;
  if (!assays || Object.keys(assays).length === 0) return 'pending';
  const v = assays[element];
  if (v == null || Number.isNaN(v)) return 'none'; // assayed, but not for this element
  const t = elementInfo(element);
  if (v >= t.high) return 'high';
  if (v >= t.anom) return 'anom';
  return 'bg';
}

export const GRADE_COLORS = { high: '#C15F3C', anom: '#B08A3E', bg: '#A39C8C', none: '#8A857A', pending: '#F3F1E9' };

// Union of elements present in the data (always includes Au so the
// selector never renders empty).
export function elementsInStore(store) {
  const set = new Set(['Au']);
  store.projects.forEach(p => {
    p.samples.forEach(s => Object.keys(s.assays || {}).forEach(e => set.add(e)));
    (p.intervals || []).forEach(i => Object.keys(i.assays || {}).forEach(e => set.add(e)));
  });
  return [...set];
}

export function formatAssay(el, value) {
  const t = elementInfo(el);
  return `${value} ${t.unit ? `${t.unit} ` : ''}${el}`.trim();
}

// ── Demo project: Charters Towers, North Queensland ────────────────────
// Sited in QLD so the GeoResGlobe public layers have data underneath.
export function createDemoStore() {
  return {
    version: 3,
    activeProjectId: 'proj-demo',
    projects: [{
      id: 'proj-demo',
      name: 'Charters Towers Au',
      demo: true,
      color: PROJECT_COLORS[0],
      idPrefix: 'CT-RC-',
      createdAt: '2026-06-01',
      boundary: {
        name: 'EPM 27780',
        coords: [
          [-20.0570, 146.2410], [-20.0572, 146.2810], [-20.0930, 146.2800], [-20.0920, 146.2400],
        ],
      },
      samples: [
        { id: 'CT-RC-0428', lat: -20.0665, lng: 146.2570, assays: { Au: 4.2, Ag: 18 }, lith: 'Quartz vein float', notes: 'Coarse visible sulphides', date: '2026-06-12' },
        { id: 'CT-RC-0431', lat: -20.0762, lng: 146.2521, assays: { Au: 1.1, Cu: 0.4 }, lith: 'Sheared granodiorite', notes: '', date: '2026-06-12' },
        { id: 'CT-RC-0433', lat: -20.0708, lng: 146.2691, assays: { Au: 0.2 }, lith: 'Silicified siltstone', notes: 'Background', date: '2026-06-13' },
        { id: 'CT-RC-0440', lat: -20.0611, lng: 146.2478, assays: { Au: 3.6, Ag: 41 }, lith: 'Quartz reef', notes: 'Sampled at reef contact', date: '2026-06-14' },
        { id: 'CT-RC-0442', lat: -20.0842, lng: 146.2648, assays: { Au: 0.8, Cu: 0.15 }, lith: 'Ferruginous quartz', notes: '', date: '2026-06-14' },
        { id: 'CT-RC-0447', lat: -20.0741, lng: 146.2442, assays: {}, lith: 'Quartz-sericite schist', notes: 'Dispatched to ALS 28 Jun', date: '2026-06-28' },
      ],
      collars: [
        { id: 'CT-DD-001', lat: -20.0648, lng: 146.2545, azimuth: 90, dip: -60, depth: 250, date: '2026-05-02' },
        { id: 'CT-DD-002', lat: -20.0699, lng: 146.2588, azimuth: 90, dip: -55, depth: 300, date: '2026-05-18' },
        { id: 'CT-DD-003', lat: -20.0752, lng: 146.2610, azimuth: 270, dip: -60, depth: 220, date: '2026-06-03' },
      ],
      intervals: [
        { holeId: 'CT-DD-001', from: 112, to: 118, assays: { Au: 2.4, Ag: 9 } },
        { holeId: 'CT-DD-001', from: 118, to: 121, assays: { Au: 5.1, Ag: 22 } },
        { holeId: 'CT-DD-002', from: 96, to: 102, assays: { Au: 1.2 } },
      ],
      files: [
        { name: 'ct_chips_jun.csv', category: 'Rock chips', meta: '6 samples', date: '2026-06-14' },
        { name: 'ALS_A22910.pdf', category: 'Lab cert', meta: 'linked to 5 chips', date: '2026-06-20' },
      ],
    }],
  };
}

// v2 stored a single `au` number; v3 stores an `assays` map.
function migrateV2(v2) {
  return {
    ...v2,
    version: 3,
    projects: v2.projects.map(p => ({
      ...p,
      samples: (p.samples || []).map(({ au, ...s }) => ({ ...s, assays: au != null ? { Au: au } : {} })),
      intervals: (p.intervals || []).map(({ au, ...i }) => ({ ...i, assays: au != null ? { Au: au } : {} })),
    })),
  };
}

export function loadStore() {
  if (typeof window === 'undefined') return createDemoStore();
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.version === 3 && Array.isArray(parsed.projects)) return parsed;
    }
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (parsed?.version === 2 && Array.isArray(parsed.projects)) {
        const migrated = migrateV2(parsed);
        window.localStorage.setItem(STORE_KEY, JSON.stringify(migrated));
        window.localStorage.removeItem(LEGACY_KEY);
        return migrated;
      }
    }
  } catch { /* corrupted storage — fall back to demo */ }
  return createDemoStore();
}

// Returns true on success, false on failure (quota exceeded, storage
// disabled, etc.) so the caller can warn the user their change didn't
// persist — silently swallowing this would risk losing field data.
export function saveStore(store) {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

// Next auto-ID from the highest numeric suffix on the project's prefix.
export function nextId(items, prefix) {
  let max = 0;
  items.forEach(s => {
    if (s.id?.startsWith(prefix)) {
      const n = parseInt(s.id.slice(prefix.length), 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  });
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

// ── CSV ────────────────────────────────────────────────────────────────
function splitCsv(text) {
  return text.split(/\r?\n/).filter(l => l.trim()).map(l => l.split(',').map(c => c.trim()));
}

function headerIndex(headers) {
  const h = headers.map(x => x.toLowerCase());
  return (...names) => h.findIndex(x => names.includes(x));
}

// Detect element columns in a header row: "au", "au_gpt", "ag_ppm",
// "cu_pct", "Zn %" etc. Returns [{ index, element }].
export function detectElementColumns(headers) {
  const out = [];
  headers.forEach((raw, index) => {
    const base = raw.toLowerCase().trim().split(/[_\s(]/)[0];
    const symbol = ELEMENT_SYMBOLS.find(e => e.toLowerCase() === base);
    if (symbol) out.push({ index, element: symbol });
  });
  return out;
}

// What kind of CSV is this? Detection from the header row, so users can
// drop any file without pre-categorising it. Order matters: intervals
// (hole_id + from/to) before collars (hole_id + coords) before chips
// (coords) before assays (sample_id + elements, no coords).
export function detectCsvKind(headers) {
  const col = headerIndex(headers);
  const hasLat = col('lat', 'latitude', 'northing') >= 0;
  const hasLng = col('lng', 'lon', 'longitude', 'easting') >= 0;
  const hasHole = col('hole_id', 'hole') >= 0;
  const hasFromTo = col('from', 'from_m') >= 0 && col('to', 'to_m') >= 0;
  const hasSampleId = col('sample_id', 'id') >= 0;
  const hasElements = detectElementColumns(headers).length > 0;
  if (hasHole && hasFromTo) return 'intervals';
  if (hasHole && hasLat && hasLng) return 'collars';
  if (hasLat && hasLng) return 'chips';
  if (hasSampleId && hasElements) return 'assays';
  return null;
}

function readAssays(cells, elementCols) {
  const assays = {};
  elementCols.forEach(({ index, element }) => {
    const v = parseFloat(cells[index]);
    if (!Number.isNaN(v)) assays[element] = v;
  });
  return assays;
}

// Rock chip CSV → samples. Recognised headers (case-insensitive):
// sample_id/id, lat/northing, lng/lon/easting, lith/lithology, notes,
// plus any element columns (au, ag, cu_pct, zn_ppm, …).
//
// If the lat/lng-named columns actually hold projected MGA easting/
// northing (common for real field data), this refuses to silently
// mis-place them: without a confirmed `zone`, it stops at the first
// such row and returns `needsProjection: true` for the caller to show
// a zone-picker; with `zone` set (only after the user has confirmed
// it), it reprojects every row to WGS84 before building samples.
export function parseSampleCsv(text, existing, prefix, zone) {
  const rows = splitCsv(text);
  if (rows.length < 2) return { samples: [], error: 'CSV needs a header row and at least one data row.' };
  const col = headerIndex(rows[0]);
  const iId = col('sample_id', 'id');
  const iLat = col('lat', 'latitude', 'northing');
  const iLng = col('lng', 'lon', 'longitude', 'easting');
  const iLith = col('lith', 'lithology');
  const iNotes = col('notes', 'comment', 'comments');
  const elementCols = detectElementColumns(rows[0]);
  if (iLat < 0 || iLng < 0) return { samples: [], error: 'CSV needs lat/northing and lng/easting columns.' };

  const out = [];
  let pool = existing;
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const rawLat = parseFloat(cells[iLat]);
    const rawLng = parseFloat(cells[iLng]);
    if (Number.isNaN(rawLat) || Number.isNaN(rawLng)) continue;

    let lat = rawLat, lng = rawLng;
    if (zone) {
      ({ lat, lng } = reprojectEastingNorthing(rawLng, rawLat, zone));
    } else if (isProjectedCoord(rawLat, rawLng)) {
      return { samples: [], error: null, needsProjection: true, easting: rawLng, northing: rawLat };
    }

    const id = (iId >= 0 && cells[iId]) ? cells[iId] : nextId(pool, prefix);
    const sample = {
      id, lat, lng,
      assays: readAssays(cells, elementCols),
      lith: iLith >= 0 ? cells[iLith] || '' : '',
      notes: iNotes >= 0 ? cells[iNotes] || '' : '',
      date: today(),
    };
    out.push(sample);
    pool = [...pool, sample];
  }
  if (!out.length) return { samples: [], error: 'No rows with valid coordinates found.' };
  return { samples: out, error: null };
}

// Drill collar CSV → collars. hole_id/id, lat/northing, lng/easting,
// azimuth/azi, dip, depth/eoh. Same projected-coordinate handling as
// parseSampleCsv (see its comment): refuses to silently mis-place MGA
// easting/northing without a confirmed `zone`.
export function parseCollarCsv(text, existing, prefix, zone) {
  const rows = splitCsv(text);
  if (rows.length < 2) return { collars: [], error: 'CSV needs a header row and at least one data row.' };
  const col = headerIndex(rows[0]);
  const iId = col('hole_id', 'id');
  const iLat = col('lat', 'latitude', 'northing');
  const iLng = col('lng', 'lon', 'longitude', 'easting');
  const iAzi = col('azimuth', 'azi');
  const iDip = col('dip');
  const iDepth = col('depth', 'eoh', 'planned_depth');
  if (iLat < 0 || iLng < 0) return { collars: [], error: 'CSV needs lat/northing and lng/easting columns.' };

  const out = [];
  let pool = existing;
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const rawLat = parseFloat(cells[iLat]);
    const rawLng = parseFloat(cells[iLng]);
    if (Number.isNaN(rawLat) || Number.isNaN(rawLng)) continue;

    let lat = rawLat, lng = rawLng;
    if (zone) {
      ({ lat, lng } = reprojectEastingNorthing(rawLng, rawLat, zone));
    } else if (isProjectedCoord(rawLat, rawLng)) {
      return { collars: [], error: null, needsProjection: true, easting: rawLng, northing: rawLat };
    }

    const num = (i) => { const v = i >= 0 ? parseFloat(cells[i]) : NaN; return Number.isNaN(v) ? null : v; };
    const id = (iId >= 0 && cells[iId]) ? cells[iId] : nextId(pool, prefix);
    const collar = { id, lat, lng, azimuth: num(iAzi), dip: num(iDip), depth: num(iDepth), date: today() };
    out.push(collar);
    pool = [...pool, collar];
  }
  if (!out.length) return { collars: [], error: 'No rows with valid coordinates found.' };
  return { collars: out, error: null };
}

// Assay CSV → links lab results to existing samples by ID. Any element
// columns are read (au, ag, cu_pct, …) and merged into the sample.
export function parseAssayCsv(text, samples) {
  const rows = splitCsv(text);
  if (rows.length < 2) return { updated: null, matched: 0, unmatched: [], error: 'CSV needs a header row and at least one data row.' };
  const col = headerIndex(rows[0]);
  const iId = col('sample_id', 'id');
  const elementCols = detectElementColumns(rows[0]);
  if (iId < 0) return { updated: null, matched: 0, unmatched: [], error: 'Assay CSV needs a sample_id column.' };
  if (!elementCols.length) return { updated: null, matched: 0, unmatched: [], error: 'No element columns found (e.g. au, ag, cu, zn…).' };

  const results = new Map();
  for (let r = 1; r < rows.length; r++) {
    const id = rows[r][iId];
    if (!id) continue;
    const assays = readAssays(rows[r], elementCols);
    if (Object.keys(assays).length) results.set(id, assays);
  }
  let matched = 0;
  const updated = samples.map(s => {
    if (results.has(s.id)) {
      matched++;
      const assays = { ...(s.assays || {}), ...results.get(s.id) };
      results.delete(s.id);
      return { ...s, assays };
    }
    return s;
  });
  return { updated, matched, unmatched: [...results.keys()], error: matched ? null : 'No sample IDs in this file matched the project.' };
}

// Interval CSV: hole_id, from, to + element columns.
export function parseIntervalCsv(text) {
  const rows = splitCsv(text);
  if (rows.length < 2) return { intervals: [], error: 'CSV needs a header row and at least one data row.' };
  const col = headerIndex(rows[0]);
  const iHole = col('hole_id', 'id', 'hole');
  const iFrom = col('from', 'from_m');
  const iTo = col('to', 'to_m');
  const elementCols = detectElementColumns(rows[0]);
  if (iHole < 0 || iFrom < 0 || iTo < 0) return { intervals: [], error: 'Interval CSV needs hole_id, from and to columns.' };
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const from = parseFloat(cells[iFrom]);
    const to = parseFloat(cells[iTo]);
    if (!cells[iHole] || Number.isNaN(from) || Number.isNaN(to)) continue;
    out.push({ holeId: cells[iHole], from, to, assays: readAssays(cells, elementCols) });
  }
  if (!out.length) return { intervals: [], error: 'No valid interval rows found.' };
  return { intervals: out, error: null };
}

export function samplesToCsv(samples) {
  const elements = [...new Set(samples.flatMap(s => Object.keys(s.assays || {})))];
  const header = ['sample_id', 'lat', 'lng', ...elements.map(e => e.toLowerCase()), 'lithology', 'notes', 'date'];
  return [
    header.join(','),
    ...samples.map(s => [
      s.id, s.lat, s.lng,
      ...elements.map(e => s.assays?.[e] ?? ''),
      s.lith || '', (s.notes || '').replace(/,/g, ';'), s.date || '',
    ].join(',')),
  ].join('\n');
}

export function collarsToCsv(collars) {
  return [
    'hole_id,lat,lng,azimuth,dip,depth,date',
    ...collars.map(c => [c.id, c.lat, c.lng, c.azimuth ?? '', c.dip ?? '', c.depth ?? '', c.date || ''].join(',')),
  ].join('\n');
}

export function downloadText(filename, text, mime = 'text/csv') {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── KML ────────────────────────────────────────────────────────────────
// First polygon's outer ring → [[lat,lng], ...]. GDA2020/WGS84 lat-lng
// only — deliberately no projection support (this is not a GIS).
export function parseKmlBoundary(text) {
  try {
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    if (doc.querySelector('parsererror')) return { coords: null, error: 'Not a valid KML file.' };
    const coordsEl =
      doc.querySelector('Polygon outerBoundaryIs coordinates') ||
      doc.querySelector('Polygon coordinates') ||
      doc.querySelector('LinearRing coordinates') ||
      doc.querySelector('coordinates');
    if (!coordsEl) return { coords: null, error: 'No polygon coordinates found in this KML.' };
    const coords = coordsEl.textContent.trim().split(/\s+/).map(tuple => {
      const [lng, lat] = tuple.split(',').map(parseFloat);
      return [lat, lng];
    }).filter(([lat, lng]) => !Number.isNaN(lat) && !Number.isNaN(lng));
    if (coords.length < 3) return { coords: null, error: 'Polygon has fewer than 3 valid points.' };
    return { coords, error: null };
  } catch {
    return { coords: null, error: 'Could not read this KML file.' };
  }
}

export function boundaryToKml(name, coords) {
  const ring = [...coords, coords[0]].map(([lat, lng]) => `${lng},${lat},0`).join(' ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Placemark>
    <name>${name}</name>
    <Polygon><outerBoundaryIs><LinearRing><coordinates>${ring}</coordinates></LinearRing></outerBoundaryIs></Polygon>
  </Placemark>
</kml>`;
}

// ── Photos ─────────────────────────────────────────────────────────────
// Compress to a small JPEG dataURL so localStorage holds it comfortably.
export function compressImage(file, maxDim = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}
