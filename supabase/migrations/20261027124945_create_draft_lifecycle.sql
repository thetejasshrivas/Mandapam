-- WP-12 REVIEW CANDIDATE: owner-checked CREATE lifecycle; no destructive cleanup.
begin;
alter table wedding_private.weddings add column draft_locked boolean not null default false;
grant update(draft_locked) on wedding_private.weddings to wedding_mutator;
create or replace view public.weddings with(security_invoker=true) as
 select id,owner_user_id,title,city,wedding_date,is_tentative,budget_ceiling_paise::text as budget_ceiling_paise,state,state_version::text as state_version,created_at,updated_at,draft_locked from wedding_private.weddings;

create function wedding_private.owned_wedding_lock(p_id uuid) returns wedding_private.weddings
language plpgsql security invoker set search_path='' as $body$
declare w wedding_private.weddings;
begin
 select * into w from wedding_private.weddings where id=p_id and owner_user_id=wedding_private.caller_uid() for update;
 if not found then raise exception using errcode='42501',message='Wedding not available'; end if;
 return w;
end;
$body$;
create function wedding_private.checked_draft(p_id uuid,p_version text) returns wedding_private.weddings
language plpgsql security invoker set search_path='' as $body$
declare w wedding_private.weddings;
begin
 w:=wedding_private.owned_wedding_lock(p_id);
 if w.state<>'DRAFT' then raise exception using errcode='55000',message='Draft operation unavailable after activation'; end if;
 if p_version is null or p_version !~ '^(0|[1-9][0-9]*)$' or length(p_version)>19 then raise exception using errcode='22023',message='Invalid version'; end if;
 if p_version::numeric>9223372036854775807 then raise exception using errcode='22023',message='Invalid version'; end if;
 if w.state_version<>p_version::bigint then raise exception using errcode='40001',message='Draft changed; reload and review'; end if;
 return w;
end;
$body$;
create function wedding_private.draft_date(p_value text) returns date
language plpgsql immutable security invoker set search_path='' as $body$
begin
 if p_value is null or p_value='' then return null; end if;
 if p_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception using errcode='22023',message='Use a calendar date'; end if;
 return p_value::date;
end;
$body$;
create function wedding_private.starter_templates() returns table(ordinal integer,template_key text,scope text,title text,prerequisite_key text)
language sql immutable security invoker set search_path='' as $body$
 values
 (1,'shared.roles.v1','shared','Agree planning responsibilities',null::text),
 (2,'shared.guest-list.v1','shared','Prepare a first guest list',null::text),
 (3,'shared.invite-wording.v1','shared','Choose invitation wording',null::text),
 (4,'shared.invite-review.v1','shared','Review invitation details','shared.invite-wording.v1'),
 (5,'shared.invite-send.v1','shared','Send invitations','shared.invite-review.v1'),
 (6,'shared.accessibility.v1','shared','Review travel and accessibility needs',null::text),
 (7,'ceremony.location.v1','ceremony','Record the planned location',null::text),
 (8,'ceremony.running-order.v1','ceremony','Draft a simple running order',null::text),
 (9,'ceremony.preparation.v1','ceremony','Review supplies and responsibilities',null::text)
$body$;

