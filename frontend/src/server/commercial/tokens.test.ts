import assert from "node:assert/strict";
import test from "node:test";

import { createSessionToken, hashSessionToken } from "./tokens.js";

test("session tokens are random raw values suitable for client storage", () => {
  const firstToken = createSessionToken();
  const secondToken = createSessionToken();

  assert.match(firstToken, /^[A-Za-z0-9_-]+$/);
  assert.match(secondToken, /^[A-Za-z0-9_-]+$/);
  assert.ok(firstToken.length >= 43);
  assert.notEqual(firstToken, secondToken);
});

test("session token hashing stores only a deterministic hash", () => {
  const sessionSecret = "session-secret-with-at-least-32-characters";
  const token = createSessionToken();

  const firstHash = hashSessionToken(token, sessionSecret);
  const secondHash = hashSessionToken(token, sessionSecret);

  assert.equal(firstHash, secondHash);
  assert.notEqual(firstHash, token);
  assert.equal(firstHash.includes(token), false);
});

test("session token hashing uses the session secret", () => {
  const token = createSessionToken();

  assert.notEqual(
    hashSessionToken(token, "session-secret-one-with-at-least-32-characters"),
    hashSessionToken(token, "session-secret-two-with-at-least-32-characters"),
  );
});
