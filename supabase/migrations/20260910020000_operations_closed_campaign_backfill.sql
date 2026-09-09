-- A v7 bridge represented legacy closed campaigns as planned canonical programs.
-- Correct only the original, untouched bridge shape; a later canonical edit wins.
begin;
create or replace function mx_ops.program_invariants() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and old.data ? 'type' then
  perform mx_ops.rule(new.data ? 'type' and new.data ? 'state','Program metadata must not be replaced with a legacy-only record');
  if old.data->>'type'='processing' then perform mx_ops.rule(new.data->>'type'='processing','Keep the stable processing campaign type');end if;
 end if;
 -- The v9 one-time backfill preserves an already-closed legacy campaign even
 -- where a task was added during the earlier bridge defect. It can never be
 -- reused by a later workflow edit because it requires the original v1 row.
 if new.data->>'state'='completed' and not (
  tg_op='UPDATE' and old.version=1 and old.data->>'type'='processing'
  and old.data->>'state'='planned' and not old.data ? 'legacyCampaignClosureBackfill'
  and new.data ? 'legacyCampaignClosureBackfill'
 ) then
  perform mx_ops.rule(not exists(select 1 from mx_ops.work_items where program_id=new.id and (status not in('resolved','cancelled') or kind='maintenance' and status='resolved' and verified_at is null)),'Complete or cancel outstanding work before closing the program');
 end if;
 return new;
end $$;

update mx_ops.geo_programs g
set data=g.data||jsonb_build_object(
  'state','completed',
  'completionReason','Migrated from closed legacy processing campaign',
  'legacyCampaignClosureBackfill',jsonb_build_object('source','mx_ops.campaigns.status','legacyState','closed')
 ),version=g.version+1,updated_at=now()
from mx_ops.campaigns c
where c.id=g.id and c.scope_id=g.scope_id and c.status='closed'
  and g.version=1
  and g.data=jsonb_build_object('recordId',g.id,'name',c.name,'type','processing','state','planned','method','rock_chip');

insert into mx_ops.schema_version(version) values(9);
commit;
