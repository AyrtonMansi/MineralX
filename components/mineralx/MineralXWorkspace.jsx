'use client';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import {
  LAYER_TYPES, PUBLIC_DATA_CATALOG, createDemoProject, createPublicDataTree,
  DEMO_SAMPLES, DEMO_COLLARS, DEMO_BOUNDARY, gradeOf, GRADE_COLORS,
} from './layer-data';
import { MxIcons } from './MineralXIcons';
import ManageDrawer from './ManageDrawer';

// ── Tree reducer ───────────────────────────────────────────────────────
function layerReducer(state, action) {
  switch (action.type) {
    case 'TOGGLE_VISIBLE': return toggleVisible(state, action.id);
    case 'TOGGLE_EXPANDED': return toggleExpanded(state, action.id);
    case 'ADD_PUBLIC_LAYER': return addPublicWmsLayer(state, action.layer);
    default: return state;
  }
}

function findAndUpdate(nodes, id, updater) {
  return nodes.map(n => {
    if (n.id === id) return updater(n);
    if (n.children?.length) return { ...n, children: findAndUpdate(n.children, id, updater) };
    return n;
  });
}

function toggleVisible(state, id) {
  return findAndUpdate(state, id, n => ({ ...n, visible: !n.visible }));
}

function toggleExpanded(state, id) {
  return findAndUpdate(state, id, n => ({ ...n, expanded: !n.expanded }));
}

function addPublicWmsLayer(state, layer) {
  return state.map(n => {
    if (n.type === LAYER_TYPES.PUBLIC_GROUP) {
      return { ...n, children: [...n.children, { ...layer, type: LAYER_TYPES.PUBLIC_LAYER, visible: true, expanded: false, children: [] }] };
    }
    return n;
  });
}

