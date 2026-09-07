-- Additive isolated schema. Never replay or rename the recovered 202609060003 migration.
begin;
create schema mx_ops;
revoke all on schema mx_ops from public,anon,authenticated;
grant usage on schema mx_ops to authenticated;
create table mx_ops.schema_version(version integer primary key, applied_at timestamptz not null default now());
insert into mx_ops.schema_version values(1,now());
create table mx_ops.organisations (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 128),
 legacy_workspace_id uuid unique references public.gic_workspaces(id), created_at timestamptz not null default now()
);
create table mx_ops.scopes (
 id uuid primary key default gen_random_uuid(),org_id uuid not null references mx_ops.organisations(id),
 kind text not null check(kind in('project','facility','reporting')),code text not null check(length(trim(code)) between 1 and 32),
 name text not null check(length(trim(name)) between 1 and 128),timezone text not null default 'Australia/Brisbane',
 policy jsonb not null default '{"recognition_form":"dore","recognition_confirmed":false,"self_review":false}'::jsonb,
 version integer not null default 1,revision bigint not null default 0,archived_at timestamptz,
 unique(org_id,code),unique(org_id,id)
);
create table mx_ops.administrators (org_id uuid not null references mx_ops.organisations(id),user_id uuid not null references auth.users(id),revoked_at timestamptz,primary key(org_id,user_id));
create table mx_ops.members (
 scope_id uuid not null references mx_ops.scopes(id),user_id uuid not null references auth.users(id),
 profiles text[] not null check(cardinality(profiles)>0 and profiles <@ array['collector','geologist','lab_reviewer','operator','supervisor','custodian','accountant','manager','auditor']::text[]),
 expires_at timestamptz,revoked_at timestamptz,version integer not null default 1,primary key(scope_id,user_id)
);
create table mx_ops.profile_permissions (profile text not null,permission text not null,primary key(profile,permission));
create table mx_ops.receipts (
 scope_id uuid not null references mx_ops.scopes(id), request_id uuid not null,actor_id uuid not null references auth.users(id),
 intent jsonb not null,response jsonb not null,created_at timestamptz not null default now(),primary key(scope_id,request_id)
);
create table mx_ops.audit (
 seq bigint generated always as identity primary key,scope_id uuid not null references mx_ops.scopes(id),
 entity_id uuid not null,actor_id uuid not null references auth.users(id),request_id uuid not null,
 action text not null,version integer not null,permission text not null,recorded_at timestamptz not null default now(),
 reason text not null default '',snapshot jsonb not null
);
create index ops_audit_entity on mx_ops.audit(scope_id,entity_id,seq);
create table mx_ops.work_items (
 id uuid primary key,scope_id uuid not null references mx_ops.scopes(id),version integer not null default 1,
 title text not null check(length(trim(title)) between 3 and 240),entity_type text,entity_id uuid,
 assigned_to uuid references auth.users(id),due_at timestamptz,status text not null check(status in('open','resolved')) default 'open',
 notes text not null default '' check(length(notes)<=4000),created_by uuid not null references auth.users(id),updated_at timestamptz not null default now()
);
create table mx_ops.files (
 id uuid primary key,scope_id uuid not null references mx_ops.scopes(id),family text not null check(family in('geo','plant','gold','custody')),
 name text not null check(length(name) between 1 and 240),media_type text not null,size_bytes bigint not null check(size_bytes between 1 and 10485760),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),object_path text not null unique,
 status text not null check(status in('staged','verified','rejected')) default 'staged',
 protection_status text not null check(protection_status in('primary_only','independent_copy_verified')) default 'primary_only',
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),verified_at timestamptz,
 unique(scope_id,id)
);
create table mx_ops.documents (
 id uuid primary key,scope_id uuid not null references mx_ops.scopes(id),version integer not null default 1,
 title text not null check(length(trim(title)) between 1 and 240),file_id uuid not null,
 category text not null check(category in('procedure','plan','handover','certificate','decision','other')),
 supersedes uuid references mx_ops.documents(id),created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 foreign key(scope_id,file_id) references mx_ops.files(scope_id,id)
);
create table mx_ops.invitations (
 id uuid primary key,scope_id uuid not null references mx_ops.scopes(id),email text not null check(length(email)<=254),
 profiles text[] not null,invited_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days',accepted_by uuid references auth.users(id),accepted_at timestamptz,revoked_at timestamptz,
 unique(scope_id,email)
);
create function mx_ops.is_admin(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from mx_ops.administrators a where a.org_id=p_org and a.user_id=auth.uid() and a.revoked_at is null)
$$;
create function mx_ops.can(p_scope uuid,p_permission text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from mx_ops.members m join mx_ops.scopes s on s.id=m.scope_id
 join mx_ops.profile_permissions p on p.profile=any(m.profiles)
 where m.scope_id=p_scope and m.user_id=auth.uid() and m.revoked_at is null and (m.expires_at is null or m.expires_at>now()) and s.archived_at is null and p.permission=p_permission)