-- Archived draft ceremonies retain history but do not consume the live selection cap.
-- All existing ACTIVE identity/date/count protections remain unchanged.
create or replace function wedding_private.guard_ceremony() returns trigger language plpgsql set search_path='' as $body$
declare plan_state text;
begin
 select state into plan_state from wedding_private.weddings where id=new.wedding_id;
 if tg_op='INSERT' then
  if plan_state<>'DRAFT' then raise exception using errcode='23514',message='Ceremony setup is draft only'; end if;
  if (select count(*) from wedding_private.ceremonies where wedding_id=new.wedding_id and not is_archived)>=12 then raise exception using errcode='23514',message='Ceremony limit exceeded'; end if;
 elsif plan_state='DRAFT' then
  if old.is_archived and not new.is_archived and (select count(*) from wedding_private.ceremonies where wedding_id=new.wedding_id and not is_archived)>=12 then raise exception using errcode='23514',message='Ceremony limit exceeded'; end if;
 elsif plan_state='ACTIVE' then
  if (new.title,new.ceremony_date,new.is_archived) is distinct from (old.title,old.ceremony_date,old.is_archived) then raise exception using errcode='23514',message='Active ceremony configuration is read only'; end if;
  if new.guest_count is distinct from old.guest_count then
   if current_user='wedding_guest_initializer' then
    if old.guest_count is not null or new.guest_count is null or old.is_archived then raise exception using errcode='23514',message='Initialization requires unknown eligible count'; end if;
   elsif current_user='wedding_guest_approver' then
    if old.guest_count is null or new.guest_count is null or old.is_archived then raise exception using errcode='23514',message='Approval requires known eligible counts'; end if;
   else raise exception using errcode='23514',message='Guest count requires approved operation'; end if;
  end if;
 end if;
 return new;
end;
$body$;

create function public.save_draft_setup(p_id uuid,p_version text,p_title text,p_city text,p_date text,p_tentative boolean,p_budget text,p_ceremonies jsonb) returns boolean
language plpgsql security definer set search_path='' as $body$
declare w wedding_private.weddings; item jsonb; cid uuid; removed uuid[]; tid uuid; amount bigint; day date; ids uuid[]:=array[]::uuid[];
begin
 w:=wedding_private.checked_draft(p_id,p_version);
 if p_title is null or p_city is null or char_length(btrim(p_title)) not between 1 and 100 or char_length(btrim(p_city)) not between 1 and 100 then raise exception using errcode='22023',message='Invalid wedding title or city'; end if;
 day:=wedding_private.draft_date(p_date);
 if p_tentative is null or (day is null and not p_tentative) then raise exception using errcode='22023',message='Enter a date or mark tentative'; end if;
 if p_budget is not null then
  if p_budget !~ '^(0|[1-9][0-9]*)$' or length(p_budget)>12 then raise exception using errcode='22023',message='Invalid paise amount'; end if;
  amount:=p_budget::bigint;
  if amount>100000000000 then raise exception using errcode='22023',message='Budget exceeds supported limit'; end if;
 end if;
 if p_ceremonies is null or jsonb_typeof(p_ceremonies)<>'array' then raise exception using errcode='22023',message='Select ceremonies'; end if;
 if jsonb_array_length(p_ceremonies) not between 1 and 12 then raise exception using errcode='22023',message='Select one to twelve ceremonies'; end if;
 for item in select value from jsonb_array_elements(p_ceremonies) loop
  if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'title') is distinct from 'string' or char_length(btrim(item->>'title')) not between 1 and 80 then raise exception using errcode='22023',message='Invalid ceremony title'; end if;
  perform wedding_private.draft_date(item->>'ceremony_date');
  if item->>'guest_count' is not null and (item->>'guest_count' !~ '^[0-9]+$' or length(item->>'guest_count')>5) then raise exception using errcode='22023',message='Invalid guest count'; end if;
  if item->>'guest_count' is not null and (item->>'guest_count')::integer not between 1 and 10000 then raise exception using errcode='22023',message='Guest count out of bounds'; end if;
  cid:=(item->>'id')::uuid;
  if cid is not null then
   if cid=any(ids) then raise exception using errcode='22023',message='Duplicate ceremony reference'; end if;
   if not exists(select 1 from wedding_private.ceremonies where wedding_id=p_id and id=cid) then raise exception using errcode='42501',message='Ceremony not available'; end if;
   ids:=array_append(ids,cid);
  end if;
 end loop;
 if w.draft_locked and (cardinality(ids)<>jsonb_array_length(p_ceremonies) or exists(select 1 from wedding_private.ceremonies where wedding_id=p_id and not is_archived and not(id=any(ids))) or exists(select 1 from wedding_private.ceremonies where wedding_id=p_id and is_archived and id=any(ids))) then raise exception using errcode='55000',message='Rebuild confirmation required before changing selection'; end if;
 select coalesce(array_agg(id),array[]::uuid[]) into removed from wedding_private.ceremonies where wedding_id=p_id and not is_archived and not(id=any(ids));
 if exists(select 1 from wedding_private.tasks where wedding_id=p_id and ceremony_id=any(removed) and ((template_key is null and dismissed_at is null) or status='COMPLETED')) or exists(select 1 from wedding_private.cost_items where wedding_id=p_id and ceremony_id=any(removed)) then raise exception using errcode='23514',message='Retained manual work or financial history needs this ceremony'; end if;
 -- Soft-dismiss leaves first. External retained dependents block removal atomically.
 while exists(select 1 from wedding_private.tasks where wedding_id=p_id and ceremony_id=any(removed) and dismissed_at is null) loop
  select t.id into tid from wedding_private.tasks t where t.wedding_id=p_id and t.ceremony_id=any(removed) and t.dismissed_at is null and not exists(select 1 from wedding_private.tasks d where d.wedding_id=p_id and d.prerequisite_task_id=t.id and d.dismissed_at is null) limit 1;
  if not found then raise exception using errcode='23514',message='Dismiss dependent work first'; end if;
  update wedding_private.tasks set dismissed_at=statement_timestamp() where id=tid and wedding_id=p_id;
 end loop;
 update wedding_private.ceremonies set is_archived=true where wedding_id=p_id and id=any(removed);
 update wedding_private.weddings set title=btrim(p_title),city=btrim(p_city),wedding_date=day,is_tentative=p_tentative,budget_ceiling_paise=amount where id=p_id;
 for item in select value from jsonb_array_elements(p_ceremonies) loop
  cid:=(item->>'id')::uuid;
  if cid is null then
   insert into wedding_private.ceremonies(wedding_id,title,ceremony_date,guest_count) values(p_id,btrim(item->>'title'),wedding_private.draft_date(item->>'ceremony_date'),(item->>'guest_count')::integer);
  else
   update wedding_private.ceremonies set title=btrim(item->>'title'),ceremony_date=wedding_private.draft_date(item->>'ceremony_date'),guest_count=(item->>'guest_count')::integer,is_archived=false where wedding_id=p_id and id=cid;
  end if;
 end loop;
 insert into wedding_private.audit_events(wedding_id,actor_user_id,entity_type,entity_id,action,before_after) values(p_id,wedding_private.caller_uid(),'wedding',p_id,'DRAFT_SETUP_SAVED',jsonb_build_object('selected_count',jsonb_array_length(p_ceremonies),'removed_count',cardinality(removed)));
 return true;
