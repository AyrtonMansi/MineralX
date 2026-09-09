import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {DevelopmentEngine} from '../../lib/ops/development-engine';
import {requestDevelopmentWithDeviceProgramBridge,type DeviceProgramBridgePort} from '../../lib/ops/development';
import {DEVELOPMENT_ACTOR,DEVELOPMENT_FACILITY,DEVELOPMENT_PROJECT} from '../../lib/ops/development-policy';
import {applyDeviceProgramsToGlobeProject,emptyDeviceProgramRegistry,mirrorDevelopmentPrograms,registerGlobePrograms,type DeviceProgram} from '../../lib/ops/device-program-bridge';

const localProgram=(recordId=crypto.randomUUID()):DeviceProgram=>({recordId,globeProjectId:'globe-project',name:'Device soil program',method:'soil',type:'sampling',state:'planned',status:'active',createdAt:'2026-09-10T00:00:00.000Z',origin:'globe'});

test('the device registry carries only program metadata and mirrors into its bound Globe project',()=>{
 const local=localProgram(),registry=registerGlobePrograms(emptyDeviceProgramRegistry(),'globe-project',[{...local,meetingId:'private-meeting',staffUserId:'staff-user'}]);
 assert.deepEqual(Object.keys(registry.programs[0]).sort(),['createdAt','globeProjectId','method','name','origin','recordId','state','status','type']);
 const remoteId=crypto.randomUUID(),mirrored=mirrorDevelopmentPrograms(registry,[{recordId:remoteId,name:'Development drilling',method:'rc',type:'drilling',state:'ready'}]);
 const source={id:'globe-project',programs:[{...local,status:'legacy-active'}],samples:[{recordId:'sample-1',programId:local.recordId}],meetings:[{id:'local-note'}]};
 const applied=applyDeviceProgramsToGlobeProject(source,mirrored);
 assert.equal(applied.changed,true);assert.equal(applied.project.programs.length,2);assert.equal(applied.project.programs.find((program:any)=>program.recordId===remoteId)?.name,'Development drilling');
 assert.deepEqual(applied.project.samples,source.samples);assert.deepEqual(applied.project.meetings,source.meetings);
 assert.equal(applyDeviceProgramsToGlobeProject({...source,id:'another-globe-project'},mirrored).project.programs.length,1);
});

test('a Globe program is imported only into the browser-local Development PGlite project without a network call',async()=>{
 const db=new PGlite(),engine=new DevelopmentEngine(db),program=localProgram(),originalFetch=globalThis.fetch,calls:string[]=[];
 try{
  await engine.initialise();
  (globalThis as any).fetch=(input:unknown)=>{calls.push(String(input));throw new Error('The device bridge must not use fetch.');};
  assert.deepEqual(await engine.importDevicePrograms([program]),{created:1});
  assert.deepEqual(await engine.importDevicePrograms([program]),{created:0});
  assert.equal(calls.length,0);
  const project=await engine.geology(DEVELOPMENT_PROJECT),workflow=await engine.request(`workflow?scope=${DEVELOPMENT_PROJECT}`),facility=await engine.request(`workflow?scope=${DEVELOPMENT_FACILITY}`);
  assert.equal(project.project.programs.find((row:any)=>row.recordId===program.recordId)?.name,program.name);
  assert.equal(workflow.programs.find((row:any)=>row.id===program.recordId)?.data.method,'soil');
  assert.equal(facility.programs.some((row:any)=>row.id===program.recordId),false);
  assert.deepEqual((await db.query<{scope_id:string}>('select scope_id from mx_ops.geo_programs where id=$1',[program.recordId])).rows,[{scope_id:DEVELOPMENT_PROJECT}]);
  assert.deepEqual((await db.query<{email:string}>('select email from auth.users order by email')).rows,[{email:'browser@development.invalid'}]);
  assert.equal((await db.query<{meeting_schema:string|null}>("select to_regnamespace('mx_meetings')::text as meeting_schema")).rows[0].meeting_schema,null);
 }finally{(globalThis as any).fetch=originalFetch;await db.close();}
});

test('unavailable or corrupt bridge storage fails open for local development refreshes and commands',async()=>{
 const db=new PGlite(),engine=new DevelopmentEngine(db),originalFetch=globalThis.fetch,calls:string[]=[];
 const unavailable:DeviceProgramBridgePort={
  read:async()=>{throw new Error('IndexedDB is unavailable');},
  publish:async()=>undefined,
 };
 const corruptWrite:DeviceProgramBridgePort={
  read:async()=>({registry:emptyDeviceProgramRegistry(),revision:0}),
  publish:async()=>{throw new Error('The device registry is corrupt');},
 };
 try{
  await engine.initialise();
  (globalThis as any).fetch=(input:unknown)=>{calls.push(String(input));throw new Error('The device bridge must not use fetch.');};
  const context=await requestDevelopmentWithDeviceProgramBridge(engine,'context',undefined,unavailable);
  assert.equal(context.capabilities.storage,'browser-local-development');
  const unavailableProgram=crypto.randomUUID(),unavailableResult=await requestDevelopmentWithDeviceProgramBridge(engine,'command',{
   scopeId:DEVELOPMENT_PROJECT,requestId:crypto.randomUUID(),id:unavailableProgram,expectedVersion:0,action:'program.save',expectedActorId:DEVELOPMENT_ACTOR,
   payload:{name:'Available despite registry outage',type:'sampling',method:'soil',state:'planned'},
  },unavailable);
  assert.equal(unavailableResult.developmentOnly,true);
  const corruptProgram=crypto.randomUUID(),corruptResult=await requestDevelopmentWithDeviceProgramBridge(engine,'command',{
   scopeId:DEVELOPMENT_PROJECT,requestId:crypto.randomUUID(),id:corruptProgram,expectedVersion:0,action:'program.save',expectedActorId:DEVELOPMENT_ACTOR,
   payload:{name:'Available despite corrupt mirror',type:'sampling',method:'rock_chip',state:'planned'},
  },corruptWrite);
  assert.equal(corruptResult.developmentOnly,true);
  const workflow=await requestDevelopmentWithDeviceProgramBridge(engine,`workflow?scope=${DEVELOPMENT_PROJECT}`,undefined,corruptWrite);
  assert.ok(workflow.programs.some((row:any)=>row.id===unavailableProgram));
  assert.ok(workflow.programs.some((row:any)=>row.id===corruptProgram));
  assert.equal(calls.length,0);
 }finally{(globalThis as any).fetch=originalFetch;await db.close();}
});
