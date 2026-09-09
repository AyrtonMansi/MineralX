import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedLayerData,selectSharedMapRecord,interactiveSharedLayers,type SharedSpatialLayer} from '../../lib/ops/map-selection';
const id='10000000-0000-4000-8000-000000000009';
function field(kind='targets'):SharedSpatialLayer {
  return {id:kind,kind,data:{type:'FeatureCollection',features:[{type:'Feature',id,properties:{name:'Synthetic field record',recordId:id},geometry:{type:'Point',coordinates:[144,-20]}}]}};
}
const reference:SharedSpatialLayer={...field('spatialLayers'),id:'source-file-1'};
const boundary:SharedSpatialLayer={...field('boundary'),id:'boundary'};

test('map styling preserves a promoted canonical record identity for field selection',()=>{
  for(const kind of ['samples','collars','targets']) {
    const layer=field(kind),feature=sharedLayerData(layer,'#24553d').features[0];
    assert.equal(feature.id,id);
    assert.equal(feature.properties.recordId,id);
    assert.deepEqual(selectSharedMapRecord([layer],[{...feature,source:`ops:${kind}`}]),{kind,id});
  }
});
test('rendered point selection also accepts its promoted scalar property after tile conversion',()=>{
  assert.deepEqual(selectSharedMapRecord([field()],[{source:'ops:targets',properties:{recordId:id}}]),{kind:'targets',id});
});
test('a field record takes priority over overlapping reference and transparent boundary fills',()=>{
  assert.deepEqual(selectSharedMapRecord([field(),reference,boundary],[{source:'ops:boundary',id:'boundary'},{source:'ops:source-file-1',id},{source:'ops:targets',id}]),{kind:'targets',id});
});
test('imported IDs and forged attributes never turn a reference file into a physical sample',()=>{
  const feature=sharedLayerData(reference,'#24553d').features[0];
  assert.equal(feature.properties.recordId,undefined);
  assert.deepEqual(selectSharedMapRecord([reference],[{source:'ops:source-file-1',id,properties:{kind:'samples',recordId:id}}]),{kind:'spatialLayers',id:'source-file-1'});
});
test('unknown, stale, missing and wrong-source identities cannot open a field record',()=>{
  for(const hit of [{source:'ops:targets',id:'unrecognised'},{source:'ops:collars',id},{source:'ops:targets'},{source:'ops:targets',id:9},{source:'ops:boundary',id}]) {
    assert.equal(selectSharedMapRecord([field(),boundary],[hit]),null);
  }
});
test('hidden, fully transparent and boundary layers are not clickable',()=>{
  assert.deepEqual(interactiveSharedLayers([field(),reference,boundary],{targets:false},{'source-file-1':0}),[]);
  assert.deepEqual(interactiveSharedLayers([field(),boundary],{},{}),['ops:targets:fill','ops:targets:line','ops:targets:circle']);
});
