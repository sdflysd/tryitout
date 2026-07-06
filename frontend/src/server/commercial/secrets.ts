import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const MASTER_KEY_LENGTH = 32;

export class SecretEncryptionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SecretEncryptionError";
  }
}

export function parseMasterKey(masterKeyBase64: string): Buffer {
  let key: Buffer;
  try {
    key = Buffer.from(masterKeyBase64, "base64");
  } catch {
    throw new SecretEncryptionError("invalid_master_key", "Master key must decode to 32 bytes.");
  }
  if (key.length !== MASTER_KEY_LENGTH) {
    throw new SecretEncryptionError("invalid_master_key", "Master key must decode to 32 bytes.");
  }
  return key;
}

export function encryptSecret(plaintext: string, masterKeyBase64: string): string {
  const key = parseMasterKey(masterKeyBase64);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptSecret(payload: string, masterKeyBase64: string): string {
  const key = parseMasterKey(masterKeyBase64);
  const [version, ivPart, tagPart, ciphertextPart, ...extra] = payload.split(":");
  if (
    version !== "v1" ||
    !ivPart ||
    !tagPart ||
    !ciphertextPart ||
    extra.length > 0
  ) {
    throw new SecretEncryptionError("invalid_secret_payload", "Encrypted secret payload is malformed.");
  }

  try {
    const iv = Buffer.from(ivPart, "base64url");
    const tag = Buffer.from(tagPart, "base64url");
    const ciphertext = Buffer.from(ciphertextPart, "base64url");
    if (iv.length !== IV_LENGTH || tag.length === 0 || ciphertext.length === 0) {
      throw new Error("invalid payload parts");
    }
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new SecretEncryptionError("invalid_secret_payload", "Encrypted secret payload is malformed.");
  }
}
