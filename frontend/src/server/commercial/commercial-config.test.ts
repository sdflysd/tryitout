import assert from "node:assert/strict";
import test from "node:test";

import { resolveCommercialConfig } from "./commercial-config.js";

test("commercial mode is disabled by default", () => {
  const config = resolveCommercialConfig({});
  assert.equal(config.enabled, false);
});

test("commercial mode requires production backing services and secrets", () => {
  assert.throws(
    () => resolveCommercialConfig({ COMMERCIAL_MODE_ENABLED: "true" }),
    /DATABASE_URL.*REDIS_URL.*SESSION_SECRET.*ACCESS_CODE_PEPPER.*USER_SECRET_ENCRYPTION_KEY/s,
  );
});

test("commercial mode resolves required URLs and numeric budgets", () => {
  const config = resolveCommercialConfig({
    COMMERCIAL_MODE_ENABLED: "true",
    DATABASE_URL: "postgres://tryitout:test@localhost:5432/tryitout",
    REDIS_URL: "redis://localhost:6379",
    SESSION_SECRET: "session-secret-with-at-least-32-characters",
    ACCESS_CODE_PEPPER: "pepper-with-at-least-32-characters",
    USER_SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
    MAX_WEIGHTED_CONCURRENCY: "12",
  });

  assert.equal(config.enabled, true);
  assert.equal(config.maxWeightedConcurrency, 12);
});

test("commercial mode requires a base64 encoded 32-byte user secret encryption key", () => {
  assert.throws(
    () =>
      resolveCommercialConfig({
        COMMERCIAL_MODE_ENABLED: "true",
        DATABASE_URL: "postgres://tryitout:test@localhost:5432/tryitout",
        REDIS_URL: "redis://localhost:6379",
        SESSION_SECRET: "session-secret-with-at-least-32-characters",
        ACCESS_CODE_PEPPER: "pepper-with-at-least-32-characters",
        USER_SECRET_ENCRYPTION_KEY: Buffer.alloc(31, 1).toString("base64"),
      }),
    /USER_SECRET_ENCRYPTION_KEY.*32 bytes/,
  );
});

test("commercial mode rejects malformed user secret encryption key base64", () => {
  assert.throws(
    () =>
      resolveCommercialConfig({
        COMMERCIAL_MODE_ENABLED: "true",
        DATABASE_URL: "postgres://tryitout:test@localhost:5432/tryitout",
        REDIS_URL: "redis://localhost:6379",
        SESSION_SECRET: "session-secret-with-at-least-32-characters",
        ACCESS_CODE_PEPPER: "pepper-with-at-least-32-characters",
        USER_SECRET_ENCRYPTION_KEY: `${Buffer.alloc(32, 1).toString("base64")}!`,
      }),
    /USER_SECRET_ENCRYPTION_KEY.*base64/,
  );
});
