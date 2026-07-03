// ── Terrain flow analysis ──────────────────────────────────────────────
// Drainage + alluvial-trap targeting from open elevation data.
//
// Data: Mapzen/AWS Terrain Tiles ("terrarium" encoding), a free global
// DEM served as PNG tiles. Decoded in the browser; no server, no keys.
//
// Model: D8 steepest-descent flow routing with flow accumulation.
// A trap target is a stream cell where the channel gradient flattens
// after steep upstream ground — the classic energy-drop setting where
// heavy minerals (gold) settle. Cells downstream of the user's own
// anomalous/high-grade samples are flagged as priority targets.
//
// This is a deterministic terrain heuristic, not a resource estimate —
// targets are for field-checking with a detector, nothing more.

const TILE_URL = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const TILE = 256;
const MAX_TILES = 16; // 4×4 → 1024×1024 cells max

// ── Slippy-map helpers ─────────────────────────────────────────────────
const lng2tile = (lng, z) => ((lng + 180) / 360) * 2 ** z;
const lat2tile = (lat, z) => ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z;
const tile2lng = (x, z) => (x / 2 ** z) * 360 - 180;
const tile2lat = (y, z) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

function loadTile(z, x, y) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('tile'));
    img.src = TILE_URL(z, x, y);
  });
}

// ── Core hydrology (pure — unit-testable without a browser) ────────────
// D8 flow directions + accumulation + upstream-max-slope + seed
// propagation, all in one elevation-ordered pass.
export function computeFlow(elev, w, h, cellSize, seeds) {
  const n = w * h;
  const down = new Int32Array(n).fill(-1);
  const slope = new Float32Array(n);
  const dx = [-1, 0, 1, -1, 1, -1, 0, 1];
  const dy = [-1, -1, -1, 0, 0, 1, 1, 1];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let best = -1, bestDrop = 0;
      for (let k = 0; k < 8; k++) {
        const nx = x + dx[k], ny = y + dy[k];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        const dist = (dx[k] && dy[k]) ? 1.41421356 : 1;
        const drop = (elev[i] - elev[j]) / (dist * cellSize);
        if (drop > bestDrop) { bestDrop = drop; best = j; }
      }
      down[i] = best;
      slope[i] = bestDrop;
    }
  }

  // Process cells from highest to lowest so upstream is always done first.
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => elev[b] - elev[a]);
  const accum = new Float32Array(n).fill(1);
  const upSlope = Float32Array.from(slope);
  const goldPath = new Uint8Array(n);
  if (seeds) seeds.forEach(i => { if (i >= 0 && i < n) goldPath[i] = 1; });

  for (const i of order) {
    const j = down[i];
    if (j < 0) continue;
    accum[j] += accum[i];
    if (upSlope[i] > upSlope[j]) upSlope[j] = upSlope[i];
    if (goldPath[i]) goldPath[j] = 1;
  }
  return { accum, slope, upSlope, goldPath, down };
}

// Trap targets: on-stream, locally flat, steep upstream. Thinned to the
// strongest cell per window so the map shows targets, not noise.
export function findTargets(flow, w, h, opts = {}) {
  const { accum, slope, upSlope, goldPath } = flow;
  const streamThresh = opts.streamThresh ?? Math.max(80, w * h * 0.0008);
  const flatMax = opts.flatMax ?? 0.06;
  const steepMin = opts.steepMin ?? 0.10;
  const win = opts.window ?? 24;
  const maxTargets = opts.maxTargets ?? 25;

  const raw = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (accum[i] < streamThresh) continue;
      if (slope[i] > flatMax) continue;
      if (upSlope[i] < steepMin) continue;
      const score = (upSlope[i] - slope[i]) * Math.log10(accum[i]) * (goldPath[i] ? 2 : 1);
      raw.push({ x, y, i, score, gold: !!goldPath[i] });
    }
  }
  // Keep the best per window
  const byWindow = new Map();
  raw.forEach(t => {
    const key = `${Math.floor(t.x / win)}:${Math.floor(t.y / win)}`;
    const cur = byWindow.get(key);
    if (!cur || t.score > cur.score) byWindow.set(key, t);
  });
  return [...byWindow.values()].sort((a, b) => b.score - a.score).slice(0, maxTargets);
}

