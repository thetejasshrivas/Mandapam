import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAdaptRequest} from '../src/domain/adapt.ts';
import {approvalRecovery} from '../src/domain/approval.ts';
const id='18000000-0000-4000-8000-000000000001';
const outcome=(status:string,extra:Record<string,unknown>={})=>({id,status,current_guest_count:350,base_wedding_version:'9007199254740993',current_version:'9007199254740994',applied_version:status==='APPLIED'?'9007199254740994':null,applied_audit_event_id:status==='APPLIED'?id:null,decided_at:status==='PENDING'?null:'2026-10-28T00:00:00Z',...extra});
test('approval accepts explicit proposal confirmation, never arbitrary changes/actor/snapshot',()=>{
 assert.deepEqual(parseAdaptRequest({operation:'approve',proposal_id:id,confirmed:'on'}),{operation:'approve',proposal_id:id});
 for(const row of [{operation:'approve',proposal_id:id},{operation:'approve',proposal_id:id,confirmed:'true'},{operation:'approve',proposal_id:id,confirmed:'on',guest_count:999},{operation:'approve',proposal_id:id,confirmed:'on',owner_id:id},{operation:'approve',proposal_id:id,confirmed:'on',snapshot:{}}])assert.throws(()=>parseAdaptRequest(row));
});
test('timeout recovery confirms APPLIED only from complete authoritative metadata',()=>{
 const state=approvalRecovery(outcome('APPLIED'));assert.equal(state.resolved,true);assert.equal(state.applied,true);assert.equal(state.allow_mutations,true);assert.match(state.message,/authoritative/);
 assert.throws(()=>approvalRecovery(outcome('APPLIED',{applied_version:null})));assert.throws(()=>approvalRecovery(outcome('APPLIED',{applied_audit_event_id:null})));assert.throws(()=>approvalRecovery(outcome('APPLIED',{current_version:'3'})));
});
test('PENDING after timeout is not failure and cannot trigger another mutation',()=>{
 const state=approvalRecovery(outcome('PENDING'));assert.equal(state.resolved,false);assert.equal(state.applied,false);assert.equal(state.allow_mutations,false);assert.match(state.message,/does not prove failure/);
});
test('REJECTED resolves uncertainty but never permits approval; later counts are factual',()=>{
 const state=approvalRecovery(outcome('REJECTED'));assert.equal(state.resolved,true);assert.equal(state.applied,false);assert.match(state.message,/cannot be approved/);
 assert.match(approvalRecovery(outcome('APPLIED',{current_guest_count:400})).message,/400/);
 assert.throws(()=>approvalRecovery(outcome('APPROVED')));
});
