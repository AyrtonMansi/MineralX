-- One private reporting operation per account. No public signup grants membership.
begin;
create table public.gic_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 128),
  runs_version integer not null default 0,
  mine_name text not null check (length(mine_name) between 1 and 128)
);
create table public.gic_members (
  workspace_id uuid not null references public.gic_workspaces(id),
  user_id uuid not null unique references auth.users(id),
  role text not null check (role in ('owner','editor','viewer')),
  primary key (workspace_id,user_id)
);
create table public.gic_runs (
  id uuid primary key,
  workspace_id uuid not null references public.gic_workspaces(id),
  version integer not null default 1 check (version > 0),
  data jsonb not null,
  reference text generated always as (data->>'reference') stored,
  processed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  unique (workspace_id, reference)
);
create index gic_runs_period on public.gic_runs(workspace_id,processed_at,id);
create table public.gic_annual_reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.gic_workspaces(id),
  year integer not null check (year between 2000 and 2100),
  version integer not null default 1,
  runs_version integer not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id),
  unique (workspace_id,year)
);
create table public.gic_audit (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.gic_workspaces(id),
  entity_id uuid not null,
  entity_type text not null check (entity_type in ('run','annual')),
  version integer not null,
  actor_id uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  reason text not null,
  snapshot jsonb not null
);
create index gic_audit_history on public.gic_audit(workspace_id,entity_id,version);

alter table public.gic_workspaces enable row level security;
alter table public.gic_members enable row level security;
alter table public.gic_runs enable row level security;
alter table public.gic_annual_reports enable row level security;
alter table public.gic_audit enable row level security;
create policy member_self on public.gic_members for select to authenticated using (user_id = (select auth.uid()));
create policy workspace_read on public.gic_workspaces for select to authenticated using (exists (select 1 from public.gic_members m where m.workspace_id = id and m.user_id = (select auth.uid())));
create policy runs_read on public.gic_runs for select to authenticated using (exists (select 1 from public.gic_members m where m.workspace_id = gic_runs.workspace_id and m.user_id = (select auth.uid())));
create policy annual_read on public.gic_annual_reports for select to authenticated using (exists (select 1 from public.gic_members m where m.workspace_id = gic_annual_reports.workspace_id and m.user_id = (select auth.uid())));
create policy audit_read on public.gic_audit for select to authenticated using (exists (select 1 from public.gic_members m where m.workspace_id = gic_audit.workspace_id and m.user_id = (select auth.uid())));
revoke all on public.gic_workspaces,public.gic_members,public.gic_runs,public.gic_annual_reports,public.gic_audit from anon,authenticated;
grant select on public.gic_workspaces,public.gic_members,public.gic_runs,public.gic_annual_reports,public.gic_audit to authenticated;

