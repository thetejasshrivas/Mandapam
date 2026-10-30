-- WP-ROLES-1. LOCAL ONLY; synthetic fixtures and all changes roll back.
-- Requires all migrations, PostgreSQL15+ and pgTAP. Role simulation is not real Auth/API proof.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_catalog;
select no_plan();
insert into auth.users(id,email) values
 ('91000000-0000-4000-8000-000000000001','roles-admin@example.invalid'),
 ('91000000-0000-4000-8000-000000000002','roles-member@example.invalid'),
 ('91000000-0000-4000-8000-000000000003','roles-other@example.invalid');
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into wedding_private.weddings(id,owner_user_id,title,city,budget_ceiling_paise)
 values('92000000-0000-4000-8000-000000000001',auth.uid(),'Shared synthetic wedding','Test city',100000);
insert into wedding_private.ceremonies(id,wedding_id,title,guest_count)
 values('93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','Reception',100);
insert into wedding_private.tasks(id,wedding_id,ceremony_id,title)
 values('94000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','Shared preparation');
insert into wedding_private.cost_items(id,wedding_id,title,pricing_basis,fixed_estimate_paise)
 values('95000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','Private cost','FIXED',10000);
insert into wedding_private.cash_entries(wedding_id,cost_item_id,kind,amount_paise,occurred_on,intent_key)
 values('92000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','PAYMENT',1000,'2026-10-29','roles-fixture-payment');
update wedding_private.weddings set state='ACTIVE' where id='92000000-0000-4000-8000-000000000001';
insert into wedding_private.change_proposals(wedding_id,ceremony_id,base_wedding_version,old_guest_count,new_guest_count,preview_snapshot)
 select id,'93000000-0000-4000-8000-000000000001',state_version,100,200,'{}'::jsonb
 from wedding_private.weddings where id='92000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
insert into wedding_private.weddings(id,owner_user_id,title,city)
 values('92000000-0000-4000-8000-000000000003',auth.uid(),'Unrelated synthetic wedding','Test city');
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

select ok(c.relrowsecurity and c.relforcerowsecurity,'Membership RLS enabled and forced')
 from pg_class c where c.oid='wedding_access.memberships'::regclass;
select ok(not has_table_privilege('authenticated','wedding_access.memberships','SELECT,INSERT,UPDATE,DELETE'),'No direct membership table access');
select ok(not has_column_privilege('wedding_planning_reader','wedding_private.weddings','budget_ceiling_paise','SELECT'),'Reader cannot select wedding budget');
select ok(not has_table_privilege('wedding_planning_reader','wedding_private.cost_items','SELECT'),'Reader cannot select cost records');
select ok(not has_table_privilege('wedding_planning_reader','wedding_private.change_proposals','SELECT'),'Reader cannot select ADAPT');
select ok(not pg_has_role('authenticated',r.oid,'MEMBER'),'Client cannot assume '||r.rolname)
 from pg_roles r where r.rolname in ('wedding_planning_reader','wedding_membership_writer');
select ok(not has_schema_privilege(r.oid,'auth','USAGE'),'Helper needs no managed Auth schema privilege: '||r.rolname)
 from pg_roles r where r.rolname in ('wedding_planning_reader','wedding_membership_writer');
select ok(has_function_privilege(r.oid,'wedding_private.caller_uid()','EXECUTE'),'Helper can use existing private identity interface: '||r.rolname)
 from pg_roles r where r.rolname in ('wedding_planning_reader','wedding_membership_writer');
select ok(not has_function_privilege('authenticated','wedding_private.caller_uid()','EXECUTE'),'Private identity interface is not exposed to clients');
select ok(not p.prosecdef,'Public entrypoint uses caller security: '||p.proname)
 from pg_proc p where p.oid in ('public.planning_read(uuid)'::regprocedure,'public.membership_grant(uuid,uuid)'::regprocedure,'public.membership_revoke(uuid,uuid)'::regprocedure);
select ok(not has_function_privilege('anon',p.oid,'EXECUTE'),'Anonymous cannot invoke '||p.proname)
 from pg_proc p where p.oid in ('public.planning_read(uuid)'::regprocedure,'public.membership_grant(uuid,uuid)'::regprocedure,'public.membership_revoke(uuid,uuid)'::regprocedure);

