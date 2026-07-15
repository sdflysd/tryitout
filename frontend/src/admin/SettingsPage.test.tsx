import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import SettingsPage from "./SettingsPage.js";
import {
  softDeleteAdminModelProfile,
  softDeleteAdminModelProvider,
  fetchAdminModelProviderModels,
  fetchAdminModelProviders,
  fetchAdminModelProfiles,
  saveAdminModelProfile,
  saveAdminModelProvider,
  testAdminModelProfile,
  testAdminModelProvider,
  updateAdminInitialUserCredits,
} from "./admin-client.js";
import type {
  AdminPlatformModelProfileDto,
  AdminPlatformModelProviderDto,
  AdminSettingsDto,
} from "./admin-client.js";

test("settings page renders a compact model configuration workbench", () => {
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
    "Visible to users",
    "OpenRouter Deep",
    "anthropic/claude-sonnet-4",
    "Create Profile",
    "Test Model",
    "Publish checklist",
    "Repository-backed providers and profiles are the source of truth once configured.",
    ".env remains the bootstrap and fallback source only.",
    "Users only see and use active profiles marked visible.",
    "Model Configuration Workbench",
    "Provider Inventory",
    "Select all providers",
    "Select provider OpenRouter",
    "Delete Provider",
    "Batch Delete Providers",
    "Profile Inventory",
    "Select all model profiles",
    "Select model profile OpenRouter Deep",
    "Delete Profile",
    "Batch Delete Profiles",
    "Batch Show",
    "Batch Hide",
    "Batch Enable",
    "Batch Disable",
    "Enabled for users",
    "Configuration Editor",
    "Read-only System Settings",
    "New Provider",
    "New Profile",
    "Save &amp; Publish to Users",
    "Save Provider",
  ]) {
    assert.ok(html.includes(text), `Expected page markup to include ${text}`);
  }
  assert.equal(html.includes("sk-platform-secret123456"), false);
});

test("settings page exposes provider connection fields when no provider exists", () => {
  const html = renderToStaticMarkup(
    <SettingsPage
      settings={{
        items: [],
        platformModels: {
          available: [],
          enabled: [],
          enabledModelProfileIds: [],
        },
        platformModelProviders: [],
      }}
      initialModelProviders={[]}
      initialModelProfiles={[makeProfile()]}
    />,
  );

  for (const text of [
    "Provider connection required",
    "Base URL",
    "API key",
    "Test Provider",
    "Fetch Provider Models",
    "Save Provider",
  ]) {
    assert.ok(html.includes(text), `Expected page markup to include ${text}`);
  }
});

test("settings page explains why profile inventory is empty and how to apply models", () => {
  const html = renderToStaticMarkup(
    <SettingsPage
      settings={{
        items: [],
        platformModels: {
          available: [],
          enabled: [],
          enabledModelProfileIds: [],
        },
        platformModelProviders: [makeProvider()],
      }}
      initialModelProviders={[makeProvider()]}
      initialModelProfiles={[]}
      initialProviderModelCatalogs={{
        provider_1: {
          providerId: "provider_1",
          provider: "openai_compatible",
          unsupported: false,
          models: [
            { id: "openai/gpt-4.1-mini", label: "GPT 4.1 Mini" },
          ],
        },
      }}
    />,
  );

  for (const text of [
    "Profile Inventory is empty because no model profile has been created from this provider yet.",
    "Create Profile",
    "Test Model",
    "Save &amp; Publish to Users",
    "Users can see 0 published profiles.",
  ]) {
    assert.ok(html.includes(text), `Expected page markup to include ${text}`);
  }
});

test("settings page hides disabled providers and profiles from normal inventory", () => {
  const html = renderToStaticMarkup(
    <SettingsPage
      settings={{
        items: [],
        platformModels: {
          available: [],
          enabled: [],
          enabledModelProfileIds: [],
        },
        platformModelProviders: [makeProvider({ status: "disabled" })],
      }}
      initialModelProviders={[makeProvider({ status: "disabled" })]}
      initialModelProfiles={[makeProfile({ status: "disabled" })]}
    />,
  );

  assert.ok(html.includes("No active provider credentials configured."));
  assert.ok(html.includes("No active repository-backed model profiles configured."));
  assert.ok(html.includes("Provider connection required"));
  assert.equal(html.includes("Select provider OpenRouter"), false);
  assert.equal(html.includes("Select model profile OpenRouter Deep"), false);
});

test("settings page separates alerts from success messages", () => {
  const failureHtml = renderToStaticMarkup(
    <SettingsPage
      settings={makeSettings()}
      initialModelProviders={[makeProvider({ lastTestStatus: "failed" })]}
      initialModelProfiles={[makeProfile()]}
      initialStatusMessage={{
        tone: "error",
        text: "Provider test failed. Invalid API key",
      }}
    />,
  );
  const warningHtml = renderToStaticMarkup(
    <SettingsPage
      settings={makeSettings()}
      initialModelProviders={[makeProvider()]}
      initialModelProfiles={[makeProfile()]}
      initialProviderModelCatalogs={{
        provider_1: {
          providerId: "provider_1",
          provider: "openai_compatible",
          unsupported: true,
          error: "Model discovery is not supported",
          models: [],
        },
      }}
      initialStatusMessage={{
        tone: "warning",
        text: "Model discovery is not supported",
      }}
    />,
  );

  assert.ok(failureHtml.includes("Provider test failed. Invalid API key"));
  assert.ok(failureHtml.includes("text-rose-700"));
  assert.ok(warningHtml.includes("Model discovery is not supported"));
  assert.ok(warningHtml.includes("text-amber-800"));
});

