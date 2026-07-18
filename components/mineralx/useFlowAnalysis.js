// Terrain flow analysis: drainage, heatmap, targets, known GEORES
// occurrences/historic mines, and their correlation — five+ toggleable
// sub-layers all rendered from a single cached analysis of the current
// viewport. Extracted out of MineralXWorkspace.jsx as a self-contained
// hook: everything it needs from the host component is the map
// instance/module refs (mutable containers already owned by the parent,
// shared by reference — not copied) plus the current project data.
//
// Sub-layer on/off + opacity live in the PARENT's unified `layerOn`/
// `layerOpacity` state (layer-registry.js), not owned here — this hook
// used to keep its own separate `flowSubOn`/`flowOpacity` state, one of
// the four incompatible toggle-state shapes the Layers panel restructure
// replaced with a single one shared by every layer type. This hook builds
// its own small lookup (`buildLayerIndex` with no projects — it never
// needs project rows) purely to resolve each sub-layer's registry default
// via `effectiveOn`/`layerOpacityOf`, recomputed only when the set of
// known commodities changes.
//
// `flowLayerRefs` is returned so the parent's render-crash recovery
// effect can still clear it directly (`flowLayerRefs.current = {}`),
// exactly as it did when this lived inline.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gradeOf, targetKey } from './project-store';
import {
  fetchElevationGrid, runAnalysis, fetchMineralOccurrences, fetchHistoricMines,
  renderDrainageOverlay, renderConcentrationHeatmap,
} from './terrain-flow';
import {
  imageCoordsFromBounds, buildMarkerEl, commodityColor, targetStyle, targetLabel,
} from './map-render-helpers';
import { buildLayerIndex, effectiveOn, layerOpacityOf } from './layer-registry';

