import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {DevelopmentEngine} from '../../lib/ops/development-engine';
import {DurableDevelopment} from '../../lib/ops/development-storage';
import {DEVELOPMENT_ACTOR,DEVELOPMENT_FACILITY} from '../../lib/ops/development-policy';
const campaign=()=>({scopeId:DEVELOPMENT_FACILITY,requestId:crypto.randomUUID(),id:crypto.randomUUID(),expectedVersion:0,expectedActorId:DEVELOPMENT_ACTOR,action:'campaign.create',payload:{name:'Durable development campaign'}});

test('a failed snapshot preserves the previous store and exact retry produces one durable record',async()=>{
 const db=new PGlite(),engine=new DevelopmentEngine(db);await engine.initialise();
 let stored:Blob|undefined,revision=0,failing=false;
 const durable=new DurableDevelopment(engine,0,async(data,expected)=>{assert.equal(expected,revision);if(failing)throw new DOMException('Storage full','QuotaExceededError');stored=data;return ++revision;});
 try{
  await durable.perform(async()=>null,true);const baseline=stored;
  const command=campaign();failing=true;
  await assert.rejects(durable.perform(e=>e.request('command',command),true),e=>(e as any).code==='unavailable');assert.equal(stored,baseline);
  let read=false;await assert.rejects(durable.perform(async()=>{read=true;}));assert.equal(read,false,'unpersisted work must not be presented as an authoritative register');
  const recovery=await durable.snapshot();assert.ok(recovery.size>1000,'recovery still works while local storage is full');
  failing=false;const retry=await durable.perform(e=>e.request('command',command),true);assert.equal(retry.replayed,true);
  const restored=new PGlite({loadDataDir:stored});try{await restored.waitReady;const copy=new DevelopmentEngine(restored);assert.equal((await copy.request(`register?scope=${DEVELOPMENT_FACILITY}&kind=campaigns`)).rows.length,1);}finally{await restored.close();}
 }finally{await db.close();}
});

test('successful SQL execution cannot acknowledge before the durable snapshot completes',async()=>{
 const db=new PGlite(),engine=new DevelopmentEngine(db);await engine.initialise();
 let release!:()=>void,started!:()=>void,settled=false;
 const gate=new Promise<void>(r=>{release=r;}),saving=new Promise<void>(r=>{started=r;});
 const durable=new DurableDevelopment(engine,0,async()=>{started();await gate;return 1;});
 try{const result=durable.perform(e=>e.request('command',campaign()),true).then(()=>{settled=true;});await saving;assert.equal(settled,false);release();await result;assert.equal(settled,true);}finally{release();await db.close();}
});
