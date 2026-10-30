-- Focused additional daily-limit assertion; rollback-only synthetic identity.
begin;
create temporary table wp19_daily_ids(wedding uuid,ceremony uuid);
grant select,insert,update on wp19_daily_ids to authenticated;
insert into auth.users(id,email) values('19000000-0000-4000-8000-000000000003','wp19-daily-rollback@example.invalid');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"19000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
insert into wp19_daily_ids(wedding) values(public.create_wedding('WP19 daily synthetic','Synthetic city'));
select public.save_draft_setup((select wedding from wp19_daily_ids),(select state_version from public.weddings),'WP19 daily synthetic','Synthetic city',null,true,null,'[{"title":"Reception"}]');
select public.generate_draft((select wedding from wp19_daily_ids),(select state_version from public.weddings));
update wp19_daily_ids set ceremony=(select id from public.ceremonies);
reset role;
-- Only this rollback fixture gets old usage timestamps, avoiding the minute cap.
insert into wedding_private.ai_request_slots(wedding_id,owner_user_id,created_at)
select wedding,'19000000-0000-4000-8000-000000000003',date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC' from wp19_daily_ids cross join generate_series(1,5);
create function pg_temp.wp19_daily_check() returns jsonb language plpgsql security invoker as $$
declare caught text;
begin
 begin perform public.ai_reserve((select wedding from wp19_daily_ids),array[(select ceremony from wp19_daily_ids)]);
 exception when others then get stacked diagnostics caught=returned_sqlstate;end;
 return jsonb_build_object('name','five attempts in UTC day block sixth across requests','passed',caught='PT429','observed_sqlstate',caught);
end;$$;
set local role authenticated;
select pg_temp.wp19_daily_check() as wp19_daily_result;
reset role;
rollback;
