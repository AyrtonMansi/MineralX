import test from 'node:test';
import assert from 'node:assert/strict';
import * as field from '../components/mineralx/field-workflows.js';
import {gradeOf,parseSampleCsv,parseAssayCsv,parseAssayCell,assayDisplay} from '../components/mineralx/project-store.js';
import {autoLinkSamples} from '../components/mineralx/target-tasking.js';
const draft=id=>({id,lat:-21,lng:145,date:'2026-09-01',sampleType:'rock_chip'});
const one=()=>field.collectSample(field.createFieldProject('Independent test'),draft('A-1'));
const withBags=()=>field.collectSample(one(),draft('A-2'));
function shipment(){let p=withBags();p=field.createDispatch(p,p.samples.map(s=>s.recordId),'Laboratory');return field.shipDispatch?field.shipDispatch(p,p.dispatches[0].recordId,'Tracking reference','2026-09-02'):p;}
test('bag identity normalization rejects case and whitespace collisions at capture and field import',()=>{
 assert.throws(()=>field.collectSample(one(),draft(' a-1 ')),/already exists|duplicate/i);
 const parsed=parseSampleCsv('sample_id,lat,lng\na-1,-21,145',one().samples,'T-');assert.equal(parsed.samples.length,0);assert.match(parsed.error,/duplicate/i);
});
test('blank and certified reference controls never need fabricated coordinates',()=>{
 for(const qaqcType of ['blank','standard']){
 const p=field.collectSample(field.createFieldProject('Controls'),{...draft('QC-1'),lat:'',lng:'',qaqcType,referenceMaterial:'CRM-REF'});
 assert.equal(p.samples[0].lat,null);assert.equal(p.samples[0].lng,null);assert.equal(p.intervals.length,0);
 }
});
test('a manifest cannot claim a shipment has left site',()=>{const p=one();const n=field.createDispatch(p,[p.samples[0].recordId],'Lab');assert.equal(n.dispatches[0].status,'prepared');assert.equal(n.dispatches[0].dispatchedAt,undefined);assert.equal(n.samples[0].lifecycle,'collected');});
test('unresolved receipt exceptions block associated batch release without changing results',()=>{
 let p=shipment();p=field.reconcileReceipt(p,p.dispatches[0].recordId,[p.samples[0].recordId],'ONE-OF-TWO');const b=field.stageAssays(p,'sample_id,Au_gpt\nA-1,3','C');p={...p,assayBatches:[b]};
 assert.throws(()=>field.releaseAssays(p,b.recordId,'Geologist'),/receipt|custody|missing/i);assert.deepEqual(p.samples[0].assays,{});
});
test('identical certificate import is idempotent and preserves one analytical history entry',()=>{
 let p=one();for(let n=0;n<2;n++){const b=field.stageAssays(p,'sample_id,Au_gpt\nA-1,2','CERT');p=field.releaseAssays({...p,assayBatches:[...p.assayBatches,b]},b.recordId,'Geologist');}
 assert.equal(p.assayBatches.length,1);assert.equal(p.samples[0].assayHistory.length,1);
});
test('historic and control samples do not complete a target merely because they are nearby',()=>{
 const t={id:'T',recordId:'target-record',status:'planned',lat:-21,lng:145,linkedSampleIds:[]};
 for(const s of [{...draft('OLD'),date:'2020-01-01'}, {...draft('QC'),qaqcType:'blank'}])assert.deepEqual(autoLinkSamples([t],[s]),[t]);
});
test('qualified high detection limits are indeterminate; low detection limits are bounded background',()=>{
 assert.equal(gradeOf({detectionLimits:{Au:5}},'Au'),'indeterminate');assert.equal(gradeOf({detectionLimits:{Au:0.01}},'Au'),'bg');
 assert.notEqual(gradeOf({assays:{Au:Infinity}},'Au'),'high');
});
