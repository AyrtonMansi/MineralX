import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setup, asUser, ids} from './helpers';

const migration = () => readFile(new URL('../../supabase/migrations/20260914021954_enterprise_security_hardening.sql', import.meta.url), 'utf8');

test('enterprise hardening removes anonymous legacy RPC execution and makes internal denies explicit', async () => {
  const db = await setup(false);
  try {
    await db.exec(`
      create function public.geology_create_project(p_id uuid,p_operation uuid,p_data jsonb) returns jsonb language sql security definer set search_path='' as $$ select '{}'::jsonb $$;
      create function public.geology_reserve_extraction(project_id uuid,max_requests_day integer,max_input_chars_day integer,requested_chars integer) returns boolean language sql security definer set search_path='' as $$ select true $$;
      create function public.geology_role(p_id uuid) returns text language sql security definer set search_path='' as $$ select 'viewer'::text $$;
      create function public.geology_save_project(p_id uuid,p_operation uuid,p_version bigint,p_data jsonb,p_reason text) returns jsonb language sql security definer set search_path='' as $$ select '{}'::jsonb $$;
      create function public.geology_set_member(p_id uuid,p_user uuid,p_role text,p_reason text) returns jsonb language sql security definer set search_path='' as $$ select '{}'::jsonb $$;
      grant execute on function public.geology_create_project(uuid,uuid,jsonb),public.geology_reserve_extraction(uuid,integer,integer,integer),public.geology_role(uuid),public.geology_save_project(uuid,uuid,bigint,jsonb,text),public.geology_set_member(uuid,uuid,text,text) to anon,authenticated;
    `);
    await db.exec(await migration());

    const grants = await db.query<{name: string; anon_execute: boolean; authenticated_execute: boolean}>(`
      select p.proname as name,
        has_function_privilege('anon',p.oid,'execute') as anon_execute,
        has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname like 'geology_%'
      order by p.proname
    `);
    assert.deepEqual(grants.rows, [
      {name: 'geology_create_project', anon_execute: false, authenticated_execute: true},
      {name: 'geology_reserve_extraction', anon_execute: false, authenticated_execute: true},
      {name: 'geology_role', anon_execute: false, authenticated_execute: true},
      {name: 'geology_save_project', anon_execute: false, authenticated_execute: true},
      {name: 'geology_set_member', anon_execute: false, authenticated_execute: true},
    ]);

    const policies = await db.query<{tablename: string; policyname: string}>(`
      select tablename,policyname from pg_policies
      where schemaname='mx_ops' and policyname like 'ops_%_no_direct_access'
      order by tablename
    `);
    assert.deepEqual(policies.rows, [
      {tablename: 'command_permissions', policyname: 'ops_command_permissions_no_direct_access'},
      {tablename: 'profile_permissions', policyname: 'ops_profile_permissions_no_direct_access'},
      {tablename: 'receipts', policyname: 'ops_receipts_no_direct_access'},
      {tablename: 'schema_version', policyname: 'ops_schema_version_no_direct_access'},
    ]);

    await assert.rejects(asUser(db, ids.operator, 'select * from mx_ops.command_permissions'), /permission denied|row-level security/);
  } finally {
    await db.close();
  }
});
