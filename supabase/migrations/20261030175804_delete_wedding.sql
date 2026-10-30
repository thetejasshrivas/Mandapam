-- Owner-confirmed permanent wedding deletion. Existing 15 migration files are immutable.
-- Account-wide Connect credentials and abuse/request limits are not wedding-owned data.
begin;
create role wedding_deleter nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant wedding_deleter to postgres;
grant usage on schema wedding_private,wedding_access to wedding_deleter;
grant execute on function wedding_private.caller_uid(),wedding_private.owned_wedding_lock(uuid),wedding_private.finance_version(uuid,text) to wedding_deleter;
grant select,delete on wedding_private.weddings to wedding_deleter;
grant update(updated_at) on wedding_private.weddings to wedding_deleter;
create policy delete_owner_read on wedding_private.weddings for select to wedding_deleter using(owner_user_id=wedding_private.caller_uid());
create policy delete_owner_lock on wedding_private.weddings for update to wedding_deleter using(owner_user_id=wedding_private.caller_uid()) with check(owner_user_id=wedding_private.caller_uid());
create policy delete_owner_remove on wedding_private.weddings for delete to wedding_deleter using(owner_user_id=wedding_private.caller_uid());
do $policies$
declare s text;t text;begin
 foreach s in array array['wedding_private','wedding_access'] loop
  foreach t in array case when s='wedding_private' then array['ceremonies','tasks','cost_items','cash_entries','change_proposals','audit_events','ai_acceptances','ai_dismissed_titles'] else array['invitations','memberships'] end loop
   execute format('grant select(wedding_id) on %I.%I to wedding_deleter',s,t);
   execute format('grant delete on %I.%I to wedding_deleter',s,t);
   execute format('create policy delete_owner_read on %I.%I for select to wedding_deleter using(exists(select 1 from wedding_private.weddings w where w.id=%I.wedding_id and w.owner_user_id=wedding_private.caller_uid()))',s,t,t);
   execute format('create policy delete_owner_remove on %I.%I for delete to wedding_deleter using(exists(select 1 from wedding_private.weddings w where w.id=%I.wedding_id and w.owner_user_id=wedding_private.caller_uid()))',s,t,t);
  end loop;
 end loop;
end;$policies$;
-- Retain minimal account-wide request counts; remove their link to deleted planning data.
alter table wedding_private.ai_request_slots alter column wedding_id drop not null;
grant select(wedding_id,owner_user_id),update(wedding_id) on wedding_private.ai_request_slots to wedding_deleter;
create policy delete_quota_read on wedding_private.ai_request_slots for select to wedding_deleter using(owner_user_id=wedding_private.caller_uid());
create policy delete_quota_unlink on wedding_private.ai_request_slots for update to wedding_deleter
 using(owner_user_id=wedding_private.caller_uid() and exists(select 1 from wedding_private.weddings w where w.id=wedding_id and w.owner_user_id=wedding_private.caller_uid()))
 with check(wedding_id is null and owner_user_id=wedding_private.caller_uid());
create policy detached_quota_owner_read on wedding_private.ai_request_slots for select to wedding_mutator using(wedding_id is null and owner_user_id=wedding_private.caller_uid());

create or replace function wedding_private.guard_wedding() returns trigger language plpgsql set search_path='' as $body$
begin
 -- Only the owner-confirmed SECURITY DEFINER deletion operation can enter this role.
 if tg_op='DELETE' and current_user='wedding_deleter' then return old; end if;
 if tg_op='DELETE' then raise exception using errcode='23514',message='History deletion is not supported'; end if;
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


create function wedding_access.delete_wedding(p_id uuid,p_confirmation text,p_version text) returns boolean
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
 delete from wedding_access.memberships where wedding_id=p_id;
 delete from wedding_private.ai_acceptances where wedding_id=p_id;
 delete from wedding_private.ai_dismissed_titles where wedding_id=p_id;
 update wedding_private.ai_request_slots set wedding_id=null where wedding_id=p_id;
 delete from wedding_private.cash_entries where wedding_id=p_id;
 delete from wedding_private.change_proposals where wedding_id=p_id;
 delete from wedding_private.audit_events where wedding_id=p_id;
 delete from wedding_private.cost_items where wedding_id=p_id;
 delete from wedding_private.tasks where wedding_id=p_id;
 delete from wedding_private.ceremonies where wedding_id=p_id;
 delete from wedding_private.weddings where id=p_id;
 return true;
end;$delete$;
grant create on schema wedding_access to wedding_deleter;
alter function wedding_access.delete_wedding(uuid,text,text) owner to wedding_deleter;
revoke create on schema wedding_access from wedding_deleter;
revoke all on function wedding_access.delete_wedding(uuid,text,text) from public,anon,authenticated;
grant execute on function wedding_access.delete_wedding(uuid,text,text) to authenticated;
create function public.delete_wedding(p_id uuid,p_confirmation text,p_version text) returns boolean
language sql security invoker set search_path='' as $public$
 select wedding_access.delete_wedding(p_id,p_confirmation,p_version);
$public$;
revoke all on function public.delete_wedding(uuid,text,text) from public,anon,authenticated;
grant execute on function public.delete_wedding(uuid,text,text) to authenticated;
commit;
