import type {
  Agent,
  AgentRoleCardCategory,
  SimulationType,
} from "../../types.js";

export interface AgentCompositionSlot {
  key: string;
  category: AgentRoleCardCategory;
  label: string;
  purpose: string;
}

export interface AgentCompositionSpec {
  type: SimulationType;
  slots: AgentCompositionSlot[];
}

const SHARED_SLOT_ORDER: AgentRoleCardCategory[] = [
  "user_inner_system",
  "stakeholder",
  "stakeholder",
  "opposition_competition",
  "environment_system",
  "expert_arbiter",
  "counterfactual_system",
];

const SPECS: Record<SimulationType, AgentCompositionSpec> = {
  side_hustle: {
    type: "side_hustle",
    slots: [
      {
        key: "self",
        category: SHARED_SLOT_ORDER[0],
        label: "用户执行者",
        purpose: "暴露时间、技能、拖延和执行风险",
      },
      {
        key: "customer",
        category: SHARED_SLOT_ORDER[1],
        label: "目标客户",
        purpose: "判断是否愿意相信和付费",
      },
      {
        key: "buyer",
        category: SHARED_SLOT_ORDER[2],
        label: "高意向或价格敏感用户",
        purpose: "测试成交门槛和信任证据",
      },
      {
        key: "competitor",
        category: SHARED_SLOT_ORDER[3],
        label: "竞争/替代方案",
        purpose: "测试差异化是否成立",
      },
      {
        key: "market",
        category: SHARED_SLOT_ORDER[4],
        label: "流量与现金流环境",
        purpose: "施加获客、成本、预算压力",
      },
      {
        key: "expert",
        category: SHARED_SLOT_ORDER[5],
        label: "商业精算/导师",
        purpose: "拆解闭环和最小验证",
      },
      {
        key: "future",
        category: SHARED_SLOT_ORDER[6],
        label: "30天后版本自己",
        purpose: "模拟后悔和继续/停止判断",
      },
    ],
  },
  dating: {
    type: "dating",
    slots: [
      {
        key: "self",
        category: SHARED_SLOT_ORDER[0],
        label: "用户内在情绪",
        purpose: "暴露焦虑、逃避或表达冲动",
      },
      {
        key: "partner",
        category: SHARED_SLOT_ORDER[1],
        label: "对方 TA",
        purpose: "模拟对方边界、困惑和安全感",
      },
      {
        key: "friend",
        category: SHARED_SLOT_ORDER[2],
        label: "朋友/共同社交圈",
        purpose: "提供旁观反馈和关系压力",
      },
      {
        key: "rival",
        category: SHARED_SLOT_ORDER[3],
        label: "竞争者/替代亲密选择",
        purpose: "测试关系吸引力和不稳定风险",
      },
      {
        key: "reality",
        category: SHARED_SLOT_ORDER[4],
        label: "现实压力",
        purpose: "引入距离、工作、家庭和节奏变量",
      },
      {
        key: "coach",
        category: SHARED_SLOT_ORDER[5],
        label: "关系分析师",
        purpose: "约束健康沟通和边界",
      },
      {
        key: "future",
        category: SHARED_SLOT_ORDER[6],
        label: "30天后关系状态",
        purpose: "模拟升温、降温或止损结局",
      },
    ],
  },
  life_choice: {
    type: "life_choice",
    slots: [
      {
        key: "self",
        category: SHARED_SLOT_ORDER[0],
        label: "纠结中的自己",
        purpose: "暴露恐惧、FOMO和执行摇摆",
      },
      {
        key: "family",
        category: SHARED_SLOT_ORDER[1],
        label: "家庭/伴侣相关方",
        purpose: "施加稳定和现实责任压力",
      },
      {
        key: "opportunity",
        category: SHARED_SLOT_ORDER[2],
        label: "机会窗口相关方",
        purpose: "测试每个选择的现实进入门槛",
      },
      {
        key: "alternative",
        category: SHARED_SLOT_ORDER[3],
        label: "竞争路径",
        purpose: "代表另一个选择的吸引力和机会成本",
      },
      {
        key: "environment",
        category: SHARED_SLOT_ORDER[4],
        label: "现金流/行业环境",
        purpose: "施加生存底线和周期变量",
      },
      {
        key: "expert",
        category: SHARED_SLOT_ORDER[5],
        label: "职业/人生精算师",
        purpose: "裁决可逆性、抗风险和长期收益",
      },
      {
        key: "future",
        category: SHARED_SLOT_ORDER[6],
        label: "未来自己",
        purpose: "模拟后悔、沉没成本和长期心安",
      },
    ],
  },
};

export function getAgentCompositionSpec(type: SimulationType): AgentCompositionSpec {
  return SPECS[type];
}

export function buildAgentCompositionPrompt(type: SimulationType): string {
  const spec = getAgentCompositionSpec(type);
  return [
    "必须严格生成以下 7 个 Agent 槽位，不得合并、不得缺失、不得新增：",
    ...spec.slots.map(
      (slot, index) =>
        `${index + 1}. ${slot.key}: category=${slot.category}; label=${slot.label}; purpose=${slot.purpose}`,
    ),
  ].join("\n");
}

export function enforceAgentComposition(
  agents: Agent[],
  type: SimulationType,
): Agent[] {
  const slots = getAgentCompositionSpec(type).slots;
  return agents.slice(0, 7).map((agent, index) => {
    const slot = slots[index];
    return {
      ...agent,
      roleCard: {
        ...agent.roleCard,
        category: slot.category,
        identity: agent.roleCard?.identity ?? slot.label,
        goal: agent.roleCard?.goal ?? slot.purpose,
      },
    };
  });
}
