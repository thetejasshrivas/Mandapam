import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAdaptRequest} from '../src/domain/adapt.ts';
const ceremony_id='33000000-0000-4000-8000-000000000001';
const input={operation:'initialize',ceremony_id,new_guest_count:'250',version:'9007199254740993',confirmed:'on'};
test('one-time initialization accepts explicit confirmation and exact version',()=>assert.deepEqual(parseAdaptRequest(input),{operation:'initialize',ceremony_id,new_guest_count:250,version:input.version,confirmed:true}));
test('initialization rejects missing confirmation, invalid count/version and extra fields',()=>{
 for(const patch of [{confirmed:undefined},{confirmed:false},{new_guest_count:'0'},{new_guest_count:'10001'},{new_guest_count:'1.1'},{new_guest_count:null},{version:1},{version:'-1'},{ceremony_id:'invalid'},{owner_user_id:ceremony_id},{capacity:'500'}])assert.throws(()=>parseAdaptRequest({...input,...patch}));
});
