-- WP-13 review candidate. No remote apply until exact-diff founder approval.
begin;
create or replace function wedding_private.guard_task() returns trigger language plpgsql set search_path='' as $body$
declare cursor_id uuid; seen uuid[]:=array[new.id]; hops integer:=0;
begin
 cursor_id:=new.prerequisite_task_id;
 while cursor_id is not null loop
  hops:=hops+1;
  if hops>64 or cursor_id=any(seen) then raise exception using errcode='23514',message='Dependency cycle or traversal bound exceeded'; end if;
  seen:=array_append(seen,cursor_id);
  select prerequisite_task_id into cursor_id from wedding_private.tasks where wedding_id=new.wedding_id and id=cursor_id;
  if not found then raise exception using errcode='23514',message='Prerequisite must belong to this wedding'; end if;
 end loop;
 if new.prerequisite_task_id is not null and exists(select 1 from wedding_private.tasks where wedding_id=new.wedding_id and id=new.prerequisite_task_id and (dismissed_at is not null or archived_at is not null)) then
  raise exception using errcode='23514',message='Prerequisite must be retained';
 end if;
 if (new.status_confirmed_at is null)<>(new.status_confirmed_by is null) or (new.status_confirmed_by is not null and btrim(new.status_confirmed_by)='') then
  raise exception using errcode='23514',message='Confirmation requires timestamp and descriptor';
 end if;
 if tg_op='UPDATE' then
  if new.ceremony_id is distinct from old.ceremony_id then raise exception using errcode='23514',message='Task reparenting is not supported'; end if;
  if old.archived_at is not null and (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at') then raise exception using errcode='23514',message='Archived task is read only'; end if;
  if old.dismissed_at is not null and new.dismissed_at is distinct from old.dismissed_at then raise exception using errcode='23514',message='Dismissal identity must be retained'; end if;
  if new.status is distinct from old.status and not(
   (old.status='TO_DO' and new.status in('IN_PROGRESS','COMPLETED','DEFERRED')) or
   (old.status='IN_PROGRESS' and new.status in('TO_DO','COMPLETED','DEFERRED')) or
   (old.status='DEFERRED' and new.status='TO_DO') or
   (old.status='COMPLETED' and new.status in('TO_DO','IN_PROGRESS'))
  ) then raise exception using errcode='23514',message='Unsupported task transition'; end if;
  if old.status='COMPLETED' and new.status='COMPLETED' and (new.completed_at,new.due_date) is distinct from (old.completed_at,old.due_date) then raise exception using errcode='23514',message='Completed timestamp and due date must be preserved'; end if;
  if (new.dismissed_at is not null and old.dismissed_at is null) or (new.archived_at is not null and old.archived_at is null) then
   if exists(select 1 from wedding_private.tasks where wedding_id=new.wedding_id and prerequisite_task_id=new.id and dismissed_at is null) then raise exception using errcode='23514',message='Retained dependent requires this task'; end if;
  end if;
  if new.archived_at is not null and old.archived_at is null and new.status='COMPLETED' then raise exception using errcode='23514',message='Completed task must remain visible'; end if;
  if new.prerequisite_task_id is distinct from old.prerequisite_task_id and new.status='COMPLETED' and exists(select 1 from wedding_private.tasks where wedding_id=new.wedding_id and id=new.prerequisite_task_id and status<>'COMPLETED') then raise exception using errcode='23514',message='Cannot attach unfinished prerequisite to completed task'; end if;
 end if;
 return new;
end;
$body$;

create function public.update_task(p_id uuid,p_task uuid,p_version text,p_operation text,p_changes jsonb,p_confirm boolean,p_override boolean) returns jsonb
language plpgsql security definer set search_path='' as $body$
declare w wedding_private.weddings; old_task wedding_private.tasks; next_task wedding_private.tasks; parent wedding_private.tasks;
 requested_status text; descriptor text; event_action text; event_override boolean:=false; keys text[]; ceremony uuid;
begin
 w:=wedding_private.owned_wedding_lock(p_id);
 if w.state<>'ACTIVE' then raise exception using errcode='55000',message='Task progress requires an active plan'; end if;
 if p_version is null or p_version !~ '^(0|[1-9][0-9]*)$' or length(p_version)>19 then raise exception using errcode='22023',message='Invalid version'; end if;
 if p_version::numeric>9223372036854775807 then raise exception using errcode='22023',message='Invalid version'; end if;
 if w.state_version<>p_version::bigint then raise exception using errcode='40001',message='Plan changed; reload and review'; end if;
 if p_changes is null or jsonb_typeof(p_changes)<>'object' or octet_length(p_changes::text)>4096 then raise exception using errcode='22023',message='Invalid task fields'; end if;
 if p_operation='add' then
  if p_task is not null or exists(select 1 from jsonb_object_keys(p_changes) as k where k not in('title','owner_name','due_date','ceremony_id')) then raise exception using errcode='22023',message='Unsupported new task fields'; end if;
  if not(p_changes ? 'title') or jsonb_typeof(p_changes->'title')<>'string' or char_length(btrim(p_changes->>'title')) not between 1 and 160 then raise exception using errcode='22023',message='Invalid task title'; end if;
  if p_changes ? 'owner_name' and (jsonb_typeof(p_changes->'owner_name') not in('string','null') or char_length(p_changes->>'owner_name')>100) then raise exception using errcode='22023',message='Invalid owner name'; end if;
  if p_changes ? 'due_date' and jsonb_typeof(p_changes->'due_date') not in('string','null') then raise exception using errcode='22023',message='Invalid calendar date'; end if;
  if p_changes ? 'ceremony_id' and jsonb_typeof(p_changes->'ceremony_id') not in('string','null') then raise exception using errcode='22023',message='Invalid ceremony'; end if;
  ceremony:=nullif(p_changes->>'ceremony_id','')::uuid;
  if ceremony is not null and not exists(select 1 from wedding_private.ceremonies where wedding_id=p_id and id=ceremony and not is_archived) then raise exception using errcode='42501',message='Ceremony not available'; end if;
  insert into wedding_private.tasks(wedding_id,ceremony_id,title,owner_name,due_date) values(p_id,ceremony,btrim(p_changes->>'title'),nullif(btrim(p_changes->>'owner_name'),''),wedding_private.draft_date(p_changes->>'due_date')) returning * into next_task;
  insert into wedding_private.audit_events(wedding_id,actor_user_id,entity_type,entity_id,action,before_after) values(p_id,wedding_private.caller_uid(),'task',next_task.id,'TASK_ADDED',jsonb_build_object('after',jsonb_build_object('title',next_task.title,'owner_name',next_task.owner_name,'due_date',next_task.due_date,'status',next_task.status)));
  return jsonb_build_object('task',to_jsonb(next_task),'version',(select state_version::text from wedding_private.weddings where id=p_id));
 end if;
 select * into old_task from wedding_private.tasks where wedding_id=p_id and id=p_task for update;
 if not found then raise exception using errcode='42501',message='Task not available'; end if;
 if old_task.archived_at is not null or old_task.dismissed_at is not null then raise exception using errcode='55000',message='Task is no longer editable'; end if;
 next_task:=old_task;
 case p_operation
 when 'status' then
  keys:=array['status','confirmed_by'];
  if exists(select 1 from jsonb_object_keys(p_changes) as k where not(k=any(keys))) then raise exception using errcode='22023',message='Unsupported status fields'; end if;
  requested_status:=p_changes->>'status';
  if requested_status is null or requested_status not in('TO_DO','IN_PROGRESS','COMPLETED','DEFERRED') then raise exception using errcode='22023',message='Invalid status'; end if;
  if p_changes ? 'confirmed_by' and jsonb_typeof(p_changes->'confirmed_by') not in('string','null') then raise exception using errcode='22023',message='Invalid confirmation descriptor'; end if;
  descriptor:=nullif(btrim(p_changes->>'confirmed_by'),'');
  if char_length(descriptor)>100 then raise exception using errcode='22023',message='Confirmation descriptor too long'; end if;
  if requested_status<>old_task.status then
   if old_task.status='COMPLETED' and p_confirm is distinct from true then raise exception using errcode='23514',message='Confirm reopening the completed task'; end if;
   if requested_status='COMPLETED' and old_task.prerequisite_task_id is not null then
    select * into parent from wedding_private.tasks where wedding_id=p_id and id=old_task.prerequisite_task_id;
    if not found or parent.status<>'COMPLETED' or parent.archived_at is not null or parent.dismissed_at is not null then
     if p_override is distinct from true then raise exception using errcode='23514',message='Confirm completion before prerequisite'; end if;
     event_override:=true;
    end if;
   end if;
   next_task.status:=requested_status;
   next_task.completed_at:=case when requested_status='COMPLETED' then statement_timestamp() else null end;
   next_task.status_confirmed_by:=descriptor;
   next_task.status_confirmed_at:=case when descriptor is not null then statement_timestamp() else null end;
  elsif descriptor is not null and descriptor is distinct from old_task.status_confirmed_by then
   next_task.status_confirmed_by:=descriptor; next_task.status_confirmed_at:=statement_timestamp();
  end if;
  event_action:=case when event_override then 'TASK_COMPLETION_OVERRIDE' when old_task.status='COMPLETED' and next_task.status<>'COMPLETED' then 'TASK_REOPENED' else 'TASK_STATUS_CHANGED' end;
 when 'details' then
  keys:=array['title','owner_name','due_date'];
  if exists(select 1 from jsonb_object_keys(p_changes) as k where not(k=any(keys))) then raise exception using errcode='22023',message='Unsupported task details'; end if;
  if p_changes ? 'title' then
   if jsonb_typeof(p_changes->'title')<>'string' or char_length(btrim(p_changes->>'title')) not between 1 and 160 then raise exception using errcode='22023',message='Invalid task title'; end if;
   next_task.title:=btrim(p_changes->>'title');
  end if;
  if p_changes ? 'owner_name' then
   if jsonb_typeof(p_changes->'owner_name') not in('string','null') or char_length(p_changes->>'owner_name')>100 then raise exception using errcode='22023',message='Invalid owner name'; end if;
   next_task.owner_name:=nullif(btrim(p_changes->>'owner_name'),'');
  end if;
  if p_changes ? 'due_date' then
   if jsonb_typeof(p_changes->'due_date') not in('string','null') then raise exception using errcode='22023',message='Invalid calendar date'; end if;
   next_task.due_date:=wedding_private.draft_date(p_changes->>'due_date');
  end if;
  event_action:='TASK_DETAILS_EDITED';
 when 'archive' then
  if p_changes<>'{}'::jsonb then raise exception using errcode='22023',message='Archive accepts no task fields'; end if;
  if p_confirm is distinct from true then raise exception using errcode='22023',message='Confirm non-reversible archive'; end if;
  if old_task.status='COMPLETED' then raise exception using errcode='23514',message='Completed task must remain visible'; end if;
  if exists(select 1 from wedding_private.tasks where wedding_id=p_id and prerequisite_task_id=p_task and dismissed_at is null) then raise exception using errcode='23514',message='Retained dependent requires this task'; end if;
  next_task.archived_at:=statement_timestamp();event_action:='TASK_ARCHIVED';
 else raise exception using errcode='22023',message='Invalid task operation';
 end case;
 if to_jsonb(next_task) is not distinct from to_jsonb(old_task) then
  return jsonb_build_object('task',to_jsonb(old_task),'version',w.state_version::text);
 end if;
 update wedding_private.tasks set title=next_task.title,owner_name=next_task.owner_name,due_date=next_task.due_date,status=next_task.status,completed_at=next_task.completed_at,status_confirmed_at=next_task.status_confirmed_at,status_confirmed_by=next_task.status_confirmed_by,archived_at=next_task.archived_at where wedding_id=p_id and id=p_task returning * into next_task;
 insert into wedding_private.audit_events(wedding_id,actor_user_id,entity_type,entity_id,action,before_after)
 values(p_id,wedding_private.caller_uid(),'task',p_task,event_action,jsonb_build_object('before',jsonb_build_object('title',old_task.title,'owner_name',old_task.owner_name,'due_date',old_task.due_date,'status',old_task.status,'completed_at',old_task.completed_at,'status_confirmed_at',old_task.status_confirmed_at,'status_confirmed_by',old_task.status_confirmed_by,'archived_at',old_task.archived_at),'after',jsonb_build_object('title',next_task.title,'owner_name',next_task.owner_name,'due_date',next_task.due_date,'status',next_task.status,'completed_at',next_task.completed_at,'status_confirmed_at',next_task.status_confirmed_at,'status_confirmed_by',next_task.status_confirmed_by,'archived_at',next_task.archived_at),'override',event_override,'confirmed_reopen',old_task.status='COMPLETED' and next_task.status<>'COMPLETED'));
 return jsonb_build_object('task',to_jsonb(next_task),'version',(select state_version::text from wedding_private.weddings where id=p_id));
end;
$body$;
grant create on schema public to wedding_mutator;
alter function public.update_task(uuid,uuid,text,text,jsonb,boolean,boolean) owner to wedding_mutator;
revoke create on schema public from wedding_mutator;
revoke all on function public.update_task(uuid,uuid,text,text,jsonb,boolean,boolean) from public,anon,authenticated;
grant execute on function public.update_task(uuid,uuid,text,text,jsonb,boolean,boolean) to authenticated;
-- Existing RLS, grants, no-delete triggers and version triggers remain in force.
commit;
