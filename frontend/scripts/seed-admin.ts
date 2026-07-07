import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";
import { Pool, type PoolClient, type PoolConfig } from "pg";

import {
  COMMERCIAL_FEATURES,
  USER_TIERS,
  type CommercialFeature,
  type UserRole,
  type UserTier,
} from "../src/contracts/commercial.js";
import { hashPassword as defaultHashPassword } from "../src/server/commercial/passwords.js";
import {
  PostgresCommercialRepository,
  type AcquiredQueryClient,
  type QueryClient,
} from "../src/server/commercial/postgres-repository.js";
import type { CommercialRepository } from "../src/server/commercial/repository.js";
import type {
  CommercialUserRecord,
  UserCreditAccountRecord,
} from "../src/server/commercial/types.js";

export interface SeedAdminInput {
  email: string;
  password: string;
  role: Extract<UserRole, "admin" | "owner">;
  tier: UserTier;
  features: CommercialFeature[];
  initialCredits?: number;
}

export interface SeedAdminDeps {
  repository: CommercialRepository;
  now?: () => Date | string;
  createId?: (prefix?: string) => string;
  hashPassword?: (password: string) => Promise<string>;
}

export interface SeedAdminResult {
  created: boolean;
  user: Omit<CommercialUserRecord, "passwordHash">;
  account: UserCreditAccountRecord;
}

export async function seedAdminUser(
  input: SeedAdminInput,
  deps: SeedAdminDeps,
): Promise<SeedAdminResult> {
  const email = input.email.trim();
  validateEmail(email);
  validatePassword(input.password);
  validateAdminRole(input.role);
  validateTier(input.tier);
  validateFeatures(input.features);
  const initialCredits = input.initialCredits ?? 0;
  if (!Number.isInteger(initialCredits) || initialCredits < 0) {
    throw new Error("Initial credits must be a non-negative integer");
  }

  const now = currentIso(deps.now);
  const emailNormalized = normalizeEmail(email);
  const existing = await deps.repository.findUserByEmail(emailNormalized);
  if (existing !== undefined) {
    const updated: CommercialUserRecord = {
      ...existing,
      role: input.role,
      tier: input.tier,
      status: "active",
      features: [...input.features],
      updatedAt: now,
    };
    await deps.repository.saveUser(updated);
    const account =
      (await deps.repository.getCreditAccount(existing.id)) ??
      createCreditAccount(existing.id, initialCredits, now);
    if ((await deps.repository.getCreditAccount(existing.id)) === undefined) {
      await deps.repository.saveCreditAccount(account);
    }
    return {
      created: false,
      user: toPublicUser(updated),
      account,
    };
  }

  const createId = deps.createId ?? ((prefix = "id") => `${prefix}_${randomUUID()}`);
  const user: CommercialUserRecord = {
    id: createId("user"),
    email,
    emailNormalized,
    passwordHash: await (deps.hashPassword ?? defaultHashPassword)(input.password),
    role: input.role,
    tier: input.tier,
    status: "active",
    features: [...input.features],
    createdAt: now,
    updatedAt: now,
  };
  const account = createCreditAccount(user.id, initialCredits, now);
  await deps.repository.createUserWithCreditAccount(user, account);

  return {
    created: true,
    user: toPublicUser(user),
    account,
  };
}

export function parseSeedAdminEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): SeedAdminInput {
  const email = requireEnv(env, "ADMIN_EMAIL");
  const password = requireEnv(env, "ADMIN_PASSWORD");
  const role = parseRole(env.ADMIN_ROLE ?? "owner");
  const tier = parseTier(env.ADMIN_TIER ?? "business");
  const features = parseFeatures(env.ADMIN_FEATURES ?? "admin_ops");
  const initialCredits = parseInitialCredits(env.ADMIN_INITIAL_CREDITS);

  return {
    email,
    password,
    role,
    tier,
    features,
    initialCredits,
  };
}

export async function runSeedAdminCli(
  env: NodeJS.ProcessEnv = process.env,
): Promise<SeedAdminResult> {
  config();
  const databaseUrl = requireEnv(env, "DATABASE_URL");
  const pool = new Pool({ connectionString: databaseUrl } satisfies PoolConfig);
  const repository = new PostgresCommercialRepository(new PoolQueryClient(pool));
  try {
    const result = await seedAdminUser(parseSeedAdminEnv(env), { repository });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result;
  } finally {
    await pool.end();
  }
}

function createCreditAccount(
  userId: string,
  initialCredits: number,
  updatedAt: string,
): UserCreditAccountRecord {
  return {
    userId,
    balance: initialCredits,
    frozenCredits: 0,
    totalRedeemed: initialCredits,
    totalCaptured: 0,
    updatedAt,
  };
}

function toPublicUser(
  user: CommercialUserRecord,
): Omit<CommercialUserRecord, "passwordHash"> {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}

function parseRole(value: string): Extract<UserRole, "admin" | "owner"> {
  if (value !== "admin" && value !== "owner") {
    throw new Error("ADMIN_ROLE must be admin or owner");
  }
  return value;
}

function parseTier(value: string): UserTier {
  if (!USER_TIERS.includes(value as UserTier)) {
    throw new Error("ADMIN_TIER must be basic, pro, or business");
  }
  return value as UserTier;
}

function parseFeatures(value: string): CommercialFeature[] {
  const features = value
    .split(",")
    .map((feature) => feature.trim())
    .filter(Boolean);
  for (const feature of features) {
    if (!COMMERCIAL_FEATURES.includes(feature as CommercialFeature)) {
      throw new Error(`Unknown commercial feature: ${feature}`);
    }
  }
  return features as CommercialFeature[];
}

function parseInitialCredits(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return 0;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("ADMIN_INITIAL_CREDITS must be a non-negative integer");
  }
  return parsed;
}

function validateEmail(email: string): void {
  if (!email || !email.includes("@")) {
    throw new Error("Admin email is invalid");
  }
}

function validatePassword(password: string): void {
  if (!password.trim()) {
    throw new Error("Admin password is required");
  }
}

function validateAdminRole(role: UserRole): void {
  if (role !== "admin" && role !== "owner") {
    throw new Error("Admin seed role must be admin or owner");
  }
}

function validateTier(tier: UserTier): void {
  if (!USER_TIERS.includes(tier)) {
    throw new Error("Admin seed tier is invalid");
  }
}

function validateFeatures(features: CommercialFeature[]): void {
  for (const feature of features) {
    if (!COMMERCIAL_FEATURES.includes(feature)) {
      throw new Error(`Unknown commercial feature: ${feature}`);
    }
  }
}

function requireEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  key: string,
): string {
  const value = env[key];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${key} is required`);
  }
  return value;
}

function currentIso(now: SeedAdminDeps["now"]): string {
  const value = now?.() ?? new Date();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Current time is invalid");
  }
  return date.toISOString();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

class PoolQueryClient implements QueryClient {
  constructor(private readonly pool: Pool) {}

  async query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }> {
    const result = await this.pool.query<T>(sql, params);
    return { rows: [...result.rows] };
  }

  async connect(): Promise<AcquiredQueryClient> {
    return new PoolClientQueryClient(await this.pool.connect());
  }
}

class PoolClientQueryClient implements AcquiredQueryClient {
  constructor(private readonly client: PoolClient) {}

  async query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }> {
    const result = await this.client.query<T>(sql, params);
    return { rows: [...result.rows] };
  }

  release(): void {
    this.client.release();
  }
}

const isDirectRun =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  runSeedAdminCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`seed:admin failed: ${message}\n`);
    process.exitCode = 1;
  });
}
