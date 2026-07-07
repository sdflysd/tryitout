import {
  createCipheriv,
  createDecipheriv,
  randomBytes as defaultRandomBytes,
} from "node:crypto";

const VERSION = "v1";
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export interface EncryptSecretOptions {
  randomBytes?: (length: number) => Buffer;
}

export function encryptSecret(
  plaintext: string,
  masterKey: Buffer | Uint8Array,
  options: EncryptSecretOptions = {},
): string {
  const key = validateMasterKey(masterKey);
  const randomBytes = options.randomBytes ?? defaultRandomBytes;
  const nonce = randomBytes(NONCE_BYTES);
  if (nonce.length !== NONCE_BYTES) {
    throw new Error("Secret encryption nonce must be 12 bytes");
  }

  const cipher = createCipheriv("aes-256-gcm", key, nonce, {
    authTagLength: TAG_BYTES,
  });
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    nonce.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptSecret(
  encrypted: string,
  masterKey: Buffer | Uint8Array,
): string {
  const key = validateMasterKey(masterKey);
  try {
    const parts = encrypted.split(":");
    if (parts.length !== 4 || parts[0] !== VERSION) {
      throw new Error("unsupported secret format");
    }
    const nonce = Buffer.from(parts[1]!, "base64url");
    const tag = Buffer.from(parts[2]!, "base64url");
    const ciphertext = Buffer.from(parts[3]!, "base64url");
    if (nonce.length !== NONCE_BYTES || tag.length !== TAG_BYTES) {
      throw new Error("invalid secret envelope");
    }

    const decipher = createDecipheriv("aes-256-gcm", key, nonce, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (error instanceof Error && /32-byte/.test(error.message)) {
      throw error;
    }
    throw new Error("Unable to decrypt secret");
  }
}

export function maskSecret(secret: string): string {
  if (secret.length < 12) {
    return "*".repeat(Math.max(secret.length, 1));
  }
  return `${secret.slice(0, 6)}...${secret.slice(-4)}`;
}

function validateMasterKey(masterKey: Buffer | Uint8Array): Buffer {
  const key = Buffer.from(masterKey);
  if (key.length !== 32) {
    throw new Error("Secret master key must be a 32-byte AES-256 key");
  }
  return key;
}
