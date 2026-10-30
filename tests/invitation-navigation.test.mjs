import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {uuid} from '../src/server/auth/policy.ts';
const require=createRequire(import.meta.url),id='91000000-0000-4000-8000-000000000001';
function setup({authenticated=true,data={wedding_id:id},failure=null}={}){
 const replacements=[],states=[],calls=[];let stateIndex=0,cleared=false;
 const mocks={react:{useEffect:()=>{},useState:initial=>{const n=stateIndex++;return[n===0?'a'.repeat(64):n===2?true:initial,value=>states.push([n,value])];}},'next/link':{default:function ClientLink(){}},'next/navigation':{useRouter:()=>({replace:path=>replacements.push(path)})},'../ui/Primitives':{Button:'button',Card:'section',PageHeading:'h1'},'@/server/auth/policy':{uuid},'./flow':{familyPost:async(path,body)=>{calls.push({path,keys:Object.keys(body)});if(failure)throw Error(failure);return data;},pendingInvitationKey:'synthetic-invitation'}};
 const loadedModule={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync('src/components/family/InvitationAccept.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText)(name=>Object.hasOwn(mocks,name)?mocks[name]:require(name),loadedModule,loadedModule.exports);
 const tree=loadedModule.exports.default({authenticated});
 function find(node,label){if(!node||typeof node!=='object')return null;if(node.props?.children===label)return node;for(const child of [node.props?.children].flat(Infinity)){const result=find(child,label);if(result)return result;}return null;}
 return{find:label=>find(tree,label),replacements,states,calls,markClear:()=>{cleared=true;},wasCleared:()=>cleared};
}
test('Invitation sign-in and account-switch actions load a new login document with validated return destination',()=>{
 for(const [authenticated,label]of [[false,'Sign in to continue'],[true,'Sign in with the intended account']]){const s=setup({authenticated}),link=s.find(label);assert.ok(link);assert.equal(link.type,'a','Must use full-document navigation to replace inherited no-referrer policy');assert.equal(link.props.href,'/login?next=%2Ffamily%2Faccept');}
});
test('Valid persisted acceptance UUID triggers Member navigation; invalid/error responses never navigate',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
 try{
  const valid=setup();Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{removeItem:valid.markClear}});await valid.find('Accept invitation').props.onClick();assert.deepEqual(valid.replacements,['/workspace/'+id]);assert.equal(valid.wasCleared(),true);assert.deepEqual(valid.calls,[{path:'/api/invitations/accept',keys:['token']}]);
  for(const options of [{data:{wedding_id:'https://evil.invalid'}},{data:{wedding_id:'91000000-0000-4000-000000000001'}},{data:{wedding_id:null}},{failure:'Invitation unavailable'}]){const invalid=setup(options);Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{removeItem:invalid.markClear}});await invalid.find('Accept invitation').props.onClick();assert.equal(invalid.replacements.length,0);assert.equal(invalid.wasCleared(),false);assert.ok(invalid.states.some(([index,value])=>index===4&&typeof value==='string'&&value.length>0));}
 }finally{if(descriptor)Object.defineProperty(globalThis,'sessionStorage',descriptor);else delete globalThis.sessionStorage;}
});
