import {requireSession,rpc} from '@/lib/ops/server';import {body,noStore,failure} from '@/lib/ops/http';
export const dynamic='force-dynamic';export async function POST(request:Request){try{await body(request,1000);const {db}=await requireSession();return noStore({accepted:await rpc(db,'mx_ops_claim_invitations')});}catch(e){return failure(e);}}
