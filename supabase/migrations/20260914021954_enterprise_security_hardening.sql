-- Enterprise security hardening for legacy exposed functions and internal tables.
-- This migration is additive and fail-closed: it narrows client privileges without
-- changing the governed RPC paths used by the application.
begin;

-- Legacy geology mutations and membership helpers must never be callable as anon.
do $$
begin
  if to_regprocedure('public.geology_create_project(uuid,uuid,jsonb)') is not null then
    execute 'revoke all on function public.geology_create_project(uuid,uuid,jsonb) from public,anon';
    execute 'grant execute on function public.geology_create_project(uuid,uuid,jsonb) to authenticated';
  end if;
  if to_regprocedure('public.geology_reserve_extraction(uuid,integer,integer,integer)') is not null then
    execute 'revoke all on function public.geology_reserve_extraction(uuid,integer,integer,integer) from public,anon';
    execute 'grant execute on function public.geology_reserve_extraction(uuid,integer,integer,integer) to authenticated';
  end if;
  if to_regprocedure('public.geology_role(uuid)') is not null then
    execute 'revoke all on function public.geology_role(uuid) from public,anon';
    execute 'grant execute on function public.geology_role(uuid) to authenticated';
  end if;
  if to_regprocedure('public.geology_save_project(uuid,uuid,bigint,jsonb,text)') is not null then
    execute 'revoke all on function public.geology_save_project(uuid,uuid,bigint,jsonb,text) from public,anon';
    execute 'grant execute on function public.geology_save_project(uuid,uuid,bigint,jsonb,text) to authenticated';
  end if;
  if to_regprocedure('public.geology_set_member(uuid,uuid,text,text)') is not null then
    execute 'revoke all on function public.geology_set_member(uuid,uuid,text,text) from public,anon';
    execute 'grant execute on function public.geology_set_member(uuid,uuid,text,text) to authenticated';
  end if;
end $$;

-- Internal tables are intentionally not direct client APIs. Explicit deny policies
-- make that contract visible to advisors and protect against future grants.
do $$
declare
  item record;
begin
  for item in
    select * from (values
      ('mx_ops','command_permissions','ops_command_permissions_no_direct_access'),
      ('mx_ops','profile_permissions','ops_profile_permissions_no_direct_access'),
      ('mx_ops','receipts','ops_receipts_no_direct_access'),
      ('mx_ops','schema_version','ops_schema_version_no_direct_access'),
      ('mx_meetings','members','meetings_members_no_direct_access'),
      ('mx_meetings','receipts','meetings_receipts_no_direct_access'),
      ('public','geology_extraction_usage','geology_extraction_usage_no_direct_access')
    ) as tables(schema_name,table_name,policy_name)
  loop
    if to_regclass(format('%I.%I',item.schema_name,item.table_name)) is not null then
      execute format('create policy %I on %I.%I for all to authenticated using (false) with check (false)',item.policy_name,item.schema_name,item.table_name);
    end if;
  end loop;
end $$;

-- Keep auth helper calls init-planned once per statement instead of once per row.
do $$
begin
  if to_regclass('public.geology_members') is not null and to_regprocedure('public.geology_role(uuid)') is not null then
    execute 'drop policy if exists geology_members_read on public.geology_members';
    execute 'create policy geology_members_read on public.geology_members for select to authenticated using ((user_id = (select auth.uid())) or ((select public.geology_role(project_id)) = ''owner''))';
  end if;
  if to_regclass('public.plant_layouts') is not null then
    execute 'drop policy if exists plant_workspace_read on public.plant_layouts';
    execute 'create policy plant_workspace_read on public.plant_layouts for select to authenticated using (exists (select 1 from public.gic_members m where m.workspace_id = plant_layouts.workspace_id and m.user_id = (select auth.uid())))';
  end if;
  if to_regclass('mx_ops.administrators') is not null then
    execute 'drop policy if exists scoped_read on mx_ops.administrators';
    execute 'create policy scoped_read on mx_ops.administrators for select to authenticated using (user_id = (select auth.uid()))';
  end if;
  if to_regclass('mx_ops.members') is not null then
    execute 'drop policy if exists scoped_read on mx_ops.members';
    execute 'create policy scoped_read on mx_ops.members for select to authenticated using ((user_id = (select auth.uid())) or mx_ops.is_admin((select s.org_id from mx_ops.scopes s where s.id = members.scope_id)))';
  end if;
  if to_regclass('mx_ops.program_types') is not null then
    execute 'drop policy if exists program_type_read on mx_ops.program_types';
    execute 'create policy program_type_read on mx_ops.program_types for select to authenticated using ((select auth.uid()) is not null)';
  end if;
end $$;

commit;
