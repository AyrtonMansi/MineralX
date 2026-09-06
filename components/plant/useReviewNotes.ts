'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NoteDraft, ReviewNote } from '@/lib/plant/notes';
export function useReviewNotes(endpoint='/api/notes') {
  const [notes,setNotes]=useState<ReviewNote[]>([]);
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
  const [error,setError]=useState(''),[message,setMessage]=useState('');
  const inFlight=useRef(false);
  const [ready,setReady]=useState(false);
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try {
      let next: string|null=null;const rows:ReviewNote[]=[];
      do {
        const res:Response=await fetch(endpoint+(next?'?after='+encodeURIComponent(next):''),{cache:'no-store'});
        const data:{notes:ReviewNote[];next:string|null;error?:string}=await res.json();
        if(!res.ok)throw new Error(data.error||'Notes could not be loaded.');
        rows.push(...data.notes);next=data.next;
      }while(next);
      setNotes(rows);setReady(true);
    } catch(e) { setError(e instanceof Error?e.message:'Notes could not be loaded. Please retry.'); }
    finally {setLoading(false);}
  },[endpoint]);
  useEffect(()=>{if(typeof window!=='undefined')void load();},[load]);
  async function write(payload: unknown,method:'POST'|'PATCH') {
    if(inFlight.current)return false;
    if(!ready){setError('Load the saved notes before saving a new note. Your draft is kept.');return false;}
    inFlight.current=true;setSaving(true);setError('');setMessage('');
    try {
      const res=await fetch(endpoint,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||'The note could not be saved.');
      setNotes(old=>[...old.filter(n=>n.id!==data.note.id),data.note].sort((a,b)=>(a.createdAt+a.id).localeCompare(b.createdAt+b.id)));
      setMessage('Saved to this workspace.');return true;
    } catch(e) {setError(e instanceof Error?e.message:'Could not save. Your draft is kept; please retry.');return false;}
    finally{inFlight.current=false;setSaving(false);}
  }
  async function save(d: NoteDraft) {
    return d.editing?write({id:d.id,body:d.body,priority:d.priority,status:d.editing.status,version:d.editing.version},'PATCH'):write({id:d.id,body:d.body,priority:d.priority,anchor:d.anchor},'POST');
  }
  async function resolve(n:ReviewNote) {return write({id:n.id,body:n.body,priority:n.priority,status:n.status==='open'?'resolved':'open',version:n.version},'PATCH');}
  return {notes,loading,saving,ready,error,message,load,save,resolve};
}
