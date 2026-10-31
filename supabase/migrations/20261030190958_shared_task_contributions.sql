-- FINAL founder-selected contributor model. Local review candidate only.
begin;
alter table wedding_private.tasks add column assigned_member_id uuid,
 add column progress_note text check(progress_note is null or char_length(progress_note)<=500),
 add column progress_updated_by uuid references auth.users(id) on delete restrict,
 add column progress_updated_at timestamptz,
 add constraint task_progress_actor_time check((progress_updated_by is null)=(progress_updated_at is null)),
 add constraint task_member_same_wedding foreign key(wedding_id,assigned_member_id) references wedding_access.memberships(wedding_id,user_id) on delete restrict;
create index task_member_assignment on wedding_private.tasks(wedding_id,assigned_member_id) where assigned_member_id is not null;
-- Existing caller-security view keeps its original columns/ACL; append planning-only fields.
create or replace view public.tasks with(security_invoker=true) as select t.* from wedding_private.tasks t;
create role wedding_contributor nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant wedding_contributor to postgres;
grant usage on schema wedding_private,wedding_access to wedding_contributor;
grant execute on function wedding_private.caller_uid() to wedding_contributor;
grant select(id,owner_user_id,state,state_version) on wedding_private.weddings to wedding_contributor;
grant update(updated_at) on wedding_private.weddings to wedding_contributor;
grant select on wedding_private.tasks to wedding_contributor;
grant update(status,completed_at,status_confirmed_by,status_confirmed_at,progress_note,progress_updated_by,progress_updated_at) on wedding_private.tasks to wedding_contributor;
grant insert(wedding_id,actor_user_id,entity_type,entity_id,action,before_after) on wedding_private.audit_events to wedding_contributor;
grant usage on schema wedding_access to wedding_mutator,wedding_version_writer;
grant select(wedding_id,user_id,revoked_at) on wedding_access.memberships to wedding_contributor,wedding_version_writer,wedding_mutator;
create policy contribution_membership_read on wedding_access.memberships for select to wedding_contributor,wedding_version_writer using(user_id=wedding_private.caller_uid() and revoked_at is null);
create policy assignment_admin_membership_read on wedding_access.memberships for select to wedding_mutator using(exists(select 1 from wedding_private.weddings w where w.id=wedding_id and w.owner_user_id=wedding_private.caller_uid()));
create policy contribution_wedding_read on wedding_private.weddings for select to wedding_contributor using(owner_user_id=wedding_private.caller_uid() or exists(select 1 from wedding_access.memberships m where m.wedding_id=weddings.id and m.user_id=wedding_private.caller_uid() and m.revoked_at is null));
create policy contribution_wedding_lock on wedding_private.weddings for update to wedding_contributor using(owner_user_id=wedding_private.caller_uid() or exists(select 1 from wedding_access.memberships m where m.wedding_id=weddings.id and m.user_id=wedding_private.caller_uid() and m.revoked_at is null)) with check(owner_user_id=wedding_private.caller_uid() or exists(select 1 from wedding_access.memberships m where m.wedding_id=weddings.id and m.user_id=wedding_private.caller_uid() and m.revoked_at is null));
create policy contribution_task_read on wedding_private.tasks for select to wedding_contributor using(exists(select 1 from wedding_private.weddings w where w.id=wedding_id));
create policy contribution_task_update on wedding_private.tasks for update to wedding_contributor
 using(exists(select 1 from wedding_private.weddings w where w.id=wedding_id and w.state='ACTIVE' and (w.owner_user_id=wedding_private.caller_uid() or (assigned_member_id=wedding_private.caller_uid() and exists(select 1 from wedding_access.memberships m where m.wedding_id=w.id and m.user_id=wedding_private.caller_uid() and m.revoked_at is null)))))
 with check(exists(select 1 from wedding_private.weddings w where w.id=wedding_id and w.state='ACTIVE' and (w.owner_user_id=wedding_private.caller_uid() or (assigned_member_id=wedding_private.caller_uid() and exists(select 1 from wedding_access.memberships m where m.wedding_id=w.id and m.user_id=wedding_private.caller_uid() and m.revoked_at is null)))));