end;
$body$;

create function public.generate_draft(p_id uuid,p_version text) returns integer
language plpgsql security definer set search_path='' as $body$
declare w wedding_private.weddings; seed record; c record; parent uuid; added integer:=0; changed integer;
begin
 w:=wedding_private.owned_wedding_lock(p_id);
 if w.state<>'DRAFT' then raise exception using errcode='55000',message='Generation is draft only'; end if;
 if w.draft_locked then return 0; end if;
 w:=wedding_private.checked_draft(p_id,p_version);
 if not exists(select 1 from wedding_private.ceremonies where wedding_id=p_id and not is_archived) then raise exception using errcode='23514',message='Select ceremonies first'; end if;
 for seed in select * from wedding_private.starter_templates() where scope='shared' order by ordinal loop
  if exists(select 1 from wedding_private.tasks where wedding_id=p_id and ceremony_id is null and template_key=seed.template_key) then continue; end if;
  parent:=null;
  if seed.prerequisite_key is not null then
   select id into parent from wedding_private.tasks where wedding_id=p_id and ceremony_id is null and template_key=seed.prerequisite_key and dismissed_at is null and archived_at is null;
   if not found then continue; end if;
  end if;
  insert into wedding_private.tasks(wedding_id,title,template_key,prerequisite_task_id) values(p_id,seed.title,seed.template_key,parent) on conflict(wedding_id,ceremony_id,template_key) where template_key is not null do nothing;
  get diagnostics changed=row_count;added:=added+changed;
 end loop;
 for c in select id,title from wedding_private.ceremonies where wedding_id=p_id and not is_archived order by created_at,id loop
  for seed in select * from wedding_private.starter_templates() where scope='ceremony' order by ordinal loop
   insert into wedding_private.tasks(wedding_id,ceremony_id,title,template_key) values(p_id,c.id,c.title||': '||seed.title,seed.template_key) on conflict(wedding_id,ceremony_id,template_key) where template_key is not null do nothing;
   get diagnostics changed=row_count;added:=added+changed;
  end loop;
 end loop;
 update wedding_private.weddings set draft_locked=true where id=p_id;
 insert into wedding_private.audit_events(wedding_id,actor_user_id,entity_type,entity_id,action,before_after) values(p_id,wedding_private.caller_uid(),'wedding',p_id,'DRAFT_GENERATED',jsonb_build_object('inserted_tasks',added));
 return added;
