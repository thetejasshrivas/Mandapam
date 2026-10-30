import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import * as policy from '../src/server/auth/policy.ts';
const require=createRequire(import.meta.url),{NextRequest,NextResponse}=require('next/server');
const origin='https://mandapam.example.invalid',id='91000000-0000-4000-8000-000000000001',recipient='91000000-0000-4000-8000-000000000002',token='a'.repeat(64);
function load(file,mocks){const loadedModule={exports:{}};const js=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',js)(name=>name==='server-only'?{}:Object.hasOwn(mocks,name)?mocks[name]:require(name),loadedModule,loadedModule.exports);return loadedModule.exports;}
function setup({authenticated=true,error=null,data={id,token,expires_at:'2026-10-30T12:00:00Z'}}={}){
 const calls=[],client={rpc:async(name,args)=>{calls.push([name,args]);return{data,error};}};
 const mocks={'@/server/auth/config':{appOrigin:()=>origin},'@/server/auth/policy':policy,'@/server/auth/client':{routeClient:()=>client,verifiedUser:async()=>authenticated?{id:recipient,email_confirmed_at:'confirmed',is_anonymous:false}:null,jsonResponse:(body,status=200)=>NextResponse.json(body,{status,headers:policy.privateHeaders()})}};
 mocks['@/server/invitations']=load('src/server/invitations.ts',mocks);
 const manage=load('src/app/api/weddings/[weddingId]/invitations/route.ts',mocks),accept=load('src/app/api/invitations/accept/route.ts',mocks);
 const post=(route,body,headers={Origin:origin})=>route.POST(new NextRequest(origin+'/api/test',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)}),{params:Promise.resolve({weddingId:id})});
 return{calls,manage,accept,post};
}
test('Admin issue returns a trusted-origin fragment URL once, without token hash fields',async()=>{
 const s=setup(),r=await s.post(s.manage,{operation:'create',recipient_user_id:recipient});assert.equal(r.status,201);const body=await r.json(),link=new URL(body.data.invitation_url);assert.equal(link.origin,origin);assert.equal(link.pathname,'/api/invitations/accept');assert.equal(link.search,'');assert.equal(link.hash,'#token='+token);assert.ok(!JSON.stringify(body).includes('token_hash'));assert.deepEqual(s.calls,[['invitation_issue',{p_id:id,p_recipient:recipient}]]);assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.match(r.headers.get('cache-control'),/no-store/);
});
test('Anonymous and foreign-origin invitation operations fail before RPC',async()=>{
 for(const route of ['manage','accept']){const s=setup({authenticated:false});assert.equal((await s.post(s[route],{token})).status,401);assert.equal(s.calls.length,0);const other=setup();assert.equal((await other.post(other[route],{token},{Origin:'https://evil.invalid'})).status,403);assert.equal(other.calls.length,0);}
});
test('Acceptance passes token only and never accepts caller-selected recipient or role',async()=>{
 const s=setup({data:id});assert.equal((await s.post(s.accept,{token})).status,200);assert.deepEqual(s.calls,[['invitation_accept',{p_token:token}]]);
 for(const body of [{token,recipient_user_id:recipient},{token,role:'Admin'},{token:'invalid'}]){const invalid=setup();assert.equal((await invalid.post(invalid.accept,body)).status,400);assert.equal(invalid.calls.length,0);}
});
test('Expired/reused/revoked/wrong-recipient DB failures remain generic',async()=>{
 const s=setup({error:{code:'42501',message:'private token detail'},data:null}),r=await s.post(s.accept,{token});assert.equal(r.status,404);const body=JSON.stringify(await r.json());assert.ok(!body.includes('private')&&!body.includes(token));
});
test('Admin revoke operations are narrow and lists cannot return token hashes',async()=>{
 for(const [body,name,args]of [[{operation:'revoke',invitation_id:id},'invitation_revoke',{p_id:id,p_invitation:id}],[{operation:'revoke_member',member_user_id:recipient},'membership_revoke',{p_id:id,p_member:recipient}]]){const s=setup({data:null});assert.equal((await s.post(s.manage,body)).status,200);assert.deepEqual(s.calls,[[name,args]]);}
 const s=setup({data:[{id,recipient_user_id:recipient,expires_at:'date',accepted_at:null,revoked_at:null,token_hash:'NEVER EXPOSE'}]});const r=await s.manage.GET(new NextRequest(origin+'/api/test'),{params:Promise.resolve({weddingId:id})});assert.equal(r.status,200);assert.ok(!JSON.stringify(await r.json()).includes('NEVER EXPOSE'));
});
test('Invitation link preview does not consume or disclose an invitation',async()=>{
 const s=setup(),r=await s.accept.GET(new NextRequest(origin+'/api/invitations/accept',{headers:{Accept:'application/json'}}));assert.equal(r.status,200);assert.equal(s.calls.length,0);assert.deepEqual(await r.json(),{accept_method:'POST',requires_authentication:true});assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.match(r.headers.get('cache-control'),/private.*no-store/);assert.match(r.headers.get('vary'),/Cookie/);
});
test('Invitation proxy preserves no-referrer and includes the acceptance session path',async()=>{
 const {proxy,config}=load('src/proxy.ts',{'@supabase/ssr':{createServerClient:()=>assert.fail('No SDK needed')},'./server/auth/config':{authConfig:()=>null,cookieOptions:{}},'./server/auth/policy':policy});
 for(const path of ['/api/invitations/accept','/api/weddings/'+id+'/invitations'])assert.equal((await proxy(new NextRequest(origin+path))).headers.get('referrer-policy'),'no-referrer');
 assert.ok(config.matcher.includes('/api/invitations/:path*'));
});
test('Database invitation contract stores hashes, binds UUID and uses restricted roles/locks',()=>{
 const sql=readFileSync('supabase/migrations/20261029180513_wedding_invitations.sql','utf8');assert.match(sql,/token_hash text not null unique/);assert.match(sql,/sha256/);assert.match(sql,/gen_random_uuid/);assert.match(sql,/recipient_user_id/);assert.match(sql,/for update/);assert.match(sql,/force row level security/);assert.doesNotMatch(sql,/on delete cascade|grant .* to (?:public|anon)\s*;/i);assert.doesNotMatch(sql,/auth\.(?:uid|jwt)\(\)/);assert.match(sql,/invitation_acceptor nologin noinherit nosuperuser/);
});
