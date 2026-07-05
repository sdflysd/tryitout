import test from "node:test";
import assert from "node:assert/strict";

import { buildRuntimeDiagnostics } from "./diagnostics.js";

test("buildRuntimeDiagnostics summarizes legacy and fallback stages", async () => {
  const diagnostics = buildRuntimeDiagnostics({
    requestedInteractionMode: "enabled",
    interactionModeUsed: "enabled",
    deepModeAvailable: true,
    stages: [
      {
        stageIndex: 1,
        timeRange: "第 1-3 天",
        title: "fallback stage",
        summary: "互动步骤失败，已使用保守备用推演。",
        events: [],
        agentReactions: [],
        interactions: {
          activatedAgentIds: ["fallback_arbiter_agent"],
          actions: [],
          votes: [],
          relationships: [],
          mergedVoteDelta: {},
          finalDelta: {},
          arbiterSummary: "互动步骤失败，已使用保守备用推演。",
        },
        stateAfter: {
          day: 3,
          productClarity: 50,
          executionEnergy: 50,
          trafficProgress: 50,
          trialUsers: 0,
          paidUsers: 0,
          revenue: 0,
          riskLevel: 50,
          confidence: 50,
        },
        keyDecision: "test",
        nextSuggestion: "test",
      },
    ],
  });

  assert.equal(diagnostics.fallbackStageCount, 1);
  assert.equal(diagnostics.stages[0]?.mode, "fallback");
});
