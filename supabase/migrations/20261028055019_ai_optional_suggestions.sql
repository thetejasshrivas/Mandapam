-- WP19 review: persistent per-user request limits and explicit optional draft decisions.
begin;
create table wedding_private.ai_request_slots(
 id uuid primary key default gen_random_uuid(),wedding_id uuid not null references wedding_private.weddings(id) on delete restrict,
 owner_user_id uuid not null references auth.users(id) on delete restrict,created_at timestamptz not null default clock_timestamp(),unique(wedding_id,id)
);
create index ai_request_user_time on wedding_private.ai_request_slots(owner_user_id,created_at);
create table wedding_private.ai_dismissed_titles(
 wedding_id uuid not null references wedding_private.weddings(id) on delete restrict,title_key text not null check(char_length(title_key) between 1 and 360),title text not null check(char_length(title) between 5 and 120),created_at timestamptz not null default clock_timestamp(),primary key(wedding_id,title_key)
);
create table wedding_private.ai_acceptances(
 wedding_id uuid not null,title_key text not null check(char_length(title_key) between 1 and 360),request_id uuid not null,task_id uuid not null,created_at timestamptz not null default clock_timestamp(),primary key(wedding_id,title_key),
 foreign key(wedding_id,request_id) references wedding_private.ai_request_slots(wedding_id,id) on delete restrict,
 foreign key(wedding_id,task_id) references wedding_private.tasks(wedding_id,id) on delete restrict
);
do $b$ declare tab text;begin
 foreach tab in array array['ai_request_slots','ai_dismissed_titles','ai_acceptances'] loop
 execute format('alter table wedding_private.%I enable row level security',tab);
 execute format('alter table wedding_private.%I force row level security',tab);
 execute format('create policy ai_owner_read on wedding_private.%I for select to wedding_mutator using(exists(select 1 from wedding_private.weddings w where w.id=wedding_id and w.owner_user_id=wedding_private.caller_uid()))',tab);
 execute format('create policy ai_owner_insert on wedding_private.%I for insert to wedding_mutator with check(exists(select 1 from wedding_private.weddings w where w.id=wedding_id and w.owner_user_id=wedding_private.caller_uid()))',tab);
 execute format('revoke all on wedding_private.%I from public,anon,authenticated',tab);
 execute format('grant select,insert on wedding_private.%I to wedding_mutator',tab);
 end loop;
end;$b$;
create function wedding_private.ai_title_key(p_title text) returns text language sql immutable security invoker set search_path='' as $b$
 select btrim(regexp_replace(lower(normalize(btrim(substring(p_title from strpos(p_title,':')+1)),NFKC)),'[^[:alnum:]]+',' ','g'))
$b$;
create function public.ai_reserve(p_id uuid,p_ceremonies uuid[]) returns jsonb language plpgsql security definer set search_path='' as $b$
 declare w wedding_private.weddings;context jsonb;request_id uuid;now_at timestamptz:=clock_timestamp();
 begin
 w:=wedding_private.owned_wedding_lock(p_id);
 if w.state<>'DRAFT' or not w.draft_locked then raise exception using errcode='55000',message='Reviewable draft required';end if;
 if p_ceremonies is null or cardinality(p_ceremonies) not between 1 and 3 or (select count(distinct id) from unnest(p_ceremonies) as ids(id))<>cardinality(p_ceremonies) or exists(select 1 from unnest(p_ceremonies) as ids(id) where not exists(select 1 from wedding_private.ceremonies c where c.wedding_id=p_id and c.id=ids.id and not c.is_archived)) then raise exception using errcode='42501',message='Selected ceremony not found';end if;
 -- Shared database rows and parent lock prevent per-instance/parallel rate bypass.
 if exists(select 1 from wedding_private.ai_request_slots where owner_user_id=wedding_private.caller_uid() and created_at>now_at-interval '60 seconds') or (select count(*) from wedding_private.ai_request_slots where owner_user_id=wedding_private.caller_uid() and created_at>=date_trunc('day',now_at,'UTC'))>=5 then raise exception using errcode='PT429',message='Suggestion request allowance reached';end if;
 context:=jsonb_build_object('base_version',w.state_version::text,'ceremonies',(select jsonb_agg(jsonb_build_object('id',c.id,'title',c.title) order by c.id) from wedding_private.ceremonies c where c.wedding_id=p_id and c.id=any(p_ceremonies)),
 'tasks',coalesce((select jsonb_agg(jsonb_build_object('title',t.title,'status',t.status,'dismissed_at',t.dismissed_at) order by t.created_at,t.id) from wedding_private.tasks t where t.wedding_id=p_id),'[]'::jsonb)||coalesce((select jsonb_agg(jsonb_build_object('title',d.title,'status','DISMISSED','dismissed_at',d.created_at) order by d.created_at,d.title_key) from wedding_private.ai_dismissed_titles d where d.wedding_id=p_id),'[]'::jsonb));
 if octet_length(context::text)>65536 then raise exception using errcode='54000',message='Suggestion context too large';end if;
 insert into wedding_private.ai_request_slots(wedding_id,owner_user_id) values(p_id,wedding_private.caller_uid()) returning id into request_id;
 return context||jsonb_build_object('request_id',request_id);
 end;