end;
$body$;
create function public.reopen_draft(p_id uuid,p_version text,p_confirm boolean,p_keep_manual boolean) returns boolean
language plpgsql security definer set search_path='' as $body$
declare w wedding_private.weddings;
begin
 w:=wedding_private.checked_draft(p_id,p_version);
 if p_confirm is distinct from true or p_keep_manual is distinct from true then raise exception using errcode='22023',message='Confirm rebuild and preservation of manual tasks'; end if;
 if exists(select 1 from wedding_private.cash_entries where wedding_id=p_id) or exists(select 1 from wedding_private.cost_items where wedding_id=p_id and (state<>'PLANNED' or commitment_paise is not null or actual_paise is not null or cancellation_settlement_paise is not null)) or exists(select 1 from wedding_private.tasks where wedding_id=p_id and status='COMPLETED') then raise exception using errcode='23514',message='Protected history prevents rebuilding'; end if;
 if not w.draft_locked then return true; end if;
 update wedding_private.weddings set draft_locked=false where id=p_id;
 insert into wedding_private.audit_events(wedding_id,actor_user_id,entity_type,entity_id,action,before_after) values(p_id,wedding_private.caller_uid(),'wedding',p_id,'DRAFT_REOPENED','{"manual_tasks_preserved":true}');
 return true;
end;
$body$;
create function public.add_draft_task(p_id uuid,p_version text,p_ceremony uuid,p_title text,p_description text,p_owner text,p_due text) returns uuid
language plpgsql security definer set search_path='' as $body$
declare tid uuid;
begin
 perform wedding_private.checked_draft(p_id,p_version);
 if p_title is null or char_length(btrim(p_title)) not between 1 and 160 or char_length(p_description)>1000 or char_length(p_owner)>100 then raise exception using errcode='22023',message='Invalid task details'; end if;
 if p_ceremony is not null and not exists(select 1 from wedding_private.ceremonies where wedding_id=p_id and id=p_ceremony and not is_archived) then raise exception using errcode='23503',message='Ceremony must belong to this draft'; end if;
 insert into wedding_private.tasks(wedding_id,ceremony_id,title,description,owner_name,due_date) values(p_id,p_ceremony,btrim(p_title),nullif(btrim(p_description),''),nullif(btrim(p_owner),''),wedding_private.draft_date(p_due)) returning id into tid;
 insert into wedding_private.audit_events(wedding_id,actor_user_id,entity_type,entity_id,action,before_after) values(p_id,wedding_private.caller_uid(),'task',tid,'DRAFT_TASK_ADDED','{}');
 return tid;
