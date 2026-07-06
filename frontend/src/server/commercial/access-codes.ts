import { createHash, randomInt, timingSafeEqual } from "node:crypto";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateAccessCode(): string {
  return `TIO-${generateGroup()}-${generateGroup()}-${generateGroup()}`;
}

export function normalizeAccessCode(code: string): string {
  const compact = code
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "");

  const withoutPrefix = compact.startsWith("TIO") ? compact.slice(3) : compact;
  const body = withoutPrefix.slice(0, 12);
  const groups = [body.slice(0, 4), body.slice(4, 8), body.slice(8, 12)].filter(Boolean);
  return `TIO-${groups.join("-")}`;
}

export function hashAccessCode(code: string, pepper: string): string {
  const digest = createHash("sha256")
    .update(normalizeAccessCode(code), "utf8")
    .update("\0")
    .update(pepper, "utf8")
    .digest("base64url");
  return `sha256:v1:${digest}`;
}

export function verifyAccessCodeHash(code: string, expectedHash: string, pepper: string): boolean {
  const actualHash = hashAccessCode(code, pepper);
  const actual = Buffer.from(actualHash, "utf8");
  const expected = Buffer.from(expectedHash, "utf8");
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

export function maskAccessCode(code: string): string {
  const normalized = normalizeAccessCode(code);
  const parts = normalized.split("-");
  if (parts.length !== 4) {
    return normalized;
  }
  return `${parts[0]}-${parts[1]}-****-${parts[3]}`;
}

function generateGroup(): string {
  let group = "";
  for (let index = 0; index < 4; index += 1) {
    group += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  }
  return group;
}
