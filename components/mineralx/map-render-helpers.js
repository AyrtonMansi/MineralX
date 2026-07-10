// Pure, side-effect-free rendering helpers for the MapLibre workspace —
// DOM/string builders and styling lookups with no closure over component
// state or MapLibre instances. Split out of MineralXWorkspace.jsx purely
// to keep that file's size down; nothing here changed behavior.
import { PROJECT_COLORS, formatAssay, evidenceSummary } from './project-store';

export { evidenceSummary }; // re-exported for callers already importing it from here

// WMS GetMap request built by hand for a MapLibre raster source — there's
// no L.tileLayer.wms equivalent; {bbox-epsg-3857} is a MapLibre-native
// tile-URL token it substitutes per-tile.
export const wmsTileUrl = (layer) =>
  `${layer.url}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=${layer.wmsLayers}&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}`;

// A small DOM marker used for every point feature (samples, collars,
// trap targets, occurrences, historic mines) — one consistent shape
// across the app, each with its own hover label (reusing .lx-tip) and
// an optional click-popup, matching Leaflet's per-marker bindTooltip/
// bindPopup pattern this app used before the MapLibre migration.
export function buildMarkerEl(swatchStyle, tipText) {
  const el = document.createElement('div');
  el.className = 'mx-mgl-marker';
  const dot = document.createElement('div');
  dot.className = 'mx-mgl-dot';
  Object.assign(dot.style, swatchStyle);
  el.appendChild(dot);
  if (tipText) {
    const tip = document.createElement('div');
    tip.className = 'lx-tip';
    tip.textContent = tipText;
    el.appendChild(tip);
  }
  return el;
}

export function boundsOfCoords(maplibregl, coords) {
  const bounds = new maplibregl.LngLatBounds([coords[0][1], coords[0][0]], [coords[0][1], coords[0][0]]);
  coords.forEach(([lat, lng]) => bounds.extend([lng, lat]));
  return bounds;
}

// Convert `grid.bounds`'s 2-corner Leaflet-style shape ([[south,west],
// [north,east]]) into MapLibre image-source's required 4-corner order:
// top-left, top-right, bottom-right, bottom-left.
export function imageCoordsFromBounds(bounds) {
  const [[south, west], [north, east]] = bounds;
  return [[west, north], [east, north], [east, south], [west, south]];
}

