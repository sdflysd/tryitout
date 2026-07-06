import type {
  Agent,
  AgentRoleCard,
  AgentRoleCardCategory,
  SimulationType,
} from "../../types.js";
import { assessAgentRoleCardQuality } from "./agent-role-card-quality.js";

type PartialRoleCard = Partial<AgentRoleCard>;

export const DEFAULT_FORBIDDEN_BEHAVIORS = [
  "不要编造事实或案例。",
  "不要给出违法、操控或侵犯隐私的建议。",
  "不要越过当前场景边界替用户做现实承诺。",
];

export function normalizeAgentRoleCards(
  agents: Agent[],
  type: SimulationType,
): Agent[] {
  return agents.map((agent) => normalizeAgentRoleCard(agent, type));
}

export function normalizeAgentRoleCard(
  agent: Agent,
  type: SimulationType,
): Agent {
  const existing = (agent.roleCard ?? {}) as PartialRoleCard;
  const category = existing.category ?? inferRoleCardCategory(agent);

  const roleCard: AgentRoleCard = {
    category,
    identity: nonEmpty(existing.identity, `${agent.name}：${agent.role}`),
    realWorldArchetype: nonEmpty(existing.realWorldArchetype, buildArchetype(agent, type, category)),
    relationshipToUser: nonEmpty(existing.relationshipToUser, buildRelationshipToUser(agent, category)),
    goal: nonEmpty(existing.goal, buildGoal(agent, type, category)),
    fears: nonEmptyArray(existing.fears, buildFears(agent, type, category)),
    knownInfo: nonEmptyArray(existing.knownInfo, buildKnownInfo(agent, type)),
    unknownInfo: nonEmptyArray(existing.unknownInfo, buildUnknownInfo(type)),
    capabilities: nonEmptyArray(existing.capabilities, buildCapabilities(agent, category)),
    triggerConditions: nonEmptyArray(existing.triggerConditions, buildTriggerConditions(agent, type, category)),
    decisionModel: nonEmpty(existing.decisionModel, buildDecisionModel(agent, category)),
    stateInfluence: nonEmptyArray(existing.stateInfluence, buildStateInfluence(type, category)),
    speakingStyle: nonEmpty(existing.speakingStyle, buildSpeakingStyle(agent)),
    forbiddenBehaviors: nonEmptyArray(existing.forbiddenBehaviors, DEFAULT_FORBIDDEN_BEHAVIORS),
    memoryPolicy: nonEmpty(
      existing.memoryPolicy,
      "短期记住本次推演中的关键证据、承诺、风险信号和被反驳观点，不把模拟当作现实事实。",
    ),
  };

  const quality = assessAgentRoleCardQuality(
    {
      ...agent,
      roleCard,
    },
    type,
  );
  if (!quality.ok) {
    if (quality.reasons.includes("goal_too_vague")) {
      roleCard.goal = buildGoal(agent, type, category);
    }
    if (quality.reasons.includes("trigger_too_vague")) {
      roleCard.triggerConditions = buildTriggerConditions(agent, type, category);
    }
    if (quality.reasons.includes("decision_model_too_short")) {
      roleCard.decisionModel = buildDecisionModel(agent, category);
    }
    if (quality.reasons.includes("forbidden_behaviors_missing_safety")) {
      roleCard.forbiddenBehaviors = DEFAULT_FORBIDDEN_BEHAVIORS;
    }
  }

  return {
    ...agent,
    roleCard,
  };
}

