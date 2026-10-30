// Actual local HTTP tests. No credentials, token fixtures or provider mocks.
import test from 'node:test';
import assert from 'node:assert/strict';
const base=process.env.AUTH_TEST_BASE_URL??'http://127.0.0.1:3000';
const url=new URL(base);
assert.ok(['127.0.0.1','localhost'].includes(url.hostname),'Local test target only');
async function request(path,options={}) {return fetch(new URL(path,base),{redirect:'manual',signal:AbortSignal.timeout(20000),...options});}
function noCache(response,appPage=false) {
  const control=response.headers.get('cache-control')??'';
  assert.match(control,/no-store/);
  // Next controls App Router HTML/RSC Vary; no-store is the page privacy boundary.
  // Route-handler responses must retain the explicit Cookie variation as well.
  if(!appPage) {assert.match(control,/private/);assert.match(control,/max-age=0/);assert.match(response.headers.get('vary')??'',/Cookie/i);}
}
test('unauthenticated private page redirects to local sign-in with no-store',async()=>{
  const r=await request('/workspace');assert.equal(r.status,307);assert.match(r.headers.get('location')??'',/^\/login\?next=/);noCache(r,true);assert.ok(!(await r.text()).includes('Create my wedding'),'private creation form must not be disclosed');
});
for(const path of ['/api/weddings','/api/weddings/11000000-0000-4000-8000-000000000001']) test(`unauthenticated ${path} is401`,async()=>{
  const r=await request(path);assert.equal(r.status,401);assert.equal((await r.json()).error.code,'UNAUTHENTICATED');noCache(r);
});
test('malformed/stale auth cookie fails closed on page and API',async()=>{
  const headers={Cookie:'sb-gqvhxrlcomufepzudcno-auth-token=invalid-test-session'};
  const page=await request('/workspace',{headers});assert.equal(page.status,307);noCache(page,true);assert.ok(!(await page.text()).includes('Create my wedding'));
  const api=await request('/api/weddings',{headers});assert.equal(api.status,401);noCache(api);
});
test('mutating auth and wedding routes reject foreign or missing origins',async()=>{
  for(const path of ['/auth/login','/auth/logout','/auth/signup','/api/weddings']) {
    for(const origin of [undefined,'https://evil.invalid']) {
      const r=await request(path,{method:'POST',headers:origin?{Origin:origin}:{}});assert.equal(r.status,403);noCache(r);
    }
  }
});
test('same-origin anonymous creation remains denied',async()=>{
  const r=await request('/api/weddings',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({title:'Synthetic',city:'Test'})});
  assert.equal(r.status,401);noCache(r);
});
test('logout has no mutating GET route',async()=>{assert.equal((await request('/auth/logout')).status,405);});
test('callback without valid PKCE code never follows arbitrary destination',async()=>{
  const r=await request('/auth/callback?next=https://evil.invalid');assert.equal(r.status,303);assert.equal(new URL(r.headers.get('location'),base).pathname,'/login');noCache(r);
});
