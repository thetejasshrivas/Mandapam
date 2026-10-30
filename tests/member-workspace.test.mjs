// Actual modules with boundary stubs. Real local HTTP/RLS evidence is recorded separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import * as policy from '../src/server/auth/policy.ts';
const require=createRequire(import.meta.url),{NextRequest,NextResponse}=require('next/server');
const id='91000000-0000-4000-8000-000000000001',taskId='92000000-0000-4000-8000-000000000001';
const planning={wedding:{id,title:'Shared wedding',city:'Test city',wedding_date:null,is_tentative:true,state:'ACTIVE'},ceremonies:[{id,title:'Reception',ceremony_date:null,guest_count:null}],tasks:[{id:taskId,ceremony_id:id,title:'Shared task',description:null,owner_name:null,due_date:null,status:'TO_DO',prerequisite_task_id:null,completed_at:null}]};
function load(file,mocks={}){const loadedModule={exports:{}};const js=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',js)(name=>name==='server-only'?{}:Object.hasOwn(mocks,name)?mocks[name]:require(name),loadedModule,loadedModule.exports);return loadedModule.exports;}
const fail=code=>{throw Object.assign(Error(code),{code});};
test('Planning loader calls only restricted RPC and strips unexpected financial fields',async()=>{
 const calls=[],client={from:()=>assert.fail('No base-table fallback'),rpc:async(...args)=>{calls.push(args);return{data:{...planning,budget:123,wedding:{...planning.wedding,budget_ceiling_paise:'123'},tasks:[{...planning.tasks[0],finance:'private'}]},error:null};}};
 const {loadPlanning}=load('src/server/planning.ts');const result=await loadPlanning(client,id);
 assert.deepEqual(calls,[['planning_read',{p_id:id}]]);assert.deepEqual(result,{data:planning,error:false});
});
test('Planning loader fails closed for errors, unavailable membership and mismatched wedding',async()=>{
 const {loadPlanning}=load('src/server/planning.ts');
 assert.deepEqual(await loadPlanning({rpc:async()=>({data:null,error:null})},id),{data:null,error:false});
 for(const rpc of [async()=>({error:{code:'PGRST202'},data:null}),async()=>{throw Error('offline');},async()=>({error:null,data:{...planning,wedding:{...planning.wedding,id:taskId}}})])assert.deepEqual(await loadPlanning({rpc},id),{data:null,error:true});
});
for(const [tail,view]of [['','overview'],['/tasks','tasks'],['/ceremonies','ceremonies']]){
 function page(authenticated,data){const calls=[];const mod=load('src/app/workspace/[weddingId]'+tail+'/page.tsx',{
  'next/link':{default:()=>null},'next/navigation':{redirect:()=>fail('LOGIN'),notFound:()=>fail('NOT_FOUND')},
  '@/server/auth/weddings':{accountContext:async()=>authenticated?{client:{},user:{id:'verified',email:'fixture@example.invalid'}}:null},'@/server/auth/policy':policy,
  '@/server/create':{loadDraft:async()=>{calls.push('owner');return{data,error:false};}},
  '@/components/members/MemberPlanning':{renderMemberPlanning:async(_client,weddingId,selected)=>{calls.push([weddingId,selected]);return 'member';}},
  '@/components/shell/AppShell':{default:()=>null},'@/components/tasks/ActiveTasks':{default:()=>null},'@/components/ceremonies/CeremoniesWorkspace':{default:()=>null},
  '@/components/create/DraftWorkspace':{default:()=>null},'@/components/dashboard/Dashboard':{default:()=>null},'@/domain/priorities':{istDate:()=>''},'@/presentation/dashboard':{dashboardPresentation:()=>({})},
  '@/server/finance':{loadFinance:async()=>({data:null,error:false})},'@/server/adapt':{loadProposals:async()=>({data:[],error:false})},
 });return{calls,run:()=>mod.default({params:Promise.resolve({weddingId:id})})};}
 test('Member fallback on '+(tail||'/overview')+' uses restricted renderer',async()=>{const p=page(true,null);assert.equal(await p.run(),'member');assert.deepEqual(p.calls,['owner',[id,view]]);});
 test('Owner branch on '+(tail||'/overview')+' is unchanged',async()=>{const p=page(true,{wedding:planning.wedding,ceremonies:[],tasks:[]});await p.run();assert.deepEqual(p.calls,['owner']);});
 test('Anonymous cannot load '+(tail||'/overview'),async()=>{const p=page(false,null);await assert.rejects(p.run(),e=>e.code==='LOGIN');assert.equal(p.calls.length,0);});
}
test('Member renderer provides readonly navigation/task anchors and truthful unknown states',async()=>{
 const {renderMemberPlanning}=load('src/components/members/MemberPlanning.tsx',{'next/link':{default:({children,...props})=>createElement('a',props,children)},'next/navigation':{notFound:()=>fail('NOT_FOUND')},'@/server/planning':{loadPlanning:async()=>({data:planning,error:false})}});
 for(const view of ['overview','ceremonies','tasks']){const html=renderToStaticMarkup(await renderMemberPlanning({},id,view));assert.match(html,/Member.*read.only/i);for(const tail of ['', '/tasks','/ceremonies'])assert.ok(html.includes('href="/workspace/'+id+tail+'"'));assert.doesNotMatch(html,/\/budget|\/changes|membership_grant|<input|<select|<textarea/);if(view==='tasks')assert.ok(html.includes('id="task-'+taskId+'"'));if(view==='ceremonies')assert.match(html,/Unknown/);}
});
test('Unrelated renderer result is404 and RPC failure is a generic unavailable state',async()=>{
 for(const error of [false,true]){const {renderMemberPlanning}=load('src/components/members/MemberPlanning.tsx',{'next/link':{default:()=>null},'next/navigation':{notFound:()=>fail('NOT_FOUND')},'@/server/planning':{loadPlanning:async()=>({data:null,error})}});if(error)assert.match(renderToStaticMarkup(await renderMemberPlanning({},id,'overview')),/Planning unavailable/);else await assert.rejects(renderMemberPlanning({},id,'overview'),e=>e.code==='NOT_FOUND');}
});
test('Planning GET verifies session, returns safe projection and denies unrelated/anonymous callers',async()=>{
 for(const [authenticated,data,status]of [[true,planning,200],[true,null,404],[false,null,401]]){let calls=0;const {GET,POST}=load('src/app/api/weddings/[weddingId]/planning/route.ts',{'@/server/auth/client':{routeClient:()=>({}),verifiedUser:async()=>authenticated?{id:'verified'}:null,jsonResponse:(data,status=200)=>NextResponse.json(data,{status,headers:policy.privateHeaders()})},'@/server/auth/policy':policy,'@/server/planning':{loadPlanning:async()=>{calls++;return{data,error:false};}}});const response=await GET(new NextRequest('http://localhost/api/weddings/'+id+'/planning'),{params:Promise.resolve({weddingId:id})});assert.equal(response.status,status);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(POST,undefined);assert.equal(calls,authenticated?1:0);}
});
test('Development local Supabase HTTP is explicitly loopback-only; production stays HTTPS-only',()=>{
 const keys=['NODE_ENV','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{const {authConfig}=load('src/server/auth/config.ts',{'@/lib/deployment-origin':{deploymentOrigin:()=>null}});process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='sb_publishable_synthetic';for(const [env,url,allowed]of [['development','http://127.0.0.1:58321',true],['development','http://localhost:58321',true],['production','http://127.0.0.1:58321',false],['development','http://supabase.invalid',false],['production','https://synthetic.supabase.co',true]]){process.env.NODE_ENV=env;process.env.NEXT_PUBLIC_SUPABASE_URL=url;assert.equal(Boolean(authConfig()),allowed);}}finally{for(const k of keys)if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}
});
