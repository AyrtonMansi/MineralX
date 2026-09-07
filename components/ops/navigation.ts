'use client';
import {useEffect} from 'react';
export function mayNavigate(){return window.dispatchEvent(new Event('ops-before-navigate',{cancelable:true}));}
export function useEntryGuard(dirty:boolean,busy=false){useEffect(()=>{
 const guard=(event:Event)=>{if(busy||dirty&&!window.confirm('Leave this unsubmitted entry? Only a confirmed device draft is recoverable; the shared record has not been changed.'))event.preventDefault();};
 const links=(event:MouseEvent)=>{const el=(event.target as HTMLElement)?.closest?.('a,[data-ops-navigation]') as HTMLAnchorElement|null;if(!el||event.defaultPrevented||el.target==='_blank')return;if(!mayNavigate()){event.preventDefault();event.stopPropagation();}};
 const unload=(event:BeforeUnloadEvent)=>{if(dirty||busy){event.preventDefault();event.returnValue='';}};
 window.addEventListener('ops-before-navigate',guard);document.addEventListener('click',links,true);window.addEventListener('beforeunload',unload);
 return()=>{window.removeEventListener('ops-before-navigate',guard);document.removeEventListener('click',links,true);window.removeEventListener('beforeunload',unload);};
 },[dirty,busy]);}
