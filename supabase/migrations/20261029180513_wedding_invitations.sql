-- WP-ROLES-7: backend-only, account-UUID-bound invitations. LOCAL REVIEW ONLY.
begin;
create table wedding_access.invitations(
 id uuid primary key default pg_catalog.gen_random_uuid(),
 wedding_id uuid not null references wedding_private.weddings(id) on delete restrict,
 recipient_user_id uuid not null references auth.users(id) on delete restrict,
 invited_by uuid not null references auth.users(id) on delete restrict,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null,
 accepted_at timestamptz,
 revoked_at timestamptz,
 check(recipient_user_id<>invited_by),
 check(expires_at>created_at),
 check(accepted_at is null or revoked_at is null)
);
create unique index one_pending_invitation on wedding_access.invitations(wedding_id,recipient_user_id)
 where accepted_at is null and revoked_at is null;
alter table wedding_access.invitations enable row level security;
alter table wedding_access.invitations force row level security;
revoke all on wedding_access.invitations from public,anon,authenticated;
grant select on wedding_access.invitations to wedding_membership_writer;
grant insert(wedding_id,recipient_user_id,invited_by,token_hash,expires_at) on wedding_access.invitations to wedding_membership_writer;
grant update(revoked_at) on wedding_access.invitations to wedding_membership_writer;
create policy invitation_admin_read on wedding_access.invitations for select to wedding_membership_writer
 using(exists(select 1 from wedding_private.weddings w where w.id=wedding_id and w.owner_user_id=wedding_private.caller_uid()));
create policy invitation_admin_insert on wedding_access.invitations for insert to wedding_membership_writer
 with check(invited_by=wedding_private.caller_uid() and exists(select 1 from wedding_private.weddings w where w.id=wedding_id and w.owner_user_id=wedding_private.caller_uid()));
create policy invitation_admin_revoke on wedding_access.invitations for update to wedding_membership_writer
 using(exists(select 1 from wedding_private.weddings w where w.id=wedding_id and w.owner_user_id=wedding_private.caller_uid()))
 with check(revoked_at is not null and accepted_at is null and exists(select 1 from wedding_private.weddings w where w.id=wedding_id and w.owner_user_id=wedding_private.caller_uid()));

create role wedding_invitation_acceptor nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant wedding_invitation_acceptor to postgres;
grant usage on schema wedding_access,wedding_private to wedding_invitation_acceptor;
grant execute on function wedding_private.caller_uid() to wedding_invitation_acceptor;
grant select on wedding_access.invitations to wedding_invitation_acceptor;
grant update(accepted_at) on wedding_access.invitations to wedding_invitation_acceptor;
create policy invitation_recipient_read on wedding_access.invitations for select to wedding_invitation_acceptor
 using(recipient_user_id=wedding_private.caller_uid());
create policy invitation_recipient_consume on wedding_access.invitations for update to wedding_invitation_acceptor
 using(recipient_user_id=wedding_private.caller_uid() and accepted_at is null and revoked_at is null and expires_at>clock_timestamp())
 with check(recipient_user_id=wedding_private.caller_uid() and accepted_at is not null and revoked_at is null and expires_at>clock_timestamp());
grant select(id) on wedding_private.weddings to wedding_invitation_acceptor;
grant update(updated_at) on wedding_private.weddings to wedding_invitation_acceptor;
create policy invited_wedding_read on wedding_private.weddings for select to wedding_invitation_acceptor
 using(exists(select 1 from wedding_access.invitations i where i.wedding_id=weddings.id and i.recipient_user_id=wedding_private.caller_uid() and i.accepted_at is null and i.revoked_at is null and i.expires_at>clock_timestamp()));
create policy invited_wedding_lock on wedding_private.weddings for update to wedding_invitation_acceptor
 using(exists(select 1 from wedding_access.invitations i where i.wedding_id=weddings.id and i.recipient_user_id=wedding_private.caller_uid() and i.accepted_at is null and i.revoked_at is null and i.expires_at>clock_timestamp()))
 with check(exists(select 1 from wedding_access.invitations i where i.wedding_id=weddings.id and i.recipient_user_id=wedding_private.caller_uid() and i.accepted_at is null and i.revoked_at is null and i.expires_at>clock_timestamp()));
