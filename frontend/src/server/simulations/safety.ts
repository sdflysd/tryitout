import type { Report, SimulationType, UserInput } from "../../types.js";

export type SafetyCategory =
  | "illegal_or_gray_business"
  | "manipulative_or_privacy_invasive_relationship"
  | "privacy_or_harassment"
  | "allowed";

export type SafetyAssessment =
  | { ok: true; category: "allowed"; message?: string }
  | { ok: false; category: Exclude<SafetyCategory, "allowed">; message: string };

interface SafetyCheckPromptParams {
  type: SimulationType;
  userInput: UserInput;
}

const ILLEGAL_OR_GRAY_BUSINESS_PATTERN =
  /(违法|诈骗|骗钱|灰产|黑产|赌博|博彩|色情|洗钱|跑分|套现|刷单|薅羊毛|盗号|引流.*(赌博|博彩|色情|诈骗|黑产|灰产)|诱导.*(充值|转账|贷款|投资)|虚假宣传|金融荐股|荐股|杀猪盘)/i;

const MANIPULATIVE_DATING_PATTERN =
  /(PUA|pua|操控|控制对方|拿捏|精神控制|煤气灯|情感操纵|套路.*(上头|依赖|服从)|诱导.*(发生关系|亲密|复合)|欺骗.*感情|监控|定位|查岗|跟踪|偷拍|窃取|破解.*(手机|微信|账号|密码)|骚扰|侵犯隐私)/i;

const PRIVACY_OR_HARASSMENT_PATTERN =
  /(监控|定位|跟踪|偷拍|窃取|破解.*(手机|微信|账号|密码)|人肉|开盒|骚扰|侵犯隐私)/i;

export function assessUserInputSafety(userInput: UserInput): SafetyAssessment {
  const text = flattenUserInput(userInput);

  if (userInput.type === "dating" && MANIPULATIVE_DATING_PATTERN.test(text)) {
    return {
      ok: false,
      category: "manipulative_or_privacy_invasive_relationship",
      message:
        "我不能帮你推演操控、欺骗、监控或侵犯隐私的做法。可以帮你改成尊重边界、真诚表达和健康沟通的方案。",
    };
  }

  if (userInput.type === "side_hustle" && ILLEGAL_OR_GRAY_BUSINESS_PATTERN.test(text)) {
    return {
      ok: false,
      category: "illegal_or_gray_business",
      message:
        "这个方向可能涉及违法、诈骗、灰产、黑产或侵犯他人权益，我不能帮你推演具体执行方案。可以改成合规、透明、尊重用户权益的替代方向。",
    };
  }

  if (PRIVACY_OR_HARASSMENT_PATTERN.test(text)) {
    return {
      ok: false,
      category: "privacy_or_harassment",
      message:
        "我不能帮你推演监控、跟踪、骚扰、窃取信息或侵犯隐私的做法。可以改成尊重边界、公开透明的沟通方案。",
    };
  }

  return { ok: true, category: "allowed" };
}

export function buildSafetyGuidance(type: SimulationType): string {
  const scenarioRule = {
    side_hustle:
      "副业场景不得生成违法、诈骗、灰产、黑产、赌博、色情引流、诱导充值、洗钱套现、虚假宣传等具体执行方案。",
    dating:
      "恋爱场景不得生成 PUA、操控、欺骗、监控定位、查岗跟踪、骚扰、侵犯隐私或诱导亲密行为的方案。",
    life_choice:
      "人生抉择场景不得伪装成确定性的职业、法律、医疗、心理或金融建议，只能提供模拟视角与风险对比。",
  }[type];

  return `
【安全与边界要求】
${scenarioRule}
如果用户输入触及违法、灰产、操控、侵犯隐私、骚扰或伤害他人权益，只能拒绝具体执行推演，并引导到合规、透明、尊重边界的替代方案。
最终报告必须包含“免责声明”：本报告仅用于模拟参考，不构成投资、职业、法律、医疗或心理建议；重要决定请结合专业人士意见与现实情况自行判断。
`;
}

export function getDefaultReportDisclaimer(type: SimulationType): string {
  const scenarioLabel = {
    side_hustle: "副业项目",
    dating: "恋爱沟通",
    life_choice: "人生抉择",
  }[type];

  return `本报告仅用于${scenarioLabel}模拟参考，不构成投资、职业、法律、医疗或心理建议，也不保证现实结果。重要决定请结合真实信息、专业人士意见和自身风险承受能力自行判断。`;
}

export function buildSafetyCheckPrompt({
  type,
  userInput,
}: SafetyCheckPromptParams): string {
  return `
你是 TryItOut 的内容安全检查器。请判断用户输入是否适合进入多 Agent 推演。
${buildSafetyGuidance(type)}

用户输入：
${JSON.stringify(userInput, null, 2)}

只输出合法 JSON，不要输出 Markdown，不要输出代码块：
{
  "allowed": true,
  "reason": "一句话说明为什么可以继续或必须拒绝",
  "category": "allowed/illegal_or_gray_business/manipulative_or_privacy_invasive_relationship/privacy_or_harassment",
  "message": "如果 allowed=false，给用户看的中文拒绝说明"
}
`;
}

export function ensureReportDisclaimer(report: Report, type: SimulationType): Report {
  const disclaimer = report.disclaimer?.trim() || getDefaultReportDisclaimer(type);
  return { ...report, disclaimer };
}

function flattenUserInput(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.map((item) => flattenUserInput(item)).join(" ");
  }

  if (typeof value === "object") {
    return Object.values(value)
      .map((item) => flattenUserInput(item))
      .join(" ");
  }

  return String(value);
}
