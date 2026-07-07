type CommercialEnv = NodeJS.ProcessEnv | Record<string, string | undefined>;

export type CommercialConfig =
  | {
      enabled: false;
      maxWeightedConcurrency: number;
    }
  | {
      enabled: true;
      databaseUrl: string;
      redisUrl: string;
      sessionSecret: string;
      accessCodePepper: string;
      userSecretEncryptionKey: Buffer;
      maxWeightedConcurrency: number;
    };

const REQUIRED_COMMERCIAL_ENV_KEYS = [
  "DATABASE_URL",
  "REDIS_URL",
  "SESSION_SECRET",
  "ACCESS_CODE_PEPPER",
  "USER_SECRET_ENCRYPTION_KEY",
] as const;

const DEFAULT_MAX_WEIGHTED_CONCURRENCY = 30;

export function resolveCommercialConfig(env: CommercialEnv): CommercialConfig {
  const maxWeightedConcurrency = resolveMaxWeightedConcurrency(env.MAX_WEIGHTED_CONCURRENCY);

  if (env.COMMERCIAL_MODE_ENABLED !== "true") {
    return {
      enabled: false,
      maxWeightedConcurrency,
    };
  }

  const missingKeys = REQUIRED_COMMERCIAL_ENV_KEYS.filter((key) => !env[key]);
  if (missingKeys.length > 0) {
    throw new Error(`Commercial mode requires ${missingKeys.join(", ")}`);
  }

  const databaseUrl = requireEnvValue(env, "DATABASE_URL");
  const redisUrl = requireEnvValue(env, "REDIS_URL");
  const sessionSecret = requireEnvValue(env, "SESSION_SECRET");
  const accessCodePepper = requireEnvValue(env, "ACCESS_CODE_PEPPER");
  const userSecretEncryptionKey = decodeUserSecretEncryptionKey(
    requireEnvValue(env, "USER_SECRET_ENCRYPTION_KEY"),
  );

  validateUrl(databaseUrl, "DATABASE_URL");
  validateUrl(redisUrl, "REDIS_URL");

  return {
    enabled: true,
    databaseUrl,
    redisUrl,
    sessionSecret,
    accessCodePepper,
    userSecretEncryptionKey,
    maxWeightedConcurrency,
  };
}

function requireEnvValue<T extends (typeof REQUIRED_COMMERCIAL_ENV_KEYS)[number]>(
  env: CommercialEnv,
  key: T,
): string {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required commercial environment variable: ${key}`);
  }

  return value;
}

function validateUrl(value: string, key: string): void {
  try {
    new URL(value);
  } catch {
    throw new Error(`${key} must be a valid URL`);
  }
}

function decodeUserSecretEncryptionKey(value: string): Buffer {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error("USER_SECRET_ENCRYPTION_KEY must be valid base64");
  }

  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 32) {
    throw new Error("USER_SECRET_ENCRYPTION_KEY must decode to 32 bytes");
  }

  return decoded;
}

function resolveMaxWeightedConcurrency(value: string | undefined): number {
  if (!value) {
    return DEFAULT_MAX_WEIGHTED_CONCURRENCY;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("MAX_WEIGHTED_CONCURRENCY must be a positive integer");
  }

  return parsed;
}