export const gradeRadius = (g) => (g === 'high' ? 9 : g === 'anom' ? 7.5 : 6);
export const esc = (t) => String(t || '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

// Terrain trap-target styling by provenance (pure — no component state).
const COMMODITY_COLORS = { Gold: '#B08A3E' };
export const commodityColor = (name, idx) => COMMODITY_COLORS[name] || PROJECT_COLORS[(idx + 1) % PROJECT_COLORS.length];

export const targetStyle = (t) => {
  if (t.sample && t.occurrence) return { radius: 10, weight: 3, color: PROJECT_COLORS[4], fillColor: '#C15F3C' };
  if (t.occurrence) return { radius: 7.5, weight: 2, color: '#FAF9F4', fillColor: PROJECT_COLORS[4] };
  if (t.sample) return { radius: 8, weight: 2, color: '#FAF9F4', fillColor: '#C15F3C' };
  return { radius: 6.5, weight: 2, color: '#FAF9F4', fillColor: '#8A6A3E' };
};
export const targetLabel = (t) => {
  if (t.sample && t.occurrence) return 'Correlated target · downstream of a known Gold occurrence and your sample';
  if (t.occurrence) return 'Trap target · downstream of a known Gold occurrence';
  if (t.sample) return 'Trap target · downstream of your anomalous samples';
  return 'Alluvial trap target';
};

// ── Promoted targets ───────────────────────────────────────────────────
// Status → label + colour for a promoted target. These are the user's own
// committed worklist items (persisted in the store), distinct from the
// ephemeral analysis candidates above. Colour tracks the target through
// the exploration cycle so its state reads off the map at a glance.
export const TARGET_STATUS_META = {
  proposed: { label: 'Proposed', color: '#B08A3E' },
  planned: { label: 'Planned', color: '#3E6C8C' },
  visited: { label: 'Visited', color: '#6E7A5E' },
  sampled: { label: 'Sampled', color: '#5E6E7A' },
  confirmed: { label: 'Confirmed', color: '#C15F3C' },
  barren: { label: 'Barren', color: '#8A857A' },
};

export const targetStatusMeta = (status) => TARGET_STATUS_META[status] || TARGET_STATUS_META.proposed;

// A promoted target's map marker: a diamond in its status colour, visually
// distinct from round sample dots and the white collar squares.
export function buildTargetMarkerEl(t) {
  const el = document.createElement('div');
  el.className = 'mx-mgl-marker mx-target-marker-wrap';
  const dot = document.createElement('div');
  dot.className = 'mx-target-marker';
  dot.style.background = targetStatusMeta(t.status).color;
  el.appendChild(dot);
  const tip = document.createElement('div');
  tip.className = 'lx-tip';
  tip.textContent = `${t.id} · ${targetStatusMeta(t.status).label}`;
  el.appendChild(tip);
  return el;
}

export function targetPopupHtml(t) {
  const meta = targetStatusMeta(t.status);
  const when = t.provenance?.analysedAt || t.createdAt || '';
  const linked = (t.linkedSampleIds || []).length;
  return `
    <div class="mx-pop">
      <div class="mx-pop-id">${esc(t.id)}</div>
      <div class="mx-pop-assay"><strong>Target · ${meta.label}</strong></div>
      <div class="mx-pop-row">${esc(evidenceSummary(t))}</div>
      <div class="mx-pop-notes">Score ${Number(t.score ?? 0).toFixed(1)}${linked ? ` · ${linked} linked sample${linked === 1 ? '' : 's'}` : ''}${when ? ` · flagged ${esc(when)}` : ''}</div>
      <div class="mx-pop-coords">${t.lat.toFixed(4)}, ${t.lng.toFixed(4)}</div>
    </div>`;
}

export function samplePopupHtml(s) {
  const entries = Object.entries(s.assays || {});
  const assayLine = entries.length
    ? `<strong>${entries.map(([el, v]) => formatAssay(el, v)).join(' · ')}</strong>`
    : '<span class="mx-pop-pending">awaiting assay</span>';
  return `
    <div class="mx-pop">
      <div class="mx-pop-id">${esc(s.id)}</div>
      <div class="mx-pop-assay">${assayLine}</div>
      ${s.lith ? `<div class="mx-pop-row">${esc(s.lith)}</div>` : ''}
      ${s.notes ? `<div class="mx-pop-notes">${esc(s.notes)}</div>` : ''}
      ${s.photo ? `<img class="mx-pop-photo" src="${s.photo}" alt="${esc(s.id)}" />` : ''}
      <div class="mx-pop-coords">${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}${s.date ? ` · ${s.date}` : ''}</div>
    </div>`;
}

export function collarPopupHtml(c, intervals, element) {
  const holeIntervals = intervals.filter((i) => i.holeId === c.id);
  const best = holeIntervals.reduce((b, i) => {
    const v = i.assays?.[element];
    return v != null && (b == null || v > b.assays[element]) ? i : b;
  }, null);
  return `
    <div class="mx-pop">
      <div class="mx-pop-id">${esc(c.id)}</div>
      <div class="mx-pop-assay"><strong>${c.depth != null ? `${c.depth} m` : 'Drill hole'}</strong>${c.azimuth != null ? ` · ${c.azimuth}°/${c.dip ?? '?'}°` : ''}</div>
      ${holeIntervals.length ? `<div class="mx-pop-row">${holeIntervals.length} assay interval${holeIntervals.length === 1 ? '' : 's'}</div>` : '<div class="mx-pop-notes">No downhole assays yet</div>'}
      ${best ? `<div class="mx-pop-notes">Best: ${formatAssay(element, best.assays[element])} · ${best.from}–${best.to} m</div>` : ''}
      <div class="mx-pop-coords">${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}${c.date ? ` · ${c.date}` : ''}</div>
    </div>`;
}