grant select on wedding_access.memberships to wedding_invitation_acceptor;
grant insert(wedding_id,user_id,invited_by) on wedding_access.memberships to wedding_invitation_acceptor;
create policy invited_membership_read on wedding_access.memberships for select to wedding_invitation_acceptor
 using(user_id=wedding_private.caller_uid());
create policy invited_membership_insert on wedding_access.memberships for insert to wedding_invitation_acceptor
 with check(user_id=wedding_private.caller_uid() and exists(select 1 from wedding_access.invitations i where i.wedding_id=memberships.wedding_id and i.recipient_user_id=memberships.user_id and i.invited_by=memberships.invited_by and i.accepted_at is null and i.revoked_at is null and i.expires_at>clock_timestamp()));

create function wedding_access.manage_invitation(p_id uuid,p_operation text,p_recipient uuid default null,p_invitation uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $body$
declare raw_token text; invitation wedding_access.invitations; response jsonb;
begin
 if wedding_private.caller_uid() is null or coalesce((coalesce(nullif(current_setting('request.jwt.claim',true),''),nullif(current_setting('request.jwt.claims',true),''))::jsonb->>'is_anonymous')::boolean,false) then
  raise exception using errcode='42501',message='Wedding not available';
 end if;
 perform 1 from wedding_private.weddings where id=p_id and owner_user_id=wedding_private.caller_uid() for update;
 if not found then raise exception using errcode='42501',message='Wedding not available';end if;
 if p_operation='list' then
  select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'recipient_user_id',i.recipient_user_id,'expires_at',i.expires_at,'accepted_at',i.accepted_at,'revoked_at',i.revoked_at) order by i.created_at,i.id),'[]'::jsonb) into response from wedding_access.invitations i where i.wedding_id=p_id;
  return response;
 elsif p_operation='create' then
  if p_recipient is null or p_recipient=wedding_private.caller_uid() then raise exception using errcode='22023',message='Invalid recipient';end if;
  if exists(select 1 from wedding_access.memberships where wedding_id=p_id and user_id=p_recipient) then raise exception using errcode='55000',message='Membership already recorded';end if;
  update wedding_access.invitations set revoked_at=clock_timestamp() where wedding_id=p_id and recipient_user_id=p_recipient and accepted_at is null and revoked_at is null and expires_at<=clock_timestamp();
  -- Two CSPRNG UUIDv4 values provide 244 unpredictable bits, without extension grants.
  raw_token:=replace(pg_catalog.gen_random_uuid()::text,'-','')||replace(pg_catalog.gen_random_uuid()::text,'-','');
  insert into wedding_access.invitations(wedding_id,recipient_user_id,invited_by,token_hash,expires_at)
   values(p_id,p_recipient,wedding_private.caller_uid(),encode(pg_catalog.sha256(convert_to(raw_token,'UTF8')),'hex'),clock_timestamp()+interval '24 hours') returning * into invitation;
  return jsonb_build_object('id',invitation.id,'token',raw_token,'expires_at',invitation.expires_at);
 elsif p_operation='revoke' then
  select * into invitation from wedding_access.invitations where id=p_invitation and wedding_id=p_id for update;
  if not found then raise exception using errcode='42501',message='Invitation not available';end if;
  if invitation.accepted_at is not null then raise exception using errcode='55000',message='Revoke the membership instead';end if;
  update wedding_access.invitations set revoked_at=clock_timestamp() where id=invitation.id and revoked_at is null;
 elsif p_operation='revoke_member' then
  perform wedding_access.change_membership(p_id,p_recipient,true);
  update wedding_access.invitations set revoked_at=clock_timestamp() where wedding_id=p_id and recipient_user_id=p_recipient and accepted_at is null and revoked_at is null;
 else raise exception using errcode='22023',message='Invalid invitation operation';
 end if;
 return null;
end;
$body$;

