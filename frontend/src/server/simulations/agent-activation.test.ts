import assert from "node:assert/strict";
import test from "node:test";
import type { Agent, Event, WorldState } from "../../types.js";
import { selectActivatedAgents } from "./agent-activation.js";

function makeAgent(id: string, layer: Agent["layer"], stance = "观望", overrides: Partial<Omit<Agent, "id" | "layer">> = {}): Agent {
  return {
    id,
    name: id,
    role: id,
    layer,
    stance,
    keyJudgment: "判断",
    ...overrides,
  };
}

function makeEvent(): Event {
  return {
    type: "customer_feedback",
    title: "客户质疑",
    description: "客户不相信产品效果。",
    impact: "negative",
  };
}

function makeHighRiskLowConfidenceState(): WorldState {
  return {
    day: 3,
    productClarity: 30,
    executionEnergy: 70,
    trafficProgress: 10,
    trialUsers: 5,
    paidUsers: 0,
    revenue: 0,
    riskLevel: 60,
    confidence: 40,
  };
}

function snapshotAgents(agents: Agent[]): Agent[] {
  return agents.map((agent) => ({ ...agent }));
}

test("selectActivatedAgents defaults to three core and two peripheral agents when enough are available", () => {
  const coreAgents = Array.from({ length: 7 }, (_, index) => makeAgent(`core_${index}`, "core", index % 2 ? "质疑" : "支持"));
  const peripheralAgents = Array.from({ length: 12 }, (_, index) => makeAgent(`peripheral_${index}`, "peripheral"));
  const event = makeEvent();
  const state = makeHighRiskLowConfidenceState();

  const selected = selectActivatedAgents({ coreAgents, peripheralAgents, event, state });

  assert.equal(selected.filter((agent) => agent.layer === "core").length, 3);
  assert.equal(selected.filter((agent) => agent.layer === "peripheral").length, 2);
  assert.equal(selected.length, 5);
});

test("selectActivatedAgents returns exact deterministic order by keyword score, stance boost, id tie, and default caps", () => {
  const coreAgents = [
    makeAgent("core_zero_beta", "core"),
    makeAgent("core_question", "core", "质疑"),
    makeAgent("core_keyword_en", "core", "观望", { role: "customer success" }),
    makeAgent("core_support", "core", "支持"),
    makeAgent("core_zero_alpha", "core"),
    makeAgent("core_roast", "core", "拷打"),
    makeAgent("core_keyword_cn", "core", "观望", { name: "客户观察员" }),
    makeAgent("core_keyword_both", "core", "观望", { role: "customer strategy", keyJudgment: "客户复购判断" }),
  ];
  const peripheralAgents = [
    makeAgent("peripheral_zero_beta", "peripheral"),
    makeAgent("peripheral_support", "peripheral", "支持"),
    makeAgent("peripheral_keyword_cn", "peripheral", "观望", { role: "客户运营" }),
    makeAgent("peripheral_zero_alpha", "peripheral"),
    makeAgent("peripheral_zero_gamma", "peripheral"),
    makeAgent("peripheral_keyword_en", "peripheral", "观望", { keyJudgment: "customer objections" }),
  ];

  const selected = selectActivatedAgents({
    coreAgents,
    peripheralAgents,
    event: makeEvent(),
    state: makeHighRiskLowConfidenceState(),
  });

  assert.deepEqual(
    selected.map((agent) => agent.id),
    [
      "core_keyword_both",
      "core_keyword_cn",
      "core_keyword_en",
      "peripheral_keyword_cn",
      "peripheral_keyword_en",
    ],
  );
});

test("selectActivatedAgents does not mutate input arrays or agent objects", () => {
  const coreAgents = [
    makeAgent("core_b", "core", "质疑"),
    makeAgent("core_a", "core", "观望", { name: "客户顾问" }),
    makeAgent("core_c", "core", "支持"),
  ];
  const peripheralAgents = [
    makeAgent("peripheral_b", "peripheral", "支持"),
    makeAgent("peripheral_a", "peripheral", "观望", { role: "customer support" }),
    makeAgent("peripheral_c", "peripheral"),
  ];
  const coreOrder = coreAgents.map((agent) => agent.id);
  const peripheralOrder = peripheralAgents.map((agent) => agent.id);
  const coreSnapshot = snapshotAgents(coreAgents);
  const peripheralSnapshot = snapshotAgents(peripheralAgents);
  const coreReferences = [...coreAgents];
  const peripheralReferences = [...peripheralAgents];

  selectActivatedAgents({
    coreAgents,
    peripheralAgents,
    event: makeEvent(),
    state: makeHighRiskLowConfidenceState(),
  });

  assert.deepEqual(coreAgents.map((agent) => agent.id), coreOrder);
  assert.deepEqual(peripheralAgents.map((agent) => agent.id), peripheralOrder);
  assert.deepEqual(coreAgents, coreSnapshot);
  assert.deepEqual(peripheralAgents, peripheralSnapshot);
  coreAgents.forEach((agent, index) => assert.equal(agent, coreReferences[index]));
  peripheralAgents.forEach((agent, index) => assert.equal(agent, peripheralReferences[index]));
});

