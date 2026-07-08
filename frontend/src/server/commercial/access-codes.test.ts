import assert from "node:assert/strict";
import test from "node:test";

import {
  generateAccessCode,
  hashAccessCode,
  maskAccessCode,
  normalizeAccessCode,
  verifyAccessCodeHash,
} from "./access-codes.js";

test("access-code generation produces grouped TIO codes", () => {
  const code = generateAccessCode();

  assert.match(code, /^TIO-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
});

test("access-code hashing uses pepper and normalized code", () => {
  const hash = hashAccessCode(" tio-abcd-1234-wxyz ", "pepper-one");

  assert.equal(hash, hashAccessCode("TIO-ABCD-1234-WXYZ", "pepper-one"));
  assert.notEqual(hash, hashAccessCode("TIO-ABCD-1234-WXYZ", "pepper-two"));
  assert.match(hash, /^sha256:v1:/);
});

test("access-code verification is timing-safe and normalized", () => {
  const hash = hashAccessCode("TIO-ABCD-1234-WXYZ", "pepper");

  assert.equal(verifyAccessCodeHash("tio-abcd-1234-wxyz", hash, "pepper"), true);
  assert.equal(verifyAccessCodeHash("TIO-ABCD-1234-0000", hash, "pepper"), false);
  assert.equal(verifyAccessCodeHash("TIO-ABCD-1234-WXYZ", "not-a-valid-hash", "pepper"), false);
});

test("access-code masking hides the middle group", () => {
  assert.equal(maskAccessCode("TIO-ABCD-1234-WXYZ"), "TIO-ABCD-****-WXYZ");
  assert.equal(normalizeAccessCode(" tio abcd-1234 wxyz "), "TIO-ABCD-1234-WXYZ");
});