function findNode(nodes, id) {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children?.length) {
      const found = findNode(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

// ── Sample persistence (browser-local until a backend exists) ──────────
const STORAGE_KEY = 'mx-samples-v1';

function loadSamples() {
  if (typeof window === 'undefined') return DEMO_SAMPLES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch { /* corrupted storage — fall back to demo */ }
  return DEMO_SAMPLES;
}

// Next auto-ID from the highest numeric suffix on the shared prefix.
export function nextSampleId(samples, prefix = 'TN-RC-') {
  let max = 0;
  samples.forEach(s => {
    if (s.id?.startsWith(prefix)) {
      const n = parseInt(s.id.slice(prefix.length), 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  });
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

const BASEMAP_TILES = {
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  topo: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
};

const gradeRadius = (g) => g === 'high' ? 9 : g === 'anom' ? 7.5 : 6;

function samplePopupHtml(s) {
  const g = gradeOf(s.au);
  const assay = g === 'pending'
    ? '<span class="mx-pop-pending">awaiting assay</span>'
    : `<strong>${s.au} g/t Au</strong>`;
  const esc = (t) => String(t || '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  return `
    <div class="mx-pop">
      <div class="mx-pop-id">${esc(s.id)}</div>
      <div class="mx-pop-assay">${assay}</div>
      ${s.lith ? `<div class="mx-pop-row">${esc(s.lith)}</div>` : ''}
      ${s.notes ? `<div class="mx-pop-notes">${esc(s.notes)}</div>` : ''}
      <div class="mx-pop-coords">${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}</div>
    </div>`;
}

// ── CSV parsing (shared by upload panel and manage drawer) ─────────────
// Minimal CSV: comma-separated, first row headers. Recognised headers
// (case-insensitive): sample_id/id, lat/northing, lng/lon/easting,
// au/au_ppm/au_gpt, lith/lithology, notes.
export function parseSampleCsv(text, existing) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { samples: [], error: 'CSV needs a header row and at least one data row.' };
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const col = (...names) => headers.findIndex(h => names.includes(h));
  const iId = col('sample_id', 'id');
  const iLat = col('lat', 'latitude', 'northing');
  const iLng = col('lng', 'lon', 'longitude', 'easting');
  const iAu = col('au', 'au_ppm', 'au_gpt', 'au_g_t');
  const iLith = col('lith', 'lithology');
  const iNotes = col('notes', 'comment', 'comments');
  if (iLat < 0 || iLng < 0) return { samples: [], error: 'CSV needs lat/northing and lng/easting columns.' };

  const out = [];
  let pool = existing;
  for (let r = 1; r < lines.length; r++) {
    const cells = lines[r].split(',').map(c => c.trim());
    const lat = parseFloat(cells[iLat]);
    const lng = parseFloat(cells[iLng]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
    const auRaw = iAu >= 0 ? parseFloat(cells[iAu]) : NaN;
    const id = (iId >= 0 && cells[iId]) ? cells[iId] : nextSampleId(pool);
    const sample = {
      id, lat, lng,
      au: Number.isNaN(auRaw) ? null : auRaw,
      lith: iLith >= 0 ? cells[iLith] || '' : '',
      notes: iNotes >= 0 ? cells[iNotes] || '' : '',
    };
    out.push(sample);
    pool = [...pool, sample];
  }
  if (!out.length) return { samples: [], error: 'No rows with valid coordinates found.' };
  return { samples: out, error: null };
}

// ── Main component ─────────────────────────────────────────────────────
export default function MineralXWorkspace() {
  const [tree, dispatch] = useReducer(layerReducer, null, () => [createDemoProject(), createPublicDataTree()]);
  const [samples, setSamples] = useState(loadSamples);
  const [activePanel, setActivePanel] = useState('home');
  const [manageNode, setManageNode] = useState(null);
  const [basemap, setBasemap] = useState('satellite');
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const baseLayer = useRef(null);
  const groups = useRef({});
  const leaflet = useRef(null);

  const stats = useMemo(() => ({
    chips: samples.length,
    holes: DEMO_COLLARS.length,
    pending: samples.filter(s => gradeOf(s.au) === 'pending').length,
  }), [samples]);

  const onToggleVisible = useCallback((id) => dispatch({ type: 'TOGGLE_VISIBLE', id }), []);
  const onToggleExpanded = useCallback((id) => dispatch({ type: 'TOGGLE_EXPANDED', id }), []);
  const onManage = useCallback((node) => setManageNode(node), []);
  const onCloseManage = useCallback(() => setManageNode(null), []);
  const onAddPublicLayer = useCallback((layer) => dispatch({ type: 'ADD_PUBLIC_LAYER', layer }), []);

  const onAddSamples = useCallback((newOnes) => {
    setSamples(prev => [...prev, ...newOnes]);
    const map = mapInstance.current;
    if (map && newOnes.length) {
      const last = newOnes[newOnes.length - 1];
      map.panTo([last.lat, last.lng]);
    }
  }, []);

  // Persist samples
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(samples)); } catch { /* quota */ }
  }, [samples]);

  // Leaflet bootstrap: bundled import (client-only), then init map + layer groups.
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || mapInstance.current) return;
      leaflet.current = L;
      const map = L.map(mapRef.current, {
        zoomControl: false, attributionControl: false,
        center: [-20.55, 129.745], zoom: 13,
      });
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      baseLayer.current = L.tileLayer(BASEMAP_TILES.satellite, { maxZoom: 19 }).addTo(map);

      groups.current = {
        chips: L.layerGroup().addTo(map),
        holes: L.layerGroup().addTo(map),
        boundary: L.layerGroup().addTo(map),
      };

      L.polygon(DEMO_BOUNDARY, {
        color: '#F6F3EC', weight: 2, dashArray: '7 7', fillColor: '#C15F3C', fillOpacity: 0.06,
      }).addTo(groups.current.boundary);

      DEMO_COLLARS.forEach(c => {
        const icon = L.divIcon({ className: '', iconSize: [14, 14], html: '<div style="width:12px;height:12px;background:#F3F1E9;border:2px solid #211E1A;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>' });
        L.marker([c.lat, c.lng], { icon })
          .bindTooltip(c.id, { className: 'lx-tip', direction: 'top', offset: [0, -8] })
          .addTo(groups.current.holes);
      });

      mapInstance.current = map;
      setMapReady(true);
      setTimeout(() => map.invalidateSize(), 250);
    })();
    return () => { cancelled = true; };
  }, []);

  // Sync rock-chip markers with sample data.
  useEffect(() => {
    if (!mapReady || !leaflet.current) return;
    const L = leaflet.current;
    const group = groups.current.chips;
    group.clearLayers();
    samples.forEach(s => {
      const g = gradeOf(s.au);
      L.circleMarker([s.lat, s.lng], {
        radius: gradeRadius(g),
        color: g === 'pending' ? '#8A857A' : '#FAF9F4',
        weight: 2,
        dashArray: g === 'pending' ? '2 3' : null,
        fillColor: GRADE_COLORS[g],
        fillOpacity: g === 'pending' ? 0.55 : 1,
      })
        .bindTooltip(s.id, { className: 'lx-tip', direction: 'top', offset: [0, -6] })
        .bindPopup(samplePopupHtml(s), { className: 'mx-popup', closeButton: false, maxWidth: 240 })
        .addTo(group);
    });
  }, [samples, mapReady]);

  // Sync layer visibility (eye toggles) with the map.
  useEffect(() => {
    if (!mapReady) return;
    const map = mapInstance.current;
    const project = findNode(tree, 'proj-1');
    [['chips', 'rc-1'], ['holes', 'dh-1'], ['boundary', 'bnd-1']].forEach(([key, nodeId]) => {
      const node = findNode(tree, nodeId);
      const show = Boolean(project?.visible && node?.visible);
      const group = groups.current[key];
      if (!group) return;
      if (show && !map.hasLayer(group)) map.addLayer(group);
      if (!show && map.hasLayer(group)) map.removeLayer(group);
    });
  }, [tree, mapReady]);

  // Sync basemap toggle with the tile layer.
  useEffect(() => {
    if (!mapReady || !baseLayer.current) return;
    baseLayer.current.setUrl(BASEMAP_TILES[basemap] || BASEMAP_TILES.satellite);
  }, [basemap, mapReady]);

  return (
    <div className="mx-workspace">
      {/* MAP */}
      <div ref={mapRef} className="mx-map" />

      {/* TOP BAR */}
      <div className="mx-topbar">
        <div className="mx-topbar-brand">
          <div className="mx-diamond" />
          <span className="mx-brand-text">MineralX</span>
        </div>
        <div className="mx-topbar-sep" />
        <div className="mx-topbar-program">
          <span className="mx-program-name">Tanami program</span>
          <span className="mx-program-count">{tree.filter(n => n.type === LAYER_TYPES.PROJECT).length} projects</span>
          <span className="mx-program-caret">&#9662;</span>
        </div>
        <div style={{ flex: 1 }} />
        <div className="mx-topbar-search">
          <div className="mx-diamond mx-diamond-sm" />
          <span className="mx-search-placeholder">Ask about this program — &ldquo;high-grade chips near a fault&rdquo;</span>
        </div>
        <div className="mx-topbar-user">
          <span>&#9671;</span>
          <div className="mx-avatar">AM</div>
        </div>
      </div>

      {/* LEFT PANEL */}
      <div className="mx-panel">
        {activePanel === 'home' && (
          <HomePanel stats={stats} onUpload={() => setActivePanel('upload')} onLayers={() => setActivePanel('layers')} onClose={() => setActivePanel(null)} />
        )}
        {activePanel === 'upload' && (
          <UploadPanel onClose={() => setActivePanel(null)} samples={samples} onAddSamples={onAddSamples} />
        )}
        {activePanel === 'layers' && (
          <LayersPanel
            tree={tree}
            counts={{ 'rc-1': stats.chips, 'dh-1': stats.holes }}
            basemap={basemap}
            setBasemap={setBasemap}
            onToggleVisible={onToggleVisible}
            onToggleExpanded={onToggleExpanded}
            onManage={onManage}
            onClose={() => setActivePanel(null)}
          />
        )}
      </div>

      {/* MANAGE DRAWER (right side) */}
      {manageNode && (
        <ManageDrawer
          node={manageNode}
          onClose={onCloseManage}
          catalog={PUBLIC_DATA_CATALOG}
          onAddPublicLayer={onAddPublicLayer}
          samples={samples}
          onAddSamples={onAddSamples}
        />
      )}

      {/* DOCK */}
      <div className="mx-dock">
        <DockBtn icon={<svg width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M11 3 L19 11 L11 19 L3 11 Z" /></svg>} title="Program" active={activePanel === 'home'} onClick={() => setActivePanel(activePanel === 'home' ? null : 'home')} />
        <DockBtn icon={<svg width="20" height="20" viewBox="0 0 22 22"><circle cx="11" cy="11" r="5.5" fill="currentColor" /></svg>} title="Rock chips" active={false} onClick={() => setManageNode(findNode(tree, 'rc-1'))} />
        <DockBtn icon={<svg width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="7.5" y="4" width="7" height="5" rx="1" /><path d="M11 9 L11 19" /></svg>} title="Drill holes" active={false} onClick={() => setManageNode(findNode(tree, 'dh-1'))} />
        <DockBtn icon={<svg width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 17 L6 12" /><path d="M11 17 L11 6" /><path d="M16 17 L16 13" /></svg>} title="Assays" active={false} onClick={() => setActivePanel('home')} />
        <DockBtn icon={<svg width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M11 3 L19 7.5 L11 12 L3 7.5 Z" /><path d="M3 12 L11 16.5 L19 12" /></svg>} title="Layers" active={activePanel === 'layers'} onClick={() => setActivePanel(activePanel === 'layers' ? null : 'layers')} />
        <div className="mx-dock-sep" />
        <DockBtn icon={<svg width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4 L11 13" /><path d="M7 8 L11 4 L15 8" /><path d="M5 17 H17" /></svg>} title="Add data" active={activePanel === 'upload'} onClick={() => setActivePanel(activePanel === 'upload' ? null : 'upload')} />
      </div>
    </div>
  );
}

// ── Dock button ────────────────────────────────────────────────────────
function DockBtn({ icon, title, active, onClick }) {
  return (
    <button type="button" className={`mx-dock-btn ${active ? 'active' : ''}`} onClick={onClick} title={title}>
      {icon}
    </button>
  );
}

// ── Home panel ─────────────────────────────────────────────────────────
function HomePanel({ stats, onUpload, onLayers, onClose }) {
  return (
    <div className="mx-glass-panel mx-anim-rise">
      <div className="mx-panel-header">
        <div>
          <div className="mx-eyebrow">TANAMI DESERT · NT · GDA2020 Z52</div>
          <h1 className="mx-panel-title">Program map</h1>
        </div>
        <button type="button" className="mx-close-btn" onClick={onClose}>&times;</button>
      </div>
      <div className="mx-stats-row">
        <div className="mx-stat-item">
          <div className="mx-stat-num">{stats.chips}</div>
          <div className="mx-stat-label">rock chips</div>
        </div>
        <div className="mx-stat-item">
          <div className="mx-stat-num">{stats.holes}</div>
          <div className="mx-stat-label">drill holes</div>
        </div>
        <div className="mx-stat-item">
          <div className="mx-stat-num mx-stat-pending">{stats.pending}</div>
          <div className="mx-stat-label">awaiting assay</div>
        </div>
      </div>
      <div className="mx-panel-actions">
        <button type="button" className="mx-btn-primary" onClick={onUpload}>Add data</button>
        <button type="button" className="mx-btn-secondary" onClick={onLayers}>Layers</button>
      </div>
    </div>
  );
}

// ── Upload panel ───────────────────────────────────────────────────────
function UploadPanel({ onClose, samples, onAddSamples }) {
  const [cat, setCat] = useState('Rock chips');
  const [importMsg, setImportMsg] = useState(null);
  const fileInput = useRef(null);
  const cats = ['Rock chips', 'Drill assays', 'Photos', 'Lab cert', 'KML'];
  const recentUploads = [
    { name: 'tanami_chips_apr.csv', cat: 'Rock chips', meta: '128 rows · 6 new', color: '#C15F3C' },
    { name: 'ALS_A22910.pdf', cat: 'Lab cert', meta: 'linked to 6 chips', color: '#B08A3E' },
    { name: 'TNDD-004_downhole.csv', cat: 'Drill assays', meta: '62 intervals', color: '#6E7A5E' },
    { name: 'coyote_south.kml', cat: 'KML', meta: '1 boundary polygon', color: '#5E6E7A' },
    { name: 'collar_photos.zip', cat: 'Photos', meta: '24 images', color: '#8A857A' },
  ];

  const handleFile = useCallback((file) => {
    if (!file) return;
    if (cat !== 'Rock chips') {
      setImportMsg({ error: true, text: `${cat} import is coming soon — rock chip CSVs work today.` });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const { samples: parsed, error } = parseSampleCsv(String(reader.result), samples);
      if (error) { setImportMsg({ error: true, text: error }); return; }
      onAddSamples(parsed);
      setImportMsg({ error: false, text: `Imported ${parsed.length} sample${parsed.length === 1 ? '' : 's'} from ${file.name}.` });
    };
    reader.readAsText(file);
  }, [cat, samples, onAddSamples]);

  return (
    <div className="mx-glass-panel mx-anim-rise">
      <div className="mx-panel-header mx-panel-header-compact">
        <span className="mx-panel-title-sm">Add data</span>
        <button type="button" className="mx-close-btn" onClick={onClose}>&times;</button>
      </div>
      <div className="mx-upload-zone">
        <div
          className="mx-drop-area"
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
        >
          <div className="mx-drop-icon">&#8593;</div>
          <div className="mx-drop-text">Drop files or <span className="mx-drop-browse">browse</span></div>
          <div className="mx-drop-hint">CSV · lab cert · photos · KML</div>
          <input ref={fileInput} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {importMsg && (
          <div className={`mx-import-msg ${importMsg.error ? 'mx-import-err' : 'mx-import-ok'}`}>{importMsg.text}</div>
        )}
        <div className="mx-upload-cat-label">Categorise as</div>
        <div className="mx-upload-cats">
          {cats.map(c => (
            <button key={c} type="button" className={`mx-cat-chip ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
      </div>
      <div className="mx-recent-section">
        <div className="mx-section-label">RECENT UPLOADS</div>
        <div className="mx-recent-list">
          {recentUploads.map(f => (
            <div key={f.name} className="mx-recent-row">
              <div className="mx-recent-dot" style={{ background: f.color }} />
              <div className="mx-recent-info">
                <div className="mx-recent-name">{f.name}</div>
                <div className="mx-recent-meta">{f.meta}</div>
              </div>
              <span className="mx-recent-tag">{f.cat}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Layers panel (the layer tree) ──────────────────────────────────────
function LayersPanel({ tree, counts, basemap, setBasemap, onToggleVisible, onToggleExpanded, onManage, onClose }) {
  return (
    <div className="mx-glass-panel mx-anim-rise">
      <div className="mx-panel-header mx-panel-header-compact">
        <span className="mx-panel-title-sm">Layers</span>
        <button type="button" className="mx-close-btn" onClick={onClose}>&times;</button>
      </div>
      <div className="mx-tree-scroll">
        {tree.map(node => (
          <TreeNode
            key={node.id}
            node={node}
            depth={0}
            counts={counts}
            onToggleVisible={onToggleVisible}
            onToggleExpanded={onToggleExpanded}
            onManage={onManage}
          />
        ))}
        <div className="mx-add-project-row">
          <span className="mx-add-icon">+</span>
          <span className="mx-add-label">Add project · import KML</span>
        </div>
      </div>
      <div className="mx-basemap-section">
        <div className="mx-section-label">BASEMAP</div>
        <div className="mx-basemap-toggle">
          <button type="button" className={`mx-basemap-btn ${basemap === 'satellite' ? 'active' : ''}`} onClick={() => setBasemap('satellite')}>Satellite</button>
          <button type="button" className={`mx-basemap-btn ${basemap === 'topo' ? 'active' : ''}`} onClick={() => setBasemap('topo')}>Topographic</button>
        </div>
        <div className="mx-legend">
          <div className="mx-legend-item"><div className="mx-legend-dot" style={{ background: GRADE_COLORS.high }} /><span>&gt;3.0</span></div>
          <div className="mx-legend-item"><div className="mx-legend-dot" style={{ background: GRADE_COLORS.anom }} /><span>0.5–3.0</span></div>
          <div className="mx-legend-item"><div className="mx-legend-dot" style={{ background: GRADE_COLORS.bg }} /><span>&lt;0.5 Au g/t</span></div>
          <div className="mx-legend-item"><div className="mx-legend-dot mx-legend-pending" /><span>Pending</span></div>
          <div className="mx-legend-item"><div className="mx-legend-collar" /><span>Collar</span></div>
        </div>
      </div>
    </div>
  );
}

// ── Tree node (recursive) ──────────────────────────────────────────────
function TreeNode({ node, depth, counts, onToggleVisible, onToggleExpanded, onManage }) {
  const hasChildren = node.children && node.children.length > 0;
  const isProject = node.type === LAYER_TYPES.PROJECT;
  const isPublicGroup = node.type === LAYER_TYPES.PUBLIC_GROUP;
  const isPublicLayer = node.type === LAYER_TYPES.PUBLIC_LAYER;
  const count = counts?.[node.id] ?? node.count;

  const swatchStyle = {};
  if (isProject || isPublicGroup) {
    swatchStyle.background = node.color;
    swatchStyle.transform = 'rotate(45deg)';
    swatchStyle.width = '11px';
    swatchStyle.height = '11px';
  } else if (node.type === LAYER_TYPES.ROCK_CHIPS) {
    swatchStyle.background = node.color;
    swatchStyle.borderRadius = '50%';
    swatchStyle.width = '10px';
    swatchStyle.height = '10px';
  } else if (node.type === LAYER_TYPES.DRILL_HOLES) {
    swatchStyle.background = '#F3F1E9';
    swatchStyle.border = '2px solid #211E1A';
    swatchStyle.width = '10px';
    swatchStyle.height = '10px';
  } else if (node.type === LAYER_TYPES.BOUNDARY) {
    swatchStyle.border = '1.5px dashed #8A857A';
    swatchStyle.borderRadius = '2px';
    swatchStyle.width = '11px';
    swatchStyle.height = '11px';
  } else if (isPublicLayer) {
    swatchStyle.background = node.color;
    swatchStyle.borderRadius = '50%';
    swatchStyle.width = '8px';
    swatchStyle.height = '8px';
  } else {
    swatchStyle.background = node.color || '#95A5A6';
    swatchStyle.borderRadius = '2px';
    swatchStyle.width = '10px';
    swatchStyle.height = '10px';
  }

  return (
    <>
      <div className={`mx-tree-row ${isProject || isPublicGroup ? 'mx-tree-row-group' : ''}`} style={{ paddingLeft: `${8 + depth * 22}px` }}>
        {/* Caret */}
        <button type="button" className="mx-tree-caret" onClick={() => hasChildren && onToggleExpanded(node.id)} style={{ visibility: hasChildren ? 'visible' : 'hidden' }}>
          {node.expanded ? MxIcons.chevronDown : MxIcons.chevronRight}
        </button>

        {/* Swatch */}
        <div className="mx-tree-swatch" style={swatchStyle} />

        {/* Name */}
        <span className={`mx-tree-name ${node.visible ? '' : 'mx-tree-name-off'} ${isProject || isPublicGroup ? 'mx-tree-name-bold' : ''}`}>
          {node.name}
        </span>

        {/* Count */}
        {count != null && count > 0 && (
          <span className="mx-tree-count">{count}</span>
        )}

        {/* Eye (visibility toggle) */}
        <button type="button" className={`mx-tree-eye ${node.visible ? 'on' : ''}`} onClick={() => onToggleVisible(node.id)} title={node.visible ? 'Hide' : 'Show'}>
          <div className="mx-eye-dot" />
        </button>

        {/* + (manage) — not on public layers (read-only reference) */}
        {!isPublicLayer && (
          <button type="button" className="mx-tree-manage" onClick={() => onManage(node)} title="Manage">
            {MxIcons.plus}
          </button>
        )}

        {/* Attribution tag for public layers */}
        {isPublicLayer && node.visible && (
          <span className="mx-tree-attribution" title={node.attribution}>{node.wmsType?.toUpperCase()}</span>
        )}
      </div>

      {/* Children */}
      {node.expanded && hasChildren && node.children.map(child => (
        <TreeNode key={child.id} node={child} depth={depth + 1} counts={counts} onToggleVisible={onToggleVisible} onToggleExpanded={onToggleExpanded} onManage={onManage} />
      ))}
    </>
  );
}
