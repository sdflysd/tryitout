import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
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

  assert.match(code, /^TIO-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
});

test("access-code normalization is case-insensitive and removes separators", () => {
  assert.equal(normalizeAccessCode("tio-abcd efgh-1234"), "TIOABCDEFGH1234");
});

test("access-code hashing uses the pepper and verifies equivalent normalized codes", () => {
  const code = "TIO-ABCD-EFGH-2345";
  const pepper = "access-code-pepper-with-at-least-32-characters";

  const hash = hashAccessCode(code, pepper);

  assert.notEqual(hash, code);
  assert.equal(hash.includes(normalizeAccessCode(code)), false);
  assert.notEqual(hash, hashAccessCode(code, `${pepper}-different`));
  assert.equal(verifyAccessCode("tio abcd-efgh 2345", hash, pepper), true);
  assert.equal(verifyAccessCode("TIO-ABCD-EFGH-9999", hash, pepper), false);
});

test("access-code hashing rejects non-canonical access codes", () => {
  const pepper = "access-code-pepper-with-at-least-32-characters";

  for (const [name, code] of [
    ["empty input", ""],
    ["wrong prefix", "ABC-ABCD-EFGH-2345"],
    ["wrong length", "TIO-ABCD-EFGH-234"],
    ["ambiguous I", "TIO-ABCI-EFGH-2345"],
    ["ambiguous O", "TIO-ABCO-EFGH-2345"],
    ["ambiguous 0", "TIO-ABC0-EFGH-2345"],
    ["ambiguous 1", "TIO-ABC1-EFGH-2345"],
  ] as const) {
    assert.throws(
      () => hashAccessCode(code, pepper),
      /Invalid access code/,
      name,
    );
  }
});

test("access-code verification rejects non-canonical access codes", () => {
  const pepper = "access-code-pepper-with-at-least-32-characters";

  for (const [name, candidate] of [
    ["empty input", ""],
    ["wrong prefix", "ABC-ABCD-EFGH-2345"],
    ["wrong length", "TIO-ABCD-EFGH-234"],
    ["ambiguous I", "TIO-ABCI-EFGH-2345"],
    ["ambiguous O", "TIO-ABCO-EFGH-2345"],
    ["ambiguous 0", "TIO-ABC0-EFGH-2345"],
    ["ambiguous 1", "TIO-ABC1-EFGH-2345"],
  ] as const) {
    const hash = legacyHashAccessCode(candidate, pepper);

    assert.equal(verifyAccessCode(candidate, hash, pepper), false, name);
  }
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
  const code = "TIO-ABCD-EFGH-2345";
  const mask = maskAccessCode(code);

  assert.match(mask, /^TIO-/);
  assert.match(mask, /2345$/);
  assert.equal(mask.includes("ABCD"), false);
  assert.equal(mask.includes("EFGH"), false);
  assert.notEqual(mask, code);
});

test("access-code masking returns a fixed mask for malformed or short values", () => {
  for (const [name, code] of [
    ["empty input", ""],
    ["wrong prefix", "ABC-ABCD-EFGH-2345"],
    ["wrong length", "TIO-ABCD-EFGH-234"],
    ["ambiguous I", "TIO-ABCI-EFGH-2345"],
    ["short meaningful input", "TIO-ABCD"],
  ] as const) {
    assert.equal(maskAccessCode(code), "TIO-****-****-****", name);
  }
});

function legacyHashAccessCode(code: string, pepper: string): string {
  const digest = createHmac("sha256", pepper)
    .update(normalizeAccessCode(code))
    .digest("hex");

  return `hmac-sha256$${digest}`;
}
