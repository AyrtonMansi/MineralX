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

// ── Demo field data ─────────────────────────────────────────────
// Samples: au in g/t; au === null means awaiting assay.
export const DEMO_SAMPLES = [
  { id: 'TN-RC-0428', lat: -20.5501, lng: 129.7455, au: 4.2, lith: 'Quartz vein float', notes: 'Coarse visible sulphides' },
  { id: 'TN-RC-0431', lat: -20.5555, lng: 129.7431, au: 1.1, lith: 'Sheared BIF', notes: '' },
  { id: 'TN-RC-0433', lat: -20.5522, lng: 129.7521, au: 0.2, lith: 'Silicified siltstone', notes: 'Background' },
  { id: 'TN-RC-0440', lat: -20.5468, lng: 129.7402, au: 3.6, lith: 'Quartz reef', notes: 'Sampled at reef contact' },
  { id: 'TN-RC-0442', lat: -20.5588, lng: 129.7498, au: 0.8, lith: 'Ferruginous quartz', notes: '' },
  { id: 'TN-RC-0447', lat: -20.5539, lng: 129.7385, au: null, lith: 'Quartz-sericite schist', notes: 'Dispatched to ALS 14 Jun' },
];

export const DEMO_COLLARS = [
  { id: 'TNDD-001', lat: -20.5489, lng: 129.7440 },
  { id: 'TNDD-002', lat: -20.5531, lng: 129.7472 },
  { id: 'TNDD-003', lat: -20.5567, lng: 129.7458 },
];

export const DEMO_BOUNDARY = [
  [-20.5430, 129.7368], [-20.5432, 129.7566], [-20.5612, 129.7560], [-20.5606, 129.7372],
];

// Grade classification: single source of truth for legend, markers, stats.
export function gradeOf(au) {
  if (au == null || Number.isNaN(au)) return 'pending';
  if (au >= 3.0) return 'high';
  if (au >= 0.5) return 'anom';
  return 'bg';
}

export const GRADE_COLORS = { high: '#C15F3C', anom: '#B08A3E', bg: '#A39C8C', pending: '#F3F1E9' };

export function createDemoProject() {
  return {
    id: 'proj-1',
    type: LAYER_TYPES.PROJECT,
    name: 'Tanami North Prospect',
    color: '#E67E22',
    visible: true,
    expanded: true,
    children: [
      {
        id: 'rc-1',
        type: LAYER_TYPES.ROCK_CHIPS,
        name: 'Rock Chips',
        color: '#E74C3C',
        visible: true,
        expanded: false,
        children: [],
      },
      {
        id: 'dh-1',
        type: LAYER_TYPES.DRILL_HOLES,
        name: 'Drill Holes',
        color: '#3498DB',
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
