-- WP-17: preview/PENDING/rejection only. No approval or plan mutation operation.
begin;
create function wedding_private.adapt_snapshot(p_id uuid,p_ceremony uuid,p_capacity integer) returns jsonb language sql stable security invoker set search_path='' as $b$
 select jsonb_build_object('schema_version',1,
 'wedding',jsonb_build_object('id',w.id,'state',w.state,'state_version',w.state_version::text,'wedding_date',w.wedding_date),
 'ceremony',jsonb_build_object('id',c.id,'wedding_id',c.wedding_id,'title',c.title,'guest_count',c.guest_count,'venue_capacity',c.venue_capacity,'is_archived',c.is_archived,'ceremony_date',c.ceremony_date),
 'capacity',jsonb_build_object('value',coalesce(p_capacity,c.venue_capacity),'source',case when p_capacity is not null then 'SCENARIO' when c.venue_capacity is not null then 'RECORDED' else 'UNKNOWN' end),
 'costs',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'wedding_id',i.wedding_id,'ceremony_id',i.ceremony_id,'title',i.title,'state',i.state,'pricing_basis',i.pricing_basis,'fixed_estimate_paise',i.fixed_estimate_paise::text,'per_guest_rate_paise',i.per_guest_rate_paise::text,'commitment_paise',i.commitment_paise::text,'actual_paise',i.actual_paise::text,'cancellation_settlement_paise',i.cancellation_settlement_paise::text,'expected_refund_paise',i.expected_refund_paise::text,'archived_at',i.archived_at) order by i.created_at,i.id) from wedding_private.cost_items i where i.wedding_id=w.id and (i.ceremony_id=c.id or i.ceremony_id is null) and i.archived_at is null),'[]'::jsonb),
 'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'wedding_id',t.wedding_id,'ceremony_id',t.ceremony_id,'title',t.title,'status',t.status,'due_date',t.due_date,'completed_at',t.completed_at,'archived_at',t.archived_at,'dismissed_at',t.dismissed_at) order by t.created_at,t.id) from wedding_private.tasks t where t.wedding_id=w.id and t.ceremony_id=c.id),'[]'::jsonb),
 'protected_records',jsonb_build_object('task_ids',coalesce((select jsonb_agg(t.id order by t.id) from wedding_private.tasks t where t.wedding_id=w.id),'[]'::jsonb),'cost_item_ids',coalesce((select jsonb_agg(i.id order by i.id) from wedding_private.cost_items i where i.wedding_id=w.id),'[]'::jsonb),'cash_entry_ids',coalesce((select jsonb_agg(e.id order by e.id) from wedding_private.cash_entries e where e.wedding_id=w.id),'[]'::jsonb)))
 from wedding_private.weddings w join wedding_private.ceremonies c on c.wedding_id=w.id and c.id=p_ceremony
 where w.id=p_id and w.owner_user_id=wedding_private.caller_uid() and w.state='ACTIVE' and not c.is_archived
$b$;
create function wedding_private.adapt_proposal_result(p wedding_private.change_proposals) returns jsonb language sql immutable security invoker set search_path='' as $b$
 select jsonb_build_object('id',p.id,'wedding_id',p.wedding_id,'ceremony_id',p.ceremony_id,'base_wedding_version',p.base_wedding_version::text,'old_guest_count',p.old_guest_count,'new_guest_count',p.new_guest_count,'status',p.status,'preview_snapshot',p.preview_snapshot,'created_at',p.created_at,'decided_at',p.decided_at)
$b$;
create function public.adapt_context(p_id uuid,p_ceremony uuid,p_capacity integer default null) returns jsonb language plpgsql stable security definer set search_path='' as $b$
 declare snapshot jsonb;
 begin
 if p_capacity is not null and p_capacity not between 1 and 50000 then raise exception using errcode='22023',message='Capacity must be1..50000';end if;
 snapshot:=wedding_private.adapt_snapshot(p_id,p_ceremony,p_capacity);
 if octet_length(snapshot::text)>65536 then raise exception using errcode='54000',message='Preview context exceeds safe size';end if;
 return snapshot;
 end;
