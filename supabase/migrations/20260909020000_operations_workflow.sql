-- Additive workflow layer; canonical programs reuse geo_programs IDs, not a copied register.
-- Apply only after inspecting production migration ledger. Never changes auth accounts.
begin;
create table mx_ops.program_types (
 key text primary key, label text not null, domain text not null, method text,
 ordinal integer not null, enabled boolean not null default true
);
insert into mx_ops.program_types(key,label,domain,method,ordinal) values
 ('drilling','Drill campaign','geology','rc',1),('sampling','Surface sampling','geology','rock_chip',2),
 ('mapping','Geological mapping','geology',null,3),('drone','Drone survey','geology',null,4),
 ('geophysics','Geophysics','geology',null,5),('testwork','Metallurgical testwork','plant',null,6),
 ('processing','Processing campaign','plant',null,7),('plant','Plant improvement','plant',null,8),
 ('maintenance','Maintenance / shutdown','plant',null,9),('energy','Energy / solar','plant',null,10),
 ('civil','Civil / site works','general',null,11),('environment','Environmental work','general',null,12),
 ('compliance','Compliance / tenement','general',null,13),('general','General project','general',null,14);
create table mx_ops.planning_people (
 id uuid primary key,scope_id uuid not null references mx_ops.scopes(id),version integer not null default 1,
 name text not null check(length(trim(name)) between 1 and 128),role text not null default '',
 user_id uuid references auth.users(id),active boolean not null default true,
 created_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),unique(scope_id,id)
);
create unique index planning_member_identity on mx_ops.planning_people(scope_id,user_id) where user_id is not null;
create table mx_ops.plant_assets (
 id uuid primary key,scope_id uuid not null references mx_ops.scopes(id),version integer not null default 1,
 code text not null check(length(trim(code)) between 1 and 48),name text not null check(length(trim(name)) between 1 and 128),
 kind text not null check(kind in('equipment','tank','generator','solar','battery','meter','vehicle','rig')),
 state text not null default 'proposed' check(state in('proposed','installed','operating','standby','out_of_service','retired')),
 parent_id uuid,location text not null default '',model text not null default '',serial text not null default '',
 capacity numeric(18,6) check(capacity>=0),capacity_unit text check(capacity_unit in('L','kW','kWh','t/h')),
 service_due date,notes text not null default '' check(length(notes)<=4000),source_file_id uuid,
 created_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),
 unique(scope_id,id),unique(scope_id,code),foreign key(scope_id,parent_id) references mx_ops.plant_assets(scope_id,id),
 foreign key(scope_id,source_file_id) references mx_ops.files(scope_id,id)
);
alter table mx_ops.work_items drop constraint work_items_status_check;
alter table mx_ops.work_items add constraint work_items_status_check check(status in('open','ready','in_progress','blocked','on_hold','resolved','cancelled'));
alter table mx_ops.work_items add column program_id uuid,add column parent_id uuid,
 add column kind text not null default 'task' check(kind in('task','package','milestone','maintenance','handover','issue')),
 add column priority text not null default 'normal' check(priority in('low','normal','high','urgent')),
 add column start_on date,add column due_on date,add column responsible_id uuid,
 add column contributors uuid[] not null default '{}',add column asset_id uuid,
 add column source_file_id uuid,add column outcome text not null default '' check(length(outcome)<=4000),
 add column completed_by uuid references auth.users(id),add column verified_by uuid references auth.users(id),add column verified_at timestamptz;
alter table mx_ops.work_items add constraint work_scoped_identity unique(scope_id,id),
 add constraint work_program_scope foreign key(scope_id,program_id) references mx_ops.geo_programs(scope_id,id),
 add constraint work_parent_scope foreign key(scope_id,parent_id) references mx_ops.work_items(scope_id,id),
 add constraint work_person_scope foreign key(scope_id,responsible_id) references mx_ops.planning_people(scope_id,id),
 add constraint work_asset_scope foreign key(scope_id,asset_id) references mx_ops.plant_assets(scope_id,id),
 add constraint work_evidence_scope foreign key(scope_id,source_file_id) references mx_ops.files(scope_id,id),
 add constraint work_dates check(start_on is null or due_on is null or start_on<=due_on);
