import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {safeReturnTo} from '../src/server/auth/policy.ts';
const require=createRequire(import.meta.url),{NextRequest}=require('next/server'),origin='https://mandapam.example.invalid',id='91000000-0000-4000-8000-000000000001';
function load(file,mocks={}){const loadedModule={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name==='server-only'?{}:Object.hasOwn(mocks,name)?mocks[name]:require(name),loadedModule,loadedModule.exports);return loadedModule.exports;}
test('Family sign-in return destinations are exact and cannot carry a credential or open redirect',()=>{
 for(const path of ['/family/connect','/family/accept',`/workspace/${id}/family`])assert.equal(safeReturnTo(path),path);
 for(const path of ['/family/accept#token=private','/family/accept?token=private','/family/../auth/logout','//evil.invalid/family/accept','https://evil.invalid','/family/other'])assert.equal(safeReturnTo(path),'/workspace');
});
test('Invitation links accept only local known paths and a fragment credential',()=>{
 const {invitationTokenFromLink}=load('src/components/family/flow.ts'),token='a'.repeat(64);
 assert.equal(invitationTokenFromLink(origin+'/api/invitations/accept#token='+token,origin),token);
 assert.equal(invitationTokenFromLink(origin+'/family/accept#token='+token,origin),token);
 for(const value of [origin+'/family/accept?token='+token,'https://evil.invalid/family/accept#token='+token,origin+'/other#token='+token,origin+'/family/accept#token=guess'])assert.equal(invitationTokenFromLink(value,origin),null);
});
test('Pending invitation cache is bounded, validated and expires without becoming an Auth session',()=>{
 const {readPendingInvitation}=load('src/components/family/flow.ts'),now=100000000,token='a'.repeat(64);
 assert.equal(readPendingInvitation(JSON.stringify({token,expires_at:now+1000}),now),token);
 for(const data of ['bad',JSON.stringify({token,expires_at:now-1}),JSON.stringify({token,expires_at:now+1800001}),JSON.stringify({token:'bad',expires_at:now+1})])assert.equal(readPendingInvitation(data,now),null);
});
test('History reports lifecycle timestamps without claiming current membership',()=>{
 const {invitationStatus}=load('src/components/family/flow.ts'),base={expires_at:'2026-10-31T00:00:00Z',accepted_at:null,revoked_at:null},now=Date.parse('2026-10-30T00:00:00Z');
 assert.equal(invitationStatus(base,now),'Pending');assert.equal(invitationStatus({...base,accepted_at:'saved'},now),'Accepted');assert.equal(invitationStatus({...base,revoked_at:'saved'},now),'Revoked');assert.equal(invitationStatus({...base,expires_at:'2026-10-29T00:00:00Z'},now),'Expired');assert.equal(invitationStatus({...base,expires_at:'invalid'},now),'Unknown');
});
const Link=({children,...props})=>{const attributes={...props};delete attributes.prefetch;return createElement('a',attributes,children);},shell=({children})=>createElement('div',{'data-shell':true},children);
test('Connect page is authenticated without requiring a wedding',async()=>{
 const page=load('src/app/family/connect/page.tsx',{'@/server/auth/weddings':{accountContext:async()=>({user:{email:'synthetic@example.invalid'}})},'next/navigation':{redirect:()=>assert.fail('Must not redirect signed-in recipient')},'@/components/shell/AppShell':{default:shell},'@/components/family/FamilyConnect':{default:()=>createElement('p',null,'Connect code')}});
 assert.match(renderToStaticMarkup(await page.default()),/Connect code/);
 const denied=load('src/app/family/connect/page.tsx',{'@/server/auth/weddings':{accountContext:async()=>null},'next/navigation':{redirect:url=>{throw Error(url);}},'@/components/shell/AppShell':{default:shell},'@/components/family/FamilyConnect':{default:()=>null}});await assert.rejects(denied.default(),/next=.*family/);
});
test('Family management checks persisted ownership before querying invitation history',async()=>{
 let invitations=0;const client={from:()=>({select:()=>({eq(){return this;},maybeSingle:async()=>({data:null,error:null})})}),rpc:()=>{invitations++;assert.fail('No invitation access for denied owner');}};
 const page=load('src/app/workspace/[weddingId]/family/page.tsx',{'@/server/auth/weddings':{accountContext:async()=>({user:{id},client})},'@/server/auth/policy':{uuid:/^[a-f0-9-]{36}$/},'@/server/invitations':{invitationInfo:value=>value},'next/navigation':{notFound:()=>{throw Error('404');},redirect:()=>{throw Error('login');}},'@/components/shell/AppShell':{default:shell},'@/components/family/FamilyAccess':{default:()=>null}});
 await assert.rejects(page.default({params:Promise.resolve({weddingId:id})}),/404/);assert.equal(invitations,0);
});
test('Browser invitation requests receive an inert UI bridge; JSON clients retain metadata',async()=>{
 const policy=load('src/server/auth/policy.ts'),routes=load('src/app/api/invitations/accept/route.ts',{'@/server/auth/config':{appOrigin:()=>origin},'@/server/auth/policy':policy,'@/server/auth/client':{routeClient:()=>assert.fail('GET must not authenticate or consume'),verifiedUser:()=>null,jsonResponse:(body,status=200)=>require('next/server').NextResponse.json(body,{status})},'@/server/invitations':load('src/server/invitations.ts',{'@/server/auth/client':{jsonResponse:(body,status=200)=>require('next/server').NextResponse.json(body,{status})}})});
 const html=routes.GET(new NextRequest(origin+'/api/invitations/accept',{headers:{Accept:'text/html'}}));assert.equal(html.status,303);assert.equal(html.headers.get('location'),origin+'/family/accept');assert.equal(html.headers.get('referrer-policy'),'no-referrer');assert.ok((await routes.GET(new NextRequest(origin+'/api/invitations/accept',{headers:{Accept:'application/json'}})).json()).requires_authentication);
});
test('Family history markup is accurately labelled and contains no unsupported roster or email lookup',()=>{
 const primitives=load('src/components/ui/Primitives.tsx',{'next/link':{default:Link},'./Icon':{default:()=>null}}),flow=load('src/components/family/flow.ts');
 const component=load('src/components/family/FamilyAccess.tsx',{'next/link':{default:Link},'../ui/Primitives':primitives,'./flow':flow});
 const html=renderToStaticMarkup(createElement(component.default,{weddingId:id,initialInvitations:[],historyUnavailable:false}));assert.match(html,/Invitation History/);assert.match(html,/Connect Code/);assert.match(html,/not a current Member roster/);assert.doesNotMatch(html,/<h[1-6][^>]*>Member roster|Enter.*email|Select role|Co-planner/);
});
test('Password failure, OAuth initiation and callback cancellation preserve only credential-free Family return paths',async()=>{
 const policy=load('src/server/auth/policy.ts'),calls=[],routes=load('src/app/auth/[operation]/route.ts',{'@/server/auth/config':{appOrigin:()=>origin,authConfig:()=>({url:'https://synthetic.supabase.co'})},'@/server/auth/policy':policy,'@/server/auth/client':{jsonResponse:(body,status=200)=>require('next/server').NextResponse.json(body,{status}),routeClient:()=>({auth:{signInWithPassword:async()=>({error:{message:'private'}}),signInWithOAuth:async args=>{calls.push(args);return{data:{url:'https://synthetic.supabase.co/auth/v1/authorize?provider=google'},error:null};}}})}});
 const post=operation=>routes.POST(new NextRequest(origin+'/auth/'+operation,{method:'POST',headers:{Origin:origin},body:new URLSearchParams({email:'test@example.invalid',password:'synthetic',next:'/family/accept'})}),{params:Promise.resolve({operation})});
 assert.equal(new URL((await post('login')).headers.get('location')).searchParams.get('next'),'/family/accept');
 assert.equal((await post('google')).status,303);assert.equal(new URL(calls[0].options.redirectTo).searchParams.get('next'),'/family/accept');assert.ok(!calls[0].options.redirectTo.includes('token'));
 const cancelled=await routes.GET(new NextRequest(origin+'/auth/callback?error=access_denied&next=%2Ffamily%2Faccept'),{params:Promise.resolve({operation:'callback'})});assert.equal(new URL(cancelled.headers.get('location')).searchParams.get('next'),'/family/accept');
});
test('Copy action uses the native clipboard and provides manual fallback on denial',async()=>{
 const {copyFamilyValue}=load('src/components/family/flow.ts'),descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');let copied='';
 try{Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async value=>{copied=value;}}}});assert.match(await copyFamilyValue('synthetic-value'),/^Copied/);assert.equal(copied,'synthetic-value');Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async()=>{throw Error('denied');}}}});assert.match(await copyFamilyValue('synthetic-value'),/manually/);}finally{if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator;}
});
test('Unexpected invitation response parsing never exposes provider details',async()=>{
 const {familyPost}=load('src/components/family/flow.ts'),original=globalThis.fetch;
 try{globalThis.fetch=async()=>({ok:true,json:async()=>{throw Error('PRIVATE PROVIDER DETAIL');}});await assert.rejects(familyPost('/api/invitations/accept',{token:'a'.repeat(64)}),/The result could not be confirmed/);}finally{globalThis.fetch=original;}
});
