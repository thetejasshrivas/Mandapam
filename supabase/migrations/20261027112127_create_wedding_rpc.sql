-- WP-11 REVIEW CANDIDATE. One owner-checked creation operation, no generic DML.
begin;
create function public.create_wedding(p_title text,p_city text) returns uuid
language plpgsql security definer set search_path='' as $body$
declare caller uuid:=wedding_private.caller_uid(); new_id uuid;
begin
 if caller is null then raise exception using errcode='42501',message='Authentication required'; end if;
 if p_title is null or p_city is null or char_length(btrim(p_title)) not between 1 and 100 or char_length(btrim(p_city)) not between 1 and 100 then
  raise exception using errcode='22023',message='Wedding title and city require one to one hundred characters';
 end if;
 -- UNIQUE(owner_user_id) serializes competing first creates. A second create fails,
 -- rather than replacing the existing wedding or accepting any supplied owner ID.
 insert into wedding_private.weddings(owner_user_id,title,city)
 values(caller,btrim(p_title),btrim(p_city)) returning id into new_id;
 insert into wedding_private.audit_events(wedding_id,actor_user_id,entity_type,entity_id,action,before_after)
 values(new_id,caller,'wedding',new_id,'WEDDING_CREATED',jsonb_build_object('state','DRAFT'));
 return new_id;
end;
$body$;
grant create on schema public to wedding_mutator;
alter function public.create_wedding(text,text) owner to wedding_mutator;
revoke create on schema public from wedding_mutator;
revoke all on function public.create_wedding(text,text) from public,anon,authenticated;
grant execute on function public.create_wedding(text,text) to authenticated;
commit;
