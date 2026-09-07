begin;
create function public.mx_ops_list(p_scope uuid,p_kind text,p_after uuid default null,p_limit integer default 100,p_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tab text;perm text;pk text:='id';items jsonb;begin
 select t,p,k into tab,perm,pk from (values
 ('feed','feed_lots','plant.read','id'),('campaigns','campaigns','plant.read','id'),('runs','runs','plant.read','id'),
 ('lots','gold_lots','gold.read','id'),('weights','weights','gold.read','id'),('assays','product_assays','gold.read','id'),('production','production','gold.read','lot_id'),
 ('custody','custody','gold.custody.read','lot_id'),('transfers','transfers','gold.custody.read','id'),('periods','periods','balance.read','id'),('balance_lines','balance_lines','balance.read','id'),
 ('work','work_items','work.read','id'),('settlements','settlements','commercial.read','id'),('allocations','allocations','commercial.read','id')) as x(n,t,p,k) where n=p_kind;
 perform mx_ops.rule(tab is not null,'Unknown register');perform mx_ops.require_permission(p_scope,perm);
 execute format('select coalesce(jsonb_agg(mx_ops.exact_record(to_jsonb(r))),''[]''::jsonb) from (select * from mx_ops.%I where scope_id=$1 and ($2 is null or %I>$2) and ($4 is null or %I=$4) order by %I limit $3)r',tab,pk,pk,pk) into items using p_scope,p_after,least(500,greatest(1,p_limit)),p_id;
 return jsonb_build_object('rows',items,'next',case when jsonb_array_length(items)=least(500,greatest(1,p_limit)) then items->(jsonb_array_length(items)-1)->>pk else null end,'asOf',now(),'revision',(select revision from mx_ops.scopes where id=p_scope));
end $$;
create function public.mx_ops_detail(p_scope uuid,p_kind text,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;entity jsonb;permission text;begin
 entity:=(public.mx_ops_list(p_scope,p_kind,null,1,p_id))->'rows'->0;
 if entity is null then raise exception 'NOT_FOUND';end if;
 result:=jsonb_build_object('record',entity,'asOf',now());
 if p_kind='lots' then
  result:=result||jsonb_build_object('weights',coalesce((select jsonb_agg(mx_ops.exact_record(to_jsonb(w)) order by observed_at) from mx_ops.weights w where scope_id=p_scope and lot_id=p_id),'[]'::jsonb),'assays',coalesce((select jsonb_agg(mx_ops.exact_record(to_jsonb(a)) order by created_at) from mx_ops.product_assays a where scope_id=p_scope and lot_id=p_id),'[]'::jsonb),
  'runs',coalesce((select jsonb_agg(to_jsonb(r)) from mx_ops.runs r join mx_ops.lot_runs l on l.run_id=r.id and l.scope_id=r.scope_id where l.scope_id=p_scope and l.lot_id=p_id and mx_ops.can(p_scope,'plant.read')),'[]'::jsonb),
  'production',(select mx_ops.exact_record(to_jsonb(g)) from mx_ops.production g where scope_id=p_scope and lot_id=p_id),
  'custody',(select to_jsonb(c) from mx_ops.custody c where scope_id=p_scope and lot_id=p_id and mx_ops.can(p_scope,'gold.custody.read')),
  'transfers',coalesce((select jsonb_agg(to_jsonb(t) order by shipped_at) from mx_ops.transfers t where scope_id=p_scope and lot_id=p_id and mx_ops.can(p_scope,'gold.custody.read')),'[]'::jsonb),
  'lineage',coalesce((select jsonb_agg(to_jsonb(l)) from mx_ops.lineage l where scope_id=p_scope and (parent_id=p_id or child_id=p_id)),'[]'::jsonb));
 elsif p_kind='runs' then result:=result||jsonb_build_object('feeds',coalesce((select jsonb_agg(mx_ops.exact_record(to_jsonb(f))) from mx_ops.run_feeds f where scope_id=p_scope and run_id=p_id),'[]'::jsonb));
 elsif p_kind='periods' then result:=result||jsonb_build_object('lines',coalesce((select jsonb_agg(mx_ops.exact_record(to_jsonb(l))) from mx_ops.balance_lines l where scope_id=p_scope and period_id=p_id),'[]'::jsonb),'history',coalesce((select jsonb_agg(to_jsonb(h) order by version) from mx_ops.period_history h where scope_id=p_scope and period_id=p_id),'[]'::jsonb));end if;
 return result||jsonb_build_object('historyEvents',coalesce((select jsonb_agg(to_jsonb(a)-'snapshot' order by seq) from mx_ops.audit a where scope_id=p_scope and entity_id=p_id and mx_ops.can(p_scope,a.permission)),'[]'::jsonb));
end $$;
create function public.mx_ops_dashboard(p_scope uuid,p_from timestamptz,p_to timestamptz) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb:='{}';begin
 perform mx_ops.rule(p_to>p_from and p_to-p_from<=interval '10 years','Choose a valid reporting period');
 perform mx_ops.rule(mx_ops.can(p_scope,'work.read') or mx_ops.can(p_scope,'report.read'),'Access denied');
 if mx_ops.can(p_scope,'plant.read') then
  result:=result||jsonb_build_object('processing',(select jsonb_build_object('runs',count(distinct r.id),'dry_t',sum(f.dry_t)::text,'wet_t',sum(case when f.basis='wet' then f.quantity_t end)::text,'basis_incomplete',count(*) filter(where f.run_id is not null and f.dry_t is null),'submitted',count(distinct r.id) filter(where r.status='submitted'),'drafts',count(distinct r.id) filter(where r.status in('draft','returned'))) from mx_ops.runs r left join mx_ops.run_feeds f on f.run_id=r.id and f.scope_id=r.scope_id where r.scope_id=p_scope and r.status<>'void' and coalesce(r.ended_at,r.started_at,r.created_at)>=p_from and coalesce(r.ended_at,r.started_at,r.created_at)<p_to));
 end if;
 if mx_ops.can(p_scope,'gold.read') then
  result:=result||jsonb_build_object('gold',(select jsonb_build_object('confirmed_fine_au_g',sum(g.fine_au_g)::text,'confirmed_lots',count(*)) from mx_ops.production g where scope_id=p_scope and recognized_at>=p_from and recognized_at<p_to),
   'pending',(select jsonb_build_object('lots',count(*),'measured_product_g',sum(w.net_g)::text,'unweighed',count(*) filter(where w.id is null)) from mx_ops.gold_lots l left join mx_ops.weights w on w.id=(select x.id from mx_ops.weights x where x.lot_id=l.id order by created_at desc,id desc limit 1) where l.scope_id=p_scope and l.origin='cleanup' and l.produced_at>=p_from and l.produced_at<p_to and not exists(select 1 from mx_ops.production g where g.lot_id=l.id)),
   'trend',coalesce((select jsonb_agg(to_jsonb(t) order by day) from (select date_trunc('day',recognized_at at time zone (select timezone from mx_ops.scopes where id=p_scope))::date as day,sum(fine_au_g)::text as fine_au_g from mx_ops.production where scope_id=p_scope and recognized_at>=p_from and recognized_at<p_to group by 1)t),'[]'::jsonb),
   'holdings',(select jsonb_build_object('verified_fine_au_g',sum(case when l.review_state='verified' then w.net_g*a.au_percent/100 end)::text,'product_g',sum(w.net_g)::text,'lots',count(*),'unverified_lots',count(*) filter(where l.review_state<>'verified')) from mx_ops.custody c join mx_ops.gold_lots l on l.id=c.lot_id left join mx_ops.weights w on w.id=l.active_weight_id left join mx_ops.product_assays a on a.id=l.active_assay_id where c.scope_id=p_scope and c.status='held'));
 end if;
 if mx_ops.can(p_scope,'geo.read') then result:=result||jsonb_build_object('geology',jsonb_build_object('samples',(select count(*) from mx_ops.geo_samples where scope_id=p_scope and data->>'archivedAt' is null),'holes',(select count(*) from mx_ops.geo_collars where scope_id=p_scope and data->>'archivedAt' is null),'receiptExceptions',(select count(*) from mx_ops.geo_dispatches where scope_id=p_scope and data->>'status'='receipt_exception'),'stagedCertificates',(select count(*) from mx_ops.geo_certificates where scope_id=p_scope and data->>'status'='staged')));end if;
 result:=result||jsonb_build_object('asOf',now(),'revision',(select revision from mx_ops.scopes where id=p_scope),'from',p_from,'to',p_to,'recovery',null,'recoveryNote','Not established: requires a reviewed representative circuit balance.','openActions',(select count(*) from mx_ops.work_items where scope_id=p_scope and status='open' and mx_ops.can(p_scope,'work.read')));
 return result;
end $$;
create function public.mx_ops_search(p_scope uuid,p_query text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 perform mx_ops.rule(length(trim(p_query)) between 2 and 160,'Enter at least two characters');
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into result from (
 select id,'runs' kind,reference label,status from mx_ops.runs where scope_id=p_scope and mx_ops.can(p_scope,'plant.read') and reference ilike '%'||p_query||'%'
 union all select id,'lots',reference,review_state from mx_ops.gold_lots where scope_id=p_scope and mx_ops.can(p_scope,'gold.read') and reference ilike '%'||p_query||'%'
 union all select id,'samples',data->>'id',data->>'lifecycle' from mx_ops.geo_samples where scope_id=p_scope and mx_ops.can(p_scope,'geo.read') and data->>'id' ilike '%'||p_query||'%'
 union all select id,'collars',data->>'id','drillhole' from mx_ops.geo_collars where scope_id=p_scope and mx_ops.can(p_scope,'geo.read') and data->>'id' ilike '%'||p_query||'%'
 union all select id,'dispatches',data->>'id',data->>'status' from mx_ops.geo_dispatches where scope_id=p_scope and mx_ops.can(p_scope,'geo.read') and data->>'id' ilike '%'||p_query||'%'
 union all select id,'assayBatches',data->>'certificate',data->>'status' from mx_ops.geo_certificates where scope_id=p_scope and mx_ops.can(p_scope,'geo.read') and data->>'certificate' ilike '%'||p_query||'%'
 limit 50)x;return result;
end $$;
create function public.mx_ops_files(p_scope uuid,p_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin return coalesce((select jsonb_agg(to_jsonb(f) order by created_at desc) from mx_ops.files f where scope_id=p_scope and (p_id is null or id=p_id) and mx_ops.can(scope_id,'files.'||family)),'[]'::jsonb);end $$;
create function public.mx_ops_documents(p_scope uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin return coalesce((select jsonb_agg(to_jsonb(d)||jsonb_build_object('file',to_jsonb(f)) order by d.created_at desc) from mx_ops.documents d join mx_ops.files f on f.id=d.file_id and f.scope_id=d.scope_id where d.scope_id=p_scope and mx_ops.can(d.scope_id,'files.'||f.family)),'[]'::jsonb);end $$;
create function public.mx_ops_file_finalize(p_actor uuid,p_scope uuid,p_id uuid,p_hash text,p_bytes bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare f mx_ops.files;begin
 perform set_config('request.jwt.claim.sub',p_actor::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'aal','aal1')::text,true);
 select * into f from mx_ops.files where id=p_id and scope_id=p_scope for update;perform mx_ops.rule(f.run_id is not null,'Source not found');perform mx_ops.require_permission(p_scope,'files.'||f.family);
 perform mx_ops.rule(f.created_by=p_actor,'Only the uploading staff member can finalise this source');perform mx_ops.rule(f.sha256=p_hash and f.size_bytes=p_bytes,'Uploaded bytes do not match the source record');
 update mx_ops.files set status='verified',verified_at=now() where id=p_id returning * into f;
 return to_jsonb(f);
end $$;
revoke all on function public.mx_ops_file_finalize(uuid,uuid,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.mx_ops_file_finalize(uuid,uuid,uuid,text,bigint) to service_role;
revoke all on function public.mx_ops_list(uuid,text,uuid,integer,uuid),public.mx_ops_detail(uuid,text,uuid),public.mx_ops_dashboard(uuid,timestamptz,timestamptz),public.mx_ops_search(uuid,text),public.mx_ops_files(uuid,uuid),public.mx_ops_documents(uuid) from public,anon;
grant execute on function public.mx_ops_list(uuid,text,uuid,integer,uuid),public.mx_ops_detail(uuid,text,uuid),public.mx_ops_dashboard(uuid,timestamptz,timestamptz),public.mx_ops_search(uuid,text),public.mx_ops_files(uuid,uuid),public.mx_ops_documents(uuid) to authenticated;
-- Configure the private bucket only in Supabase. Test fixtures do not emulate its HTTP service.
do $$ begin if to_regclass('storage.buckets') is not null then
 insert into storage.buckets(id,name,public,file_size_limit) values('mineralx-ops-evidence','mineralx-ops-evidence',false,10485760);
 execute $policy$create policy mx_ops_object_read on storage.objects for select to authenticated using(bucket_id='mineralx-ops-evidence' and exists(select 1 from mx_ops.files f where f.object_path=name and mx_ops.can(f.scope_id,'files.'||f.family)))$policy$;
 execute $policy$create policy mx_ops_object_insert on storage.objects for insert to authenticated with check(bucket_id='mineralx-ops-evidence' and exists(select 1 from mx_ops.files f where f.object_path=name and f.created_by=auth.uid() and f.status='staged' and mx_ops.can(f.scope_id,'files.'||f.family)))$policy$;
 end if;end $$;
insert into mx_ops.schema_version(version) values(4);
commit;
