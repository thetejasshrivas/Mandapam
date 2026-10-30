import test from "node:test";
import assert from "node:assert/strict";
import { safeReturnTo, sameOrigin, privateHeaders, weddingInput, credentialsInput } from "../src/server/auth/policy.ts";

test("return destination only allows private workspace routes", () => {
  const id="12345678-1234-4123-8123-123456789abc";
  assert.equal(safeReturnTo(`/workspace/${id}`),`/workspace/${id}`);
  for(const value of [null,"https://evil.invalid","//evil.invalid","/\\evil.invalid","/%2f%2fevil.invalid","/workspace/../auth/logout","/auth/logout","/workspace?next=https://evil.invalid"]) assert.equal(safeReturnTo(value),"/workspace");
});
test("mutations require exact same origin including port", () => {
  assert.equal(sameOrigin("http://127.0.0.1:3000/auth/login","http://127.0.0.1:3000"),true);
  for(const origin of [null,"null","https://evil.invalid","http://127.0.0.1:3001"]) assert.equal(sameOrigin("http://127.0.0.1:3000/auth/login",origin),false);
});
test("private responses cannot be cached or replayed as another account", () => {
  const headers=new Headers(privateHeaders());
  assert.match(headers.get("cache-control")!,/private.*no-store/);
  assert.match(headers.get("vary")!,/Cookie/);
  assert.equal(headers.get("pragma"),"no-cache");
  assert.equal(headers.get("referrer-policy"),"same-origin");
});
test("wedding creation accepts bounded text and rejects owner/status injection", () => {
  assert.deepEqual(weddingInput({title:"  Sample celebration ",city:" Pune "}),{title:"Sample celebration",city:"Pune"});
  for(const input of [{title:"",city:"Pune"},{title:"A",city:""},{title:"x".repeat(101),city:"Pune"},{title:"A",city:"Pune",owner_user_id:"forged"},{title:"A",city:"Pune",state:"ACTIVE"},null]) assert.equal(weddingInput(input),null);
});
test("credentials are bounded without silently changing passwords", () => {
  assert.deepEqual(credentialsInput(" test@example.invalid "," pass word "),{email:"test@example.invalid",password:" pass word "});
  assert.equal(credentialsInput("invalid","password"),null);
  assert.equal(credentialsInput("test@example.invalid",""),null);
  assert.equal(credentialsInput("test@example.invalid","x".repeat(257)),null);
});
