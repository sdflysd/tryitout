import assert from "node:assert/strict";
import test from "node:test";

import {
  decryptSecret,
  encryptSecret,
  maskSecret,
} from "./secrets.js";

const MASTER_KEY = Buffer.alloc(32, 7);

test("AES-256-GCM encryption round-trips without storing plaintext", () => {
  const plaintext = "sk-live-sensitive-provider-key";
  const encrypted = encryptSecret(plaintext, MASTER_KEY, {
    randomBytes: (length) => Buffer.alloc(length, 1),
  });

  assert.match(encrypted, /^v1:/);
  assert.equal(encrypted.includes(plaintext), false);
  assert.equal(decryptSecret(encrypted, MASTER_KEY), plaintext);
});

test("secret encryption rejects invalid master key length and tampering", () => {
  assert.throws(
    () => encryptSecret("secret", Buffer.alloc(31)),
    /32-byte/,
  );
  const encrypted = encryptSecret("secret", MASTER_KEY, {
    randomBytes: (length) => Buffer.alloc(length, 2),
  });

  assert.throws(
    () => decryptSecret(encrypted, Buffer.alloc(31)),
    /32-byte/,
  );
  assert.throws(
    () => decryptSecret(`${encrypted.slice(0, -2)}aa`, MASTER_KEY),
    /decrypt secret/,
  );
});

test("maskSecret returns only prefix and suffix", () => {
  assert.equal(maskSecret("sk-live-abcdef1234567890"), "sk-liv...7890");
  assert.equal(maskSecret("short"), "*****");
});
