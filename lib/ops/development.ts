'use client';
import {PGlite} from '@electric-sql/pglite';
import {DevelopmentEngine} from './development-engine';
import {OpsError} from './contracts';
let opened:Promise<DevelopmentEngine>|undefined;
let queue:Promise<unknown>=Promise.resolve();
/** One tab owns the local PostgreSQL files. Never run two independent writers. */
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
    const asset=async(name:string)=>{const r=await fetch('/ops-development-assets/'+name,{credentials:'omit',cache:'force-cache'});if(!r.ok)throw new Error('The local database assets did not load. Reload while connected.');return r;};
    const [pgliteWasmModule,initdbWasmModule,fsBundle]=await Promise.all([
      asset('pglite.wasm').then(async r=>WebAssembly.compile(await r.arrayBuffer())),
      asset('initdb.wasm').then(async r=>WebAssembly.compile(await r.arrayBuffer())),
      asset('pglite.data').then(r=>r.blob())]);
    db=new PGlite({dataDir:'idb://mineralx-ops-development-v1',pgliteWasmModule,initdbWasmModule,fsBundle,relaxedDurability:false});
    await db.waitReady;const engine=new DevelopmentEngine(db);await engine.initialise();return engine;
  }catch(e){await db?.close().catch(()=>{});release();throw e;}
}
export async function developmentTask<T>(fn:(engine:DevelopmentEngine)=>Promise<T>):Promise<T>{
  const task=queue.catch(()=>{}).then(async()=>{opened??=open().catch(e=>{opened=undefined;throw e;});return fn(await opened);});
  queue=task;return task;
}
export const developmentApi=(path:string,data?:unknown)=>developmentTask(engine=>engine.request(path,data));
export const developmentUpload=(...args:Parameters<DevelopmentEngine['upload']>)=>developmentTask(engine=>engine.upload(...args));
export const developmentSource=(scope:string,id:string)=>developmentTask(engine=>engine.source(scope,id));
export const developmentExport=(scope:string,kind:string)=>developmentTask(engine=>engine.export(scope,kind));
export const developmentBackup=()=>developmentTask(engine=>engine.db.dumpDataDir('gzip'));
