-- Plant and Gold entry forms need a canonical, open-only processing-program selector
-- without granting the broader work.read workflow view.
begin;
create function public.mx_ops_processing_programs(p_scope uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare programs jsonb;begin
 perform mx_ops.require_permission(p_scope,'plant.read');
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',g.id,'recordId',g.id,'version',g.version,'scope_id',g.scope_id,
   'updated_at',g.updated_at,'data',g.data
 ) order by lower(coalesce(g.data->>'name','')),g.id),'[]'::jsonb) into programs
 from mx_ops.geo_programs g
 where g.scope_id=p_scope
   and lower(coalesce(g.data->>'type',''))='processing'
   and lower(coalesce(g.data->>'state','planned')) not in('completed','cancelled');
 return jsonb_build_object('programs',programs,'revision',(select revision from mx_ops.scopes where id=p_scope),'asOf',now());
end $$;
revoke all on function public.mx_ops_processing_programs(uuid) from public,anon;
grant execute on function public.mx_ops_processing_programs(uuid) to authenticated;
insert into mx_ops.schema_version(version) values(8);
commit;
