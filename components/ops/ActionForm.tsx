'use client';
import React,{useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {newCommand,uploadEvidence} from '@/lib/ops/client';
import type {Command} from '@/lib/ops/contracts';
import {localDateTime,zonedTimestamp} from '@/lib/ops/time';
import {useOperations} from './OperationsProvider';import {Message} from './primitives';import type {ActionSpec,Field} from './action-specs';

export function EvidencePicker({value,onChange,family='gold',required=false,files=[]}:{value:string;onChange:(id:string)=>void;family?:string;required?:boolean;files?:any[]}){
 const {scope,context,online,offlineMode}=useOperations();const [error,setError]=useState(''),[busy,setBusy]=useState(false),[added,setAdded]=useState<any[]>([]);const identity=useRef<{id:string;requestId:string}|undefined>();
 const candidates=[...files,...added].filter(f=>f.status==='verified'&&(f.family===family||f.family==='plant'&&family==='gold'));
 return <div className="ops-evidence"><select required={required} value={value||''} onChange={e=>onChange(e.target.value)} aria-label="Verified source evidence"><option value="">{required?'Choose verified source':'Not yet attached'}</option>{candidates.map(f=><option key={f.id} value={f.id}>{f.name} · {f.sha256?.slice(0,8)}</option>)}</select><label className="ops-file-button">{busy?'Uploading and verifying…':'Attach original file'}<input type="file" disabled={busy||!online||offlineMode||!context?.capabilities.evidence} onChange={async e=>{const file=e.target.files?.[0];if(!file||!scope)return;identity.current={id:crypto.randomUUID(),requestId:crypto.randomUUID()};setBusy(true);setError('');try{const f=await uploadEvidence(scope.id,family,file,identity.current);setAdded(a=>[...a,f]);onChange(f.id);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}/></label>{!context?.capabilities.evidence&&<small>Private file service is awaiting activation.</small>}{error&&<Message error>{error} Keep the source file; select it again to retry.</Message>}{value&&<small>Verified primary copy. Independent backup status is shown in Files.</small>}</div>;
}
function Fields({fields,values,onChange,resources,zone,prefix='entry'}:{fields:Field[];values:any;onChange:(next:any)=>void;resources:Record<string,any[]>;zone:string;prefix?:string}){
 return <div className="ops-form-grid">{fields.filter(f=>!f.when||f.when(values)).map(f=>{
 const id=`${prefix}-${f.key}`,value=values[f.key]??f.default??'';const set=(v:any)=>onChange({...values,[f.key]:v});
 if(f.type==='repeat')return <fieldset className="ops-wide ops-repeated" key={id}><legend>{f.label}</legend>{(Array.isArray(value)?value:[]).map((row:any,index:number)=><div className="ops-repeat-row" key={index}><Fields fields={f.fields||[]} values={row} onChange={next=>set(value.map((v:any,i:number)=>i===index?next:v))} resources={resources} zone={zone} prefix={`${id}-${index}`}/><button type="button" onClick={()=>set(value.filter((_:any,i:number)=>i!==index))}>Remove row {index+1}</button></div>)}<button type="button" onClick={()=>set([...(Array.isArray(value)?value:[]),{}])}>Add {f.label.toLowerCase()} row</button>{f.hint&&<small>{f.hint}</small>}</fieldset>;
 if(f.type==='multi')return <fieldset className="ops-wide ops-multiselect" key={id}><legend>{f.label}</legend>{(resources[f.resource||'']||[]).map(r=><label key={r.id||r.recordId}><input type="checkbox" checked={Array.isArray(value)&&value.includes(r.id||r.recordId)} onChange={e=>set(e.target.checked?[...(Array.isArray(value)?value:[]),r.id||r.recordId]:(value||[]).filter((v:string)=>v!==(r.id||r.recordId)))}/>{r.reference||r.name||r.id} <small>{r.status||''}</small></label>)}{!(resources[f.resource||'']||[]).length&&<p>No available records. Record the upstream work first.</p>}</fieldset>;
 if(f.type==='evidence')return <fieldset key={id} className="ops-wide"><legend>{f.label}</legend><EvidencePicker value={value} onChange={set} family={f.family} required={f.required} files={resources.files||[]}/></fieldset>;
 return <label key={id} htmlFor={id} className={f.type==='textarea'?'ops-wide':''}><span>{f.label}{f.required&&<span aria-label="required"> *</span>}</span>
 {f.type==='select'?<select id={id} required={f.required} value={value} onChange={e=>set(e.target.value)}><option value="">Select…</option>{f.options?.map(o=><option value={o} key={o}>{o.replaceAll('_',' ')}</option>)}{(resources[f.resource||'']||[]).map(r=><option key={r.id||r.user_id||r.recordId} value={r.id||r.user_id||r.recordId}>{r.reference||r.name||r.title||r.id}{r.net_g?' · '+r.net_g+' g':''}{r.au_percent?' · '+r.au_percent+'% Au':''}{r.status?' · '+r.status:''}</option>)}</select>:
 f.type==='textarea'?<textarea id={id} rows={3} required={f.required} maxLength={4000} value={value} onChange={e=>set(e.target.value)}/>:
 f.type==='check'?<input id={id} type="checkbox" checked={!!value} onChange={e=>set(e.target.checked)}/>:
 <input id={id} type={f.type==='datetime'?'datetime-local':f.type==='date'?'date':f.type==='number'?'number':'text'} step={f.type==='datetime'?1:f.type==='number'?'any':undefined} inputMode={f.type==='decimal'?'decimal':undefined} required={f.required} maxLength={f.type==='decimal'?24:240} value={f.type==='datetime'&&typeof value==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(value)?localDateTime(value,zone):value} onChange={e=>set(e.target.value)}/>}
 {f.type==='datetime'&&<small>{zone}; actual observation time</small>}{f.hint&&<small>{f.hint}</small>}</label>;
 })}</div>;
}
export function serialiseFields(fields:Field[],values:any,zone:string):any{
 const output={...values};for(const f of fields){const v=values[f.key];if(f.when&&!f.when(values)){delete output[f.key];continue;}
 if(f.type==='repeat'){output[f.key]=(v||[]).map((r:any)=>serialiseFields(f.fields||[],r,zone));continue;}
 if(f.type==='datetime'&&v)output[f.key]=/(Z|[+-]\d\d:\d\d)$/.test(v)?v:zonedTimestamp(v,zone);
 if(f.type==='number')output[f.key]=v===''||v==null?null:Number(v);
 if(['select','decimal'].includes(f.type||'')&&(v===''||v==null))output[f.key]=null;
 }
 return output;
}
export default function ActionForm({spec,initial={},recordId,expectedVersion=0,resources={},onComplete,onClose,extra={}}:{spec:ActionSpec;initial?:any;recordId?:string;expectedVersion?:number;resources?:Record<string,any[]>;onComplete?:(result:any)=>void;onClose:()=>void;extra?:any}){
 const {scope,context,send,pack,saveDraft}=useOperations(),[values,setValues]=useState<any>(()=>({...spec.defaults,...initial})),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState('');const request=useRef<Command|null>(null),fingerprint=useRef('');
 const draftKey=`${spec.action}:${recordId||'new'}`;const hasPack=Boolean(pack);
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 useEffect(()=>{if(!dirty||!hasPack)return;const timer=setTimeout(()=>saveDraft(draftKey,values).catch(e=>setError(e.message)),600);return()=>clearTimeout(timer);},[dirty,values,draftKey,hasPack,saveDraft]);
 const can=!!scope?.permissions.includes(spec.permission),needsMfa=spec.mfa&&context?.aal!=='aal2';
 const close=()=>{if(busy)return;if(dirty&&!window.confirm('Leave the open entry? Any encrypted device draft is retained, but it has not been submitted.'))return;onClose();};
 return <section className="ops-card ops-editor" aria-label={spec.title}><div className="ops-editor-heading"><div><h2>{spec.title}</h2><p>{spec.description}</p></div><button type="button" onClick={close} disabled={busy}>Close</button></div><p className="ops-context-line">{scope?.name} · {recordId?`record revision ${expectedVersion}`:'new record'} · named account</p>{!can&&<Message error>This action is not assigned to your account.</Message>}{needsMfa&&<Message error>Verify your authenticator in <Link href={`/ops/account?scope=${scope?.id}`}>Account</Link> before committing this action. The draft stays here.</Message>}{error&&<Message error>{error}</Message>}{saved&&<Message>{saved}</Message>}
 {Boolean(pack?.drafts[draftKey])&&<button type="button" onClick={()=>{setValues(pack?.drafts[draftKey]);setDirty(true);}}>Restore saved device draft</button>}
 <form onSubmit={async e=>{e.preventDefault();if(!scope||!context||!can)return;setBusy(true);setError('');setSaved('');try{
  const payload=spec.prepare?spec.prepare(serialiseFields(spec.fields,values,scope.timezone),resources):serialiseFields(spec.fields,values,scope.timezone);const full={...payload,...extra};
  if(spec.action==='gold.transfer'&&!full.transfer_id)full.transfer_id=request.current?.payload.transfer_id||crypto.randomUUID();
  const mark=JSON.stringify({payload:full,id:recordId,version:expectedVersion,actor:context.userId});if(!request.current||fingerprint.current!==mark){request.current={...newCommand(scope.id,spec.action,full,recordId,expectedVersion),expectedActorId:context.userId};fingerprint.current=mark;}
  const result=await send(request.current);setDirty(false);try{await saveDraft(draftKey,null);}catch{setError('The record was committed, but this device draft could not be cleared. The same request is safe to retry.');}setSaved(result.localOnly?'Saved on this device; waiting for authorised synchronisation.':'Committed to MineralX.');onComplete?.(result);
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
 <Fields fields={spec.fields} values={values} onChange={next=>{setValues(next);setDirty(true);}} resources={resources} zone={scope?.timezone||'Australia/Brisbane'}/>
 <div className="ops-form-footer"><button type="submit" className="ops-primary" disabled={busy||!can||needsMfa}>{busy?'Confirming save…':spec.button}</button><span>{dirty?'Draft — not yet submitted':'No unsubmitted changes'}</span></div></form></section>;
}
