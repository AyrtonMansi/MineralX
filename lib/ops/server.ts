import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { database, configured } from '../gic/server';
import { OPS_SCHEMA, OPS_RELEASE, OpsError, classifyDatabaseError, type OpsContext, type Command } from './contracts';
import { GEO_KINDS, GEO_ACTIONS, newSharedProject, applyGeoCommand, changeSet, projectMetadata, versionAt } from './geology.js';
import { parseKml, parseGeoJson, readKmz, spatialStats } from '../../components/mineralx/spatial-import.js';
import { readBackup } from '../../components/mineralx/field-workflows.js';
import { DOMParser } from '@xmldom/xmldom';

export const EVIDENCE_BUCKET='mineralx-ops-evidence';
export async function rpc(db:Awaited<ReturnType<typeof database>>,name:string,args:Record<string,unknown>={}) {
 const {data,error}=await db.rpc(name,args);if(error)throw classifyDatabaseError(error);return data;
}
export async function requireSession() {
 if(!configured())throw new OpsError('unavailable','MineralX identity has not been configured. Existing local geology remains available.');
 const db=await database();const {data:{user},error}=await db.auth.getUser();
 if(error||!user)throw new OpsError('unauthenticated','Sign in with your invited MineralX account.');
 return {db,user};
}
export async function requireOperations(scopeId?:string,permission?:string) {
 const {db,user}=await requireSession();
 const {data,error}=await db.rpc('mx_ops_context');
 if(error||!data||data.schemaVersion<OPS_SCHEMA)throw new OpsError('unavailable','The Operations database is awaiting its verified migration. Existing GIC and local geology are unchanged.');
 const context=data as OpsContext;
 if(context.userId!==user.id)throw new OpsError('unauthenticated','Your account session changed. Sign in again.');
 const scope=scopeId?context.scopes.find(s=>s.id===scopeId):undefined;
 if(scopeId&&(!scope||permission&&!scope.permissions.includes(permission)))throw new OpsError('forbidden','This workspace or action is not assigned to your account.');
 return {db,user,context,scope};
}
export function trustedDatabase() {
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key||!process.env.NEXT_PUBLIC_SUPABASE_URL)throw new OpsError('unavailable','Private evidence and shared geology are awaiting server credential configuration. No data has been uploaded or reported as synced.');
 return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
