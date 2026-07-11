import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import AccountPanel from "./AccountPanel.js";

test("account panel shows commercial identity, tier, balance, frozen credits, and redeem form", () => {
  const html = renderToStaticMarkup(
    <AccountPanel
      language="en-US"
      user={{
        id: "user_1",
        email: "buyer@example.test",
        emailNormalized: "buyer@example.test",
        role: "user",
        tier: "pro",
        status: "active",
        features: ["priority_queue", "custom_model_provider"],
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
      account={{
        userId: "user_1",
        balance: 18,
        frozenCredits: 3,
        totalRedeemed: 30,
        totalCaptured: 9,
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
      onRedeem={async () => undefined}
      modelProvider={{
        id: "provider_1",
        provider: "openai",
        displayName: "OpenAI",
        baseUrl: "https://api.openai.com/v1",
        apiKeyMask: "sk-liv...3456",
        status: "active",
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
    />,
  );

  assert.match(html, /buyer@example\.test/);
  assert.match(html, /pro/);
  assert.match(html, /Available credits/);
  assert.match(html, />18</);
  assert.match(html, /Frozen credits/);
  assert.match(html, />3</);
  assert.match(html, /Access code/);
  assert.match(html, /Redeem code/);
  assert.match(html, /Model provider/);
  assert.match(html, /sk-liv\.\.\.3456/);
});

test("model settings page renders BYOK provider settings when BYOK is selected", () => {
  const html = renderToStaticMarkup(
    <AccountPanel
      language="en-US"
      modelPage
      user={{
        id: "user_1",
        email: "buyer@example.test",
        emailNormalized: "buyer@example.test",
        role: "user",
        tier: "pro",
        status: "active",
        features: ["custom_model_provider"],
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
      account={{
        userId: "user_1",
        balance: 18,
        frozenCredits: 0,
        totalRedeemed: 18,
        totalCaptured: 0,
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
      providerMode="byok"
      onSaveModelProvider={async () => undefined}
      onTestModelProvider={async () => undefined}
      onDeleteModelProvider={async () => undefined}
    />,
  );

  assert.match(html, /BYOK model settings/);
  assert.match(html, /OpenAI-compatible base URL/);
  assert.match(html, /API key/);
  assert.match(html, /Fast model/);
  assert.match(html, /Balanced model/);
  assert.match(html, /Deep model/);
  assert.match(html, /Save provider/);
  assert.match(html, /Test provider/);
});

test("model settings page shows BYOK provider test failure details", () => {
  const html = renderToStaticMarkup(
    <AccountPanel
      language="en-US"
      modelPage
      user={{
        id: "user_1",
        email: "buyer@example.test",
        emailNormalized: "buyer@example.test",
        role: "user",
        tier: "pro",
        status: "active",
        features: ["custom_model_provider"],
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
      providerMode="byok"
      byokAvailable
      modelProvider={{
        id: "provider_1",
        provider: "openai",
        displayName: "OpenAI-compatible",
        baseUrl: "https://api.openai.com/v1",
        apiKeyMask: "sk-liv...3456",
        status: "active",
        lastTestStatus: "failed",
        lastTestError: "Model grok-4.2 failed: 401 Unauthorized",
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
    />,
  );

  assert.match(html, /Test failed/);
  assert.match(html, /Failure reason: Model grok-4\.2 failed: 401 Unauthorized/);
});

test("model settings page keeps BYOK configuration collapsed until selected", () => {
  const html = renderToStaticMarkup(
    <AccountPanel
      language="en-US"
      modelPage
      user={{
        id: "user_1",
        email: "buyer@example.test",
        emailNormalized: "buyer@example.test",
        role: "user",
        tier: "business",
        status: "active",
        features: ["custom_model_provider"],
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
      account={{
        userId: "user_1",
        balance: 18,
        frozenCredits: 0,
        totalRedeemed: 18,
        totalCaptured: 0,
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
      providerMode="platform"
      byokAvailable={false}
      onProviderModeChange={() => undefined}
      onSaveModelProvider={async () => undefined}
      onTestModelProvider={async () => undefined}
      onDeleteModelProvider={async () => undefined}
    />,
  );

  assert.match(html, /Use my API key/);
  assert.doesNotMatch(html, /value="byok" checked="" disabled=""/);
  assert.doesNotMatch(html, /BYOK access required/);
  assert.doesNotMatch(html, /BYOK model settings/);
  assert.doesNotMatch(html, /OpenAI-compatible base URL/);
});

test("model settings page shows BYOK configuration after BYOK is selected", () => {
  const html = renderToStaticMarkup(
    <AccountPanel
      language="en-US"
      modelPage
      user={{
        id: "user_1",
        email: "buyer@example.test",
        emailNormalized: "buyer@example.test",
        role: "user",
        tier: "business",
        status: "active",
        features: ["custom_model_provider"],
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
      account={{
        userId: "user_1",
        balance: 18,
        frozenCredits: 0,
        totalRedeemed: 18,
        totalCaptured: 0,
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
      providerMode="byok"
      byokAvailable={false}
      onProviderModeChange={() => undefined}
      onSaveModelProvider={async () => undefined}
      onTestModelProvider={async () => undefined}
      onDeleteModelProvider={async () => undefined}
    />,
  );

  assert.match(html, /Use my API key/);
  assert.match(html, /<input[^>]*checked=""[^>]*value="byok"/);
  assert.doesNotMatch(html, /<input[^>]*disabled=""[^>]*checked=""[^>]*value="byok"/);
  assert.match(html, /BYOK model settings/);
  assert.match(html, /OpenAI-compatible base URL/);
});

test("model settings page renders Chinese model source and BYOK copy", () => {
  const html = renderToStaticMarkup(
    <AccountPanel
      language="zh-CN"
      modelPage
      user={{
        id: "user_1",
        email: "buyer@example.test",
        emailNormalized: "buyer@example.test",
        role: "user",
        tier: "pro",
        status: "active",
        features: ["custom_model_provider"],
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
      account={{
        userId: "user_1",
        balance: 18,
        frozenCredits: 0,
        totalRedeemed: 18,
        totalCaptured: 0,
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
      providerMode="byok"
      byokAvailable
      onProviderModeChange={() => undefined}
      onSaveModelProvider={async () => undefined}
      onTestModelProvider={async () => undefined}
      onDeleteModelProvider={async () => undefined}
    />,
  );

  assert.match(html, /模型设置/);
  assert.doesNotMatch(html, /商业账号/);
  assert.doesNotMatch(html, /可用额度/);
  assert.doesNotMatch(html, /访问码/);
  assert.match(html, /模型来源/);
  assert.match(html, /平台模型/);
  assert.match(html, /使用我的 API Key/);
  assert.match(html, /BYOK 模型设置/);
  assert.match(html, /保存配置/);
  assert.match(html, /测试配置/);
});

test("account panel summary links to model settings without embedding model setup", () => {
  const html = renderToStaticMarkup(
    <AccountPanel
      language="en-US"
      user={{
        id: "user_1",
        email: "buyer@example.test",
        emailNormalized: "buyer@example.test",
        role: "user",
        tier: "pro",
        status: "active",
        features: ["custom_model_provider"],
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
      account={{
        userId: "user_1",
        balance: 18,
        frozenCredits: 0,
        totalRedeemed: 18,
        totalCaptured: 0,
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
      showModelConfiguration={false}
      providerMode="platform"
      byokAvailable={false}
      onProviderModeChange={() => undefined}
      onSaveModelProvider={async () => undefined}
      onTestModelProvider={async () => undefined}
      onDeleteModelProvider={async () => undefined}
    />,
  );

  assert.match(html, /Account/);
  assert.doesNotMatch(html, /Commercial account/);
  assert.match(html, /Available credits/);
  assert.match(html, /Frozen credits/);
  assert.match(html, /Access code/);
  assert.match(html, /Redeem code/);
  assert.match(html, /Current selection/);
  assert.match(html, /href="\/account\/models"/);
  assert.doesNotMatch(html, /Model source/);
  assert.doesNotMatch(html, /BYOK model settings/);
});

test("account panel lets users select an admin-enabled platform model", () => {
  const html = renderToStaticMarkup(
    <AccountPanel
      language="en-US"
      user={{
        id: "user_1",
        email: "buyer@example.test",
        emailNormalized: "buyer@example.test",
        role: "user",
        tier: "pro",
        status: "active",
        features: ["custom_model_provider"],
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
      account={{
        userId: "user_1",
        balance: 18,
        frozenCredits: 0,
        totalRedeemed: 18,
        totalCaptured: 0,
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
      providerMode="platform"
      platformModels={[
        {
          id: "gemini_flash_balanced",
          label: "Gemini Flash Balanced",
          modelId: "gemini-3.5-flash",
        },
        {
          id: "anthropic_sonnet_balanced",
          label: "Claude Sonnet Balanced",
          modelId: "claude-sonnet-4-20250514",
        },
      ]}
      selectedModelProfileId="anthropic_sonnet_balanced"
      onModelProfileChange={() => undefined}
    />,
  );

  assert.match(html, /Platform model choice/);
  assert.match(html, /Gemini Flash Balanced/);
  assert.match(html, /gemini-3\.5-flash/);
  assert.match(html, /Claude Sonnet Balanced/);
  assert.match(html, /claude-sonnet-4-20250514/);
  assert.match(html, /<button[^>]*type="button"[^>]*data-model-profile-id="gemini_flash_balanced"/);
  assert.match(html, /<button[^>]*type="button"[^>]*data-model-profile-id="anthropic_sonnet_balanced"/);
  assert.doesNotMatch(html, /<select[^>]*aria-label="Platform model choice"/);
});

test("account panel only renders platform models supplied by admin configuration", () => {
  const html = renderToStaticMarkup(
    <AccountPanel
      language="en-US"
      modelPage
      user={{
        id: "user_1",
        email: "buyer@example.test",
        emailNormalized: "buyer@example.test",
        role: "user",
        tier: "pro",
        status: "active",
        features: ["custom_model_provider"],
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
      providerMode="platform"
      platformModels={[
        {
          id: "anthropic_sonnet_balanced",
          label: "Claude Sonnet Balanced",
          modelId: "claude-sonnet-4-20250514",
        },
      ]}
      selectedModelProfileId="anthropic_sonnet_balanced"
    />,
  );

  assert.match(html, /Claude Sonnet Balanced/);
  assert.doesNotMatch(html, /Gemini Flash Balanced/);
});

test("account panel summary mode does not render model selection controls", () => {
  const html = renderToStaticMarkup(
    <AccountPanel
      language="en-US"
      user={{
        id: "user_1",
        email: "buyer@example.test",
        emailNormalized: "buyer@example.test",
        role: "user",
        tier: "pro",
        status: "active",
        features: ["custom_model_provider"],
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
      account={{
        userId: "user_1",
        balance: 18,
        frozenCredits: 0,
        totalRedeemed: 18,
        totalCaptured: 0,
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
      showModelConfiguration={false}
      providerMode="platform"
      platformModels={[
        {
          id: "gemini_flash_balanced",
          label: "Gemini Flash Balanced",
          modelId: "gemini-3.5-flash",
        },
      ]}
      selectedModelProfileId="gemini_flash_balanced"
    />,
  );

  assert.match(html, /href="\/account\/models"/);
  assert.match(html, /Current selection/);
  assert.doesNotMatch(html, /Platform model choice/);
  assert.doesNotMatch(html, /name="accountProviderMode"/);
});

test("account panel renders selectable BYOK API key option when available", () => {
  const html = renderToStaticMarkup(
    <AccountPanel
      language="en-US"
      user={{
        id: "user_1",
        email: "buyer@example.test",
        emailNormalized: "buyer@example.test",
        role: "user",
        tier: "pro",
        status: "active",
        features: ["custom_model_provider"],
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
      account={{
        userId: "user_1",
        balance: 18,
        frozenCredits: 0,
        totalRedeemed: 18,
        totalCaptured: 0,
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
      modelProvider={{
        id: "provider_1",
        provider: "openai",
        displayName: "OpenAI-compatible",
        baseUrl: "https://api.openai.com/v1",
        apiKeyMask: "sk-liv...3456",
        status: "active",
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
      providerMode="byok"
      byokAvailable
      modelPage
      selectedCredentialId="provider_1"
      onCredentialChange={() => undefined}
    />,
  );

  assert.match(html, /API key choice/);
  assert.match(html, /Use my API key/);
  assert.match(html, /OpenAI-compatible/);
  assert.match(html, /sk-liv\.\.\.3456/);
  assert.match(html, /value="provider_1"/);
});

test("account panel disables my API key for users without BYOK entitlement", () => {
  const html = renderToStaticMarkup(
    <AccountPanel
      language="en-US"
      user={{
        id: "user_1",
        email: "buyer@example.test",
        emailNormalized: "buyer@example.test",
        role: "user",
        tier: "basic",
        status: "active",
        features: [],
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
      account={{
        userId: "user_1",
        balance: 18,
        frozenCredits: 0,
        totalRedeemed: 18,
        totalCaptured: 0,
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
      modelProvider={{
        id: "provider_1",
        provider: "openai",
        displayName: "OpenAI-compatible",
        baseUrl: "https://api.openai.com/v1",
        apiKeyMask: "sk-liv...3456",
        status: "active",
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
      providerMode="byok"
      byokAvailable={false}
      modelPage
      selectedCredentialId="provider_1"
      onCredentialChange={() => undefined}
    />,
  );

  assert.match(html, /Use my API key/);
  assert.match(html, /BYOK access required/);
  assert.match(html, /My API key is locked/);
  assert.match(html, /custom_model_provider/);
  assert.match(html, /disabled=""/);
  assert.match(html, /sk-liv\.\.\.3456/);
});

test("account panel hides BYOK settings from basic users", () => {
  const html = renderToStaticMarkup(
    <AccountPanel
      language="en-US"
      user={{
        id: "user_1",
        email: "buyer@example.test",
        emailNormalized: "buyer@example.test",
        role: "user",
        tier: "basic",
        status: "active",
        features: [],
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
      account={{
        userId: "user_1",
        balance: 18,
        frozenCredits: 0,
        totalRedeemed: 18,
        totalCaptured: 0,
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
    />,
  );

  assert.doesNotMatch(html, /BYOK model settings/);
  assert.doesNotMatch(html, /OpenAI-compatible base URL/);
});

test("account panel exposes an admin console link for owner accounts", () => {
  const html = renderToStaticMarkup(
    <AccountPanel
      user={{
        id: "owner_1",
        email: "admin@example.test",
        emailNormalized: "admin@example.test",
        role: "owner",
        tier: "business",
        status: "active",
        features: ["admin_ops"],
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
      account={{
        userId: "owner_1",
        balance: 0,
        frozenCredits: 0,
        totalRedeemed: 0,
        totalCaptured: 0,
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
    />,
  );

  assert.match(html, /href="\/admin"/);
  assert.match(html, /进入后台/);
});

test("account panel renders a compact login and registration form when signed out", () => {
  const html = renderToStaticMarkup(
    <AccountPanel
      language="en-US"
      onLogin={async () => undefined}
      onRegister={async () => undefined}
    />,
  );

  assert.match(html, /Account/);
  assert.doesNotMatch(html, /Commercial account/);
  assert.doesNotMatch(html, /commercial-secret/);
  assert.match(html, /Email/);
  assert.match(html, /Password/);
  assert.match(html, /Sign in/);
  assert.match(html, /Create account/);
});
