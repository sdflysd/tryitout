import assert from "node:assert/strict";
import test from "node:test";

import { buildSimulationRequestBody } from "./simulation-request.js";
import type { UserInput } from "./types.js";

const userInput: UserInput = {
  type: "side_hustle",
  projectIdea: "AI 简历优化",
};

test("buildSimulationRequestBody defaults to legacy mode", () => {
  assert.equal(buildSimulationRequestBody(userInput).interactionMode, "legacy");
});

test("buildSimulationRequestBody can request enabled interaction mode", () => {
  assert.equal(
    buildSimulationRequestBody(userInput, { deepAgentMode: true }).interactionMode,
    "enabled",
  );
});
