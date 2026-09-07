import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {setup,ids,command,asUser,evidence} from './helpers';
import {applyGeoCommand,newSharedProject,changeSet,projectMetadata,GEO_KINDS} from '../../lib/ops/geology.js';
import {acknowledge,enqueue,deriveKey,encryptPack,decryptPack,type FieldPack} from '../../lib/ops/offline';
import {zonedTimestamp} from '../../lib/ops/time';
let db:Awaited<ReturnType<typeof setup>>;
before(async()=>{db=await setup();await db.query("insert into mx_ops.members(scope_id,user_id,profiles) values($1,$2,array['geologist']),($1,$3,array['lab_reviewer'])",[ids.project,ids.operator,ids.reviewer]);});after(async()=>db.close());
test('verified evidence requires exact uploaded bytes, original actor and current membership',async()=>{
 const file=crypto.randomUUID(),hash='b'.repeat(64);await command(db,ids.operator,'file.prepare',file,{family:'gold',name:'scale.txt',media_type:'text/plain',size_bytes:4,sha256:hash});
 const finalize=(actor:string,digest=hash)=>asUser(db,actor,'select public.mx_ops_file_finalize($1,$2,$3,$4,4) result',[actor,ids.facility,file,digest],'aal1','service_role');
 await assert.rejects(finalize(ids.operator,'a'.repeat(64)),/do not match/);
 await assert.rejects(finalize(ids.reviewer),/Only the uploading/);
 assert.equal((await finalize(ids.operator))[0].result.status,'verified');
 assert.equal((await finalize(ids.operator))[0].result.id,file,'Repeated finalisation recovers the same source');
 assert.equal((await db.query<{n:number}>("select count(*)::int n from mx_ops.audit where entity_id=$1 and action='file.verified'",[file])).rows[0].n,1,'Finalisation replay must not append another verification audit');
 await assert.rejects(asUser(db,ids.operator,'select public.mx_ops_file_finalize($1,$2,$3,$4,4)',[ids.operator,ids.facility,file,hash]),/permission denied/);
});
test('controlled document revisions cannot cross workspaces or fork a previous revision',async()=>{
 const f=await evidence(db,'plant'),old=crypto.randomUUID(),other=crypto.randomUUID();
 await command(db,ids.operator,'document.publish',old,{title:'Procedure 1',file_id:f,category:'procedure'});
 await command(db,ids.operator,'document.publish',crypto.randomUUID(),{title:'Procedure 2',file_id:f,category:'procedure',supersedes:old});
 await assert.rejects(command(db,ids.operator,'document.publish',crypto.randomUUID(),{title:'Fork',file_id:f,category:'procedure',supersedes:old}),/unique/);
 const otherFile=await evidence(db,'plant',ids.otherFacility);await db.query("insert into mx_ops.documents(id,scope_id,title,file_id,category,created_by) values($1,$2,'Other',$3,'procedure',$4)",[other,ids.otherFacility,otherFile,ids.operator]);
 await assert.rejects(command(db,ids.operator,'document.publish',crypto.randomUUID(),{title:'Wrong scope',file_id:f,category:'procedure',supersedes:other}),/previous document/);
});
test('administration read is restricted and does not grant operational permissions',async()=>{
 await assert.rejects(asUser(db,ids.operator,'select public.mx_ops_admin_state($1)',[ids.org]),/ACCESS_DENIED/);
 const result=(await asUser(db,ids.owner,'select public.mx_ops_admin_state($1) result',[ids.org]))[0].result;assert.equal(result.scopes.length,3);assert.ok(result.members.some((m:any)=>m.user_id===ids.operator));
 assert.deepEqual(await asUser(db,ids.owner,'select * from mx_ops.gold_lots'),[]);
});
test('collection, shipment, partial receipt and independent certificate release preserve qualified results',async()=>{
 const scope={id:ids.project,name:'Synthetic field project'};let project=newSharedProject(scope);const versions:Record<string,number>={};let metadataVersion=0;
 const commit=async(actor:string,action:string,payload:any,id=crypto.randomUUID(),expectedVersion=0,supplied:any={})=>{
  const c={scopeId:ids.project,requestId:crypto.randomUUID(),id,expectedVersion,action,payload,expectedActorId:actor};const next=await applyGeoCommand(project,c,actor,supplied),changes=changeSet(project,next,versions);
  const result=(await asUser(db,actor,'select public.mx_ops_geo_commit($1,$2,$3,$4,$5,$6,$7,$8,$9) result',[ids.project,actor,'aal2',c.requestId,action,id,JSON.stringify(c),JSON.stringify(changes),JSON.stringify({expectedVersion:metadataVersion,data:projectMetadata(next)})],'aal2','service_role'))[0].result;
  metadataVersion++;for(const x of result.changes)versions[`${x.kind}:${x.id}`]=x.version;project=next;return result;
 };
 const sample=crypto.randomUUID();await commit(ids.operator,'geo.sample.capture',{id:'BAG-001',lat:-20,lng:143,date:'2026-09-01',sampleType:'rock_chip'},sample);
 const dispatch=crypto.randomUUID();await commit(ids.operator,'geo.dispatch.prepare',{sampleRecordIds:[sample],laboratory:'Synthetic Lab'},dispatch);
 await commit(ids.operator,'geo.dispatch.ship',{tracking:'SYNTHETIC-SHIP',shippedDate:'2026-09-02'},dispatch,1);
 const source=await evidence(db,'geo',ids.project),batch=crypto.randomUUID(),supplied={sourceText:'sample_id,Au_ppb\nBAG-001,<5\n',sourceFile:{id:source,sha256:'a'.repeat(64)}};
 await commit(ids.operator,'geo.assay.stage',{laboratory:'Synthetic Lab',certificate:'SYNTHETIC-C1',method:'Fire assay',revision:'1'},batch,0,supplied);
 await assert.rejects(commit(ids.operator,'geo.assay.release',{reason:'Attempted self release'},batch,1),/different authorised reviewer/);
 await assert.rejects(commit(ids.reviewer,'geo.assay.release',{reason:'Checked all sources'},batch,1),/receipt/);
 await commit(ids.operator,'geo.dispatch.receive',{receivedIds:[sample],reference:'SYNTHETIC-RECEIPT'},dispatch,2);
 await commit(ids.reviewer,'geo.assay.release',{reason:'Checked certificate identity, receipts and project QA/QC protocol'},batch,1);
 const row=(await asUser(db,ids.reviewer,'select data from mx_ops.geo_samples where id=$1',[sample]))[0].data;assert.equal(row.assayReviewStatus,'released');assert.equal(row.lifecycle,'received');assert.equal(row.detectionLimits.Au,0.005);assert.equal(row.assays.Au,undefined);assert.equal(row.assayHistory.at(-1).results[0].reportedText,'<5');assert.equal(row.assayHistory.at(-1).results[0].sourceUnit,'ppb');assert.equal(row.assayHistory.at(-1).results[0].canonicalUnit,'g/t');
 const dashboard=(await asUser(db,ids.operator,'select public.mx_ops_dashboard($1,$2,$3) result',[ids.project,'2026-09-01T00:00:00Z','2026-09-06T00:00:00Z']))[0].result;assert.equal(dashboard.geology.stagedCertificates,0);
 await assert.rejects(asUser(db,ids.operator,'select public.mx_ops_geo_commit($1,$2,$3,$4,$5,$6,$7,$8,null)',[ids.project,ids.operator,'aal2',crypto.randomUUID(),'geo.sample.capture',crypto.randomUUID(),'{}','[]']),/permission denied/);
});
test('encrypted recovery binds account, project and revision; acknowledgements remove only their command',async()=>{
 const scope:any={id:ids.project},c:any={scopeId:ids.project,requestId:crypto.randomUUID(),id:crypto.randomUUID(),action:'geo.sample.capture',expectedVersion:0,payload:{id:'SYNTHETIC'}};
 const pack={version:1,userId:ids.operator,scope,outbox:[],receipts:{},drafts:{},geology:{},context:{},preparedAt:new Date().toISOString(),leaseUntil:new Date().toISOString(),lastSyncedAt:null} as unknown as FieldPack;
 const one=enqueue(pack,c),two=enqueue(one,{...c,requestId:crypto.randomUUID(),id:crypto.randomUUID()});assert.equal(acknowledge(two,c.requestId,{id:c.id}).outbox.length,1);assert.throws(()=>enqueue(one,{...c,payload:{id:'Changed'}}),/reused/);
 const salt=new Uint8Array(16).fill(4),key=await deriveKey('synthetic test passphrase',salt),envelope=await encryptPack(two,key,Array.from(salt),1);
 assert.deepEqual((await decryptPack(envelope,'synthetic test passphrase',ids.operator)).pack.outbox,two.outbox);
 await assert.rejects(decryptPack(envelope,'synthetic test passphrase',ids.reviewer),/different account/);
 await assert.rejects(decryptPack({...envelope,revision:2},'synthetic test passphrase'),/damaged/);
});
test('site time conversion rejects ambiguous and nonexistent daylight-saving times',()=>{
 assert.equal(zonedTimestamp('2026-09-01T08:00','Australia/Brisbane'),'2026-08-31T22:00:00.000Z');
 assert.throws(()=>zonedTimestamp('2026-10-04T02:30','Australia/Sydney'),/does not exist/);
 assert.throws(()=>zonedTimestamp('2026-04-05T02:30','Australia/Sydney'),/ambiguous/);
});
