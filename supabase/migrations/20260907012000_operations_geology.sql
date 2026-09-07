-- Shared geology keeps independent entity revisions. The public browser never writes a
-- project snapshot or calls the trusted commit boundary directly.
begin;
create table mx_ops.geo_projects (
 scope_id uuid primary key references mx_ops.scopes(id),version integer not null default 1,
 data jsonb not null check(jsonb_typeof(data)='object'),updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now()
);
create table mx_ops.geo_collars (
 id uuid primary key,scope_id uuid not null references mx_ops.scopes(id),version integer not null default 1,
 data jsonb not null,updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),
 hole_key text generated always as (upper(trim(data->>'id'))) stored,
 lat double precision generated always as ((data->>'lat')::double precision) stored,
 lng double precision generated always as ((data->>'lng')::double precision) stored,
 actual_depth numeric generated always as (coalesce(data->>'actualDepth',data->>'depth')::numeric) stored,
 check(length(hole_key)>0 and lat between -90 and 90 and lng between -180 and 180 and (actual_depth is null or actual_depth>0)),
 unique(scope_id,id),unique(scope_id,hole_key)
);
create table mx_ops.geo_samples (
 id uuid primary key,scope_id uuid not null references mx_ops.scopes(id),version integer not null default 1,
 data jsonb not null,updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),
 bag_key text generated always as (upper(trim(data->>'id'))) stored,
 collar_id uuid generated always as (nullif(data->>'collarRecordId','')::uuid) stored,
 from_m numeric generated always as ((data->>'from')::numeric) stored,
 to_m numeric generated always as ((data->>'to')::numeric) stored,
 control text generated always as (coalesce(data->>'qaqcType','none')) stored,
 lat double precision generated always as ((data->>'lat')::double precision) stored,
 lng double precision generated always as ((data->>'lng')::double precision) stored,
 check(length(bag_key)>0),check(control in('none','blank','standard','duplicate','triplicate')),
 check((control in('blank','standard') and (lat is null or lat between -90 and 90) and (lng is null or lng between -180 and 180)) or (lat is not null and lng is not null and lat between -90 and 90 and lng between -180 and 180)),
 check(collar_id is null or from_m>=0 and to_m>from_m),unique(scope_id,id),unique(scope_id,bag_key),
 foreign key(scope_id,collar_id) references mx_ops.geo_collars(scope_id,id) deferrable initially deferred
);
create table mx_ops.geo_intervals (
 id uuid primary key,scope_id uuid not null references mx_ops.scopes(id),version integer not null default 1,
 data jsonb not null,updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),
 sample_id uuid generated always as (nullif(data->>'sampleRecordId','')::uuid) stored,
 collar_id uuid generated always as (nullif(data->>'collarRecordId','')::uuid) stored,
 from_m numeric generated always as ((data->>'from')::numeric) stored,to_m numeric generated always as ((data->>'to')::numeric) stored,
 check(from_m is not null and to_m is not null and from_m>=0 and to_m>from_m),unique(scope_id,id),unique(scope_id,sample_id),
 foreign key(scope_id,sample_id) references mx_ops.geo_samples(scope_id,id) deferrable initially deferred,
 foreign key(scope_id,collar_id) references mx_ops.geo_collars(scope_id,id) deferrable initially deferred
);
create table mx_ops.geo_programs (id uuid primary key,scope_id uuid not null references mx_ops.scopes(id),version integer not null default 1,data jsonb not null check(jsonb_typeof(data)='object'),updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),unique(scope_id,id));
create table mx_ops.geo_surveys (id uuid primary key,scope_id uuid not null references mx_ops.scopes(id),version integer not null default 1,data jsonb not null check(jsonb_typeof(data)='object'),updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),unique(scope_id,id));
create table mx_ops.geo_logging (id uuid primary key,scope_id uuid not null references mx_ops.scopes(id),version integer not null default 1,data jsonb not null check(jsonb_typeof(data)='object'),updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),unique(scope_id,id));
create table mx_ops.geo_targets (id uuid primary key,scope_id uuid not null references mx_ops.scopes(id),version integer not null default 1,data jsonb not null check(jsonb_typeof(data)='object'),updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),unique(scope_id,id));
create table mx_ops.geo_dispatches (id uuid primary key,scope_id uuid not null references mx_ops.scopes(id),version integer not null default 1,data jsonb not null check(jsonb_typeof(data)='object'),updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),unique(scope_id,id));
create table mx_ops.geo_certificates (id uuid primary key,scope_id uuid not null references mx_ops.scopes(id),version integer not null default 1,data jsonb not null check(jsonb_typeof(data)='object'),updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),unique(scope_id,id));
create table mx_ops.geo_spatial_layers (id uuid primary key,scope_id uuid not null references mx_ops.scopes(id),version integer not null default 1,data jsonb not null check(jsonb_typeof(data)='object'),updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),unique(scope_id,id));
create table mx_ops.geo_observations (id uuid primary key,scope_id uuid not null references mx_ops.scopes(id),version integer not null default 1,data jsonb not null check(jsonb_typeof(data)='object'),updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),unique(scope_id,id));
create table mx_ops.geo_legacy_files (id uuid primary key,scope_id uuid not null references mx_ops.scopes(id),version integer not null default 1,data jsonb not null check(jsonb_typeof(data)='object'),updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),unique(scope_id,id));
create function mx_ops.geo_table(p_kind text) returns text language sql immutable set search_path='' as $$
 select case p_kind when 'samples' then 'geo_samples' when 'collars' then 'geo_collars' when 'intervals' then 'geo_intervals' when 'programs' then 'geo_programs' when 'surveys' then 'geo_surveys' when 'geology' then 'geo_logging' when 'targets' then 'geo_targets' when 'dispatches' then 'geo_dispatches' when 'assayBatches' then 'geo_certificates' when 'spatialLayers' then 'geo_spatial_layers' when 'observations' then 'geo_observations' when 'files' then 'geo_legacy_files' else null end
