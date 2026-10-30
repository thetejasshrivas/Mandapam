-- WP-ROLES-1 REVIEW CANDIDATE; NOT REMOTELY APPLIED.
-- Existing owner-only relations/RPCs remain unchanged. New API returns planning only.
begin;
create schema wedding_access;
revoke all on schema wedding_access from public,anon,authenticated;
create role wedding_planning_reader nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role wedding_membership_writer nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant wedding_planning_reader,wedding_membership_writer to postgres;
grant usage on schema wedding_access to authenticated,wedding_planning_reader,wedding_membership_writer;
-- Managed Auth schema grants are not delegable by the migration role.
-- Reuse the established invoker identity interface; no managed-schema privileges.
grant usage on schema wedding_private to wedding_planning_reader,wedding_membership_writer;
grant execute on function wedding_private.caller_uid() to wedding_planning_reader,wedding_membership_writer;
alter default privileges in schema wedding_access revoke execute on functions from public;

-- Role is implicitly Member. Admin is derived ONLY from immutable wedding ownership.
create table wedding_access.memberships(
 wedding_id uuid not null references wedding_private.weddings(id) on delete restrict,
 user_id uuid not null references auth.users(id) on delete restrict,
 invited_by uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default statement_timestamp(),
 revoked_at timestamptz,
 primary key(wedding_id,user_id),
 check(user_id<>invited_by),
 check(revoked_at is null or revoked_at>=created_at)
);
create index membership_active_user on wedding_access.memberships(user_id,wedding_id) where revoked_at is null;
alter table wedding_access.memberships enable row level security;
alter table wedding_access.memberships force row level security;
revoke all on wedding_access.memberships from public,anon,authenticated;
grant select on wedding_access.memberships to wedding_planning_reader,wedding_membership_writer;
grant insert(wedding_id,user_id,invited_by) on wedding_access.memberships to wedding_membership_writer;
grant update(revoked_at) on wedding_access.memberships to wedding_membership_writer;
create policy own_active_membership on wedding_access.memberships for select to wedding_planning_reader
 using(user_id=(select wedding_private.caller_uid()) and revoked_at is null);
create policy admin_membership_read on wedding_access.memberships for select to wedding_membership_writer
 using(exists(select 1 from wedding_private.weddings w where w.id=wedding_id and w.owner_user_id=(select wedding_private.caller_uid())));
create policy admin_membership_insert on wedding_access.memberships for insert to wedding_membership_writer
 with check(invited_by=(select wedding_private.caller_uid()) and exists(select 1 from wedding_private.weddings w where w.id=wedding_id and w.owner_user_id=(select wedding_private.caller_uid())));
create policy admin_membership_revoke on wedding_access.memberships for update to wedding_membership_writer
 using(exists(select 1 from wedding_private.weddings w where w.id=wedding_id and w.owner_user_id=(select wedding_private.caller_uid())))
 with check(revoked_at is not null and exists(select 1 from wedding_private.weddings w where w.id=wedding_id and w.owner_user_id=(select wedding_private.caller_uid())));

-- The reader never receives budget columns or privileges on finance/ADAPT tables.
grant select(id,owner_user_id,title,city,wedding_date,is_tentative,state) on wedding_private.weddings to wedding_planning_reader;
grant select(id,owner_user_id) on wedding_private.weddings to wedding_membership_writer;
-- SELECT FOR UPDATE requires an UPDATE column privilege; helper performs no wedding UPDATE.
grant update(updated_at) on wedding_private.weddings to wedding_membership_writer;
grant select(id,wedding_id,title,ceremony_date,guest_count,is_archived) on wedding_private.ceremonies to wedding_planning_reader;
grant select(id,wedding_id,ceremony_id,title,description,owner_name,due_date,status,prerequisite_task_id,completed_at,dismissed_at,archived_at) on wedding_private.tasks to wedding_planning_reader;
create policy membership_admin_wedding_read on wedding_private.weddings for select to wedding_membership_writer
 using(owner_user_id=(select wedding_private.caller_uid()));
-- Lock-only policy for the dedicated writer; no UPDATE SQL is exposed to callers.
create policy membership_admin_wedding_lock on wedding_private.weddings for update to wedding_membership_writer
 using(owner_user_id=(select wedding_private.caller_uid())) with check(owner_user_id=(select wedding_private.caller_uid()));
create policy shared_planning_wedding_read on wedding_private.weddings for select to wedding_planning_reader
 using(owner_user_id=(select wedding_private.caller_uid()) or exists(select 1 from wedding_access.memberships m where m.wedding_id=weddings.id and m.user_id=(select wedding_private.caller_uid()) and m.revoked_at is null));
create policy shared_planning_ceremony_read on wedding_private.ceremonies for select to wedding_planning_reader
 using(exists(select 1 from wedding_private.weddings w where w.id=wedding_id));
