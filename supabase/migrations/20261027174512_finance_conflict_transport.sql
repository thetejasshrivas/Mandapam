-- WP-15 forward repair: business version conflict is not a serialization retry.
begin;
create or replace function wedding_private.finance_version(p_id uuid,p_version text) returns void language plpgsql set search_path='' as $b$
begin
 if p_version is null or p_version!~'^(0|[1-9][0-9]*)$' or length(p_version)>19 then raise exception using errcode='22023',message='Invalid version';end if;
 if p_version::numeric>9223372036854775807 then raise exception using errcode='22023',message='Invalid version';end if;
 if (select state_version from wedding_private.weddings where id=p_id)<>p_version::bigint then raise exception using errcode='PT409',message='Plan changed; reload';end if;
end;$b$;
commit;
