import {assertCollar,assertInterval,assertUniqueIds,newRecordId} from './field-workflows.js';
import {idKey,isControl,appendAudit,validDate} from './record-rules.js';
import {validateCoordinates} from './project-store.js';
export function importPhysicalIntervals(project,rows) {
  const samples=[...project.samples],intervals=[...(project.intervals||[])];
  for(const row of rows){
    const collar=project.collars.find(c=>idKey(c.id)===idKey(row.holeId)&&!c.archivedAt);
    if(!collar)throw new Error(`Hole ${row.holeId} is not active in this project.`);
    if(!idKey(row.sampleId))throw new Error('A drill sample import needs sample_id / bag_id. No bag identity will be invented from depths.');
    const found=samples.find(s=>idKey(s.id)===idKey(row.sampleId));
    if(found)throw new Error(`Sample ID ${row.sampleId} already exists. Import new laboratory results through Review, not as another physical sample.`);
    const actual=collar.actualDepth??collar.depth;
    if(!Number.isFinite(actual)||row.to>actual)throw new Error('An imported interval extends past recorded actual drilled depth.');
    assertInterval(row.from,row.to,intervals.filter(i=>!i.archivedAt&&!isControl(i)),collar.id);
    assertUniqueIds(samples,[{id:row.sampleId}]);
    const recordId=newRecordId();
    const sample={...row,recordId,id:row.sampleId,lat:collar.lat,lng:collar.lng,collarRecordId:collar.recordId,holeId:collar.id,date:row.sourceRow?.date||'',sampleType:row.sampleType||'other',qaqcType:row.qaqcType||'none',coordSource:'collar_reference',lifecycle:'imported',assayReviewStatus:'unreviewed',importedAt:new Date().toISOString()};
    samples.push(sample);intervals.push({...row,recordId:row.recordId||newRecordId(),sampleRecordId:recordId,collarRecordId:collar.recordId,holeId:collar.id,assayReviewStatus:'unreviewed'});
  }
  return {...project,samples,intervals,audit:appendAudit(project,'import-drill-samples',project.id,`${rows.length} physical interval records imported; assays require review`)};
}
export function importDownhole(project,kind,rows) {
  if(!['geology','surveys'].includes(kind))throw new Error('Unsupported downhole record type.');
  const records=[...(project[kind]||[])];
  for(const row of rows){
    const collar=project.collars.find(c=>idKey(c.id)===idKey(row.holeId)&&!c.archivedAt);
    if(!collar)throw new Error(`Hole ${row.holeId} is not active in this project.`);
    const actual=collar.actualDepth??collar.depth;
    if(!Number.isFinite(actual))throw new Error('Record actual drilled depth before adding downhole records.');
    if(kind==='geology'){assertInterval(row.from,row.to,records.filter(r=>!r.archivedAt),collar.id);if(row.to>actual)throw new Error('Geological log extends past recorded depth.');}
    else if(![row.depth,row.azimuth,row.dip].every(Number.isFinite)||row.depth<0||row.depth>actual||row.azimuth<0||row.azimuth>=360||Math.abs(row.dip)>90||records.some(r=>idKey(r.holeId)===idKey(collar.id)&&r.depth===row.depth))throw new Error('Invalid or duplicate downhole survey.');
    records.push({...row,recordId:row.recordId||newRecordId(),holeId:collar.id,collarRecordId:collar.recordId});
  }
  return {...project,[kind]:records,audit:appendAudit(project,`import-${kind}`,project.id,`${rows.length} downhole records imported`)};
}
export function archiveRecord(project,kind,id,reason) {
  if(!['samples','collars'].includes(kind))throw new Error('Unsupported archive record.');
  if(!String(reason||'').trim())throw new Error('An archive reason is required.');
  const record=project[kind].find(r=>idKey(r.id)===idKey(id));
  if(!record)throw new Error('Record not found in this project.');
  if(record.archivedAt)return project;
  const at=new Date().toISOString();
  return {...project,[kind]:project[kind].map(r=>r===record?{...r,archivedAt:at,archiveReason:reason.trim()}:r),audit:appendAudit(project,`archive-${kind}`,record.recordId,reason.trim())};
}
export function correctSample(project,id,patch) {
  const allowed=['lith','notes','lat','lng','date','coordSource','collector','coordinateAccuracyM'];
  const original=project.samples.find(s=>idKey(s.id)===idKey(id));if(!original)throw new Error('Sample not found.');
  const clean=Object.fromEntries(Object.entries(patch).filter(([key])=>allowed.includes(key)));
  const next={...original,...clean};
  if(!isControl(next)&&!validateCoordinates(next.lat,next.lng))throw new Error('Sample coordinates must be finite and in range.');
  if(next.date&&!validDate(next.date))throw new Error('Invalid collection date.');
  if(original.holeId&&(next.lat!==original.lat||next.lng!==original.lng))throw new Error('Drill samples use the collar reference. Correct the collar, not an individual interval position.');
  next.fieldHistory=[...(original.fieldHistory||[]),{at:new Date().toISOString(),previous:Object.fromEntries(allowed.map(k=>[k,original[k]??null])),changes:clean}];
  return {...project,samples:project.samples.map(s=>s===original?next:s),audit:appendAudit(project,'correct-sample',original.recordId,'Field metadata correction')};
}
export function correctCollar(project,id,patch) {
  const c=project.collars.find(c=>idKey(c.id)===idKey(id));if(!c)throw new Error('Hole not found.');
  const allowed=['lat','lng','depth','actualDepth','plannedDepth','azimuth','dip','notes'];
  const next={...c,...Object.fromEntries(Object.entries(patch).filter(([k])=>allowed.includes(k)))};assertCollar(next);
  const actual=next.actualDepth??next.depth;
  if([...project.intervals,...project.geology,...project.surveys].some(r=>idKey(r.holeId)===idKey(c.id)&&(r.to??r.depth)>actual))throw new Error('Recorded depth cannot be reduced below existing downhole records.');
  return {...project,collars:project.collars.map(r=>r===c?{...next,fieldHistory:[...(c.fieldHistory||[]),{at:new Date().toISOString(),previous:c}]}:r),samples:project.samples.map(s=>s.collarRecordId===c.recordId?{...s,lat:next.lat,lng:next.lng}:s),audit:appendAudit(project,'correct-collar',c.recordId,'Collar metadata correction')};
}
export function linkFieldSample(project,sampleRecordId,targetRecordId) {
  const sample=project.samples.find(s=>s.recordId===sampleRecordId);
  const target=project.targets.find(t=>t.recordId===targetRecordId||t.id===targetRecordId);
  if(!sample||!target||isControl(sample)||sample.archivedAt||sample.lifecycle==='imported'||!sample.recordedAt&&!sample.collectedAt)throw new Error('Choose a collected primary sample and a target in this project. Historic imports and controls cannot complete targets.');
  if(target.linkedSampleIds?.includes(sample.id))return project;
  return {...project,targets:project.targets.map(t=>t===target?{...t,linkedSampleIds:[...(t.linkedSampleIds||[]),sample.id],status:['proposed','planned','visited'].includes(t.status)?'sampled':t.status}:t),audit:appendAudit(project,'link-field-evidence',target.recordId||target.id,`Explicitly linked physical sample ${sample.id}`)};
}