-- All mutations pass through these transactions. Clients cannot change ownership,
-- timestamps, audit history or membership, even if they bypass the website.
create function public.gic_save_run(p_workspace uuid, p_id uuid, p_version integer, p_data jsonb, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare old_row public.gic_runs; next_version integer; k text; n numeric; processed timestamptz;
begin
  if p_version is null or p_version < 0 then raise exception 'Invalid version'; end if;
  if not exists (select 1 from public.gic_members where workspace_id=p_workspace and user_id=auth.uid() and role in ('owner','editor')) then raise exception 'Access denied'; end if;
  perform 1 from public.gic_workspaces where id=p_workspace for update;
  if jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 12000 then raise exception 'Invalid run'; end if;
  if not (p_data ?& array['reference','processed_at','gross_grams','gold_percent','feed_tonnes','notes','status']) then raise exception 'Missing fields'; end if;
  if jsonb_typeof(p_data->'reference') is distinct from 'string' or jsonb_typeof(p_data->'notes') is distinct from 'string' or jsonb_typeof(p_data->'processed_at') is distinct from 'string' or jsonb_typeof(p_data->'status') is distinct from 'string' then raise exception 'Invalid field type'; end if;
  if length(trim(p_data->>'reference')) not between 1 and 80 or length(p_data->>'notes') > 2000 then raise exception 'Invalid field length'; end if;
  foreach k in array array['gross_grams','gold_percent','feed_tonnes'] loop
    if jsonb_typeof(p_data->k) is distinct from 'number' then raise exception 'Invalid number'; end if;
    n := (p_data->>k)::numeric;
    if n < 0 or n > 9999999999 then raise exception 'Invalid number'; end if;
  end loop;
  if (p_data->>'gold_percent')::numeric > 100 then raise exception 'Invalid gold percentage'; end if;
  if p_data->>'status' not in ('active','void') then raise exception 'Invalid status'; end if;
  if p_data->>'processed_at' !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'Time zone required'; end if;
  processed := (p_data->>'processed_at')::timestamptz;
  if processed > now() + interval '1 minute' or processed < '2000-01-01'::timestamptz then raise exception 'Invalid processing time'; end if;
  select * into old_row from public.gic_runs where id=p_id for update;
  if found then
    if old_row.workspace_id <> p_workspace then raise exception 'Access denied'; end if;
    if old_row.version <> p_version then raise exception 'CONFLICT: this run changed; reload before saving'; end if;
    if length(trim(p_reason)) not between 3 and 500 then raise exception 'A correction reason is required'; end if;
    next_version := old_row.version + 1;
    update public.gic_runs set data=p_data, processed_at=processed, version=next_version, updated_at=now(), updated_by=auth.uid() where id=p_id;
  else
    if p_version <> 0 or p_data->>'status' <> 'active' then raise exception 'Invalid new run'; end if;
    next_version := 1;
    insert into public.gic_runs(id,workspace_id,data,processed_at,created_by,updated_by) values(p_id,p_workspace,p_data,processed,auth.uid(),auth.uid());
  end if;
  insert into public.gic_audit(workspace_id,entity_id,entity_type,version,actor_id,reason,snapshot) values(p_workspace,p_id,'run',next_version,auth.uid(),case when next_version=1 then 'Run recorded' else trim(p_reason) end,p_data);
  update public.gic_workspaces set runs_version=runs_version+1 where id=p_workspace;
  return p_id;
end; $$;

create function public.gic_save_annual(p_workspace uuid, p_year integer, p_version integer, p_data jsonb, p_runs_version integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare saved_id uuid; current_row public.gic_annual_reports; next_version integer; component record; item jsonb; field record;
begin
  if p_version is null or p_version < 0 then raise exception 'Invalid version'; end if;
  if not exists (select 1 from public.gic_members where workspace_id=p_workspace and user_id=auth.uid() and role in ('owner','editor')) then raise exception 'Access denied'; end if;
  perform 1 from public.gic_workspaces where id=p_workspace for update;
  if p_runs_version is null or not exists(select 1 from public.gic_workspaces where id=p_workspace and runs_version=p_runs_version) then raise exception 'CONFLICT: processing records changed; reload and review'; end if;
  if p_year not between 2000 and 2100 or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 750000 or jsonb_typeof(p_data->'rows') is distinct from 'object' or jsonb_typeof(p_data->'checks') is distinct from 'object' or jsonb_typeof(p_data->'coverage_confirmed') is distinct from 'boolean' then raise exception 'Invalid annual draft'; end if;
  foreach item in array array[p_data->'notes',p_data->'lodgement_date',p_data->'lodgement_reference'] loop
    if jsonb_typeof(item) is distinct from 'string' then raise exception 'Invalid annual text'; end if;
  end loop;
  if length(p_data->>'notes') > 4000 or length(p_data->>'lodgement_reference') > 200 or p_data->>'lodgement_date' !~ '^$|^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or ((p_data->>'lodgement_date'='') <> (p_data->>'lodgement_reference'='')) then raise exception 'Invalid lodgement record'; end if;
  for component in select * from jsonb_each(p_data->'rows') loop
    if component.key not in ('MINE_DETAILS','TENEMENT_STATUS','RAW_MATERIAL_MINED','RAW_MATERIAL_TRANSFERRED','RAW_COMMODITY_STOCKPILE','PRODUCTS_PROCESSED','SALES') or jsonb_typeof(component.value) <> 'array' then raise exception 'Invalid component'; end if;
    if jsonb_array_length(component.value) > 1000 then raise exception 'Too many rows'; end if;
    for item in select * from jsonb_array_elements(component.value) loop
      if jsonb_typeof(item) <> 'object' then raise exception 'Invalid row'; end if;
      for field in select * from jsonb_each(item) loop
        if length(field.key)>80 or jsonb_typeof(field.value)<>'string' or length(field.value #>> '{}')>2000 then raise exception 'Invalid field'; end if;
      end loop;
    end loop;
  end loop;
  for component in select * from jsonb_each(p_data->'checks') loop
    if component.key not in ('MINE_DETAILS','TENEMENT_STATUS','RAW_MATERIAL_MINED','RAW_MATERIAL_TRANSFERRED','RAW_COMMODITY_STOCKPILE','PRODUCTS_PROCESSED','SALES') or jsonb_typeof(component.value)<>'boolean' then raise exception 'Invalid review'; end if;
  end loop;
  select * into current_row from public.gic_annual_reports where workspace_id=p_workspace and year=p_year for update;
  if found then
    if current_row.version <> p_version then raise exception 'CONFLICT: this annual draft changed; reload before saving'; end if;
    saved_id := current_row.id; next_version := current_row.version + 1;
    update public.gic_annual_reports set data=p_data,version=next_version,runs_version=p_runs_version,updated_at=now(),updated_by=auth.uid() where id=saved_id;
  else
    if p_version <> 0 then raise exception 'CONFLICT: annual draft not found'; end if;
    next_version := 1;
    insert into public.gic_annual_reports(workspace_id,year,data,runs_version,updated_by) values(p_workspace,p_year,p_data,p_runs_version,auth.uid()) returning id into saved_id;
  end if;
  insert into public.gic_audit(workspace_id,entity_id,entity_type,version,actor_id,reason,snapshot) values(p_workspace,saved_id,'annual',next_version,auth.uid(),'Annual draft saved',p_data);
  return saved_id;
end; $$;
revoke all on function public.gic_save_run(uuid,uuid,integer,jsonb,text) from public,anon;
revoke all on function public.gic_save_annual(uuid,integer,integer,jsonb,integer) from public,anon;
grant execute on function public.gic_save_run(uuid,uuid,integer,jsonb,text) to authenticated;
grant execute on function public.gic_save_annual(uuid,integer,integer,jsonb,integer) to authenticated;
-- A single MVCC snapshot prevents mixed revisions and default API row-limit truncation.
create function public.gic_export_snapshot(p_workspace uuid, p_year integer)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'runs_version',w.runs_version,
    'runs',coalesce((select jsonb_agg(to_jsonb(r) order by r.processed_at desc,r.id) from public.gic_runs r where r.workspace_id=w.id and (p_year is null or (r.processed_at >= make_timestamptz(p_year-1,7,1,0,0,0,'Australia/Brisbane') and r.processed_at < make_timestamptz(p_year,7,1,0,0,0,'Australia/Brisbane')))), '[]'::jsonb),
    'report',(select to_jsonb(a) from public.gic_annual_reports a where a.workspace_id=w.id and a.year=p_year)
  ) from public.gic_workspaces w where w.id=p_workspace;
$$;
revoke all on function public.gic_export_snapshot(uuid,integer) from public,anon;
grant execute on function public.gic_export_snapshot(uuid,integer) to authenticated;
commit;
