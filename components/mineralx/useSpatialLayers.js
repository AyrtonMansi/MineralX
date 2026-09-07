'use client';
import { useEffect, useRef } from 'react';
import { effectiveOn, layerOpacityOf } from './layer-registry.js';
import { boundaryData } from './spatial-import.js';

function color(value, fallback) { return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback; }
export function renderableSpatialData(data, fallback, outline = false) {
  const features = [];
  const add = (f, geometry) => {
    if (geometry.type === 'GeometryCollection') { geometry.geometries.forEach(g => add(f, g)); return; }
    const p = f.properties || {};
    features.push({ ...f, geometry, properties: { label: String(p.name || f.id || 'Feature'), displayProperties: JSON.stringify(p), stroke: outline ? fallback : color(p.stroke, fallback), fill: color(p.fill, fallback), point: color(p['marker-color'], fallback), width: outline ? 2 : Math.max(1, Math.min(12, Number(p['stroke-width']) || 2)), fillOpacity: outline ? 0 : Number.isFinite(Number(p['fill-opacity'])) ? Math.max(0, Math.min(1, Number(p['fill-opacity']))) : 0.2, strokeOpacity: Number.isFinite(Number(p['stroke-opacity'])) ? Math.max(0, Math.min(1, Number(p['stroke-opacity']))) : 1 } });
  };
  data.features.forEach(f => add(f, f.geometry));
  return { type: 'FeatureCollection', features };
}

export default function useSpatialLayers({ mapInstance, mgl, mapReady, mapEpoch, projects, layerOn, layerOpacity, layerIndex, onError }) {
  const mounted = useRef(new Map()), currentMap = useRef(null);
  useEffect(() => {
    if (!mapReady || !mapInstance.current || !mgl.current) return;
    const map = mapInstance.current;
    if (currentMap.current !== map) { mounted.current.clear(); currentMap.current = map; }
    const entries = projects.flatMap(project => [
      ...(project.boundary ? [{ node: `bnd:${project.id}`, data: boundaryData(project.boundary), color: project.color, boundary: true }] : []),
      ...(project.spatialLayers || []).filter(l => !l.archivedAt).map(layer => ({ node: `spatial:${project.id}:${layer.recordId}`, data: layer.data, color: project.color, boundary: false })),
    ]);
    const alive = new Set(entries.map(e => e.node));
    try {
      for (const [node, entry] of mounted.current) if (!alive.has(node)) {
        entry.ids.forEach(id => { map.off('click', id, entry.click); if (map.getLayer(id)) map.removeLayer(id); });
        if (map.getSource(entry.source)) map.removeSource(entry.source);
        mounted.current.delete(node);
      }
      for (const item of entries) {
        const source = `mx-vector:${item.node}`, ids = [`${source}:fill`, `${source}:line`, `${source}:point`];
        let entry = mounted.current.get(item.node);
        if (!entry) {
          const click = event => {
            const f = event.features?.[0]; if (!f) return;
            const box = document.createElement('div'); box.className = 'mx-spatial-popup';
            const heading = document.createElement('strong'); heading.textContent = f.properties.label || 'Imported feature'; box.append(heading);
            try { for (const [key, value] of Object.entries(JSON.parse(f.properties.displayProperties || '{}'))) { const row = document.createElement('p'); row.textContent = `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`; box.append(row); } } catch { /* normalized properties remain in the source viewer */ }
            new mgl.current.Popup({ maxWidth: '320px' }).setLngLat(event.lngLat).setDOMContent(box).addTo(map);
          };
          map.addSource(source, { type: 'geojson', data: renderableSpatialData(item.data, item.color || '#786246', item.boundary) });
          map.addLayer({ id: ids[0], type: 'fill', source, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': ['get', 'fill'], 'fill-opacity': ['get', 'fillOpacity'] } });
          map.addLayer({ id: ids[1], type: 'line', source, filter: ['!=', ['geometry-type'], 'Point'], paint: { 'line-color': ['get', 'stroke'], 'line-width': ['get', 'width'], 'line-opacity': ['get', 'strokeOpacity'], ...(item.boundary ? { 'line-dasharray': [3, 2] } : {}) } });
          map.addLayer({ id: ids[2], type: 'circle', source, filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-color': ['get', 'point'], 'circle-radius': 6, 'circle-stroke-width': 1, 'circle-stroke-color': '#ffffff' } });
          ids.forEach(id => map.on('click', id, click));
          entry = { source, ids, click, data: item.data, color: item.color }; mounted.current.set(item.node, entry);
        } else if (entry.data !== item.data || entry.color !== item.color) { map.getSource(source)?.setData(renderableSpatialData(item.data, item.color || '#786246', item.boundary)); entry.data = item.data; entry.color = item.color; }
        const visible = effectiveOn(layerOn, layerIndex, item.node);
        entry.ids.forEach(id => map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none'));
        const opacity = item.boundary ? 1 : layerOpacityOf(layerOpacity, layerIndex, item.node);
        map.setPaintProperty(entry.ids[0], 'fill-opacity', ['*', ['get', 'fillOpacity'], opacity]);
        map.setPaintProperty(entry.ids[1], 'line-opacity', ['*', ['get', 'strokeOpacity'], opacity]);
        map.setPaintProperty(entry.ids[2], 'circle-opacity', opacity);
        map.setPaintProperty(entry.ids[2], 'circle-stroke-opacity', opacity);
      }
      // Cadastral outlines remain legible above imported polygon fills.
      for (const item of entries.filter(item => item.boundary)) {
        for (const id of mounted.current.get(item.node)?.ids || []) if (map.getLayer(id)) map.moveLayer(id);
      }
      onError('');
    } catch (error) { onError(`Map layer could not be rendered: ${error.message}. Imported records remain saved.`); }
  }, [mapReady, mapEpoch, projects, layerOn, layerOpacity, layerIndex, mapInstance, mgl, onError]);
  useEffect(() => {
    const entries = mounted.current;
    return () => { const map = currentMap.current; if (!map) return; for (const entry of entries.values()) entry.ids.forEach(id => { try { map.off('click', id, entry.click); } catch {} }); };
  }, []);
}
