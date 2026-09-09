import {z} from 'zod';
import {cookies} from 'next/headers';
import {database} from '@/lib/gic/server';
import {trustedDatabase} from '@/lib/ops/server';
import {body,failure,noStore} from '@/lib/ops/http';
import {OpsError} from '@/lib/ops/contracts';
import {company} from '@/lib/content';
export async function POST(request:Request){try{
 const {email}=z.object({email:z.string().trim().email().max(254)}).strict().parse(await body(request,1500));
 const {data:allowed,error}=await trustedDatabase().rpc('mx_meetings_login_allowed',{p_email:email.toLowerCase()});
 if(error)throw new OpsError('unavailable','Private meeting sign-in is awaiting its database setup.');
 if(allowed){const db=await database();const {error}=await db.auth.signInWithOtp({email:email.toLowerCase(),options:{shouldCreateUser:true,emailRedirectTo:company.url+'/gic/auth/callback'}});if(error)throw new OpsError('unavailable','The identity service could not send the sign-in email. Wait a minute and retry, or use your existing password.');
  (await cookies()).set('mx-meeting-signin','1',{httpOnly:true,secure:request.url.startsWith('https:'),sameSite:'lax',path:'/',maxAge:3600});
 }
 return noStore({message:'If this email has assigned JV access, a sign-in link will arrive shortly. Open it in this browser. Requests are limited to one per minute.'});
 }catch(e){return failure(e);}}
