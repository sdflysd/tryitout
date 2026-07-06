import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt:v1:${salt.toString("base64url")}:${derivedKey.toString("base64url")}`;
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  const parsed = parsePasswordHash(passwordHash);
  if (!parsed) {
    return false;
  }

  const derivedKey = (await scrypt(password, parsed.salt, parsed.key.length)) as Buffer;
  return timingSafeEqual(derivedKey, parsed.key);
}

function parsePasswordHash(passwordHash: string): { salt: Buffer; key: Buffer } | undefined {
  const [algorithm, version, salt, key] = passwordHash.split(":");
  if (algorithm !== "scrypt" || version !== "v1" || !salt || !key) {
    return undefined;
  }

  try {
    return {
      salt: Buffer.from(salt, "base64url"),
      key: Buffer.from(key, "base64url"),
    };
  } catch {
    return undefined;
  }
}
