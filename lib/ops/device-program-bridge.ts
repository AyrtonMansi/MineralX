/**
 * A deliberately small, browser-only bridge between the local Globe and the
 * local Operations development database. It contains program metadata only;
 * it never has an account, scope from a staff session, meeting data, or a
 * network transport.
 */
import {SAMPLE_TYPES} from '@/components/mineralx/project-store.js';

export const DEVICE_PROGRAM_REGISTRY_VERSION=1;
const DATABASE='mineralx-device-program-registry-v1';
const STORE='registries';
const KEY='current';
const EVENT='mineralx-device-program-registry-change';
const CHANNEL='mineralx-device-program-registry-v1';
const UUID=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const STATES=new Set(['draft','planned','ready','in_progress','blocked','on_hold','completed','cancelled']);

export type DeviceProgramOrigin='globe'|'development';
export type DeviceProgram={
 recordId:string;
 globeProjectId:string|null;
 name:string;
 method:string;
 type:string;
 state:string;
 /** Kept for pre-bridge Globe records. The canonical state is `state`. */
 status:string;
 createdAt:string;
 origin:DeviceProgramOrigin;
};
export type DeviceProgramRegistry={
 version:typeof DEVICE_PROGRAM_REGISTRY_VERSION;
 activeGlobeProjectId:string|null;
 programs:DeviceProgram[];
};
type StoredRegistry={registry:DeviceProgramRegistry;revision:number;savedAt:string};

export class DeviceProgramRegistryConflict extends Error{
 constructor(){super('Another browser tab updated the device program bridge. Your local records remain unchanged; retry the refresh.');this.name='DeviceProgramRegistryConflict';}
}
/** A Program UUID is owned by one local Globe project for the life of this registry. */
export class DeviceProgramRegistryBoundaryError extends Error{
 constructor(){super('This Program already belongs to another local Globe project. Its identity was not moved between projects.');this.name='DeviceProgramRegistryBoundaryError';}
}

export const emptyDeviceProgramRegistry=():DeviceProgramRegistry=>({version:DEVICE_PROGRAM_REGISTRY_VERSION,activeGlobeProjectId:null,programs:[]});
const text=(value:unknown)=>typeof value==='string'?value.trim():'';
const method=(value:unknown)=>SAMPLE_TYPES.includes(String(value))?String(value):'rock_chip';
const state=(value:unknown,status:string)=>STATES.has(String(value))?String(value):(status==='cancelled'?'cancelled':status==='closed'?'completed':'planned');
const statusFor=(value:string)=>value==='cancelled'?'cancelled':value==='completed'?'closed':'active';
const createdAt=(value:unknown)=>typeof value==='string'&&Number.isFinite(Date.parse(value))?value:new Date().toISOString();

function normaliseProgram(value:any,globeProjectId:string|null,origin:DeviceProgramOrigin):DeviceProgram|null{
 const recordId=text(value?.recordId||value?.id),name=text(value?.name),legacyStatus=text(value?.status)||statusFor(state(value?.state,text(value?.status)));
 if(!UUID.test(recordId)||!name||name.length>160)return null;
 return {recordId,globeProjectId,name,method:method(value?.method),type:text(value?.type)||'sampling',state:state(value?.state,legacyStatus),status:legacyStatus,createdAt:createdAt(value?.createdAt),origin};
}

function normaliseRegistry(value:any):DeviceProgramRegistry{
 if(!value)return emptyDeviceProgramRegistry();
 if(value.version!==DEVICE_PROGRAM_REGISTRY_VERSION||!Array.isArray(value.programs))throw new Error('The device program bridge registry is not readable. Globe and Operations development data were not replaced.');
 const seen=new Set<string>(),programs:DeviceProgram[]=[];
 for(const item of value.programs){
  const origin:DeviceProgramOrigin=item?.origin==='development'?'development':'globe';
  const program=normaliseProgram(item,text(item?.globeProjectId)||null,origin);
  if(!program)continue;
  if(seen.has(program.recordId))throw new Error('The device program bridge has duplicate program identities. Globe and Operations development data were not replaced.');
  seen.add(program.recordId);programs.push(program);
 }
 return {version:DEVICE_PROGRAM_REGISTRY_VERSION,activeGlobeProjectId:text(value.activeGlobeProjectId)||null,programs};
}

