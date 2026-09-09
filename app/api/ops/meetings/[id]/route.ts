import {z} from 'zod';
import {failure,noStore} from '@/lib/ops/http';
import {meetingDetail} from '@/lib/ops/meetings/server';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const id=z.string().uuid().parse((await params).id),v=new URL(request.url).searchParams.get('revision');return noStore(await meetingDetail(id,v?z.coerce.number().int().positive().parse(v):undefined));}catch(e){return failure(e);}}
