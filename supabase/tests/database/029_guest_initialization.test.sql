begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_catalog;
select no_plan();
insert into auth.users(id,email) values ('33100000-0000-4000-8000-000000000001','wp33-suite-owner@example.invalid'),('33100000-0000-4000-8000-000000000002','wp33-suite-member@example.invalid');
select set_config('request.jwt.claims','{"sub":"33100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into wedding_private.weddings(id,owner_user_id,title,city) values ('33100000-0000-4000-8000-000000000010',auth.uid(),'WP33 synthetic','Test');
insert into wedding_private.ceremonies(id,wedding_id,title,guest_count,is_archived) values
('33100000-0000-4000-8000-000000000011','33100000-0000-4000-8000-000000000010','Unknown',null,false),
('33100000-0000-4000-8000-000000000012','33100000-0000-4000-8000-000000000010','Known',100,false),
('33100000-0000-4000-8000-000000000013','33100000-0000-4000-8000-000000000010','Archived',null,true),
('33100000-0000-4000-8000-000000000014','33100000-0000-4000-8000-000000000010','Bound',null,false);
insert into wedding_private.tasks(wedding_id,ceremony_id,title,status,completed_at) values ('33100000-0000-4000-8000-000000000010','33100000-0000-4000-8000-000000000011','Completed','COMPLETED',now());
insert into wedding_private.cost_items(id,wedding_id,ceremony_id,title,pricing_basis,per_guest_rate_paise) values
('33100000-0000-4000-8000-000000000020','33100000-0000-4000-8000-000000000010','33100000-0000-4000-8000-000000000014','Bound rate','PER_GUEST',100000000000);
insert into wedding_private.cost_items(id,wedding_id,title,pricing_basis,fixed_estimate_paise,state,commitment_paise) values ('33100000-0000-4000-8000-000000000021','33100000-0000-4000-8000-000000000010','Protected','FIXED',10000,'COMMITTED',10000);
insert into wedding_private.tasks(wedding_id,title,dismissed_at) values ('33100000-0000-4000-8000-000000000010','Retained dismissal',now());
insert into wedding_private.cash_entries(wedding_id,cost_item_id,kind,amount_paise,occurred_on,intent_key) values ('33100000-0000-4000-8000-000000000010','33100000-0000-4000-8000-000000000021','PAYMENT',1000,'2026-10-30','wp33-cash');
create function pg_temp.ver() returns text language sql as $$select state_version::text from wedding_private.weddings where id='33100000-0000-4000-8000-000000000010'$$;
create function pg_temp.call_init(c text default '11',n integer default 250,confirmed boolean default true,v text default null) returns jsonb language plpgsql as $$begin return public.initialize_guest_count('33100000-0000-4000-8000-000000000010',('33100000-0000-4000-8000-'||lpad(c,12,'0'))::uuid,coalesce(v,pg_temp.ver()),n,confirmed);end$$;
select throws_ok($$select pg_temp.call_init()$$,'PT409',null,'DRAFT denied');
update wedding_private.weddings set state='ACTIVE' where id='33100000-0000-4000-8000-000000000010';
select is((select guest_count from wedding_private.ceremonies where id='33100000-0000-4000-8000-000000000011'),null,'nullable activation preserved');
select public.membership_grant('33100000-0000-4000-8000-000000000010','33100000-0000-4000-8000-000000000002');
set local role authenticated;
create temporary table stale as select public.adapt_propose('33100000-0000-4000-8000-000000000010','33100000-0000-4000-8000-000000000012',pg_temp.ver(),101,null) proposal;
reset role;
grant select on stale to authenticated;
create temporary table saved as select pg_temp.ver() v,(select jsonb_agg(to_jsonb(t) order by id) from wedding_private.tasks t) tasks,(select jsonb_agg(to_jsonb(t) order by id) from wedding_private.cost_items t) costs,(select jsonb_agg(to_jsonb(t) order by id) from wedding_private.cash_entries t) cash,(select count(*) from wedding_private.audit_events) audits;
grant select on saved to authenticated;
set local role authenticated;
select throws_ok($$select pg_temp.call_init('11',250,false)$$,'22023',null,'confirmation required');
select throws_ok($$select pg_temp.call_init('11',0)$$,'22023',null,'zero denied');
select throws_ok($$select pg_temp.call_init('11',10001)$$,'22023',null,'upper bound denied');
select throws_ok($$select pg_temp.call_init('11',null)$$,'22023',null,'null denied');
select throws_ok($$select pg_temp.call_init('11',250,true,'0')$$,'PT409',null,'stale version denied');
select throws_ok($$select pg_temp.call_init('12')$$,'PT409',null,'known count denied');
select throws_ok($$select pg_temp.call_init('13')$$,'PT409',null,'archived denied');
select throws_ok($$select pg_temp.call_init('99')$$,'42501',null,'foreign/missing ceremony denied');
select throws_ok($$select pg_temp.call_init('14',2)$$,'22023',null,'derived forecast bound preserved');
select set_config('request.jwt.claims','{"sub":"33100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select pg_temp.call_init('11',250,true,'1')$$,'42501',null,'Member denied');
select set_config('request.jwt.claims','{"sub":"33100000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}',true);
select throws_ok($$select pg_temp.call_init('11',250,true,'1')$$,'42501',null,'anonymous Auth denied');
reset role;
set local role anon;
select throws_ok($$select public.initialize_guest_count('33100000-0000-4000-8000-000000000010','33100000-0000-4000-8000-000000000011','1',250,true)$$,'42501',null,'anon denied');
reset role;
select set_config('request.jwt.claims','{"sub":"33100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
-- Audit failure must roll the count/version back too.
create function pg_temp.fail_audit() returns trigger language plpgsql as $$begin if new.action='GUEST_COUNT_INITIALIZED' then raise exception using errcode='23514',message='test audit failure';end if;return new;end$$;
create trigger wp33_fail before insert on wedding_private.audit_events for each row execute function pg_temp.fail_audit();
set local role authenticated;
select throws_ok($$select pg_temp.call_init()$$,'23514',null,'audit failure aborts transaction');
reset role;
select is(pg_temp.ver(),(select v from saved),'failed operations preserve version');
select is((select guest_count from wedding_private.ceremonies where id='33100000-0000-4000-8000-000000000011'),null,'failed operations preserve unknown');
drop trigger wp33_fail on wedding_private.audit_events;
set local role authenticated;
select lives_ok($$select pg_temp.call_init()$$,'owner explicitly initializes');
select throws_ok($$select pg_temp.call_init()$$,'PT409',null,'repeat denied even with current version');
select throws_ok($$select public.adapt_approve('33100000-0000-4000-8000-000000000010',(select (proposal->>'id')::uuid from stale))$$,'PT409',null,'initialization invalidates prior ADAPT proposal');
select throws_ok($$update wedding_private.ceremonies set guest_count=251 where id='33100000-0000-4000-8000-000000000011'$$,'42501',null,'direct writes denied');
reset role;
select is((select guest_count from wedding_private.ceremonies where id='33100000-0000-4000-8000-000000000011'),250,'stored count exact');
select is(pg_temp.ver()::bigint,(select v::bigint+1 from saved),'version increments exactly once');
select is((select count(*) from wedding_private.audit_events),(select audits+1 from saved),'one audit appended');
select ok((select before_after @> jsonb_build_object('old_guest_count',null,'new_guest_count',250,'base_version',(select v from saved),'applied_version',pg_temp.ver()) and actor_user_id='33100000-0000-4000-8000-000000000001' from wedding_private.audit_events where action='GUEST_COUNT_INITIALIZED' and wedding_id='33100000-0000-4000-8000-000000000010'),'audit actor/count/version exact');
select is((select jsonb_agg(to_jsonb(t) order by id) from wedding_private.tasks t),(select tasks from saved),'all tasks preserved');
select is((select jsonb_agg(to_jsonb(t) order by id) from wedding_private.cost_items t),(select costs from saved),'all financial/commitment records preserved');
select is((select jsonb_agg(to_jsonb(t) order by id) from wedding_private.cash_entries t),(select cash from saved),'all cash preserved');
select ok(not has_function_privilege('anon','public.initialize_guest_count(uuid,uuid,text,integer,boolean)','execute'),'anon grant absent');
select ok(not pg_has_role('authenticated','wedding_guest_initializer','member'),'initializer cannot be assumed');
select ok((select p.prosecdef and r.rolname='wedding_guest_initializer' and not r.rolcanlogin and not r.rolbypassrls and p.proconfig @> array['search_path=""'] from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid='public.initialize_guest_count(uuid,uuid,text,integer,boolean)'::regprocedure),'restricted definer and empty search path');
select ok(not has_table_privilege('wedding_guest_initializer','wedding_private.cost_items','UPDATE') and not has_table_privilege('wedding_guest_initializer','wedding_private.tasks','UPDATE') and not has_table_privilege('wedding_guest_initializer','wedding_private.cash_entries','UPDATE'),'initializer cannot write protected tables');
select * from finish();
rollback;

