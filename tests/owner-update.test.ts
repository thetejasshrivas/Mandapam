import test from 'node:test';
import assert from 'node:assert/strict';
import {ownerUpdate} from '../src/domain/owner-update.ts';
const task=(values:Record<string,unknown>={})=>({id:'1',title:'Review entrance signs',owner_name:'Synthetic Helper',status:'TO_DO',due_date:'2026-10-30',archived_at:null,dismissed_at:null,...values});
test('owner update allowlists visible incomplete task fields; money/private notes/other owners stay out',()=>{
 const result=ownerUpdate('Synthetic Helper',[
  task({description:'Private budget ₹90000; cash received ₹50000',budget_ceiling_paise:'9000000'}),
  task({id:'2',owner_name:'Other Helper',title:'Private other-owner task'}),
  task({id:'3',status:'COMPLETED',title:'Completed task'}),task({id:'4',archived_at:'now',title:'Archived task'}),task({id:'5',dismissed_at:'now',title:'Dismissed task'}),
  task({id:'6',title:'Record payment ₹5000'}),task({id:'7',title:'Check refund settlement'}),task({id:'8',title:'Call +91 99999 88888'})]);
 assert.equal(result.count,1);assert.equal(result.omitted,3);assert.match(result.text,/Review entrance signs.*30 Oct 2026/);
 for(const forbidden of ['90000','50000','5000','Other Helper','other-owner','Completed task','Archived task','Dismissed task','99999','description','budget','cash'])assert.equal(result.text.includes(forbidden),false);
});
test('deferred is incomplete; dates stay date-only and context never leaks prerequisite title',()=>{
 const result=ownerUpdate('Synthetic Helper',[task({status:'DEFERRED',due_date:null}),task({id:'2',status:'IN_PROGRESS',title:'Check welcome board',blocked:true,prerequisite_title:'Other owner private payment ₹1200'})]);
 assert.equal(result.count,2);assert.match(result.text,/Deferred/);assert.match(result.text,/Date not set/);assert.match(result.text,/Waiting for a prerequisite/);assert.doesNotMatch(result.text,/1200|Other owner/);
});
test('no selected owner, missing owner and empty/completed-only owner cannot create a copyable update',()=>{
 for(const [owner,tasks] of [['', [task()]],['Unknown', [task()]],['Synthetic Helper',[task({status:'COMPLETED'})]]] as const){const result=ownerUpdate(owner,[...tasks]);assert.equal(result.count,0);assert.equal(result.text,'');}
});
test('markup/contact/control/financial owner or titles do not enter generated plaintext',()=>{
 for(const title of ['<script>alert(1)</script>','<img src=x onerror=alert(1)>','Budget is 25000','Catering cost 500','खर्च 500','Transfer twenty thousand','Email test@example.invalid','Open https://example.invalid','Review\u202esigns'])assert.equal(ownerUpdate('Synthetic Helper',[task({title})]).count,0);
 for(const owner of ['<script>bad</script>','Helper ₹100','Call 9999988888'])assert.equal(ownerUpdate(owner,[task({owner_name:owner})]).text,'');
});
test('exact owner matching and received order preserve visible scope without broadening it',()=>{
 const result=ownerUpdate('Synthetic Helper',[task({owner_name:'Synthetic Helper Two'}),task({id:'2',title:'Second visible task'}),task({id:'3',title:'First visible task'})]);
 assert.equal(result.count,2);assert.ok(result.text.indexOf('Second visible')<result.text.indexOf('First visible'));
});
