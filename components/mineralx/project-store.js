// ── MineralX project store ─────────────────────────────────────────────
// Single source of truth for all user data. Persisted to localStorage
// now; the API surface (load/save/mutators below) is the seam where a
// real backend slots in later without touching any component.

import proj4 from 'proj4';
import { parseCsv, csvRow } from './csv.js';

// Projected-coordinate support is worldwide, because a real exploration
// group runs projects in different countries. A file's grid can't be
// inferred from the numbers alone (an easting/northing doesn't encode its
// zone or hemisphere), so the user always confirms the CRS in the
// ZonePicker — this app never guesses one (hard rule #1).
//
// A CRS is either a bare MGA zone number (legacy/Australia default) or a
// descriptor { system, zone }:
//   - 'mga2020'   GDA2020 MGA, Australia, zones 49–56 (EPSG:283xx)
//   - 'utm-south' WGS84 UTM, southern hemisphere, zones 1–60
//   - 'utm-north' WGS84 UTM, northern hemisphere, zones 1–60
export const MGA_ZONES = [49, 50, 51, 52, 53, 54, 55, 56];
export const UTM_ZONES = Array.from({ length: 60 }, (_, i) => i + 1);
export const CRS_SYSTEMS = [
  { id: 'mga2020', label: 'Australia · GDA2020 MGA', zones: MGA_ZONES, defaultZone: 55 },
  { id: 'utm-south', label: 'UTM · Southern hemisphere', zones: UTM_ZONES, defaultZone: 50 },
  { id: 'utm-north', label: 'UTM · Northern hemisphere', zones: UTM_ZONES, defaultZone: 30 },
];

const normaliseCrs = (crs) => (typeof crs === 'number' ? { system: 'mga2020', zone: crs } : (crs || {}));

// The proj4 source-CRS string for a confirmed grid. GRS80/GDA2020 for MGA
// (matches the Australian national datum); plain WGS84 for UTM elsewhere.
function crsToProjString(crs) {
  const { system, zone } = normaliseCrs(crs);
  if (!Number.isInteger(zone) || zone < 1 || zone > 60) {
    throw new Error(`Unsupported ${system === 'mga2020' ? 'MGA' : 'UTM'} zone: ${zone}`);
  }
  switch (system) {
    case 'mga2020':
      if (zone < 46 || zone > 56) throw new Error(`Unsupported MGA zone: ${zone}`);
      return `+proj=utm +zone=${zone} +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`;
    case 'utm-south':
      return `+proj=utm +zone=${zone} +south +datum=WGS84 +units=m +no_defs`;
    case 'utm-north':
      return `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs`;
    default:
      throw new Error(`Unsupported coordinate system: ${system}`);
  }
}

// Human label for a confirmed CRS, used in import-result messages.
export function crsLabel(crs) {
  const { system, zone } = normaliseCrs(crs);
  if (system === 'mga2020') return `MGA Zone ${zone}`;
  if (system === 'utm-north') return `UTM Zone ${zone}N`;
  if (system === 'utm-south') return `UTM Zone ${zone}S`;
  return 'the selected grid';
}

// A decimal-degree lat is always -90..90, lng -180..180 — an MGA/UTM
// easting (~100,000-900,000) or northing (~1,000,000-10,000,000) is off
// by orders of magnitude, so this cheap magnitude check reliably catches
// projected coordinates without guessing from column names.
export function isProjectedCoord(lat, lng) {
  return Math.abs(lat) > 90 || Math.abs(lng) > 180;
}

// Converts a projected easting/northing to WGS84 lon/lat under a confirmed
// CRS. Only ever called after a human has confirmed it — never guessed.
export function reprojectEastingNorthing(easting, northing, crs) {
  const [lng, lat] = proj4(crsToProjString(crs), 'WGS84', [easting, northing]);
  return { lat, lng };
}

export const STORE_KEY = 'mx-store-v8';
const V7_KEY = 'mx-store-v7';
const V6_KEY = 'mx-store-v6';
const V5_KEY = 'mx-store-v5';
const V4_KEY = 'mx-store-v4';
const V3_KEY = 'mx-store-v3';
const V2_KEY = 'mx-store-v2';

// ── Sample provenance & QAQC ─────────────────────────────────────────────
// A JORC Table 1 disclosure (Section 1: Sampling Techniques and Data;
// Section 3: Verification of Sampling and Assaying) has to state the
// sampling method, the QAQC regime, and how coordinates were obtained —
// none of which existed on a sample before this. Without them the tool
// can capture grades but not the metadata an ASX announcement or a JORC
// resource estimate actually requires; a junior can't hand this data to a
// Competent Person and have it be usable as-is.
//
// All fields are optional with a conservative default so nothing about
// existing data is asserted that isn't true — 'unknown' coordinate source
// is itself honest information (worth disclosing as a gap), not a guess.
export const SAMPLE_TYPES = ['rock_chip', 'soil', 'channel', 'trench', 'float', 'core', 'rc', 'diamond_core', 'other'];
export const SAMPLE_TYPE_LABELS = {
  rock_chip: 'Rock chip', soil: 'Soil', channel: 'Channel', trench: 'Trench',
  float: 'Float', core: 'Core (legacy classification)', rc: 'RC chips', diamond_core: 'Diamond core', other: 'Other',
};

// QAQC type: what this sample IS, for the lab-quality audit trail. A
// duplicate/triplicate carries `duplicateOf` pointing at the original
// sample id it was split/re-sampled from, so pairs can be checked for
// precision at assay time.
export const QAQC_TYPES = ['none', 'standard', 'blank', 'duplicate', 'triplicate'];
export const QAQC_TYPE_LABELS = {
  none: 'Original sample', standard: 'CRM standard', blank: 'Blank',
  duplicate: 'Field duplicate', triplicate: 'Field triplicate',
};

// How the coordinate was obtained — directly bears on the positional
// confidence a Competent Person can claim.
export const COORD_SOURCES = ['gps_handheld', 'dgps', 'survey', 'digitised', 'unknown'];
export const COORD_SOURCE_LABELS = {
  gps_handheld: 'Handheld GPS', dgps: 'Differential GPS', survey: 'Surveyed',
  digitised: 'Digitised from map/image', unknown: 'Unknown',
};

export function isValidSampleType(v) { return SAMPLE_TYPES.includes(v); }
export function isValidQaqcType(v) { return QAQC_TYPES.includes(v); }
export function isValidCoordSource(v) { return COORD_SOURCES.includes(v); }

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

