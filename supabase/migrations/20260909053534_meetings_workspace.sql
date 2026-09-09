-- Private meetings are independent of uncommissioned Operations schemas.
begin;
create schema mx_meetings;
revoke all on schema mx_meetings from public,anon,authenticated;
grant usage on schema mx_meetings to authenticated,service_role;
create table mx_meetings.workspaces(id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 3 and 120),created_at timestamptz not null default now());
create table mx_meetings.members(workspace_id uuid not null references mx_meetings.workspaces(id),email text not null check(email=lower(trim(email)) and length(email) between 3 and 254),role text not null check(role in('owner','reviewer','viewer')),revoked_at timestamptz,last_login_request timestamptz,primary key(workspace_id,email));
create table mx_meetings.meetings(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references mx_meetings.workspaces(id),source_key text not null check(length(source_key) between 1 and 240),title text not null check(length(title) between 3 and 240),held_on date not null check(held_on between '2000-01-01' and '2100-01-01'),current_revision integer not null default 1,imported_at timestamptz not null default now(),unique(workspace_id,source_key));
create table mx_meetings.versions(meeting_id uuid not null references mx_meetings.meetings(id),revision integer not null check(revision>0),source_text text not null check(length(source_text) between 20 and 200000),source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),source_url text not null default '' check(source_url='' or source_url ~ '^https://mail[.]google[.]com/mail/'),source_kind text not null check(source_kind in('manual','gmail')),imported_at timestamptz not null default now(),primary key(meeting_id,revision),unique(meeting_id,source_hash));
create table mx_meetings.candidates(id uuid primary key default gen_random_uuid(),meeting_id uuid not null,revision integer not null,ordinal integer not null check(ordinal between 1 and 150),title text not null check(length(title) between 3 and 1000),owner_text text not null default '' check(length(owner_text)<=100),source_quote text not null check(length(source_quote) between 1 and 16000),flags jsonb not null default '[]' check(jsonb_typeof(flags)='array' and jsonb_array_length(flags)<=10),state text not null default 'proposed' check(state in('proposed','reviewed','dismissed')),due_on date check(due_on between '2000-01-01' and '2100-01-01'),review_note text not null default '' check(length(review_note)<=2000),version integer not null default 1,reviewed_by uuid references auth.users(id),reviewed_at timestamptz,foreign key(meeting_id,revision) references mx_meetings.versions(meeting_id,revision),unique(meeting_id,revision,ordinal));
create table mx_meetings.receipts(workspace_id uuid not null references mx_meetings.workspaces(id),request_id uuid not null,actor text not null,intent jsonb not null,response jsonb not null,created_at timestamptz not null default now(),primary key(workspace_id,request_id));
create table mx_meetings.audit(id bigint generated always as identity primary key,workspace_id uuid not null references mx_meetings.workspaces(id),meeting_id uuid not null references mx_meetings.meetings(id),candidate_id uuid references mx_meetings.candidates(id),actor text not null,event text not null,details jsonb not null default '{}',recorded_at timestamptz not null default now());
create index meetings_date on mx_meetings.meetings(workspace_id,held_on desc,id);
create index candidates_meeting on mx_meetings.candidates(meeting_id,revision,state);
create index members_email on mx_meetings.members(email) where revoked_at is null;

create function mx_meetings.can(p_workspace uuid,p_write boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from mx_meetings.members m join auth.users u on lower(u.email)=m.email where u.id=auth.uid() and u.email_confirmed_at is not null and m.workspace_id=p_workspace and m.revoked_at is null and (not p_write or m.role in('owner','reviewer')))
$$;
revoke all on function mx_meetings.can(uuid,boolean) from public,anon;
grant execute on function mx_meetings.can(uuid,boolean) to authenticated,service_role;
alter table mx_meetings.workspaces enable row level security;
alter table mx_meetings.members enable row level security;
alter table mx_meetings.meetings enable row level security;
alter table mx_meetings.versions enable row level security;
alter table mx_meetings.candidates enable row level security;
alter table mx_meetings.receipts enable row level security;
alter table mx_meetings.audit enable row level security;
create policy meeting_workspace_read on mx_meetings.workspaces for select to authenticated using(mx_meetings.can(id));
create policy meeting_member_read on mx_meetings.members for select to authenticated using(mx_meetings.can(workspace_id));
create policy meeting_read on mx_meetings.meetings for select to authenticated using(mx_meetings.can(workspace_id));
create policy meeting_version_read on mx_meetings.versions for select to authenticated using(exists(select 1 from mx_meetings.meetings m where m.id=meeting_id and mx_meetings.can(m.workspace_id)));
create policy meeting_candidate_read on mx_meetings.candidates for select to authenticated using(exists(select 1 from mx_meetings.meetings m where m.id=meeting_id and mx_meetings.can(m.workspace_id)));
create policy meeting_audit_read on mx_meetings.audit for select to authenticated using(mx_meetings.can(workspace_id));
grant select on mx_meetings.workspaces,mx_meetings.meetings,mx_meetings.versions,mx_meetings.candidates,mx_meetings.audit to authenticated;
grant all on all tables in schema mx_meetings to service_role;
grant usage,select on all sequences in schema mx_meetings to service_role;