test("selectActivatedAgents boosts agents with recent memory when risk is high", () => {
  const selected = selectActivatedAgents({
    coreAgents: [
      makeAgent("z_core_memory", "core", "观望", {
        memory: { trustByAgentId: {}, claimsRemembered: [], lastPosition: "pivot" },
      }),
      makeAgent("a_core_plain", "core"),
      makeAgent("b_core_plain", "core"),
      makeAgent("c_core_plain", "core"),
    ],
    peripheralAgents: [],
    event: makeEvent(),
    state: makeHighRiskLowConfidenceState(),
  });

  assert.equal(selected[0].id, "z_core_memory");
});

test("selectActivatedAgents boosts remembered claims that overlap event text", () => {
  const selected = selectActivatedAgents({
    coreAgents: [
      makeAgent("z_core_claim", "core", "观望", {
        memory: {
          trustByAgentId: {},
          claimsRemembered: ["客户不相信产品效果，需要案例"],
        },
      }),
      makeAgent("a_core_plain", "core"),
      makeAgent("b_core_plain", "core"),
      makeAgent("c_core_plain", "core"),
    ],
    peripheralAgents: [],
    event: makeEvent(),
    state: makeHighRiskLowConfidenceState(),
  });

  assert.equal(selected[0].id, "z_core_claim");
});

test("selectActivatedAgents boosts low-trust conflict relevance", () => {
  const selected = selectActivatedAgents({
    coreAgents: [
      makeAgent("z_core_low_trust", "core", "观望", {
        memory: {
          trustByAgentId: { customer_agent: 20 },
          claimsRemembered: [],
        },
      }),
      makeAgent("a_core_plain", "core"),
      makeAgent("b_core_plain", "core"),
      makeAgent("c_core_plain", "core"),
    ],
    peripheralAgents: [],
    event: {
      ...makeEvent(),
      description: "customer_agent 对产品效果提出直接质疑。",
    },
    state: makeHighRiskLowConfidenceState(),
  });

  assert.equal(selected[0].id, "z_core_low_trust");
});

test("selectActivatedAgents prioritizes role card trigger matches", () => {
  const triggered = makeAgent("z_trigger_match", "core", "观望", {
    role: "观察者",
    roleCard: {
      category: "stakeholder",
      triggerConditions: ["缺少案例"],
    },
  });
  const ordinary = makeAgent("a_plain_agent", "core", "观望", {
    role: "观察者",
    roleCard: {
      category: "environment_system",
      triggerConditions: ["现金流压力"],
    },
  });

  const selected = selectActivatedAgents({
    coreAgents: [ordinary, triggered],
    peripheralAgents: [],
    event: {
      type: "customer_feedback",
      title: "客户质疑缺少案例",
      description: "用户没有真实案例，客户不信任。",
      impact: "negative",
    },
    state: makeHighRiskLowConfidenceState(),
  });

  assert.equal(selected[0].id, "z_trigger_match");
});

test("selectActivatedAgents prioritizes agents whose state influence is under pressure", () => {
  const riskAgent = makeAgent("z_risk_agent", "core", "观望", {
    role: "观察者",
    roleCard: {
      category: "expert_arbiter",
      stateInfluence: ["riskLevel"],
    },
  });
  const selected = selectActivatedAgents({
    coreAgents: [
      makeAgent("neutral_agent", "core", "观望", { role: "观察者" }),
      riskAgent,
    ],
    peripheralAgents: [],
    event: makeEvent(),
    state: { ...makeHighRiskLowConfidenceState(), riskLevel: 82 },
  });

  assert.equal(selected[0].id, "z_risk_agent");
});
