// Pure INR ledger math. Boundary money is decimal-text paise/null, never Number.
import {calendarDate,toPaise} from './create.ts';
export {toPaise as inrToPaise};
export const MAX_ITEM_PAISE=100000000000n;
export const MAX_TOTAL_PAISE=9223372036854775807n;
export type CostState='PLANNED'|'COMMITTED'|'FINAL'|'CANCELLED';
export type CostItem={id:string;wedding_id:string;ceremony_id:string|null;state:CostState;pricing_basis:'FIXED'|'PER_GUEST';fixed_estimate_paise:string|null;per_guest_rate_paise:string|null;commitment_paise:string|null;actual_paise:string|null;cancellation_settlement_paise:string|null;expected_refund_paise:string|null;archived_at:string|null};
export type FinanceCeremony={id:string;wedding_id:string;guest_count:number|null;is_archived:boolean};
export type CashEntry={id:string;wedding_id:string;cost_item_id:string;kind:'PAYMENT'|'REFUND_RECEIVED';amount_paise:string;occurred_on:string;status:'POSTED'|'VOIDED';intent_key:string;note:string|null;voided_at:string|null;void_reason:string|null};
export type Forecast={amount_paise:string|null;reason:string;formula:{rate_paise:string;guest_count:number;ceremony_id:string}|null};
const states:CostState[]=['PLANNED','COMMITTED','FINAL','CANCELLED'];
const amountFields=['fixed_estimate_paise','per_guest_rate_paise','commitment_paise','actual_paise','cancellation_settlement_paise','expected_refund_paise'] as const;
function integer(value:unknown,limit=MAX_TOTAL_PAISE):bigint {
 if(typeof value!=='string'||value.length>19||!/^(0|[1-9]\d*)$/.test(value))throw Error('Use canonical nonnegative decimal-text paise.');
 const amount=BigInt(value);if(amount>limit)throw Error('Paise bound exceeded.');return amount;
}
function money(value:unknown):bigint|null {return value===null?null:integer(value,MAX_ITEM_PAISE);}
function add(a:bigint,b:bigint):bigint {const result=a+b;if(result>MAX_TOTAL_PAISE||result< -MAX_TOTAL_PAISE)throw Error('Aggregate paise bound exceeded.');return result;}
function id(value:unknown) {if(typeof value!=='string'||!value||value!==value.trim())throw Error('Invalid reference.');}
function count(value:unknown):number {if(typeof value!=='number'||!Number.isInteger(value)||value<1||value>10000)throw Error('Guest count must be an integer1–10000.');return value;}
function instant(value:unknown) {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))throw Error('Use an explicit timestamp with timezone.');
 calendarDate(value.slice(0,10));
}
function validateCost(item:CostItem) {
 id(item.id);id(item.wedding_id);if(item.ceremony_id!==null)id(item.ceremony_id);
 if(!states.includes(item.state)||!['FIXED','PER_GUEST'].includes(item.pricing_basis))throw Error('Unsupported financial state or pricing basis.');
 for(const field of amountFields)money(item[field]);
 if(item.pricing_basis==='FIXED'&&item.per_guest_rate_paise!==null||item.pricing_basis==='PER_GUEST'&&item.fixed_estimate_paise!==null)throw Error('Pricing basis has conflicting estimate inputs.');
 if(item.archived_at!==null)instant(item.archived_at);
}
function validateCeremony(item:CostItem,ceremony:FinanceCeremony|null) {
 if(!ceremony)return;
 id(ceremony.id);id(ceremony.wedding_id);
 if(ceremony.id!==item.ceremony_id||ceremony.wedding_id!==item.wedding_id)throw Error('Ceremony must belong to this item and wedding.');
 if(ceremony.guest_count!==null)count(ceremony.guest_count);
 if(typeof ceremony.is_archived!=='boolean')throw Error('Invalid ceremony archive state.');
}
export function sumPaise(values:readonly string[]):string {return values.reduce((total,value)=>add(total,integer(value)),0n).toString();}
export function formatINR(value:unknown):string {
 if(value===null)return 'Unknown';
 if(typeof value!=='string'||! /^-?(0|[1-9]\d*)$/.test(value)||value==='-0')throw Error('Use signed decimal-text paise.');
 const negative=value.startsWith('-'),amount=integer(negative?value.slice(1):value),whole=(amount/100n).toString(),last=whole.slice(-3),prefix=whole.slice(0,-3);
 const grouped=prefix?prefix.replace(/\B(?=(\d{2})+(?!\d))/g,',')+','+last:last;
 return `${negative?'-':''}₹${grouped}.${(amount%100n).toString().padStart(2,'0')}`;
}
export function forecastCost(item:CostItem,ceremony:FinanceCeremony|null):Forecast {
 validateCost(item);validateCeremony(item,ceremony);
 const result=(amount:string|null,reason:string):Forecast=>({amount_paise:amount,reason,formula:null});
 if(item.state==='COMMITTED')return result(item.commitment_paise,item.commitment_paise===null?'COMMITMENT_NOT_RECORDED':'COMMITMENT');
 if(item.state==='FINAL')return result(item.actual_paise,item.actual_paise===null?'ACTUAL_NOT_RECORDED':'FINAL_ACTUAL');
 if(item.state==='CANCELLED')return result(item.cancellation_settlement_paise,item.cancellation_settlement_paise===null?'SETTLEMENT_NOT_RECORDED':'CANCELLATION_SETTLEMENT');
 if(item.pricing_basis==='FIXED')return result(item.fixed_estimate_paise,item.fixed_estimate_paise===null?'ESTIMATE_NOT_RECORDED':'FIXED_ESTIMATE');
 if(item.per_guest_rate_paise===null)return result(null,'RATE_NOT_RECORDED');
 if(!ceremony||item.ceremony_id===null||ceremony.is_archived)return result(null,'CEREMONY_NOT_AVAILABLE');
 if(ceremony.guest_count===null)return result(null,'COUNT_NOT_RECORDED');
 const amount=integer(item.per_guest_rate_paise,MAX_ITEM_PAISE)*BigInt(count(ceremony.guest_count));
 if(amount>MAX_ITEM_PAISE)throw Error('Per-item forecast paise bound exceeded.');
 return {amount_paise:amount.toString(),reason:'PER_GUEST_ESTIMATE',formula:{rate_paise:item.per_guest_rate_paise,guest_count:ceremony.guest_count,ceremony_id:ceremony.id}};
}
function validateCash(item:CostItem,entry:CashEntry) {
 id(entry.id);id(entry.intent_key);
 if(entry.intent_key.length>160||entry.wedding_id!==item.wedding_id||entry.cost_item_id!==item.id)throw Error('Cash must reference this cost item and wedding.');
 if(!['PAYMENT','REFUND_RECEIVED'].includes(entry.kind)||!['POSTED','VOIDED'].includes(entry.status))throw Error('Invalid cash kind or state.');
 if(integer(entry.amount_paise,MAX_ITEM_PAISE)===0n)throw Error('Cash amount must be positive.');
 if(!entry.occurred_on||!calendarDate(entry.occurred_on))throw Error('Cash occurrence date is required.');
 if(entry.note!==null&&(typeof entry.note!=='string'||entry.note.length>1000))throw Error('Invalid cash note.');
 if(entry.status==='VOIDED'){instant(entry.voided_at);if(typeof entry.void_reason!=='string'||!entry.void_reason.trim()||entry.void_reason.length>1000)throw Error('Void reason is required.');}
 else if(entry.voided_at!==null||entry.void_reason!==null)throw Error('Posted cash cannot have void metadata.');
}
function cashTotals(item:CostItem,entries:readonly CashEntry[]) {
 let gross=0n,refunds=0n;const ids=new Set<string>(),intents=new Set<string>();
 for(const entry of entries){
  validateCash(item,entry);
  if(ids.has(entry.id)||intents.has(entry.intent_key))throw Error('Duplicate cash identity or intent.');ids.add(entry.id);intents.add(entry.intent_key);
  if(entry.status==='VOIDED')continue;
  const amount=integer(entry.amount_paise,MAX_ITEM_PAISE);
  if(entry.kind==='PAYMENT')gross=add(gross,amount);else refunds=add(refunds,amount);
 }
 if(refunds>gross)throw Error('Effective refunds cannot exceed effective payments; correct affected refunds first.');
 return {gross_paid_paise:gross.toString(),received_refunds_paise:refunds.toString(),net_cash_paid_paise:(gross-refunds).toString()};
}
export function evaluateCost(item:CostItem,ceremony:FinanceCeremony|null,entries:readonly CashEntry[]) {
 const forecast=forecastCost(item,ceremony),cash=cashTotals(item,entries);
 const obligation={kind:item.state==='PLANNED'?'NONE':forecast.amount_paise===null?'UNKNOWN':'KNOWN',amount_paise:item.state==='PLANNED'?null:forecast.amount_paise} as const;
 const net=integer(cash.net_cash_paid_paise),amount=obligation.amount_paise===null?null:integer(obligation.amount_paise);
 return {forecast,obligation,cash,outstanding_paise:amount===null?null:(amount>net?amount-net:0n).toString(),excess_cash_paise:amount===null?null:(net>amount?net-amount:0n).toString(),expected_refund_paise:item.expected_refund_paise,warnings:item.state==='PLANNED'&&integer(cash.gross_paid_paise)>0n?['PRECOMMITMENT_CASH_RECONCILIATION']:[]};
}
export function previewGuestCost(item:CostItem,ceremony:FinanceCeremony|null,newCount:number) {
 count(newCount);const before=forecastCost(item,ceremony),after=forecastCost(item,ceremony?{...ceremony,guest_count:newCount}:null);
 return {before_paise:before.amount_paise,after_paise:after.amount_paise,delta_paise:before.amount_paise===null||after.amount_paise===null?null:(integer(after.amount_paise)-integer(before.amount_paise)).toString(),reason:before.amount_paise===null?before.reason:after.reason,manual_reconfirmation:item.state==='COMMITTED'&&ceremony!==null&&ceremony.guest_count!==newCount};
}
export function summarizeWedding(weddingId:string,items:readonly CostItem[],ceremonies:readonly FinanceCeremony[],entries:readonly CashEntry[],ceilingPaise:string|null) {
 id(weddingId);money(ceilingPaise);
 const ceremonyMap=new Map<string,FinanceCeremony>(),itemMap=new Map<string,CostItem>(),cashIds=new Set<string>(),intents=new Set<string>();
 for(const ceremony of ceremonies){if(ceremony.wedding_id!==weddingId||ceremonyMap.has(ceremony.id))throw Error('Invalid wedding ceremony snapshot.');ceremonyMap.set(ceremony.id,ceremony);}
 for(const item of items){validateCost(item);if(item.wedding_id!==weddingId||itemMap.has(item.id)||item.ceremony_id!==null&&!ceremonyMap.has(item.ceremony_id))throw Error('Invalid same-wedding cost reference.');itemMap.set(item.id,item);}
 const cashMap=new Map<string,CashEntry[]>();
 for(const entry of entries){if(entry.wedding_id!==weddingId||!itemMap.has(entry.cost_item_id)||cashIds.has(entry.id)||intents.has(entry.intent_key))throw Error('Invalid or duplicate wedding cash reference/intent.');cashIds.add(entry.id);intents.add(entry.intent_key);const ledger=cashMap.get(entry.cost_item_id)??[];ledger.push(entry);cashMap.set(entry.cost_item_id,ledger);}
 let known=0n,gross=0n,refunds=0n,outstanding=0n,excess=0n,expected=0n,unknown=0,unknownObligations=0,uncommitted=0,unknownExpected=0,itemCount=0;
 for(const item of items){
  const ledger=cashMap.get(item.id)??[];
  if(item.archived_at!==null){if(item.state!=='PLANNED'||item.commitment_paise!==null||item.actual_paise!==null||item.cancellation_settlement_paise!==null||ledger.length)throw Error('Archived finance history cannot disappear from totals.');continue;}
  const result=evaluateCost(item,item.ceremony_id===null?null:ceremonyMap.get(item.ceremony_id)!,ledger);itemCount++;
  if(result.forecast.amount_paise===null)unknown++;else known=add(known,integer(result.forecast.amount_paise));
  gross=add(gross,integer(result.cash.gross_paid_paise));refunds=add(refunds,integer(result.cash.received_refunds_paise));
  if(result.obligation.kind==='UNKNOWN')unknownObligations++;if(result.obligation.kind==='NONE')uncommitted++;
  if(result.outstanding_paise!==null)outstanding=add(outstanding,integer(result.outstanding_paise));if(result.excess_cash_paise!==null)excess=add(excess,integer(result.excess_cash_paise));
  if(item.expected_refund_paise===null)unknownExpected++;else expected=add(expected,integer(item.expected_refund_paise));
 }
 return {item_count:itemCount,empty:itemCount===0,projected_total_known_paise:known.toString(),unknown_forecast_count:unknown,projected_total_completeness:unknown?'PARTIAL':'COMPLETE',gross_paid_paise:gross.toString(),received_refunds_paise:refunds.toString(),net_cash_paid_paise:(gross-refunds).toString(),outstanding_known_paise:outstanding.toString(),excess_cash_known_paise:excess.toString(),unknown_obligation_count:unknownObligations,uncommitted_item_count:uncommitted,expected_refunds_known_paise:expected.toString(),unknown_expected_refund_count:unknownExpected,remaining_budget_paise:ceilingPaise===null||unknown?null:add(integer(ceilingPaise),-known).toString()};
}
// These are pure candidate-ledger previews, not authorized/atomic database writes.
export function previewCashPost(item:CostItem,entries:readonly CashEntry[],candidate:CashEntry) {
 validateCost(item);if(item.archived_at!==null)throw Error('Archived cost is read only.');cashTotals(item,entries);validateCash(item,candidate);
 if(candidate.status!=='POSTED')throw Error('A new cash intent must be POSTED.');
 const previous=entries.find(entry=>entry.intent_key===candidate.intent_key);
 if(previous){
  const payload=(entry:CashEntry)=>JSON.stringify([entry.wedding_id,entry.cost_item_id,entry.kind,entry.amount_paise,entry.occurred_on,entry.note]);
  if(payload(previous)!==payload(candidate))throw Error('Cash intent reused with a conflicting payload.');
  return {entries:entries.map(entry=>({...entry})),replayed:true};
 }
 const proposed=[...entries.map(entry=>({...entry})),{...candidate}];cashTotals(item,proposed);return {entries:proposed,replayed:false};
}
export function previewCashVoid(item:CostItem,entries:readonly CashEntry[],entryId:string,reason:string,voidedAt:string) {
 validateCost(item);if(item.archived_at!==null)throw Error('Archived cost is read only.');cashTotals(item,entries);instant(voidedAt);
 if(typeof reason!=='string'||!reason.trim()||reason.length>1000)throw Error('Void reason is required.');
 const original=entries.find(entry=>entry.id===entryId);if(!original)throw Error('Cash entry not found.');
 if(original.status==='VOIDED')return {entries:entries.map(entry=>({...entry})),replayed:true};
 const proposed=entries.map(entry=>entry.id===entryId?{...entry,status:'VOIDED' as const,voided_at:voidedAt,void_reason:reason.trim()}:{...entry});cashTotals(item,proposed);return {entries:proposed,replayed:false};
}
export function transitionCost(item:CostItem,newState:CostState,recordedAmount:string|null):CostItem {
 validateCost(item);money(recordedAmount);if(item.archived_at!==null||!states.includes(newState))throw Error('Cost state unavailable.');
 const field=newState==='COMMITTED'?'commitment_paise':newState==='FINAL'?'actual_paise':newState==='CANCELLED'?'cancellation_settlement_paise':null;
 if(item.state===newState){if(field?item[field]!==recordedAmount:recordedAmount!==null)throw Error('Use an explicit owner-audited correction.');return {...item};}
 if(!(item.state==='PLANNED'&&['COMMITTED','FINAL','CANCELLED'].includes(newState)||item.state==='COMMITTED'&&['FINAL','CANCELLED'].includes(newState)))throw Error('Unsupported financial state transition.');
 if(newState!=='CANCELLED'&&recordedAmount===null)throw Error('Recorded commitment or actual is required.');
 const proposed={...item,state:newState,...(field?{[field]:recordedAmount}:{})};validateCost(proposed);return proposed;
}
