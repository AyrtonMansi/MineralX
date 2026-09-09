import 'server-only';
import {createHash} from 'node:crypto';
import {requireSession,rpc} from '../server';
import {OpsError} from '../contracts';
import {extractCandidates,meetingImportSchema,reviewSchema,sourceLink} from './model';
import {manualSourceKey} from './source-key';

export async function meetingIndex(){
  const {db,user}=await requireSession();const index=await rpc(db,'mx_meetings_index');
  return {...index,userId:user.id,email:user.email,intake:{automatic:false,message:'Existing meeting notes are stored privately. Continuous Zoom/email intake is not connected yet.'}};
}
export async function meetingDetail(id:string,revision?:number){const {db}=await requireSession();return rpc(db,'mx_meetings_detail',{p_id:id,p_revision:revision??null});}
export async function importMeeting(raw:unknown){
  const parsed=meetingImportSchema.parse(raw);const {db,user}=await requireSession();
  // Browser imports cannot assert that an email was retrieved by a trusted integration.
  if(parsed.sourceKind!=='manual')throw new OpsError('forbidden','Mailbox ingestion is reserved for the authorised integration.');
  const sourceUrl=sourceLink(parsed.sourceUrl),sourceHash=createHash('sha256').update(parsed.sourceText).digest('hex');
  const sourceKey=manualSourceKey({sourceUrl,sourceHash,title:parsed.title,heldOn:parsed.heldOn});
  const source={title:parsed.title,held_on:parsed.heldOn,source_text:parsed.sourceText,source_hash:sourceHash,source_url:sourceUrl,source_kind:parsed.sourceKind,candidates:extractCandidates(parsed.sourceText)};
  if(source.candidates.length>150)throw new OpsError('validation','This source contains more than 150 action items. Split it into bounded meeting records.');
  return rpc(db,'mx_meetings_import',{p_workspace:parsed.workspaceId,p_request:parsed.requestId,p_source_key:sourceKey,p_source:source,p_actor:user.id});
}
export async function reviewCandidate(raw:unknown){
  const data=reviewSchema.parse(raw),{db,user}=await requireSession();
  if(data.expectedActorId!==user.id)throw new OpsError('forbidden','The account changed. Reopen the action under the correct account.');
  return rpc(db,'mx_meetings_review',{p_id:data.candidateId,p_request:data.requestId,p_expected:data.expectedVersion,p_payload:{title:data.title,owner_text:data.owner,due_on:data.dueOn||null,state:data.state,review_note:data.note}});
}
