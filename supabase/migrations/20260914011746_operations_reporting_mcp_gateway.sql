-- Add report catalogue and revision-pinned run access to the closed MCP gateway.
begin;

alter function public.mx_ops_mcp_gateway(uuid,text,text,text,jsonb) rename to mx_ops_mcp_gateway_v11;
create function public.mx_ops_mcp_gateway(
 p_actor uuid,p_client text,p_aal text,p_operation text,p_args jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare uuid_pattern constant text:='^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
begin
 if p_operation not in('mx_ops_report_run_list','mx_ops_report_run_read','mx_ops_report_run_create') then
  return public.mx_ops_mcp_gateway_v11(p_actor,p_client,p_aal,p_operation,p_args);
 end if;
 -- Reuse the previous gateway to validate the verified actor/client/AAL tuple
 -- and establish the authenticated actor claims before a report RPC runs.
 perform public.mx_ops_mcp_gateway_v11(p_actor,p_client,p_aal,'mx_ops_context','{}'::jsonb);
 if p_operation='mx_ops_report_run_list' then
  perform mx_ops.rule(
   p_args ?& array['p_scope','p_after','p_limit']
   and p_args-(array['p_scope','p_after','p_limit']::text[])='{}'::jsonb
   and coalesce(p_args->>'p_scope','') ~* uuid_pattern
   and (p_args->'p_after'='null'::jsonb or coalesce(p_args->>'p_after','') ~* uuid_pattern)
   and jsonb_typeof(p_args->'p_limit')='number' and (p_args->>'p_limit') ~ '^([1-9]|[1-9][0-9]|100)$',
   'Invalid MCP report list arguments'
  );
  return public.mx_ops_report_run_list((p_args->>'p_scope')::uuid,(p_args->>'p_after')::uuid,(p_args->>'p_limit')::integer);
 elsif p_operation='mx_ops_report_run_read' then
  perform mx_ops.rule(
   p_args ?& array['p_scope','p_id']
   and p_args-(array['p_scope','p_id']::text[])='{}'::jsonb
   and coalesce(p_args->>'p_scope','') ~* uuid_pattern
   and coalesce(p_args->>'p_id','') ~* uuid_pattern,
   'Invalid MCP report read arguments'
  );
  return public.mx_ops_report_run_read((p_args->>'p_scope')::uuid,(p_args->>'p_id')::uuid);
 else
  perform mx_ops.rule(
   p_args ?& array['p_scope','p_request','p_id','p_report_id','p_report_version','p_from','p_to','p_source_revision','p_status','p_document','p_metrics','p_gaps']
   and p_args-(array['p_scope','p_request','p_id','p_report_id','p_report_version','p_from','p_to','p_source_revision','p_status','p_document','p_metrics','p_gaps']::text[])='{}'::jsonb
   and coalesce(p_args->>'p_scope','') ~* uuid_pattern
   and coalesce(p_args->>'p_request','') ~* uuid_pattern
   and coalesce(p_args->>'p_id','') ~* uuid_pattern
   and p_args->>'p_report_id' ~ '^RPT-[0-9]{2}$'
   and jsonb_typeof(p_args->'p_report_version')='number' and (p_args->>'p_report_version') ~ '^[1-9][0-9]{0,8}$'
   and jsonb_typeof(p_args->'p_from')='string' and jsonb_typeof(p_args->'p_to')='string'
   and jsonb_typeof(p_args->'p_source_revision')='number' and (p_args->>'p_source_revision') ~ '^[0-9]{1,18}$'
   and p_args->>'p_status' in('ready','partial')
   and jsonb_typeof(p_args->'p_document')='object'
   and jsonb_typeof(p_args->'p_metrics')='array'
   and jsonb_typeof(p_args->'p_gaps')='array',
   'Invalid MCP report create arguments'
  );
  return public.mx_ops_report_run_create(
   (p_args->>'p_scope')::uuid,(p_args->>'p_request')::uuid,(p_args->>'p_id')::uuid,
   p_args->>'p_report_id',(p_args->>'p_report_version')::integer,
   (p_args->>'p_from')::timestamptz,(p_args->>'p_to')::timestamptz,
   (p_args->>'p_source_revision')::bigint,p_args->>'p_status',p_args->'p_document',p_args->'p_metrics',p_args->'p_gaps'
  );
 end if;
end $$;

revoke all on function public.mx_ops_mcp_gateway_v11(uuid,text,text,text,jsonb),public.mx_ops_mcp_gateway(uuid,text,text,text,jsonb)
 from public,anon,authenticated,mineralx_mcp;
grant execute on function public.mx_ops_mcp_gateway_v11(uuid,text,text,text,jsonb),public.mx_ops_mcp_gateway(uuid,text,text,text,jsonb)
 to service_role;

commit;
