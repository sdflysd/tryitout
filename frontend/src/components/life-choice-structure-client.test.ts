import assert from "node:assert/strict";
import test from "node:test";

import { requestLifeChoiceStructure } from "./life-choice-structure-client.js";

test("requestLifeChoiceStructure posts free text to the agent structure endpoint", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];

  const result = await requestLifeChoiceStructure(
    "在读高三，学习成绩差，很难考上大学，是继续学习还是伺机打工呢",
    {
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(
          JSON.stringify({
            decisionContext: "在读高三，学习成绩差，很难考上大学，是继续学习还是伺机打工呢",
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
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/life-choice/structure");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(
    (calls[0].init.headers as Record<string, string>)["Content-Type"],
    "application/json",
  );
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    decisionContext: "在读高三，学习成绩差，很难考上大学，是继续学习还是伺机打工呢",
  });
  assert.equal(result.source, "agent");
  assert.equal(result.options[0].title, "继续完成高中学业");
  assert.equal(result.financialBuffer, "无独立收入，主要靠生活费/助学金/家里支持");
});

test("requestLifeChoiceStructure throws endpoint error messages", async () => {
  await assert.rejects(
    () =>
      requestLifeChoiceStructure("纠结", {
        fetchImpl: async () =>
          new Response(JSON.stringify({ error: "至少 15 个字" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }),
      }),
    /至少 15 个字/,
  );
});
