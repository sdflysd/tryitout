import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

const ACCESS_CODE_PREFIX = "TIO";
const ACCESS_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ACCESS_CODE_RANDOM_LENGTH = 12;
const ACCESS_CODE_HASH_ALGORITHM = "hmac-sha256";

export function generateAccessCode(): string {
  let randomPart = "";
  for (let index = 0; index < ACCESS_CODE_RANDOM_LENGTH; index += 1) {
    randomPart += ACCESS_CODE_ALPHABET[randomInt(ACCESS_CODE_ALPHABET.length)];
  }

  return formatAccessCode(`${ACCESS_CODE_PREFIX}${randomPart}`);
}

export function normalizeAccessCode(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function formatAccessCode(normalized: string): string {
  const normalizedCode = normalizeAccessCode(normalized);
  const prefix = normalizedCode.slice(0, ACCESS_CODE_PREFIX.length);
  const firstGroup = normalizedCode.slice(3, 7);
  const secondGroup = normalizedCode.slice(7, 11);
  const thirdGroup = normalizedCode.slice(11, 15);

  return [prefix, firstGroup, secondGroup, thirdGroup].filter(Boolean).join("-");
}

export function hashAccessCode(code: string, pepper: string): string {
  const normalizedCode = normalizeAccessCode(code);
  const digest = createHmac("sha256", pepper).update(normalizedCode).digest("hex");
  return `${ACCESS_CODE_HASH_ALGORITHM}$${digest}`;
}

export function verifyAccessCode(
  code: string,
  hash: string,
  pepper: string,
): boolean {
  const expectedHash = hashAccessCode(code, pepper);
  return timingSafeStringEqual(expectedHash, hash);
}

export function maskAccessCode(code: string): string {
  const normalizedCode = normalizeAccessCode(code);
  const suffix = normalizedCode.slice(-4);

  return `${ACCESS_CODE_PREFIX}-****-****-${suffix}`;
}

function timingSafeStringEqual(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  const byteLength = Math.max(expectedBuffer.length, actualBuffer.length);
  const paddedExpected = Buffer.alloc(byteLength);
  const paddedActual = Buffer.alloc(byteLength);

  expectedBuffer.copy(paddedExpected);
  actualBuffer.copy(paddedActual);

  return timingSafeEqual(paddedExpected, paddedActual) && expectedBuffer.length === actualBuffer.length;
}
