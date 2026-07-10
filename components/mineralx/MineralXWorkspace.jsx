'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { PUBLIC_DATA_CATALOG, BASEMAP_TILES, THEME_LABELS, THEME_ORDER } from './layer-data';
import {
  createDemoStore, loadStore, saveStore, today, gradeOf, GRADE_COLORS, PROJECT_COLORS,
  elementInfo, elementsInStore, formatAssay, detectCsvKind,
  parseSampleCsv, parseCollarCsv, parseAssayCsv, parseIntervalCsv,
  samplesToCsv, collarsToCsv, targetsToCsv, downloadText, parseKmlBoundary, boundaryToKml,
  pushUndo, undo, redo, undoAvailable, redoAvailable,
  nextId, targetKey, targetPrefix, targetHitRate,
} from './project-store';
import { MxIcons } from './MineralXIcons';
import ManageDrawer from './ManageDrawer';
import DataDrawer from './DataDrawer';
import ZonePicker from './ZonePicker';
import ExtractPanel from './ExtractPanel';
import {
  wmsTileUrl, buildMarkerEl, boundsOfCoords,
  gradeRadius, esc, samplePopupHtml, collarPopupHtml,
  buildTargetMarkerEl, targetPopupHtml,
} from './map-render-helpers';
import { autoLinkSamples } from './target-tasking';
import { useFlowAnalysis } from './useFlowAnalysis';

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
  const [mapReady, setMapReady] = useState(false);
  const [mapEpoch, setMapEpoch] = useState(0); // bumped to force a full map remount after a recovered render crash
  const [programOpen, setProgramOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [saveFailed, setSaveFailed] = useState(false);
  const [lastChangeAt, setLastChangeAt] = useState(0);
  const [lastExportAt, setLastExportAt] = useState(0);

  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const mgl = useRef(null); // the maplibre-gl module itself, once dynamically imported
  const resizeObs = useRef(null); // ResizeObserver keeping the canvas matched to its container
  const markers = useRef(new Map());       // featureId -> maplibregl.Marker (samples + collars)
  const groupMembers = useRef(new Map());  // `${pid}:chips|holes` -> Set of feature ids currently added to the map
  const boundaryLayers = useRef(new Map()); // pid -> { sourceId, fillLayerId, lineLayerId }
  const wmsLayers = useRef(new Set());     // public layerId -> currently-added (source+layer exist)
  const flownToProject = useRef(false); // guards the one-time auto fly-in on initial load
  const recoveryAttempts = useRef(0); // caps auto-recovery from a crashed render loop (see error listener below)

  const activeProject = store.projects.find(p => p.id === store.activeProjectId) || store.projects[0];

  // Landing centroid for the initial globe→project fly-in: the active
  // project's boundary (if drawn) or its samples/collars, else a wide
  // North QLD default — this app's own regional focus, not an arbitrary 0,0.
  const initialCenter = useMemo(() => {
    const coords = activeProject?.boundary?.coords;
    if (coords?.length) {
      const lat = coords.reduce((s, c) => s + c[0], 0) / coords.length;
      const lng = coords.reduce((s, c) => s + c[1], 0) / coords.length;
      return { lat, lng };
    }
    const pts = [...(activeProject?.samples || []), ...(activeProject?.collars || [])];
    if (pts.length) {
      const lat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
      const lng = pts.reduce((s, p) => s + p.lng, 0) / pts.length;
      return { lat, lng };
    }
    return { lat: -20.075, lng: 146.26 };
  }, [activeProject]);

  useEffect(() => {
    setStore(loadStore());
    setHydrated(true);
    setLastExportAt(Date.now()); // staleness clock starts from app open, not epoch 0
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const ok = saveStore(store);
    setSaveFailed(!ok);
    if (ok) setLastChangeAt(Date.now());
  }, [store, hydrated]);

  const STALE_EXPORT_MS = 30 * 60_000;
  const exportStale = lastChangeAt > lastExportAt && Date.now() - lastExportAt > STALE_EXPORT_MS;
  const [staleDismissed, setStaleDismissed] = useState(false);

  const stats = useMemo(() => {
    let chips = 0, holes = 0, pending = 0, targets = 0, confirmed = 0, barren = 0;
    store.projects.forEach(p => {
      chips += p.samples.length;
      holes += p.collars.length;
      pending += p.samples.filter(s => gradeOf(s, activeElement) === 'pending').length;
      (p.targets || []).forEach(t => {
        targets += 1;
        if (t.status === 'confirmed') confirmed += 1;
        else if (t.status === 'barren') barren += 1;
      });
    });
    return { chips, holes, pending, targets, assessed: confirmed + barren, confirmed, barren };
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
    map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 14), duration: 600 });
    if (featureId) {
      setTimeout(() => {
        const m = markers.current.get(featureId);
        if (m && !m.getPopup()?.isOpen()) m.togglePopup();
      }, 650);
    }
  }, []);

  // Every data mutation snapshots the store first (pushUndo) so the
  // change is reversible with Ctrl/Cmd+Z — field data entered on a phone
  // with a fat-fingered delete is otherwise gone for good. Read-only
  // operations (focusOn, exportProject) don't snapshot.
  const api = useMemo(() => ({
    focusOn,
    addSamples: (pid, samples, fileName) => {
      pushUndo(store);
      // Any new sample that lands within range of a target links to it and
      // advances that target to 'sampled' — the geologist collects, the
      // app does the bookkeeping (Engage). Applies to manual adds, CSV
      // imports and AI extraction alike, since all three land here.
      updateProject(pid, p => ({
        ...p,
        samples: [...p.samples, ...samples],
        targets: autoLinkSamples(p.targets || [], samples),
      }));
      if (fileName) addFile(pid, fileName, 'Rock chips', `${samples.length} samples`);
      const last = samples[samples.length - 1];
      if (last) focusOn(last.lat, last.lng);
    },
    addCollars: (pid, collars, fileName) => {
      pushUndo(store);
      updateProject(pid, p => ({ ...p, collars: [...p.collars, ...collars] }));
      if (fileName) addFile(pid, fileName, 'Drill collars', `${collars.length} collars`);
      const last = collars[collars.length - 1];
      if (last) focusOn(last.lat, last.lng);
    },
    applyAssays: (pid, text, fileName) => {
      const project = store.projects.find(p => p.id === pid);
      const result = parseAssayCsv(text, project.samples);
      if (!result.error && result.updated) {
        pushUndo(store);
        updateProject(pid, p => ({ ...p, samples: result.updated }));
        if (fileName) addFile(pid, fileName, 'Assays', `${result.matched} results linked`);
      }
      return result;
    },
    addIntervals: (pid, intervals, fileName) => {
      pushUndo(store);
      updateProject(pid, p => ({ ...p, intervals: [...(p.intervals || []), ...intervals] }));
      if (fileName) addFile(pid, fileName, 'Drill assays', `${intervals.length} intervals`);
    },
    setBoundary: (pid, name, coords, fileName) => {
      pushUndo(store);
      updateProject(pid, p => ({ ...p, boundary: { name, coords } }));
      if (fileName) addFile(pid, fileName, 'KML', '1 boundary polygon');
      const map = mapInstance.current;
      if (map && mgl.current) map.fitBounds(boundsOfCoords(mgl.current, coords), { padding: 60, duration: 800 });
    },
    attachPhoto: (pid, sampleId, dataUrl) => {
      pushUndo(store);
      updateProject(pid, p => ({
        ...p,
        samples: p.samples.map(s => (s.id === sampleId ? { ...s, photo: dataUrl } : s)),
      }));
    },
    deleteSample: (pid, id) => {
      pushUndo(store);
      updateProject(pid, p => ({ ...p, samples: p.samples.filter(s => s.id !== id) }));
    },
    deleteCollar: (pid, id) => {
      pushUndo(store);
      updateProject(pid, p => ({
        ...p,
        collars: p.collars.filter(c => c.id !== id),
        intervals: (p.intervals || []).filter(i => i.holeId !== id),
      }));
    },
    // Promote a terrain-analysis candidate into a persistent, tracked
    // target. The evidence (score + what seeded it + the element and date
    // it was found) is frozen at promotion time so it travels with the
    // target for the rest of its life. Reads only from the already-computed
    // candidate — never re-runs analysis. No-ops if this spot is already a
    // target, so a double-click can't create a duplicate.
    promoteTarget: (pid, cand) => {
      const project = store.projects.find(p => p.id === pid);
      if (!project) return;
      const key = targetKey(cand.lat, cand.lng);
      if ((project.targets || []).some(t => targetKey(t.lat, t.lng) === key)) return;
      pushUndo(store);
      const target = {
        id: nextId(project.targets || [], targetPrefix(project.idPrefix)),
        lat: cand.lat, lng: cand.lng,
        score: cand.score ?? 0,
        status: 'proposed',
        provenance: {
          sample: !!cand.sample,
          occurrence: !!cand.occurrence,
          element: activeElement,
          analysedAt: today(),
        },
        linkedSampleIds: [],
        createdAt: today(),
      };
      updateProject(pid, p => ({ ...p, targets: [...(p.targets || []), target] }));
    },
    // Move a target along the exploration pipeline (proposed → planned →
    // … → confirmed/barren). Undoable like every mutation.
    setTargetStatus: (pid, targetId, status) => {
      pushUndo(store);
      updateProject(pid, p => ({
        ...p,
        targets: (p.targets || []).map(t => (t.id === targetId ? { ...t, status } : t)),
      }));
    },
    // Remove a promoted target AND remember its location, so a later
    // analysis re-run never resurfaces a spot the user already walked off
    // and rejected — the "data travels with the object, never re-entered"
    // principle applied to a negative decision. Undo restores both.
    dismissTarget: (pid, targetId) => {
      pushUndo(store);
      updateProject(pid, p => {
        const target = (p.targets || []).find(t => t.id === targetId);
        const key = target ? targetKey(target.lat, target.lng) : null;
        return {
          ...p,
          targets: (p.targets || []).filter(t => t.id !== targetId),
          dismissedTargets: key && !(p.dismissedTargets || []).includes(key)
            ? [...(p.dismissedTargets || []), key]
            : (p.dismissedTargets || []),
        };
      });
    },
    // Reject an analysis candidate straight from the map without ever
    // promoting it — same "won't come back" guarantee.
    dismissCandidate: (pid, cand) => {
      const key = targetKey(cand.lat, cand.lng);
      const project = store.projects.find(p => p.id === pid);
      if (!project || (project.dismissedTargets || []).includes(key)) return;
      pushUndo(store);
      updateProject(pid, p => ({ ...p, dismissedTargets: [...(p.dismissedTargets || []), key] }));
    },
    // Detach a sample the auto-linker attached to a target — the human
    // override on the machine's bookkeeping. Leaves status alone (the
    // status control is the user's to set).
    unlinkSample: (pid, targetId, sampleId) => {
      pushUndo(store);
      updateProject(pid, p => ({
        ...p,
        targets: (p.targets || []).map(t =>
          t.id === targetId ? { ...t, linkedSampleIds: (t.linkedSampleIds || []).filter(id => id !== sampleId) } : t),
      }));
    },
    renameProject: (pid, name) => {
      pushUndo(store);
      updateProject(pid, p => ({ ...p, name }));
    },
    deleteProject: (pid) => {
      pushUndo(store);
      setStore(prev => {
        const projects = prev.projects.filter(p => p.id !== pid);
        return { ...prev, projects, activeProjectId: projects[0]?.id || null };
      });
    },
    createProject: (name, kmlText) => {
      pushUndo(store);
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
        if (map && mgl.current) setTimeout(() => map.fitBounds(boundsOfCoords(mgl.current, boundary.coords), { padding: 60, duration: 800 }), 50);
      }
      return { boundaryError };
    },
    exportProject: (project) => {
      const stem = project.name.replace(/\s+/g, '_');
      downloadText(`${stem}_rock_chips.csv`, samplesToCsv(project.samples));
      downloadText(`${stem}_collars.csv`, collarsToCsv(project.collars));
      // The target worklist is part of the program — a report/handover
      // export that dropped it would lose the exploration decisions.
      if (project.targets?.length) {
        downloadText(`${stem}_targets.csv`, targetsToCsv(project.targets));
      }
      if (project.boundary) {
        downloadText(`${stem}_boundary.kml`, boundaryToKml(project.boundary.name, project.boundary.coords), 'application/vnd.google-earth.kml+xml');
      }
      setLastExportAt(Date.now());
      setStaleDismissed(false);
    },
    // `store` (not `store.projects`) in deps: pushUndo snapshots the whole
    // store, so a stale closure would capture an out-of-date activeProjectId.
    // activeElement: promoteTarget freezes it into the target's provenance.
  }), [store, updateProject, addFile, focusOn, activeElement]);

  // Promoting a candidate always lands it in the active project — the one
  // whose data is on screen when the analysis was run. Defined after `api`
  // (which it calls), so the flow-analysis hook that consumes it also moves
  // below here.
  const onPromoteTarget = useCallback((cand) => {
    if (activeProject) api.promoteTarget(activeProject.id, cand);
  }, [api, activeProject]);
  const onDismissCandidate = useCallback((cand) => {
    if (activeProject) api.dismissCandidate(activeProject.id, cand);
  }, [api, activeProject]);

  const {
    flowState, flowSubOn, flowOpacity, setFlowOpacity,
    toggleFlowSub, runFlowAnalysis, flowLayerRefs,
  } = useFlowAnalysis({ mapInstance, mgl, store, activeElement, onPromoteTarget, onDismissCandidate });

  // Undo/redo: keyboard (Ctrl/Cmd+Z, +Shift for redo) and topbar buttons.
  // The guard skips editable targets so native text-field undo keeps
  // working — hijacking Ctrl+Z inside the search box or a form input
  // would revert map data while the user thinks they're editing text.
  const doUndo = useCallback(() => {
    const prev = undo(store);
    if (prev) setStore(prev);
  }, [store]);
  const doRedo = useCallback(() => {
    const next = redo(store);
    if (next) setStore(next);
  }, [store]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      if (e.shiftKey) doRedo(); else doUndo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [doUndo, doRedo]);

  // Reading module-level stack state during render is safe here: every
  // stack change (pushUndo in api, undo/redo above) is paired with a
  // setStore, so a re-render always follows.
  const canUndo = undoAvailable();
  const canRedo = redoAvailable();

  // ── MapLibre bootstrap: globe projection, whole-Earth start, no data ──
  // layers yet — the auto fly-in to the active project happens in a
  // separate one-time effect below, once hydration has settled. Keyed on
  // `mapEpoch` so the error-recovery effect below can force a clean
  // rebuild without a full page reload.
  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;
    if (mapInstance.current) {
      try { mapInstance.current.remove(); } catch { /* already broken; discard anyway */ }
      mapInstance.current = null;
    }
    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      if (cancelled) return;
      mgl.current = maplibregl;
      const map = new maplibregl.Map({
        container: mapRef.current,
        style: {
          version: 8,
          // Globe must be declared in the style spec — MapLibre v5's Map
          // constructor has no top-level `projection` option (a bare
          // `projection: 'globe'` there is silently ignored, leaving the
          // map in flat Mercator). This is what makes the sphere render
          // at low zoom and flatten continuously as the camera flies in.
          projection: { type: 'globe' },
          sources: {
            basemap: { type: 'raster', tiles: [BASEMAP_TILES.satellite], tileSize: 256, attribution: 'Esri' },
          },
          layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
        },
        center: [134, -25], // whole-Australia framing at globe zoom, before the fly-in narrows to the project
        zoom: 1.4,
        attributionControl: false,
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
      mapInstance.current = map;
      // Opt-in only (unset in real deploys) — exposes map internals for
      // the e2e suite, which runs against a production build and so can't
      // rely on NODE_ENV !== 'production' to tell it apart from a real
      // deploy. Never enabled unless NEXT_PUBLIC_MX_DEBUG is explicitly set.
      const debugHooks = process.env.NEXT_PUBLIC_MX_DEBUG === '1';
      if (debugHooks) window.__mxDebugMap = map;
      map.on('load', () => {
        if (cancelled) return;
        setMapReady(true);
        if (debugHooks) window.__mxMapLoaded = true;
        setTimeout(() => map.resize(), 250);
      });

      // Keep the canvas matched to its container across every reflow —
      // device rotation, browser-chrome show/hide (dvh changes), a panel
      // opening beside the map, or a desktop window resize. Without this
      // the WebGL canvas keeps its initial size and the globe renders into
      // the wrong box (letterboxed or clipped) on mobile.
      const ro = new ResizeObserver(() => map.resize());
      ro.observe(mapRef.current);
      resizeObs.current = ro;
    })();
    return () => {
      cancelled = true;
      resizeObs.current?.disconnect();
      resizeObs.current = null;
    };
  }, [mapEpoch]);

  // ── Render-crash recovery ─────────────────────────────────────────────
  // MapLibre's globe projection has a known fragility: a raster tile that
  // fails to load (a dead WMS guess, a network hiccup) can throw inside
  // its internal render loop and leave the map frozen — unlike Leaflet,
  // which just skips a broken tile. Since this app already treats a
  // wrong/guessed GEORES endpoint as an expected, recoverable case (the
  // "unavailable" badge), a crashed globe render gets the same treatment:
  // catch it and rebuild the map from current React state rather than
  // leaving the workspace stuck, capped so a persistently-broken source
  // can't loop forever.
  useEffect(() => {
    const onError = (event) => {
      const fromMapLibre = event.filename?.includes('maplibre-gl') || event.error?.stack?.includes('maplibre-gl');
      if (!fromMapLibre || recoveryAttempts.current >= 3) return;
      recoveryAttempts.current += 1;
      event.preventDefault();
      markers.current.forEach(m => { try { m.remove(); } catch { /* noop */ } });
      markers.current.clear();
      groupMembers.current.clear();
      boundaryLayers.current.clear();
      wmsLayers.current.clear();
      flowLayerRefs.current = {};
      setMapReady(false);
      setMapEpoch(e => e + 1);
    };
    window.addEventListener('error', onError);
    return () => window.removeEventListener('error', onError);
    // flowLayerRefs is a ref returned by useFlowAnalysis() — referentially
    // stable for the component's lifetime, same as the useRef()s above,
    // so listing it here doesn't change when this effect re-subscribes.
  }, [flowLayerRefs]);

  // ── Auto fly-in: sphere → project, once, on initial load ─────────────
  // The globe naturally flattens into the familiar flat view as MapLibre's
  // globe projection crosses its own zoom-5 sphere/Mercator threshold —
  // one continuous camera, not a separate view or a mode switch.
  useEffect(() => {
    if (!mapReady || !hydrated || flownToProject.current) return;
    flownToProject.current = true;
    const map = mapInstance.current;
    map.flyTo({ center: [initialCenter.lng, initialCenter.lat], zoom: 13, duration: 2600, curve: 1.4 });
  }, [mapReady, hydrated, initialCenter]);

  // ── Rebuild project layers when data changes ────────────────────────
  useEffect(() => {
    if (!mapReady) return;
    const map = mapInstance.current;

    // Remove markers/boundary for deleted projects.
    const validPids = new Set(store.projects.map(p => p.id));
    [...groupMembers.current.keys()].forEach(key => {
      const pid = key.split(':')[0];
      if (!validPids.has(pid)) {
        groupMembers.current.get(key).forEach(id => { markers.current.get(id)?.remove(); markers.current.delete(id); });
        groupMembers.current.delete(key);
      }
    });
    [...boundaryLayers.current.keys()].forEach(pid => {
      if (!validPids.has(pid)) {
        const { sourceId, fillLayerId, lineLayerId } = boundaryLayers.current.get(pid);
        if (map.getLayer(fillLayerId)) map.removeLayer(fillLayerId);
        if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
        boundaryLayers.current.delete(pid);
      }
    });

    store.projects.forEach(p => {
      // Samples: clear this project's existing sample markers, rebuild.
      const chipKey = `${p.id}:chips`;
      (groupMembers.current.get(chipKey) || new Set()).forEach(id => { markers.current.get(id)?.remove(); markers.current.delete(id); });
      const chipIds = new Set();
      p.samples.forEach(s => {
        const g = gradeOf(s, activeElement);
        const swatch = {
          width: `${gradeRadius(g) * 2}px`, height: `${gradeRadius(g) * 2}px`, borderRadius: '50%',
          background: GRADE_COLORS[g], opacity: g === 'pending' ? 0.55 : 1,
          border: `2px ${g === 'pending' ? 'dashed' : 'solid'} ${g === 'pending' ? '#8A857A' : '#FAF9F4'}`,
        };
        const el = buildMarkerEl(swatch, s.id);
        const marker = new mgl.current.Marker({ element: el })
          .setLngLat([s.lng, s.lat])
          .setPopup(new mgl.current.Popup({ className: 'mx-popup', closeButton: false, maxWidth: '260px' }).setHTML(samplePopupHtml(s)))
          .addTo(map);
        markers.current.set(s.id, marker);
        chipIds.add(s.id);
      });
      groupMembers.current.set(chipKey, chipIds);

      // Drill collars.
      const holeKey = `${p.id}:holes`;
      (groupMembers.current.get(holeKey) || new Set()).forEach(id => { markers.current.get(id)?.remove(); markers.current.delete(id); });
      const holeIds = new Set();
      p.collars.forEach(c => {
        const el = buildMarkerEl(
          { width: '12px', height: '12px', background: '#F3F1E9', border: '2px solid #211E1A', boxShadow: '0 1px 4px rgba(0,0,0,0.4)' },
          c.id,
        );
        const marker = new mgl.current.Marker({ element: el })
          .setLngLat([c.lng, c.lat])
          .setPopup(new mgl.current.Popup({ className: 'mx-popup', closeButton: false, maxWidth: '260px' }).setHTML(collarPopupHtml(c, p.intervals || [], activeElement)))
          .addTo(map);
        markers.current.set(c.id, marker);
        holeIds.add(c.id);
      });
      groupMembers.current.set(holeKey, holeIds);

      // Promoted targets — the user's committed worklist, persisted in the
      // store, so unlike the ephemeral analysis candidates they survive a
      // reload, a re-run, and a viewport change. Diamond markers coloured
      // by status; click opens the target's evidence/status popup.
      const tgtKey = `${p.id}:targets`;
      (groupMembers.current.get(tgtKey) || new Set()).forEach(id => { markers.current.get(id)?.remove(); markers.current.delete(id); });
      const tgtIds = new Set();
      (p.targets || []).forEach(t => {
        const marker = new mgl.current.Marker({ element: buildTargetMarkerEl(t) })
          .setLngLat([t.lng, t.lat])
          .setPopup(new mgl.current.Popup({ className: 'mx-popup', closeButton: false, maxWidth: '260px' }).setHTML(targetPopupHtml(t)))
          .addTo(map);
        markers.current.set(t.id, marker);
        tgtIds.add(t.id);
      });
      groupMembers.current.set(tgtKey, tgtIds);

      // Boundary polygon.
      const existingBnd = boundaryLayers.current.get(p.id);
      if (existingBnd) {
        if (map.getLayer(existingBnd.fillLayerId)) map.removeLayer(existingBnd.fillLayerId);
        if (map.getLayer(existingBnd.lineLayerId)) map.removeLayer(existingBnd.lineLayerId);
        if (map.getSource(existingBnd.sourceId)) map.removeSource(existingBnd.sourceId);
        boundaryLayers.current.delete(p.id);
      }
      if (p.boundary) {
        const sourceId = `bnd-src-${p.id}`;
        const fillLayerId = `bnd-fill-${p.id}`;
        const lineLayerId = `bnd-line-${p.id}`;
        map.addSource(sourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: { name: p.boundary.name },
            geometry: { type: 'Polygon', coordinates: [p.boundary.coords.map(([lat, lng]) => [lng, lat])] },
          },
        });
        map.addLayer({ id: fillLayerId, type: 'fill', source: sourceId, paint: { 'fill-color': p.color, 'fill-opacity': 0.06 } });
        map.addLayer({ id: lineLayerId, type: 'line', source: sourceId, paint: { 'line-color': '#F6F3EC', 'line-width': 2, 'line-dasharray': [3, 3] } });
        const bndPopup = new mgl.current.Popup({ className: 'mx-popup', closeButton: false });
        map.on('mousemove', fillLayerId, (e) => bndPopup.setLngLat(e.lngLat).setHTML(`<div class="mx-pop-row">${esc(p.boundary.name)}</div>`).addTo(map));
        map.on('mouseleave', fillLayerId, () => bndPopup.remove());
        boundaryLayers.current.set(p.id, { sourceId, fillLayerId, lineLayerId });
      }
    });
  }, [store, mapReady, activeElement]);

  // ── Apply visibility toggles ────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return;
    const map = mapInstance.current;
    store.projects.forEach(p => {
      const projectHidden = hidden[`proj:${p.id}`];
      [['chips', `chips:${p.id}`], ['holes', `holes:${p.id}`], ['targets', `targets:${p.id}`]].forEach(([suffix, nodeId]) => {
        const ids = groupMembers.current.get(`${p.id}:${suffix}`);
        if (!ids) return;
        const show = !projectHidden && !hidden[nodeId];
        ids.forEach(id => {
          const marker = markers.current.get(id);
          if (!marker) return;
          const el = marker.getElement();
          el.style.display = show ? '' : 'none';
        });
      });
      const bnd = boundaryLayers.current.get(p.id);
      if (bnd) {
        const show = !projectHidden && !hidden[`bnd:${p.id}`];
        const vis = show ? 'visible' : 'none';
        map.setLayoutProperty(bnd.fillLayerId, 'visibility', vis);
        map.setLayoutProperty(bnd.lineLayerId, 'visibility', vis);
      }
    });
  }, [hidden, store, mapReady]);

  // ── Public WMS layers ───────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return;
    const map = mapInstance.current;

    // A WMS raster whose tiles fail (a wrong/guessed endpoint, or one that
    // doesn't send CORS headers — which MapLibre's WebGL raster path
    // requires) must be torn out of the style, not just badged: MapLibre's
    // globe raster renderer throws every frame on a textureless source
    // ("reading 'bind'" inside renderLayer), which Leaflet's <img> tiles
    // never did. Removing the failed source stops the crash and leaves the
    // "unavailable" badge — the same graceful-degradation contract this app
    // already gives a bad GEORES guess. Deferred to a microtask so the
    // style isn't mutated from inside MapLibre's own render/error callback.
    const onSourceError = (e) => {
      if (!e.sourceId?.startsWith('wms-src-')) return;
      const layerId = e.sourceId.replace(/^wms-src-/, '');
      setWmsErrors(prev => (prev[layerId] ? prev : { ...prev, [layerId]: true }));
      queueMicrotask(() => {
        const m = mapInstance.current;
        if (!m || !wmsLayers.current.has(layerId)) return;
        const renderId = `wms-layer-${layerId}`;
        if (m.getLayer(renderId)) m.removeLayer(renderId);
        if (m.getSource(e.sourceId)) m.removeSource(e.sourceId);
        wmsLayers.current.delete(layerId);
      });
    };
    map.on('error', onSourceError);

    PUBLIC_DATA_CATALOG.forEach(group => group.layers.forEach(layer => {
      const on = Boolean(publicOn[layer.id]);
      const sourceId = `wms-src-${layer.id}`;
      const layerRenderId = `wms-layer-${layer.id}`;
      const existing = wmsLayers.current.has(layer.id);
      // Don't re-add a source `onSourceError` just tore out — that would
      // reinstate the every-frame render crash. The badge stays until the
      // user toggles the layer off (which clears it), so off→on is the retry.
      if (on && !existing && !wmsErrors[layer.id]) {
        map.addSource(sourceId, { type: 'raster', tiles: [wmsTileUrl(layer)], tileSize: 256, attribution: layer.attribution });
        map.addLayer({ id: layerRenderId, type: 'raster', source: sourceId, paint: { 'raster-opacity': publicOpacity[layer.id] ?? 0.7 } });
        wmsLayers.current.add(layer.id);
      } else if (!on) {
        if (map.getLayer(layerRenderId)) map.removeLayer(layerRenderId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
        wmsLayers.current.delete(layer.id);
        if (wmsErrors[layer.id]) setWmsErrors(prev => { const next = { ...prev }; delete next[layer.id]; return next; });
      } else if (on && existing) {
        map.setPaintProperty(layerRenderId, 'raster-opacity', publicOpacity[layer.id] ?? 0.7);
      }
    }));

    return () => { map.off('error', onSourceError); };
  }, [publicOn, publicOpacity, mapReady, wmsErrors]);

  // ── Basemap ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return;
    const map = mapInstance.current;
    const src = map.getSource('basemap');
    if (src) src.setTiles([BASEMAP_TILES[basemap] || BASEMAP_TILES.satellite]);
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
            if (!map || !mgl.current || !activeProject) return;
            if (activeProject.boundary) {
              map.fitBounds(boundsOfCoords(mgl.current, activeProject.boundary.coords), { padding: 60, duration: 800 });
            } else {
              const pts = [...activeProject.samples, ...activeProject.collars].map(f => [f.lat, f.lng]);
              if (pts.length) map.fitBounds(boundsOfCoords(mgl.current, pts), { padding: 80, duration: 800 });
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
                      if (map && mgl.current) map.fitBounds(boundsOfCoords(mgl.current, p.boundary.coords), { padding: 60, duration: 800 });
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
        <div className="mx-undo-group">
          <button
            type="button" className="mx-undo-btn" title="Undo (Ctrl+Z)"
            disabled={!canUndo} onClick={doUndo}
          >
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4 L3 8 L7 12" /><path d="M3 8 H12 a5 5 0 0 1 0 10 H8" /></svg>
          </button>
          <button
            type="button" className="mx-undo-btn" title="Redo (Ctrl+Shift+Z)"
            disabled={!canRedo} onClick={doRedo}
          >
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 4 L17 8 L13 12" /><path d="M17 8 H8 a5 5 0 0 0 0 10 H12" /></svg>
          </button>
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
                    pushUndo(store); // an accidental reset is the most valuable thing to undo
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

      {/* STORAGE BANNERS */}
      {saveFailed && (
        <div className="mx-storage-banner mx-import-err">
          Your last change didn&apos;t save — storage is full.
          <button
            type="button" className="mx-storage-banner-btn"
            onClick={() => { store.projects.forEach(p => api.exportProject(p)); }}
          >Export now</button>
        </div>
      )}
      {!saveFailed && exportStale && !staleDismissed && (
        <div className="mx-storage-banner mx-import-ok">
          It&apos;s been a while since your last export — worth backing up your work.
          <button
            type="button" className="mx-storage-banner-btn"
            onClick={() => { store.projects.forEach(p => api.exportProject(p)); }}
          >Export all</button>
          <button type="button" className="mx-storage-banner-dismiss" onClick={() => setStaleDismissed(true)}>&times;</button>
        </div>
      )}

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
            flowSubOn={flowSubOn}
            flowOpacity={flowOpacity}
            setFlowOpacity={setFlowOpacity}
            onToggleFlowSub={toggleFlowSub}
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
        <DockBtn icon={<svg width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M11 3 L18 11 L11 19 L4 11 Z" /></svg>} title="Targets" active={dataOpen && dataTab === 'targets'} onClick={() => { setManageTarget(null); if (dataOpen && dataTab === 'targets') { setDataOpen(false); } else { setDataTab('targets'); setDataOpen(true); } }} />
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
        <>
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
            <button type="button" className="mx-stat-item" onClick={() => onData('targets')}>
              <div className="mx-stat-num mx-stat-targets">{stats.targets}</div>
              <div className="mx-stat-label">targets</div>
            </button>
          </div>
          {/* The exploration program's headline: how the targeting is going,
              on the first screen — not buried in a drawer. */}
          {stats.targets > 0 && (
            <button type="button" className="mx-home-targets" onClick={() => onData('targets')}>
              {stats.assessed > 0
                ? <span>Model hit-rate · <strong>{stats.confirmed}/{stats.assessed}</strong> assessed targets confirmed</span>
                : <span>{stats.targets} target{stats.targets === 1 ? '' : 's'} on the worklist — none assessed yet</span>}
              <span className="mx-home-targets-go">Open worklist →</span>
            </button>
          )}
        </>
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
  const [pendingProjection, setPendingProjection] = useState(null); // {text, kind, fileName, easting, northing}
  const [extractOpen, setExtractOpen] = useState(false); // AI report-text extraction flow
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
          const r = parseSampleCsv(text, project.samples, project.idPrefix);
          if (r.needsProjection) return setPendingProjection({ text, kind: 'chips', fileName: file.name, easting: r.easting, northing: r.northing });
          if (r.error) return setMsg({ error: true, text: r.error });
          api.addSamples(project.id, r.samples, file.name);
          setMsg({ error: false, text: `${detected('chips')}imported ${r.samples.length} sample${r.samples.length === 1 ? '' : 's'}.${r.warnings ? ` ${r.warnings}` : ''}` });
        },
        collars: () => {
          const r = parseCollarCsv(text, project.collars, project.idPrefix.replace('-RC-', '-DD-'));
          if (r.needsProjection) return setPendingProjection({ text, kind: 'collars', fileName: file.name, easting: r.easting, northing: r.northing });
          if (r.error) return setMsg({ error: true, text: r.error });
          api.addCollars(project.id, r.collars, file.name);
          setMsg({ error: false, text: `${detected('collars')}imported ${r.collars.length} collar${r.collars.length === 1 ? '' : 's'}.${r.warnings ? ` ${r.warnings}` : ''}` });
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

  const confirmProjection = useCallback((zone) => {
    if (!pendingProjection || !project) return;
    const { text, kind, fileName } = pendingProjection;
    if (kind === 'chips') {
      const r = parseSampleCsv(text, project.samples, project.idPrefix, zone);
      if (r.error) { setMsg({ error: true, text: r.error }); setPendingProjection(null); return; }
      api.addSamples(project.id, r.samples, fileName);
      setMsg({ error: false, text: `Reprojected from MGA Zone ${zone} — imported ${r.samples.length} sample${r.samples.length === 1 ? '' : 's'}.${r.warnings ? ` ${r.warnings}` : ''}` });
    } else {
      const r = parseCollarCsv(text, project.collars, project.idPrefix.replace('-RC-', '-DD-'), zone);
      if (r.error) { setMsg({ error: true, text: r.error }); setPendingProjection(null); return; }
      api.addCollars(project.id, r.collars, fileName);
      setMsg({ error: false, text: `Reprojected from MGA Zone ${zone} — imported ${r.collars.length} collar${r.collars.length === 1 ? '' : 's'}.${r.warnings ? ` ${r.warnings}` : ''}` });
    }
    setPendingProjection(null);
  }, [pendingProjection, project, api]);

  return (
    <div className="mx-glass-panel mx-anim-rise">
      <div className="mx-panel-header mx-panel-header-compact">
        <span className="mx-panel-title-sm">Add data{project ? ` · ${project.name}` : ''}</span>
        <button type="button" className="mx-close-btn" onClick={onClose}>&times;</button>
      </div>
      {pendingProjection ? (
        <ZonePicker easting={pendingProjection.easting} northing={pendingProjection.northing} onConfirm={confirmProjection} onCancel={() => setPendingProjection(null)} />
      ) : extractOpen ? (
        <ExtractPanel project={project} api={api} onBack={() => setExtractOpen(false)} />
      ) : (
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
          <button type="button" className="mx-extract-open" onClick={() => setExtractOpen(true)}>
            &#10022; Extract from report text (AI)
          </button>
        </div>
      )}
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
function LayersPanel({ store, hidden, setHidden, isExpanded, setExpanded, publicOn, setPublicOn, publicOpacity, setPublicOpacity, wmsErrors, basemap, setBasemap, activeElement, setActiveElement, availableElements, flowState, flowSubOn, flowOpacity, setFlowOpacity, onToggleFlowSub, onRerunFlow, onManage, onClose }) {
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

        {/* GeoResGlobe: raw QLD open-data catalog, organized by GeoResGlobe's */}
        {/* own official themes — everything here is published data, not */}
        {/* computed by this app (see Target Analysis below for that). */}
        <div className="mx-tree-row mx-tree-row-group" style={{ paddingLeft: '8px' }}>
          <button type="button" className="mx-tree-caret" onClick={() => toggleExpanded('pub', false)}>
            {isExpanded('pub', false) ? MxIcons.chevronDown : MxIcons.chevronRight}
          </button>
          <div className="mx-tree-swatch" style={{ background: '#7F8C8D', transform: 'rotate(45deg)', width: 11, height: 11 }} />
          <span className="mx-tree-name mx-tree-name-bold">GeoResGlobe</span>
        </div>
        {isExpanded('pub', false) && (
          <>
            {THEME_ORDER.map(theme => {
              const layers = PUBLIC_DATA_CATALOG.flatMap(g => g.layers).filter(l => l.theme === theme);
              if (!layers.length) return null;
              return (
                <div key={theme}>
                  <div className="mx-tree-row" style={{ paddingLeft: '30px' }}>
                    <span className="mx-tree-caret" style={{ visibility: 'hidden' }} />
                    <div className="mx-tree-swatch" style={{ background: '#95A5A6', transform: 'rotate(45deg)', width: 8, height: 8 }} />
                    <span className="mx-tree-subheading">{THEME_LABELS[theme]}</span>
                  </div>
                  {layers.map(layer => (
                    <div key={layer.id}>
                      <FlowSubRow
                        depth={1}
                        label={layer.name}
                        swatch={{ background: '#95A5A6', borderRadius: '50%', width: 7, height: 7 }}
                        on={publicOn[layer.id]}
                        onToggle={() => setPublicOn(prev => ({ ...prev, [layer.id]: !prev[layer.id] }))}
                        opacity={publicOn[layer.id] ? (publicOpacity[layer.id] ?? 0.7) : undefined}
                        onOpacity={(v) => setPublicOpacity(prev => ({ ...prev, [layer.id]: v }))}
                        error={wmsErrors[layer.id] && publicOn[layer.id]}
                        title={layer.attribution}
                      />
                    </div>
                  ))}
                </div>
              );
            })}

            {/* Mineral Occurrences: raw GEORES vector data, one toggleable */}
            {/* row per commodity, populated from whatever the current view */}
            {/* actually returns. Fetched by Target Analysis below (shared */}
            {/* cache) — this is only where the toggle lives. */}
            {flowState.status !== 'idle' && (
              <div className="mx-tree-row" style={{ paddingLeft: '30px' }}>
                <span className="mx-tree-caret" style={{ visibility: 'hidden' }} />
                <div className="mx-tree-swatch" style={{ background: '#7F8C8D', transform: 'rotate(45deg)', width: 8, height: 8 }} />
                <span className="mx-tree-subheading">Mineral Occurrences</span>
                {flowState.occurrencesError && <span className="mx-tree-error" title="Occurrence service unavailable for this view">unavailable</span>}
                {!flowState.occurrencesError && flowState.commodities.length === 0 && flowState.status === 'ready' && (
                  <span className="mx-tree-attribution">none in view</span>
                )}
              </div>
            )}
            {flowState.commodities.map((commodity, idx) => (
              <FlowSubRow
                key={commodity}
                depth={1}
                label={commodity}
                swatch={{ background: commodity === 'Gold' ? '#B08A3E' : PROJECT_COLORS[(idx + 1) % PROJECT_COLORS.length], borderRadius: '50%', width: 7, height: 7 }}
                on={flowSubOn[`occ:${commodity}`]} onToggle={() => onToggleFlowSub(`occ:${commodity}`)}
              />
            ))}
            {flowState.status === 'idle' && (
              <div className="mx-tree-row" style={{ paddingLeft: '30px' }}>
                <span className="mx-tree-caret" style={{ visibility: 'hidden' }} />
                <div className="mx-tree-swatch" style={{ background: '#7F8C8D', transform: 'rotate(45deg)', width: 8, height: 8 }} />
                <span className="mx-tree-subheading">Mineral Occurrences</span>
                <span className="mx-tree-attribution">turn on Target Analysis to load</span>
              </div>
            )}

            {/* Historic Mines: same live-fetch pattern as Mineral Occurrences, */}
            {/* separate GEORES service and its own error/empty states. */}
            {flowState.status !== 'idle' && (
              <div className="mx-tree-row" style={{ paddingLeft: '30px' }}>
                <span className="mx-tree-caret" style={{ visibility: 'hidden' }} />
                <div className="mx-tree-swatch" style={{ background: '#5E6E7A', transform: 'rotate(45deg)', width: 8, height: 8 }} />
                <span className="mx-tree-subheading">Historic Mines</span>
                {flowState.historicMinesError && <span className="mx-tree-error" title="Historic mines service unavailable for this view">unavailable</span>}
                {!flowState.historicMinesError && flowState.historicMinesCount === 0 && flowState.status === 'ready' && (
                  <span className="mx-tree-attribution">none in view</span>
                )}
              </div>
            )}
            {flowState.status === 'ready' && !flowState.historicMinesError && flowState.historicMinesCount > 0 && (
              <FlowSubRow
                depth={1}
                label={`Historic mine sites`}
                swatch={{ background: '#5E6E7A', borderRadius: '50%', width: 7, height: 7 }}
                on={flowSubOn.historicMines} onToggle={() => onToggleFlowSub('historicMines')}
              />
            )}
            {flowState.status === 'idle' && (
              <div className="mx-tree-row" style={{ paddingLeft: '30px' }}>
                <span className="mx-tree-caret" style={{ visibility: 'hidden' }} />
                <div className="mx-tree-swatch" style={{ background: '#5E6E7A', transform: 'rotate(45deg)', width: 8, height: 8 }} />
                <span className="mx-tree-subheading">Historic Mines</span>
                <span className="mx-tree-attribution">turn on Target Analysis to load</span>
              </div>
            )}
          </>
        )}

        {/* Target Analysis: this app's own computed hydrology/correlation */}
        {/* engine — seeded by (not itself) the GeoResGlobe data above. */}
        <div className="mx-tree-row mx-tree-row-group" style={{ paddingLeft: '8px' }}>
          <button type="button" className="mx-tree-caret" onClick={() => toggleExpanded('flow', true)}>
            {isExpanded('flow', true) ? MxIcons.chevronDown : MxIcons.chevronRight}
          </button>
          <div className="mx-tree-swatch" style={{ background: '#3E6C8C', transform: 'rotate(45deg)', width: 11, height: 11 }} />
          <span className="mx-tree-name mx-tree-name-bold">Target Analysis</span>
          {flowState.status === 'running' && <span className="mx-tree-attribution">computing…</span>}
          {flowState.status === 'ready' && <span className="mx-tree-count">{flowState.targets} targets</span>}
          {flowState.status === 'error' && <span className="mx-tree-error" title="Elevation tiles unreachable — try again">failed</span>}
        </div>
        {isExpanded('flow', true) && (
          <>
            {/* Hydraulics / Metal Concentration: the water-physics layers */}
            <div className="mx-tree-row" style={{ paddingLeft: '30px' }}>
              <button type="button" className="mx-tree-caret" onClick={() => toggleExpanded('flow:hydraulics', true)}>
                {isExpanded('flow:hydraulics', true) ? MxIcons.chevronDown : MxIcons.chevronRight}
              </button>
              <div className="mx-tree-swatch" style={{ background: '#3E6C8C', transform: 'rotate(45deg)', width: 8, height: 8 }} />
              <span className="mx-tree-subheading">Hydraulics / Metal Concentration</span>
            </div>
            {isExpanded('flow:hydraulics', true) && (
              <>
                <FlowSubRow
                  depth={1}
                  label="Drainage channels" swatch={{ background: '#3E6C8C', borderRadius: '50%', width: 8, height: 8 }}
                  on={flowSubOn.drainage} onToggle={() => onToggleFlowSub('drainage')}
                  opacity={flowOpacity.drainage} onOpacity={(v) => setFlowOpacity(prev => ({ ...prev, drainage: v }))}
                />
                <FlowSubRow
                  depth={1}
                  label="Water concentration heatmap" swatch={{ background: 'linear-gradient(90deg,#F3F1E9,#B08A3E,#C15F3C)', borderRadius: '50%', width: 8, height: 8 }}
                  on={flowSubOn.heatmap} onToggle={() => onToggleFlowSub('heatmap')}
                  opacity={flowOpacity.heatmap} onOpacity={(v) => setFlowOpacity(prev => ({ ...prev, heatmap: v }))}
                />
              </>
            )}

            <FlowSubRow
              label="Metal Concentration Zones" swatch={{ background: 'transparent', border: '2px solid #8A6A3E', borderRadius: '50%', width: 8, height: 8 }}
              on={flowSubOn.targets} onToggle={() => onToggleFlowSub('targets')}
            />
            <FlowSubRow
              label="Correlated Targets" swatch={{ background: '#C15F3C', border: `2px solid ${PROJECT_COLORS[4]}`, width: 9, height: 9, borderRadius: '50%' }}
              on={flowSubOn.correlated} onToggle={() => onToggleFlowSub('correlated')}
            />

            <div className="mx-flow-note">
              Uses Mineral Occurrences &amp; Historic Mines from GeoResGlobe above as seed data.
            </div>

            {flowState.status === 'ready' && (
              <div className="mx-flow-note">
                Analysed for the current view — pan, then
                <button type="button" className="mx-flow-rerun" onClick={onRerunFlow}>re-run</button>.
                Heuristic terrain model: field-check targets.
              </div>
            )}

            {/* Model calibration: real hit-rate from the user's own assessed */}
            {/* targets — closes the exploration loop. Never a seeded number. */}
            {(() => {
              const hr = targetHitRate(store);
              if (!hr.assessed) return null;
              return (
                <div className="mx-flow-note mx-hitrate">
                  Model calibration · {hr.assessed} target{hr.assessed === 1 ? '' : 's'} assessed:
                  {' '}<strong>{hr.confirmed} confirmed</strong>, {hr.barren} barren
                </div>
              );
            })()}
          </>
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

// One toggleable terrain sub-layer row: eye + optional opacity slider,
// same visual language as the WMS public-layer rows above.
function FlowSubRow({ label, swatch, on, onToggle, opacity, onOpacity, depth = 0, error, title }) {
  return (
    <>
      <div className="mx-tree-row" style={{ paddingLeft: `${30 + depth * 20}px` }}>
        <span className="mx-tree-caret" style={{ visibility: 'hidden' }} />
        <div className="mx-tree-swatch" style={swatch} />
        <span className={`mx-tree-name ${on ? '' : 'mx-tree-name-off'}`} title={title}>{label}</span>
        {error && <span className="mx-tree-error" title="Service not responding — check the layer or your connection">unavailable</span>}
        <button type="button" className={`mx-tree-eye ${on ? 'on' : ''}`} onClick={onToggle} title={on ? 'Hide' : 'Show'}>
          <div className="mx-eye-dot" />
        </button>
      </div>
      {on && onOpacity && (
        <div className="mx-opacity-row">
          <input
            type="range" min="10" max="100"
            value={Math.round((opacity ?? 0.5) * 100)}
            onChange={(e) => onOpacity(Number(e.target.value) / 100)}
            className="mx-opacity-slider"
            title="Opacity"
          />
        </div>
      )}
    </>
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
