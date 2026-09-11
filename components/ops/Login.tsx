'use client';
import {useEffect,useRef,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {authClient,api} from '@/lib/ops/client';
import {safeSignInNext,signInFailureMessage} from '@/lib/gic/login-routing';
import {requestPasswordReset} from '@/app/ops/actions';
import {Message} from './primitives';

/** Identity entry deliberately does not require an Operations workspace context. */
export default function Login(){
 const query=useSearchParams(),inFlight=useRef(false);
 const [mode,setMode]=useState<'signin'|'reset'|'redeem'>('signin'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[hydrated,setHydrated]=useState(false);
 const configured=Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY));
 useEffect(()=>setHydrated(true),[]);
 const interactive=hydrated&&configured;
 return <main className="ops-login" id="main-content">
 <a href="/ops" className="ops-brand">MINERAL<span>X</span><small>OPERATIONS</small></a>
 <h1>{mode==='signin'?'Your work starts here.':mode==='reset'?'Reset your password':'Redeem your invitation'}</h1>
 <p>{mode==='redeem'?'An administrator invites named accounts to this portal. If your invitation email expired or never arrived, request a fresh one below.':'Use your existing named MineralX account. You do not need a new account for this portal.'}</p>
 {hydrated&&!configured&&<Message>Staff sign-in is awaiting identity service configuration.</Message>}
 {query.get('expired')&&<Message error>This sign-in link could not be verified. Request a new link.</Message>}
 {query.get('session')==='unconfirmed'&&<Message error>The server could not confirm your sign-in session. Allow cookies for this site and sign in again. Your account permissions have not been changed.</Message>}
 {(query.get('service')==='unavailable'||query.get('access')==='unavailable')&&<Message error>Account access could not be checked. This is not a confirmed password error. Try again shortly or contact your MineralX administrator.</Message>}
 {error&&<Message error>{error}</Message>}{message&&<Message>{message}</Message>}
 <form method="post" onSubmit={async e=>{
  e.preventDefault();if(!interactive||inFlight.current)return;inFlight.current=true;
  const data=new FormData(e.currentTarget);setBusy(true);setError('');setMessage('');let navigating=false;
  try{
   data.set('email',String(data.get('email')||'').trim());
   if(mode==='reset'){
    // Reuse the existing provider-approved GIC callback and its server PKCE cookies.
    const result=await requestPasswordReset(data);
    if(result.error){setError(result.error);return;}
    setMessage(result.message||'If this address is eligible, a reset link will be sent.');
   }else if(mode==='redeem'){
    // Never confirms or denies whether an invitation exists for this address.
    const result=await api('invite/redeem',{email:String(data.get('email'))});
    setMessage(result.message||'If an access invitation is waiting for this address, a fresh invitation email has been sent.');
   }else{
    const {data:session,error}=await authClient().auth.signInWithPassword({email:String(data.get('email')),password:String(data.get('password')||'')});
    if(error)throw error;
    if(!session.user||!session.session)throw new Error('No authenticated session returned.');
    setMessage('Signed in. Opening your available workspace…');
    // A new document request checks the server cookie, without stale router/context state.
    navigating=true;
    location.replace('/ops/auth/continue?next='+encodeURIComponent(safeSignInNext(query.get('next'))));
   }
  }catch(e){setError(mode==='signin'?signInFailureMessage(e):mode==='reset'?'The reset request could not be completed. Please try again shortly.':'The invitation could not be checked. Please try again shortly.');}
  finally{if(!navigating){inFlight.current=false;setBusy(false);}}
 }}>
 <label>Email<input type="email" name="email" autoComplete="username" maxLength={254} required disabled={busy||!interactive}/></label>
 {mode==='signin'&&<label>Password<input type="password" name="password" autoComplete="current-password" maxLength={256} required disabled={busy||!interactive}/></label>}
 <button className="ops-primary" disabled={busy||!interactive}>{busy?'Please wait…':mode==='signin'?'Sign in':mode==='reset'?'Send reset link':'Resend invitation'}</button>
 </form>
 <button className="ops-link" disabled={busy} onClick={()=>{setMode(mode==='signin'?'reset':'signin');setMessage('');setError('');}}>{mode==='signin'?'Forgot password?':'Return to sign in'}</button>
 {mode!=='redeem'&&<button className="ops-link" disabled={busy} onClick={()=>{setMode('redeem');setMessage('');setError('');}}>Have an invitation? Resend it</button>}
 <a href="/ops?mode=development">Continue without sign-in — development workspace</a>
 <a href="/ops/field">Unlock prepared field records</a>
 </main>;
}
