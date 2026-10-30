-- WP-15 narrow write-boundary guard; no data or grant broadening.
begin;
create function wedding_private.guard_finance_forecast() returns trigger language plpgsql set search_path='' as $b$
declare guests integer;
begin
 if new.state='PLANNED' and new.pricing_basis='PER_GUEST' and new.per_guest_rate_paise is not null and new.ceremony_id is not null then
  select guest_count into guests from wedding_private.ceremonies where wedding_id=new.wedding_id and id=new.ceremony_id;
  if guests is not null and new.per_guest_rate_paise::numeric*guests::numeric>100000000000 then raise exception using errcode='22023',message='Per-item forecast bound exceeded';end if;
 end if;return new;
end;$b$;
revoke all on function wedding_private.guard_finance_forecast() from public,anon,authenticated;
grant execute on function wedding_private.guard_finance_forecast() to wedding_mutator;
create trigger c_guard_finance_forecast before insert or update on wedding_private.cost_items for each row execute function wedding_private.guard_finance_forecast();
commit;
