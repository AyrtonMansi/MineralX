'use client';
import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { BASEMAP_TILES } from './layer-data';

// A thin, isolated 3D-globe landing view. Deliberately holds no project
// data of its own beyond a single centroid marker/outline — it exists to
// give the "approach from space" moment before handing off into the real
// (Leaflet-based) workspace, not to duplicate what that workspace does.
export default function GlobeView({ center, boundary, onEnterWorkspace }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: {
          version: 8,
          sources: {
            satellite: {
              type: 'raster',
              tiles: [BASEMAP_TILES.satellite],
              tileSize: 256,
              attribution: 'Esri World Imagery',
            },
          },
          layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }],
          // MapLibre renders a subtle atmosphere/sky by default in globe mode.
        },
        projection: 'globe',
        center: [center.lng, center.lat],
        zoom: 1.4,
        attributionControl: false,
      });
      mapRef.current = map;

      map.on('load', () => {
        if (boundary?.coords?.length) {
          map.addSource('mx-globe-boundary', {
            type: 'geojson',
            data: {
              type: 'Feature',
              geometry: {
                type: 'Polygon',
                coordinates: [boundary.coords.map(([lat, lng]) => [lng, lat])],
              },
            },
          });
          map.addLayer({
            id: 'mx-globe-boundary-line',
            type: 'line',
            source: 'mx-globe-boundary',
            paint: { 'line-color': '#C15F3C', 'line-width': 2 },
          });
        } else {
          map.addSource('mx-globe-marker', {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'Point', coordinates: [center.lng, center.lat] } },
          });
          map.addLayer({
            id: 'mx-globe-marker-dot',
            type: 'circle',
            source: 'mx-globe-marker',
            paint: {
              'circle-radius': 6,
              'circle-color': '#C15F3C',
              'circle-stroke-width': 2,
              'circle-stroke-color': '#FAF9F4',
            },
          });
        }

        map.flyTo({ center: [center.lng, center.lat], zoom: 9, duration: 2200, curve: 1.4 });
      });
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Only the initial center/boundary matter — this view doesn't track
    // live project edits while open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-globe-view">
      <div ref={containerRef} className="mx-globe-canvas" />
      <button type="button" className="mx-globe-enter-btn" onClick={onEnterWorkspace}>
        Enter workspace &rarr;
      </button>
    </div>
  );
}
