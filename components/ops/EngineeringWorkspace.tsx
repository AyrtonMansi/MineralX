'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {useMemo,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {Heading,Empty,Status} from './primitives';
import {EvidenceLink,WorkflowHistory} from './Workflow';
import {useOperations} from './OperationsProvider';
import {plantSchema} from '@/lib/plant/model';
import plan from '@/data/plant-p5.json';
import '@/app/plant/plant.css';

const PlantDashboard=dynamic(()=>import('@/components/plant/PlantDashboard').then(mod=>mod.PlantDashboard),{ssr:false,loading:()=> <p role="status">Loading preserved P5 reference…</p>});
const model=plantSchema.parse(plan);
const evidenceRequiredStates=new Set(['review','approved','implementing','commissioned','as_built','superseded']);
const closedTaskStates=new Set(['resolved','cancelled']);

function normalState(value:unknown){return String(value||'concept').toLowerCase().replaceAll('-','_').replaceAll(' ','_');}
function updatedValue(record:any){return String(record.updated_at||record.created_at||'');}
function programName(data:any,id?:string|null){
 if(!id)return 'Not linked';
 const record=(data?.programs||[]).find((p:any)=>p.id===id),value=record?.data||record;
 return value?.name||record?.name||'Linked program';
}
function reviewerLabel(record:any){return record.reviewed_by?'Reviewer recorded':'Review not recorded';}
function operatingBasis(records:any[]){
 const candidates=records.filter(r=>['as_built','commissioned'].includes(normalState(r.state)));
 return candidates.sort((a,b)=>{
  const stateDelta=(normalState(a.state)==='as_built'?0:1)-(normalState(b.state)==='as_built'?0:1);
  return stateDelta||updatedValue(b).localeCompare(updatedValue(a));
 })[0]||null;
}

