-- WP-15 exact-diff review candidate; apply only after founder approval.
begin;
create function wedding_private.finance_fields(p_fields jsonb,p_keys text[]) returns void language plpgsql set search_path='' as $b$
begin
 if p_fields is null or jsonb_typeof(p_fields)<>'object' or octet_length(p_fields::text)>8192 then raise exception using errcode='22023',message='Invalid finance fields';end if;
 if exists(select 1 from jsonb_object_keys(p_fields) k where not(k=any(p_keys))) then raise exception using errcode='22023',message='Unsupported finance field';end if;
end;$b$;
create function wedding_private.finance_money(p_value jsonb,p_required boolean default false) returns bigint language plpgsql immutable set search_path='' as $b$
declare value text;
begin
 if p_value is null or p_value='null'::jsonb then if p_required then raise exception using errcode='22023',message='Recorded amount required';end if;return null;end if;
 value:=p_value#>>'{}';
 if jsonb_typeof(p_value)<>'string' or value!~'^(0|[1-9][0-9]*)$' or length(value)>12 then raise exception using errcode='22023',message='Use exact text paise';end if;
 if value::numeric>100000000000 then raise exception using errcode='22023',message='Amount bound exceeded';end if;return value::bigint;
end;$b$;
create function wedding_private.finance_text(p_value jsonb,p_max integer,p_required boolean default false) returns text language plpgsql immutable set search_path='' as $b$
declare value text;
begin
 if p_value is null or p_value='null'::jsonb then if p_required then raise exception using errcode='22023',message='Text required';end if;return null;end if;
 if jsonb_typeof(p_value)<>'string' then raise exception using errcode='22023',message='Use text';end if;
 value:=nullif(btrim(p_value#>>'{}'),'');if char_length(value)>p_max or (p_required and value is null) then raise exception using errcode='22023',message='Invalid text length';end if;return value;
end;$b$;
create function wedding_private.finance_version(p_id uuid,p_version text) returns void language plpgsql set search_path='' as $b$
begin
 if p_version is null or p_version!~'^(0|[1-9][0-9]*)$' or length(p_version)>19 then raise exception using errcode='22023',message='Invalid version';end if;
 if p_version::numeric>9223372036854775807 then raise exception using errcode='22023',message='Invalid version';end if;
 if (select state_version from wedding_private.weddings where id=p_id)<>p_version::bigint then raise exception using errcode='40001',message='Plan changed; reload';end if;
end;$b$;

create or replace function wedding_private.guard_cost() returns trigger language plpgsql set search_path='' as $b$
begin
 if tg_op='UPDATE' then
  if new.ceremony_id is distinct from old.ceremony_id then raise exception using errcode='23514',message='Cost reparenting is not supported';end if;
  if old.archived_at is not null and (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at') then raise exception using errcode='23514',message='Archived cost is immutable';end if;
  if new.state<>old.state and not((old.state='PLANNED' and new.state in('COMMITTED','FINAL','CANCELLED')) or (old.state='COMMITTED' and new.state in('FINAL','CANCELLED'))) then raise exception using errcode='23514',message='Unsupported financial transition';end if;
  if new.archived_at is not null and old.archived_at is null then
   if old.state<>'PLANNED' or new.state<>'PLANNED' or old.commitment_paise is not null or old.actual_paise is not null or old.cancellation_settlement_paise is not null
    or exists(select 1 from wedding_private.cash_entries where wedding_id=new.wedding_id and cost_item_id=new.id)
    or exists(select 1 from wedding_private.audit_events where wedding_id=new.wedding_id and entity_id=new.id and action not in('COST_CREATED','COST_ESTIMATE_EDITED','COST_TITLE_EDITED','COST_EXPECTED_REFUND_EDITED')) then raise exception using errcode='23514',message='Financial history cannot be archived away';end if;
  end if;
 end if;return new;
end;$b$;

create function public.finance_read(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $b$
 select jsonb_build_object('wedding',to_jsonb(w),'ceremonies',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at,c.id) from public.ceremonies c where c.wedding_id=w.id),'[]'::jsonb),'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at,i.id) from public.cost_items i where i.wedding_id=w.id),'[]'::jsonb),'cash',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at,e.id) from public.cash_entries e where e.wedding_id=w.id),'[]'::jsonb),'audit',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at,a.id) from public.audit_events a where a.wedding_id=w.id and (a.entity_type in('cost_item','cash_entry') or a.action='BUDGET_CEILING_CHANGED')),'[]'::jsonb)) from public.weddings w where w.id=p_id and w.state<>'ARCHIVED'
$b$;

create function public.finance_cost(p_id uuid,p_cost uuid,p_version text,p_operation text,p_fields jsonb,p_confirm boolean,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $b$
declare w wedding_private.weddings; old_item wedding_private.cost_items; next_item wedding_private.cost_items; ceremony uuid; amount bigint; title text; basis text; next_state text; event_action text;
begin
 w:=wedding_private.owned_wedding_lock(p_id);if w.state<>'ACTIVE' then raise exception using errcode='55000',message='Finance requires active plan';end if;
 perform wedding_private.finance_version(p_id,p_version);
 if p_operation='budget' then
  perform wedding_private.finance_fields(p_fields,array['amount_paise']);amount:=wedding_private.finance_money(p_fields->'amount_paise');
  if amount is not distinct from w.budget_ceiling_paise then return jsonb_build_object('id',p_id,'version',w.state_version::text);end if;
  update wedding_private.weddings set budget_ceiling_paise=amount where id=p_id;
  insert into wedding_private.audit_events(wedding_id,actor_user_id,entity_type,entity_id,action,before_after) values(p_id,wedding_private.caller_uid(),'wedding',p_id,'BUDGET_CEILING_CHANGED',jsonb_build_object('before_paise',w.budget_ceiling_paise::text,'after_paise',amount::text));
  return jsonb_build_object('id',p_id,'version',(select state_version::text from wedding_private.weddings where id=p_id));
 end if;
 if p_operation='create' then
  if p_cost is not null then raise exception using errcode='22023',message='New cost cannot supply identity';end if;
  perform wedding_private.finance_fields(p_fields,array['title','ceremony_id','pricing_basis','fixed_estimate_paise','per_guest_rate_paise']);
  title:=wedding_private.finance_text(p_fields->'title',160,true);basis:=p_fields->>'pricing_basis';
  if basis is null or basis not in('FIXED','PER_GUEST') then raise exception using errcode='22023',message='Invalid pricing basis';end if;
  ceremony:=nullif(p_fields->>'ceremony_id','')::uuid;
  if ceremony is not null and not exists(select 1 from wedding_private.ceremonies where wedding_id=p_id and id=ceremony and not is_archived) then raise exception using errcode='42501',message='Ceremony not available';end if;
  insert into wedding_private.cost_items(wedding_id,ceremony_id,title,pricing_basis,fixed_estimate_paise,per_guest_rate_paise) values(p_id,ceremony,title,basis,wedding_private.finance_money(p_fields->'fixed_estimate_paise'),wedding_private.finance_money(p_fields->'per_guest_rate_paise')) returning * into next_item;
  event_action:='COST_CREATED';
 else
  select * into old_item from wedding_private.cost_items where wedding_id=p_id and id=p_cost for update;
  if not found then raise exception using errcode='42501',message='Cost not available';end if;
  if old_item.archived_at is not null then raise exception using errcode='55000',message='Archived cost is read only';end if;next_item:=old_item;
  case p_operation
  when 'edit' then
   perform wedding_private.finance_fields(p_fields,array['title','pricing_basis','fixed_estimate_paise','per_guest_rate_paise']);
   if p_fields?'title' then next_item.title:=wedding_private.finance_text(p_fields->'title',160,true);end if;
   if p_fields?'pricing_basis' or p_fields?'fixed_estimate_paise' or p_fields?'per_guest_rate_paise' then
    if old_item.state<>'PLANNED' then raise exception using errcode='23514',message='Recorded amounts require explicit correction';end if;
    if p_fields?'pricing_basis' then next_item.pricing_basis:=p_fields->>'pricing_basis';end if;
    if p_fields?'fixed_estimate_paise' then next_item.fixed_estimate_paise:=wedding_private.finance_money(p_fields->'fixed_estimate_paise');end if;
    if p_fields?'per_guest_rate_paise' then next_item.per_guest_rate_paise:=wedding_private.finance_money(p_fields->'per_guest_rate_paise');end if;
   end if;event_action:=case when old_item.state='PLANNED' then 'COST_ESTIMATE_EDITED' else 'COST_TITLE_EDITED' end;
  when 'expected_refund' then
   perform wedding_private.finance_fields(p_fields,array['expected_refund_paise']);next_item.expected_refund_paise:=wedding_private.finance_money(p_fields->'expected_refund_paise');event_action:='COST_EXPECTED_REFUND_EDITED';
  when 'state' then
   perform wedding_private.finance_fields(p_fields,array['state','amount_paise']);if p_confirm is distinct from true then raise exception using errcode='22023',message='Confirm financial state change';end if;
   next_state:=p_fields->>'state';
   if next_state is null or not((old_item.state='PLANNED' and next_state in('COMMITTED','FINAL','CANCELLED')) or (old_item.state='COMMITTED' and next_state in('FINAL','CANCELLED'))) then raise exception using errcode='23514',message='Unsupported financial transition';end if;
   amount:=wedding_private.finance_money(p_fields->'amount_paise',next_state<>'CANCELLED');next_item.state:=next_state;
   if next_state='COMMITTED' then next_item.commitment_paise:=amount;elsif next_state='FINAL' then next_item.actual_paise:=amount;else next_item.cancellation_settlement_paise:=amount;end if;event_action:='COST_STATE_CHANGED';
  when 'correct' then
   perform wedding_private.finance_fields(p_fields,array['amount_paise']);if p_confirm is distinct from true or p_reason is null or char_length(btrim(p_reason)) not between 1 and 1000 then raise exception using errcode='22023',message='Correction needs confirmation and reason';end if;
   amount:=wedding_private.finance_money(p_fields->'amount_paise',true);
   if old_item.state='COMMITTED' then next_item.commitment_paise:=amount;elsif old_item.state='FINAL' then next_item.actual_paise:=amount;elsif old_item.state='CANCELLED' then next_item.cancellation_settlement_paise:=amount;else raise exception using errcode='23514',message='Edit planned estimate instead';end if;event_action:='COST_AMOUNT_CORRECTED';
  when 'archive' then
   perform wedding_private.finance_fields(p_fields,array[]::text[]);if p_confirm is distinct from true then raise exception using errcode='22023',message='Confirm archive';end if;
   next_item.archived_at:=statement_timestamp();event_action:='COST_ARCHIVED';
  else raise exception using errcode='22023',message='Invalid cost operation';end case;
  if to_jsonb(next_item) is not distinct from to_jsonb(old_item) then return jsonb_build_object('id',p_cost,'version',w.state_version::text);end if;
  update wedding_private.cost_items set title=next_item.title,pricing_basis=next_item.pricing_basis,fixed_estimate_paise=next_item.fixed_estimate_paise,per_guest_rate_paise=next_item.per_guest_rate_paise,commitment_paise=next_item.commitment_paise,actual_paise=next_item.actual_paise,cancellation_settlement_paise=next_item.cancellation_settlement_paise,expected_refund_paise=next_item.expected_refund_paise,state=next_item.state,archived_at=next_item.archived_at where wedding_id=p_id and id=p_cost returning * into next_item;
 end if;
 insert into wedding_private.audit_events(wedding_id,actor_user_id,entity_type,entity_id,action,before_after) values(p_id,wedding_private.caller_uid(),'cost_item',next_item.id,event_action,jsonb_build_object('before',case when old_item.id is null then null else jsonb_build_object('title',old_item.title,'state',old_item.state,'pricing_basis',old_item.pricing_basis,'fixed_estimate_paise',old_item.fixed_estimate_paise::text,'per_guest_rate_paise',old_item.per_guest_rate_paise::text,'commitment_paise',old_item.commitment_paise::text,'actual_paise',old_item.actual_paise::text,'settlement_paise',old_item.cancellation_settlement_paise::text,'expected_refund_paise',old_item.expected_refund_paise::text) end,'after',jsonb_build_object('title',next_item.title,'state',next_item.state,'pricing_basis',next_item.pricing_basis,'fixed_estimate_paise',next_item.fixed_estimate_paise::text,'per_guest_rate_paise',next_item.per_guest_rate_paise::text,'commitment_paise',next_item.commitment_paise::text,'actual_paise',next_item.actual_paise::text,'settlement_paise',next_item.cancellation_settlement_paise::text,'expected_refund_paise',next_item.expected_refund_paise::text,'archived_at',next_item.archived_at),'reason',case when p_operation='correct' then btrim(p_reason) else null end));
 return jsonb_build_object('id',next_item.id,'version',(select state_version::text from wedding_private.weddings where id=p_id));
end;$b$;

create function public.finance_cash(p_id uuid,p_cost uuid,p_entry uuid,p_version text,p_operation text,p_fields jsonb,p_confirm boolean,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $b$
declare w wedding_private.weddings; item wedding_private.cost_items; original wedding_private.cash_entries; next_entry wedding_private.cash_entries; amount bigint; kind text; occurred date; note text; intent text; audit_id uuid;
begin
 w:=wedding_private.owned_wedding_lock(p_id);if w.state<>'ACTIVE' then raise exception using errcode='55000',message='Finance requires active plan';end if;
 select * into item from wedding_private.cost_items where wedding_id=p_id and id=p_cost for update;
 if not found then raise exception using errcode='42501',message='Cost not available';end if;
 if item.archived_at is not null then raise exception using errcode='55000',message='Archived cost is read only';end if;
 if p_operation='post' then
  perform wedding_private.finance_fields(p_fields,array['kind','amount_paise','occurred_on','note','intent_key']);if p_entry is not null then raise exception using errcode='22023',message='New cash cannot supply identity';end if;
  kind:=p_fields->>'kind';if kind is null or kind not in('PAYMENT','REFUND_RECEIVED') then raise exception using errcode='22023',message='Invalid cash kind';end if;
  amount:=wedding_private.finance_money(p_fields->'amount_paise',true);if amount<=0 then raise exception using errcode='22023',message='Cash must be positive';end if;
  occurred:=wedding_private.draft_date(p_fields->>'occurred_on');if occurred is null then raise exception using errcode='22023',message='Occurrence date required';end if;
  note:=wedding_private.finance_text(p_fields->'note',1000);intent:=wedding_private.finance_text(p_fields->'intent_key',160,true);
  select * into original from wedding_private.cash_entries where wedding_id=p_id and intent_key=intent;
  if found then
   if (original.cost_item_id,original.kind,original.amount_paise,original.occurred_on,original.note) is distinct from (p_cost,kind,amount,occurred,note) then raise exception using errcode='23514',message='Intent payload conflict';end if;
   return jsonb_build_object('id',original.id,'status',original.status,'intent_key',original.intent_key,'replayed',true,'version',(select state_version::text from wedding_private.weddings where id=p_id));
  end if;
  perform wedding_private.finance_version(p_id,p_version);
  insert into wedding_private.cash_entries(wedding_id,cost_item_id,kind,amount_paise,occurred_on,note,intent_key) values(p_id,p_cost,kind,amount,occurred,note,intent) returning * into next_entry;
  insert into wedding_private.audit_events(wedding_id,actor_user_id,entity_type,entity_id,action,before_after) values(p_id,wedding_private.caller_uid(),'cash_entry',next_entry.id,'CASH_POSTED',jsonb_build_object('kind',kind,'amount_paise',amount::text,'occurred_on',occurred,'intent_key',intent));
 elsif p_operation='void' then
  perform wedding_private.finance_fields(p_fields,array[]::text[]);if p_confirm is distinct from true or p_reason is null or char_length(btrim(p_reason)) not between 1 and 1000 then raise exception using errcode='22023',message='Void needs confirmation and reason';end if;
  select * into original from wedding_private.cash_entries where wedding_id=p_id and cost_item_id=p_cost and id=p_entry for update;
  if not found then raise exception using errcode='42501',message='Cash not available';end if;
  if original.status='VOIDED' then return jsonb_build_object('id',original.id,'status',original.status,'replayed',true,'version',(select state_version::text from wedding_private.weddings where id=p_id));end if;
  perform wedding_private.finance_version(p_id,p_version);
  insert into wedding_private.audit_events(wedding_id,actor_user_id,entity_type,entity_id,action,before_after) values(p_id,wedding_private.caller_uid(),'cash_entry',original.id,'CASH_VOIDED',jsonb_build_object('before_status',original.status,'after_status','VOIDED','amount_paise',original.amount_paise::text,'reason',btrim(p_reason))) returning id into audit_id;
  update wedding_private.cash_entries set status='VOIDED',voided_at=statement_timestamp(),void_reason=btrim(p_reason),void_audit_event_id=audit_id where wedding_id=p_id and cost_item_id=p_cost and id=p_entry returning * into next_entry;
 else raise exception using errcode='22023',message='Invalid cash operation';end if;
 return jsonb_build_object('id',next_entry.id,'status',next_entry.status,'intent_key',next_entry.intent_key,'replayed',false,'version',(select state_version::text from wedding_private.weddings where id=p_id));
end;$b$;

revoke all on function wedding_private.finance_fields(jsonb,text[]),wedding_private.finance_money(jsonb,boolean),wedding_private.finance_text(jsonb,integer,boolean),wedding_private.finance_version(uuid,text) from public,anon,authenticated;
grant execute on function wedding_private.finance_fields(jsonb,text[]),wedding_private.finance_money(jsonb,boolean),wedding_private.finance_text(jsonb,integer,boolean),wedding_private.finance_version(uuid,text) to wedding_mutator;
grant create on schema public to wedding_mutator;
alter function public.finance_cost(uuid,uuid,text,text,jsonb,boolean,text) owner to wedding_mutator;
alter function public.finance_cash(uuid,uuid,uuid,text,text,jsonb,boolean,text) owner to wedding_mutator;
revoke create on schema public from wedding_mutator;
revoke all on function public.finance_cost(uuid,uuid,text,text,jsonb,boolean,text),public.finance_cash(uuid,uuid,uuid,text,text,jsonb,boolean,text),public.finance_read(uuid) from public,anon,authenticated;
grant execute on function public.finance_cost(uuid,uuid,text,text,jsonb,boolean,text),public.finance_cash(uuid,uuid,uuid,text,text,jsonb,boolean,text),public.finance_read(uuid) to authenticated;
commit;
