import type { SimulationProgressStep, SimulationType } from "../types";
import { DEFAULT_LANGUAGE, Language } from "../language";

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

const EN_METRICS: SandboxScenario["metrics"] = [
  { id: "risk", label: "Risk" },
  { id: "confidence", label: "Confidence" },
  { id: "pressure", label: "Pressure" },
  { id: "momentum", label: "Momentum" },
];

const LINK_LABELS = {
  zh: ["支持", "协作", "质疑", "压测", "仲裁", "裁决", "汇聚", "信号汇聚"],
  en: ["Support", "Collaborate", "Challenge", "Stress Test", "Arbitrate", "Decide", "Synthesize", "Signal Merge"],
} as const;

function createCollaborationLinks(
  type: SimulationType,
  agentIds: string[],
  language: Language = DEFAULT_LANGUAGE,
): SandboxCollaborationLink[] {
  const [first, second, third, fourth, fifth, sixth, arbiter] = agentIds;
  const labels = language === "en-US" ? LINK_LABELS.en : LINK_LABELS.zh;

  return [
    {
      id: `${type}-support-primary`,
      sourceAgentId: first,
      targetAgentId: fourth,
      mode: "support",
      label: labels[0],
    },
    {
      id: `${type}-support-context`,
      sourceAgentId: third,
      targetAgentId: fifth,
      mode: "support",
      label: labels[1],
    },
    {
      id: `${type}-challenge-primary`,
      sourceAgentId: second,
      targetAgentId: first,
      mode: "challenge",
      label: labels[2],
    },
    {
      id: `${type}-challenge-risk`,
      sourceAgentId: sixth,
      targetAgentId: fourth,
      mode: "challenge",
      label: labels[3],
    },
    {
      id: `${type}-arbitrate-risk`,
      sourceAgentId: sixth,
      targetAgentId: arbiter,
      mode: "arbitrate",
      label: labels[4],
    },
    {
      id: `${type}-arbitrate-result`,
      sourceAgentId: arbiter,
      targetAgentId: first,
      mode: "arbitrate",
      label: labels[5],
    },
    {
      id: `${type}-synthesize-actions`,
      sourceAgentId: fourth,
      targetAgentId: arbiter,
      mode: "synthesize",
      label: labels[6],
    },
    {
      id: `${type}-synthesize-constraints`,
      sourceAgentId: fifth,
      targetAgentId: arbiter,
      mode: "synthesize",
      label: labels[7],
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

const EN_SCENARIOS: Record<SimulationType, SandboxScenario> = {
  side_hustle: {
    type: "side_hustle",
    title: "Side Hustle Sandbox",
    centerLabel: "Your side-hustle plan",
    accentName: "amber",
    accentClassName: "border-amber-300 bg-amber-50",
    textClassName: "text-amber-700",
    metrics: EN_METRICS,
    agents: [
      { id: "side_hustle-target-customer", label: "Target Customer", role: "Demand Validation", stance: "Skeptical" },
      { id: "side_hustle-competitor", label: "Competitor", role: "Market Pressure", stance: "Aggressive" },
      { id: "side_hustle-platform-traffic", label: "Platform Traffic", role: "Acquisition Variable", stance: "Volatile" },
      { id: "side_hustle-execution-coach", label: "Execution Coach", role: "Pace Management", stance: "Pushes" },
      { id: "side_hustle-cash-flow", label: "Cash Flow", role: "Monetization Constraint", stance: "Careful" },
      { id: "side_hustle-risk-audit", label: "Risk Audit", role: "Vulnerability Scan", stance: "Critical" },
      { id: "side_hustle-arbiter", label: "Arbiter", role: "Final Judgment", stance: "Neutral" },
    ],
    collaborationLinks: createCollaborationLinks("side_hustle", [
      "side_hustle-target-customer",
      "side_hustle-competitor",
      "side_hustle-platform-traffic",
      "side_hustle-execution-coach",
      "side_hustle-cash-flow",
      "side_hustle-risk-audit",
      "side_hustle-arbiter",
    ], "en-US"),
    stages: [
      { id: "side_hustle-stage-1", label: "Days 1-3", title: "Demand Probe", focus: "Validate real pain" },
      { id: "side_hustle-stage-2", label: "Days 4-7", title: "Minimum Delivery", focus: "Create a testable version" },
      { id: "side_hustle-stage-3", label: "Days 8-15", title: "Traffic Test", focus: "Observe acquisition quality" },
      { id: "side_hustle-stage-4", label: "Days 16-23", title: "Payment Validation", focus: "Test cash return" },
      { id: "side_hustle-stage-5", label: "Days 24-30", title: "Review Verdict", focus: "Decide continue or pivot" },
    ],
  },
  dating: {
    type: "dating",
    title: "Relationship Sandbox",
    centerLabel: "Your relationship move",
    accentName: "rose",
    accentClassName: "border-rose-300 bg-rose-50",
    textClassName: "text-rose-700",
    metrics: EN_METRICS,
    agents: [
      { id: "dating-ta", label: "TA", role: "Other Person's View", stance: "Observing" },
      { id: "dating-communication-coach", label: "Communication Coach", role: "Expression Strategy", stance: "Guides" },
      { id: "dating-boundary", label: "Boundary", role: "Relationship Limits", stance: "Protects" },
      { id: "dating-emotion", label: "Emotion", role: "Feeling Volatility", stance: "Sensitive" },
      { id: "dating-reality", label: "Reality", role: "Life Constraints", stance: "Practical" },
      { id: "dating-friend", label: "Outside Friend", role: "External Reminder", stance: "Direct" },
      { id: "dating-arbiter", label: "Arbiter", role: "Final Judgment", stance: "Neutral" },
    ],
    collaborationLinks: createCollaborationLinks("dating", [
      "dating-ta",
      "dating-communication-coach",
      "dating-boundary",
      "dating-emotion",
      "dating-reality",
      "dating-friend",
      "dating-arbiter",
    ], "en-US"),
    stages: [
      { id: "dating-stage-1", label: "Days 1-3", title: "Signal Reading", focus: "Read real feedback" },
      { id: "dating-stage-2", label: "Days 4-7", title: "Expression Tuning", focus: "Adjust communication" },
      { id: "dating-stage-3", label: "Days 8-15", title: "Boundary Test", focus: "Watch respect and response" },
      { id: "dating-stage-4", label: "Days 16-23", title: "Conflict Preview", focus: "Stress-test interaction" },
      { id: "dating-stage-5", label: "Days 24-30", title: "Relationship Verdict", focus: "Move closer or step back" },
    ],
  },
  life_choice: {
    type: "life_choice",
    title: "Life Choice Sandbox",
    centerLabel: "Your key decision",
    accentName: "indigo",
    accentClassName: "border-indigo-300 bg-indigo-50",
    textClassName: "text-indigo-700",
    metrics: EN_METRICS,
    agents: [
      { id: "life_choice-option-a", label: "Option A", role: "Path Upside", stance: "Advocates" },
      { id: "life_choice-option-b", label: "Option B", role: "Alternative Path", stance: "Advocates" },
      { id: "life_choice-future-self", label: "Future Self", role: "Long-Term View", stance: "Reminds" },
      { id: "life_choice-family", label: "Family Reality", role: "Support System", stance: "Conservative" },
      { id: "life_choice-resources", label: "Resources", role: "Constraint Check", stance: "Calm" },
      { id: "life_choice-fear", label: "Core Fear", role: "Mental Friction", stance: "Amplifies" },
      { id: "life_choice-arbiter", label: "Arbiter", role: "Final Judgment", stance: "Neutral" },
    ],
    collaborationLinks: createCollaborationLinks("life_choice", [
      "life_choice-option-a",
      "life_choice-option-b",
      "life_choice-future-self",
      "life_choice-family",
      "life_choice-resources",
      "life_choice-fear",
      "life_choice-arbiter",
    ], "en-US"),
    stages: [
      { id: "life_choice-stage-1", label: "Days 1-3", title: "Option Breakdown", focus: "Clarify the structure" },
      { id: "life_choice-stage-2", label: "Days 4-7", title: "Resource Check", focus: "Confirm the real base" },
      { id: "life_choice-stage-3", label: "Days 8-15", title: "Pressure Simulation", focus: "Preview the hard part" },
      { id: "life_choice-stage-4", label: "Days 16-23", title: "Long-Term View", focus: "Compare regret costs" },
      { id: "life_choice-stage-5", label: "Days 24-30", title: "Action Verdict", focus: "Choose the next move" },
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

const EN_STEP_LABELS: Partial<Record<SimulationProgressStep, string>> = {
  generate_agents: "Agents Arriving",
  initialize_world_state: "World Setup",
  simulate_stage: "Stage Simulation",
  generate_world_event: "Event Generation",
  generate_agent_actions: "Agent Interaction",
  arbitrate_stage: "Arbiter Review",
  generate_report: "Report Synthesis",
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

export function getAgentSandboxScenario(type: SimulationType, language: Language = DEFAULT_LANGUAGE): SandboxScenario {
  return copyScenario((language === "en-US" ? EN_SCENARIOS : SCENARIOS)[type]);
}

export function getLiveSandboxPhase(input: {
  scenario?: SandboxScenario;
  step?: SimulationProgressStep;
  percent: number;
  stageIndex?: number;
  language?: Language;
}): LiveSandboxPhase {
  const activeStageIndex =
    input.stageIndex === undefined
      ? getStageIndexFromPercent(input.percent)
      : clampStageIndex(input.stageIndex - 1);

  const language = input.language ?? DEFAULT_LANGUAGE;
  const stepLabels = language === "en-US" ? EN_STEP_LABELS : STEP_LABELS;

  return {
    label: input.step === undefined
      ? language === "en-US" ? "Preparing" : "准备中"
      : stepLabels[input.step] ?? (language === "en-US" ? "Simulating" : "推演中"),
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
