-- WP-10 REVIEW CANDIDATE. NOT APPLIED. No Gemini audit SQL used.
-- Requires a fresh, founder-confirmed isolated Supabase PostgreSQL 15+ database.
-- Seven private base tables; public caller-security TEXT money/version projections.
-- No exposed mutation RPC in this foundation. Later steps must add reviewed narrow RPCs.
begin;

do $preflight$
begin
 if current_setting('server_version_num')::integer < 150000 then
  raise exception 'PostgreSQL 15 or newer required';
 end if;
 if current_user <> 'postgres' then
  raise exception 'Review and apply using the confirmed Supabase migration administrator';
 end if;
end;
$preflight$;

-- Fail on conflicting role/schema names rather than reuse unknown privileges.
create role wedding_mutator nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role wedding_version_writer nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role wedding_guest_initializer nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role wedding_guest_approver nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
-- Only the trusted migration administrator may manage/assume these roles.
grant wedding_mutator, wedding_version_writer, wedding_guest_initializer, wedding_guest_approver to postgres;
create schema wedding_private;
revoke all on schema wedding_private from public, anon, authenticated;
grant usage on schema wedding_private to authenticated, wedding_mutator, wedding_version_writer, wedding_guest_initializer, wedding_guest_approver;
grant usage on schema auth to wedding_mutator, wedding_version_writer, wedding_guest_initializer, wedding_guest_approver;
grant execute on function auth.uid() to wedding_mutator, wedding_version_writer, wedding_guest_initializer, wedding_guest_approver;
alter default privileges in schema wedding_private revoke execute on functions from public;

create domain wedding_private.paise as bigint check(value between 0 and 100000000000);

