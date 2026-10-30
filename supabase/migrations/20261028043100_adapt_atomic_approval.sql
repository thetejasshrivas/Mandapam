-- WP-18 review candidate: one atomic approval mutation and one read-only outcome.
begin;
-- New access is internal-only; authenticated/anon table grants remain unchanged.
grant select on wedding_private.cost_items,wedding_private.tasks,wedding_private.cash_entries to wedding_guest_approver;
grant execute on function wedding_private.owned_wedding_lock(uuid),wedding_private.adapt_snapshot(uuid,uuid,integer) to wedding_guest_approver;
create function public.adapt_approve(p_id uuid,p_proposal uuid) returns jsonb language plpgsql security definer set search_path='' as $b$
 declare w wedding_private.weddings;p wedding_private.change_proposals;c wedding_private.ceremonies;snapshot jsonb;capacity integer;capacity_number numeric;source text;i wedding_private.cost_items;before_amount numeric;after_amount numeric;known_delta numeric:=0;known_items integer:=0;unknown_items integer:=0;new_version bigint;audit_id uuid;decision_time timestamptz;
 begin
 -- All mutators use parent-first locking. Proposal lookup is scoped to the owner wedding.
 w:=wedding_private.owned_wedding_lock(p_id);
 select * into p from wedding_private.change_proposals where wedding_id=p_id and id=p_proposal for update;
 if p.id is null then raise exception using errcode='42501',message='Proposal not found';end if;
 select * into c from wedding_private.ceremonies where wedding_id=p_id and id=p.ceremony_id for update;
 if c.id is null then raise exception using errcode='42501',message='Ceremony not found';end if;
 if p.status='APPLIED' then
 return jsonb_build_object('id',p.id,'status','APPLIED','replayed',true,'ceremony_id',c.id,'old_guest_count',p.old_guest_count,'new_guest_count',p.new_guest_count,'current_guest_count',c.guest_count,'base_wedding_version',p.base_wedding_version::text,'applied_version',p.applied_version::text,'current_version',w.state_version::text,'applied_audit_event_id',p.applied_audit_event_id,'decided_at',p.decided_at);
 end if;
 if p.status<>'PENDING' then raise exception using errcode='PT409',message='Rejected or terminal proposal cannot apply';end if;
 if w.state<>'ACTIVE' or c.is_archived or c.guest_count is distinct from p.old_guest_count or p.base_wedding_version<>w.state_version or p.new_guest_count not between 1 and 10000 or p.old_guest_count not between 1 and 10000 or p.new_guest_count=p.old_guest_count then raise exception using errcode='PT409',message='Stale or invalid active context; request fresh preview';end if;
 snapshot:=p.preview_snapshot;
 if snapshot->>'schema_version' is distinct from '1' or jsonb_typeof(snapshot->'capacity') is distinct from 'object' then raise exception using errcode='PT409',message='Malformed preview';end if;
 source:=snapshot->'capacity'->>'source';
 if source='SCENARIO' then
 if jsonb_typeof(snapshot->'capacity'->'value') is distinct from 'number' then raise exception using errcode='PT409',message='Malformed capacity assumption';end if;
 capacity_number:=(snapshot->'capacity'->>'value')::numeric;
 if capacity_number<>trunc(capacity_number) or capacity_number not between 1 and 50000 then raise exception using errcode='PT409',message='Malformed capacity assumption';end if;
 capacity:=capacity_number::integer;
 elsif source in('RECORDED','UNKNOWN') then capacity:=null;
 else raise exception using errcode='PT409',message='Malformed capacity source';end if;
 -- Equality rejects missing, extra, forged or changed fields; no caller-supplied writes.
 if snapshot is distinct from wedding_private.adapt_snapshot(p_id,c.id,capacity) then raise exception using errcode='PT409',message='Preview no longer matches authoritative context';end if;
 -- Recompute the current eligible impact exactly. Unknown rates stay unknown.
 for i in select * from wedding_private.cost_items where wedding_id=p_id and ceremony_id=c.id and archived_at is null and state='PLANNED' and pricing_basis='PER_GUEST' and commitment_paise is null and actual_paise is null and cancellation_settlement_paise is null loop
 if i.per_guest_rate_paise is null then unknown_items:=unknown_items+1;
 else
 before_amount:=i.per_guest_rate_paise::numeric*p.old_guest_count;
 after_amount:=i.per_guest_rate_paise::numeric*p.new_guest_count;
 if before_amount>100000000000 or after_amount>100000000000 then raise exception using errcode='PT409',message='Current calculated impact exceeds item bound';end if;
 known_delta:=known_delta+after_amount-before_amount;known_items:=known_items+1;
 end if;
 end loop;
 if abs(known_delta)>9223372036854775807 then raise exception using errcode='PT409',message='Calculated impact exceeds aggregate bound';end if;
 decision_time:=clock_timestamp();
 -- The existing ceremony trigger alone increments the wedding version.
 update wedding_private.ceremonies set guest_count=p.new_guest_count where wedding_id=p_id and id=c.id;
 select state_version into new_version from wedding_private.weddings where id=p_id;
 if new_version<>w.state_version+1 then raise exception using errcode='PT409',message='Unexpected version outcome';end if;
 insert into wedding_private.audit_events(wedding_id,actor_user_id,entity_type,entity_id,action,before_after)
 values(p_id,wedding_private.caller_uid(),'proposal',p.id,'GUEST_COUNT_CHANGE_APPLIED',jsonb_build_object('ceremony_id',c.id,'old_guest_count',p.old_guest_count,'new_guest_count',p.new_guest_count,'base_version',p.base_wedding_version::text,'applied_version',new_version::text,'known_estimate_delta_paise',case when known_items>0 then known_delta::text else null end,'known_estimate_items',known_items,'unknown_estimate_items',unknown_items)) returning id into audit_id;
 update wedding_private.change_proposals set status='APPLIED',decided_at=decision_time,applied_version=new_version,applied_audit_event_id=audit_id where wedding_id=p_id and id=p.id;
 return jsonb_build_object('id',p.id,'status','APPLIED','replayed',false,'ceremony_id',c.id,'old_guest_count',p.old_guest_count,'new_guest_count',p.new_guest_count,'current_guest_count',p.new_guest_count,'base_wedding_version',p.base_wedding_version::text,'applied_version',new_version::text,'current_version',new_version::text,'applied_audit_event_id',audit_id,'decided_at',decision_time);
 end;
