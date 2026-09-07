import {requireOperations,rpc} from '@/lib/ops/server';import {scopeFrom,noStore,failure} from '@/lib/ops/http';
export const dynamic='force-dynamic';export async function GET(request:Request){try{const scope=scopeFrom(request),{db}=await requireOperations(scope);return noStore(await rpc(db,'mx_ops_documents',{p_scope:scope}));}catch(e){return failure(e);}}