create function public.mx_meetings_index() returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;begin
 if auth.uid() is null then raise exception 'ACCESS_DENIED';end if;
 select jsonb_build_object('workspaces',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'role',case when mx_meetings.can(w.id,true) then 'reviewer' else 'viewer' end)) from mx_meetings.workspaces w),'[]'::jsonb),'meetings',coalesce((select jsonb_agg(to_jsonb(x) order by x.held_on desc,x.id) from(select m.*,w.name workspace_name,count(c.id)::integer actions,count(c.id) filter(where c.state='proposed')::integer pending,count(c.id) filter(where c.state='reviewed')::integer reviewed,count(c.id) filter(where c.state='dismissed')::integer dismissed from mx_meetings.meetings m join mx_meetings.workspaces w on w.id=m.workspace_id left join mx_meetings.candidates c on c.meeting_id=m.id and c.revision=m.current_revision group by m.id,w.name order by m.held_on desc,m.id limit 200)x),'[]'::jsonb),'more',(select count(*)>200 from mx_meetings.meetings)) into result;
 return result;
end $$;
create function public.mx_meetings_detail(p_id uuid,p_revision integer default null) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare m mx_meetings.meetings;v integer;begin
 if auth.uid() is null then raise exception 'ACCESS_DENIED';end if;
 select * into m from mx_meetings.meetings where id=p_id;if m.id is null then raise exception 'NOT_FOUND';end if;
 v:=coalesce(p_revision,m.current_revision);
 if not exists(select 1 from mx_meetings.versions where meeting_id=p_id and revision=v)then raise exception 'NOT_FOUND';end if;
 return jsonb_build_object('meeting',to_jsonb(m)||jsonb_build_object('workspace_name',(select name from mx_meetings.workspaces where id=m.workspace_id)),'revision',v,'source',(select to_jsonb(s)-'meeting_id'-'revision' from mx_meetings.versions s where s.meeting_id=p_id and s.revision=v),'versions',(select jsonb_agg(jsonb_build_object('revision',revision,'imported_at',imported_at)order by revision desc)from mx_meetings.versions where meeting_id=p_id),'candidates',coalesce((select jsonb_agg(to_jsonb(c)order by ordinal)from mx_meetings.candidates c where c.meeting_id=p_id and c.revision=v),'[]'::jsonb),'canReview',mx_meetings.can(m.workspace_id,true) and v=m.current_revision);
end $$;

