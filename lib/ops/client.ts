'use client';
import {createBrowserClient} from '@supabase/ssr';
import {OpsError,type Command} from './contracts';
export function authClient(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;if(!url||!key)throw new OpsError('unavailable','MineralX identity is awaiting configuration.');return createBrowserClient(url,key);}
export async function api<T=any>(path:string,data?:unknown):Promise<T>{
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),60000);
 try{const res=await fetch('/api/ops/'+path,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),cache:'no-store',credentials:'same-origin',signal:controller.signal});
 const value=await res.json();if(!res.ok)throw new OpsError(value.error?.code||'unavailable',value.error?.message||'The request could not be confirmed.',value.error?.requestId);return value;
 }catch(e){if(e instanceof OpsError)throw e;throw new OpsError('unavailable','The connection was interrupted. Keep this entry; retry uses the same request so it cannot duplicate the record.');}finally{clearTimeout(timeout);}
}
export function newCommand(scopeId:string,action:string,payload:Record<string,unknown>,id=crypto.randomUUID(),expectedVersion=0):Command{return {scopeId,action,payload,id,expectedVersion,requestId:crypto.randomUUID()};}
export async function uploadEvidence(scopeId:string,family:string,file:File,identity?:{id:string;requestId:string}){
 if(!file.size||file.size>10485760)throw new Error('Choose a non-empty source file up to 10 MiB.');const bytes=await file.arrayBuffer();if(!bytes.byteLength||bytes.byteLength>10485760)throw new Error('Choose a non-empty source file up to 10 MiB.');
 const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 const ids=identity||{id:crypto.randomUUID(),requestId:crypto.randomUUID()};
 const ext=file.name.split('.').pop()?.toLowerCase();const media_type=ext==='kml'?'application/vnd.google-earth.kml+xml':ext==='kmz'?'application/vnd.google-earth.kmz':ext==='geojson'?'application/geo+json':ext==='csv'?'text/csv':file.type||'application/octet-stream';
 const prepared=await api('files',{scopeId,...ids,action:'upload.prepare',file:{family,name:file.name,media_type,size_bytes:bytes.byteLength,sha256}});
 const {error}=await authClient().storage.from('mineralx-ops-evidence').uploadToSignedUrl(prepared.path,prepared.token,file,{contentType:media_type,upsert:false});
 // A duplicate upload can mean the first upload succeeded but its acknowledgement was lost.
 // Finalisation verifies exact bytes/hash rather than guessing from the provider error string.
 const finalised=await api('files',{scopeId,id:ids.id,action:'upload.finalize'});return finalised.record;
}
export async function downloadEvidence(scopeId:string,id:string){const result=await api(`files?scope=${scopeId}&download=${id}`);const u=new URL(result.url);if(u.protocol!=='https:'&&u.hostname!=='localhost')throw new Error('Invalid download address');window.location.assign(u.href);}
export function downloadBlob(name:string,value:Blob|string,type='application/json'){const url=URL.createObjectURL(typeof value==='string'?new Blob([value],{type}):value);const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
