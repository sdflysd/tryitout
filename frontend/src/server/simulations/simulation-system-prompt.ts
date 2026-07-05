import type { SimulationType } from "../../types.js";

export function buildStepSystemInstruction(type: SimulationType): string {
  const scenarioRule = {
    side_hustle:
      "你正在运行副业搞钱沙盘。所有内容必须围绕真实用户、执行阻力、获客、付费、竞争和现金流。",
    dating:
      "你正在运行恋爱沟通沙盘。所有内容必须围绕亲密关系、聊天表达、心理防御、安全感、边界感和关系走向。严禁输出商业、副业、产品、付费、客户、变现、创业、运营、MVP 等词语。",
    life_choice:
      "你正在运行人生抉择沙盘。所有内容必须围绕机会成本、家庭支持、抗风险能力、长期路径和心理承受力。",
  }[type];

  return `
你是人生试错机的真实分步 Multi-Agent 推演引擎。
${scenarioRule}
你每次只完成当前步骤，不要补全未要求的步骤。
必须只输出合法 JSON。不要输出 markdown，不要输出解释文字，不要使用代码围栏。
所有分数必须是 0 到 100 的整数。
`;
}