create policy contribution_audit_append on wedding_private.audit_events for insert to wedding_contributor with check(actor_user_id=wedding_private.caller_uid() and entity_type='task' and action='TASK_PROGRESS_UPDATED' and exists(select 1 from wedding_private.tasks t join wedding_private.weddings w on w.id=t.wedding_id where t.wedding_id=audit_events.wedding_id and t.id=entity_id and(w.owner_user_id=wedding_private.caller_uid() or t.assigned_member_id=wedding_private.caller_uid())));
grant select(state_version) on wedding_private.weddings to wedding_planning_reader;
grant select(assigned_member_id,progress_note,progress_updated_at) on wedding_private.tasks to wedding_planning_reader;
create or replace function wedding_private.guard_wedding() returns trigger language plpgsql set search_path='' as $body$
begin
 -- Only the owner-confirmed SECURITY DEFINER deletion operation can enter this role.
 if tg_op='DELETE' and current_user='wedding_deleter' then return old; end if;
 if tg_op='DELETE' then raise exception using errcode='23514',message='History deletion is not supported'; end if;
 if current_user='wedding_version_writer' and tg_op='UPDATE' and old.owner_user_id is distinct from wedding_private.caller_uid() then
  if old.state<>'ACTIVE' or new.state_version<>old.state_version+1 or (to_jsonb(new)-'state_version'-'updated_at') is distinct from (to_jsonb(old)-'state_version'-'updated_at')
   or not exists(select 1 from wedding_access.memberships m where m.wedding_id=old.id and m.user_id=wedding_private.caller_uid() and m.revoked_at is null) then
   raise exception using errcode='42501',message='Member version write denied';end if;
  new.updated_at:=statement_timestamp();return new;
 end if;
 if wedding_private.caller_uid() is null or new.owner_user_id is distinct from wedding_private.caller_uid() then
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
create or replace function wedding_private.guard_child() returns trigger language plpgsql set search_path='' as $body$
declare wid uuid;
begin
 -- Only the owner-confirmed SECURITY DEFINER deletion operation can enter this role.
 if tg_op='DELETE' and current_user='wedding_deleter' then return old; end if;
 if tg_op='DELETE' then raise exception using errcode='23514',message='History deletion is not supported'; end if;
 if current_user='wedding_contributor' then
  perform 1 from wedding_private.weddings w where w.id=new.wedding_id and w.state='ACTIVE' and
   (w.owner_user_id=wedding_private.caller_uid() or exists(select 1 from wedding_access.memberships m where m.wedding_id=w.id and m.user_id=wedding_private.caller_uid() and m.revoked_at is null)) for update;
  if not found then raise exception using errcode='42501',message='Task not available';end if;
  if tg_table_name='tasks' and tg_op='UPDATE' then
   if (to_jsonb(new)-array['status','completed_at','status_confirmed_by','status_confirmed_at','progress_note','progress_updated_by','progress_updated_at','updated_at']) is distinct from (to_jsonb(old)-array['status','completed_at','status_confirmed_by','status_confirmed_at','progress_note','progress_updated_by','progress_updated_at','updated_at']) then raise exception using errcode='42501',message='Protected task field';end if;
   if new.progress_updated_by is distinct from wedding_private.caller_uid() then raise exception using errcode='42501',message='Trusted progress author required';end if;
   if (new.status_confirmed_by,new.status_confirmed_at) is distinct from (old.status_confirmed_by,old.status_confirmed_at) and (new.status=old.status or new.status_confirmed_by is not null or new.status_confirmed_at is not null) then raise exception using errcode='42501',message='Members cannot assert status confirmation';end if;
  elsif tg_table_name='audit_events' and tg_op='INSERT' then
   if new.actor_user_id is distinct from wedding_private.caller_uid() or new.entity_type<>'task' or new.action<>'TASK_PROGRESS_UPDATED' or not exists(select 1 from wedding_private.tasks t where t.wedding_id=new.wedding_id and t.id=new.entity_id) then raise exception using errcode='42501',message='Invalid contribution audit';end if;
  else raise exception using errcode='42501',message='Unsupported contribution';end if;
  if to_jsonb(new)?'updated_at' then new:=jsonb_populate_record(new,jsonb_build_object('updated_at',statement_timestamp()));end if;
  return new;
 end if;
 wid:=new.wedding_id;
 if wedding_private.caller_uid() is null then raise exception using errcode='42501',message='Authentication required'; end if;
 perform 1 from wedding_private.weddings where id=wid and owner_user_id=wedding_private.caller_uid() and state<>'ARCHIVED' for update;
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

