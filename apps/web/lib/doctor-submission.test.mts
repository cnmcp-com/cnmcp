import assert from "node:assert/strict";
import test from "node:test";

import { buildDoctorSubmissionItems } from "./doctor-submission.ts";

test("splits an MCP config into independently submitted resources", () => {
  const items = buildDoctorSubmissionItems({
    mcpServers: {
      time: { command: "uvx", args: ["mcp-server-time"] },
      remote: { url: "https://mcp.example.com/mcp" },
    },
  });

  assert.equal(items.length, 2);
  assert.deepEqual(items[0], {
    key: "time",
    payload: {
      type: "new_server",
      config: { mcpServers: { time: { command: "uvx", args: ["mcp-server-time"] } } },
    },
  });
  assert.equal(items[1]?.payload.endpoint, "https://mcp.example.com/mcp");
});

test("supports clients that use servers as the root key", () => {
  const items = buildDoctorSubmissionItems({ servers: { demo: { command: "npx", args: ["-y", "demo-mcp"] } } });
  assert.equal(items[0]?.key, "demo");
});

test("ignores invalid server entries", () => {
  assert.deepEqual(buildDoctorSubmissionItems({ mcpServers: { invalid: "demo" } }), []);
  assert.deepEqual(buildDoctorSubmissionItems(null), []);
});
