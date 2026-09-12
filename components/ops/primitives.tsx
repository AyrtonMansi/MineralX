'use client';
import React,{useEffect,useState} from 'react';
import Link from 'next/link';
import {api} from '@/lib/ops/client';
import {retainResourceOnFailure} from '@/lib/ops/resource-policy';
import {useOperations} from './OperationsProvider';
export function Status({children,tone='neutral'}:{children:React.ReactNode;tone?:string}){return <span className={`ops-status ${tone}`}>{children}</span>;}
export function Message({children,error=false}:{children:React.ReactNode;error?:boolean}){return <div role={error?'alert':'status'} className={`ops-message ${error?'ops-error':''}`}>{children}</div>;}
export function Empty({title,children}:{title:string;children:React.ReactNode}){return <section className="ops-empty"><h3>{title}</h3><p>{children}</p></section>;}
export function Heading({title,description,action}:{title:string;description?:string;action?:React.ReactNode}){
 return <header className={`ops-heading ${action?'ops-heading-with-action':'ops-heading-empty'}`}>
  <h1 className="ops-sr-only">{title}</h1>
  {description&&<p className="ops-sr-only">{description}</p>}
  {action}
 </header>;
}
export function Quantity({value,unit='g',missing='Not recorded'}:{value:unknown;unit?:string;missing?:string}){if(value===null||value===undefined||value==='')return <span className="ops-muted">{missing}</span>;const n=Number(value);return <span className="ops-number">{Number.isFinite(n)?new Intl.NumberFormat('en-AU',{maximumFractionDigits:6}).format(n):String(value)} <small>{unit}</small></span>;}
export function useResource<T=any>(path:string|null){
 const {revision,offlineMode,context}=useOperations();
 const key=path&&!offlineMode?`${context?.userId||'anonymous'}:${path}`:null;
 const [state,setState]=useState<{key:string|null;data:T|null;error:string;loading:boolean}>({key:null,data:null,error:'',loading:false});
 const [nonce,reload]=useState(0);
 useEffect(()=>{let cancelled=false;
  if(!key||!path){setState({key:null,data:null,error:'',loading:false});return;}
  setState(old=>({key,data:old.key===key?old.data:null,error:'',loading:true}));
  api<T>(path).then(data=>{if(!cancelled)setState({key,data,error:'',loading:false});})
   .catch(e=>{if(!cancelled)setState(old=>({key,data:retainResourceOnFailure(e)&&old.key===key?old.data:null,error:e.message,loading:false}));});
  return()=>{cancelled=true;};
 },[key,path,revision,nonce]);
 return {data:state.key===key?state.data:null,error:state.key===key?state.error:'',loading:!!key&&(state.key!==key||state.loading),reload:()=>reload(x=>x+1)};
}
export function Register({kind,columns,empty='No records yet',onOpen}:{kind:string;columns:{key:string;label:string;render?:(r:any)=>React.ReactNode}[];empty?:string;onOpen?:(r:any)=>void}){
 const {scope,revision}=useOperations(),[rows,setRows]=useState<any[]>([]),[after,setAfter]=useState<string|null>(null),[next,setNext]=useState<string|null>(null),[filter,setFilter]=useState('');const path=scope?`register?scope=${scope.id}&kind=${kind}${after?'&after='+after:''}`:null,{data,error,loading}=useResource(path);
 useEffect(()=>{setRows([]);setAfter(null);},[scope?.id,kind,revision]);useEffect(()=>{if(data){setRows(old=>after?[...old.filter(r=>!data.rows.some((n:any)=>(n.id||n.lot_id)===(r.id||r.lot_id))),...data.rows]:data.rows);setNext(data.next);}else if(error){setRows([]);setNext(null);}},[data,after,error]);
 const shown=rows.filter(r=>!filter||columns.some(c=>String(r[c.key]||'').toLowerCase().includes(filter.toLowerCase())));
 return <section className="ops-card"><div className="ops-table-tools"><label>Find in loaded records<input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Reference or status"/></label><span>{rows.length} loaded{next?' · more available':''}</span></div>{error&&<Message error>{error}</Message>}{loading&&!rows.length?<p role="status">Loading records…</p>:!rows.length?<Empty title={empty}>Recorded work appears here after it is committed. Missing entries are not treated as measured zero.</Empty>:<div className="ops-table-scroll"><table><thead><tr>{columns.map(c=><th key={c.key}>{c.label}</th>)}{onOpen&&<th><span className="ops-sr-only">Open</span></th>}</tr></thead><tbody>{shown.map(r=><tr key={r.id||r.lot_id}>{columns.map(c=><td key={c.key}>{c.render?c.render(r):String(r[c.key]??'—')}</td>)}{onOpen&&<td><button className="ops-link" onClick={()=>onOpen(r)}>Open <span className="ops-sr-only">{r.reference||r.name||r.id}</span></button></td>}</tr>)}</tbody></table></div>}{next&&<button disabled={loading} onClick={()=>setAfter(next)}>Load next 100 records</button>}</section>;
}
export function LinkTo({area,children,params=''}:{area:string;children:React.ReactNode;params?:string}){const {scope}=useOperations();return <Link href={`/ops${area==='home'?'':'/'+area}?scope=${scope?.id||''}${params?'&'+params:''}`}>{children}</Link>;}
