// Shared with app/api/mineral-occurrences/route.js and
// app/api/historic-mines/route.js — lives outside app/api because
// Next.js's route-export type checker rejects any export from a
// route.js that isn't one of its recognized fields (GET, POST, runtime,
// etc.), so CANDIDATES can't be exported from the route file itself.
// scripts/verify-endpoints.mjs imports these same arrays, so there is
// exactly one source of truth for what's actually deployed.

export const MINERAL_OCCURRENCE_CANDIDATES = [
  {
    // QLD GeoResGlobe — Geological Survey of Queensland "Mines and
    // Mineral Occurrences" layer. Naming mirrors the sibling services
    // already wired up in components/mineralx/layer-data.js
    // (GeologyDetailed, Boreholes). Layer index 0 is a guess — run
    // `npm run verify:endpoints` from an environment with real internet
    // access to check it (this project's dev sandbox blocks
    // *.qld.gov.au, so it was never hit live during development).
    source: 'qld-geores',
    url: (bbox) =>
      `https://gisservices.information.qld.gov.au/arcgis/rest/services/GeoscientificInformation/MinesAndMineralOccurrences/MapServer/0/query` +
      `?f=geojson&outFields=*&returnGeometry=true&geometryType=esriGeometryEnvelope&inSR=4326&outSR=4326&spatialRel=esriSpatialRelIntersects` +
      `&geometry=${encodeURIComponent(bbox)}`,
  },
  {
    // Geoscience Australia national mineral occurrences dataset —
    // broader coverage fallback if the QLD-specific service above
    // doesn't resolve or isn't the right path/layer.
    source: 'ga-national',
    url: (bbox) =>
      `https://services.ga.gov.au/gis/rest/services/Minerals/MapServer/0/query` +
      `?f=geojson&outFields=*&returnGeometry=true&geometryType=esriGeometryEnvelope&inSR=4326&outSR=4326&spatialRel=esriSpatialRelIntersects` +
      `&geometry=${encodeURIComponent(bbox)}`,
  },
];

export const HISTORIC_MINE_CANDIDATES = [
  {
    // QLD GeoResGlobe — abandoned mines / historic workings layer.
    // Naming mirrors the sibling services in layer-data.js and the
    // mineral-occurrences candidates above. Layer index 0 is a guess —
    // see the note on MINERAL_OCCURRENCE_CANDIDATES above.
    source: 'qld-geores',
    url: (bbox) =>
      `https://gisservices.information.qld.gov.au/arcgis/rest/services/GeoscientificInformation/AbandonedMines/MapServer/0/query` +
      `?f=geojson&outFields=*&returnGeometry=true&geometryType=esriGeometryEnvelope&inSR=4326&outSR=4326&spatialRel=esriSpatialRelIntersects` +
      `&geometry=${encodeURIComponent(bbox)}`,
  },
  {
    // Geoscience Australia national historic mines dataset — broader
    // coverage fallback if the QLD-specific service above doesn't
    // resolve or isn't the right path/layer.
    source: 'ga-national',
    url: (bbox) =>
      `https://services.ga.gov.au/gis/rest/services/HistoricMines/MapServer/0/query` +
      `?f=geojson&outFields=*&returnGeometry=true&geometryType=esriGeometryEnvelope&inSR=4326&outSR=4326&spatialRel=esriSpatialRelIntersects` +
      `&geometry=${encodeURIComponent(bbox)}`,
  },
];