create policy shared_planning_task_read on wedding_private.tasks for select to wedding_planning_reader
 using(exists(select 1 from wedding_private.weddings w where w.id=wedding_id));

create function wedding_access.change_membership(p_id uuid,p_member uuid,p_revoke boolean) returns void
language plpgsql security definer set search_path='' as $body$
begin
 -- Same trusted request-claim precedence as installed Auth helpers; never user_metadata.
 if wedding_private.caller_uid() is null or coalesce((coalesce(nullif(pg_catalog.current_setting('request.jwt.claim',true),''),nullif(pg_catalog.current_setting('request.jwt.claims',true),''))::jsonb->>'is_anonymous')::boolean,false) then
  raise exception using errcode='42501',message='Sign in required';
 end if;
 -- Check owner first, then target. Same wedding lock serializes grant/revoke.
 perform 1 from wedding_private.weddings where id=p_id and owner_user_id=wedding_private.caller_uid() for update;
 if not found then raise exception using errcode='42501',message='Wedding not available';end if;
 if p_member is null or p_member=wedding_private.caller_uid() or p_revoke is null then
  raise exception using errcode='22023',message='Invalid membership request';
 end if;
 if p_revoke then
  update wedding_access.memberships set revoked_at=statement_timestamp()
   where wedding_id=p_id and user_id=p_member and revoked_at is null;
 else
  if exists(select 1 from wedding_access.memberships where wedding_id=p_id and user_id=p_member and revoked_at is not null) then
   raise exception using errcode='55000',message='Revoked membership requires a new reviewed invitation flow';
  end if;
  insert into wedding_access.memberships(wedding_id,user_id,invited_by) values(p_id,p_member,wedding_private.caller_uid())
   on conflict(wedding_id,user_id) do nothing;
 end if;
end;
$body$;

create function wedding_access.read_planning(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $body$
 select jsonb_build_object(
  'wedding',jsonb_build_object('id',w.id,'title',w.title,'city',w.city,'wedding_date',w.wedding_date,'is_tentative',w.is_tentative,'state',w.state),
  'ceremonies',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'title',c.title,'ceremony_date',c.ceremony_date,'guest_count',c.guest_count) order by c.id)
   from wedding_private.ceremonies c where c.wedding_id=w.id and not c.is_archived),'[]'::jsonb),
  'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'ceremony_id',t.ceremony_id,'title',t.title,'description',t.description,'owner_name',t.owner_name,'due_date',t.due_date,'status',t.status,'prerequisite_task_id',t.prerequisite_task_id,'completed_at',t.completed_at) order by t.id)
   from wedding_private.tasks t where t.wedding_id=w.id and t.dismissed_at is null and t.archived_at is null
    and (t.ceremony_id is null or exists(select 1 from wedding_private.ceremonies c where c.id=t.ceremony_id and c.wedding_id=w.id and not c.is_archived))),'[]'::jsonb)
 ) from wedding_private.weddings w where w.id=p_id and wedding_private.caller_uid() is not null
  and not coalesce((coalesce(nullif(pg_catalog.current_setting('request.jwt.claim',true),''),nullif(pg_catalog.current_setting('request.jwt.claims',true),''))::jsonb->>'is_anonymous')::boolean,false);
$body$;

-- Transfer private helper ownership to non-login, non-bypass roles, not postgres.
grant create on schema wedding_access to wedding_planning_reader,wedding_membership_writer;
alter function wedding_access.change_membership(uuid,uuid,boolean) owner to wedding_membership_writer;
alter function wedding_access.read_planning(uuid) owner to wedding_planning_reader;
revoke create on schema wedding_access from wedding_planning_reader,wedding_membership_writer;
revoke all on function wedding_access.change_membership(uuid,uuid,boolean),wedding_access.read_planning(uuid) from public,anon,authenticated;
grant execute on function wedding_access.change_membership(uuid,uuid,boolean),wedding_access.read_planning(uuid) to authenticated;

-- PostgREST entrypoints use invoker security. wedding_access must stay unexposed.
create function public.planning_read(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $body$
 select wedding_access.read_planning(p_id);
$body$;
create function public.membership_grant(p_id uuid,p_member uuid) returns void language sql security invoker set search_path='' as $body$
 select wedding_access.change_membership(p_id,p_member,false);
$body$;
create function public.membership_revoke(p_id uuid,p_member uuid) returns void language sql security invoker set search_path='' as $body$
 select wedding_access.change_membership(p_id,p_member,true);
$body$;
revoke all on function public.planning_read(uuid),public.membership_grant(uuid,uuid),public.membership_revoke(uuid,uuid) from public,anon,authenticated;
grant execute on function public.planning_read(uuid),public.membership_grant(uuid,uuid),public.membership_revoke(uuid,uuid) to authenticated;
commit;
