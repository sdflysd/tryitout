import assert from "node:assert/strict";
import test from "node:test";

import type { AiGateway } from "./ai/ai-gateway.js";
import { handleLifeChoiceStructureRequest } from "./life-choice-structure-api.js";

const STUDENT_CONTEXT =
  "在读高三，学习成绩差，很难考上大学，是继续学习还是伺机打工呢";

test("handleLifeChoiceStructureRequest returns the agent structured result", async () => {
  const fakeGateway = {} as AiGateway;
  let receivedModelMode = "";

  const result = await handleLifeChoiceStructureRequest(
    {
      decisionContext: STUDENT_CONTEXT,
      modelSelection: { mode: "fast" },
    },
    {
      getGateway: () => fakeGateway,
      structureWithAgent: async ({ gateway, decisionContext, modelSelection }) => {
        assert.equal(gateway, fakeGateway);
        assert.equal(decisionContext, STUDENT_CONTEXT);
        receivedModelMode = modelSelection?.mode ?? "";

        return {
          decisionContext,
          source: "agent",
          options: [
            {
              id: "agent-a",
              label: "A",
              title: "继续完成高中学业",
              description: "保留升学可能",
            },
            {
              id: "agent-b",
              label: "B",
              title: "先出去打工",
              description: "尽快获得收入",
            },
          ],
          financialBuffer: "无独立收入，主要靠生活费/助学金/家里支持",
          familySupport: "家里支持有限",
          coreFear: "怕读不下去，也怕过早放弃以后后悔",
        };
      },
    },
  );

  assert.equal(result.status, 200);
  assert.ok("source" in result.body);
  assert.equal(result.body.source, "agent");
  assert.equal(result.body.options[0].title, "继续完成高中学业");
  assert.equal(result.body.financialBuffer, "无独立收入，主要靠生活费/助学金/家里支持");
  assert.equal(receivedModelMode, "fast");
});

test("handleLifeChoiceStructureRequest falls back locally when no provider is configured", async () => {
  const result = await handleLifeChoiceStructureRequest(
    { decisionContext: STUDENT_CONTEXT },
    {
      getGateway: () => {
        throw new Error("GEMINI_API_KEY is missing");
      },
    },
  );

  assert.equal(result.status, 200);
  assert.ok("source" in result.body);
  assert.equal(result.body.source, "fallback");
  assert.equal(result.body.fallbackReason, "agent unavailable");
  assert.deepEqual(
    result.body.options.map((option) => option.title),
    ["继续学习", "伺机打工"],
  );
});

test("handleLifeChoiceStructureRequest rejects too-short decision context", async () => {
  let gatewayRequested = false;

  const result = await handleLifeChoiceStructureRequest(
    { decisionContext: "纠结" },
    {
      getGateway: () => {
        gatewayRequested = true;
        return {} as AiGateway;
      },
    },
  );

  assert.equal(result.status, 400);
  assert.ok("error" in result.body);
  assert.match(result.body.error, /至少 15 个字/);
  assert.equal(gatewayRequested, false);
});