create index work_program on mx_ops.work_items(scope_id,program_id,status);
create table mx_ops.task_dependencies (
 scope_id uuid not null,task_id uuid not null,predecessor_scope uuid not null,predecessor_id uuid not null,
 primary key(task_id,predecessor_id),check(task_id<>predecessor_id),
 foreign key(scope_id,task_id) references mx_ops.work_items(scope_id,id),
 foreign key(predecessor_scope,predecessor_id) references mx_ops.work_items(scope_id,id)
);
create table mx_ops.fuel_events (
 id uuid primary key,scope_id uuid not null references mx_ops.scopes(id),version integer not null default 1,
 kind text not null check(kind in('opening','delivery','issue','transfer','dip')),
 tank_id uuid not null,other_tank_id uuid,asset_id uuid,litres numeric(18,6) not null check(litres>=0),
 occurred_at timestamptz not null,reference text not null check(length(trim(reference)) between 1 and 240),
 source_file_id uuid,notes text not null default '',void_reason text,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 foreign key(scope_id,tank_id) references mx_ops.plant_assets(scope_id,id),foreign key(scope_id,other_tank_id) references mx_ops.plant_assets(scope_id,id),
 foreign key(scope_id,asset_id) references mx_ops.plant_assets(scope_id,id),foreign key(scope_id,source_file_id) references mx_ops.files(scope_id,id),
 check((kind='transfer' and other_tank_id is not null and other_tank_id<>tank_id) or (kind<>'transfer' and other_tank_id is null)),check(asset_id is null or kind='issue')
);
create index fuel_period on mx_ops.fuel_events(scope_id,occurred_at);
create unique index fuel_reference on mx_ops.fuel_events(scope_id,lower(reference)) where void_reason is null;
create table mx_ops.energy_readings (
 id uuid primary key,scope_id uuid not null references mx_ops.scopes(id),version integer not null default 1,
 asset_id uuid not null,kind text not null check(kind in('diesel_generation','solar_generation','grid_import','load','generator_hours','battery_soc')),
 started_at timestamptz not null,ended_at timestamptz not null,amount numeric(18,6) not null check(amount>=0),
 unit text not null check(unit in('kWh','h','%')),method text not null check(length(trim(method)) between 1 and 240),
 source_file_id uuid,notes text not null default '',void_reason text,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 check(ended_at>=started_at),check(kind<>'battery_soc' or (amount<=100 and unit='%')),
 foreign key(scope_id,asset_id) references mx_ops.plant_assets(scope_id,id),foreign key(scope_id,source_file_id) references mx_ops.files(scope_id,id)
);
create index energy_period on mx_ops.energy_readings(scope_id,started_at,ended_at);
create table mx_ops.engineering_revisions (
 id uuid primary key,scope_id uuid not null references mx_ops.scopes(id),version integer not null default 1,
 title text not null,reference text not null,state text not null check(state in('concept','review','approved','implementing','commissioned','as_built','superseded')),
 program_id uuid,source_file_id uuid,supersedes uuid,notes text not null default '',
 created_by uuid not null references auth.users(id),reviewed_by uuid references auth.users(id),updated_at timestamptz not null default now(),
 unique(scope_id,id),unique(scope_id,reference),foreign key(scope_id,program_id) references mx_ops.geo_programs(scope_id,id),
 foreign key(scope_id,source_file_id) references mx_ops.files(scope_id,id),foreign key(scope_id,supersedes) references mx_ops.engineering_revisions(scope_id,id)
);
create table mx_ops.program_costs (
 id uuid primary key,scope_id uuid not null references mx_ops.scopes(id),version integer not null default 1,
 program_id uuid not null,kind text not null check(kind in('estimate','commitment','actual')),amount numeric(18,6) not null check(amount>=0),
 currency text not null check(currency~'^[A-Z]{3}$'),reference text not null,source_file_id uuid,occurred_on date not null,
 void_reason text,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 foreign key(scope_id,program_id) references mx_ops.geo_programs(scope_id,id),foreign key(scope_id,source_file_id) references mx_ops.files(scope_id,id),unique(scope_id,reference,kind)
);
create table mx_ops.critical_spares (
 id uuid primary key,scope_id uuid not null references mx_ops.scopes(id),version integer not null default 1,
 code text not null,name text not null,asset_id uuid,location text not null default '',unit text not null default 'each',
 reorder_at numeric(18,6) not null default 0 check(reorder_at>=0),unique(scope_id,id),unique(scope_id,code),
 foreign key(scope_id,asset_id) references mx_ops.plant_assets(scope_id,id)
);
create table mx_ops.spare_movements (
 id uuid primary key,scope_id uuid not null,spare_id uuid not null,kind text not null check(kind in('opening','receipt','use','count')),
 quantity numeric(18,6) not null check(quantity>=0),task_id uuid,reference text not null,occurred_at timestamptz not null,
 version integer not null default 1,void_reason text,created_by uuid not null references auth.users(id),foreign key(scope_id,spare_id) references mx_ops.critical_spares(scope_id,id),foreign key(scope_id,task_id) references mx_ops.work_items(scope_id,id)
);
-- Existing processing campaign IDs become canonical programs. Legacy campaign rows are compatibility projections only.
insert into mx_ops.geo_programs(id,scope_id,version,data,updated_by)
 select c.id,c.scope_id,1,jsonb_build_object('recordId',c.id,'name',c.name,'type','processing','state','planned','method','rock_chip'),c.created_by
 from mx_ops.campaigns c where not exists(select 1 from mx_ops.geo_programs g where g.id=c.id);
create function mx_ops.campaign_program_bridge() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from mx_ops.geo_programs where id=new.id) then
  insert into mx_ops.geo_programs(id,scope_id,data,updated_by) values(new.id,new.scope_id,jsonb_build_object('recordId',new.id,'name',new.name,'type','processing','state','planned','method','rock_chip'),new.created_by);
 else
  perform mx_ops.rule(exists(select 1 from mx_ops.geo_programs where id=new.id and scope_id=new.scope_id and data->>'type'='processing'),'Campaign identity conflicts with an existing non-processing program');
 end if;return new;
