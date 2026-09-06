'use client';
import React, { useEffect, useState } from 'react';
import { Button } from './Controls';
import { Textarea } from './Controls';
import { Label } from './Controls';
import type { Anchor, NoteDraft, ReviewNote } from '@/lib/plant/notes';
import type { PlantModel } from '@/lib/plant/model';
import type { useReviewNotes } from './useReviewNotes';
export function anchorName(a:Anchor,model:PlantModel) {
  if(a.type==='equipment')return model.equipment.find(q=>q.id===a.id)?.name || a.id || 'Equipment';
  if(a.type==='route')return `Connection ${a.id}`;
  return `Point · E ${a.x.toFixed(1)}, N ${a.y.toFixed(1)} m`;
}
export function ReviewNotes({store,model,draft,setDraft,onLocate,onPin,activeId,scope}:{
  store:ReturnType<typeof useReviewNotes>;model:PlantModel;draft:NoteDraft|null;setDraft:(v:NoteDraft|null)=>void;
  onLocate:(n:ReviewNote)=>void;onPin:()=>void;activeId:string;scope?:string;
}) {
  const [filter,setFilter]=useState('open');
  const activeStatus=store.notes.find(n=>n.id===activeId)?.status;
  useEffect(()=>{if(activeStatus)setFilter(activeStatus);},[activeId,activeStatus]);
  const latest=draft?.editing?store.notes.find(n=>n.id===draft.id):undefined;
  const visible=store.notes.filter(n=>(filter==='all'||n.status===filter)&&(!scope||n.anchor.id===scope));
  const exportNotes=()=>{
    const csv=(v:unknown)=>{let value=String(v??'');if(/^[=+\-@\t\r]/.test(value))value="'"+value;return '"'+value.replaceAll('"','""')+'"';};
    const content=[['Number','Location','Note','Status','Priority','Author','Revision','Updated'],...store.notes.map((n,i)=>[i+1,anchorName(n.anchor,model),n.body,n.status,n.priority,n.authorName,n.anchor.revision,n.updatedAt])].map(row=>row.map(csv).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob(['\uFEFF'+content],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='Josephine-review-notes.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return <div className="review-notes">
    <div className="review-note-heading"><div><h2>Review notes</h2><p>Pin a question, access issue or vendor detail to the plan.</p></div><Button variant="outline" size="sm" disabled={!!draft} onClick={onPin}>＋ Pin note</Button></div>
    {draft && <form className="note-editor" onSubmit={async e=>{e.preventDefault();if(await store.save(draft))setDraft(null);}}>
      <span className="plant-eyebrow">{draft.editing?'Edit note':'New note'} · {draft.anchor.revision}</span>
      <strong>{anchorName(draft.anchor,model)}</strong>
      <Label htmlFor="review-note-body">Review note</Label>
      <Textarea id="review-note-body" rows={5} maxLength={4000} required autoFocus value={draft.body} onChange={e=>setDraft({...draft,body:e.target.value})} placeholder="What needs checking at this location?" />
      <div className="note-priority"><Label htmlFor="note-priority">Priority</Label><select id="note-priority" value={draft.priority} onChange={e=>setDraft({...draft,priority:e.target.value as NoteDraft['priority']})}><option value="normal">Normal</option><option value="attention">Needs attention</option></select></div>
      {latest&&draft.editing&&latest.version!==draft.editing.version&&<div className="note-conflict"><strong>This note changed in another session.</strong><p>Latest text: {latest.body}</p><Button variant="outline" type="button" onClick={()=>setDraft({...draft,editing:latest})}>Keep my text; use latest version</Button></div>}
      <div className="note-editor-actions"><Button type="submit" disabled={store.saving||store.loading||!store.ready||!draft.body.trim()}>{store.saving?'Saving…':'Save note'}</Button><Button type="button" variant="ghost" disabled={store.saving} onClick={()=>setDraft(null)}>Discard draft</Button></div>
      <small>Saved notes are visible to everyone viewing this plan. You can edit your notes in this browser. Select Save note to keep your draft.</small>
    </form>}
    {store.error && <div className="note-error" role="alert"><p>{store.error}</p><Button variant="outline" size="sm" disabled={store.loading||store.saving} onClick={()=>void store.load()}>Reload notes</Button></div>}
    {store.message && !store.error && <p className="note-saved" role="status">✓ {store.message}</p>}
    <div className="note-filters" aria-label="Filter review notes">{['open','resolved','all'].map(f=><button key={f} aria-pressed={filter===f} onClick={()=>setFilter(f)}>{f[0].toUpperCase()+f.slice(1)}</button>)}<button onClick={exportNotes} disabled={!store.notes.length}>Export CSV ↓</button></div>
    {scope&&<p className="plant-caption">Notes for {scope}. Open the Review notes tab to see all locations.</p>}
    {store.loading && <p role="status">Loading saved notes…</p>}
    {!store.loading&&!store.error&&!visible.length&&<div className="note-empty">{filter==='open'?'No open notes here. Select a machine and add a note, or pin a location on the plan.':'No notes match this filter.'}</div>}
    <div className="note-list">{visible.map(n=><article key={n.id} className={`note-card ${activeId===n.id?'is-active':''} ${n.status}`}>
      <div className="note-card-top"><button onClick={()=>onLocate(n)} className="note-location"><span>{store.notes.findIndex(x=>x.id===n.id)+1}</span>{anchorName(n.anchor,model)} ↗</button><span className={`note-status ${n.priority==='attention'?'attention':''}`}>{n.status==='resolved'?'Resolved':n.priority==='attention'?'Attention':'Open'}</span></div>
      <p className="note-body">{n.body}</p>
      <small>{n.authorName} · {new Date(n.updatedAt).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})} · {n.anchor.revision}</small>
      {n.anchor.revision!==model.revision&&<small>Recorded on an earlier layout; confirm the current location.</small>}
      {n.canEdit&&<div className="note-actions"><Button size="sm" variant="ghost" disabled={!!draft||store.saving} onClick={()=>setDraft({id:n.id,body:n.body,priority:n.priority,anchor:n.anchor,editing:n})}>Edit</Button><Button size="sm" variant="ghost" disabled={store.saving||!!draft} onClick={()=>void store.resolve(n)}>{n.status==='open'?'Mark resolved':'Reopen'}</Button></div>}
    </article>)}</div>
  </div>;
}
