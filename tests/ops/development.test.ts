import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {DevelopmentEngine} from '../../lib/ops/development-engine';
import {developmentPage,DEVELOPMENT_ACTOR as actor,DEVELOPMENT_FACILITY as facility,DEVELOPMENT_PROJECT as project} from '../../lib/ops/development-policy';
let db:PGlite,engine:DevelopmentEngine;
const cmd=(action:string,payload:Record<string,unknown>,scopeId=facility,id=crypto.randomUUID(),expectedVersion=0)=>({scopeId,requestId:crypto.randomUUID(),id,expectedVersion,action,payload,expectedActorId:actor});
before(async()=>{db=new PGlite();engine=new DevelopmentEngine(db);await engine.initialise();});after(async()=>db.close());
test('temporary mode applies to suite UI only, never identity or backend endpoints',()=>{
 for(const path of ['/ops','/ops/plant','/ops/geology','/ops/reports','/ops/admin'])assert.equal(developmentPage(path),false);
 for(const path of ['/ops','/ops/plant','/ops/geology','/ops/reports','/ops/admin'])assert.equal(developmentPage(path,'development'),true);
 for(const path of ['/','/gic','/gic/login','/api/ops/context','/api/ops/command','/ops/login','/ops/auth/continue','/ops/account','/ops/sw.js','/opsspoof'])assert.equal(developmentPage(path),false,path);
 assert.equal(developmentPage('/ops','staff'),false);assert.equal(developmentPage('/ops',undefined,false),false);
});
test('blank development context never claims a staff login, MFA or cloud sync',async()=>{
 const c=await engine.context();assert.equal(c.userId,actor);assert.equal(c.aal,'development');assert.equal(c.scopes.length,2);assert.equal(c.capabilities.storage,'browser-local-development');assert.equal(c.capabilities.sharedGeology,false);assert.ok(c.organisations.every((o:any)=>!o.admin));
 for(const kind of ['runs','lots','production','custody'])assert.deepEqual((await engine.request(`register?scope=${facility}&kind=${kind}`)).rows,[]);
});
test('local processing uses the actual SQL transaction rules and preserves idempotency',async()=>{
 const c=cmd('run.save',{started_at:'2026-09-01T08:00:00+10:00',ended_at:'2026-09-01T11:00:00+10:00',notes:'Development-only run',feeds:[]});
 const first=await engine.request('command',c);assert.equal(first.developmentOnly,true);assert.equal(first.record.status,'draft');
 const retry=await engine.request('command',c);assert.equal(retry.id,first.id);assert.equal(retry.replayed,true);
 const list=await engine.request(`register?scope=${facility}&kind=runs`);assert.equal(list.rows.length,1);assert.equal(list.rows[0].notes,c.payload.notes);
 await assert.rejects(engine.request('command',{...c,requestId:crypto.randomUUID(),payload:{...c.payload,notes:'stale'}}),e=>(e as any).code==='conflict');
});
test('device Processing selects only open canonical processing programs',async()=>{
 const open=cmd('campaign.create',{name:'DEVICE-OPEN-PROCESSING'}),closed=cmd('campaign.create',{name:'DEVICE-CLOSED-PROCESSING'}),other=cmd('program.save',{name:'DEVICE-PLANT-IMPROVEMENT',type:'plant',state:'planned'});
 await engine.request('command',open);await engine.request('command',closed);await engine.request('command',{...closed,requestId:crypto.randomUUID(),expectedVersion:1,action:'program.save',payload:{name:'DEVICE-CLOSED-PROCESSING',type:'processing',state:'cancelled',reason:'No open work'}});await engine.request('command',other);
 const choices=await engine.request(`processing-programs?scope=${facility}`);
 assert.ok(choices.programs.some((program:any)=>program.id===open.id));
 assert.ok(!choices.programs.some((program:any)=>program.id===closed.id));
 assert.ok(!choices.programs.some((program:any)=>program.id===other.id));
});
test('source files are saved and read byte-exactly from the local database',async()=>{
 const file=new File(['local source only'], 'source.txt',{type:'text/plain'}),saved=await engine.upload(facility,'gold',file);
 assert.equal(saved.status,'verified');const recovered=await engine.source(facility,saved.id);assert.equal(new TextDecoder().decode(recovered.bytes),'local source only');
 await assert.rejects(engine.source(project,saved.id));
});
test('field capture reuses project invariants, then reloads the recorded identity',async()=>{
 const c=cmd('geo.sample.capture',{id:'DEV-SAMPLE-1',sampleType:'rock_chip',lat:-18.5,lng:143.3,date:'2026-09-01',notes:'Development observation'},project);
 const saved=await engine.request('command',c);assert.equal(saved.developmentOnly,true);
 const p=await engine.geology(project);assert.equal(p.project.samples.length,1);assert.equal(p.project.samples[0].id,'DEV-SAMPLE-1');
 assert.equal(p.project.samples[0].recordId,c.id);assert.equal(p.versions['samples:'+c.id],1);
 await engine.request('command',c);assert.equal((await engine.geology(project)).project.samples.length,1);
});
test('privileged approvals and account management remain blocked without named verification',async()=>{
 for(const action of ['gold.review','gold.recognize','gold.transfer','period.close'])await assert.rejects(engine.request('command',cmd(action,{})),e=>(e as any).code==='mfa_required');
 for(const path of ['admin','claim','bootstrap'])await assert.rejects(engine.request(path,{}),e=>(e as any).code==='forbidden');
 await assert.rejects(engine.request('command',cmd('geo.assay.release',{},project)),e=>(e as any).code==='mfa_required');
});
test('a real account or unknown production scope cannot enter the development command path',async()=>{
 await assert.rejects(engine.request('command',{...cmd('run.save',{}),expectedActorId:crypto.randomUUID()}),e=>(e as any).code==='forbidden');
 await assert.rejects(engine.request(`register?scope=${crypto.randomUUID()}&kind=runs`),e=>(e as any).code==='forbidden');
 await assert.rejects(engine.request('unrecognised',{}));
});
test('development backup restores local data and exact source bytes without production credentials',async()=>{
 const snapshot=await db.dumpDataDir('gzip'),copy=new PGlite({loadDataDir:snapshot});
 try{await copy.waitReady;const recovered=new DevelopmentEngine(copy);await recovered.initialise();
  assert.equal((await recovered.request(`register?scope=${facility}&kind=runs`)).rows.length,1);
  assert.equal((await recovered.geology(project)).project.samples[0].id,'DEV-SAMPLE-1');
  const files=await recovered.request(`files?scope=${facility}`);assert.equal(new TextDecoder().decode((await recovered.source(facility,files[0].id)).bytes),'local source only');
  assert.match(await (await recovered.export(facility,'runs')).text(),/development_only/);
 }finally{await copy.close();}
});
test('program created through the planning command is the exact field-program record',async()=>{
 const c=cmd('program.save',{name:'CANONICAL-DRILL',type:'drilling',method:'rc',state:'planned'},project);
 await engine.request('command',c);
 const shared=await engine.geology(project),planning=await engine.request(`workflow?scope=${project}`);
 const g=shared.project.programs.find((p:any)=>p.recordId===c.id);
 assert.equal(g.name,'CANONICAL-DRILL');assert.equal(planning.programs.find((p:any)=>p.id===c.id).data.name,g.name);
 await engine.request('command',{...c,requestId:crypto.randomUUID(),expectedVersion:1,payload:{...c.payload,name:'CANONICAL-UPDATED'}});
 assert.equal((await engine.geology(project)).project.programs.find((p:any)=>p.recordId===c.id).name,'CANONICAL-UPDATED');
 assert.equal((await engine.request(`workflow?scope=${project}`)).programs.filter((p:any)=>p.id===c.id).length,1);
});
