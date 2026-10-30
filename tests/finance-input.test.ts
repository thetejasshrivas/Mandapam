import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFinanceInput} from '../src/domain/finance-input.ts';
test('cost creation uses nullable exact paise and rejects forged ownership',()=>{
 const result=parseFinanceInput({operation:'create',title:' Catering ',ceremony_id:'',pricing_basis:'FIXED',amount:''});
 assert.equal(result.fields.fixed_estimate_paise,null);assert.equal(result.fields.ceremony_id,null);assert.equal(result.fields.title,'Catering');
 assert.throws(()=>parseFinanceInput({operation:'create',title:'x',pricing_basis:'FIXED',amount:'1',owner_user_id:'forged'}));
});
test('manual state/settlement and corrections require confirmation without altering historical fields',()=>{
 const result=parseFinanceInput({operation:'state',state:'CANCELLED',amount:'15000',confirmed:'on'});
 assert.equal(result.fields.amount_paise,'1500000');assert.equal(result.confirmed,true);assert.throws(()=>parseFinanceInput({operation:'state',state:'CANCELLED',amount:'15000'}));
 assert.throws(()=>parseFinanceInput({operation:'correct',amount:'1',confirmed:'on',reason:''}));
});
test('cash posting retains intent identity and exact DATE/amount, requiring positive money',()=>{
 const input={operation:'post',kind:'PAYMENT',amount:'50000.29',occurred_on:'2026-10-27',note:'',intent_key:'synthetic-intent'};
 const result=parseFinanceInput(input);assert.equal(result.fields.amount_paise,'5000029');assert.equal(result.fields.intent_key,input.intent_key);
 for(const amount of ['0','-1','1.005',1])assert.throws(()=>parseFinanceInput({...input,amount}));
 assert.throws(()=>parseFinanceInput({...input,occurred_on:'2027-02-29'}));
});
test('void/archive require explicit confirmation/reason and cannot carry replacement amounts',()=>{
 assert.equal(parseFinanceInput({operation:'void',reason:' Wrong amount ',confirmed:'on'}).reason,'Wrong amount');
 assert.throws(()=>parseFinanceInput({operation:'void',reason:'wrong',confirmed:'on',amount:'1'}));
 assert.throws(()=>parseFinanceInput({operation:'archive'}));
});
test('budget/expected-refund unknown differs from zero; numeric money refused',()=>{
 assert.equal(parseFinanceInput({operation:'budget',amount:''}).fields.amount_paise,null);
 assert.equal(parseFinanceInput({operation:'budget',amount:'0'}).fields.amount_paise,'0');
 assert.equal(parseFinanceInput({operation:'expected_refund',amount:'25.01'}).fields.expected_refund_paise,'2501');
 assert.throws(()=>parseFinanceInput({operation:'budget',amount:0}));
});
