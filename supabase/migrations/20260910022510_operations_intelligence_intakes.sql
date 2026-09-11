-- Governed AI intake and proposal lifecycle. The AI may prepare bounded proposals,
-- but only existing MineralX commands may mutate operational records.
begin;

-- Supabase OAuth access tokens carry a client_id claim. Route those tokens to
-- a dedicated Postgres role that does not inherit the browser application's
-- authenticated grants. The MCP HTTP boundary verifies the token and relays
-- only fixed operations through the service-only gateway defined below.
do $$
begin
 if not exists(select 1 from pg_catalog.pg_roles where rolname='mineralx_mcp') then
  execute 'create role mineralx_mcp nologin noinherit';
 elsif exists(
  select 1 from pg_catalog.pg_roles
  where rolname='mineralx_mcp'
   and (rolsuper or rolinherit or rolcreaterole or rolcreatedb or rolcanlogin
    or rolreplication or rolbypassrls)
 ) then
  raise exception 'Existing mineralx_mcp role has unsafe attributes';
 end if;
end $$;
-- Supabase migration owners are deliberately not superusers, so privileged
-- role attributes cannot be toggled even to their safe value. CREATE ROLE's
-- defaults plus the assertion above prove those flags are already disabled.
alter role mineralx_mcp nologin noinherit;
grant mineralx_mcp to authenticator;

