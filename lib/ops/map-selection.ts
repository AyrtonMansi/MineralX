import {renderableSpatialData} from '../../components/mineralx/useSpatialLayers.js';

export type SharedSpatialLayer = {
  id: string;
  kind: string;
  data: {type?: string; features: Array<{id?: string | number; [key: string]: unknown}>};
};
type MapHit = {id?: string | number; source?: string; properties?: Record<string, unknown> | null};
const fieldKinds = new Set(['samples', 'collars', 'targets']);

/** Only canonical field layers get a promoted record identity; imported attributes grant no authority. */
export function sharedLayerData(layer: SharedSpatialLayer, color: string) {
  const normalized = renderableSpatialData(layer.data, color, layer.id === 'boundary');
  if (!fieldKinds.has(layer.kind)) return normalized;
  return {
    ...normalized,
    features: normalized.features.map((feature: any) => ({
      ...feature,
      properties: {...feature.properties, recordId: feature.id},
    })),
  };
}

/** Choose once per click. A transparent boundary or reference polygon must not swallow a field record. */
export function selectSharedMapRecord(layers: SharedSpatialLayer[], hits: MapHit[]) {
  for (const hit of hits) {
    const layer = layers.find(candidate => `ops:${candidate.id}` === hit.source);
    if (!layer || !fieldKinds.has(layer.kind)) continue;
    const id = typeof hit.id === 'string' ? hit.id : hit.properties?.recordId;
    if (typeof id === 'string' && layer.data.features.some(feature => feature.id === id)) {
      return {kind: layer.kind, id};
    }
  }
  for (const hit of hits) {
    const layer = layers.find(candidate => `ops:${candidate.id}` === hit.source);
    if (layer?.kind === 'spatialLayers') return {kind: layer.kind, id: layer.id};
  }
  return null;
}

/** MapLibre also queries zero-opacity features; exclude those from interactive hit testing explicitly. */
export function interactiveSharedLayers(layers: SharedSpatialLayer[], visibility: Record<string, boolean>, opacity: Record<string, number>) {
  return layers.filter(layer => (fieldKinds.has(layer.kind) || layer.kind === 'spatialLayers') && visibility[layer.id] !== false && (opacity[layer.id] ?? 1) > 0)
    .flatMap(layer => ['fill', 'line', 'circle'].map(type => `ops:${layer.id}:${type}`));
}
