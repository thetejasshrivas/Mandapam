// Actual route/page execution with SDK boundary stubs; no provider, DB or live-session proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import * as policy from '../src/server/auth/policy.ts';
const require=createRequire(import.meta.url),{NextRequest}=require('next/server');
const origin='https://mandapam.example.invalid',supabase='https://synthetic.supabase.co',id='11111111-1111-4111-8111-111111111111';
function load(file,mocks){const loadedModule={exports:{}};const js=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',js)(name=>Object.hasOwn(mocks,name)?mocks[name]:require(name),loadedModule,loadedModule.exports);return loadedModule.exports;}
function setup(options={}){
 const calls=[],state={userId:id,wedding:{id:'saved-wedding',owner_user_id:id}},config={url:supabase,key:'synthetic-publishable-placeholder'};
 const routes=load('src/app/auth/[operation]/route.ts',{'@/server/auth/config':{appOrigin:()=>options.origin===undefined?origin:options.origin,authConfig:()=>config},'@/server/auth/policy':policy,'@/server/auth/client':{
  jsonResponse:(body,status=200)=>new Response(JSON.stringify(body),{status,headers:policy.privateHeaders()}),
  routeClient:(_request,response)=>options.noClient?null:{from(){assert.fail('Auth must not query or modify wedding records');},rpc(){assert.fail('Auth must not invoke wedding mutations');},auth:{
   signInWithOAuth:async args=>{calls.push(['oauth',args]);if(options.throwOAuth)throw Error('private provider detail');response.cookies.set('synthetic-pkce-verifier','synthetic-verifier',{httpOnly:true,secure:true,sameSite:'lax',path:'/'});return{data:{url:options.oauthURL===undefined?supabase+'/auth/v1/authorize?provider=google':options.oauthURL},error:options.oauthError?{message:'private provider detail'}:null};},
   exchangeCodeForSession:async code=>{calls.push(['exchange',code]);if(options.throwExchange)throw Error('private provider detail');if(options.exchangeError)return{error:{message:'private provider detail'}};response.cookies.set('synthetic-session','synthetic-session-value',{httpOnly:true,secure:true,sameSite:'lax',path:'/'});return{data:{user:{id:state.userId}},error:null};},
   signInWithPassword:async args=>{calls.push(['password',args]);return{error:options.passwordError?{message:'private auth detail'}:null};},
   signUp:async args=>{calls.push(['signup',args]);return{error:null};},signOut:async args=>{calls.push(['logout',args]);return{error:null};}
  }}
 }});
 return{calls,state,post:(operation,fields={},headers={Origin:origin})=>routes.POST(new NextRequest(origin+'/auth/'+operation,{method:'POST',headers,body:new URLSearchParams(fields)}),{params:Promise.resolve({operation})}),get:(query='',headers={})=>routes.GET(new NextRequest(origin+'/auth/callback'+query,{headers}),{params:Promise.resolve({operation:'callback'})})};
}
const location=r=>r.headers.get('location');
test('Google native POST starts provider google with configured PKCE callback/allowlisted return and retains verifier cookie',async()=>{
 const s=setup(),r=await s.post('google',{next:'/workspace/'+id});assert.equal(r.status,303);assert.equal(location(r),supabase+'/auth/v1/authorize?provider=google');
 const args=s.calls[0][1];assert.equal(args.provider,'google');assert.equal(args.options.skipBrowserRedirect,true);const callback=new URL(args.options.redirectTo);assert.equal(callback.origin,origin);assert.equal(callback.pathname,'/auth/callback');assert.equal(callback.searchParams.get('next'),'/workspace/'+id);assert.equal(callback.searchParams.get('flow'),'google');
 assert.match(r.headers.get('set-cookie'),/synthetic-pkce-verifier=.*HttpOnly/i);assert.match(r.headers.get('cache-control'),/private.*no-store/);
});
test('Google initiation denies foreign/missing origins and missing application config before SDK use',async()=>{
 for(const headers of [{},{Origin:'https://evil.invalid'},{Origin:'null'}]){const s=setup(),r=await s.post('google',{},headers);assert.equal(r.status,403);assert.equal(s.calls.length,0);}
 const s=setup({origin:null});assert.equal((await s.post('google')).status,403);assert.equal(s.calls.length,0);
});
test('Initiation return targets cannot become external or arbitrary application redirects',async()=>{
 for(const next of ['https://evil.invalid','//evil.invalid','/\\evil.invalid','/workspace/../auth/logout','/auth/logout','/workspace?next=https://evil.invalid']){const s=setup();await s.post('google',{next});assert.equal(new URL(s.calls[0][1].options.redirectTo).searchParams.get('next'),'/workspace');}
});
test('Initiation fails safely for SDK errors, missing URLs, unavailable client or unsafe authorization destinations',async()=>{
 for(const options of [{oauthError:true},{throwOAuth:true},{oauthURL:null},{noClient:true},{oauthURL:'https://evil.invalid'},{oauthURL:'javascript:alert(1)'},{oauthURL:'http://synthetic.supabase.co/auth/v1/authorize?provider=google'},{oauthURL:supabase+'/other?provider=google'},{oauthURL:supabase+'/auth/v1/authorize?provider=github'},{oauthURL:'https://name:password@synthetic.supabase.co/auth/v1/authorize?provider=google'}]){const s=setup(options),r=await s.post('google');assert.equal(r.status,303);assert.match(location(r),/^https:\/\/mandapam\.example\.invalid\/login\?message=(oauth_unavailable|unavailable)$/);assert.ok(!location(r).includes('private'));}
});
test('OAuth cancellation/provider errors are generic and never exchange a supplied code or reflect error text',async()=>{
 for(const [error,message]of [['access_denied','oauth_cancelled'],['server_error','oauth_error']]){const s=setup(),r=await s.get('?flow=google&error='+error+'&error_description=private-detail&code=synthetic-code');assert.equal(location(r),origin+'/login?message='+message);assert.equal(s.calls.length,0);assert.equal(r.headers.get('referrer-policy'),'no-referrer');}
});
test('Missing, blank, oversized and rejected Google codes fail closed',async()=>{
 for(const code of [null,'',' ','x'.repeat(2049)]){const s=setup(),query=new URLSearchParams({flow:'google'});if(code!==null)query.set('code',code);const r=await s.get('?'+query);assert.equal(location(r),origin+'/login?message=oauth_error');assert.equal(s.calls.length,0);}
 for(const options of [{exchangeError:true},{throwExchange:true},{noClient:true}]){const s=setup(options),r=await s.get('?flow=google&code=invalid-code');assert.equal(location(r),origin+'/login?message=oauth_error');assert.ok(!r.headers.get('set-cookie'));}
});
test('Valid callback retains session cookie and existing identity/wedding without DB calls or email ownership matching',async()=>{
 const s=setup(),before=structuredClone(s.state),r=await s.get('?flow=google&code=valid-code&next='+encodeURIComponent('/workspace/'+id));assert.equal(location(r),origin+'/workspace/'+id);assert.deepEqual(s.calls,[['exchange','valid-code']]);assert.match(r.headers.get('set-cookie'),/synthetic-session=.*HttpOnly/i);assert.deepEqual(s.state,before);
});
test('Valid OAuth callback cannot redirect outside allowed workspaces or trust request Host',async()=>{
 for(const next of ['https://evil.invalid','//evil.invalid','/%2f%2fevil.invalid','/auth/logout','/workspace/../login']){const s=setup(),r=await s.get('?flow=google&code=valid&next='+encodeURIComponent(next));assert.equal(location(r),origin+'/workspace');}
});
test('Existing email confirmation callback success/failure behavior remains available',async()=>{
 const s=setup();assert.equal(location(await s.get('?code=confirmation-code')),origin+'/workspace');assert.equal(location(await setup({exchangeError:true}).get('?code=bad')),origin+'/login?message=confirmation');
});
test('Email/password sign-in and signup retain existing SDK calls and no wedding creation',async()=>{
 const s=setup(),r=await s.post('login',{email:'person@example.invalid',password:'synthetic-password',next:'/workspace/'+id});assert.equal(location(r),origin+'/workspace/'+id);assert.deepEqual(s.calls,[['password',{email:'person@example.invalid',password:'synthetic-password'}]]);
 const signup=setup();assert.equal(location(await signup.post('signup',{email:'person@example.invalid',password:'synthetic-password'})),origin+'/login?message=check_email');assert.deepEqual(signup.calls,[['signup',{email:'person@example.invalid',password:'synthetic-password',options:{emailRedirectTo:origin+'/auth/callback'}}]]);
 assert.equal(location(await setup({passwordError:true}).post('login',{email:'person@example.invalid',password:'synthetic-password'})),origin+'/login?message=credentials');
});
test('Login renders accessible standalone Google form alongside unchanged password/signup forms and safe errors',async()=>{
 for(const ready of [true,false]){const page=load('src/app/login/page.tsx',{'next/link':{default:({children,prefetch,...props})=>{void prefetch;return createElement('a',props,children);}},'@/server/auth/config':{authConfig:()=>ready?{url:supabase}:null},'@/server/auth/policy':policy}).default;
 const html=renderToStaticMarkup(await page({searchParams:Promise.resolve({next:'https://evil.invalid',message:'oauth_cancelled'})}));const google=html.match(/<form[^>]*action="\/auth\/google"[\s\S]*?<\/form>/)?.[0];assert.ok(google);assert.match(google,/method="post"/);assert.match(google,/Continue with Google/);assert.match(google,/name="next" value="\/workspace"/);assert.equal(/<button[^>]*disabled/.test(google),!ready);assert.match(html,/action="\/auth\/login"/);assert.match(html,/action="\/auth\/signup"/);assert.match(html,/cancelled/i);assert.ok(!html.includes('https://evil.invalid'));}
});
test('OAuth redirects use configured origin even with forged Host and forwarded headers',async()=>{
 const s=setup();await s.post('google',{}, {Origin:origin,Host:'evil.invalid','X-Forwarded-Host':'evil.invalid'});assert.equal(new URL(s.calls[0][1].options.redirectTo).origin,origin);
 const response=await s.get('?flow=google&code=valid',{Host:'evil.invalid','X-Forwarded-Host':'evil.invalid'});assert.equal(location(response),origin+'/workspace');
});
test('Installed Supabase SSR SDK generates PKCE S256 and server verifier cookies without OAuth network requests',async()=>{
 const {createServerClient}=require('@supabase/ssr'),written=[];
 const client=createServerClient(supabase,'sb_publishable_synthetic',{cookieOptions:{httpOnly:true,secure:true,sameSite:'lax',path:'/'},global:{fetch:()=>assert.fail('OAuth initiation must not contact a provider in this test')},cookies:{getAll:()=>[],setAll:values=>written.push(...values)}});
 const redirectTo=origin+'/auth/callback?flow=google';const {data,error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo,skipBrowserRedirect:true}});assert.equal(error,null);const url=new URL(data.url);assert.equal(url.origin,supabase);assert.equal(url.pathname,'/auth/v1/authorize');assert.equal(url.searchParams.get('provider'),'google');assert.equal(url.searchParams.get('redirect_to'),redirectTo);assert.equal(url.searchParams.get('code_challenge_method'),'s256');assert.ok(url.searchParams.get('code_challenge')?.length>20);assert.ok(written.some(c=>c.name.includes('code-verifier')&&c.options.httpOnly===true&&c.options.sameSite==='lax'));
});
test('Sign-out remains POST-only and expires the local session independently of provider',async()=>{
 const previous=process.env.NEXT_PUBLIC_SUPABASE_URL;try{process.env.NEXT_PUBLIC_SUPABASE_URL=supabase;const s=setup(),r=await s.post('logout',{}, {Origin:origin,Cookie:'sb-synthetic-auth-token=synthetic-session'});assert.equal(location(r),origin+'/login?message=signed_out');assert.deepEqual(s.calls,[['logout',{scope:'local'}]]);assert.match(r.headers.get('set-cookie'),/sb-synthetic-auth-token=;/);assert.match(r.headers.get('set-cookie'),/Max-Age=0/i);assert.equal(r.headers.get('clear-site-data'),'"cache", "storage"');}finally{if(previous===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=previous;}
 const loaded=load('src/app/auth/[operation]/route.ts',{'@/server/auth/config':{appOrigin:()=>origin},'@/server/auth/policy':policy,'@/server/auth/client':{jsonResponse:(body,status)=>new Response(JSON.stringify(body),{status}),routeClient:()=>assert.fail('GET must not initiate Google or sign-out')}});for(const operation of ['google','logout'])assert.equal((await loaded.GET(new NextRequest(origin+'/auth/'+operation),{params:Promise.resolve({operation})})).status,405);
});
test('Proxy preserves callback no-referrer while login forms retain same-origin policy',async()=>{
 const {proxy}=load('src/proxy.ts',{'@supabase/ssr':{createServerClient:()=>assert.fail('No configured provider needed for header test')},'./server/auth/config':{authConfig:()=>null,cookieOptions:{}},'./server/auth/policy':policy});
 assert.equal((await proxy(new NextRequest(origin+'/login'))).headers.get('referrer-policy'),'same-origin');assert.equal((await proxy(new NextRequest(origin+'/auth/callback?code=synthetic-code'))).headers.get('referrer-policy'),'no-referrer');
});

test('Local Google initiation keeps the localhost callback and query-bearing return target',async()=>{
 const local='http://localhost:3000',s=setup({origin:local});
 const r=await s.post('google',{next:'/workspace/'+id},{Origin:local});
 assert.equal(r.status,303);
 const callback=new URL(s.calls[0][1].options.redirectTo);
 assert.equal(callback.origin+callback.pathname,local+'/auth/callback');
 assert.equal(callback.searchParams.get('next'),'/workspace/'+id);
 assert.equal(callback.searchParams.get('flow'),'google');
 assert.equal(location(await s.get('?error=access_denied')),local+'/login?message=oauth_cancelled');
});

test('Production Google initiation and callback use only the trusted production origin',async()=>{
 const production='https://mandapam-wedding-skeleton.vercel.app',s=setup({origin:production});
 const r=await s.post('google',{next:'https://evil.invalid'},{Origin:production,Host:'localhost:3000','X-Forwarded-Host':'evil.invalid'});
 assert.equal(r.status,303);
 const callback=new URL(s.calls[0][1].options.redirectTo);
 assert.equal(callback.origin+callback.pathname,production+'/auth/callback');
 assert.equal(callback.searchParams.get('next'),'/workspace');
 assert.equal(location(await s.get('?code=synthetic-code')),production+'/workspace');
 assert.equal((await s.post('google',{}, {Origin:'http://localhost:3000'})).status,403);
});