create function public.mineralx_access_token_hook(event jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare
 claims jsonb;
 client_id text;
 audience text;
begin
 if jsonb_typeof(event)<>'object' or jsonb_typeof(event->'claims')<>'object' then
  raise exception 'Invalid access-token hook event';
 end if;
 claims:=event->'claims';
 if claims ? 'client_id' and jsonb_typeof(claims->'client_id')<>'string' then
  raise exception 'Invalid OAuth client claim';
 end if;
 client_id:=nullif(trim(claims->>'client_id'),'');
 if client_id is not null then
  if length(client_id)>512 or client_id ~ '[\x00-\x1f\x7f]' then
   raise exception 'Invalid OAuth client claim';
  end if;
  audience:=nullif(trim(current_setting('app.settings.mineralx_mcp_audience',true)),'');
  if audience is null
   or audience !~ '^https://[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::[0-9]{1,5})?/api/mcp$'
  then
   raise exception 'MineralX MCP audience is not configured';
  end if;
  claims:=jsonb_set(claims,'{role}','"mineralx_mcp"'::jsonb,true);
  claims:=jsonb_set(claims,'{mineralx_token_class}','"mcp_oauth"'::jsonb,true);
  claims:=jsonb_set(claims,'{aud}',to_jsonb(audience),true);
  event:=jsonb_set(event,'{claims}',claims,false);
 end if;
 return event;
end $$;

revoke all on function public.mineralx_access_token_hook(jsonb)
 from public,anon,authenticated,service_role,mineralx_mcp;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.mineralx_access_token_hook(jsonb) to supabase_auth_admin;

-- Intelligence uploads use the existing private evidence store and verification
-- path. Raise the per-object limit without relaxing names, hashes, families, or
-- the explicit MIME allowlist.
alter table mx_ops.files drop constraint files_size_bytes_check;
alter table mx_ops.files add constraint files_size_bytes_check
 check(size_bytes between 1 and 52428800);
alter table mx_ops.files
 add column scan_status text not null default 'pending'
  check(scan_status in('pending','clean')),
 add column scan_engine text not null default '' check(length(scan_engine)<=160),
 add column scanned_at timestamptz,
 add constraint files_scan_attestation_check check(
  (scan_status='pending' and scan_engine='' and scanned_at is null)
  or (scan_status='clean' and length(trim(scan_engine)) between 2 and 160 and scanned_at is not null)
 );

alter function mx_ops.core_command(uuid,text,uuid,integer,jsonb) rename to core_command_v9;
create function mx_ops.core_command(
 p_scope uuid,p_action text,p_id uuid,p_expected integer,p jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare f mx_ops.files;v_size bigint;v_media text;v_family text;v_name text;
begin
 if p_action='file.prepare' then
  perform mx_ops.check_version(0,p_expected);
  v_family:=p->>'family';v_media:=p->>'media_type';v_name:=mx_ops.required_text(p,'name',240);
  perform mx_ops.rule(v_family in('geo','plant','gold','custody'),'Choose an allowed file family');
  perform mx_ops.require_permission(p_scope,'files.'||v_family);
  perform mx_ops.rule(
   jsonb_typeof(p->'size_bytes') in('string','number')
    and coalesce(p->>'size_bytes','') ~ '^[0-9]{1,8}$',
   'Enter a valid file size'
  );
  v_size:=(p->>'size_bytes')::bigint;
  perform mx_ops.rule(v_size between 1 and 52428800,'Files may not exceed 50 MiB');
  perform mx_ops.rule(
   v_name !~ '[/\\\x00-\x1f]'
    and lower(v_name) !~ '\.(zip|7z|rar|tar|tgz|gz|bz2|xz)$'
    and v_media in(
     'application/pdf','image/jpeg','image/png','image/webp','text/csv','text/plain',
     'application/json','application/geo+json','application/vnd.google-earth.kml+xml',
     'application/vnd.google-earth.kmz','application/octet-stream',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
     'application/vnd.openxmlformats-officedocument.presentationml.presentation',
     'application/vnd.las','application/vnd.laszip'
    ),
   'Unsupported file name or type'
  );
  perform mx_ops.rule(coalesce(p->>'sha256','') ~ '^[0-9a-f]{64}$','Enter a valid SHA-256 digest');
  insert into mx_ops.files(
   id,scope_id,family,name,media_type,size_bytes,sha256,object_path,created_by
  ) values(
   p_id,p_scope,v_family,v_name,v_media,v_size,
   p->>'sha256',p_scope::text||'/'||p_id::text,auth.uid()
  ) returning * into f;
  return to_jsonb(f)||jsonb_build_object('version',1);
 end if;
 return mx_ops.core_command_v9(p_scope,p_action,p_id,p_expected,p);
end $$;

-- Integrity verification and malware scanning are deliberately separate.
-- Only the trusted ingestion service may attest a clean result, and a clean
-- attestation cannot later be replaced by a different engine assertion.
create function public.mx_ops_file_scan_attest(
 p_actor uuid,p_scope uuid,p_id uuid,p_hash text,p_engine text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare f mx_ops.files;engine text;
begin
 engine:=trim(coalesce(p_engine,''));
 perform mx_ops.rule(
  p_actor is not null and p_scope is not null and p_id is not null
   and coalesce(p_hash,'') ~ '^[0-9a-f]{64}$'
   and length(engine) between 2 and 160
   and engine !~ '[\x00-\x1f\x7f]',
  'Invalid clean scan attestation'
 );
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 perform set_config('request.jwt.claim.aal','aal1',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'aal','aal1')::text,true);
 select * into f from mx_ops.files x
 where x.scope_id=p_scope and x.id=p_id for update;
 perform mx_ops.rule(f.id is not null,'Source not found');
 perform mx_ops.require_permission(p_scope,'files.'||f.family);
 perform mx_ops.rule(
  f.created_by=p_actor and f.status='verified' and f.sha256=p_hash,
  'Scan attestation does not match the verified source, digest, or uploading staff member'
 );
 if f.scan_status='clean' then
  perform mx_ops.rule(f.scan_engine=engine,'A different clean scan attestation already exists');
  return to_jsonb(f)||jsonb_build_object('replayed',true);
 end if;
 update mx_ops.files
 set scan_status='clean',scan_engine=engine,scanned_at=now()
 where scope_id=p_scope and id=p_id returning * into f;
 return to_jsonb(f)||jsonb_build_object('replayed',false);
end $$;

do $$ begin
 if to_regclass('storage.buckets') is not null then
  execute $sql$update storage.buckets set file_size_limit=52428800 where id='mineralx-ops-evidence'$sql$;
  if exists(
   select 1 from information_schema.columns
   where table_schema='storage' and table_name='buckets' and column_name='allowed_mime_types'
  ) then
   execute $sql$
    update storage.buckets set allowed_mime_types=array[
     'application/pdf','image/jpeg','image/png','image/webp','text/csv','text/plain',
     'application/json','application/geo+json','application/vnd.google-earth.kml+xml',
     'application/vnd.google-earth.kmz','application/octet-stream',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
     'application/vnd.openxmlformats-officedocument.presentationml.presentation',
     'application/vnd.las','application/vnd.laszip'
    ] where id='mineralx-ops-evidence'
   $sql$;
  end if;

  -- The original policies used `f.object_path = name` inside the correlated
  -- subquery. PostgreSQL resolved `name` to mx_ops.files.name, not to the
  -- outer storage.objects row. Qualify the outer relation so signed uploads
  -- are authorised only for their pre-staged object path.
  execute $sql$drop policy if exists mx_ops_object_read on storage.objects$sql$;
  execute $sql$
   create policy mx_ops_object_read on storage.objects for select to authenticated
   using(
    storage.objects.bucket_id='mineralx-ops-evidence'
    and exists(
     select 1 from mx_ops.files source_file
     where source_file.object_path=storage.objects.name
       and source_file.status='verified'
       and mx_ops.can(source_file.scope_id,'files.'||source_file.family)
    )
   )
  $sql$;
  execute $sql$drop policy if exists mx_ops_object_insert on storage.objects$sql$;
  execute $sql$
   create policy mx_ops_object_insert on storage.objects for insert to authenticated
   with check(
    storage.objects.bucket_id='mineralx-ops-evidence'
    and exists(
     select 1 from mx_ops.files source_file
     where source_file.object_path=storage.objects.name
       and source_file.created_by=(select auth.uid())
       and source_file.status='staged'
       and mx_ops.can(source_file.scope_id,'files.'||source_file.family)
    )
   )
  $sql$;
 end if;
end $$;

create table mx_ops.intelligence_intakes (
 id uuid primary key,
 scope_id uuid not null references mx_ops.scopes(id),
 version integer not null default 1 check(version>0),
 status text not null default 'received' check(status in('received','proposed','approved','completed')),
 title text not null check(length(trim(title)) between 3 and 240),
 instructions text not null default '' check(octet_length(instructions)<=16000),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 proposed_at timestamptz,
 approved_at timestamptz,
 completed_at timestamptz,
 unique(scope_id,id),
 check((status='received' and proposed_at is null and approved_at is null and completed_at is null)
    or (status='proposed' and proposed_at is not null and approved_at is null and completed_at is null)
    or (status='approved' and proposed_at is not null and approved_at is not null and completed_at is null)
    or (status='completed' and proposed_at is not null and approved_at is not null and completed_at is not null))
);
create index intelligence_intakes_scope_status
 on mx_ops.intelligence_intakes(scope_id,status,created_at desc,id);
create index intelligence_intakes_scope_created
 on mx_ops.intelligence_intakes(scope_id,created_at desc,id desc);

create table mx_ops.intelligence_intake_files (
 scope_id uuid not null,
 intake_id uuid not null,
 file_id uuid not null,
 ordinal integer not null check(ordinal between 1 and 20),
 source_reference text not null default '' check(
  length(source_reference)<=500
  and source_reference !~* '(^[[:space:]]*((https?|ftp|file|data):|//)|://)'
 ),
 attached_by uuid not null references auth.users(id),
 attached_at timestamptz not null default now(),
 primary key(intake_id,file_id),
 unique(intake_id,ordinal),
 foreign key(scope_id,intake_id) references mx_ops.intelligence_intakes(scope_id,id),
 foreign key(scope_id,file_id) references mx_ops.files(scope_id,id)
);
create index intelligence_intake_files_scope_file
 on mx_ops.intelligence_intake_files(scope_id,file_id,intake_id);
create index intelligence_intake_files_scope_intake
 on mx_ops.intelligence_intake_files(scope_id,intake_id,ordinal);

create table mx_ops.intelligence_proposals (
 id uuid primary key,
 scope_id uuid not null,
 intake_id uuid not null,
 version integer not null default 1 check(version between 1 and 3),
 action text not null check(action in('classify','summarize','route_file','create_draft','update_record','link_duplicate','create_task')),
 mutates boolean generated always as(action not in('classify','summarize')) stored,
 summary text not null check(length(trim(summary)) between 3 and 2000),
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=150000),
 status text not null default 'proposed' check(status in('proposed','approved','completed')),
 requested_by uuid not null references auth.users(id),
 proposed_at timestamptz not null default now(),
 approved_by uuid references auth.users(id),
 approved_at timestamptz,
 approval_revision bigint,
 approval_reason text not null default '' check(length(approval_reason)<=1000),
 completion jsonb,
 completed_at timestamptz,
 unique(scope_id,id),
 unique(scope_id,intake_id),
 unique(scope_id,intake_id,id),
 foreign key(scope_id,intake_id) references mx_ops.intelligence_intakes(scope_id,id),
 check((status='proposed' and approved_by is null and approved_at is null and approval_revision is null and completion is null and completed_at is null)
    or (status='approved' and approved_by is not null and approved_at is not null and approval_revision is not null and completion is null and completed_at is null)
    or (status='completed' and approved_by is not null and approved_at is not null and approval_revision is not null and completion is not null and completed_at is not null))
);
create index intelligence_proposals_scope_status
 on mx_ops.intelligence_proposals(scope_id,status,proposed_at desc,id);

create table mx_ops.intelligence_proposal_executions (
 scope_id uuid not null,
 intake_id uuid not null,
 proposal_id uuid not null,
 ordinal integer not null check(ordinal between 1 and 32),
 request_id uuid not null,
 actor_id uuid not null references auth.users(id),
 executed_at timestamptz not null,
 scope_revision bigint not null check(scope_revision>0),
 command jsonb not null check(jsonb_typeof(command)='object' and octet_length(command::text)<=150000),
 receipt jsonb not null check(jsonb_typeof(receipt)='object' and octet_length(receipt::text)<=200000),
 recorded_at timestamptz not null default now(),
 primary key(proposal_id,ordinal),
 unique(scope_id,request_id),
 foreign key(scope_id,intake_id,proposal_id) references mx_ops.intelligence_proposals(scope_id,intake_id,id),
 foreign key(scope_id,request_id) references mx_ops.receipts(scope_id,request_id)
);
create index intelligence_proposal_executions_scope_intake
 on mx_ops.intelligence_proposal_executions(scope_id,intake_id,proposal_id,ordinal);

create table mx_ops.intelligence_events (
 seq bigint generated always as identity primary key,
 scope_id uuid not null,
 intake_id uuid not null,
 proposal_id uuid,
 actor_id uuid not null references auth.users(id),
 principal text not null check(principal in('user','service')),
 request_id uuid not null,
 event_type text not null check(event_type in('intake.created','proposal.created','proposal.approved','intake.completed')),
 from_status text,
 to_status text not null,
 version integer not null check(version>0),
 reason text not null default '' check(length(reason)<=1000),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object' and octet_length(snapshot::text)<=200000),
 recorded_at timestamptz not null default now(),
 unique(scope_id,request_id,event_type),
 foreign key(scope_id,intake_id) references mx_ops.intelligence_intakes(scope_id,id),
 foreign key(scope_id,intake_id,proposal_id) references mx_ops.intelligence_proposals(scope_id,intake_id,id)
);
create index intelligence_events_scope_intake
 on mx_ops.intelligence_events(scope_id,intake_id,seq);

create function mx_ops.intelligence_prevent_event_change() returns trigger
language plpgsql set search_path='' as $$
begin
 raise exception 'IMMUTABLE: intelligence lineage events cannot be changed';
end $$;

create trigger intelligence_events_are_append_only
 before update or delete on mx_ops.intelligence_events
 for each row execute function mx_ops.intelligence_prevent_event_change();

create trigger intelligence_proposal_executions_are_append_only
 before update or delete on mx_ops.intelligence_proposal_executions
 for each row execute function mx_ops.intelligence_prevent_event_change();

create function mx_ops.intelligence_can_read(p_scope uuid,p_intake uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1
  from mx_ops.intelligence_intakes i
  where i.scope_id=p_scope and i.id=p_intake
   and mx_ops.can(p_scope,'work.read')
   and not exists(
    select 1
    from mx_ops.intelligence_intake_files a
    join mx_ops.files f on f.scope_id=a.scope_id and f.id=a.file_id
    where a.scope_id=i.scope_id and a.intake_id=i.id
     and not mx_ops.can(i.scope_id,'files.'||f.family)
   )
 )
$$;

create function mx_ops.intelligence_require_access(
 p_scope uuid,p_intake uuid,p_permission text,p_mfa boolean default false
) returns void language plpgsql security definer set search_path='' as $$
declare v_family text;
begin
 perform mx_ops.require_permission(p_scope,'work.read');
 if p_permission<>'work.read' or p_mfa then
  perform mx_ops.require_permission(p_scope,p_permission,p_mfa);
 end if;
 perform mx_ops.rule(
  exists(select 1 from mx_ops.intelligence_intakes i where i.scope_id=p_scope and i.id=p_intake),
  'Intake not found'
 );
 for v_family in
  select distinct f.family
  from mx_ops.intelligence_intake_files a
  join mx_ops.files f on f.scope_id=a.scope_id and f.id=a.file_id
  where a.scope_id=p_scope and a.intake_id=p_intake
 loop
  perform mx_ops.require_permission(p_scope,'files.'||v_family);
 end loop;
end $$;

create function mx_ops.intelligence_record(p_scope uuid,p_intake uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(i)||jsonb_build_object(
  'sources',coalesce((
   select jsonb_agg(jsonb_build_object(
    'fileId',f.id,'family',f.family,'name',f.name,'mediaType',f.media_type,
    'sizeBytes',f.size_bytes,'sha256',f.sha256,'status',f.status,
    'scanStatus',f.scan_status,'scanEngine',f.scan_engine,'scannedAt',f.scanned_at,
    'ordinal',a.ordinal,'sourceReference',a.source_reference,
    'attachedBy',a.attached_by,'attachedAt',a.attached_at
   ) order by a.ordinal)
   from mx_ops.intelligence_intake_files a
   join mx_ops.files f on f.scope_id=a.scope_id and f.id=a.file_id
   where a.scope_id=i.scope_id and a.intake_id=i.id
  ),'[]'::jsonb),
  'proposal',(
   select to_jsonb(p)
   from mx_ops.intelligence_proposals p
   where p.scope_id=i.scope_id and p.intake_id=i.id
  ),
  'executions',coalesce((
   select jsonb_agg(jsonb_build_object(
    'ordinal',x.ordinal,'requestId',x.request_id,'command',x.command,
    'receipt',x.receipt,'actorId',x.actor_id,'executedAt',x.executed_at,
    'scopeRevision',x.scope_revision,'recordedAt',x.recorded_at
   ) order by x.ordinal)
   from mx_ops.intelligence_proposal_executions x
   where x.scope_id=i.scope_id and x.intake_id=i.id
  ),'[]'::jsonb),
  'events',coalesce((
   select jsonb_agg(to_jsonb(e) order by e.seq)
   from mx_ops.intelligence_events e
   where e.scope_id=i.scope_id and e.intake_id=i.id
  ),'[]'::jsonb)
 )
 from mx_ops.intelligence_intakes i
 where i.scope_id=p_scope and i.id=p_intake
$$;

create function mx_ops.intelligence_append_event(
 p_scope uuid,p_intake uuid,p_proposal uuid,p_actor uuid,p_principal text,
 p_request uuid,p_event text,p_from text,p_to text,p_version integer,
 p_reason text,p_snapshot jsonb
) returns void language plpgsql security definer set search_path='' as $$
begin
 insert into mx_ops.intelligence_events(
  scope_id,intake_id,proposal_id,actor_id,principal,request_id,event_type,
  from_status,to_status,version,reason,snapshot
 ) values(
  p_scope,p_intake,p_proposal,p_actor,p_principal,p_request,p_event,
  p_from,p_to,p_version,left(coalesce(p_reason,''),1000),p_snapshot
 );
 insert into mx_ops.audit(
  scope_id,entity_id,actor_id,request_id,action,version,permission,reason,snapshot
 ) values(
  p_scope,p_intake,p_actor,p_request,'intelligence.'||p_event,p_version,
  -- Generic workflow history has only work.read gating. Keep its index entry
  -- deliberately metadata-only; full snapshots and reasons remain in the
  -- intelligence event table behind every attached file-family permission.
  'work.read','',jsonb_build_object(
   'intakeId',p_intake,'proposalId',p_proposal,'eventType',p_event,
   'fromStatus',p_from,'toStatus',p_to,'version',p_version
  )
 );
end $$;

-- List responses are deliberately compact. Detailed instructions, source
-- metadata, proposal payloads, executions, and lineage are available only from
-- the single-intake read after the same family-aware access check.
create function public.mx_ops_intelligence_list(
 p_scope uuid,p_after uuid default null,p_limit integer default 50
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 after_created_at timestamptz;
 rows_result jsonb;
 next_id uuid;
begin
 perform mx_ops.require_permission(p_scope,'work.read');
 perform mx_ops.rule(p_limit between 1 and 100,'Intelligence list limit must be between 1 and 100');
 if p_after is not null then
  select i.created_at into after_created_at
  from mx_ops.intelligence_intakes i
  where i.scope_id=p_scope and i.id=p_after
   and mx_ops.intelligence_can_read(p_scope,i.id);
  perform mx_ops.rule(found,'Invalid or inaccessible intelligence cursor');
 end if;
 with candidates as materialized (
  select i.*
  from mx_ops.intelligence_intakes i
  where i.scope_id=p_scope
   and mx_ops.intelligence_can_read(p_scope,i.id)
   and (
    p_after is null
    or (i.created_at,i.id)<(after_created_at,p_after)
   )
  order by i.created_at desc,i.id desc
  limit p_limit+1
 ),page as materialized (
  select i.* from candidates i
  order by i.created_at desc,i.id desc
  limit p_limit
 ),summaries as (
  select
   i.id,
   i.created_at,
   jsonb_build_object(
    'id',i.id,
    'scopeId',i.scope_id,
    'version',i.version,
    'status',i.status,
    'title',i.title,
    'createdBy',i.created_by,
    'createdAt',i.created_at,
    'proposedAt',i.proposed_at,
    'approvedAt',i.approved_at,
    'completedAt',i.completed_at,
    'sourceCount',(
     select count(*)::integer
     from mx_ops.intelligence_intake_files a
     where a.scope_id=i.scope_id and a.intake_id=i.id
    ),
    'proposal',case when p.id is null then 'null'::jsonb else jsonb_build_object(
     'id',p.id,
     'version',p.version,
     'action',p.action,
     'summary',p.summary,
     'status',p.status,
     'acceptedForReview',case
      when jsonb_typeof(p.payload->'acceptedForReview')='boolean'
       then p.payload->'acceptedForReview'
      else 'null'::jsonb
     end,
     'reviewState',case
      when jsonb_typeof(p.payload#>'{review,state}')='string'
       and p.payload#>>'{review,state}' in('informational','review_required','blocked')
       then p.payload#>'{review,state}'
      else 'null'::jsonb
     end
    ) end
   ) item
  from page i
  left join mx_ops.intelligence_proposals p
   on p.scope_id=i.scope_id and p.intake_id=i.id
 )
 select
  coalesce(
   (select jsonb_agg(s.item order by s.created_at desc,s.id desc) from summaries s),
   '[]'::jsonb
  ),
  case when (select count(*) from candidates)>p_limit then
   (select s.id from summaries s order by s.created_at,s.id limit 1)
  else null end
 into rows_result,next_id;
 return jsonb_build_object('rows',rows_result,'next',next_id);
end $$;

create function public.mx_ops_intelligence_read(p_scope uuid,p_intake uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if p_intake is not null then
  perform mx_ops.intelligence_require_access(p_scope,p_intake,'work.read',false);
  return mx_ops.intelligence_record(p_scope,p_intake);
 end if;
 -- Preserve the legacy array shape without retaining its former 100-record
 -- full-lineage materialisation hazard.
 return (public.mx_ops_intelligence_list(p_scope,null,100))->'rows';
end $$;

create function public.mx_ops_intelligence_create(
 p_scope uuid,p_request uuid,p_intake uuid,p_title text,p_instructions text,
 p_sources jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 i mx_ops.intelligence_intakes;
 f mx_ops.files;
 receipt mx_ops.receipts;
 intent jsonb;
 response jsonb;
 source jsonb;
 source_id uuid;
 source_ref text;
 source_family text;
 source_ordinal bigint;
 total_source_bytes bigint:=0;
 revision bigint;
begin
 perform mx_ops.require_permission(p_scope,'work.read');
 perform mx_ops.require_permission(p_scope,'work.write');
 perform mx_ops.rule(
  p_request is not null and p_intake is not null
   and length(trim(coalesce(p_title,''))) between 3 and 240
   and octet_length(coalesce(p_instructions,''))<=16000
   and jsonb_typeof(p_sources)='array' and jsonb_array_length(p_sources) between 1 and 20,
  'Invalid intelligence intake'
 );
 perform 1 from mx_ops.scopes s where s.id=p_scope for update;
 intent:=jsonb_build_object(
  'action','intelligence.create','id',p_intake,'title',trim(p_title),
  'instructions',coalesce(p_instructions,''),'sources',p_sources
 );
 select * into receipt from mx_ops.receipts r where r.scope_id=p_scope and r.request_id=p_request;
 if found then
  if receipt.actor_id<>auth.uid() or receipt.intent<>intent then raise exception 'IDEMPOTENCY_MISMATCH';end if;
  perform mx_ops.intelligence_require_access(p_scope,p_intake,'work.write',false);
  return receipt.response||jsonb_build_object('replayed',true);
 end if;
 perform mx_ops.rule(not exists(select 1 from mx_ops.intelligence_intakes x where x.id=p_intake),'Intake ID already exists');
 insert into mx_ops.intelligence_intakes(id,scope_id,title,instructions,created_by)
 values(p_intake,p_scope,trim(p_title),coalesce(p_instructions,''),auth.uid()) returning * into i;
 for source,source_ordinal in
  select x.value,x.ordinality from jsonb_array_elements(p_sources) with ordinality x(value,ordinality)
 loop
  perform mx_ops.rule(
   jsonb_typeof(source)='object'
    and source-(array['fileId','sourceReference']::text[])='{}'::jsonb
    and (not source ? 'sourceReference' or source->'sourceReference'='null'::jsonb
     or jsonb_typeof(source->'sourceReference')='string')
    and coalesce(source->>'fileId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
   'Each source needs only a valid fileId and optional sourceReference'
  );
  source_id:=(source->>'fileId')::uuid;
  source_ref:=coalesce(source->>'sourceReference','');
  perform mx_ops.rule(
   length(source_ref)<=500
    and source_ref !~* '(^[[:space:]]*((https?|ftp|file|data):|//)|://)',
   'Store a source reference, not an external download URL'
  );
  perform mx_ops.rule(
   not exists(select 1 from mx_ops.intelligence_intake_files a where a.intake_id=p_intake and a.file_id=source_id),
   'Attach each source file once'
  );
  select * into f from mx_ops.files x where x.scope_id=p_scope and x.id=source_id;
  perform mx_ops.rule(f.id is not null,'Every source file must exist in this workspace');
  perform mx_ops.require_permission(p_scope,'files.'||f.family);
  perform mx_ops.rule(f.status='verified','Only verified source files may enter intelligence processing');
  if source_family is null then
   source_family:=f.family;
  else
   perform mx_ops.rule(
    f.family=source_family,
    'Each intelligence intake must use one source family; split mixed sources into separate intakes'
   );
  end if;
  total_source_bytes:=total_source_bytes+f.size_bytes;
  perform mx_ops.rule(
   total_source_bytes<=104857600,
   'Intelligence intake sources may not exceed 100 MiB in total'
  );
  insert into mx_ops.intelligence_intake_files(
   scope_id,intake_id,file_id,ordinal,source_reference,attached_by
  ) values(p_scope,p_intake,f.id,source_ordinal::integer,source_ref,auth.uid());
 end loop;
 perform mx_ops.intelligence_append_event(
  p_scope,p_intake,null,auth.uid(),'user',p_request,'intake.created',null,'received',1,
  '',to_jsonb(i)||jsonb_build_object('sources',p_sources)
 );
 update mx_ops.scopes set revision=mx_ops.scopes.revision+1 where id=p_scope
  returning mx_ops.scopes.revision into revision;
 response:=jsonb_build_object(
  'id',p_intake,'version',1,'revision',revision,'action','intelligence.create',
  'record',mx_ops.intelligence_record(p_scope,p_intake)
 );
 insert into mx_ops.receipts(scope_id,request_id,actor_id,intent,response)
 values(p_scope,p_request,auth.uid(),intent,response);
 return response;
end $$;

create function public.mx_ops_intelligence_propose(
 p_scope uuid,p_request uuid,p_intake uuid,p_proposal uuid,p_expected integer,
 p_action text,p_summary text,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 i mx_ops.intelligence_intakes;
 p mx_ops.intelligence_proposals;
 receipt mx_ops.receipts;
 intent jsonb;
 command jsonb;
 normalized_command jsonb;
 commands jsonb:='[]'::jsonb;
 command_ordinal bigint;
 response jsonb;
 revision bigint;
 actor uuid;
begin
 select * into i from mx_ops.intelligence_intakes x
 where x.scope_id=p_scope and x.id=p_intake for update;
 perform mx_ops.rule(i.id is not null,'Intake not found');
 actor:=i.created_by;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claim.aal','aal1',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'aal','aal1')::text,true);
 perform mx_ops.intelligence_require_access(p_scope,p_intake,'work.write',false);
 perform mx_ops.rule(
  p_request is not null and p_proposal is not null and p_expected>=0
   and p_action in('classify','summarize','route_file','create_draft','update_record','link_duplicate','create_task')
   and length(trim(coalesce(p_summary,''))) between 3 and 2000
   and jsonb_typeof(p_payload)='object' and octet_length(p_payload::text)<=150000,
  'Invalid intelligence proposal'
 );
 if p_action not in('classify','summarize') then
  perform mx_ops.rule(
   jsonb_typeof(p_payload->'commands')='array'
    and jsonb_array_length(p_payload->'commands') between 1 and 32,
   'A mutating proposal must contain between 1 and 32 bounded MineralX commands'
  );
  for command,command_ordinal in
   select x.value,x.ordinality
   from jsonb_array_elements(p_payload->'commands') with ordinality x(value,ordinality)
  loop
   perform mx_ops.rule(
    jsonb_typeof(command)='object'
     and command-(array['action','id','expected','payload']::text[])='{}'::jsonb
     and jsonb_typeof(command->'payload')='object'
     and coalesce(command->>'id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     and coalesce(command->>'expected','') ~ '^[0-9]+$'
     and exists(select 1 from mx_ops.command_permissions c where c.action=command->>'action'),
    'Each mutation must be one strict registered MineralX command'
   );
   normalized_command:=jsonb_build_object(
    'action',command->>'action','id',(command->>'id')::uuid,
    'expected',(command->>'expected')::integer,'payload',command->'payload'
   );
   commands:=commands||jsonb_build_array(normalized_command);
  end loop;
  p_payload:=jsonb_set(p_payload,'{commands}',commands,false);
 else
  perform mx_ops.rule(
   not p_payload ? 'commands' or p_payload->'commands'='[]'::jsonb,
   'Read-only proposals cannot contain commands'
  );
 end if;
 intent:=jsonb_build_object(
  'action','intelligence.propose','intake_id',p_intake,'proposal_id',p_proposal,
  'expected',p_expected,'proposal_action',p_action,'summary',trim(p_summary),'payload',p_payload
 );
 select * into receipt from mx_ops.receipts r where r.scope_id=p_scope and r.request_id=p_request;
 if found then
  if receipt.actor_id<>actor or receipt.intent<>intent then raise exception 'IDEMPOTENCY_MISMATCH';end if;
  return receipt.response||jsonb_build_object('replayed',true);
 end if;
 perform mx_ops.rule(i.status='received','Only a received intake may receive a proposal');
 perform mx_ops.check_version(i.version,p_expected);
 -- Lock the attached file rows before the gate so their verification and scan
 -- state cannot change between this check and proposal creation.
 perform f.id
 from mx_ops.intelligence_intake_files a
 join mx_ops.files f on f.scope_id=a.scope_id and f.id=a.file_id
 where a.scope_id=p_scope and a.intake_id=p_intake
 order by f.id
 for share of f;
 perform mx_ops.rule(
  not exists(
   select 1
   from mx_ops.intelligence_intake_files a
   join mx_ops.files f on f.scope_id=a.scope_id and f.id=a.file_id
   where a.scope_id=p_scope and a.intake_id=p_intake
    and (f.status<>'verified' or f.scan_status<>'clean')
  ),
  'Every proposal source must still be verified and malware-scanned clean'
 );
 perform mx_ops.rule(not exists(select 1 from mx_ops.intelligence_proposals x where x.id=p_proposal),'Proposal ID already exists');
 insert into mx_ops.intelligence_proposals(
  id,scope_id,intake_id,action,summary,payload,requested_by
 ) values(
  p_proposal,p_scope,p_intake,p_action,trim(p_summary),p_payload,actor
 ) returning * into p;
 update mx_ops.intelligence_intakes
 set status='proposed',version=version+1,proposed_at=now()
 where scope_id=p_scope and id=p_intake returning * into i;
 perform mx_ops.intelligence_append_event(
  p_scope,p_intake,p_proposal,actor,'service',p_request,'proposal.created','received','proposed',i.version,
  '',to_jsonb(p)
 );
 update mx_ops.scopes set revision=mx_ops.scopes.revision+1 where id=p_scope
  returning mx_ops.scopes.revision into revision;
 response:=jsonb_build_object(
  'id',p_intake,'proposalId',p_proposal,'version',i.version,'proposalVersion',p.version,
  'revision',revision,'action','intelligence.propose','record',mx_ops.intelligence_record(p_scope,p_intake)
 );
 insert into mx_ops.receipts(scope_id,request_id,actor_id,intent,response)
 values(p_scope,p_request,actor,intent,response);
 return response;
end $$;

create function public.mx_ops_intelligence_approve(
 p_scope uuid,p_request uuid,p_intake uuid,p_proposal uuid,p_expected integer,p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 i mx_ops.intelligence_intakes;
 p mx_ops.intelligence_proposals;
 receipt mx_ops.receipts;
 intent jsonb;
 response jsonb;
 revision bigint;
 command jsonb;
 command_rule mx_ops.command_permissions;
begin
 select * into i from mx_ops.intelligence_intakes x
 where x.scope_id=p_scope and x.id=p_intake for update;
 perform mx_ops.rule(i.id is not null,'Intake not found');
 perform mx_ops.intelligence_require_access(p_scope,p_intake,'work.write',false);
 select * into p from mx_ops.intelligence_proposals x
 where x.scope_id=p_scope and x.intake_id=p_intake and x.id=p_proposal for update;
 perform mx_ops.rule(p.id is not null,'Proposal not found');
 if p.mutates then
  perform mx_ops.require_permission(p_scope,'work.write',true);
  for command in select value from jsonb_array_elements(p.payload->'commands')
  loop
   select * into command_rule from mx_ops.command_permissions c
   where c.action=command->>'action';
   perform mx_ops.rule(command_rule.action is not null,'Proposal contains an unregistered command');
   perform mx_ops.require_permission(p_scope,command_rule.permission,command_rule.mfa);
  end loop;
 end if;
 perform mx_ops.rule(
  p_request is not null and p_expected>=0 and length(trim(coalesce(p_reason,''))) between 3 and 1000,
  'Approval reason is required'
 );
 intent:=jsonb_build_object(
  'action','intelligence.approve','intake_id',p_intake,'proposal_id',p_proposal,
  'expected',p_expected,'reason',trim(p_reason)
 );
 select * into receipt from mx_ops.receipts r where r.scope_id=p_scope and r.request_id=p_request;
 if found then
  if receipt.actor_id<>auth.uid() or receipt.intent<>intent then raise exception 'IDEMPOTENCY_MISMATCH';end if;
  return receipt.response||jsonb_build_object('replayed',true);
 end if;
 perform mx_ops.rule(i.status='proposed' and p.status='proposed','Only a proposed intake may be approved');
 perform mx_ops.check_version(p.version,p_expected);
 update mx_ops.scopes set revision=mx_ops.scopes.revision+1 where id=p_scope
  returning mx_ops.scopes.revision into revision;
 update mx_ops.intelligence_proposals
 set status='approved',version=version+1,approved_by=auth.uid(),approved_at=now(),
  approval_revision=revision,approval_reason=trim(p_reason)
 where scope_id=p_scope and id=p_proposal returning * into p;
 update mx_ops.intelligence_intakes
 set status='approved',version=version+1,approved_at=p.approved_at
 where scope_id=p_scope and id=p_intake returning * into i;
 perform mx_ops.intelligence_append_event(
  p_scope,p_intake,p_proposal,auth.uid(),'user',p_request,'proposal.approved','proposed','approved',i.version,
  p_reason,to_jsonb(p)
 );
 response:=jsonb_build_object(
  'id',p_intake,'proposalId',p_proposal,'version',i.version,'proposalVersion',p.version,
  'revision',revision,'action','intelligence.approve','record',mx_ops.intelligence_record(p_scope,p_intake)
 );
 insert into mx_ops.receipts(scope_id,request_id,actor_id,intent,response)
 values(p_scope,p_request,auth.uid(),intent,response);
 return response;
end $$;

create function public.mx_ops_intelligence_complete(
 p_scope uuid,p_request uuid,p_intake uuid,p_proposal uuid,p_expected integer,
 p_execution_requests uuid[],p_result jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 i mx_ops.intelligence_intakes;
 p mx_ops.intelligence_proposals;
 receipt mx_ops.receipts;
 execution_receipt mx_ops.receipts;
 intent jsonb;
 response jsonb;
 revision bigint;
 actor uuid;
 command jsonb;
 command_ordinal bigint;
 execution_revision bigint;
 execution_requests uuid[];
begin
 select * into i from mx_ops.intelligence_intakes x
 where x.scope_id=p_scope and x.id=p_intake for update;
 perform mx_ops.rule(i.id is not null,'Intake not found');
 select * into p from mx_ops.intelligence_proposals x
 where x.scope_id=p_scope and x.intake_id=p_intake and x.id=p_proposal for update;
 perform mx_ops.rule(p.id is not null and p.approved_by is not null,'Approved proposal not found');
 actor:=p.approved_by;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claim.aal','aal1',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'aal','aal1')::text,true);
 perform mx_ops.intelligence_require_access(p_scope,p_intake,'work.write',false);
 perform mx_ops.rule(
  p_request is not null and p_expected>=0 and jsonb_typeof(p_result)='object'
   and p_result->>'outcome'='succeeded' and octet_length(p_result::text)<=150000,
  'A successful structured completion result is required'
 );
 execution_requests:=coalesce(p_execution_requests,'{}'::uuid[]);
 intent:=jsonb_build_object(
  'action','intelligence.complete','intake_id',p_intake,'proposal_id',p_proposal,
  'expected',p_expected,'execution_request_ids',to_jsonb(execution_requests),'result',p_result
 );
 select * into receipt from mx_ops.receipts r where r.scope_id=p_scope and r.request_id=p_request;
 if found then
  if receipt.actor_id<>actor or receipt.intent<>intent then raise exception 'IDEMPOTENCY_MISMATCH';end if;
  return receipt.response||jsonb_build_object('replayed',true);
 end if;
 perform mx_ops.rule(i.status='approved' and p.status='approved','Only an approved proposal may be completed');
 perform mx_ops.check_version(p.version,p_expected);
 if p.mutates then
  perform mx_ops.rule(
   cardinality(execution_requests)=jsonb_array_length(p.payload->'commands')
    and cardinality(execution_requests) between 1 and 32
    and (select count(distinct x) from unnest(execution_requests) x)=cardinality(execution_requests)
    and not exists(select 1 from unnest(execution_requests) x where x is null)
    and not p_request=any(execution_requests),
   'One distinct governed receipt is required for each proposed command'
  );
  for command,command_ordinal in
   select x.value,x.ordinality
   from jsonb_array_elements(p.payload->'commands') with ordinality x(value,ordinality)
  loop
   select * into execution_receipt from mx_ops.receipts r
   where r.scope_id=p_scope and r.request_id=execution_requests[command_ordinal::integer];
   perform mx_ops.rule(
    coalesce(execution_receipt.response->>'revision','') ~ '^[0-9]+$',
    'Every mutation receipt must carry its governed workspace revision'
   );
   execution_revision:=(execution_receipt.response->>'revision')::bigint;
   perform mx_ops.rule(
    execution_receipt.request_id is not null
     and execution_receipt.actor_id=actor
     and execution_revision>p.approval_revision
     and execution_receipt.intent=command,
    'Every proposed command needs its matching post-approval governed MineralX receipt in order'
   );
   insert into mx_ops.intelligence_proposal_executions(
    scope_id,intake_id,proposal_id,ordinal,request_id,actor_id,executed_at,
    scope_revision,command,receipt
   ) values(
    p_scope,p_intake,p_proposal,command_ordinal::integer,execution_receipt.request_id,
    execution_receipt.actor_id,execution_receipt.created_at,execution_revision,
    command,execution_receipt.response
   );
  end loop;
 else
  perform mx_ops.rule(cardinality(execution_requests)=0,'Read-only proposals do not accept mutation receipts');
 end if;
 update mx_ops.intelligence_proposals
 set status='completed',version=version+1,completion=p_result,completed_at=now()
 where scope_id=p_scope and id=p_proposal returning * into p;
 update mx_ops.intelligence_intakes
 set status='completed',version=version+1,completed_at=p.completed_at
 where scope_id=p_scope and id=p_intake returning * into i;
 perform mx_ops.intelligence_append_event(
  p_scope,p_intake,p_proposal,actor,'service',p_request,'intake.completed','approved','completed',i.version,
  coalesce(p_result->>'summary',''),jsonb_build_object(
   'proposalId',p.id,'status',p.status,'version',p.version,
   'result',p_result,'executionRequestIds',to_jsonb(execution_requests)
  )
 );
 update mx_ops.scopes set revision=mx_ops.scopes.revision+1 where id=p_scope
  returning mx_ops.scopes.revision into revision;
 response:=jsonb_build_object(
  'id',p_intake,'proposalId',p_proposal,'version',i.version,'proposalVersion',p.version,
  'revision',revision,'action','intelligence.complete','record',mx_ops.intelligence_record(p_scope,p_intake)
 );
 insert into mx_ops.receipts(scope_id,request_id,actor_id,intent,response)
 values(p_scope,p_request,actor,intent,response);
 return response;
end $$;

-- The service key is already a privileged secret. This gateway narrows its MCP
-- use to a closed set of typed operations, restores the verified human actor in
-- auth claims, and never executes caller-supplied SQL or arbitrary RPC names.
create function public.mx_ops_mcp_gateway(
 p_actor uuid,p_client text,p_aal text,p_operation text,p_args jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uuid_pattern constant text:='^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
 claims jsonb;
begin
 perform mx_ops.rule(
  auth.jwt()->>'role'='service_role'
   and p_actor is not null
   and exists(select 1 from auth.users u where u.id=p_actor)
   and length(trim(coalesce(p_client,''))) between 1 and 512
   and p_client !~ '[\x00-\x1f\x7f]'
   and p_aal in('aal1','aal2')
   and length(coalesce(p_operation,'')) between 1 and 80
   and jsonb_typeof(p_args)='object'
   and octet_length(p_args::text)<=1500000,
  'Invalid MCP gateway request'
 );
 claims:=jsonb_build_object(
  'sub',p_actor,'aal',p_aal,'role','authenticated','client_id',trim(p_client),
  'mineralx_token_class','mcp_gateway'
 );
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 perform set_config('request.jwt.claim.aal',p_aal,true);
 perform set_config('request.jwt.claim.client_id',trim(p_client),true);
 perform set_config('request.jwt.claims',claims::text,true);

 case p_operation
 when 'mx_ops_context' then
  perform mx_ops.rule(p_args='{}'::jsonb,'Invalid MCP context arguments');
  return public.mx_ops_context();
 when 'mx_ops_search' then
  perform mx_ops.rule(
   p_args ?& array['p_scope','p_query']
    and p_args-(array['p_scope','p_query']::text[])='{}'::jsonb
    and coalesce(p_args->>'p_scope','') ~* uuid_pattern
    and jsonb_typeof(p_args->'p_query')='string',
   'Invalid MCP search arguments'
  );
  return public.mx_ops_search((p_args->>'p_scope')::uuid,p_args->>'p_query');
 when 'mx_ops_detail' then
  perform mx_ops.rule(
   p_args ?& array['p_scope','p_kind','p_id']
    and p_args-(array['p_scope','p_kind','p_id']::text[])='{}'::jsonb
    and coalesce(p_args->>'p_scope','') ~* uuid_pattern
    and coalesce(p_args->>'p_id','') ~* uuid_pattern
    and p_args->>'p_kind' in(
     'feed','campaigns','runs','lots','weights','assays','production','custody',
     'transfers','periods','balance_lines','work','settlements','allocations'
    ),
   'Invalid MCP detail arguments'
  );
  return public.mx_ops_detail(
   (p_args->>'p_scope')::uuid,p_args->>'p_kind',(p_args->>'p_id')::uuid
  );
 when 'mx_ops_list' then
  perform mx_ops.rule(
   p_args ?& array['p_scope','p_kind','p_after','p_limit','p_id']
    and p_args-(array['p_scope','p_kind','p_after','p_limit','p_id']::text[])='{}'::jsonb
    and coalesce(p_args->>'p_scope','') ~* uuid_pattern
    and p_args->>'p_kind' in(
     'feed','campaigns','runs','lots','weights','assays','production','custody',
     'transfers','periods','balance_lines','work','settlements','allocations'
    )
    and (p_args->'p_after'='null'::jsonb or coalesce(p_args->>'p_after','') ~* uuid_pattern)
    and jsonb_typeof(p_args->'p_limit')='number'
    and (p_args->>'p_limit') ~ '^([1-9]|[1-9][0-9]|100)$'
    and (p_args->'p_id'='null'::jsonb or coalesce(p_args->>'p_id','') ~* uuid_pattern),
   'Invalid MCP list arguments'
  );
  return public.mx_ops_list(
   (p_args->>'p_scope')::uuid,p_args->>'p_kind',(p_args->>'p_after')::uuid,
   (p_args->>'p_limit')::integer,(p_args->>'p_id')::uuid
  );
 when 'mx_ops_geo_page' then
  perform mx_ops.rule(
   p_args ?& array['p_scope','p_kind','p_after','p_limit']
    and p_args-(array['p_scope','p_kind','p_after','p_limit']::text[])='{}'::jsonb
    and coalesce(p_args->>'p_scope','') ~* uuid_pattern
    and p_args->>'p_kind' in(
     'samples','collars','intervals','programs','surveys','geology','targets',
     'dispatches','assayBatches','spatialLayers','observations','files'
    )
    and (p_args->'p_after'='null'::jsonb or coalesce(p_args->>'p_after','') ~* uuid_pattern)
    and jsonb_typeof(p_args->'p_limit')='number'
    and (p_args->>'p_limit') ~ '^([1-9]|[1-9][0-9]|100)$',
   'Invalid MCP geology arguments'
  );
  return public.mx_ops_geo_page(
   (p_args->>'p_scope')::uuid,p_args->>'p_kind',(p_args->>'p_after')::uuid,
   (p_args->>'p_limit')::integer
  );
 when 'mx_ops_files' then
  perform mx_ops.rule(
    p_args ?& array['p_scope','p_id']
    and p_args-(array['p_scope','p_id']::text[])='{}'::jsonb
    and coalesce(p_args->>'p_scope','') ~* uuid_pattern
    and coalesce(p_args->>'p_id','') ~* uuid_pattern,
   'Invalid MCP files arguments'
  );
  return public.mx_ops_files((p_args->>'p_scope')::uuid,(p_args->>'p_id')::uuid);
 when 'mx_ops_intelligence_list' then
  perform mx_ops.rule(
   p_args ?& array['p_scope','p_after','p_limit']
    and p_args-(array['p_scope','p_after','p_limit']::text[])='{}'::jsonb
    and coalesce(p_args->>'p_scope','') ~* uuid_pattern
    and (p_args->'p_after'='null'::jsonb or coalesce(p_args->>'p_after','') ~* uuid_pattern)
    and jsonb_typeof(p_args->'p_limit')='number'
    and (p_args->>'p_limit') ~ '^([1-9]|[1-9][0-9]|100)$',
   'Invalid MCP intelligence list arguments'
  );
  return public.mx_ops_intelligence_list(
   (p_args->>'p_scope')::uuid,(p_args->>'p_after')::uuid,(p_args->>'p_limit')::integer
  );
 when 'mx_ops_intelligence_read' then
  perform mx_ops.rule(
   p_args ?& array['p_scope','p_intake']
    and p_args-(array['p_scope','p_intake']::text[])='{}'::jsonb
    and coalesce(p_args->>'p_scope','') ~* uuid_pattern
    and coalesce(p_args->>'p_intake','') ~* uuid_pattern,
   'Invalid MCP intelligence read arguments'
  );
  return public.mx_ops_intelligence_read(
   (p_args->>'p_scope')::uuid,(p_args->>'p_intake')::uuid
  );
 when 'mx_ops_intelligence_create' then
  perform mx_ops.rule(
   p_args ?& array['p_scope','p_request','p_intake','p_title','p_instructions','p_sources']
    and p_args-(array['p_scope','p_request','p_intake','p_title','p_instructions','p_sources']::text[])='{}'::jsonb
    and coalesce(p_args->>'p_scope','') ~* uuid_pattern
    and coalesce(p_args->>'p_request','') ~* uuid_pattern
    and coalesce(p_args->>'p_intake','') ~* uuid_pattern
    and jsonb_typeof(p_args->'p_title')='string'
    and jsonb_typeof(p_args->'p_instructions')='string'
    and jsonb_typeof(p_args->'p_sources')='array',
   'Invalid MCP intelligence create arguments'
  );
  return public.mx_ops_intelligence_create(
   (p_args->>'p_scope')::uuid,(p_args->>'p_request')::uuid,(p_args->>'p_intake')::uuid,
   p_args->>'p_title',p_args->>'p_instructions',p_args->'p_sources'
  );
 when 'mx_ops_intelligence_approve' then
  perform mx_ops.rule(
   p_args ?& array['p_scope','p_request','p_intake','p_proposal','p_expected','p_reason']
    and p_args-(array['p_scope','p_request','p_intake','p_proposal','p_expected','p_reason']::text[])='{}'::jsonb
    and coalesce(p_args->>'p_scope','') ~* uuid_pattern
    and coalesce(p_args->>'p_request','') ~* uuid_pattern
    and coalesce(p_args->>'p_proposal','') ~* uuid_pattern
    and jsonb_typeof(p_args->'p_expected')='number' and (p_args->>'p_expected') ~ '^[0-9]{1,9}$'
    and jsonb_typeof(p_args->'p_reason')='string',
   'Invalid MCP intelligence approval arguments'
  );
  return public.mx_ops_intelligence_approve(
   (p_args->>'p_scope')::uuid,(p_args->>'p_request')::uuid,(p_args->>'p_intake')::uuid,
   (p_args->>'p_proposal')::uuid,(p_args->>'p_expected')::integer,p_args->>'p_reason'
  );
 when 'mx_ops_command' then
  perform mx_ops.rule(
   p_args ?& array['p_scope','p_request','p_action','p_id','p_expected','p_payload']
    and p_args-(array['p_scope','p_request','p_action','p_id','p_expected','p_payload']::text[])='{}'::jsonb
    and coalesce(p_args->>'p_scope','') ~* uuid_pattern
    and coalesce(p_args->>'p_request','') ~* uuid_pattern
    and coalesce(p_args->>'p_id','') ~* uuid_pattern
    and p_args->>'p_action' in('file.prepare','document.publish')
    and jsonb_typeof(p_args->'p_expected')='number' and (p_args->>'p_expected') ~ '^[0-9]{1,9}$'
    and jsonb_typeof(p_args->'p_payload')='object',
   'MCP may execute only an approved intelligence filing operation'
  );
  return public.mx_ops_command(
   (p_args->>'p_scope')::uuid,(p_args->>'p_request')::uuid,p_args->>'p_action',
   (p_args->>'p_id')::uuid,(p_args->>'p_expected')::integer,p_args->'p_payload'
  );
 else
  raise exception 'RULE: Unknown MCP gateway operation';
 end case;
end $$;

alter table mx_ops.intelligence_intakes enable row level security;
create policy intelligence_intakes_scoped_read on mx_ops.intelligence_intakes
 for select to authenticated using(mx_ops.intelligence_can_read(scope_id,id));

alter table mx_ops.intelligence_intake_files enable row level security;
create policy intelligence_intake_files_scoped_read on mx_ops.intelligence_intake_files
 for select to authenticated using(
  mx_ops.intelligence_can_read(scope_id,intake_id)
  and exists(
   select 1 from mx_ops.files f
   where f.scope_id=mx_ops.intelligence_intake_files.scope_id
    and f.id=mx_ops.intelligence_intake_files.file_id
    and mx_ops.can(mx_ops.intelligence_intake_files.scope_id,'files.'||f.family)
  )
 );

alter table mx_ops.intelligence_proposals enable row level security;
create policy intelligence_proposals_scoped_read on mx_ops.intelligence_proposals
 for select to authenticated using(mx_ops.intelligence_can_read(scope_id,intake_id));

alter table mx_ops.intelligence_proposal_executions enable row level security;
create policy intelligence_proposal_executions_scoped_read on mx_ops.intelligence_proposal_executions
 for select to authenticated using(mx_ops.intelligence_can_read(scope_id,intake_id));

alter table mx_ops.intelligence_events enable row level security;
create policy intelligence_events_scoped_read on mx_ops.intelligence_events
 for select to authenticated using(mx_ops.intelligence_can_read(scope_id,intake_id));

revoke all on table mx_ops.intelligence_intakes,mx_ops.intelligence_intake_files,
 mx_ops.intelligence_proposals,mx_ops.intelligence_proposal_executions,
 mx_ops.intelligence_events from public,anon,authenticated,service_role;
grant select on table mx_ops.intelligence_intakes,mx_ops.intelligence_intake_files,
 mx_ops.intelligence_proposals,mx_ops.intelligence_proposal_executions,
 mx_ops.intelligence_events to authenticated;
revoke all on sequence mx_ops.intelligence_events_seq_seq from public,anon,authenticated,service_role;

revoke all on function mx_ops.core_command(uuid,text,uuid,integer,jsonb),
 mx_ops.intelligence_prevent_event_change(),
 mx_ops.intelligence_can_read(uuid,uuid),mx_ops.intelligence_require_access(uuid,uuid,text,boolean),
 mx_ops.intelligence_record(uuid,uuid),
 mx_ops.intelligence_append_event(uuid,uuid,uuid,uuid,text,uuid,text,text,text,integer,text,jsonb)
 from public,anon,authenticated,service_role;
grant execute on function mx_ops.intelligence_can_read(uuid,uuid) to authenticated;

revoke all on function public.mx_ops_intelligence_list(uuid,uuid,integer),
 public.mx_ops_intelligence_read(uuid,uuid),
 public.mx_ops_intelligence_create(uuid,uuid,uuid,text,text,jsonb),
 public.mx_ops_intelligence_approve(uuid,uuid,uuid,uuid,integer,text)
 from public,anon,service_role;
grant execute on function public.mx_ops_intelligence_list(uuid,uuid,integer),
 public.mx_ops_intelligence_read(uuid,uuid),
 public.mx_ops_intelligence_create(uuid,uuid,uuid,text,text,jsonb),
 public.mx_ops_intelligence_approve(uuid,uuid,uuid,uuid,integer,text)
 to authenticated;

revoke all on function public.mx_ops_file_scan_attest(uuid,uuid,uuid,text,text)
 from public,anon,authenticated;
grant execute on function public.mx_ops_file_scan_attest(uuid,uuid,uuid,text,text)
 to service_role;

revoke all on function public.mx_ops_intelligence_propose(uuid,uuid,uuid,uuid,integer,text,text,jsonb),
 public.mx_ops_intelligence_complete(uuid,uuid,uuid,uuid,integer,uuid[],jsonb)
 from public,anon,authenticated;
grant execute on function public.mx_ops_intelligence_propose(uuid,uuid,uuid,uuid,integer,text,text,jsonb),
 public.mx_ops_intelligence_complete(uuid,uuid,uuid,uuid,integer,uuid[],jsonb)
 to service_role;

-- The OAuth database role intentionally receives no inherited browser grants.
-- Direct Data API calls with an OAuth token therefore fail before any RLS or
-- business function runs. Only the MineralX server's service key can relay a
-- verified actor through the fixed gateway above.
revoke all on schema mx_ops from mineralx_mcp;
revoke all on all tables in schema public,mx_ops from mineralx_mcp;
revoke all on all sequences in schema public,mx_ops from mineralx_mcp;
revoke all on all functions in schema public,mx_ops from mineralx_mcp;
do $$
declare protected_schema text;
begin
 foreach protected_schema in array array['storage','mx_meetings']::text[]
 loop
  if to_regnamespace(protected_schema) is not null then
   execute format('revoke all on schema %I from mineralx_mcp',protected_schema);
   execute format('revoke all on all tables in schema %I from mineralx_mcp',protected_schema);
   execute format('revoke all on all sequences in schema %I from mineralx_mcp',protected_schema);
   execute format('revoke all on all functions in schema %I from mineralx_mcp',protected_schema);
  end if;
 end loop;
end $$;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema mx_ops revoke execute on functions from public;
revoke all on function public.mx_ops_mcp_gateway(uuid,text,text,text,jsonb)
 from public,anon,authenticated,mineralx_mcp;
grant execute on function public.mx_ops_mcp_gateway(uuid,text,text,text,jsonb)
 to service_role;

insert into mx_ops.schema_version(version) values(10);
commit;
