import test from 'node:test';
import assert from 'node:assert/strict';
import {forecastCost,evaluateCost,summarizeWedding,previewGuestCost,previewCashPost,previewCashVoid,transitionCost,sumPaise,formatINR,inrToPaise,type CostItem,type CashEntry,type FinanceCeremony} from '../src/domain/finance.ts';
const ceremony:FinanceCeremony={id:'ceremony-a',wedding_id:'wedding-a',guest_count:300,is_archived:false};
const cost=(patch:Partial<CostItem>={}):CostItem=>({id:'cost-a',wedding_id:'wedding-a',ceremony_id:'ceremony-a',state:'PLANNED',pricing_basis:'FIXED',fixed_estimate_paise:null,per_guest_rate_paise:null,commitment_paise:null,actual_paise:null,cancellation_settlement_paise:null,expected_refund_paise:null,archived_at:null,...patch});
const entry=(patch:Partial<CashEntry>={}):CashEntry=>({id:'cash-a',wedding_id:'wedding-a',cost_item_id:'cost-a',kind:'PAYMENT',amount_paise:'5000000',occurred_on:'2026-10-27',status:'POSTED',intent_key:'intent-a',note:null,voided_at:null,void_reason:null,...patch});

test('PRD T01: commitment and payment remain separate; no payment double counting',()=>{
 const result=evaluateCost(cost({state:'COMMITTED',commitment_paise:'20000000'}),ceremony,[entry()]);
 assert.equal(result.forecast.amount_paise,'20000000');assert.equal(result.cash.net_cash_paid_paise,'5000000');assert.equal(result.outstanding_paise,'15000000');
});
test('founder-corrected fixture A:2 crore committed,50 lakh paid,1.5 crore outstanding',()=>{
 const result=evaluateCost(cost({state:'COMMITTED',commitment_paise:'2000000000'}),ceremony,[entry({amount_paise:'500000000'})]);
 assert.equal(result.forecast.amount_paise,'2000000000');assert.equal(result.outstanding_paise,'1500000000');assert.equal(formatINR(result.forecast.amount_paise),'₹2,00,00,000.00');
});
test('PLANNED fixed estimate can be zero, but has no authoritative payable obligation',()=>{
 const result=evaluateCost(cost({fixed_estimate_paise:'0'}),ceremony,[]);
 assert.equal(result.forecast.amount_paise,'0');assert.equal(result.obligation.kind,'NONE');assert.equal(result.outstanding_paise,null);
 assert.equal(forecastCost(cost(),ceremony).amount_paise,null);
});
test('PLANNED per-guest formula includes actual rate/count provenance and exact delta',()=>{
 const item=cost({pricing_basis:'PER_GUEST',per_guest_rate_paise:'15000'}),before=forecastCost(item,ceremony),preview=previewGuestCost(item,ceremony,350);
 assert.equal(before.amount_paise,'4500000');assert.deepEqual(before.formula,{rate_paise:'15000',guest_count:300,ceremony_id:'ceremony-a'});
 assert.equal(preview.after_paise,'5250000');assert.equal(preview.delta_paise,'750000');
 assert.equal(previewGuestCost(item,ceremony,250).delta_paise,'-750000');
});
test('fixture C: missing rate produces unknown forecast/delta, never invented zero',()=>{
 const item=cost({pricing_basis:'PER_GUEST'}),result=previewGuestCost(item,ceremony,350);
 assert.equal(result.before_paise,null);assert.equal(result.after_paise,null);assert.equal(result.delta_paise,null);assert.equal(result.reason,'RATE_NOT_RECORDED');
});
test('unknown count and shared per-guest item have no inferred wedding-wide multiplier',()=>{
 const item=cost({pricing_basis:'PER_GUEST',per_guest_rate_paise:'15000'});
 assert.equal(forecastCost(item,{...ceremony,guest_count:null}).amount_paise,null);
 assert.equal(previewGuestCost(item,{...ceremony,guest_count:null},350).delta_paise,null);
 assert.equal(forecastCost({...item,ceremony_id:null},null).amount_paise,null);
 assert.equal(forecastCost(cost({ceremony_id:null,fixed_estimate_paise:'12345'}),null).amount_paise,'12345');
});
test('fixture D: committed fixed amount survives extra guests and requires manual reconfirmation',()=>{
 const item=cost({state:'COMMITTED',pricing_basis:'PER_GUEST',per_guest_rate_paise:'15000',commitment_paise:'20000000'}),original=structuredClone(item);
 const result=previewGuestCost(item,ceremony,350);assert.equal(result.before_paise,'20000000');assert.equal(result.after_paise,'20000000');assert.equal(result.delta_paise,'0');assert.equal(result.manual_reconfirmation,true);assert.deepEqual(item,original);
});
test('FINAL uses actual only; historical commitment and guest changes do not add spending',()=>{
 const item=cost({state:'FINAL',commitment_paise:'20000000',actual_paise:'17500000'}),result=evaluateCost(item,ceremony,[entry()]);
 assert.equal(result.forecast.amount_paise,'17500000');assert.equal(result.outstanding_paise,'12500000');assert.equal(previewGuestCost(item,ceremony,350).delta_paise,'0');
});
test('fixture B: cancelled advance is cash, settlement is recognized cost, expected refund is informational',()=>{
 const item=cost({state:'CANCELLED',commitment_paise:'10000000',cancellation_settlement_paise:'1500000',expected_refund_paise:'2500000'});
 const before=evaluateCost(item,ceremony,[entry({amount_paise:'4000000'})]);
 assert.equal(before.forecast.amount_paise,'1500000');assert.equal(before.cash.net_cash_paid_paise,'4000000');assert.equal(before.excess_cash_paise,'2500000');assert.equal(before.expected_refund_paise,'2500000');assert.equal(before.cash.received_refunds_paise,'0');
 const after=evaluateCost(item,ceremony,[entry({amount_paise:'4000000'}),entry({id:'refund-a',intent_key:'refund-intent',kind:'REFUND_RECEIVED',amount_paise:'2500000'})]);
 assert.equal(after.forecast.amount_paise,'1500000');assert.equal(after.cash.net_cash_paid_paise,'1500000');assert.equal(after.excess_cash_paise,'0');assert.equal(after.cash.received_refunds_paise,'2500000');
});
test('unknown cancellation settlement stays unknown even when historical actual/payment is known',()=>{
 const result=evaluateCost(cost({state:'CANCELLED',commitment_paise:'10000000',actual_paise:'9000000'}),ceremony,[entry()]);
 assert.equal(result.forecast.amount_paise,null);assert.equal(result.obligation.kind,'UNKNOWN');assert.equal(result.outstanding_paise,null);assert.equal(result.excess_cash_paise,null);assert.equal(result.cash.net_cash_paid_paise,'5000000');
});
test('overpayment has zero outstanding and separate excess, never a negative payable',()=>{
 const result=evaluateCost(cost({state:'COMMITTED',commitment_paise:'5000000'}),ceremony,[entry({amount_paise:'6000000'})]);
 assert.equal(result.outstanding_paise,'0');assert.equal(result.excess_cash_paise,'1000000');
});
test('excess at one vendor does not offset another vendor obligation',()=>{
 const items=[cost({state:'COMMITTED',commitment_paise:'5000000'}),cost({id:'cost-b',state:'COMMITTED',commitment_paise:'2000000'})];
 const result=summarizeWedding('wedding-a',items,[ceremony],[entry({amount_paise:'6000000'})],null);
 assert.equal(result.outstanding_known_paise,'2000000');assert.equal(result.excess_cash_known_paise,'1000000');assert.equal(result.projected_total_known_paise,'7000000');
});
test('PLANNED pre-commitment cash is a reconciliation warning rather than an invented obligation',()=>{
 const result=evaluateCost(cost({fixed_estimate_paise:'10000000'}),ceremony,[entry()]);
 assert.equal(result.outstanding_paise,null);assert.equal(result.excess_cash_paise,null);assert.ok(result.warnings.includes('PRECOMMITMENT_CASH_RECONCILIATION'));
});
test('VOIDED correction keeps original row, excludes it and includes replacement only',()=>{
 const item=cost({state:'COMMITTED',commitment_paise:'20000000'}),ledger=[entry()];
 const voided=previewCashVoid(item,ledger,'cash-a','Wrong amount','2026-10-27T10:00:00Z');
 const corrected=previewCashPost(item,voided.entries,entry({id:'cash-b',intent_key:'intent-b',amount_paise:'4000000'}));
 assert.equal(corrected.entries.length,2);assert.equal(corrected.entries[0].status,'VOIDED');assert.equal(corrected.entries[0].amount_paise,'5000000');assert.equal(ledger[0].status,'POSTED');
 assert.equal(evaluateCost(item,ceremony,corrected.entries).cash.net_cash_paid_paise,'4000000');
});
test('approved DEC-003: payment void after refund fails; correcting refund first is safe',()=>{
 const item=cost(),ledger=[entry(),entry({id:'refund-a',intent_key:'refund-intent',kind:'REFUND_RECEIVED',amount_paise:'2000000'})],original=structuredClone(ledger);
 assert.throws(()=>previewCashVoid(item,ledger,'cash-a','Wrong payment','2026-10-27T10:00:00Z'),/refund/i);assert.deepEqual(ledger,original);
 const refundsCorrected=previewCashVoid(item,ledger,'refund-a','Wrong refund','2026-10-27T10:00:00Z');
 const paymentsCorrected=previewCashVoid(item,refundsCorrected.entries,'cash-a','Wrong payment','2026-10-27T10:01:00Z');
 assert.equal(evaluateCost(item,ceremony,paymentsCorrected.entries).cash.net_cash_paid_paise,'0');
});
test('received refunds above posted payments are rejected, never clamped',()=>{
 assert.throws(()=>evaluateCost(cost(),ceremony,[entry({kind:'REFUND_RECEIVED',amount_paise:'1'})]),/refund/i);
 assert.throws(()=>evaluateCost(cost(),ceremony,[entry({amount_paise:'100'}),entry({id:'refund-a',intent_key:'refund-intent',kind:'REFUND_RECEIVED',amount_paise:'101'})]),/refund/i);
});
test('stable intent retry differs from intentional equal payments and conflicting retries',()=>{
 const item=cost(),ledger=[entry()];assert.equal(previewCashPost(item,ledger,entry({id:'new-generated-id'})).replayed,true);
 const intentional=previewCashPost(item,ledger,entry({id:'cash-b',intent_key:'intent-b'}));assert.equal(intentional.entries.length,2);assert.equal(evaluateCost(item,ceremony,intentional.entries).cash.gross_paid_paise,'10000000');
 assert.throws(()=>previewCashPost(item,ledger,entry({amount_paise:'1'})),/intent/i);
 assert.throws(()=>previewCashPost(item,ledger,entry({note:'different note'})),/intent/i);
 assert.throws(()=>evaluateCost(item,ceremony,[entry(),entry()]));
});
test('retrying a void or a post whose original was voided does not restore cash',()=>{
 const item=cost(),first=previewCashVoid(item,[entry()],'cash-a','Wrong amount','2026-10-27T10:00:00Z');
 assert.equal(previewCashVoid(item,first.entries,'cash-a','Retry','2026-10-27T10:01:00Z').replayed,true);
 const retry=previewCashPost(item,first.entries,entry({id:'new-generated-id'}));assert.equal(retry.replayed,true);assert.equal(retry.entries[0].status,'VOIDED');
});
test('partial known subtotal cannot become definitive remaining budget; explicit zero stays known',()=>{
 const items=[cost({fixed_estimate_paise:'100'}),cost({id:'cost-b',pricing_basis:'PER_GUEST'})];
 const partial=summarizeWedding('wedding-a',items,[ceremony],[],'1000');assert.equal(partial.projected_total_known_paise,'100');assert.equal(partial.unknown_forecast_count,1);assert.equal(partial.projected_total_completeness,'PARTIAL');assert.equal(partial.remaining_budget_paise,null);
 const zero=summarizeWedding('wedding-a',[cost({fixed_estimate_paise:'0'})],[ceremony],[],'0');assert.equal(zero.projected_total_completeness,'COMPLETE');assert.equal(zero.remaining_budget_paise,'0');
 const over=summarizeWedding('wedding-a',[cost({fixed_estimate_paise:'1001'})],[ceremony],[],'1000');assert.equal(over.remaining_budget_paise,'-1');
 assert.equal(summarizeWedding('wedding-a',[items[0]],[ceremony],[],null).remaining_budget_paise,null);
});
test('archived planned estimate excluded; cash/history cannot disappear through archival',()=>{
 const item=cost({fixed_estimate_paise:'100',archived_at:'2026-10-27T10:00:00Z'}),summary=summarizeWedding('wedding-a',[item],[ceremony],[],null);
 assert.equal(summary.item_count,0);assert.equal(summary.empty,true);assert.equal(summary.projected_total_known_paise,'0');
 assert.throws(()=>summarizeWedding('wedding-a',[item],[ceremony],[entry()],null),/archiv/i);
});
test('cross-wedding/cost/ceremony references are invalid even for voided or shared rows',()=>{
 assert.throws(()=>evaluateCost(cost(),{...ceremony,wedding_id:'wedding-b'},[]));
 assert.throws(()=>evaluateCost(cost(),ceremony,[entry({wedding_id:'wedding-b'})]));
 assert.throws(()=>evaluateCost(cost(),ceremony,[entry({cost_item_id:'cost-b'})]));
 assert.throws(()=>forecastCost(cost({ceremony_id:null}),ceremony));
 assert.throws(()=>summarizeWedding('wedding-a',[cost({wedding_id:'wedding-b'})],[ceremony],[],null));
 assert.throws(()=>summarizeWedding('wedding-a',[cost()],[{...ceremony,id:'other'}],[],null));
});
test('state transitions preserve historical amounts and disallow silent final/cancelled reversal/correction',()=>{
 const planned=cost(),committed=transitionCost(planned,'COMMITTED','20000000'),final=transitionCost(committed,'FINAL','17500000');
 assert.equal(final.commitment_paise,'20000000');assert.equal(final.actual_paise,'17500000');assert.equal(planned.commitment_paise,null);
 assert.equal(transitionCost(committed,'CANCELLED',null).cancellation_settlement_paise,null);
 assert.throws(()=>transitionCost(final,'CANCELLED','0'));assert.throws(()=>transitionCost(cost({state:'CANCELLED'}),'PLANNED',null));
 assert.throws(()=>transitionCost(planned,'COMMITTED',null));assert.throws(()=>transitionCost(committed,'COMMITTED','1'));
});
test('exact text transport/arithmetic beyond JS safe integer; JSON contains no BigInt',()=>{
 assert.equal(sumPaise(['9007199254740993','2']),'9007199254740995');assert.equal(JSON.parse(JSON.stringify({total:sumPaise(['9007199254740993','2'])})).total,'9007199254740995');
 assert.equal(inrToPaise('0.29'),'29');assert.equal(inrToPaise('1000000000.00'),'100000000000');assert.equal(formatINR('1'),'₹0.01');assert.equal(formatINR('-1'),'-₹0.01');assert.equal(formatINR(null),'Unknown');
 assert.doesNotThrow(()=>JSON.stringify(evaluateCost(cost(),ceremony,[])));
});
test('bounds and invalid numeric transport fail explicitly instead of rounding/wrapping',()=>{
 assert.throws(()=>sumPaise(['9223372036854775807','1']));assert.throws(()=>sumPaise([null as unknown as string]));
 for(const value of [0,0.1,NaN,Infinity,'1.1','-1','01','1e3','100000000001'])assert.throws(()=>forecastCost(cost({fixed_estimate_paise:value as unknown as string}),ceremony));
 assert.throws(()=>inrToPaise('1.005'));assert.throws(()=>inrToPaise(0.29));
 assert.throws(()=>forecastCost(cost({pricing_basis:'PER_GUEST',per_guest_rate_paise:'100000000000'}),ceremony));
 for(const count of [0,-1,1.5,10001,Number.MAX_SAFE_INTEGER])assert.throws(()=>previewGuestCost(cost(),ceremony,count));
});
test('cash amounts must be positive, dates valid, void metadata explicit and IDs unique',()=>{
 for(const amount of ['0','-1','1.5'])assert.throws(()=>evaluateCost(cost(),ceremony,[entry({amount_paise:amount})]));
 assert.throws(()=>evaluateCost(cost(),ceremony,[entry({occurred_on:'2027-02-29'})]));
 assert.throws(()=>evaluateCost(cost(),ceremony,[entry({status:'VOIDED'})]));
 assert.throws(()=>previewCashVoid(cost(),[entry()],'cash-a','','2026-10-27T10:00:00Z'));
 assert.throws(()=>previewCashVoid(cost(),[entry()],'cash-a','wrong','2026-10-27'));
});
test('archived cost items cannot accept post/void candidate mutations',()=>{
 const item=cost({archived_at:'2026-10-27T10:00:00Z'});
 assert.throws(()=>previewCashPost(item,[],entry()),/archiv/i);
 assert.throws(()=>previewCashVoid(item,[entry()],'cash-a','Wrong entry','2026-10-27T10:00:00Z'),/archiv/i);
});
test('fully refunded pre-commitment cash still carries a reconciliation warning',()=>{
 const result=evaluateCost(cost(),ceremony,[entry({amount_paise:'100'}),entry({id:'refund-a',intent_key:'refund-intent',kind:'REFUND_RECEIVED',amount_paise:'100'})]);
 assert.equal(result.cash.net_cash_paid_paise,'0');assert.ok(result.warnings.includes('PRECOMMITMENT_CASH_RECONCILIATION'));
});
test('zero rate is known only with known applicable count; missing recorded obligations stay unknown',()=>{
 const item=cost({pricing_basis:'PER_GUEST',per_guest_rate_paise:'0'});
 assert.equal(forecastCost(item,ceremony).amount_paise,'0');assert.equal(forecastCost(item,{...ceremony,guest_count:null}).amount_paise,null);
 for(const state of ['COMMITTED','FINAL'] as const){const result=evaluateCost(cost({state}),ceremony,[]);assert.equal(result.forecast.amount_paise,null);assert.equal(result.outstanding_paise,null);}
 const unknown=summarizeWedding('wedding-a',[cost({state:'CANCELLED'})],[ceremony],[],null);assert.equal(unknown.unknown_obligation_count,1);
 assert.equal(evaluateCost(cost(),ceremony,[]).expected_refund_paise,null);assert.equal(evaluateCost(cost({expected_refund_paise:'0'}),ceremony,[]).expected_refund_paise,'0');
});
test('large paise formatting remains exact and empty register is explicitly labeled',()=>{
 assert.equal(formatINR('9007199254740993'),'₹9,00,71,99,25,47,409.93');
 const empty=summarizeWedding('wedding-a',[],[],[],'100');assert.equal(empty.empty,true);assert.equal(empty.item_count,0);assert.equal(empty.projected_total_known_paise,'0');
});
