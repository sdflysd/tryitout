import assert from "node:assert/strict";
import test from "node:test";

import { hashPassword, verifyPassword } from "./passwords.js";

test("password hashes are salted and do not include the plaintext password", async () => {
  const password = "correct horse battery staple";

  const firstHash = await hashPassword(password);
  const secondHash = await hashPassword(password);

  assert.notEqual(firstHash, password);
  assert.notEqual(secondHash, password);
  assert.equal(firstHash.includes(password), false);
  assert.equal(secondHash.includes(password), false);
  assert.notEqual(firstHash, secondHash);
});

test("password verification accepts the correct password and rejects the wrong password", async () => {
  const passwordHash = await hashPassword("commercial-secret");

  assert.equal(await verifyPassword("commercial-secret", passwordHash), true);
  assert.equal(await verifyPassword("wrong-commercial-secret", passwordHash), false);
});
