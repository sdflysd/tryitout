import assert from "node:assert/strict";
import test from "node:test";

import {
  generateAccessCode,
  hashAccessCode,
  maskAccessCode,
  normalizeAccessCode,
  verifyAccessCode,
} from "./access-code-secrets.js";

test("access-code generation creates formatted TIO codes", () => {
  const code = generateAccessCode();

  assert.match(code, /^TIO-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
});

test("access-code normalization is case-insensitive and removes separators", () => {
  assert.equal(normalizeAccessCode("tio-abcd efgh-1234"), "TIOABCDEFGH1234");
});

test("access-code hashing uses the pepper and verifies equivalent normalized codes", () => {
  const code = "TIO-ABCD-EFGH-1234";
  const pepper = "access-code-pepper-with-at-least-32-characters";

  const hash = hashAccessCode(code, pepper);

  assert.notEqual(hash, code);
  assert.equal(hash.includes(normalizeAccessCode(code)), false);
  assert.notEqual(hash, hashAccessCode(code, `${pepper}-different`));
  assert.equal(verifyAccessCode("tio abcd-efgh 1234", hash, pepper), true);
  assert.equal(verifyAccessCode("TIO-ABCD-EFGH-9999", hash, pepper), false);
});

test("access-code verification safely rejects hashes with incompatible lengths", () => {
  assert.equal(
    verifyAccessCode(
      "TIO-ABCD-EFGH-1234",
      "sha256$too-short",
      "access-code-pepper-with-at-least-32-characters",
    ),
    false,
  );
});

test("access-code masking returns prefix and suffix without exposing the full code", () => {
  const code = "TIO-ABCD-EFGH-1234";
  const mask = maskAccessCode(code);

  assert.match(mask, /^TIO-/);
  assert.match(mask, /1234$/);
  assert.equal(mask.includes("ABCD"), false);
  assert.equal(mask.includes("EFGH"), false);
  assert.notEqual(mask, code);
});