-- Internal transactional import is shared by authenticated manual import and a service-only mailbox adapter.
create function mx_meetings.import_source(p_workspace uuid,p_request uuid,p_source_key text,p_source jsonb,p_actor text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare m mx_meetings.meetings;prev mx_meetings.receipts;intent jsonb;response jsonb;v integer;c jsonb;ordinal integer:=0;hash text;
begin
 if p_actor is null or p_request is null then raise exception 'RULE: An actor and request are required';end if;
 if jsonb_typeof(p_source->'candidates') is distinct from 'array' or jsonb_array_length(p_source->'candidates')>150 then raise exception 'RULE: Invalid candidate list';end if;
 hash:=encode(sha256(convert_to(p_source->>'source_text','UTF8')),'hex');
 if hash is distinct from p_source->>'source_hash' then raise exception 'RULE: Source checksum does not match';end if;
 perform 1 from mx_meetings.workspaces where id=p_workspace for update;if not found then raise exception 'NOT_FOUND';end if;
 intent:=jsonb_build_object('sourceKey',p_source_key,'source',p_source);
 select * into prev from mx_meetings.receipts where workspace_id=p_workspace and request_id=p_request;
 if found then if prev.actor<>p_actor or prev.intent<>intent then raise exception 'IDEMPOTENCY_MISMATCH';end if;return prev.response||'{"replayed":true}'::jsonb;end if;
 select * into m from mx_meetings.meetings where workspace_id=p_workspace and source_key=p_source_key;
 if m.id is not null then select revision into v from mx_meetings.versions where meeting_id=m.id and source_hash=hash;end if;
 if v is not null then response:=jsonb_build_object('id',m.id,'revision',v,'duplicate',true);
 else
  if m.id is null then insert into mx_meetings.meetings(workspace_id,source_key,title,held_on)values(p_workspace,p_source_key,p_source->>'title',(p_source->>'held_on')::date)returning * into m;v:=1;
  else v:=m.current_revision+1;update mx_meetings.meetings set current_revision=v,title=p_source->>'title',held_on=(p_source->>'held_on')::date,imported_at=now()where id=m.id;end if;
  insert into mx_meetings.versions(meeting_id,revision,source_text,source_hash,source_url,source_kind)values(m.id,v,p_source->>'source_text',hash,coalesce(p_source->>'source_url',''),p_source->>'source_kind');
  for c in select value from jsonb_array_elements(p_source->'candidates')loop
   ordinal:=ordinal+1;
   if exists(select 1 from jsonb_array_elements(coalesce(c->'flags','[]'::jsonb)) f where jsonb_typeof(f)<>'string')then raise exception 'RULE: Invalid review flags';end if;
   insert into mx_meetings.candidates(meeting_id,revision,ordinal,title,owner_text,source_quote,flags)values(m.id,v,ordinal,c->>'title',coalesce(c->>'owner_text',''),c->>'source_quote',coalesce(c->'flags','[]'));
  end loop;
  insert into mx_meetings.audit(workspace_id,meeting_id,actor,event,details)values(p_workspace,m.id,p_actor,'source.imported',jsonb_build_object('revision',v,'sha256',hash,'candidateCount',ordinal));
  response:=jsonb_build_object('id',m.id,'revision',v,'duplicate',false);
 end if;
 insert into mx_meetings.receipts(workspace_id,request_id,actor,intent,response)values(p_workspace,p_request,p_actor,intent,response);
 return response;
end $$;
revoke all on function mx_meetings.import_source(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function mx_meetings.import_source(uuid,uuid,text,jsonb,text) to service_role;
create function public.mx_meetings_import(p_workspace uuid,p_request uuid,p_source_key text,p_source jsonb,p_actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_actor is distinct from auth.uid() or not mx_meetings.can(p_workspace,true)then raise exception 'ACCESS_DENIED';end if;
 if p_source->>'source_kind' is distinct from 'manual' then raise exception 'ACCESS_DENIED';end if;
 return mx_meetings.import_source(p_workspace,p_request,p_source_key,p_source,auth.uid()::text);
end $$;
create function public.mx_meetings_ingest(p_workspace uuid,p_request uuid,p_source_key text,p_source jsonb) returns jsonb language sql security invoker set search_path='' as $$
 select mx_meetings.import_source(p_workspace,p_request,p_source_key,p_source,'mailbox-ingestion')
$$;
revoke all on function public.mx_meetings_ingest(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.mx_meetings_ingest(uuid,uuid,text,jsonb) to service_role;

create function public.mx_meetings_review(p_id uuid,p_request uuid,p_expected integer,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c mx_meetings.candidates;m mx_meetings.meetings;prev mx_meetings.receipts;intent jsonb;result jsonb;
begin
 if auth.uid() is null then raise exception 'ACCESS_DENIED';end if;
 select * into c from mx_meetings.candidates where id=p_id;
 select * into m from mx_meetings.meetings where id=c.meeting_id;
 if m.id is null or not mx_meetings.can(m.workspace_id,true)then raise exception 'ACCESS_DENIED';end if;
 perform 1 from mx_meetings.workspaces where id=m.workspace_id for update;
 -- Re-read after the workspace lock so a concurrent import cannot supersede a reviewed source.
 select * into m from mx_meetings.meetings where id=c.meeting_id;
 select * into c from mx_meetings.candidates where id=p_id for update;
 intent:=jsonb_build_object('id',p_id,'expected',p_expected,'payload',p_payload);
 select * into prev from mx_meetings.receipts where workspace_id=m.workspace_id and request_id=p_request;
 if found then if prev.actor<>auth.uid()::text or prev.intent<>intent then raise exception 'IDEMPOTENCY_MISMATCH';end if;return prev.response||'{"replayed":true}'::jsonb;end if;
 if c.version is distinct from p_expected or c.revision<>m.current_revision then raise exception 'CONFLICT';end if;
 if p_payload->>'state'='reviewed' and length(trim(coalesce(p_payload->>'owner_text','')))=0 then raise exception 'RULE: Confirm an accountable owner';end if;
 if p_payload->>'state'='dismissed' and length(trim(coalesce(p_payload->>'review_note','')))<3 then raise exception 'RULE: Record the reason for dismissal';end if;
 update mx_meetings.candidates set title=p_payload->>'title',owner_text=coalesce(p_payload->>'owner_text',''),due_on=nullif(p_payload->>'due_on','')::date,state=p_payload->>'state',review_note=coalesce(p_payload->>'review_note',''),version=version+1,reviewed_by=auth.uid(),reviewed_at=now() where id=p_id returning * into c;
 insert into mx_meetings.audit(workspace_id,meeting_id,candidate_id,actor,event,details)values(m.workspace_id,m.id,c.id,auth.uid()::text,'candidate.reviewed',jsonb_build_object('version',c.version,'state',c.state,'owner',c.owner_text,'due',c.due_on,'reason',c.review_note));
 result:=to_jsonb(c);insert into mx_meetings.receipts(workspace_id,request_id,actor,intent,response)values(m.workspace_id,p_request,auth.uid()::text,intent,result);return result;
end $$;

-- A private allowlist gates user-initiated sign-in email requests; no account membership is inferred from a note.
create function public.mx_meetings_login_allowed(p_email text) returns boolean language plpgsql security invoker set search_path='' as $$
declare m mx_meetings.members;begin
 select * into m from mx_meetings.members where email=lower(trim(p_email)) and revoked_at is null order by workspace_id limit 1 for update;
 if m.email is null or m.last_login_request>now()-interval '60 seconds' then return false;end if;
 update mx_meetings.members set last_login_request=now()where email=m.email;return true;
end $$;
revoke all on function public.mx_meetings_login_allowed(text) from public,anon,authenticated;
grant execute on function public.mx_meetings_login_allowed(text) to service_role;
-- Privileged implementations stay in the private schema; exposed RPCs are invoker-only wrappers.
alter function public.mx_meetings_import(uuid,uuid,text,jsonb,uuid) set schema mx_meetings;
alter function public.mx_meetings_review(uuid,uuid,integer,jsonb) set schema mx_meetings;
revoke all on function mx_meetings.mx_meetings_import(uuid,uuid,text,jsonb,uuid),mx_meetings.mx_meetings_review(uuid,uuid,integer,jsonb) from public,anon;
grant execute on function mx_meetings.mx_meetings_import(uuid,uuid,text,jsonb,uuid),mx_meetings.mx_meetings_review(uuid,uuid,integer,jsonb) to authenticated;
create function public.mx_meetings_import(p_workspace uuid,p_request uuid,p_source_key text,p_source jsonb,p_actor uuid)returns jsonb language sql security invoker set search_path='' as $$ select mx_meetings.mx_meetings_import(p_workspace,p_request,p_source_key,p_source,p_actor) $$;
create function public.mx_meetings_review(p_id uuid,p_request uuid,p_expected integer,p_payload jsonb)returns jsonb language sql security invoker set search_path='' as $$ select mx_meetings.mx_meetings_review(p_id,p_request,p_expected,p_payload) $$;
revoke all on function public.mx_meetings_index(),public.mx_meetings_detail(uuid,integer),public.mx_meetings_import(uuid,uuid,text,jsonb,uuid),public.mx_meetings_review(uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.mx_meetings_index(),public.mx_meetings_detail(uuid,integer),public.mx_meetings_import(uuid,uuid,text,jsonb,uuid),public.mx_meetings_review(uuid,uuid,integer,jsonb) to authenticated;
commit;
