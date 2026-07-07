import { createHmac, randomBytes } from "node:crypto";

const SESSION_TOKEN_BYTES = 32;
const SESSION_TOKEN_HASH_ALGORITHM = "hmac-sha256";

export function createSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
}

export function hashSessionToken(token: string, sessionSecret: string): string {
  const digest = createHmac("sha256", sessionSecret).update(token).digest("hex");
  return `${SESSION_TOKEN_HASH_ALGORITHM}$${digest}`;
}
