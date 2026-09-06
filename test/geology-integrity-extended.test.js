import test from 'node:test';
import assert from 'node:assert/strict';
import * as f from '../components/mineralx/field-workflows.js';
import * as integrity from '../components/mineralx/project-integrity.js';
import {parseSampleCsv,parseCollarCsv,parseIntervalCsv,samplesToCsv,intervalsToCsv,gradeOf,parseAssayCell} from '../components/mineralx/project-store.js';
import {samplePopupHtml,safePhotoUrl} from '../components/mineralx/map-render-helpers.js';
const draft=id=>({id,lat:-21,lng:145,date:'2026-09-01',sampleType:'rock_chip'});
const one=()=>f.collectSample(f.createFieldProject('Data integrity'),draft('BAG'));
function batch(p,csv='sample_id,Au_gpt\nBAG,3',revision='1'){const b=f.stageAssays(p,csv,'CERT',false,{laboratory:'LAB',revision});return {p:f.addAssayBatch(p,b),b};}
function twoSent(){let p=f.collectSample(one(),draft('BAG2'));p=f.createDispatch(p,p.samples.map(s=>s.recordId),'Lab');return f.shipDispatch(p,p.dispatches[0].recordId,'TRACK-1','2026-09-02');}
function hole(){const p=f.createFieldProject('Drilling');p.collars=[{recordId:crypto.randomUUID(),id:'H-1',lat:-21,lng:145,depth:12,actualDepth:4,plannedDepth:100,azimuth:0,dip:-60}];return p;}
test('invalid collection dates and partial numeric strings cannot become field evidence',()=>{
 for(const date of ['2026-02-31','n/a'])assert.throws(()=>f.collectSample(f.createFieldProject('X'),{...draft('X'),date}),/date/i);
 for(const lat of ['21junk','',NaN,Infinity])assert.throws(()=>f.collectSample(f.createFieldProject('X'),{...draft('X'),lat}),/finite|coordinates/i);
});
test('CRM requires reference material identity, duplicates require a primary source',()=>{
 assert.throws(()=>f.collectSample(f.createFieldProject('X'),{...draft('CRM'),qaqcType:'standard',lat:'',lng:''}),/reference/i);
 let p=f.collectSample(one(),{...draft('BLK'),qaqcType:'blank'});
 assert.throws(()=>f.collectSample(p,{...draft('DUP'),qaqcType:'duplicate',duplicateRecordId:p.samples[1].recordId}),/original|primary/i);
});
test('control CSV roundtrip preserves null geometry and remains unreviewed after result import',()=>{
 const p=f.collectSample(one(),{...draft('BLK'),qaqcType:'blank',lat:'',lng:''});p.samples[1].assays={Au:0.01};
 const csv=samplesToCsv(p.samples),parsed=parseSampleCsv(csv,[],'T-');assert.equal(parsed.error,null);assert.equal(parsed.samples[1].lat,null);assert.equal(parsed.samples[1].lng,null);assert.equal(gradeOf(parsed.samples[1],'Au'),'control');
});
test('unknown assay unit and duplicate analyte columns cannot silently become quantities',()=>{
 assert.throws(()=>parseSampleCsv('sample_id,lat,lng,Au_kg\nB,-21,145,2',[],'B'),/unit/i);
 assert.throws(()=>parseSampleCsv('sample_id,lat,lng,Au_gpt,Au_ppm\nB,-21,145,2,3',[],'B'),/Multiple columns/i);
 const {b}=batch(one(),'sample_id,Au_ppm,Au_gpt\nBAG,2,3');assert.ok(b.issues.some(i=>i.includes('Multiple')));
});
test('qualified lower and upper bounds survive CSV without becoming exact values',()=>{
 const p=one();p.samples[0]={...p.samples[0],detectionLimits:{Au:.5},lowerLimits:{Cu:10},assayQualifiers:{Au:'≤',Cu:'>'}};
 const parsed=parseSampleCsv(samplesToCsv(p.samples),[],'S').samples[0];assert.deepEqual(parsed.detectionLimits,{Au:.5});assert.deepEqual(parsed.lowerLimits,{Cu:10});assert.deepEqual(parsed.assayQualifiers,{Au:'≤',Cu:'>'});
 assert.equal(gradeOf({...parsed,assayReviewStatus:'released'},'Au'),'indeterminate');
 for(const value of ['<-5','≥-1','>Infinity'])assert.deepEqual(parseAssayCell(value),{value:null,detectionLimit:null});
});
test('a duplicate receipt is idempotent and cumulative receipts retain missing-bag evidence',()=>{
 let p=twoSent(),id=p.dispatches[0].recordId;p=f.reconcileReceipt(p,id,[p.samples[0].recordId],'R1');assert.equal(p.dispatches[0].status,'receipt-exception');
 assert.equal(f.reconcileReceipt(p,id,[p.samples[0].recordId],'R1'),p);
 p=f.reconcileReceipt(p,id,[p.samples[1].recordId],'R2');assert.equal(p.dispatches[0].status,'received');assert.equal(p.dispatches[0].receiptEvents.length,2);
});
test('damaged/extra-bag exceptions survive receipt and need a named reasoned decision',()=>{
 let p=twoSent(),id=p.dispatches[0].recordId;p=f.reconcileReceipt(p,id,p.samples.map(s=>s.recordId),'R1',[{reason:'Extra labelled bag found'}]);
 let {p:staged,b}=batch(p);assert.throws(()=>f.releaseAssays(staged,b.recordId,'G'),/receipt|custody/i);
 const event=p.dispatches[0].receiptEvents[0];assert.throws(()=>f.resolveReceiptException(p,id,event.recordId,'','Found owner'),/reviewer/i);
 p=f.resolveReceiptException(staged,id,event.recordId,'G','The extra bag was returned to its verified sender');p=f.releaseAssays(p,b.recordId,'G');assert.equal(p.assayBatches[0].status,'released');assert.equal(p.dispatches[0].receiptEvents[0].exceptions.length,1);
});
test('a named exception decision never invents receipt of an absent bag',()=>{
 let p=twoSent(),id=p.dispatches[0].recordId;p=f.reconcileReceipt(p,id,[p.samples[0].recordId],'R1',[{reason:'Damaged packaging'}]);p=f.resolveReceiptException(p,id,p.dispatches[0].receiptEvents[0].recordId,'G','Packaging inspected; contents intact');assert.equal(p.dispatches[0].status,'receipt-exception');assert.equal(p.dispatches[0].receivedRecordIds.length,1);
});
test('review of controls requires a reason; held batches cannot be selected as approved',()=>{
 let p=f.collectSample(one(),{...draft('BLK'),qaqcType:'blank'});let staged=batch(p,'sample_id,Au_gpt\nBLK,.01');assert.throws(()=>f.releaseAssays(staged.p,staged.b.recordId,'G'),/QA\/QC/i);
 p=f.holdAssays(staged.p,staged.b.recordId,'G','Control check failed');assert.equal(p.assayBatches[0].status,'held');assert.throws(()=>f.releaseAssays(p,staged.b.recordId,'G'),/awaiting/i);assert.deepEqual(p.samples[1].assays,{});
});
test('corrected certificates require a new revision and preserve previous selected results',()=>{
 let {p,b}=batch(one());p=f.releaseAssays(p,b.recordId,'G');assert.throws(()=>f.stageAssays(p,'sample_id,Au_gpt\nBAG,4','CERT',false,{laboratory:'LAB',revision:'1'}),/revision/i);
 ({p,b}=batch(p,'sample_id,Au_gpt\nBAG,4','2'));p=f.releaseAssays(p,b.recordId,'G');assert.equal(p.samples[0].assayHistory.length,2);assert.equal(p.samples[0].assayHistory[1].previous.assays.Au,3);assert.equal(p.samples[0].assays.Au,4);assert.equal(p.assayBatches[0].rawCsv,'sample_id,Au_gpt\nBAG,3');
});
test('archival retains custody, physical IDs, source files and analytical history',()=>{
 let {p,b}=batch(one());p=f.releaseAssays(p,b.recordId,'G');const snapshot=structuredClone(p);p=integrity.archiveRecord(p,'samples','bag','Incorrect field attribution');assert.equal(p.samples.length,1);assert.equal(p.samples[0].recordId,snapshot.samples[0].recordId);assert.deepEqual(p.samples[0].assayHistory,snapshot.samples[0].assayHistory);assert.equal(p.assayBatches[0].rawCsv,snapshot.assayBatches[0].rawCsv);assert.equal(gradeOf(p.samples[0],'Au'),'archived');assert.equal(snapshot.samples[0].archivedAt,undefined);
});
test('metadata correction cannot change identity or approve/overwrite analytical values',()=>{
 const p=one();p.samples[0].assays={Au:3};const next=integrity.correctSample(p,'BAG',{id:'OTHER',assays:{Au:99},assayReviewStatus:'released',notes:'Corrected lithology'});assert.equal(next.samples[0].id,'BAG');assert.equal(next.samples[0].assays.Au,3);assert.equal(next.samples[0].assayReviewStatus,'pending');assert.equal(next.samples[0].fieldHistory.length,1);
});
test('physical drill imports retain bag identity and reject depths beyond actual not planned depth',()=>{
 const p=hole();const rows=parseIntervalCsv('hole_id,sample_id,from,to,Au_gpt,sample_type\nh-1,D1,0,1,2,diamond_core').intervals;const next=integrity.importPhysicalIntervals(p,rows);assert.equal(next.samples[0].id,'D1');assert.equal(next.samples[0].sampleType,'diamond_core');assert.equal(next.intervals[0].sampleRecordId,next.samples[0].recordId);assert.equal(gradeOf(next.samples[0],'Au'),'unreviewed');
 assert.throws(()=>integrity.importPhysicalIntervals(p,[{...rows[0],to:5}]),/actual/i);assert.throws(()=>integrity.importPhysicalIntervals(next,rows),/already exists/i);assert.throws(()=>integrity.importPhysicalIntervals(p,[{...rows[0],sampleId:''}]),/bag|sample_id/i);
});
test('a planned collar depth cannot become recorded drilling in CSV import',()=>{
 const p=parseCollarCsv('hole_id,lat,lng,planned_depth\nH,-21,145,100',[],'H').collars[0];assert.equal(p.depth,null);assert.equal(p.actualDepth,null);assert.equal(p.plannedDepth,100);
});
test('drill duplicates preserve lineage and do not block adjacent primary coverage',()=>{
 let p=hole();const d={...draft('D1'),sampleType:'rc',collarRecordId:p.collars[0].recordId,from:0,to:1};p=f.collectSample(p,d);p=f.collectSample(p,{...d,id:'DUP',qaqcType:'duplicate',duplicateRecordId:p.samples[0].recordId});p=f.collectSample(p,{...d,id:'D2',from:1,to:2});assert.equal(p.samples[1].duplicateOf,'D1');assert.equal(p.intervals.length,3);assert.equal(p.intervals.filter(i=>i.qaqcType==='none').reduce((a,i)=>a+i.to-i.from,0),2);
});
test('explicit field evidence links only a primary collected sample in the same project',()=>{
 const p=one();p.targets=[{id:'T1',recordId:'target-1',status:'planned',linkedSampleIds:[]}];const n=integrity.linkFieldSample(p,p.samples[0].recordId,'target-1');assert.equal(n.targets[0].status,'sampled');assert.equal(integrity.linkFieldSample(n,n.samples[0].recordId,'target-1'),n);assert.throws(()=>integrity.linkFieldSample(p,p.samples[0].recordId,'other'),/project/i);
});
test('all valid casing variants resolve to one physical sample when matching results',()=>{
 const p=one();for(const id of ['BAG','bag',' BAG ']){const b=f.stageAssays(p,`sample_id,Au_gpt\n${id},2`,'C');assert.deepEqual(b.issues,[]);assert.equal(b.results[0].sampleRecordId,p.samples[0].recordId);}
});
test('legacy imported measurements are retained but never upgraded into approved map results',()=>{
 const p=one();p.samples[0]={...p.samples[0],assayReviewStatus:undefined,assays:{Au:7}};const store=f.upgradeStore({version:8,projects:[p]});assert.equal(store.projects[0].samples[0].assays.Au,7);assert.equal(gradeOf(store.projects[0].samples[0],'Au'),'unreviewed');
});
test('malicious photo URLs and imported strings cannot escape popup attributes',()=>{
 for(const url of ['javascript:alert(1)','data:image/svg+xml,<svg onload=alert(1)>','https://example.com/" onerror="alert(1)']){
 const safe=safePhotoUrl(url);if(url.startsWith('https:'))assert.equal(safe,true);else assert.equal(safe,false);
 }
 const html=samplePopupHtml({...draft('<script>bad</script>'),date:'<img src=x onerror=alert(1)>',photo:'javascript:alert(1)',assays:{}},'Au');assert.ok(!html.includes('<script>'));assert.ok(!html.includes('src="javascript:'));assert.ok(html.includes('&lt;'));
});
