-- Governed plant-layout proposals for the Engineering CAD surface.
-- Geometry proposals are reviewable design data only: no function in this migration
-- publishes as-built geometry or controls physical equipment.
begin;

create table mx_ops.engineering_design_changesets (
 id uuid primary key,
 scope_id uuid not null references mx_ops.scopes(id),
 request_id uuid not null,
 version integer not null default 1 check(version>0),
 status text not null default 'proposed' check(status in('proposed','approved','rejected','superseded')),
 base_revision text not null check(length(trim(base_revision)) between 1 and 200),
 base_fingerprint text not null check(length(trim(base_fingerprint)) between 4 and 200),
 title text not null check(length(trim(title)) between 3 and 240),
 rationale text not null check(length(trim(rationale)) between 3 and 4000),
 operations jsonb not null check(
  jsonb_typeof(operations)='array'
  and jsonb_array_length(operations) between 1 and 50
  and octet_length(operations::text)<=120000
 ),
 validation jsonb not null check(
  jsonb_typeof(validation)='object'
  and validation ? 'ok'
  and validation->>'ok'='true'
  and octet_length(validation::text)<=120000
 ),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz,
 unique(scope_id,id),
 unique(scope_id,request_id),
 check((status='proposed' and reviewed_by is null and reviewed_at is null)
   or (status<>'proposed' and reviewed_by is not null and reviewed_at is not null))
);
create index engineering_design_changesets_scope_created
 on mx_ops.engineering_design_changesets(scope_id,created_at desc,id desc);

create function public.mx_ops_plant_design_list(p_scope uuid,p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rows jsonb;
begin
 perform mx_ops.require_permission(p_scope,'plant.read');
 perform mx_ops.rule(p_limit between 1 and 50,'Choose between 1 and 50 design proposals');
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc),'[]'::jsonb) into rows
 from (
  select id,scope_id,request_id,version,status,base_revision,base_fingerprint,title,rationale,
   operations,validation,created_by,created_at,reviewed_by,reviewed_at
  from mx_ops.engineering_design_changesets
  where scope_id=p_scope order by created_at desc,id desc limit p_limit
 ) x;
 return jsonb_build_object('rows',rows);
end $$;

