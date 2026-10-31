-- Display-only Auth names; no profile table, Auth grants, stored-data writes or permission changes.
-- This private helper cannot enumerate arbitrary accounts: the caller must own the
-- wedding and every returned user must have an active accepted membership.
begin;
create function wedding_access.member_name_roster(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $body$
begin
 if wedding_private.caller_uid() is null or coalesce((coalesce(nullif(current_setting('request.jwt.claim',true),''),nullif(current_setting('request.jwt.claims',true),''))::jsonb->>'is_anonymous')::boolean,false)
 or not exists(select 1 from wedding_private.weddings w where w.id=p_id and w.owner_user_id=wedding_private.caller_uid())
 then raise exception using errcode='42501',message='Wedding not available';end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',m.user_id,'label','Family Member','display_name',coalesce(
   case when jsonb_typeof(u.raw_user_meta_data->'full_name')='string' then nullif(btrim(left(u.raw_user_meta_data->>'full_name',100)),'') end,
   case when jsonb_typeof(u.raw_user_meta_data->'name')='string' then nullif(btrim(left(u.raw_user_meta_data->>'name',100)),'') end)) order by m.user_id)
  from wedding_access.memberships m join auth.users u on u.id=m.user_id
  where m.wedding_id=p_id and m.revoked_at is null),'[]'::jsonb);
end;$body$;
alter function wedding_access.member_name_roster(uuid) owner to postgres;
revoke all on function wedding_access.member_name_roster(uuid) from public,anon,authenticated;
grant execute on function wedding_access.member_name_roster(uuid) to wedding_mutator;
-- Preserve the existing owner, security mode, public invoker wrapper and ACLs.
create or replace function wedding_access.task_members(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $body$
begin
 return wedding_access.member_name_roster(p_id);
end;$body$;
commit;
