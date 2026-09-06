// Physical records and reviewed analytical results. No network or UI state here.
import { nextId, today, validateCoordinates, parseAssayCell, elementInfo, ELEMENT_SYMBOLS } from './project-store.js';
import { parseCsv } from './csv.js';
import {idKey,isControl,isReferenceControl,validDate,finiteInput,appendAudit} from './record-rules.js';

export const FIELD_RELEASE = '2026.09.07.1';
export const newRecordId = () => globalThis.crypto.randomUUID();
export const emptyStore = () => ({ version: 8, workflowVersion: 1, activeProjectId: null, projects: [] });
export function upgradeStore(input) {
  if (!input || input.version !== 8 || !Array.isArray(input.projects)) throw new Error('Unsupported workspace format. Original bytes have been left intact.');
  const ids = new Set();
  const projects = input.projects.map(p => {
    if (!p?.id || ids.has(p.id)) throw new Error('Missing or duplicate project identity. Restore requires review.');
    ids.add(p.id);
    const result = { ...p };
    for (const key of ['samples','collars','intervals','surveys','geology','files','targets','programs','dispatches','assayBatches','observations']) {
      if (p[key] != null && !Array.isArray(p[key])) throw new Error(`Invalid ${key} in ${p.name || p.id}.`);
      result[key] = (p[key] || []).map(row => ({ ...row, recordId: row.recordId || newRecordId() }));
    }
    for(const kind of ['samples','intervals'])result[kind]=result[kind].map(s=>({...s,assayReviewStatus:s.assayReviewStatus||(s.assayHistory?.some(h=>h.reviewedAt)?'released':Object.keys(s.assays||{}).length||Object.keys(s.detectionLimits||{}).length||Object.keys(s.lowerLimits||{}).length?'unreviewed':'pending')}));
    return result;
  });
  return { ...input, workflowVersion: 1, projects };
}
export function createFieldProject(name) {
  const clean = String(name || '').trim();
  if (!clean) throw new Error('Enter a project name.');
  return { id: newRecordId(), name: clean, color: '#C15F3C', idPrefix: `${clean.replace(/[^a-z]/gi,'').slice(0,3).toUpperCase() || 'MX'}-`, createdAt: today(), boundary: null, samples: [], collars: [], intervals: [], surveys: [], geology: [], files: [], targets: [], programs: [], dispatches: [], assayBatches: [], observations: [] };
}
export function assertUniqueIds(existing, incoming, label = 'Sample') {
  const seen = new Set(existing.map(r => idKey(r.id)));
  for (const row of incoming) {
    if (!idKey(row.id)) throw new Error(`${label} ID is required.`);
    if (seen.has(idKey(row.id))) throw new Error(`${label} ID ${row.id} already exists. Give a physical duplicate its own bag ID.`);
    seen.add(idKey(row.id));
  }
}
export function assertInterval(from, to, existing = [], holeId) {
  if (![from, to].every(Number.isFinite) || from < 0 || to <= from) throw new Error('Interval must have finite depths with 0 ≤ from < to.');
  if (existing.some(i => i.holeId === holeId && from < i.to && to > i.from)) throw new Error('This interval overlaps an existing interval in this hole.');
}
export function assertCollar(c) {
  if (!validateCoordinates(c.lat, c.lng)) throw new Error('Enter valid WGS84 collar coordinates.');
  if (c.azimuth != null && (!Number.isFinite(c.azimuth) || c.azimuth < 0 || c.azimuth >= 360)) throw new Error('Azimuth must be 0–<360 degrees.');
  if (c.dip != null && (!Number.isFinite(c.dip) || c.dip < -90 || c.dip > 90)) throw new Error('Dip must be between -90 and 90 degrees.');
  if (c.depth != null && (!Number.isFinite(c.depth) || c.depth <= 0)) throw new Error('Hole depth must be positive and finite.');
}
export function collectSample(project, draft) {
  const id = String(draft.id || nextId(project.samples, project.idPrefix)).trim();
  assertUniqueIds(project.samples, [{id}]);
  if (draft.programId && !(project.programs || []).some(p => p.recordId === draft.programId)) throw new Error('The selected program does not belong to this project.');
  const method = draft.sampleType || 'rock_chip', qaqcType = draft.qaqcType || 'none';
  if (!['rock_chip','soil','float','rc','diamond_core','other'].includes(method)) throw new Error('Select a supported sampling method.');
  if (!['none','blank','standard','duplicate','triplicate'].includes(qaqcType)) throw new Error('Select a supported QA/QC type.');
  const reference = isReferenceControl({qaqcType}), duplicate = ['duplicate','triplicate'].includes(qaqcType);
  const original = duplicate && project.samples.find(s => s.recordId === draft.duplicateRecordId);
  if (duplicate && (!original || isControl(original) || original.archivedAt)) throw new Error('Select the original physical sample for this duplicate.');
  if (qaqcType === 'standard' && !String(draft.referenceMaterial||'').trim()) throw new Error('A standard needs its certified reference material identifier.');
  let lat = null, lng = null, collar, from, to;
  const drilling = !reference && (method === 'rc' || method === 'diamond_core');
  if (drilling) {
    collar = project.collars.find(c => c.recordId === draft.collarRecordId && !c.archivedAt);
    if (!collar) throw new Error('Choose a drillhole from this project.');
    lat = collar.lat; lng = collar.lng;
    from = finiteInput(draft.from,'From depth'); to = finiteInput(draft.to,'To depth');
    const primaryIntervals = (project.intervals || []).filter(i => !i.archivedAt && !isControl(i) && !isControl(project.samples.find(s=>s.recordId===i.sampleRecordId)));
    assertInterval(from, to, duplicate ? [] : primaryIntervals, collar.id);
    const actualDepth = collar.actualDepth ?? collar.depth;
    if (!Number.isFinite(actualDepth) || to > actualDepth) throw new Error('The sample extends past the recorded actual drilled depth. Update drilling progress first.');
    if (duplicate && (original.collarRecordId!==collar.recordId || original.from!==from || original.to!==to)) throw new Error('A drill duplicate must reference the original interval.');
  } else if (!reference) {
    lat = finiteInput(draft.lat,'Latitude'); lng = finiteInput(draft.lng,'Longitude');
    if (!validateCoordinates(lat,lng)) throw new Error('Capture GPS or enter the actual sample coordinates.');
  }
  if (!validDate(draft.date)) throw new Error('A valid collection date is required.');
  const row = {recordId:newRecordId(),id,lat,lng,sampleType:method,qaqcType,date:draft.date,recordedAt:new Date().toISOString(),coordSource:reference?'not_applicable':drilling?'collar_reference':(draft.coordSource||'unknown'),coordinateAccuracyM:reference||drilling?null:(draft.coordinateAccuracyM??null),lith:String(draft.lith||''),notes:String(draft.notes||''),collector:String(draft.collector||''),assays:{},programId:draft.programId||null,lifecycle:'collected',assayReviewStatus:'pending',referenceMaterial:reference?String(draft.referenceMaterial||''):null,
    ...(original?{duplicateRecordId:original.recordId,duplicateOf:original.id}:{}),
    ...(collar?{holeId:collar.id,collarRecordId:collar.recordId,from,to}:{}),
    ...(drilling?{recoveryPercent:draft.recoveryPercent===''||draft.recoveryPercent==null?null:finiteInput(draft.recoveryPercent,'Recovery'),condition:draft.condition||'unknown',splitMethod:String(draft.splitMethod||''),coreFraction:draft.coreFraction||null}:{})};
  if(row.recoveryPercent!=null&&(row.recoveryPercent<0||row.recoveryPercent>100))throw new Error('Recovery must be 0–100%, or left unrecorded.');
  if(row.coreFraction!=null&&!['whole','half','quarter'].includes(row.coreFraction))throw new Error('Select whole, half or quarter core.');
  const intervals=collar?[...(project.intervals||[]),{recordId:newRecordId(),sampleRecordId:row.recordId,sampleId:id,collarRecordId:collar.recordId,holeId:collar.id,from,to,qaqcType,assays:{},assayReviewStatus:'pending'}]:project.intervals||[];
  return {...project,samples:[...project.samples,row],intervals,audit:appendAudit(project,'collect',row.recordId,'Physical bag collected')};
}
export function createProgram(project, name, method) {
  if (!name.trim()) throw new Error('Enter a program name.');
  return { ...project, programs: [...(project.programs || []), { recordId: newRecordId(), name: name.trim(), method, createdAt: new Date().toISOString(), status: 'active' }] };
}
export function createDispatch(project, sampleRecordIds, laboratory) {
  const ids = [...new Set(sampleRecordIds)];
  if (!ids.length || !laboratory.trim()) throw new Error('Select samples and enter the receiving laboratory.');
  const sampleMap = new Map(project.samples.map(s => [s.recordId, s]));
  const assigned = new Set((project.dispatches || []).filter(d=>d.status!=='cancelled').flatMap(d => d.sampleRecordIds));
  for (const id of ids) {
    if (!sampleMap.has(id)||sampleMap.get(id).archivedAt) throw new Error('A selected sample is not active in this project.');
    if (assigned.has(id)) throw new Error(`${sampleMap.get(id).id} is already in a dispatch.`);
  }
  const dispatch={recordId:newRecordId(),id:`DSP-${String((project.dispatches||[]).length+1).padStart(4,'0')}`,laboratory:laboratory.trim(),sampleRecordIds:ids,status:'prepared',preparedAt:new Date().toISOString(),receivedRecordIds:[],receiptEvents:[],shipments:[],exceptionResolutions:[]};
  return {...project,dispatches:[...(project.dispatches||[]),dispatch],audit:appendAudit(project,'prepare-dispatch',dispatch.recordId,'Manifest prepared; not yet shipped')};
}
export function shipDispatch(project,dispatchId,tracking,shippedDate) {
  const dispatch=(project.dispatches||[]).find(d=>d.recordId===dispatchId);
  if(!dispatch||dispatch.status!=='prepared')throw new Error('Only a prepared manifest can be shipped.');
  if(!String(tracking||'').trim()||!validDate(shippedDate))throw new Error('Record the shipment reference and actual shipping date.');
  const event={recordId:newRecordId(),tracking:tracking.trim(),date:shippedDate,recordedAt:new Date().toISOString()};
  return {...project,dispatches:project.dispatches.map(d=>d.recordId===dispatchId?{...d,status:'shipped',dispatchedAt:shippedDate,shipments:[...(d.shipments||[]),event]}:d),samples:project.samples.map(s=>dispatch.sampleRecordIds.includes(s.recordId)?{...s,lifecycle:'dispatched'}:s),audit:appendAudit(project,'ship-dispatch',dispatchId,tracking.trim())};
}
export function reconcileReceipt(project,dispatchId,receivedIds,reference,exceptions=[]) {
  const dispatch=(project.dispatches||[]).find(d=>d.recordId===dispatchId);
  if(!dispatch)throw new Error('Dispatch not found in this project.');
  const received=[...new Set(receivedIds)];
  if(!reference.trim())throw new Error('Enter the laboratory receipt reference.');
  if(received.some(id=>!dispatch.sampleRecordIds.includes(id)))throw new Error('Receipt contains an unexpected sample. Record it as an exception, not as a manifest member.');
  if(!['shipped','dispatched','received','receipt-exception'].includes(dispatch.status))throw new Error('Record the actual shipment before a laboratory receipt.');
  if(!Array.isArray(exceptions)||exceptions.some(x=>!String(x.reason||'').trim()))throw new Error('Every receipt exception needs a reason.');
  const cumulative=[...new Set([...(dispatch.receivedRecordIds||[]),...received])];
  const event={recordId:newRecordId(),at:new Date().toISOString(),reference:reference.trim(),receivedRecordIds:received,exceptions};
  if((dispatch.receiptEvents||[]).some(e=>e.reference===event.reference&&JSON.stringify(e.receivedRecordIds)===JSON.stringify(received)&&JSON.stringify(e.exceptions||[])===JSON.stringify(exceptions)))return project;
  const events=[...(dispatch.receiptEvents||[]),event];
  const unresolved=events.some(e=>e.exceptions?.length&&!dispatch.exceptionResolutions?.some(r=>r.eventRecordId===e.recordId));
  return {...project,dispatches:project.dispatches.map(d=>d.recordId===dispatchId?{...d,receivedRecordIds:cumulative,status:cumulative.length===d.sampleRecordIds.length&&!unresolved?'received':'receipt-exception',receiptEvents:events}:d),samples:project.samples.map(s=>cumulative.includes(s.recordId)&&!s.assayHistory?.length?{...s,lifecycle:'received'}:s),audit:appendAudit(project,'receipt',dispatchId,reference.trim())};
}
export function receiptIssues(project,batch) {
  const involved=new Set(batch.results.map(r=>r.sampleRecordId));
  return (project.dispatches||[]).filter(d=>d.sampleRecordIds.some(id=>involved.has(id))).flatMap(d=>{
    const missing=d.sampleRecordIds.filter(id=>!d.receivedRecordIds?.includes(id));
    const exceptions=(d.receiptEvents||[]).filter(e=>e.exceptions?.length&&!d.exceptionResolutions?.some(r=>r.eventRecordId===e.recordId));
    return d.status!=='received'||missing.length||exceptions.length?[`${d.id}: resolve custody / receipt exceptions before releasing results (${missing.length} bags unreceived).`]:[];
  });
}
export function resolveReceiptException(project,dispatchId,eventRecordId,reviewer,reason) {
  const d=(project.dispatches||[]).find(d=>d.recordId===dispatchId);
  if(!d?.receiptEvents?.some(e=>e.recordId===eventRecordId&&e.exceptions?.length))throw new Error('Receipt exception not found.');
  if(!reviewer.trim()||reason.trim().length<3)throw new Error('A reviewer and a reasoned resolution are required.');
  if(d.exceptionResolutions?.some(e=>e.eventRecordId===eventRecordId))return project;
  const resolutions=[...(d.exceptionResolutions||[]),{recordId:newRecordId(),eventRecordId,reviewer:reviewer.trim(),reason:reason.trim(),at:new Date().toISOString()}];
  const complete=d.receivedRecordIds.length===d.sampleRecordIds.length&&d.receiptEvents.every(e=>!e.exceptions?.length||resolutions.some(r=>r.eventRecordId===e.recordId));
  return {...project,dispatches:project.dispatches.map(x=>x===d?{...d,exceptionResolutions:resolutions,status:complete?'received':'receipt-exception'}:x),audit:appendAudit(project,'resolve-receipt',dispatchId,reason.trim())};
}
const UNIT_SCALE = { ppb: 0.001, ppm: 1, 'g/t': 1, '%': 10000 };
export function assayColumn(header, canonicalUnitsConfirmed = false) {
  const text = String(header).trim();
  const m = text.match(/^([A-Za-z]{1,2})(?:[_\s(]+(.*?)\)?|(%))?$/i);
  const element = m && ELEMENT_SYMBOLS.find(e => e.toLowerCase() === m[1].toLowerCase());
  if (!element) return null;
  const token = (m[2] || m[3])?.toLowerCase();
  const sourceUnit = token === 'gpt' ? 'g/t' : ['pct','percent'].includes(token) ? '%' : token || (canonicalUnitsConfirmed ? elementInfo(element).unit : null);
  return { element, sourceUnit, canonicalUnit: elementInfo(element).unit, factor: sourceUnit && UNIT_SCALE[sourceUnit] ? UNIT_SCALE[sourceUnit] / UNIT_SCALE[elementInfo(element).unit] : null };
}
export function stageAssays(project, csv, certificate, confirmCanonical = false, metadata = {}) {
  const laboratory=String(metadata.laboratory||'').trim(),revision=String(metadata.revision||'1').trim();
  const prior=(project.assayBatches||[]).find(b=>idKey(b.certificate)===idKey(certificate)&&idKey(b.laboratory||'')===idKey(laboratory)&&String(b.revision||'1')===revision);
  if(prior){
    if(prior.rawCsv===csv&&!!prior.canonicalUnitsConfirmed===!!confirmCanonical)return prior;
    throw new Error('That certificate revision already exists with different source data. Enter a new revision; prior results remain intact.');
  }
  if (!String(certificate||'').trim()) throw new Error('A certificate or batch reference is required.');
  const rows = parseCsv(csv);
  if (rows.length < 2) throw new Error('Provide a CSV header and result rows.');
  const iId = rows[0].findIndex(h => ['sample_id','id','bag_id'].includes(h.toLowerCase()));
  if (iId < 0) throw new Error('Results need a sample_id column.');
  const columns = rows[0].map((h,index) => ({...assayColumn(h,confirmCanonical), index})).filter(c=>c.element);
  if (!columns.length) throw new Error('No supported analytical columns. Use headers such as Au_ppb or Cu_ppm.');
  const duplicateElements = columns.map(c=>c.element).filter((e,i,a)=>a.indexOf(e)!==i);
  const issues = duplicateElements.map(e=>`Multiple columns for ${e}; select the intended analytical method before import.`);
  const results = [], seen = new Set();
  for (let r=1;r<rows.length;r++) {
    const bagId=String(rows[r][iId]||'').trim();
    const matches=project.samples.filter(s=>idKey(s.id)===idKey(bagId));
    if (matches.length!==1) issues.push(`Record ${r+1}: ${bagId || '(missing ID)'} ${matches.length ? 'is ambiguous' : 'is not in this project'}.`);
    if (seen.has(idKey(bagId))) issues.push(`Record ${r+1}: repeated bag ID ${bagId}. Split analytical methods into separate reviewed batches.`);
    seen.add(idKey(bagId));
    for (const c of columns) {
      const reportedText=String(rows[r][c.index]??'').trim();
      if (!reportedText) continue;
      const parsed=parseAssayCell(reportedText);
      if (!c.sourceUnit || c.factor == null) issues.push(`${bagId} ${c.element}: source unit is not specified.`);
      if (parsed.value==null&&parsed.detectionLimit==null&&parsed.lowerLimit==null) issues.push(`${bagId} ${c.element}: unresolved result "${reportedText}".`);
      results.push({recordId:newRecordId(), sampleRecordId:matches.length===1?matches[0].recordId:null, sampleId:matches.length===1?matches[0].id:bagId, reportedSampleId:bagId, element:c.element, sourceUnit:c.sourceUnit, canonicalUnit:c.canonicalUnit, reportedText, value:c.factor!=null&&parsed.value!=null?parsed.value*c.factor:null, detectionLimit:c.factor!=null&&parsed.detectionLimit!=null?parsed.detectionLimit*c.factor:null, lowerLimit:c.factor!=null&&parsed.lowerLimit!=null?parsed.lowerLimit*c.factor:null, qualifier:parsed.qualifier||null, sourceRecord:r+1});
    }
  }
  if(results.some(r=>[r.value,r.detectionLimit,r.lowerLimit].some(v=>v!=null&&!Number.isFinite(v))))issues.push('Converted analytical result is outside the supported numerical range.');
  if (!results.length) issues.push('No analytical results were found.');
  return {recordId:newRecordId(), certificate:certificate.trim(), laboratory, revision, importedAt:new Date().toISOString(), status:'pending', rawCsv:csv, canonicalUnitsConfirmed:confirmCanonical, results, issues:[...new Set(issues)]};
}
export function addAssayBatch(project,batch) {
  if((project.assayBatches||[]).some(b=>b.recordId===batch.recordId))return project;
  return {...project,assayBatches:[...(project.assayBatches||[]),batch]};
}
export function holdAssays(project,batchId,reviewer,reason) {
  if(!reviewer.trim()||reason.trim().length<3)throw new Error('Enter the reviewer and reason for holding the batch.');
  const batch=project.assayBatches.find(b=>b.recordId===batchId);
  if(!batch||batch.status!=='pending')throw new Error('Only a pending batch can be held.');
  return {...project,assayBatches:project.assayBatches.map(b=>b===batch?{...b,status:'held',reviewer:reviewer.trim(),reviewReason:reason.trim(),reviewedAt:new Date().toISOString()}:b),audit:appendAudit(project,'hold-assays',batchId,reason.trim())};
}
export function releaseAssays(project,batchId,reviewer,reviewReason='') {
  if (!reviewer.trim()) throw new Error('Enter the reviewing geologist’s name. This is a local record, not an authenticated signature.');
  const batch=(project.assayBatches||[]).find(b=>b.recordId===batchId);
  if(batch?.status==='released'){return {...project,assayBatches:project.assayBatches.filter((b,i,a)=>a.findIndex(x=>x.recordId===b.recordId)===i)};}
  if (!batch||batch.status!=='pending') throw new Error('This batch is not awaiting review.');
  if (batch.issues.length) throw new Error('Resolve all import exceptions before releasing results.');
  if (!reviewer.trim()) throw new Error('Enter the reviewing geologist’s name. This is a local record, not an authenticated signature.');
  const custody=receiptIssues(project,batch);if(custody.length)throw new Error(custody.join(' '));
  if(batch.results.some(r=>isControl(project.samples.find(s=>s.recordId===r.sampleRecordId)))&&reviewReason.trim().length<3)throw new Error('Document the QA/QC review decision for control samples before release.');
  const sampleMap=new Map(project.samples.map(s=>[s.recordId,s]));
  for (const r of batch.results) if (!sampleMap.has(r.sampleRecordId)||idKey(sampleMap.get(r.sampleRecordId).id)!==idKey(r.sampleId)||sampleMap.get(r.sampleRecordId).archivedAt) throw new Error('A sample changed after import. Reconcile the batch again.');
  const reviewedAt=new Date().toISOString();
  const samples=project.samples.map(s=>{
    const results=batch.results.filter(r=>r.sampleRecordId===s.recordId);
    if(!results.length)return s;
    const active=s.assayReviewStatus==='unreviewed'?{}:s;
    const assays={...(active.assays||{})}, detectionLimits={...(active.detectionLimits||{})},lowerLimits={...(active.lowerLimits||{})},qualifiers={...(s.assayQualifiers||{})};
    for(const r of results) {
      delete assays[r.element];delete detectionLimits[r.element];delete lowerLimits[r.element];delete qualifiers[r.element];
      if(r.qualifier)qualifiers[r.element]=r.qualifier;
      if(r.value!=null){assays[r.element]=r.value;}
      else if(r.detectionLimit!=null){detectionLimits[r.element]=r.detectionLimit;}
      else if(r.lowerLimit!=null){lowerLimits[r.element]=r.lowerLimit;}
    }
    return {...s,assays,detectionLimits,lowerLimits,assayQualifiers:qualifiers,assayReviewStatus:'released',lifecycle:'reviewed',assayHistory:[...(s.assayHistory||[]),{batchRecordId:batchId,certificate:batch.certificate,reviewedAt,reviewer:reviewer.trim(),revision:batch.revision||'1',reviewReason:reviewReason.trim(),previous:{assays:s.assays||{},detectionLimits:s.detectionLimits||{},lowerLimits:s.lowerLimits||{}},results}]};
  });
  const updated=new Map(samples.map(s=>[s.recordId,s]));
  return {...project,samples,intervals:(project.intervals||[]).map(i=>{
    const s=updated.get(i.sampleRecordId);return s?{...i,assays:s.assays,detectionLimits:s.detectionLimits,lowerLimits:s.lowerLimits,assayQualifiers:s.assayQualifiers,assayReviewStatus:s.assayReviewStatus}:i;
  }),assayBatches:project.assayBatches.map(b=>b.recordId===batchId?{...b,status:'released',reviewedAt,reviewer:reviewer.trim(),reviewReason:reviewReason.trim()}:b),audit:appendAudit(project,'release-assays',batchId,reviewReason.trim()||'Named local review; not an authenticated signature')};
}
export function scopedDownholeRecords(store,projectId,kind) {
  if(!['intervals','surveys','geology'].includes(kind))throw new Error('Invalid downhole dataset.');
  return store.projects.filter(p=>projectId==='all'||p.id===projectId).flatMap(p=>(p[kind]||[]));
}
export async function makeBackup(store,layerUi={}) {
  const payload=JSON.stringify({store,layerUi});
  const bytes=new TextEncoder().encode(payload);
  const checksum=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
  return JSON.stringify({format:'mineralx-workspace-backup',version:1,createdAt:new Date().toISOString(),checksum,payload},null,2);
}
export async function readBackup(text) {
  const pack=JSON.parse(text);
  if(pack.format!=='mineralx-workspace-backup'||pack.version!==1||typeof pack.payload!=='string')throw new Error('Unsupported backup format. No records were changed.');
  const checksum=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(pack.payload)))].map(n=>n.toString(16).padStart(2,'0')).join('');
  if(checksum!==pack.checksum)throw new Error('Backup checksum does not match. No records were changed.');
  const payload=JSON.parse(pack.payload);
  return {store:upgradeStore(payload.store),layerUi:payload.layerUi||{},createdAt:pack.createdAt};
}