$b$;
create function public.ai_task_decision(p_id uuid,p_request uuid,p_operation text,p_title text,p_ceremony uuid default null) returns jsonb language plpgsql security definer set search_path='' as $b$
 declare w wedding_private.weddings;key text;tid uuid;stored_ceremony uuid;version text;
 begin
 w:=wedding_private.owned_wedding_lock(p_id);
 if w.state<>'DRAFT' or not w.draft_locked then raise exception using errcode='55000',message='Reviewable draft required';end if;
 if p_operation not in('accept','dismiss') or p_operation is null or p_title is null or char_length(btrim(p_title)) not between 5 and 120 then raise exception using errcode='22023',message='Invalid optional suggestion';end if;
 if not exists(select 1 from wedding_private.ai_request_slots where wedding_id=p_id and id=p_request and owner_user_id=wedding_private.caller_uid() and created_at>clock_timestamp()-interval '15 minutes') then raise exception using errcode='42501',message='Suggestion request not found or expired';end if;
 if p_ceremony is not null and (p_operation='dismiss' or not exists(select 1 from wedding_private.ceremonies where wedding_id=p_id and id=p_ceremony and not is_archived)) then raise exception using errcode='23503',message='Ceremony must belong to this draft';end if;
 key:=wedding_private.ai_title_key(p_title);if char_length(key) not between 1 and 360 then raise exception using errcode='22023',message='Invalid normalized title';end if;
 select a.task_id,t.ceremony_id into tid,stored_ceremony from wedding_private.ai_acceptances a join wedding_private.tasks t on t.wedding_id=a.wedding_id and t.id=a.task_id where a.wedding_id=p_id and a.title_key=key;
 if tid is not null then
 if p_operation='accept' and stored_ceremony is distinct from p_ceremony then raise exception using errcode='PT409',message='Accepted task already has a ceremony';end if;
 return jsonb_build_object('status','ACCEPTED','task_id',tid,'version',w.state_version::text);
 end if;
 if exists(select 1 from wedding_private.ai_dismissed_titles where wedding_id=p_id and title_key=key) then return jsonb_build_object('status','DISMISSED','version',w.state_version::text);end if;
 if exists(select 1 from wedding_private.tasks where wedding_id=p_id and wedding_private.ai_title_key(title)=key) then return jsonb_build_object('status','EXCLUDED','version',w.state_version::text);end if;
 if p_operation='dismiss' then
 insert into wedding_private.ai_dismissed_titles(wedding_id,title_key,title) values(p_id,key,btrim(p_title));
 return jsonb_build_object('status','DISMISSED','version',w.state_version::text);
 end if;
 insert into wedding_private.tasks(wedding_id,ceremony_id,title,status) values(p_id,p_ceremony,btrim(p_title),'TO_DO') returning id into tid;
 insert into wedding_private.ai_acceptances(wedding_id,title_key,request_id,task_id) values(p_id,key,p_request,tid);
 insert into wedding_private.audit_events(wedding_id,actor_user_id,entity_type,entity_id,action,before_after) values(p_id,wedding_private.caller_uid(),'task',tid,'OPTIONAL_SUGGESTION_ACCEPTED',jsonb_build_object('request_id',p_request,'safe_defaults',true));
 select state_version::text into version from wedding_private.weddings where id=p_id;
 return jsonb_build_object('status','ACCEPTED','task_id',tid,'version',version);
 end;
$b$;
grant create on schema public,wedding_private to wedding_mutator;
alter function wedding_private.ai_title_key(text) owner to wedding_mutator;
alter function public.ai_reserve(uuid,uuid[]) owner to wedding_mutator;
alter function public.ai_task_decision(uuid,uuid,text,text,uuid) owner to wedding_mutator;
revoke create on schema public,wedding_private from wedding_mutator;
revoke all on function wedding_private.ai_title_key(text) from public,anon,authenticated;
revoke all on function public.ai_reserve(uuid,uuid[]),public.ai_task_decision(uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.ai_reserve(uuid,uuid[]),public.ai_task_decision(uuid,uuid,text,text,uuid) to authenticated;
commit;
