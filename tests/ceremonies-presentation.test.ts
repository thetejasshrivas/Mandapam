import test from 'node:test';
import assert from 'node:assert/strict';
import {ceremoniesPresentation} from '../src/presentation/ceremonies.ts';
import type {DraftTask,Ceremony} from '../src/domain/create.ts';
const ceremony=(id:string,patch:Partial<Ceremony>={}):Ceremony=>({id,title:id,ceremony_date:null,guest_count:null,is_archived:false,...patch});
const task=(id:string,patch:Partial<DraftTask>={}):DraftTask=>({id,title:id,ceremony_id:'c',description:null,owner_name:null,due_date:null,status:'TO_DO',template_key:null,prerequisite_task_id:null,archived_at:null,dismissed_at:null,...patch});
test('saved custom ceremonies stay dynamic; archived ceremonies are excluded without editing inputs',()=>{
 const ceremonies=[ceremony('c',{title:'A very long custom celebration title'}),ceremony('archive',{is_archived:true}),ceremony('other')];const before=JSON.stringify(ceremonies);
 const rows=ceremoniesPresentation(ceremonies,[]);assert.deepEqual(rows.map(c=>c.id),['c','other']);assert.equal(rows[0].title,'A very long custom celebration title');assert.equal(JSON.stringify(ceremonies),before);
});
test('ceremony completion excludes shared, other, archived and dismissed work; deferred stays in denominator',()=>{
 const tasks=[task('done',{status:'COMPLETED'}),task('deferred',{status:'DEFERRED'}),task('started',{status:'IN_PROGRESS'}),task('shared',{ceremony_id:null,status:'COMPLETED'}),task('other',{ceremony_id:'x',status:'COMPLETED'}),task('archive',{status:'COMPLETED',archived_at:'2026-10-29T00:00:00Z'}),task('dismiss',{status:'COMPLETED',dismissed_at:'2026-10-29T00:00:00Z'})];
 const row=ceremoniesPresentation([ceremony('c')],tasks)[0];assert.equal(row.progress.total,3);assert.equal(row.progress.completed,1);assert.equal(row.progress.deferred,1);assert.equal(row.progress.percent,33);assert.deepEqual(row.tasks.map(t=>t.id),['done','deferred','started']);
});
test('task-free ceremonies retain unknown date/guest count and null completion, never fictional zero readiness',()=>{
 const row=ceremoniesPresentation([ceremony('c')],[])[0];assert.equal(row.ceremony_date,null);assert.equal(row.guest_count,null);assert.equal(row.progress.percent,null);assert.equal(row.progress.total,0);assert.equal(row.tasks.length,0);assert.deepEqual(ceremoniesPresentation([],[]),[]);
});
test('blocked tasks use existing dependency rules across ceremonies and shared work',()=>{
 const parent=task('parent',{ceremony_id:null,status:'DEFERRED'}),child=task('child',{prerequisite_task_id:'parent'});const row=ceremoniesPresentation([ceremony('c')],[parent,child])[0];assert.equal(row.tasks.length,1);assert.equal(row.tasks[0].readiness.blocked,true);assert.match(row.tasks[0].readiness.reason,/deferred/);
 assert.equal(ceremoniesPresentation([ceremony('c')],[{...parent,status:'COMPLETED'},child])[0].tasks[0].readiness.blocked,false);
});
test('offline task owners are not invented as ceremony owners or collaborator accounts',()=>{
 const row=ceremoniesPresentation([ceremony('c')],[task('a',{owner_name:'Coordinator'}),task('b',{owner_name:'Coordinator'}),task('hidden',{owner_name:'Hidden',dismissed_at:'2026-10-29T00:00:00Z'})])[0];assert.deepEqual(row.offlineOwners,['Coordinator']);assert.equal('owner' in row,false);
});
