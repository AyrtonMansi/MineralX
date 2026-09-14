-- Revision-pinned report runs. Report definitions remain code-owned so the UI,
-- API and MCP expose one catalogue; this table retains the generated evidence.
begin;

create table mx_ops.report_runs (
  id uuid primary key,
  scope_id uuid not null references mx_ops.scopes(id),
  request_id uuid not null,
  report_id text not null check(report_id ~ '^RPT-[0-9]{2}$'),
  report_version integer not null check(report_version > 0),
  period_start timestamptz not null,
  period_end timestamptz not null,
  source_revision bigint not null check(source_revision >= 0),
  status text not null check(status in('ready','partial')),
  document jsonb not null check(jsonb_typeof(document)='object' and octet_length(document::text)<=1500000),
  metrics jsonb not null check(jsonb_typeof(metrics)='array' and octet_length(metrics::text)<=500000),
  data_gaps jsonb not null default '[]'::jsonb check(jsonb_typeof(data_gaps)='array' and octet_length(data_gaps::text)<=100000),
  generated_by uuid not null references auth.users(id),
  generated_at timestamptz not null default now(),
  unique(scope_id,id),
  unique(scope_id,request_id),
  check(period_end > period_start)
);
create index report_runs_scope_generated on mx_ops.report_runs(scope_id,generated_at desc,id desc);

insert into mx_ops.profile_permissions(profile,permission) values
 ('accountant','report.generate'),('manager','report.generate'),('auditor','report.generate')
on conflict do nothing;

create function public.mx_ops_report_run_create(
 p_scope uuid,p_request uuid,p_id uuid,p_report_id text,p_report_version integer,
 p_from timestamptz,p_to timestamptz,p_source_revision bigint,p_status text,
 p_document jsonb,p_metrics jsonb,p_gaps jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();r mx_ops.report_runs;existing mx_ops.report_runs;
begin
 perform mx_ops.require_permission(p_scope,'report.generate');
 perform mx_ops.rule(actor is not null and p_request is not null and p_id is not null,'A report request identity is required');
 perform mx_ops.rule(p_report_id ~ '^RPT-[0-9]{2}$' and p_report_version>0,'Unknown report definition');
 perform mx_ops.rule(p_to>p_from and p_to-p_from<=interval '10 years','Choose a valid reporting period');
 perform mx_ops.rule(p_source_revision>=0 and p_status in('ready','partial'),'A report must be generated from a ready or partial snapshot');
 perform mx_ops.rule(jsonb_typeof(p_document)='object' and octet_length(p_document::text)<=1500000,'The report document exceeds the bounded output size');
 perform mx_ops.rule(jsonb_typeof(p_metrics)='array' and octet_length(p_metrics::text)<=500000,'The report metrics are invalid');
 perform mx_ops.rule(jsonb_typeof(p_gaps)='array' and octet_length(p_gaps::text)<=100000,'The report data gaps are invalid');
 select * into existing from mx_ops.report_runs where scope_id=p_scope and request_id=p_request;
 if existing.id is not null then
  perform mx_ops.rule(existing.report_id=p_report_id and existing.period_start=p_from and existing.period_end=p_to,'REPORT_IDEMPOTENCY_MISMATCH: Reuse the original report request for the same period and definition');
  return to_jsonb(existing)||jsonb_build_object('replayed',true);
 end if;
 insert into mx_ops.report_runs(id,scope_id,request_id,report_id,report_version,period_start,period_end,source_revision,status,document,metrics,data_gaps,generated_by)
 values(p_id,p_scope,p_request,p_report_id,p_report_version,p_from,p_to,p_source_revision,p_status,p_document,p_metrics,p_gaps,actor)
 returning * into r;
 insert into mx_ops.audit(scope_id,entity_id,actor_id,request_id,action,version,permission,reason,snapshot)
 values(p_scope,p_id,actor,p_request,'report.generate',1,'report.generate','Generated revision-pinned report run',to_jsonb(r)-'document');
 return to_jsonb(r)||jsonb_build_object('replayed',false);
end $$;

create function public.mx_ops_report_run_read(p_scope uuid,p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r mx_ops.report_runs;
begin
 perform mx_ops.require_permission(p_scope,'report.read');
 select * into r from mx_ops.report_runs where scope_id=p_scope and id=p_id;
 perform mx_ops.rule(r.id is not null,'Report run not found');
 return to_jsonb(r);
end $$;

create function public.mx_ops_report_run_list(p_scope uuid,p_after uuid default null,p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rows jsonb;
begin
 perform mx_ops.require_permission(p_scope,'report.read');
 perform mx_ops.rule(p_limit between 1 and 100,'Choose between 1 and 100 report runs');
 select coalesce(jsonb_agg(to_jsonb(x) order by x.generated_at desc,x.id desc),'[]'::jsonb) into rows
 from (
  select id,scope_id,request_id,report_id,report_version,period_start,period_end,source_revision,status,data_gaps,generated_by,generated_at
  from mx_ops.report_runs r
  where r.scope_id=p_scope and (p_after is null or (r.generated_at,id)<(select generated_at,id from mx_ops.report_runs where scope_id=p_scope and id=p_after))
  order by generated_at desc,id desc limit p_limit
 ) x;
 return jsonb_build_object('rows',rows,'next',case when jsonb_array_length(rows)=p_limit then rows->(jsonb_array_length(rows)-1)->>'id' else null end,'asOf',now());
end $$;

alter table mx_ops.report_runs enable row level security;
create policy report_runs_scoped_read on mx_ops.report_runs for select to authenticated using(mx_ops.can(scope_id,'report.read'));
revoke all on table mx_ops.report_runs from public,anon,authenticated,service_role;
grant select on table mx_ops.report_runs to authenticated;
revoke all on function public.mx_ops_report_run_create(uuid,uuid,uuid,text,integer,timestamptz,timestamptz,bigint,text,jsonb,jsonb,jsonb),public.mx_ops_report_run_read(uuid,uuid),public.mx_ops_report_run_list(uuid,uuid,integer) from public,anon,service_role;
grant execute on function public.mx_ops_report_run_create(uuid,uuid,uuid,text,integer,timestamptz,timestamptz,bigint,text,jsonb,jsonb,jsonb),public.mx_ops_report_run_read(uuid,uuid),public.mx_ops_report_run_list(uuid,uuid,integer) to authenticated;

insert into mx_ops.schema_version(version) values(11);
commit;
