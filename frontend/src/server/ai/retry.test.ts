import assert from "node:assert/strict";
import test from "node:test";

import { withRetry } from "./retry.js";

test("withRetry retries transient failures before returning the successful value", async () => {
  let attempts = 0;

  const result = await withRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) {
        const error = new Error("service unavailable");
        Object.assign(error, { status: 503 });
        throw error;
      }

      return "ok";
    },
    3,
    0,
  );

  assert.equal(result, "ok");
  assert.equal(attempts, 3);
});

test("withRetry treats maxRetries as the maximum total attempts", async () => {
  let attempts = 0;

  await assert.rejects(
    () =>
      withRetry(
        async () => {
          attempts += 1;
          const error = new Error("service unavailable");
          Object.assign(error, { status: 503 });
          throw error;
        },
        3,
        0,
      ),
    /service unavailable/,
  );

  assert.equal(attempts, 3);
});

test("withRetry retries common transient HTTP status failures", async () => {
  for (const status of [429, 500] as const) {
    let attempts = 0;

    const result = await withRetry(
      async () => {
        attempts += 1;
        if (attempts === 1) {
          const error = new Error(`transient HTTP ${status}`);
          Object.assign(error, { status });
          throw error;
        }

        return `ok-${status}`;
      },
      3,
      0,
    );

    assert.equal(result, `ok-${status}`);
    assert.equal(attempts, 2);
  }
});

test("withRetry treats numeric error codes as HTTP status failures", async () => {
  let attempts = 0;

  const result = await withRetry(
    async () => {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error("rate limited");
        Object.assign(error, { code: 429 });
        throw error;
      }

      return "ok";
    },
    3,
    0,
  );

  assert.equal(result, "ok");
  assert.equal(attempts, 2);
});

test("withRetry retries common network transport failures", async () => {
  for (const code of ["ETIMEDOUT", "ECONNRESET", "EAI_AGAIN"] as const) {
    let attempts = 0;

    const result = await withRetry(
      async () => {
        attempts += 1;
        if (attempts === 1) {
          const error = new Error("network request failed");
          Object.assign(error, { code });
          throw error;
        }

        return `ok-${code}`;
      },
      3,
      0,
    );

    assert.equal(result, `ok-${code}`);
    assert.equal(attempts, 2);
  }
});

test("withRetry throws non-transient failures without another attempt", async () => {
  let attempts = 0;

  await assert.rejects(
    () =>
      withRetry(
        async () => {
          attempts += 1;
          const error = new Error("invalid request");
          Object.assign(error, { status: 400 });
          throw error;
        },
        3,
        0,
      ),
    /invalid request/,
  );

  assert.equal(attempts, 1);
});

test("withRetry reports safe attempt metadata before retrying", async () => {
  let attempts = 0;
  const events: Array<{
    attempt: number;
    maxAttempts: number;
    elapsedMs: number;
    willRetry: boolean;
    nextDelayMs?: number;
    error: unknown;
  }> = [];

  const result = await withRetry(
    async () => {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error("network timeout");
        Object.assign(error, { code: "ETIMEDOUT" });
        throw error;
      }

      return "ok";
    },
    2,
    0,
    {
      onAttemptFailure: (event) => events.push(event),
    },
  );

  assert.equal(result, "ok");
  assert.equal(events.length, 1);
  assert.equal(events[0]?.attempt, 1);
  assert.equal(events[0]?.maxAttempts, 2);
  assert.equal(events[0]?.willRetry, true);
  assert.equal(typeof events[0]?.elapsedMs, "number");
  assert.equal(typeof events[0]?.nextDelayMs, "number");
  assert.match((events[0]?.error as Error).message, /network timeout/);
});

test("withRetry reports the final failed attempt without retry delay", async () => {
  const events: Array<{
    attempt: number;
    maxAttempts: number;
    willRetry: boolean;
    nextDelayMs?: number;
  }> = [];

  await assert.rejects(
    () =>
      withRetry(
        async () => {
          const error = new Error("service unavailable");
          Object.assign(error, { status: 503 });
          throw error;
        },
        2,
        0,
        {
          onAttemptFailure: (event) => events.push(event),
        },
      ),
    /service unavailable/,
  );

  assert.deepEqual(
    events.map((event) => ({
      attempt: event.attempt,
      maxAttempts: event.maxAttempts,
      willRetry: event.willRetry,
      hasDelay: typeof event.nextDelayMs === "number",
    })),
    [
      { attempt: 1, maxAttempts: 2, willRetry: true, hasDelay: true },
      { attempt: 2, maxAttempts: 2, willRetry: false, hasDelay: false },
    ],
  );
});
