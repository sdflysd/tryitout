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

test("password verification rejects non-canonical base64url salt and hash segments", async () => {
  const password = "commercial-secret";
  const passwordHash = await hashPassword(password);
  const parts = passwordHash.split("$");
  const saltIndex = 4;
  const hashIndex = 5;

  for (const [name, segmentIndex, suffix] of [
    ["salt with invalid character", saltIndex, "!"],
    ["salt with padding", saltIndex, "="],
    ["salt with trailing junk", saltIndex, "."],
    ["hash with invalid character", hashIndex, "!"],
    ["hash with padding", hashIndex, "="],
    ["hash with trailing junk", hashIndex, "."],
  ] as const) {
    const tamperedParts = [...parts];
    tamperedParts[segmentIndex] = `${tamperedParts[segmentIndex]}${suffix}`;

    assert.equal(
      await verifyPassword(password, tamperedParts.join("$")),
      false,
      name,
    );
  }
});
