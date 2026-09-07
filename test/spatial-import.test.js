import test from 'node:test';
import assert from 'node:assert/strict';
import { boundaryData, commitSpatialImports, crc32, dataToKml, parseGeoJson, polygonData, readKmz, spatialBounds, spatialStats, validateGeometry } from '../components/mineralx/spatial-import.js';
import { createFieldProject, makeBackup, readBackup, upgradeStore } from '../components/mineralx/field-workflows.js';
import { buildLayerIndex, effectiveOn } from '../components/mineralx/layer-registry.js';
import { loadLayerUiState, saveLayerUiState } from '../components/mineralx/layer-ui-store.js';
import { polygon, KML, makeZip } from './fixtures/spatial-fixtures.js';
const fc = features => ({type:'FeatureCollection',features});
const layer = (sha='abc', data=fc([polygon])) => ({recordId:`layer-${sha}`,name:'Leases',data,stats:spatialStats(data),warnings:[],source:{sha256:sha,name:'leases.geojson',format:'geojson',base64:btoa(JSON.stringify(data))}});

test('all multipart polygons and holes survive spatial import and backup without affecting samples', async()=>{
 const before=createFieldProject('Project A'), source=layer();
 const project=commitSpatialImports(before,[{layer:source,role:'boundary'}]);
 assert.equal(project.boundary.data.features[0].geometry.coordinates.length,2);
 assert.equal(project.samples.length,0);assert.equal(before.boundary,null);
 const saved=await readBackup(await makeBackup({version:8,projects:[project],activeProjectId:project.id}));
 assert.deepEqual(saved.store.projects[0].boundary.data,project.boundary.data);
 assert.equal(saved.store.projects[0].spatialLayers[0].source.base64,source.source.base64);
});
test('a reference import cannot overwrite an existing boundary and duplicate sources are idempotent',()=>{
 let p=commitSpatialImports(createFieldProject('A'),[{layer:layer(),role:'boundary'}]);
 const old=p.boundary;p=commitSpatialImports(p,[{layer:layer('other'),role:'reference'}]);
 assert.deepEqual(p.boundary,old);assert.equal(p.spatialLayers.length,2);
 p=commitSpatialImports(p,[{layer:layer('other'),role:'reference'}]);assert.equal(p.spatialLayers.length,2);
});
test('boundary append and explicit replacement preserve prior boundary/source history',()=>{
 let p=commitSpatialImports(createFieldProject('A'),[{layer:layer(),role:'boundary'}]);
 p=commitSpatialImports(p,[{layer:layer('b'),role:'boundary'}]);assert.equal(p.boundary.data.features.length,2);
 const previous=p.boundary;
 p=commitSpatialImports(p,[{layer:layer('c'),role:'boundary',replace:true}]);assert.equal(p.boundary.data.features.length,1);
 assert.deepEqual(p.boundaryHistory.at(-1).data,previous.data);assert.equal(p.spatialLayers.length,3);
});
test('selected feature subsets and per-project IDs cannot leak other project geometry',()=>{
 const mixed=layer('mixed',fc([polygon,{type:'Feature',properties:{},geometry:{type:'Point',coordinates:[146,-22]}}]));
 const a=createFieldProject('A'),b=createFieldProject('B');
 const p=commitSpatialImports(a,[{layer:mixed,selectedIndexes:[1]}]);
 assert.equal(p.spatialLayers[0].data.features.length,1);assert.equal(p.spatialLayers[0].data.features[0].geometry.type,'Point');assert.equal(b.spatialLayers,undefined);
 const index=buildLayerIndex({projects:[p,b]});assert.ok(index.has(`spatial:${a.id}:layer-mixed`));assert.ok(!index.has(`spatial:${b.id}:layer-mixed`));
 assert.equal(effectiveOn({[`proj:${a.id}`]:false},index,`spatial:${a.id}:layer-mixed`),false);
});
test('boundary mode cannot turn point or line coordinates into a fake tenement',()=>{
 const data=fc([{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[[145,-21],[146,-22],[146,-21]]}}]);
 assert.throws(()=>commitSpatialImports(createFieldProject('A'),[{layer:layer('line',data),role:'boundary'}]),/requires polygons/);
});
test('partial render warnings require acknowledgement, and archived sources cannot silently duplicate',()=>{
 const source={...layer(),warnings:['A raster is not rendered']};
 assert.throws(()=>commitSpatialImports(createFieldProject('A'),[{layer:source}]),/acknowledge/);
 let p=commitSpatialImports(createFieldProject('A'),[{layer:source,acknowledged:true}]);
 p={...p,spatialLayers:p.spatialLayers.map(l=>({...l,archivedAt:'2026-09-07'}))};
 assert.throws(()=>commitSpatialImports(p,[{layer:source,acknowledged:true}]),/already archived/);
});
test('projected, nonfinite and malformed coordinates reject the whole feature rather than filtering vertices',()=>{
 for(const coordinates of [[500000,7500000],[181,0],[0,-91],[null,3],['145',-21],[NaN,0],[1,2,3,4]])assert.throws(()=>validateGeometry({type:'Point',coordinates}));
 assert.throws(()=>parseGeoJson({...fc([polygon]),crs:{type:'name',properties:{name:'EPSG:28355'}}}),/Projected/);
 assert.throws(()=>validateGeometry({type:'Polygon',coordinates:[[[0,0],[0,0],[0,0]]]}),/distinct/);
 assert.throws(()=>validateGeometry({type:'Point',coordinates:[145,-21]},{vertices:100000}),/Too many/);
});
test('multi-geometries retain independent shapes and the boundary selector keeps polygons only',()=>{
 const data=parseGeoJson(fc([{type:'Feature',properties:{name:'Mixed'},geometry:{type:'GeometryCollection',geometries:[polygon.geometry,{type:'MultiPoint',coordinates:[[145,-21],[146,-22]]},{type:'MultiLineString',coordinates:[[[145,-21],[146,-22]]]}]}}])).data;
 assert.deepEqual(spatialStats(data),{features:1,points:2,lines:1,polygons:1});assert.equal(polygonData(data).features.length,1);
 const kml=dataToKml('A & <B>',data);assert.match(kml,/<MultiGeometry>/);assert.match(kml,/<innerBoundaryIs>/);assert.match(kml,/A &amp; &lt;B&gt;/);
});
test('legacy boundaries remain intact and dateline bounds take the small arc',()=>{
 const data=boundaryData({name:'Legacy',coords:[[-21,145],[-21,146],[-22,146]]});assert.equal(data.features[0].geometry.coordinates[0].length,4);
 const b=spatialBounds(fc([{type:'Feature',properties:{},geometry:{type:'MultiPoint',coordinates:[[179,0],[-179,1]]}}]));assert.equal(b[1][0]-b[0][0],2);
});
for(const method of [0,8])test(`KMZ method ${method} preserves every embedded KML including nested folders`,async()=>{
 const result=await readKmz(makeZip({'doc.kml':KML,'geology/other.kml':KML,'icons/marker.png':'png'},{method}));
 assert.equal(result.documents.length,2);assert.equal(result.documents[1].text,KML);assert.equal(result.ignoredEntries,1);
});
test('KMZ checks signatures, path traversal, duplicate names, expanded-size limits and CRC',async()=>{
 for(const entries of [{'../doc.kml':KML},{'doc.kml':KML,'DOC.kml':KML},{'C:/doc.kml':KML}])await assert.rejects(()=>readKmz(makeZip(entries)),/Unsafe/);
 await assert.rejects(()=>readKmz(makeZip({'doc.kml':KML},{expandedOverride:100*1024*1024})),/safety limit/);
 await assert.rejects(()=>readKmz(makeZip({'doc.kml':KML},{expandedOverride:10})),/declared limit/);
 const data=makeZip({'doc.kml':KML},{method:0});data[50]^=1;await assert.rejects(()=>readKmz(data),/checksum/);
 await assert.rejects(()=>readKmz(new Uint8Array(40)),/Invalid/);
 assert.equal(crc32(Buffer.from('123456789')),0xcbf43926);
});
test('spatial schema upgrade is additive and idempotent',()=>{
 const p=commitSpatialImports(createFieldProject('A'),[{layer:layer()}]),data={version:8,projects:[p]};
 assert.deepEqual(upgradeStore(upgradeStore(data)),upgradeStore(data));
 assert.throws(()=>upgradeStore({version:8,projects:[{...p,spatialVersion:22}]}),/Unsupported spatial/);
});
test('layer preferences preserve stable IDs, basemap, opacity, and return an explicit quota failure',()=>{
 const storage=new Map();global.window={localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}};
 try{
  const state={layerOn:{'bnd:existing':false,'spatial:project:file':true},layerOpacity:{'spatial:project:file':.4},layerExpanded:{pub:true},basemap:'topo',activeElement:'Cu'};
  assert.equal(saveLayerUiState(state),true);assert.deepEqual(loadLayerUiState(),state);
  window.localStorage.setItem=()=>{throw new Error('QuotaExceeded');};assert.equal(saveLayerUiState(state),false);
 }finally{delete global.window;}
});
test('GeoJSON property objects remain raw data rather than executable label markup',()=>{
 const f={type:'Feature',properties:{name:{text:'A & B'},description:'<img onerror=alert(1)>'},geometry:{type:'Point',coordinates:[145,-21]}};
 const data=parseGeoJson(fc([f])).data;assert.deepEqual(data.features[0].properties,f.properties);
 const output=dataToKml('Metadata',data);assert.ok(!output.includes('<img'));assert.match(output,/&lt;img/);
});
