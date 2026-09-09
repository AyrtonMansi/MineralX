'use client';
import {mayNavigate,entryIsOpen} from './navigation';
import React,{createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import {useSearchParams,useRouter,usePathname} from 'next/navigation';
import {api,authClient} from '@/lib/ops/client';
import {OpsError,type OpsContext,type Scope,type Command} from '@/lib/ops/contracts';
import {acknowledge,enqueue,deriveKey,encryptPack,decryptPack,readVault,writeVault,type FieldPack,type VaultEnvelope} from '@/lib/ops/offline';
import {applyGeoCommand,OFFLINE_GEO_ACTIONS,changeSet} from '@/lib/ops/geology.js';
import {scopeForOperationsPath,scopeSwitchDestination} from '@/lib/ops/suite-navigation';

type Context=OpsContext&{capabilities:Record<string,any>};
type Vault={key:CryptoKey;pack:FieldPack;envelope:VaultEnvelope};
type Value={development:boolean;context:Context|null;scope:Scope|undefined;loading:boolean;failure:OpsError|null;online:boolean;offlineMode:boolean;pack:FieldPack|null;revision:number;syncing:boolean;saveState:string;refresh:()=>Promise<void>;selectScope:(id:string)=>void;send:(command:Command)=>Promise<any>;prepare:(passphrase:string,geology:any)=>Promise<void>;unlock:(envelope:VaultEnvelope,passphrase:string,offline?:boolean)=>Promise<void>;sync:()=>Promise<void>;saveDraft:(key:string,value:unknown)=>Promise<void>;exportVault:()=>Promise<VaultEnvelope|null>;resolveConflict:(requestId:string,expectedVersion:number,reason:string)=>Promise<void>;retryBlocked:(requestId:string)=>Promise<void>};
const OperationsContext=createContext<Value|null>(null);
export function useOperations(){const v=useContext(OperationsContext);if(!v)throw new Error('Operations context is missing');return v;}
export default function OperationsProvider({children,development=false}:{children:React.ReactNode;development?:boolean}){
 const router=useRouter(),query=useSearchParams(),pathname=usePathname();const [context,setContext]=useState<Context|null>(null),[loading,setLoading]=useState(true),[failure,setFailure]=useState<OpsError|null>(null),[online,setOnline]=useState(true),[offlineMode,setOfflineMode]=useState(false),[pack,setPack]=useState<FieldPack|null>(null),[revision,bump]=useState(0),[syncing,setSyncing]=useState(false),[saveState,setSaveState]=useState('');
 const vault=useRef<Vault|null>(null),queue=useRef<Promise<unknown>>(Promise.resolve()),contextRef=useRef<Context|null>(null),syncRef=useRef<Promise<void>|null>(null);
 const requestedScopeId=query.get('scope');
 const scope=development?scopeForOperationsPath(context?.scopes,pathname,requestedScopeId||undefined):(requestedScopeId?context?.scopes.find(s=>s.id===requestedScopeId):context?.scopes[0]);
 const refresh=useCallback(async()=>{setLoading(true);try{const c=await api<Context>('context');
 if(contextRef.current?.userId&&contextRef.current.userId!==c.userId){vault.current=null;setPack(null);}
 contextRef.current=c;setContext(c);setFailure(null);setOfflineMode(false);bump(n=>n+1);
 }catch(e){setFailure(e as OpsError);if((e as OpsError).code==='unauthenticated'||(e as OpsError).code==='forbidden'){setContext(null);contextRef.current=null;vault.current=null;setPack(null);}}
 finally{setLoading(false);}},[]);
 useEffect(()=>{refresh();const change=()=>setOnline(navigator.onLine);change();window.addEventListener('online',change);window.addEventListener('offline',change);return()=>{window.removeEventListener('online',change);window.removeEventListener('offline',change);};},[refresh]);
 // A local Development workspace contains separate geological and processing
 // boundaries for data integrity. Route users to the right one automatically
 // so neither raw boundary has to be selected in the UI.
 useEffect(()=>{if(!development||!context||!scope||requestedScopeId===scope.id)return;router.replace(scopeSwitchDestination(pathname,query.toString(),scope));},[context,development,pathname,query,requestedScopeId,router,scope]);
 useEffect(()=>{if(development)return;let stop=()=>{};try{const {data}=authClient().auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||session?.user.id&&contextRef.current?.userId&&session.user.id!==contextRef.current.userId){vault.current=null;setPack(null);setContext(null);contextRef.current=null;setOfflineMode(false);setTimeout(()=>void refresh(),0);}});stop=()=>data.subscription.unsubscribe();}catch{}return stop;},[refresh,development]);
 // Shared views refresh on foreground/resume. Dirty forms retain their original version for conflict checks.
 useEffect(()=>{if(development)return;let last=0;
  const current=()=>{if(document.visibilityState!=='visible'||!navigator.onLine||entryIsOpen()||vault.current?.pack.outbox.length||Date.now()-last<15000)return;last=Date.now();void refresh();};
  window.addEventListener('focus',current);document.addEventListener('visibilitychange',current);
  return()=>{window.removeEventListener('focus',current);document.removeEventListener('visibilitychange',current);};
 },[development,refresh]);
 const persist=useCallback(async(update:(p:FieldPack)=>FieldPack|Promise<FieldPack>)=>{
 const identity=vault.current?`${vault.current.pack.userId}:${vault.current.pack.scope.id}`:null;
 const task=queue.current.catch(()=>{}).then(async()=>{const current=vault.current;if(!current||identity!==`${current.pack.userId}:${current.pack.scope.id}`)throw new Error('Unlock or prepare this device workspace before saving offline.');
 const next=await update(current.pack),envelope=await encryptPack(next,current.key,current.envelope.salt,current.envelope.revision+1);setSaveState('Saving on this device…');
 await writeVault(envelope,current.envelope.revision);if(vault.current?.pack.userId!==current.pack.userId||vault.current?.pack.scope.id!==current.pack.scope.id)throw new Error('The account changed during the device save. The prior account’s encrypted record remains saved.');vault.current={...current,pack:next,envelope};setPack(next);setSaveState(next.outbox.length?`Saved on this device · ${next.outbox.length} changes waiting`:'Device workspace saved');return next;});queue.current=task;
 try{return await task;}catch(e){setSaveState('Device save failed — keep the open draft');throw e;}
 },[]);
 const unlock=useCallback(async(envelope:VaultEnvelope,passphrase:string,offline=false)=>{
 const {key,pack:loaded}=await decryptPack(envelope,passphrase,offline?undefined:contextRef.current?.userId);
 const current=await readVault(envelope.userId,envelope.scopeId);
 if(current&&current.revision!==envelope.revision)throw new Error('A newer device workspace exists. Unlock that revision instead.');
 if(!current)await writeVault(envelope,0);
 vault.current={key,pack:loaded,envelope};setPack(loaded);
 if(offline){const c={...loaded.context,capabilities:{sharedGeology:false,evidence:false,offline:true}} as Context;contextRef.current=c;setContext(c);setFailure(null);setOfflineMode(true);}
 if(offline)window.history.replaceState(null,'',`/ops/field?scope=${loaded.scope.id}`);else router.push(`/ops/geology?scope=${loaded.scope.id}`);setSaveState(`Device workspace unlocked · ${loaded.outbox.length} pending changes`);
 },[router]);
 const prepare=useCallback(async(passphrase:string,geology:any)=>{
 if(development)throw new Error('Development records already save locally. Use the development backup; real field preparation requires staff sign-in.');
 const c=contextRef.current;if(!c||!scope)throw new Error('Sign in and choose the project first.');
 const existing=await readVault(c.userId,scope.id);if(existing&&(!vault.current||vault.current.pack.scope.id!==scope.id))throw new Error('A device workspace already exists. Unlock it before refreshing; it will not be overwritten.');
 if(vault.current&&vault.current.pack.scope.id===scope.id){if(vault.current.pack.outbox.length)throw new Error('Sync or resolve pending changes before refreshing the field pack.');await persist(old=>({...old,geology,scope,context:c,preparedAt:new Date().toISOString(),leaseUntil:new Date(Date.now()+8*36e5).toISOString()}));return;}
 const salt=crypto.getRandomValues(new Uint8Array(16)),key=await deriveKey(passphrase,salt);
 const p:FieldPack={version:1,userId:c.userId,scope,context:{...c,scopes:[scope],organisations:[]},preparedAt:new Date().toISOString(),leaseUntil:new Date(Date.now()+8*36e5).toISOString(),lastSyncedAt:new Date().toISOString(),geology,outbox:[],drafts:{},receipts:{}};
 const envelope=await encryptPack(p,key,Array.from(salt),1);await writeVault(envelope,0);vault.current={key,pack:p,envelope};setPack(p);setSaveState('Field records prepared on this device. Basemap coverage is not included.');
 if(navigator.storage?.persist)await navigator.storage.persist();
 },[scope,persist,development]);
 const sync=useCallback(async()=>{
 if(syncRef.current)return syncRef.current;
 const task=(async()=>{if(!navigator.onLine)throw new Error('Reconnect before synchronising.');const active=vault.current;if(!active)return;
 setSyncing(true);try{const c=await api<Context>('context');if(c.userId!==active.pack.userId)throw new Error('Sign in as the account that owns this device workspace.');
 if(!c.scopes.some(s=>s.id===active.pack.scope.id))throw new Error('Project access has been revoked. Export the encrypted recovery package for an authorised administrator.');
 while(vault.current?.pack.outbox.length){const item=vault.current.pack.outbox[0];if(item.state==='blocked')throw new Error(item.error||'Review the blocked change before synchronising.');
 try{const result=await api('command',item.command);await persist(p=>acknowledge(p,item.command.requestId,result));}
 catch(e){const message=e instanceof Error?e.message:'Sync failed';if(e instanceof OpsError&&['conflict','validation','forbidden','mfa_required'].includes(e.code))await persist(p=>({...p,outbox:p.outbox.map(q=>q.command.requestId===item.command.requestId?{...q,state:'blocked',error:message}:q)}));throw e;}
 }
 const shared=await api(`geology?scope=${active.pack.scope.id}`);const final=await persist(p=>({...p,geology:p.outbox.length?p.geology:shared,context:c,scope:c.scopes.find(s=>s.id===p.scope.id)!,leaseUntil:new Date(Date.now()+8*36e5).toISOString(),lastSyncedAt:new Date().toISOString()}));
 contextRef.current=c;setContext(c);setOfflineMode(false);bump(n=>n+1);setSaveState(final.outbox.length?`Saved on this device · ${final.outbox.length} changes waiting`:'Synced to MineralX');
 }catch(e){setSaveState(`Sync not confirmed · ${(e as Error).message}`);throw e;}finally{setSyncing(false);}})();syncRef.current=task;try{await task;}finally{syncRef.current=null;}
 },[persist]);
 useEffect(()=>{const foreground=()=>{if(document.visibilityState==='visible'&&navigator.onLine&&vault.current?.pack.outbox.length&&!vault.current.pack.outbox.some(q=>q.state==='blocked'))sync().catch(e=>setFailure(new OpsError('unavailable',e.message)));};window.addEventListener('online',foreground);document.addEventListener('visibilitychange',foreground);return()=>{window.removeEventListener('online',foreground);document.removeEventListener('visibilitychange',foreground);};},[sync]);
 const send=useCallback(async(command:Command)=>{
 command={...command,expectedActorId:command.expectedActorId||contextRef.current?.userId};
 if(!scope||command.scopeId!==scope.id)throw new Error('This entry belongs to another workspace.');
 if(development){const result=await api('command',command);bump(n=>n+1);setSaveState('Saved in this browser · development only');return result;}
 const v=vault.current,fieldAction=OFFLINE_GEO_ACTIONS.has(command.action);
 if(v&&v.pack.scope.id===scope.id&&fieldAction){
  if(Date.now()>Date.parse(v.pack.leaseUntil))throw new Error('The eight-hour offline work window expired. Reconnect and refresh the field pack; retained work remains intact.');
  if(command.expectedActorId!==v.pack.userId)throw new Error('This field change belongs to a different account.');
  await persist(async p=>{
   if(p.receipts[command.requestId])return p;
   if(p.outbox.some(q=>q.command.requestId===command.requestId))return enqueue(p,command);
   if(!p.scope.permissions.includes('geo.capture'))throw new Error('Field capture was not assigned when this pack was prepared.');
   const targetKind=command.action.includes('.sample.')?'samples':command.action.includes('.collar.')?'collars':command.action.includes('.program.')?'programs':'targets';
   if((p.geology.versions[`${targetKind}:${command.id}`]||0)!==command.expectedVersion)throw new Error('The device record changed. Reopen it before adding another correction.');
   const next=await applyGeoCommand(p.geology.project,command,p.userId);
   const differences=changeSet(p.geology.project,next,p.geology.versions),versions={...p.geology.versions};
   for(const row of differences)versions[`${row.kind}:${row.id}`]=row.expectedVersion+1;
   return enqueue(p,command,{...p.geology,project:next,versions});
  });bump(n=>n+1);
  if(navigator.onLine&&!offlineMode){try{await sync();}catch{/* The durable outbox and sync status retain the unconfirmed change. */}}
  return vault.current?.pack.receipts[command.requestId]||{id:command.id,version:command.expectedVersion+1,localOnly:true};
 }
 if(navigator.onLine&&!offlineMode){if(vault.current?.pack.outbox.length)await sync();const result=await api('command',command);bump(n=>n+1);setSaveState('Synced to MineralX');return result;}
 throw new Error(fieldAction?'Prepare this project for field use while connected before offline capture.':'This accountable action requires a live authorised session. Keep the observation as a draft until connected.');
 },[scope,offlineMode,persist,sync,development]);
 const saveDraft=useCallback(async(key:string,value:unknown)=>{if(vault.current&&vault.current.pack.scope.id===scope?.id)await persist(p=>({...p,drafts:{...p.drafts,[key]:value}}));},[persist,scope?.id]);
 const resolveConflict=useCallback(async(requestId:string,expectedVersion:number,reason:string)=>{if(reason.trim().length<10)throw new Error('Explain the explicit conflict decision.');await persist(p=>({...p,receipts:{...p.receipts,[requestId]:{localDisposition:'superseded after explicit comparison',reason,command:p.outbox.find(q=>q.command.requestId===requestId)?.command}},outbox:p.outbox.map(q=>q.command.requestId!==requestId?q:{...q,state:'queued',error:undefined,command:{...q.command,requestId:crypto.randomUUID(),expectedVersion,payload:{...q.command.payload,reason}}})}));},[persist]);
 const retryBlocked=useCallback(async(requestId:string)=>{await persist(p=>({...p,outbox:p.outbox.map(q=>q.command.requestId===requestId?{...q,state:'queued',error:undefined}:q)}));},[persist]);
 const selectScope=useCallback((id:string)=>{if(!mayNavigate())return;if(vault.current?.pack.outbox.length&&id!==scope?.id&&!window.confirm('Pending field changes remain safely on this device. Switch workspace without synchronising now?'))return;const next=context?.scopes.find(candidate=>candidate.id===id);if(next)router.push(scopeSwitchDestination(pathname,query.toString(),next));},[context?.scopes,pathname,query,router,scope?.id]);
 const exportVault=useCallback(async()=>{await queue.current.catch(()=>{});return vault.current?.envelope||null;},[]);
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(vault.current?.pack.outbox.length){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[]);
 return <OperationsContext.Provider value={{development,context,scope,loading,failure,online,offlineMode,pack,revision,syncing,saveState,refresh,selectScope,send,prepare,unlock,sync,saveDraft,exportVault,resolveConflict,retryBlocked}}>{children}</OperationsContext.Provider>;
}
