-- WP-10 TEST-FIRST contract. NOT RUN until an isolated Supabase instance is approved.
-- Run as migration/test administrator ONLY for fixture setup, then switch to real DB roles.
-- SQL role/JWT simulation does not replace the separate real Auth/API session suite.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

-- These fixtures are synthetic, transaction-scoped, and rolled back, including Auth rows.
insert into auth.users(id, email) values
 ('10000000-0000-4000-8000-000000000001','wp10-a@example.invalid'),
 ('10000000-0000-4000-8000-000000000002','wp10-b@example.invalid');
do $fixtures$
declare n integer; u uuid; w uuid; c uuid; t uuid; k uuid; e uuid;
begin
 for n in 1..2 loop
  u := ('10000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
  w := ('20000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
  c := ('30000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
  t := ('40000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
  k := ('50000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
  e := ('60000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  insert into wedding_private.weddings(id,owner_user_id,title,city)
   values(w,u,'Synthetic security fixture','Test city');
  insert into wedding_private.ceremonies(id,wedding_id,title,guest_count) values(c,w,'Reception',300);
  insert into wedding_private.tasks(id,wedding_id,ceremony_id,title) values(t,w,c,'Synthetic task');
  insert into wedding_private.cost_items(id,wedding_id,ceremony_id,title,pricing_basis,fixed_estimate_paise)
   values(k,w,c,'Synthetic cost','FIXED',10000);
  insert into wedding_private.cash_entries(id,wedding_id,cost_item_id,kind,amount_paise,occurred_on,intent_key)
   values(e,w,k,'PAYMENT',5000,'2026-10-27','fixture-'||n);
  insert into wedding_private.audit_events(wedding_id,actor_user_id,entity_type,entity_id,action,before_after)
   values(w,u,'cash_entry',e,'TEST_FIXTURE','{}');
  update wedding_private.weddings set state='ACTIVE' where id=w;
  insert into wedding_private.change_proposals(wedding_id,ceremony_id,base_wedding_version,old_guest_count,new_guest_count,preview_snapshot)
   select w,c,state_version,300,350,'{}'::jsonb from wedding_private.weddings where id=w;
 end loop;
end;
$fixtures$;

-- Catalog privilege checks are separate from record isolation.
select ok(c.relrowsecurity and c.relforcerowsecurity, 'RLS enabled/forced: '||c.relname)
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='wedding_private' and c.relkind='r';
select ok(not has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER'),
 'ordinary DML absent: '||c.relname)
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='wedding_private' and c.relkind='r';
select ok(not has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE'), 'anon absent: '||c.relname)
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='wedding_private' and c.relkind='r';
select ok('security_invoker=true'=any(c.reloptions), 'caller-security view: '||c.relname)
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('weddings','ceremonies','tasks','cost_items','cash_entries','change_proposals','audit_events');
select ok(not pg_has_role('authenticated',r.oid,'MEMBER'), 'client cannot assume '||r.rolname)
from pg_roles r where r.rolname in ('wedding_mutator','wedding_version_writer','wedding_guest_initializer','wedding_guest_approver');
select ok(not r.rolcanlogin and not r.rolbypassrls and not r.rolsuper, 'restricted role: '||r.rolname)
from pg_roles r where r.rolname like 'wedding_%';
select ok(not has_function_privilege('authenticated',p.oid,'EXECUTE'), 'internal helper not callable: '||p.proname)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='wedding_private';
select ok(not has_column_privilege('authenticated',c.oid,a.attnum,'INSERT,UPDATE'),
 'ordinary column writes absent: '||c.relname||'.'||a.attname)
from pg_class c join pg_namespace n on n.oid=c.relnamespace
join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
where n.nspname='wedding_private' and c.relkind='r';
select ok(not has_schema_privilege('authenticated','wedding_private','CREATE'), 'client cannot create private helper');
select ok(not has_column_privilege('wedding_mutator','wedding_private.weddings','state_version','UPDATE'), 'generic mutator cannot forge version');
select ok(not has_column_privilege('wedding_mutator','wedding_private.change_proposals','applied_version','UPDATE'), 'generic mutator cannot approve');
select ok(not has_table_privilege('wedding_mutator','wedding_private.audit_events','UPDATE,DELETE'), 'generic mutator cannot rewrite audit');
select ok(not exists(select 1 from pg_constraint where connamespace='wedding_private'::regnamespace and contype='f' and confdeltype='c'), 'no destructive foreign-key cascade');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*) from public.weddings),1::bigint,'A sees only its wedding');
select is((select count(*) from public.tasks),1::bigint,'A sees only its task');
select is((select count(*) from public.cost_items),1::bigint,'A sees only its cost');
select is((select count(*) from public.cash_entries),1::bigint,'A sees only its cash');
select is((select count(*) from public.change_proposals),1::bigint,'A sees only its proposal');
select is((select count(*) from public.audit_events),1::bigint,'A sees only its audit');
select is((select count(*) from public.ceremonies),1::bigint,'A sees only its ceremony');
select is((select pg_typeof(state_version)::text from public.weddings limit 1),'text','version transported as text');
select is((select pg_typeof(amount_paise)::text from public.cash_entries limit 1),'text','cash transported as text');
select is((select fixed_estimate_paise from public.cost_items limit 1),'10000','money exact decimal text');
select is((select commitment_paise from public.cost_items limit 1),null::text,'unknown commitment remains NULL');
select throws_ok($$update public.ceremonies set guest_count=999$$,'42501',null,'T16 owner direct active count update denied');
select throws_ok($$update public.weddings set state='DRAFT'$$,'42501',null,'owner cannot downgrade to bypass active guard');
select throws_ok($$update public.weddings set state_version='999'$$,'0A000',null,'owner cannot forge computed public version');
select throws_ok($$update wedding_private.weddings set state_version=999$$,'42501',null,'owner cannot forge underlying database version');
select ok((select state_version::bigint<999 from public.weddings),'denied version updates preserved database value');
select throws_ok($$update public.change_proposals set status='APPLIED'$$,'42501',null,'T17 proposal manual approval denied');
select throws_ok($$delete from public.cash_entries$$,'42501',null,'T17 cash deletion denied');
select throws_ok($$delete from public.audit_events$$,'42501',null,'T17 audit deletion denied');
select throws_ok($$delete from public.tasks$$,'42501',null,'T25 task hard-delete denied');
select throws_ok($$insert into public.weddings(title,city,owner_user_id) values('Forged','Test','10000000-0000-4000-8000-000000000002')$$,'42501',null,'forged owner insert denied');

select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*) from public.tasks where wedding_id='20000000-0000-4000-8000-000000000001'),0::bigint,'T14 B cannot read A task');
select is((select count(*) from public.cost_items where wedding_id='20000000-0000-4000-8000-000000000001'),0::bigint,'T14 B cannot read A cost');
select is((select count(*) from public.change_proposals where wedding_id='20000000-0000-4000-8000-000000000001'),0::bigint,'non-owner proposal hidden');
select throws_ok($$update public.tasks set title='Forged' where wedding_id='20000000-0000-4000-8000-000000000001'$$,'42501',null,'T14 B task update denied');
select throws_ok($$delete from public.cost_items where wedding_id='20000000-0000-4000-8000-000000000001'$$,'42501',null,'T14 B financial delete denied');
select throws_ok($$update public.change_proposals set status='REJECTED' where wedding_id='20000000-0000-4000-8000-000000000001'$$,'42501',null,'non-owner proposal reject denied');
reset role;

-- Trusted fixture statements exercise constraints independently of client DML denial.
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$insert into wedding_private.tasks(wedding_id,ceremony_id,title) values('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','Foreign ceremony')$$,'23503',null,'T15 task cross-wedding ceremony FK');
select throws_ok($$insert into wedding_private.tasks(wedding_id,prerequisite_task_id,title) values('20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','Foreign prerequisite')$$,'23514','Prerequisite must belong to this wedding','T15 cross-wedding prerequisite rejected by approved guard');
select throws_ok($$insert into wedding_private.cost_items(wedding_id,ceremony_id,title,pricing_basis) values('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','Foreign cost','FIXED')$$,'23503',null,'T15 cost cross-wedding ceremony FK');
select throws_ok($$insert into wedding_private.cash_entries(wedding_id,cost_item_id,kind,amount_paise,occurred_on,intent_key) values('20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','PAYMENT',1,'2026-10-27','bad-parent')$$,'23503',null,'T26 cash cross-wedding item rejected');
select throws_ok($$update wedding_private.cash_entries set amount_paise=1 where id='60000000-0000-4000-8000-000000000001'$$,'23514',null,'posted payload immutable even through internal DML');
select throws_ok($$insert into wedding_private.cash_entries(wedding_id,cost_item_id,kind,amount_paise,occurred_on,intent_key) values('20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','REFUND_RECEIVED',5001,'2026-10-27','too-much')$$,'23514',null,'T26 excessive refund denied');
select lives_ok($$insert into wedding_private.cash_entries(wedding_id,cost_item_id,kind,amount_paise,occurred_on,intent_key) values('20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','REFUND_RECEIVED',1000,'2026-10-27','valid-refund')$$,'valid effective refund recorded');
select throws_ok($$update wedding_private.cash_entries set status='VOIDED',voided_at=now(),void_reason='Incorrect payment' where id='60000000-0000-4000-8000-000000000001'$$,'23514',null,'DEC-003 void cannot make net cash negative');
select throws_ok($$delete from wedding_private.cost_items where id='50000000-0000-4000-8000-000000000001'$$,'23514',null,'paid cost never hard deleted');
select throws_ok($$update wedding_private.ceremonies set guest_count=400 where id='30000000-0000-4000-8000-000000000001'$$,'23514',null,'generic trusted mutation cannot bypass active count guard');

-- Relevant edit bumps; pure reads do not. Proposal creation itself did not bump.
create temporary table version_before as select state_version from wedding_private.weddings where id='20000000-0000-4000-8000-000000000001';
update wedding_private.tasks set title='Changed synthetic title' where id='40000000-0000-4000-8000-000000000001';
select ok((select state_version from wedding_private.weddings where id='20000000-0000-4000-8000-000000000001') > (select state_version from version_before),'T23 relevant task edit bumps version');
update version_before set state_version=(select state_version from wedding_private.weddings where id='20000000-0000-4000-8000-000000000001');
select count(*) from public.tasks;
select is((select state_version from wedding_private.weddings where id='20000000-0000-4000-8000-000000000001'),(select state_version from version_before),'reads do not bump version');
set local role anon;
select throws_ok($$select * from public.weddings$$,'42501',null,'anonymous wedding read denied');
reset role;
select * from finish();
rollback;