create policy contribution_version_read on wedding_private.weddings for select to wedding_version_writer using(state='ACTIVE' and exists(select 1 from wedding_access.memberships m where m.wedding_id=weddings.id and m.user_id=wedding_private.caller_uid() and m.revoked_at is null));
create policy contribution_version_update on wedding_private.weddings for update to wedding_version_writer using(state='ACTIVE' and exists(select 1 from wedding_access.memberships m where m.wedding_id=weddings.id and m.user_id=wedding_private.caller_uid() and m.revoked_at is null)) with check(state='ACTIVE' and exists(select 1 from wedding_access.memberships m where m.wedding_id=weddings.id and m.user_id=wedding_private.caller_uid() and m.revoked_at is null));
create or replace function wedding_private.bump_wedding_version() returns trigger language plpgsql security definer set search_path='' as $body$
begin
 if tg_op='UPDATE' and (to_jsonb(new)-'updated_at') is not distinct from (to_jsonb(old)-'updated_at') then return new;end if;
 if tg_table_name='tasks' and tg_op='UPDATE' then
  if new.assigned_member_id=wedding_private.caller_uid() and
   (to_jsonb(new)-array['status','completed_at','status_confirmed_by','status_confirmed_at','progress_note','progress_updated_by','progress_updated_at','updated_at']) is not distinct from (to_jsonb(old)-array['status','completed_at','status_confirmed_by','status_confirmed_at','progress_note','progress_updated_by','progress_updated_at','updated_at']) and exists(select 1 from wedding_access.memberships m where m.wedding_id=new.wedding_id and m.user_id=wedding_private.caller_uid() and m.revoked_at is null) then
   update wedding_private.weddings set state_version=state_version+1 where id=new.wedding_id and state='ACTIVE';
   if not found then raise exception using errcode='42501',message='Task not available';end if;return new;
  end if;
 end if;
 update wedding_private.weddings set state_version=state_version+1 where id=new.wedding_id and owner_user_id=wedding_private.caller_uid();
 if not found then raise exception using errcode='42501',message='Version owner authorization required';end if;
 return new;
end;$body$;

create function wedding_private.guard_task_assignment() returns trigger language plpgsql set search_path='' as $g$
begin
 if (tg_op='INSERT' and new.assigned_member_id is not null) or (tg_op='UPDATE' and new.assigned_member_id is distinct from old.assigned_member_id) then
  if not exists(select 1 from wedding_private.weddings w where w.id=new.wedding_id and w.owner_user_id=wedding_private.caller_uid()) then raise exception using errcode='42501',message='Admin assignment required';end if;
  if new.assigned_member_id is not null and not exists(select 1 from wedding_access.memberships m where m.wedding_id=new.wedding_id and m.user_id=new.assigned_member_id and m.revoked_at is null) then raise exception using errcode='42501',message='Active Member required';end if;
 end if;return new;
