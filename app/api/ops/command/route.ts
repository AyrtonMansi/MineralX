import {requireOperations,rpc,geologyCommand} from '@/lib/ops/server';
import {commandSchema,OpsError} from '@/lib/ops/contracts';
import {body,noStore,failure} from '@/lib/ops/http';
export const dynamic='force-dynamic';export const maxDuration=60;
export async function POST(request:Request){let requestId;try{const command=commandSchema.parse(await body(request));requestId=command.requestId;
 if(command.action.startsWith('geo.'))return noStore(await geologyCommand(command));
 const {db,user}=await requireOperations(command.scopeId);if(command.expectedActorId&&command.expectedActorId!==user.id)throw new OpsError('forbidden','The signed-in account changed. Your original entry has not been submitted.');return noStore(await rpc(db,'mx_ops_command',{p_scope:command.scopeId,p_request:command.requestId,p_action:command.action,p_id:command.id,p_expected:command.expectedVersion,p_payload:command.payload}));
}catch(e){return failure(e,requestId);}}
