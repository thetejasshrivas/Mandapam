import test from 'node:test';
import assert from 'node:assert/strict';
import {previewAdapt,parseAdaptRequest,type AdaptSnapshot} from '../src/domain/adapt.ts';
const cost=(id:string,extra:Partial<AdaptSnapshot['costs'][number]>={}):AdaptSnapshot['costs'][number]=>({id,wedding_id:'w',ceremony_id:'reception',title:id,state:'PLANNED',pricing_basis:'PER_GUEST',fixed_estimate_paise:null,per_guest_rate_paise:'15000',commitment_paise:null,actual_paise:null,cancellation_settlement_paise:null,expected_refund_paise:null,archived_at:null,...extra});
const fixture=():AdaptSnapshot=>({schema_version:1,wedding:{id:'w',state:'ACTIVE',state_version:'9007199254740993',wedding_date:'2027-02-14'},ceremony:{id:'reception',wedding_id:'w',title:'Reception',guest_count:300,venue_capacity:320,is_archived:false,ceremony_date:'2027-02-14'},capacity:{value:320,source:'RECORDED'},costs:[cost('Return gifts'),cost('Committed caterer',{state:'COMMITTED',commitment_paise:'20000000'})],tasks:[{id:'task',wedding_id:'w',ceremony_id:'reception',title:'Review gifts',status:'TO_DO',due_date:null,completed_at:null,archived_at:null,dismissed_at:null},{id:'completed',wedding_id:'w',ceremony_id:'reception',title:'Venue booked',status:'COMPLETED',due_date:'2026-10-01',completed_at:'2026-10-01T12:00:00Z',archived_at:null,dismissed_at:null}],protected_records:{task_ids:['task','completed'],cost_item_ids:['Return gifts','Committed caterer'],cash_entry_ids:['earlier-payment']}});
test('A08 reception300→350: exact gift forecasts/delta, capacity30, commitment unchanged',()=>{
 const snapshot=fixture(),copy=structuredClone(snapshot),p=previewAdapt(snapshot,350);
 assert.equal(p.facts.old_count,300);assert.equal(p.facts.new_count,350);assert.equal(p.facts.delta,50);assert.equal(p.estimates[0].before_paise,'4500000');assert.equal(p.estimates[0].after_paise,'5250000');assert.equal(p.estimates[0].delta_paise,'750000');assert.equal(p.estimates[0].rate_paise,'15000');assert.equal(p.capacity_warning?.excess,30);
 assert.equal(p.estimates[1].before_paise,'20000000');assert.equal(p.estimates[1].after_paise,'20000000');assert.equal(p.estimates[1].manual_reconfirmation,true);assert.match(p.assumptions.join(' '),/vendor/i);assert.deepEqual(snapshot,copy);assert.equal(p.facts.base_version,'9007199254740993');assert.deepEqual(p.protected_records.cash_entry_ids,['earlier-payment']);
});
test('unknown rate stays unknown, never a zero delta; capacity optional',()=>{
 const s=fixture();s.costs=[cost('Unknown',{per_guest_rate_paise:null})];s.capacity={value:null,source:'UNKNOWN'};
 const p=previewAdapt(s,350);assert.equal(p.estimates[0].after_paise,null);assert.equal(p.estimates[0].delta_paise,null);assert.ok(p.unknowns.length);assert.equal(p.capacity_warning,null);
});
test('fixed planned and recorded contractual terms are unchanged, including awkward planned commitment',()=>{
 const s=fixture();s.costs=[cost('Fixed',{pricing_basis:'FIXED',per_guest_rate_paise:null,fixed_estimate_paise:'100000'}),cost('Recorded',{commitment_paise:'123456'})];
 const p=previewAdapt(s,350);assert.equal(p.estimates[0].after_paise,'100000');assert.equal(p.estimates[0].delta_paise,'0');assert.equal(p.estimates[0].manual_reconfirmation,true);assert.equal(p.estimates[1].before_paise,p.estimates[1].after_paise);assert.equal(p.estimates[1].recalculated,false);
});
test('only one active ceremony with positive known old/new counts and bounded output',()=>{
 for(const value of [0,-1,10001,3.5,300])assert.throws(()=>previewAdapt(fixture(),value));
 for(const extra of [{guest_count:null},{is_archived:true}]){const s=fixture();Object.assign(s.ceremony,extra);assert.throws(()=>previewAdapt(s,350));}
 const s=fixture();s.wedding.state='DRAFT';assert.throws(()=>previewAdapt(s,350));
 const huge=fixture();huge.costs=[cost('Huge',{per_guest_rate_paise:'1000000000'})];assert.throws(()=>previewAdapt(huge,350));
});
test('existing related task statuses/dates/completions preserved; dismissed never suggested',()=>{
 const s=fixture();s.tasks.push({...s.tasks[0],id:'dismissed',dismissed_at:'now'});const before=structuredClone(s);const p=previewAdapt(s,350);
 assert.deepEqual(p.tasks_to_review.map(t=>t.id),['task','completed']);assert.equal(p.tasks_to_review[1].status,'COMPLETED');assert.equal(p.tasks_to_review[1].due_date,'2026-10-01');assert.deepEqual(s,before);
});
test('forged cross-wedding or ceremony context refused; final/cancelled never extrapolated',()=>{
 const bad=fixture();bad.costs[0].wedding_id='other';assert.throws(()=>previewAdapt(bad,350));
 const badTask=fixture();badTask.tasks[0].wedding_id='other';assert.throws(()=>previewAdapt(badTask,350));
 const s=fixture();s.costs=[cost('Final',{state:'FINAL',actual_paise:'880000'}),cost('Cancelled',{state:'CANCELLED',cancellation_settlement_paise:null})];const p=previewAdapt(s,350);assert.equal(p.estimates[0].after_paise,'880000');assert.equal(p.estimates[1].after_paise,null);assert.ok(p.estimates.every(i=>!i.recalculated));
});
test('request parser allowlists preview/create/reject only, no snapshot/owner/approval injection',()=>{
 const id='17000000-0000-4000-8000-000000000001';assert.deepEqual(parseAdaptRequest({operation:'preview',ceremony_id:id,new_guest_count:'350',capacity:''}),{operation:'preview',ceremony_id:id,new_guest_count:350,capacity:null});
 const create=parseAdaptRequest({operation:'create',ceremony_id:id,new_guest_count:'350',capacity:'320',version:'9007199254740993'});assert.ok('version' in create);assert.equal(create.version,'9007199254740993');
 assert.throws(()=>parseAdaptRequest({operation:'approve',proposal_id:id}));assert.throws(()=>parseAdaptRequest({operation:'preview',ceremony_id:id,new_guest_count:'350',snapshot:{}}));assert.throws(()=>parseAdaptRequest({operation:'preview',ceremony_id:id,new_guest_count:'350',capacity:'0'}));
 assert.deepEqual(parseAdaptRequest({operation:'reject',proposal_id:id}),{operation:'reject',proposal_id:id});
});