end $$;
create trigger campaign_program after insert on mx_ops.campaigns for each row execute function mx_ops.campaign_program_bridge();
create function mx_ops.workflow_person(p_scope uuid,p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_id is null then return;end if;
 perform mx_ops.rule(exists(select 1 from mx_ops.planning_people p where p.id=p_id and p.scope_id=p_scope and p.active and
 (p.user_id is null or exists(select 1 from mx_ops.members m where m.scope_id=p_scope and m.user_id=p.user_id and m.revoked_at is null and (m.expires_at is null or m.expires_at>now())))), 'Choose an active person in this workspace. Planning assignments do not grant account access.');
end $$;
create function mx_ops.workflow_evidence(p_scope uuid,p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin if p_id is null then return;end if;
 perform mx_ops.rule(exists(select 1 from mx_ops.files f where f.id=p_id and f.scope_id=p_scope and f.status='verified' and mx_ops.can(p_scope,'files.'||f.family)),'Choose accessible verified source evidence in this workspace');end $$;
create function mx_ops.workflow_day(p jsonb,k text) returns date language plpgsql immutable set search_path='' as $$
declare v text;d date;begin v:=nullif(p->>k,'');if v is null then return null;end if;
 perform mx_ops.rule(v~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$','Use a calendar date for '||k);d:=v::date;perform mx_ops.rule(d between '2000-01-01'::date and '2100-12-31'::date,'Date outside planning range');return d;end $$;
-- All write routes, including the old work.resolve, enforce the same dependency/completion rules.
create function mx_ops.work_invariants() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform mx_ops.rule(new.parent_id is distinct from new.id,'A task cannot be its own work package');
 if tg_op='UPDATE' and new.program_id is not null and exists(select 1 from mx_ops.geo_programs where id=new.program_id and data->>'state' in('completed','cancelled')) then
  perform mx_ops.rule(new.status=old.status and new.title=old.title and new.notes=old.notes,'Reopen the program before changing its work');
 end if;
 if new.program_id is distinct from old.program_id and tg_op='UPDATE' then
  perform mx_ops.rule(not exists(select 1 from mx_ops.work_items where parent_id=new.id),'Reassign work-package children explicitly before moving the package');
 end if;
 if new.responsible_id is not null then perform mx_ops.workflow_person(new.scope_id,new.responsible_id);end if;
 if new.status in('ready','in_progress') then perform mx_ops.rule(new.responsible_id is not null or new.assigned_to is not null,'Assign a responsible person before making work ready');end if;
 if tg_op='UPDATE' and new.status='resolved' and old.status<>'resolved' then new.completed_by:=auth.uid();new.verified_by:=null;new.verified_at:=null;end if;
 if new.parent_id is not null then
  perform mx_ops.rule(exists(select 1 from mx_ops.work_items p where p.id=new.parent_id and p.scope_id=new.scope_id and p.kind='package' and p.program_id is not distinct from new.program_id and (p.status not in('resolved','cancelled') or tg_op='UPDATE' and new.status=old.status)),'Choose a work package in the same program');
  perform mx_ops.rule(not exists(with recursive ancestors as(select id,parent_id from mx_ops.work_items where id=new.parent_id union select w.id,w.parent_id from mx_ops.work_items w join ancestors a on w.id=a.parent_id)select 1 from ancestors where id=new.id),'Work package nesting cannot form a cycle');
 end if;
 if new.status in('in_progress','resolved') then
  perform mx_ops.rule(not exists(select 1 from mx_ops.task_dependencies d join mx_ops.work_items w on w.id=d.predecessor_id where d.task_id=new.id and (w.status<>'resolved' or w.kind='maintenance' and w.verified_at is null)),'Complete and verify predecessor work before starting or completing this task');
 end if;
 if new.status='resolved' then
  perform mx_ops.rule(not exists(select 1 from mx_ops.work_items w where w.parent_id=new.id and (w.status not in('resolved','cancelled') or w.kind='maintenance' and w.status='resolved' and w.verified_at is null)),'Complete the open work-package items first');
 end if;
 if tg_op='UPDATE' and old.status='resolved' and new.status<>'resolved' then
  perform mx_ops.rule(not exists(select 1 from mx_ops.task_dependencies d join mx_ops.work_items w on w.id=d.task_id where d.predecessor_id=new.id and w.status in('in_progress','resolved')),'Reopen dependent work before reopening its predecessor');
 end if;
 return new;
end $$;
create trigger work_invariants before insert or update on mx_ops.work_items for each row execute function mx_ops.work_invariants();
create function mx_ops.fuel_validate(p_scope uuid,p_tank uuid) returns void language plpgsql security definer set search_path='' as $$
declare cap numeric;ev record;balance numeric:=0;opened boolean:=false;begin
 select capacity into cap from mx_ops.plant_assets where scope_id=p_scope and id=p_tank and kind='tank';
 for ev in select * from mx_ops.fuel_events where scope_id=p_scope and void_reason is null and (tank_id=p_tank or other_tank_id=p_tank) order by occurred_at,case kind when 'opening' then 0 else 1 end,created_at,id loop
  if ev.kind='opening' then perform mx_ops.rule(not opened,'A tank can have only one opening balance');opened:=true;balance:=ev.litres;
  elsif ev.kind<>'dip' then
   perform mx_ops.rule(opened,'Record an opening balance before fuel movements');
   balance:=balance+case when ev.kind='delivery' or ev.kind='transfer' and ev.other_tank_id=p_tank then ev.litres else -ev.litres end;
  end if;
  perform mx_ops.rule(balance>=0,'This movement makes historical fuel stock negative');
  perform mx_ops.rule(cap is null or balance<=cap,'Recorded stock exceeds the tank capacity');
 end loop;
end $$;

create function mx_ops.program_invariants() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and old.data ? 'type' then
  perform mx_ops.rule(new.data ? 'type' and new.data ? 'state','Program metadata must not be replaced with a legacy-only record');
  if old.data->>'type'='processing' then perform mx_ops.rule(new.data->>'type'='processing','Keep the stable processing campaign type');end if;
 end if;
 if new.data->>'state'='completed' then
  perform mx_ops.rule(not exists(select 1 from mx_ops.work_items where program_id=new.id and (status not in('resolved','cancelled') or kind='maintenance' and status='resolved' and verified_at is null)),'Complete or cancel outstanding work before closing the program');
 end if;
 return new;
end $$;
create trigger program_invariants before update on mx_ops.geo_programs for each row execute function mx_ops.program_invariants();
create function mx_ops.spare_validate(p_spare uuid) returns void language plpgsql security definer set search_path='' as $$
declare ev record;balance numeric:=0;opened boolean:=false;begin
 for ev in select * from mx_ops.spare_movements where spare_id=p_spare and void_reason is null order by occurred_at,case kind when 'opening' then 0 else 1 end,id loop
  if ev.kind='opening' then perform mx_ops.rule(not opened,'Only one opening stock observation is allowed');opened:=true;balance:=ev.quantity;
  elsif ev.kind<>'count' then perform mx_ops.rule(opened,'Record opening stock before receipts and use');balance:=balance+case when ev.kind='use' then -ev.quantity else ev.quantity end;end if;
  perform mx_ops.rule(balance>=0,'This movement makes historical spare stock negative');
 end loop;
end $$;

alter function mx_ops.core_command(uuid,text,uuid,integer,jsonb) rename to core_command_v6;
create function mx_ops.core_command(p_scope uuid,p_action text,p_id uuid,p_expected integer,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare g mx_ops.geo_programs;w mx_ops.work_items;person mx_ops.planning_people;a mx_ops.plant_assets;f mx_ops.fuel_events;e mx_ops.energy_readings;
 er mx_ops.engineering_revisions;c mx_ops.program_costs;s mx_ops.critical_spares;r jsonb;v uuid;state text;pid uuid;owner uuid;dtype text;day1 date;day2 date;dep jsonb;
begin
 -- Serialise cross-scope dependency and completion decisions within one organisation.
 if p_action like 'task.%' or p_action like 'work.%' or p_action='program.save' then
  perform pg_advisory_xact_lock(hashtextextended((select org_id::text from mx_ops.scopes where id=p_scope),7007));
 end if;
 if p_action='program.save' then
  select * into g from mx_ops.geo_programs where id=p_id for update;perform mx_ops.rule(g.id is null or g.scope_id=p_scope,'Program is outside this workspace');perform mx_ops.check_version(coalesce(g.version,0),p_expected);
  dtype:=coalesce(nullif(p->>'type',''),g.data->>'type','general');perform mx_ops.rule(exists(select 1 from mx_ops.program_types where key=dtype and enabled),'Choose a supported program type');
  if dtype in('drilling','sampling','mapping','drone','geophysics') then perform mx_ops.rule(exists(select 1 from mx_ops.scopes where id=p_scope and kind='project'),'Create geological work in a project workspace');end if;
  if dtype='processing' then perform mx_ops.rule(exists(select 1 from mx_ops.scopes where id=p_scope and kind='facility'),'Create processing campaigns in a facility workspace');end if;
  state:=coalesce(nullif(p->>'state',''),'draft');perform mx_ops.rule(state in('draft','planned','ready','in_progress','blocked','on_hold','completed','cancelled'),'Choose a valid program state');
  owner:=nullif(p->>'ownerId','')::uuid;perform mx_ops.workflow_person(p_scope,owner);
  for v in select value::uuid from jsonb_array_elements_text(coalesce(p->'personnelIds','[]')) loop perform mx_ops.workflow_person(p_scope,v);end loop;
  day1:=mx_ops.workflow_day(p,'plannedStart');day2:=mx_ops.workflow_day(p,'plannedEnd');perform mx_ops.rule(day1 is null or day2 is null or day1<=day2,'Program end must not precede its start');
  if state in('ready','in_progress','completed') then perform mx_ops.rule(owner is not null,'Assign a program owner before commencing work');end if;
  if state in('completed','cancelled') or coalesce(g.data->>'state','') in('completed','cancelled') then perform mx_ops.required_text(p,'reason',1000);end if;
  if state='completed' then perform mx_ops.rule(not exists(select 1 from mx_ops.work_items where program_id=p_id and (status not in('resolved','cancelled') or kind='maintenance' and status='resolved' and verified_at is null)),'Complete or explicitly cancel outstanding tasks before closing this program');end if;
  perform mx_ops.quantity(p,'plannedMetres',false);perform mx_ops.rule(mx_ops.quantity(p,'plannedHoles',false) is null or trunc(mx_ops.quantity(p,'plannedHoles',false))=mx_ops.quantity(p,'plannedHoles',false),'Planned hole count must be a whole number');perform mx_ops.quantity(p,'budget',false);
  r:=coalesce(g.data,'{}'::jsonb)||jsonb_build_object('recordId',p_id,'name',mx_ops.required_text(p,'name',160),'type',dtype,'state',state,'method',coalesce(nullif(p->>'method',''),g.data->>'method','rock_chip'),
   'objective',left(coalesce(p->>'objective',''),4000),'ownerId',owner,'personnelIds',coalesce(p->'personnelIds','[]'),'plannedStart',day1,'plannedEnd',day2,'plannedMetres',nullif(p->>'plannedMetres',''),'plannedHoles',nullif(p->>'plannedHoles',''),'budget',nullif(p->>'budget',''),'currency',coalesce(p->>'currency','AUD'),'completionReason',coalesce(p->>'reason',''));
  perform mx_ops.rule((r->>'currency')~'^[A-Z]{3}$','Use a three-letter currency');
  insert into mx_ops.geo_programs(id,scope_id,data,updated_by) values(p_id,p_scope,r,auth.uid()) on conflict(id) do update set data=excluded.data,version=mx_ops.geo_programs.version+1,updated_by=auth.uid(),updated_at=now() returning * into g;
  if dtype='processing' then insert into mx_ops.campaigns(id,scope_id,name,created_by) values(p_id,p_scope,r->>'name',auth.uid()) on conflict(id) do update set name=excluded.name;end if;
  return to_jsonb(g);
 elsif p_action='person.save' then
  select * into person from mx_ops.planning_people where id=p_id for update;perform mx_ops.rule(person.id is null or person.scope_id=p_scope,'Person is outside this workspace');perform mx_ops.check_version(coalesce(person.version,0),p_expected);
  v:=nullif(p->>'user_id','')::uuid;
  if v is not null then perform mx_ops.rule(exists(select 1 from mx_ops.members where scope_id=p_scope and user_id=v and revoked_at is null and (expires_at is null or expires_at>now())),'Link only an active workspace account');end if;
  insert into mx_ops.planning_people(id,scope_id,name,role,user_id,active,created_by) values(p_id,p_scope,mx_ops.required_text(p,'name',128),left(coalesce(p->>'role',''),128),v,coalesce((p->>'active')::boolean,true),auth.uid()) on conflict(id) do update set name=excluded.name,role=excluded.role,user_id=excluded.user_id,active=excluded.active,version=mx_ops.planning_people.version+1,updated_at=now() returning * into person;return to_jsonb(person);
 elsif p_action in('task.save','task.status','task.verify') then
  select * into w from mx_ops.work_items where id=p_id for update;perform mx_ops.rule(w.id is null or w.scope_id=p_scope,'Task is outside this workspace');perform mx_ops.check_version(coalesce(w.version,0),p_expected);
  if p_action='task.verify' then
   perform mx_ops.rule(w.kind='maintenance' and w.status='resolved' and w.completed_by<>auth.uid(),'A different supervisor must verify completed maintenance');perform mx_ops.required_text(p,'reason',1000);
   update mx_ops.work_items set verified_by=auth.uid(),verified_at=now(),version=version+1,updated_at=now() where id=p_id returning * into w;return to_jsonb(w);
  end if;
  if p_action='task.status' then
   perform mx_ops.rule(w.id is not null,'Task not found');perform mx_ops.required_text(p,'outcome',4000);
   update mx_ops.work_items set status=mx_ops.required_text(p,'status',30),outcome=p->>'outcome',completed_by=case when p->>'status'='resolved' then auth.uid() else null end,verified_by=null,verified_at=null,version=version+1,updated_at=now() where id=p_id returning * into w;return to_jsonb(w);
  end if;
  owner:=nullif(p->>'responsible_id','')::uuid;perform mx_ops.workflow_person(p_scope,owner);pid:=nullif(p->>'program_id','')::uuid;
  if pid is not null then perform mx_ops.rule(exists(select 1 from mx_ops.geo_programs where id=pid and scope_id=p_scope and coalesce(data->>'state','planned') not in('completed','cancelled')),'Choose an open program in this workspace');end if;
  perform mx_ops.workflow_evidence(p_scope,nullif(p->>'source_file_id','')::uuid);
  for v in select value::uuid from jsonb_array_elements_text(coalesce(p->'contributors','[]')) loop perform mx_ops.workflow_person(p_scope,v);end loop;
  perform mx_ops.rule(w.status is null or w.status not in('resolved','cancelled'),'Reopen the task before changing its plan');
  insert into mx_ops.work_items(id,scope_id,title,notes,created_by,program_id,parent_id,kind,priority,start_on,due_on,responsible_id,contributors,asset_id,source_file_id)
  values(p_id,p_scope,mx_ops.required_text(p,'title',240),coalesce(p->>'notes',''),auth.uid(),pid,nullif(p->>'parent_id','')::uuid,coalesce(p->>'kind','task'),coalesce(p->>'priority','normal'),mx_ops.workflow_day(p,'start_on'),mx_ops.workflow_day(p,'due_on'),owner,array(select value::uuid from jsonb_array_elements_text(coalesce(p->'contributors','[]'))),nullif(p->>'asset_id','')::uuid,nullif(p->>'source_file_id','')::uuid)
  on conflict(id) do update set title=excluded.title,notes=excluded.notes,program_id=excluded.program_id,parent_id=excluded.parent_id,kind=excluded.kind,priority=excluded.priority,start_on=excluded.start_on,due_on=excluded.due_on,responsible_id=excluded.responsible_id,contributors=excluded.contributors,asset_id=excluded.asset_id,source_file_id=excluded.source_file_id,version=mx_ops.work_items.version+1,updated_at=now() returning * into w;
  delete from mx_ops.task_dependencies where task_id=p_id;
  for dep in select value from jsonb_array_elements(coalesce(p->'dependencies','[]')) loop
   v:=(dep->>'id')::uuid;perform mx_ops.rule(v<>p_id,'A task cannot depend on itself');
   perform mx_ops.rule(exists(select 1 from mx_ops.work_items x join mx_ops.scopes scope_one on scope_one.id=x.scope_id join mx_ops.scopes scope_two on scope_two.id=p_scope where x.id=v and x.scope_id=(dep->>'scopeId')::uuid and scope_one.org_id=scope_two.org_id and mx_ops.can(x.scope_id,'work.read')),'Dependency must be accessible in this organisation');
   insert into mx_ops.task_dependencies values(p_scope,p_id,(dep->>'scopeId')::uuid,v);
  end loop;
  perform mx_ops.rule(not exists(with recursive chain(id) as(select predecessor_id from mx_ops.task_dependencies where task_id=p_id union select d.predecessor_id from mx_ops.task_dependencies d join chain walk on d.task_id=walk.id) select 1 from chain where id=p_id),'Dependencies cannot form a cycle');
  -- Re-run invariants after the final dependency set, inside the same transaction.
  update mx_ops.work_items set updated_at=now() where id=p_id;
  return to_jsonb(w);
 elsif p_action='asset.save' then
  select * into a from mx_ops.plant_assets where id=p_id for update;perform mx_ops.rule(a.id is null or a.scope_id=p_scope,'Asset is outside this workspace');perform mx_ops.check_version(coalesce(a.version,0),p_expected);
  v:=nullif(p->>'parent_id','')::uuid;perform mx_ops.rule(v is distinct from p_id,'Asset cannot contain itself');
  perform mx_ops.rule(not exists(with recursive chain as(select id,parent_id from mx_ops.plant_assets where id=v union select x.id,x.parent_id from mx_ops.plant_assets x join chain walk on x.id=walk.parent_id)select 1 from chain where id=p_id),'Asset hierarchy cannot form a cycle');
  perform mx_ops.workflow_evidence(p_scope,nullif(p->>'source_file_id','')::uuid);
  if a.id is not null then perform mx_ops.rule(a.kind=p->>'kind','Asset kind is immutable; create a replacement asset to change its identity');end if;
  if a.id is not null and a.kind is distinct from p->>'kind' then
   perform mx_ops.rule(not exists(select 1 from mx_ops.fuel_events where tank_id=a.id or other_tank_id=a.id or asset_id=a.id) and not exists(select 1 from mx_ops.energy_readings where asset_id=a.id),'Keep the asset type once observations exist; record a separate asset for a different instrument');
  end if;
  insert into mx_ops.plant_assets(id,scope_id,code,name,kind,state,parent_id,location,model,serial,capacity,capacity_unit,service_due,notes,source_file_id,created_by)
  values(p_id,p_scope,upper(mx_ops.required_text(p,'code',48)),mx_ops.required_text(p,'name',128),p->>'kind',coalesce(p->>'state','proposed'),v,coalesce(p->>'location',''),coalesce(p->>'model',''),coalesce(p->>'serial',''),mx_ops.quantity(p,'capacity',false),nullif(p->>'capacity_unit',''),mx_ops.workflow_day(p,'service_due'),coalesce(p->>'notes',''),nullif(p->>'source_file_id','')::uuid,auth.uid())
  on conflict(id) do update set code=excluded.code,name=excluded.name,state=excluded.state,parent_id=excluded.parent_id,location=excluded.location,model=excluded.model,serial=excluded.serial,capacity=excluded.capacity,capacity_unit=excluded.capacity_unit,service_due=excluded.service_due,notes=excluded.notes,source_file_id=excluded.source_file_id,version=mx_ops.plant_assets.version+1,updated_at=now() returning * into a;
  if a.kind='tank' then perform mx_ops.rule(a.capacity_unit='L','Tank capacity is recorded in litres');perform mx_ops.fuel_validate(p_scope,p_id);end if;
  if a.kind='tank' then perform mx_ops.fuel_validate(p_scope,a.id);end if;return to_jsonb(a);
 elsif p_action='fuel.record' then
  perform mx_ops.check_version(0,p_expected);v:=(p->>'tank_id')::uuid;
  perform mx_ops.rule(exists(select 1 from mx_ops.plant_assets tank where tank.id=v and tank.scope_id=p_scope and tank.kind='tank' and tank.state not in('proposed','retired')),'Choose an installed tank, not a proposed energy scenario');
  if p->>'kind'='transfer' then perform mx_ops.rule(exists(select 1 from mx_ops.plant_assets tank where tank.id=(p->>'other_tank_id')::uuid and tank.scope_id=p_scope and tank.kind='tank' and tank.state not in('proposed','retired')),'Choose an installed destination tank');end if;
  perform mx_ops.workflow_evidence(p_scope,nullif(p->>'source_file_id','')::uuid);
  insert into mx_ops.fuel_events(id,scope_id,kind,tank_id,other_tank_id,asset_id,litres,occurred_at,reference,source_file_id,notes,created_by)
  values(p_id,p_scope,p->>'kind',v,nullif(p->>'other_tank_id','')::uuid,nullif(p->>'asset_id','')::uuid,mx_ops.quantity(p,'litres'),mx_ops.at_time(p,'occurred_at'),mx_ops.required_text(p,'reference',240),nullif(p->>'source_file_id','')::uuid,coalesce(p->>'notes',''),auth.uid()) returning * into f;
  perform mx_ops.rule(f.kind in('opening','dip') or f.litres>0,'A fuel movement must be greater than zero');
  perform mx_ops.fuel_validate(p_scope,f.tank_id);if f.other_tank_id is not null then perform mx_ops.fuel_validate(p_scope,f.other_tank_id);end if;return to_jsonb(f);
 elsif p_action='fuel.void' then
  select * into f from mx_ops.fuel_events where id=p_id and scope_id=p_scope for update;perform mx_ops.check_version(f.version,p_expected);
  update mx_ops.fuel_events set void_reason=mx_ops.required_text(p,'reason',1000),version=version+1 where id=p_id returning * into f;
  perform mx_ops.fuel_validate(p_scope,f.tank_id);if f.other_tank_id is not null then perform mx_ops.fuel_validate(p_scope,f.other_tank_id);end if;return to_jsonb(f);
 elsif p_action='energy.record' then
  perform mx_ops.check_version(0,p_expected);v:=(p->>'asset_id')::uuid;
  select * into a from mx_ops.plant_assets where id=v and scope_id=p_scope;
  perform mx_ops.rule(a.id is not null and a.state not in('proposed','retired'),'Record actuals against an installed asset, not a scenario');
  perform mx_ops.rule(case p->>'kind' when 'diesel_generation' then a.kind='generator' when 'generator_hours' then a.kind='generator' when 'solar_generation' then a.kind='solar' when 'battery_soc' then a.kind='battery' else a.kind='meter' end,'Observation type does not match this asset');
  perform mx_ops.workflow_evidence(p_scope,nullif(p->>'source_file_id','')::uuid);
  insert into mx_ops.energy_readings(id,scope_id,asset_id,kind,started_at,ended_at,amount,unit,method,source_file_id,notes,created_by)
  values(p_id,p_scope,v,p->>'kind',mx_ops.at_time(p,'started_at'),mx_ops.at_time(p,'ended_at'),mx_ops.quantity(p,'amount'),case p->>'kind' when 'generator_hours' then 'h' when 'battery_soc' then '%' else 'kWh' end,mx_ops.required_text(p,'method',240),nullif(p->>'source_file_id','')::uuid,coalesce(p->>'notes',''),auth.uid()) returning * into e;
  if e.kind<>'battery_soc' then
   perform mx_ops.rule(e.ended_at>e.started_at,'Record a non-empty observation interval');
   perform mx_ops.rule(not exists(select 1 from mx_ops.energy_readings x where x.scope_id=p_scope and x.asset_id=v and x.kind=e.kind and x.id<>p_id and x.void_reason is null and x.started_at<e.ended_at and x.ended_at>e.started_at),'Meter intervals overlap. Void a mistaken observation before replacing it');
   if e.kind='generator_hours' then perform mx_ops.rule(e.amount<=extract(epoch from e.ended_at-e.started_at)/3600,'Running hours exceed the elapsed observation interval');end if;
  end if;return to_jsonb(e);
 elsif p_action='energy.void' then
  select * into e from mx_ops.energy_readings where id=p_id and scope_id=p_scope for update;perform mx_ops.check_version(e.version,p_expected);
  update mx_ops.energy_readings set void_reason=mx_ops.required_text(p,'reason',1000),version=version+1 where id=p_id returning * into e;return to_jsonb(e);
 elsif p_action='engineering.save' then
  select * into er from mx_ops.engineering_revisions where id=p_id for update;perform mx_ops.rule(er.id is null or er.scope_id=p_scope,'Engineering record is outside this workspace');perform mx_ops.check_version(coalesce(er.version,0),p_expected);
  state:=coalesce(p->>'state','concept');perform mx_ops.workflow_evidence(p_scope,nullif(p->>'source_file_id','')::uuid);
  if state in('approved','commissioned','as_built') then
   perform mx_ops.require_permission(p_scope,'plant.review',true);
   perform mx_ops.rule(er.id is not null and er.created_by<>auth.uid() and nullif(p->>'source_file_id','') is not null,'A different reviewer and verified engineering evidence are required');
   perform mx_ops.rule((state='approved' and er.state='review') or (state='commissioned' and er.state='implementing') or (state='as_built' and er.state='commissioned'),'Follow engineering review and commissioning sequence');
  end if;
  if er.id is null then perform mx_ops.rule(state in('concept','review'),'A new engineering revision starts in concept or review');end if;
  if er.state in('approved','implementing','commissioned','as_built','superseded') then
   perform mx_ops.rule(state=er.state or state='superseded' or er.state='approved' and state='implementing' or er.state='implementing' and state='commissioned' or er.state='commissioned' and state='as_built','Preserve the approved lifecycle; create a new revision for a changed design');
  end if;
  if state='superseded' then perform mx_ops.require_permission(p_scope,'plant.review',true);end if;
  perform mx_ops.rule(nullif(p->>'supersedes','')::uuid is distinct from p_id,'A revision cannot supersede itself');
  if state='implementing' then perform mx_ops.rule(er.state='approved','Approve the design before marking implementation');end if;
  if er.state in('approved','implementing','commissioned','as_built','superseded') then perform mx_ops.rule(er.title=p->>'title' and er.reference=p->>'reference' and er.source_file_id is not distinct from nullif(p->>'source_file_id','')::uuid,'Preserve approved source and identity; create a superseding revision for design changes');end if;
  insert into mx_ops.engineering_revisions(id,scope_id,title,reference,state,program_id,source_file_id,supersedes,notes,created_by,reviewed_by)
  values(p_id,p_scope,mx_ops.required_text(p,'title',160),mx_ops.required_text(p,'reference',100),state,nullif(p->>'program_id','')::uuid,nullif(p->>'source_file_id','')::uuid,nullif(p->>'supersedes','')::uuid,coalesce(p->>'notes',''),auth.uid(),case when state in('approved','commissioned','as_built') then auth.uid() end)
  on conflict(id) do update set title=excluded.title,reference=excluded.reference,state=excluded.state,program_id=excluded.program_id,source_file_id=excluded.source_file_id,notes=excluded.notes,reviewed_by=coalesce(excluded.reviewed_by,mx_ops.engineering_revisions.reviewed_by),version=mx_ops.engineering_revisions.version+1,updated_at=now() returning * into er;return to_jsonb(er);
 elsif p_action='cost.record' then
  perform mx_ops.check_version(0,p_expected);perform mx_ops.workflow_evidence(p_scope,nullif(p->>'source_file_id','')::uuid);
  if p->>'kind' in('actual','commitment') then perform mx_ops.rule(nullif(p->>'source_file_id','') is not null,'Attach the invoice or commitment evidence');end if;
  insert into mx_ops.program_costs(id,scope_id,program_id,kind,amount,currency,reference,source_file_id,occurred_on,created_by) values(p_id,p_scope,(p->>'program_id')::uuid,p->>'kind',mx_ops.quantity(p,'amount'),p->>'currency',mx_ops.required_text(p,'reference',240),nullif(p->>'source_file_id','')::uuid,mx_ops.workflow_day(p,'occurred_on'),auth.uid()) returning * into c;return to_jsonb(c);
 elsif p_action='cost.void' then
  select * into c from mx_ops.program_costs where id=p_id and scope_id=p_scope for update;perform mx_ops.check_version(c.version,p_expected);
  update mx_ops.program_costs set void_reason=mx_ops.required_text(p,'reason',1000),version=version+1 where id=p_id returning * into c;return to_jsonb(c);
 elsif p_action='spare.save' then
  select * into s from mx_ops.critical_spares where id=p_id for update;perform mx_ops.rule(s.id is null or s.scope_id=p_scope,'Spare is outside this workspace');perform mx_ops.check_version(coalesce(s.version,0),p_expected);
  if s.id is not null and s.unit is distinct from p->>'unit' then perform mx_ops.rule(not exists(select 1 from mx_ops.spare_movements where spare_id=s.id),'Stock units with existing movements are immutable; create a new stock identity instead');end if;
  insert into mx_ops.critical_spares(id,scope_id,code,name,asset_id,location,unit,reorder_at) values(p_id,p_scope,upper(mx_ops.required_text(p,'code',48)),mx_ops.required_text(p,'name',128),nullif(p->>'asset_id','')::uuid,coalesce(p->>'location',''),mx_ops.required_text(p,'unit',24),mx_ops.quantity(p,'reorder_at')) on conflict(id) do update set code=excluded.code,name=excluded.name,asset_id=excluded.asset_id,location=excluded.location,unit=excluded.unit,reorder_at=excluded.reorder_at,version=mx_ops.critical_spares.version+1 returning * into s;return to_jsonb(s);
 elsif p_action='spare.move' then
  perform mx_ops.check_version(0,p_expected);
  insert into mx_ops.spare_movements(id,scope_id,spare_id,kind,quantity,task_id,reference,occurred_at,created_by) values(p_id,p_scope,(p->>'spare_id')::uuid,p->>'kind',mx_ops.quantity(p,'quantity'),nullif(p->>'task_id','')::uuid,mx_ops.required_text(p,'reference',240),mx_ops.at_time(p,'occurred_at'),auth.uid());
  perform mx_ops.spare_validate((p->>'spare_id')::uuid);
  return (select to_jsonb(m)||jsonb_build_object('version',1) from mx_ops.spare_movements m where id=p_id);
 elsif p_action='spare.void' then
  select spare_id,to_jsonb(m) into v,r from mx_ops.spare_movements m where m.id=p_id and m.scope_id=p_scope for update;
  perform mx_ops.check_version((r->>'version')::integer,p_expected);
  update mx_ops.spare_movements set void_reason=mx_ops.required_text(p,'reason',1000),version=version+1 where id=p_id returning to_jsonb(spare_movements.*) into r;
  perform mx_ops.spare_validate(v);return r;
 end if;
 return mx_ops.core_command_v6(p_scope,p_action,p_id,p_expected,p);
end $$;
insert into mx_ops.command_permissions values
 ('program.save','work.write','work.read',false,'core',false),('person.save','work.write','work.read',false,'core',false),
 ('task.save','work.write','work.read',false,'core',false),('task.status','work.write','work.read',false,'core',false),('task.verify','plant.review','work.read',true,'core',false),
 ('asset.save','plant.capture','plant.read',false,'core',false),('fuel.record','plant.capture','plant.read',false,'core',false),('fuel.void','plant.review','plant.read',false,'core',false),
 ('energy.record','plant.capture','plant.read',false,'core',false),('energy.void','plant.review','plant.read',false,'core',false),('engineering.save','plant.capture','plant.read',false,'core',false),
 ('cost.record','commercial.write','commercial.read',false,'core',false),('cost.void','commercial.write','commercial.read',false,'core',false),
 ('spare.void','plant.review','plant.read',false,'core',false),('spare.save','plant.capture','plant.read',false,'core',false),('spare.move','plant.capture','plant.read',false,'core',false);
-- RLS remains defence-in-depth; no direct client write privilege is introduced.
do $$ declare t text;p text;begin
 foreach t in array array['planning_people','plant_assets','fuel_events','energy_readings','engineering_revisions','program_costs','critical_spares','spare_movements','task_dependencies'] loop
  p:=case when t='program_costs' then 'commercial.read' when t in('planning_people','task_dependencies') then 'work.read' else 'plant.read' end;
  execute format('alter table mx_ops.%I enable row level security',t);
  execute format('create policy workflow_scoped_read on mx_ops.%I for select to authenticated using(mx_ops.can(scope_id,%L))',t,p);
  execute format('grant select on mx_ops.%I to authenticated',t);
 end loop;
end $$;
alter table mx_ops.program_types enable row level security;
create policy program_type_read on mx_ops.program_types for select to authenticated using(auth.uid() is not null);
grant select on mx_ops.program_types to authenticated;
create function public.mx_ops_workflow(p_scope uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb:='{}';t text;k text;p text;n bigint;data jsonb;begin
 perform mx_ops.require_permission(p_scope,'work.read');
 result:=jsonb_build_object('schemaVersion',7,'revision',(select revision from mx_ops.scopes where id=p_scope),'asOf',now(),'complete',true,'types',(select jsonb_agg(to_jsonb(x) order by ordinal) from mx_ops.program_types x where enabled));
 for t,k,p in select * from (values('geo_programs','programs','work.read'),('work_items','tasks','work.read'),('planning_people','people','work.read'),('plant_assets','assets','plant.read'),('fuel_events','fuel','plant.read'),('energy_readings','energy','plant.read'),('engineering_revisions','engineering','plant.read'),('program_costs','costs','commercial.read'),('critical_spares','spares','plant.read'),('spare_movements','spareMoves','plant.read')) as items(t,k,p) loop
  if mx_ops.can(p_scope,p) then
   execute format('select count(*) from mx_ops.%I where scope_id=$1',t) into n using p_scope;
   execute format('select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from(select * from mx_ops.%I where scope_id=$1 order by id limit 10000)x',t) into data using p_scope;
   result:=result||jsonb_build_object(k,data,k||'Count',n,'complete',(result->>'complete')::boolean and n<=10000);
  else result:=result||jsonb_build_object(k,'[]'::jsonb);end if;
 end loop;
 result:=result||jsonb_build_object('dependencies',coalesce((select jsonb_agg(jsonb_build_object('task_id',d.task_id,'predecessor_id',d.predecessor_id,'predecessor_scope',d.predecessor_scope,'title',case when mx_ops.can(d.predecessor_scope,'work.read') then w.title else 'Restricted predecessor' end,'status',case when mx_ops.can(d.predecessor_scope,'work.read') then w.status else null end,'kind',case when mx_ops.can(d.predecessor_scope,'work.read') then w.kind else null end,'verified',case when mx_ops.can(d.predecessor_scope,'work.read') then w.verified_at is not null else false end))from mx_ops.task_dependencies d join mx_ops.work_items w on w.id=d.predecessor_id where d.scope_id=p_scope),'[]'::jsonb));
 if mx_ops.can(p_scope,'geo.read') then
  result:=result||jsonb_build_object('progress',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'holes',(select count(*) from mx_ops.geo_collars c where c.scope_id=p_scope and c.data->>'programId'=g.id::text and c.data->>'archivedAt' is null),'metres',(select coalesce(sum(c.actual_depth),0) from mx_ops.geo_collars c where c.scope_id=p_scope and c.data->>'programId'=g.id::text and c.data->>'archivedAt' is null),'samples',(select count(*) from mx_ops.geo_samples s where s.scope_id=p_scope and s.data->>'programId'=g.id::text and s.data->>'archivedAt' is null),'released',(select count(*) from mx_ops.geo_samples s where s.scope_id=p_scope and s.data->>'programId'=g.id::text and s.data->>'assayReviewStatus'='released' and s.data->>'archivedAt' is null))) from mx_ops.geo_programs g where g.scope_id=p_scope),'[]'::jsonb));
 end if;
 return result;
end $$;
create function public.mx_ops_workflow_history(p_scope uuid,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform mx_ops.require_permission(p_scope,'work.read');return coalesce((select jsonb_agg(to_jsonb(x) order by seq desc) from(select seq,action,version,reason,recorded_at,actor_id,snapshot from mx_ops.audit where scope_id=p_scope and entity_id=p_id and mx_ops.can(p_scope,permission) order by seq desc limit 100)x),'[]'::jsonb);end $$;
revoke all on all functions in schema mx_ops from public,anon,authenticated;
grant execute on function mx_ops.can(uuid,text),mx_ops.is_admin(uuid) to authenticated;
revoke all on function public.mx_ops_workflow(uuid),public.mx_ops_workflow_history(uuid,uuid) from public,anon;
grant execute on function public.mx_ops_workflow(uuid),public.mx_ops_workflow_history(uuid,uuid) to authenticated;
insert into mx_ops.schema_version(version) values(7);
commit;
