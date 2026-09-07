import {NextResponse} from 'next/server';
import {database} from '@/lib/gic/server';
import {safeOpsPath} from '@/lib/ops/contracts';
export const dynamic='force-dynamic';
export async function GET(request:Request){const url=new URL(request.url);try{const db=await database();const code=url.searchParams.get('code'),token_hash=url.searchParams.get('token_hash'),type=url.searchParams.get('type');let error;
 if(code)({error}=await db.auth.exchangeCodeForSession(code));
 else if(token_hash&&(type==='invite'||type==='recovery'))({error}=await db.auth.verifyOtp({token_hash,type}));
 else throw new Error('Invalid link');
 if(error)throw error;return NextResponse.redirect(new URL(safeOpsPath(url.searchParams.get('next'),'/ops/account'),url.origin));
 }catch{return NextResponse.redirect(new URL('/ops/login?notice=link',url.origin));}}
