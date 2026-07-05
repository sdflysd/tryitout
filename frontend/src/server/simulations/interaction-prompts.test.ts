import assert from "node:assert/strict";
import test from "node:test";
import type { Agent, Event, UserInput, WorldState } from "../../types.js";
import {
  buildAgentActionsPrompt,
  buildArbiterPrompt,
  buildWorldEventPrompt,
} from "./interaction-prompts.js";

const userInput: UserInput = {
  type: "side_hustle",
  projectIdea: "AI 简历优化服务",
  dailyTime: "2小时",
  budget: "500元",
};

const state: WorldState = {
  day: 0,
  productClarity: 30,
  executionEnergy: 80,
  trafficProgress: 10,
  trialUsers: 0,
  paidUsers: 0,
  revenue: 0,
  riskLevel: 40,
  confidence: 50,
};

const agents: Agent[] = [
  { id: "customer_agent", name: "客户 Agent", role: "目标客户", stance: "质疑", keyJudgment: "我不确定是否值得付费。" },
];

const event: Event = {
  type: "customer_feedback",
  title: "客户提出信任质疑",
  description: "客户觉得 AI 简历服务同质化。",
  impact: "negative",
};

const datingInput: UserInput = {
  type: "dating",
  relationshipStatus: "暧昧期",
  datingDuration: "2周",
  targetPersonality: "慢热",
  chatLogOrIssue: "对方最近回复变慢，我不确定要不要主动问清楚。",
};

const datingEvent: Event = {
  type: "dating_response",
  title: "对方回复变慢",
  description: "聊天节奏变得不稳定。",
  impact: "neutral",
};

function assertJsonOnlyGuidance(prompt: string): void {
  assert.match(prompt, /只输出合法 JSON/);
  assert.match(prompt, /不要输出 Markdown|不要输出代码块/);
}

test("interaction prompts require structured actions and votes", () => {
  const actionsPrompt = buildAgentActionsPrompt({
    type: "side_hustle",
    userInput,
    state,
    event,
    activatedAgents: agents,
    previousActions: [],
  });

  assert.match(actionsPrompt, /like/);
  assert.match(actionsPrompt, /challenge/);
  assert.match(actionsPrompt, /stateDeltaVote/);
  assert.match(actionsPrompt, /只输出合法 JSON/);
});

