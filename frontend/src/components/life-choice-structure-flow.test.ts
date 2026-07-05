import assert from "node:assert/strict";
import test from "node:test";

import { structureLifeChoiceForReview } from "./life-choice-structure-flow.js";

const STUDENT_CONTEXT =
  "在读高三，学习成绩差，很难考上大学，是继续学习还是伺机打工呢";

test("structureLifeChoiceForReview uses the remote agent structure first", async () => {
  let requestedContext = "";

  const result = await structureLifeChoiceForReview(STUDENT_CONTEXT, {
    requestStructure: async (decisionContext) => {
      requestedContext = decisionContext;
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
  });

  assert.equal(requestedContext, STUDENT_CONTEXT);
  assert.equal(result.source, "agent");
  assert.equal(result.notice, "");
  assert.equal(result.options[0].title, "继续完成高中学业");
  assert.equal(result.financialBuffer, "无独立收入，主要靠生活费/助学金/家里支持");
});

test("structureLifeChoiceForReview falls back locally when the agent request fails", async () => {
  const result = await structureLifeChoiceForReview(STUDENT_CONTEXT, {
    requestStructure: async () => {
      throw new Error("network down");
    },
  });

  assert.equal(result.source, "fallback");
  assert.match(result.notice, /本地规则/);
  assert.deepEqual(
    result.options.map((option) => option.title),
    ["继续学习", "伺机打工"],
  );
});

test("structureLifeChoiceForReview distinguishes malformed agent output from unavailable agent", async () => {
  const result = await structureLifeChoiceForReview(STUDENT_CONTEXT, {
    requestStructure: async () => {
      throw new Error("Agent response must include at least 2 options");
    },
  });

  assert.equal(result.source, "fallback");
  assert.match(result.notice, /返回格式不稳定/);
  assert.doesNotMatch(result.notice, /不可用|没连上/);
});

test("structureLifeChoiceForReview distinguishes remote fallback caused by malformed agent output", async () => {
  const result = await structureLifeChoiceForReview(STUDENT_CONTEXT, {
    requestStructure: async (decisionContext) => ({
      decisionContext,
      source: "fallback",
      fallbackReason: "Agent response must include at least 2 options",
      options: [
        {
          id: "local-a",
          label: "A",
          title: "继续学习",
          description: "补充代价、收益或限制，可不填",
        },
        {
          id: "local-b",
          label: "B",
          title: "伺机打工",
          description: "补充代价、收益或限制，可不填",
        },
      ],
      financialBuffer: "",
      familySupport: "",
      coreFear: "",
    }),
  });

  assert.equal(result.source, "fallback");
  assert.match(result.notice, /返回格式不稳定/);
  assert.doesNotMatch(result.notice, /不可用|没连上/);
});
