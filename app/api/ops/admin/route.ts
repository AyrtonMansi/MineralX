import {requireOperations,requireSession,rpc,trustedDatabase} from '@/lib/ops/server';import {OpsError} from '@/lib/ops/contracts';import {body,noStore,failure,uuid} from '@/lib/ops/http';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{const p=await body(request,16000);const {db,user}=await requireSession();
 if(p.action==='organisation.bootstrap')return noStore({id:await rpc(db,'mx_ops_bootstrap',{p_workspace:uuid.parse(p.workspaceId),p_name:p.name})});
 const {context}=await requireOperations();if(!context.organisations.some(o=>o.id===p.orgId&&o.admin))throw new OpsError('forbidden','Organisation administration is not assigned to this account.');
 const record=await rpc(db,'mx_ops_admin',{p_org:uuid.parse(p.orgId),p_action:p.action,p_id:uuid.parse(p.id),p_expected:p.expectedVersion,p_payload:p.payload});
 if(p.action==='invitation.prepare'&&p.sendEmail===true){
  const service=trustedDatabase();const {error}=await service.auth.admin.inviteUserByEmail(record.email,{redirectTo:new URL('/ops/auth/complete',request.url).toString()});
  // Membership invitation is retained for retry even if provider email delivery fails.
  return noStore({record,emailSent:!error,message:error?'Access invitation is recorded. Email delivery was not confirmed; an existing named account can claim its invitation on sign-in.':'Invitation email accepted by identity provider; delivery still depends on the mail service.'});
 }
 return noStore({record});
}catch(e){return failure(e);}}
