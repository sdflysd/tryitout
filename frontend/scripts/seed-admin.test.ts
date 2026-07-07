import assert from "node:assert/strict";
import test from "node:test";

import type {
  CommercialFeature,
  UserTier,
} from "../src/contracts/commercial.js";
import { InMemoryCommercialRepository } from "../src/server/commercial/repository.js";
import type { CommercialUserRecord } from "../src/server/commercial/types.js";
import {
  buildAccessCodeBatchExport,
  serializeAccessCodeBatchExport,
} from "./export-access-code-batch.js";
import {
  parseSeedAdminEnv,
  seedAdminUser,
} from "./seed-admin.js";

const NOW = "2026-07-07T00:00:00.000Z";

test("seedAdminUser creates an owner user and credit account without returning password hash", async () => {
  const repository = new InMemoryCommercialRepository();

  const result = await seedAdminUser(
    {
      email: "Owner@Example.test",
      password: "super-secret-password",
      role: "owner",
      tier: "business",
      features: ["admin_ops", "deep_mode", "priority_queue", "custom_model_provider"],
      initialCredits: 25,
    },
    createSeedDeps(repository),
  );
  const stored = await repository.findUserByEmail("owner@example.test");
  const account = await repository.getCreditAccount(result.user.id);

  assert.equal(result.created, true);
  assert.equal(result.user.emailNormalized, "owner@example.test");
  assert.equal(result.user.role, "owner");
  assert.equal(result.account.balance, 25);
  assert.equal(account?.balance, 25);
  assert.equal(stored?.passwordHash, "hashed:super-secret-password");
  assert.equal(JSON.stringify(result).includes("passwordHash"), false);
  assert.equal(JSON.stringify(result).includes("super-secret-password"), false);
});

test("seedAdminUser is idempotent by normalized email and upgrades existing admin fields", async () => {
  const repository = new InMemoryCommercialRepository();
  await seedAdminUser(
    {
      email: "Admin@Example.test",
      password: "first-password",
      role: "admin",
      tier: "pro",
      features: ["admin_ops"],
    },
    createSeedDeps(repository),
  );

  const second = await seedAdminUser(
    {
      email: " admin@example.test ",
      password: "second-password",
      role: "owner",
      tier: "business",
      features: ["admin_ops", "deep_mode"],
      initialCredits: 10,
    },
    createSeedDeps(repository),
  );
  const users = await repository.listUsers();
  const stored = await repository.findUserByEmail("ADMIN@example.test");

  assert.equal(second.created, false);
  assert.equal(users.length, 1);
  assert.equal(second.user.id, "user_1");
  assert.equal(stored?.role, "owner");
  assert.equal(stored?.tier, "business");
  assert.deepEqual(stored?.features, ["admin_ops", "deep_mode"]);
  assert.equal(stored?.passwordHash, "hashed:first-password");
  assert.equal(JSON.stringify(second).includes("second-password"), false);
});

test("parseSeedAdminEnv resolves defaults for owner/admin initialization", () => {
  assert.deepEqual(
    parseSeedAdminEnv({
      ADMIN_EMAIL: "owner@example.test",
      ADMIN_PASSWORD: "secret",
    }),
    {
      email: "owner@example.test",
      password: "secret",
      role: "owner",
      tier: "business",
      features: ["admin_ops"],
      initialCredits: 0,
    },
  );
});

test("access-code batch export includes only creation-time raw codes and strips sensitive fields", () => {
  const exported = buildAccessCodeBatchExport(
    {
      batch: {
        id: "batch_1",
        createdByUserId: "owner_1",
        name: "Launch",
        source: "founders",
        codeCount: 1,
        credits: 50,
        tier: "pro",
        features: ["deep_mode"],
        notes: "first batch",
        metadata: {
          campaign: "launch",
          secret: "metadata-secret",
        },
        createdAt: NOW,
        codeHash: "batch-hash-must-not-leak",
      },
      codes: [
        {
          id: "code_1",
          rawCode: "TIO-AAAA-BBBB-CCCC",
          codeMask: "TIO-****-****-CCCC",
          status: "active",
          credits: 50,
          tier: "pro",
          features: ["deep_mode"],
          createdAt: NOW,
          codeHash: "code-hash-must-not-leak",
          passwordHash: "password-hash-must-not-leak",
          secret: "code-secret-must-not-leak",
        },
      ],
      passwordHash: "payload-password-hash",
      secret: "payload-secret",
    },
    { exportedAt: NOW },
  );
  const serialized = serializeAccessCodeBatchExport(exported);

  assert.equal(exported.codes[0]?.rawCode, "TIO-AAAA-BBBB-CCCC");
  assert.equal(exported.codes[0]?.codeMask, "TIO-****-****-CCCC");
  assert.equal(serialized.includes("TIO-AAAA-BBBB-CCCC"), true);
  assert.equal(serialized.includes("codeHash"), false);
  assert.equal(serialized.includes("passwordHash"), false);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes("must-not-leak"), false);
});

test("access-code batch export refuses database-only records without raw creation payload", () => {
  assert.throws(
    () =>
      buildAccessCodeBatchExport(
        {
          batch: {
            id: "batch_1",
            name: "Stored batch",
            codeCount: 1,
            credits: 10,
            features: [],
            metadata: {},
            createdAt: NOW,
          },
          codes: [
            {
              id: "code_1",
              codeMask: "TIO-****-****-CCCC",
              codeHash: "db-hash",
              status: "active",
              credits: 10,
              features: [],
              createdAt: NOW,
            },
          ],
        },
        { exportedAt: NOW },
      ),
    /creation-time raw code payload/i,
  );
});

test("access-code batch export strips snake_case sensitive fields from creation payloads", () => {
  const exported = buildAccessCodeBatchExport(
    {
      batch: {
        id: "batch_1",
        name: "Launch",
        codeCount: 1,
        credits: 50,
        features: [],
        metadata: {
          code_hash: "snake-code-hash",
          password_hash: "snake-password-hash",
          api_key: "snake-api-key",
          nested: {
            encrypted_api_key: "snake-encrypted-api-key",
            token_hash: "snake-token-hash",
          },
        },
        createdAt: NOW,
      },
      codes: [
        {
          id: "code_1",
          rawCode: "TIO-AAAA-BBBB-CCCC",
          codeMask: "TIO-****-****-CCCC",
          status: "active",
          credits: 50,
          features: [],
          createdAt: NOW,
          code_hash: "snake-code-hash",
        },
      ],
    },
    { exportedAt: NOW },
  );
  const serialized = serializeAccessCodeBatchExport(exported);

  assert.equal(serialized.includes("snake-code-hash"), false);
  assert.equal(serialized.includes("snake-password-hash"), false);
  assert.equal(serialized.includes("snake-api-key"), false);
  assert.equal(serialized.includes("snake-encrypted-api-key"), false);
  assert.equal(serialized.includes("snake-token-hash"), false);
});

function createSeedDeps(repository: InMemoryCommercialRepository) {
  return {
    repository,
    now: () => NOW,
    createId: (prefix = "id") => `${prefix}_1`,
    hashPassword: async (password: string) => `hashed:${password}`,
  };
}

function _typeCheckFeature(_value: CommercialFeature): void {}
function _typeCheckTier(_value: UserTier): void {}
function _typeCheckUser(_value: CommercialUserRecord): void {}
