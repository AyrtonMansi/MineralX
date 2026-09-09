// The existing field/lab invariants are reused on the trusted server and for offline
// capture previews. Only explicit commands reach the scoped SQL change-set boundary.
import * as field from '../../components/mineralx/field-workflows.js';
import * as integrity from '../../components/mineralx/project-integrity.js';
import { parseGeoJson, spatialStats, commitSpatialImports, boundaryData } from '../../components/mineralx/spatial-import.js';
import { validateCoordinates, parseSampleCsv, parseCollarCsv, parseIntervalCsv, parseSurveyCsv, parseGeologyCsv } from '../../components/mineralx/project-store.js';

export const GEO_KINDS = ['programs','collars','samples','intervals','surveys','geology','targets','dispatches','assayBatches','spatialLayers','observations','files'];
export const GEO_ACTIONS = Object.freeze({
 'geo.sample.capture':'geo.capture','geo.sample.correct':'geo.capture','geo.sample.archive':'geo.capture',
 'geo.collar.save':'geo.capture','geo.log.import':'geo.capture','geo.program.create':'geo.capture',
 'geo.dispatch.prepare':'geo.capture','geo.dispatch.ship':'geo.capture','geo.dispatch.receive':'geo.capture','geo.dispatch.exception':'lab.review',
 'geo.assay.stage':'geo.capture','geo.assay.release':'lab.review','geo.assay.hold':'lab.review',
 'geo.layer.import':'geo.publish','geo.layer.archive':'geo.publish','geo.layer.restore':'geo.publish',
 'geo.target.link':'geo.capture','geo.target.create':'geo.capture','geo.project.update':'geo.publish','geo.migrate':'geo.publish',
});
export const OFFLINE_GEO_ACTIONS = new Set(['geo.sample.capture','geo.sample.correct','geo.collar.save','geo.program.create','geo.target.create']);
const clone = v => JSON.parse(JSON.stringify(v));
const fail = message => {throw new Error(message);};
const uuidPattern = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
export async function stableId(seed) {
 const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(seed))).slice(0,16);
 bytes[6]=(bytes[6]&15)|128; bytes[8]=(bytes[8]&63)|128;
 const h=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
