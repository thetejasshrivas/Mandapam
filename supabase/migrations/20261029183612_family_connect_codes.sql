-- WP-ROLES-8A. Local candidate only. Connect Codes identify; invitations authorize.
begin;
create role wedding_connect_writer nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant wedding_connect_writer to postgres;
grant usage on schema wedding_access,wedding_private to wedding_connect_writer;
grant execute on function wedding_private.caller_uid() to wedding_connect_writer;

-- One replaceable credential per recipient; no plaintext, directory or history growth.
create table wedding_access.connect_codes(
 user_id uuid primary key references auth.users(id) on delete restrict,
 code_hash text not null unique check(code_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null,
 consumed_at timestamptz,
 revoked_at timestamptz
);
create table wedding_access.connect_attempts(
 user_id uuid not null references auth.users(id) on delete restrict,
 operation text not null check(operation in ('generate','redeem')),
 window_started timestamptz not null,
 attempts integer not null check(attempts between 1 and 5),
 primary key(user_id,operation)
);
alter table wedding_access.connect_codes enable row level security;
alter table wedding_access.connect_codes force row level security;
alter table wedding_access.connect_attempts enable row level security;
alter table wedding_access.connect_attempts force row level security;
revoke all on wedding_access.connect_codes,wedding_access.connect_attempts from public,anon,authenticated;
grant select,insert,update on wedding_access.connect_codes,wedding_access.connect_attempts to wedding_connect_writer;
create policy own_connect_code on wedding_access.connect_codes to wedding_connect_writer
 using(user_id=wedding_private.caller_uid()) with check(user_id=wedding_private.caller_uid());
create policy own_connect_attempts on wedding_access.connect_attempts to wedding_connect_writer
 using(user_id=wedding_private.caller_uid()) with check(user_id=wedding_private.caller_uid());
-- The existing owner-checked invitation helper alone may resolve and consume codes.
grant select on wedding_access.connect_codes to wedding_membership_writer;
grant update(consumed_at) on wedding_access.connect_codes to wedding_membership_writer;
create policy admin_connect_lookup on wedding_access.connect_codes for select to wedding_membership_writer
 using(exists(select 1 from wedding_private.weddings w where w.owner_user_id=wedding_private.caller_uid()));
create policy admin_connect_consume on wedding_access.connect_codes for update to wedding_membership_writer
 using(consumed_at is null and revoked_at is null and expires_at>clock_timestamp() and exists(select 1 from wedding_private.weddings w where w.owner_user_id=wedding_private.caller_uid()))
 with check(consumed_at is not null and revoked_at is null and exists(select 1 from wedding_private.weddings w where w.owner_user_id=wedding_private.caller_uid()));

-- Fixed ten-minute window, five attempts per actor/operation across ALL weddings.
-- Failure results must return normally so the counted attempt is committed.
create function wedding_access.connect_attempt(p_operation text) returns boolean
language plpgsql security definer set search_path='' as $body$
declare allowed boolean:=false;
begin
 if wedding_private.caller_uid() is null or coalesce((coalesce(nullif(current_setting('request.jwt.claim',true),''),nullif(current_setting('request.jwt.claims',true),''))::jsonb->>'is_anonymous')::boolean,false) then
  raise exception using errcode='42501',message='Connect request not available';
 end if;
 insert into wedding_access.connect_attempts as a(user_id,operation,window_started,attempts)
 values(wedding_private.caller_uid(),p_operation,clock_timestamp(),1)
 on conflict(user_id,operation) do update set
  window_started=case when a.window_started<=clock_timestamp()-interval '10 minutes' then clock_timestamp() else a.window_started end,
  attempts=case when a.window_started<=clock_timestamp()-interval '10 minutes' then 1 else a.attempts+1 end
 where a.attempts<5 or a.window_started<=clock_timestamp()-interval '10 minutes'
 returning true into allowed;
 return coalesce(allowed,false);
end;
$body$;
create function wedding_access.manage_connect(p_operation text) returns jsonb
language plpgsql security definer set search_path='' as $body$
declare raw_code text; expiry timestamptz;
begin
 if wedding_private.caller_uid() is null or coalesce((coalesce(nullif(current_setting('request.jwt.claim',true),''),nullif(current_setting('request.jwt.claims',true),''))::jsonb->>'is_anonymous')::boolean,false) then
  raise exception using errcode='42501',message='Connect request not available';
 end if;
 if p_operation='revoke' then
  update wedding_access.connect_codes set revoked_at=clock_timestamp() where user_id=wedding_private.caller_uid() and revoked_at is null;
  return null;
 elsif p_operation<>'generate' or p_operation is null then
  raise exception using errcode='22023',message='Invalid Connect operation';
 end if;
 if not wedding_access.connect_attempt('generate') then return jsonb_build_object('error','RATE_LIMITED');end if;
 -- Same native CSPRNG as invitation tokens: two UUIDv4 values, 244 random bits.
 raw_code:=replace(pg_catalog.gen_random_uuid()::text,'-','')||replace(pg_catalog.gen_random_uuid()::text,'-','');
 expiry:=clock_timestamp()+interval '15 minutes';
 insert into wedding_access.connect_codes(user_id,code_hash,expires_at)
 values(wedding_private.caller_uid(),encode(pg_catalog.sha256(convert_to(raw_code,'UTF8')),'hex'),expiry)
 on conflict(user_id) do update set code_hash=excluded.code_hash,expires_at=excluded.expires_at,consumed_at=null,revoked_at=null;
 return jsonb_build_object('code',raw_code,'expires_at',expiry);
end;
$body$;
create function wedding_access.issue_connect(p_id uuid,p_code text) returns jsonb
language plpgsql security definer set search_path='' as $body$
declare recipient wedding_access.connect_codes; issued jsonb;
begin
 if wedding_private.caller_uid() is null or coalesce((coalesce(nullif(current_setting('request.jwt.claim',true),''),nullif(current_setting('request.jwt.claims',true),''))::jsonb->>'is_anonymous')::boolean,false) then
  raise exception using errcode='42501',message='Wedding not available';
 end if;
 -- Preserve parent-first locking used by invitation issuance/acceptance/revocation.
 perform 1 from wedding_private.weddings where id=p_id and owner_user_id=wedding_private.caller_uid() for update;
 if not found then raise exception using errcode='42501',message='Wedding not available';end if;
 if not wedding_access.connect_attempt('redeem') then return jsonb_build_object('error','RATE_LIMITED');end if;
 if p_code is null or p_code !~ '^[a-f0-9]{64}$' then return jsonb_build_object('error','NOT_FOUND');end if;
 -- Subtransaction rolls back issuance AND consumption on conflict, retaining the attempt.
 begin
  select * into recipient from wedding_access.connect_codes where code_hash=encode(pg_catalog.sha256(convert_to(p_code,'UTF8')),'hex') for update;
  if not found or recipient.consumed_at is not null or recipient.revoked_at is not null or recipient.expires_at<=clock_timestamp() or recipient.user_id=wedding_private.caller_uid() then
   return jsonb_build_object('error','NOT_FOUND');
  end if;
  issued:=wedding_access.manage_invitation(p_id,'create',recipient.user_id,null);
  update wedding_access.connect_codes set consumed_at=clock_timestamp() where user_id=recipient.user_id and consumed_at is null and revoked_at is null and expires_at>clock_timestamp();
  if not found then raise exception using errcode='42501',message='Connect request not available';end if;
  return issued;
 exception
  when unique_violation or object_not_in_prerequisite_state then return jsonb_build_object('error','CONFLICT');
  when insufficient_privilege then return jsonb_build_object('error','NOT_FOUND');
 end;
end;
$body$;
grant create on schema wedding_access to wedding_connect_writer;
alter function wedding_access.connect_attempt(text) owner to wedding_connect_writer;
alter function wedding_access.manage_connect(text) owner to wedding_connect_writer;
revoke create on schema wedding_access from wedding_connect_writer;
grant create on schema wedding_access to wedding_membership_writer;
alter function wedding_access.issue_connect(uuid,text) owner to wedding_membership_writer;
revoke create on schema wedding_access from wedding_membership_writer;
revoke all on function wedding_access.connect_attempt(text),wedding_access.manage_connect(text),wedding_access.issue_connect(uuid,text) from public,anon,authenticated;
grant execute on function wedding_access.connect_attempt(text) to wedding_membership_writer;
grant execute on function wedding_access.manage_connect(text),wedding_access.issue_connect(uuid,text) to authenticated;

create function public.connect_code_generate() returns jsonb language sql security invoker set search_path='' as $body$
 select wedding_access.manage_connect('generate');
$body$;
create function public.connect_code_revoke() returns void language sql security invoker set search_path='' as $body$
 select wedding_access.manage_connect('revoke');
$body$;
create function public.invitation_issue_connect(p_id uuid,p_code text) returns jsonb language sql security invoker set search_path='' as $body$
 select wedding_access.issue_connect(p_id,p_code);
$body$;
revoke all on function public.connect_code_generate(),public.connect_code_revoke(),public.invitation_issue_connect(uuid,text) from public,anon,authenticated;
grant execute on function public.connect_code_generate(),public.connect_code_revoke(),public.invitation_issue_connect(uuid,text) to authenticated;
commit;