$$;
create table mx_ops.geo_change_log (seq bigint generated always as identity primary key,scope_id uuid not null references mx_ops.scopes(id),kind text not null,entity_id uuid not null,version integer not null,changed_at timestamptz not null default now());
create index geo_changes_cursor on mx_ops.geo_change_log(scope_id,seq);
create table mx_ops.geo_migrations (id uuid primary key,scope_id uuid not null references mx_ops.scopes(id),source_file_id uuid not null,source_hash text not null,legacy_project_id text not null,summary jsonb not null,published_by uuid not null references auth.users(id),published_at timestamptz not null default now(),unique(scope_id,source_hash,legacy_project_id),foreign key(scope_id,source_file_id) references mx_ops.files(scope_id,id));

create function public.mx_ops_geo_page(p_scope uuid,p_kind text,p_after uuid default null,p_limit integer default 500)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_table text;result jsonb;begin
 perform mx_ops.require_permission(p_scope,'geo.read');v_table:=mx_ops.geo_table(p_kind);perform mx_ops.rule(v_table is not null,'Unknown geology record family');
 execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) from (select id,version,data,updated_by,updated_at from mx_ops.%I where scope_id=$1 and ($2 is null or id>$2) order by id limit $3) r',v_table) into result using p_scope,p_after,least(1000,greatest(1,p_limit));
 return jsonb_build_object('rows',result,'revision',(select revision from mx_ops.scopes where id=p_scope),'project',(select to_jsonb(p) from mx_ops.geo_projects p where scope_id=p_scope));