export function newSharedProject(scope) { const p=field.createFieldProject(scope.name);return {...p,id:scope.id,name:scope.name,sharedScopeId:scope.id}; }
export function projectMetadata(project) {return Object.fromEntries(Object.entries(project).filter(([key])=>!GEO_KINDS.includes(key)&&key!=='audit'));}
export function versionAt(versions,kind,id){return versions[`${kind}:${id}`]||0;}
function remapValues(value,map){if(typeof value==='string')return map.get(value)||value;if(Array.isArray(value))return value.map(v=>remapValues(v,map));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,remapValues(v,map)]));return value;}
export async function normaliseNewIds(previous,next,command) {
 const oldIds=new Set(GEO_KINDS.flatMap(k=>(previous[k]||[]).map(r=>r.recordId))),map=new Map();let primary=false;
 const primaryKind=command.action.includes('.sample.')?'samples':command.action.includes('.collar.')?'collars':command.action.includes('.program.')?'programs':command.action.includes('.target.create')?'targets':command.action.includes('.dispatch.prepare')?'dispatches':command.action.includes('.assay.stage')?'assayBatches':command.action.includes('.layer.import')?'spatialLayers':null;
 for(const kind of GEO_KINDS){let n=0;for(const row of next[kind]||[])if(!oldIds.has(row.recordId)){
  const id=!primary&&kind===primaryKind?(primary=true,command.id):await stableId(`${command.requestId}/${kind}/${n++}`);map.set(row.recordId,id);
 }}
 return remapValues(next,map);
}
export function changeSet(previous,next,versions) {
 const changes=[];
 for(const kind of GEO_KINDS){const old=new Map((previous[kind]||[]).map(r=>[r.recordId,r])),current=new Set();
  for(const row of next[kind]||[]){if(!uuidPattern.test(row.recordId)||current.has(row.recordId))fail('Missing or duplicate record identity');current.add(row.recordId);if(JSON.stringify(row)!==JSON.stringify(old.get(row.recordId)))changes.push({kind,id:row.recordId,expectedVersion:versionAt(versions,kind,row.recordId),data:row});}
  for(const id of old.keys())if(!current.has(id))fail('Shared records must be archived, not deleted.');
 }
 return changes;
}
export function validateSharedProject(project) {
 for(const kind of GEO_KINDS){if(!Array.isArray(project[kind]||[]))fail(`Invalid ${kind}`);if((project[kind]||[]).length>10000)fail(`Split ${kind} into a bounded migration batch.`);}
 field.assertUniqueIds([],project.samples);field.assertUniqueIds([],project.collars,'Hole');
 for(const c of project.collars)field.assertCollar(c);
 const samples=new Map(project.samples.map(s=>[s.recordId,s])),holes=new Map(project.collars.map(c=>[c.recordId,c]));
 for(const s of project.samples){
  if(!['blank','standard'].includes(s.qaqcType)&&!validateCoordinates(s.lat,s.lng))fail(`Sample ${s.id} needs confirmed coordinates before cloud publication.`);
  if(s.qaqcType==='standard'&&!s.referenceMaterial?.trim())fail(`Standard ${s.id} needs its reference material.`);
  if(s.collarRecordId){const c=holes.get(s.collarRecordId);if(!c||!(s.from>=0&&s.to>s.from&&s.to<=(c.actualDepth??c.depth)))fail(`Sample ${s.id} has an invalid physical drill interval.`);}
  if(['duplicate','triplicate'].includes(s.qaqcType)&&!samples.has(s.duplicateRecordId))fail(`Duplicate ${s.id} needs its original physical sample.`);
 }
 for(const i of project.intervals){const c=holes.get(i.collarRecordId),s=samples.get(i.sampleRecordId);if(!c||!s||i.from!==s.from||i.to!==s.to||s.collarRecordId!==c.recordId)fail('Drill interval identity does not match the physical sample.');}
 for(const d of project.dispatches||[])if(!Array.isArray(d.sampleRecordIds)||d.sampleRecordIds.some(id=>!samples.has(id)))fail('Dispatch contains a sample outside this project.');
 for(const l of project.spatialLayers||[])parseGeoJson(l.data);
 if(project.boundary)parseGeoJson(boundaryData(project.boundary));
 return project;
}

