import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAiInput,safeAiContext,validateSuggestions,filterSuggestions,normalizeSuggestionTitle} from '../src/domain/ai.ts';
import {requestSuggestions} from '../src/lib/ai-provider.ts';
import {sealAiReceipt,verifyAiReceipt} from '../src/lib/ai-receipt.ts';
const id='19000000-0000-4000-8000-000000000001',other='19000000-0000-4000-8000-000000000002';
const suggestion={title:'Review a wet-weather plan',reason:'Consider an optional alternative if the weather changes.'};
test('strict input permits references only, no notes/finances/owner/model overrides',()=>{
 assert.deepEqual(parseAiInput({wedding_id:id,ceremony_ids:[other]}),{wedding_id:id,ceremony_ids:[other]});
 for(const value of [{wedding_id:id,ceremony_ids:[other],notes:'private'},{wedding_id:id,ceremony_ids:[other],budget:100},{wedding_id:id,ceremony_ids:[other],model:'paid'},{wedding_id:id,ceremony_ids:[other,other]},{wedding_id:id,ceremony_ids:[]}])assert.throws(()=>parseAiInput(value));
});
test('provider context reconstructs generic catalog text, never private labels, names or finances',()=>{
 const context=safeAiContext([{id,title:'Reception'},{id:other,title:'Personal name custom event'}],[{title:'Reception: Record the planned location',status:'TO_DO',dismissed_at:null},{title:'Call Person at 9999999999 about INR250000',status:'TO_DO',dismissed_at:null},{title:'Choose invitation wording',status:'COMPLETED',dismissed_at:null},{title:'Send invitations',status:'TO_DO',dismissed_at:'now'}]);
 assert.deepEqual(context.ceremonies,['Reception','Custom ceremony']);assert.ok(context.existing_titles.includes('Record the planned location'));assert.ok(context.dismissed_titles.includes('Send invitations'));
 const text=JSON.stringify(context);for(const blocked of ['Personal name','9999999999','250000','INR',id,other])assert.equal(text.includes(blocked),false);
});
test('schema MAX3 and exact bounded title/reason fields; malformed outputs rejected',()=>{
 assert.deepEqual(validateSuggestions({suggestions:[suggestion]}),[suggestion]);
 for(const bad of [{suggestions:Array(4).fill(suggestion)},{suggestions:[{...suggestion,price:'10'}]},{suggestions:[{title:'tiny',reason:'Enough reason'}]},{suggestions:[{title:'x'.repeat(121),reason:'Enough reason'}]},{suggestions:[{title:'Valid title',reason:'x'.repeat(241)}]},{suggestions:[],extra:true},[]])assert.throws(()=>validateSuggestions(bad));
});
test('normalized dedup covers present/completed/dismissed, ceremony prefixes and response duplicates',()=>{
 assert.equal(normalizeSuggestionTitle(' Ｒｅｖｉｅｗ—Gifts! '),'review gifts');
 const output=filterSuggestions([{title:'Review gifts!',reason:'Optional planning review.'},{title:'review   gifts',reason:'Another wording of the same task.'},{title:'Send invitations',reason:'Only if not already done.'},suggestion],['Reception: Review gifts','Send invitations']);
 assert.deepEqual(output,[suggestion]);
});
test('invented prices, availability, binding rituals, contacts or secrets are filtered',()=>{
 for(const value of [{title:'Pay INR5000 deposit',reason:'The venue requires this amount.'},{title:'Book the available vendor',reason:'Guaranteed to be available tomorrow.'},{title:'Perform the mandatory ritual',reason:'Every wedding must do this.'},{title:'Call person@example.invalid',reason:'Contact this person directly.'},{title:'Copy your API key',reason:'Put the secret in the plan.'}])assert.equal(filterSuggestions([value],[]).length,0);
});
test('mock transport is bounded, validates output, header key never enters URL/prompt',async()=>{
 let calls=0;const result=await requestSuggestions({ceremonies:['Reception'],existing_titles:[],dismissed_titles:[]},'unit-test-not-a-real-key',async(url,init)=>{calls++;assert.equal(String(url).includes('unit-test-not-a-real-key'),false);assert.equal(String(init?.body).includes('unit-test-not-a-real-key'),false);return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({suggestions:[suggestion]})}]}}]});});
 assert.equal(result.ok,true);assert.equal(calls,1);
});
test('mock outage/429/malformed/oversize/timeout each make one attempt and never fake suggestions',async()=>{
 for(const response of [new Response('',{status:429}),new Response('',{status:503}),Response.json({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{}'}]}}]}),Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'not json'}]}}]}),new Response('x'.repeat(17000))]){let calls=0;const result=await requestSuggestions({ceremonies:['Reception'],existing_titles:[],dismissed_titles:[]},'test-only',async()=>{calls++;return response;});assert.equal(result.ok,false);assert.equal(calls,1);assert.equal('suggestions' in result,false);}
 let calls=0;const result=await requestSuggestions({ceremonies:['Reception'],existing_titles:[],dismissed_titles:[]},'test-only',async()=>{calls++;return new Promise(()=>{});},20);assert.equal(result.ok,false);assert.equal(calls,1);
});
test('signed receipts bind account/wedding/results/expiry; cannot forge acceptance from arbitrary titles',()=>{
 const key='unit-test-signing-secret-do-not-use-real-key',now=1900000000000;
 const receipt=sealAiReceipt({user_id:id,wedding_id:other,request_id:id,suggestions:[suggestion]},key,now);
 assert.deepEqual(verifyAiReceipt(receipt,key,id,other,now).suggestions,[suggestion]);
 assert.throws(()=>verifyAiReceipt(receipt,key,other,other,now));assert.throws(()=>verifyAiReceipt(receipt,key,id,id,now));assert.throws(()=>verifyAiReceipt(receipt+'x',key,id,other,now));assert.throws(()=>verifyAiReceipt(receipt,key,id,other,now+600001));
});
