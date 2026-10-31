import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {displayDate} from '../src/domain/create.ts';
import {allowedTransitions,readiness} from '../src/domain/tasks.ts';
const require=createRequire(import.meta.url);
function load(file,mocks){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText)(n=>mocks[n]??require(n),m,m.exports);return m.exports;}
const link={default:({children,prefetch,...props})=>{void prefetch;return createElement('a',props,children);}},icon={default:()=>null};
const primitives=load('src/components/ui/Primitives.tsx',{'next/link':link,'./Icon':icon});const {default:Workspace}=load('src/components/members/MemberWorkspace.tsx',{'next/link':link,'next/image':{default:({priority,...props})=>{void priority;return createElement('img',props);}},'next/navigation':{useRouter:()=>({refresh(){}})},'@/domain/create':{displayDate},'@/domain/tasks':{allowedTransitions,readiness},'../ui/Primitives':primitives,'../dashboard/CeremonyArt':icon,'./MemberWorkspace.module.css':{default:new Proxy({},{get:(_,key)=>String(key)})}});
const wedding={id:'synthetic',title:'Shared synthetic wedding',city:'Test city',state:'ACTIVE',state_version:'1',wedding_date:'2026-11-30',is_tentative:false};const task={id:'task1',title:'Own assigned work',status:'TO_DO',ceremony_id:null,description:null,due_date:null,owner_name:'Offline contact',prerequisite_task_id:null,completed_at:null,assigned_to_me:true,has_assignee:true,progress_note:null,progress_updated_at:null};const html=(data,view='overview')=>renderToStaticMarkup(createElement(Workspace,{data,view,viewerLabel:'Synthetic Member'}));
test('Shared overview retains recorded wedding date and renders no financial information or Admin actions',()=>{const s=html({wedding:{...wedding,budget_ceiling_paise:'PRIVATE FINANCIAL VALUE'},ceremonies:[],tasks:[task]});assert.match(s,/30 Nov 2026/);assert.match(s,/My Tasks/);assert.match(s,/Synthetic Member/);assert.doesNotMatch(s,/PRIVATE FINANCIAL VALUE|Budget &amp; Payments|Wedding settings|ADAPT approval/);});
test('Only a DB-projected assigned-to-me flag enables status/note forms',()=>{const own=html({wedding,ceremonies:[],tasks:[task]},'tasks');assert.match(own,/aria-label="Update Own assigned work"/);assert.match(own,/Progress note/);const empty=html({wedding,ceremonies:[],tasks:[{...task,assigned_to_me:false,has_assignee:false,owner_name:'Synthetic Member'}]},'tasks');assert.match(empty,/No tasks assigned to you yet/);assert.doesNotMatch(empty,/Save progress/);});
test('Unknown ceremony counts/dates remain truthful and ceremony view contains no mutation form',()=>{const s=html({wedding,ceremonies:[{id:'ceremony',title:'Haldi',guest_count:null,ceremony_date:null}],tasks:[]},'ceremonies');assert.match(s,/Guest count unknown/);assert.match(s,/Date not set/);assert.doesNotMatch(s,/<form/);});
