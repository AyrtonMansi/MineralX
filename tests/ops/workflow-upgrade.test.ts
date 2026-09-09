import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {setup,ids,asUser} from './helpers';import {DevelopmentEngine} from '../../lib/ops/development-engine';
test('a version-six device archive upgrades atomically without replacing existing IDs, field data or campaign names',async()=>{
 const db=await setup();let copy:PGlite|undefined;
 try{
  await db.exec('create table mineralx_development_meta(version integer primary key);insert into mineralx_development_meta values(1)');
  const id=crypto.randomUUID();await db.query("insert into mx_ops.campaigns(id,scope_id,name,created_by) values($1,$2,'Previously saved campaign',$3)",[id,ids.facility,ids.operator]);
  const engine=new DevelopmentEngine(db);await engine.initialise();
  assert.equal((await db.query<{v:number}>('select max(version) v from mx_ops.schema_version')).rows[0].v,9);
  assert.equal((await db.query<{name:string}>("select data->>'name' as name from mx_ops.geo_programs where id=$1",[id])).rows[0].name,'Previously saved campaign');
  const bytes=await db.dumpDataDir('gzip');copy=new PGlite({loadDataDir:bytes});await copy.waitReady;await new DevelopmentEngine(copy).initialise();
  assert.equal((await copy.query<{n:number}>('select count(*)::int n from mx_ops.geo_programs where id=$1',[id])).rows[0].n,1);
  assert.equal((await copy.query<{n:number}>('select count(*)::int n from mx_ops.campaigns where id=$1',[id])).rows[0].n,1);
  assert.equal(((await asUser(copy,ids.operator,"select jsonb_array_length(public.mx_ops_processing_programs($1)->'programs')::int n",[ids.facility]))[0] as {n:number}).n,1);
 }finally{await copy?.close();await db.close();}
});
test('a schema collision aborts a device upgrade without deleting or replacing older records',async()=>{
 const db=await setup();try{
  await db.exec('create table mineralx_development_meta(version integer primary key);insert into mineralx_development_meta values(1);create table mx_ops.program_types(existing text);');
  await assert.rejects(new DevelopmentEngine(db).initialise());
  assert.equal((await db.query<{v:number}>('select max(version) v from mx_ops.schema_version')).rows[0].v,6);
  assert.equal((await db.query<{n:number}>('select count(*)::int n from auth.users')).rows[0].n,8);
  assert.equal((await db.query<{n:string|null}>("select to_regclass('mx_ops.planning_people')::text n")).rows[0].n,null);
 }finally{await db.close();}
});