$b$;
create function public.adapt_propose(p_id uuid,p_ceremony uuid,p_version text,p_new integer,p_capacity integer default null) returns jsonb language plpgsql security definer set search_path='' as $b$
 declare w wedding_private.weddings;c wedding_private.ceremonies;snapshot jsonb;p wedding_private.change_proposals;
 begin
 w:=wedding_private.owned_wedding_lock(p_id);
 if w.state<>'ACTIVE' then raise exception using errcode='55000',message='ADAPT requires active plan';end if;
 perform wedding_private.finance_version(p_id,p_version);
 select * into c from wedding_private.ceremonies where wedding_id=p_id and id=p_ceremony;
 if c.id is null or c.is_archived then raise exception using errcode='42501',message='Ceremony not found';end if;
 if c.guest_count is null or p_new is null or p_new not between 1 and 10000 or p_new=c.guest_count or (p_capacity is not null and p_capacity not between 1 and 50000) then raise exception using errcode='22023',message='Use known positive different headcounts and optional capacity1..50000';end if;
 if exists(select 1 from wedding_private.cost_items i where i.wedding_id=p_id and i.ceremony_id=p_ceremony and i.archived_at is null and i.state='PLANNED' and i.pricing_basis='PER_GUEST' and i.commitment_paise is null and i.actual_paise is null and i.cancellation_settlement_paise is null and i.per_guest_rate_paise::numeric*p_new>100000000000) then raise exception using errcode='22023',message='Derived forecast exceeds item bound';end if;
 snapshot:=wedding_private.adapt_snapshot(p_id,p_ceremony,p_capacity);
 if snapshot is null or snapshot->'wedding'->>'state_version'<>w.state_version::text then raise exception using errcode='PT409',message='Fresh coherent context required';end if;
 if octet_length(snapshot::text)>65536 then raise exception using errcode='54000',message='Preview context exceeds safe size';end if;
 select * into p from wedding_private.change_proposals where wedding_id=p_id and ceremony_id=p_ceremony and status='PENDING' and base_wedding_version=w.state_version and new_guest_count=p_new and preview_snapshot=snapshot order by created_at,id limit 1;
 if p.id is null then
 insert into wedding_private.change_proposals(wedding_id,ceremony_id,base_wedding_version,old_guest_count,new_guest_count,preview_snapshot) values(p_id,p_ceremony,w.state_version,c.guest_count,p_new,snapshot) returning * into p;
 end if;
 return wedding_private.adapt_proposal_result(p);
 end;
$b$;
create function public.adapt_reject(p_id uuid,p_proposal uuid) returns jsonb language plpgsql security definer set search_path='' as $b$
 declare w wedding_private.weddings;p wedding_private.change_proposals;
 begin
 w:=wedding_private.owned_wedding_lock(p_id);
 select * into p from wedding_private.change_proposals where wedding_id=p_id and id=p_proposal for update;
 if p.id is null then raise exception using errcode='42501',message='Proposal not found';end if;
 if p.status='REJECTED' then return wedding_private.adapt_proposal_result(p);end if;
 if p.status<>'PENDING' then raise exception using errcode='PT409',message='Proposal is terminal';end if;
 update wedding_private.change_proposals set status='REJECTED',decided_at=clock_timestamp() where wedding_id=p_id and id=p_proposal returning * into p;
 return wedding_private.adapt_proposal_result(p);
 end;
$b$;
-- Established NOLOGIN/NOBYPASSRLS mutator; no new table/client grants.
grant create on schema wedding_private,public to wedding_mutator;
alter function wedding_private.adapt_snapshot(uuid,uuid,integer) owner to wedding_mutator;
alter function wedding_private.adapt_proposal_result(wedding_private.change_proposals) owner to wedding_mutator;
alter function public.adapt_context(uuid,uuid,integer) owner to wedding_mutator;
alter function public.adapt_propose(uuid,uuid,text,integer,integer) owner to wedding_mutator;
alter function public.adapt_reject(uuid,uuid) owner to wedding_mutator;
revoke create on schema wedding_private,public from wedding_mutator;
revoke all on function wedding_private.adapt_snapshot(uuid,uuid,integer),wedding_private.adapt_proposal_result(wedding_private.change_proposals) from public,anon,authenticated;
revoke all on function public.adapt_context(uuid,uuid,integer),public.adapt_propose(uuid,uuid,text,integer,integer),public.adapt_reject(uuid,uuid) from public,anon,authenticated;
grant execute on function public.adapt_context(uuid,uuid,integer),public.adapt_propose(uuid,uuid,text,integer,integer),public.adapt_reject(uuid,uuid) to authenticated;
commit;