// Grade of a sample for one element. 'pending' = no assay results at all
// (neither a measured value nor a detection limit for anything). A
// below-detection result ("<0.01 g/t Au") is a real, low result — it
// grades as background, not as "not analysed" — because the sample WAS
// tested and returned a genuine (if unremarkable) answer; conflating
// that with "awaiting assay" would hide real QAQC-passing data from a
// manager scanning for what's still outstanding.
export function gradeOf(sample, element) {
  const assays = sample?.assays || {};
  const dls = sample?.detectionLimits || {};
  if (Object.keys(assays).length === 0 && Object.keys(dls).length === 0) return 'pending';
  const v = assays[element];
  if (v != null && !Number.isNaN(v)) {
    const t = elementInfo(element);
    if (v >= t.high) return 'high';
    if (v >= t.anom) return 'anom';
    return 'bg';
  }
  if (dls[element] != null) return 'bg'; // below detection: real, low result
  return 'none'; // assayed for other elements, but not this one
}

export const GRADE_COLORS = { high: '#C15F3C', anom: '#B08A3E', bg: '#A39C8C', none: '#8A857A', pending: '#F3F1E9' };

// Union of elements present in the data (always includes Au so the
// selector never renders empty). Elements that only ever came back below
// detection still count — a project that tested for Sb and got "<50 ppm"
// everywhere should still offer Sb in the "colour by" selector.
export function elementsInStore(store) {
  const set = new Set(['Au']);
  store.projects.forEach(p => {
    p.samples.forEach(s => {
      Object.keys(s.assays || {}).forEach(e => set.add(e));
      Object.keys(s.detectionLimits || {}).forEach(e => set.add(e));
    });
    (p.intervals || []).forEach(i => {
      Object.keys(i.assays || {}).forEach(e => set.add(e));
      Object.keys(i.detectionLimits || {}).forEach(e => set.add(e));
    });
  });
  return [...set];
}

export function formatAssay(el, value, { belowDetection = false } = {}) {
  const t = elementInfo(el);
  return `${belowDetection ? '<' : ''}${value} ${t.unit ? `${t.unit} ` : ''}${el}`.trim();
}

// Display string for one element on a sample/interval: a real measured
// grade, a below-detection limit ("<0.01 g/t Au"), or null if that
// element was never analysed for this record at all. Centralises the
// assays-vs-detectionLimits precedence so every UI surface (sample rows,
// interval tables, popups) reads it the same way.
export function assayDisplay(record, el) {
  const v = record?.assays?.[el];
  if (v != null && !Number.isNaN(v)) return formatAssay(el, v);
  const dl = record?.detectionLimits?.[el];
  if (dl != null) return formatAssay(el, dl, { belowDetection: true });
  return null;
}

// ── Demo project: Charters Towers, North Queensland ────────────────────
// Sited in QLD so the GeoResGlobe public layers have data underneath.
export function createDemoStore() {
  return {
    version: 8,
    activeProjectId: 'proj-demo',
    projects: [{
      id: 'proj-demo',
      name: 'Charters Towers Au',
      demo: true,
      color: PROJECT_COLORS[0],
      idPrefix: 'CT-RC-',
      createdAt: '2026-06-01',
      // Targets are generated by running Target Analysis and promoting a
      // candidate — the demo ships with none so the worklist reflects the
      // user's own decisions, not a seeded number that implies a claim.
      targets: [],
      // Rounded coords of analysis candidates the user has dismissed, so a
      // later re-run never resurfaces a target they already walked off.
      dismissedTargets: [],
      boundary: {
        name: 'EPM 27780',
        coords: [
          [-20.0570, 146.2410], [-20.0572, 146.2810], [-20.0930, 146.2800], [-20.0920, 146.2400],
        ],
      },
      // sampleType/qaqcType/coordSource default to the same conservative
      // values the v4->v5 migration gives real user data — 'rock_chip'
      // (what these demo samples already visually represent), 'none' and
      // 'unknown' — no QAQC pairing or survey provenance is asserted that
      // isn't true of this synthetic data (rule: no invented geology).
      samples: [
        { id: 'CT-RC-0428', lat: -20.0665, lng: 146.2570, assays: { Au: 4.2, Ag: 18 }, lith: 'Quartz vein float', notes: 'Coarse visible sulphides', date: '2026-06-12', sampleType: 'rock_chip', qaqcType: 'none', coordSource: 'unknown' },
        { id: 'CT-RC-0431', lat: -20.0762, lng: 146.2521, assays: { Au: 1.1, Cu: 0.4 }, lith: 'Sheared granodiorite', notes: '', date: '2026-06-12', sampleType: 'rock_chip', qaqcType: 'none', coordSource: 'unknown' },
        { id: 'CT-RC-0433', lat: -20.0708, lng: 146.2691, assays: { Au: 0.2 }, lith: 'Silicified siltstone', notes: 'Background', date: '2026-06-13', sampleType: 'rock_chip', qaqcType: 'none', coordSource: 'unknown' },
        { id: 'CT-RC-0440', lat: -20.0611, lng: 146.2478, assays: { Au: 3.6, Ag: 41 }, lith: 'Quartz reef', notes: 'Sampled at reef contact', date: '2026-06-14', sampleType: 'rock_chip', qaqcType: 'none', coordSource: 'unknown' },
        { id: 'CT-RC-0442', lat: -20.0842, lng: 146.2648, assays: { Au: 0.8, Cu: 0.15 }, lith: 'Ferruginous quartz', notes: '', date: '2026-06-14', sampleType: 'rock_chip', qaqcType: 'none', coordSource: 'unknown' },
        { id: 'CT-RC-0447', lat: -20.0741, lng: 146.2442, assays: {}, lith: 'Quartz-sericite schist', notes: 'Dispatched to ALS 28 Jun', date: '2026-06-28', sampleType: 'rock_chip', qaqcType: 'none', coordSource: 'unknown' },
      ],
      collars: [
        { id: 'CT-DD-001', lat: -20.0648, lng: 146.2545, azimuth: 90, dip: -60, depth: 250, date: '2026-05-02', notes: '' },
        { id: 'CT-DD-002', lat: -20.0699, lng: 146.2588, azimuth: 90, dip: -55, depth: 300, date: '2026-05-18', notes: '' },
        { id: 'CT-DD-003', lat: -20.0752, lng: 146.2610, azimuth: 270, dip: -60, depth: 220, date: '2026-06-03', notes: 'Rig moved off in wet weather, resume 2026-06-10' },
      ],
      intervals: [
        { holeId: 'CT-DD-001', from: 112, to: 118, assays: { Au: 2.4, Ag: 9 } },
        { holeId: 'CT-DD-001', from: 118, to: 121, assays: { Au: 5.1, Ag: 22 } },
        { holeId: 'CT-DD-002', from: 96, to: 102, assays: { Au: 1.2 } },
      ],
      // No downhole survey shots recorded for the demo holes — inventing a
      // plausible-looking deviation trace would be exactly the kind of
      // fabricated geology this app refuses to ship (rule 6). An empty
      // list is the honest starting point; real programs import their own
      // gyro/EMS survey file.
      surveys: [],
      // No geological logging recorded for the demo holes either, for the
      // same reason as the empty surveys list — a lithology/alteration/
      // structure log is the geologist's own observation of core/chips in
      // hand; inventing one would be fabricated geology (rule 6).
      geology: [],
      files: [
        { name: 'ct_chips_jun.csv', category: 'Rock chips', meta: '6 samples', date: '2026-06-14' },
        { name: 'ALS_A22910.pdf', category: 'Lab cert', meta: 'linked to 5 chips', date: '2026-06-20' },
      ],
    }],
  };
}

