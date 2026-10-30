import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import * as policy from '../src/server/auth/policy.ts';
const require=createRequire(import.meta.url),{NextRequest,NextResponse}=require('next/server');
const origin='https://mandapam.example.invalid',id='91000000-0000-4000-8000-000000000001',code='a'.repeat(64),token='b'.repeat(64),expires_at='2026-10-30T12:00:00Z';
function load(file,mocks){const loadedModule={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(name=>name==='server-only'?{}:mocks[name]??require(name),loadedModule,loadedModule.exports);return loadedModule.exports;}
function setup({authenticated=true,data={code,expires_at},error=null}={}){
 const calls=[],client={rpc:async(name,args)=>{calls.push([name,args]);return{data,error};}};
 const mocks={'@/server/auth/config':{appOrigin:()=>origin},'@/server/auth/policy':policy,'@/server/auth/client':{routeClient:()=>client,verifiedUser:async()=>authenticated?{id}:null,jsonResponse:(body,status=200)=>NextResponse.json(body,{status,headers:policy.privateHeaders()})}};
 mocks['@/server/invitations']=load('src/server/invitations.ts',mocks);
 const own=load('src/app/api/family/connect-code/route.ts',mocks),manage=load('src/app/api/weddings/[weddingId]/invitations/route.ts',mocks);
 const post=(route,body,from=origin)=>route.POST(new NextRequest(origin+'/api/test',{method:'POST',headers:{Origin:from},body:JSON.stringify(body)}),{params:Promise.resolve({weddingId:id})});return{calls,own,manage,post};
}
test('Verified user generates own code once; response strips internal identity and hash',async()=>{
 const s=setup({data:{code,expires_at,user_id:id,code_hash:'PRIVATE'}}),r=await s.post(s.own,{operation:'generate'});assert.equal(r.status,201);assert.deepEqual(await r.json(),{data:{code,expires_at}});assert.deepEqual(s.calls,[['connect_code_generate',{}]]);assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.match(r.headers.get('cache-control'),/no-store/);
});
test('Connect generation/revocation reject anonymous, foreign origin and identity overrides',async()=>{
 const anonymous=setup({authenticated:false});assert.equal((await anonymous.post(anonymous.own,{operation:'generate'})).status,401);assert.equal(anonymous.calls.length,0);
 for(const body of [{operation:'generate',user_id:id},{operation:'generate',role:'Admin'},{operation:'redeem'},{operation:'generate',code}]){const s=setup();assert.equal((await s.post(s.own,body)).status,400);assert.equal(s.calls.length,0);}
 const s=setup();assert.equal((await s.post(s.own,{operation:'generate'},'https://evil.invalid')).status,403);assert.equal(s.calls.length,0);
});
test('Self revocation accepts no target UUID',async()=>{const s=setup({data:null});assert.equal((await s.post(s.own,{operation:'revoke'})).status,200);assert.deepEqual(s.calls,[['connect_code_revoke',{}]]);});
test('Admin create integrates code resolution and invitation issuance in one RPC',async()=>{
 const s=setup({data:{id,token,expires_at}}),r=await s.post(s.manage,{operation:'create',connect_code:code});assert.equal(r.status,201);assert.deepEqual(s.calls,[['invitation_issue_connect',{p_id:id,p_code:code}]]);const body=(await r.json()).data;assert.equal(new URL(body.invitation_url).hash,'#token='+token);assert.ok(!JSON.stringify(body).includes(code));
});
test('Ambiguous or invalid recipient input is rejected before resolution',async()=>{
 for(const body of [{operation:'create',connect_code:code,recipient_user_id:id},{operation:'create',connect_code:'123456'},{operation:'create',connect_code:code,role:'Admin'}]){const s=setup();assert.equal((await s.post(s.manage,body)).status,400);assert.equal(s.calls.length,0);}
});
test('Committed DB limit and unavailable-code results map to safe HTTP errors',async()=>{
 for(const [error,status]of [['RATE_LIMITED',429],['NOT_FOUND',404],['CONFLICT',409]]){const s=setup({data:{error}}),r=await s.post(s.manage,{operation:'create',connect_code:code});assert.equal(r.status,status);assert.ok(!JSON.stringify(await r.json()).includes(code));}
 const s=setup({data:{error:'RATE_LIMITED'}});assert.equal((await s.post(s.own,{operation:'generate'})).status,429);
});