$$;
create function mx_ops.require_permission(p_scope uuid,p_permission text,p_mfa boolean default false) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not mx_ops.can(p_scope,p_permission) then raise exception 'ACCESS_DENIED';end if;
 if p_mfa and coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'MFA_REQUIRED';end if;
end $$;
create function mx_ops.rule(ok boolean,message text) returns void language plpgsql set search_path='' as $$
begin if ok is distinct from true then raise exception 'RULE: %',message;end if;end $$;
create function mx_ops.required_text(p jsonb,k text,maxlen integer default 4000) returns text language plpgsql immutable set search_path='' as $$
declare v text;begin v:=trim(p->>k);perform mx_ops.rule(jsonb_typeof(p->k)='string' and length(v) between 1 and maxlen,'Enter '||replace(k,'_',' '));return v;end $$;
create function mx_ops.quantity(p jsonb,k text,required boolean default true,maxval numeric default 999999999999) returns numeric language plpgsql immutable set search_path='' as $$
declare t text;v numeric;begin t:=p->>k;if t is null or t='' then perform mx_ops.rule(not required,'Enter '||replace(k,'_',' '));return null;end if;
 perform mx_ops.rule(jsonb_typeof(p->k) in('string','number') and t ~ '^[0-9]{1,12}(\.[0-9]{1,6})?$','Invalid decimal for '||k);v:=t::numeric;perform mx_ops.rule(v<=maxval,'Out of range: '||k);return v;end $$;
create function mx_ops.at_time(p jsonb,k text,required boolean default true) returns timestamptz language plpgsql set search_path='' as $$
declare t text;v timestamptz;begin t:=p->>k;if t is null or t='' then perform mx_ops.rule(not required,'Enter '||k);return null;end if;
 perform mx_ops.rule(t ~ '(Z|[+-][0-9]{2}:[0-9]{2})$','An explicit timezone is required for '||k);v:=t::timestamptz;perform mx_ops.rule(v between '2000-01-01'::timestamptz and now()+interval '5 minutes','Enter an actual observation time for '||k);return v;end $$;
create function mx_ops.check_version(actual integer,expected integer) returns void language plpgsql set search_path='' as $$
begin if actual is distinct from expected then raise exception 'CONFLICT';end if;end $$;
create function mx_ops.check_evidence(p_scope uuid,p_file uuid,p_family text) returns void language plpgsql security definer set search_path='' as $$
begin perform mx_ops.rule(exists(select 1 from mx_ops.files f where f.id=p_file and f.scope_id=p_scope and f.status='verified' and (f.family=p_family or f.family='plant' and p_family='gold')),'Verified source evidence is required in this workspace');end $$;
create function public.mx_ops_context() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'ACCESS_DENIED';end if;
 return jsonb_build_object('userId',auth.uid(),'schemaVersion',(select max(version) from mx_ops.schema_version),'aal',coalesce(auth.jwt()->>'aal','aal1'),'asOf',now(),
 'organisations',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'admin',mx_ops.is_admin(o.id))) from mx_ops.organisations o where mx_ops.is_admin(o.id) or exists(select 1 from mx_ops.scopes s join mx_ops.members m on m.scope_id=s.id where s.org_id=o.id and m.user_id=auth.uid() and m.revoked_at is null and (m.expires_at is null or m.expires_at>now()))),'[]'::jsonb),
 'scopes',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('permissions',coalesce((select jsonb_agg(distinct p.permission) from mx_ops.members m join mx_ops.profile_permissions p on p.profile=any(m.profiles) where m.scope_id=s.id and m.user_id=auth.uid() and m.revoked_at is null and (m.expires_at is null or m.expires_at>now())),'[]'::jsonb))) from mx_ops.scopes s where s.archived_at is null and (mx_ops.is_admin(s.org_id) or exists(select 1 from mx_ops.members m where m.scope_id=s.id and m.user_id=auth.uid() and m.revoked_at is null and (m.expires_at is null or m.expires_at>now())))),'[]'::jsonb));
