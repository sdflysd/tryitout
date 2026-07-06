import assert from "node:assert/strict";
import test from "node:test";

import {
  ModelProviderService,
  ModelProviderServiceError,
} from "./model-provider-service.js";
import { InMemoryCommercialRepository } from "./repository.js";
import { decryptSecret } from "./secrets.js";
import type { CommercialRepository } from "./repository.js";

const now = new Date("2026-07-06T12:00:00.000Z");
const masterKey = Buffer.alloc(32, 9).toString("base64");

async function seedUser(
  repository: CommercialRepository,
  input: {
    userId: string;
    tier: "basic" | "pro" | "business";
    features?: Array<"custom_model_provider">;
  },
): Promise<void> {
  await repository.saveUser({
    id: input.userId,
    email: `${input.userId}@tryitout.ai`,
    passwordHash: "hash",
    tier: input.tier,
    features: input.features ?? [],
    isAdmin: false,
    disabledAt: undefined,
    createdAt: now,
    updatedAt: now,
  });
}

function createService(repository: CommercialRepository): ModelProviderService {
  return new ModelProviderService(repository, {
    masterKey,
    now: () => now,
    allowedHosts: ["api.openai.com", "openrouter.ai"],
  });
}

test("basic users cannot save custom providers", async () => {
  const repository = new InMemoryCommercialRepository();
  await seedUser(repository, { userId: "user_1", tier: "basic" });
  const service = createService(repository);

  await assert.rejects(
    service.saveProvider({
      userId: "user_1",
      provider: "openai_compatible",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4.1-mini",
      apiKey: "sk-test",
    }),
    new ModelProviderServiceError(
      "custom_provider_not_allowed",
      "User is not entitled to custom model providers.",
    ),
  );
});

test("pro users with custom provider entitlement can save encrypted providers", async () => {
  const repository = new InMemoryCommercialRepository();
  await seedUser(repository, {
    userId: "user_1",
    tier: "pro",
    features: ["custom_model_provider"],
  });
  const service = createService(repository);

  const publicProvider = await service.saveProvider({
    userId: "user_1",
    provider: "openai_compatible",
    baseUrl: "https://api.openai.com/v1/",
    model: "gpt-4.1-mini",
    apiKey: "sk-test-secret",
  });

  assert.deepEqual(publicProvider, {
    provider: "openai_compatible",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    hasApiKey: true,
    keyPreview: "sk-t...cret",
  });
  const stored = await repository.getUserModelProvider("user_1");
  assert.ok(stored);
  assert.notEqual(stored.encryptedApiKey.includes("sk-test-secret"), true);
  assert.equal(decryptSecret(stored.encryptedApiKey, masterKey), "sk-test-secret");
});

test("public provider DTO masks key and never returns encrypted value", async () => {
  const repository = new InMemoryCommercialRepository();
  await seedUser(repository, {
    userId: "user_1",
    tier: "pro",
    features: ["custom_model_provider"],
  });
  const service = createService(repository);
  await service.saveProvider({
    userId: "user_1",
    provider: "openai_compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini",
    apiKey: "router-secret",
  });

  const publicProvider = await service.getPublicProvider("user_1");

  assert.equal(publicProvider?.hasApiKey, true);
  assert.equal(Object.hasOwn(publicProvider as object, "encryptedApiKey"), false);
  assert.equal(Object.hasOwn(publicProvider as object, "apiKey"), false);
});

test("non-HTTPS and blocked hosts are rejected", async () => {
  const repository = new InMemoryCommercialRepository();
  await seedUser(repository, {
    userId: "user_1",
    tier: "pro",
    features: ["custom_model_provider"],
  });
  const service = createService(repository);

  for (const baseUrl of ["http://api.openai.com/v1", "https://127.0.0.1/v1"]) {
    await assert.rejects(
      service.saveProvider({
        userId: "user_1",
        provider: "openai_compatible",
        baseUrl,
        model: "gpt-4.1-mini",
        apiKey: "sk-test",
      }),
      ModelProviderServiceError,
    );
  }
});

test("provider test timeout is enforced", async () => {
  const repository = new InMemoryCommercialRepository();
  await seedUser(repository, {
    userId: "user_1",
    tier: "pro",
    features: ["custom_model_provider"],
  });
  const service = new ModelProviderService(repository, {
    masterKey,
    now: () => now,
    allowedHosts: ["api.openai.com"],
    testTimeoutMs: 5,
    fetchHead: async () => ({ status: 200, headers: new Headers() }),
    fetchJson: async (_url, _init, signal) =>
      new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        setTimeout(() => resolve({ ok: true }), 50);
      }),
  });

  await service.saveProvider({
    userId: "user_1",
    provider: "openai_compatible",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    apiKey: "sk-test",
  });

  await assert.rejects(
    service.testProviderConnection("user_1"),
    new ModelProviderServiceError("provider_test_timeout", "Provider test timed out."),
  );
});
