type MapLibreModule = { setWorkerUrl: (url: string) => void };

const workerUrl = '/maplibre/maplibre-gl-worker.mjs';

/**
 * MapLibre v6 is ESM-only. Its GeoJSON worker must be served as an ESM asset
 * with maplibre-gl-shared.mjs alongside it; configure this before creating
 * any map so interactive/vector sources work under Next's client bundler.
 */
export function configureMapLibreWorker<T extends MapLibreModule>(maplibre: T): T {
  maplibre.setWorkerUrl(workerUrl);
  return maplibre;
}
