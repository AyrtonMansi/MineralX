import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setup,ids,command,asUser,evidence} from './helpers';
import type {PGlite} from '@electric-sql/pglite';
let db:PGlite;
const id=()=>crypto.randomUUID();
const personId=id(),programId=id(),task1=id(),task2=id(),tank=id(),generator=id(),array=id();
const call=(action:string,target:string,p:any,version=0,user=ids.operator,scope=ids.facility)=>command(db,user,action,target,p,version,scope);
const work=async(scope=ids.facility,user=ids.operator)=>(await asUser(db,user,'select public.mx_ops_workflow($1) as data',[scope]))[0].data;
before(async()=>{db=await setup();await db.exec(await readFile(new URL('../../supabase/migrations/20260909020000_operations_workflow.sql',import.meta.url),'utf8'));});
after(async()=>{await db.close();});
test('workflow read is scoped, includes registry, and rejects anonymous/unassigned users',async()=>{
 const r=await work();assert.equal(r.schemaVersion,7);assert.ok(r.types.find((t:any)=>t.key==='drilling'));assert.equal(r.complete,true);
 await assert.rejects(work(ids.facility,ids.outsider),/ACCESS_DENIED/);
 assert.equal((await asUser(db,ids.outsider,'select * from mx_ops.plant_assets')).length,0);
 await assert.rejects(asUser(db,ids.operator,"insert into mx_ops.planning_people(id,scope_id,name,created_by) values($1,$2,'Illegal',$3)",[id(),ids.facility,ids.operator]),/permission denied/);
});
test('planning personnel do not create accounts or roles; linked identities must be assigned',async()=>{
 await call('person.save',personId,{name:'Test crew lead',role:'Field and plant',active:true,user_id:ids.operator});
 assert.equal((await work()).people[0].name,'Test crew lead');
 await assert.rejects(call('person.save',id(),{name:'Outside user',user_id:ids.outsider}),/active workspace account/);
 assert.equal((await db.query<{n:number}>('select count(*)::int n from auth.users')).rows[0].n,8);
});
test('a program is one canonical record with metadata, versions, no duplicate campaign identity',async()=>{
 const r=await call('program.save',programId,{name:'Synthetic solar installation',type:'energy',state:'planned',ownerId:personId,plannedStart:'2026-09-01',plannedEnd:'2026-09-30'});
 assert.equal(r.id,programId);assert.equal(r.record.data.recordId,programId);
 assert.equal((await work()).programs[0].id,programId);
 await assert.rejects(call('program.save',programId,{name:'Stale',type:'general'}),/CONFLICT/);
 await assert.rejects(call('program.save',id(),{name:'Bad dates',type:'general',plannedStart:'2026-09-30',plannedEnd:'2026-09-01'}),/end must not/);
 const campaign=id();await call('campaign.create',campaign,{name:'Legacy entry compatibility'});
 assert.equal((await db.query<{id:string}>('select id from mx_ops.geo_programs where id=$1',[campaign])).rows[0].id,campaign);
 await call('program.save',campaign,{name:'Same program renamed',type:'processing',state:'planned'},1);
 assert.equal((await db.query<{name:string}>('select name from mx_ops.campaigns where id=$1',[campaign])).rows[0].name,'Same program renamed');
});
test('task dependencies prevent premature work, reject cycles and gate program completion',async()=>{
 await call('task.save',task1,{title:'Service drilling rig',program_id:programId,responsible_id:personId});
 await call('task.save',task2,{title:'Begin drilling work',program_id:programId,responsible_id:personId,dependencies:[{id:task1,scopeId:ids.facility}]});
 await assert.rejects(call('task.status',task2,{status:'in_progress',outcome:'Start'},1),/predecessor/);
 await assert.rejects(call('task.save',task1,{title:'Creates a cycle',program_id:programId,dependencies:[{id:task2,scopeId:ids.facility}]},1),/cycle/);
 await assert.rejects(call('program.save',programId,{name:'Synthetic solar installation',type:'energy',state:'completed',ownerId:personId,reason:'Close'},1),/outstanding tasks/);
 await call('task.status',task1,{status:'resolved',outcome:'Service completed'},1);
 await call('task.status',task2,{status:'in_progress',outcome:'Rig ready'},1);
 await assert.rejects(call('task.status',task1,{status:'open',outcome:'Reopen'},2),/dependent work/);
 await call('task.status',task2,{status:'resolved',outcome:'Completed'},2);
 const closed=await call('program.save',programId,{name:'Synthetic solar installation',type:'energy',state:'completed',ownerId:personId,reason:'Work and evidence complete'},1);assert.equal(closed.record.data.state,'completed');
});
test('idempotent retries return one task and audit row; changed requests are rejected',async()=>{
 const task=id(),request=id(),p={title:'Idempotent planning task'};
 const r=await command(db,ids.operator,'task.save',task,p,0,ids.facility,request);
 const again=await command(db,ids.operator,'task.save',task,p,0,ids.facility,request);
 assert.equal(r.id,again.id);assert.equal(again.replayed,true);
 await assert.rejects(command(db,ids.operator,'task.save',task,{title:'Changed'},0,ids.facility,request),/IDEMPOTENCY/);
 assert.equal((await db.query<{n:number}>('select count(*)::int n from mx_ops.audit where entity_id=$1',[task])).rows[0].n,1);
});
test('engineering assets remain proposed until installed; diesel ledger reconciles independent dips',async()=>{
 await call('asset.save',tank,{code:'T-01',name:'Synthetic tank',kind:'tank',state:'installed',capacity:'1000',capacity_unit:'L'});
 await call('asset.save',generator,{code:'G-01',name:'Synthetic generator',kind:'generator',state:'operating'});
 await call('asset.save',array,{code:'PV-01',name:'Proposed solar',kind:'solar',state:'proposed',capacity:'10',capacity_unit:'kW'});
 await call('fuel.record',id(),{kind:'opening',tank_id:tank,litres:'200',occurred_at:'2026-09-01T00:00:00Z',reference:'OPEN-T1'});
 await call('fuel.record',id(),{kind:'delivery',tank_id:tank,litres:'500',occurred_at:'2026-09-02T00:00:00Z',reference:'DEL-T1'});
 await call('fuel.record',id(),{kind:'issue',tank_id:tank,asset_id:generator,litres:'100',occurred_at:'2026-09-03T00:00:00Z',reference:'ISS-T1'});
 await call('fuel.record',id(),{kind:'dip',tank_id:tank,litres:'590',occurred_at:'2026-09-03T01:00:00Z',reference:'DIP-T1'});
 await assert.rejects(call('fuel.record',id(),{kind:'issue',tank_id:tank,litres:'800',occurred_at:'2026-09-02T00:30:00Z',reference:'BAD'}),/negative/);
 await assert.rejects(call('fuel.record',id(),{kind:'opening',tank_id:tank,litres:'5',occurred_at:'2026-09-02T00:30:00Z',reference:'SECOND-OPEN'}),/one opening/);
 assert.equal((await work()).fuel.length,4);
});
test('meter readings require actual installed assets, non-overlap and physical elapsed hours',async()=>{
 const p={asset_id:generator,kind:'diesel_generation',amount:'40.5',started_at:'2026-09-01T00:00:00Z',ended_at:'2026-09-01T02:00:00Z',method:'Difference between photographed meter readings'};
 await call('energy.record',id(),p);
 await assert.rejects(call('energy.record',id(),p),/overlap/);
 await assert.rejects(call('energy.record',id(),{...p,asset_id:array,kind:'solar_generation'}),/installed asset/);
 await assert.rejects(call('energy.record',id(),{...p,kind:'generator_hours',amount:'3'}),/elapsed/);
 await assert.rejects(call('energy.record',id(),{...p,asset_id:tank}),/match this asset/);
});
test('commercial evidence is permission filtered and maintenance verification requires a different verified supervisor',async()=>{
 const maintenance=id();await call('task.save',maintenance,{title:'Inspect pump',kind:'maintenance',asset_id:generator});
 await call('task.status',maintenance,{status:'resolved',outcome:'Inspection recorded'},1);
 await assert.rejects(command(db,ids.operator,'task.verify',maintenance,{reason:'Self'},2,ids.facility),/ACCESS_DENIED/);
 await assert.rejects(command(db,ids.reviewer,'task.verify',maintenance,{reason:'Second review'},2,ids.facility,id(),'aal1'),/MFA_REQUIRED/);
 const r=await call('task.verify',maintenance,{reason:'Independently checked'},2,ids.reviewer);assert.equal(r.record.verified_by,ids.reviewer);
 const file=await evidence(db,'plant');await call('cost.record',id(),{program_id:programId,kind:'actual',amount:'100',currency:'AUD',reference:'SYNTHETIC-INV',occurred_on:'2026-09-01',source_file_id:file},0,ids.reviewer);
 assert.equal((await work()).costs.length,0);assert.equal((await work(ids.facility,ids.reviewer)).costs.length,1);
});
test('asset kind and spare unit changes cannot corrupt previously recorded measurements',async()=>{
 await assert.rejects(call('asset.save',tank,{code:'T-01',name:'Synthetic tank',kind:'generator',state:'installed'},1),/[Aa]sset (kind|type)/);
 const spare=id();await call('spare.save',spare,{code:'SYN-PART',name:'Synthetic spare',unit:'each',reorder_at:'1'});
 await call('spare.move',id(),{spare_id:spare,kind:'opening',quantity:'4',reference:'OPEN',occurred_at:'2026-09-01T01:00Z'});
 await call('spare.move',id(),{spare_id:spare,kind:'use',quantity:'2',reference:'USE',occurred_at:'2026-09-02T01:00Z'});
 await assert.rejects(call('spare.move',id(),{spare_id:spare,kind:'use',quantity:'3',reference:'NEGATIVE',occurred_at:'2026-09-03T01:00Z'}),/negative/);
 await assert.rejects(call('spare.save',spare,{code:'SYN-PART',name:'Synthetic spare',unit:'boxes',reorder_at:'1'},1),/Stock units/);
});
test('a work package cannot bypass independent verification of a maintenance child',async()=>{
 const parent=id(),child=id();await call('task.save',parent,{title:'Synthetic shutdown package',kind:'package'});
 await call('task.save',child,{title:'Synthetic service',kind:'maintenance',parent_id:parent});
 await call('task.status',child,{status:'resolved',outcome:'Work completed'},1);
 await assert.rejects(call('task.status',parent,{status:'resolved',outcome:'Incorrect early close'},1),/work-package/);
 await call('task.verify',child,{reason:'Checked by a separate supervisor'},2,ids.reviewer);
 await call('task.status',parent,{status:'resolved',outcome:'Package independently complete'},1);
 await assert.rejects(call('task.save',id(),{title:'Silent new work on completed package',parent_id:parent}),/same program/);
});
