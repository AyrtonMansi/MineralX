// Physical records and reviewed analytical results. No network or UI state here.
import { nextId, today, validateCoordinates, parseAssayCell, elementInfo, ELEMENT_SYMBOLS } from './project-store.js';
import { parseCsv } from './csv.js';

export const FIELD_RELEASE = '2026.09.06.1';
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
  const seen = new Set(existing.map(r => String(r.id).trim()));
  for (const row of incoming) {
    if (!row.id?.trim()) throw new Error(`${label} ID is required.`);
    if (seen.has(row.id.trim())) throw new Error(`${label} ID ${row.id} already exists. Give a physical duplicate its own bag ID.`);
    seen.add(row.id.trim());
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
  const method = draft.sampleType || 'rock_chip';
  let lat = Number(draft.lat), lng = Number(draft.lng), collar;
  const drilling = method === 'rc' || method === 'diamond_core';
  if (drilling) {
    collar = project.collars.find(c => c.recordId === draft.collarRecordId);
    if (!collar) throw new Error('Choose a drillhole from this project.');
    lat = collar.lat; lng = collar.lng;
    assertInterval(Number(draft.from), Number(draft.to), project.intervals || [], collar.id);
    if (collar.depth != null && Number(draft.to) > collar.depth) throw new Error('The sample extends past the recorded hole depth.');
  } else if (draft.lat === '' || draft.lng === '' || !validateCoordinates(lat,lng)) throw new Error('Capture GPS or enter the actual sample coordinates.');
  if (!draft.date || !/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || Number.isNaN(Date.parse(draft.date))) throw new Error('A valid collection date is required.');
  if (draft.qaqcType === 'duplicate' && !project.samples.some(s => s.recordId === draft.duplicateRecordId)) throw new Error('Select the original physical sample for this duplicate.');
  const row = { recordId: newRecordId(), id, lat, lng, sampleType: method, qaqcType: draft.qaqcType || 'none', date: draft.date, collectedAt: new Date().toISOString(), coordSource: drilling ? 'collar_reference' : (draft.coordSource || 'unknown'), coordinateAccuracyM: draft.coordinateAccuracyM ?? null, lith: String(draft.lith || ''), notes: String(draft.notes || ''), assays: {}, programId: draft.programId || null, lifecycle: 'collected', ...(draft.duplicateRecordId ? { duplicateRecordId: draft.duplicateRecordId, duplicateOf: project.samples.find(s => s.recordId === draft.duplicateRecordId)?.id } : {}), ...(collar ? { holeId: collar.id, collarRecordId: collar.recordId, from: Number(draft.from), to: Number(draft.to) } : {}) };
  const intervals = collar ? [...(project.intervals || []), { recordId: newRecordId(), sampleRecordId: row.recordId, sampleId: id, collarRecordId: collar.recordId, holeId: collar.id, from: row.from, to: row.to, assays: {} }] : project.intervals || [];
  return { ...project, samples: [...project.samples, row], intervals };
}
export function createProgram(project, name, method) {
  if (!name.trim()) throw new Error('Enter a program name.');
  return { ...project, programs: [...(project.programs || []), { recordId: newRecordId(), name: name.trim(), method, createdAt: new Date().toISOString(), status: 'active' }] };
}
export function createDispatch(project, sampleRecordIds, laboratory) {
  const ids = [...new Set(sampleRecordIds)];
  if (!ids.length || !laboratory.trim()) throw new Error('Select samples and enter the receiving laboratory.');
  const sampleMap = new Map(project.samples.map(s => [s.recordId, s]));
  const assigned = new Set((project.dispatches || []).flatMap(d => d.sampleRecordIds));
  for (const id of ids) {
    if (!sampleMap.has(id)) throw new Error('A selected sample is not in this project.');
    if (assigned.has(id)) throw new Error(`${sampleMap.get(id).id} is already in a dispatch.`);
  }
  const dispatch = { recordId: newRecordId(), id: `DSP-${String((project.dispatches || []).length+1).padStart(4,'0')}`, laboratory: laboratory.trim(), sampleRecordIds: ids, status: 'dispatched', dispatchedAt: new Date().toISOString(), receivedRecordIds: [], receiptEvents: [] };
  return { ...project, dispatches: [...(project.dispatches || []), dispatch], samples: project.samples.map(s => ids.includes(s.recordId) ? {...s, lifecycle:'dispatched'} : s) };
}
export function reconcileReceipt(project, dispatchId, receivedIds, reference) {
  const dispatch = (project.dispatches || []).find(d => d.recordId === dispatchId);
  if (!dispatch) throw new Error('Dispatch not found in this project.');
  const received = [...new Set(receivedIds)];
  if (!reference.trim()) throw new Error('Enter the laboratory receipt reference.');
  if (received.some(id => !dispatch.sampleRecordIds.includes(id))) throw new Error('Receipt contains an unexpected sample.');
  const cumulative = [...new Set([...(dispatch.receivedRecordIds || []), ...received])];
  return { ...project, dispatches: project.dispatches.map(d => d.recordId === dispatchId ? { ...d, receivedRecordIds: cumulative, status: cumulative.length === d.sampleRecordIds.length ? 'received' : 'receipt-exception', receiptEvents: [...(d.receiptEvents || []), {at:new Date().toISOString(), reference:reference.trim(), receivedRecordIds:received}] } : d), samples: project.samples.map(s => cumulative.includes(s.recordId) && !s.assayHistory?.length ? {...s,lifecycle:'received'} : s) };
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
export function stageAssays(project, csv, certificate, confirmCanonical = false) {
  if (!certificate.trim()) throw new Error('A certificate or batch reference is required.');
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
    const matches=project.samples.filter(s=>s.id===bagId);
    if (matches.length!==1) issues.push(`Record ${r+1}: ${bagId || '(missing ID)'} ${matches.length ? 'is ambiguous' : 'is not in this project'}.`);
    if (seen.has(bagId)) issues.push(`Record ${r+1}: repeated bag ID ${bagId}. Split analytical methods into separate reviewed batches.`);
    seen.add(bagId);
    for (const c of columns) {
      const reportedText=String(rows[r][c.index]??'').trim();
      if (!reportedText) continue;
      const parsed=parseAssayCell(reportedText);
      if (!c.sourceUnit || c.factor == null) issues.push(`${bagId} ${c.element}: source unit is not specified.`);
      if (parsed.value==null&&parsed.detectionLimit==null) issues.push(`${bagId} ${c.element}: unresolved result "${reportedText}".`);
      results.push({recordId:newRecordId(), sampleRecordId:matches.length===1?matches[0].recordId:null, sampleId:bagId, element:c.element, sourceUnit:c.sourceUnit, canonicalUnit:c.canonicalUnit, reportedText, value:c.factor!=null&&parsed.value!=null?parsed.value*c.factor:null, detectionLimit:c.factor!=null&&parsed.detectionLimit!=null?parsed.detectionLimit*c.factor:null, sourceRecord:r+1});
    }
  }
  if (!results.length) issues.push('No analytical results were found.');
  return {recordId:newRecordId(), certificate:certificate.trim(), importedAt:new Date().toISOString(), status:'pending', rawCsv:csv, canonicalUnitsConfirmed:confirmCanonical, results, issues:[...new Set(issues)]};
}
export function releaseAssays(project,batchId,reviewer) {
  const batch=(project.assayBatches||[]).find(b=>b.recordId===batchId);
  if (!batch||batch.status!=='pending') throw new Error('This batch is not awaiting review.');
  if (batch.issues.length) throw new Error('Resolve all import exceptions before releasing results.');
  if (!reviewer.trim()) throw new Error('Enter the reviewing geologist’s name. This is a local record, not an authenticated signature.');
  const sampleMap=new Map(project.samples.map(s=>[s.recordId,s]));
  for (const r of batch.results) if (!sampleMap.has(r.sampleRecordId)||sampleMap.get(r.sampleRecordId).id!==r.sampleId) throw new Error('A sample changed after import. Reconcile the batch again.');
  const reviewedAt=new Date().toISOString();
  const samples=project.samples.map(s=>{
    const results=batch.results.filter(r=>r.sampleRecordId===s.recordId);
    if(!results.length)return s;
    const assays={...(s.assays||{})}, detectionLimits={...(s.detectionLimits||{})};
    for(const r of results) {
      if(r.value!=null){assays[r.element]=r.value;delete detectionLimits[r.element];}
      else if(r.detectionLimit!=null){detectionLimits[r.element]=r.detectionLimit;delete assays[r.element];}
    }
    return {...s,assays,detectionLimits,lifecycle:'reviewed',assayHistory:[...(s.assayHistory||[]),{batchRecordId:batchId,certificate:batch.certificate,reviewedAt,reviewer:reviewer.trim(),previous:{assays:s.assays||{},detectionLimits:s.detectionLimits||{}},results}]};
  });
  const updated=new Map(samples.map(s=>[s.recordId,s]));
  return {...project,samples,intervals:(project.intervals||[]).map(i=>{
    const s=updated.get(i.sampleRecordId);return s?{...i,assays:s.assays,detectionLimits:s.detectionLimits}:i;
  }),assayBatches:project.assayBatches.map(b=>b.recordId===batchId?{...b,status:'released',reviewedAt,reviewer:reviewer.trim()}:b)};
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
