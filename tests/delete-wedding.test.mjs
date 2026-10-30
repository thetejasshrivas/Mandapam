import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {boundedJson} from '../src/lib/bounded-json.ts';
import * as policy from '../src/server/auth/policy.ts';
const require=createRequire(import.meta.url),{NextRequest,NextResponse}=require('next/server');
const id='61000000-0000-4000-8000-000000000001',origin='https://mandapam.example.invalid';
function load(file,mocks={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText)(n=>Object.hasOwn(mocks,n)?mocks[n]:require(n),m,m.exports);return m.exports;}
function setup({user=true,error=null,data=true}={}){const calls=[];const client={rpc:async(...args)=>{calls.push(args);return{data,error};}};const route=load('src/app/api/weddings/[weddingId]/route.ts',{'@/lib/bounded-json':{boundedJson},'@/server/auth/client':{routeClient:()=>client,verifiedUser:async()=>user?{id:'owner'}:null,jsonResponse:(x,status=200)=>NextResponse.json(x,{status,headers:policy.privateHeaders()})},'@/server/auth/weddings':{weddingFields:'id'},'@/server/auth/config':{appOrigin:()=>origin},'@/server/auth/policy':policy});return{calls,async send(body={confirmation:'Synthetic wedding',version:'7'},headers={Origin:origin},weddingId=id){assert.equal(typeof route.DELETE,'function');return route.DELETE(new NextRequest(origin+'/api/weddings/'+weddingId,{method:'DELETE',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)}),{params:Promise.resolve({weddingId})});}};}
test('Owner deletion sends only id, exact confirmation and version to restricted RPC',async()=>{const s=setup(),r=await s.send();assert.equal(r.status,200);assert.deepEqual(s.calls,[['delete_wedding',{p_id:id,p_confirmation:'Synthetic wedding',p_version:'7'}]]);assert.match(r.headers.get('cache-control'),/private.*no-store/);assert.match(r.headers.get('vary'),/Cookie/);});
test('Anonymous and foreign-origin requests cannot call the deletion RPC',async()=>{const a=setup({user:false});assert.equal((await a.send()).status,401);assert.equal(a.calls.length,0);for(const headers of[{}, {Origin:'https://foreign.invalid'}]){const s=setup();assert.equal((await s.send(undefined,headers)).status,403);assert.equal(s.calls.length,0);}});
test('Malformed confirmation, version, extra role and id fail before RPC',async()=>{for(const body of[{confirmation:'',version:'7'},{confirmation:'name',version:'-1'},{confirmation:'name',version:'7',role:'owner'},{confirmation:4,version:'7'},{confirmation:'name',version:7},{confirmation:'x'.repeat(2000),version:'7'},{confirmation:'name',version:'9223372036854775808'}]){const s=setup();assert.equal((await s.send(body)).status,400);assert.equal(s.calls.length,0);}const s=setup();assert.equal((await s.send(undefined,undefined,'invalid')).status,404);assert.equal(s.calls.length,0);});
test('Member, unrelated and missing errors are generic without provider details',async()=>{for(const name of['Member','unrelated','missing']){const s=setup({error:{code:'42501',message:name+' private detail'}}),r=await s.send();assert.equal(r.status,404);assert.doesNotMatch(JSON.stringify(await r.json()),/private detail/);}});
test('Invalid confirmation and stale/locked contexts return safe recoverable errors',async()=>{for(const[code,status]of[['22023',400],['PT409',409],['40001',409],['55P03',409],['40P01',409],['XX000',503]]){const s=setup({error:{code,message:'private database detail'}}),r=await s.send();assert.equal(r.status,status);assert.doesNotMatch(JSON.stringify(await r.json()),/private database detail/);}});

test('Settings require a verified owner query; Member and missing wedding get no deletion UI',async()=>{
  for(const allowed of[false,true]){
    const filters=[];const query={select:()=>query,eq:(...x)=>{filters.push(x);return query;},maybeSingle:async()=>({data:allowed?{id,title:'Synthetic wedding',state:'ACTIVE',state_version:'7'}:null,error:null})};
    const page=load('src/app/workspace/[weddingId]/settings/page.tsx',{'@/server/auth/weddings':{accountContext:async()=>({user:{id:'owner'},client:{from:()=>query}}),weddingFields:'id,title,state,state_version'},'@/server/auth/policy':policy,'@/components/settings/DeleteWedding':{__esModule:true,default:()=>null},'@/components/shell/AppShell':{__esModule:true,default:()=>null},'next/navigation':{notFound:()=>{throw Error('NOT_FOUND');},redirect:()=>{throw Error('REDIRECT');}}}).default;
    const result=page({params:Promise.resolve({weddingId:id})});
    if(allowed)assert.ok(await result);else await assert.rejects(result,/NOT_FOUND/);
    assert.deepEqual(filters,[['id',id],['owner_user_id','owner']]);
  }
});
