-- Disposable synthetic fixtures only. The entire test rolls back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_catalog;
select no_plan();
select has_function('public','delete_wedding',array['uuid','text','text'],'Owner-confirmed deletion RPC exists');
select to_regprocedure('public.delete_wedding(uuid,text,text)') is not null as feature_exists \gset
\if :feature_exists
insert into auth.users(id,email,email_confirmed_at) values
 ('60100000-0000-4000-8000-000000000001','delete-owner@example.invalid',now()),
 ('60100000-0000-4000-8000-000000000002','delete-member@example.invalid',now()),
 ('60100000-0000-4000-8000-000000000003','delete-other@example.invalid',now());
insert into auth.identities(user_id,provider,provider_id,identity_data) values('60100000-0000-4000-8000-000000000001','google','delete-synthetic-google','{"sub":"delete-synthetic-google"}');
select set_config('request.jwt.claims','{"sub":"60100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into wedding_private.weddings(id,owner_user_id,title,city,budget_ceiling_paise) values('60200000-0000-4000-8000-000000000001',auth.uid(),'Synthetic wedding','Test city',100000);
insert into wedding_private.ceremonies(id,wedding_id,title,guest_count) values('60300000-0000-4000-8000-000000000001','60200000-0000-4000-8000-000000000001','Ceremony',100);
insert into wedding_private.tasks(id,wedding_id,ceremony_id,title,status,completed_at) values('60400000-0000-4000-8000-000000000001','60200000-0000-4000-8000-000000000001','60300000-0000-4000-8000-000000000001','Completed preparation','COMPLETED',now());
insert into wedding_private.tasks(id,wedding_id,ceremony_id,title,prerequisite_task_id) values('60400000-0000-4000-8000-000000000002','60200000-0000-4000-8000-000000000001','60300000-0000-4000-8000-000000000001','Dependent preparation','60400000-0000-4000-8000-000000000001');
insert into wedding_private.cost_items(id,wedding_id,ceremony_id,title,pricing_basis,fixed_estimate_paise) values('60500000-0000-4000-8000-000000000001','60200000-0000-4000-8000-000000000001','60300000-0000-4000-8000-000000000001','Recorded commitment','FIXED',10000);
update wedding_private.cost_items set state='COMMITTED',commitment_paise=10000 where id='60500000-0000-4000-8000-000000000001';
insert into wedding_private.cash_entries(id,wedding_id,cost_item_id,kind,amount_paise,occurred_on,intent_key) values
 ('60600000-0000-4000-8000-000000000001','60200000-0000-4000-8000-000000000001','60500000-0000-4000-8000-000000000001','PAYMENT',1000,'2026-10-30','delete-payment'),
 ('60600000-0000-4000-8000-000000000002','60200000-0000-4000-8000-000000000001','60500000-0000-4000-8000-000000000001','PAYMENT',500,'2026-10-30','delete-void');
update wedding_private.weddings set state='ACTIVE' where id='60200000-0000-4000-8000-000000000001';
select public.finance_cash('60200000-0000-4000-8000-000000000001','60500000-0000-4000-8000-000000000001','60600000-0000-4000-8000-000000000002',(select state_version::text from wedding_private.weddings where id='60200000-0000-4000-8000-000000000001'),'void','{}',true,'Synthetic correction');
insert into wedding_private.ai_request_slots(id,wedding_id,owner_user_id,created_at) select ('60700000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'60200000-0000-4000-8000-000000000001','60100000-0000-4000-8000-000000000001',greatest(date_trunc('day',clock_timestamp(),'UTC'),clock_timestamp()-interval '61 seconds') from generate_series(1,5)i;
insert into wedding_private.ai_acceptances(wedding_id,title_key,request_id,task_id) values('60200000-0000-4000-8000-000000000001','accepted synthetic title','60700000-0000-4000-8000-000000000001','60400000-0000-4000-8000-000000000002');
insert into wedding_private.ai_dismissed_titles(wedding_id,title_key,title) values('60200000-0000-4000-8000-000000000001','dismissed synthetic title','Dismissed synthetic title');
select public.adapt_approve('60200000-0000-4000-8000-000000000001',(public.adapt_propose('60200000-0000-4000-8000-000000000001','60300000-0000-4000-8000-000000000001',(select state_version::text from wedding_private.weddings where id='60200000-0000-4000-8000-000000000001'),120,null)->>'id')::uuid);
create temporary table delete_saved(version text,token text,graph jsonb,other_graph jsonb,globals jsonb,users jsonb,identities jsonb);
insert into delete_saved(version,token) select state_version::text,public.invitation_issue('60200000-0000-4000-8000-000000000001','60100000-0000-4000-8000-000000000003')->>'token' from wedding_private.weddings where id='60200000-0000-4000-8000-000000000001';
select public.membership_grant('60200000-0000-4000-8000-000000000001','60100000-0000-4000-8000-000000000002');
insert into wedding_access.connect_codes(user_id,code_hash,expires_at) values('60100000-0000-4000-8000-000000000001',encode(sha256(convert_to(repeat('a',64),'UTF8')),'hex'),now()+interval '1 hour'),('60100000-0000-4000-8000-000000000002',encode(sha256(convert_to(repeat('b',64),'UTF8')),'hex'),now()+interval '1 hour');
insert into wedding_access.connect_attempts(user_id,operation,window_started,attempts) values('60100000-0000-4000-8000-000000000001','generate',now(),5);
select set_config('request.jwt.claims','{"sub":"60100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into wedding_private.weddings(id,owner_user_id,title,city) values('60200000-0000-4000-8000-000000000002',auth.uid(),'Other wedding','Other city');
insert into wedding_private.tasks(wedding_id,title) values('60200000-0000-4000-8000-000000000002','Other task retained');
create function pg_temp.wedding_graph(wid uuid) returns jsonb language plpgsql as $f$
declare row record; value jsonb; result jsonb:='{}';begin
 for row in select table_schema,table_name from information_schema.columns where column_name='wedding_id' and table_schema in ('wedding_private','wedding_access') union select 'wedding_private','weddings' loop
 execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]''::jsonb) from %I.%I t where %I=$1',row.table_schema,row.table_name,case when row.table_name='weddings' then 'id' else 'wedding_id' end) into value using wid;
 result:=result||jsonb_build_object(row.table_schema||'.'||row.table_name,value);
 end loop;return result;end;$f$;
update delete_saved set version=(select state_version::text from wedding_private.weddings where id='60200000-0000-4000-8000-000000000001'),graph=pg_temp.wedding_graph('60200000-0000-4000-8000-000000000001'),other_graph=pg_temp.wedding_graph('60200000-0000-4000-8000-000000000002'),globals=jsonb_build_object('codes',(select jsonb_agg(to_jsonb(t) order by user_id) from wedding_access.connect_codes t),'attempts',(select jsonb_agg(to_jsonb(t)) from wedding_access.connect_attempts t)),users=(select jsonb_agg(to_jsonb(t) order by id) from auth.users t),identities=(select jsonb_agg(to_jsonb(t) order by id) from auth.identities t);
grant select on delete_saved to authenticated;
set constraints all immediate;
select ok(not pg_has_role('authenticated','wedding_deleter','MEMBER'),'Client cannot assume deletion role');
select ok((select not rolcanlogin and not rolsuper and not rolbypassrls from pg_roles where rolname='wedding_deleter'),'Deletion role is non-login and RLS-bound');
select ok(not has_function_privilege('anon','public.delete_wedding(uuid,text,text)','EXECUTE'),'Anonymous RPC EXECUTE denied');
select ok(not has_table_privilege('wedding_deleter','auth.users','DELETE'),'Deletion role cannot delete Auth users');
select ok(not has_table_privilege('wedding_deleter','wedding_access.connect_codes','DELETE'),'Global Connect Codes have no delete grant');
select ok(not has_table_privilege('wedding_deleter','wedding_private.ai_request_slots','DELETE'),'Account-wide AI quota has no delete grant');
set local role authenticated;
select throws_ok($$select public.delete_wedding('60200000-0000-4000-8000-000000000001','Synthetic wedding',(select version from delete_saved))$$,'42501',null,'Member cannot delete another wedding');
select set_config('request.jwt.claims','{"sub":"60100000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.delete_wedding('60200000-0000-4000-8000-000000000001','Synthetic wedding',(select version from delete_saved))$$,'42501',null,'Unrelated authenticated user denied');
select set_config('request.jwt.claims','{"sub":"60100000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}',true);
select throws_ok($$select public.delete_wedding('60200000-0000-4000-8000-000000000001','Synthetic wedding',(select version from delete_saved))$$,'42501',null,'Anonymous Auth identity denied');
set local role anon;
select throws_ok($$select public.delete_wedding('60200000-0000-4000-8000-000000000001','Synthetic wedding','0')$$,'42501',null,'Anonymous database role denied');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"60100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.delete_wedding('60200000-0000-4000-8000-000000000001','synthetic wedding',(select version from delete_saved))$$,'22023',null,'Confirmation is exact and case-sensitive');
select throws_ok($$select public.delete_wedding('60200000-0000-4000-8000-000000000001',null,(select version from delete_saved))$$,'22023',null,'Missing confirmation denied');
select throws_ok($$select public.delete_wedding('60200000-0000-4000-8000-000000000001','Synthetic wedding','999999999')$$,'PT409',null,'Stale owner context denied');
select throws_ok($$delete from public.weddings where id='60200000-0000-4000-8000-000000000001'$$,'42501',null,'Direct view deletion remains denied');
reset role;
select is(pg_temp.wedding_graph('60200000-0000-4000-8000-000000000001'),(select graph from delete_saved),'All denied attempts preserve complete graph');
create function pg_temp.force_delete_failure() returns trigger language plpgsql as $f$begin raise exception using errcode='P0001',message='Synthetic final-step failure';end;$f$;
create trigger zz_test_delete_failure before delete on wedding_private.weddings for each row when(old.id='60200000-0000-4000-8000-000000000001') execute function pg_temp.force_delete_failure();
set local role authenticated;
select throws_ok($$select public.delete_wedding('60200000-0000-4000-8000-000000000001','Synthetic wedding',(select version from delete_saved))$$,'P0001',null,'Forced final-step failure aborts whole operation');
reset role;
select is(pg_temp.wedding_graph('60200000-0000-4000-8000-000000000001'),(select graph from delete_saved),'Atomic rollback restores cash, audit, tasks, AI links, proposals and family records');
drop trigger zz_test_delete_failure on wedding_private.weddings;
set local role authenticated;
select is(public.delete_wedding('60200000-0000-4000-8000-000000000001','Synthetic wedding',(select version from delete_saved)),true,'Owner deletes the complete wedding graph');
select throws_ok($$select public.delete_wedding('60200000-0000-4000-8000-000000000001','Synthetic wedding',(select version from delete_saved))$$,'42501',null,'Repeated deletion is safely unavailable');
select throws_ok($$select public.invitation_issue_connect('60200000-0000-4000-8000-000000000001',repeat('b',64))$$,'42501',null,'Connect Code cannot issue access for deleted wedding');
select set_config('request.jwt.claims','{"sub":"60100000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.invitation_accept((select token from delete_saved))$$,'42501',null,'Old invitation cannot be accepted');
reset role;
select ok(not exists(select 1 from jsonb_each(pg_temp.wedding_graph('60200000-0000-4000-8000-000000000001'))x where x.value<>'[]'::jsonb),'No selected-wedding dependent row remains');
select is(pg_temp.wedding_graph('60200000-0000-4000-8000-000000000002'),(select other_graph from delete_saved),'Other owner wedding and tasks unchanged');
select is((select jsonb_agg(to_jsonb(t) order by id) from auth.users t),(select users from delete_saved),'All Auth user records unchanged');
select is((select jsonb_agg(to_jsonb(t) order by id) from auth.identities t),(select identities from delete_saved),'Google identity remains intact');
select is((select count(*) from wedding_private.ai_request_slots where owner_user_id='60100000-0000-4000-8000-000000000001' and wedding_id is null),5::bigint,'Five account-wide AI quota records preserved without wedding link');
select is(jsonb_build_object('codes',(select jsonb_agg(to_jsonb(t) order by user_id) from wedding_access.connect_codes t),'attempts',(select jsonb_agg(to_jsonb(t)) from wedding_access.connect_attempts t)),(select globals from delete_saved),'Global Connect Codes and rate counters unchanged');
select set_config('request.jwt.claims','{"sub":"60100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select lives_ok($$select public.create_wedding('Fresh synthetic wedding','Test city')$$,'Same Google-account owner creates a new wedding');
reset role;
insert into wedding_private.ceremonies(wedding_id,title,guest_count) select id,'Fresh ceremony',10 from wedding_private.weddings where owner_user_id='60100000-0000-4000-8000-000000000001';
update wedding_private.weddings set draft_locked=true where owner_user_id='60100000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select public.ai_reserve((select id from public.weddings where title='Fresh synthetic wedding'),array[(select id from public.ceremonies where title='Fresh ceremony')])$$,'PT429',null,'Deleting/recreating cannot reset account-wide AI request allowance');
select is(public.delete_wedding((select id from public.weddings where title='Fresh synthetic wedding'),'Fresh synthetic wedding',(select state_version from public.weddings where title='Fresh synthetic wedding')),true,'Owner can also delete a draft wedding');
reset role;
select ok(not exists(select 1 from wedding_private.weddings where owner_user_id='60100000-0000-4000-8000-000000000001'),'No stale wedding remains for owner');
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('wedding_private','wedding_access') and c.relkind='r'),'Forced RLS remains enabled everywhere');
\endif
select * from finish();
rollback;
