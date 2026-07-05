import type { SimulationProgressStep, SimulationType } from "../types";

export interface SandboxAgent {
  id: string;
  label: string;
  role: string;
  stance: string;
}

export interface SandboxStage {
  id: string;
  label: string;
  title: string;
  focus: string;
}

export type SandboxInteractionMode = "observe" | "support" | "challenge" | "arbitrate" | "synthesize";

export interface SandboxCollaborationLink {
  id: string;
  sourceAgentId: string;
  targetAgentId: string;
  mode: SandboxInteractionMode;
  label: string;
}

export interface SandboxScenario {
  type: SimulationType;
  title: string;
  centerLabel: string;
  accentName: "amber" | "rose" | "indigo";
  accentClassName: string;
  textClassName: string;
  agents: SandboxAgent[];
  collaborationLinks: SandboxCollaborationLink[];
  metrics: Array<{
    id: "risk" | "confidence" | "pressure" | "momentum";
    label: string;
  }>;
  stages: SandboxStage[];
}

export interface LiveSandboxPhase {
  label: string;
  // Zero-based index for reading SandboxScenario.stages.
  activeStageIndex: number;
  interactionMode: SandboxInteractionMode;
  activeAgentIds: string[];
}

const METRICS: SandboxScenario["metrics"] = [
  { id: "risk", label: "风险" },
  { id: "confidence", label: "置信" },
  { id: "pressure", label: "压力" },
  { id: "momentum", label: "动量" },
];

function createCollaborationLinks(type: SimulationType, agentIds: string[]): SandboxCollaborationLink[] {
  const [first, second, third, fourth, fifth, sixth, arbiter] = agentIds;

  return [
    {
      id: `${type}-support-primary`,
      sourceAgentId: first,
      targetAgentId: fourth,
      mode: "support",
      label: "支持",
    },
    {
      id: `${type}-support-context`,
      sourceAgentId: third,
      targetAgentId: fifth,
      mode: "support",
      label: "协作",
    },
    {
      id: `${type}-challenge-primary`,
      sourceAgentId: second,
      targetAgentId: first,
      mode: "challenge",
      label: "质疑",
    },
    {
      id: `${type}-challenge-risk`,
      sourceAgentId: sixth,
      targetAgentId: fourth,
      mode: "challenge",
      label: "压测",
    },
    {
      id: `${type}-arbitrate-risk`,
      sourceAgentId: sixth,
      targetAgentId: arbiter,
      mode: "arbitrate",
      label: "仲裁",
    },
    {
      id: `${type}-arbitrate-result`,
      sourceAgentId: arbiter,
      targetAgentId: first,
      mode: "arbitrate",
      label: "裁决",
    },
    {
      id: `${type}-synthesize-actions`,
      sourceAgentId: fourth,
      targetAgentId: arbiter,
      mode: "synthesize",
      label: "汇聚",
    },
    {
      id: `${type}-synthesize-constraints`,
      sourceAgentId: fifth,
      targetAgentId: arbiter,
      mode: "synthesize",
      label: "信号汇聚",
    },
  ];
}

