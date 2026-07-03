'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { PUBLIC_DATA_CATALOG } from './layer-data';
import {
  createDemoStore, loadStore, saveStore, today, gradeOf, GRADE_COLORS, PROJECT_COLORS,
  elementInfo, elementsInStore, formatAssay, detectCsvKind,
  parseSampleCsv, parseCollarCsv, parseAssayCsv, parseIntervalCsv,
  samplesToCsv, collarsToCsv, downloadText, parseKmlBoundary, boundaryToKml,
} from './project-store';
import { MxIcons } from './MineralXIcons';
import ManageDrawer from './ManageDrawer';
import DataDrawer from './DataDrawer';

const BASEMAP_TILES = {
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  topo: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
};

const gradeRadius = (g) => g === 'high' ? 9 : g === 'anom' ? 7.5 : 6;
const esc = (t) => String(t || '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

function samplePopupHtml(s) {
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

function collarPopupHtml(c, intervals, element) {
  const holeIntervals = intervals.filter(i => i.holeId === c.id);
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

// ── Main component ─────────────────────────────────────────────────────
export default function MineralXWorkspace() {
  // SSR renders the demo store; the persisted store loads after mount so
  // server and client markup match (avoids hydration mismatches).
  const [store, setStore] = useState(createDemoStore);
  const [hydrated, setHydrated] = useState(false);
  // Layer UI state: visibility defaults on for project layers, off for public.
  const [hidden, setHidden] = useState({});          // nodeId -> true when hidden
  const [expanded, setExpanded] = useState({});      // nodeId -> bool (defaults below)
  const [publicOn, setPublicOn] = useState({});      // public layerId -> bool
  const [publicOpacity, setPublicOpacity] = useState({}); // layerId -> 0..1
  const [wmsErrors, setWmsErrors] = useState({});    // layerId -> true when tiles fail

  const [activePanel, setActivePanel] = useState('home');
  const [manageTarget, setManageTarget] = useState(null); // {type, projectId}
  const [dataOpen, setDataOpen] = useState(false);
  const [dataTab, setDataTab] = useState('chips');
  const [dataPreset, setDataPreset] = useState('');
  const [basemap, setBasemap] = useState('satellite');
  const [activeElement, setActiveElement] = useState('Au');
  const [flowState, setFlowState] = useState({ status: 'idle', targets: 0 }); // terrain analysis
  const [mapReady, setMapReady] = useState(false);
  const [programOpen, setProgramOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [query, setQuery] = useState('');

  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const baseLayer = useRef(null);
  const leaflet = useRef(null);
  const groups = useRef(new Map());   // `${pid}:chips|holes|bnd` -> layerGroup
  const markers = useRef(new Map());  // featureId -> marker
  const wmsLayers = useRef(new Map()); // public layerId -> tileLayer.wms
  const flowLayers = useRef(null); // { overlay, targets } for terrain analysis

  const activeProject = store.projects.find(p => p.id === store.activeProjectId) || store.projects[0];

  useEffect(() => {
    setStore(loadStore());
    setHydrated(true);
  }, []);

  useEffect(() => { if (hydrated) saveStore(store); }, [store, hydrated]);

  const stats = useMemo(() => {
    let chips = 0, holes = 0, pending = 0;
    store.projects.forEach(p => {
      chips += p.samples.length;
      holes += p.collars.length;
      pending += p.samples.filter(s => gradeOf(s, activeElement) === 'pending').length;
    });
    return { chips, holes, pending };
  }, [store, activeElement]);

  const availableElements = useMemo(() => elementsInStore(store), [store]);

  // ── Store mutation API (passed to drawers/panels) ───────────────────
  const updateProject = useCallback((pid, fn) => {
    setStore(prev => ({
      ...prev,
      projects: prev.projects.map(p => (p.id === pid ? fn(p) : p)),
    }));
  }, []);

  const addFile = useCallback((pid, name, category, meta) => {
    updateProject(pid, p => ({ ...p, files: [{ name, category, meta, date: today() }, ...p.files] }));
  }, [updateProject]);

  const focusOn = useCallback((lat, lng, featureId) => {
    const map = mapInstance.current;
    if (!map) return;
    map.flyTo([lat, lng], Math.max(map.getZoom(), 14), { duration: 0.6 });
    if (featureId) {
      setTimeout(() => markers.current.get(featureId)?.openPopup(), 650);
    }
  }, []);

  const api = useMemo(() => ({
    focusOn,
    addSamples: (pid, samples, fileName) => {
      updateProject(pid, p => ({ ...p, samples: [...p.samples, ...samples] }));
      if (fileName) addFile(pid, fileName, 'Rock chips', `${samples.length} samples`);
      const last = samples[samples.length - 1];
      if (last) focusOn(last.lat, last.lng);
    },
    addCollars: (pid, collars, fileName) => {
      updateProject(pid, p => ({ ...p, collars: [...p.collars, ...collars] }));
      if (fileName) addFile(pid, fileName, 'Drill collars', `${collars.length} collars`);
      const last = collars[collars.length - 1];
      if (last) focusOn(last.lat, last.lng);
    },
    applyAssays: (pid, text, fileName) => {
      const project = store.projects.find(p => p.id === pid);
      const result = parseAssayCsv(text, project.samples);
      if (!result.error && result.updated) {
        updateProject(pid, p => ({ ...p, samples: result.updated }));
        if (fileName) addFile(pid, fileName, 'Assays', `${result.matched} results linked`);
      }
      return result;
    },
    addIntervals: (pid, intervals, fileName) => {
      updateProject(pid, p => ({ ...p, intervals: [...(p.intervals || []), ...intervals] }));
      if (fileName) addFile(pid, fileName, 'Drill assays', `${intervals.length} intervals`);
    },
    setBoundary: (pid, name, coords, fileName) => {
      updateProject(pid, p => ({ ...p, boundary: { name, coords } }));
      if (fileName) addFile(pid, fileName, 'KML', '1 boundary polygon');
      const map = mapInstance.current;
      const L = leaflet.current;
      if (map && L) map.fitBounds(L.latLngBounds(coords).pad(0.25));
    },
    attachPhoto: (pid, sampleId, dataUrl) => {
      updateProject(pid, p => ({
        ...p,
        samples: p.samples.map(s => (s.id === sampleId ? { ...s, photo: dataUrl } : s)),
      }));
    },
    deleteSample: (pid, id) => updateProject(pid, p => ({ ...p, samples: p.samples.filter(s => s.id !== id) })),
    deleteCollar: (pid, id) => updateProject(pid, p => ({
      ...p,
      collars: p.collars.filter(c => c.id !== id),
      intervals: (p.intervals || []).filter(i => i.holeId !== id),
    })),
    renameProject: (pid, name) => updateProject(pid, p => ({ ...p, name })),
    deleteProject: (pid) => {
      setStore(prev => {
        const projects = prev.projects.filter(p => p.id !== pid);
        return { ...prev, projects, activeProjectId: projects[0]?.id || null };
      });
    },
    createProject: (name, kmlText) => {
      const id = `proj-${Date.now()}`;
      let boundary = null;
      let boundaryError = null;
      if (kmlText) {
        const { coords, error } = parseKmlBoundary(kmlText);
        if (coords) boundary = { name: `${name} boundary`, coords };
        else boundaryError = error;
      }
      const prefixBase = name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'PX';
      setStore(prev => ({
        ...prev,
        activeProjectId: id,
        projects: [...prev.projects, {
          id, name,
          color: PROJECT_COLORS[prev.projects.length % PROJECT_COLORS.length],
          idPrefix: `${prefixBase}-RC-`,
          createdAt: today(),
          boundary, samples: [], collars: [], intervals: [], files: [],
        }],
      }));
      if (boundary) {
        const map = mapInstance.current;
        const L = leaflet.current;
        if (map && L) setTimeout(() => map.fitBounds(L.latLngBounds(boundary.coords).pad(0.25)), 50);
      }
      return { boundaryError };
    },
    exportProject: (project) => {
      downloadText(`${project.name.replace(/\s+/g, '_')}_rock_chips.csv`, samplesToCsv(project.samples));
      downloadText(`${project.name.replace(/\s+/g, '_')}_collars.csv`, collarsToCsv(project.collars));
      if (project.boundary) {
        downloadText(`${project.name.replace(/\s+/g, '_')}_boundary.kml`, boundaryToKml(project.boundary.name, project.boundary.coords), 'application/vnd.google-earth.kml+xml');
      }
    },
  }), [store.projects, updateProject, addFile, focusOn]);

  // ── Leaflet bootstrap ───────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || mapInstance.current) return;
      leaflet.current = L;
      const map = L.map(mapRef.current, {
        zoomControl: false, attributionControl: false,
        center: [-20.075, 146.26], zoom: 13,
      });
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      baseLayer.current = L.tileLayer(BASEMAP_TILES.satellite, { maxZoom: 19 }).addTo(map);
      mapInstance.current = map;
      setMapReady(true);
      setTimeout(() => map.invalidateSize(), 250);
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Rebuild project layers when data changes ────────────────────────
  useEffect(() => {
    if (!mapReady) return;
    const L = leaflet.current;
    const map = mapInstance.current;
    markers.current.clear();

    // Remove groups for deleted projects
    const validKeys = new Set(store.projects.flatMap(p => [`${p.id}:chips`, `${p.id}:holes`, `${p.id}:bnd`]));
    [...groups.current.keys()].forEach(key => {
      if (!validKeys.has(key)) {
        map.removeLayer(groups.current.get(key));
        groups.current.delete(key);
      }
    });

    store.projects.forEach(p => {
      const ensure = (key) => {
        if (!groups.current.has(key)) groups.current.set(key, L.layerGroup().addTo(map));
        const g = groups.current.get(key);
        g.clearLayers();
        return g;
      };

      const chipGroup = ensure(`${p.id}:chips`);
      p.samples.forEach(s => {
        const g = gradeOf(s, activeElement);
        const m = L.circleMarker([s.lat, s.lng], {
          radius: gradeRadius(g),
          color: g === 'pending' ? '#8A857A' : '#FAF9F4',
          weight: 2,
          dashArray: g === 'pending' ? '2 3' : null,
          fillColor: GRADE_COLORS[g],
          fillOpacity: g === 'pending' ? 0.55 : 1,
        })
          .bindTooltip(s.id, { className: 'lx-tip', direction: 'top', offset: [0, -6] })
          .bindPopup(samplePopupHtml(s), { className: 'mx-popup', closeButton: false, maxWidth: 260 })
          .addTo(chipGroup);
        markers.current.set(s.id, m);
      });

      const holeGroup = ensure(`${p.id}:holes`);
      p.collars.forEach(c => {
        const icon = L.divIcon({ className: '', iconSize: [14, 14], html: '<div style="width:12px;height:12px;background:#F3F1E9;border:2px solid #211E1A;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>' });
        const m = L.marker([c.lat, c.lng], { icon })
          .bindTooltip(c.id, { className: 'lx-tip', direction: 'top', offset: [0, -8] })
          .bindPopup(collarPopupHtml(c, p.intervals || [], activeElement), { className: 'mx-popup', closeButton: false, maxWidth: 260 })
          .addTo(holeGroup);
        markers.current.set(c.id, m);
      });

      const bndGroup = ensure(`${p.id}:bnd`);
      if (p.boundary) {
        L.polygon(p.boundary.coords, {
          color: '#F6F3EC', weight: 2, dashArray: '7 7', fillColor: p.color, fillOpacity: 0.06,
        }).bindTooltip(p.boundary.name, { className: 'lx-tip', sticky: true }).addTo(bndGroup);
      }
    });
  }, [store, mapReady, activeElement]);

  // ── Apply visibility toggles ────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return;
    const map = mapInstance.current;
    store.projects.forEach(p => {
      const projectHidden = hidden[`proj:${p.id}`];
      [['chips', `chips:${p.id}`], ['holes', `holes:${p.id}`], ['bnd', `bnd:${p.id}`]].forEach(([suffix, nodeId]) => {
        const group = groups.current.get(`${p.id}:${suffix}`);
        if (!group) return;
        const show = !projectHidden && !hidden[nodeId];
        if (show && !map.hasLayer(group)) map.addLayer(group);
        if (!show && map.hasLayer(group)) map.removeLayer(group);
      });
    });
  }, [hidden, store, mapReady]);

  // ── Public WMS layers ───────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return;
    const L = leaflet.current;
    const map = mapInstance.current;
    PUBLIC_DATA_CATALOG.forEach(group => group.layers.forEach(layer => {
      const on = Boolean(publicOn[layer.id]);
      const existing = wmsLayers.current.get(layer.id);
      if (on && !existing) {
        const wms = L.tileLayer.wms(layer.url, {
          layers: layer.wmsLayers,
          format: 'image/png',
          transparent: true,
          opacity: publicOpacity[layer.id] ?? 0.7,
        });
        wms.on('tileerror', () => setWmsErrors(prev => (prev[layer.id] ? prev : { ...prev, [layer.id]: true })));
        wms.on('tileload', () => setWmsErrors(prev => {
          if (!prev[layer.id]) return prev;
          const next = { ...prev };
          delete next[layer.id];
          return next;
        }));
        wms.addTo(map);
        wmsLayers.current.set(layer.id, wms);
      } else if (!on && existing) {
        map.removeLayer(existing);
        wmsLayers.current.delete(layer.id);
      } else if (on && existing) {
        existing.setOpacity(publicOpacity[layer.id] ?? 0.7);
      }
    }));
  }, [publicOn, publicOpacity, mapReady]);

  // ── Terrain flow analysis (drainage + alluvial trap targets) ────────
  const clearFlowLayers = useCallback(() => {
    const map = mapInstance.current;
    if (flowLayers.current && map) {
      map.removeLayer(flowLayers.current.overlay);
      map.removeLayer(flowLayers.current.targets);
    }
    flowLayers.current = null;
  }, []);

  const runFlowAnalysis = useCallback(async () => {
    const map = mapInstance.current;
    const L = leaflet.current;
    if (!map || !L) return;
    clearFlowLayers();
    setFlowState({ status: 'running', targets: 0 });
    try {
      const { analyzeViewport } = await import('./terrain-flow');
      // Seed with the user's anomalous+ samples so downstream traps rank higher
      const hotSamples = store.projects.flatMap(p =>
        p.samples.filter(s => ['high', 'anom'].includes(gradeOf(s, activeElement)))
      );
      const result = await analyzeViewport(map, hotSamples);
      const overlay = L.imageOverlay(result.url, result.bounds, { opacity: 0.65 }).addTo(map);
      const targets = L.layerGroup().addTo(map);
      result.targets.forEach(t => {
        L.circleMarker([t.lat, t.lng], {
          radius: t.gold ? 8 : 6.5,
          color: '#FAF9F4',
          weight: 2,
          fillColor: t.gold ? '#C15F3C' : '#8A6A3E',
          fillOpacity: 0.9,
        }).bindTooltip(
          t.gold ? 'Trap target · downstream of your anomalous samples' : 'Alluvial trap target',
          { className: 'lx-tip', direction: 'top', offset: [0, -6] }
        ).addTo(targets);
      });
      flowLayers.current = { overlay, targets };
      setFlowState({ status: 'ready', targets: result.targets.length });
    } catch {
      setFlowState({ status: 'error', targets: 0 });
    }
  }, [store, activeElement, clearFlowLayers]);

  const toggleFlow = useCallback(() => {
    if (flowState.status === 'idle' || flowState.status === 'error') {
      runFlowAnalysis();
    } else {
      clearFlowLayers();
      setFlowState({ status: 'idle', targets: 0 });
    }
  }, [flowState.status, runFlowAnalysis, clearFlowLayers]);

  // ── Basemap ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !baseLayer.current) return;
    baseLayer.current.setUrl(BASEMAP_TILES[basemap] || BASEMAP_TILES.satellite);
  }, [basemap, mapReady]);

  // ── Search ──────────────────────────────────────────────────────────
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const out = [];
    store.projects.forEach(p => {
      p.samples.forEach(s => {
        if (s.id.toLowerCase().includes(q) || (s.lith || '').toLowerCase().includes(q) || (s.notes || '').toLowerCase().includes(q)) {
          const v = s.assays?.[activeElement];
          out.push({ kind: 'chip', id: s.id, lat: s.lat, lng: s.lng, label: s.id, detail: v != null ? formatAssay(activeElement, v) : Object.keys(s.assays || {}).length ? 'assayed' : 'awaiting assay', grade: gradeOf(s, activeElement) });
        }
      });
      p.collars.forEach(c => {
        if (c.id.toLowerCase().includes(q)) {
          out.push({ kind: 'hole', id: c.id, lat: c.lat, lng: c.lng, label: c.id, detail: c.depth != null ? `${c.depth} m` : 'drill hole' });
        }
      });
    });
    return out.slice(0, 8);
  }, [query, store, activeElement]);

  const isExpanded = (id, dflt) => expanded[id] ?? dflt;

  return (
    <div className="mx-workspace">
      <div ref={mapRef} className="mx-map" />

      {/* TOP BAR */}
      <div className="mx-topbar">
        <button
          type="button"
          className="mx-topbar-brand"
          title="Zoom to active project"
          onClick={() => {
            const map = mapInstance.current;
            const L = leaflet.current;
            if (!map || !L || !activeProject) return;
            if (activeProject.boundary) {
              map.fitBounds(L.latLngBounds(activeProject.boundary.coords).pad(0.25));
            } else {
              const pts = [...activeProject.samples, ...activeProject.collars].map(f => [f.lat, f.lng]);
              if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.35));
            }
          }}
        >
          <div className="mx-diamond" />
          <span className="mx-brand-text">MineralX</span>
        </button>
        <div className="mx-topbar-sep" />
        <div className="mx-topbar-program-wrap">
          <button type="button" className="mx-topbar-program" onClick={() => setProgramOpen(o => !o)}>
            <span className="mx-program-name">{activeProject ? activeProject.name : 'No project'}</span>
            <span className="mx-program-count">{store.projects.length} project{store.projects.length === 1 ? '' : 's'}</span>
            <span className="mx-program-caret">&#9662;</span>
          </button>
          {programOpen && (
            <div className="mx-program-menu mx-anim-rise">
              {store.projects.map(p => (
                <button
                  key={p.id}
                  type="button"
                  className={`mx-program-item ${p.id === store.activeProjectId ? 'active' : ''}`}
                  onClick={() => {
                    setStore(prev => ({ ...prev, activeProjectId: p.id }));
                    setProgramOpen(false);
                    if (p.boundary) {
                      const map = mapInstance.current;
                      const L = leaflet.current;
                      if (map && L) map.fitBounds(L.latLngBounds(p.boundary.coords).pad(0.25));
                    }
                  }}
                >
                  <span className="mx-program-swatch" style={{ background: p.color }} />
                  {p.name}
                  {p.demo && <span className="mx-demo-tag">demo</span>}
                </button>
              ))}
              <button type="button" className="mx-program-item mx-program-new" onClick={() => { setProgramOpen(false); setManageTarget({ type: 'newProject' }); }}>
                + New project
              </button>
            </div>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <div className="mx-topbar-search">
          <div className="mx-diamond mx-diamond-sm" />
          <input
            type="text"
            className="mx-search-input"
            placeholder="Search samples, holes, lithology…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {searchResults.length > 0 && (
            <div className="mx-search-results mx-anim-rise">
              {searchResults.map(r => (
                <button
                  key={`${r.kind}-${r.id}`}
                  type="button"
                  className="mx-search-row"
                  onClick={() => { focusOn(r.lat, r.lng, r.id); setQuery(''); }}
                >
                  {r.kind === 'chip'
                    ? <span className="mx-search-dot" style={{ background: GRADE_COLORS[r.grade] || '#A39C8C' }} />
                    : <span className="mx-search-collar" />}
                  <span className="mx-search-label">{r.label}</span>
                  <span className="mx-search-detail">{r.detail}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mx-topbar-user mx-topbar-user-wrap">
          <button type="button" className="mx-avatar" title="Account" onClick={() => setUserMenuOpen(o => !o)}>AM</button>
          {userMenuOpen && (
            <div className="mx-user-menu mx-anim-rise">
              <div className="mx-user-head">
                <div className="mx-user-name">Field account</div>
                <div className="mx-user-sub">Local device · {store.projects.length} project{store.projects.length === 1 ? '' : 's'}</div>
              </div>
              <button type="button" className="mx-user-item" onClick={() => { setUserMenuOpen(false); store.projects.forEach(p => api.exportProject(p)); }}>
                {MxIcons.download} Export all program data
              </button>
              <button
                type="button" className="mx-user-item mx-user-danger"
                onClick={() => {
                  setUserMenuOpen(false);
                  if (window.confirm('Reset to demo data? This clears all projects on this device.')) {
                    const fresh = createDemoStore();
                    setStore(fresh);
                    saveStore(fresh);
                  }
                }}
              >
                {MxIcons.trash} Reset to demo data
              </button>
            </div>
          )}
        </div>
      </div>

      {/* LEFT PANEL */}
      <div className="mx-panel">
        {activePanel === 'home' && (
          <HomePanel
            stats={stats}
            project={activeProject}
            onUpload={() => setActivePanel('upload')}
            onLayers={() => setActivePanel('layers')}
            onData={(tab, preset) => { setManageTarget(null); setDataTab(tab); setDataPreset(preset || ''); setDataOpen(true); }}
            onClose={() => setActivePanel(null)}
          />
        )}
        {activePanel === 'upload' && (
          <UploadPanel onClose={() => setActivePanel(null)} project={activeProject} api={api} />
        )}
        {activePanel === 'layers' && (
          <LayersPanel
            store={store}
            hidden={hidden}
            setHidden={setHidden}
            isExpanded={isExpanded}
            setExpanded={setExpanded}
            publicOn={publicOn}
            setPublicOn={setPublicOn}
            publicOpacity={publicOpacity}
            setPublicOpacity={setPublicOpacity}
            wmsErrors={wmsErrors}
            basemap={basemap}
            setBasemap={setBasemap}
            activeElement={activeElement}
            setActiveElement={setActiveElement}
            availableElements={availableElements}
            flowState={flowState}
            onToggleFlow={toggleFlow}
            onRerunFlow={runFlowAnalysis}
            onManage={setManageTarget}
            onClose={() => setActivePanel(null)}
          />
        )}
      </div>

      {/* RIGHT DRAWERS */}
      {manageTarget && (
        <ManageDrawer
          target={manageTarget}
          store={store}
          api={api}
          onClose={() => setManageTarget(null)}
        />
      )}
      {dataOpen && !manageTarget && (
        <DataDrawer
          store={store}
          api={api}
          tab={dataTab}
          setTab={setDataTab}
          activeElement={activeElement}
          initialFilter={dataPreset}
          onAdd={(type) => { setDataOpen(false); setManageTarget({ type, projectId: activeProject?.id }); }}
          onClose={() => { setDataOpen(false); setDataPreset(''); }}
        />
      )}

      {/* DOCK — one surface per mental model: overview, records (chips/
          holes open the Data drawer on that tab), map layers, capture. */}
      <div className="mx-dock">
        <DockBtn icon={<svg width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M11 3 L19 11 L11 19 L3 11 Z" /></svg>} title="Program" active={activePanel === 'home'} onClick={() => setActivePanel(activePanel === 'home' ? null : 'home')} />
        <DockBtn icon={<svg width="20" height="20" viewBox="0 0 22 22"><circle cx="11" cy="11" r="5.5" fill="currentColor" /></svg>} title="Rock chips" active={dataOpen && dataTab === 'chips'} onClick={() => { setManageTarget(null); if (dataOpen && dataTab === 'chips') { setDataOpen(false); } else { setDataTab('chips'); setDataOpen(true); } }} />
        <DockBtn icon={<svg width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="7.5" y="4" width="7" height="5" rx="1" /><path d="M11 9 L11 19" /></svg>} title="Drill holes" active={dataOpen && dataTab === 'holes'} onClick={() => { setManageTarget(null); if (dataOpen && dataTab === 'holes') { setDataOpen(false); } else { setDataTab('holes'); setDataOpen(true); } }} />
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
function HomePanel({ stats, project, onUpload, onLayers, onData, onClose }) {
  const projectEmpty = project && !project.samples.length && !project.collars.length && !project.boundary;
  return (
    <div className="mx-glass-panel mx-anim-rise">
      <div className="mx-panel-header">
        <div>
          <div className="mx-eyebrow">NORTH QLD · GDA2020 Z55{project?.demo ? ' · DEMO DATA' : ''}</div>
          <h1 className="mx-panel-title">{project?.name || 'Program map'}</h1>
        </div>
        <button type="button" className="mx-close-btn" onClick={onClose}>&times;</button>
      </div>
      {projectEmpty ? (
        <div className="mx-home-empty">
          Nothing here yet. Start with your tenement KML or a rock-chip
          CSV — drop either into <strong>Add data</strong> and it lands on the map.
        </div>
      ) : (
        <div className="mx-stats-row">
          <button type="button" className="mx-stat-item" onClick={() => onData('chips')}>
            <div className="mx-stat-num">{stats.chips}</div>
            <div className="mx-stat-label">rock chips</div>
          </button>
          <button type="button" className="mx-stat-item" onClick={() => onData('holes')}>
            <div className="mx-stat-num">{stats.holes}</div>
            <div className="mx-stat-label">drill holes</div>
          </button>
          <button type="button" className="mx-stat-item" onClick={() => onData('chips', 'pending')}>
            <div className="mx-stat-num mx-stat-pending">{stats.pending}</div>
            <div className="mx-stat-label">awaiting assay</div>
          </button>
        </div>
      )}
      <div className="mx-panel-actions">
        <button type="button" className="mx-btn-primary" onClick={onUpload}>Add data</button>
        <button type="button" className="mx-btn-secondary" onClick={onLayers}>Layers</button>
      </div>
    </div>
  );
}

// ── Upload panel ───────────────────────────────────────────────────────
// Drop anything: the file's own content decides what it is. Category
// chips are an override for ambiguous files, not a prerequisite.
const UPLOAD_CATS = ['Auto', 'Rock chips', 'Drill collars', 'Assays', 'KML', 'Photos'];
const UPLOAD_HINTS = {
  Auto: 'Drop any CSV, KML or photo — the type is read from the file',
  'Rock chips': 'CSV: sample_id, lat, lng, lith + element columns (au, ag, cu…)',
  'Drill collars': 'CSV: hole_id, lat, lng, azimuth, dip, depth',
  Assays: 'Lab CSV: sample_id + element columns — links to chips by ID',
  KML: 'Boundary polygon for the active project',
  Photos: 'JPG named after the sample, e.g. CT-RC-0448.jpg',
};

const KIND_LABELS = { chips: 'rock chips', collars: 'drill collars', assays: 'lab assays', intervals: 'drill intervals', kml: 'a boundary KML', photo: 'a sample photo' };

function UploadPanel({ onClose, project, api }) {
  const [cat, setCat] = useState('Auto');
  const [msg, setMsg] = useState(null);
  const fileInput = useRef(null);

  const accept = cat === 'KML' ? '.kml' : cat === 'Photos' ? 'image/*' : cat === 'Auto' ? '.csv,text/csv,.kml,image/*' : '.csv,text/csv';

  const handleFile = useCallback((file) => {
    if (!file || !project) return;
    setMsg(null);

    const importPhoto = () => {
      const sampleId = file.name.replace(/\.[^.]+$/, '');
      const sample = project.samples.find(s => s.id.toLowerCase() === sampleId.toLowerCase());
      if (!sample) {
        setMsg({ error: true, text: `No sample named “${sampleId}” — name the photo after its sample ID.` });
        return;
      }
      import('./project-store').then(({ compressImage }) =>
        compressImage(file).then(dataUrl => {
          api.attachPhoto(project.id, sample.id, dataUrl);
          setMsg({ error: false, text: `Photo attached to ${sample.id}.` });
        }).catch(() => setMsg({ error: true, text: 'Could not read that image.' }))
      );
    };

    const isImage = file.type.startsWith('image/');
    const isKml = /\.kml$/i.test(file.name);
    if (cat === 'Photos' || (cat === 'Auto' && isImage)) { importPhoto(); return; }

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result);
      const detected = (kind) => (cat === 'Auto' ? `Detected ${KIND_LABELS[kind]} — ` : '');

      const importKind = {
        kml: () => {
          const { coords, error } = parseKmlBoundary(text);
          if (error) return setMsg({ error: true, text: error });
          api.setBoundary(project.id, file.name.replace(/\.kml$/i, ''), coords, file.name);
          setMsg({ error: false, text: `${detected('kml')}boundary updated, zoomed to it.` });
        },
        chips: () => {
          const { samples, error } = parseSampleCsv(text, project.samples, project.idPrefix);
          if (error) return setMsg({ error: true, text: error });
          api.addSamples(project.id, samples, file.name);
          setMsg({ error: false, text: `${detected('chips')}imported ${samples.length} sample${samples.length === 1 ? '' : 's'}.` });
        },
        collars: () => {
          const { collars, error } = parseCollarCsv(text, project.collars, project.idPrefix.replace('-RC-', '-DD-'));
          if (error) return setMsg({ error: true, text: error });
          api.addCollars(project.id, collars, file.name);
          setMsg({ error: false, text: `${detected('collars')}imported ${collars.length} collar${collars.length === 1 ? '' : 's'}.` });
        },
        assays: () => {
          const r = api.applyAssays(project.id, text, file.name);
          if (r.error) return setMsg({ error: true, text: r.error });
          const extra = r.unmatched.length ? ` ${r.unmatched.length} ID${r.unmatched.length === 1 ? '' : 's'} not found: ${r.unmatched.slice(0, 3).join(', ')}${r.unmatched.length > 3 ? '…' : ''}.` : '';
          setMsg({ error: false, text: `${detected('assays')}linked ${r.matched} result${r.matched === 1 ? '' : 's'}.${extra}` });
        },
        intervals: () => {
          const { intervals, error } = parseIntervalCsv(text);
          if (error) return setMsg({ error: true, text: error });
          const known = new Set(project.collars.map(c => c.id));
          const matched = intervals.filter(i => known.has(i.holeId));
          if (!matched.length) return setMsg({ error: true, text: 'No hole IDs in this file matched the project.' });
          api.addIntervals(project.id, matched, file.name);
          setMsg({ error: false, text: `${detected('intervals')}imported ${matched.length} interval${matched.length === 1 ? '' : 's'}.` });
        },
      };

      if (cat === 'Auto') {
        if (isKml || text.trimStart().startsWith('<?xml') || text.includes('<kml')) return importKind.kml();
        const headers = text.split(/\r?\n/)[0]?.split(',').map(h => h.trim()) || [];
        const kind = detectCsvKind(headers);
        if (!kind) return setMsg({ error: true, text: 'Couldn’t tell what this file is — pick a category and drop it again.' });
        return importKind[kind]();
      }
      if (cat === 'KML') return importKind.kml();
      if (cat === 'Rock chips') return importKind.chips();
      if (cat === 'Drill collars') return importKind.collars();
      if (cat === 'Assays') return importKind.assays();
    };
    reader.readAsText(file);
  }, [cat, project, api]);

  return (
    <div className="mx-glass-panel mx-anim-rise">
      <div className="mx-panel-header mx-panel-header-compact">
        <span className="mx-panel-title-sm">Add data{project ? ` · ${project.name}` : ''}</span>
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
          <div className="mx-drop-text">Drop a file or <span className="mx-drop-browse">browse</span></div>
          <div className="mx-drop-hint">{UPLOAD_HINTS[cat]}</div>
          <input ref={fileInput} type="file" accept={accept} style={{ display: 'none' }} onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {msg && <div className={`mx-import-msg ${msg.error ? 'mx-import-err' : 'mx-import-ok'}`}>{msg.text}</div>}
        <div className="mx-upload-cat-label">Categorise as</div>
        <div className="mx-upload-cats">
          {UPLOAD_CATS.map(c => (
            <button key={c} type="button" className={`mx-cat-chip ${cat === c ? 'active' : ''}`} onClick={() => { setCat(c); setMsg(null); }}>{c}</button>
          ))}
        </div>
      </div>
      <div className="mx-recent-section">
        <div className="mx-section-label">RECENT UPLOADS</div>
        <div className="mx-recent-list">
          {project && project.files.length === 0 && (
            <div className="mx-empty-hint">Nothing uploaded yet — imports appear here.</div>
          )}
          {project && project.files.map((f, i) => (
            <div key={`${f.name}-${i}`} className="mx-recent-row">
              <div className="mx-recent-dot" style={{ background: f.category === 'Rock chips' ? '#C15F3C' : f.category === 'Assays' ? '#B08A3E' : f.category === 'Drill collars' || f.category === 'Drill assays' ? '#6E7A5E' : f.category === 'KML' ? '#5E6E7A' : '#8A857A' }} />
              <div className="mx-recent-info">
                <div className="mx-recent-name">{f.name}</div>
                <div className="mx-recent-meta">{f.meta}{f.date ? ` · ${f.date}` : ''}</div>
              </div>
              <span className="mx-recent-tag">{f.category}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Layers panel ───────────────────────────────────────────────────────
function LayersPanel({ store, hidden, setHidden, isExpanded, setExpanded, publicOn, setPublicOn, publicOpacity, setPublicOpacity, wmsErrors, basemap, setBasemap, activeElement, setActiveElement, availableElements, flowState, onToggleFlow, onRerunFlow, onManage, onClose }) {
  const toggleHidden = (id) => setHidden(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleExpanded = (id, dflt) => setExpanded(prev => ({ ...prev, [id]: !(prev[id] ?? dflt) }));

  return (
    <div className="mx-glass-panel mx-anim-rise">
      <div className="mx-panel-header mx-panel-header-compact">
        <span className="mx-panel-title-sm">Layers</span>
        <button type="button" className="mx-close-btn" onClick={onClose}>&times;</button>
      </div>
      <div className="mx-tree-scroll">
        {store.projects.map(p => (
          <ProjectTree
            key={p.id}
            project={p}
            hidden={hidden}
            toggleHidden={toggleHidden}
            expanded={isExpanded(`proj:${p.id}`, true)}
            toggleExpanded={() => toggleExpanded(`proj:${p.id}`, true)}
            onManage={onManage}
          />
        ))}

        {/* Public data */}
        <div className="mx-tree-row mx-tree-row-group" style={{ paddingLeft: '8px' }}>
          <button type="button" className="mx-tree-caret" onClick={() => toggleExpanded('pub', false)}>
            {isExpanded('pub', false) ? MxIcons.chevronDown : MxIcons.chevronRight}
          </button>
          <div className="mx-tree-swatch" style={{ background: '#7F8C8D', transform: 'rotate(45deg)', width: 11, height: 11 }} />
          <span className="mx-tree-name mx-tree-name-bold">GeoResGlobe · QLD</span>
        </div>
        {isExpanded('pub', false) && PUBLIC_DATA_CATALOG.map(group => group.layers.map(layer => (
          <div key={layer.id}>
            <div className="mx-tree-row" style={{ paddingLeft: '30px' }}>
              <span className="mx-tree-caret" style={{ visibility: 'hidden' }} />
              <div className="mx-tree-swatch" style={{ background: '#95A5A6', borderRadius: '50%', width: 8, height: 8 }} />
              <span className={`mx-tree-name ${publicOn[layer.id] ? '' : 'mx-tree-name-off'}`} title={layer.attribution}>{layer.name}</span>
              {wmsErrors[layer.id] && publicOn[layer.id] && (
                <span className="mx-tree-error" title="Service not responding — check the layer or your connection">unavailable</span>
              )}
              <button
                type="button"
                className={`mx-tree-eye ${publicOn[layer.id] ? 'on' : ''}`}
                onClick={() => setPublicOn(prev => ({ ...prev, [layer.id]: !prev[layer.id] }))}
                title={publicOn[layer.id] ? 'Hide' : 'Show'}
              >
                <div className="mx-eye-dot" />
              </button>
            </div>
            {publicOn[layer.id] && (
              <div className="mx-opacity-row">
                <input
                  type="range"
                  min="10" max="100"
                  value={Math.round((publicOpacity[layer.id] ?? 0.7) * 100)}
                  onChange={(e) => setPublicOpacity(prev => ({ ...prev, [layer.id]: Number(e.target.value) / 100 }))}
                  className="mx-opacity-slider"
                  title="Opacity"
                />
              </div>
            )}
          </div>
        )))}

        {/* Terrain analysis */}
        <div className="mx-tree-row mx-tree-row-group" style={{ paddingLeft: '8px' }}>
          <span className="mx-tree-caret" style={{ visibility: 'hidden' }} />
          <div className="mx-tree-swatch" style={{ background: '#3E6C8C', transform: 'rotate(45deg)', width: 11, height: 11 }} />
          <span className="mx-tree-name mx-tree-name-bold">Water flow &amp; traps</span>
          {flowState.status === 'running' && <span className="mx-tree-attribution">computing…</span>}
          {flowState.status === 'ready' && <span className="mx-tree-count">{flowState.targets} targets</span>}
          {flowState.status === 'error' && <span className="mx-tree-error" title="Elevation tiles unreachable — try again">failed</span>}
          <button
            type="button"
            className={`mx-tree-eye ${flowState.status === 'ready' || flowState.status === 'running' ? 'on' : ''}`}
            onClick={onToggleFlow}
            title={flowState.status === 'ready' ? 'Hide' : 'Analyse this view'}
          >
            <div className="mx-eye-dot" />
          </button>
        </div>
        {flowState.status === 'ready' && (
          <div className="mx-flow-note">
            Drainage and trap targets for the current view — pan, then
            <button type="button" className="mx-flow-rerun" onClick={onRerunFlow}>re-run</button>.
            Heuristic terrain model: field-check targets.
          </div>
        )}

        <button type="button" className="mx-add-project-row" onClick={() => onManage({ type: 'newProject' })}>
          <span className="mx-add-icon">+</span>
          <span className="mx-add-label">Add project · import KML</span>
        </button>
      </div>
      <div className="mx-basemap-section">
        <div className="mx-section-label">COLOUR BY</div>
        <div className="mx-element-row">
          {availableElements.map(el => (
            <button
              key={el}
              type="button"
              className={`mx-cat-chip mx-element-chip ${activeElement === el ? 'active' : ''}`}
              onClick={() => setActiveElement(el)}
            >{el}</button>
          ))}
        </div>
        {(() => {
          const t = elementInfo(activeElement);
          const unit = t.unit ? ` ${t.unit}` : '';
          return (
            <div className="mx-legend">
              <div className="mx-legend-item"><div className="mx-legend-dot" style={{ background: GRADE_COLORS.high }} /><span>&gt;{t.high}</span></div>
              <div className="mx-legend-item"><div className="mx-legend-dot" style={{ background: GRADE_COLORS.anom }} /><span>{t.anom}–{t.high}</span></div>
              <div className="mx-legend-item"><div className="mx-legend-dot" style={{ background: GRADE_COLORS.bg }} /><span>&lt;{t.anom} {activeElement}{unit}</span></div>
              <div className="mx-legend-item"><div className="mx-legend-dot mx-legend-pending" /><span>Pending</span></div>
              <div className="mx-legend-item"><div className="mx-legend-collar" /><span>Collar</span></div>
            </div>
          );
        })()}
        <div className="mx-section-label" style={{ paddingLeft: 0, paddingTop: 14 }}>BASEMAP</div>
        <div className="mx-basemap-toggle">
          <button type="button" className={`mx-basemap-btn ${basemap === 'satellite' ? 'active' : ''}`} onClick={() => setBasemap('satellite')}>Satellite</button>
          <button type="button" className={`mx-basemap-btn ${basemap === 'topo' ? 'active' : ''}`} onClick={() => setBasemap('topo')}>Topographic</button>
        </div>
      </div>
    </div>
  );
}

function ProjectTree({ project, hidden, toggleHidden, expanded, toggleExpanded, onManage }) {
  const p = project;
  const rows = [
    { nodeId: `chips:${p.id}`, name: 'Rock chips', count: p.samples.length, manage: 'chips', swatch: { background: '#C15F3C', borderRadius: '50%', width: 10, height: 10 } },
    { nodeId: `holes:${p.id}`, name: 'Drill holes', count: p.collars.length, manage: 'holes', swatch: { background: '#F3F1E9', border: '2px solid #211E1A', width: 10, height: 10 } },
    { nodeId: `bnd:${p.id}`, name: p.boundary ? p.boundary.name : 'Boundary', count: null, manage: 'boundary', swatch: { border: '1.5px dashed #8A857A', borderRadius: 2, width: 11, height: 11 } },
  ];
  return (
    <>
      <div className="mx-tree-row mx-tree-row-group" style={{ paddingLeft: '8px' }}>
        <button type="button" className="mx-tree-caret" onClick={toggleExpanded}>
          {expanded ? MxIcons.chevronDown : MxIcons.chevronRight}
        </button>
        <div className="mx-tree-swatch" style={{ background: p.color, transform: 'rotate(45deg)', width: 11, height: 11 }} />
        <span className={`mx-tree-name mx-tree-name-bold ${hidden[`proj:${p.id}`] ? 'mx-tree-name-off' : ''}`}>{p.name}</span>
        {p.demo && <span className="mx-demo-tag">demo</span>}
        <button type="button" className={`mx-tree-eye ${hidden[`proj:${p.id}`] ? '' : 'on'}`} onClick={() => toggleHidden(`proj:${p.id}`)} title={hidden[`proj:${p.id}`] ? 'Show' : 'Hide'}>
          <div className="mx-eye-dot" />
        </button>
        <button type="button" className="mx-tree-manage" onClick={() => onManage({ type: 'project', projectId: p.id })} title="Project settings">
          {MxIcons.plus}
        </button>
      </div>
      {expanded && rows.map(r => (
        <div key={r.nodeId} className="mx-tree-row" style={{ paddingLeft: '30px' }}>
          <span className="mx-tree-caret" style={{ visibility: 'hidden' }} />
          <div className="mx-tree-swatch" style={r.swatch} />
          <span className={`mx-tree-name ${hidden[r.nodeId] || hidden[`proj:${p.id}`] ? 'mx-tree-name-off' : ''}`}>{r.name}</span>
          {r.count != null && r.count > 0 && <span className="mx-tree-count">{r.count}</span>}
          <button type="button" className={`mx-tree-eye ${hidden[r.nodeId] ? '' : 'on'}`} onClick={() => toggleHidden(r.nodeId)} title={hidden[r.nodeId] ? 'Show' : 'Hide'}>
            <div className="mx-eye-dot" />
          </button>
          <button type="button" className="mx-tree-manage" onClick={() => onManage({ type: r.manage, projectId: p.id })} title="Manage">
            {MxIcons.plus}
          </button>
        </div>
      ))}
    </>
  );
}
