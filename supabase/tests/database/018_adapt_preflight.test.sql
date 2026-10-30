-- WP-17 tests first. All fixtures/temporary helpers are rolled back.
begin;
create temporary table wp17_results(label text,passed boolean);
create function pg_temp.wp17_check(label text,passed boolean) returns void language sql security invoker as $$insert into pg_temp.wp17_results values(label,coalesce(passed,false))$$;
select pg_temp.wp17_check('proposal operation exists',to_regprocedure('public.adapt_propose(uuid,uuid,text,integer,integer)') is not null);
select pg_temp.wp17_check('rejection operation exists',to_regprocedure('public.adapt_reject(uuid,uuid)') is not null);
select pg_temp.wp17_check('read-only coherent context exists',to_regprocedure('public.adapt_context(uuid,uuid,integer)') is not null);
select label,passed from wp17_results;
rollback;
