import assert from "node:assert/strict";
import test from "node:test";

import { AiGateway } from "./ai/ai-gateway.js";
import type { AiProviderAdapter } from "./ai/adapters/provider-adapter.js";
import type { AiCallRequest, AiCallResult } from "./ai/types.js";
import { structureLifeChoiceWithAgent } from "./life-choice-structure-agent.js";

class LifeChoiceStructureStubAdapter implements AiProviderAdapter {
  readonly provider = "gemini" as const;
  readonly calls: AiCallRequest[] = [];

  constructor(private readonly data: unknown | Error) {}

  async generateJson<T>(request: AiCallRequest): Promise<AiCallResult<T>> {
    this.calls.push(request);

    if (this.data instanceof Error) {
      throw this.data;
    }

    return {
      data: this.data as T,
      provider: request.modelProfile.provider,
      modelId: request.modelProfile.modelId,
      modelProfileId: request.modelProfile.id,
      latencyMs: 1,
    };
  }
}

test("structureLifeChoiceWithAgent uses the parse_scenario agent result first", async () => {
  const adapter = new LifeChoiceStructureStubAdapter({
    options: [
      {
        title: "继续完成高中学业",
        description: "保留升学可能，但短期压力很大",
      },
      {
        title: "先出去打工",
        description: "尽快获得收入，但会牺牲学业连续性",
      },
    ],
    coreFear: "怕读不下去，也怕过早放弃以后后悔",
    financialBuffer: "无独立收入，主要靠生活费/助学金/家里支持",
    familySupport: "家里意见摇摆",
  });
  const gateway = new AiGateway("test-key", { adapters: [adapter] });

  const result = await structureLifeChoiceWithAgent({
    gateway,
    decisionContext: "在读高三，学习成绩差，很难考上大学，是继续学习还是伺机打工呢",
  });

  assert.equal(result.source, "agent");
  assert.deepEqual(
    result.options.map((option) => [option.label, option.title, option.description]),
    [
      ["A", "继续完成高中学业", "保留升学可能，但短期压力很大"],
      ["B", "先出去打工", "尽快获得收入，但会牺牲学业连续性"],
    ],
  );
  assert.equal(result.coreFear, "怕读不下去，也怕过早放弃以后后悔");
  assert.equal(result.financialBuffer, "无独立收入，主要靠生活费/助学金/家里支持");
  assert.equal(result.familySupport, "家里意见摇摆");
  assert.equal(adapter.calls.length, 1);
  assert.equal(adapter.calls[0].step, "parse_scenario");
  assert.equal(adapter.calls[0].scenarioType, "life_choice");
  assert.match(adapter.calls[0].systemPrompt || "", /人生选择输入整理 Agent/);
  assert.match(adapter.calls[0].userPrompt, /在读高三/);
});

test("structureLifeChoiceWithAgent falls back to local parsing when the agent result is invalid", async () => {
  const adapter = new LifeChoiceStructureStubAdapter({
    options: [{ title: "继续学习" }],
  });
  const gateway = new AiGateway("test-key", { adapters: [adapter] });

  const result = await structureLifeChoiceWithAgent({
    gateway,
    decisionContext: "在读高三，学习成绩差，很难考上大学，是继续学习还是伺机打工呢",
  });

  assert.equal(result.source, "fallback");
  assert.match(result.fallbackReason || "", /at least 2/i);
  assert.deepEqual(
    result.options.map((option) => [option.label, option.title]),
    [
      ["A", "继续学习"],
      ["B", "伺机打工"],
    ],
  );
  assert.equal(adapter.calls.length, 1);
});

test("structureLifeChoiceWithAgent falls back to local parsing when the agent call fails", async () => {
  const adapter = new LifeChoiceStructureStubAdapter(new Error("provider unavailable"));
  const gateway = new AiGateway("test-key", { adapters: [adapter] });

  const result = await structureLifeChoiceWithAgent({
    gateway,
    decisionContext: "在读高三，学习成绩差，很难考上大学，是继续学习还是伺机打工呢",
  });

  assert.equal(result.source, "fallback");
  assert.match(result.fallbackReason || "", /provider unavailable/);
  assert.deepEqual(
    result.options.map((option) => option.title),
    ["继续学习", "伺机打工"],
  );
});

