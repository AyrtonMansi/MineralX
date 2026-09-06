'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {clearUndo} from './project-store.js';
import {emptyStore,upgradeStore} from './field-workflows.js';
import {loadWorkspace,readWorkspace,writeWorkspace} from './durable-store.js';

export function useDurableStore(){
  const [store,replaceStore]=useState(emptyStore);
  const current=useRef(store);
  // All callers, including legacy map tools, share one synchronous mutation boundary.
  const setStore=useCallback(value=>{const next=typeof value==='function'?value(current.current):value;current.current=next;replaceStore(next);},[]);
  const [hydrated,setHydrated]=useState(false);
  const [status,setStatus]=useState('loading');
  const [error,setError]=useState('');
  const [recovery,setRecovery]=useState(null);
  const [savedAt,setSavedAt]=useState(null);
  const revision=useRef(0),blocked=useRef(true),queue=useRef(Promise.resolve()),last=useRef(null),pending=useRef(0),generation=useRef(0);
  useEffect(()=>{
    let alive=true;
    loadWorkspace().then(result=>{
      if(!alive)return;
      revision.current=result.revision;last.current=result.data;blocked.current=!!result.blocked;
      setStore(result.data);setRecovery(result.legacy||null);setError(result.error||'');
      setStatus(result.blocked?'blocked':'saved');setSavedAt(result.savedAt||null);setHydrated(true);
    }).catch(err=>{if(alive){setStatus('blocked');setError(err.message);setHydrated(true);}});
    return()=>{alive=false;};
  },[]);
  useEffect(()=>{
    if(!hydrated||blocked.current||store===last.current)return;
    last.current=store;pending.current++;setStatus('saving');
    const token=generation.current;
    queue.current=queue.current.then(async()=>{
      if(blocked.current||token!==generation.current)return;
      revision.current=await writeWorkspace(store,revision.current);
      setSavedAt(new Date().toISOString());
    }).catch(err=>{
      blocked.current=true;setError(err.message);setStatus(err.name==='RevisionConflict'?'conflict':'blocked');
    }).finally(()=>{
      pending.current--;if(!pending.current&&!blocked.current)setStatus('saved');
    });
  },[store,hydrated]);
  useEffect(()=>{
    const warn=e=>{if(pending.current||blocked.current&&last.current!==null){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[]);
  const restore=useCallback(async(data)=>{
    await queue.current;
    // Explicit restore is still CAS protected. Never overwrite a different tab's work.
    const safe=upgradeStore(data);
    const current=await readWorkspace();
    if(current&&current.revision!==revision.current)throw new Error('A newer workspace exists. Export your open work and load the latest revision before restoring.');
    revision.current=await writeWorkspace(safe,revision.current,{preservePrevious:true});
    clearUndo();generation.current++;blocked.current=false;last.current=safe;
    setStore(safe);setRecovery(null);setError('');setStatus('saved');
  },[]);
  const loadLatest=useCallback(async()=>{
    await queue.current;
    const current=await readWorkspace();
    if(!current)throw new Error('No saved workspace is available.');
    const safe=upgradeStore(current.data);
    clearUndo();generation.current++;revision.current=current.revision;last.current=safe;blocked.current=false;
    setStore(safe);setRecovery(null);setError('');setStatus('saved');
  },[]);
  return {store,setStore,hydrated,status,error,recovery,savedAt,restore,loadLatest};
}
