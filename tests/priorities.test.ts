import test from 'node:test';
import assert from 'node:assert/strict';
import {rankActions,istDate,financialDueItems} from '../src/domain/priorities.ts';
import {dependencyValid} from '../src/domain/tasks.ts';
const task=(id:string,extra:Record<string,unknown>={})=>({id,ceremony_id:null,title:id,description:null,owner_name:null,due_date:null,status:'TO_DO',template_key:null,prerequisite_task_id:null,dismissed_at:null,archived_at:null,created_at:'2026-10-01T00:00:00Z',...extra});
const ids=(tasks:ReturnType<typeof task>[])=>rankActions(tasks,'2026-10-27').actions.map(a=>a.task.id);
test('only up to three retained ready tasks; no fabricated filler',()=>{
 const tasks=[task('done',{status:'COMPLETED'}),task('deferred',{status:'DEFERRED'}),task('archived',{archived_at:'now'}),task('dismissed',{dismissed_at:'now'}),task('ready',{status:'IN_PROGRESS'})];
 assert.deepEqual(ids(tasks),['ready']);assert.equal(rankActions(tasks,'2026-10-27').actions.length,1);
 assert.deepEqual(ids([task('a'),task('b'),task('c'),task('d')]),['a','b','c']);
});
test('date precedence beats unlock counts; undated last; no score',()=>{
 const tasks=[task('undated'),task('tomorrow',{due_date:'2026-10-28'}),task('today',{due_date:'2026-10-27'}),task('overdue',{due_date:'2026-10-26'}),task('oldest',{due_date:'2026-10-25'}),task('dependent',{prerequisite_task_id:'tomorrow'})];
 assert.deepEqual(ids(tasks),['oldest','overdue','today']);
 assert.deepEqual(ids([tasks[0],tasks[1],tasks[2]]),['today','tomorrow','undated']);
 assert.match(rankActions(tasks,'2026-10-27').actions[0].reason,/Overdue/);
});
test('direct incomplete retained dependents only break equal dates, never transitive',()=>{
 const tasks=[task('a'),task('b'),task('child',{prerequisite_task_id:'b'}),task('grandchild',{prerequisite_task_id:'child'}),task('ignored',{prerequisite_task_id:'a',status:'COMPLETED'}),task('removed',{prerequisite_task_id:'a',archived_at:'now'})];
 assert.deepEqual(ids(tasks),['b','a']);assert.equal(rankActions(tasks,'2026-10-27').actions[0].directUnlocks,1);
});
test('created instant then UUID is reproducible across input permutations and timezones',()=>{
 const tasks=[task('b'),task('a'),task('earlier',{created_at:'2026-10-01T04:00:00+05:30'})];
 assert.deepEqual(ids(tasks),['earlier','a','b']);assert.deepEqual(ids([...tasks].reverse()),ids(tasks));
 assert.deepEqual(ids([task('b',{created_at:'2026-10-01T05:30:00+05:30'}),task('a')]),['a','b']);
});
test('all completed and all blocked have honest separate empty states and prerequisite identity',()=>{
 assert.equal(rankActions([task('done',{status:'COMPLETED'})],'2026-10-27').empty,'No actionable tasks.');
 const result=rankActions([task('parent',{status:'DEFERRED',title:'Confirm venue'}),task('child',{prerequisite_task_id:'parent'})],'2026-10-27');
 assert.equal(result.actions.length,0);assert.match(result.empty!,/prerequisite/);assert.match(result.blocked[0].reason,/Confirm venue/);assert.match(result.blocked[0].reason,/DEFERRED/);
 for(const parent of [task('parent',{status:'COMPLETED',archived_at:'now'}),task('parent',{dismissed_at:'now'})])assert.equal(rankActions([parent,task('child',{prerequisite_task_id:'parent'})],'2026-10-27').blocked.length,1);
 assert.match(rankActions([task('orphan',{prerequisite_task_id:'missing'})],'2026-10-27').blocked[0].reason,/unavailable/i);
});
test('IST midnight boundary is overdue only on the next calendar date',()=>{
 assert.equal(istDate(new Date('2026-10-27T18:29:59Z')),'2026-10-27');assert.equal(istDate(new Date('2026-10-27T18:30:00Z')),'2026-10-28');
 const tasks=[task('a',{due_date:'2026-10-27'})];
 assert.match(rankActions(tasks,istDate(new Date('2026-10-27T18:29:59Z'))).actions[0].reason,/Due today/);
 assert.match(rankActions(tasks,istDate(new Date('2026-10-27T18:30:00Z'))).actions[0].reason,/Overdue/);
});
test('fresh persisted prerequisite completion refreshes actions without mutating source',()=>{
 const tasks=[task('parent'),task('child',{prerequisite_task_id:'parent'})],before=structuredClone(tasks);
 assert.deepEqual(ids(tasks),['parent']);assert.deepEqual(ids(tasks.map(t=>t.id==='parent'?{...t,status:'COMPLETED'}:t)),['child']);assert.deepEqual(tasks,before);
 assert.equal(dependencyValid('parent','child',tasks),false);assert.equal(dependencyValid('parent','parent',tasks),false);
});
test('recorded payment dates remain separate, sorted, without inferred deadlines or tasks',()=>{
 const rows=[{id:'b',title:'Band',payment_due_date:'2026-11-02',archived_at:null},{id:'a',title:'Venue',payment_due_date:'2026-10-28',archived_at:null},{id:'unknown',title:'Unknown',payment_due_date:null,archived_at:null},{id:'archived',title:'Archived',payment_due_date:'2026-10-01',archived_at:'now'}];
 assert.deepEqual(financialDueItems(rows).map(r=>r.id),['a','b']);assert.deepEqual(financialDueItems([]),[]);
});

test('timestamp tie-break input must carry timezone; missing/invalid dates fail explicitly',()=>{
 for(const created_at of [undefined,'not-a-time','2026-10-01T00:00:00'])assert.throws(()=>rankActions([task('a',{created_at})],'2026-10-27'));
 assert.throws(()=>rankActions([task('a',{due_date:'2026-02-30'})],'2026-10-27'));
 assert.throws(()=>rankActions([task('a')],''));
});
