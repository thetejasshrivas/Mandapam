import test from 'node:test';
import assert from 'node:assert/strict';
import {rankActions} from '../src/domain/priorities.ts';
test('Postgres microsecond creation timestamps precede UUID final tie',()=>{
 const task=(id:string,created_at:string)=>({id,created_at,ceremony_id:null,title:id,description:null,owner_name:null,due_date:null,status:'TO_DO',template_key:null,prerequisite_task_id:null,dismissed_at:null,archived_at:null});
 assert.deepEqual(rankActions([task('a','2026-10-01T00:00:00.000002Z'),task('z','2026-10-01T00:00:00.000001Z')],'2026-10-27').actions.map(a=>a.task.id),['z','a']);
});
