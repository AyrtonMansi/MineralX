// Public reference data: Queensland GeoResGlobe open services.
// These are the same QLD Spatial WMS services the GeoResGlobe viewer
// sits on. Rendered client-side; a failing service shows an inline
// "unavailable" badge rather than failing silently.

const QLD_WMS = 'https://gisservices.information.qld.gov.au/arcgis/services';

export const BASEMAP_TILES = {
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  topo: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
};

export const PUBLIC_DATA_CATALOG = [
  {
    id: 'pub-geores',
    group: 'GeoResGlobe · QLD open data',
    layers: [
      {
        id: 'qld-geology-detailed',
        name: 'Surface geology (detailed)',
        url: `${QLD_WMS}/GeoscientificInformation/GeologyDetailed/MapServer/WMSServer`,
        wmsLayers: '0',
        attribution: 'Geological Survey of Queensland',
      },
      {
        id: 'qld-structural',
        name: 'Structural framework · faults',
        url: `${QLD_WMS}/GeoscientificInformation/GeologyDetailed/MapServer/WMSServer`,
        wmsLayers: '1',
        attribution: 'Geological Survey of Queensland',
      },
      {
        id: 'qld-mines-permits',
        name: 'Mining & exploration permits',
        url: `${QLD_WMS}/Economy/MinesPermitsCurrent/MapServer/WMSServer`,
        wmsLayers: '0',
        attribution: 'Qld Dept of Resources',
      },
      {
        id: 'qld-boreholes',
        name: 'Boreholes & drillholes (GSQ)',
        url: `${QLD_WMS}/GeoscientificInformation/Boreholes/MapServer/WMSServer`,
        wmsLayers: '0',
        attribution: 'Geological Survey of Queensland',
      },
    ],
  },
];
