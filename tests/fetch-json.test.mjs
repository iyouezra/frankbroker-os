import assert from "node:assert/strict";
import test from "node:test";

import { fetchJsonWithTransientRetry } from "../lib/fetch-json.ts";

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("transient JSON reads retry and return the recovered response", async () => {
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    return attempts === 1
      ? Response.json({ error: "Temporary database error." }, { status: 500 })
      : Response.json({ profile: { id: "cli_investor_demo" } });
  };

  const result = await fetchJsonWithTransientRetry("/api/investor", {}, {
    fallbackMessage: "Unable to open this demo account.",
    retryDelayMs: 0,
  });

  assert.equal(attempts, 2);
  assert.deepEqual(result, { profile: { id: "cli_investor_demo" } });
});

test("non-transient failures preserve the API error without retrying", async () => {
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    return Response.json({ error: "Demo investor not found." }, { status: 404 });
  };

  await assert.rejects(
    fetchJsonWithTransientRetry("/api/investor", {}, {
      fallbackMessage: "Unable to open this demo account.",
      retryDelayMs: 0,
    }),
    /Demo investor not found/,
  );
  assert.equal(attempts, 1);
});
