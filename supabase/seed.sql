-- Deterministic local fixtures for exercising the MineralX suite and
-- intelligence intake workflow. Identities and memberships are deliberately
-- omitted: create a real local Auth user and grant only the access under test.

begin;

insert into public.gic_workspaces (id, name, mine_name)
values (
  '11111111-1111-4111-8111-111111111111'::uuid,
  'MineralX Local Test',
  'MineralX Local Mine'
)
on conflict (id) do update
set name = excluded.name,
    mine_name = excluded.mine_name;

insert into mx_ops.organisations (id, name, legacy_workspace_id)
values (
  '22222222-2222-4222-8222-222222222222'::uuid,
  'MineralX Local Test Organisation',
  '11111111-1111-4111-8111-111111111111'::uuid
)
on conflict (id) do update
set name = excluded.name,
    legacy_workspace_id = excluded.legacy_workspace_id;

insert into mx_ops.scopes (id, org_id, kind, code, name, timezone, policy)
values
  (
    '33333333-3333-4333-8333-333333333333'::uuid,
    '22222222-2222-4222-8222-222222222222'::uuid,
    'facility',
    'LOCAL-FAC',
    'MineralX Local Test Facility',
    'Australia/Brisbane',
    '{"recognition_form":"dore","recognition_confirmed":true,"self_review":false,"ai_external_processing":true}'::jsonb
  ),
  (
    '44444444-4444-4444-8444-444444444444'::uuid,
    '22222222-2222-4222-8222-222222222222'::uuid,
    'project',
    'LOCAL-GEO',
    'MineralX Local Geology Project',
    'Australia/Brisbane',
    '{"recognition_form":"dore","recognition_confirmed":true,"self_review":false,"ai_external_processing":true}'::jsonb
  )
on conflict (id) do update
set org_id = excluded.org_id,
    kind = excluded.kind,
    code = excluded.code,
    name = excluded.name,
    timezone = excluded.timezone,
    policy = excluded.policy;

commit;
