import test from 'node:test';
import assert from 'node:assert/strict';
import {shellNavigation,currentNavigation} from '../src/components/shell/navigation.ts';
const id='41486793-e47e-44ad-aee2-e9fe58531ca3';
test('active shell links only supported routes and real workspace anchors',()=>{
 const items=shellNavigation(id,true);assert.deepEqual(items.map(i=>i.href),[`/workspace/${id}`,`/workspace/${id}/tasks`,`/workspace/${id}/budget`,`/workspace/${id}/ceremonies`,`/workspace/${id}/changes`,`/workspace/${id}/family`]);assert.ok(items.every(i=>!/(settings|notifications)/.test(i.href)));
});
test('draft and pre-wedding shell omit unavailable money/change destinations',()=>{
 assert.deepEqual(shellNavigation(id,false).map(i=>i.key),['dashboard','tasks','ceremonies','family']);assert.deepEqual(shellNavigation(null,false).map(i=>i.href),['/workspace','/family/connect']);
 assert.equal(shellNavigation(id,false)[1].href,`/workspace/${id}#tasks`);
 assert.equal(shellNavigation(id,false)[2].href,`/workspace/${id}#ceremonies`);
});
test('active location distinguishes same-page sections from true page routes',()=>{
 assert.equal(currentNavigation(`/workspace/${id}`,'#tasks'),'tasks');assert.equal(currentNavigation(`/workspace/${id}`,'#ceremonies'),'ceremonies');assert.equal(currentNavigation(`/workspace/${id}/budget`,''),'budget');assert.equal(currentNavigation(`/workspace/${id}/changes`,''),'changes');assert.equal(currentNavigation(`/workspace/${id}`,''),'dashboard');
 assert.equal(currentNavigation(`/workspace/${id}/tasks`,''),'tasks');
 assert.equal(currentNavigation(`/workspace/${id}/ceremonies`,''),'ceremonies');
});
