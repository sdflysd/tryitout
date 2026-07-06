import assert from "node:assert/strict";
import test from "node:test";

import {
  SecretEncryptionError,
  decryptSecret,
  encryptSecret,
  parseMasterKey,
} from "./secrets.js";

const masterKey = Buffer.alloc(32, 7).toString("base64");

test("encryptSecret encrypts plaintext API keys without storing plaintext", () => {
  const ciphertext = encryptSecret("sk-test-123", masterKey);

  assert.match(ciphertext, /^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
  assert.doesNotMatch(ciphertext, /sk-test-123/);
});

test("decryptSecret decrypts payloads with the same master key", () => {
  const ciphertext = encryptSecret("sk-live-secret", masterKey);

  assert.equal(decryptSecret(ciphertext, masterKey), "sk-live-secret");
});

test("parseMasterKey rejects invalid master key length", () => {
  assert.throws(
    () => parseMasterKey(Buffer.alloc(16, 1).toString("base64")),
    new SecretEncryptionError("invalid_master_key", "Master key must decode to 32 bytes."),
  );
});

test("decryptSecret rejects malformed payloads", () => {
  assert.throws(
    () => decryptSecret("not-a-payload", masterKey),
    new SecretEncryptionError("invalid_secret_payload", "Encrypted secret payload is malformed."),
  );
  assert.throws(
    () => decryptSecret("v1:not-base64:not-base64:not-base64", masterKey),
    SecretEncryptionError,
  );
});