$b$;
create function public.adapt_outcome(p_id uuid,p_proposal uuid) returns jsonb language sql stable security invoker set search_path='' as $b$
 select jsonb_build_object('id',p.id,'status',p.status,'ceremony_id',p.ceremony_id,'old_guest_count',p.old_guest_count,'new_guest_count',p.new_guest_count,'current_guest_count',c.guest_count,'base_wedding_version',p.base_wedding_version,'applied_version',p.applied_version,'current_version',w.state_version,'applied_audit_event_id',p.applied_audit_event_id,'decided_at',p.decided_at)
 from public.weddings w join public.change_proposals p on p.wedding_id=w.id and p.id=p_proposal join public.ceremonies c on c.wedding_id=w.id and c.id=p.ceremony_id
 where w.id=p_id and w.owner_user_id=auth.uid()
$b$;
grant create on schema public to wedding_guest_approver;
alter function public.adapt_approve(uuid,uuid) owner to wedding_guest_approver;
revoke create on schema public from wedding_guest_approver;
revoke all on function public.adapt_approve(uuid,uuid),public.adapt_outcome(uuid,uuid) from public,anon,authenticated;
grant execute on function public.adapt_approve(uuid,uuid),public.adapt_outcome(uuid,uuid) to authenticated;
commit;