end $$;
create function public.mx_ops_geo_receipt(p_scope uuid,p_request uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform mx_ops.require_permission(p_scope,'geo.read');return (select response from mx_ops.receipts where scope_id=p_scope and request_id=p_request and actor_id=auth.uid());end $$;

-- Only the authenticated server DAL can submit a domain-validated change set.
-- p_actor/p_aal are derived from the verified provider session, never browser JSON.
create function public.mx_ops_geo_commit(p_scope uuid,p_actor uuid,p_aal text,p_request uuid,p_action text,p_target uuid,p_intent jsonb,p_changes jsonb,p_metadata jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_permission text;v_table text;v_kind text;item jsonb;v_id uuid;v_old record;v_version integer;v_revision bigint;v_changes jsonb:='[]';prior mx_ops.receipts;result jsonb;g mx_ops.geo_projects;begin
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'aal',p_aal)::text,true);
 perform set_config('request.jwt.claim.aal',p_aal,true);
 v_permission:=case when p_action in('geo.assay.release','geo.assay.hold','geo.dispatch.exception') then 'lab.review' when p_action in('geo.layer.import','geo.layer.archive','geo.layer.restore','geo.migrate','geo.project.update') then 'geo.publish' when p_action in('geo.sample.capture','geo.sample.correct','geo.sample.archive','geo.collar.save','geo.log.import','geo.program.create','geo.dispatch.prepare','geo.dispatch.ship','geo.dispatch.receive','geo.assay.stage','geo.target.link','geo.target.create') then 'geo.capture' else null end;
 perform mx_ops.rule(v_permission is not null,'Unknown geology action');perform mx_ops.require_permission(p_scope,v_permission,p_action in('geo.assay.release','geo.assay.hold','geo.dispatch.exception','geo.migrate'));
 perform mx_ops.rule(exists(select 1 from mx_ops.scopes where id=p_scope and kind='project'),'Choose a geological project');
 perform mx_ops.rule(p_actor is not null and p_request is not null and p_target is not null and jsonb_typeof(p_intent)='object' and jsonb_typeof(p_changes)='array' and jsonb_array_length(p_changes) between 0 and 10000 and octet_length(p_changes::text)<=32000000,'Invalid geology changes');
 perform 1 from mx_ops.scopes where id=p_scope for update;
 select * into prior from mx_ops.receipts where scope_id=p_scope and request_id=p_request;
 if found then if prior.actor_id<>p_actor or prior.intent<>p_intent then raise exception 'IDEMPOTENCY_MISMATCH';end if;return prior.response||jsonb_build_object('replayed',true);end if;
 -- Resolve and lock the exact entity version, not a last-writer-wins project document.
 for item in select * from jsonb_array_elements(p_changes) loop
  v_kind:=item->>'kind';v_table:=mx_ops.geo_table(v_kind);v_id:=(item->>'id')::uuid;
  perform mx_ops.rule(v_table is not null and v_id is not null and jsonb_typeof(item->'data')='object' and item->'data'->>'recordId'=v_id::text,'Invalid geology entity');
  execute format('select scope_id,version,data from mx_ops.%I where id=$1 for update',v_table) into v_old using v_id;
  if v_old.scope_id is not null and v_old.scope_id<>p_scope then raise exception 'ACCESS_DENIED';end if;
  perform mx_ops.check_version(coalesce(v_old.version,0),(item->>'expectedVersion')::integer);v_version:=coalesce(v_old.version,0)+1;
  if v_kind='samples' and v_old.version is not null then perform mx_ops.rule(upper(trim(v_old.data->>'id'))=upper(trim(item->'data'->>'id')) and (v_old.data->>'collarRecordId') is not distinct from (item->'data'->>'collarRecordId') and (v_old.data->>'from') is not distinct from (item->'data'->>'from') and (v_old.data->>'to') is not distinct from (item->'data'->>'to'),'Physical bag and interval identity cannot be rewritten');end if;
  execute format('insert into mx_ops.%I(id,scope_id,version,data,updated_by) values($1,$2,$3,$4,$5) on conflict(id) do update set version=excluded.version,data=excluded.data,updated_by=excluded.updated_by,updated_at=now()',v_table) using v_id,p_scope,v_version,item->'data',p_actor;
  insert into mx_ops.geo_change_log(scope_id,kind,entity_id,version) values(p_scope,v_kind,v_id,v_version);
  v_changes:=v_changes||jsonb_build_array(jsonb_build_object('kind',v_kind,'id',v_id,'version',v_version));
 end loop;
 perform mx_ops.rule(not exists(select 1 from mx_ops.geo_samples s join mx_ops.geo_collars c on c.id=s.collar_id and c.scope_id=s.scope_id where s.scope_id=p_scope and (c.actual_depth is null or s.to_m>c.actual_depth)),'A sample extends past recorded actual drilled depth');
 perform mx_ops.rule(not exists(select 1 from mx_ops.geo_samples a join mx_ops.geo_samples b on a.scope_id=b.scope_id and a.collar_id=b.collar_id and a.id<b.id where a.scope_id=p_scope and a.control='none' and b.control='none' and a.data->>'archivedAt' is null and b.data->>'archivedAt' is null and a.from_m<b.to_m and a.to_m>b.from_m),'Primary drill samples overlap');
 if p_metadata is not null then
  select * into g from mx_ops.geo_projects where scope_id=p_scope for update;perform mx_ops.check_version(coalesce(g.version,0),(p_metadata->>'expectedVersion')::integer);
  perform mx_ops.rule(jsonb_typeof(p_metadata->'data')='object','Invalid project metadata');
  insert into mx_ops.geo_projects(scope_id,version,data,updated_by) values(p_scope,coalesce(g.version,0)+1,p_metadata->'data',p_actor) on conflict(scope_id) do update set data=excluded.data,version=excluded.version,updated_by=excluded.updated_by,updated_at=now();
 end if;
 update mx_ops.scopes set revision=revision+1 where id=p_scope returning revision into v_revision;
 result:=jsonb_build_object('id',p_target,'version',coalesce((select (e->>'version')::int from jsonb_array_elements(v_changes)e where e->>'id'=p_target::text limit 1),1),'revision',v_revision,'action',p_action,'changes',v_changes,'record',jsonb_build_object('changed',jsonb_array_length(v_changes)));
 insert into mx_ops.audit(scope_id,entity_id,actor_id,request_id,action,version,permission,reason,snapshot) values(p_scope,p_target,p_actor,p_request,p_action,(result->>'version')::int,'geo.read',left(coalesce(p_intent->'payload'->>'reason',''),1000),jsonb_build_object('changes',p_changes,'metadata',p_metadata));
 insert into mx_ops.receipts(scope_id,request_id,actor_id,intent,response) values(p_scope,p_request,p_actor,p_intent,result);return result;
