import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedJson} from '../src/lib/bounded-json.ts';
test('request bounds count UTF-8 bytes even without content-length',async()=>{
 assert.deepEqual(await boundedJson(new Request('https://example.invalid',{method:'POST',body:'{"a":1}'}),7),{a:1});
 await assert.rejects(boundedJson(new Request('https://example.invalid',{method:'POST',body:'{"a":"₹₹"}'}),12));
 await assert.rejects(boundedJson(new Request('https://example.invalid',{method:'POST',body:'{}',headers:{'content-length':'100'}}),8));
 await assert.rejects(boundedJson(new Request('https://example.invalid',{method:'POST',body:'invalid'}),10));
});
