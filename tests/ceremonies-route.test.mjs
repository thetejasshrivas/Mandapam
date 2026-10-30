// Execute the actual server page with isolated loader/session stubs. Not RLS proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url),id='41486793-e47e-44ad-aee2-e9fe58531ca3';
function page({authenticated=true,data=null,error=false}={}){
 const calls=[],loadedModule={exports:{}},client={fixture:true};
 const fail=(code,path)=>{throw Object.assign(new Error(code),{code,path});};
 const mocks={
  'next/link':{default:()=>null},
  'next/navigation':{redirect:path=>fail('REDIRECT',path),notFound:()=>fail('NOT_FOUND')},
  '@/server/auth/weddings':{accountContext:async()=>authenticated?{client,user:{id:'verified-owner',email:'fixture@example.invalid'}}:null},
  '@/server/auth/policy':{uuid:/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i},
  '@/server/create':{loadDraft:async(...args)=>{calls.push(args);return{data,error};}},
  '@/components/members/MemberPlanning':{renderMemberPlanning:async()=>fail('NOT_FOUND')},
  '@/components/shell/AppShell':{default:()=>null},
  '@/components/ceremonies/CeremoniesWorkspace':{default:()=>null},
 };
 const source=readFileSync('src/app/workspace/[weddingId]/ceremonies/page.tsx','utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',js)(name=>Object.hasOwn(mocks,name)?mocks[name]:require(name),loadedModule,loadedModule.exports);
 return{run:(value=id)=>loadedModule.exports.default({params:Promise.resolve({weddingId:value})}),calls,client};
}
const draft=state=>({wedding:{id,title:'Synthetic route fixture',state},ceremonies:[],tasks:[]});
test('Ceremonies page redirects anonymous users before loading private records',async()=>{const p=page({authenticated:false});await assert.rejects(p.run(),e=>e.code==='REDIRECT'&&e.path==='/login?next='+encodeURIComponent(`/workspace/${id}/ceremonies`));assert.equal(p.calls.length,0);});
test('malformed wedding ID is denied before the loader',async()=>{const p=page();await assert.rejects(p.run('invalid'),e=>e.code==='NOT_FOUND');assert.equal(p.calls.length,0);});
test('owner-inaccessible result is404 and loader receives verified owner identity',async()=>{const p=page();await assert.rejects(p.run(),e=>e.code==='NOT_FOUND');assert.deepEqual(p.calls[0],[p.client,'verified-owner',id]);});
test('DRAFT remains in the existing ceremony setup anchor',async()=>{const p=page({data:draft('DRAFT')});await assert.rejects(p.run(),e=>e.code==='REDIRECT'&&e.path===`/workspace/${id}#ceremonies`);});
test('ACTIVE result uses shared shell and the exact loaded data',async()=>{const data=draft('ACTIVE'),p=page({data}),result=await p.run();assert.equal(result.props.weddingId,id);assert.equal(result.props.active,true);assert.equal(result.props.children.props.data,data);});
test('loader error has a safe retry state, without private fixture contents',async()=>{const p=page({data:draft('ACTIVE'),error:true}),result=await p.run();assert.equal(result.props.className,'account-shell');assert.ok(JSON.stringify(result).includes('Ceremonies unavailable'));assert.ok(!JSON.stringify(result).includes('Synthetic route fixture'));});
