import {requireOperations,rpc} from '@/lib/ops/server';
import {noStore,failure,scopeFrom} from '@/lib/ops/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 const scope=scopeFrom(request);
 const {db}=await requireOperations(scope,'plant.read');
 return noStore(await rpc(db,'mx_ops_processing_programs',{p_scope:scope}));
}catch(e){return failure(e);}}
