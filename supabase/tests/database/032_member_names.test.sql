begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_catalog;
select no_plan();
select has_function('public','member_workspaces',array[]::text[],'Shared workspace return path exists');
select has_function('public','task_assign',array['uuid','uuid','text','uuid'],'Trusted Admin assignment exists');
select has_function('public','task_contribute',array['uuid','uuid','text','text','text','boolean'],'Narrow contribution exists');
insert into auth.users(id,email,email_confirmed_at) values
('71000000-0000-4000-8000-000000000001','admin@example.invalid',now()),('71000000-0000-4000-8000-000000000002','member-b@example.invalid',now()),('71000000-0000-4000-8000-000000000003','member-c@example.invalid',now()),('71000000-0000-4000-8000-000000000004','foreign@example.invalid',now());
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into wedding_private.weddings(id,owner_user_id,title,city,wedding_date,is_tentative) values('71200000-0000-4000-8000-000000000001',wedding_private.caller_uid(),'Shared synthetic wedding','Test city','2026-11-20',false);
insert into wedding_private.ceremonies(id,wedding_id,title,guest_count) values('71300000-0000-4000-8000-000000000001','71200000-0000-4000-8000-000000000001','Synthetic ceremony',100);
insert into wedding_private.tasks(id,wedding_id,title,owner_name) values
('71100000-0000-4000-8000-000000000001','71200000-0000-4000-8000-000000000001','Work for B',null),
('71100000-0000-4000-8000-000000000002','71200000-0000-4000-8000-000000000001','Work for C',null),
('71100000-0000-4000-8000-000000000003','71200000-0000-4000-8000-000000000001','Legacy offline name','Member B'),
('71100000-0000-4000-8000-000000000004','71200000-0000-4000-8000-000000000001','Unfinished prerequisite',null),
('71100000-0000-4000-8000-000000000005','71200000-0000-4000-8000-000000000001','Blocked assigned work',null);
update wedding_private.tasks set prerequisite_task_id='71100000-0000-4000-8000-000000000004' where id='71100000-0000-4000-8000-000000000005';
insert into wedding_private.cost_items(id,wedding_id,title,pricing_basis,fixed_estimate_paise) values('71400000-0000-4000-8000-000000000001','71200000-0000-4000-8000-000000000001','Private financial record','FIXED',10000);
update wedding_private.cost_items set state='COMMITTED',commitment_paise=10000 where id='71400000-0000-4000-8000-000000000001';
insert into wedding_private.cash_entries(wedding_id,cost_item_id,kind,amount_paise,occurred_on,intent_key) values('71200000-0000-4000-8000-000000000001','71400000-0000-4000-8000-000000000001','PAYMENT',500,'2026-10-31','collaboration-test');
select public.membership_grant('71200000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002');
select public.membership_grant('71200000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000003');

update auth.users set raw_user_meta_data='{"full_name":"Asha Sharma","name":"Fallback","email":"private@example.invalid"}' where id='71000000-0000-4000-8000-000000000002';
update auth.users set raw_user_meta_data='{"name":"Ravi Patel"}' where id='71000000-0000-4000-8000-000000000003';
set local role authenticated;
select is(public.task_members('71200000-0000-4000-8000-000000000001')->0->>'display_name','Asha Sharma','Admin sees accepted Member full_name');
select is(public.task_members('71200000-0000-4000-8000-000000000001')->1->>'display_name','Ravi Patel','name fallback supported');
select ok(not(public.task_members('71200000-0000-4000-8000-000000000001')->0 ?| array['email','raw_user_meta_data','app_metadata']),'Only name and existing account reference returned');
select is(jsonb_array_length(public.task_members('71200000-0000-4000-8000-000000000001')),2,'Unrelated Auth users excluded');
reset role;
update auth.users set raw_user_meta_data='{"full_name":"Updated saved name"}' where id='71000000-0000-4000-8000-000000000002';
set local role authenticated;
select is(public.task_members('71200000-0000-4000-8000-000000000001')->0->>'display_name','Updated saved name','Next roster read reflects saved metadata');
select public.membership_revoke('71200000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000003');
select is(jsonb_array_length(public.task_members('71200000-0000-4000-8000-000000000001')),1,'Revoked Member excluded');
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.task_members('71200000-0000-4000-8000-000000000001')$$,'42501',null,'Member cannot read names');
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select throws_ok($$select public.task_members('71200000-0000-4000-8000-000000000001')$$,'42501',null,'Unrelated user cannot read profiles');
select throws_ok($$select wedding_access.member_name_roster('71200000-0000-4000-8000-000000000001')$$,'42501',null,'Authenticated cannot directly invoke private helper');
select throws_ok($$select raw_user_meta_data from auth.users$$,'42501',null,'No direct Auth access');
reset role;
set local role anon;
select throws_ok($$select public.task_members('71200000-0000-4000-8000-000000000001')$$,'42501',null,'Anonymous denied');
reset role;
select ok(not has_function_privilege('wedding_contributor','wedding_access.member_name_roster(uuid)','execute'),'Contributor role has no profile helper grant');
select ok(not has_column_privilege('wedding_mutator','auth.users','raw_user_meta_data','select'),'Mutator gets no direct Auth column access');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid='wedding_access.member_name_roster(uuid)'::regprocedure),'Helper is fixed-path definer');
select * from finish(); rollback;