export function capabilities() {return {release:OPS_RELEASE,evidence:!!process.env.SUPABASE_SERVICE_ROLE_KEY,sharedGeology:!!process.env.SUPABASE_SERVICE_ROLE_KEY,invitationEmail:!!process.env.SUPABASE_SERVICE_ROLE_KEY,storage:'shared-postgresql',independentObjectBackup:false};}
export async function sourceFile(db:Awaited<ReturnType<typeof database>>,scopeId:string,id:string,family?:string) {
 const files=await rpc(db,'mx_ops_files',{p_scope:scopeId,p_id:id});const f=files?.[0];
 if(!f||family&&f.family!==family)throw new OpsError('forbidden','The source is not accessible in this workspace.');return f;
}
export async function verifiedSource(db:Awaited<ReturnType<typeof database>>,scopeId:string,id:string,family='geo') {
 const f=await sourceFile(db,scopeId,id,family);if(f.status!=='verified')throw new OpsError('validation','Wait for the original source bytes to be verified.');
 const service=trustedDatabase();const {data,error}=await service.storage.from(EVIDENCE_BUCKET).download(f.object_path);
 if(error||!data)throw new OpsError('unavailable','The source file could not be loaded. Its record has not been changed.');
 const bytes=Buffer.from(await data.arrayBuffer());
 if(bytes.length!==Number(f.size_bytes)||createHash('sha256').update(bytes).digest('hex')!==f.sha256)throw new OpsError('validation','The stored source does not match its recorded checksum. Publication is blocked.');
 return {file:f,bytes};
}
class StrictXmlParser {
 parseFromString(text:string,mime:string) {
  const parser=new DOMParser({onError:(level:string,message:string)=>{if(level!=='warning')throw new Error('Malformed KML XML: '+message.slice(0,140));}});
  const doc=parser.parseFromString(text,mime as 'application/xml');
  const stack:[any,number][]=[[doc,0]];let count=0;
  while(stack.length){const [node,depth]=stack.pop()!;if(depth>128||++count>300000)throw new Error('XML structure exceeds the bounded import limit.');for(let child=node.firstChild;child;child=child.nextSibling)stack.push([child,depth+1]);}
  return doc;
 }
}
export async function parseSourceGeometry(file:{name:string},bytes:Buffer) {
 const ext=file.name.toLowerCase().split('.').pop();
 if(ext==='kml')return parseKml(bytes.toString('utf8'),StrictXmlParser as unknown as typeof globalThis.DOMParser);
 if(ext==='kmz'){
  const archive=await readKmz(new Uint8Array(bytes));const features:any[]=[],warnings:string[]=[];
  for(const doc of archive.documents){const parsed=parseKml(doc.text,StrictXmlParser as unknown as typeof globalThis.DOMParser,{allowEmpty:true});features.push(...parsed.data.features);warnings.push(...parsed.warnings);}
  if(archive.ignoredEntries)warnings.push(`${archive.ignoredEntries} embedded resources retained in original archive; not rendered.`);
  const parsed=parseGeoJson({type:'FeatureCollection',features});return {...parsed,warnings,stats:spatialStats(parsed.data)};
 }
 if(ext==='json'||ext==='geojson')return parseGeoJson(bytes.toString('utf8'));
 throw new OpsError('validation','Choose a KML, KMZ or GeoJSON source.');
}
export async function loadGeology(db:Awaited<ReturnType<typeof database>>,scope:any) {
 for(let attempt=0;attempt<3;attempt++){
  let project:any=newSharedProject(scope),versions:Record<string,number>={},revision:number|undefined,metadataVersion=0,changed=false;
  for(const kind of GEO_KINDS){let cursor:string|null=null,rows:any[]=[];
   for(;;){const page=await rpc(db,'mx_ops_geo_page',{p_scope:scope.id,p_kind:kind,p_after:cursor,p_limit:1000});
    if(revision===undefined){revision=page.revision;metadataVersion=page.project?.version||0;if(page.project)project={...project,...page.project.data};}
    if(page.revision!==revision){changed=true;break;}
    for(const row of page.rows){versions[`${kind}:${row.id}`]=row.version;rows.push({...row.data,recordId:row.id});}
    if(rows.length>10000)throw new OpsError('validation','This project exceeds the current full-field-pack limit. Split the authorised field scope before loading.');
    if(page.rows.length<1000)break;cursor=page.rows[page.rows.length-1].id;
   }project[kind]=rows;if(changed)break;
  }
  if(!changed)return {project,versions,revision,metadataVersion,asOf:new Date().toISOString()};
 }
 throw new OpsError('conflict','The project is changing while loading. Retry; no local changes have been discarded.');
}
export async function geologyCommand(command:Command,dryRun=false) {
 const permission=GEO_ACTIONS[command.action as keyof typeof GEO_ACTIONS];if(!permission)throw new OpsError('validation','Unknown geological operation.');
 const {db,user,scope,context}=await requireOperations(command.scopeId,permission);
 if(['geo.assay.release','geo.assay.hold','geo.dispatch.exception','geo.migrate'].includes(command.action)&&context.aal!=='aal2')throw new OpsError('mfa_required','Verify your authenticator before this review or migration.');
 if(command.expectedActorId&&command.expectedActorId!==user.id)throw new OpsError('forbidden','The signed-in account changed. Reopen this entry under its original account.');
 const service=trustedDatabase();
 // A lost acknowledgement is resolved before regenerating server timestamps/IDs.
 const prior=await rpc(db,'mx_ops_geo_receipt',{p_scope:command.scopeId,p_request:command.requestId});
 if(prior&&!dryRun){const {data,error}=await service.rpc('mx_ops_geo_commit',{p_scope:command.scopeId,p_actor:user.id,p_aal:context.aal,p_request:command.requestId,p_action:command.action,p_target:command.id,p_intent:command,p_changes:[],p_metadata:null});if(error)throw classifyDatabaseError(error);return data;}
 const baseline=await loadGeology(db,scope);const payload=command.payload as any;let supplied:any={};
 const target=GEO_KINDS.find(kind=>baseline.project[kind]?.some((r:any)=>r.recordId===command.id));
 if(target&&versionAt(baseline.versions,target,command.id)!==command.expectedVersion)throw new OpsError('conflict','This record has a newer shared revision. Compare it before retrying.');
 if(!target&&command.expectedVersion!==0)throw new OpsError('conflict','The expected shared record is missing. Nothing has been replaced.');
 if(payload.sourceFileId){const source=await verifiedSource(db,command.scopeId,payload.sourceFileId);supplied={sourceFile:source.file,sourceText:source.bytes.toString('utf8')};
  if(command.action==='geo.layer.import')supplied.parsedSpatial=await parseSourceGeometry(source.file,source.bytes);
  if(command.action==='geo.migrate'){
   let store:any;try{const parsed=JSON.parse(supplied.sourceText);store=parsed.format==='mineralx-workspace-backup'?(await readBackup(supplied.sourceText)).store:parsed.store||parsed;}catch{try{store=(await readBackup(supplied.sourceText)).store;}catch{throw new OpsError('validation','Choose the complete MineralX backup or versioned workspace JSON.');}}
   if(store.projects?.length!==1)throw new OpsError('validation','Export a single-project migration package before uploading. A shared project must not expose another project’s records.');
   const candidate=store.projects?.find((p:any)=>p.id===payload.legacyProjectId);if(!candidate)throw new OpsError('validation','Select the original project in this backup.');supplied.migrationProject=candidate;
  }
 }
 if(command.action==='geo.assay.release'){const b=baseline.project.assayBatches.find((b:any)=>b.recordId===command.id);if(b?.sourceFileId)await verifiedSource(db,command.scopeId,b.sourceFileId);}
 let next:any;try{next=await applyGeoCommand(baseline.project,command,user.id,supplied);}catch(e){throw new OpsError('validation',e instanceof Error?e.message:'Invalid geology record.');}
 const changes=changeSet(baseline.project,next,baseline.versions),before=projectMetadata(baseline.project),after=projectMetadata(next);
 const metadata=JSON.stringify(before)!==JSON.stringify(after)||!baseline.metadataVersion?{expectedVersion:baseline.metadataVersion,data:after}:null;
 if(dryRun)return {dryRun:true,scopeId:command.scopeId,summary:GEO_KINDS.map(kind=>({kind,existing:baseline.project[kind]?.length||0,after:next[kind]?.length||0,changed:changes.filter((c:any)=>c.kind===kind).length})),warnings:next.migrationWarnings||supplied.parsedSpatial?.warnings||[],project:command.action==='geo.layer.import'?supplied.parsedSpatial:null};
 const {data,error}=await service.rpc('mx_ops_geo_commit',{p_scope:command.scopeId,p_actor:user.id,p_aal:context.aal,p_request:command.requestId,p_action:command.action,p_target:command.id,p_intent:command,p_changes:changes,p_metadata:metadata});
 if(error)throw classifyDatabaseError(error);return data;
}