create function wedding_access.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path='' as $body$
declare invitation wedding_access.invitations; wid uuid;
begin
 if wedding_private.caller_uid() is null or p_token is null or p_token !~ '^[a-f0-9]{64}$' or coalesce((coalesce(nullif(current_setting('request.jwt.claim',true),''),nullif(current_setting('request.jwt.claims',true),''))::jsonb->>'is_anonymous')::boolean,false) then
  raise exception using errcode='42501',message='Invitation not available';
 end if;
 select wedding_id into wid from wedding_access.invitations where token_hash=encode(pg_catalog.sha256(convert_to(p_token,'UTF8')),'hex') and recipient_user_id=wedding_private.caller_uid();
 if not found then raise exception using errcode='42501',message='Invitation not available';end if;
 -- Same parent-first lock order as grant/revoke; recheck invitation after waiting.
 perform 1 from wedding_private.weddings where id=wid for update;
 if not found then raise exception using errcode='42501',message='Invitation not available';end if;
 select * into invitation from wedding_access.invitations where wedding_id=wid and token_hash=encode(pg_catalog.sha256(convert_to(p_token,'UTF8')),'hex') and recipient_user_id=wedding_private.caller_uid() for update;
 if not found or invitation.accepted_at is not null or invitation.revoked_at is not null or invitation.expires_at<=clock_timestamp() then raise exception using errcode='42501',message='Invitation not available';end if;
 if exists(select 1 from wedding_access.memberships where wedding_id=wid and user_id=wedding_private.caller_uid() and revoked_at is not null) then raise exception using errcode='42501',message='Invitation not available';end if;
 insert into wedding_access.memberships(wedding_id,user_id,invited_by) values(wid,wedding_private.caller_uid(),invitation.invited_by) on conflict(wedding_id,user_id) do nothing;
 update wedding_access.invitations set accepted_at=clock_timestamp() where id=invitation.id and accepted_at is null and revoked_at is null and expires_at>clock_timestamp();
 if not found then raise exception using errcode='42501',message='Invitation not available';end if;
 return wid;
end;
$body$;
grant create on schema wedding_access to wedding_membership_writer,wedding_invitation_acceptor;
alter function wedding_access.manage_invitation(uuid,text,uuid,uuid) owner to wedding_membership_writer;
alter function wedding_access.accept_invitation(text) owner to wedding_invitation_acceptor;
revoke create on schema wedding_access from wedding_membership_writer,wedding_invitation_acceptor;
revoke all on function wedding_access.manage_invitation(uuid,text,uuid,uuid),wedding_access.accept_invitation(text) from public,anon,authenticated;
grant execute on function wedding_access.manage_invitation(uuid,text,uuid,uuid),wedding_access.accept_invitation(text) to authenticated;
create function public.invitation_issue(p_id uuid,p_recipient uuid) returns jsonb language sql security invoker set search_path='' as $body$
 select wedding_access.manage_invitation(p_id,'create',p_recipient,null);
$body$;
create function public.invitation_list(p_id uuid) returns jsonb language sql security invoker set search_path='' as $body$
 select wedding_access.manage_invitation(p_id,'list');
$body$;
create function public.invitation_revoke(p_id uuid,p_invitation uuid) returns void language sql security invoker set search_path='' as $body$
 select wedding_access.manage_invitation(p_id,'revoke',null,p_invitation);
$body$;
create function public.invitation_accept(p_token text) returns uuid language sql security invoker set search_path='' as $body$
 select wedding_access.accept_invitation(p_token);
$body$;
-- Existing revocation also invalidates pending links, so no older link can undo it.
create or replace function public.membership_revoke(p_id uuid,p_member uuid) returns void language sql security invoker set search_path='' as $body$
 select wedding_access.manage_invitation(p_id,'revoke_member',p_member,null);
$body$;
revoke all on function public.invitation_issue(uuid,uuid),public.invitation_list(uuid),public.invitation_revoke(uuid,uuid),public.invitation_accept(text) from public,anon,authenticated;
grant execute on function public.invitation_issue(uuid,uuid),public.invitation_list(uuid),public.invitation_revoke(uuid,uuid),public.invitation_accept(text) to authenticated;
commit;
