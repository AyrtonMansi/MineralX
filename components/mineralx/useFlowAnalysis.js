// Terrain flow analysis: drainage, heatmap, targets, known GEORES
// occurrences/historic mines, and their correlation — five+ toggleable
// sub-layers all rendered from a single cached analysis of the current
// viewport. Extracted out of MineralXWorkspace.jsx as a self-contained
// hook: everything it needs from the host component is the map
// instance/module refs (mutable containers already owned by the parent,
// shared by reference — not copied) plus the current project data.
//
// `flowLayerRefs` is returned so the parent's render-crash recovery
// effect can still clear it directly (`flowLayerRefs.current = {}`),
// exactly as it did when this lived inline.
import { useCallback, useEffect, useRef, useState } from 'react';
import { gradeOf } from './project-store';
import {
  fetchElevationGrid, runAnalysis, fetchMineralOccurrences, fetchHistoricMines,
  renderDrainageOverlay, renderConcentrationHeatmap,
} from './terrain-flow';
import {
  imageCoordsFromBounds, buildMarkerEl, commodityColor, targetStyle, targetLabel,
} from './map-render-helpers';

export function useFlowAnalysis({ mapInstance, mgl, store, activeElement }) {
  const [flowState, setFlowState] = useState({
    status: 'idle', targets: 0, commodities: [], occurrencesError: false,
    historicMinesCount: 0, historicMinesError: false,
  });
  // All sub-layers start off — the first eye-toggle click is what
  // triggers the (only) fetch+compute for the current viewport.
  const [flowSubOn, setFlowSubOn] = useState({ drainage: false, targets: false, heatmap: false, correlated: false });
  const [flowOpacity, setFlowOpacity] = useState({ drainage: 0.65, heatmap: 0.5 });

  const flowCache = useRef(null); // { grid, flow, targets, occurrencesByCommodity } for the last analysed viewport
  const flowLayerRefs = useRef({}); // sub-layer key -> { sourceId, layerId } (raster) or Marker[] (points) currently on the map

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

    if (!map || !maplibregl) return;
    if (!cache) {
      Object.keys(refs).forEach((k) => {
        if (Array.isArray(refs[k])) removeMarkerGroup(k); else removeRasterLayer(k);
      });
      return;
    }
    const { grid, flow, targets, occurrencesByCommodity, historicMines } = cache;

    setRasterLayer('drainage', !!flowSubOn.drainage, flowOpacity.drainage ?? 0.65, () => renderDrainageOverlay(flow, grid.w, grid.h), grid.bounds);
    setRasterLayer('heatmap', !!flowSubOn.heatmap, flowOpacity.heatmap ?? 0.5, () => renderConcentrationHeatmap(flow, grid.w, grid.h), grid.bounds);

    setMarkerGroup('targets', !!flowSubOn.targets, () => targets.map((t) => {
      const s = targetStyle(t);
      const el = buildMarkerEl({ width: `${s.radius * 2}px`, height: `${s.radius * 2}px`, borderRadius: '50%', background: s.fillColor, border: `${s.weight}px solid ${s.color}` }, targetLabel(t));
      return new maplibregl.Marker({ element: el }).setLngLat([t.lng, t.lat]).addTo(map);
    }));

    setMarkerGroup('correlated', !!flowSubOn.correlated, () => targets.filter((t) => t.sample && t.occurrence).map((t) => {
      const el = buildMarkerEl({ width: '26px', height: '26px', borderRadius: '50%', background: 'transparent', border: '2px dashed #FAF9F4' }, 'Highest confidence: known Gold occurrence + your own sample both drain here');
      return new maplibregl.Marker({ element: el }).setLngLat([t.lng, t.lat]).addTo(map);
    }));

    Object.entries(occurrencesByCommodity || {}).forEach(([commodity, points], idx) => {
      const key = `occ:${commodity}`;
      setMarkerGroup(key, !!flowSubOn[key], () => points.map((o) => {
        const el = buildMarkerEl({ width: '12px', height: '12px', borderRadius: '50%', background: commodityColor(commodity, idx), border: '2px solid #FAF9F4' }, `${o.name} · ${commodity}`);
        return new maplibregl.Marker({ element: el }).setLngLat([o.lng, o.lat]).addTo(map);
      }));
    });

    setMarkerGroup('historicMines', !!flowSubOn.historicMines, () => (historicMines || []).map((m) => {
      const el = buildMarkerEl({ width: '12px', height: '12px', borderRadius: '50%', background: '#5E6E7A', border: '2px solid #FAF9F4' }, `${m.name} · ${m.mineType}`);
      return new maplibregl.Marker({ element: el }).setLngLat([m.lng, m.lat]).addTo(map);
    }));
  }, [flowSubOn, flowOpacity, mapInstance, mgl]);

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
      const { flow, targets } = runAnalysis(grid, hotSamples, goldOccurrences);

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

  const toggleFlowSub = useCallback((key) => {
    setFlowSubOn((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // First time any sub-layer is switched on with nothing cached yet,
  // trigger the (only) fetch+compute. Later toggles just re-render.
  useEffect(() => {
    const anyOn = Object.values(flowSubOn).some(Boolean);
    if (anyOn && !flowCache.current && flowState.status !== 'running') runFlowAnalysis();
  }, [flowSubOn, flowState.status, runFlowAnalysis]);

  return {
    flowState, flowSubOn, flowOpacity, setFlowOpacity,
    toggleFlowSub, runFlowAnalysis, flowLayerRefs,
  };
}
