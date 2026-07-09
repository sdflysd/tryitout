import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import SettingsPage from "./SettingsPage.js";
import {
  fetchAdminModelProviderModels,
  fetchAdminModelProviders,
  fetchAdminModelProfiles,
  saveAdminModelProfile,
  saveAdminModelProvider,
  testAdminModelProvider,
} from "./admin-client.js";

test("settings page renders provider credentials, discovered models, and profile controls", () => {
  const html = renderToStaticMarkup(
    <SettingsPage
      settings={{
        items: [],
        platformModels: {
          available: [
            {
              id: "gemini_flash_balanced",
              label: "Gemini Flash Balanced",
              providerLabel: "Gemini",
              modelId: "gemini-3.5-flash",
              quality: "balanced",
            },
            {
              id: "anthropic_sonnet_balanced",
              label: "Claude Sonnet Balanced",
              providerLabel: "Anthropic",
              modelId: "claude-sonnet-4-20250514",
              quality: "balanced",
            },
          ],
          enabled: [
            {
              id: "anthropic_sonnet_balanced",
              label: "Claude Sonnet Balanced",
              providerLabel: "Anthropic",
              modelId: "claude-sonnet-4-20250514",
              quality: "balanced",
            },
          ],
          enabledModelProfileIds: ["anthropic_sonnet_balanced"],
        },
        platformModelProviders: [makeProvider()],
      }}
      initialModelProviders={[makeProvider()]}
      initialModelProfiles={[makeProfile()]}
      initialProviderModelCatalogs={{
        provider_1: {
          providerId: "provider_1",
          provider: "openai_compatible",
          unsupported: false,
          models: [
            { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4" },
            { id: "openai/gpt-4.1-mini", label: "GPT 4.1 Mini" },
          ],
        },
      }}
    />,
  );

  for (const text of [
    "Provider Credentials",
    "Provider type",
    "Display name",
    "Base URL",
    "API key",
    "Stored key",
    "sk-pla...3456",
    "OpenRouter",
    "https://openrouter.ai/api/v1",
    "Fetch Provider Models",
    "Discovered Models",
    "Claude Sonnet 4",
    "Model Profiles",
    "Profile id",
    "Provider config",
    "Model id",
    "Visible to users",
    "OpenRouter Deep",
    "anthropic/claude-sonnet-4",
    "Repository-backed providers and profiles are the source of truth once configured.",
    ".env remains the bootstrap and fallback source only.",
    "Users only see and use active profiles marked visible.",
  ]) {
    assert.ok(html.includes(text), `Expected page markup to include ${text}`);
  }
  assert.equal(html.includes("sk-platform-secret123456"), false);
});

test("admin client manages model providers, model discovery, and profiles", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    const url = String(input);
    if (url.endsWith("/model-providers") && (init?.method ?? "GET") === "GET") {
      return jsonResponse({ providers: [makeProvider()] });
    }
    if (url.endsWith("/model-providers/provider_1/models")) {
      return jsonResponse({
        catalog: {
          providerId: "provider_1",
          models: [{ id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4" }],
        },
      });
    }
    if (url.endsWith("/model-providers/provider_1/test")) {
      return jsonResponse({ provider: { ...makeProvider(), lastTestStatus: "passed" } });
    }
    if (url.endsWith("/model-providers")) {
      return jsonResponse({ provider: makeProvider() });
    }
    if (url.endsWith("/model-profiles") && (init?.method ?? "GET") === "GET") {
      return jsonResponse({ profiles: [makeProfile()] });
    }
    return jsonResponse({ profile: makeProfile() });
  };

  await fetchAdminModelProviders(fetchImpl as typeof fetch);
  await saveAdminModelProvider({
    provider: "openai_compatible",
    providerConfigId: "provider_1",
    displayName: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: "sk-platform-secret123456",
  }, fetchImpl as typeof fetch);
  await fetchAdminModelProviderModels("provider_1", fetchImpl as typeof fetch);
  await testAdminModelProvider("provider_1", fetchImpl as typeof fetch);
  await fetchAdminModelProfiles(fetchImpl as typeof fetch);
  await saveAdminModelProfile(makeProfile(), fetchImpl as typeof fetch);

  assert.deepEqual(
    calls.map((call) => ({
      input: String(call.input),
      method: call.init?.method ?? "GET",
      credentials: call.init?.credentials,
    })),
    [
      { input: "/api/admin/model-providers", method: "GET", credentials: "include" },
      { input: "/api/admin/model-providers", method: "POST", credentials: "include" },
      { input: "/api/admin/model-providers/provider_1/models", method: "GET", credentials: "include" },
      { input: "/api/admin/model-providers/provider_1/test", method: "POST", credentials: "include" },
      { input: "/api/admin/model-profiles", method: "GET", credentials: "include" },
      { input: "/api/admin/model-profiles/openrouter_deep", method: "PATCH", credentials: "include" },
    ],
  );
});

function makeProvider() {
  return {
    id: "provider_1",
    provider: "openai_compatible" as const,
    displayName: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKeyMask: "sk-pla...3456",
    status: "active" as const,
    lastTestedAt: "2026-07-07T00:02:00.000Z",
    lastTestStatus: "passed" as const,
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:02:00.000Z",
  };
}

function makeProfile() {
  return {
    id: "openrouter_deep",
    providerConfigId: "provider_1",
    label: "OpenRouter Deep",
    providerLabel: "OpenRouter",
    modelId: "anthropic/claude-sonnet-4",
    quality: "deep" as const,
    source: "admin" as const,
    visibleToUser: true,
    status: "active" as const,
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
