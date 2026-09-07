import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {setup,ids,command,asUser,evidence} from './helpers';
import {fineGold,dryTonnes,balance} from '../../lib/ops/decimal';
let db:Awaited<ReturnType<typeof setup>>;
const feed=crypto.randomUUID(),campaign=crypto.randomUUID(),run=crypto.randomUUID(),run2=crypto.randomUUID(),lot=crypto.randomUUID(),weight=crypto.randomUUID(),assay=crypto.randomUUID();
const at='2026-09-01T12:00:00+10:00';let source:string,receiptSource:string,lotVersion=1;
before(async()=>{db=await setup();source=await evidence(db);receiptSource=await evidence(db,'custody');});after(async()=>db.close());
test('decimal previews preserve pending values and distinguish dry-basis quantity',()=>{
 assert.equal(fineGold('125.5','82.4'),'103.412');assert.equal(fineGold('125',null),null);
 assert.equal(dryTonnes('10','wet',null),null);assert.equal(dryTonnes('10','wet','10'),'9');assert.equal(balance('10','50','40','10'),'10');
 assert.throws(()=>fineGold('4','101'));assert.throws(()=>dryTonnes('4','wet','100'));
});
test('access administrator alone cannot see or create production; outsider and viewer cannot write',async()=>{
 for(const user of [ids.owner,ids.outsider,ids.manager])await assert.rejects(command(db,user,'feed.create',feed,{reference:'FEED'}),/ACCESS_DENIED/);
 assert.deepEqual(await asUser(db,ids.owner,'select * from mx_ops.gold_lots'),[]);
 await assert.rejects(asUser(db,ids.operator,"update mx_ops.members set profiles=array['manager']"),/permission denied/);
 await assert.rejects(asUser(db,ids.reviewer,'delete from mx_ops.audit'),/permission denied/);
});
test('commands atomically record actor/audit and reject key reuse with another intent',async()=>{
 const request=crypto.randomUUID(),p={reference:'FEED-1',quantity_t:'40.25',mass_basis:'wet',moisture_percent:'10'};
 const one=await command(db,ids.operator,'feed.create',feed,p,0,ids.facility,request);
 const again=await command(db,ids.operator,'feed.create',feed,p,0,ids.facility,request);
 assert.equal(one.id,again.id);assert.equal(again.replayed,true);
 await assert.rejects(command(db,ids.operator,'feed.create',feed,{...p,quantity_t:'41'},0,ids.facility,request),/IDEMPOTENCY_MISMATCH/);
 assert.equal((await db.query('select * from mx_ops.feed_lots')).rows.length,1);
 assert.equal((await db.query('select * from mx_ops.audit where entity_id=$1',[feed])).rows.length,1);
});
test('a run does not require fictional gold or assay and supports multiple runs per clean-up',async()=>{
 await command(db,ids.operator,'campaign.create',campaign,{name:'Test campaign'});
 for(const r of [run,run2]){
  await command(db,ids.operator,'run.save',r,{campaign_id:campaign,started_at:'2026-09-01T08:00:00+10:00',ended_at:'2026-09-01T11:00:00+10:00',feeds:[{feed_lot_id:feed,quantity_t:'10',basis:'wet',moisture_percent:'10'}]});
  await command(db,ids.operator,'run.submit',r,{},1);
  await command(db,ids.reviewer,'run.review',r,{},2);
 }
 const made=await command(db,ids.operator,'cleanup.record',lot,{reference:'LOT-1',form:'dore',campaign_id:campaign,produced_at:at,run_ids:[run,run2]});
 assert.equal(made.record.review_state,'unverified');assert.equal(made.record.active_assay_id,null);
 assert.equal((await db.query('select * from mx_ops.lot_runs')).rows.length,2);
 assert.equal((await db.query<{total:string}>('select sum(dry_t)::text as total from mx_ops.run_feeds')).rows[0].total,'18.000000');
});
test('stale writes and malformed time/quantity reject without audit or partial rows',async()=>{
 await assert.rejects(command(db,ids.operator,'run.save',run,{notes:'stale'},0),/CONFLICT/);
 const before=(await db.query<{n:number}>('select count(*)::int as n from mx_ops.runs')).rows[0].n;
 await assert.rejects(command(db,ids.operator,'run.save',crypto.randomUUID(),{started_at:'2026-09-01T10:00:00',feeds:[]}),/timezone/);
 assert.equal((await db.query<{n:number}>('select count(*)::int as n from mx_ops.runs')).rows[0].n,before);
});
test('weights and source assays preserve exact values; self-approval and missing MFA fail',async()=>{
 await command(db,ids.operator,'weight.record',weight,{lot_id:lot,basis:'gross_tare',gross_g:'112.5',tare_g:'12.5',resolution_g:'0.01',instrument:'TEST-SCALE',observed_at:at,source_file_id:source},lotVersion++);
 await command(db,ids.reviewer,'assay.stage',assay,{lot_id:lot,laboratory:'TEST-LAB',certificate:'C1',certificate_revision:'1',raw_result:'85.125 %',reported_value:'85.125',unit:'%',method:'Test assay',source_file_id:source},lotVersion++);
 await assert.rejects(command(db,ids.reviewer,'gold.review',lot,{weight_id:weight,assay_id:assay,reason:'Review test'},lotVersion),/Independent review/);
 await assert.rejects(command(db,ids.otherReviewer,'gold.review',lot,{weight_id:weight,assay_id:assay,reason:'Review test'},lotVersion,ids.facility,crypto.randomUUID(),'aal1'),/MFA_REQUIRED/);
 await command(db,ids.otherReviewer,'gold.review',lot,{weight_id:weight,assay_id:assay,reason:'Checked source and instrument'},lotVersion++);
 const r=await command(db,ids.otherReviewer,'gold.recognize',lot,{},lotVersion++);
 assert.equal(r.record.fine_au_g,'85.12500000');assert.equal((await db.query<{n:number}>('select count(*)::int as n from mx_ops.production')).rows[0].n,1);
});
test('custody remains separate from assay and is not visible to general managers',async()=>{
 await command(db,ids.custodian,'gold.receive',lot,{location:'Synthetic secure location',source_file_id:receiptSource},lotVersion++);
 assert.deepEqual(await asUser(db,ids.manager,'select * from mx_ops.custody'),[]);
 const tid=crypto.randomUUID();await command(db,ids.custodian,'gold.transfer',lot,{transfer_id:tid,to_holder:ids.receiver,destination:'Synthetic recipient',reference:'HANDOVER-1',seal:'SEAL-1',shipped_at:at},lotVersion++);
 await assert.rejects(command(db,ids.custodian,'transfer.receive',tid,{receipt_file_id:receiptSource,received_at:at},1),/named recipient/);
 await command(db,ids.receiver,'transfer.receive',tid,{receipt_file_id:receiptSource,received_at:at},1);lotVersion++;
 const holding=(await asUser(db,ids.receiver,'select * from mx_ops.custody'))[0];assert.equal(holding.holder_id,ids.receiver);assert.equal(holding.status,'held');
 assert.equal((await db.query('select * from mx_ops.production')).rows.length,1,'Transfers are not new production');
});
test('period needs independent measured categories and preserves closed/reopened snapshots',async()=>{
 const period=crypto.randomUUID();await command(db,ids.reviewer,'period.create',period,{name:'Test period',kind:'circuit',unit:'fine_au_g',starts_at:'2026-09-01T00:00:00+10:00',ends_at:'2026-09-02T00:00:00+10:00',boundary_description:'Synthetic test circuit'});
 const lines=['opening','input','output','closing'].map((kind,i)=>({kind,label:kind,amount_g:['10','100','85.125','24.875'][i],observed_at:at,method:'Independent observation',source_file_id:source}));
 await assert.rejects(command(db,ids.reviewer,'period.prepare',period,{lines:lines.slice(0,3),tolerance_g:'1',tolerance_basis:'Test measurement practice'},1),/opening/);
 const prepared=await command(db,ids.reviewer,'period.prepare',period,{lines,tolerance_g:'1',tolerance_basis:'Test measurement practice'},1);assert.equal(prepared.record.difference_g,'0.00000000');
 await assert.rejects(command(db,ids.reviewer,'period.review',period,{reason:'review'},2),/independent reviewer/);
 await command(db,ids.otherReviewer,'period.review',period,{reason:'Compared measurement sources'},2);
 const closed=await command(db,ids.otherReviewer,'period.close',period,{},3);assert.equal(closed.record.status,'closed');
 await assert.rejects(command(db,ids.otherReviewer,'gold.recognize',lot,{reason:'Change basis'},lotVersion),/closed account/);
 await command(db,ids.otherReviewer,'period.reopen',period,{reason:'Received new evidence; reopening account'},4);
 assert.equal((await db.query('select * from mx_ops.period_history')).rows.length,1);
});
test('a role revoked after token issue cannot read or retry its previous successful command',async()=>{
 const request=crypto.randomUUID(),p={reference:'REVOKE-TEST'},id=crypto.randomUUID();await command(db,ids.operator,'feed.create',id,p,0,ids.facility,request);
 await db.query('update mx_ops.members set revoked_at=now() where scope_id=$1 and user_id=$2',[ids.facility,ids.operator]);
 assert.deepEqual(await asUser(db,ids.operator,'select * from mx_ops.runs'),[]);
 await assert.rejects(command(db,ids.operator,'feed.create',id,p,0,ids.facility,request),/ACCESS_DENIED/);
});
