import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {create, act} from 'react-test-renderer';
import useSpatialLayers from '../components/mineralx/useSpatialLayers.js';
import {buildLayerIndex} from '../components/mineralx/layer-registry.js';

function Harness(props) { useSpatialLayers(props); return null; }
test('spatial visibility, full point opacity and boundary order apply to renderer state', () => {
  const sources = new Map(), layers = new Map(), order = [], errors = [];
  const map = {
    addSource(id,source) { sources.set(id,{...source,setData(data){this.data=data;}}); },
    getSource(id) { return sources.get(id); }, removeSource(id) { sources.delete(id); },
    addLayer(layer) { layers.set(layer.id,layer); order.push(layer.id); },
    getLayer(id) { return layers.get(id); },
    removeLayer(id) { layers.delete(id); order.splice(order.indexOf(id),1); },
    moveLayer(id) { order.splice(order.indexOf(id),1); order.push(id); },
    setLayoutProperty(id,key,value) { const layer=layers.get(id);layer.layout={...layer.layout,[key]:value}; },
    setPaintProperty(id,key,value) { layers.get(id).paint[key]=value; },
    on(){}, off(){},
  };
  const data={type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[145,-21],[146,-21],[146,-20],[145,-21]]]}}]};
  const project={id:'p',name:'Project',color:'#123456',boundary:{name:'Tenement',data},spatialLayers:[{recordId:'r',name:'Reference',data}]};
  const props={mapInstance:{current:map},mgl:{current:{}},mapReady:true,mapEpoch:0,projects:[project],layerOn:{},layerOpacity:{'spatial:p:r':0},layerIndex:buildLayerIndex({projects:[project]}),onError:e=>{if(e)errors.push(e);}};
  let renderer;
  act(()=>{renderer=create(React.createElement(Harness,props));});
  assert.deepEqual(errors,[]);
  assert.equal(layers.get('mx-vector:spatial:p:r:point').paint['circle-opacity'],0);
  assert.equal(layers.get('mx-vector:spatial:p:r:point').paint['circle-stroke-opacity'],0,'A transparent layer must not leave opaque point outlines');
  assert.deepEqual(order.slice(-3),['mx-vector:bnd:p:fill','mx-vector:bnd:p:line','mx-vector:bnd:p:point'],'Tenement outline stays above imported polygons');
  act(()=>{renderer.update(React.createElement(Harness,{...props,layerOn:{'proj:p':false}}));});
  for(const layer of layers.values()) assert.equal(layer.layout.visibility,'none');
  act(()=>{renderer.unmount();});
});
