'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {authClient} from '@/lib/ops/client';
import {safeOpsPath} from '@/lib/ops/contracts';
import {Message} from './primitives';
export default function AuthComplete(){
 const [error,setError]=useState('');
 const verification=useRef<Promise<string|null>|null>(null);
 useEffect(()=>{
  let active=true;
  verification.current??=(async()=>{
   const url=new URL(location.href),hash=new URLSearchParams(url.hash.slice(1));
   const next=safeOpsPath(url.searchParams.get('next'),'/ops/account');
   if(url.searchParams.has('code')||url.searchParams.has('token_hash')){
    url.pathname='/ops/auth/callback';url.hash='';location.replace(url.pathname+url.search);return null;
   }
   const access_token=hash.get('access_token'),refresh_token=hash.get('refresh_token');
   history.replaceState(null,'',location.pathname);
   if(hash.has('error')||url.searchParams.has('error'))throw new Error('This invitation or recovery link expired. Request a fresh link.');
   const db=authClient();
   if(access_token&&refresh_token){const {error}=await db.auth.setSession({access_token,refresh_token});if(error)throw new Error('This invitation or recovery link could not be verified. Request a fresh link.');}
   const {data,error}=await db.auth.getUser();
   if(error||!data.user)throw new Error('This invitation or recovery link could not be verified. Request a fresh link.');
   return next;
  })();
  verification.current.then(next=>{if(active&&next)location.replace('/ops/auth/continue?next='+encodeURIComponent(next));}).catch(e=>{if(active)setError(e.message);});
  return()=>{active=false;};
 },[]);
 return <section className="ops-card"><h1>Complete staff access</h1>{error?<Message error>{error} <Link href="/ops/login">Return to sign in</Link></Message>:<p role="status">Verifying your named account…</p>}</section>;
}