const equal=(left:unknown,right:unknown)=>JSON.stringify(left)===JSON.stringify(right);

/**
 * Returns the metadata that belongs to exactly one Globe project. The
 * registry may remember multiple local projects, but callers must never use
 * that as a cross-project selector source.
 */
export function deviceProgramsForGlobeProject(registry:DeviceProgramRegistry,globeProjectId:string|null|undefined){
 const current=normaliseRegistry(registry),projectId=text(globeProjectId);
 return projectId?current.programs.filter(program=>program.globeProjectId===projectId):[];
}

/** Register local Globe programs without importing any other Globe records. */
export function registerGlobePrograms(registry:DeviceProgramRegistry,globeProjectId:string,programs:any[]):DeviceProgramRegistry{
 const projectId=text(globeProjectId);if(!projectId)throw new Error('Choose a local Globe project before linking its programs.');
 const current=normaliseRegistry(registry),next=[...current.programs],index=new Map(next.map((program,i)=>[program.recordId,i]));
 for(const row of programs||[]){
  const program=normaliseProgram(row,projectId,row?.deviceProgramOrigin==='development'?'development':'globe');if(!program)continue;
  const existingIndex=index.get(program.recordId);
  if(existingIndex===undefined){index.set(program.recordId,next.length);next.push(program);continue;}
  const existing=next[existingIndex];
  if(existing.globeProjectId&&existing.globeProjectId!==projectId)throw new DeviceProgramRegistryBoundaryError();
  // A development-origin record is read-only from Globe. Globe has no
  // program editor today, and retaining the development values prevents a
  // stale browser tab from rolling an Operations-development edit backward.
  if(existing.origin==='development'){
   if(existing.globeProjectId!==projectId)next[existingIndex]={...existing,globeProjectId:projectId};
   continue;
  }
  next[existingIndex]={...program,origin:'globe',globeProjectId:projectId,createdAt:existing.createdAt||program.createdAt};
 }
 return {version:DEVICE_PROGRAM_REGISTRY_VERSION,activeGlobeProjectId:projectId,programs:next};
}

/**
 * Merge only one local PGlite/Globe project's public program fields into the
 * registry. `globeProjectId` is explicit: using the most recently active
 * Globe project here would relabel a stale PGlite record after a project
 * switch.
 */
export function mirrorDevelopmentPrograms(registry:DeviceProgramRegistry,globeProjectId:string,programs:any[]):DeviceProgramRegistry{
 const projectId=text(globeProjectId);if(!projectId)throw new Error('Choose a local Globe project before linking its programs.');
 const current=normaliseRegistry(registry),next=[...current.programs],index=new Map(next.map((program,i)=>[program.recordId,i]));
 for(const row of programs||[]){
  const program=normaliseProgram(row,projectId,'development');if(!program)continue;
  const existingIndex=index.get(program.recordId);
  if(existingIndex===undefined){index.set(program.recordId,next.length);next.push(program);continue;}
  const existing=next[existingIndex];
  if(existing.globeProjectId&&existing.globeProjectId!==projectId)throw new DeviceProgramRegistryBoundaryError();
  next[existingIndex]={...program,origin:existing.origin,globeProjectId:projectId,createdAt:existing.createdAt||program.createdAt,status:existing.status||program.status};
 }
 return {version:DEVICE_PROGRAM_REGISTRY_VERSION,activeGlobeProjectId:current.activeGlobeProjectId,programs:next};
}

/** Add or update selector rows only; never deletes Globe records or samples. */
export function applyDeviceProgramsToGlobeProject(project:any,registry:DeviceProgramRegistry){
 const incoming=deviceProgramsForGlobeProject(registry,text(project?.id)||null),existing:any[]=Array.isArray(project?.programs)?project.programs:[],index=new Map<string,number>(existing.map((program:any,i:number):[string,number]=>[String(program.recordId),i])),programs=[...existing];
 for(const record of incoming){
  const local={recordId:record.recordId,name:record.name,method:record.method,type:record.type,state:record.state,status:record.status,createdAt:record.createdAt,deviceProgramOrigin:record.origin};
  const existingIndex=index.get(record.recordId);
  if(typeof existingIndex!=='number'){index.set(record.recordId,programs.length);programs.push(local);continue;}
  const prior=programs[existingIndex];
  programs[existingIndex]={...prior,...local,createdAt:prior.createdAt||local.createdAt,status:prior.status||local.status};
 }
 if(equal(existing,programs))return {project,changed:false};
 return {project:{...project,programs},changed:true};
}