export default function EngineeringWorkspace({data,write,edit}:{data:any;write:boolean;edit:(kind:string,record?:any,initial?:any)=>void}){
 const {scope}=useOperations(),query=useSearchParams(),[search,setSearch]=useState(''),[state,setState]=useState('all'),[program,setProgram]=useState('all'),[sort,setSort]=useState('updated'),[implementationOnly,setImplementationOnly]=useState(false),[evidenceOnly,setEvidenceOnly]=useState(false),[p5Open,setP5Open]=useState(false);
 const revisions=data?.engineering||[],item=query.get('item'),selected=revisions.find((r:any)=>r.id===item)||null;
 const scopeId=scope?.id||'';
 const linkFor=(id?:string)=>`/ops/plant?scope=${scopeId}&view=engineering${id?`&item=${id}`:''}`;
 const basis=useMemo(()=>operatingBasis(revisions),[revisions]);
 const programIds=useMemo(()=>new Set(revisions.map((r:any)=>r.program_id).filter(Boolean)),[revisions]);
 const openImplementation=(data?.tasks||[]).filter((t:any)=>t.program_id&&programIds.has(t.program_id)&&!closedTaskStates.has(t.status));
 const inReview=revisions.filter((r:any)=>normalState(r.state)==='review').length;
 const evidenceGaps=revisions.filter((r:any)=>evidenceRequiredStates.has(normalState(r.state))&&!r.source_file_id);
 const programOptions=useMemo(()=>[...new Map(revisions.filter((r:any)=>r.program_id).map((r:any)=>[r.program_id,programName(data,r.program_id)])).entries()].sort((a,b)=>String(a[1]).localeCompare(String(b[1]))),[revisions,data]);
 const visible=useMemo(()=>{
  const needle=search.trim().toLowerCase();
  return [...revisions].filter((r:any)=>{
   if(needle&&!`${r.reference||''} ${r.title||''} ${programName(data,r.program_id)}`.toLowerCase().includes(needle))return false;
   if(state!=='all'&&normalState(r.state)!==state)return false;
   if(program!=='all'&&r.program_id!==program)return false;
   if(implementationOnly&&!(data?.tasks||[]).some((t:any)=>t.program_id===r.program_id&&!closedTaskStates.has(t.status)))return false;
   if(evidenceOnly&&!(evidenceRequiredStates.has(normalState(r.state))&&!r.source_file_id))return false;
   return true;
  }).sort((a:any,b:any)=>sort==='reference'?String(a.reference||'').localeCompare(String(b.reference||'')):updatedValue(b).localeCompare(updatedValue(a)));
 },[revisions,data,search,state,program,sort,implementationOnly,evidenceOnly]);
 const predecessor=selected?.supersedes?revisions.find((r:any)=>r.id===selected.supersedes):null;
 const successor=selected?revisions.find((r:any)=>r.supersedes===selected.id):null;
 const linkedTasks=selected?.program_id?(data?.tasks||[]).filter((t:any)=>t.program_id===selected.program_id&&!closedTaskStates.has(t.status)):[];
 const summaryFilter=(kind:'review'|'implementation'|'evidence')=>{
  setSearch('');setProgram('all');setState(kind==='review'?'review':'all');setImplementationOnly(kind==='implementation');setEvidenceOnly(kind==='evidence');
 };
 return <section className={`ops-engineering ${selected?'has-selection':''}`}>
  <Heading title="Engineering" action={write&&<button className="ops-primary" disabled={!data} onClick={()=>edit('engineering')}>New revision</button>}/>
  {!revisions.length&&<Empty title="No engineering revisions yet">Create the first controlled revision. The preserved P5 plan remains reference context rather than an automatically certified as-built record.</Empty>}
  {!!revisions.length&&<>
   <section className="engineering-summary" aria-labelledby="engineering-summary-heading"><h2 id="engineering-summary-heading" className="ops-sr-only">Engineering status summary</h2>
    <Link href={basis?linkFor(basis.id):linkFor()} className="engineering-summary-cell"><span>Operating basis</span><strong>{basis?.reference||'Not established'}</strong><small>{basis?normalState(basis.state).replaceAll('_',' '):'No as-built or commissioned revision'}</small></Link>
    <button className="engineering-summary-cell" onClick={()=>summaryFilter('review')}><span>In review</span><strong>{inReview}</strong><small>{inReview===1?'revision':'revisions'}</small></button>
    <button className="engineering-summary-cell" onClick={()=>summaryFilter('implementation')}><span>Implementation</span><strong>{openImplementation.length}</strong><small>open work items</small></button>
    <button className="engineering-summary-cell" onClick={()=>summaryFilter('evidence')}><span>Evidence gaps</span><strong>{evidenceGaps.length}</strong><small>{evidenceGaps.length===1?'revision':'revisions'}</small></button>
   </section>
   <div className="engineering-tools">
    <label className="engineering-search">Search revisions<span className="ops-sr-only"> by reference, title or programme</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Reference, title or programme"/></label>
    <label>State<select value={state} onChange={e=>{setState(e.target.value);setImplementationOnly(false);setEvidenceOnly(false);}}><option value="all">All states</option>{[...new Set(revisions.map((r:any)=>normalState(r.state)))].sort().map((v:any)=><option key={v} value={v}>{String(v).replaceAll('_',' ')}</option>)}</select></label>
    {programOptions.length>0&&<label>Programme<select value={program} onChange={e=>setProgram(e.target.value)}><option value="all">All programmes</option>{programOptions.map(([id,name]:any)=><option key={id} value={id}>{name}</option>)}</select></label>}
    <label>Sort<select value={sort} onChange={e=>setSort(e.target.value)}><option value="updated">Updated</option><option value="reference">Reference</option></select></label>
    {(implementationOnly||evidenceOnly)&&<button className="ops-link" onClick={()=>{setImplementationOnly(false);setEvidenceOnly(false);}}>Clear summary filter</button>}
   </div>
   <div className="engineering-workspace">
    <div className="engineering-register-pane">
     <div className="engineering-register-count">{visible.length} of {revisions.length} revisions</div>
     <div className="engineering-table-scroll"><table className="engineering-register"><thead><tr><th scope="col">Reference</th><th scope="col">Title</th><th scope="col">State</th><th scope="col">Programme</th><th scope="col">Evidence</th><th scope="col">Updated</th></tr></thead><tbody>{visible.map((r:any)=>{
      const current=selected?.id===r.id;
      return <tr key={r.id} className={current?'is-selected':''}><td><Link href={linkFor(r.id)} aria-label={`Open ${r.reference||'revision'} ${r.title||''}`}>{r.reference||'—'}</Link></td><td>{r.title||'Untitled revision'}</td><td><Status>{normalState(r.state).replaceAll('_',' ')}</Status></td><td>{programName(data,r.program_id)}</td><td>{r.source_file_id?'Verified source':'No source attached'}</td><td>{updatedValue(r)?new Date(updatedValue(r)).toLocaleDateString('en-AU'):'—'}</td></tr>;
     })}</tbody></table></div>
     {!visible.length&&<Empty title="No revisions match these filters">Clear a filter or search term to return to the complete loaded register.</Empty>}
    </div>
    {selected?<aside className="engineering-inspector" aria-labelledby="revision-title">
      <div className="engineering-mobile-back"><Link href={linkFor()}>← All revisions</Link></div>
      <div className="engineering-inspector-head"><div><span className="ops-eyebrow">{selected.reference||'Engineering revision'}</span><h2 id="revision-title">{selected.title||'Untitled revision'}</h2></div><Status>{normalState(selected.state).replaceAll('_',' ')}</Status></div>
      <dl className="engineering-facts"><div><dt>Decision context</dt><dd>{selected.notes||'No design basis or change rationale recorded.'}</dd></div><div><dt>Lineage</dt><dd>{predecessor?<Link href={linkFor(predecessor.id)}>Supersedes {predecessor.reference||'previous revision'} →</Link>:selected.supersedes?'Predecessor is outside the loaded scope':'No predecessor recorded'}{successor&&<><br/><Link href={linkFor(successor.id)}>Superseded by {successor.reference||'later revision'} →</Link></>}</dd></div><div><dt>Evidence</dt><dd>{selected.source_file_id?<EvidenceLink id={selected.source_file_id} label="Open verified source evidence"/>:<strong>No source attached</strong>}</dd></div><div><dt>Implementation</dt><dd>{selected.program_id?<><Link href={`/ops/programs?scope=${scopeId}&item=${selected.program_id}`}>{programName(data,selected.program_id)} →</Link><br/><span>{linkedTasks.length} open work {linkedTasks.length===1?'item':'items'}</span></>:'No implementation programme linked'}</dd></div><div><dt>Review</dt><dd>{reviewerLabel(selected)}{selected.reviewed_by&&<small className="engineering-id">{selected.reviewed_by}</small>}</dd></div><div><dt>Updated</dt><dd>{updatedValue(selected)?new Date(updatedValue(selected)).toLocaleString('en-AU'):'Not recorded'}</dd></div></dl>
      <div className="ops-actions">{write&&<button onClick={()=>edit('engineering',selected)}>Review / update revision</button>}<Link href={`/ops/work?scope=${scopeId}&action=task&kind=issue&program=${selected.program_id||''}`}>Raise linked work</Link></div>
      <WorkflowHistory id={selected.id}/>
     </aside>:<aside className="engineering-inspector engineering-inspector-empty"><p>Select a revision to inspect its evidence, lineage, implementation relationship and history.</p></aside>}
   </div>
  </>}
  <details className="ops-card engineering-p5" open={p5Open} onToggle={e=>setP5Open((e.currentTarget as HTMLDetailsElement).open)}><summary>P5 engineering reference — preserved layout</summary><p>This is reference context, not automatically certified as-built geometry. Private revision decisions remain in the controlled register above.</p>{p5Open&&<div className="plant-app ops-embedded-plant"><PlantDashboard model={model} readOnly embedded/></div>}</details>
  <style jsx>{`
   .ops-engineering{min-width:0}.engineering-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid var(--ops-line);border-radius:6px;overflow:hidden;margin:2px 0 16px;background:#fff}.engineering-summary-cell{appearance:none;border:0;border-right:1px solid var(--ops-line);border-radius:0;background:#fff;color:var(--ops-ink);padding:14px 16px;text-align:left;text-decoration:none;min-height:82px;display:flex;flex-direction:column;justify-content:center}.engineering-summary-cell:last-child{border-right:0}.engineering-summary-cell:hover{background:#fafbf9;text-decoration:none}.engineering-summary-cell span{font-size:10px;color:var(--ops-muted)}.engineering-summary-cell strong{font-size:17px;font-weight:600;margin-top:4px}.engineering-summary-cell small{font-size:10px;color:var(--ops-muted);margin-top:3px;text-transform:none}.engineering-tools{display:grid;grid-template-columns:minmax(220px,1fr) 140px 190px 130px auto;gap:8px;align-items:end;margin:0 0 12px}.engineering-tools label{display:grid;gap:4px}.engineering-tools input,.engineering-tools select{width:100%}.engineering-workspace{display:grid;grid-template-columns:minmax(0,2fr) minmax(280px,1fr);gap:14px;align-items:start}.engineering-register-pane,.engineering-inspector{border:1px solid var(--ops-line);border-radius:6px;background:#fff;min-width:0}.engineering-register-count{padding:10px 12px;border-bottom:1px solid var(--ops-line);font-size:11px;color:var(--ops-muted)}.engineering-table-scroll{overflow:auto}.engineering-register{width:100%;border-collapse:collapse}.engineering-register th{white-space:nowrap}.engineering-register td{font-size:12px;vertical-align:middle;border-top:1px solid #edf0ed}.engineering-register td:first-child{font-weight:600}.engineering-register tr.is-selected{background:#f6f8f5;box-shadow:inset 2px 0 0 var(--ops-green)}.engineering-register tr.is-selected td:first-child a{color:var(--ops-green)}.engineering-inspector{padding:18px}.engineering-inspector-empty{min-height:180px;display:flex;align-items:center;color:var(--ops-muted)}.engineering-inspector-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.engineering-inspector-head h2{margin:4px 0 0}.engineering-facts{margin:16px 0}.engineering-facts>div{border-top:1px solid var(--ops-line);padding:11px 0}.engineering-facts dt{font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--ops-muted);margin-bottom:5px}.engineering-facts dd{margin:0;font-size:12px;line-height:1.5;overflow-wrap:anywhere}.engineering-id{display:block;color:var(--ops-muted);margin-top:3px}.engineering-mobile-back{display:none}.engineering-p5{margin-top:14px}
   @media(max-width:900px){.engineering-summary{grid-template-columns:repeat(2,1fr)}.engineering-summary-cell:nth-child(2){border-right:0}.engineering-summary-cell:nth-child(-n+2){border-bottom:1px solid var(--ops-line)}.engineering-tools{grid-template-columns:1fr 1fr}.engineering-search{grid-column:1/-1}.engineering-workspace{grid-template-columns:minmax(0,1.5fr) minmax(250px,1fr)}}
   @media(max-width:700px){.engineering-summary{grid-template-columns:repeat(2,1fr)}.engineering-tools{grid-template-columns:1fr 1fr}.engineering-workspace{display:block}.engineering-inspector-empty{display:none}.engineering-inspector{padding:14px}.engineering-mobile-back{display:block;margin-bottom:12px}.has-selection .engineering-summary,.has-selection .engineering-tools,.has-selection .engineering-register-pane,.has-selection .engineering-p5{display:none}.engineering-table-scroll{overflow:visible}.engineering-register thead{display:none}.engineering-register,.engineering-register tbody,.engineering-register tr,.engineering-register td{display:block}.engineering-register tr{padding:12px 14px;border-top:1px solid var(--ops-line)}.engineering-register tr:first-child{border-top:0}.engineering-register td{border:0;padding:2px 0}.engineering-register td:nth-child(1){font-size:13px}.engineering-register td:nth-child(3),.engineering-register td:nth-child(5),.engineering-register td:nth-child(6){display:inline-block;margin-right:8px}.engineering-register td:nth-child(4){color:var(--ops-muted)}.engineering-register-count{padding:10px 14px}}
  `}</style>
 </section>;
}
