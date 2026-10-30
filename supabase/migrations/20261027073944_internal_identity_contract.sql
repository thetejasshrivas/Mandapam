-- WP-10 forward repair REVIEW CANDIDATE. NOT APPLIED.
-- No managed Auth schema changes, role broadening, RLS bypass or exposed RPC.
begin;
create function wedding_private.caller_uid() returns uuid
language sql stable security invoker set search_path='' as $identity$
 select coalesce(
  nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),''),
  (nullif(pg_catalog.current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub')
 )::uuid
$identity$;
revoke all on function wedding_private.caller_uid() from public,anon,authenticated;
grant execute on function wedding_private.caller_uid() to wedding_mutator,wedding_version_writer,wedding_guest_initializer,wedding_guest_approver;
-- Same claim/sub precedence as the target's verified auth.uid() implementation.
-- Authenticated RLS policies continue to use auth.uid(); only internal trigger code changes.
create or replace function wedding_private.guard_wedding() returns trigger language plpgsql set search_path='' as $body$
begin
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

create or replace function wedding_private.guard_audit() returns trigger language plpgsql set search_path='' as $body$
declare valid_entity boolean:=false;
begin
 if tg_op<>'INSERT' then raise exception using errcode='23514',message='Audit history is append only'; end if;
 if new.actor_user_id is distinct from wedding_private.caller_uid() then raise exception using errcode='42501',message='Audit actor must be caller'; end if;
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

create or replace function wedding_private.bump_wedding_version() returns trigger language plpgsql security definer set search_path='' as $body$
begin
 if tg_op='UPDATE' and (to_jsonb(new)-'updated_at') is not distinct from (to_jsonb(old)-'updated_at') then return new; end if;
 update wedding_private.weddings set state_version=state_version+1 where id=new.wedding_id and owner_user_id=wedding_private.caller_uid();
 if not found then raise exception using errcode='42501',message='Version owner authorization required'; end if;
 return new;
end;
$body$;

commit;
