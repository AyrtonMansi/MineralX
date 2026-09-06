-- Private design documents share the existing operation membership.
-- Operational seed data must be loaded separately, never committed to this public repository.
begin;
create table public.plant_layouts (
  workspace_id uuid primary key references public.gic_workspaces(id) on delete restrict,
  revision text not null check (length(revision) between 1 and 100),
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) < 4000000),
  updated_at timestamptz not null default now()
);
alter table public.plant_layouts enable row level security;
revoke all on public.plant_layouts from anon, authenticated;
grant select on public.plant_layouts to authenticated;
create policy plant_workspace_read on public.plant_layouts for select to authenticated using (
  exists (select 1 from public.gic_members m where m.workspace_id = plant_layouts.workspace_id and m.user_id = auth.uid())
);
comment on table public.plant_layouts is 'Private concept plant plans. Read-only in the application; reviewed revisions imported by the database administrator.';
commit;
