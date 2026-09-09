/** Isolated browser database. Never imports a production client or issues HTTP requests. */
import type {PGlite} from '@electric-sql/pglite';
import schema from './development-schema.generated';
import {commandSchema,OpsError,classifyDatabaseError,permissionProfiles,rowsToCsv, type Command} from './contracts';
import {DEVELOPMENT_ACTOR as ACTOR,DEVELOPMENT_ORG as ORG,DEVELOPMENT_FACILITY as FACILITY,DEVELOPMENT_PROJECT as PROJECT} from './development-policy';
import {GEO_KINDS,GEO_ACTIONS,newSharedProject,applyGeoCommand,changeSet,projectMetadata,versionAt} from './geology.js';
import {parseKml,parseGeoJson,readKmz,spatialStats} from '../../components/mineralx/spatial-import.js';

type DB = Pick<PGlite,'query'|'exec'|'transaction'>;
const json=(value:unknown)=>JSON.stringify(value);
const fault=(message:string):never=>{throw new OpsError('validation',message);};
const unsigned='This action needs a named, verified staff account. Development records cannot approve production, sign custody or change staff access.';
const digest=async(bytes:ArrayBuffer)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
export class DevelopmentEngine {
  constructor(readonly db:PGlite){}
  async initialise(){
    const existing=await this.db.query<{name:string|null}>("select to_regclass('public.mineralx_development_meta')::text as name");
    if(existing.rows[0].name){
      const meta=await this.db.query<{version:number}>('select version from mineralx_development_meta');
      if(meta.rows[0]?.version!==1)fault('This development workspace needs a supported upgrade. Existing records were not replaced.');
      // Upgrade the same database in place. Failure aborts the whole migration; never seed a replacement.
      const current=await this.db.query<{version:number}>('select max(version) as version from mx_ops.schema_version');
      if(current.rows[0].version===6){
        const upgrade=schema.find(m=>m.name==='20260909020000_operations_workflow.sql');
        if(!upgrade)fault('The reviewed workflow migration is unavailable. Keep the original backup.');
        await this.db.transaction(async tx=>{await tx.exec(upgrade!.sql.replace(/^begin;\s*$/mi,'').replace(/^commit;\s*$/mi,''));});
      }else if(current.rows[0].version!==7)fault('Unsupported development database version. Keep your recovery copy.');
      return;
    }
    await this.db.transaction(async tx=>{
      await tx.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
        create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('sub',current_setting('request.jwt.claim.sub',true),'aal','aal1') $$;
        grant usage on schema auth to authenticated,anon,service_role;`);
      for(const migration of schema){
        // Remove only standalone outer transaction markers; execute the same domain rules atomically.
        const sql=migration.sql.replace(/^begin;\s*$/mi,'').replace(/^commit;\s*$/mi,'');
        await tx.exec(sql);
      }
      await tx.query("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,'browser@development.invalid',now(),'{\"display_name\":\"This browser — development only\"}')",[ACTOR]);
      await tx.query("insert into mx_ops.organisations(id,name) values($1,'Local development — not production')",[ORG]);
      await tx.query("insert into mx_ops.scopes(id,org_id,kind,code,name) values($1,$2,'facility','DEV-PLANT','Development facility'),($3,$2,'project','DEV-GEO','Development geology')",[FACILITY,ORG,PROJECT]);
      for(const scope of [FACILITY,PROJECT])await tx.query('insert into mx_ops.members(scope_id,user_id,profiles) values($1,$2,$3)',[scope,ACTOR,Object.keys(permissionProfiles)]);
      await tx.exec('create table public.mineralx_development_meta(version integer primary key);insert into public.mineralx_development_meta values(1);create table public.mineralx_development_bytes(id uuid primary key,bytes bytea not null);');
    });
  }
  private async asActor<T>(sql:string,args:unknown[]=[],service=false):Promise<T>{
    return this.db.transaction(async tx=>{
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[ACTOR]);
      await tx.exec('set local role '+(service?'service_role':'authenticated'));
      return (await tx.query<{result:T}>(sql,args)).rows[0].result;
    });
  }
  private rpc<T=any>(name:string,args:unknown[]=[],service=false):Promise<T>{
    // Every function name below is a literal controlled by this module, never user input.
    return this.asActor<T>(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args,service);
  }
  private scope(id:string|null){if(id!==FACILITY&&id!==PROJECT)throw new OpsError('forbidden','This record is outside the Development workspace. Production workspaces cannot be opened in development mode.');return id;}
  async context(){const c=await this.rpc('mx_ops_context');return {...c,scopes:c.scopes.map((scope:any)=>({...scope,name:'Development workspace'})),aal:'development',organisations:c.organisations.map((o:any)=>({...o,admin:false})),capabilities:{development:true,evidence:true,sharedGeology:false,invitationEmail:false,independentObjectBackup:false,storage:'browser-local-development'}};}
  async geology(scopeId:string){
    this.scope(scopeId);const c=await this.context(),scope=c.scopes.find((s:any)=>s.id===scopeId);
    if(scope.kind!=='project')fault('Geology requires the compatible records in this Development workspace.');
    let project:any=newSharedProject({...scope,name:'Development workspace'}),versions:Record<string,number>={},revision=0,metadataVersion=0;
    for(const kind of GEO_KINDS){let cursor=null;const rows:any[]=[];
      do{const page:any=await this.rpc('mx_ops_geo_page',[scopeId,kind,cursor,1000]);revision=page.revision;metadataVersion=page.project?.version||0;if(page.project)project={...project,...page.project.data,name:'Development workspace'};
        for(const row of page.rows){versions[`${kind}:${row.id}`]=row.version;rows.push({...row.data,recordId:row.id});}
        if(rows.length>10000)fault('This development project exceeds the bounded record limit. Export a backup.');
        cursor=page.rows.length===1000?page.rows[page.rows.length-1].id:null;
      }while(cursor);project[kind]=rows;
    }
    return {project,versions,revision,metadataVersion,asOf:new Date().toISOString()};
  }
  async source(scopeId:string,id:string){
    this.scope(scopeId);const files=await this.rpc('mx_ops_files',[scopeId,id]),file=files?.[0];if(!file||file.status!=='verified')fault('Choose a verified file saved in this development workspace.');
    const result=await this.db.query<{bytes:Uint8Array}>('select bytes from mineralx_development_bytes where id=$1',[id]);
    const bytes=result.rows[0]?.bytes;if(!bytes||bytes.length!==Number(file.size_bytes)||await digest(new Uint8Array(bytes).buffer)!==file.sha256)fault('The source bytes could not be verified. No publication was performed.');
    return {file,bytes:new Uint8Array(bytes)};
  }
  async upload(scopeId:string,family:string,file:File,identity?:{id:string;requestId:string}){
    this.scope(scopeId);if(!file.size||file.size>10485760)fault('Choose a non-empty development file up to 10 MiB.');
    const buffer=await file.arrayBuffer(),sha256=await digest(buffer),ids=identity||{id:crypto.randomUUID(),requestId:crypto.randomUUID()};
    const ext=file.name.split('.').pop()?.toLowerCase(),media_type=({kml:'application/vnd.google-earth.kml+xml',kmz:'application/vnd.google-earth.kmz',geojson:'application/geo+json',csv:'text/csv'} as Record<string,string>)[ext||'']||file.type||'application/octet-stream';
    await this.rpc('mx_ops_command',[scopeId,ids.requestId,'file.prepare',ids.id,0,json({family,name:file.name,media_type,size_bytes:buffer.byteLength,sha256})]);
    // First-write-only bytes preserve idempotency. A changed retry fails the authoritative hash check.
    await this.db.query('insert into mineralx_development_bytes(id,bytes) values($1,$2) on conflict(id) do nothing',[ids.id,new Uint8Array(buffer)]);
    const stored=await this.db.query<{bytes:Uint8Array}>('select bytes from mineralx_development_bytes where id=$1',[ids.id]);
    const bytes=new Uint8Array(stored.rows[0].bytes);
    return this.rpc('mx_ops_file_finalize',[ACTOR,scopeId,ids.id,await digest(bytes.buffer),bytes.length],true);
  }
  async geoCommand(command:Command,dryRun=false){
    if(['geo.assay.release','geo.assay.hold','geo.dispatch.exception','geo.migrate'].includes(command.action))throw new OpsError('mfa_required',unsigned);
    if(!GEO_ACTIONS[command.action as keyof typeof GEO_ACTIONS])fault('Unknown geological action.');
    const baseline=await this.geology(command.scopeId),p=command.payload as any,supplied:any={};
    const target=GEO_KINDS.find(kind=>baseline.project[kind]?.some((r:any)=>r.recordId===command.id));
    const previous=await this.rpc('mx_ops_geo_receipt',[command.scopeId,command.requestId]);
    if(previous&&!dryRun)return this.rpc('mx_ops_geo_commit',[command.scopeId,ACTOR,'aal1',command.requestId,command.action,command.id,json(command),json([]),null],true);
    if((target?versionAt(baseline.versions,target,command.id):0)!==command.expectedVersion)throw new OpsError('conflict','The local record changed. Reopen it before applying this edit.');
    if(p.sourceFileId){const source=await this.source(command.scopeId,p.sourceFileId);supplied.sourceFile=source.file;supplied.sourceText=new TextDecoder().decode(source.bytes);
      if(command.action==='geo.layer.import'){
        const ext=source.file.name.split('.').pop().toLowerCase();
        if(ext==='kml')supplied.parsedSpatial=parseKml(supplied.sourceText);
        else if(ext==='kmz'){
          const archive=await readKmz(source.bytes),features:any[]=[],warnings:string[]=[];
          for(const doc of archive.documents){const parsed=parseKml(doc.text,globalThis.DOMParser,{allowEmpty:true});features.push(...parsed.data.features);warnings.push(...parsed.warnings);}
          if(archive.ignoredEntries)warnings.push(`${archive.ignoredEntries} embedded resources are not rendered. Original bytes are retained.`);
          const data={type:'FeatureCollection',features};supplied.parsedSpatial={...parseGeoJson(data),warnings,stats:spatialStats(data)};
        }else if(['geojson','json'].includes(ext))supplied.parsedSpatial=parseGeoJson(supplied.sourceText);
        else fault('Choose KML, KMZ or GeoJSON.');
      }
    }
    const next=await applyGeoCommand(baseline.project,command,ACTOR,supplied),changes=changeSet(baseline.project,next,baseline.versions);
    if(dryRun)return {dryRun:true,developmentOnly:true,scopeId:command.scopeId,summary:GEO_KINDS.map(kind=>({kind,existing:baseline.project[kind]?.length||0,after:next[kind]?.length||0,changed:changes.filter((r:any)=>r.kind===kind).length})),warnings:supplied.parsedSpatial?.warnings||[],project:supplied.parsedSpatial};
    const before=projectMetadata(baseline.project),after=projectMetadata(next),metadata=!baseline.metadataVersion||json(before)!==json(after)?{expectedVersion:baseline.metadataVersion,data:after}:null;
    return this.rpc('mx_ops_geo_commit',[command.scopeId,ACTOR,'aal1',command.requestId,command.action,command.id,json(command),json(changes),metadata?json(metadata):null],true);
  }
  async request(path:string,data?:unknown):Promise<any>{
    try{
      const u=new URL(path,'https://development.invalid/'),q=u.searchParams,kind=u.pathname.slice(1);
      if(kind==='context'&&data===undefined)return this.context();
      if(['admin','claim','bootstrap'].includes(kind))throw new OpsError('forbidden',unsigned);
      if(data!==undefined){
        if(!['command','geology'].includes(kind))fault('This action is not supported in development mode. Nothing was sent to production.');
        const c=commandSchema.parse(data);this.scope(c.scopeId);if(c.expectedActorId&&c.expectedActorId!==ACTOR)throw new OpsError('forbidden','A named account record cannot be submitted from development mode.');
        const result=c.action.startsWith('geo.')?await this.geoCommand(c,kind==='geology'):await this.rpc('mx_ops_command',[c.scopeId,c.requestId,c.action,c.id,c.expectedVersion,json(c.payload)]);
        return {...result,developmentOnly:true};
      }
      const scope=this.scope(q.get('scope'));
      switch(kind){
        case 'workflow':return this.rpc('mx_ops_workflow',[scope]);
        case 'workflow-history':return this.rpc('mx_ops_workflow_history',[scope,q.get('id')]);
        case 'dashboard':return this.rpc('mx_ops_dashboard',[scope,q.get('from')||new Date(Date.now()-30*864e5).toISOString(),q.get('to')||new Date().toISOString()]);
        case 'register':return this.rpc('mx_ops_list',[scope,q.get('kind'),q.get('after'),100,q.get('id')]);
        case 'detail':return this.rpc('mx_ops_detail',[scope,q.get('kind'),q.get('id')]);
        case 'directory':return this.rpc('mx_ops_directory',[scope]);
        case 'documents':return this.rpc('mx_ops_documents',[scope]);
        case 'files':return this.rpc('mx_ops_files',[scope,null]);
        case 'search':return this.rpc('mx_ops_search',[scope,q.get('q')]);
        case 'geology':return this.geology(scope);
        default:fault('Unavailable in the temporary development workspace. Nothing was sent to production.');
      }
    }catch(e){if(e instanceof OpsError)throw e;if((e as any).code)throw classifyDatabaseError(e as any);throw new OpsError('validation',(e as Error).message||'The development record could not be saved.');}
  }
  async export(scopeId:string,kind:string){
    this.scope(scopeId);
    if(kind==='geology')return new Blob([json({format:'mineralx-development-geology-v1',developmentOnly:true,...await this.geology(scopeId)})],{type:'application/json'});
    const rows:any[]=[];let next:string|null=null;
    do{const page:any=await this.rpc('mx_ops_list',[scopeId,kind,next,500,null]);rows.push(...page.rows);next=page.next;}while(next);
    return new Blob([rowsToCsv(rows.map(row=>({development_only:true,...row})),['development_only',...(rows.length?Object.keys(rows[0]):['id'])])],{type:'text/csv'});
  }
}
