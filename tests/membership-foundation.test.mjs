// Static review guardrails only. These do not execute PostgreSQL or prove RLS.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const path='supabase/migrations/20261029170000_membership_foundation.sql';
test('Membership foundation keeps privileged functions outside the public API schema',()=>{
 const sql=readFileSync(path,'utf8');
 assert.doesNotMatch(sql,/create (?:or replace )?function public\.[\s\S]*?security definer/i);
 for(const name of ['planning_read','membership_grant','membership_revoke'])assert.match(sql,new RegExp('create function public\\.'+name+'[\\s\\S]*?security invoker'));
 assert.match(sql,/force row level security/i);
 assert.match(sql,/nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls/i);
 assert.doesNotMatch(sql,/grant .* to (?:anon|public)\s*;/i);
 assert.doesNotMatch(sql,/drop policy|alter policy|create or replace view public\.(weddings|ceremonies|tasks)/i);
});
test('Planning projection explicitly omits money and ADAPT data',()=>{
 const sql=readFileSync(path,'utf8'),read=sql.split('create function wedding_access.read_planning')[1]?.split('create function public.planning_read')[0];
 assert.ok(read);
 assert.doesNotMatch(read,/budget_ceiling|cost_items|cash_entries|change_proposals|audit_events|to_jsonb\s*\(|select\s+\*/i);
 assert.match(read,/dismissed_at is null/);
 assert.match(read,/archived_at is null/);
 assert.match(sql,/grant select\(id,owner_user_id,title,city,wedding_date,is_tentative,state\)/i);
});
test('Membership changes remain owner checked and cannot grant Admin or transfer identity',()=>{
 const sql=readFileSync(path,'utf8');
 assert.match(sql,/owner_user_id=wedding_private\.caller_uid\(\) for update/);
 assert.match(sql,/p_member=wedding_private\.caller_uid\(\)/);
 assert.match(sql,/grant update\(revoked_at\) on wedding_access\.memberships/);
 assert.doesNotMatch(sql,/on delete cascade|grant (?:insert|update|delete)[^;]*to authenticated/i);
 assert.match(sql,/primary key\(wedding_id,user_id\)/);
 assert.match(sql,/revoked_at is null/);
});

test('Membership helpers reuse private caller identity without managed Auth schema privileges',()=>{
 const sql=readFileSync(path,'utf8');
 assert.doesNotMatch(sql,/auth\.(?:uid|jwt)\(\)/i);
 assert.doesNotMatch(sql,/grant usage on schema[^;]*\bauth\b/i);
 assert.match(sql,/grant execute on function wedding_private\.caller_uid\(\) to wedding_planning_reader,wedding_membership_writer/);
 assert.match(sql,/current_setting\('request\.jwt\.claims',true\)/);
});
