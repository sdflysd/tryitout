import type { SimulationType, WorldStateDelta } from "../types";

type WorldStateDeltaKey = keyof WorldStateDelta;

const FIELD_LABELS: Record<SimulationType, Record<WorldStateDeltaKey, string>> = {
  side_hustle: {
    day: "天数",
    productClarity: "产品清晰度",
    executionEnergy: "执行动力",
    trafficProgress: "获客流量进度",
    trialUsers: "试用用户",
    paidUsers: "付费用户",
    revenue: "模拟收入",
    riskLevel: "风险等级",
    confidence: "信心指数",
  },
  dating: {
    day: "天数",
    productClarity: "沟通契合度",
    executionEnergy: "情绪动力",
    trafficProgress: "信任积累",
    trialUsers: "互动频率",
    paidUsers: "约会邀请进展",
    revenue: "情感默契值",
    riskLevel: "彻底凉凉风险",
    confidence: "信心指数",
  },
  life_choice: {
    day: "天数",
    productClarity: "决策明晰度",
    executionEnergy: "精神能量",
    trafficProgress: "当前进展",
    trialUsers: "试错探索值",
    paidUsers: "现实面包保障度",
    revenue: "长远预期值",
    riskLevel: "悔恨与断粮风险",
    confidence: "信心指数",
  },
};

export function getWorldStateFieldLabel(
  type: SimulationType,
  field: string,
): string {
  return FIELD_LABELS[type][field as WorldStateDeltaKey] ?? field;
}

export function formatWorldStateDelta(
  delta: WorldStateDelta,
  type: SimulationType,
  separator = ", ",
): string {
  const entries = Object.entries(delta).filter(
    ([, value]) => typeof value === "number",
  );

  if (entries.length === 0) {
    return "无数值变化";
  }

  return entries
    .map(([key, value]) => {
      const numericValue = Number(value);
      const sign = numericValue >= 0 ? "+" : "";
      return `${getWorldStateFieldLabel(type, key)} ${sign}${numericValue}`;
    })
    .join(separator);
}