function inferRoleCardCategory(agent: Agent): AgentRoleCardCategory {
  const text = `${agent.id} ${agent.name} ${agent.role} ${agent.stance} ${agent.keyJudgment} ${agent.objection ?? ""}`;

  if (/(用户本人|本人|自我|self|焦虑|内耗)/i.test(text)) {
    return "user_inner_system";
  }
  if (/(客户|用户|TA|对方|伴侣|父母|家人|朋友|HR|同辈|长辈|partner|parent|peer)/i.test(text)) {
    return "stakeholder";
  }
  if (/(竞争|竞品|对手|追求者|情敌|同行|替代|rival|competitor)/i.test(text)) {
    return "opposition_competition";
  }
  if (/(教练|导师|分析师|精算师|观察员|裁判|顾问|审计|arbiter|mentor|coach)/i.test(text)) {
    return "expert_arbiter";
  }
  if (/(未来|失败版本|稳定版本|最坏|最好|备选|counterfactual)/i.test(text)) {
    return "counterfactual_system";
  }
  if (/(平台|流量|现金流|工作压力|社会现实|行业|市场|渠道|环境|压力)/i.test(text)) {
    return "environment_system";
  }

  return "environment_system";
}

function buildArchetype(
  agent: Agent,
  type: SimulationType,
  category: AgentRoleCardCategory,
): string {
  if (category === "stakeholder") {
    return type === "dating" ? "真实关系中的关键相关方" : "会影响决策结果的真实利益相关方";
  }
  if (category === "expert_arbiter") {
    return "负责拆解证据、风险和行动边界的专业评估者";
  }
  if (category === "opposition_competition") {
    return "会分走注意力、资源或机会的竞争力量";
  }
  if (category === "counterfactual_system") {
    return "模拟另一路径、未来后悔或最坏情况的对照视角";
  }
  if (category === "user_inner_system") {
    return "用户内在动机、恐惧、拖延或冲动的拟人化部分";
  }

  return `${agent.role} 所代表的现实环境力量`;
}

function buildRelationshipToUser(agent: Agent, category: AgentRoleCardCategory): string {
  if (category === "user_inner_system") {
    return "用户内在状态的一部分";
  }
  if (category === "stakeholder") {
    return `与用户方案直接相关的 ${agent.role}`;
  }
  if (category === "opposition_competition") {
    return "与用户目标争夺资源、信任或机会";
  }
  if (category === "expert_arbiter") {
    return "为用户提供约束、拆解和裁决视角";
  }
  if (category === "counterfactual_system") {
    return "代表用户可能面对的另一种结果";
  }

  return "外部环境变量，会改变推演中的风险与机会";
}

function buildGoal(
  agent: Agent,
  type: SimulationType,
  category: AgentRoleCardCategory,
): string {
  if (category === "stakeholder") {
    return `以${agent.role}视角判断用户方案是否值得信任、投入或继续互动。`;
  }
  if (category === "expert_arbiter") {
    return "用证据和约束识别关键风险，逼近更稳妥的下一步。";
  }
  if (category === "opposition_competition") {
    return "测试用户方案在竞争、替代选择和注意力分流下是否站得住。";
  }
  if (category === "counterfactual_system") {
    return "提醒用户看到另一条路径的收益、代价和后悔风险。";
  }
  if (category === "user_inner_system") {
    return "暴露用户自身最可能影响执行和判断的心理变量。";
  }

  return `${agent.role}负责把${scenarioLabel(type)}中的现实压力带入推演。`;
}

function buildFears(
  agent: Agent,
  type: SimulationType,
  category: AgentRoleCardCategory,
): string[] {
  const base = agent.objection ? [agent.objection] : [];
  if (category === "stakeholder") {
    return [...base, "投入后没有得到预期价值", "用户忽略真实边界和反馈"];
  }
  if (category === "expert_arbiter") {
    return [...base, "用户过度自信", "关键证据不足仍仓促行动"];
  }
  if (type === "dating") {
    return [...base, "表达失衡导致关系压力升高", "边界感被忽略"];
  }

  return [...base, "资源被消耗却没有换来有效进展", "最坏情况没有退路"];
}

function buildKnownInfo(agent: Agent, type: SimulationType): string[] {
  return [
    `当前场景是${scenarioLabel(type)}。`,
    `${agent.name} 的角色职责是${agent.role}。`,
    `核心判断：${agent.keyJudgment}`,
  ];
}

