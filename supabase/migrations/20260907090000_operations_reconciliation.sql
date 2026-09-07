-- Reconcile late branch hardening after the deployed acceptance migration.
-- Preserve both checkpoint histories without introducing two version-5 migrations.
begin;

create or replace function public.mx_ops_file_finalize(p_actor uuid,p_scope uuid,p_id uuid,p_hash text,p_bytes bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare f mx_ops.files;begin
 perform set_config('request.jwt.claim.sub',p_actor::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'aal','aal1')::text,true);
 select * into f from mx_ops.files where id=p_id and scope_id=p_scope for update;perform mx_ops.rule(f.id is not null,'Source not found');perform mx_ops.require_permission(p_scope,'files.'||f.family);
 perform mx_ops.rule(f.created_by=p_actor,'Only the uploading staff member can finalise this source');perform mx_ops.rule(f.sha256=p_hash and f.size_bytes=p_bytes,'Uploaded bytes do not match the source record');
 if f.status='verified' then return to_jsonb(f);end if;
 perform mx_ops.rule(f.status='staged','Rejected source must be uploaded as a new verified revision');
 update mx_ops.files set status='verified',verified_at=now() where id=p_id returning * into f;
 insert into mx_ops.audit(scope_id,entity_id,actor_id,request_id,action,version,permission,reason,snapshot) values(p_scope,p_id,p_actor,gen_random_uuid(),'file.verified',1,'files.'||f.family,'Original bytes verified',to_jsonb(f));
 update mx_ops.scopes set revision=revision+1 where id=p_scope;
 return to_jsonb(f);
end $$;