const SCENARIOS: Record<SimulationType, SandboxScenario> = {
  side_hustle: {
    type: "side_hustle",
    title: "副业沙盘",
    centerLabel: "你的副业计划",
    accentName: "amber",
    accentClassName: "border-amber-300 bg-amber-50",
    textClassName: "text-amber-700",
    metrics: METRICS,
    agents: [
      { id: "side_hustle-target-customer", label: "目标客户", role: "需求验证", stance: "挑剔" },
      { id: "side_hustle-competitor", label: "竞品", role: "市场压力", stance: "压迫" },
      { id: "side_hustle-platform-traffic", label: "平台流量", role: "获客变量", stance: "波动" },
      { id: "side_hustle-execution-coach", label: "执行教练", role: "节奏管理", stance: "推动" },
      { id: "side_hustle-cash-flow", label: "现金流", role: "变现约束", stance: "审慎" },
      { id: "side_hustle-risk-audit", label: "风险审计", role: "漏洞扫描", stance: "质疑" },
      { id: "side_hustle-arbiter", label: "裁判", role: "综合裁决", stance: "中立" },
    ],
    collaborationLinks: createCollaborationLinks("side_hustle", [
      "side_hustle-target-customer",
      "side_hustle-competitor",
      "side_hustle-platform-traffic",
      "side_hustle-execution-coach",
      "side_hustle-cash-flow",
      "side_hustle-risk-audit",
      "side_hustle-arbiter",
    ]),
    stages: [
      { id: "side_hustle-stage-1", label: "第 1-3 天", title: "需求试探", focus: "确认真实痛点" },
      { id: "side_hustle-stage-2", label: "第 4-7 天", title: "最小交付", focus: "做出可验证版本" },
      { id: "side_hustle-stage-3", label: "第 8-15 天", title: "流量测试", focus: "观察获客质量" },
      { id: "side_hustle-stage-4", label: "第 16-23 天", title: "付费验证", focus: "检验现金回流" },
      { id: "side_hustle-stage-5", label: "第 24-30 天", title: "复盘裁决", focus: "决定继续或转向" },
    ],
  },
  dating: {
    type: "dating",
    title: "关系沙盘",
    centerLabel: "你的关系行动",
    accentName: "rose",
    accentClassName: "border-rose-300 bg-rose-50",
    textClassName: "text-rose-700",
    metrics: METRICS,
    agents: [
      { id: "dating-ta", label: "TA", role: "对方视角", stance: "观察" },
      { id: "dating-communication-coach", label: "沟通教练", role: "表达策略", stance: "引导" },
      { id: "dating-boundary", label: "边界", role: "关系底线", stance: "守护" },
      { id: "dating-emotion", label: "情绪", role: "感受波动", stance: "敏感" },
      { id: "dating-reality", label: "现实条件", role: "生活约束", stance: "务实" },
      { id: "dating-friend", label: "旁观朋友", role: "外部提醒", stance: "直说" },
      { id: "dating-arbiter", label: "裁判", role: "综合裁决", stance: "中立" },
    ],
    collaborationLinks: createCollaborationLinks("dating", [
      "dating-ta",
      "dating-communication-coach",
      "dating-boundary",
      "dating-emotion",
      "dating-reality",
      "dating-friend",
      "dating-arbiter",
    ]),
    stages: [
      { id: "dating-stage-1", label: "第 1-3 天", title: "信号读取", focus: "识别真实反馈" },
      { id: "dating-stage-2", label: "第 4-7 天", title: "表达校准", focus: "调整沟通方式" },
      { id: "dating-stage-3", label: "第 8-15 天", title: "边界测试", focus: "观察尊重与回应" },
      { id: "dating-stage-4", label: "第 16-23 天", title: "冲突预演", focus: "检验压力下的互动" },
      { id: "dating-stage-5", label: "第 24-30 天", title: "关系裁决", focus: "判断靠近或止损" },
    ],
  },
  life_choice: {
    type: "life_choice",
    title: "人生选择沙盘",
    centerLabel: "你的关键选择",
    accentName: "indigo",
    accentClassName: "border-indigo-300 bg-indigo-50",
    textClassName: "text-indigo-700",
    metrics: METRICS,
    agents: [
      { id: "life_choice-option-a", label: "选项 A", role: "路径收益", stance: "争取" },
      { id: "life_choice-option-b", label: "选项 B", role: "替代路径", stance: "争取" },
      { id: "life_choice-future-self", label: "未来自己", role: "长期回看", stance: "提醒" },
      { id: "life_choice-family", label: "家人现实", role: "支持系统", stance: "保守" },
      { id: "life_choice-resources", label: "资源盘点", role: "约束核算", stance: "冷静" },
      { id: "life_choice-fear", label: "核心恐惧", role: "心理阻力", stance: "放大" },
      { id: "life_choice-arbiter", label: "裁判", role: "综合裁决", stance: "中立" },
    ],
    collaborationLinks: createCollaborationLinks("life_choice", [
      "life_choice-option-a",
      "life_choice-option-b",
      "life_choice-future-self",
      "life_choice-family",
      "life_choice-resources",
      "life_choice-fear",
      "life_choice-arbiter",
    ]),
    stages: [
      { id: "life_choice-stage-1", label: "第 1-3 天", title: "选项拆解", focus: "看清选择结构" },
      { id: "life_choice-stage-2", label: "第 4-7 天", title: "资源核算", focus: "确认现实底盘" },
      { id: "life_choice-stage-3", label: "第 8-15 天", title: "压力模拟", focus: "预演最难时刻" },
      { id: "life_choice-stage-4", label: "第 16-23 天", title: "长期回看", focus: "比较后悔成本" },
      { id: "life_choice-stage-5", label: "第 24-30 天", title: "行动裁决", focus: "给出下一步方案" },
    ],
  },
};

