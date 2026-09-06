'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {clearUndo} from './project-store.js';
import {emptyStore,upgradeStore} from './field-workflows.js';
import {loadWorkspace,readWorkspace,writeWorkspace} from './durable-store.js';

export function useDurableStore(){
  const [store,replaceStore]=useState(emptyStore), current=useRef(store);
  const [hydrated,setHydrated]=useState(false),[status,setStatus]=useState('loading'),[error,setError]=useState(''),[recovery,setRecovery]=useState(null),[savedAt,setSavedAt]=useState(null);
  const revision=useRef(0),blocked=useRef(true),ready=useRef(false),queue=useRef(Promise.resolve()),pending=useRef(0),saveError=useRef(null);
  const install=useCallback(value=>{current.current=value;replaceStore(value);},[]);
  const setStore=useCallback(value=>{
    if(!ready.current||blocked.current)throw new Error('Resolve the storage warning before changing records. Your draft is retained.');
    const next=typeof value==='function'?value(current.current):value;
    if(next===current.current)return;
    install(next);pending.current++;setStatus('saving');
    // Enqueue synchronously, before a caller may flush or dismiss the form.
    queue.current=queue.current.then(async()=>{
      if(blocked.current)return;
      revision.current=await writeWorkspace(next,revision.current);
      setSavedAt(new Date().toISOString());
    }).catch(err=>{
      blocked.current=true;saveError.current=err;setError(err.message);setStatus(err.name==='RevisionConflict'?'conflict':'blocked');
    }).finally(()=>{pending.current--;if(!pending.current&&!blocked.current)setStatus('saved');});
  },[install]);
  const flush=useCallback(async()=>{await queue.current;if(saveError.current)throw saveError.current;if(blocked.current)throw new Error('Storage is not writable. Keep or export your draft.');},[]);
  useEffect(()=>{
    let alive=true;
    loadWorkspace().then(result=>{
      if(!alive)return;
      revision.current=result.revision;blocked.current=!!result.blocked;ready.current=true;
      install(result.data);setRecovery(result.legacy||null);setError(result.error||'');
      setStatus(result.blocked?'blocked':'saved');setSavedAt(result.savedAt||null);setHydrated(true);
    }).catch(err=>{if(alive){setStatus('blocked');setError(err.message);setHydrated(true);}});
    return()=>{alive=false;ready.current=false;};
  },[install]);
  useEffect(()=>{
    const warn=e=>{if(pending.current||saveError.current){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[]);
  const restore=useCallback(async(data)=>{
    await queue.current;
    const safe=upgradeStore(data),saved=await readWorkspace();
    if(saved&&saved.revision!==revision.current)throw new Error('A newer workspace exists. Export your open work and load the latest revision before restoring.');
    revision.current=await writeWorkspace(safe,revision.current,{preservePrevious:true});
    clearUndo();blocked.current=false;ready.current=true;saveError.current=null;install(safe);
    setRecovery(null);setError('');setStatus('saved');setSavedAt(new Date().toISOString());
  },[install]);
  const loadLatest=useCallback(async()=>{
    await queue.current;const saved=await readWorkspace();if(!saved)throw new Error('No saved workspace is available.');
    const safe=upgradeStore(saved.data);clearUndo();revision.current=saved.revision;blocked.current=false;ready.current=true;saveError.current=null;install(safe);setRecovery(null);setError('');setStatus('saved');setSavedAt(saved.savedAt);
  },[install]);
  return {store,setStore,hydrated,status,error,recovery,savedAt,restore,loadLatest,flush};
}
