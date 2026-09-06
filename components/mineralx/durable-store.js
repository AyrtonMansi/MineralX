import { migrateV2,migrateV3,migrateV4,migrateV5,migrateV6,migrateV7 } from './project-store.js';
import { emptyStore,upgradeStore } from './field-workflows.js';
const DATABASE='mineralx-geology';
const STORE='records';
const migrations={2:migrateV2,3:migrateV3,4:migrateV4,5:migrateV5,6:migrateV6,7:migrateV7};
export class RevisionConflict extends Error {
  constructor(){super('Another tab saved a newer revision. Your unsaved work is still open. Export it before loading the latest workspace.');this.name='RevisionConflict';}
}
function openDatabase(){
  return new Promise((resolve,reject)=>{
    if(!globalThis.indexedDB){reject(new Error('This browser does not allow local database storage.'));return;}
    const request=indexedDB.open(DATABASE,1);
    request.onupgradeneeded=()=>request.result.createObjectStore(STORE);
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(new Error('Close other MineralX tabs to upgrade local storage.'));
    request.onsuccess=()=>resolve(request.result);
  });
}
export async function readWorkspace(){
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readonly'), request=tx.objectStore(STORE).get('workspace');
    tx.oncomplete=()=>{db.close();resolve(request.result||null);};
    tx.onerror=()=>{db.close();reject(tx.error);};
    tx.onabort=()=>{db.close();reject(tx.error||new Error('Local database read was interrupted.'));};
  });
}
// The read, revision comparison and write share one serializable IDB transaction.
export async function writeWorkspace(data,expectedRevision,{preservePrevious=false}={}){
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite'), records=tx.objectStore(STORE), read=records.get('workspace');
    let failure,revision;
    read.onsuccess=()=>{
      const previous=read.result,actual=previous?.revision||0;
      if(actual!==expectedRevision){failure=new RevisionConflict();tx.abort();return;}
      revision=actual+1;
      if(preservePrevious&&previous)records.put(previous,`restore-backup-${revision}`);
      records.put({data,revision,savedAt:new Date().toISOString()},'workspace');
    };
    tx.oncomplete=()=>{db.close();resolve(revision);};
    tx.onabort=()=>{db.close();reject(failure||tx.error||new Error('The local database write was interrupted.'));};
    tx.onerror=()=>{}; // abort is the single settlement boundary
  });
}
export function recoverLegacy(local){
  for(let version=8;version>=2;version--){
    const key=`mx-store-v${version}`, raw=local.getItem(key);
    if(raw==null)continue;
    // Never move, remove, or replace the original key; corrupt bytes remain recoverable.
    try{
      let data=JSON.parse(raw);
      if(data.version!==version||!Array.isArray(data.projects))throw new Error('The workspace shape does not match its version.');
      while(data.version<8)data=migrations[data.version](data);
      return {data:upgradeStore(data),legacy:{key,raw}};
    }catch(error){return {data:emptyStore(),blocked:true,legacy:{key,raw},error:`Saved data could not be read: ${error.message}`};}
  }
  return {data:emptyStore(),legacy:null};
}
export async function loadWorkspace(local=globalThis.localStorage){
  const current=await readWorkspace();
  if(current)return {...current,data:upgradeStore(current.data)};
  const recovered=recoverLegacy(local);
  if(recovered.blocked)return {...recovered,revision:0};
  // Retain original bytes in both their old key and the first database snapshot.
  const data=recovered.legacy?{...recovered.data,legacyRecovery:recovered.legacy}:recovered.data;
  try{const revision=await writeWorkspace(data,0);return {data,revision};}
  catch(error){if(error instanceof RevisionConflict){const saved=await readWorkspace();return {...saved,data:upgradeStore(saved.data)};}throw error;}
}
