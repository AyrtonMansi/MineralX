// ── MineralX project store ─────────────────────────────────────────────
// Single source of truth for all user data. Persisted to localStorage
// now; the API surface (load/save/mutators below) is the seam where a
// real backend slots in later without touching any component.

export const STORE_KEY = 'mx-store-v2';

export const PROJECT_COLORS = ['#C15F3C', '#6E7A5E', '#5E6E7A', '#B08A3E', '#8A5E7A'];

// Grade classification: single source of truth for legend, markers, stats.
export function gradeOf(au) {
  if (au == null || Number.isNaN(au)) return 'pending';
  if (au >= 3.0) return 'high';
  if (au >= 0.5) return 'anom';
  return 'bg';
}

export const GRADE_COLORS = { high: '#C15F3C', anom: '#B08A3E', bg: '#A39C8C', pending: '#F3F1E9' };

// ── Demo project: Charters Towers, North Queensland ────────────────────
// Sited in QLD so the GeoResGlobe public layers have data underneath.
export function createDemoStore() {
  return {
    version: 2,
    activeProjectId: 'proj-demo',
    projects: [{
      id: 'proj-demo',
      name: 'Charters Towers Au',
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
        { id: 'CT-RC-0428', lat: -20.0665, lng: 146.2570, au: 4.2, lith: 'Quartz vein float', notes: 'Coarse visible sulphides', date: '2026-06-12' },
        { id: 'CT-RC-0431', lat: -20.0762, lng: 146.2521, au: 1.1, lith: 'Sheared granodiorite', notes: '', date: '2026-06-12' },
        { id: 'CT-RC-0433', lat: -20.0708, lng: 146.2691, au: 0.2, lith: 'Silicified siltstone', notes: 'Background', date: '2026-06-13' },
        { id: 'CT-RC-0440', lat: -20.0611, lng: 146.2478, au: 3.6, lith: 'Quartz reef', notes: 'Sampled at reef contact', date: '2026-06-14' },
        { id: 'CT-RC-0442', lat: -20.0842, lng: 146.2648, au: 0.8, lith: 'Ferruginous quartz', notes: '', date: '2026-06-14' },
        { id: 'CT-RC-0447', lat: -20.0741, lng: 146.2442, au: null, lith: 'Quartz-sericite schist', notes: 'Dispatched to ALS 28 Jun', date: '2026-06-28' },
      ],
      collars: [
        { id: 'CT-DD-001', lat: -20.0648, lng: 146.2545, azimuth: 90, dip: -60, depth: 250, date: '2026-05-02' },
        { id: 'CT-DD-002', lat: -20.0699, lng: 146.2588, azimuth: 90, dip: -55, depth: 300, date: '2026-05-18' },
        { id: 'CT-DD-003', lat: -20.0752, lng: 146.2610, azimuth: 270, dip: -60, depth: 220, date: '2026-06-03' },
      ],
      intervals: [
        { holeId: 'CT-DD-001', from: 112, to: 118, au: 2.4 },
        { holeId: 'CT-DD-001', from: 118, to: 121, au: 5.1 },
        { holeId: 'CT-DD-002', from: 96, to: 102, au: 1.2 },
      ],
      files: [
        { name: 'ct_chips_jun.csv', category: 'Rock chips', meta: '6 samples', date: '2026-06-14' },
        { name: 'ALS_A22910.pdf', category: 'Lab cert', meta: 'linked to 5 chips', date: '2026-06-20' },
      ],
    }],
  };
}

export function loadStore() {
  if (typeof window === 'undefined') return createDemoStore();
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.version === 2 && Array.isArray(parsed.projects)) return parsed;
    }
  } catch { /* corrupted storage — fall back to demo */ }
  return createDemoStore();
}

