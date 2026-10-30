import test from 'node:test';
import assert from 'node:assert/strict';
import {financePresentation,ratioBasisPoints,formatMobileINR} from '../src/presentation/finance.ts';
import type {CostItem,CashEntry} from '../src/domain/finance.ts';
const item=(id:string,patch:Partial<CostItem>={})=>({id,wedding_id:'w',ceremony_id:null,state:'PLANNED' as const,pricing_basis:'FIXED' as const,fixed_estimate_paise:null,per_guest_rate_paise:null,commitment_paise:null,actual_paise:null,cancellation_settlement_paise:null,expected_refund_paise:null,archived_at:null,...patch,title:id,updated_at:'2026-10-29T00:00:00Z'});
const cash=(id:string,cost:string,amount:string,patch:Partial<CashEntry>={}):CashEntry=>({id,wedding_id:'w',cost_item_id:cost,kind:'PAYMENT',amount_paise:amount,occurred_on:'2026-10-29',status:'POSTED',intent_key:id,note:null,voided_at:null,void_reason:null,...patch});
const model=(items:ReturnType<typeof item>[],entries:CashEntry[]=[],ceiling:string|null='100000')=>financePresentation('w',items,[],entries,ceiling);
test('mobile INR omits only zero fractional paise; preserves cents, signs, unknown and large exact values',()=>{
 assert.equal(formatMobileINR('20000000'),'₹2,00,000');assert.equal(formatMobileINR('20000001'),'₹2,00,000.01');assert.equal(formatMobileINR('0'),'₹0');assert.equal(formatMobileINR(null),'Unknown');assert.equal(formatMobileINR('-10001'),'-₹100.01');assert.equal(formatMobileINR('900719925474099101'),'₹9,00,71,99,25,47,40,991.01');
});
test('obligation chart caps applied cash per record; excess cannot pay another record',()=>{
 const p=model([item('a',{state:'COMMITTED',commitment_paise:'10000'}),item('b',{state:'COMMITTED',commitment_paise:'10000'})],[cash('a','a','15000')]);
 assert.equal(p.obligations,'20000');assert.equal(p.applied,'10000');assert.equal(p.summary.outstanding_known_paise,'10000');assert.equal(p.summary.excess_cash_known_paise,'5000');
 assert.equal(BigInt(p.applied)+BigInt(p.summary.outstanding_known_paise),BigInt(p.obligations));
});
test('planned cash and estimates stay outside confirmed obligations and chart',()=>{
 const p=model([item('a',{fixed_estimate_paise:'70000'})],[cash('a','a','30000')]);
 assert.equal(p.commitments,'0');assert.equal(p.obligations,'0');assert.equal(p.applied,'0');assert.equal(p.unallocatedCash,'30000');assert.equal(p.summary.remaining_budget_paise,'30000');
});
test('current obligations include final and cancellation amounts, not historical commitments',()=>{
 const p=model([item('a',{state:'FINAL',commitment_paise:'50000',actual_paise:'40000'}),item('b',{state:'CANCELLED',commitment_paise:'30000',cancellation_settlement_paise:'10000'}),item('c',{state:'COMMITTED',commitment_paise:'20000'})]);
 assert.equal(p.commitments,'20000');assert.equal(p.obligations,'70000');assert.equal(p.summary.projected_total_known_paise,'70000');
});
test('unknown forecasts and settlements remain explicit; empty is distinct from zero',()=>{
 const p=model([item('a'),item('b',{state:'CANCELLED'})]);
 assert.equal(p.summary.unknown_forecast_count,2);assert.equal(p.summary.unknown_obligation_count,1);assert.equal(p.summary.remaining_budget_paise,null);assert.equal(p.groups[0].unknown,2);
 assert.equal(model([]).summary.empty,true);assert.equal(model([item('zero',{fixed_estimate_paise:'0'})]).summary.empty,false);assert.equal(ratioBasisPoints('0','0'),null);
});
test('refunds and voids reconcile without losing cash history',()=>{
 const p=model([item('a',{state:'COMMITTED',commitment_paise:'10000'})],[cash('pay','a','8000'),cash('refund','a','2000',{kind:'REFUND_RECEIVED'}),cash('void','a','9000',{status:'VOIDED',voided_at:'2026-10-29T00:00:00Z',void_reason:'Wrong entry'})]);
 assert.equal(p.applied,'6000');assert.equal(p.summary.received_refunds_paise,'2000');assert.equal(p.summary.outstanding_known_paise,'4000');assert.equal(p.records[0].ledger.length,3);
});
test('category groups use actual ceremony identity; archived estimates stay excluded',()=>{
 const items=[item('a',{ceremony_id:'c',fixed_estimate_paise:'100'}),item('b',{fixed_estimate_paise:'200'}),item('archived',{fixed_estimate_paise:'999',archived_at:'2026-10-29T00:00:00Z'})];
 const p=financePresentation('w',items,[{id:'c',wedding_id:'w',title:'Reception',guest_count:100,is_archived:false}],[],'1000');
 assert.deepEqual(p.groups.map(g=>[g.title,g.forecast]),[['Reception','100'],['Shared wedding costs','200']]);assert.equal(p.records.length,2);
});
test('exact large paise and over-budget balance survive presentation; ratios only round geometry',()=>{
 const items=Array.from({length:100},(_,i)=>item(String(i),{state:'COMMITTED',commitment_paise:'99999999999'}));const p=model(items,[],'100');
 assert.equal(p.obligations,'9999999999900');assert.equal(p.summary.remaining_budget_paise,'-9999999999800');assert.equal(ratioBasisPoints('1','3'),3333);assert.equal(ratioBasisPoints('200','100'),10000);
});
