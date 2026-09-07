import {requireOperations,rpc} from '@/lib/ops/server';import {scopeFrom,noStore,failure} from '@/lib/ops/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const scope=scopeFrom(request),q=new URL(request.url).searchParams,{db}=await requireOperations(scope);return noStore(await rpc(db,'mx_ops_dashboard',{p_scope:scope,p_from:q.get('from')||new Date(Date.now()-30*864e5).toISOString(),p_to:q.get('to')||new Date().toISOString()}));}catch(e){return failure(e);}}