export function saveStore(store) {
  try { window.localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* quota */ }
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

// Rock chip CSV → samples. Recognised headers (case-insensitive):
// sample_id/id, lat/northing, lng/lon/easting, au/au_ppm/au_gpt, lith/lithology, notes.
export function parseSampleCsv(text, existing, prefix) {
  const rows = splitCsv(text);
  if (rows.length < 2) return { samples: [], error: 'CSV needs a header row and at least one data row.' };
  const col = headerIndex(rows[0]);
  const iId = col('sample_id', 'id');
  const iLat = col('lat', 'latitude', 'northing');
  const iLng = col('lng', 'lon', 'longitude', 'easting');
  const iAu = col('au', 'au_ppm', 'au_gpt', 'au_g_t');
  const iLith = col('lith', 'lithology');
  const iNotes = col('notes', 'comment', 'comments');
  if (iLat < 0 || iLng < 0) return { samples: [], error: 'CSV needs lat/northing and lng/easting columns.' };

  const out = [];
  let pool = existing;
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const lat = parseFloat(cells[iLat]);
    const lng = parseFloat(cells[iLng]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
    const auRaw = iAu >= 0 ? parseFloat(cells[iAu]) : NaN;
    const id = (iId >= 0 && cells[iId]) ? cells[iId] : nextId(pool, prefix);
    const sample = {
      id, lat, lng,
      au: Number.isNaN(auRaw) ? null : auRaw,
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
// azimuth/azi, dip, depth/eoh.
export function parseCollarCsv(text, existing, prefix) {
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
    const lat = parseFloat(cells[iLat]);
    const lng = parseFloat(cells[iLng]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
    const num = (i) => { const v = i >= 0 ? parseFloat(cells[i]) : NaN; return Number.isNaN(v) ? null : v; };
    const id = (iId >= 0 && cells[iId]) ? cells[iId] : nextId(pool, prefix);
    const collar = { id, lat, lng, azimuth: num(iAzi), dip: num(iDip), depth: num(iDepth), date: today() };
    out.push(collar);
    pool = [...pool, collar];
  }
  if (!out.length) return { collars: [], error: 'No rows with valid coordinates found.' };
  return { collars: out, error: null };
}

// Assay CSV → links results to existing samples by ID.
// sample_id/id + au/au_ppm/au_gpt.
export function parseAssayCsv(text, samples) {
  const rows = splitCsv(text);
  if (rows.length < 2) return { updated: null, matched: 0, unmatched: [], error: 'CSV needs a header row and at least one data row.' };
  const col = headerIndex(rows[0]);
  const iId = col('sample_id', 'id');
  const iAu = col('au', 'au_ppm', 'au_gpt', 'au_g_t', 'result');
  if (iId < 0 || iAu < 0) return { updated: null, matched: 0, unmatched: [], error: 'Assay CSV needs sample_id and au columns.' };

  const results = new Map();
  for (let r = 1; r < rows.length; r++) {
    const id = rows[r][iId];
    const au = parseFloat(rows[r][iAu]);
    if (id && !Number.isNaN(au)) results.set(id, au);
  }
  let matched = 0;
  const updated = samples.map(s => {
    if (results.has(s.id)) { matched++; const au = results.get(s.id); results.delete(s.id); return { ...s, au }; }
    return s;
  });
  return { updated, matched, unmatched: [...results.keys()], error: matched ? null : 'No sample IDs in this file matched the project.' };
}

// Interval CSV: hole_id, from, to, au.
export function parseIntervalCsv(text) {
  const rows = splitCsv(text);
  if (rows.length < 2) return { intervals: [], error: 'CSV needs a header row and at least one data row.' };
  const col = headerIndex(rows[0]);
  const iHole = col('hole_id', 'id', 'hole');
  const iFrom = col('from', 'from_m');
  const iTo = col('to', 'to_m');
  const iAu = col('au', 'au_ppm', 'au_gpt');
  if (iHole < 0 || iFrom < 0 || iTo < 0) return { intervals: [], error: 'Interval CSV needs hole_id, from and to columns.' };
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const from = parseFloat(cells[iFrom]);
    const to = parseFloat(cells[iTo]);
    if (!cells[iHole] || Number.isNaN(from) || Number.isNaN(to)) continue;
    const au = iAu >= 0 ? parseFloat(cells[iAu]) : NaN;
    out.push({ holeId: cells[iHole], from, to, au: Number.isNaN(au) ? null : au });
  }
  if (!out.length) return { intervals: [], error: 'No valid interval rows found.' };
  return { intervals: out, error: null };
}

export function samplesToCsv(samples) {
  return [
    'sample_id,lat,lng,au_gpt,lithology,notes,date',
    ...samples.map(s => [s.id, s.lat, s.lng, s.au ?? '', s.lith || '', (s.notes || '').replace(/,/g, ';'), s.date || ''].join(',')),
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
