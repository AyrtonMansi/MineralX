begin;
create table mx_ops.feed_lots (
 id uuid primary key, scope_id uuid not null references mx_ops.scopes(id), version integer not null default 1,
 reference text not null check(length(reference) between 1 and 80),source_project_id uuid references mx_ops.scopes(id),owner_reference text not null default '',
 quantity_t numeric(20,6),mass_basis text check(mass_basis in('wet','dry')),moisture_percent numeric(9,6),
 source_file_id uuid,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 check(quantity_t>=0 and moisture_percent>=0 and moisture_percent<100),unique(scope_id,reference),unique(scope_id,id),
 foreign key(scope_id,source_file_id) references mx_ops.files(scope_id,id)
);
create table mx_ops.campaigns (
 id uuid primary key,scope_id uuid not null references mx_ops.scopes(id),version integer not null default 1,
 name text not null check(length(trim(name)) between 1 and 128),status text not null default 'open' check(status in('open','closed')),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),unique(scope_id,id)
);
create table mx_ops.runs (
 id uuid primary key,scope_id uuid not null references mx_ops.scopes(id),version integer not null default 1,
 reference text not null,campaign_id uuid,started_at timestamptz,ended_at timestamptz,downtime_minutes numeric(12,6) not null default 0,
 status text not null default 'draft' check(status in('draft','submitted','reviewed','returned','void')),
 notes text not null default '',created_by uuid not null references auth.users(id),reviewed_by uuid references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(ended_at>=started_at and downtime_minutes>=0),unique(scope_id,reference),unique(scope_id,id),foreign key(scope_id,campaign_id) references mx_ops.campaigns(scope_id,id)
);
create table mx_ops.run_feeds (
 scope_id uuid not null,run_id uuid not null,feed_lot_id uuid not null,quantity_t numeric(20,6) not null check(quantity_t>=0),
 basis text not null check(basis in('dry','wet')),moisture_percent numeric(9,6) check(moisture_percent>=0 and moisture_percent<100),
 dry_t numeric(20,6) generated always as(case when basis='dry' then quantity_t when moisture_percent is not null then quantity_t*(1-moisture_percent/100) end) stored,
 primary key(run_id,feed_lot_id),foreign key(scope_id,run_id) references mx_ops.runs(scope_id,id),foreign key(scope_id,feed_lot_id) references mx_ops.feed_lots(scope_id,id)
);
create table mx_ops.gold_lots (
 id uuid primary key,scope_id uuid not null references mx_ops.scopes(id),version integer not null default 1,
 reference text not null,form text not null check(form in('concentrate','recovered_metal','dore','residue')),
 origin text not null check(origin in('cleanup','transformation','external_receipt')),produced_at timestamptz not null,campaign_id uuid,
 review_state text not null default 'unverified' check(review_state in('unverified','verified','held')),
 active_weight_id uuid,active_assay_id uuid,notes text not null default '',owner_reference text not null default '',
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(scope_id,reference),unique(scope_id,id),foreign key(scope_id,campaign_id) references mx_ops.campaigns(scope_id,id)
);
create table mx_ops.lot_runs (
 scope_id uuid not null,lot_id uuid not null,run_id uuid not null,primary key(lot_id,run_id),
 foreign key(scope_id,lot_id) references mx_ops.gold_lots(scope_id,id),foreign key(scope_id,run_id) references mx_ops.runs(scope_id,id)
);
create table mx_ops.weights (
 id uuid primary key,scope_id uuid not null,lot_id uuid not null,gross_g numeric(20,6),tare_g numeric(20,6),net_g numeric(20,6) not null,
 basis text not null check(basis in('net','gross_tare')),instrument text not null,resolution_g numeric(12,6) not null,
 observed_at timestamptz not null,source_file_id uuid,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 check(net_g>=0 and resolution_g>0 and (basis='net' and gross_g is null and tare_g is null or basis='gross_tare' and gross_g>=tare_g and tare_g>=0 and net_g=gross_g-tare_g)),
 unique(scope_id,id),unique(lot_id,id),foreign key(scope_id,lot_id) references mx_ops.gold_lots(scope_id,id),foreign key(scope_id,source_file_id) references mx_ops.files(scope_id,id)
);
create table mx_ops.product_assays (
 id uuid primary key,scope_id uuid not null,lot_id uuid not null,laboratory text not null,certificate text not null,certificate_revision text not null,
 raw_result text not null,unit text not null check(unit in('%','g/kg','g/t')),qualifier text not null default '=' check(qualifier in('=','<','>')),
 reported_value numeric(20,6) not null,au_percent numeric(12,8),method text not null,source_file_id uuid not null,
 status text not null default 'staged' check(status in('staged','held','accepted','superseded')),review_reason text not null default '',
 created_by uuid not null references auth.users(id),reviewed_by uuid references auth.users(id),created_at timestamptz not null default now(),
 check(reported_value>=0 and au_percent>=0 and au_percent<=100),unique(lot_id,laboratory,certificate,certificate_revision),unique(scope_id,id),unique(lot_id,id),
 foreign key(scope_id,lot_id) references mx_ops.gold_lots(scope_id,id),foreign key(scope_id,source_file_id) references mx_ops.files(scope_id,id)
);
alter table mx_ops.gold_lots add foreign key(id,active_weight_id) references mx_ops.weights(lot_id,id),add foreign key(id,active_assay_id) references mx_ops.product_assays(lot_id,id);
create table mx_ops.custody (
 lot_id uuid primary key,scope_id uuid not null,holder_id uuid references auth.users(id),location text,
 status text not null default 'unassigned' check(status in('unassigned','held','in_transit','external','consumed')),
 foreign key(scope_id,lot_id) references mx_ops.gold_lots(scope_id,id)
);
create table mx_ops.transfers (
 id uuid primary key,scope_id uuid not null,lot_id uuid not null,version integer not null default 1,
 from_holder uuid not null references auth.users(id),to_holder uuid references auth.users(id),destination text not null,external_recipient text,
 reference text not null,seal text not null,shipped_at timestamptz not null,received_at timestamptz,received_by uuid references auth.users(id),receipt_file_id uuid,
 status text not null default 'sent' check(status in('sent','received','exception')),weight_id uuid,assay_id uuid,notes text not null default '',
 unique(scope_id,id),foreign key(scope_id,lot_id) references mx_ops.gold_lots(scope_id,id),foreign key(scope_id,receipt_file_id) references mx_ops.files(scope_id,id),
 foreign key(lot_id,weight_id) references mx_ops.weights(lot_id,id),foreign key(lot_id,assay_id) references mx_ops.product_assays(lot_id,id)
);
create unique index one_pending_transfer_per_lot on mx_ops.transfers(lot_id) where status in('sent','exception');
create table mx_ops.transformations (id uuid primary key,scope_id uuid not null references mx_ops.scopes(id),observed_at timestamptz not null,reason text not null,source_file_id uuid not null,created_by uuid not null references auth.users(id),foreign key(scope_id,source_file_id) references mx_ops.files(scope_id,id));
create table mx_ops.lineage (transformation_id uuid not null references mx_ops.transformations(id),scope_id uuid not null,parent_id uuid not null,child_id uuid not null,primary key(parent_id,child_id),check(parent_id<>child_id),foreign key(scope_id,parent_id) references mx_ops.gold_lots(scope_id,id),foreign key(scope_id,child_id) references mx_ops.gold_lots(scope_id,id));
create table mx_ops.production (
 lot_id uuid primary key,scope_id uuid not null,version integer not null default 1,recognized_at timestamptz not null,
 weight_id uuid not null,assay_id uuid not null,fine_au_g numeric(24,8) not null,net_g numeric(20,6) not null,
 recognized_by uuid not null references auth.users(id),recorded_at timestamptz not null default now(),
 foreign key(scope_id,lot_id) references mx_ops.gold_lots(scope_id,id),foreign key(lot_id,weight_id) references mx_ops.weights(lot_id,id),foreign key(lot_id,assay_id) references mx_ops.product_assays(lot_id,id)
);
create table mx_ops.allocations (
 id uuid primary key,scope_id uuid not null,lot_id uuid not null,version integer not null default 1,
 basis text not null,interests jsonb not null,source_file_id uuid not null,created_by uuid not null references auth.users(id),approved_by uuid references auth.users(id),
 foreign key(scope_id,lot_id) references mx_ops.gold_lots(scope_id,id),foreign key(scope_id,source_file_id) references mx_ops.files(scope_id,id)
);
create table mx_ops.periods (
 id uuid primary key,scope_id uuid not null references mx_ops.scopes(id),version integer not null default 1,
 name text not null,kind text not null check(kind in('circuit','custody')),starts_at timestamptz not null,ends_at timestamptz not null,unit text not null check(unit in('fine_au_g','product_g')),
 status text not null default 'open' check(status in('open','prepared','reviewed','closed')),prepared_by uuid references auth.users(id),reviewed_by uuid references auth.users(id),closed_by uuid references auth.users(id),
 tolerance_g numeric(20,6) check(tolerance_g>=0),tolerance_basis text not null default '',difference_g numeric(24,8),exception_reason text not null default '',
 snapshot jsonb,source_revision bigint,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 check(ends_at>starts_at),unique(scope_id,id)
);
create table mx_ops.balance_lines (
 id uuid primary key,scope_id uuid not null,period_id uuid not null,kind text not null check(kind in('opening','input','output','closing')),
 label text not null,amount_g numeric(24,8) not null check(amount_g>=0),observed_at timestamptz not null,method text not null,source_file_id uuid not null,
 lot_id uuid,created_by uuid not null references auth.users(id),
 foreign key(scope_id,period_id) references mx_ops.periods(scope_id,id),foreign key(scope_id,source_file_id) references mx_ops.files(scope_id,id),foreign key(scope_id,lot_id) references mx_ops.gold_lots(scope_id,id)
);
create table mx_ops.period_history (period_id uuid not null references mx_ops.periods(id),scope_id uuid not null references mx_ops.scopes(id),version integer not null,snapshot jsonb not null,closed_at timestamptz not null,closed_by uuid not null references auth.users(id),primary key(period_id,version));
create index ops_runs_date on mx_ops.runs(scope_id,ended_at,id);
create index ops_lots_date on mx_ops.gold_lots(scope_id,produced_at,id);
create index ops_periods_date on mx_ops.periods(scope_id,starts_at,ends_at);

