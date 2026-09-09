import {NextResponse} from 'next/server';
import {z} from 'zod';
import {OpsError,statusFor} from './contracts';
export const privateResponseHeaders={
 'Cache-Control':'private, no-store, max-age=0',
 'X-Robots-Tag':'noindex, nofollow',
 'X-Content-Type-Options':'nosniff',
 'Referrer-Policy':'no-referrer',
 'X-Frame-Options':'DENY',
 'Strict-Transport-Security':'max-age=31536000',
 'X-Permitted-Cross-Domain-Policies':'none',
} as const;
export function noStore(value:unknown,status=200) {return NextResponse.json(value,{status,headers:privateResponseHeaders});}
export function failure(error:unknown,requestId=crypto.randomUUID()) {
 const known=error instanceof OpsError?error:error instanceof z.ZodError?new OpsError('validation','Check the required fields and record identifiers.'):new OpsError('unavailable','The request could not be confirmed. Your entry is retained.');
 // No payloads, credentials or private locations enter application logs.
 console.warn(JSON.stringify({event:'ops_request_failed',code:known.code,requestId}));
 return noStore({error:{code:known.code,message:known.message,requestId}},statusFor(known));
}
export async function body(request:Request,max=1500000) {
 const origin=request.headers.get('origin');if(!origin||origin!==new URL(request.url).origin)throw new OpsError('forbidden','A same-origin staff request is required.');
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new OpsError('validation','JSON input is required.');
 if(Number(request.headers.get('content-length')||0)>max)throw new OpsError('validation','The request is too large. Upload a bounded source file instead.');
 const reader=request.body?.getReader();if(!reader)throw new OpsError('validation','No input received.');
 let size=0;const chunks:Uint8Array[]=[];for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new OpsError('validation','The request is too large.');}chunks.push(value);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new OpsError('validation','The request could not be decoded.');}
}
export const uuid=z.string().uuid();
export function scopeFrom(request:Request){return uuid.parse(new URL(request.url).searchParams.get('scope'));}
