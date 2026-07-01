'use client';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { LAYER_TYPES, PUBLIC_DATA_CATALOG, createDemoProject, createPublicDataTree } from './layer-data';
import { MxIcons } from './MineralXIcons';
import ManageDrawer from './ManageDrawer';

// ── Reducer ────────────────────────────────────────────────────────────
function layerReducer(state, action) {
  switch (action.type) {
    case 'TOGGLE_VISIBLE': return toggleVisible(state, action.id);
    case 'TOGGLE_EXPANDED': return toggleExpanded(state, action.id);
    case 'SET_OPACITY': return setOpacity(state, action.id, action.opacity);
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

function setOpacity(state, id, opacity) {
  return findAndUpdate(state, id, n => ({ ...n, opacity }));
}

function addPublicWmsLayer(state, layer) {
  return state.map(n => {
    if (n.type === LAYER_TYPES.PUBLIC_GROUP) {
      return { ...n, children: [...n.children, { ...layer, type: LAYER_TYPES.PUBLIC_LAYER, visible: true, expanded: false, children: [] }] };
    }
    return n;
  });
}

// ── Stats helper ───────────────────────────────────────────────────────
function computeStats(tree) {
  let chips = 0, holes = 0, pending = 0;
  function walk(nodes) {
    nodes.forEach(n => {
      if (n.type === LAYER_TYPES.ROCK_CHIPS) chips += n.count || 0;
      if (n.type === LAYER_TYPES.DRILL_HOLES) holes += n.count || 0;
      if (n.children?.length) walk(n.children);
    });
  }
  walk(tree);
  return { chips, holes, pending };
}

// ── Main component ─────────────────────────────────────────────────────
export default function MineralXWorkspace() {
  const [tree, dispatch] = useReducer(layerReducer, null, () => [createDemoProject(), createPublicDataTree()]);
  const [activePanel, setActivePanel] = useState('home');
  const [manageNode, setManageNode] = useState(null);
  const [basemap, setBasemap] = useState('satellite');
  const mapRef = useRef(null);
  const mapInstance = useRef(null);

  const stats = computeStats(tree);

  const onToggleVisible = useCallback((id) => dispatch({ type: 'TOGGLE_VISIBLE', id }), []);
  const onToggleExpanded = useCallback((id) => dispatch({ type: 'TOGGLE_EXPANDED', id }), []);
  const onManage = useCallback((node) => setManageNode(node), []);
  const onCloseManage = useCallback(() => setManageNode(null), []);
  const onAddPublicLayer = useCallback((layer) => dispatch({ type: 'ADD_PUBLIC_LAYER', layer }), []);

  // Leaflet map init
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const tryInit = () => {
      if (!window.L) { setTimeout(tryInit, 150); return; }
      const L = window.L;
      const map = L.map(mapRef.current, {
        zoomControl: false, attributionControl: false,
        center: [-20.55, 129.745], zoom: 13,
      });
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(map);

      // Demo markers
      const demoChips = [
        { id: 'TN-RC-0440', lat: -20.5468, lng: 129.7402, grade: 'high' },
        { id: 'TN-RC-0428', lat: -20.5501, lng: 129.7455, grade: 'high' },
        { id: 'TN-RC-0431', lat: -20.5555, lng: 129.7431, grade: 'anom' },
        { id: 'TN-RC-0442', lat: -20.5588, lng: 129.7498, grade: 'anom' },
        { id: 'TN-RC-0433', lat: -20.5522, lng: 129.7521, grade: 'bg' },
      ];
      const gradeColor = (g) => g === 'high' ? '#C15F3C' : g === 'anom' ? '#B08A3E' : '#A39C8C';
      const gradeRadius = (g) => g === 'high' ? 9 : g === 'anom' ? 7.5 : 6;
      demoChips.forEach(c => {
        L.circleMarker([c.lat, c.lng], {
          radius: gradeRadius(c.grade), color: '#FAF9F4', weight: 2,
          fillColor: gradeColor(c.grade), fillOpacity: 1,
        }).bindTooltip(c.id, { className: 'lx-tip', direction: 'top', offset: [0, -6] }).addTo(map);
      });

      // Demo boundary
      L.polygon(
        [[-20.5430, 129.7368], [-20.5432, 129.7566], [-20.5612, 129.7560], [-20.5606, 129.7372]],
        { color: '#F6F3EC', weight: 2, dashArray: '7 7', fillColor: '#C15F3C', fillOpacity: 0.06 }
      ).addTo(map);

      // Demo collars
      [{ lat: -20.5489, lng: 129.7440 }, { lat: -20.5531, lng: 129.7472 }, { lat: -20.5567, lng: 129.7458 }].forEach(c => {
        const icon = L.divIcon({ className: '', iconSize: [14, 14], html: '<div style="width:12px;height:12px;background:#F3F1E9;border:2px solid #211E1A;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>' });
        L.marker([c.lat, c.lng], { icon }).addTo(map);
      });

      mapInstance.current = map;
      setTimeout(() => map.invalidateSize(), 250);
    };
    tryInit();
  }, []);

  return (
    <div className="mx-workspace">
      {/* Leaflet CSS/JS */}
      {/* eslint-disable-next-line @next/next/no-before-interactive-script-outside-document */}
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" async />

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
          <UploadPanel onClose={() => setActivePanel(null)} />
        )}
        {activePanel === 'layers' && (
          <LayersPanel
            tree={tree}
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
        <ManageDrawer node={manageNode} onClose={onCloseManage} catalog={PUBLIC_DATA_CATALOG} onAddPublicLayer={onAddPublicLayer} />
      )}

      {/* DOCK */}
      <div className="mx-dock">
        <DockBtn icon={<svg width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M11 3 L19 11 L11 19 L3 11 Z" /></svg>} title="Program" active={activePanel === 'home'} onClick={() => setActivePanel(activePanel === 'home' ? null : 'home')} />
        <DockBtn icon={<svg width="20" height="20" viewBox="0 0 22 22"><circle cx="11" cy="11" r="5.5" fill="currentColor" /></svg>} title="Rock chips" active={false} onClick={() => {}} />
        <DockBtn icon={<svg width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="7.5" y="4" width="7" height="5" rx="1" /><path d="M11 9 L11 19" /></svg>} title="Drill holes" active={false} onClick={() => {}} />
        <DockBtn icon={<svg width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 17 L6 12" /><path d="M11 17 L11 6" /><path d="M16 17 L16 13" /></svg>} title="Assays" active={false} onClick={() => {}} />
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
function UploadPanel({ onClose }) {
  const [cat, setCat] = useState('Rock chips');
  const cats = ['Rock chips', 'Drill assays', 'Photos', 'Lab cert', 'KML'];
  const recentUploads = [
    { name: 'tanami_chips_apr.csv', cat: 'Rock chips', meta: '128 rows · 6 new', color: '#C15F3C' },
    { name: 'ALS_A22910.pdf', cat: 'Lab cert', meta: 'linked to 6 chips', color: '#B08A3E' },
    { name: 'TNDD-004_downhole.csv', cat: 'Drill assays', meta: '62 intervals', color: '#6E7A5E' },
    { name: 'coyote_south.kml', cat: 'KML', meta: '1 boundary polygon', color: '#5E6E7A' },
    { name: 'collar_photos.zip', cat: 'Photos', meta: '24 images', color: '#8A857A' },
  ];

  return (
    <div className="mx-glass-panel mx-anim-rise">
      <div className="mx-panel-header mx-panel-header-compact">
        <span className="mx-panel-title-sm">Add data</span>
        <button type="button" className="mx-close-btn" onClick={onClose}>&times;</button>
      </div>
      <div className="mx-upload-zone">
        <div className="mx-drop-area">
          <div className="mx-drop-icon">&#8593;</div>
          <div className="mx-drop-text">Drop files or <span className="mx-drop-browse">browse</span></div>
          <div className="mx-drop-hint">CSV · lab cert · photos · KML</div>
        </div>
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
function LayersPanel({ tree, basemap, setBasemap, onToggleVisible, onToggleExpanded, onManage, onClose }) {
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
          <div className="mx-legend-item"><div className="mx-legend-dot" style={{ background: '#C15F3C' }} /><span>&gt;3.0</span></div>
          <div className="mx-legend-item"><div className="mx-legend-dot" style={{ background: '#B08A3E' }} /><span>0.5–3.0</span></div>
          <div className="mx-legend-item"><div className="mx-legend-dot" style={{ background: '#A39C8C' }} /><span>&lt;0.5 Au g/t</span></div>
          <div className="mx-legend-item"><div className="mx-legend-collar" /><span>Collar</span></div>
        </div>
      </div>
    </div>
  );
}

// ── Tree node (recursive) ──────────────────────────────────────────────
function TreeNode({ node, depth, onToggleVisible, onToggleExpanded, onManage }) {
  const hasChildren = node.children && node.children.length > 0;
  const isProject = node.type === LAYER_TYPES.PROJECT;
  const isPublicGroup = node.type === LAYER_TYPES.PUBLIC_GROUP;
  const isPublicLayer = node.type === LAYER_TYPES.PUBLIC_LAYER;

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
        {node.count != null && node.count > 0 && (
          <span className="mx-tree-count">{node.count}</span>
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

        {/* Opacity slider for public layers */}
        {isPublicLayer && node.visible && (
          <span className="mx-tree-attribution" title={node.attribution}>{node.wmsType?.toUpperCase()}</span>
        )}
      </div>

      {/* Children */}
      {node.expanded && hasChildren && node.children.map(child => (
        <TreeNode key={child.id} node={child} depth={depth + 1} onToggleVisible={onToggleVisible} onToggleExpanded={onToggleExpanded} onManage={onManage} />
      ))}
    </>
  );
}