test("agent actions prompt is compact and asks for dense multi-agent dialogue", () => {
  const activatedAgents = Array.from({ length: 5 }, (_, index) => ({
    id: `agent_${index + 1}`,
    name: `测试 Agent ${index + 1}`,
    role: index === 0 ? "目标客户" : "观察者",
    stance: index % 2 === 0 ? "支持" : "质疑",
    keyJudgment: `第 ${index + 1} 个判断需要被压缩摘要呈现。`,
    objection: "不要把完整对象漂亮打印到 prompt 中。",
  }));
  const previousActions = Array.from({ length: 20 }, (_, index) => ({
    id: `previous_action_${index + 1}`,
    type: "reply" as const,
    actorAgentId: `agent_${(index % 5) + 1}`,
    targetAgentId: `agent_${((index + 1) % 5) + 1}`,
    content: `历史动作 ${index + 1} 的较长内容，用来证明 prompt 不应完整漂亮打印历史数组。`,
    reason: "历史只需要压缩成摘要。",
    impact: "neutral" as const,
    stateDeltaHint: { confidence: index - 10 },
  }));

  const actionsPrompt = buildAgentActionsPrompt({
    type: "side_hustle",
    userInput,
    state,
    event,
    activatedAgents,
    previousActions,
  });

  assert.match(actionsPrompt, /至少|minimum/i);
  assert.match(actionsPrompt, /每个激活 Agent|覆盖所有激活 Agent/);
  assert.match(actionsPrompt, /targetAgentId/);
  for (const actionType of ["reply", "support", "challenge", "warn", "vote"]) {
    assert.match(actionsPrompt, new RegExp(actionType));
  }
  assert.doesNotMatch(actionsPrompt, /exactly four actions|恰好 4 个动作/i);
  assert.doesNotMatch(actionsPrompt, /\{\n\s+"id": "agent_1"/);
  assert.ok(actionsPrompt.length < 5_000, `prompt length was ${actionsPrompt.length}`);
});

test("life choice agent actions prompt preserves structured options without object placeholders", () => {
  const activatedAgents = Array.from({ length: 5 }, (_, index) => ({
    id: `agent_${index + 1}`,
    name: `人生抉择 Agent ${index + 1}`,
    role: "现实压力判断",
    stance: index % 2 === 0 ? "支持" : "质疑",
    keyJudgment: "必须围绕现金流、家庭风险和机会成本交锋。",
  }));
  const prompt = buildAgentActionsPrompt({
    type: "life_choice",
    userInput: {
      type: "life_choice",
      decisionContext: "40 岁失业半年，继续 AI 产品、继续找工作、尝试妻子公司销售之间摇摆。",
      lifeChoiceOptions: [
        { label: "A", title: "继续全职做 AI 产品", description: "当前每月 AI 收益约 1000 元。" },
        { label: "B", title: "继续找工作", description: "面试十几家没有后续。" },
        { label: "C", title: "尝试妻子公司销售岗位", description: "不懂产品且没有客户资源。" },
      ],
      financialBuffer: "存款不足 5000 元",
      familySupport: "妻子工资支撑家庭",
      coreFear: "继续没有现金流，也担心影响妻子。",
    },
    state,
    event: {
      type: "reality_check",
      title: "现金流压力继续上升",
      description: "家庭开支逼近收入，选择必须落到现实现金流。",
      impact: "negative",
    },
    activatedAgents,
    previousActions: [],
  });

  assert.match(prompt, /A\. 继续全职做 AI 产品 - 当前每月 AI 收益约 1000 元/);
  assert.match(prompt, /B\. 继续找工作 - 面试十几家没有后续/);
  assert.match(prompt, /C\. 尝试妻子公司销售岗位 - 不懂产品且没有客户资源/);
  assert.match(prompt, /请输出至少 7 个动作/);
  assert.match(prompt, /每个激活 Agent 至少要作为 actorAgentId 发声一次/);
  assert.doesNotMatch(prompt, /\[object Object\]/);
});

test("world event and arbiter prompts are stage scoped", () => {
  assert.match(buildWorldEventPrompt({ type: "side_hustle", userInput, state, stageIndex: 1 }), /第 1 阶段/);
  assert.match(
    buildArbiterPrompt({
      type: "side_hustle",
      state,
      event,
      actions: [],
      votes: [],
      mergedVoteDelta: {},
      relationships: [],
    }),
    /裁判/,
  );
});

test("dating world event prompt only lists relationship-appropriate event types", () => {
  const prompt = buildWorldEventPrompt({ type: "dating", userInput: datingInput, state, stageIndex: 1 });

  assert.doesNotMatch(prompt, /customer_feedback/);
  assert.doesNotMatch(prompt, /competitor_pressure/);
  assert.doesNotMatch(prompt, /platform_traffic/);
  assert.doesNotMatch(prompt, /monetization_attempt/);
  assert.match(prompt, /dating_response/);
  assert.match(prompt, /emotional_clash/);
  assert.match(prompt, /reality_check/);
});

test("dating agent actions prompt warns reused state keys are schema-only", () => {
  const prompt = buildAgentActionsPrompt({
    type: "dating",
    userInput: datingInput,
    state,
    event: datingEvent,
    activatedAgents: agents,
    previousActions: [],
  });

  assert.match(prompt, /trialUsers\/paidUsers\/revenue/);
  assert.match(prompt, /固定 JSON 字段名/);
  assert.match(prompt, /恋爱|关系/);
  assert.match(prompt, /不要写成商业|客户|付费|产品/);
});

test("all interaction prompts include JSON-only guidance and expected output shapes", () => {
  const worldPrompt = buildWorldEventPrompt({ type: "side_hustle", userInput, state, stageIndex: 1 });
  const actionsPrompt = buildAgentActionsPrompt({
    type: "side_hustle",
    userInput,
    state,
    event,
    activatedAgents: agents,
    previousActions: [],
  });
  const arbiterPrompt = buildArbiterPrompt({
    type: "side_hustle",
    state,
    event,
    actions: [],
    votes: [],
    mergedVoteDelta: {},
    relationships: [],
  });

  for (const prompt of [worldPrompt, actionsPrompt, arbiterPrompt]) {
    assertJsonOnlyGuidance(prompt);
  }
  assert.match(worldPrompt, /"event"/);
  assert.match(actionsPrompt, /"actions"/);
  assert.match(actionsPrompt, /"votes"/);
  assert.match(arbiterPrompt, /"summary"/);
  assert.match(arbiterPrompt, /"finalDelta"/);
});

test("agent actions prompt includes compact personality and memory snippets", () => {
  const prompt = buildAgentActionsPrompt({
    type: "side_hustle",
    userInput,
    state,
    event,
    activatedAgents: [
      {
        id: "customer_agent",
        name: "客户 Agent",
        role: "目标客户",
        stance: "质疑",
        keyJudgment: "我需要案例。",
        personalityKernel: {
          mbtiType: "ENTP",
          riskTolerance: 72,
          conflictStyle: "direct",
          evidencePreference: "data",
          emotionalSensitivity: 36,
          persuasionThreshold: 68,
          memoryBias: "risk_anchored",
        },
        memory: {
          trustByAgentId: { mentor_agent: 24 },
          claimsRemembered: ["价格太高", "缺少案例", "这个额外长的历史观点不应该完整铺开超过必要信息"],
          lastPosition: "pivot",
        },
      },
    ],
    previousActions: [],
  });

  assert.match(prompt, /memory=last:pivot; claims:2; trustLow:mentor_agent/);
  assert.match(prompt, /personality=ENTP; risk:72; conflict:direct; evidence:data/);
  assert.ok(prompt.length < 5_000, `prompt length was ${prompt.length}`);
});
