import {createHash} from 'node:crypto';
import {requireOperations,rpc,sourceFile,trustedDatabase,EVIDENCE_BUCKET} from '@/lib/ops/server';
import {OpsError} from '@/lib/ops/contracts';import {body,scopeFrom,uuid,noStore,failure} from '@/lib/ops/http';
export const dynamic='force-dynamic';export const maxDuration=60;
export async function GET(request:Request){try{const scope=scopeFrom(request),q=new URL(request.url).searchParams,{db}=await requireOperations(scope);
 if(q.get('download')){const file=await sourceFile(db,scope,uuid.parse(q.get('download')));if(file.status!=='verified')throw new OpsError('validation','The file has not been verified.');
  const {data,error}=await db.storage.from(EVIDENCE_BUCKET).createSignedUrl(file.object_path,60,{download:file.name});if(error||!data)throw new OpsError('unavailable','The source download could not be authorised.');return noStore({url:data.signedUrl,expiresIn:60});}
 return noStore(await rpc(db,'mx_ops_files',{p_scope:scope,p_id:null}));}catch(e){return failure(e);}}
export async function POST(request:Request){try{const p=await body(request,16000),scope=uuid.parse(p.scopeId),{db,user}=await requireOperations(scope),id=uuid.parse(p.id);
 if(p.action==='upload.prepare'){
  const made=await rpc(db,'mx_ops_command',{p_scope:scope,p_request:uuid.parse(p.requestId),p_action:'file.prepare',p_id:id,p_expected:0,p_payload:p.file});
  const {data,error}=await db.storage.from(EVIDENCE_BUCKET).createSignedUploadUrl(made.record.object_path,{upsert:false});if(error||!data)throw new OpsError('unavailable','The source record is staged; private upload authorisation failed. Retry with the same file request.');
  return noStore({record:made.record,token:data.token,path:data.path,url:data.signedUrl});
 }
 if(p.action==='upload.finalize'){
  const file=await sourceFile(db,scope,id);const service=trustedDatabase();const {data,error}=await service.storage.from(EVIDENCE_BUCKET).download(file.object_path);
  if(error||!data)throw new OpsError('unavailable','The upload has not completed. Keep the original file and retry verification.');
  const bytes=Buffer.from(await data.arrayBuffer());if(bytes.length>10485760)throw new OpsError('validation','File exceeds the allowed size.');
  const hash=createHash('sha256').update(bytes).digest('hex');const result=await service.rpc('mx_ops_file_finalize',{p_actor:user.id,p_scope:scope,p_id:id,p_hash:hash,p_bytes:bytes.length});if(result.error)throw new OpsError('validation','Uploaded source integrity or authorisation could not be verified.');return noStore({record:result.data});
 }
 throw new OpsError('validation','Unknown file action');
}catch(e){return failure(e);}}
