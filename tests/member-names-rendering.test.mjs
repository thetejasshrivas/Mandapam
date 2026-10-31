import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {memberLabels} from '../src/domain/member-names.ts';
const require=createRequire(import.meta.url),id='71000000-0000-4000-8000-000000000002',members=memberLabels([{id,display_name:'<img src=x onerror=alert(1)>'}]);
for(const file of ['TaskAssignment','DraftAssignments'])test(file+' safely renders names and retains UUID option values',()=>{
 const m={exports:{}},react={...React,useState:v=>[v===null||Array.isArray(v)?members:v,()=>{}],useEffect:()=>{},useRef:v=>({current:v}),useTransition:()=>[false,()=>{}]},mocks={'react':react,'next/navigation':{useRouter:()=>({refresh(){}})},'next/link':{default:({children,...p})=>React.createElement('a',p,children)}};
 new Function('require','module','exports',ts.transpileModule(readFileSync('src/components/tasks/'+file+'.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText)(n=>mocks[n]??require(n),m,m.exports);
 const task={id:'task',title:'Synthetic task',assigned_member_id:id},data={wedding:{id:'wedding',state_version:'1'},tasks:[task]},html=renderToStaticMarkup(React.createElement(m.exports.default,{task,weddingId:'wedding',version:'1',mark(){},cancel(){},data}));
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);assert.doesNotMatch(html,/<img/);assert.ok(html.includes('value="'+id+'"'));
});
