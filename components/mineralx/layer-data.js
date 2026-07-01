// Canonical layer tree structure and demo data for MineralX workspace.
// Each node: { id, type, name, color, count?, visible, expanded, children? }

export const LAYER_TYPES = {
  PROJECT: 'project',
  ROCK_CHIPS: 'rock_chips',
  DRILL_HOLES: 'drill_holes',
  BOUNDARY: 'boundary',
  BASEMAP: 'basemap',
  PUBLIC_GROUP: 'public_group',
  PUBLIC_LAYER: 'public_layer',
};

export const PUBLIC_DATA_CATALOG = [
  {
    id: 'pub-imagery',
    group: 'Imagery & Terrain',
    layers: [
      { id: 'esri-world-imagery', name: 'Esri World Imagery', type: 'wmts', url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/WMTS', attribution: 'Esri, Maxar, Earthstar Geographics' },
      { id: 'sentinel-2', name: 'Sentinel-2 (Cloud-free)', type: 'wms', url: 'https://services.sentinel-hub.com/ogc/wms/', attribution: 'Copernicus Sentinel-2, ESA' },
      { id: 'copernicus-dem', name: 'Copernicus DEM / Hillshade', type: 'wmts', url: 'https://tiles.maps.eox.at/wmts', attribution: 'Copernicus DEM, ESA' },
    ],
  },
  {
    id: 'pub-geoscience',
    group: 'Geoscience (GEORES)',
    layers: [
      { id: 'national-geology', name: 'National Geology', type: 'wms', url: 'https://services.ga.gov.au/gis/services/Surface_Geology/MapServer/WMSServer', attribution: 'Geoscience Australia' },
      { id: 'faults', name: 'Faults', type: 'wms', url: 'https://services.ga.gov.au/gis/services/Faults/MapServer/WMSServer', attribution: 'Geoscience Australia' },
      { id: 'gravity-magnetics', name: 'Gravity & Magnetics', type: 'wms', url: 'https://services.ga.gov.au/gis/services/Gravity_Anomaly/MapServer/WMSServer', attribution: 'Geoscience Australia' },
      { id: 'radiometrics', name: 'Radiometrics', type: 'wms', url: 'https://services.ga.gov.au/gis/services/Radiometrics/MapServer/WMSServer', attribution: 'Geoscience Australia' },
      { id: 'mineral-occurrences', name: 'Mineral Occurrences', type: 'wms', url: 'https://services.ga.gov.au/gis/services/MinOccur/MapServer/WMSServer', attribution: 'Geoscience Australia' },
      { id: 'gswa-geology', name: 'GSWA Geology', type: 'wms', url: 'https://geodownloads.dmp.wa.gov.au/datacentre/WMS', attribution: 'GSWA' },
    ],
  },
  {
    id: 'pub-cadastre',
    group: 'Cadastre & Admin',
    layers: [
      { id: 'tenement-boundaries', name: 'Tenement Boundaries', type: 'wms', url: 'https://geodownloads.dmp.wa.gov.au/datacentre/WMS', attribution: 'State Mining Registrar' },
      { id: 'native-title', name: 'Native Title', type: 'wms', url: 'https://spatial.nntt.gov.au/searchapp/wms', attribution: 'NNTT' },
      { id: 'land-access', name: 'Land Access / Pastoral', type: 'wms', url: 'https://services.slip.wa.gov.au/public/services/WMS', attribution: 'Landgate WA' },
    ],
  },
];

export function createDemoProject() {
  return {
    id: 'proj-1',
    type: LAYER_TYPES.PROJECT,
    name: 'Pilbara Au Prospect',
    color: '#E67E22',
    visible: true,
    expanded: true,
    children: [
      {
        id: 'rc-1',
        type: LAYER_TYPES.ROCK_CHIPS,
        name: 'Rock Chips',
        color: '#E74C3C',
        count: 47,
        visible: true,
        expanded: false,
        children: [],
      },
      {
        id: 'dh-1',
        type: LAYER_TYPES.DRILL_HOLES,
        name: 'Drill Holes',
        color: '#3498DB',
        count: 12,
        visible: true,
        expanded: false,
        children: [],
      },
      {
        id: 'bnd-1',
        type: LAYER_TYPES.BOUNDARY,
        name: 'Tenement E45/1234',
        color: '#2ECC71',
        visible: true,
        expanded: false,
        children: [],
      },
      {
        id: 'bm-1',
        type: LAYER_TYPES.BASEMAP,
        name: 'Basemap',
        color: '#95A5A6',
        visible: true,
        expanded: false,
        children: [],
      },
    ],
  };
}

export function createPublicDataTree() {
  return {
    id: 'public-data',
    type: LAYER_TYPES.PUBLIC_GROUP,
    name: 'Public Data',
    color: '#7F8C8D',
    visible: true,
    expanded: false,
    children: PUBLIC_DATA_CATALOG.flatMap((group) =>
      group.layers.map((layer) => ({
        id: layer.id,
        type: LAYER_TYPES.PUBLIC_LAYER,
        name: layer.name,
        color: '#95A5A6',
        visible: false,
        expanded: false,
        attribution: layer.attribution,
        wmsUrl: layer.url,
        wmsType: layer.type,
        children: [],
      }))
    ),
  };
}