create function mx_ops.exact_record(p jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare k text;begin
 foreach k in array array['refinery_net_g','refinery_au_percent','payable_amount','quantity_t','moisture_percent','dry_t','downtime_minutes','gross_g','tare_g','net_g','resolution_g','reported_value','au_percent','fine_au_g','tolerance_g','difference_g','amount_g'] loop
 if p->k is not null and p->k<>'null'::jsonb then p:=jsonb_set(p,array[k],to_jsonb(p->>k));end if;end loop;return p;end $$;
create function mx_ops.plant_command(p_scope uuid,p_action text,p_id uuid,p_expected integer,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare f mx_ops.feed_lots;c mx_ops.campaigns;r mx_ops.runs;item jsonb;q numeric;start_time timestamptz;end_time timestamptz;begin
 perform mx_ops.rule(exists(select 1 from mx_ops.scopes where id=p_scope and kind='facility'),'Select a processing facility');
 if p_action='feed.create' then
  perform mx_ops.check_version(0,p_expected);
  if p->>'source_project_id' is not null then perform mx_ops.rule(exists(select 1 from mx_ops.scopes a join mx_ops.scopes b on a.org_id=b.org_id where a.id=(p->>'source_project_id')::uuid and a.kind='project' and b.id=p_scope and mx_ops.can(a.id,'geo.read')),'The source project is not accessible');end if;
  insert into mx_ops.feed_lots(id,scope_id,reference,source_project_id,owner_reference,quantity_t,mass_basis,moisture_percent,source_file_id,created_by)
   values(p_id,p_scope,mx_ops.required_text(p,'reference',80),nullif(p->>'source_project_id','')::uuid,coalesce(p->>'owner_reference',''),mx_ops.quantity(p,'quantity_t',false),p->>'mass_basis',mx_ops.quantity(p,'moisture_percent',false,99.999999),nullif(p->>'source_file_id','')::uuid,auth.uid()) returning * into f;return mx_ops.exact_record(to_jsonb(f));
 elsif p_action='campaign.create' then
  perform mx_ops.check_version(0,p_expected);insert into mx_ops.campaigns(id,scope_id,name,created_by) values(p_id,p_scope,mx_ops.required_text(p,'name',128),auth.uid()) returning * into c;return to_jsonb(c);
 elsif p_action='run.save' then
  select * into r from mx_ops.runs where id=p_id and scope_id=p_scope for update;perform mx_ops.check_version(coalesce(r.version,0),p_expected);
  perform mx_ops.rule(r.id is null or r.status in('draft','returned'),'Reviewed/submitted runs require return with an amendment reason before editing');
  perform mx_ops.rule(r.id is null or r.created_by=auth.uid() or mx_ops.can(p_scope,'plant.review'),'Only the author or supervisor may edit this draft');
  start_time:=mx_ops.at_time(p,'started_at',false);end_time:=mx_ops.at_time(p,'ended_at',false);
  perform mx_ops.rule(end_time is null or start_time is not null and end_time>=start_time,'End time must follow start time');
  perform mx_ops.rule(length(coalesce(p->>'notes',''))<=4000,'Notes are too long');
  q:=coalesce(mx_ops.quantity(p,'downtime_minutes',false),0);
  perform mx_ops.rule(end_time is null or q<=extract(epoch from end_time-start_time)/60,'Downtime exceeds run duration');
  if r.id is null then
   insert into mx_ops.runs(id,scope_id,reference,campaign_id,started_at,ended_at,downtime_minutes,notes,created_by)
   values(p_id,p_scope,'RUN-'||upper(substr(p_id::text,1,8)),nullif(p->>'campaign_id','')::uuid,start_time,end_time,q,coalesce(p->>'notes',''),auth.uid()) returning * into r;
  else update mx_ops.runs set campaign_id=nullif(p->>'campaign_id','')::uuid,started_at=start_time,ended_at=end_time,downtime_minutes=q,notes=coalesce(p->>'notes',''),version=version+1,updated_at=now(),status='draft' where id=p_id returning * into r;end if;
  delete from mx_ops.run_feeds where run_id=p_id;
  perform mx_ops.rule(jsonb_typeof(coalesce(p->'feeds','[]'::jsonb))='array' and jsonb_array_length(coalesce(p->'feeds','[]'::jsonb))<=32,'Choose up to 32 feed lots');
  for item in select * from jsonb_array_elements(coalesce(p->'feeds','[]'::jsonb)) loop
   insert into mx_ops.run_feeds(scope_id,run_id,feed_lot_id,quantity_t,basis,moisture_percent) values(p_scope,p_id,(item->>'feed_lot_id')::uuid,mx_ops.quantity(item,'quantity_t'),mx_ops.required_text(item,'basis',3),mx_ops.quantity(item,'moisture_percent',false,99.999999));
  end loop;
  return mx_ops.exact_record(to_jsonb(r));
 elsif p_action in('run.submit','run.review','run.return','run.void') then
  select * into r from mx_ops.runs where id=p_id and scope_id=p_scope for update;perform mx_ops.rule(r.id is not null,'Run not found');perform mx_ops.check_version(r.version,p_expected);
  if p_action='run.submit' then
   perform mx_ops.rule(r.status in('draft','returned') and (r.created_by=auth.uid() or mx_ops.can(p_scope,'plant.review')),'This run cannot be submitted by this account');
   perform mx_ops.rule(r.started_at is not null and r.ended_at is not null and exists(select 1 from mx_ops.run_feeds where run_id=p_id),'Complete run times and measured feed before submitting');
  elsif p_action='run.review' then perform mx_ops.rule(r.status='submitted' and r.created_by<>auth.uid(),'An independent supervisor must review a submitted run');
  elsif p_action='run.return' then perform mx_ops.required_text(p,'reason',500);perform mx_ops.rule(r.status in('submitted','reviewed'),'Only submitted/reviewed runs may be returned');
  else perform mx_ops.required_text(p,'reason',500);perform mx_ops.rule(not exists(select 1 from mx_ops.lot_runs where run_id=p_id),'This run has linked physical output; record an amendment instead of voiding it');end if;
  perform mx_ops.rule(not exists(select 1 from mx_ops.periods b where b.scope_id=p_scope and b.status='closed' and r.ended_at>=b.starts_at and r.ended_at<b.ends_at),'This run belongs to a closed account; an authorised period amendment is required');
  update mx_ops.runs set status=case p_action when 'run.submit' then 'submitted' when 'run.review' then 'reviewed' when 'run.return' then 'returned' else 'void' end,version=version+1,reviewed_by=case when p_action='run.review' then auth.uid() else null end,updated_at=now() where id=p_id returning * into r;return mx_ops.exact_record(to_jsonb(r));
 end if;
 raise exception 'RULE: Unknown plant command';
end $$;

create function mx_ops.gold_command(p_scope uuid,p_action text,p_id uuid,p_expected integer,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
   perform mx_ops.rule((substring(trim(p->>'raw_result') from '[0-9]+(\.[0-9]+)?')) is not null,'Invalid reported result');
   perform mx_ops.rule((regexp_replace(trim(p->>'raw_result'),'^[<>=]?[[:space:]]*([0-9]+(\.[0-9]+)?).*$', '\1'))::numeric=value and coalesce(nullif(substring(trim(p->>'raw_result') from '^([<>=])'),''),'=')=coalesce(p->>'qualifier','='),'Reported text, numeric value and qualifier do not agree');
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
alter table mx_ops.scopes add ledger_revision bigint not null default 0;
alter table mx_ops.periods add boundary_description text not null default '';
create table mx_ops.settlements (
 id uuid primary key,scope_id uuid not null,lot_id uuid not null,version integer not null default 1,
 reference text not null,counterparty text not null,refinery_net_g numeric(20,6),refinery_au_percent numeric(12,8),
 payable_amount numeric(20,6),currency text check(currency ~ '^[A-Z]{3}$'),source_file_id uuid not null,
 status text not null default 'recorded' check(status in('recorded','reviewed')),notes text not null default '',
 created_by uuid not null references auth.users(id),reviewed_by uuid references auth.users(id),created_at timestamptz not null default now(),
 check(refinery_net_g>=0 and refinery_au_percent between 0 and 100 and payable_amount>=0),
 foreign key(scope_id,lot_id) references mx_ops.gold_lots(scope_id,id),foreign key(scope_id,source_file_id) references mx_ops.files(scope_id,id)
);
create function mx_ops.transform_command(p_scope uuid,p_id uuid,p_expected integer,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb;l mx_ops.gold_lots;child mx_ops.gold_lots;w mx_ops.weights;input_mass numeric:=0;output_mass numeric:=0;inputs uuid[]:=array[]::uuid[];children uuid[]:=array[]::uuid[];v_time timestamptz;
begin
 perform mx_ops.check_version(0,p_expected);perform mx_ops.required_text(p,'reason',500);perform mx_ops.check_evidence(p_scope,(p->>'source_file_id')::uuid,'gold');
 perform mx_ops.rule(jsonb_typeof(p->'inputs')='array' and jsonb_array_length(p->'inputs') between 1 and 32 and jsonb_typeof(p->'outputs')='array' and jsonb_array_length(p->'outputs') between 1 and 32,'Record every transformation input/output, including weighed residue');
 v_time:=mx_ops.at_time(p,'observed_at');
 for item in select * from jsonb_array_elements(p->'inputs') loop
  select * into l from mx_ops.gold_lots where id=(item->>'lot_id')::uuid and scope_id=p_scope for update;
  perform mx_ops.rule(l.id is not null and not(l.id=any(inputs)),'Invalid or duplicate transformation input');perform mx_ops.check_version(l.version,(item->>'version')::integer);
  perform mx_ops.rule(exists(select 1 from mx_ops.custody where lot_id=l.id and holder_id=auth.uid() and status='held'),'All input lots must be held by the acting custodian');
  select * into w from mx_ops.weights where id=l.active_weight_id;perform mx_ops.rule(w.id is not null and l.review_state='verified','Each transformation input needs a reviewed mass');
  input_mass:=input_mass+w.net_g;inputs:=array_append(inputs,l.id);
 end loop;
 insert into mx_ops.transformations(id,scope_id,observed_at,reason,source_file_id,created_by) values(p_id,p_scope,v_time,p->>'reason',(p->>'source_file_id')::uuid,auth.uid());
 for item in select * from jsonb_array_elements(p->'outputs') loop
  insert into mx_ops.gold_lots(id,scope_id,reference,form,origin,produced_at,created_by,notes) values((item->>'id')::uuid,p_scope,mx_ops.required_text(item,'reference',80),mx_ops.required_text(item,'form',24),'transformation',v_time,auth.uid(),coalesce(item->>'notes','')) returning * into child;
  output_mass:=output_mass+mx_ops.quantity(item,'net_g');children:=array_append(children,child.id);
  insert into mx_ops.weights(id,scope_id,lot_id,net_g,basis,instrument,resolution_g,observed_at,source_file_id,created_by) values(gen_random_uuid(),p_scope,child.id,mx_ops.quantity(item,'net_g'),'net',mx_ops.required_text(item,'instrument',160),mx_ops.quantity(item,'resolution_g'),v_time,(p->>'source_file_id')::uuid,auth.uid());
  insert into mx_ops.custody(lot_id,scope_id,holder_id,location,status) values(child.id,p_scope,auth.uid(),mx_ops.required_text(p,'location',200),'held');
  insert into mx_ops.lineage(transformation_id,scope_id,parent_id,child_id) select p_id,p_scope,id,child.id from unnest(inputs) id;
 end loop;
 perform mx_ops.rule(input_mass=output_mass,'Input mass does not equal output plus separately weighed residue. Do not hide the difference as a loss adjustment');
 update mx_ops.custody set status='consumed' where lot_id=any(inputs);update mx_ops.gold_lots set version=version+1,updated_at=now() where id=any(inputs);
 return jsonb_build_object('id',p_id,'version',1,'inputs',inputs,'outputs',children,'input_g',input_mass::text,'output_g',output_mass::text);
end $$;
create function mx_ops.balance_command(p_scope uuid,p_action text,p_id uuid,p_expected integer,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b mx_ops.periods;item jsonb;diff numeric;rev bigint;n integer;v_snapshot jsonb;begin
 if p_action='period.create' then
  perform mx_ops.check_version(0,p_expected);
  perform mx_ops.rule((p->>'starts_at') ~ '(Z|[+-][0-9]{2}:[0-9]{2})$' and (p->>'ends_at') ~ '(Z|[+-][0-9]{2}:[0-9]{2})$','Period boundaries require an explicit timezone');
  insert into mx_ops.periods(id,scope_id,name,kind,starts_at,ends_at,unit,created_by,boundary_description)
   values(p_id,p_scope,mx_ops.required_text(p,'name',128),p->>'kind',(p->>'starts_at')::timestamptz,(p->>'ends_at')::timestamptz,p->>'unit',auth.uid(),mx_ops.required_text(p,'boundary_description',1000)) returning * into b;
  return to_jsonb(b);
 end if;
 select * into b from mx_ops.periods where id=p_id and scope_id=p_scope for update;perform mx_ops.rule(b.id is not null,'Reconciliation period not found');perform mx_ops.check_version(b.version,p_expected);
 select ledger_revision into rev from mx_ops.scopes where id=p_scope;
 if p_action='period.prepare' then
  perform mx_ops.rule(b.status='open','Reopen an approved/closed period before changing its measurements');
  perform mx_ops.rule(jsonb_typeof(p->'lines')='array' and jsonb_array_length(p->'lines') between 4 and 128,'Enter separately evidenced opening, input, output and closing measurements');
  delete from mx_ops.balance_lines where period_id=b.id;
  for item in select * from jsonb_array_elements(p->'lines') loop
   perform mx_ops.check_evidence(p_scope,(item->>'source_file_id')::uuid,'gold');
   insert into mx_ops.balance_lines(id,scope_id,period_id,kind,label,amount_g,observed_at,method,source_file_id,lot_id,created_by)
    values(gen_random_uuid(),p_scope,b.id,item->>'kind',mx_ops.required_text(item,'label',160),mx_ops.quantity(item,'amount_g'),mx_ops.at_time(item,'observed_at'),mx_ops.required_text(item,'method',240),(item->>'source_file_id')::uuid,nullif(item->>'lot_id','')::uuid,auth.uid());
  end loop;
  select count(distinct kind),sum(case when kind in('opening','input') then amount_g else -amount_g end) into n,diff from mx_ops.balance_lines where period_id=b.id;
  perform mx_ops.rule(n=4,'All four balance categories require observations. Explicit measured zero is allowed; missing is not zero');
  perform mx_ops.rule(not exists(select 1 from mx_ops.transfers where scope_id=p_scope and status='exception' and shipped_at<b.ends_at),'Resolve custody exceptions before preparing the balance');
  update mx_ops.periods set tolerance_g=mx_ops.quantity(p,'tolerance_g'),tolerance_basis=mx_ops.required_text(p,'tolerance_basis',1000),exception_reason=coalesce(p->>'exception_reason',''),difference_g=diff,status='prepared',prepared_by=auth.uid(),reviewed_by=null,closed_by=null,version=version+1,source_revision=rev where id=b.id returning * into b;
 elsif p_action='period.review' then
  perform mx_ops.rule(b.status='prepared' and b.prepared_by<>auth.uid(),'An independent reviewer must review the prepared account');
  if b.source_revision<>rev then raise exception 'CONFLICT: ledger changed after preparation';end if;
  perform mx_ops.rule(abs(b.difference_g)<=b.tolerance_g or length(trim(b.exception_reason))>=10,'Document the investigation of the out-of-tolerance difference before review');
  perform mx_ops.required_text(p,'reason',1000);
  update mx_ops.periods set status='reviewed',reviewed_by=auth.uid(),version=version+1 where id=b.id returning * into b;
 elsif p_action='period.close' then
  perform mx_ops.rule(b.status='reviewed' and b.reviewed_by=auth.uid() and b.prepared_by<>auth.uid(),'Only the independent reviewer may close this reviewed account');
  if b.source_revision<>rev then raise exception 'CONFLICT: ledger changed after review';end if;
  perform mx_ops.rule(b.ends_at<=now(),'An accounting period cannot close before it ends');
  perform mx_ops.rule(not exists(select 1 from mx_ops.periods x where x.scope_id=p_scope and x.kind=b.kind and x.status='closed' and x.id<>b.id and x.starts_at<b.ends_at and x.ends_at>b.starts_at),'This period overlaps an already closed account');
  perform mx_ops.rule(not exists(select 1 from mx_ops.gold_lots l where l.scope_id=p_scope and l.origin='cleanup' and l.produced_at>=b.starts_at and l.produced_at<b.ends_at and l.review_state<>'verified'),'Unverified output remains in this period');
  v_snapshot:=jsonb_build_object('calculation_version','metal-balance-v1','prepared_revision',rev,'period',mx_ops.exact_record(to_jsonb(b)),'lines',(select jsonb_agg(mx_ops.exact_record(to_jsonb(x))) from mx_ops.balance_lines x where x.period_id=b.id),'production',coalesce((select jsonb_agg(mx_ops.exact_record(to_jsonb(x))) from mx_ops.production x where x.scope_id=p_scope and x.recognized_at>=b.starts_at and x.recognized_at<b.ends_at),'[]'::jsonb),'closed_at',now());
  update mx_ops.periods set status='closed',closed_by=auth.uid(),version=version+1,snapshot=v_snapshot where id=b.id returning * into b;
  insert into mx_ops.period_history(period_id,scope_id,version,snapshot,closed_at,closed_by) values(b.id,p_scope,b.version,v_snapshot,now(),auth.uid());
 elsif p_action='period.reopen' then
  perform mx_ops.rule(b.status in('prepared','reviewed','closed'),'This account is already open');perform mx_ops.required_text(p,'reason',1000);
  update mx_ops.periods set status='open',version=version+1,prepared_by=null,reviewed_by=null,closed_by=null,source_revision=null where id=b.id returning * into b;
 else raise exception 'RULE: Unknown reconciliation command';end if;
 return mx_ops.exact_record(to_jsonb(b));
end $$;
create function mx_ops.commercial_command(p_scope uuid,p_action text,p_id uuid,p_expected integer,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a mx_ops.allocations;s mx_ops.settlements;item jsonb;total numeric:=0;begin
 if p_action='allocation.record' then
  perform mx_ops.check_version(0,p_expected);perform mx_ops.check_evidence(p_scope,(p->>'source_file_id')::uuid,'gold');
  perform mx_ops.rule(jsonb_typeof(p->'interests')='array' and jsonb_array_length(p->'interests') between 1 and 32,'Record the documented ownership/allocation interests');
  for item in select * from jsonb_array_elements(p->'interests') loop perform mx_ops.required_text(item,'owner_reference',160);total:=total+mx_ops.quantity(item,'percent',true,100);end loop;
  perform mx_ops.rule(total=100,'Allocation interests must sum to 100%; they do not alter measured metal');
  insert into mx_ops.allocations(id,scope_id,lot_id,basis,interests,source_file_id,created_by) values(p_id,p_scope,(p->>'lot_id')::uuid,mx_ops.required_text(p,'basis',1000),p->'interests',(p->>'source_file_id')::uuid,auth.uid()) returning * into a;return to_jsonb(a);
 elsif p_action='allocation.review' then
  select * into a from mx_ops.allocations where id=p_id and scope_id=p_scope for update;perform mx_ops.rule(a.id is not null and a.created_by<>auth.uid(),'An independent reviewer is required');perform mx_ops.check_version(a.version,p_expected);perform mx_ops.required_text(p,'reason',500);
  update mx_ops.allocations set approved_by=auth.uid(),version=version+1 where id=a.id returning * into a;return to_jsonb(a);
 elsif p_action='settlement.record' then
  perform mx_ops.check_version(0,p_expected);perform mx_ops.check_evidence(p_scope,(p->>'source_file_id')::uuid,'gold');
  insert into mx_ops.settlements(id,scope_id,lot_id,reference,counterparty,refinery_net_g,refinery_au_percent,payable_amount,currency,source_file_id,notes,created_by)
   values(p_id,p_scope,(p->>'lot_id')::uuid,mx_ops.required_text(p,'reference',160),mx_ops.required_text(p,'counterparty',160),mx_ops.quantity(p,'refinery_net_g',false),mx_ops.quantity(p,'refinery_au_percent',false,100),mx_ops.quantity(p,'payable_amount',false),p->>'currency',(p->>'source_file_id')::uuid,coalesce(p->>'notes',''),auth.uid()) returning * into s;return mx_ops.exact_record(to_jsonb(s));
 elsif p_action='settlement.review' then
  select * into s from mx_ops.settlements where id=p_id and scope_id=p_scope for update;perform mx_ops.rule(s.id is not null and s.created_by<>auth.uid(),'An independent reviewer is required');perform mx_ops.check_version(s.version,p_expected);perform mx_ops.required_text(p,'reason',500);
  update mx_ops.settlements set reviewed_by=auth.uid(),status='reviewed',version=version+1 where id=s.id returning * into s;return mx_ops.exact_record(to_jsonb(s));
 end if;raise exception 'RULE: Unknown commercial command';
end $$;
create function mx_ops.core_command(p_scope uuid,p_action text,p_id uuid,p_expected integer,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare w mx_ops.work_items;f mx_ops.files;d mx_ops.documents;begin
 if p_action in('work.save','work.resolve') then
  select * into w from mx_ops.work_items where id=p_id for update;perform mx_ops.rule(w.id is null or w.scope_id=p_scope,'Action is outside this workspace');perform mx_ops.check_version(coalesce(w.version,0),p_expected);
  if p->>'assigned_to' is not null and p->>'assigned_to'<>'' then perform mx_ops.rule(exists(select 1 from mx_ops.members where scope_id=p_scope and user_id=(p->>'assigned_to')::uuid and revoked_at is null and (expires_at is null or expires_at>now())),'Choose an active workspace member');end if;
  if p_action='work.resolve' then perform mx_ops.rule(w.id is not null,'Action not found');perform mx_ops.required_text(p,'reason',1000);update mx_ops.work_items set status='resolved',version=version+1,notes=notes||E'\nResolution: '||(p->>'reason'),updated_at=now() where id=w.id returning * into w;
  else
   insert into mx_ops.work_items(id,scope_id,title,entity_type,entity_id,assigned_to,due_at,notes,created_by)
   values(p_id,p_scope,mx_ops.required_text(p,'title',240),p->>'entity_type',nullif(p->>'entity_id','')::uuid,nullif(p->>'assigned_to','')::uuid,nullif(p->>'due_at','')::timestamptz,coalesce(p->>'notes',''),auth.uid())
   on conflict(id) do update set title=excluded.title,assigned_to=excluded.assigned_to,due_at=excluded.due_at,notes=excluded.notes,version=mx_ops.work_items.version+1,updated_at=now() returning * into w;
  end if;return to_jsonb(w);
 elsif p_action='file.prepare' then
  perform mx_ops.check_version(0,p_expected);perform mx_ops.require_permission(p_scope,'files.'||(p->>'family'));
  perform mx_ops.rule((p->>'name') !~ '[/\\\x00-\x1f]' and (p->>'media_type') in('application/pdf','image/jpeg','image/png','image/webp','text/csv','text/plain','application/json','application/geo+json','application/vnd.google-earth.kml+xml','application/vnd.google-earth.kmz','application/octet-stream'),'Unsupported file name or type');
  insert into mx_ops.files(id,scope_id,family,name,media_type,size_bytes,sha256,object_path,created_by) values(p_id,p_scope,p->>'family',mx_ops.required_text(p,'name',240),p->>'media_type',(p->>'size_bytes')::bigint,p->>'sha256',p_scope::text||'/'||p_id::text,auth.uid()) returning * into f;return to_jsonb(f)||jsonb_build_object('version',1);
 elsif p_action='document.publish' then
  perform mx_ops.check_version(0,p_expected);
  select * into f from mx_ops.files where id=(p->>'file_id')::uuid and scope_id=p_scope;perform mx_ops.rule(f.status='verified' and mx_ops.can(p_scope,'files.'||f.family),'An accessible verified file is required');
  insert into mx_ops.documents(id,scope_id,title,file_id,category,supersedes,created_by) values(p_id,p_scope,mx_ops.required_text(p,'title',240),f.id,p->>'category',nullif(p->>'supersedes','')::uuid,auth.uid()) returning * into d;return to_jsonb(d);
 end if;raise exception 'RULE: Unknown core command';
end $$;

create table mx_ops.command_permissions(action text primary key,permission text not null,read_permission text not null,mfa boolean not null default false,family text not null,affects_ledger boolean not null default false);
insert into mx_ops.command_permissions values
 ('feed.create','plant.capture','plant.read',false,'plant',true),('campaign.create','plant.capture','plant.read',false,'plant',false),
 ('run.save','plant.capture','plant.read',false,'plant',true),('run.submit','plant.capture','plant.read',false,'plant',true),('run.review','plant.review','plant.read',false,'plant',true),('run.return','plant.review','plant.read',false,'plant',true),('run.void','plant.review','plant.read',false,'plant',true),
 ('cleanup.record','gold.capture','gold.read',false,'gold',true),('weight.record','gold.capture','gold.read',false,'gold',true),('assay.stage','gold.review','gold.read',false,'gold',true),
 ('gold.review','gold.review','gold.read',true,'gold',true),('gold.hold','gold.review','gold.read',true,'gold',true),('gold.recognize','gold.review','gold.read',true,'gold',true),
 ('gold.receive','gold.custody','gold.custody.read',true,'gold',true),('gold.transfer','gold.custody','gold.custody.read',true,'gold',true),('transfer.receive','gold.custody','gold.custody.read',true,'gold',true),('transfer.exception','gold.custody','gold.custody.read',true,'gold',true),
 ('transformation.record','gold.custody','gold.custody.read',true,'transformation',true),
 ('period.create','balance.prepare','balance.read',false,'balance',false),('period.prepare','balance.prepare','balance.read',false,'balance',false),('period.review','balance.close','balance.read',true,'balance',false),('period.close','balance.close','balance.read',true,'balance',false),('period.reopen','balance.close','balance.read',true,'balance',false),
 ('allocation.record','commercial.write','commercial.read',false,'commercial',false),('allocation.review','commercial.write','commercial.read',true,'commercial',false),('settlement.record','commercial.write','commercial.read',false,'commercial',false),('settlement.review','commercial.write','commercial.read',true,'commercial',false),
 ('work.save','work.write','work.read',false,'core',false),('work.resolve','work.write','work.read',false,'core',false),('file.prepare','work.write','work.read',false,'core',false),('document.publish','work.write','work.read',false,'core',false);
insert into mx_ops.profile_permissions values('accountant','commercial.write'),('accountant','commercial.read'),('manager','commercial.read'),('auditor','commercial.read');

create function public.mx_ops_command(p_scope uuid,p_request uuid,p_action text,p_id uuid,p_expected integer,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare rule mx_ops.command_permissions;receipt mx_ops.receipts;intent jsonb;result jsonb;revision bigint;begin
 select * into rule from mx_ops.command_permissions where action=p_action;perform mx_ops.rule(rule.action is not null,'Unknown operation');
 perform mx_ops.require_permission(p_scope,rule.permission,rule.mfa);
 perform mx_ops.rule(p_request is not null and p_id is not null and p_expected>=0 and jsonb_typeof(p_payload)='object' and octet_length(p_payload::text)<=1500000,'Invalid command body');
 -- A scoped lock orders edits and receipts. No network work occurs while it is held.
 perform 1 from mx_ops.scopes where id=p_scope for update;
 intent:=jsonb_build_object('action',p_action,'id',p_id,'expected',p_expected,'payload',p_payload);
 select * into receipt from mx_ops.receipts where scope_id=p_scope and request_id=p_request;
 if found then
  if receipt.actor_id<>auth.uid() or receipt.intent<>intent then raise exception 'IDEMPOTENCY_MISMATCH';end if;
  return receipt.response||jsonb_build_object('replayed',true);
 end if;
 case rule.family
 when 'plant' then result:=mx_ops.plant_command(p_scope,p_action,p_id,p_expected,p_payload);
 when 'gold' then result:=mx_ops.gold_command(p_scope,p_action,p_id,p_expected,p_payload);
 when 'balance' then result:=mx_ops.balance_command(p_scope,p_action,p_id,p_expected,p_payload);
 when 'transformation' then result:=mx_ops.transform_command(p_scope,p_id,p_expected,p_payload);
 when 'commercial' then result:=mx_ops.commercial_command(p_scope,p_action,p_id,p_expected,p_payload);
 when 'geo' then result:=mx_ops.geo_command(p_scope,p_action,p_id,p_expected,p_payload);
 else result:=mx_ops.core_command(p_scope,p_action,p_id,p_expected,p_payload);end case;
 update mx_ops.scopes set revision=mx_ops.scopes.revision+1,ledger_revision=ledger_revision+case when rule.affects_ledger then 1 else 0 end where id=p_scope returning mx_ops.scopes.revision into revision;
 insert into mx_ops.audit(scope_id,entity_id,actor_id,request_id,action,version,permission,reason,snapshot) values(p_scope,p_id,auth.uid(),p_request,p_action,coalesce((result->>'version')::integer,1),rule.read_permission,left(coalesce(p_payload->>'reason',''),1000),result);
 result:=jsonb_build_object('id',p_id,'version',coalesce((result->>'version')::integer,1),'revision',revision,'action',p_action,'record',result);
 insert into mx_ops.receipts(scope_id,request_id,actor_id,intent,response) values(p_scope,p_request,auth.uid(),intent,result);return result;
end $$;
alter table mx_ops.feed_lots enable row level security;
create policy scoped_read on mx_ops.feed_lots for select to authenticated using (mx_ops.can(scope_id,'plant.read'));
grant select on mx_ops.feed_lots to authenticated;
alter table mx_ops.campaigns enable row level security;
create policy scoped_read on mx_ops.campaigns for select to authenticated using (mx_ops.can(scope_id,'plant.read'));
grant select on mx_ops.campaigns to authenticated;
alter table mx_ops.runs enable row level security;
create policy scoped_read on mx_ops.runs for select to authenticated using (mx_ops.can(scope_id,'plant.read'));
grant select on mx_ops.runs to authenticated;
alter table mx_ops.run_feeds enable row level security;
create policy scoped_read on mx_ops.run_feeds for select to authenticated using (mx_ops.can(scope_id,'plant.read'));
grant select on mx_ops.run_feeds to authenticated;
alter table mx_ops.gold_lots enable row level security;
create policy scoped_read on mx_ops.gold_lots for select to authenticated using (mx_ops.can(scope_id,'gold.read'));
grant select on mx_ops.gold_lots to authenticated;
alter table mx_ops.lot_runs enable row level security;
create policy scoped_read on mx_ops.lot_runs for select to authenticated using (mx_ops.can(scope_id,'gold.read'));
grant select on mx_ops.lot_runs to authenticated;
alter table mx_ops.weights enable row level security;
create policy scoped_read on mx_ops.weights for select to authenticated using (mx_ops.can(scope_id,'gold.read'));
grant select on mx_ops.weights to authenticated;
alter table mx_ops.product_assays enable row level security;
create policy scoped_read on mx_ops.product_assays for select to authenticated using (mx_ops.can(scope_id,'gold.read'));
grant select on mx_ops.product_assays to authenticated;
alter table mx_ops.custody enable row level security;
create policy scoped_read on mx_ops.custody for select to authenticated using (mx_ops.can(scope_id,'gold.custody.read'));
grant select on mx_ops.custody to authenticated;
alter table mx_ops.transfers enable row level security;
create policy scoped_read on mx_ops.transfers for select to authenticated using (mx_ops.can(scope_id,'gold.custody.read'));
grant select on mx_ops.transfers to authenticated;
alter table mx_ops.transformations enable row level security;
create policy scoped_read on mx_ops.transformations for select to authenticated using (mx_ops.can(scope_id,'gold.read'));
grant select on mx_ops.transformations to authenticated;
alter table mx_ops.lineage enable row level security;
create policy scoped_read on mx_ops.lineage for select to authenticated using (mx_ops.can(scope_id,'gold.read'));
grant select on mx_ops.lineage to authenticated;
alter table mx_ops.production enable row level security;
create policy scoped_read on mx_ops.production for select to authenticated using (mx_ops.can(scope_id,'gold.read'));
grant select on mx_ops.production to authenticated;
alter table mx_ops.allocations enable row level security;
create policy scoped_read on mx_ops.allocations for select to authenticated using (mx_ops.can(scope_id,'commercial.read'));
grant select on mx_ops.allocations to authenticated;
alter table mx_ops.settlements enable row level security;
create policy scoped_read on mx_ops.settlements for select to authenticated using (mx_ops.can(scope_id,'commercial.read'));
grant select on mx_ops.settlements to authenticated;
alter table mx_ops.periods enable row level security;
create policy scoped_read on mx_ops.periods for select to authenticated using (mx_ops.can(scope_id,'balance.read'));
grant select on mx_ops.periods to authenticated;
alter table mx_ops.balance_lines enable row level security;
create policy scoped_read on mx_ops.balance_lines for select to authenticated using (mx_ops.can(scope_id,'balance.read'));
grant select on mx_ops.balance_lines to authenticated;
alter table mx_ops.period_history enable row level security;
create policy scoped_read on mx_ops.period_history for select to authenticated using (mx_ops.can(scope_id,'balance.read'));
grant select on mx_ops.period_history to authenticated;
alter table mx_ops.command_permissions enable row level security;
revoke all on all functions in schema mx_ops from public,anon,authenticated;
grant execute on function mx_ops.can(uuid,text),mx_ops.is_admin(uuid) to authenticated;
revoke all on function public.mx_ops_command(uuid,uuid,text,uuid,integer,jsonb) from public,anon;
grant execute on function public.mx_ops_command(uuid,uuid,text,uuid,integer,jsonb) to authenticated;
insert into mx_ops.schema_version(version) values(2);
commit;