// v2 stored a single `au` number; v3 stores an `assays` map.
export function migrateV2(v2) {
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

// v3 → v4 introduces the target worklist (see the exploration targeting
// cycle in MineralXWorkspace). Every project gains an empty `targets` and
// `dismissedTargets` list; nothing else changes, so a v3 store carries
// through untouched apart from the two new arrays.
export function migrateV3(v3) {
  return {
    ...v3,
    version: 4,
    projects: v3.projects.map(p => ({
      ...p,
      targets: p.targets || [],
      dismissedTargets: p.dismissedTargets || [],
    })),
  };
}

// v4 -> v5 adds sample provenance/QAQC fields (see the block above):
// sampleType, qaqcType, coordSource default to 'rock_chip' / 'none' /
// 'unknown' — the same conservative defaults the demo store uses, since
// pre-v5 data really is of unknown coordinate provenance and wasn't
// tagged for QAQC. Existing samples aren't asserted to be anything they
// weren't; the fields are just now present so they CAN be set.
export function migrateV4(v4) {
  return {
    ...v4,
    version: 5,
    projects: v4.projects.map(p => ({
      ...p,
      samples: (p.samples || []).map(s => ({
        sampleType: 'rock_chip', qaqcType: 'none', coordSource: 'unknown',
        ...s, // existing values (if any) win over the defaults above
      })),
    })),
  };
}

// v5 -> v6 adds downhole survey shots: a project gains `surveys` (flat,
// like `intervals` — {holeId, depth, azimuth, dip} rows keyed by hole,
// not nested inside each collar). A collar's own azimuth/dip was always
// just the planned/collar orientation; it was never enough to describe a
// hole's actual path, since real diamond/RC holes deviate with depth. An
// empty list is the honest default — no deviation data is invented for
// existing holes that were never surveyed downhole.
export function migrateV5(v5) {
  return {
    ...v5,
    version: 6,
    projects: v5.projects.map(p => ({
      ...p,
      surveys: p.surveys || [],
    })),
  };
}

// v6 -> v7 adds geological logging: a project gains `geology` (flat, like
// `intervals` and `surveys` — {holeId, from, to, lithology, alteration,
// structure, notes} rows keyed by hole). This is the geologist's own
// observation of core/chips in hand — lithology, alteration, structure —
// distinct from the assay-interval table, which only records lab grades
// for a from-to. A JORC Table 1 Section 1 disclosure needs both: what was
// seen, and what it assayed. An empty list is the honest default — no
// logging is invented for holes that were never logged in this tool.
export function migrateV6(v6) {
  return {
    ...v6,
    version: 7,
    projects: v6.projects.map(p => ({
      ...p,
      geology: p.geology || [],
    })),
  };
}

// v7 -> v8 adds collar notes: a driller's-log-style free-text field on
// each collar (rig moved off, hole abandoned, resume date), matching the
// notes field samples and geology intervals already had. Existing collars
// get an empty string, the same honest "nothing recorded" default every
// other optional field in this migration chain uses — never a guessed or
// invented note.
export function migrateV7(v7) {
  return {
    ...v7,
    version: 8,
    projects: v7.projects.map(p => ({
      ...p,
      collars: (p.collars || []).map(c => ({ notes: '', ...c })),
    })),
  };
}

export function loadStore() {
  if (typeof window === 'undefined') return createDemoStore();
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.version === 8 && Array.isArray(parsed.projects)) return parsed;
    }
    // Older schemas migrate forward through the chain, then persist under
    // the current key so the migration only runs once.
    const v7 = window.localStorage.getItem(V7_KEY);
    if (v7) {
      const parsed = JSON.parse(v7);
      if (parsed?.version === 7 && Array.isArray(parsed.projects)) {
        const migrated = migrateV7(parsed);
        window.localStorage.setItem(STORE_KEY, JSON.stringify(migrated));
        window.localStorage.removeItem(V7_KEY);
        return migrated;
      }
    }
    const v6 = window.localStorage.getItem(V6_KEY);
    if (v6) {
      const parsed = JSON.parse(v6);
      if (parsed?.version === 6 && Array.isArray(parsed.projects)) {
        const migrated = migrateV7(migrateV6(parsed));
        window.localStorage.setItem(STORE_KEY, JSON.stringify(migrated));
        window.localStorage.removeItem(V6_KEY);
        return migrated;
      }
    }
    const v5 = window.localStorage.getItem(V5_KEY);
    if (v5) {
      const parsed = JSON.parse(v5);
      if (parsed?.version === 5 && Array.isArray(parsed.projects)) {
        const migrated = migrateV7(migrateV6(migrateV5(parsed)));
        window.localStorage.setItem(STORE_KEY, JSON.stringify(migrated));
        window.localStorage.removeItem(V5_KEY);
        return migrated;
      }
    }
    const v4 = window.localStorage.getItem(V4_KEY);
    if (v4) {
      const parsed = JSON.parse(v4);
      if (parsed?.version === 4 && Array.isArray(parsed.projects)) {
        const migrated = migrateV7(migrateV6(migrateV5(migrateV4(parsed))));
        window.localStorage.setItem(STORE_KEY, JSON.stringify(migrated));
        window.localStorage.removeItem(V4_KEY);
        return migrated;
      }
    }
    const v3 = window.localStorage.getItem(V3_KEY);
    if (v3) {
      const parsed = JSON.parse(v3);
      if (parsed?.version === 3 && Array.isArray(parsed.projects)) {
        const migrated = migrateV7(migrateV6(migrateV5(migrateV4(migrateV3(parsed)))));
        window.localStorage.setItem(STORE_KEY, JSON.stringify(migrated));
        window.localStorage.removeItem(V3_KEY);
        return migrated;
      }
    }
    const v2 = window.localStorage.getItem(V2_KEY);
    if (v2) {
      const parsed = JSON.parse(v2);
      if (parsed?.version === 2 && Array.isArray(parsed.projects)) {
        const migrated = migrateV7(migrateV6(migrateV5(migrateV4(migrateV3(migrateV2(parsed))))));
        window.localStorage.setItem(STORE_KEY, JSON.stringify(migrated));
        window.localStorage.removeItem(V2_KEY);
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

// A target's ID prefix mirrors the sample prefix ('CT-RC-' → 'CT-TG-'), so
// a project's targets read as CT-TG-0001, CT-TG-0002, …
export function targetPrefix(idPrefix) {
  return (idPrefix || 'PX-RC-').replace('-RC-', '-TG-');
}

// A stable location key for a target/candidate, at ~1 m precision. Used to
// dedupe promotions and to remember dismissals across re-runs — an analysis
// re-run produces slightly different cell centroids, so exact equality
// would miss; five decimals (~1.1 m) is tight enough to mean "same spot"
// without merging genuinely distinct targets.
export function targetKey(lat, lng) {
  return `${lat.toFixed(5)}:${lng.toFixed(5)}`;
}

// Terrain-model target statuses, in worklist order. `dismissed` is tracked
// separately (dismissedTargets) — a dismissed candidate is not a target.
export const TARGET_STATUSES = ['proposed', 'planned', 'visited', 'sampled', 'confirmed', 'barren'];

// The terrain model's hit-rate against ground truth, computed purely from
// targets the user has assessed (marked confirmed or barren). This is the
// closing of the loop — real calibration from the program's own results,
// never a fabricated or seeded number (see the no-invented-geology rule).
export function targetHitRate(store) {
  let confirmed = 0, barren = 0;
  store.projects.forEach(p => (p.targets || []).forEach(t => {
    if (t.status === 'confirmed') confirmed += 1;
    else if (t.status === 'barren') barren += 1;
  }));
  return { assessed: confirmed + barren, confirmed, barren };
}

// The best grade among a target's linked samples for a given element — the
// "actual" a promoted target's evidence gets checked against at assessment
// time. Returns null when no linked sample has been assayed for it yet.
export function bestLinkedGrade(linkedSamples, element) {
  let best = null;
  linkedSamples.forEach(s => {
    const v = s?.assays?.[element];
    if (validateAssayValue(v) && (best == null || v > best)) best = v;
  });
  return best;
}

// One-line plain-English account of why a target exists, from the frozen
// provenance snapshot — the evidence that travels with the target through
// its whole life, so a geologist months later still knows what flagged it.
// Pure (no DOM), so it lives with the data and both the renderer and the
// field-tasking export can share it.
export function evidenceSummary(t) {
  const p = t.provenance || {};
  const el = p.element || 'Au';
  if (p.sample && p.occurrence) return `Downstream of a known ${el} occurrence and your anomalous sample`;
  if (p.occurrence) return `Downstream of a known ${el} occurrence`;
  if (p.sample) return `Downstream of your anomalous ${el} samples`;
  return 'Alluvial trap in the drainage network';
}

// ── Validation ─────────────────────────────────────────────────────────
// Post-parse guards. isProjectedCoord() catches MGA-magnitude values
// before they're misread as degrees; this catches everything else that
// would put a marker at a nonsense location (NaN, out-of-range after a
// wrong-zone reprojection of garbage input).
export function validateCoordinates(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (Number.isNaN(lat) || Number.isNaN(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return true;
}

// Negative assay values are lab below-detection-limit markers (e.g.
// "-0.01" meaning <0.01), not grades — treat them as absent rather than
// plotting a nonsense negative grade.
export function validateAssayValue(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

// ── CSV ────────────────────────────────────────────────────────────────
function splitCsv(text) {
  return parseCsv(text);
}

function headerIndex(headers) {
  const h = headers.map(x => x.trim().toLowerCase());
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

// Mass-fraction conversion is independent of display. Bare legacy headers retain
// their documented display unit; the Review importer requires explicit confirmation.
export function detectAssayColumns(headers) {
  const scale = { ppb: 0.001, ppm: 1, 'g/t': 1, '%': 10000 };
  return detectElementColumns(headers).map(column => {
    const raw = headers[column.index].trim();
    const suffix = raw.slice(column.element.length).replace(/^[_(\s]+|[)\s]+$/g, '').toLowerCase();
    const sourceUnit = suffix === 'gpt' ? 'g/t' : ['pct', 'percent'].includes(suffix) ? '%' : suffix || elementInfo(column.element).unit;
    return { ...column, sourceUnit, unitWasExplicit: !!suffix, factor: scale[sourceUnit] / scale[elementInfo(column.element).unit] };
  });
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

// Normalises a free-text CSV cell into one of a known set of enum values.
// Real lab/field sheets abbreviate ("dup", "std", "blk"), so a few common
// aliases are recognised alongside the canonical spelling; anything else
// returns null so the caller can fall back to the default and warn rather
// than reject the whole row over one messy cell.
const ENUM_ALIASES = {
  duplicate: 'duplicate', dup: 'duplicate', fdup: 'duplicate', field_duplicate: 'duplicate',
  triplicate: 'triplicate', trip: 'triplicate',
  standard: 'standard', std: 'standard', crm: 'standard',
  blank: 'blank', blk: 'blank',
  none: 'none', original: 'none',
  rock_chip: 'rock_chip', rockchip: 'rock_chip', chip: 'rock_chip',
  rc: 'rc', diamond_core: 'diamond_core', soil: 'soil', channel: 'channel', trench: 'trench', float: 'float', core: 'core', other: 'other',
  gps_handheld: 'gps_handheld', gps: 'gps_handheld', handheld: 'gps_handheld', handheld_gps: 'gps_handheld',
  dgps: 'dgps', differential_gps: 'dgps',
  survey: 'survey', surveyed: 'survey', survey_grade: 'survey',
  digitised: 'digitised', digitized: 'digitised', map: 'digitised',
  unknown: 'unknown',
};
function normaliseEnum(raw, validSet) {
  if (!raw) return null;
  const key = raw.toLowerCase().trim().replace(/[\s-]+/g, '_');
  const mapped = ENUM_ALIASES[key];
  return mapped && validSet.includes(mapped) ? mapped : null;
}

// Reads one lab-result cell into either a real measured value or a
// detection limit — never silently nothing when the cell clearly
// reported something. Real lab certificates (ALS, Bureau Veritas,
// Intertek…) write a below-detection result as "<0.01" or "< 0.01"; some
// legacy exports instead use a negative number for the same meaning
// (e.g. "-0.01" = "<0.01"). Before this, both forms failed
// validateAssayValue/parseFloat and the element just vanished from the
// sample — real lab data silently lost, and "never tested" became
// indistinguishable from "tested, came back clean".
export function parseAssayCell(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { value: null, detectionLimit: null };
  const match = text.match(/^([<≤])?\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)$/);
  if (!match) return { value: null, detectionLimit: null };
  const value = Number(match[2]);
  if (!Number.isFinite(value)) return { value: null, detectionLimit: null };
  if (match[1] || value < 0) return { value: null, detectionLimit: Math.abs(value) };
  return { value, detectionLimit: null };
}

function readAssays(cells, elementCols) {
  const assays = {}, detectionLimits = {}, reportedAssays = [];
  elementCols.forEach(({ index, element, sourceUnit, factor = 1, unitWasExplicit }) => {
    const reportedText = String(cells[index] ?? '').trim();
    if (!reportedText) return;
    if (!Number.isFinite(factor)) throw new Error(`Unknown source unit for ${element}. Use ppb, ppm, g/t or %. No data was imported.`);
    const { value, detectionLimit } = parseAssayCell(reportedText);
    if (value == null && detectionLimit == null) throw new Error(`Unresolved analytical result for ${element}: ${reportedText}. No data was imported.`);
    if (value != null) assays[element] = value * factor;
    else if (detectionLimit != null) detectionLimits[element] = detectionLimit * factor;
    reportedAssays.push({ element, reportedText, sourceUnit: sourceUnit || elementInfo(element).unit, unitWasExplicit: !!unitWasExplicit });
  });
  return { assays, detectionLimits, reportedAssays };
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
export function parseSampleCsv(text, existing, prefix, crs) {
  const rows = splitCsv(text);
  if (rows.length < 2) return { samples: [], error: 'CSV needs a header row and at least one data row.' };
  const col = headerIndex(rows[0]);
  const iId = col('sample_id', 'id');
  const iLat = col('lat', 'latitude', 'northing');
  const iLng = col('lng', 'lon', 'longitude', 'easting');
  const iLith = col('lith', 'lithology');
  const iNotes = col('notes', 'comment', 'comments');
  const iDate = col('date', 'collection_date', 'collected_at');
  const iSampleType = col('sample_type', 'sampletype', 'type');
  const iQaqc = col('qaqc_type', 'qaqc', 'qc_type');
  const iDupOf = col('duplicate_of', 'dup_of', 'original_id');
  const iCoordSrc = col('coord_source', 'coordsource', 'coord_src');
  const elementCols = detectAssayColumns(rows[0]);
  if (iLat < 0 || iLng < 0) return { samples: [], error: 'CSV needs lat/northing and lng/easting columns.' };

  const out = [];
  let pool = existing;
  // Row problems are collected per-row (with the row number) instead of
  // being silently skipped — surfaced as `warnings` so a mostly-good file
  // still imports while the user learns exactly which rows didn't.
  // `error` stays fatal-only: callers treat it as "nothing imported".
  const rowErrors = [];
  // Separate from rowErrors: these rows DO import — an unrecognised QAQC/
  // type/coord-source cell falls back to a safe default rather than
  // losing the row's assay data, but the user should still be told a
  // value didn't match anything so they can fix the source file.
  const fieldWarnings = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const rawLat = parseFloat(cells[iLat]);
    const rawLng = parseFloat(cells[iLng]);
    if (Number.isNaN(rawLat) || Number.isNaN(rawLng)) {
      rowErrors.push(`row ${r + 1}: invalid coordinates`);
      continue;
    }

    let lat = rawLat, lng = rawLng;
    if (crs) {
      ({ lat, lng } = reprojectEastingNorthing(rawLng, rawLat, crs));
    } else if (isProjectedCoord(rawLat, rawLng)) {
      return { samples: [], error: null, needsProjection: true, easting: rawLng, northing: rawLat };
    }

    if (!validateCoordinates(lat, lng)) {
      rowErrors.push(`row ${r + 1}: coordinates out of range`);
      continue;
    }

    const id = (iId >= 0 && cells[iId]) ? cells[iId] : nextId(pool, prefix);
    if (pool.some(record => record.id === id)) { rowErrors.push(`row ${r + 1}: duplicate ID ${id}`); continue; }

    let sampleType = 'rock_chip';
    if (iSampleType >= 0 && cells[iSampleType]) {
      const v = normaliseEnum(cells[iSampleType], SAMPLE_TYPES);
      if (v) sampleType = v; else fieldWarnings.push(`row ${r + 1}: unrecognised sample_type "${cells[iSampleType]}"`);
    }
    let qaqcType = 'none';
    if (iQaqc >= 0 && cells[iQaqc]) {
      const v = normaliseEnum(cells[iQaqc], QAQC_TYPES);
      if (v) qaqcType = v; else fieldWarnings.push(`row ${r + 1}: unrecognised qaqc_type "${cells[iQaqc]}"`);
    }
    let coordSource = 'unknown';
    if (iCoordSrc >= 0 && cells[iCoordSrc]) {
      const v = normaliseEnum(cells[iCoordSrc], COORD_SOURCES);
      if (v) coordSource = v; else fieldWarnings.push(`row ${r + 1}: unrecognised coord_source "${cells[iCoordSrc]}"`);
    }
    const duplicateOf = (iDupOf >= 0 && cells[iDupOf]) ? cells[iDupOf] : null;
    const { assays, detectionLimits, reportedAssays } = readAssays(cells, elementCols);

    const sample = {
      id, lat, lng,
      recordId: crypto.randomUUID(),
      reportedAssays,
      sourceRow: Object.fromEntries(rows[0].map((h,i) => [h,cells[i] ?? ''])),
      assays,
      ...(Object.keys(detectionLimits).length ? { detectionLimits } : {}),
      lith: iLith >= 0 ? cells[iLith] || '' : '',
      notes: iNotes >= 0 ? cells[iNotes] || '' : '',
      date: iDate >= 0 && cells[iDate] ? cells[iDate] : today(),
      importedAt: new Date().toISOString(),
      sampleType, qaqcType, coordSource,
      ...(duplicateOf ? { duplicateOf } : {}),
    };
    out.push(sample);
    pool = [...pool, sample];
  }
  if (!out.length) return { samples: [], error: rowErrors.length ? `No importable rows (${rowErrors.join('; ')}).` : 'No rows with valid coordinates found.' };
  const warningParts = [];
  if (rowErrors.length) warningParts.push(`Skipped ${rowErrors.length} row${rowErrors.length === 1 ? '' : 's'}: ${rowErrors.join('; ')}`);
  if (fieldWarnings.length) warningParts.push(`${fieldWarnings.length} value${fieldWarnings.length === 1 ? '' : 's'} not recognised (default applied): ${fieldWarnings.join('; ')}`);
  return { samples: out, error: null, warnings: warningParts.length ? warningParts.join(' ') : null };
}

// Drill collar CSV → collars. hole_id/id, lat/northing, lng/easting,
// azimuth/azi, dip, depth/eoh. Same projected-coordinate handling as
// parseSampleCsv (see its comment): refuses to silently mis-place MGA
// easting/northing without a confirmed `zone`.
export function parseCollarCsv(text, existing, prefix, crs) {
  const rows = splitCsv(text);
  if (rows.length < 2) return { collars: [], error: 'CSV needs a header row and at least one data row.' };
  const col = headerIndex(rows[0]);
  const iId = col('hole_id', 'id');
  const iLat = col('lat', 'latitude', 'northing');
  const iLng = col('lng', 'lon', 'longitude', 'easting');
  const iAzi = col('azimuth', 'azi');
  const iDip = col('dip');
  const iDepth = col('depth', 'eoh', 'planned_depth');
  const iNotes = col('notes', 'comment', 'comments');
  if (iLat < 0 || iLng < 0) return { collars: [], error: 'CSV needs lat/northing and lng/easting columns.' };

  const out = [];
  let pool = existing;
  const rowErrors = []; // same per-row collection contract as parseSampleCsv
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const rawLat = parseFloat(cells[iLat]);
    const rawLng = parseFloat(cells[iLng]);
    if (Number.isNaN(rawLat) || Number.isNaN(rawLng)) {
      rowErrors.push(`row ${r + 1}: invalid coordinates`);
      continue;
    }

    let lat = rawLat, lng = rawLng;
    if (crs) {
      ({ lat, lng } = reprojectEastingNorthing(rawLng, rawLat, crs));
    } else if (isProjectedCoord(rawLat, rawLng)) {
      return { collars: [], error: null, needsProjection: true, easting: rawLng, northing: rawLat };
    }

    if (!validateCoordinates(lat, lng)) {
      rowErrors.push(`row ${r + 1}: coordinates out of range`);
      continue;
    }

    const num = (i) => { const v = i >= 0 ? parseFloat(cells[i]) : NaN; return Number.isNaN(v) ? null : v; };
    const id = (iId >= 0 && cells[iId]) ? cells[iId] : nextId(pool, prefix);
    if (pool.some(record => record.id === id)) { rowErrors.push(`row ${r + 1}: duplicate ID ${id}`); continue; }
    const orientation = { azimuth: num(iAzi), dip: num(iDip), depth: num(iDepth) };
    if (Object.values(orientation).some(v => v != null && !Number.isFinite(v)) || (orientation.azimuth != null && (orientation.azimuth < 0 || orientation.azimuth >= 360)) || (orientation.dip != null && Math.abs(orientation.dip) > 90) || (orientation.depth != null && orientation.depth <= 0)) {
      rowErrors.push(`row ${r + 1}: invalid collar orientation or depth`); continue;
    }
    const collar = {
      id, recordId: crypto.randomUUID(), lat, lng, ...orientation, date: cells[col('date','collection_date')] || today(),
      notes: iNotes >= 0 ? cells[iNotes] || '' : '',
    };
    out.push(collar);
    pool = [...pool, collar];
  }
  if (!out.length) return { collars: [], error: rowErrors.length ? `No importable rows (${rowErrors.join('; ')}).` : 'No rows with valid coordinates found.' };
  return { collars: out, error: null, warnings: rowErrors.length ? `Skipped ${rowErrors.length} row${rowErrors.length === 1 ? '' : 's'}: ${rowErrors.join('; ')}` : null };
}

// Assay CSV → links lab results to existing samples by ID. Any element
// columns are read (au, ag, cu_pct, …) and merged into the sample.
export function parseAssayCsv(text, samples) {
  const rows = splitCsv(text);
  if (rows.length < 2) return { updated: null, matched: 0, unmatched: [], error: 'CSV needs a header row and at least one data row.' };
  const col = headerIndex(rows[0]);
  const iId = col('sample_id', 'id');
  const elementCols = detectAssayColumns(rows[0]);
  if (iId < 0) return { updated: null, matched: 0, unmatched: [], error: 'Assay CSV needs a sample_id column.' };
  if (!elementCols.length) return { updated: null, matched: 0, unmatched: [], error: 'No element columns found (e.g. au, ag, cu, zn…).' };

  const results = new Map();
  for (let r = 1; r < rows.length; r++) {
    const id = rows[r][iId];
    if (!id) continue;
    if (results.has(id) || samples.filter(s => s.id === id).length > 1) return {updated: null, matched: 0, unmatched: [], error: `Ambiguous or duplicate sample ID ${id}; resolve before import.`};
    const { assays, detectionLimits } = readAssays(rows[r], elementCols);
    if (Object.keys(assays).length || Object.keys(detectionLimits).length) results.set(id, { assays, detectionLimits });
  }
  let matched = 0;
  const updated = samples.map(s => {
    if (results.has(s.id)) {
      matched++;
      const incoming = results.get(s.id);
      const assays = { ...(s.assays || {}), ...incoming.assays };
      const detectionLimits = { ...(s.detectionLimits || {}), ...incoming.detectionLimits };
      // A new lab result always supersedes an older one for that element —
      // a fresh measured value clears any stale detection-limit entry
      // (and vice versa), so an element never ends up in both maps at once.
      Object.keys(incoming.assays).forEach(el => { delete detectionLimits[el]; });
      Object.keys(incoming.detectionLimits).forEach(el => { delete assays[el]; });
      results.delete(s.id);
      // Spread from a copy of `s` with any old detectionLimits key
      // stripped first — otherwise, if every element resolved to a real
      // value this round, the stale (now-empty) key would survive the
      // conditional spread below and linger in storage forever.
      const { detectionLimits: _stale, ...rest } = s;
      return { ...rest, assays, assayHistory: [...(s.assayHistory || []), { importedAt: new Date().toISOString(), source: 'legacy-csv-import', previous: { assays: s.assays || {}, detectionLimits: s.detectionLimits || {} }, incoming }], ...(Object.keys(detectionLimits).length ? { detectionLimits } : {}) };
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
  const elementCols = detectAssayColumns(rows[0]);
  if (iHole < 0 || iFrom < 0 || iTo < 0) return { intervals: [], error: 'Interval CSV needs hole_id, from and to columns.' };
  const out = [];
  const rowErrors = []; // same per-row collection contract as parseSampleCsv
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const from = parseFloat(cells[iFrom]);
    const to = parseFloat(cells[iTo]);
    if (!cells[iHole] || !Number.isFinite(from) || !Number.isFinite(to) || from < 0 || from >= to) {
      rowErrors.push(`row ${r + 1}: invalid interval`);
      continue;
    }
    const { assays, detectionLimits } = readAssays(cells, elementCols);
    out.push({ recordId: crypto.randomUUID(), ...(col('sample_id', 'bag_id') >= 0 && cells[col('sample_id', 'bag_id')] ? { sampleId: cells[col('sample_id', 'bag_id')] } : {}), holeId: cells[iHole], from, to, assays, ...(Object.keys(detectionLimits).length ? { detectionLimits } : {}) });
  }
  if (!out.length) return { intervals: [], error: rowErrors.length ? `No importable rows (${rowErrors.join('; ')}).` : 'No valid interval rows found.' };
  return { intervals: out, error: null, warnings: rowErrors.length ? `Skipped ${rowErrors.length} row${rowErrors.length === 1 ? '' : 's'}: ${rowErrors.join('; ')}` : null };
}

// Downhole survey CSV: hole_id, depth, azimuth, dip. A collar's own
// azimuth/dip is just the planned/collar orientation — a real hole
// deviates with depth, and a gyro/EMS/single-shot survey tool records
// that deviation as a series of depth-indexed readings. Stored flat
// (like intervals), keyed by hole_id, not nested inside the collar.
//
// Same per-row error-collection contract as the other CSV parsers: a bad
// row is skipped and reported, not fatal to the whole file. Azimuth is
// wrapped into 0–360 rather than rejected (a tool reading 365° or -10° is
// a units slip, not invalid data) since the actual heading is still
// unambiguous; dip is only range-checked (-90..90, vertical to horizontal)
// since a value outside that range cannot be a real inclination reading.
export function parseSurveyCsv(text) {
  const rows = splitCsv(text);
  if (rows.length < 2) return { surveys: [], error: 'CSV needs a header row and at least one data row.' };
  const col = headerIndex(rows[0]);
  const iHole = col('hole_id', 'id', 'hole');
  const iDepth = col('depth', 'depth_m');
  const iAzi = col('azimuth', 'azi');
  const iDip = col('dip');
  if (iHole < 0 || iDepth < 0 || iAzi < 0 || iDip < 0) {
    return { surveys: [], error: 'Survey CSV needs hole_id, depth, azimuth and dip columns.' };
  }
  const out = [];
  const rowErrors = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const depth = parseFloat(cells[iDepth]);
    let azimuth = parseFloat(cells[iAzi]);
    const dip = parseFloat(cells[iDip]);
    if (!cells[iHole] || !Number.isFinite(depth) || depth < 0 || !Number.isFinite(azimuth) || !Number.isFinite(dip) || dip < -90 || dip > 90) {
      rowErrors.push(`row ${r + 1}: invalid survey shot`);
      continue;
    }
    azimuth = ((azimuth % 360) + 360) % 360;
    out.push({ holeId: cells[iHole], depth, azimuth, dip });
  }
  if (!out.length) return { surveys: [], error: rowErrors.length ? `No importable rows (${rowErrors.join('; ')}).` : 'No valid survey rows found.' };
  return { surveys: out, error: null, warnings: rowErrors.length ? `Skipped ${rowErrors.length} row${rowErrors.length === 1 ? '' : 's'}: ${rowErrors.join('; ')}` : null };
}

// Geological logging CSV: hole_id, from, to, lithology, alteration,
// structure, notes. This is the geologist's own from-to observation of
// core/chips in hand — distinct from the assay-interval table, which only
// carries lab grades for a from-to. Same flat-array-keyed-by-hole shape
// and same per-row error-collection contract as intervals/surveys: a bad
// row (missing hole, non-numeric or inverted from/to) is skipped and
// reported, not fatal to the whole file. Only hole_id/from/to are
// required — lithology/alteration/structure/notes are free text and any
// subset may be blank (a geologist logging structure only, with lithology
// logged separately, is a normal real-world split).
export function parseGeologyCsv(text) {
  const rows = splitCsv(text);
  if (rows.length < 2) return { geology: [], error: 'CSV needs a header row and at least one data row.' };
  const col = headerIndex(rows[0]);
  const iHole = col('hole_id', 'id', 'hole');
  const iFrom = col('from', 'from_m');
  const iTo = col('to', 'to_m');
  const iLith = col('lithology', 'lith');
  const iAlt = col('alteration', 'alt');
  const iStruct = col('structure', 'struct');
  const iNotes = col('notes', 'comment', 'comments');
  if (iHole < 0 || iFrom < 0 || iTo < 0) return { geology: [], error: 'Geology CSV needs hole_id, from and to columns.' };
  const out = [];
  const rowErrors = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const from = parseFloat(cells[iFrom]);
    const to = parseFloat(cells[iTo]);
    if (!cells[iHole] || !Number.isFinite(from) || !Number.isFinite(to) || from < 0 || from >= to) {
      rowErrors.push(`row ${r + 1}: invalid geology interval`);
      continue;
    }
    out.push({
      holeId: cells[iHole], from, to,
      lithology: iLith >= 0 ? cells[iLith] || '' : '',
      alteration: iAlt >= 0 ? cells[iAlt] || '' : '',
      structure: iStruct >= 0 ? cells[iStruct] || '' : '',
      notes: iNotes >= 0 ? cells[iNotes] || '' : '',
    });
  }
  if (!out.length) return { geology: [], error: rowErrors.length ? `No importable rows (${rowErrors.join('; ')}).` : 'No valid geology rows found.' };
  return { geology: out, error: null, warnings: rowErrors.length ? `Skipped ${rowErrors.length} row${rowErrors.length === 1 ? '' : 's'}: ${rowErrors.join('; ')}` : null };
}

// One CSV cell for an element on a sample/interval: the real value if
// measured, "<0.01"-style if only a detection limit was recorded, or a
// blank if that element was never analysed at all — so exporting and
// re-importing is lossless instead of silently dropping BDL results.
function assayCsvCell(record, el) {
  const v = record.assays?.[el];
  if (v != null) return v;
  const dl = record.detectionLimits?.[el];
  return dl != null ? `<${dl}` : '';
}

// sample_type/qaqc_type/duplicate_of/coord_source round-trip through
// export/import — a report or handover CSV needs this provenance to be
// usable by a Competent Person, not just the grades.
export function samplesToCsv(samples) {
  const elements = [...new Set(samples.flatMap(s => [...Object.keys(s.assays || {}), ...Object.keys(s.detectionLimits || {})]))];
  const header = ['sample_id', 'lat', 'lng', ...elements.map(e => `${e}_${elementInfo(e).unit === '%' ? 'pct' : elementInfo(e).unit === 'g/t' ? 'gpt' : elementInfo(e).unit}`), 'lithology', 'notes', 'sample_type', 'qaqc_type', 'duplicate_of', 'coord_source', 'date'];
  return [
    header.join(','),
    ...samples.map(s => [
      s.id, s.lat, s.lng,
      ...elements.map(e => assayCsvCell(s, e)),
      s.lith || '', s.notes || '',
      s.sampleType || 'rock_chip', s.qaqcType || 'none', s.duplicateOf || '', s.coordSource || 'unknown',
      s.date || '',
    ].map(v => csvRow([v])).join(',')),
  ].join('\n');
}

// The downhole assay-interval table — the from-to-grade record a
// Competent Person or a modeling consultant actually needs — was
// previously not exportable at all; only the collar list (id/location/
// orientation) had a CSV export. A drill program's real results being
// unable to leave the app once entered is a data-preservation gap, not
// a cosmetic one. Same detection-limit-aware cell format as samplesToCsv.
export function intervalsToCsv(intervals) {
  const elements = [...new Set(intervals.flatMap(i => [...Object.keys(i.assays || {}), ...Object.keys(i.detectionLimits || {})]))];
  const header = ['hole_id', 'sample_id', 'from', 'to', 'width_m', ...elements.map(e => `${e}_${elementInfo(e).unit === '%' ? 'pct' : elementInfo(e).unit === 'g/t' ? 'gpt' : elementInfo(e).unit}`)];
  return [
    header.join(','),
    ...intervals.map(i => [
      i.holeId, i.sampleId || '', i.from, i.to, (i.to - i.from).toFixed(2),
      ...elements.map(e => assayCsvCell(i, e)),
    ].map(v => csvRow([v])).join(',')),
  ].join('\n');
}

// The downhole survey record — previously no way at all to capture or
// export a hole's actual deviation, only its planned collar orientation.
export function surveysToCsv(surveys) {
  const sorted = [...surveys].sort((a, b) => a.holeId.localeCompare(b.holeId) || a.depth - b.depth);
  return [
    'hole_id,depth,azimuth,dip',
    ...sorted.map(s => [s.holeId, s.depth, s.azimuth, s.dip].map(v => csvRow([v])).join(',')),
  ].join('\n');
}

// The geological log — lithology/alteration/structure by from-to — same
// gap as intervals/surveys had before their own exports: previously no
// way to get logging data back out once entered. Free-text fields use the
// same comma-to-semicolon escaping as samplesToCsv's notes column, since
// this is a plain-comma CSV writer, not a quoting one.
export function geologyToCsv(geology) {
  const esc = (v) => v || '';
  return [
    'hole_id,from,to,lithology,alteration,structure,notes',
    ...[...geology].sort((a, b) => a.holeId.localeCompare(b.holeId) || a.from - b.from).map(g => [
      g.holeId, g.from, g.to, esc(g.lithology), esc(g.alteration), esc(g.structure), esc(g.notes),
    ].map(v => csvRow([v])).join(',')),
  ].join('\n');
}

export function collarsToCsv(collars) {
  return [
    'hole_id,lat,lng,azimuth,dip,depth,notes,date',
    ...collars.map(c => [
      c.id, c.lat, c.lng, c.azimuth ?? '', c.dip ?? '', c.depth ?? '',
      c.notes || '', c.date || '',
    ].map(v => csvRow([v])).join(',')),
  ].join('\n');
}

// The target worklist as a report-grade CSV: every promoted target with
// its pipeline status, score, seeding element, linked samples, and the
// evidence that flagged it. This is what makes the program export a
// complete handover — the worklist is the exploration program, not a
// by-product of it.
export function targetsToCsv(targets) {
  const header = 'target_id,lat,lng,status,score,element,linked_samples,flagged,evidence';
  return [
    header,
    ...targets.map(t => [
      t.id, t.lat, t.lng, t.status, t.score ?? '',
      t.provenance?.element || '',
      (t.linkedSampleIds || []).join(' '),
      t.provenance?.analysedAt || t.createdAt || '',
      `"${evidenceSummary(t).replace(/"/g, "'")}"`,
    ].map(v => csvRow([v])).join(',')),
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

// ── Undo / redo ────────────────────────────────────────────────────────
// Snapshot-based history over the whole store. Module-level state is
// fine here because the store itself is a singleton (one workspace per
// page). Snapshots are deep clones — the store is plain JSON data and
// small enough (localStorage-scale) that cloning per mutation is cheap.
//
// Contract: callers push a snapshot BEFORE mutating; undo(current) and
// redo(current) both take the caller's current state so the opposite
// stack always receives the state being navigated away from — the part
// a naive implementation gets wrong, corrupting history on the first
// undo→redo→undo round trip.
let undoStack = [];
let redoStack = [];
const MAX_UNDO = 20;
const cloneStore = (s) => JSON.parse(JSON.stringify(s));

export function pushUndo(state) {
  undoStack.push(cloneStore(state));
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack = []; // a new action invalidates the redo branch
}

export function undo(currentState) {
  if (!undoStack.length) return null;
  redoStack.push(cloneStore(currentState));
  return undoStack.pop();
}

export function redo(currentState) {
  if (!redoStack.length) return null;
  undoStack.push(cloneStore(currentState));
  return redoStack.pop();
}

export function undoAvailable() {
  return undoStack.length > 0;
}

export function redoAvailable() {
  return redoStack.length > 0;
}

export function clearUndo() {
  undoStack = [];
  redoStack = [];
}
