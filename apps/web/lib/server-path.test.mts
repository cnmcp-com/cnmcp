import assert from "node:assert/strict";
import test from "node:test";

import { resolveServerRoute, serverPublicPath } from "./server-path.ts";

test("plaza ids use an owned public path", () => {
  assert.equal(serverPublicPath("cloud.tencent.com/10047"), "/servers/plaza/10047");
  assert.deepEqual(resolveServerRoute(["plaza", "10047"]), { id: "cloud.tencent.com/10047" });
});

test("legacy tencent urls redirect to the owned path", () => {
  assert.deepEqual(resolveServerRoute(["cloud.tencent.com/10047"]), { redirect: "/servers/plaza/10047" });
  assert.deepEqual(resolveServerRoute(["cloud.tencent.com%2F10047"]), { redirect: "/servers/plaza/10047" });
  assert.deepEqual(resolveServerRoute(["cloud.tencent.com", "10047"]), { redirect: "/servers/plaza/10047" });
});

test("other server ids keep a single encoded segment", () => {
  assert.equal(serverPublicPath("github.com/acme/demo"), "/servers/github.com%2Facme%2Fdemo");
  assert.deepEqual(resolveServerRoute(["github.com/acme/demo"]), { id: "github.com/acme/demo" });
});
