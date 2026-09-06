// Diagnostic only: runs unmodified application functions on synthetic records.
// Exit 1 reports missing required behavior, not successful acceptance.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root=resolve(process.argv[2]||'.');
const expected={
 'components/mineralx/field-workflows.js':'e0cab1acbb3a9063439ba24007a9cb26f083369a',
 'components/mineralx/project-store.js':'e5e8df7f5d46fa76375b09f0501e1f549a0fecac',
 'components/mineralx/target-tasking.js':'e2331f6433edf9251583f3c37d2d472baa081d20',
};
for(const [path,sha] of Object.entries(expected)){
 const bytes=await readFile(resolve(root,path));
 assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),sha,`Source changed: ${path}. Re-review before interpreting these probes.`);
}
const fw=await import(pathToFileURL(resolve(root,'components/mineralx/field-workflows.js')));
const store=await import(pathToFileURL(resolve(root,'components/mineralx/project-store.js')));
const task=await import(pathToFileURL(resolve(root,'components/mineralx/target-tasking.js')));
const draft=id=>({id,lat:-20,lng:140,date:'2026-09-01',sampleType:'rock_chip'});
const one=()=>fw.collectSample(fw.createFieldProject('Synthetic reconciliation'),draft('S-001'));
const probes=[];
function record(id,expected,fn){try{const {actual,meetsRequirement}=fn();probes.push({id,expected,actual,status:meetsRequirement?'satisfied':'gap_reproduced'});}catch(error){probes.push({id,expected,status:'probe_error',error:error.message});}}
record('G01','Case-insensitive bag identity collisions are rejected',()=>{
 let rejected=false;try{fw.collectSample(one(),draft('s-001'));}catch{rejected=true;}
 return {actual:rejected?'rejected':'accepted S-001 and s-001 as separate bags',meetsRequirement:rejected};
});
record('G02','A blank control can be recorded without invented coordinates',()=>{
 try {const p=fw.collectSample(fw.createFieldProject('Controls'),{...draft('BLK-001'),lat:'',lng:'',qaqcType:'blank'});return {actual:p.samples[0],meetsRequirement:p.samples[0].lat==null&&p.samples[0].lng==null};}
 catch(e){return {actual:e.message,meetsRequirement:false};}
});
record('G03','Preparing a manifest does not assert that a shipment left site',()=>{
 const p=one(),d=fw.createDispatch(p,[p.samples[0].recordId],'Synthetic laboratory').dispatches[0];
 return {actual:{status:d.status,dispatchedAtPresent:!!d.dispatchedAt},meetsRequirement:d.status==='prepared'&&!d.dispatchedAt};
});
record('G04','Material unresolved receipt exceptions block assay release without a reasoned exception decision',()=>{
 let p=fw.collectSample(one(),draft('S-002'));p=fw.createDispatch(p,p.samples.map(s=>s.recordId),'Synthetic laboratory');
 p=fw.reconcileReceipt(p,p.dispatches[0].recordId,[p.samples[0].recordId],'Synthetic 1-of-2 receipt');
 const batch=fw.stageAssays(p,'sample_id,Au_gpt\nS-001,2','SYNTHETIC-CERT');p={...p,assayBatches:[batch]};
 let rejected=false,result;try{result=fw.releaseAssays(p,batch.recordId,'Synthetic reviewer');}catch{rejected=true;}
 return {actual:{custody:p.dispatches[0].status,releaseRejected:rejected,batchStatus:result?.assayBatches[0].status},meetsRequirement:rejected};
});
record('G05','Reimporting the same certificate and source is idempotent',()=>{
 let p=one();const csv='sample_id,Au_gpt\nS-001,2';
 for(let i=0;i<2;i++){const b=fw.stageAssays(p,csv,'SAME-SYNTHETIC-CERT');p=fw.releaseAssays({...p,assayBatches:[...p.assayBatches,b]},b.recordId,'Synthetic reviewer');}
 return {actual:{batches:p.assayBatches.length,historyEntries:p.samples[0].assayHistory.length},meetsRequirement:p.assayBatches.length===1&&p.samples[0].assayHistory.length===1};
});
record('G06','An unassigned historic QA/QC record cannot complete a target merely by proximity',()=>{
 const result=task.autoLinkSamples([{id:'T-001',lat:-20,lng:140,status:'planned',linkedSampleIds:[]}],[{id:'OLD-BLANK',lat:-20,lng:140,qaqcType:'blank',date:'2020-01-01'}])[0];
 return {actual:{status:result.status,linkedSampleIds:result.linkedSampleIds},meetsRequirement:result.status==='planned'&&!result.linkedSampleIds.length};
});
record('G07','A below-detection limit spanning the anomaly threshold is indeterminate, not background',()=>{
 const actual=store.gradeOf({assays:{},detectionLimits:{Au:5}},'Au');return {actual,meetsRequirement:actual!=='bg'};
});
console.log(JSON.stringify({baselineCommit:'5827a3f08fd4e227da4734f12c1663b8786140c5',observedAt:new Date().toISOString(),sourceBlobHashes:expected,scope:'Pure functions; synthetic records; no production/database/browser mutation',probes},null,2));
process.exitCode=probes.some(p=>p.status!=='satisfied')?1:0;
