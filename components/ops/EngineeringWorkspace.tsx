'use client';

import Link from 'next/link';
import {useMemo,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {Empty,Status} from './primitives';
import {EvidenceLink,WorkflowHistory} from './Workflow';
import {useOperations} from './OperationsProvider';
import EngineeringCadPreview from './EngineeringCadPreview';

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
 const {scope}=useOperations(),query=useSearchParams(),[search,setSearch]=useState(''),[state,setState]=useState('all'),[program,setProgram]=useState('all'),[sort,setSort]=useState('updated'),[implementationOnly,setImplementationOnly]=useState(false),[evidenceOnly,setEvidenceOnly]=useState(false);
 const revisions=data?.engineering||[],item=query.get('item'),selected=revisions.find((r:any)=>r.id===item)||null,surface=(query.get('surface')==='revisions'||item)?'revisions':'cad';
 const scopeId=scope?.id||'',changesetId=query.get('changeset'),draft=query.get('draft');
 const surfaceLink=(next:'cad'|'revisions')=>`/ops/plant?scope=${scopeId}&view=engineering&surface=${next}`;
 const linkFor=(id?:string)=>`${surfaceLink('revisions')}${id?`&item=${id}`:''}`;
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
 return <section className="ops-engineering">
  <h1 className="ops-sr-only">Engineering</h1>
  <header className="engineering-commandbar">
   <nav className="engineering-commandnav" aria-label="Engineering workspace views"><Link href={surfaceLink('cad')} aria-current={surface==='cad'?'page':undefined}>Plant model</Link><Link href={surfaceLink('revisions')} aria-current={surface==='revisions'?'page':undefined}>Change control</Link></nav>
   <div className="engineering-command-actions"><span className="engineering-command-meta">{draft?'ChatGPT preview · unsaved':changesetId?'Design proposal · review only':'P5 · concept engineering basis'}</span>{surface==='revisions'&&write&&<button className="ops-primary" disabled={!data} onClick={()=>edit('engineering')}>New revision</button>}</div>
  </header>
  {surface==='cad'?<EngineeringCadPreview scopeId={scopeId} changesetId={changesetId} draft={draft}/>:<>
   <div className="engineering-statusline" aria-label="Engineering status">
    <Link href={basis?linkFor(basis.id):linkFor()}><strong>{basis?.reference||'—'}</strong><span>operating basis</span></Link>
    <button onClick={()=>summaryFilter('review')}><strong>{inReview}</strong><span>in review</span></button>
    <button onClick={()=>summaryFilter('implementation')}><strong>{openImplementation.length}</strong><span>open implementation</span></button>
    <button onClick={()=>summaryFilter('evidence')}><strong>{evidenceGaps.length}</strong><span>evidence gaps</span></button>
   </div>
   {!revisions.length?<Empty title="No engineering revisions yet">Create the first controlled change when the P5 plant basis is revised. The 3D model remains the spatial reference; change control records decisions and evidence.</Empty>:<>
    <div className="engineering-tools">
     <label className="engineering-search">Search<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Reference, title or programme"/></label>
     <label>State<select value={state} onChange={e=>{setState(e.target.value);setImplementationOnly(false);setEvidenceOnly(false);}}><option value="all">All states</option>{[...new Set(revisions.map((r:any)=>normalState(r.state)))].sort().map((v:any)=><option key={v} value={v}>{String(v).replaceAll('_',' ')}</option>)}</select></label>
     {programOptions.length>0&&<label>Programme<select value={program} onChange={e=>setProgram(e.target.value)}><option value="all">All programmes</option>{programOptions.map(([id,name]:any)=><option key={id} value={id}>{name}</option>)}</select></label>}
     <label>Sort<select value={sort} onChange={e=>setSort(e.target.value)}><option value="updated">Updated</option><option value="reference">Reference</option></select></label>
     {(implementationOnly||evidenceOnly)&&<button className="ops-link" onClick={()=>{setImplementationOnly(false);setEvidenceOnly(false);}}>Clear filter</button>}
    </div>
    <div className={`engineering-change-layout ${selected?'has-inspector':''}`}>
     <div className="engineering-register-pane">
      <div className="engineering-register-head"><strong>Engineering revisions</strong><span>{visible.length} of {revisions.length}</span></div>
      <div className="ops-table-scroll engineering-register-shell"><table className="engineering-register"><thead><tr><th scope="col">Reference</th><th scope="col">Title</th><th scope="col">State</th><th scope="col">Programme</th><th scope="col">Evidence</th><th scope="col">Updated</th></tr></thead><tbody>{visible.map((r:any)=>{
       const current=selected?.id===r.id;
       return <tr key={r.id} className={current?'is-selected':''}><td><Link href={linkFor(r.id)} aria-label={`Open ${r.reference||'revision'} ${r.title||''}`}>{r.reference||'—'}</Link></td><td>{r.title||'Untitled revision'}</td><td><Status>{normalState(r.state).replaceAll('_',' ')}</Status></td><td>{programName(data,r.program_id)}</td><td>{r.source_file_id?'Verified source':'No source attached'}</td><td>{updatedValue(r)?new Date(updatedValue(r)).toLocaleDateString('en-AU'):'—'}</td></tr>;
      })}</tbody></table></div>
      {!visible.length&&<Empty title="No matching revisions">Clear a filter or search term to return to the loaded register.</Empty>}
     </div>
     {selected&&<aside className="engineering-inspector" aria-labelledby="revision-title">
       <div className="engineering-mobile-back"><Link href={linkFor()}>← All revisions</Link></div>
       <div className="engineering-inspector-head"><div><span className="ops-eyebrow">{selected.reference||'Engineering revision'}</span><h2 id="revision-title">{selected.title||'Untitled revision'}</h2></div><Status>{normalState(selected.state).replaceAll('_',' ')}</Status></div>
       <dl className="engineering-facts"><div><dt>Decision context</dt><dd>{selected.notes||'No design basis or change rationale recorded.'}</dd></div><div><dt>Lineage</dt><dd>{predecessor?<Link href={linkFor(predecessor.id)}>Supersedes {predecessor.reference||'previous revision'} →</Link>:selected.supersedes?'Predecessor is outside the loaded scope':'No predecessor recorded'}{successor&&<><br/><Link href={linkFor(successor.id)}>Superseded by {successor.reference||'later revision'} →</Link></>}</dd></div><div><dt>Evidence</dt><dd>{selected.source_file_id?<EvidenceLink id={selected.source_file_id} label="Open verified source evidence"/>:<strong>No source attached</strong>}</dd></div><div><dt>Implementation</dt><dd>{selected.program_id?<><Link href={`/ops/programs?scope=${scopeId}&item=${selected.program_id}`}>{programName(data,selected.program_id)} →</Link><br/><span>{linkedTasks.length} open work {linkedTasks.length===1?'item':'items'}</span></>:'No implementation programme linked'}</dd></div><div><dt>Review</dt><dd>{reviewerLabel(selected)}{selected.reviewed_by&&<small className="engineering-id">{selected.reviewed_by}</small>}</dd></div><div><dt>Updated</dt><dd>{updatedValue(selected)?new Date(updatedValue(selected)).toLocaleString('en-AU'):'Not recorded'}</dd></div></dl>
       <div className="ops-actions">{write&&<button onClick={()=>edit('engineering',selected)}>Review / update</button>}<Link href={`/ops/work?scope=${scopeId}&action=task&kind=issue&program=${selected.program_id||''}`}>Raise linked work</Link></div>
       <WorkflowHistory id={selected.id}/>
      </aside>}
    </div>
   </>}
  </>}
 </section>;
}
