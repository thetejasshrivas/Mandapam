import test from 'node:test';
import assert from 'node:assert/strict';
import {memberLabels} from '../src/domain/member-names.ts';
const a='71000000-0000-4000-8000-000000000002',b='71000000-0000-4000-8000-000000000003';
test('Names are display-only and UUID assignments remain unchanged',()=>{assert.deepEqual(memberLabels([{id:a,display_name:'  Asha Sharma  '}]),[{id:a,label:'Asha Sharma'}]);});
test('Missing names use a readable fallback, suffix only when ambiguous',()=>{assert.equal(memberLabels([{id:a}])[0].label,'Family Member');const r=memberLabels([{id:a},{id:b,display_name:'   '}]);assert.deepEqual(r.map(m=>m.label),['Family Member · 00000002','Family Member · 00000003']);});
test('Duplicate names are disambiguated, including suffix collisions',()=>{const c='72000000-0000-4000-8000-000000000002';const r=memberLabels([{id:a,display_name:'Asha'},{id:b,display_name:'asha'}]);assert.match(r[0].label,/Asha · 00000002/);assert.equal(memberLabels([{id:a,display_name:'Asha'},{id:c,display_name:'Asha'}])[0].label,'Asha · '+a);});
test('Untrusted metadata is bounded plain text, never an authorization field',()=>{const input=[{id:a,display_name:'Asha\u202e\n Sharma',role:'Admin'},{id:b,display_name:{full_name:'bad'}}];const r=memberLabels(input);assert.equal(r[0].label,'Asha Sharma');assert.equal(r[1].label,'Family Member');assert.deepEqual(Object.keys(r[0]),['id','label']);assert.equal(memberLabels([{id:a,display_name:'x'.repeat(1000)}])[0].label.length,100);});