end;$g$;
revoke all on function wedding_private.guard_task_assignment() from public,anon,authenticated;
create trigger c_guard_assignment before insert or update on wedding_private.tasks for each row execute function wedding_private.guard_task_assignment();
create function wedding_access.assign_task(p_id uuid,p_task uuid,p_version text,p_member uuid) returns jsonb language plpgsql security definer set search_path='' as $b$
declare w wedding_private.weddings;t wedding_private.tasks;begin
 if wedding_private.caller_uid() is null or coalesce((coalesce(nullif(current_setting('request.jwt.claim',true),''),nullif(current_setting('request.jwt.claims',true),''))::jsonb->>'is_anonymous')::boolean,false) then raise exception using errcode='42501',message='Task not available';end if;
 w:=wedding_private.owned_wedding_lock(p_id);
 if w.state='ARCHIVED' then raise exception using errcode='55000',message='Plan not editable';end if;
 if p_version is null or p_version!~'^(0|[1-9][0-9]*)$' or length(p_version)>19 or p_version::numeric>9223372036854775807 then raise exception using errcode='22023',message='Invalid version';end if;
 if p_version::bigint<>w.state_version then raise exception using errcode='40001',message='Plan changed';end if;
 select * into t from wedding_private.tasks where wedding_id=p_id and id=p_task for update;
 if not found or t.archived_at is not null or t.dismissed_at is not null then raise exception using errcode='42501',message='Task not available';end if;
 if p_member is not null and not exists(select 1 from wedding_access.memberships m where m.wedding_id=p_id and m.user_id=p_member and m.revoked_at is null) then raise exception using errcode='42501',message='Member not available';end if;
 if t.assigned_member_id is distinct from p_member then
  update wedding_private.tasks set assigned_member_id=p_member where wedding_id=p_id and id=p_task;
  insert into wedding_private.audit_events(wedding_id,actor_user_id,entity_type,entity_id,action,before_after) values(p_id,wedding_private.caller_uid(),'task',p_task,'TASK_ASSIGNED',jsonb_build_object('before',t.assigned_member_id,'after',p_member));
 end if;
 return jsonb_build_object('version',(select state_version::text from wedding_private.weddings where id=p_id));
end;$b$;
create function wedding_access.task_members(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $b$
begin
 if wedding_private.caller_uid() is null or coalesce((coalesce(nullif(current_setting('request.jwt.claim',true),''),nullif(current_setting('request.jwt.claims',true),''))::jsonb->>'is_anonymous')::boolean,false) or not exists(select 1 from wedding_private.weddings w where w.id=p_id and w.owner_user_id=wedding_private.caller_uid()) then raise exception using errcode='42501',message='Wedding not available';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'label','Member · '||right(m.user_id::text,8)) order by m.user_id) from wedding_access.memberships m where m.wedding_id=p_id and m.revoked_at is null),'[]'::jsonb);
end;$b$;
create function wedding_access.contribute_task(p_id uuid,p_task uuid,p_version text,p_status text,p_note text,p_confirm boolean) returns jsonb language plpgsql security definer set search_path='' as $b$
declare w record;t wedding_private.tasks;new_note text;begin
 if wedding_private.caller_uid() is null or coalesce((coalesce(nullif(current_setting('request.jwt.claim',true),''),nullif(current_setting('request.jwt.claims',true),''))::jsonb->>'is_anonymous')::boolean,false) then raise exception using errcode='42501',message='Task not available';end if;
 select id,owner_user_id,state,state_version into w from wedding_private.weddings where id=p_id for update;
 if not found then raise exception using errcode='42501',message='Task not available';end if;
 -- Recheck membership AFTER the parent lock: revoke/reassign serialize on the same row.
 if w.owner_user_id is distinct from wedding_private.caller_uid() and not exists(select 1 from wedding_access.memberships m where m.wedding_id=p_id and m.user_id=wedding_private.caller_uid() and m.revoked_at is null) then raise exception using errcode='42501',message='Task not available';end if;
 select * into t from wedding_private.tasks where wedding_id=p_id and id=p_task for update;
 if not found or t.archived_at is not null or t.dismissed_at is not null or (w.owner_user_id is distinct from wedding_private.caller_uid() and t.assigned_member_id is distinct from wedding_private.caller_uid()) then raise exception using errcode='42501',message='Task not available';end if;
 if w.state<>'ACTIVE' then raise exception using errcode='55000',message='Activate plan before progress updates';end if;
 if p_version is null or p_version!~'^(0|[1-9][0-9]*)$' or length(p_version)>19 or p_version::numeric>9223372036854775807 then raise exception using errcode='22023',message='Invalid version';end if;
 if p_version::bigint<>w.state_version then raise exception using errcode='40001',message='Plan changed';end if;
 if p_status is null or p_status not in('TO_DO','IN_PROGRESS','COMPLETED','DEFERRED') or char_length(p_note)>500 then raise exception using errcode='22023',message='Invalid progress';end if;
 if t.status='COMPLETED' and p_status<>t.status and p_confirm is distinct from true then raise exception using errcode='23514',message='Confirm reopening';end if;
 if p_status='COMPLETED' and p_status<>t.status and t.prerequisite_task_id is not null and not exists(select 1 from wedding_private.tasks p where p.wedding_id=p_id and p.id=t.prerequisite_task_id and p.status='COMPLETED' and p.archived_at is null and p.dismissed_at is null) then raise exception using errcode='23514',message='Prerequisite must be completed; ask Admin to review';end if;
 new_note:=nullif(btrim(p_note),'');
 if t.status<>p_status or t.progress_note is distinct from new_note then
  update wedding_private.tasks set status=p_status,status_confirmed_by=case when t.status=p_status then t.status_confirmed_by else null end,status_confirmed_at=case when t.status=p_status then t.status_confirmed_at else null end,completed_at=case when t.status=p_status then t.completed_at when p_status='COMPLETED' then statement_timestamp() else null end,progress_note=new_note,progress_updated_by=wedding_private.caller_uid(),progress_updated_at=statement_timestamp() where wedding_id=p_id and id=p_task;
  insert into wedding_private.audit_events(wedding_id,actor_user_id,entity_type,entity_id,action,before_after) values(p_id,wedding_private.caller_uid(),'task',p_task,'TASK_PROGRESS_UPDATED',jsonb_build_object('before',jsonb_build_object('status',t.status,'note',t.progress_note),'after',jsonb_build_object('status',p_status,'note',new_note)));
 end if;
 return jsonb_build_object('version',(select state_version::text from wedding_private.weddings where id=p_id));