end $$;
revoke all on function public.mx_ops_geo_commit(uuid,uuid,text,uuid,text,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.mx_ops_geo_commit(uuid,uuid,text,uuid,text,uuid,jsonb,jsonb,jsonb) to service_role;
revoke all on function public.mx_ops_geo_page(uuid,text,uuid,integer),public.mx_ops_geo_receipt(uuid,uuid) from public,anon;
grant execute on function public.mx_ops_geo_page(uuid,text,uuid,integer),public.mx_ops_geo_receipt(uuid,uuid) to authenticated;
revoke all on function mx_ops.geo_table(text) from public,anon,authenticated;
alter table mx_ops.geo_projects enable row level security;create policy scoped_read on mx_ops.geo_projects for select to authenticated using(mx_ops.can(scope_id,'geo.read'));revoke all on mx_ops.geo_projects from anon,authenticated;grant select on mx_ops.geo_projects to authenticated;
alter table mx_ops.geo_samples enable row level security;create policy scoped_read on mx_ops.geo_samples for select to authenticated using(mx_ops.can(scope_id,'geo.read'));revoke all on mx_ops.geo_samples from anon,authenticated;grant select on mx_ops.geo_samples to authenticated;
alter table mx_ops.geo_collars enable row level security;create policy scoped_read on mx_ops.geo_collars for select to authenticated using(mx_ops.can(scope_id,'geo.read'));revoke all on mx_ops.geo_collars from anon,authenticated;grant select on mx_ops.geo_collars to authenticated;
alter table mx_ops.geo_intervals enable row level security;create policy scoped_read on mx_ops.geo_intervals for select to authenticated using(mx_ops.can(scope_id,'geo.read'));revoke all on mx_ops.geo_intervals from anon,authenticated;grant select on mx_ops.geo_intervals to authenticated;
alter table mx_ops.geo_programs enable row level security;create policy scoped_read on mx_ops.geo_programs for select to authenticated using(mx_ops.can(scope_id,'geo.read'));revoke all on mx_ops.geo_programs from anon,authenticated;grant select on mx_ops.geo_programs to authenticated;
alter table mx_ops.geo_surveys enable row level security;create policy scoped_read on mx_ops.geo_surveys for select to authenticated using(mx_ops.can(scope_id,'geo.read'));revoke all on mx_ops.geo_surveys from anon,authenticated;grant select on mx_ops.geo_surveys to authenticated;
alter table mx_ops.geo_logging enable row level security;create policy scoped_read on mx_ops.geo_logging for select to authenticated using(mx_ops.can(scope_id,'geo.read'));revoke all on mx_ops.geo_logging from anon,authenticated;grant select on mx_ops.geo_logging to authenticated;
alter table mx_ops.geo_targets enable row level security;create policy scoped_read on mx_ops.geo_targets for select to authenticated using(mx_ops.can(scope_id,'geo.read'));revoke all on mx_ops.geo_targets from anon,authenticated;grant select on mx_ops.geo_targets to authenticated;
alter table mx_ops.geo_dispatches enable row level security;create policy scoped_read on mx_ops.geo_dispatches for select to authenticated using(mx_ops.can(scope_id,'geo.read'));revoke all on mx_ops.geo_dispatches from anon,authenticated;grant select on mx_ops.geo_dispatches to authenticated;
alter table mx_ops.geo_certificates enable row level security;create policy scoped_read on mx_ops.geo_certificates for select to authenticated using(mx_ops.can(scope_id,'geo.read'));revoke all on mx_ops.geo_certificates from anon,authenticated;grant select on mx_ops.geo_certificates to authenticated;
alter table mx_ops.geo_spatial_layers enable row level security;create policy scoped_read on mx_ops.geo_spatial_layers for select to authenticated using(mx_ops.can(scope_id,'geo.read'));revoke all on mx_ops.geo_spatial_layers from anon,authenticated;grant select on mx_ops.geo_spatial_layers to authenticated;
alter table mx_ops.geo_observations enable row level security;create policy scoped_read on mx_ops.geo_observations for select to authenticated using(mx_ops.can(scope_id,'geo.read'));revoke all on mx_ops.geo_observations from anon,authenticated;grant select on mx_ops.geo_observations to authenticated;
alter table mx_ops.geo_legacy_files enable row level security;create policy scoped_read on mx_ops.geo_legacy_files for select to authenticated using(mx_ops.can(scope_id,'geo.read'));revoke all on mx_ops.geo_legacy_files from anon,authenticated;grant select on mx_ops.geo_legacy_files to authenticated;
alter table mx_ops.geo_migrations enable row level security;create policy scoped_read on mx_ops.geo_migrations for select to authenticated using(mx_ops.can(scope_id,'geo.read'));revoke all on mx_ops.geo_migrations from anon,authenticated;grant select on mx_ops.geo_migrations to authenticated;
alter table mx_ops.geo_change_log enable row level security;create policy scoped_read on mx_ops.geo_change_log for select to authenticated using(mx_ops.can(scope_id,'geo.read'));revoke all on mx_ops.geo_change_log from anon,authenticated;grant select on mx_ops.geo_change_log to authenticated;
insert into mx_ops.schema_version(version) values(3);
commit;