create or replace function mx_ops.gold_command(p_scope uuid,p_action text,p_id uuid,p_expected integer,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare l mx_ops.gold_lots;w mx_ops.weights;a mx_ops.product_assays;c mx_ops.custody;t mx_ops.transfers;prod mx_ops.production;
 v_id uuid;other uuid;v_time timestamptz;net numeric;gross numeric;tare numeric;percent numeric;value numeric;item jsonb;rec jsonb;
begin
 perform mx_ops.rule(exists(select 1 from mx_ops.scopes where id=p_scope and kind='facility'),'Select a processing facility');
 if p_action='cleanup.record' then
  perform mx_ops.check_version(0,p_expected);v_time:=mx_ops.at_time(p,'produced_at');
  insert into mx_ops.gold_lots(id,scope_id,reference,form,origin,produced_at,campaign_id,notes,owner_reference,created_by)
   values(p_id,p_scope,mx_ops.required_text(p,'reference',80),mx_ops.required_text(p,'form',24),'cleanup',v_time,nullif(p->>'campaign_id','')::uuid,coalesce(p->>'notes',''),coalesce(p->>'owner_reference',''),auth.uid()) returning * into l;
  perform mx_ops.rule(jsonb_typeof(p->'run_ids')='array' and jsonb_array_length(p->'run_ids') between 1 and 128,'Link the actual processing runs for this clean-up');
  for item in select * from jsonb_array_elements(p->'run_ids') loop
   v_id:=(item#>>'{}')::uuid;
   perform mx_ops.rule(exists(select 1 from mx_ops.runs r where r.id=v_id and r.scope_id=p_scope and r.status<>'void' and r.started_at is not null and r.started_at<=v_time and (l.campaign_id is null or r.campaign_id=l.campaign_id)),'A linked run is outside the clean-up facility/campaign or follows the clean-up');
   insert into mx_ops.lot_runs(scope_id,lot_id,run_id) values(p_scope,p_id,v_id);
  end loop;
  insert into mx_ops.custody(lot_id,scope_id) values(p_id,p_scope);
  return to_jsonb(l);
 end if;
 if p_action in('weight.record','assay.stage') then
  select * into l from mx_ops.gold_lots where id=(p->>'lot_id')::uuid and scope_id=p_scope for update;
  perform mx_ops.rule(l.id is not null,'Gold lot not found');perform mx_ops.check_version(l.version,p_expected);
  if p_action='weight.record' then
   perform mx_ops.rule(p->>'basis' in('net','gross_tare'),'Specify net weight or gross and tare');
   if p->>'basis'='gross_tare' then gross:=mx_ops.quantity(p,'gross_g');tare:=mx_ops.quantity(p,'tare_g');net:=gross-tare;else net:=mx_ops.quantity(p,'net_g');end if;
   insert into mx_ops.weights(id,scope_id,lot_id,gross_g,tare_g,net_g,basis,instrument,resolution_g,observed_at,source_file_id,created_by)
    values(p_id,p_scope,l.id,gross,tare,net,p->>'basis',mx_ops.required_text(p,'instrument',160),mx_ops.quantity(p,'resolution_g'),mx_ops.at_time(p,'observed_at'),nullif(p->>'source_file_id','')::uuid,auth.uid()) returning * into w;
   rec:=mx_ops.exact_record(to_jsonb(w));
  else
   perform mx_ops.check_evidence(p_scope,(p->>'source_file_id')::uuid,'gold');
   value:=mx_ops.quantity(p,'reported_value');percent:=case p->>'unit' when '%' then value when 'g/kg' then value/10 when 'g/t' then value/10000 end;
   perform mx_ops.rule(percent between 0 and 100,'Result units or fineness are invalid');
   perform mx_ops.rule(trim(p->>'raw_result') ~ '^[<>=]?[[:space:]]*[0-9]+(\.[0-9]+)?[[:space:]]*(%|g/kg|g/t)?$','Preserve the source numeric result and qualifier; unsupported reported text requires review');
   perform mx_ops.rule((regexp_replace(trim(p->>'raw_result'),'^[<>=]?[[:space:]]*([0-9]+(\.[0-9]+)?).*$', '\1'))::numeric=value and coalesce(nullif(substring(trim(p->>'raw_result') from '^([<>=])'),''),'=')=coalesce(p->>'qualifier','='),'Reported text, numeric value and qualifier do not agree');
   perform mx_ops.rule(substring(trim(p->>'raw_result') from '(%|g/kg|g/t)$') is null or substring(trim(p->>'raw_result') from '(%|g/kg|g/t)$')=p->>'unit','Reported result units do not agree with the selected source unit');
   insert into mx_ops.product_assays(id,scope_id,lot_id,laboratory,certificate,certificate_revision,raw_result,unit,qualifier,reported_value,au_percent,method,source_file_id,created_by)
    values(p_id,p_scope,l.id,mx_ops.required_text(p,'laboratory',160),mx_ops.required_text(p,'certificate',160),mx_ops.required_text(p,'certificate_revision',32),mx_ops.required_text(p,'raw_result',80),p->>'unit',coalesce(p->>'qualifier','='),value,case when coalesce(p->>'qualifier','=')='=' then percent end,mx_ops.required_text(p,'method',160),(p->>'source_file_id')::uuid,auth.uid()) returning * into a;rec:=mx_ops.exact_record(to_jsonb(a));
  end if;
  update mx_ops.gold_lots set version=version+1,updated_at=now() where id=l.id;return rec||jsonb_build_object('lot_version',l.version+1,'version',l.version+1);
 end if;
 select * into l from mx_ops.gold_lots where id=p_id and scope_id=p_scope for update;
 if p_action in('gold.review','gold.hold','gold.recognize','gold.receive','gold.transfer') then
  perform mx_ops.rule(l.id is not null,'Gold lot not found');perform mx_ops.check_version(l.version,p_expected);
  select * into c from mx_ops.custody where lot_id=l.id;
 end if;
 if p_action='gold.review' then
  perform mx_ops.rule(not exists(select 1 from mx_ops.production x join mx_ops.periods b on b.scope_id=x.scope_id and x.recognized_at>=b.starts_at and x.recognized_at<b.ends_at where x.lot_id=l.id and b.status='closed'),'The accepted basis belongs to a closed account; reopen before reviewing an amendment');
  select * into w from mx_ops.weights where id=(p->>'weight_id')::uuid and lot_id=l.id;
  select * into a from mx_ops.product_assays where id=(p->>'assay_id')::uuid and lot_id=l.id;
  perform mx_ops.rule(w.id is not null and a.id is not null and a.au_percent is not null and a.qualifier='=','Select a measured weight and an exact, source-supported product assay');
  perform mx_ops.rule(w.created_by<>auth.uid() and a.created_by<>auth.uid(),'Independent review is required; the recorder cannot approve their own measurement or assay');
  perform mx_ops.check_evidence(p_scope,w.source_file_id,'gold');perform mx_ops.check_evidence(p_scope,a.source_file_id,'gold');
  perform mx_ops.required_text(p,'reason',500);
  update mx_ops.product_assays set status='superseded' where lot_id=l.id and status='accepted' and id<>a.id;
  update mx_ops.product_assays set status='accepted',reviewed_by=auth.uid(),review_reason=p->>'reason' where id=a.id;
  update mx_ops.gold_lots set active_weight_id=w.id,active_assay_id=a.id,review_state='verified',version=version+1,updated_at=now() where id=l.id returning * into l;
  return to_jsonb(l);
 elsif p_action='gold.hold' then
  perform mx_ops.required_text(p,'reason',500);update mx_ops.gold_lots set review_state='held',version=version+1,updated_at=now() where id=l.id returning * into l;return to_jsonb(l);
 elsif p_action='gold.recognize' then
  perform mx_ops.rule(exists(select 1 from mx_ops.scopes where id=p_scope and policy->>'recognition_confirmed'='true'),'The facility production recognition point must be explicitly confirmed in settings');
  perform mx_ops.rule(l.review_state='verified' and l.origin<>'external_receipt','Only verified production output may be recognised');
  perform mx_ops.rule(l.form=(select policy->>'recognition_form' from mx_ops.scopes where id=p_scope),'The lot form does not match this facility''s approved production-recognition point');
  perform mx_ops.rule(not exists(select 1 from mx_ops.periods b where b.scope_id=p_scope and b.status='closed' and l.produced_at>=b.starts_at and l.produced_at<b.ends_at),'This output belongs to a closed account; reopen with authority before amending production');
  perform mx_ops.rule(not exists(with recursive relatives(id) as(select parent_id from mx_ops.lineage where child_id=l.id union select x.parent_id from mx_ops.lineage x join relatives r on x.child_id=r.id) select 1 from relatives r join mx_ops.production p on p.lot_id=r.id),'This material was already recognised before transformation; do not count it twice');
  perform mx_ops.rule(not exists(with recursive relatives(id) as(select child_id from mx_ops.lineage where parent_id=l.id union select x.child_id from mx_ops.lineage x join relatives r on x.parent_id=r.id) select 1 from relatives r join mx_ops.production p on p.lot_id=r.id),'A descendant output has already been recognised; do not count its parent again');
  select * into w from mx_ops.weights where id=l.active_weight_id;select * into a from mx_ops.product_assays where id=l.active_assay_id;
  select * into prod from mx_ops.production where lot_id=l.id;
  if prod.lot_id is not null then perform mx_ops.required_text(p,'reason',500);end if;
  insert into mx_ops.production(lot_id,scope_id,recognized_at,weight_id,assay_id,fine_au_g,net_g,recognized_by) values(l.id,p_scope,l.produced_at,w.id,a.id,w.net_g*a.au_percent/100,w.net_g,auth.uid())
   on conflict(lot_id) do update set weight_id=excluded.weight_id,assay_id=excluded.assay_id,fine_au_g=excluded.fine_au_g,net_g=excluded.net_g,version=mx_ops.production.version+1,recognized_by=auth.uid(),recorded_at=now() returning * into prod;
  update mx_ops.gold_lots set version=version+1,updated_at=now() where id=l.id;return mx_ops.exact_record(to_jsonb(prod))||jsonb_build_object('id',l.id,'version',l.version+1);
 elsif p_action='gold.receive' then
  perform mx_ops.rule(c.status in('unassigned','external'),'An in-transit lot must be received through its transfer');
  perform mx_ops.check_evidence(p_scope,(p->>'source_file_id')::uuid,'custody');
  update mx_ops.custody set holder_id=auth.uid(),location=mx_ops.required_text(p,'location',200),status='held' where lot_id=l.id;
  update mx_ops.gold_lots set version=version+1,updated_at=now() where id=l.id;return jsonb_build_object('id',l.id,'version',l.version+1,'status','held','location',p->>'location','holder_id',auth.uid());
 elsif p_action='gold.transfer' then
  perform mx_ops.rule(c.status='held' and c.holder_id=auth.uid(),'Only the recorded custodian can initiate this handover');
  other:=nullif(p->>'to_holder','')::uuid;
  if other is not null then
   perform mx_ops.rule(other<>auth.uid() and exists(select 1 from mx_ops.members m where m.scope_id=p_scope and m.user_id=other and m.revoked_at is null and (m.expires_at is null or m.expires_at>now()) and 'custodian'=any(m.profiles)),'Select another authorised recipient');
  else perform mx_ops.required_text(p,'external_recipient',160);end if;
  v_id:=(p->>'transfer_id')::uuid;
  insert into mx_ops.transfers(id,scope_id,lot_id,from_holder,to_holder,destination,external_recipient,reference,seal,shipped_at,weight_id,assay_id)
  values(v_id,p_scope,l.id,auth.uid(),other,mx_ops.required_text(p,'destination',200),p->>'external_recipient',mx_ops.required_text(p,'reference',160),mx_ops.required_text(p,'seal',160),mx_ops.at_time(p,'shipped_at'),l.active_weight_id,l.active_assay_id) returning * into t;
  update mx_ops.custody set status='in_transit' where lot_id=l.id;update mx_ops.gold_lots set version=version+1,updated_at=now() where id=l.id;return to_jsonb(t)||jsonb_build_object('lot_version',l.version+1);
 elsif p_action in('transfer.receive','transfer.exception') then
  select * into t from mx_ops.transfers where id=p_id and scope_id=p_scope for update;perform mx_ops.rule(t.id is not null,'Transfer not found');perform mx_ops.check_version(t.version,p_expected);
  perform mx_ops.rule(t.status in('sent','exception') and t.from_holder<>auth.uid() and (t.to_holder is null or t.to_holder=auth.uid()),'Only the named recipient or an independent custody officer may acknowledge this handover');
  perform mx_ops.check_evidence(p_scope,(p->>'receipt_file_id')::uuid,'custody');
  if p_action='transfer.receive' then
   v_time:=mx_ops.at_time(p,'received_at');perform mx_ops.rule(v_time>=t.shipped_at,'Receipt cannot precede shipment');
   update mx_ops.transfers set status='received',received_at=v_time,received_by=auth.uid(),receipt_file_id=(p->>'receipt_file_id')::uuid,version=version+1,notes=coalesce(p->>'notes','') where id=t.id returning * into t;
   update mx_ops.custody set status=case when t.to_holder is null then 'external' else 'held' end,holder_id=t.to_holder,location=t.destination where lot_id=t.lot_id;
  else
   perform mx_ops.required_text(p,'reason',500);update mx_ops.transfers set status='exception',received_by=auth.uid(),receipt_file_id=(p->>'receipt_file_id')::uuid,version=version+1,notes=p->>'reason' where id=t.id returning * into t;
  end if;
  update mx_ops.gold_lots set version=version+1,updated_at=now() where id=t.lot_id;return to_jsonb(t);
 end if;
 raise exception 'RULE: Unknown gold command';
end $$;

create or replace function public.mx_ops_dashboard(p_scope uuid,p_from timestamptz,p_to timestamptz) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb:='{}';begin
 perform mx_ops.rule(p_to>p_from and p_to-p_from<=interval '10 years','Choose a valid reporting period');
 perform mx_ops.rule(mx_ops.can(p_scope,'work.read') or mx_ops.can(p_scope,'report.read'),'Access denied');
 if mx_ops.can(p_scope,'plant.read') then
  result:=result||jsonb_build_object('processing',(select jsonb_build_object('runs',count(distinct r.id),'dry_t',sum(f.dry_t)::text,'wet_t',sum(case when f.basis='wet' then f.quantity_t end)::text,'basis_incomplete',count(*) filter(where f.run_id is not null and f.dry_t is null),'submitted',count(distinct r.id) filter(where r.status='submitted'),'drafts',count(distinct r.id) filter(where r.status in('draft','returned'))) from mx_ops.runs r left join mx_ops.run_feeds f on f.run_id=r.id and f.scope_id=r.scope_id where r.scope_id=p_scope and r.status<>'void' and coalesce(r.ended_at,r.started_at,r.created_at)>=p_from and coalesce(r.ended_at,r.started_at,r.created_at)<p_to));
 end if;
 if mx_ops.can(p_scope,'gold.read') then
  result:=result||jsonb_build_object('gold',(select jsonb_build_object('confirmed_fine_au_g',sum(g.fine_au_g)::text,'confirmed_lots',count(*)) from mx_ops.production g join mx_ops.gold_lots l on l.id=g.lot_id where g.scope_id=p_scope and recognized_at>=p_from and recognized_at<p_to and l.review_state='verified' and l.active_weight_id=g.weight_id and l.active_assay_id=g.assay_id),
   'pending',(select jsonb_build_object('lots',count(*),'measured_product_g',sum(w.net_g)::text,'unweighed',count(*) filter(where w.id is null)) from mx_ops.gold_lots l left join mx_ops.weights w on w.id=(select x.id from mx_ops.weights x where x.lot_id=l.id order by created_at desc,id desc limit 1) where l.scope_id=p_scope and l.origin='cleanup' and l.produced_at>=p_from and l.produced_at<p_to and not exists(select 1 from mx_ops.production g where g.lot_id=l.id)),
   'trend',coalesce((select jsonb_agg(to_jsonb(t) order by day) from (select date_trunc('day',recognized_at at time zone (select timezone from mx_ops.scopes where id=p_scope))::date as day,sum(g.fine_au_g)::text as fine_au_g from mx_ops.production g join mx_ops.gold_lots l on l.id=g.lot_id where g.scope_id=p_scope and recognized_at>=p_from and recognized_at<p_to and l.review_state='verified' and l.active_weight_id=g.weight_id and l.active_assay_id=g.assay_id group by 1)t),'[]'::jsonb),
   'holdings',(select jsonb_build_object('verified_fine_au_g',sum(case when l.review_state='verified' then w.net_g*a.au_percent/100 end)::text,'product_g',sum(w.net_g)::text,'lots',count(*),'unverified_lots',count(*) filter(where l.review_state<>'verified')) from mx_ops.custody c join mx_ops.gold_lots l on l.id=c.lot_id left join mx_ops.weights w on w.id=l.active_weight_id left join mx_ops.product_assays a on a.id=l.active_assay_id where c.scope_id=p_scope and c.status='held'));
 end if;
 if mx_ops.can(p_scope,'geo.read') then result:=result||jsonb_build_object('geology',jsonb_build_object('samples',(select count(*) from mx_ops.geo_samples where scope_id=p_scope and data->>'archivedAt' is null),'holes',(select count(*) from mx_ops.geo_collars where scope_id=p_scope and data->>'archivedAt' is null),'receiptExceptions',(select count(*) from mx_ops.geo_dispatches where scope_id=p_scope and data->>'status'='receipt-exception'),'stagedCertificates',(select count(*) from mx_ops.geo_certificates where scope_id=p_scope and data->>'status'='pending')));end if;
 result:=result||jsonb_build_object('asOf',now(),'revision',(select revision from mx_ops.scopes where id=p_scope),'from',p_from,'to',p_to,'productionBasisIssues',(select count(*) from mx_ops.production g join mx_ops.gold_lots l on l.id=g.lot_id where g.scope_id=p_scope and g.recognized_at>=p_from and g.recognized_at<p_to and mx_ops.can(p_scope,'gold.read') and (l.review_state<>'verified' or l.active_weight_id<>g.weight_id or l.active_assay_id<>g.assay_id)),'recovery',null,'recoveryNote','Not established: requires a reviewed representative circuit balance.','openActions',(select count(*) from mx_ops.work_items where scope_id=p_scope and status='open' and mx_ops.can(p_scope,'work.read')));
 return result;
end $$;

update mx_ops.command_permissions set permission='gold.capture' where action='assay.stage';
insert into mx_ops.schema_version(version) values(6);
commit;
