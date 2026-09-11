import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
export const ids={owner:'10000000-0000-4000-8000-000000000001',operator:'10000000-0000-4000-8000-000000000002',reviewer:'10000000-0000-4000-8000-000000000003',custodian:'10000000-0000-4000-8000-000000000004',receiver:'10000000-0000-4000-8000-000000000005',outsider:'10000000-0000-4000-8000-000000000006',manager:'10000000-0000-4000-8000-000000000007',otherReviewer:'10000000-0000-4000-8000-000000000008',workspace:'20000000-0000-4000-8000-000000000001',org:'20000000-0000-4000-8000-000000000002',facility:'20000000-0000-4000-8000-000000000003',project:'20000000-0000-4000-8000-000000000004',otherFacility:'20000000-0000-4000-8000-000000000005'};
export async function setup(extra=true){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role authenticator noinherit;create role supabase_auth_admin;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,jsonb_build_object('sub',current_setting('request.jwt.claim.sub',true),'aal',coalesce(nullif(current_setting('request.jwt.claim.aal',true),''),'aal1'),'role',current_setting('request.jwt.claim.role',true),'client_id',nullif(current_setting('request.jwt.claim.client_id',true),''))) $$;
 grant usage on schema auth to authenticated,anon,service_role,supabase_auth_admin;`);
 for(const name of ['202609060001_gic.sql','202609060002_run_timing.sql','20260907010000_operations_core.sql','20260907011000_operations_gold.sql',...(extra?['20260907012000_operations_geology.sql','20260907013000_operations_reads.sql','20260907073020_operations_acceptance_fixes.sql','20260907090000_operations_reconciliation.sql']:[])]) {
  try{await db.exec(await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));}catch(e){console.error('MIGRATION FAILED',name);throw e;}
 }
 for(const [k,v] of Object.entries(ids).filter(([k])=>!['workspace','org','facility','project','otherFacility'].includes(k)))await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[v,k+'@example.invalid']);
 await db.query("insert into gic_workspaces(id,name,mine_name) values($1,'Synthetic operation','Synthetic mine')",[ids.workspace]);
 await db.query("insert into gic_members(workspace_id,user_id,role) values($1,$2,'owner')",[ids.workspace,ids.owner]);
 await db.query("insert into mx_ops.organisations(id,name,legacy_workspace_id) values($1,'Test only',$2)",[ids.org,ids.workspace]);
 await db.query('insert into mx_ops.administrators(org_id,user_id) values($1,$2)',[ids.org,ids.owner]);
 await db.query("insert into mx_ops.scopes(id,org_id,kind,code,name) values($1,$2,'facility','TEST','Synthetic facility'),($3,$2,'project','GEO','Synthetic project'),($4,$2,'facility','OTHER','Other facility')",[ids.facility,ids.org,ids.project,ids.otherFacility]);
 for(const [user,profiles] of [[ids.operator,['operator']],[ids.reviewer,['supervisor','accountant']],[ids.custodian,['custodian']],[ids.receiver,['custodian']],[ids.manager,['manager']],[ids.otherReviewer,['supervisor','accountant']]] as [string,string[]][]){await db.query('insert into mx_ops.members(scope_id,user_id,profiles) values($1,$2,$3)',[ids.facility,user,profiles]);}
 await db.query("update mx_ops.scopes set policy=policy||'{\"recognition_confirmed\":true}'::jsonb where id=$1",[ids.facility]);
 return db;
}
export async function asUser(db:PGlite,user:string,sql:string,args:unknown[]=[],aal='aal2',role='authenticated',clientId?:string){
 const claims={sub:user,aal,role,...(clientId?{client_id:clientId}:{})};
 await db.exec('begin');try{await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.aal',$2,true),set_config('request.jwt.claim.role',$3,true),set_config('request.jwt.claim.client_id',$4,true),set_config('request.jwt.claims',$5,true)",[user,aal,role,clientId||'',JSON.stringify(claims)]);await db.exec('set local role '+role);const r=await db.query(sql,args);await db.exec('commit');return r.rows as Record<string,any>[];}catch(e){await db.exec('rollback');throw e;}
}
export async function command(db:PGlite,user:string,action:string,id:string,payload:Record<string,unknown>,expected=0,scope=ids.facility,request=crypto.randomUUID(),aal='aal2'){
 return (await asUser(db,user,'select public.mx_ops_command($1,$2,$3,$4,$5,$6::jsonb) as result',[scope,request,action,id,expected,JSON.stringify(payload)],aal))[0].result;
}
export async function evidence(db:PGlite,family='gold',scope=ids.facility){const id=crypto.randomUUID();await db.query("insert into mx_ops.files(id,scope_id,family,name,media_type,size_bytes,sha256,object_path,status,created_by,verified_at) values($1,$2,$3,'synthetic.txt','text/plain',4,$4,$5,'verified',$6,now())",[id,scope,family,'a'.repeat(64),scope+'/'+id,ids.operator]);return id;}