export async function applyGeoCommand(previous,command,actor,{sourceText=null,sourceFile=null,parsedSpatial=null,migrationProject=null}={}) {
 const p=command.payload||{},a=command.action;let next=clone(previous);const current=kind=>(next[kind]||[]).find(r=>r.recordId===command.id);
 if(!GEO_ACTIONS[a])fail('Unknown geological operation.');
 if(['geo.sample.capture','geo.collar.save','geo.target.create'].includes(a)&&p.programId){
  const program=next.programs.find(r=>r.recordId===p.programId);
  if(!program||['completed','cancelled'].includes(program.state))fail('Choose an open program in this project.');
 }
 if(a==='geo.sample.capture'){
  const collar=p.collarRecordId&&next.collars.find(c=>c.recordId===p.collarRecordId);
  if(collar?.programId&&p.programId&&collar.programId!==p.programId)fail('A drill sample must use its collar work program.');
  const programId=p.programId||collar?.programId||null;
  if(programId&&['completed','cancelled'].includes(next.programs.find(r=>r.recordId===programId)?.state))fail('Reopen the work program before adding a sample.');
  next=field.collectSample(next,{...p,programId,collector:actor});
 }
 else if(a==='geo.sample.correct'){const r=current('samples');if(!r)fail('Sample not found.');if(!p.reason?.trim())fail('Enter the correction reason.');next=integrity.correctSample(next,r.id,p.patch||{});}
 else if(a==='geo.sample.archive'){const r=current('samples');if(!r)fail('Sample not found.');next=integrity.archiveRecord(next,'samples',r.id,p.reason||'');}
 else if(a==='geo.collar.save'){
  const existing=current('collars');if(existing){if(Object.hasOwn(p,'programId')&&existing.programId!==p.programId&&next.samples.some(s=>s.collarRecordId===existing.recordId))fail('A sampled collar cannot be reassigned to another program.');if(!p.reason?.trim())fail('Enter the correction reason.');next=integrity.correctCollar(next,existing.id,p);if(Object.hasOwn(p,'programId'))next={...next,collars:next.collars.map(c=>c.recordId===existing.recordId?{...c,programId:p.programId||null}:c)};}
  else {field.assertUniqueIds(next.collars,[p],'Hole');field.assertCollar(p);if(p.actualDepth!=null&&(!Number.isFinite(p.actualDepth)||p.actualDepth<=0))fail('Actual depth must be measured and positive.');next.collars.push({...p,recordId:command.id,id:p.id.trim(),recordedBy:actor,recordedAt:new Date().toISOString()});}
 }
 else if(a==='geo.program.create')next=field.createProgram(next,p.name||'',p.method||'rock_chip');
 else if(a==='geo.log.import'){
  if(!sourceText||!sourceFile)fail('Upload and verify the CSV source first.');
  const parser={samples:parseSampleCsv,collars:parseCollarCsv,intervals:parseIntervalCsv,surveys:parseSurveyCsv,geology:parseGeologyCsv}[p.kind];if(!parser)fail('Choose the geological CSV type.');
  const result=p.kind==='samples'?parser(sourceText,next.samples,next.idPrefix,p.crs):p.kind==='collars'?parser(sourceText,next.collars,next.idPrefix,p.crs):parser(sourceText);
  if(result.needsProjection)fail('Confirm the source coordinate system before import. No zone was guessed.');
  if(result.error)fail(result.error);if(result.errors?.length)fail(result.errors.join(' '));if(result.warnings&&!p.acknowledged)fail('Review the CSV warnings before importing: '+result.warnings);
  const rows=result.rows||result.samples||result.collars||result.intervals||result.surveys||result.geology||result.added;
  if(!Array.isArray(rows)||!rows.length)fail('No valid rows available for import.');
  const safe=rows.map(r=>({...r,recordId:r.recordId||crypto.randomUUID(),sourceFileId:sourceFile.id,assayReviewStatus:'unreviewed',recordedBy:actor}));
  if(['geology','surveys'].includes(p.kind))next=integrity.importDownhole(next,p.kind,safe);
  else if(p.kind==='intervals')next=integrity.importPhysicalIntervals(next,safe);
  else next[p.kind].push(...safe);
 }
 else if(a==='geo.dispatch.prepare')next=field.createDispatch(next,p.sampleRecordIds||[],p.laboratory||'');
 else if(a==='geo.dispatch.ship')next=field.shipDispatch(next,command.id,p.tracking||'',p.shippedDate||'');
 else if(a==='geo.dispatch.receive')next=field.reconcileReceipt(next,command.id,p.receivedIds||[],p.reference||'',p.exceptions||[]);
 else if(a==='geo.dispatch.exception')next=field.resolveReceiptException(next,command.id,p.eventRecordId,actor,p.reason||'');
 else if(a==='geo.assay.stage'){
  if(!sourceText||!sourceFile||!p.laboratory?.trim()||!p.method?.trim())fail('A verified source certificate, laboratory and method are required.');
  const batch=field.stageAssays(next,sourceText,p.certificate,!!p.confirmCanonical,{laboratory:p.laboratory,revision:p.revision||'1'});
  next=field.addAssayBatch(next,{...batch,sourceFileId:sourceFile.id,sourceSha256:sourceFile.sha256,method:p.method,importedBy:actor});
 }
 else if(a==='geo.assay.release'){
  const batch=current('assayBatches');if(!batch?.sourceFileId)fail('This analytical batch lacks verified source evidence. Re-stage the original certificate.');
  if(batch.importedBy===actor)fail('A different authorised reviewer must release the certificate.');
  if(!p.reason?.trim())fail('Document the QA/QC review decision before release.');
  next=field.releaseAssays(next,command.id,actor,p.reason);
  // Analytical approval does not move physical material backwards through custody.
  next.samples=next.samples.map(s=>({...s,lifecycle:previous.samples.find(r=>r.recordId===s.recordId)?.lifecycle||s.lifecycle}));
 }
 else if(a==='geo.assay.hold')next=field.holdAssays(next,command.id,actor,p.reason||'');
 else if(a==='geo.layer.import'){
  if(!sourceFile||!parsedSpatial)fail('Upload and validate the original map file before publication.');
  const layer={...parsedSpatial,recordId:command.id,name:String(p.name||sourceFile.name).trim(),source:{fileId:sourceFile.id,sha256:sourceFile.sha256,filename:sourceFile.name,mediaType:sourceFile.media_type},publishedBy:actor,publishedAt:new Date().toISOString()};
  next=commitSpatialImports(next,[{layer,role:p.role||'reference',replace:p.replace===true,selectedIndexes:p.selectedIndexes,acknowledged:p.acknowledged===true}]);
 }
 else if(a==='geo.layer.archive'||a==='geo.layer.restore'){
  const layer=current('spatialLayers');if(!layer)fail('Layer not found.');if(!p.reason?.trim())fail('Enter the archive/restore reason.');
  next.spatialLayers=next.spatialLayers.map(l=>l.recordId!==command.id?l:{...l,archivedAt:a.endsWith('archive')?new Date().toISOString():null,archiveReason:p.reason});
 }
 else if(a==='geo.target.create'){
  if(!p.name?.trim()||!validateCoordinates(p.lat,p.lng))fail('Enter a target name and WGS84 location.');
  next.targets.push({...p,recordId:command.id,id:p.id||'TG-'+command.id.slice(0,8).toUpperCase(),status:'planned',linkedSampleIds:[],createdBy:actor});
 }
 else if(a==='geo.target.link')next=integrity.linkFieldSample(next,p.sampleRecordId,command.id);
 else if(a==='geo.project.update'){
  if(!p.reason?.trim())fail('Enter the project metadata change reason.');
  next={...next,...Object.fromEntries(Object.entries(p).filter(([k])=>['name','color','idPrefix','description'].includes(k)))};
 }
 else if(a==='geo.migrate'){
  if(!sourceFile||!migrationProject||p.confirm!==true||!p.reason?.trim())fail('Review the complete migration package and confirm the destination.');
  if(GEO_KINDS.some(k=>(next[k]||[]).length))fail('Migration requires an empty shared project. Existing shared records are not overwritten.');
  const input=field.upgradeStore({version:8,projects:[migrationProject]}).projects[0],map=new Map();
  for(const kind of GEO_KINDS)for(const row of input[kind]||[])map.set(row.recordId,await stableId(`${command.scopeId}/legacy/${kind}/${row.recordId}`));
  next=remapValues({...input,id:command.scopeId,sharedScopeId:command.scopeId,legacyProjectId:input.id,migrationSourceFileId:sourceFile.id,migrationSourceHash:sourceFile.sha256},map);
  for(const kind of ['samples','intervals'])next[kind]=next[kind].map(r=>({...r,assayReviewStatus:Object.keys(r.assays||{}).length||Object.keys(r.detectionLimits||{}).length||Object.keys(r.lowerLimits||{}).length?'unreviewed':'pending',legacyRecord:true,legacyReviewHistory:r.assayHistory||[],assayHistory:[]}));
  next.assayBatches=next.assayBatches.map(b=>({...b,legacyStatus:b.status,status:'pending',importedBy:null,legacyRecord:true,sourceFileId:null}));
  // No historical free-text reviewer is promoted into a verified employee signature.
  next.migrationWarnings=['Historical review descriptions retained as unverified provenance. Re-stage original certificates for authenticated release.'];
  return validateSharedProject(next);
 }
 next=await normaliseNewIds(previous,next,command);
 return validateSharedProject(next);
}