end;
$body$;
create function public.edit_draft_task(p_id uuid,p_task uuid,p_version text,p_title text,p_description text,p_owner text,p_due text) returns boolean
language plpgsql security definer set search_path='' as $body$
begin
 perform wedding_private.checked_draft(p_id,p_version);
 if p_title is null or char_length(btrim(p_title)) not between 1 and 160 or char_length(p_description)>1000 or char_length(p_owner)>100 then raise exception using errcode='22023',message='Invalid task details'; end if;
 if not exists(select 1 from wedding_private.tasks where wedding_id=p_id and id=p_task and dismissed_at is null and archived_at is null) then raise exception using errcode='42501',message='Task not available'; end if;
 update wedding_private.tasks set title=btrim(p_title),description=nullif(btrim(p_description),''),owner_name=nullif(btrim(p_owner),''),due_date=wedding_private.draft_date(p_due) where wedding_id=p_id and id=p_task;
 insert into wedding_private.audit_events(wedding_id,actor_user_id,entity_type,entity_id,action,before_after) values(p_id,wedding_private.caller_uid(),'task',p_task,'DRAFT_TASK_EDITED','{}');
 return true;
end;
$body$;
create function public.dismiss_draft_task(p_id uuid,p_task uuid,p_version text) returns boolean
language plpgsql security definer set search_path='' as $body$
begin
 perform wedding_private.checked_draft(p_id,p_version);
 if not exists(select 1 from wedding_private.tasks where wedding_id=p_id and id=p_task and archived_at is null) then raise exception using errcode='42501',message='Task not available'; end if;
 if exists(select 1 from wedding_private.tasks where wedding_id=p_id and id=p_task and dismissed_at is not null) then return true; end if;
 update wedding_private.tasks set dismissed_at=statement_timestamp() where wedding_id=p_id and id=p_task;
 insert into wedding_private.audit_events(wedding_id,actor_user_id,entity_type,entity_id,action,before_after) values(p_id,wedding_private.caller_uid(),'task',p_task,'DRAFT_TASK_DISMISSED','{}');
 return true;
end;
$body$;
create function public.activate_plan(p_id uuid,p_version text,p_confirm boolean) returns boolean
language plpgsql security definer set search_path='' as $body$
declare w wedding_private.weddings;
begin
 w:=wedding_private.owned_wedding_lock(p_id);
 if p_confirm is distinct from true then raise exception using errcode='22023',message='Explicit activation confirmation required'; end if;
 if w.state='ACTIVE' then return true; end if;
 w:=wedding_private.checked_draft(p_id,p_version);
 if not w.draft_locked then raise exception using errcode='23514',message='Generate and review the draft first'; end if;
 update wedding_private.weddings set state='ACTIVE' where id=p_id;
 insert into wedding_private.audit_events(wedding_id,actor_user_id,entity_type,entity_id,action,before_after) values(p_id,wedding_private.caller_uid(),'wedding',p_id,'PLAN_ACTIVATED','{"from":"DRAFT","to":"ACTIVE"}');
 return true;
end;
$body$;

revoke all on function wedding_private.owned_wedding_lock(uuid),wedding_private.checked_draft(uuid,text),wedding_private.draft_date(text),wedding_private.starter_templates() from public,anon,authenticated;
grant execute on function wedding_private.owned_wedding_lock(uuid),wedding_private.checked_draft(uuid,text),wedding_private.draft_date(text),wedding_private.starter_templates() to wedding_mutator;
grant create on schema public to wedding_mutator;
do $grants$
declare f record;
begin
 for f in select p.oid::regprocedure::text as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('save_draft_setup','generate_draft','reopen_draft','add_draft_task','edit_draft_task','dismiss_draft_task','activate_plan') loop
  execute format('alter function %s owner to wedding_mutator',f.signature);
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end;
$grants$;
revoke create on schema public from wedding_mutator;
revoke insert,update,delete on public.weddings from public,anon,authenticated;
grant select on public.weddings to authenticated;
commit;
