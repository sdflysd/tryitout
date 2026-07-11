import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryCommercialRepository } from "./repository.js";
import {
  ModelProviderService,
  ModelProviderServiceError,
} from "./model-provider-service.js";
import type { CommercialUserRecord } from "./types.js";

const MASTER_KEY = Buffer.alloc(32, 9);
const NOW = "2026-07-07T00:00:00.000Z";

test("basic users without BYOK entitlement cannot save their own API key provider", async () => {
  const { repo, service } = createScenario({
    randomBytes: (length) => Buffer.alloc(length, 2),
  });
  await repo.saveUser(makeUser({ tier: "basic", features: [] }));

  await assert.rejects(
    service.saveProvider({
      userId: "user_1",
      provider: "openai",
      displayName: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-basic-secret123456",
    }),
    (error) => hasProviderCode(error, "provider_not_allowed"),
  );
  assert.deepEqual(await repo.listUserModelProviders("user_1"), []);
});

test("expired BYOK entitlement grants cannot save API key providers", async () => {
  const { repo, service } = createScenario({
    randomBytes: (length) => Buffer.alloc(length, 2),
  });
  await repo.saveUser(makeUser({ tier: "basic", features: [] }));
  await repo.saveAccessCodeRedemption({
    id: "redemption_1",
    accessCodeId: "code_1",
    userId: "user_1",
    credits: 10,
    tierGranted: "business",
    featuresGranted: ["custom_model_provider"],
    entitlementStartsAt: "2026-07-01T00:00:00.000Z",
    entitlementExpiresAt: "2026-07-06T00:00:00.000Z",
    redeemedAt: "2026-07-01T00:00:00.000Z",
    metadata: {},
  });

  await assert.rejects(
    service.saveProvider({
      userId: "user_1",
      provider: "openai",
      displayName: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-basic-secret123456",
    }),
    (error) => hasProviderCode(error, "provider_not_allowed"),
  );
});

test("active BYOK entitlement grants allow API key providers without changing baseline rights", async () => {
  const { repo, service } = createScenario({
    randomBytes: (length) => Buffer.alloc(length, 2),
  });
  await repo.saveUser(makeUser({ tier: "basic", features: [] }));
  await repo.saveAccessCodeRedemption({
    id: "redemption_1",
    accessCodeId: "code_1",
    userId: "user_1",
    credits: 10,
    tierGranted: "business",
    featuresGranted: ["custom_model_provider"],
    entitlementStartsAt: "2026-07-01T00:00:00.000Z",
    entitlementExpiresAt: "2026-07-08T00:00:00.000Z",
    redeemedAt: "2026-07-01T00:00:00.000Z",
    metadata: {},
  });

  const saved = await service.saveProvider({
    userId: "user_1",
    provider: "openai",
    displayName: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-basic-secret123456",
  });

  assert.equal(saved.status, "active");
  assert.equal((await repo.getUser("user_1"))?.tier, "basic");
});

test("eligible users save encrypted provider keys and receive only masked DTOs", async () => {
  const { repo, service } = createScenario({
    randomBytes: (length) => Buffer.alloc(length, 1),
  });
  await repo.saveUser(makeUser({
    tier: "pro",
    features: ["custom_model_provider"],
  }));

  const saved = await service.saveProvider({
    userId: "user_1",
    provider: "openai",
    displayName: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-live-secret123456",
    modelFast: "gpt-fast",
    modelBalanced: "gpt-balanced",
    modelDeep: "gpt-deep",
  });
  const stored = (await repo.listUserModelProviders("user_1"))[0];

  assert.equal(saved.apiKeyMask, "sk-liv...3456");
  assert.equal("encryptedApiKey" in saved, false);
  assert.notEqual(stored?.encryptedApiKey, "sk-live-secret123456");
  assert.equal(stored?.encryptedApiKey.includes("sk-live-secret123456"), false);
  assert.deepEqual(await service.getPublicProvider("user_1"), saved);
});

