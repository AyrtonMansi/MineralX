'use client';
import {PGlite} from '@electric-sql/pglite';
import {DevelopmentEngine} from './development-engine';
import {DurableDevelopment,readDevelopmentSnapshot,writeDevelopmentSnapshot} from './development-storage';
import {OpsError} from './contracts';
let opened:Promise<DurableDevelopment>|undefined;
let queue:Promise<unknown>=Promise.resolve();
/** A single document owns the database and its atomic IndexedDB snapshots. */
async function open(){
 if(!navigator.locks)throw new OpsError('unavailable','This browser cannot safely lock the development workspace. Use a current browser. Existing data is unchanged.');
 let release=()=>{};
 await new Promise<void>((resolve,reject)=>{
  navigator.locks.request('mineralx-development-database-v1',{ifAvailable:true},async lock=>{
   if(!lock){reject(new OpsError('unavailable','The development workspace is open in another tab. Close that tab, then reload here.'));return;}
   await new Promise<void>(unlock=>{release=unlock;resolve();});
  }).catch(reject);
 });
 let db:PGlite|undefined;
 try{
  const saved=await readDevelopmentSnapshot();
  const asset=async(name:string)=>{const r=await fetch('/ops-development-assets/'+name,{credentials:'omit',cache:'force-cache'});if(!r.ok)throw new Error('The local database assets did not load. Reload while connected.');return r;};
  const [pgliteWasmModule,initdbWasmModule,fsBundle]=await Promise.all([
   asset('pglite.wasm').then(async r=>WebAssembly.compile(await r.arrayBuffer())),
   asset('initdb.wasm').then(async r=>WebAssembly.compile(await r.arrayBuffer())),
   asset('pglite.data').then(r=>r.blob())]);
  // Memory execution is checkpointed to a complete atomic snapshot before any save acknowledgement.
  // An invalid persisted snapshot must fail visibly, never fall back to a new empty database.
  db=new PGlite({pgliteWasmModule,initdbWasmModule,fsBundle,loadDataDir:saved?.data,relaxedDurability:false});
  await db.waitReady;const engine=new DevelopmentEngine(db);
  const durable=new DurableDevelopment(engine,saved?.revision||0,writeDevelopmentSnapshot);
  await durable.perform(e=>e.initialise(),true);return durable;
 }catch(e){await db?.close().catch(()=>{});release();throw e;}
}
async function task<T>(fn:(database:DurableDevelopment)=>Promise<T>):Promise<T>{
 const pending=queue.catch(()=>{}).then(async()=>{opened??=open().catch(e=>{opened=undefined;throw e;});return fn(await opened);});
 queue=pending;return pending;
}
export const developmentApi=(path:string,data?:unknown)=>task(db=>db.perform(engine=>engine.request(path,data),data!==undefined));
export const developmentUpload=(...args:Parameters<DevelopmentEngine['upload']>)=>task(db=>db.perform(engine=>engine.upload(...args),true));
export const developmentSource=(scope:string,id:string)=>task(db=>db.perform(engine=>engine.source(scope,id)));
export const developmentExport=(scope:string,kind:string)=>task(db=>db.perform(engine=>engine.export(scope,kind)));
// Recovery remains available even when IndexedDB cannot accept another snapshot.
export const developmentBackup=()=>task(db=>db.snapshot());