function buildUnknownInfo(type: SimulationType): string[] {
  if (type === "dating") {
    return ["对方真实想法与边界", "沟通后对方的实际反应", "外部压力是否会放大误解"];
  }
  if (type === "life_choice") {
    return ["未来机会窗口变化", "家庭与现金流承压程度", "用户长期执行韧性"];
  }

  return ["真实付费意愿", "获客成本和转化率", "竞争对手反应"];
}

function buildCapabilities(agent: Agent, category: AgentRoleCardCategory): string[] {
  const capabilities = ["提出一针见血的判断", "指出关键风险和证据缺口"];
  if (category === "stakeholder") {
    capabilities.push("模拟真实反馈和接受门槛");
  }
  if (category === "expert_arbiter") {
    capabilities.push("裁决不同 Agent 观点的证据权重");
  }
  if (category === "opposition_competition") {
    capabilities.push("制造竞争压力和替代方案比较");
  }
  if (agent.stance) {
    capabilities.push(`以${agent.stance}立场参与讨论`);
  }

  return capabilities;
}

function buildTriggerConditions(
  agent: Agent,
  type: SimulationType,
  category: AgentRoleCardCategory,
): string[] {
  const triggers = agent.objection ? [agent.objection] : [];
  if (category === "stakeholder") {
    triggers.push(type === "dating" ? "表达过度或边界不清" : "缺少真实案例或信任证据");
  }
  if (category === "expert_arbiter") {
    triggers.push("关键证据不足", "风险被轻描淡写");
  }
  if (category === "opposition_competition") {
    triggers.push("出现更低成本或更高吸引力的替代选择");
  }
  if (category === "user_inner_system") {
    triggers.push("用户拖延、上头或害怕失败");
  }
  triggers.push("世界状态出现明显变化");

  return uniqueNonEmpty(triggers);
}

function buildDecisionModel(agent: Agent, category: AgentRoleCardCategory): string {
  if (category === "stakeholder") {
    return "先看证据和边界，再决定是否信任、投入或继续互动。";
  }
  if (category === "expert_arbiter") {
    return "优先比较证据强度、最坏情况和可逆性，再给出裁决。";
  }
  if (category === "opposition_competition") {
    return "寻找用户方案中的薄弱点，并用替代方案测试其稳定性。";
  }
  if (category === "counterfactual_system") {
    return "比较当前路径与另一种路径的长期收益、机会成本和后悔概率。";
  }

  return `${agent.stance || "观望"}立场下，依据风险、收益、证据和状态变化作判断。`;
}

function buildStateInfluence(
  type: SimulationType,
  category: AgentRoleCardCategory,
): string[] {
  if (type === "dating") {
    return category === "stakeholder"
      ? ["productClarity", "trafficProgress", "riskLevel"]
      : ["executionEnergy", "confidence", "riskLevel"];
  }
  if (type === "life_choice") {
    return category === "stakeholder"
      ? ["paidUsers", "riskLevel", "confidence"]
      : ["productClarity", "executionEnergy", "revenue"];
  }

  return category === "stakeholder"
    ? ["willingnessToPay", "riskLevel", "confidence"]
    : ["productClarity", "executionEnergy", "trafficProgress"];
}

function buildSpeakingStyle(agent: Agent): string {
  if (/拷打|质疑/.test(agent.stance)) {
    return "直接、挑剔、重视证据，不替用户粉饰风险。";
  }
  if (/支持/.test(agent.stance)) {
    return "鼓励但不盲目乐观，会把支持落到具体条件。";
  }

  return "冷静观察、保留判断，用现实信号推进讨论。";
}

function nonEmpty(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function nonEmptyArray(value: string[] | undefined, fallback: string[]): string[] {
  const items = uniqueNonEmpty(value ?? []);
  return items.length > 0 ? items : uniqueNonEmpty(fallback);
}

function uniqueNonEmpty(items: string[]): string[] {
  return Array.from(
    new Set(
      items
        .map((item) => String(item).trim())
        .filter((item) => item.length > 0),
    ),
  );
}

function scenarioLabel(type: SimulationType): string {
  if (type === "dating") return "恋爱沟通";
  if (type === "life_choice") return "人生抉择";
  return "副业试错";
}
