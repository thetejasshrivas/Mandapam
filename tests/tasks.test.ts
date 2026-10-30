import test from 'node:test';
import assert from 'node:assert/strict';
import {readiness,allowedTransitions,parseTaskUpdate,dependencyValid,filterTasks} from '../src/domain/tasks.ts';
const task=(id:string,extra:Record<string,unknown>={})=>({id,ceremony_id:null,title:id,description:null,owner_name:null,due_date:null,status:'TO_DO',template_key:null,prerequisite_task_id:null,dismissed_at:null,archived_at:null,...extra});
test('readiness is derived; missing dates and owners do not prevent work',()=>{
 const a=task('a'),b=task('b',{prerequisite_task_id:'a'});
 assert.equal(readiness(a,[a,b]).ready,true);assert.equal(readiness(b,[a,b]).blocked,true);
 for(const status of ['DEFERRED','IN_PROGRESS','TO_DO'])assert.equal(readiness(b,[{...a,status},b]).blocked,true);
 assert.match(readiness(b,[{...a,status:'DEFERRED'},b]).reason,/Prerequisite deferred/);
 assert.equal(readiness(b,[{...a,status:'COMPLETED'},b]).ready,true);
 assert.equal(readiness(b,[]).blocked,true);
 assert.equal(readiness(b,[{...a,status:'COMPLETED',archived_at:'now'},b]).blocked,true);
 assert.equal(readiness({...b,status:'COMPLETED'},[a,b]).blocked,false);
});
test('status transitions require deliberate reopen and do not store BLOCKED',()=>{
 assert.deepEqual(allowedTransitions('TO_DO'),['IN_PROGRESS','COMPLETED','DEFERRED']);
 assert.deepEqual(allowedTransitions('DEFERRED'),['TO_DO']);
 assert.ok(allowedTransitions('COMPLETED').includes('TO_DO'));
 assert.throws(()=>parseTaskUpdate({operation:'status',status:'BLOCKED'}));
 assert.equal(parseTaskUpdate({operation:'status',status:'COMPLETED',override:'on',confirmed_by:' Relative, reported to coordinator '}).changes.confirmed_by,'Relative, reported to coordinator');
});
test('task validation preserves date-only/null and rejects injected state or identity',()=>{
 assert.deepEqual(parseTaskUpdate({operation:'details',title:' Prep ',owner_name:' Parent ',due_date:''}).changes,{title:'Prep',owner_name:'Parent',due_date:null});
 assert.equal(parseTaskUpdate({operation:'details',title:'Prep',owner_name:'',due_date:'2028-02-29'}).changes.due_date,'2028-02-29');
 assert.throws(()=>parseTaskUpdate({operation:'details',title:'Prep',due_date:'2027-02-29'}));
 assert.throws(()=>parseTaskUpdate({operation:'details',title:'Prep',prerequisite_task_id:'x'}));
 assert.throws(()=>parseTaskUpdate({operation:'archive',confirmed:'yes'}));
 assert.equal(parseTaskUpdate({operation:'archive',confirmed:'on'}).confirmed,true);
});
test('bounded ancestor traversal rejects self/cycles/missing parents and accepts short chains',()=>{
 const a=task('a'),b=task('b',{prerequisite_task_id:'a'}),c=task('c',{prerequisite_task_id:'b'});
 assert.equal(dependencyValid('c','b',[a,b,c]),true);
 assert.equal(dependencyValid('a','a',[a,b,c]),false);
 assert.equal(dependencyValid('a','b',[a,b,c]),false);
 assert.equal(dependencyValid('c','missing',[a,b,c]),false);
 assert.equal(dependencyValid('c','b',[a,b,c],1),false);
});
test('archive/completed lists preserve identities; filters do not make history actionable',()=>{
 const items=[task('a',{owner_name:'Parent'}),task('b',{status:'COMPLETED',owner_name:'Parent'}),task('c',{archived_at:'now'}),task('d',{dismissed_at:'now'})];
 assert.deepEqual(filterTasks(items,'Parent','').map(t=>t.id),['a','b']);
 assert.equal(readiness(items[2],items).ready,false);
 assert.equal(readiness(items[1],items).ready,false);
});
test('active manual additions have no implied dependency or member account',()=>{
 const result=parseTaskUpdate({operation:'add',title:'Shared manual task',owner_name:'',due_date:'',ceremony_id:''});
 assert.equal(result.changes.ceremony_id,null);assert.equal(result.changes.due_date,null);
 assert.throws(()=>parseTaskUpdate({operation:'add',title:'x',ceremony_id:'forged'}));
});
