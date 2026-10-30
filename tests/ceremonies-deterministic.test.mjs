// Deterministic component logic verification, NOT DOM/browser integration.
// Follows ceremonies-route.test.mjs: execute transpiled current source with boundary fakes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const wedding='00000000-0000-4000-8000-000000000032';
const ceremony=(id)=>({id,title:`Ceremony ${id}`,ceremony_date:null,guest_count:null,is_archived:false});
const task=(id,ceremony_id,extra={})=>({id,ceremony_id,title:`Saved task ${id}`,description:null,owner_name:null,due_date:null,status:'TO_DO',template_key:null,prerequisite_task_id:null,archived_at:null,dismissed_at:null,...extra});
const data={wedding:{id:wedding,title:'Synthetic verification',state:'ACTIVE',state_version:'32'},ceremonies:[ceremony('a'),ceremony('b')],tasks:[task('saved-a','a'),task('saved-b','b'),task('shared',null),task('hidden','a',{archived_at:'2026-10-29'}),task('dismissed','a',{dismissed_at:'2026-10-29'})]};
const original=JSON.stringify(data);
function nodes(tree){if(Array.isArray(tree))return tree.flatMap(nodes);if(!tree||typeof tree!=='object'||!tree.props)return [];return [tree,...nodes(tree.props.children)];}
function one(tree,predicate){const found=nodes(tree).filter(predicate);assert.equal(found.length,1);return found[0];}
function runtime({mobile=false,hash='',mutation=process.env.WP32C2_NEGATIVE}={}){
 let cursor=0;const slots=[],effects=[],listeners=new Map(),calls=[];
 const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},useRef(initial){const i=cursor++;return slots[i]??=( {current:initial});},useEffect(fn){effects.push(fn);},useTransition(){return [false,fn=>fn()];}};
 const window={matchMedia:()=>({matches:mobile}),location:{hash},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name)=>listeners.delete(name)};
 const document={addEventListener(){},removeEventListener(){}};
 const cache=new Map(),Link=()=>null,Active=()=>null;
 function load(file){file=resolve(file);if(cache.has(file))return cache.get(file).exports;let source=readFileSync(file,'utf8');
  if(mutation==='focus'&&file.endsWith('CeremoniesWorkspace.tsx'))source=source.replace('select(e.target.value,false)','select(e.target.value,true)');
  if(mutation==='fragment'&&file.endsWith('ActiveTasks.tsx'))source=source.replace("slice(6)","slice(7)");
  const loadedModule={exports:{}};cache.set(file,loadedModule);
  const mocked={react,'next/link':{default:Link},'next/image':{default:()=>null},'next/navigation':{useRouter:()=>({refresh(){}})},'@/components/tasks/ActiveTasks':{default:Active}};
  const localRequire=name=>{
   if(Object.hasOwn(mocked,name))return mocked[name];
   if(/CeremonyArt|\/Icon$|Primitives|OwnerUpdate|TaskDetail|AppShell/.test(name))return {default:()=>null,StatusBadge:()=>null,StateMessage:()=>null,timestamp:()=>''};
   if(name.startsWith('@/')||name.startsWith('.')){const p=name.startsWith('@/')?resolve('src',name.slice(2)):resolve(dirname(file),name);for(const ext of ['', '.ts','.tsx'])if(existsSync(p+ext))return load(p+ext);}
   return require(name);
  };
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports','window','document','setInterval','clearInterval',js)(localRequire,loadedModule,loadedModule.exports,window,document,()=>0,()=>{});
  return loadedModule.exports;
 }
 return {load,Link,window,listeners,calls,render(Component){cursor=0;effects.length=0;return Component({data});},effects,heading(tree){one(tree,n=>n.props.id==='cp-selected-title').props.ref.current={focus:options=>calls.push(['focus',options]),scrollIntoView:options=>calls.push(['scroll',options])};}};
}
test('A: native ceremony select updates selected heading, card and saved-task list without desktop focus transfer',()=>{
 const r=runtime(),Component=r.load('src/components/ceremonies/CeremoniesWorkspace.tsx').default;
 let tree=r.render(Component);r.heading(tree);
 const chooser=one(tree,n=>n.type==='select');assert.equal(chooser.props['aria-label'],'Choose ceremony');assert.equal(chooser.props['aria-controls'],'cp-selected-title');assert.equal(chooser.props.role,undefined);assert.equal(chooser.props.disabled,undefined);
 assert.deepEqual(nodes(chooser).filter(n=>n.type==='option').map(n=>n.props.value),['a','b']);
 assert.equal(chooser.props.value,'a');chooser.props.onChange({target:{value:'b'}});tree=r.render(Component);
 assert.equal(one(tree,n=>n.type==='select').props.value,'b');assert.equal(one(tree,n=>n.props.id==='cp-selected-title').props.children,'Ceremony b');
 assert.equal(one(tree,n=>n.props['data-ceremony-id']==='b').props.className,'cp-card is-selected');
 assert.deepEqual(nodes(tree).filter(n=>n.props['data-ceremony-task']).map(n=>n.props['data-ceremony-task']),['saved-b']);assert.deepEqual(r.calls,[]);
 assert.equal(one(tree,n=>n.props.id==='cp-selected-title').props.tabIndex,-1);assert.equal(JSON.stringify(data),original);
});
test('A: desktop card and mobile select request heading focus; only mobile requests scroll (API fakes, not DOM focus)',()=>{
 for(const mobile of [false,true]){const r=runtime({mobile}),Component=r.load('src/components/ceremonies/CeremoniesWorkspace.tsx').default;const tree=r.render(Component);r.heading(tree);
 if(mobile)one(tree,n=>n.type==='select').props.onChange({target:{value:'b'}});else one(tree,n=>n.type==='button'&&n.props['aria-label']==='View ceremony: Ceremony b').props.onClick();
 assert.deepEqual(r.calls,mobile?[['scroll',{block:'start',behavior:'instant'}],['focus',{preventScroll:true}]]:[['focus',{preventScroll:true}]]);
 assert.equal(one(r.render(Component),n=>n.props.id==='cp-selected-title').props.children,'Ceremony b');}
});
test('B: actual ceremony links use saved IDs and actual Tasks fragment effect selects matching retained task on mount and hashchange',()=>{
 const r=runtime(),Ceremonies=r.load('src/components/ceremonies/CeremoniesWorkspace.tsx').default;
 const tree=r.render(Ceremonies),link=one(tree,n=>n.type===r.Link&&n.props.href?.includes('#task-'));
 assert.equal(link.props.children,'Saved task saved-a');assert.equal(link.props.href,`/workspace/${wedding}/tasks#task-saved-a`);
 const url=new URL(link.props.href,'http://fixture.invalid');r.window.location.hash=url.hash;
 const Tasks=r.load('src/components/tasks/ActiveTasks.tsx').default;let tasks=r.render(Tasks);const cleanups=r.effects.map(fn=>fn());tasks=r.render(Tasks);
 const detail=one(tasks,n=>n.type==='dialog'&&n.props.className==='tp-detail');assert.equal(one(detail,n=>n.props.id==='tp-detail-title').props.children[1],'Saved task saved-a');
 r.window.location.hash='#task-saved-b';r.listeners.get('hashchange')();tasks=r.render(Tasks);assert.equal(one(tasks,n=>n.props.id==='tp-detail-title').props.children[1],'Saved task saved-b');
 for(const cleanup of cleanups)if(typeof cleanup==='function')cleanup();assert.equal(r.listeners.has('hashchange'),false);assert.equal(JSON.stringify(data),original);
});
test('B: missing, archived, dismissed and unrelated fragments do not select a task',()=>{
 for(const hash of ['#task-missing','#task-hidden','#task-dismissed','#other-saved-a']){const r=runtime({hash}),Tasks=r.load('src/components/tasks/ActiveTasks.tsx').default;r.render(Tasks);const cleanups=r.effects.map(fn=>fn());const tree=r.render(Tasks);assert.equal(one(tree,n=>n.type==='dialog'&&n.props.className==='tp-detail').props.children,null);for(const cleanup of cleanups)if(typeof cleanup==='function')cleanup();}
});
test('B: actual ACTIVE Tasks route mounts the existing ActiveTasks with the same loaded saved data',async()=>{
 const loadedModule={exports:{}},Active=()=>null,Shell=()=>null;
 const source=readFileSync('src/app/workspace/[weddingId]/tasks/page.tsx','utf8');
 const mocks={'next/link':{default:()=>null},'next/navigation':{redirect:()=>assert.fail('unexpected redirect'),notFound:()=>assert.fail('unexpected404')},'@/server/auth/weddings':{accountContext:async()=>({client:{},user:{id:'synthetic-owner'}})},'@/server/auth/policy':{uuid:/^[0-9a-f-]{36}$/},'@/server/create':{loadDraft:async()=>({data,error:null})},'@/components/shell/AppShell':{default:Shell},'@/components/tasks/ActiveTasks':{default:Active}};
 mocks['@/components/members/MemberPlanning']={renderMemberPlanning:()=>assert.fail('Owner route must not fall back to Member planning')};
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',js)(name=>Object.hasOwn(mocks,name)?mocks[name]:require(name),loadedModule,loadedModule.exports);
 const result=await loadedModule.exports.default({params:Promise.resolve({weddingId:wedding})});
 assert.equal(result.type,Shell);assert.equal(result.props.children.type,Active);assert.equal(result.props.children.props.data,data);
});
