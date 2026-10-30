import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../src/app/api/health/route.ts";

test("health responds successfully without depending on provider configuration", () => {
  assert.equal(GET().status, 200);
});

test("health exposes only a fixed liveness status, without private diagnostics", async () => {
  const response = GET();
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("health is not cached as a stale indication of process liveness", () => {
  assert.equal(GET().headers.get("cache-control"), "no-store");
});
