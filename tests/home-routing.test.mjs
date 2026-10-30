import test from 'node:test';
import assert from 'node:assert/strict';
const base=process.env.AUTH_TEST_BASE_URL??'http://127.0.0.1:3000';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Local routing verification only');
const get=path=>fetch(new URL(path,base),{redirect:'manual',signal:AbortSignal.timeout(25000)});

test('root redirects server-side to the real workspace, without sample content',async()=>{
 const r=await get('/');assert.equal(r.status,307);assert.equal(new URL(r.headers.get('location'),base).pathname,'/workspace');assert.ok(!(await r.text()).includes('Aarohi'));
});
test('anonymous root chain ends at existing login, with no redirect cycle',async()=>{
 let path='/',seen=new Set();for(let hop=0;hop<5;hop++){assert.ok(!seen.has(path),'Redirect loop');seen.add(path);const r=await get(path);if(r.status===200){assert.equal(new URL(path,base).pathname,'/login');assert.match(await r.text(),/Welcome back/);return;}assert.equal(r.status,307);const next=new URL(r.headers.get('location'),base);assert.equal(next.origin,new URL(base).origin);path=next.pathname+next.search;}assert.fail('Login not reached within bounded redirect chain');
});
test('design review is independently accessible and honestly labelled, with real app link',async()=>{
 const r=await get('/design-review');assert.equal(r.status,200);const html=await r.text();assert.match(html,/Aarohi/);assert.ok(html.includes('Visual sample only. Tasks are not saved and the order is illustrative.'));assert.match(html,/V1 design preview/);assert.match(html,/href="\/workspace"/);
});
test('private wedding, Tasks, budget and ADAPT routes remain protected, not missing',async()=>{
 for(const tail of ['', '/tasks','/budget','/changes','/ceremonies']){const r=await get('/workspace/41486793-e47e-44ad-aee2-e9fe58531ca3'+tail);assert.equal(r.status,307);assert.equal(new URL(r.headers.get('location'),base).pathname,'/login');assert.match(r.headers.get('cache-control')??'',/no-store/);}
 assert.equal((await get('/api/weddings')).status,401);
});
