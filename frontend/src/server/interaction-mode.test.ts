import assert from "node:assert/strict";
import test from "node:test";

import { resolveInteractionMode } from "./interaction-mode.js";
import type { InteractionMode, SimulationRequest } from "../types.js";

test("resolveInteractionMode keeps legacy unless env and request both opt in", () => {
  assert.equal(resolveInteractionMode(false, undefined), "legacy");
  assert.equal(resolveInteractionMode(false, "enabled"), "legacy");
  assert.equal(resolveInteractionMode(true, undefined), "legacy");
  assert.equal(resolveInteractionMode(true, "legacy"), "legacy");
  assert.equal(resolveInteractionMode(true, "enabled"), "enabled");
});

test("SimulationRequest accepts interaction mode opt-in", () => {
  const request: SimulationRequest = {
    userInput: {
      type: "side_hustle",
      projectIdea: "Concierge onboarding for tiny B2B tools",
    },
    interactionMode: "enabled",
  };

  assert.equal(request.interactionMode, "enabled");
});

test("InteractionMode type is shared with SimulationRequest", () => {
  const mode: InteractionMode = "enabled";
  const request: SimulationRequest = {
    userInput: {
      type: "side_hustle",
      projectIdea: "Concierge onboarding for tiny B2B tools",
    },
    interactionMode: mode,
  };

  assert.equal(request.interactionMode, mode);
});
