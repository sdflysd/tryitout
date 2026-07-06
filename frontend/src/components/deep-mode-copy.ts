import { DEFAULT_LANGUAGE, Language } from "../language";

export function getDeepModeCopy(language: Language = DEFAULT_LANGUAGE): { title: string; description: string } {
  if (language === "en-US") {
    return {
      title: "Deep Agent Debate Mode",
      description: "Generates world events, Agent actions and votes, arbiter decisions, and state changes. It takes longer, but the report is easier to inspect.",
    };
  }

  return {
    title: "深度 Agent 博弈模式",
    description: "开启后会生成世界事件、Agent 动作与投票、裁判仲裁和状态变化，耗时更久但报告更可解释。",
  };
}

export function getDeepModeUnavailableNotice(language: Language = DEFAULT_LANGUAGE): string {
  if (language === "en-US") {
    return "Deep Agent mode is not enabled on this server, so this report was generated with the basic simulation mode.";
  }

  return "本次服务端未启用深度 Agent 模式，已自动使用基础推演模式生成报告。";
}

export function getDeepModeDisabledCopy(reason = "", language: Language = DEFAULT_LANGUAGE): string {
  if (language === "en-US") {
    return reason
      ? `Deep Agent mode is not enabled on this server, so this run will use basic mode. ${reason}`
      : "Deep Agent mode is not enabled on this server, so this run will use basic mode.";
  }

  return reason
    ? `服务端未启用深度 Agent 模式，本次将使用基础模式。${reason}`
    : "服务端未启用深度 Agent 模式，本次将使用基础模式。";
}