test("structureLifeChoiceWithAgent accepts common option field aliases from compatible models", async () => {
  const adapter = new LifeChoiceStructureStubAdapter({
    choices: [
      {
        name: "继续学习，争取上大专",
        details: "继续完成高中阶段学业，以能上大专为现实目标",
      },
      {
        name: "结束升学，直接出去打工",
        details: "进入社会工作，通过打工获得收入和经验",
      },
    ],
    fear: "怕读了也没结果，也怕太早出去以后后悔",
    economic_source: "目前还是学生，没有稳定经济来源",
    family_attitude: "家里态度未说明",
  });
  const gateway = new AiGateway("test-key", { adapters: [adapter] });

  const result = await structureLifeChoiceWithAgent({
    gateway,
    decisionContext: "高三，学习成绩差，最多只能上个大专，是继续学习还是出去打工呢？",
  });

  assert.equal(result.source, "agent");
  assert.deepEqual(
    result.options.map((option) => [option.label, option.title, option.description]),
    [
      ["A", "继续学习，争取上大专", "继续完成高中阶段学业，以能上大专为现实目标"],
      ["B", "结束升学，直接出去打工", "进入社会工作，通过打工获得收入和经验"],
    ],
  );
  assert.equal(result.coreFear, "怕读了也没结果，也怕太早出去以后后悔");
  assert.equal(result.financialBuffer, "目前还是学生，没有稳定经济来源");
  assert.equal(result.familySupport, "家里态度未说明");
});

test("structureLifeChoiceWithAgent accepts directions returned by compatible models", async () => {
  const adapter = new LifeChoiceStructureStubAdapter({
    directions: [
      {
        title: "继续学习，上大专",
        description: "高三后继续升学，即使成绩目前较差，目标可能是进入大专继续学习。",
      },
      {
        title: "出去打工",
        description: "高中毕业后不继续升学，直接进入社会工作赚钱。",
      },
    ],
  });
  const gateway = new AiGateway("test-key", { adapters: [adapter] });

  const result = await structureLifeChoiceWithAgent({
    gateway,
    decisionContext: "高三，学习成绩差，最多只能上个大专，是继续学习还是出去打工呢？",
  });

  assert.equal(result.source, "agent");
  assert.deepEqual(
    result.options.map((option) => [option.label, option.title, option.description]),
    [
      ["A", "继续学习，上大专", "高三后继续升学，即使成绩目前较差，目标可能是进入大专继续学习。"],
      ["B", "出去打工", "高中毕业后不继续升学，直接进入社会工作赚钱。"],
    ],
  );
});

test("structureLifeChoiceWithAgent fills student no-income buffer when the agent omits it", async () => {
  const adapter = new LifeChoiceStructureStubAdapter({
    options: [
      {
        title: "继续学习，上大专",
        description: "高三后继续升学，即使成绩目前较差，目标可能是进入大专继续学习。",
      },
      {
        title: "出去打工",
        description: "高中毕业后不继续升学，直接进入社会工作赚钱。",
      },
    ],
  });
  const gateway = new AiGateway("test-key", { adapters: [adapter] });

  const result = await structureLifeChoiceWithAgent({
    gateway,
    decisionContext: "高三，学习成绩差，最多只能上个大专，是继续学习还是出去打工呢？",
  });

  assert.equal(result.source, "agent");
  assert.equal(result.financialBuffer, "无独立收入，主要靠生活费/助学金/家里支持");
});

test("structureLifeChoiceWithAgent accepts the first option-like array when compatible models use another key", async () => {
  const adapter = new LifeChoiceStructureStubAdapter({
    alternatives: [
      {
        title: "继续学习，上大专",
        description: "先把学历路径走完，保留继续学习的可能。",
      },
      {
        title: "出去打工",
        description: "直接进入社会赚钱，但会牺牲升学连续性。",
      },
    ],
  });
  const gateway = new AiGateway("test-key", { adapters: [adapter] });

  const result = await structureLifeChoiceWithAgent({
    gateway,
    decisionContext: "高三，学习成绩差，最多只能上个大专，是继续学习还是出去打工呢？",
  });

  assert.equal(result.source, "agent");
  assert.deepEqual(
    result.options.map((option) => option.title),
    ["继续学习，上大专", "出去打工"],
  );
});
