import test from 'node:test';
import assert from 'node:assert/strict';
import {setup, ids, asUser, command, evidence} from './helpers';

test('private source finalisation verifies identity and bytes, not a nonexistent run field',async()=>{
 const db=await setup();try{
 const id=crypto.randomUUID();await command(db,ids.operator,'file.prepare',id,{family:'gold',name:'weighing.pdf',media_type:'application/pdf',size_bytes:4,sha256:'a'.repeat(64)});
 const sql='select mx_ops_file_finalize($1,$2,$3,$4,$5) as record';
 const args=[ids.operator,ids.facility,id,'a'.repeat(64),4];
 await assert.rejects(asUser(db,ids.operator,sql,args),/permission denied/);
 await assert.rejects(asUser(db,ids.operator,sql,[ids.operator,ids.facility,id,'b'.repeat(64),4],'aal1','service_role'),/bytes do not match/);
 const rows=await asUser(db,ids.operator,sql,args,'aal1','service_role');assert.equal(rows[0].record.status,'verified');
 assert.equal((await asUser(db,ids.operator,sql,args,'aal1','service_role'))[0].record.status,'verified');
 }finally{await db.close();}
});

test('operators may stage product results but cannot approve their own result',async()=>{
 const db=await setup();try{
 const feed=crypto.randomUUID(),run=crypto.randomUUID(),lot=crypto.randomUUID(),at='2026-09-01T01:00:00Z';
 await command(db,ids.operator,'feed.create',feed,{reference:'F'});
 await command(db,ids.operator,'run.save',run,{started_at:at,ended_at:at,feeds:[{feed_lot_id:feed,quantity_t:'1',basis:'dry'}]});
 await command(db,ids.operator,'cleanup.record',lot,{reference:'L',form:'dore',produced_at:at,run_ids:[run]});
 const source=await evidence(db),assay=crypto.randomUUID();
 const p={lot_id:lot,laboratory:'Lab',certificate:'C',certificate_revision:'1',method:'fire assay',raw_result:'80 %',reported_value:'80',unit:'%',qualifier:'=',source_file_id:source};
 await assert.rejects(command(db,ids.reviewer,'assay.stage',crypto.randomUUID(),{...p,unit:'g/kg'},1),/units disagree/);
 const r=await command(db,ids.operator,'assay.stage',assay,p,1);assert.equal(r.record.au_percent,'80.00000000');
 await assert.rejects(command(db,ids.operator,'gold.review',lot,{weight_id:crypto.randomUUID(),assay_id:assay,reason:'self'},2),/ACCESS_DENIED/);
 }finally{await db.close();}
});

test('a document revision cannot supersede a document from another operation',async()=>{
 const db=await setup();try{
 await db.query("insert into mx_ops.members(scope_id,user_id,profiles) values($1,$2,array['operator'])",[ids.otherFacility,ids.operator]);
 const source=await evidence(db,'plant'),other=await evidence(db,'plant',ids.otherFacility);
 const previous=crypto.randomUUID();await command(db,ids.operator,'document.publish',previous,{title:'Other procedure',category:'procedure',file_id:other},0,ids.otherFacility);
 await assert.rejects(command(db,ids.operator,'document.publish',crypto.randomUUID(),{title:'Wrong scope',category:'procedure',file_id:source,supersedes:previous}),/same workspace/);
 }finally{await db.close();}
});
