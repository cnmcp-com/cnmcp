import assert from "node:assert/strict";
import test from "node:test";

import { captureSessionFromHash, readSession } from "./browser-session.ts";

const store = new Map<string, string>();

function installBrowser(hash: string) {
  store.clear();
  const location = { hash, pathname: "/me", search: "" };
  Object.assign(globalThis, {
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
    window: {
      location,
      history: {
        replaceState(_state: null, _title: string, url: string) {
          const hashIndex = url.indexOf("#");
          location.hash = hashIndex === -1 ? "" : url.slice(hashIndex);
        },
      },
    },
  });
}

test("oauth hash is invisible until captureSessionFromHash runs", () => {
  installBrowser("#session=uuid-1");
  assert.equal(readSession(), null);
  assert.equal(captureSessionFromHash(), true);
  assert.equal(readSession(), "uuid-1");
  assert.equal(window.location.hash, "");
});

test("capture keeps unrelated hash params and is idempotent", () => {
  installBrowser("#session=uuid-2&tab=projects");
  assert.equal(captureSessionFromHash(), true);
  assert.equal(readSession(), "uuid-2");
  assert.equal(window.location.hash, "#tab=projects");
  assert.equal(captureSessionFromHash(), false);
  assert.equal(readSession(), "uuid-2");
});
