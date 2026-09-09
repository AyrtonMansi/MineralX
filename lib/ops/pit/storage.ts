import { MAX_FILE_BYTES, validateSurface, type PitProject } from './model';
type Stored = {key:string; workspace:string; project:PitProject};
function database(): Promise<IDBDatabase> { return new Promise((resolve,reject) => {
  const request = indexedDB.open('mineralx-pit-scenarios',1);
  request.onupgradeneeded = () => {const store=request.result.createObjectStore('scenarios',{keyPath:'key'});store.createIndex('workspace','workspace');};
  request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error);
  request.onblocked=()=>reject(new Error('Close other MineralX tabs and retry opening scan storage.'));
}); }
export async function listProjects(workspace: string): Promise<PitProject[]> {
  const db=await database();return new Promise((resolve,reject)=>{
    const tx=db.transaction('scenarios','readonly'),request=tx.objectStore('scenarios').index('workspace').getAll(workspace);
    tx.oncomplete=()=>{db.close();resolve((request.result as Stored[]).map(r=>r.project).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));};
    tx.onabort=()=>{db.close();reject(tx.error||new Error('Unable to read saved scenarios. Retry or reopen this browser.'));};
  });
}
export async function saveProject(workspace:string, project:PitProject):Promise<PitProject> {
  validateProject(project);const db=await database();return new Promise((resolve,reject)=>{
    const tx=db.transaction('scenarios','readwrite'),store=tx.objectStore('scenarios'),key=workspace+':'+project.id;
    let reason:Error|null=null;const next={...project,version:project.version+1,updatedAt:new Date().toISOString()};
    const request=store.get(key);request.onsuccess=()=>{
      const previous=request.result as Stored|undefined;
      if((previous?.project.version||0)!==project.version){reason=new Error('This scenario changed in another tab. Export your work, then reopen the saved scenario.');tx.abort();return;}
      try{store.put({key,workspace,project:next});}catch(e){reason=e instanceof Error?e:new Error('Unable to save the scenario.');tx.abort();}
    };
    tx.oncomplete=()=>{db.close();resolve(next);};tx.onabort=()=>{db.close();reject(reason||new Error('Device storage could not save this scan. Your edits remain open; export a backup or free space and retry.'));};
  });
}
export function validateProject(p:PitProject) {
  if(!p||p.format!=='mineralx-pit'||p.schema!==1||typeof p.id!=='string'||!p.id.match(/^[\w-]{1,80}$/)||!Number.isInteger(p.version)||p.version<0||typeof p.name!=='string'||!p.name.trim()||p.name.length>160||!['pit','stockpile'].includes(p.kind)||!p.source||typeof p.source.name!=='string'||typeof p.source.sha256!=='string'||!['m','cm','mm'].includes(p.source.units)||!['y','z'].includes(p.source.up)||!Array.isArray(p.source.origin)||p.source.origin.length!==3||!p.source.origin.every(Number.isFinite)||!(p.source.bytes instanceof ArrayBuffer)||p.source.bytes.byteLength>MAX_FILE_BYTES||typeof p.createdAt!=='string'||!Number.isFinite(Date.parse(p.createdAt))||typeof p.updatedAt!=='string'||!Number.isFinite(Date.parse(p.updatedAt)))throw new Error('Invalid MineralX scenario package.');
  validateSurface(p.original);validateSurface({positions:p.edited,indices:p.original.indices});
  if(p.edited.length!==p.original.positions.length)throw new Error('The scenario does not match its original ground surface.');
}
export function projectJSON(project:PitProject) {
  let binary='';const bytes=new Uint8Array(project.source.bytes);
  for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
  return JSON.stringify({...project,source:{...project.source,bytes:undefined,base64:btoa(binary)} });
}
export async function restoreProject(text:string):Promise<PitProject> {
  const raw=JSON.parse(text);
  if(typeof raw?.source?.base64!=='string'||raw.source.base64.length>Math.ceil(MAX_FILE_BYTES/3)*4)throw new Error('Invalid source file in scenario package.');
  const binary=atob(raw.source.base64),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)).buffer;
  const project={...raw,source:{...raw.source,bytes},id:crypto.randomUUID(),version:0} as PitProject;
  validateProject(project);
  if(project.source.sha256){const digest=await crypto.subtle.digest('SHA-256',bytes);const hash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');if(hash!==project.source.sha256)throw new Error('The original source file failed its integrity check.');}
  return project;
}