const STEP_LABELS: Partial<Record<SimulationProgressStep, string>> = {
  generate_agents: "智能体入场",
  initialize_world_state: "世界初始化",
  simulate_stage: "阶段推演",
  generate_world_event: "事件生成",
  generate_agent_actions: "智能体交互",
  arbitrate_stage: "裁判仲裁",
  generate_report: "报告合成",
};

const STEP_INTERACTION_MODES: Partial<Record<SimulationProgressStep, SandboxInteractionMode>> = {
  generate_agents: "observe",
  initialize_world_state: "support",
  simulate_stage: "support",
  generate_world_event: "support",
  generate_agent_actions: "challenge",
  arbitrate_stage: "arbitrate",
  generate_report: "synthesize",
};

const STEP_ACTIVE_AGENT_IDS: Partial<Record<SimulationProgressStep, string[]>> = {
  generate_agents: ["primary", "support"],
  initialize_world_state: ["primary", "support"],
  simulate_stage: ["primary", "support"],
  generate_world_event: ["primary", "support"],
  generate_agent_actions: ["primary", "challenger", "risk"],
  arbitrate_stage: ["arbiter", "primary", "challenger"],
  generate_report: ["arbiter", "primary", "support", "challenger"],
};

const ACTIVE_AGENT_ALIAS_TO_INDEX = {
  primary: 0,
  challenger: 1,
  support: 3,
  risk: 5,
  arbiter: 6,
} as const;

function clampStageIndex(index: number): number {
  return Math.max(0, Math.min(4, index));
}

function getStageIndexFromPercent(percent: number): number {
  if (percent < 20) return 0;
  if (percent < 40) return 1;
  if (percent < 60) return 2;
  if (percent < 80) return 3;
  return 4;
}

function copyScenario(scenario: SandboxScenario): SandboxScenario {
  return {
    ...scenario,
    agents: scenario.agents.map((agent) => ({ ...agent })),
    collaborationLinks: scenario.collaborationLinks.map((link) => ({ ...link })),
    metrics: scenario.metrics.map((metric) => ({ ...metric })),
    stages: scenario.stages.map((stage) => ({ ...stage })),
  };
}

export function getAgentSandboxScenario(type: SimulationType): SandboxScenario {
  return copyScenario(SCENARIOS[type]);
}

export function getLiveSandboxPhase(input: {
  scenario?: SandboxScenario;
  step?: SimulationProgressStep;
  percent: number;
  stageIndex?: number;
}): LiveSandboxPhase {
  const activeStageIndex =
    input.stageIndex === undefined
      ? getStageIndexFromPercent(input.percent)
      : clampStageIndex(input.stageIndex - 1);

  return {
    label: input.step === undefined ? "准备中" : STEP_LABELS[input.step] ?? "推演中",
    activeStageIndex,
    interactionMode: input.step === undefined ? "observe" : STEP_INTERACTION_MODES[input.step] ?? "observe",
    activeAgentIds: resolvePhaseActiveAgentIds(
      input.scenario,
      input.step === undefined ? ["primary"] : STEP_ACTIVE_AGENT_IDS[input.step] ?? ["primary"],
    ),
  };
}

function resolvePhaseActiveAgentIds(
  scenario: SandboxScenario | undefined,
  activeAgentIds: string[],
): string[] {
  if (!scenario) {
    return [...activeAgentIds];
  }

  return activeAgentIds
    .map((agentId) => {
      const aliasIndex = ACTIVE_AGENT_ALIAS_TO_INDEX[agentId as keyof typeof ACTIVE_AGENT_ALIAS_TO_INDEX];
      return aliasIndex === undefined ? agentId : scenario.agents[aliasIndex]?.id;
    })
    .filter((agentId): agentId is string =>
      Boolean(agentId && scenario.agents.some((agent) => agent.id === agentId)),
    );
}
