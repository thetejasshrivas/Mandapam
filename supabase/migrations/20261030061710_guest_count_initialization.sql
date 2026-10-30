-- WP-33B local candidate. DEC-001: one owner-confirmed unknown-to-known initialization.
begin;
grant execute on function wedding_private.owned_wedding_lock(uuid) to wedding_guest_initializer;
grant select on wedding_private.cost_items to wedding_guest_initializer;
create function public.initialize_guest_count(p_id uuid,p_ceremony uuid,p_version text,p_new integer,p_confirmed boolean) returns jsonb
language plpgsql security definer set search_path='' as $b$
declare w wedding_private.weddings;c wedding_private.ceremonies;new_version bigint;audit_id uuid;
begin
 if wedding_private.caller_uid() is null or coalesce((coalesce(nullif(current_setting('request.jwt.claim',true),''),nullif(current_setting('request.jwt.claims',true),''))::jsonb->>'is_anonymous')::boolean,false) then raise exception using errcode='42501',message='Verified owner required';end if;
 w:=wedding_private.owned_wedding_lock(p_id);
 if p_confirmed is distinct from true or p_new is null or p_new not between 1 and 10000 or p_version is null or p_version !~ '^(0|[1-9][0-9]*)$' or length(p_version)>19 then raise exception using errcode='22023',message='Confirm a valid count and version';end if;
 if p_version::numeric>9223372036854775807 then raise exception using errcode='22023',message='Invalid version';end if;
 if w.state<>'ACTIVE' or w.state_version<>p_version::bigint then raise exception using errcode='PT409',message='Active context changed; reload and review';end if;
 select * into c from wedding_private.ceremonies where wedding_id=p_id and id=p_ceremony for update;
 if c.id is null then raise exception using errcode='42501',message='Ceremony not available';end if;
 if c.is_archived or c.guest_count is not null then raise exception using errcode='PT409',message='Initialization requires an unknown eligible count';end if;
 if exists(select 1 from wedding_private.cost_items i where i.wedding_id=p_id and i.ceremony_id=c.id and i.archived_at is null and i.state='PLANNED' and i.pricing_basis='PER_GUEST' and i.commitment_paise is null and i.actual_paise is null and i.cancellation_settlement_paise is null and i.per_guest_rate_paise::numeric*p_new>100000000000) then raise exception using errcode='22023',message='Derived forecast exceeds item bound';end if;
 update wedding_private.ceremonies set guest_count=p_new where wedding_id=p_id and id=c.id;
 select state_version into new_version from wedding_private.weddings where id=p_id;
 if new_version<>w.state_version+1 then raise exception using errcode='PT409',message='Unexpected version outcome';end if;
 insert into wedding_private.audit_events(wedding_id,actor_user_id,entity_type,entity_id,action,before_after)
 values(p_id,wedding_private.caller_uid(),'ceremony',c.id,'GUEST_COUNT_INITIALIZED',jsonb_build_object('old_guest_count',null,'new_guest_count',p_new,'base_version',w.state_version::text,'applied_version',new_version::text)) returning id into audit_id;
 return jsonb_build_object('ceremony_id',c.id,'guest_count',p_new,'applied_version',new_version::text,'audit_event_id',audit_id);
end;
$b$;
grant create on schema public to wedding_guest_initializer;
alter function public.initialize_guest_count(uuid,uuid,text,integer,boolean) owner to wedding_guest_initializer;
revoke create on schema public from wedding_guest_initializer;
revoke all on function public.initialize_guest_count(uuid,uuid,text,integer,boolean) from public,anon,authenticated;
grant execute on function public.initialize_guest_count(uuid,uuid,text,integer,boolean) to authenticated;
commit;