create function public.mx_ops_plant_design_read(p_scope uuid,p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare row_record mx_ops.engineering_design_changesets;
begin
 perform mx_ops.require_permission(p_scope,'plant.read');
 select * into row_record from mx_ops.engineering_design_changesets where scope_id=p_scope and id=p_id;
 perform mx_ops.rule(row_record.id is not null,'NOT_FOUND: Plant design proposal not found');
 return to_jsonb(row_record);
end $$;

create function public.mx_ops_plant_design_create(
 p_scope uuid,p_request uuid,p_id uuid,p_base_revision text,p_base_fingerprint text,
 p_title text,p_rationale text,p_operations jsonb,p_validation jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid();
 row_record mx_ops.engineering_design_changesets;
 existing mx_ops.engineering_design_changesets;
 intent jsonb;
begin
 perform mx_ops.rule(actor is not null,'ACCESS_DENIED: Sign in before creating an engineering proposal');
 perform mx_ops.require_permission(p_scope,'plant.capture');
 perform mx_ops.rule(exists(select 1 from mx_ops.scopes s where s.id=p_scope and s.kind='facility'),'Choose a processing-facility workspace');
 perform mx_ops.rule(p_request is not null and p_id is not null,'A stable proposal and request ID are required');
 perform mx_ops.rule(length(trim(coalesce(p_base_revision,''))) between 1 and 200,'Base revision is required');
 perform mx_ops.rule(length(trim(coalesce(p_base_fingerprint,''))) between 4 and 200,'Base fingerprint is required');
 perform mx_ops.rule(length(trim(coalesce(p_title,''))) between 3 and 240,'Enter a concise design title');
 perform mx_ops.rule(length(trim(coalesce(p_rationale,''))) between 3 and 4000,'Record the engineering rationale');
 perform mx_ops.rule(jsonb_typeof(p_operations)='array' and jsonb_array_length(p_operations) between 1 and 50 and octet_length(p_operations::text)<=120000,'Enter between 1 and 50 bounded design operations');
 perform mx_ops.rule(jsonb_typeof(p_validation)='object' and p_validation->>'ok'='true' and octet_length(p_validation::text)<=120000,'Only a deterministically validated design proposal may be stored');
 intent:=jsonb_build_object('id',p_id,'base_revision',trim(p_base_revision),'base_fingerprint',trim(p_base_fingerprint),'title',trim(p_title),'rationale',trim(p_rationale),'operations',p_operations,'validation',p_validation);
 select * into existing from mx_ops.engineering_design_changesets where scope_id=p_scope and request_id=p_request;
 if existing.id is not null then
  perform mx_ops.rule(
   existing.id=p_id and existing.base_revision=trim(p_base_revision)
    and existing.base_fingerprint=trim(p_base_fingerprint) and existing.title=trim(p_title)
    and existing.rationale=trim(p_rationale) and existing.operations=p_operations and existing.validation=p_validation,
   'IDEMPOTENCY_MISMATCH: This design request ID was already used with different geometry'
  );
  return to_jsonb(existing)||jsonb_build_object('replayed',true);
 end if;
 insert into mx_ops.engineering_design_changesets(
  id,scope_id,request_id,base_revision,base_fingerprint,title,rationale,operations,validation,created_by
 ) values(
  p_id,p_scope,p_request,trim(p_base_revision),trim(p_base_fingerprint),trim(p_title),trim(p_rationale),p_operations,p_validation,actor
 ) returning * into row_record;
 return to_jsonb(row_record)||jsonb_build_object('replayed',false);
end $$;

alter table mx_ops.engineering_design_changesets enable row level security;
create policy engineering_design_changesets_scoped_read on mx_ops.engineering_design_changesets
 for select to authenticated using(mx_ops.can(scope_id,'plant.read'));
revoke all on table mx_ops.engineering_design_changesets from public,anon,authenticated,service_role,mineralx_mcp;
grant select on table mx_ops.engineering_design_changesets to authenticated;
revoke all on function public.mx_ops_plant_design_list(uuid,integer),
 public.mx_ops_plant_design_read(uuid,uuid),
 public.mx_ops_plant_design_create(uuid,uuid,uuid,text,text,text,text,jsonb,jsonb)
 from public,anon,service_role,mineralx_mcp;
grant execute on function public.mx_ops_plant_design_list(uuid,integer),
 public.mx_ops_plant_design_read(uuid,uuid),
 public.mx_ops_plant_design_create(uuid,uuid,uuid,text,text,text,text,jsonb,jsonb)
 to authenticated;

-- Keep the existing MCP gateway's closed allowlist intact by versioning it and
-- putting only these three Engineering proposal operations in a narrow wrapper.
alter function public.mx_ops_mcp_gateway(uuid,text,text,text,jsonb) rename to mx_ops_mcp_gateway_v10;
create function public.mx_ops_mcp_gateway(
 p_actor uuid,p_client text,p_aal text,p_operation text,p_args jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare uuid_pattern constant text:='^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
begin
 if p_operation not in('mx_ops_plant_design_list','mx_ops_plant_design_read','mx_ops_plant_design_create') then
  return public.mx_ops_mcp_gateway_v10(p_actor,p_client,p_aal,p_operation,p_args);
 end if;
 -- Reuse the previous gateway to validate the verified actor/client/AAL tuple and
 -- establish the authenticated actor claims before any Engineering RPC runs.
 perform public.mx_ops_mcp_gateway_v10(p_actor,p_client,p_aal,'mx_ops_context','{}'::jsonb);
 if p_operation='mx_ops_plant_design_list' then
  perform mx_ops.rule(
   p_args ?& array['p_scope','p_limit']
    and p_args-(array['p_scope','p_limit']::text[])='{}'::jsonb
    and coalesce(p_args->>'p_scope','') ~* uuid_pattern
    and jsonb_typeof(p_args->'p_limit')='number' and (p_args->>'p_limit') ~ '^([1-9]|[1-4][0-9]|50)$',
   'Invalid MCP plant-design list arguments'
  );
  return public.mx_ops_plant_design_list((p_args->>'p_scope')::uuid,(p_args->>'p_limit')::integer);
 elsif p_operation='mx_ops_plant_design_read' then
  perform mx_ops.rule(
   p_args ?& array['p_scope','p_id']
    and p_args-(array['p_scope','p_id']::text[])='{}'::jsonb
    and coalesce(p_args->>'p_scope','') ~* uuid_pattern
    and coalesce(p_args->>'p_id','') ~* uuid_pattern,
   'Invalid MCP plant-design read arguments'
  );
  return public.mx_ops_plant_design_read((p_args->>'p_scope')::uuid,(p_args->>'p_id')::uuid);
 else
  perform mx_ops.rule(
   p_args ?& array['p_scope','p_request','p_id','p_base_revision','p_base_fingerprint','p_title','p_rationale','p_operations','p_validation']
    and p_args-(array['p_scope','p_request','p_id','p_base_revision','p_base_fingerprint','p_title','p_rationale','p_operations','p_validation']::text[])='{}'::jsonb
    and coalesce(p_args->>'p_scope','') ~* uuid_pattern
    and coalesce(p_args->>'p_request','') ~* uuid_pattern
    and coalesce(p_args->>'p_id','') ~* uuid_pattern
    and jsonb_typeof(p_args->'p_base_revision')='string'
    and jsonb_typeof(p_args->'p_base_fingerprint')='string'
    and jsonb_typeof(p_args->'p_title')='string'
    and jsonb_typeof(p_args->'p_rationale')='string'
    and jsonb_typeof(p_args->'p_operations')='array'
    and jsonb_typeof(p_args->'p_validation')='object',
   'Invalid MCP plant-design create arguments'
  );
  return public.mx_ops_plant_design_create(
   (p_args->>'p_scope')::uuid,(p_args->>'p_request')::uuid,(p_args->>'p_id')::uuid,
   p_args->>'p_base_revision',p_args->>'p_base_fingerprint',p_args->>'p_title',p_args->>'p_rationale',
   p_args->'p_operations',p_args->'p_validation'
  );
 end if;
end $$;

revoke all on function public.mx_ops_mcp_gateway_v10(uuid,text,text,text,jsonb),
 public.mx_ops_mcp_gateway(uuid,text,text,text,jsonb)
 from public,anon,authenticated,mineralx_mcp;
grant execute on function public.mx_ops_mcp_gateway_v10(uuid,text,text,text,jsonb),
 public.mx_ops_mcp_gateway(uuid,text,text,text,jsonb)
 to service_role;

-- This is an additive capability on the v10 Operations contract. The rest of
-- Operations remains available if this optional Engineering migration is not yet commissioned.
commit;
