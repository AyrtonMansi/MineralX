// Public reference data: Queensland GeoResGlobe open services.
// These are the same QLD Spatial WMS services the GeoResGlobe viewer
// sits on. Rendered client-side; a failing service shows an inline
// "unavailable" badge rather than failing silently.

const QLD_WMS = 'https://gisservices.information.qld.gov.au/arcgis/services';

export const BASEMAP_TILES = {
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  topo: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
};

// Themes mirror GeoResGlobe's own official map-product categories
// (Atlas, Gemfields, Geochemistry, Geology, Geophysics, Groundwater,
// Index maps, Industrial rock, Mine maps, Mineral occurrence,
// Miscellaneous, Permit, Resource maps) so a layer lives where a
// GeoResGlobe user already expects to find it. `themeOrder` controls
// the panel's top-to-bottom rendering order.
export const THEME_LABELS = {
  geology: 'Geology',
  geophysics: 'Geophysics',
  geochemistry: 'Geochemistry',
  groundwater: 'Groundwater',
  permits: 'Mine Maps & Permits',
  boreholes: 'Boreholes',
};
export const THEME_ORDER = ['geology', 'geophysics', 'geochemistry', 'groundwater', 'permits', 'boreholes'];

export const PUBLIC_DATA_CATALOG = [
  {
    id: 'pub-geores',
    group: 'GeoResGlobe',
    layers: [
      {
        id: 'qld-geology-detailed',
        name: 'Surface geology (detailed)',
        theme: 'geology',
        url: `${QLD_WMS}/GeoscientificInformation/GeologyDetailed/MapServer/WMSServer`,
        wmsLayers: '0',
        attribution: 'Geological Survey of Queensland',
      },
      {
        id: 'qld-structural',
        name: 'Structural framework · faults',
        theme: 'geology',
        url: `${QLD_WMS}/GeoscientificInformation/GeologyDetailed/MapServer/WMSServer`,
        wmsLayers: '1',
        attribution: 'Geological Survey of Queensland',
      },
      {
        id: 'qld-geophysics-mag',
        name: 'Regional magnetics',
        theme: 'geophysics',
        url: `${QLD_WMS}/GeoscientificInformation/Geophysics/MapServer/WMSServer`,
        wmsLayers: '0',
        attribution: 'Geological Survey of Queensland',
      },
      {
        id: 'qld-geophysics-radio',
        name: 'Regional radiometrics',
        theme: 'geophysics',
        url: `${QLD_WMS}/GeoscientificInformation/Geophysics/MapServer/WMSServer`,
        wmsLayers: '1',
        attribution: 'Geological Survey of Queensland',
      },
      {
        id: 'qld-geochem',
        name: 'Geochemistry survey results',
        theme: 'geochemistry',
        url: `${QLD_WMS}/GeoscientificInformation/Geochemistry/MapServer/WMSServer`,
        wmsLayers: '0',
        attribution: 'Geological Survey of Queensland',
      },
      {
        id: 'qld-groundwater',
        name: 'Groundwater bores',
        theme: 'groundwater',
        url: `${QLD_WMS}/Water/Groundwater/MapServer/WMSServer`,
        wmsLayers: '0',
        attribution: 'Qld Dept of Resources',
      },
      {
        id: 'qld-mines-permits',
        name: 'Mining & exploration permits',
        theme: 'permits',
        url: `${QLD_WMS}/Economy/MinesPermitsCurrent/MapServer/WMSServer`,
        wmsLayers: '0',
        attribution: 'Qld Dept of Resources',
      },
      {
        id: 'qld-boreholes',
        name: 'Boreholes & drillholes (GSQ)',
        theme: 'boreholes',
        url: `${QLD_WMS}/GeoscientificInformation/Boreholes/MapServer/WMSServer`,
        wmsLayers: '0',
        attribution: 'Geological Survey of Queensland',
      },
    ],
  },
];
