import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { promisify } from "node:util";

const PASSWORD_ALGORITHM = "scrypt";
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_HASH_BYTES = 64;

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(PASSWORD_SALT_BYTES);
  const passwordHash = await derivePasswordHash(password, salt);

  return [
    PASSWORD_ALGORITHM,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64url"),
    passwordHash.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  const parsedHash = parsePasswordHash(passwordHash);
  if (!parsedHash) {
    return false;
  }

  const candidateHash = await derivePasswordHash(password, parsedHash.salt);
  return timingSafeEqual(candidateHash, parsedHash.hash);
}

async function derivePasswordHash(password: string, salt: Buffer): Promise<Buffer> {
  return scrypt(password, salt, PASSWORD_HASH_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
}

function parsePasswordHash(
  passwordHash: string,
): { salt: Buffer; hash: Buffer } | undefined {
  const parts = passwordHash.split("$");
  if (parts.length !== 6) {
    return undefined;
  }

  const [algorithm, n, r, p, saltEncoded, hashEncoded] = parts;
  if (
    algorithm !== PASSWORD_ALGORITHM ||
    n !== String(SCRYPT_N) ||
    r !== String(SCRYPT_R) ||
    p !== String(SCRYPT_P) ||
    !saltEncoded ||
    !hashEncoded
  ) {
    return undefined;
  }

  const salt = Buffer.from(saltEncoded, "base64url");
  const hash = Buffer.from(hashEncoded, "base64url");
  if (salt.length !== PASSWORD_SALT_BYTES || hash.length !== PASSWORD_HASH_BYTES) {
    return undefined;
  }

  return { salt, hash };
}