set local role authenticated;
select is((select count(*) from public.weddings where id='92000000-0000-4000-8000-000000000001'),1::bigint,'Admin original wedding access retained');
select ok(public.finance_read('92000000-0000-4000-8000-000000000001') is not null,'Admin finance read retained');
select lives_ok($$select public.update_task('92000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001',(select state_version from public.weddings where id='92000000-0000-4000-8000-000000000001'),'status','{"status":"IN_PROGRESS"}',false,false)$$,'Admin existing task mutation remains available');
select is((select count(*) from public.cost_items where wedding_id='92000000-0000-4000-8000-000000000001'),1::bigint,'Positive owner baseline: cost exists');
select is((select count(*) from public.cash_entries where wedding_id='92000000-0000-4000-8000-000000000001'),1::bigint,'Positive owner baseline: cash exists');
select is((select count(*) from public.change_proposals where wedding_id='92000000-0000-4000-8000-000000000001'),1::bigint,'Positive owner baseline: ADAPT exists');
select ok((select count(*) from public.audit_events where wedding_id='92000000-0000-4000-8000-000000000001')>0,'Positive owner baseline: audit exists');
select lives_ok($$select public.membership_grant('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002')$$,'Admin grants existing member');
select lives_ok($$select public.membership_grant('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002')$$,'Repeat active grant is idempotent');
select throws_ok($$select public.membership_grant('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001')$$,'22023',null,'Owner cannot become a member or change Admin role');
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(public.planning_read('92000000-0000-4000-8000-000000000001')->'wedding'->>'title','Shared synthetic wedding','Member reads shared wedding');
select is(jsonb_array_length(public.planning_read('92000000-0000-4000-8000-000000000001')->'ceremonies'),1,'Member reads ceremony');
select is(jsonb_array_length(public.planning_read('92000000-0000-4000-8000-000000000001')->'tasks'),1,'Member reads task');
select set_config('request.jwt.claim','{"is_anonymous":true}',true);
select is(public.planning_read('92000000-0000-4000-8000-000000000001'),null::jsonb,'Legacy trusted anonymous claim retains precedence');
select set_config('request.jwt.claim','',true);
select ok(not ((public.planning_read('92000000-0000-4000-8000-000000000001')->'wedding') ? 'budget_ceiling_paise'),'Member payload omits budget');
select is((select count(*) from public.weddings where id='92000000-0000-4000-8000-000000000001'),0::bigint,'Member cannot read original finance-bearing wedding view');
select is((select count(*) from public.cost_items where wedding_id='92000000-0000-4000-8000-000000000001'),0::bigint,'Member cannot read costs');
select is((select count(*) from public.cash_entries where wedding_id='92000000-0000-4000-8000-000000000001'),0::bigint,'Member cannot read cash');
select is((select count(*) from public.change_proposals where wedding_id='92000000-0000-4000-8000-000000000001'),0::bigint,'Member cannot read ADAPT');
select is((select count(*) from public.audit_events where wedding_id='92000000-0000-4000-8000-000000000001'),0::bigint,'Member cannot read audit/financial history');
select is(public.finance_read('92000000-0000-4000-8000-000000000001'),null::jsonb,'Member finance RPC denied');
select throws_ok($$update public.tasks set title='Forged' where id='94000000-0000-4000-8000-000000000001'$$,'42501',null,'Member direct task mutation denied');
select throws_ok($$update public.ceremonies set guest_count=999 where id='93000000-0000-4000-8000-000000000001'$$,'42501',null,'Member guest count mutation denied');
select throws_ok($$update public.weddings set title='Forged' where id='92000000-0000-4000-8000-000000000001'$$,'42501',null,'Member wedding configuration mutation denied');
select throws_ok($$update public.weddings set owner_user_id=auth.uid() where id='92000000-0000-4000-8000-000000000001'$$,'42501',null,'Member cannot transfer ownership or promote itself');
select throws_ok($$select public.update_task('92000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','0','status','{"status":"IN_PROGRESS"}',false,false)$$,'42501',null,'Member task RPC denied before version/state checks');
select is(public.adapt_context('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',null),null::jsonb,'Member ADAPT read RPC returns no context');
select throws_ok($$select public.finance_cost('92000000-0000-4000-8000-000000000001',null,'0','budget','{"amount_paise":"1"}',false,null)$$,'42501',null,'Member finance mutation denied');
select throws_ok($$select public.adapt_propose('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','0',200,null)$$,'42501',null,'Member ADAPT proposal mutation denied');
select throws_ok($$select public.membership_grant('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000003')$$,'42501',null,'Member cannot grant another account');
select throws_ok($$select public.membership_revoke('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002')$$,'42501',null,'Member cannot revoke itself');
select throws_ok($$insert into wedding_access.memberships(wedding_id,user_id,invited_by) values('92000000-0000-4000-8000-000000000001',auth.uid(),auth.uid())$$,'42501',null,'Direct self-created membership denied');
select throws_ok($$update wedding_access.memberships set revoked_at=null where wedding_id='92000000-0000-4000-8000-000000000001'$$,'42501',null,'Member cannot rewrite memberships');
select is(public.planning_read('92000000-0000-4000-8000-000000000003'),null::jsonb,'Membership in one wedding grants no access to another');
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":true}',true);
select is(public.planning_read('92000000-0000-4000-8000-000000000001'),null::jsonb,'Anonymous Auth user cannot use even a seeded membership');
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000003","role":"authenticated","user_metadata":{"role":"Admin","owner_user_id":"91000000-0000-4000-8000-000000000001"}}',true);
select is(public.planning_read('92000000-0000-4000-8000-000000000001'),null::jsonb,'Unrelated user cannot read planning');
select throws_ok($$select public.membership_grant('92000000-0000-4000-8000-000000000001',auth.uid())$$,'42501',null,'Unrelated user cannot self join');
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.membership_revoke('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002')$$,'Admin revokes member');
select throws_ok($$select public.membership_grant('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002')$$,'55000',null,'Revoked grant cannot silently reactivate');
select is((select owner_user_id from public.weddings where id='92000000-0000-4000-8000-000000000001'),'91000000-0000-4000-8000-000000000001'::uuid,'Owner UUID unchanged');
select is((select title from public.tasks where id='94000000-0000-4000-8000-000000000001'),'Shared preparation','Denied writes preserve saved task');
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(public.planning_read('92000000-0000-4000-8000-000000000001'),null::jsonb,'Revoked member loses read access immediately');
reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select public.planning_read('92000000-0000-4000-8000-000000000001')$$,'42501',null,'Anonymous planning denied');
reset role;
select * from finish();
rollback;
