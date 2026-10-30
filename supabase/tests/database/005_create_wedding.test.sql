-- WP-11 actual database contract: transaction-scoped synthetic SQL identities.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_catalog;
select no_plan();
insert into auth.users(id,email) values
 ('11000000-0000-4000-8000-000000000001','wp11-sql-a@example.invalid'),
 ('11000000-0000-4000-8000-000000000002','wp11-sql-b@example.invalid');
create temporary table wp11_ids(label text primary key,id uuid);
grant select,insert on wp11_ids to authenticated;
select ok(to_regprocedure('public.create_wedding(text,text)') is not null,'narrow wedding creation RPC exists');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into wp11_ids values('a',public.create_wedding('A synthetic wedding','Test city'));
select is((select count(*) from public.weddings),1::bigint,'A has exactly one own wedding');
select throws_ok($$select public.create_wedding('Duplicate wedding','Test city')$$,'23505',null,'second wedding rejected by owner uniqueness');
select is((select count(*) from public.weddings),1::bigint,'failed second creation changes no row count');
select is((select count(*) from public.audit_events),1::bigint,'first creation and audit are atomic, failed retry adds no audit');
select set_config('request.jwt.claims','{"sub":"11000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into wp11_ids values('b',public.create_wedding('B synthetic wedding','Test city'));
select is((select count(*) from public.weddings),1::bigint,'B has one own wedding');
select is((select count(*) from public.weddings where id=(select id from wp11_ids where label='a')),0::bigint,'B cannot read A by direct ID');
select throws_ok($$update wedding_private.weddings set title='Forged' where id=(select id from wp11_ids where label='a')$$,'42501',null,'B cannot update A');
select throws_ok($$delete from wedding_private.weddings where id=(select id from wp11_ids where label='a')$$,'42501',null,'B cannot delete A');
reset role;
select ok(not has_function_privilege('anon','public.create_wedding(text,text)','EXECUTE'),'anonymous cannot create');
select is((select pg_get_userbyid(proowner) from pg_proc where oid='public.create_wedding(text,text)'::regprocedure),'wedding_mutator','RPC owns only narrow mutator authority');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid='public.create_wedding(text,text)'::regprocedure),'RPC hardened definer search path');
select * from finish();
rollback;