function openDatabase():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  if(!globalThis.indexedDB){reject(new Error('This browser cannot open the device program bridge. Globe and Operations development records remain separate on this device.'));return;}
  const request=indexedDB.open(DATABASE,1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);};
  request.onerror=()=>reject(request.error);
  request.onblocked=()=>reject(new Error('Close another MineralX tab that is updating the device program bridge.'));
  request.onsuccess=()=>resolve(request.result);
 });
}

export async function readDeviceProgramRegistry():Promise<{registry:DeviceProgramRegistry;revision:number}>{
 const db=await openDatabase();return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readonly'),request=tx.objectStore(STORE).get(KEY);
  tx.oncomplete=()=>{try{const row=request.result as StoredRegistry|undefined;db.close();resolve({registry:normaliseRegistry(row?.registry),revision:row?.revision||0});}catch(error){db.close();reject(error);}};
  tx.onerror=tx.onabort=()=>{db.close();reject(tx.error||new Error('The device program bridge could not be read. Globe and Operations development records were not replaced.'));};
 });
}

async function writeDeviceProgramRegistry(registry:DeviceProgramRegistry,expectedRevision:number):Promise<number>{
 const db=await openDatabase();return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readwrite'),records=tx.objectStore(STORE),read=records.get(KEY);let conflict=false;
  read.onsuccess=()=>{const actual=(read.result as StoredRegistry|undefined)?.revision||0;if(actual!==expectedRevision){conflict=true;tx.abort();return;}records.put({registry,revision:actual+1,savedAt:new Date().toISOString()} satisfies StoredRegistry,KEY);};
  tx.oncomplete=()=>{db.close();resolve(expectedRevision+1);};
  tx.onerror=tx.onabort=()=>{db.close();reject(conflict?new DeviceProgramRegistryConflict():tx.error||new Error('The device program bridge could not be saved. Globe and Operations development records remain unchanged.'));};
 });
}

function announce(){
 if(typeof window!=='undefined')window.dispatchEvent(new Event(EVENT));
 if(typeof BroadcastChannel!=='undefined'){const channel=new BroadcastChannel(CHANNEL);channel.postMessage({changed:true});channel.close();}
}

async function updateDeviceProgramRegistry(update:(current:DeviceProgramRegistry)=>DeviceProgramRegistry):Promise<DeviceProgramRegistry>{
 for(let attempt=0;attempt<3;attempt++){
  const {registry,revision}=await readDeviceProgramRegistry(),next=normaliseRegistry(update(registry));
  if(equal(registry,next))return registry;
  try{await writeDeviceProgramRegistry(next,revision);announce();return next;}catch(error){if(!(error instanceof DeviceProgramRegistryConflict)||attempt===2)throw error;}
 }
 throw new DeviceProgramRegistryConflict();
}

/** `isCurrent` prevents a stale Globe effect from retaking the active project after a switch. */
export const publishGlobePrograms=(project:any,isCurrent:()=>boolean=()=>true)=>updateDeviceProgramRegistry(current=>isCurrent()?registerGlobePrograms(current,project?.id,project?.programs||[]):current);
export const publishDevelopmentPrograms=(programs:any[],globeProjectId:string)=>updateDeviceProgramRegistry(current=>mirrorDevelopmentPrograms(current,globeProjectId,programs));

/** Refresh an open Globe tab after Operations development changes this device registry. */
export function subscribeDeviceProgramRegistry(listener:()=>void){
 if(typeof window==='undefined')return ()=>{};
 const local=()=>listener();window.addEventListener(EVENT,local);
 let channel:BroadcastChannel|undefined;
 if(typeof BroadcastChannel!=='undefined'){channel=new BroadcastChannel(CHANNEL);channel.onmessage=()=>listener();}
 return ()=>{window.removeEventListener(EVENT,local);channel?.close();};
}
