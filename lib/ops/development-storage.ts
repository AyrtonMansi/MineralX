import type {DevelopmentEngine} from './development-engine';
import {OpsError} from './contracts';
export type DevelopmentSnapshot={version:1;revision:number;data:Blob};
const unavailable=()=>new OpsError('unavailable','The development save was not confirmed on this device. Keep this entry open and retry the original save; no company records were affected.');
let store:Promise<IDBDatabase>|undefined;
function database(){
 return store??=new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open('mineralx-ops-development-snapshots-v1',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('snapshots');
  request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();store=undefined;};resolve(db);};
  request.onerror=()=>{store=undefined;reject(unavailable());};
  request.onblocked=()=>{store=undefined;reject(new OpsError('unavailable','Close older development tabs before opening this local workspace.'));};
 });
}
export async function readDevelopmentSnapshot():Promise<DevelopmentSnapshot|undefined>{
 const db=await database();return new Promise((resolve,reject)=>{
  try{const tx=db.transaction('snapshots','readonly'),request=tx.objectStore('snapshots').get('current');
   tx.oncomplete=()=>{const row=request.result as DevelopmentSnapshot|undefined;if(row&&(row.version!==1||!Number.isSafeInteger(row.revision)||row.revision<1||!(row.data instanceof Blob))){reject(new OpsError('unavailable','The local development snapshot is not readable. It was not reset or replaced.'));return;}resolve(row);};
   tx.onabort=tx.onerror=()=>reject(unavailable());
  }catch{reject(unavailable());}
 });
}
export async function writeDevelopmentSnapshot(data:Blob,expectedRevision:number):Promise<number>{
 const db=await database();return new Promise((resolve,reject)=>{
  let conflict=false;
  try{const tx=db.transaction('snapshots','readwrite'),objects=tx.objectStore('snapshots'),request=objects.get('current');
   request.onsuccess=()=>{try{const current=request.result as DevelopmentSnapshot|undefined;if((current?.revision||0)!==expectedRevision){conflict=true;tx.abort();return;}objects.put({version:1,revision:expectedRevision+1,data} satisfies DevelopmentSnapshot,'current');}catch{tx.abort();}};
   tx.oncomplete=()=>resolve(expectedRevision+1);
   tx.onabort=tx.onerror=()=>reject(conflict?new OpsError('conflict','The local snapshot changed in another session. Keep this entry and its recovery copy; reload before editing.'):unavailable());
  }catch{reject(unavailable());}
 });
}
/** Small temporary workspaces use atomic full snapshots rather than background filesystem flushing. */
export class DurableDevelopment {
 private dirty=false;
 constructor(readonly engine:DevelopmentEngine,private revision:number,private save:(data:Blob,expected:number)=>Promise<number>){}
 async snapshot(){await this.engine.db.exec('CHECKPOINT');return this.engine.db.dumpDataDir('gzip');}
 async flush(){
  if(!this.dirty)return;
  try{const data=await this.snapshot();this.revision=await this.save(data,this.revision);this.dirty=false;}
  catch(error){if(error instanceof OpsError)throw error;throw unavailable();}
 }
 async perform<T>(fn:(engine:DevelopmentEngine)=>Promise<T>,write=false):Promise<T>{
  // A failed durable write is settled before any subsequent read or mutation.
  await this.flush();if(write)this.dirty=true;
  const result=await fn(this.engine);
  if(write)await this.flush();
  return result;
 }
}
