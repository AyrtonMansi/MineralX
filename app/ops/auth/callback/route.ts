import {NextRequest,NextResponse} from 'next/server';
import {database,configured} from '@/lib/gic/server';
import {safeOpsPath} from '@/lib/ops/contracts';
import {DEVELOPMENT_MODE_COOKIE} from '@/lib/ops/development-policy';
export async function GET(request:NextRequest){
 if(!configured())return NextResponse.redirect(new URL('/ops/login',request.url));
 const db=await database(),q=request.nextUrl.searchParams,code=q.get('code'),token=q.get('token_hash'),type=q.get('type');
 let success=false;
 if(code){const {error}=await db.auth.exchangeCodeForSession(code);success=!error;}
 else if(token&&(type==='invite'||type==='recovery'||type==='email')){const {error}=await db.auth.verifyOtp({token_hash:token,type});success=!error;}
 if(success){await db.rpc('mx_ops_claim_invitations');const destination=safeOpsPath(q.get('next')||'/ops/account'),response=NextResponse.redirect(new URL(destination,request.url));if(!/^\/ops\/meetings(?:\/|\?|$)/.test(destination))response.cookies.set(DEVELOPMENT_MODE_COOKIE,'staff',{path:'/ops',httpOnly:true,sameSite:'lax',secure:request.nextUrl.protocol==='https:',maxAge:604800});return response;}
 return NextResponse.redirect(new URL('/ops/login?expired=1',request.url));
}
