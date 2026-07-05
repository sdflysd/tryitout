import type { Agent, AgentLayer, SimulationType } from "../../types.js";

export interface AgentPool {
  coreAgents: Agent[];
  peripheralAgents: Agent[];
}

type PeripheralAgentTemplate = Pick<
  Agent,
  "id" | "name" | "role" | "stance" | "keyJudgment"
>;

const PERIPHERAL_ROLES: Record<SimulationType, PeripheralAgentTemplate[]> = {
  side_hustle: [
    {
      id: "lurker_user_agent",
      name: "围观用户 Agent",
      role: "看热闹但不轻易付费",
      stance: "观望",
      keyJudgment: "有趣不等于会掏钱。",
    },
    {
      id: "high_intent_customer_agent",
      name: "高意向客户 Agent",
      role: "愿意试用的精准用户",
      stance: "支持",
      keyJudgment: "只要能解决具体痛点，我愿意试。",
    },
    {
      id: "bargain_customer_agent",
      name: "砍价客户 Agent",
      role: "价格敏感用户",
      stance: "质疑",
      keyJudgment: "超过心理价位就会流失。",
    },
    {
      id: "comment_troll_agent",
      name: "评论区挑刺 Agent",
      role: "放大缺陷和负面反馈",
      stance: "拷打",
      keyJudgment: "一点漏洞就会被公开质疑。",
    },
    {
      id: "channel_creator_agent",
      name: "渠道博主 Agent",
      role: "掌握小流量入口",
      stance: "观望",
      keyJudgment: "传播需要足够抓人的钩子。",
    },
    {
      id: "supplier_agent",
      name: "供应商 Agent",
      role: "影响交付成本",
      stance: "观望",
      keyJudgment: "成本波动会吃掉利润。",
    },
    {
      id: "boss_colleague_agent",
      name: "老板同事 Agent",
      role: "影响现实精力",
      stance: "质疑",
      keyJudgment: "本职压力会挤压副业执行。",
    },
    {
      id: "family_agent",
      name: "家人 Agent",
      role: "现实稳定压力",
      stance: "质疑",
      keyJudgment: "别只顾折腾，先算清断粮风险。",
    },
  ],
  dating: [
    {
      id: "partner_friend_agent",
      name: "TA 的朋友 Agent",
      role: "影响 TA 的判断",
      stance: "质疑",
      keyJudgment: "朋友意见会放大不安全感。",
    },
    {
      id: "user_friend_agent",
      name: "用户朋友 Agent",
      role: "给用户出主意",
      stance: "支持",
      keyJudgment: "朋友可能鼓励，也可能带偏节奏。",
    },
    {
      id: "romantic_rival_agent",
      name: "潜在竞争者 Agent",
      role: "制造关系压力",
      stance: "拷打",
      keyJudgment: "不稳定表达会让机会流向别人。",
    },
    {
      id: "old_wound_agent",
      name: "前任阴影 Agent",
      role: "触发旧伤和防御",
      stance: "质疑",
      keyJudgment: "过去的伤会影响现在的反应。",
    },
    {
      id: "work_pressure_agent",
      name: "工作压力 Agent",
      role: "降低互动精力",
      stance: "观望",
      keyJudgment: "忙和累会让好话术也失效。",
    },
    {
      id: "family_pressure_agent",
      name: "家庭压力 Agent",
      role: "影响现实选择",
      stance: "质疑",
      keyJudgment: "现实阻力会进入亲密关系。",
    },
    {
      id: "group_chat_agent",
      name: "共同群聊 Agent",
      role: "影响社交氛围",
      stance: "观望",
      keyJudgment: "公开互动会改变私下态度。",
    },
    {
      id: "self_doubt_agent",
      name: "自我怀疑 Agent",
      role: "放大用户内耗",
      stance: "拷打",
      keyJudgment: "越急越容易说错。",
    },
  ],
  life_choice: [
    {
      id: "parent_agent",
      name: "父母 Agent",
      role: "家庭安全感压力",
      stance: "质疑",
      keyJudgment: "稳定和风险承受力必须算清。",
    },
    {
      id: "peer_agent",
      name: "同辈 Agent",
      role: "制造比较和 FOMO",
      stance: "观望",
      keyJudgment: "同辈动态会持续扰动选择。",
    },
    {
      id: "hr_agent",
      name: "HR Agent",
      role: "现实机会窗口",
      stance: "观望",
      keyJudgment: "机会不会无限等你。",
    },
    {
      id: "industry_senior_agent",
      name: "行业前辈 Agent",
      role: "判断行业趋势",
      stance: "质疑",
      keyJudgment: "要看三年后的赛道，而不是今天的情绪。",
    },
    {
      id: "future_self_agent",
      name: "未来自己 Agent",
      role: "长期后悔视角",
      stance: "观望",
      keyJudgment: "最怕的是选了也不执行。",
    },
    {
      id: "failed_self_agent",
      name: "失败版本自己 Agent",
      role: "最坏情况模拟",
      stance: "拷打",
      keyJudgment: "如果失败，退路是否还在？",
    },
    {
      id: "stable_self_agent",
      name: "稳定版本自己 Agent",
      role: "保守收益视角",
      stance: "支持",
      keyJudgment: "不折腾也可能是一种策略。",
    },
    {
      id: "cashflow_agent",
      name: "现金流 Agent",
      role: "生存底线",
      stance: "质疑",
      keyJudgment: "断粮周期决定选择边界。",
    },
  ],
};

function withLayer(agent: Agent, layer: AgentLayer): Agent {
  return { ...agent, layer };
}

export function splitAgentPool(agents: Agent[], type: SimulationType): AgentPool {
  return {
    coreAgents: agents.map((agent) => withLayer(agent, "core")),
    peripheralAgents: PERIPHERAL_ROLES[type].map((agent) => withLayer(agent, "peripheral")),
  };
}