test("blocked provider URLs are rejected before save", async () => {
  const { repo, service } = createScenario();
  await repo.saveUser(makeUser({
    tier: "business",
    features: ["custom_model_provider"],
  }));

  await assert.rejects(
    service.saveProvider({
      userId: "user_1",
      provider: "openai",
      displayName: "Unsafe",
      baseUrl: "https://127.0.0.1/v1",
      apiKey: "sk-secret",
    }),
    (error) => hasProviderCode(error, "unsafe_provider_url"),
  );
  assert.deepEqual(await repo.listUserModelProviders("user_1"), []);
});

test("provider test timeout is enforced and updates public status", async () => {
  const { repo, service } = createScenario({
    testProviderConnection: () =>
      new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 50)),
  });
  await repo.saveUser(makeUser({
    tier: "pro",
    features: ["custom_model_provider"],
  }));
  await service.saveProvider({
    userId: "user_1",
    provider: "openai",
    displayName: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-live-secret123456",
  });

  const tested = await service.testProviderConnection("user_1", {
    timeoutMs: 5,
  });

  assert.equal(tested.lastTestStatus, "failed");
  assert.equal(tested.lastTestedAt, NOW);
  assert.equal("encryptedApiKey" in tested, false);
});

test("provider test calls the configured BYOK provider models and exposes failure reason safely", async () => {
  const calls: unknown[] = [];
  const { repo, service } = createScenario({
    testProviderConnection: (input) => {
      calls.push(input);
      return Promise.resolve({ ok: false, error: "model grok-4.2 rejected test prompt" });
    },
  });
  await repo.saveUser(makeUser({
    tier: "pro",
    features: ["custom_model_provider"],
  }));
  await service.saveProvider({
    userId: "user_1",
    provider: "openai",
    displayName: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-live-secret123456",
    modelFast: "grok-4.2-fast",
    modelBalanced: "grok-4.2",
    modelDeep: "grok-4.2-deep",
  });

  const tested = await service.testProviderConnection("user_1");

  assert.deepEqual(calls, [
    {
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-live-secret123456",
      provider: "openai",
      models: {
        fast: "grok-4.2-fast",
        balanced: "grok-4.2",
        deep: "grok-4.2-deep",
      },
    },
  ]);
  assert.equal(tested.lastTestStatus, "failed");
  assert.equal(tested.lastTestError, "model grok-4.2 rejected test prompt");
  assert.equal(JSON.stringify(tested).includes("sk-live-secret123456"), false);
});

test("deleteProvider disables active BYOK provider and resolveProviderForTask falls back to platform", async () => {
  const { repo, service } = createScenario();
  await repo.saveUser(makeUser({
    tier: "business",
    features: ["custom_model_provider"],
  }));
  await service.saveProvider({
    userId: "user_1",
    provider: "openai",
    displayName: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-live-secret123456",
  });

  assert.equal((await service.resolveProviderForTask("user_1", "byok"))?.mode, "byok");
  const deleted = await service.deleteProvider("user_1");

  assert.equal(deleted.status, "disabled");
  assert.equal(await service.getPublicProvider("user_1"), undefined);
  assert.deepEqual(await service.resolveProviderForTask("user_1", "byok"), {
    mode: "platform",
  });
});

function createScenario(
  options: {
    randomBytes?: (length: number) => Buffer;
    testProviderConnection?: NonNullable<ConstructorParameters<typeof ModelProviderService>[0]["testProviderConnection"]>;
  } = {},
) {
  const repo = new InMemoryCommercialRepository();
  return {
    repo,
    service: new ModelProviderService({
      repository: repo,
      encryptionKey: MASTER_KEY,
      now: () => NOW,
      createId: () => "provider_1",
      randomBytes: options.randomBytes,
      resolveHostname: async () => ["172.64.154.211"],
      testProviderConnection: options.testProviderConnection,
    }),
  };
}

function makeUser(
  overrides: Partial<CommercialUserRecord> = {},
): CommercialUserRecord {
  return {
    id: "user_1",
    email: "user@example.test",
    emailNormalized: "user@example.test",
    passwordHash: "hash",
    role: "user",
    tier: "basic",
    status: "active",
    features: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function hasProviderCode(
  error: unknown,
  code: ModelProviderServiceError["code"],
): boolean {
  return error instanceof ModelProviderServiceError && error.code === code;
}