create table wedding_private.weddings (
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null unique references auth.users(id) on delete restrict,
 title text not null check(title=btrim(title) and char_length(title) between 1 and 100),
 city text not null check(city=btrim(city) and char_length(city) between 1 and 100),
 wedding_date date, is_tentative boolean not null default true,
 budget_ceiling_paise wedding_private.paise,
 state text not null default 'DRAFT' check(state in ('DRAFT','ACTIVE','ARCHIVED')),
 state_version bigint not null default 0 check(state_version>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table wedding_private.ceremonies (
 id uuid primary key default gen_random_uuid(),
 wedding_id uuid not null references wedding_private.weddings(id) on delete restrict,
 title text not null check(title=btrim(title) and char_length(title) between 1 and 80),
 ceremony_date date,
 guest_count integer check(guest_count between 1 and 10000),
 venue_capacity integer check(venue_capacity between 1 and 50000),
 is_archived boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(wedding_id,id)
);
create table wedding_private.tasks (
 id uuid primary key default gen_random_uuid(),
 wedding_id uuid not null references wedding_private.weddings(id) on delete restrict,
 ceremony_id uuid,
 title text not null check(title=btrim(title) and char_length(title) between 1 and 160),
 description text check(char_length(description)<=1000),
 owner_name text check(char_length(owner_name)<=100), due_date date,
 status text not null default 'TO_DO' check(status in ('TO_DO','IN_PROGRESS','COMPLETED','DEFERRED')),
 prerequisite_task_id uuid, completed_at timestamptz,
 status_confirmed_at timestamptz, status_confirmed_by text check(char_length(status_confirmed_by)<=100),
 template_key text check(char_length(template_key) between 1 and 160),
 dismissed_at timestamptz, archived_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(wedding_id,id),
 foreign key(wedding_id,ceremony_id) references wedding_private.ceremonies(wedding_id,id) on delete restrict,
 foreign key(wedding_id,prerequisite_task_id) references wedding_private.tasks(wedding_id,id) on delete restrict,
 check(prerequisite_task_id is distinct from id),
 check((status='COMPLETED')=(completed_at is not null))
);
create unique index tasks_template_identity on wedding_private.tasks(wedding_id,ceremony_id,template_key)
 nulls not distinct where template_key is not null;
create index tasks_prerequisite_lookup on wedding_private.tasks(wedding_id,prerequisite_task_id) where prerequisite_task_id is not null;
create table wedding_private.cost_items (
 id uuid primary key default gen_random_uuid(),
 wedding_id uuid not null references wedding_private.weddings(id) on delete restrict,
 ceremony_id uuid,
 title text not null check(title=btrim(title) and char_length(title) between 1 and 160),
 state text not null default 'PLANNED' check(state in ('PLANNED','COMMITTED','FINAL','CANCELLED')),
 pricing_basis text not null check(pricing_basis in ('FIXED','PER_GUEST')),
 fixed_estimate_paise wedding_private.paise, per_guest_rate_paise wedding_private.paise,
 commitment_paise wedding_private.paise, actual_paise wedding_private.paise,
 cancellation_settlement_paise wedding_private.paise, expected_refund_paise wedding_private.paise,
 contract_notes text check(char_length(contract_notes)<=1000), archived_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(wedding_id,id),
 foreign key(wedding_id,ceremony_id) references wedding_private.ceremonies(wedding_id,id) on delete restrict,
 check((pricing_basis='FIXED' and per_guest_rate_paise is null) or (pricing_basis='PER_GUEST' and fixed_estimate_paise is null)),
 check(state<>'COMMITTED' or commitment_paise is not null),
 check(state<>'FINAL' or actual_paise is not null)
);
create table wedding_private.cash_entries (
 id uuid primary key default gen_random_uuid(),
 wedding_id uuid not null references wedding_private.weddings(id) on delete restrict,
 cost_item_id uuid not null,
 kind text not null check(kind in ('PAYMENT','REFUND_RECEIVED')),
 amount_paise wedding_private.paise not null check(amount_paise>0), occurred_on date not null,
 note text check(char_length(note)<=1000),
 status text not null default 'POSTED' check(status in ('POSTED','VOIDED')),
 intent_key text not null check(char_length(intent_key) between 1 and 160),
 created_at timestamptz not null default now(), voided_at timestamptz,
 void_reason text check(char_length(void_reason) between 1 and 1000), void_audit_event_id uuid,
 unique(wedding_id,id), unique(wedding_id,intent_key),
 foreign key(wedding_id,cost_item_id) references wedding_private.cost_items(wedding_id,id) on delete restrict,
 check((status='VOIDED')=(voided_at is not null)),
 check(status<>'VOIDED' or void_reason is not null)
);
create index cash_item_lookup on wedding_private.cash_entries(wedding_id,cost_item_id,status);
create table wedding_private.change_proposals (
 id uuid primary key default gen_random_uuid(),
 wedding_id uuid not null references wedding_private.weddings(id) on delete restrict,
 ceremony_id uuid not null,
 base_wedding_version bigint not null check(base_wedding_version>=0),
 old_guest_count integer not null check(old_guest_count between 1 and 10000),
 new_guest_count integer not null check(new_guest_count between 1 and 10000),
 status text not null default 'PENDING' check(status in ('PENDING','REJECTED','APPLIED')),
 preview_snapshot jsonb not null check(jsonb_typeof(preview_snapshot)='object' and octet_length(preview_snapshot::text)<=65536),
 created_at timestamptz not null default now(), decided_at timestamptz,
 applied_version bigint, applied_audit_event_id uuid,
 unique(wedding_id,id),
 foreign key(wedding_id,ceremony_id) references wedding_private.ceremonies(wedding_id,id) on delete restrict,
 check((status='PENDING')=(decided_at is null)),
 check((status='APPLIED')=(applied_version is not null)),
 check(status<>'APPLIED' or applied_audit_event_id is not null)
);
create table wedding_private.audit_events (
 id uuid primary key default gen_random_uuid(),
 wedding_id uuid not null references wedding_private.weddings(id) on delete restrict,
 actor_user_id uuid not null references auth.users(id) on delete restrict,
 entity_type text not null check(entity_type in ('wedding','ceremony','task','cost_item','cash_entry','proposal')),
 entity_id uuid not null, action text not null check(char_length(action) between 1 and 80),
 before_after jsonb not null default '{}' check(jsonb_typeof(before_after)='object' and octet_length(before_after::text)<=16384),
 created_at timestamptz not null default now(), unique(wedding_id,id)
);
alter table wedding_private.cash_entries add constraint cash_void_audit_same_wedding
 foreign key(wedding_id,void_audit_event_id) references wedding_private.audit_events(wedding_id,id) on delete restrict;
alter table wedding_private.change_proposals add constraint proposal_apply_audit_same_wedding
 foreign key(wedding_id,applied_audit_event_id) references wedding_private.audit_events(wedding_id,id) on delete restrict;

-- RLS: no editable JWT user_metadata or offline proxy name participates in authorization.
alter table wedding_private.weddings enable row level security;
alter table wedding_private.weddings force row level security;
create policy wedding_owner_read on wedding_private.weddings for select to authenticated,
 wedding_mutator,wedding_version_writer,wedding_guest_initializer,wedding_guest_approver
 using(owner_user_id=(select auth.uid()));
create policy wedding_owner_insert on wedding_private.weddings for insert to wedding_mutator
 with check(owner_user_id=(select auth.uid()) and state='DRAFT' and state_version=0);
create policy wedding_owner_update on wedding_private.weddings for update to wedding_mutator,wedding_version_writer,wedding_guest_initializer,wedding_guest_approver
 using(owner_user_id=(select auth.uid())) with check(owner_user_id=(select auth.uid()));
do $policies$
declare t text;
begin
 foreach t in array array['ceremonies','tasks','cost_items','cash_entries','change_proposals','audit_events'] loop
  execute format('alter table wedding_private.%I enable row level security',t);
  execute format('alter table wedding_private.%I force row level security',t);
  execute format('create policy owner_read on wedding_private.%I for select to authenticated,wedding_mutator,wedding_guest_initializer,wedding_guest_approver using(exists(select 1 from wedding_private.weddings w where w.id=wedding_id and w.owner_user_id=(select auth.uid())))',t);
  execute format('create policy owner_insert on wedding_private.%I for insert to wedding_mutator,wedding_guest_initializer,wedding_guest_approver with check(exists(select 1 from wedding_private.weddings w where w.id=wedding_id and w.owner_user_id=(select auth.uid())))',t);
  execute format('create policy owner_update on wedding_private.%I for update to wedding_mutator,wedding_guest_initializer,wedding_guest_approver using(exists(select 1 from wedding_private.weddings w where w.id=wedding_id and w.owner_user_id=(select auth.uid()))) with check(exists(select 1 from wedding_private.weddings w where w.id=wedding_id and w.owner_user_id=(select auth.uid())))',t);
 end loop;
end;
$policies$;

-- No client DML, role membership or publicly callable bypass. Internal role rights are narrow.
revoke all on all tables in schema wedding_private from public,anon,authenticated;
grant select on all tables in schema wedding_private to authenticated,wedding_mutator;
grant select on wedding_private.weddings,wedding_private.ceremonies,wedding_private.change_proposals,wedding_private.audit_events to wedding_guest_initializer,wedding_guest_approver;
grant select on wedding_private.weddings to wedding_version_writer;
grant insert on all tables in schema wedding_private to wedding_mutator;
grant update(title,city,wedding_date,is_tentative,budget_ceiling_paise,state,updated_at) on wedding_private.weddings to wedding_mutator;
grant update on wedding_private.ceremonies,wedding_private.tasks,wedding_private.cost_items,wedding_private.cash_entries to wedding_mutator;
grant update(status,decided_at) on wedding_private.change_proposals to wedding_mutator;
grant update(state_version,updated_at) on wedding_private.weddings to wedding_version_writer;
-- SELECT FOR UPDATE needs an UPDATE column privilege; identity/version remain denied.
grant update(updated_at) on wedding_private.weddings to wedding_guest_initializer,wedding_guest_approver;
grant update(guest_count,updated_at) on wedding_private.ceremonies to wedding_guest_initializer,wedding_guest_approver;
grant update(status,decided_at,applied_version,applied_audit_event_id) on wedding_private.change_proposals to wedding_guest_approver;
grant insert on wedding_private.audit_events to wedding_guest_initializer,wedding_guest_approver;

create function wedding_private.guard_wedding() returns trigger language plpgsql set search_path='' as $body$
begin
 if tg_op='DELETE' then raise exception using errcode='23514',message='History deletion is not supported'; end if;
 if auth.uid() is null or new.owner_user_id is distinct from auth.uid() then
  raise exception using errcode='42501',message='Owner authorization required';
 end if;
 if tg_op='INSERT' then
  if new.state<>'DRAFT' or new.state_version<>0 then raise exception using errcode='23514',message='Invalid initial wedding state'; end if;
  return new;
 end if;
 if (new.id,new.owner_user_id,new.created_at) is distinct from (old.id,old.owner_user_id,old.created_at) then
  raise exception using errcode='23514',message='Identity is immutable';
 end if;
 if current_user='wedding_version_writer' then
  if (to_jsonb(new)-'state_version'-'updated_at') is distinct from (to_jsonb(old)-'state_version'-'updated_at')
    or new.state_version<>old.state_version+1 then raise exception using errcode='23514',message='Invalid version write'; end if;
 else
  if new.state_version<>old.state_version then raise exception using errcode='23514',message='Version is database maintained'; end if;
  if old.state='ARCHIVED' or (new.state<>old.state and not(old.state='DRAFT' and new.state='ACTIVE')) then
   raise exception using errcode='23514',message='Unsupported wedding transition';
  end if;
  if old.state='ACTIVE' and (new.wedding_date,new.is_tentative) is distinct from (old.wedding_date,old.is_tentative) then
   raise exception using errcode='23514',message='Active dates are read only';
  end if;
  if new.state='ACTIVE' and old.state='DRAFT' then
   if not exists(select 1 from wedding_private.ceremonies where wedding_id=new.id and not is_archived)
     or (select count(*) from wedding_private.ceremonies where wedding_id=new.id and not is_archived)>12 then
    raise exception using errcode='23514',message='Select one to twelve ceremonies';
   end if;
   if exists(select 1 from wedding_private.tasks t join wedding_private.tasks p on p.wedding_id=t.wedding_id and p.id=t.prerequisite_task_id
     where t.wedding_id=new.id and t.dismissed_at is null and t.archived_at is null and (p.dismissed_at is not null or p.archived_at is not null)) then
    raise exception using errcode='23514',message='Retained prerequisite missing from plan';
   end if;
  end if;
  if (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at') then new.state_version:=old.state_version+1; end if;
 end if;
 new.updated_at:=statement_timestamp();
 return new;
end;
$body$;
create trigger a_guard_wedding before insert or update or delete on wedding_private.weddings
 for each row execute function wedding_private.guard_wedding();

create function wedding_private.guard_child() returns trigger language plpgsql set search_path='' as $body$
declare wid uuid;
begin
 if tg_op='DELETE' then raise exception using errcode='23514',message='History deletion is not supported'; end if;
 wid:=new.wedding_id;
 if auth.uid() is null then raise exception using errcode='42501',message='Authentication required'; end if;
 perform 1 from wedding_private.weddings where id=wid and owner_user_id=auth.uid() and state<>'ARCHIVED' for update;
 if not found then raise exception using errcode='42501',message='Wedding not available'; end if;
 if tg_op='UPDATE' then
  if (new.id,new.wedding_id,new.created_at) is distinct from (old.id,old.wedding_id,old.created_at) then
   raise exception using errcode='23514',message='Identity is immutable';
  end if;
  if to_jsonb(new) ? 'updated_at' then new:=jsonb_populate_record(new,jsonb_build_object('updated_at',statement_timestamp())); end if;
 end if;
 return new;
end;
$body$;

create function wedding_private.guard_ceremony() returns trigger language plpgsql set search_path='' as $body$
declare plan_state text;
begin
 select state into plan_state from wedding_private.weddings where id=new.wedding_id;
 if tg_op='INSERT' then
  if plan_state<>'DRAFT' then raise exception using errcode='23514',message='Ceremony setup is draft only'; end if;
  if (select count(*) from wedding_private.ceremonies where wedding_id=new.wedding_id)>=12 then raise exception using errcode='23514',message='Ceremony limit exceeded'; end if;
 elsif plan_state='ACTIVE' then
  if (new.title,new.ceremony_date,new.is_archived) is distinct from (old.title,old.ceremony_date,old.is_archived) then
   raise exception using errcode='23514',message='Active ceremony configuration is read only';
  end if;
  if new.guest_count is distinct from old.guest_count then
   if current_user='wedding_guest_initializer' then
    if old.guest_count is not null or new.guest_count is null or old.is_archived then raise exception using errcode='23514',message='Initialization requires unknown eligible count'; end if;
   elsif current_user='wedding_guest_approver' then
    if old.guest_count is null or new.guest_count is null or old.is_archived then raise exception using errcode='23514',message='Approval requires known eligible counts'; end if;
   else
    raise exception using errcode='23514',message='Guest count requires approved operation';
   end if;
  end if;
 end if;
 return new;
end;
$body$;

create function wedding_private.guard_task() returns trigger language plpgsql set search_path='' as $body$
declare cursor_id uuid; seen uuid[]:=array[new.id];
begin
 cursor_id:=new.prerequisite_task_id;
 while cursor_id is not null loop
  if cursor_id=any(seen) then raise exception using errcode='23514',message='Dependency cycle'; end if;
  seen:=array_append(seen,cursor_id);
  select prerequisite_task_id into cursor_id from wedding_private.tasks where wedding_id=new.wedding_id and id=cursor_id;
 end loop;
 if new.prerequisite_task_id is not null and exists(select 1 from wedding_private.tasks where wedding_id=new.wedding_id and id=new.prerequisite_task_id and (dismissed_at is not null or archived_at is not null)) then
  raise exception using errcode='23514',message='Prerequisite must be retained';
 end if;
 if tg_op='UPDATE' then
  if new.ceremony_id is distinct from old.ceremony_id then raise exception using errcode='23514',message='Task reparenting is not supported'; end if;
  if old.archived_at is not null and new.archived_at is distinct from old.archived_at then raise exception using errcode='23514',message='Archive restoration is not supported'; end if;
  if (new.dismissed_at is not null and old.dismissed_at is null) or (new.archived_at is not null and old.archived_at is null) then
   if exists(select 1 from wedding_private.tasks where wedding_id=new.wedding_id and prerequisite_task_id=new.id and dismissed_at is null) then
    raise exception using errcode='23514',message='Retained dependent requires this task';
   end if;
  end if;
  if new.archived_at is not null and old.archived_at is null and new.status='COMPLETED' then raise exception using errcode='23514',message='Completed task must remain visible'; end if;
  if new.prerequisite_task_id is distinct from old.prerequisite_task_id and new.status='COMPLETED' and exists(select 1 from wedding_private.tasks where wedding_id=new.wedding_id and id=new.prerequisite_task_id and status<>'COMPLETED') then raise exception using errcode='23514',message='Cannot attach unfinished prerequisite to completed task'; end if;
 end if;
 return new;
end;
$body$;

create function wedding_private.guard_cost() returns trigger language plpgsql set search_path='' as $body$
begin
 if tg_op='UPDATE' then
  if new.ceremony_id is distinct from old.ceremony_id then raise exception using errcode='23514',message='Cost reparenting is not supported'; end if;
  if new.state<>old.state and not((old.state='PLANNED' and new.state in('COMMITTED','FINAL','CANCELLED')) or (old.state='COMMITTED' and new.state in('FINAL','CANCELLED'))) then raise exception using errcode='23514',message='Unsupported financial transition'; end if;
  if old.archived_at is not null and new.archived_at is distinct from old.archived_at then raise exception using errcode='23514',message='Archive restoration is not supported'; end if;
  if new.archived_at is not null and old.archived_at is null then
   if old.state<>'PLANNED' or new.state<>'PLANNED' or old.commitment_paise is not null or old.actual_paise is not null or old.cancellation_settlement_paise is not null
    or exists(select 1 from wedding_private.cash_entries where wedding_id=new.wedding_id and cost_item_id=new.id)
    or exists(select 1 from wedding_private.audit_events where wedding_id=new.wedding_id and entity_id=new.id) then
    raise exception using errcode='23514',message='Financial history cannot be archived away';
   end if;
  end if;
 end if;
 return new;
end;
$body$;

create function wedding_private.guard_cash() returns trigger language plpgsql set search_path='' as $body$
declare paid numeric; refunded numeric;
begin
 perform 1 from wedding_private.cost_items where wedding_id=new.wedding_id and id=new.cost_item_id for update;
 if not found then raise exception using errcode='23503',message='Cost item must belong to wedding'; end if;
 if tg_op='INSERT' and new.status<>'POSTED' then raise exception using errcode='23514',message='Cash starts posted'; end if;
 if tg_op='UPDATE' then
  if (to_jsonb(new)-'status'-'voided_at'-'void_reason'-'void_audit_event_id') is distinct from (to_jsonb(old)-'status'-'voided_at'-'void_reason'-'void_audit_event_id') then
   raise exception using errcode='23514',message='Posted cash payload is immutable';
  end if;
  if old.status='VOIDED' and to_jsonb(new) is distinct from to_jsonb(old) then raise exception using errcode='23514',message='Voided history is immutable'; end if;
 end if;
 select coalesce(sum(amount_paise) filter(where kind='PAYMENT'),0),coalesce(sum(amount_paise) filter(where kind='REFUND_RECEIVED'),0)
 into paid,refunded from wedding_private.cash_entries where wedding_id=new.wedding_id and cost_item_id=new.cost_item_id and status='POSTED' and id<>new.id;
 if new.status='POSTED' then
  if new.kind='PAYMENT' then paid:=paid+new.amount_paise; else refunded:=refunded+new.amount_paise; end if;
 end if;
 if refunded>paid then raise exception using errcode='23514',message='Effective refunds exceed payments'; end if;
 if new.status='VOIDED' and new.void_audit_event_id is null then
  raise exception using errcode='23514',message='Void requires a same-transaction audit reference';
 end if;
 return new;
end;
$body$;

create function wedding_private.guard_proposal() returns trigger language plpgsql set search_path='' as $body$
declare w wedding_private.weddings; c wedding_private.ceremonies;
begin
 select * into w from wedding_private.weddings where id=new.wedding_id;
 select * into c from wedding_private.ceremonies where wedding_id=new.wedding_id and id=new.ceremony_id;
 if c.id is null then raise exception using errcode='23503',message='Ceremony must belong to wedding'; end if;
 if tg_op='INSERT' then
  if w.state<>'ACTIVE' or c.is_archived or c.guest_count is null or new.status<>'PENDING'
    or new.base_wedding_version<>w.state_version or new.old_guest_count<>c.guest_count then
   raise exception using errcode='23514',message='Proposal requires current active context';
  end if;
 else
  if (to_jsonb(new)-'status'-'decided_at'-'applied_version'-'applied_audit_event_id') is distinct from (to_jsonb(old)-'status'-'decided_at'-'applied_version'-'applied_audit_event_id') then raise exception using errcode='23514',message='Proposal context is immutable'; end if;
  if old.status<>'PENDING' and to_jsonb(new) is distinct from to_jsonb(old) then raise exception using errcode='23514',message='Proposal is terminal'; end if;
  if new.status='APPLIED' and old.status='PENDING' then
   if current_user<>'wedding_guest_approver' or w.state<>'ACTIVE' or c.is_archived or c.guest_count is distinct from new.new_guest_count
     or new.applied_version<>w.state_version or new.applied_version<=old.base_wedding_version then
    raise exception using errcode='23514',message='Approval requires restricted atomic operation';
   end if;
  end if;
 end if;
 return new;
end;
$body$;

create function wedding_private.guard_audit() returns trigger language plpgsql set search_path='' as $body$
declare valid_entity boolean:=false;
begin
 if tg_op<>'INSERT' then raise exception using errcode='23514',message='Audit history is append only'; end if;
 if new.actor_user_id is distinct from auth.uid() then raise exception using errcode='42501',message='Audit actor must be caller'; end if;
 case new.entity_type
  when 'wedding' then select exists(select 1 from wedding_private.weddings where id=new.entity_id and id=new.wedding_id) into valid_entity;
  when 'ceremony' then select exists(select 1 from wedding_private.ceremonies where id=new.entity_id and wedding_id=new.wedding_id) into valid_entity;
  when 'task' then select exists(select 1 from wedding_private.tasks where id=new.entity_id and wedding_id=new.wedding_id) into valid_entity;
  when 'cost_item' then select exists(select 1 from wedding_private.cost_items where id=new.entity_id and wedding_id=new.wedding_id) into valid_entity;
  when 'cash_entry' then select exists(select 1 from wedding_private.cash_entries where id=new.entity_id and wedding_id=new.wedding_id) into valid_entity;
  when 'proposal' then select exists(select 1 from wedding_private.change_proposals where id=new.entity_id and wedding_id=new.wedding_id) into valid_entity;
  else valid_entity:=false;
 end case;
 if not valid_entity then raise exception using errcode='23503',message='Audit entity must belong to wedding'; end if;
 return new;
end;
$body$;

create function wedding_private.bump_wedding_version() returns trigger language plpgsql security definer set search_path='' as $body$
begin
 if tg_op='UPDATE' and (to_jsonb(new)-'updated_at') is not distinct from (to_jsonb(old)-'updated_at') then return new; end if;
 update wedding_private.weddings set state_version=state_version+1 where id=new.wedding_id and owner_user_id=auth.uid();
 if not found then raise exception using errcode='42501',message='Version owner authorization required'; end if;
 return new;
end;
$body$;
grant create on schema wedding_private to wedding_version_writer;
alter function wedding_private.bump_wedding_version() owner to wedding_version_writer;
revoke create on schema wedding_private from wedding_version_writer;

do $triggers$
declare t text;
begin
 foreach t in array array['ceremonies','tasks','cost_items','cash_entries','change_proposals','audit_events'] loop
  execute format('create trigger a_guard_child before insert or update or delete on wedding_private.%I for each row execute function wedding_private.guard_child()',t);
 end loop;
 foreach t in array array['ceremonies','tasks','cost_items','cash_entries'] loop
  execute format('create trigger z_bump_version after insert or update on wedding_private.%I for each row execute function wedding_private.bump_wedding_version()',t);
 end loop;
end;
$triggers$;
create trigger b_guard_ceremony before insert or update on wedding_private.ceremonies for each row execute function wedding_private.guard_ceremony();
create trigger b_guard_task before insert or update on wedding_private.tasks for each row execute function wedding_private.guard_task();
create trigger b_guard_cost before insert or update on wedding_private.cost_items for each row execute function wedding_private.guard_cost();
create trigger b_guard_cash before insert or update on wedding_private.cash_entries for each row execute function wedding_private.guard_cash();
create trigger b_guard_proposal before insert or update on wedding_private.change_proposals for each row execute function wedding_private.guard_proposal();
create trigger b_guard_audit before insert or update on wedding_private.audit_events for each row execute function wedding_private.guard_audit();
revoke all on all functions in schema wedding_private from public,anon,authenticated;

-- DTO projections prevent BIGINT JSON Number coercion before the application mapper.
create view public.weddings with(security_invoker=true) as
 select id,owner_user_id,title,city,wedding_date,is_tentative,budget_ceiling_paise::text as budget_ceiling_paise,state,state_version::text as state_version,created_at,updated_at from wedding_private.weddings;
create view public.ceremonies with(security_invoker=true) as select * from wedding_private.ceremonies;
create view public.tasks with(security_invoker=true) as select * from wedding_private.tasks;
create view public.cost_items with(security_invoker=true) as
 select id,wedding_id,ceremony_id,title,state,pricing_basis,fixed_estimate_paise::text as fixed_estimate_paise,per_guest_rate_paise::text as per_guest_rate_paise,
 commitment_paise::text as commitment_paise,actual_paise::text as actual_paise,cancellation_settlement_paise::text as cancellation_settlement_paise,
 expected_refund_paise::text as expected_refund_paise,contract_notes,archived_at,created_at,updated_at from wedding_private.cost_items;
create view public.cash_entries with(security_invoker=true) as
 select id,wedding_id,cost_item_id,kind,amount_paise::text as amount_paise,occurred_on,note,status,intent_key,created_at,voided_at,void_reason,void_audit_event_id from wedding_private.cash_entries;
create view public.change_proposals with(security_invoker=true) as
 select id,wedding_id,ceremony_id,base_wedding_version::text as base_wedding_version,old_guest_count,new_guest_count,status,preview_snapshot,created_at,decided_at,applied_version::text as applied_version,applied_audit_event_id from wedding_private.change_proposals;
create view public.audit_events with(security_invoker=true) as select * from wedding_private.audit_events;
revoke all on public.weddings,public.ceremonies,public.tasks,public.cost_items,public.cash_entries,public.change_proposals,public.audit_events from public,anon,authenticated;
grant select on public.weddings,public.ceremonies,public.tasks,public.cost_items,public.cash_entries,public.change_proposals,public.audit_events to authenticated;

-- No application mutation function is exposed. Dedicated role grants alone are not
-- an approval implementation. WP-12/15/18 must add owner-checking audited RPCs;
-- all RPCs must lock wedding BEFORE any child DML and revoke default PUBLIC EXECUTE.
commit;
