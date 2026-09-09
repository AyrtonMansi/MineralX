import {requireOperations,rpc} from '@/lib/ops/server';
import {noStore,failure,scopeFrom,uuid} from '@/lib/ops/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 const q=new URL(request.url).searchParams,scope=scopeFrom(request);
 const {db}=await requireOperations(scope,'work.read');
 return noStore(await rpc(db,'mx_ops_workflow_history',{p_scope:scope,p_id:uuid.parse(q.get('id'))}));
}catch(e){return failure(e);}}