export function useFlowAnalysis({ mapInstance, mgl, store, activeElement, onPromoteTarget, onDismissCandidate, layerOn, layerOpacity }) {
  const [flowState, setFlowState] = useState({
    status: 'idle', targets: 0, commodities: [], occurrencesError: false,
    historicMinesCount: 0, historicMinesError: false,
  });

  const flowLayerIndex = useMemo(() => buildLayerIndex({ projects: [] }, flowState.commodities), [flowState.commodities]);

  const flowCache = useRef(null); // { grid, flow, targets, occurrencesByCommodity } for the last analysed viewport
  const flowLayerRefs = useRef({}); // sub-layer key -> { sourceId, layerId } (raster) or Marker[] (points) currently on the map

  // Candidate markers are cached and never rebuilt while a marker group
  // stays on (setMarkerGroup only calls buildMarkers() once, on the
  // off->on transition — that's the point, it's what makes toggling free).
  // A marker's popup button therefore can NOT close over onPromoteTarget/
  // onDismissCandidate directly: promoting one candidate changes the store,
  // which gives every OTHER already-open candidate a new `api` and a new
  // onPromoteTarget identity, but their popups — built earlier — would
  // still call the stale one. That stale call computes nextId() and
  // pushUndo() against the pre-promotion store, producing a duplicate
  // target id and an undo that wipes both promotions at once. Refs make
  // every popup, however long it's been mounted, always call the latest
  // handler.
  const onPromoteTargetRef = useRef(onPromoteTarget);
  onPromoteTargetRef.current = onPromoteTarget;
  const onDismissCandidateRef = useRef(onDismissCandidate);
  onDismissCandidateRef.current = onDismissCandidate;

  // Adds/removes each sub-layer's MapLibre layer/markers from cached
  // results — never fetches or recomputes. Called on every toggle/opacity
  // change. Raster overlays (drainage/heatmap) live in `refs` as
  // {sourceId, layerId}; point overlays (targets/correlated/occurrences/
  // historic mines) live in `refs` as arrays of Marker instances.
  const syncFlowLayers = useCallback(() => {
    const map = mapInstance.current;
    const maplibregl = mgl.current;
    const refs = flowLayerRefs.current;
    const cache = flowCache.current;

    const removeRasterLayer = (key) => {
      const ref = refs[key];
      if (!ref) return;
      if (map.getLayer(ref.layerId)) map.removeLayer(ref.layerId);
      if (map.getSource(ref.sourceId)) map.removeSource(ref.sourceId);
      delete refs[key];
    };
    const setRasterLayer = (key, wantOn, opacity, buildCanvas, bounds) => {
      const existing = refs[key];
      if (wantOn && !existing) {
        const canvas = buildCanvas();
        const sourceId = `flow-src-${key}`;
        const layerId = `flow-layer-${key}`;
        map.addSource(sourceId, { type: 'image', url: canvas.toDataURL('image/png'), coordinates: imageCoordsFromBounds(bounds) });
        map.addLayer({ id: layerId, type: 'raster', source: sourceId, paint: { 'raster-opacity': opacity } });
        refs[key] = { sourceId, layerId };
      } else if (!wantOn && existing) {
        removeRasterLayer(key);
      } else if (wantOn && existing) {
        map.setPaintProperty(existing.layerId, 'raster-opacity', opacity);
      }
    };

    const removeMarkerGroup = (key) => {
      (refs[key] || []).forEach((m) => m.remove());
      delete refs[key];
    };
    const setMarkerGroup = (key, wantOn, buildMarkers) => {
      const existing = refs[key];
      if (wantOn && !existing) {
        refs[key] = buildMarkers();
      } else if (!wantOn && existing) {
        removeMarkerGroup(key);
      }
    };

    // A click-popup with a one-click "Add to targets" button — the promote
    // step of the exploration cycle. Built as a DOM node (not setHTML) so
    // the button carries a real handler; on click it calls up to the
    // workspace and flips to a confirmed state in place. The candidate
    // itself stays on the map until the next re-run; the promoted target
    // renders separately as a persistent store-backed marker.
    const promotePopup = (t) => {
      const node = document.createElement('div');
      node.className = 'mx-pop mx-pop-promote';
      const head = document.createElement('div');
      head.className = 'mx-pop-assay';
      head.innerHTML = `<strong>${targetLabel(t)}</strong>`;
      const meta = document.createElement('div');
      meta.className = 'mx-pop-notes';
      meta.textContent = `Score ${Number(t.score ?? 0).toFixed(1)}`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mx-btn-primary mx-pop-promote-btn';
      btn.textContent = 'Add to targets';
      const dismiss = document.createElement('button');
      dismiss.type = 'button';
      dismiss.className = 'mx-pop-dismiss-btn';
      dismiss.textContent = 'Not a target';
      btn.onclick = () => {
        onPromoteTargetRef.current?.(t);
        btn.textContent = 'Added to worklist ✓';
        btn.disabled = true;
        dismiss.style.display = 'none';
      };
      // Rejecting a candidate here remembers the spot so a re-run won't
      // resurface it — the negative decision is as durable as the positive.
      dismiss.onclick = () => {
        onDismissCandidateRef.current?.(t);
        dismiss.textContent = 'Dismissed ✓';
        dismiss.disabled = true;
        btn.style.display = 'none';
      };
      node.append(head, meta, btn, dismiss);
      return new maplibregl.Popup({ className: 'mx-popup', closeButton: false, maxWidth: '240px' }).setDOMContent(node);
    };

    if (!map || !maplibregl) return;
    if (!cache) {
      Object.keys(refs).forEach((k) => {
        if (Array.isArray(refs[k])) removeMarkerGroup(k); else removeRasterLayer(k);
      });
      return;
    }
    const { grid, flow, targets, occurrencesByCommodity, historicMines } = cache;

    setRasterLayer('drainage', effectiveOn(layerOn, flowLayerIndex, 'drainage'), layerOpacityOf(layerOpacity, flowLayerIndex, 'drainage'), () => renderDrainageOverlay(flow, grid.w, grid.h), grid.bounds);
    setRasterLayer('heatmap', effectiveOn(layerOn, flowLayerIndex, 'heatmap'), layerOpacityOf(layerOpacity, flowLayerIndex, 'heatmap'), () => renderConcentrationHeatmap(flow, grid.w, grid.h), grid.bounds);

    // Candidates render as hollow rings, not solid dots, so they read at a
    // glance as the model's *suggestions* — unmistakably different from the
    // geologist's own solid sample dots and the white collar squares. Once
    // promoted they become solid status-coloured diamonds.
    setMarkerGroup('targets', effectiveOn(layerOn, flowLayerIndex, 'targets'), () => targets.map((t) => {
      const s = targetStyle(t);
      const el = buildMarkerEl({ width: `${s.radius * 2}px`, height: `${s.radius * 2}px`, borderRadius: '50%', background: 'transparent', border: `3px solid ${s.fillColor}`, boxShadow: '0 0 0 1.5px rgba(250,249,244,0.55), 0 1px 4px rgba(0,0,0,0.4)' }, targetLabel(t));
      el.classList.add('mx-analysis-target');
      return new maplibregl.Marker({ element: el }).setLngLat([t.lng, t.lat]).setPopup(promotePopup(t)).addTo(map);
    }));

    setMarkerGroup('correlated', effectiveOn(layerOn, flowLayerIndex, 'correlated'), () => targets.filter((t) => t.sample && t.occurrence).map((t) => {
      const el = buildMarkerEl({ width: '26px', height: '26px', borderRadius: '50%', background: 'transparent', border: '2px dashed #FAF9F4' }, 'Highest confidence: known Gold occurrence + your own sample both drain here');
      el.classList.add('mx-analysis-target');
      return new maplibregl.Marker({ element: el }).setLngLat([t.lng, t.lat]).setPopup(promotePopup(t)).addTo(map);
    }));

    Object.entries(occurrencesByCommodity || {}).forEach(([commodity, points], idx) => {
      const key = `occ:${commodity}`;
      setMarkerGroup(key, effectiveOn(layerOn, flowLayerIndex, key), () => points.map((o) => {
        const el = buildMarkerEl({ width: '12px', height: '12px', borderRadius: '50%', background: commodityColor(commodity, idx), border: '2px solid #FAF9F4' }, `${o.name} · ${commodity}`);
        return new maplibregl.Marker({ element: el }).setLngLat([o.lng, o.lat]).addTo(map);
      }));
    });

    setMarkerGroup('historicMines', effectiveOn(layerOn, flowLayerIndex, 'historicMines'), () => (historicMines || []).map((m) => {
      const el = buildMarkerEl({ width: '12px', height: '12px', borderRadius: '50%', background: '#5E6E7A', border: '2px solid #FAF9F4' }, `${m.name} · ${m.mineType}`);
      return new maplibregl.Marker({ element: el }).setLngLat([m.lng, m.lat]).addTo(map);
    }));
    // onPromoteTarget/onDismissCandidate deliberately excluded: they're read
    // via ref (see above) precisely so this callback's identity — and thus
    // whether marker groups get rebuilt — doesn't depend on them.
  }, [layerOn, layerOpacity, flowLayerIndex, mapInstance, mgl]);

  useEffect(() => { syncFlowLayers(); }, [syncFlowLayers]);

  const runFlowAnalysis = useCallback(async () => {
    const map = mapInstance.current;
    if (!map) return;
    setFlowState((s) => ({ ...s, status: 'running' }));
    try {
      const bounds = map.getBounds();
      const hotSamples = store.projects.flatMap((p) =>
        p.samples.filter((s) => ['high', 'anom'].includes(gradeOf(s, activeElement)))
      );

      const [grid, occurrenceResult, mineResult] = await Promise.all([
        fetchElevationGrid(map),
        fetchMineralOccurrences(bounds).then((features) => ({ features, error: false })).catch(() => ({ features: [], error: true })),
        fetchHistoricMines(bounds).then((features) => ({ features, error: false })).catch(() => ({ features: [], error: true })),
      ]);

      const goldOccurrences = occurrenceResult.features.filter((o) => o.commodity === 'Gold');
      const { flow, targets: rawTargets } = runAnalysis(grid, hotSamples, goldOccurrences);
      // Drop candidates the user has already rejected anywhere in the
      // program — a dismissed spot never resurfaces on a re-run.
      const dismissed = new Set(store.projects.flatMap((p) => p.dismissedTargets || []));
      const targets = rawTargets.filter((t) => !dismissed.has(targetKey(t.lat, t.lng)));

      const occurrencesByCommodity = {};
      occurrenceResult.features.forEach((o) => {
        (occurrencesByCommodity[o.commodity] ||= []).push(o);
      });

      flowCache.current = { grid, flow, targets, occurrencesByCommodity, historicMines: mineResult.features };
      setFlowState({
        status: 'ready',
        targets: targets.length,
        commodities: Object.keys(occurrencesByCommodity).sort((a, b) => (a === 'Gold' ? -1 : b === 'Gold' ? 1 : a.localeCompare(b))),
        occurrencesError: occurrenceResult.error,
        historicMinesCount: mineResult.features.length,
        historicMinesError: mineResult.error,
      });
      syncFlowLayers();
    } catch {
      flowCache.current = null;
      setFlowState({ status: 'error', targets: 0, commodities: [], occurrencesError: false, historicMinesCount: 0, historicMinesError: false });
      syncFlowLayers();
    }
  }, [store, activeElement, syncFlowLayers, mapInstance]);

  // First time any sub-layer is switched on with nothing cached yet,
  // trigger the (only) fetch+compute. Later toggles just re-render. Only
  // these four ids have toggle UI before a fetch has ever happened
  // (occurrences/historic-mines rows only render once flowState.status
  // isn't 'idle', i.e. after a fetch already occurred), so checking just
  // these four exactly preserves the original trigger condition even
  // though `layerOn` is now a single flat map shared with every other
  // layer type — an unrelated project/WMS toggle must never cause this to
  // fire (CLAUDE.md hard rule 4: a toggle never triggers a fetch).
  useEffect(() => {
    const anyOn = ['drainage', 'heatmap', 'targets', 'correlated'].some((k) => Boolean(layerOn[k]));
    if (anyOn && !flowCache.current && flowState.status !== 'running') runFlowAnalysis();
  }, [layerOn, flowState.status, runFlowAnalysis]);

  return { flowState, runFlowAnalysis, flowLayerRefs };
}
