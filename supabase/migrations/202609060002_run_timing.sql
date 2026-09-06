-- Keep processed_at as the run end for existing financial-year reporting.
-- Unknown historical start times remain NULL; never invent a duration.
begin;
alter table public.gic_runs add column started_at timestamptz;
alter table public.gic_runs add constraint gic_run_time_order check (started_at is null or started_at < processed_at);
create or replace function public.gic_save_run(p_workspace uuid, p_id uuid, p_version integer, p_data jsonb, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare old_row public.gic_runs; next_version integer; k text; n numeric; processed timestamptz; started timestamptz;
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
  if jsonb_typeof(p_data->'started_at') is distinct from 'string' or p_data->>'started_at' !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'Start time with a time zone is required'; end if;
  started := (p_data->>'started_at')::timestamptz;
  if started < '2000-01-01'::timestamptz or started >= processed then raise exception 'End time must be after start time'; end if;
  select * into old_row from public.gic_runs where id=p_id for update;
  if found then
    if old_row.workspace_id <> p_workspace then raise exception 'Access denied'; end if;
    if old_row.version <> p_version then raise exception 'CONFLICT: this run changed; reload before saving'; end if;
    if length(trim(p_reason)) not between 3 and 500 then raise exception 'A correction reason is required'; end if;
    next_version := old_row.version + 1;
    update public.gic_runs set data=p_data, processed_at=processed, started_at=started, version=next_version, updated_at=now(), updated_by=auth.uid() where id=p_id;
  else
    if p_version <> 0 or p_data->>'status' <> 'active' then raise exception 'Invalid new run'; end if;
    next_version := 1;
    insert into public.gic_runs(id,workspace_id,data,processed_at,started_at,created_by,updated_by) values(p_id,p_workspace,p_data,processed,started,auth.uid(),auth.uid());
  end if;
  insert into public.gic_audit(workspace_id,entity_id,entity_type,version,actor_id,reason,snapshot) values(p_workspace,p_id,'run',next_version,auth.uid(),case when next_version=1 then 'Run recorded' else trim(p_reason) end,p_data);
  update public.gic_workspaces set runs_version=runs_version+1 where id=p_workspace;
  return p_id;
end; $$;

commit;
