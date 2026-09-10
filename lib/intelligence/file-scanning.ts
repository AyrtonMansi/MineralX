import 'server-only';

import {createHash} from 'node:crypto';
import {OpsError} from '@/lib/ops/contracts';
import {evidenceContentViolation} from './evidence-validation';

export type CleanScanAttestation = {engine: string; status: 'clean'; scannedAt: string};

const SCAN_REPORT_LIMIT=64*1024;

function configuredEndpoint(value:string){
  const target=new URL(value);
  const developmentLoopback=process.env.NODE_ENV!=='production'&&target.protocol==='http:'
    &&['localhost','127.0.0.1','::1'].includes(target.hostname);
  if(target.username||target.password||(target.protocol!=='https:'&&!developmentLoopback)){
    throw new OpsError('unavailable','The scanning service must use a credential-free HTTPS address.');
  }
  return target;
}

async function boundedJson(response:Response){
  const announced=Number(response.headers.get('content-length')||0);
  if(Number.isFinite(announced)&&announced>SCAN_REPORT_LIMIT){
    await response.body?.cancel();
    throw new OpsError('unavailable','The scanning service returned an invalid report.');
  }
  if(!response.body)return null;
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];
  let size=0;
  for(;;){
    const {done,value}=await reader.read();
    if(done)break;
    size+=value.byteLength;
    if(size>SCAN_REPORT_LIMIT){
      await reader.cancel();
      throw new OpsError('unavailable','The scanning service returned an invalid report.');
    }
    chunks.push(value);
  }
  try{return JSON.parse(Buffer.concat(chunks.map(chunk=>Buffer.from(chunk)),size).toString('utf8')) as unknown;}
  catch{throw new OpsError('unavailable','The scanning service returned an invalid report.');}
}

/** Fail-closed in production. Scanner responses are deliberately reduced to a
 * non-sensitive attestation before entering MineralX lineage. */
export async function scanEvidenceBytes(
  bytes: Buffer,
  input: {name: string; mediaType: string; sha256: string},
): Promise<CleanScanAttestation> {
  if(createHash('sha256').update(bytes).digest('hex')!==input.sha256){
    throw new OpsError('validation','The source bytes do not match their recorded checksum.');
  }
  const contentViolation=evidenceContentViolation(bytes,input);
  if(contentViolation)throw new OpsError('validation',contentViolation);
  const endpoint = process.env.MINERALX_FILE_SCAN_URL;
  if (!endpoint) {
    if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
      throw new OpsError('unavailable', 'File intake is paused until the malware scanning service is configured.');
    }
    return {engine: 'development-validation', status: 'clean', scannedAt: new Date().toISOString()};
  }
  const target=configuredEndpoint(endpoint);
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  let response:Response;
  try{
    response=await fetch(target,{
      method:'POST',body,redirect:'error',signal:AbortSignal.timeout(60_000),
      headers:{
        Accept:'application/json',
        'Content-Type':input.mediaType,
        'X-MineralX-File-Name':encodeURIComponent(input.name),
        'X-MineralX-SHA256':input.sha256,
        ...(process.env.MINERALX_FILE_SCAN_TOKEN?{Authorization:`Bearer ${process.env.MINERALX_FILE_SCAN_TOKEN}`}:{})
      },
    });
  }catch{
    throw new OpsError('unavailable','The scanning service could not be reached. The source remains unapplied.');
  }
  if(!response.ok){
    await response.body?.cancel();
    throw new OpsError('unavailable','The scanning service could not confirm a result. The source remains unapplied.');
  }
  const report=await boundedJson(response);
  if(!report||typeof report!=='object'||Array.isArray(report)||(report as {clean?:unknown}).clean!==true){
    throw new OpsError('validation','The file did not pass the malware and content safety scan.');
  }
  const engine=typeof (report as {engine?:unknown}).engine==='string'?(report as {engine:string}).engine.trim():'';
  if(engine.length<2||engine.length>120||/[\u0000-\u001f\u007f]/.test(engine)){
    throw new OpsError('unavailable','The scanning service returned an invalid report.');
  }
  return {engine,status:'clean',scannedAt:new Date().toISOString()};
}
