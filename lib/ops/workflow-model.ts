/** Pure presentation calculations. SQL validates quantities and remains the record authority. */
export const programStates=['draft','planned','ready','in_progress','blocked','on_hold','completed','cancelled'] as const;
export const taskStates=['open','ready','in_progress','blocked','on_hold','resolved','cancelled'] as const;
export function programRows(data:any){return (data?.programs||[]).map((p:any)=>({...p.data,id:p.id,recordId:p.id,version:p.version,scope_id:p.scope_id,updated_at:p.updated_at}));}
export function resourcesFor(data:any,members:any[]=[],otherTasks:any[]=[]){
 const tasks=data?.tasks||[];
 return {types:(data?.types||[]).map((t:any)=>({...t,id:t.key,name:t.label})),programs:programRows(data),tasks,packages:tasks.filter((t:any)=>t.kind==='package'&&!['resolved','cancelled'].includes(t.status)),predecessors:[...tasks,...otherTasks].map((t:any)=>({...t,name:t.title,reference:t.title})),people:(data?.people||[]).filter((p:any)=>p.active),assets:data?.assets||[],tanks:(data?.assets||[]).filter((a:any)=>a.kind==='tank'&&!['proposed','retired'].includes(a.state)),members:members.map((m:any)=>({...m,id:m.user_id||m.id,name:m.name||m.display_name||m.email||m.user_id})),engineering:data?.engineering||[],spares:data?.spares||[]};
}
export function blockers(task:any,data:any){return (data?.dependencies||[]).filter((d:any)=>d.task_id===task.id&&(d.status!=='resolved'||d.kind==='maintenance'&&!d.verified));}
export function localDay(zone:string,date=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
export function taskDue(task:any,zone:string){return task.due_on|| (task.due_at?localDay(zone,new Date(task.due_at)):null);}
export function tankBalance(tank:string,events:any[]){
 const rows=events.filter(e=>!e.void_reason&&(e.tank_id===tank||e.other_tank_id===tank)).sort((a,b)=>Date.parse(a.occurred_at)-Date.parse(b.occurred_at)||((a.kind==='opening'?0:1)-(b.kind==='opening'?0:1))||String(a.created_at).localeCompare(b.created_at)||a.id.localeCompare(b.id));
 let balance:number|null=null,dip:{observed:number;expected:number|null;difference:number|null;at:string}|null=null;
 for(const e of rows){const q=Number(e.litres);if(e.kind==='opening')balance=q;else if(e.kind==='dip')dip={observed:q,expected:balance,difference:balance==null?null:q-balance,at:e.occurred_at};else if(balance!==null)balance+=(e.kind==='delivery'||e.kind==='transfer'&&e.other_tank_id===tank?q:-q);}
 return {balance,dip};
}
export function energySummary(readings:any[],from:string,to:string){
 const lo=Date.parse(from),hi=Date.parse(to),live=readings.filter(r=>!r.void_reason),inside=live.filter(r=>Date.parse(r.started_at)>=lo&&Date.parse(r.ended_at)<=hi&&Date.parse(r.ended_at)>lo),partial=live.filter(r=>Date.parse(r.started_at)<hi&&Date.parse(r.ended_at)>lo&&!inside.includes(r));
 const sum=(kind:string)=>{const a=inside.filter(r=>r.kind===kind);return a.length?a.reduce((s,r)=>s+Number(r.amount),0):null;};
 return {diesel:sum('diesel_generation'),solar:sum('solar_generation'),grid:sum('grid_import'),load:sum('load'),hours:sum('generator_hours'),partial:partial.length,count:inside.length};
}
export function nextGoldAction(detail:any,policy:any={}){
 const lot=detail?.record||{};
 if(lot.review_state==='held'||lot.status==='held')return {key:'reviewGold',title:'Resolve the hold with an independent reviewer',description:'A hold is not a completed approval. Check the recorded reason and source evidence before proceeding.'};
 if(detail?.lineage?.some((edge:any)=>edge.parent_id===lot.id)||detail?.custody?.status==='consumed'||lot.status==='void')return {key:null,title:'Historical physical lot',description:'Follow its recorded lineage. Do not count this material again.'};
 if(!detail?.weights?.length)return {key:'weight',title:'Record the measured weight',description:'The physical lot exists. Record an actual net mass, or a measured gross and tare.'};
 if(!detail?.assays?.some((a:any)=>a.qualifier==='='&&a.status!=='held'))return {key:'assay',title:'Record the product assay',description:'Fine gold is not established by product mass alone. Preserve the original certificate and qualifier.'};
 if(lot.review_state!=='verified')return {key:'reviewGold',title:'Independent verification required',description:'A different authorised reviewer selects the supporting weight and exact assay.'};
 if(!detail.production){
  if(policy.recognition_confirmed!==true)return {key:null,title:'Confirm the facility recognition policy',description:'An authorised administrator must establish the production-recognition point before any posting. Verified weight and assay remain separate from recognised production.'};
  if(policy.recognition_form&&lot.form!==policy.recognition_form)return {key:null,title:'Await the configured recognition point',description:`The facility recognises ${policy.recognition_form.replaceAll('_',' ')}. Record any real pour or transformation through custody; do not change physical form to make a KPI.`};
  return {key:'recognise',title:'Review production recognition',description:'Recognition is separate from custody and ownership. The ledger prevents counting ancestor and descendant material twice.'};
 }
 return {key:null,title:'Production recorded — check handover and commercial follow-up',description:'Use the independent custody, ownership and settlement records below. A dispatch is not a received transfer.'};
}