// ── Overlay rendering ──────────────────────────────────────────────────
export function renderOverlay(flow, w, h) {
  const { accum } = flow;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const streamThresh = Math.max(80, w * h * 0.0008);
  const logMax = Math.log10(w * h);
  for (let i = 0; i < w * h; i++) {
    if (accum[i] < streamThresh * 0.35) continue;
    const t = Math.min(1, Math.log10(accum[i]) / logMax);
    const p = i * 4;
    // Desaturated water blue, stronger with accumulation
    img.data[p] = 62; img.data[p + 1] = 108; img.data[p + 2] = 140;
    img.data[p + 3] = accum[i] >= streamThresh ? 120 + t * 135 : 60;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// ── Orchestrator: analyse the current map view ─────────────────────────
// Returns { url, bounds, targets:[{lat,lng,score,gold}] } or throws.
export async function analyzeViewport(map, samples) {
  const mapZoom = Math.round(map.getZoom());
  let z = Math.max(10, Math.min(13, mapZoom));
  const b = map.getBounds();

  let x0, x1, y0, y1;
  for (;;) {
    x0 = Math.floor(lng2tile(b.getWest(), z));
    x1 = Math.floor(lng2tile(b.getEast(), z));
    y0 = Math.floor(lat2tile(b.getNorth(), z));
    y1 = Math.floor(lat2tile(b.getSouth(), z));
    if ((x1 - x0 + 1) * (y1 - y0 + 1) <= MAX_TILES || z <= 8) break;
    z--;
  }

  const cols = x1 - x0 + 1, rows = y1 - y0 + 1;
  const w = cols * TILE, h = rows * TILE;

  const tiles = await Promise.all(
    Array.from({ length: cols * rows }, (_, k) => {
      const tx = x0 + (k % cols), ty = y0 + Math.floor(k / cols);
      return loadTile(z, tx, ty).then(img => ({ img, tx, ty }));
    })
  );

  const demCanvas = document.createElement('canvas');
  demCanvas.width = w; demCanvas.height = h;
  const demCtx = demCanvas.getContext('2d', { willReadFrequently: true });
  tiles.forEach(({ img, tx, ty }) => demCtx.drawImage(img, (tx - x0) * TILE, (ty - y0) * TILE));
  const data = demCtx.getImageData(0, 0, w, h).data;

  const elev = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    elev[i] = data[p] * 256 + data[p + 1] + data[p + 2] / 256 - 32768;
  }

  const north = tile2lat(y0, z), south = tile2lat(y1 + 1, z);
  const west = tile2lng(x0, z), east = tile2lng(x1 + 1, z);
  const midLat = (north + south) / 2;
  const metersPerPixel = (156543.03 * Math.cos((midLat * Math.PI) / 180)) / 2 ** z;

  // Seed cells at the user's anomalous/high-grade samples
  const px = (lat, lng) => {
    const fx = (lng2tile(lng, z) - x0) * TILE;
    const fy = (lat2tile(lat, z) - y0) * TILE;
    const xi = Math.round(fx), yi = Math.round(fy);
    return (xi >= 0 && yi >= 0 && xi < w && yi < h) ? yi * w + xi : -1;
  };
  const seeds = (samples || []).map(s => px(s.lat, s.lng)).filter(i => i >= 0);

  const flow = computeFlow(elev, w, h, metersPerPixel, seeds);
  const targets = findTargets(flow, w, h).map(t => ({
    lat: tile2lat(y0 + t.y / TILE, z),
    lng: tile2lng(x0 + t.x / TILE, z),
    score: t.score,
    gold: t.gold,
  }));

  const canvas = renderOverlay(flow, w, h);
  return {
    url: canvas.toDataURL('image/png'),
    bounds: [[south, west], [north, east]],
    targets,
    zoom: z,
  };
}
