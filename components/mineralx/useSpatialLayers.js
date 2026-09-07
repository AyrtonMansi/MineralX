'use client';
import { useEffect, useRef } from 'react';
import { boundaryData } from './spatial-import.js';
import { effectiveOn, layerOpacityOf } from './layer-registry.js';

const hex = (value, fallback) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
const fraction = (value, fallback) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
export function renderableSpatialData(data, fallback = '#647f91', outline = false) {
  const features = [];
  for (const [index, f] of data.features.entries()) {
    const p = f.properties || {};
    const properties = { sourceIndex: index, name: String(p.name || f.id || `Feature ${index + 1}`), stroke: outline ? hex(fallback, '#647f91') : hex(p.stroke, fallback), fill: hex(p.fill, fallback), point: hex(p['marker-color'], fallback), strokeOpacity: outline ? 1 : fraction(p['stroke-opacity'], 1), fillOpacity: outline ? 0 : fraction(p['fill-opacity'], 0.2), width: Number.isFinite(p['stroke-width']) ? Math.max(1, Math.min(12, p['stroke-width'])) : 2 };
    const add = geometry => { if (geometry.type === 'GeometryCollection') geometry.geometries.forEach(add); else features.push({ type: 'Feature', properties, geometry }); };
    add(f.geometry);
  }
  return { type: 'FeatureCollection', features };
}
export default function useSpatialLayers({ mapInstance, mgl, mapReady, mapEpoch, projects, layerOn, layerOpacity, layerIndex, onError }) {
  const mounted = useRef(new Map());
  useEffect(() => {
    if (!mapReady || !mapInstance.current) return;
    const map = mapInstance.current, wanted = new Set();
    const remove = entry => {
      entry.popup?.remove();
      for (const id of entry.ids) { map.off('click', id, entry.click); if (map.getLayer(id)) map.removeLayer(id); }
      if (map.getSource(entry.source)) map.removeSource(entry.source);
    };
    try {
      const entries = projects.flatMap(p => [
        ...(p.boundary ? [{ node: `bnd:${p.id}`, name: p.boundary.name, data: boundaryData(p.boundary), color: p.color, boundary: true }] : []),
        ...(p.spatialLayers || []).filter(l => !l.archivedAt).map(l => ({ node: `spatial:${p.id}:${l.recordId}`, name: l.name, data: l.data, color: '#647f91' })),
      ]);
      for (const item of entries) {
        wanted.add(item.node);
        let entry = mounted.current.get(item.node);
        if (entry?.map !== map) { mounted.current.delete(item.node); entry = null; }
        if (!entry) {
          const source = `mx-vector:${item.node}`, ids = ['fill', 'line', 'point'].map(k => `${source}:${k}`);
          map.addSource(source, { type: 'geojson', data: renderableSpatialData(item.data, item.color, item.boundary) });
          map.addLayer({ id: ids[0], type: 'fill', source, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': ['get', 'fill'], 'fill-opacity': ['get', 'fillOpacity'] } });
          map.addLayer({ id: ids[1], type: 'line', source, filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'LineString']]], paint: { 'line-color': ['get', 'stroke'], 'line-width': ['get', 'width'], 'line-opacity': ['get', 'strokeOpacity'], ...(item.boundary ? { 'line-dasharray': [3, 2] } : {}) } });
          map.addLayer({ id: ids[2], type: 'circle', source, filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-color': ['get', 'point'], 'circle-radius': 5, 'circle-stroke-width': 1, 'circle-stroke-color': '#ffffff' } });
          entry = { map, source, ids, data: item.data, name: item.name, color: item.color, popup: null };
          entry.click = e => {
            if (e.originalEvent?.__mineralxSpatialPicked) return;
            if (e.originalEvent) e.originalEvent.__mineralxSpatialPicked = true;
            const f = entry.data.features[e.features?.[0]?.properties?.sourceIndex]; if (!f) return;
            const panel = document.createElement('div'); panel.className = 'mx-spatial-popup';
            const title = document.createElement('strong'); title.textContent = f.properties?.name || entry.name; panel.append(title);
            const note = document.createElement('p'); note.textContent = 'Imported reference · not a collected sample'; panel.append(note);
            for (const [key, value] of Object.entries(f.properties || {})) {
              if (key === 'name' || value == null || value === '') continue;
              const row = document.createElement('p'); row.textContent = `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`; panel.append(row);
            }
            entry.popup?.remove(); entry.popup = new mgl.current.Popup({ maxWidth: '340px' }).setLngLat(e.lngLat).setDOMContent(panel).addTo(map);
          };
          ids.forEach(id => map.on('click', id, entry.click)); mounted.current.set(item.node, entry);
        }
        if (entry.data !== item.data || entry.color !== item.color) { map.getSource(entry.source).setData(renderableSpatialData(item.data, item.color, item.boundary)); entry.data = item.data; entry.color = item.color; }
        entry.name = item.name;
        const visible = effectiveOn(layerOn, layerIndex, item.node), opacity = layerOpacityOf(layerOpacity, layerIndex, item.node);
        entry.ids.forEach(id => map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none'));
        if (!visible) entry.popup?.remove();
        map.setPaintProperty(entry.ids[0], 'fill-opacity', ['*', ['get', 'fillOpacity'], opacity]);
        map.setPaintProperty(entry.ids[1], 'line-opacity', ['*', ['get', 'strokeOpacity'], opacity]);
        map.setPaintProperty(entry.ids[2], 'circle-opacity', opacity);
      }
      for (const [key, entry] of mounted.current) if (!wanted.has(key)) { if (entry.map === map) remove(entry); mounted.current.delete(key); }
      onError('');
    } catch (error) { onError(`A spatial layer could not be rendered: ${error.message}. Its saved data is retained.`); }
  }, [mapReady, mapEpoch, projects, layerOn, layerOpacity, layerIndex, mapInstance, mgl, onError]);
  useEffect(() => { const entries = mounted.current; return () => { for (const entry of entries.values()) { entry.popup?.remove(); for (const id of entry.ids) entry.map.off('click', id, entry.click); } entries.clear(); }; }, []);
}
