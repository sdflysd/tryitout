import assert from "node:assert/strict";
import test from "node:test";

import { hashPassword, verifyPassword } from "./passwords.js";

test("password hashing uses a salted non-plaintext format", async () => {
  const hash = await hashPassword("correct horse battery staple");

  assert.match(hash, /^scrypt:v1:/);
  assert.doesNotMatch(hash, /correct horse battery staple/);
  assert.notEqual(hash, await hashPassword("correct horse battery staple"));
});

test("password verification accepts correct password and rejects incorrect password", async () => {
  const hash = await hashPassword("s3cret-passphrase");

  assert.equal(await verifyPassword("s3cret-passphrase", hash), true);
  assert.equal(await verifyPassword("wrong-passphrase", hash), false);
  assert.equal(await verifyPassword("s3cret-passphrase", "not-a-valid-hash"), false);
});
