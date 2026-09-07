import {requireOperations,rpc} from '@/lib/ops/server';
import {scopeFrom,uuid,noStore,failure} from '@/lib/ops/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const scope=scopeFrom(request),q=new URL(request.url).searchParams,{db}=await requireOperations(scope);return noStore(await rpc(db,'mx_ops_list',{p_scope:scope,p_kind:q.get('kind'),p_after:q.get('after')?uuid.parse(q.get('after')):null,p_limit:100,p_id:q.get('id')?uuid.parse(q.get('id')):null}));}catch(e){return failure(e);}}
