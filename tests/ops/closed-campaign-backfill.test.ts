import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {DevelopmentEngine} from '../../lib/ops/development-engine';
import {asUser,command,ids,setup} from './helpers';

const migration=(name:string)=>readFile(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8');
const workflow='20260909020000_operations_workflow.sql';
const processingChoices='20260910010000_operations_processing_program_choices.sql';
const closedCampaignBackfill='20260910020000_operations_closed_campaign_backfill.sql';

async function legacyCampaign(db:PGlite,name:string,status:'open'|'closed'='closed'){
 const id=crypto.randomUUID();
 await db.query('insert into mx_ops.campaigns(id,scope_id,name,status,created_by) values($1,$2,$3,$4,$5)',[id,ids.facility,name,status,ids.operator]);
 return id;
}

test('v9 backfills only untouched closed legacy campaign programs and keeps their selectors closed',async()=>{
 const db=await setup();
 try{
  await db.exec(await migration(workflow));
  await db.exec(await migration(processingChoices));
  const migrated=await legacyCampaign(db,'Legacy closed campaign');
  const edited=await legacyCampaign(db,'Canonically edited legacy campaign');
  const open=await legacyCampaign(db,'Open legacy campaign','open');
  // This post-bridge task must not make a previously closed legacy campaign reusable.
  await command(db,ids.operator,'task.save',crypto.randomUUID(),{title:'Task added during the old bridge defect',program_id:migrated});
  await db.query("update mx_ops.geo_programs set data=data||jsonb_build_object('objective','Canonical plan was explicitly revised'),version=version+1 where id=$1",[edited]);

  await db.exec(await migration(closedCampaignBackfill));
  const rows=await db.query<{id:string;version:number;data:any}>('select id,version,data from mx_ops.geo_programs where id in($1,$2,$3) order by id',[migrated,edited,open]);
  const migratedRow=rows.rows.find(row=>row.id===migrated)!;
  const editedRow=rows.rows.find(row=>row.id===edited)!;
  assert.equal(migratedRow.version,2);
  assert.equal(migratedRow.data.state,'completed');
  assert.equal(migratedRow.data.completionReason,'Migrated from closed legacy processing campaign');
  assert.deepEqual(migratedRow.data.legacyCampaignClosureBackfill,{source:'mx_ops.campaigns.status',legacyState:'closed'});
  assert.equal(editedRow.version,2);
  assert.equal(editedRow.data.state,'planned');
  assert.equal(editedRow.data.legacyCampaignClosureBackfill,undefined);
  const choices=(await asUser(db,ids.operator,'select public.mx_ops_processing_programs($1) as data',[ids.facility]))[0].data;
  const idsInSelector=choices.programs.map((program:any)=>program.id);
  assert.ok(!idsInSelector.includes(migrated));
  assert.ok(idsInSelector.includes(open));
  assert.ok(idsInSelector.includes(edited));
  assert.equal((await db.query<{version:number}>('select max(version) version from mx_ops.schema_version')).rows[0].version,9);
 }finally{await db.close();}
});

test('a version-eight device archive upgrades to v9 without replacing its closed campaign identity',async()=>{
 const db=await setup();
 try{
  await db.exec(await migration(workflow));
  await db.exec(await migration(processingChoices));
  await db.exec('create table mineralx_development_meta(version integer primary key);insert into mineralx_development_meta values(1)');
  const campaign=await legacyCampaign(db,'Closed campaign in device archive');
  await new DevelopmentEngine(db).initialise();
  const row=(await db.query<{version:number;data:any}>('select version,data from mx_ops.geo_programs where id=$1',[campaign])).rows[0];
  assert.equal(row.version,2);
  assert.equal(row.data.state,'completed');
  assert.equal((await db.query<{version:number}>('select max(version) version from mx_ops.schema_version')).rows[0].version,9);
 }finally{await db.close();}
});