test("settings page renders initial credits configuration", () => {
  const html = renderToStaticMarkup(
    <SettingsPage
      settings={{
        ...makeSettings(),
        items: [
          {
            key: "users.initial_credits",
            value: 3,
            description: "Initial available credits for newly registered users",
            configured: false,
          },
        ],
      }}
      initialModelProviders={[makeProvider()]}
      initialModelProfiles={[makeProfile()]}
    />,
  );

  for (const text of [
    "New User Initial Credits",
    "Future public registrations receive this available balance before access-code redemption.",
    "Built-in default",
    "Save Initial Credits",
  ]) {
    assert.ok(html.includes(text), `Expected page markup to include ${text}`);
  }
  assert.ok(html.includes('name="initial-user-credits"'));
  assert.ok(html.includes('value="3"'));
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
    if (url.endsWith("/model-profiles/openrouter_deep/test")) {
      return jsonResponse({
        result: {
          providerConfigId: "provider_1",
          profileId: "openrouter_deep",
          modelId: "anthropic/claude-sonnet-4",
          ok: true,
          checkedAt: "2026-07-07T00:03:00.000Z",
        },
      });
    }
    if (url.endsWith("/settings/initial-user-credits")) {
      return jsonResponse({
        settings: {
          ...makeSettings(),
          items: [
            {
              key: "users.initial_credits",
              value: 4,
              description: "Initial available credits for newly registered users",
              configured: true,
            },
          ],
        },
      });
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
  await testAdminModelProfile({
    profileId: "openrouter_deep",
    providerConfigId: "provider_1",
    modelId: "anthropic/claude-sonnet-4",
  }, fetchImpl as typeof fetch);
  await softDeleteAdminModelProvider(makeProvider(), fetchImpl as typeof fetch);
  await softDeleteAdminModelProfile(makeProfile(), fetchImpl as typeof fetch);
  await updateAdminInitialUserCredits(4, fetchImpl as typeof fetch);

  assert.deepEqual(
    calls.map((call) => ({
      input: String(call.input),
      method: call.init?.method ?? "GET",
      credentials: call.init?.credentials,
      body: call.init?.body,
    })),
    [
      { input: "/api/admin/model-providers", method: "GET", credentials: "include", body: undefined },
      { input: "/api/admin/model-providers", method: "POST", credentials: "include", body: JSON.stringify({
        provider: "openai_compatible",
        providerConfigId: "provider_1",
        displayName: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "sk-platform-secret123456",
      }) },
      { input: "/api/admin/model-providers/provider_1/models", method: "GET", credentials: "include", body: undefined },
      { input: "/api/admin/model-providers/provider_1/test", method: "POST", credentials: "include", body: undefined },
      { input: "/api/admin/model-profiles", method: "GET", credentials: "include", body: undefined },
      { input: "/api/admin/model-profiles/openrouter_deep", method: "PATCH", credentials: "include", body: JSON.stringify(makeProfile()) },
      { input: "/api/admin/model-profiles/openrouter_deep/test", method: "POST", credentials: "include", body: JSON.stringify({
        providerConfigId: "provider_1",
        modelId: "anthropic/claude-sonnet-4",
      }) },
      { input: "/api/admin/model-providers", method: "POST", credentials: "include", body: JSON.stringify({
        provider: "openai_compatible",
        providerConfigId: "provider_1",
        displayName: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        status: "disabled",
      }) },
      { input: "/api/admin/model-profiles/openrouter_deep", method: "PATCH", credentials: "include", body: JSON.stringify({
        ...makeProfile(),
        status: "disabled",
      }) },
      { input: "/api/admin/settings/initial-user-credits", method: "POST", credentials: "include", body: JSON.stringify({
        initialCredits: 4,
      }) },
    ],
  );
});

function makeProvider(
  overrides: Partial<AdminPlatformModelProviderDto> = {},
): AdminPlatformModelProviderDto {
  return {
    ...makeProviderBase(),
    ...overrides,
  };
}

function makeProviderBase(): AdminPlatformModelProviderDto {
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

function makeProfile(
  overrides: Partial<AdminPlatformModelProfileDto> = {},
): AdminPlatformModelProfileDto {
  return {
    ...makeProfileBase(),
    ...overrides,
  };
}

function makeProfileBase(): AdminPlatformModelProfileDto {
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

function makeSettings(): AdminSettingsDto {
  return {
    items: [],
    platformModels: {
      available: [makeProfile()],
      enabled: [makeProfile()],
      enabledModelProfileIds: ["openrouter_deep"],
    },
    platformModelProviders: [makeProvider()],
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
