import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import SettingsPage from "./SettingsPage.js";

test("settings page renders platform model configuration controls", () => {
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
      }}
    />,
  );

  assert.match(html, /Platform Models/);
  assert.match(html, /Save Platform Models/);
  assert.match(html, /Gemini Flash Balanced/);
  assert.match(html, /Claude Sonnet Balanced/);
  assert.match(html, /checked=""/);
});