end;$b$;
grant create on schema wedding_access to wedding_mutator,wedding_contributor;
alter function wedding_access.assign_task(uuid,uuid,text,uuid) owner to wedding_mutator;
alter function wedding_access.task_members(uuid) owner to wedding_mutator;
alter function wedding_access.contribute_task(uuid,uuid,text,text,text,boolean) owner to wedding_contributor;
revoke create on schema wedding_access from wedding_mutator,wedding_contributor;
revoke all on function wedding_access.assign_task(uuid,uuid,text,uuid),wedding_access.task_members(uuid),wedding_access.contribute_task(uuid,uuid,text,text,text,boolean) from public,anon,authenticated;
grant execute on function wedding_access.assign_task(uuid,uuid,text,uuid),wedding_access.task_members(uuid),wedding_access.contribute_task(uuid,uuid,text,text,text,boolean) to authenticated;
create function public.task_assign(p_id uuid,p_task uuid,p_version text,p_member uuid) returns jsonb language sql security invoker set search_path='' as $$select wedding_access.assign_task(p_id,p_task,p_version,p_member);$$;
create function public.task_members(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$select wedding_access.task_members(p_id);$$;
create function public.task_contribute(p_id uuid,p_task uuid,p_version text,p_status text,p_note text,p_confirm boolean) returns jsonb language sql security invoker set search_path='' as $$select wedding_access.contribute_task(p_id,p_task,p_version,p_status,p_note,p_confirm);$$;
revoke all on function public.task_assign(uuid,uuid,text,uuid),public.task_members(uuid),public.task_contribute(uuid,uuid,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.task_assign(uuid,uuid,text,uuid),public.task_members(uuid),public.task_contribute(uuid,uuid,text,text,text,boolean) to authenticated;
create or replace function wedding_access.read_planning(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $body$
 select jsonb_build_object(
  'wedding',jsonb_build_object('id',w.id,'title',w.title,'city',w.city,'wedding_date',w.wedding_date,'is_tentative',w.is_tentative,'state',w.state,'state_version',w.state_version::text),
  'ceremonies',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'title',c.title,'ceremony_date',c.ceremony_date,'guest_count',c.guest_count) order by c.id)
   from wedding_private.ceremonies c where c.wedding_id=w.id and not c.is_archived),'[]'::jsonb),
  'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'ceremony_id',t.ceremony_id,'title',t.title,'description',t.description,'owner_name',t.owner_name,'due_date',t.due_date,'status',t.status,'prerequisite_task_id',t.prerequisite_task_id,'completed_at',t.completed_at,'assigned_to_me',t.assigned_member_id=wedding_private.caller_uid(),'has_assignee',t.assigned_member_id is not null,'progress_note',t.progress_note,'progress_updated_at',t.progress_updated_at) order by t.id)
   from wedding_private.tasks t where t.wedding_id=w.id and t.dismissed_at is null and t.archived_at is null
    and (t.ceremony_id is null or exists(select 1 from wedding_private.ceremonies c where c.id=t.ceremony_id and c.wedding_id=w.id and not c.is_archived))),'[]'::jsonb)
 ) from wedding_private.weddings w where w.id=p_id and wedding_private.caller_uid() is not null
  and not coalesce((coalesce(nullif(pg_catalog.current_setting('request.jwt.claim',true),''),nullif(pg_catalog.current_setting('request.jwt.claims',true),''))::jsonb->>'is_anonymous')::boolean,false);