end $$;
create function public.mx_ops_bootstrap(p_workspace uuid,p_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid;begin
 if auth.uid() is null or not exists(select 1 from public.gic_members where workspace_id=p_workspace and user_id=auth.uid() and role='owner') then raise exception 'ACCESS_DENIED';end if;
 if coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'MFA_REQUIRED';end if;
 perform mx_ops.rule(length(trim(p_name)) between 1 and 128,'Enter the organisation name');
 perform 1 from public.gic_workspaces where id=p_workspace for update;
 select id into org from mx_ops.organisations where legacy_workspace_id=p_workspace;
 if org is not null then return org;end if;
 insert into mx_ops.organisations(name,legacy_workspace_id) values(trim(p_name),p_workspace) returning id into org;
 insert into mx_ops.administrators(org_id,user_id) values(org,auth.uid());
 -- Access administration is not an operational approval permission.
 return org;
end $$;
create function public.mx_ops_admin(p_org uuid,p_action text,p_id uuid,p_expected integer,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s mx_ops.scopes;m mx_ops.members;v_scope uuid;v_email text;v_profiles text[];rec jsonb;begin
 if not mx_ops.is_admin(p_org) then raise exception 'ACCESS_DENIED';end if;
 if coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'MFA_REQUIRED';end if;
 perform 1 from mx_ops.organisations where id=p_org for update;
 perform mx_ops.rule(p_expected>=0 and octet_length(p_payload::text)<=16000,'Invalid request');
 if p_action='scope.create' then
  perform mx_ops.check_version(0,p_expected);
  perform mx_ops.rule(not exists(select 1 from mx_ops.scopes where id=p_id),'Scope ID already exists');
  perform mx_ops.rule(p_payload->>'kind' in('project','facility','reporting'),'Choose a workspace type');
  perform mx_ops.rule(exists(select 1 from pg_catalog.pg_timezone_names where name=coalesce(p_payload->>'timezone','Australia/Brisbane')),'Choose a valid timezone');
  insert into mx_ops.scopes(id,org_id,kind,code,name,timezone) values(p_id,p_org,p_payload->>'kind',mx_ops.required_text(p_payload,'code',32),mx_ops.required_text(p_payload,'name',128),coalesce(p_payload->>'timezone','Australia/Brisbane')) returning * into s;
  v_scope:=s.id;rec:=to_jsonb(s);
 elsif p_action='member.grant' or p_action='member.revoke' then
  v_scope:=(p_payload->>'scope_id')::uuid;select * into s from mx_ops.scopes where id=v_scope and org_id=p_org;perform mx_ops.rule(s.id is not null,'Workspace not found');
  select * into m from mx_ops.members where scope_id=v_scope and user_id=p_id;perform mx_ops.check_version(coalesce(m.version,0),p_expected);
  if p_action='member.grant' then
   select array_agg(value) into v_profiles from jsonb_array_elements_text(p_payload->'profiles');
   insert into mx_ops.members(scope_id,user_id,profiles,expires_at,version) values(v_scope,p_id,v_profiles,nullif(p_payload->>'expires_at','')::timestamptz,1)
    on conflict(scope_id,user_id) do update set profiles=excluded.profiles,expires_at=excluded.expires_at,revoked_at=null,version=mx_ops.members.version+1 returning * into m;
  else update mx_ops.members set revoked_at=now(),version=version+1 where scope_id=v_scope and user_id=p_id returning * into m;end if;rec:=to_jsonb(m);
 elsif p_action='invitation.prepare' then
  v_scope:=(p_payload->>'scope_id')::uuid;select * into s from mx_ops.scopes where id=v_scope and org_id=p_org;perform mx_ops.rule(s.id is not null,'Workspace not found');
  v_email:=lower(mx_ops.required_text(p_payload,'email',254));perform mx_ops.rule(v_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$','Enter a valid email');
  select array_agg(value) into v_profiles from jsonb_array_elements_text(p_payload->'profiles');perform mx_ops.rule(cardinality(v_profiles)>0 and v_profiles <@ array['collector','geologist','lab_reviewer','operator','supervisor','custodian','accountant','manager','auditor'],'Select allowed permission profiles');
  insert into mx_ops.invitations(id,scope_id,email,profiles,invited_by) values(p_id,v_scope,v_email,v_profiles,auth.uid())
   on conflict(scope_id,email) do update set profiles=excluded.profiles,invited_by=auth.uid(),expires_at=now()+interval '7 days',revoked_at=null,accepted_by=null,accepted_at=null returning to_jsonb(mx_ops.invitations.*) into rec;
 elsif p_action='scope.policy' then
  select * into s from mx_ops.scopes where id=p_id and org_id=p_org;perform mx_ops.rule(s.id is not null,'Workspace not found');perform mx_ops.check_version(s.version,p_expected);
  perform mx_ops.rule(p_payload->>'recognition_form' in('dore','recovered_metal','concentrate'),'Choose the production recognition form');
  -- Self-review stays disabled: small-team exception policy is not silently invented.
  update mx_ops.scopes set policy=jsonb_build_object('recognition_form',p_payload->>'recognition_form','recognition_confirmed',true,'self_review',false),version=version+1 where id=p_id returning * into s;v_scope:=s.id;rec:=to_jsonb(s);
 else raise exception 'RULE: Unknown administration action';end if;
 insert into mx_ops.audit(scope_id,entity_id,actor_id,request_id,action,version,permission,reason,snapshot) values(v_scope,p_id,auth.uid(),gen_random_uuid(),p_action,coalesce((rec->>'version')::integer,1),'access.admin',mx_ops.required_text(p_payload,'reason',500),rec);
 return rec;
end $$;
create function public.mx_ops_claim_invitations() returns integer language plpgsql security definer set search_path='' as $$
declare r mx_ops.invitations;n integer:=0;email_address text;begin
 if auth.uid() is null then raise exception 'ACCESS_DENIED';end if;
 select lower(email) into email_address from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if email_address is null then return 0;end if;
 for r in select * from mx_ops.invitations where email=email_address and accepted_at is null and revoked_at is null and expires_at>now() for update loop
  if not exists(select 1 from mx_ops.administrators a join mx_ops.scopes s on s.org_id=a.org_id where s.id=r.scope_id and a.user_id=r.invited_by and a.revoked_at is null) then continue;end if;
  insert into mx_ops.members(scope_id,user_id,profiles) values(r.scope_id,auth.uid(),r.profiles) on conflict(scope_id,user_id) do nothing;
  update mx_ops.invitations set accepted_at=now(),accepted_by=auth.uid() where id=r.id;
  insert into mx_ops.audit(scope_id,entity_id,actor_id,request_id,action,version,permission,reason,snapshot) values(r.scope_id,r.id,auth.uid(),gen_random_uuid(),'invitation.accept',1,'access.admin','Named account accepted approved invitation',jsonb_build_object('user_id',auth.uid(),'profiles',r.profiles));n:=n+1;
 end loop;return n;
end $$;
create function public.mx_ops_directory(p_scope uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare org uuid;begin select org_id into org from mx_ops.scopes where id=p_scope;
 if not mx_ops.is_admin(org) and not mx_ops.can(p_scope,'work.read') then raise exception 'ACCESS_DENIED';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',coalesce(nullif(u.raw_user_meta_data->>'display_name',''),split_part(u.email,'@',1)),'profiles',case when mx_ops.is_admin(org) then to_jsonb(m.profiles) else null end,'version',m.version,'revoked_at',m.revoked_at,'expires_at',m.expires_at)) from mx_ops.members m join auth.users u on u.id=m.user_id where m.scope_id=p_scope),'[]'::jsonb);
end $$;
insert into mx_ops.profile_permissions(profile,permission) values
('collector','geo.read'),
('collector','geo.capture'),
('collector','files.geo'),
('collector','work.read'),
('collector','work.write'),
('geologist','geo.read'),
('geologist','geo.capture'),
('geologist','geo.publish'),
('geologist','files.geo'),
('geologist','work.read'),
('geologist','work.write'),
('lab_reviewer','geo.read'),
('lab_reviewer','geo.capture'),
('lab_reviewer','lab.review'),
('lab_reviewer','files.geo'),
('lab_reviewer','work.read'),
('lab_reviewer','work.write'),
('operator','plant.read'),
('operator','plant.capture'),
('operator','gold.read'),
('operator','gold.capture'),
('operator','files.plant'),
('operator','files.gold'),
('operator','work.read'),
('operator','work.write'),
('supervisor','plant.read'),
('supervisor','plant.capture'),
('supervisor','plant.review'),
('supervisor','gold.read'),
('supervisor','gold.capture'),
('supervisor','gold.review'),
('supervisor','balance.prepare'),
('supervisor','balance.read'),
('supervisor','files.plant'),
('supervisor','files.gold'),
('supervisor','work.read'),
('supervisor','work.write'),
('custodian','gold.read'),
('custodian','gold.custody'),
('custodian','gold.custody.read'),
('custodian','files.custody'),
('custodian','files.gold'),
('custodian','work.read'),
('custodian','work.write'),
('accountant','plant.read'),
('accountant','gold.read'),
('accountant','balance.read'),
('accountant','balance.prepare'),
('accountant','balance.close'),
('accountant','report.read'),
('accountant','report.export'),
('accountant','files.plant'),
('accountant','files.gold'),
('accountant','work.read'),
('accountant','work.write'),
('manager','plant.read'),
('manager','gold.read'),
('manager','geo.read'),
('manager','balance.read'),
('manager','report.read'),
('manager','report.export'),
('manager','work.read'),
('auditor','plant.read'),
('auditor','gold.read'),
('auditor','geo.read'),
('auditor','balance.read'),
('auditor','report.read'),
('auditor','report.export'),
('auditor','audit.read'),
('auditor','work.read');
alter table mx_ops.organisations enable row level security;
create policy scoped_read on mx_ops.organisations for select to authenticated using (mx_ops.is_admin(id) or exists(select 1 from mx_ops.scopes s where s.org_id=id and mx_ops.can(s.id,'work.read')));
grant select on mx_ops.organisations to authenticated;
alter table mx_ops.scopes enable row level security;
create policy scoped_read on mx_ops.scopes for select to authenticated using (mx_ops.is_admin(org_id) or mx_ops.can(id,'work.read'));
grant select on mx_ops.scopes to authenticated;
alter table mx_ops.administrators enable row level security;
create policy scoped_read on mx_ops.administrators for select to authenticated using (user_id=auth.uid());
grant select on mx_ops.administrators to authenticated;
alter table mx_ops.members enable row level security;
create policy scoped_read on mx_ops.members for select to authenticated using (user_id=auth.uid() or mx_ops.is_admin((select org_id from mx_ops.scopes s where s.id=scope_id)));
grant select on mx_ops.members to authenticated;
alter table mx_ops.work_items enable row level security;
create policy scoped_read on mx_ops.work_items for select to authenticated using (mx_ops.can(scope_id,'work.read'));
grant select on mx_ops.work_items to authenticated;
alter table mx_ops.files enable row level security;
create policy scoped_read on mx_ops.files for select to authenticated using (mx_ops.can(scope_id,'files.'||family));
grant select on mx_ops.files to authenticated;
alter table mx_ops.documents enable row level security;
create policy scoped_read on mx_ops.documents for select to authenticated using (mx_ops.can(scope_id,'work.read') and exists(select 1 from mx_ops.files f where f.id=file_id and f.scope_id=mx_ops.documents.scope_id));
grant select on mx_ops.documents to authenticated;
alter table mx_ops.invitations enable row level security;
create policy scoped_read on mx_ops.invitations for select to authenticated using (mx_ops.is_admin((select org_id from mx_ops.scopes s where s.id=scope_id)));
grant select on mx_ops.invitations to authenticated;
alter table mx_ops.audit enable row level security;
create policy scoped_read on mx_ops.audit for select to authenticated using ((permission='access.admin' and mx_ops.is_admin((select org_id from mx_ops.scopes s where s.id=scope_id))) or (mx_ops.can(scope_id,'audit.read') and mx_ops.can(scope_id,permission)));
grant select on mx_ops.audit to authenticated;
alter table mx_ops.receipts enable row level security;
alter table mx_ops.profile_permissions enable row level security;
alter table mx_ops.schema_version enable row level security;
revoke all on all tables in schema mx_ops from anon;
revoke all on all functions in schema mx_ops from public,anon,authenticated;
grant execute on function mx_ops.can(uuid,text),mx_ops.is_admin(uuid) to authenticated;
revoke all on function public.mx_ops_context() from public,anon;
grant execute on function public.mx_ops_context() to authenticated;
revoke all on function public.mx_ops_bootstrap(uuid,text) from public,anon;
grant execute on function public.mx_ops_bootstrap(uuid,text) to authenticated;
revoke all on function public.mx_ops_admin(uuid,text,uuid,integer,jsonb) from public,anon;
grant execute on function public.mx_ops_admin(uuid,text,uuid,integer,jsonb) to authenticated;
revoke all on function public.mx_ops_claim_invitations() from public,anon;
grant execute on function public.mx_ops_claim_invitations() to authenticated;
revoke all on function public.mx_ops_directory(uuid) from public,anon;
grant execute on function public.mx_ops_directory(uuid) to authenticated;
commit;
