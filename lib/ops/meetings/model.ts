import {z} from 'zod';

export const meetingImportSchema=z.object({
  workspaceId:z.string().uuid(),requestId:z.string().uuid(),sourceKey:z.string().min(1).max(240),
  title:z.string().trim().min(3).max(240),heldOn:z.iso.date(),
  sourceText:z.string().min(20).max(200000),sourceUrl:z.string().max(600).default(''),
  sourceKind:z.enum(['manual','gmail']).default('manual'),
}).strict();
export type MeetingImport=z.infer<typeof meetingImportSchema>;
export type Candidate={id:string;ordinal:number;title:string;owner_text:string;source_quote:string;flags:string[];state:'proposed'|'reviewed'|'dismissed';due_on:string|null;review_note:string;version:number};
export type MeetingSummary={id:string;workspace_id:string;workspace_name:string;title:string;held_on:string;current_revision:number;imported_at:string;actions:number;pending:number;reviewed:number;dismissed:number};
export type MeetingsIndex={userId:string;email:string;workspaces:{id:string;name:string;role:string}[];meetings:MeetingSummary[];more:boolean;intake:{automatic:boolean;message:string}};
export type MeetingDetail={meeting:MeetingSummary&{source_key:string};revision:number;source:{source_text:string;source_hash:string;source_url:string;source_kind:string;imported_at:string};versions:{revision:number;imported_at:string}[];candidates:Candidate[];canReview:boolean};

export function sourceLink(value:string):string {
  if(!value)return '';
  try{const url=new URL(value);if(url.origin==='https://mail.google.com'&&/^\/mail\//.test(url.pathname))return url.href;}catch{}
  throw new Error('Use a Gmail source link, or leave the source link blank.');
}
function plainAction(s:string){return s.replace(/https?:\/\/[^\s<>]+/g,'').replace(/\[source link\]/g,'').replace(/&stepId=[\w-]+/g,'').replace(/\s+/g,' ').trim();}
export function extractCandidates(text:string){
  const lines=text.replace(/\r\n?/g,'\n').split('\n');
  const start=lines.findIndex(l=>/^next steps\s*:?\s*$/i.test(l.trim()));
  if(start<0)return [];
  const result:{ordinal:number;title:string;owner_text:string;source_quote:string;flags:string[]}[]=[];
  let owner='',parts:string[]=[];
  const flush=()=>{if(!parts.length)return;const quote=parts.join('\n').trim();let title=plainAction(quote.replace(/^\s*(?:[*•-]|\d+[.)])\s*/,''));let person=owner;
    const named=title.match(/^([^:]{1,60}):\s+(.+)$/);if(named){person=named[1].trim();title=named[2];}
    if(title){const flags:string[]=[];if(!person||/collaboration|everyone|all|team/i.test(person))flags.push('Confirm accountable owner');if(/^(AM|Julie)$/i.test(person))flags.push('Confirm name alias');if(/\b(tomorrow|today|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|midday)\b/i.test(title))flags.push('Confirm relative date');if(/\b(bank|payment|purchase|purchasing|order|contract|compliance|regulations|commission|hire|resume|CV)\b/i.test(title))flags.push('Review commitment');result.push({ordinal:result.length+1,title:title.slice(0,1000),owner_text:person.slice(0,100),source_quote:quote.slice(0,16000),flags});}parts=[];};
  for(let i=start+1;i<lines.length;i++){
    const line=lines[i],trim=line.trim();if(/^summary\s*:?\s*$/i.test(trim)){flush();break;}
    if(/^\s*(?:[*•-]|\d+[.)])\s+/.test(line)){flush();parts=[line];continue;}
    if(!trim){if(parts.length&&lines.slice(i+1).find(l=>l.trim())?.trim().match(/^[\p{L}][\p{L} .'-]{0,59}$/u))flush();continue;}
    if(!parts.length&&/^[\p{L}][\p{L} .'-]{0,59}$/u.test(trim)){owner=trim;continue;}
    if(parts.length)parts.push(line);
  }
  flush();return result.slice(0,151);
}
export const reviewSchema=z.object({requestId:z.string().uuid(),expectedActorId:z.string().uuid(),candidateId:z.string().uuid(),expectedVersion:z.number().int().min(1),title:z.string().trim().min(3).max(1000),owner:z.string().trim().max(100),dueOn:z.union([z.iso.date(),z.literal('')]),state:z.enum(['proposed','reviewed','dismissed']),note:z.string().trim().max(2000)}).strict().superRefine((v,c)=>{if(v.state==='reviewed'&&!v.owner)c.addIssue({code:'custom',message:'Confirm an accountable owner before marking this action reviewed.',path:['owner']});if(v.state==='dismissed'&&v.note.length<3)c.addIssue({code:'custom',message:'Record why this action is dismissed.',path:['note']});});
export const MEETING_NAV=[['','Home'],['programs','Programs'],['meetings','Meetings'],['geology','Geology'],['pit','Pits & stockpiles'],['plant','Plant'],['gold','Gold'],['work','Work'],['reports','Reports']] as const;
