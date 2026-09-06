begin;
-- Geological memberships are deliberately separate from GIC operations.
create table public.geology_projects (
 id uuid primary key, name text not null, data jsonb not null,
 version bigint not null default 1 check(version>0),
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.geology_members (
 project_id uuid not null references public.geology_projects(id), user_id uuid not null references auth.users(id),
 role text not null check(role in ('owner','reviewer','collector','viewer')), created_at timestamptz not null default now(),
 primary key(project_id,user_id)
);
create table public.geology_audit (
 id bigint generated always as identity primary key, project_id uuid not null references public.geology_projects(id),
 operation_id uuid not null unique, version bigint not null, actor_id uuid not null references auth.users(id),
 action text not null, reason text not null, occurred_at timestamptz not null default now(),
 before_data jsonb, after_data jsonb
);
create index geology_members_user_idx on public.geology_members(user_id);
create index geology_audit_project_idx on public.geology_audit(project_id,version);
create function public.geology_role(p_id uuid) returns text language sql stable security definer set search_path=public,pg_temp as $$
 select role from public.geology_members where project_id=p_id and user_id=auth.uid()
$$;
revoke all on function public.geology_role(uuid) from public; grant execute on function public.geology_role(uuid) to authenticated;
alter table public.geology_projects enable row level security;
alter table public.geology_members enable row level security;
alter table public.geology_audit enable row level security;
create policy geology_projects_read on public.geology_projects for select to authenticated using(public.geology_role(id) is not null);
create policy geology_members_read on public.geology_members for select to authenticated using(user_id=auth.uid() or public.geology_role(project_id)='owner');
create policy geology_audit_read on public.geology_audit for select to authenticated using(public.geology_role(project_id) in ('owner','reviewer'));
revoke all on public.geology_projects,public.geology_members,public.geology_audit from anon,authenticated;
grant select on public.geology_projects,public.geology_members,public.geology_audit to authenticated;

-- Also validate callers that bypass the HTTP route and use the database RPC directly.
create function public.geology_validate_project(p_data jsonb) returns void language plpgsql immutable set search_path=public,pg_temp as $$
declare k text; x jsonb; begin
 if jsonb_typeof(p_data)<>'object' or coalesce(length(btrim(p_data->>'name')),0) not between 1 and 200 or coalesce(length(p_data->>'id'),0) not between 1 and 200 then raise exception 'Invalid project identity'; end if;
 if octet_length(p_data::text)>33554432 then raise exception 'Invalid project size: maximum 32 MB'; end if;
 foreach k in array array['samples','collars','intervals','surveys','geology','targets','programs','observations','dispatches','labBatches','audit','qaqcRules'] loop
   if p_data ? k and jsonb_typeof(p_data->k)<>'array' then raise exception 'Invalid project array: %',k; end if;
 end loop;
 foreach k in array array['samples','collars','intervals','surveys','geology','targets'] loop
   if not (p_data ? k) then raise exception 'Invalid missing project array: %',k; end if;
 end loop;
 foreach k in array array['samples','collars','programs','observations','dispatches','labBatches'] loop
   for x in select value from jsonb_array_elements(p_data->k) loop
     if jsonb_typeof(x)<>'object' or coalesce(length(btrim(x->>'id')),0)=0 then raise exception 'Invalid record identifier'; end if;
   end loop;
   if exists(select 1 from jsonb_array_elements(p_data->k) r group by upper(btrim(r->>'id')) having count(*)>1) then raise exception 'Invalid duplicate record identifier'; end if;
   if exists(select 1 from jsonb_array_elements(p_data->k) r where r ? 'recordId' group by r->>'recordId' having count(*)>1) then raise exception 'Invalid duplicate immutable record identifier'; end if;
 end loop;
end $$;
revoke all on function public.geology_validate_project(jsonb) from public;

-- This projection is intentionally conservative. Collectors can change field and
-- custody records but cannot change laboratory data, released results or review rules.
create function public.geology_review_projection(p_data jsonb) returns jsonb language sql immutable set search_path=public,pg_temp as $$
 select jsonb_build_object(
 'labBatches',coalesce((select jsonb_object_agg(r->>'id',r) from jsonb_array_elements(coalesce(p_data->'labBatches','[]'::jsonb)) r
   where r->>'status' in ('released','held') or coalesce(r->'reviewHistory','[]'::jsonb)<>'[]'::jsonb
   or exists(select 1 from jsonb_array_elements(coalesce(r->'results','[]'::jsonb)) rr where rr->>'status' in ('released','held') or rr->>'selected'='true' or rr ? 'reviewedBy')), '{}'::jsonb),
 'qaqcRules',coalesce(p_data->'qaqcRules','[]'::jsonb),
 'sampleReview',coalesce((select jsonb_object_agg(coalesce(r->>'recordId',r->>'id'), jsonb_strip_nulls(jsonb_build_object(
   'id',r->'id','sampleId',r->'sampleId','holeId',r->'holeId','from',r->'from','to',r->'to','assays',r->'assays','detectionLimits',r->'detectionLimits','lowerLimits',r->'lowerLimits',
   'assayReviewStatus',r->'assayReviewStatus','assayResults',r->'assayResults','assayHistory',r->'assayHistory')))
   from jsonb_array_elements(coalesce(p_data->'samples','[]'::jsonb)) r
   where coalesce(r->'assays','{}'::jsonb)<>'{}'::jsonb or r->>'assayReviewStatus' in ('released','held') or coalesce(r->'assayResults','[]'::jsonb)<>'[]'::jsonb or coalesce(r->'assayHistory','[]'::jsonb)<>'[]'::jsonb), '{}'::jsonb),
 'intervalReview',coalesce((select jsonb_object_agg(coalesce(r->>'recordId',r->>'sampleId',r->>'id', (r->>'holeId')||':'||(r->>'from')||':'||(r->>'to')), jsonb_strip_nulls(jsonb_build_object(
   'id',r->'id','sampleId',r->'sampleId','holeId',r->'holeId','from',r->'from','to',r->'to','assays',r->'assays','detectionLimits',r->'detectionLimits','lowerLimits',r->'lowerLimits',
   'assayReviewStatus',r->'assayReviewStatus','assayResults',r->'assayResults','assayHistory',r->'assayHistory')))
   from jsonb_array_elements(coalesce(p_data->'intervals','[]'::jsonb)) r
   where coalesce(r->'assays','{}'::jsonb)<>'{}'::jsonb or r->>'assayReviewStatus' in ('released','held') or coalesce(r->'assayResults','[]'::jsonb)<>'[]'::jsonb or coalesce(r->'assayHistory','[]'::jsonb)<>'[]'::jsonb), '{}'::jsonb),
 'custodyDecisions',coalesce((select jsonb_object_agg(r->>'id',jsonb_strip_nulls(jsonb_build_object('closures',r->'closures','orders',r->'orders','authorizedMethods',r->'authorizedMethods','exceptionResolutions',r->'exceptionResolutions','closedAt',r->'closedAt','closedBy',r->'closedBy','closeReason',r->'closeReason','closed',r->>'status'='closed'))) from jsonb_array_elements(coalesce(p_data->'dispatches','[]'::jsonb)) r where coalesce(r->'closures','[]'::jsonb)<>'[]'::jsonb or coalesce(r->'orders','[]'::jsonb)<>'[]'::jsonb or coalesce(r->'exceptionResolutions','[]'::jsonb)<>'[]'::jsonb or r->>'status'='closed' or r ? 'closedAt' or (r ? 'authorizedMethods' and r->'authorizedMethods'<>jsonb_build_array(r->>'method'))),'{}'::jsonb)
 )
$$;
revoke all on function public.geology_review_projection(jsonb) from public;
create function public.geology_create_project(p_id uuid,p_operation uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_existing public.geology_projects; begin
 if v_actor is null then raise exception 'Access denied'; end if;
 perform public.geology_validate_project(p_data);
 select p.* into v_existing from public.geology_projects p join public.geology_audit a on a.project_id=p.id where a.operation_id=p_operation and a.actor_id=v_actor and a.action='create';
 if found then
   if public.geology_role(v_existing.id) is null then raise exception 'Access denied'; end if;
   if v_existing.id<>p_id or not exists(select 1 from public.geology_audit where operation_id=p_operation and after_data=p_data) then raise exception 'CONFLICT: operation reused'; end if;
   return to_jsonb(v_existing);
 end if;
 insert into public.geology_projects(id,name,data,created_by,updated_by) values(p_id,p_data->>'name',p_data,v_actor,v_actor) returning * into v_existing;
 insert into public.geology_members(project_id,user_id,role) values(p_id,v_actor,'owner');
 insert into public.geology_audit(project_id,operation_id,version,actor_id,action,reason,after_data) values(p_id,p_operation,1,v_actor,'create','Explicitly created shared project',p_data);
 return to_jsonb(v_existing);
end $$;
create function public.geology_history_extends(p_before jsonb,p_after jsonb) returns boolean language sql immutable set search_path=public,pg_temp as $$
 select jsonb_typeof(coalesce(p_after,'[]'::jsonb))='array' and jsonb_array_length(coalesce(p_after,'[]'::jsonb))>=jsonb_array_length(coalesce(p_before,'[]'::jsonb)) and not exists(select 1 from jsonb_array_elements(coalesce(p_before,'[]'::jsonb)) with ordinality as history(item,position) where item is distinct from p_after->((position-1)::int))
$$;
revoke all on function public.geology_history_extends(jsonb,jsonb) from public;
create function public.geology_save_project(p_id uuid,p_operation uuid,p_version bigint,p_data jsonb,p_reason text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_role text; v_old public.geology_projects; v_prior public.geology_audit; v_kind text; begin
 v_role:=public.geology_role(p_id);
 if v_role is null or v_role='viewer' then raise exception 'Access denied'; end if;
 if coalesce(length(btrim(p_reason)),0) not between 3 and 500 then raise exception 'Invalid change reason'; end if;
 perform public.geology_validate_project(p_data);
 select * into v_old from public.geology_projects where id=p_id for update;
 select * into v_prior from public.geology_audit where operation_id=p_operation;
 if found then
   if v_prior.project_id<>p_id or v_prior.actor_id<>auth.uid() or v_prior.after_data<>p_data then raise exception 'CONFLICT: operation reused'; end if;
   return jsonb_build_object('id',p_id,'version',v_prior.version,'data',v_prior.after_data);
 end if;
 if v_old.version<>p_version then raise exception 'CONFLICT: project revision changed'; end if;
 if p_data->>'id'<>v_old.data->>'id' then raise exception 'Invalid immutable project identity'; end if;
 foreach v_kind in array array['samples','collars'] loop
  if exists(select 1 from jsonb_array_elements(v_old.data->v_kind) o
    left join jsonb_array_elements(p_data->v_kind) n on (o ? 'recordId' and n->>'recordId'=o->>'recordId') or (not (o ? 'recordId') and upper(btrim(n->>'id'))=upper(btrim(o->>'id')))
    where n is null) then raise exception 'Invalid removal or replacement of immutable field identity; archive existing records'; end if;
 end loop;

 if v_role='collector' and public.geology_review_projection(p_data) is distinct from public.geology_review_projection(v_old.data) then raise exception 'Reviewer required for laboratory or released data changes'; end if;
 if v_role='collector' and exists(
  select 1 from jsonb_array_elements(coalesce(v_old.data->'dispatches','[]'::jsonb)) old_dispatch
  left join jsonb_array_elements(coalesce(p_data->'dispatches','[]'::jsonb)) new_dispatch on new_dispatch->>'id'=old_dispatch->>'id'
  where new_dispatch is null or (old_dispatch - array['shipments','receipts','status','closures','orders','exceptionResolutions','closedAt','closedBy','closeReason']) is distinct from (new_dispatch - array['shipments','receipts','status','closures','orders','exceptionResolutions','closedAt','closedBy','closeReason'])
 ) then raise exception 'Reviewer required for manifest amendments'; end if;
 if v_role='collector' and exists(
  select 1 from jsonb_array_elements(coalesce(p_data->'dispatches','[]'::jsonb)) n
  left join jsonb_array_elements(coalesce(v_old.data->'dispatches','[]'::jsonb)) o on n->>'id'=o->>'id'
  where (o is null and (n->>'status' is distinct from 'prepared' or coalesce(n->'shipments','[]'::jsonb)<>'[]'::jsonb or coalesce(n->'receipts','[]'::jsonb)<>'[]'::jsonb))
  or not public.geology_history_extends(o->'shipments',n->'shipments') or not public.geology_history_extends(o->'receipts',n->'receipts')
  or (o->>'status'='prepared' and n->>'status' not in ('prepared','shipped'))
  or (o->>'status'='shipped' and n->>'status' not in ('shipped','received','receipt_exception'))
  or (o->>'status' in ('received','receipt_exception') and n->>'status' not in ('received','receipt_exception'))
 ) then raise exception 'Reviewer required for custody corrections; field events must extend history'; end if;


 update public.geology_projects set name=p_data->>'name',data=p_data,version=version+1,updated_at=now(),updated_by=auth.uid() where id=p_id;
 insert into public.geology_audit(project_id,operation_id,version,actor_id,action,reason,before_data,after_data) values(p_id,p_operation,p_version+1,auth.uid(),'save',p_reason,v_old.data,p_data);
 return jsonb_build_object('id',p_id,'version',p_version+1,'data',p_data,'updated_by',auth.uid(),'updated_at',now());
end $$;
create function public.geology_set_member(p_id uuid,p_user uuid,p_role text,p_reason text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_previous text; v_version bigint; begin
 if public.geology_role(p_id) is distinct from 'owner' then raise exception 'Access denied'; end if;
 if p_role not in ('owner','reviewer','collector','viewer','revoke') or coalesce(length(btrim(p_reason)),0) not between 3 and 500 then raise exception 'Invalid role or reason'; end if;
 select version into v_version from public.geology_projects where id=p_id for update;
 select role into v_previous from public.geology_members where project_id=p_id and user_id=p_user;
 if v_previous='owner' and p_role<>'owner' and (select count(*) from public.geology_members where project_id=p_id and role='owner')<=1 then raise exception 'Invalid removal of last project owner'; end if;
 if not exists(select 1 from auth.users where id=p_user) then raise exception 'Invalid account ID: the member must sign up first'; end if;
 if p_role='revoke' then delete from public.geology_members where project_id=p_id and user_id=p_user; else
 insert into public.geology_members(project_id,user_id,role) values(p_id,p_user,p_role) on conflict(project_id,user_id) do update set role=excluded.role; end if;
 insert into public.geology_audit(project_id,operation_id,version,actor_id,action,reason,before_data,after_data) values(p_id,gen_random_uuid(),v_version,auth.uid(),'membership',p_reason,jsonb_build_object('userId',p_user,'role',v_previous),jsonb_build_object('userId',p_user,'role',p_role));
end $$;
revoke all on function public.geology_create_project(uuid,uuid,jsonb),public.geology_save_project(uuid,uuid,bigint,jsonb,text),public.geology_set_member(uuid,uuid,text,text) from public;
grant execute on function public.geology_create_project(uuid,uuid,jsonb),public.geology_save_project(uuid,uuid,bigint,jsonb,text),public.geology_set_member(uuid,uuid,text,text) to authenticated;

-- Hard database ceilings supplement stricter deployment-configured extraction limits.
create table public.geology_extraction_usage(scope_key text not null, day date not null, requests integer not null, input_chars bigint not null, primary key(scope_key,day));
alter table public.geology_extraction_usage enable row level security;
revoke all on public.geology_extraction_usage from public,anon,authenticated;
create function public.geology_reserve_extraction(project_id uuid,max_requests_day integer,max_input_chars_day integer,requested_chars integer) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare r text; user_key text:='user:'||auth.uid()::text; project_key text:='project:'||project_id::text; d date:=(now() at time zone 'UTC')::date; u public.geology_extraction_usage; p public.geology_extraction_usage; begin
 r:=public.geology_role(project_id);
 if r is null or r='viewer' then raise exception 'Access denied'; end if;
 if requested_chars not between 1 and 500000 or max_requests_day<1 or max_input_chars_day<1 then return false; end if;
 insert into public.geology_extraction_usage values(user_key,d,0,0),(project_key,d,0,0) on conflict do nothing;
 -- A consistent key order avoids deadlocks across concurrent project/user requests.
 perform 1 from public.geology_extraction_usage where scope_key in(user_key,project_key) and day=d order by scope_key for update;
 select * into u from public.geology_extraction_usage where scope_key=user_key and day=d;
 select * into p from public.geology_extraction_usage where scope_key=project_key and day=d;
 if u.requests>=least(max_requests_day,20) or u.input_chars+requested_chars>least(max_input_chars_day,500000) or p.requests>=100 or p.input_chars+requested_chars>2000000 then return false; end if;
 update public.geology_extraction_usage set requests=requests+1,input_chars=input_chars+requested_chars where scope_key in(user_key,project_key) and day=d;
 return true;
end $$;
revoke all on function public.geology_reserve_extraction(uuid,integer,integer,integer) from public;
grant execute on function public.geology_reserve_extraction(uuid,integer,integer,integer) to authenticated;

-- Attachments upload directly to private Storage, avoiding serverless request limits.
-- The conditional makes the migration runnable in the isolated PostgreSQL test harness.
do $$ begin
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('geology-attachments','geology-attachments',false,25000000,array['image/jpeg','image/png','image/webp','image/avif','application/pdf','text/plain','text/csv','application/octet-stream']) on conflict(id) do nothing;
  execute $policy$create policy geology_attachment_read on storage.objects for select to authenticated using(bucket_id='geology-attachments' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and public.geology_role(((storage.foldername(name))[1])::uuid) is not null)$policy$;
  execute $policy$create policy geology_attachment_insert on storage.objects for insert to authenticated with check(bucket_id='geology-attachments' and name ~ '^[0-9a-f-]{36}/[a-f0-9]{64}$' and public.geology_role(((storage.foldername(name))[1])::uuid) in ('owner','reviewer','collector'))$policy$;
 end if;
end $$;

commit;