$body$;
create or replace function wedding_access.delete_wedding(p_id uuid,p_confirmation text,p_version text) returns boolean
language plpgsql security definer set search_path='' as $delete$
declare w wedding_private.weddings;
begin
 if wedding_private.caller_uid() is null or coalesce((coalesce(nullif(current_setting('request.jwt.claim',true),''),nullif(current_setting('request.jwt.claims',true),''))::jsonb->>'is_anonymous')::boolean,false) then raise exception using errcode='42501',message='Wedding not available';end if;
 w:=wedding_private.owned_wedding_lock(p_id);
 perform wedding_private.finance_version(p_id,p_version);
 if p_confirmation is null or p_confirmation collate "C" is distinct from w.title collate "C" then
  raise exception using errcode='22023',message='Exact wedding name confirmation required';
 end if;
 -- Parent-first lock matches all accepted wedding/member/ADAPT mutation contracts.
 -- Child-first explicit removal preserves RESTRICT FKs; no trigger/RLS is disabled.
 delete from wedding_access.invitations where wedding_id=p_id;
 delete from wedding_private.ai_acceptances where wedding_id=p_id;
 delete from wedding_private.ai_dismissed_titles where wedding_id=p_id;
 update wedding_private.ai_request_slots set wedding_id=null where wedding_id=p_id;
 delete from wedding_private.cash_entries where wedding_id=p_id;
 delete from wedding_private.change_proposals where wedding_id=p_id;
 delete from wedding_private.audit_events where wedding_id=p_id;
 delete from wedding_private.cost_items where wedding_id=p_id;
 delete from wedding_private.tasks where wedding_id=p_id;
 delete from wedding_access.memberships where wedding_id=p_id;
 delete from wedding_private.ceremonies where wedding_id=p_id;
 delete from wedding_private.weddings where id=p_id;
 return true;
end;$delete$;


-- Discover only actively accepted shared workspaces; no owner/finance fields.
create function wedding_access.member_workspaces() returns jsonb language sql stable security definer set search_path='' as $b$
 select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'title',w.title,'city',w.city,'state',w.state) order by w.title,w.id),'[]'::jsonb)
 from wedding_private.weddings w join wedding_access.memberships m on m.wedding_id=w.id
 where m.user_id=wedding_private.caller_uid() and m.revoked_at is null and w.state<>'ARCHIVED'
 and wedding_private.caller_uid() is not null
 and not coalesce((coalesce(nullif(current_setting('request.jwt.claim',true),''),nullif(current_setting('request.jwt.claims',true),''))::jsonb->>'is_anonymous')::boolean,false);
$b$;
grant create on schema wedding_access to wedding_planning_reader;
alter function wedding_access.member_workspaces() owner to wedding_planning_reader;
revoke create on schema wedding_access from wedding_planning_reader;
revoke all on function wedding_access.member_workspaces() from public,anon,authenticated;
grant execute on function wedding_access.member_workspaces() to authenticated;
create function public.member_workspaces() returns jsonb language sql stable security invoker set search_path='' as $$select wedding_access.member_workspaces();$$;
revoke all on function public.member_workspaces() from public,anon,authenticated;
grant execute on function public.member_workspaces() to authenticated;
commit;
