import assert from "node:assert/strict";
import test from "node:test";

import { buildListHref } from "./ui.ts";

test("discovery links keep category, query, and cursor only", () => {
  assert.equal(
    buildListHref("/projects", { q: "pandas", category: "data", type: "mcp", security: "clear", sort: "hot", cursor: "abc" }),
    "/projects?q=pandas&category=data&cursor=abc",
  );
  assert.equal(
    buildListHref("/", { category: "data", type: "skill", sort: "hot" }, { category: undefined }),
    "/",
  );
  assert.equal(
    buildListHref("/projects", { q: "mcp", category: "data", cursor: "abc" }, { category: "research" }),
    "/projects?q=mcp&category=research",
  );
  assert.equal(buildListHref("/search", { q: "agent" }, { category: "content" }), "/search?q=agent&category=content");
});
