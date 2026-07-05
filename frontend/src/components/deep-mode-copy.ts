export function getDeepModeCopy(): { title: string; description: string } {
  return {
    title: "深度 Agent 博弈模式",
    description: "开启后会生成世界事件、Agent 动作与投票、裁判仲裁和状态变化，耗时更久但报告更可解释。",
  };
}

export function getDeepModeUnavailableNotice(): string {
  return "本次服务端未启用深度 Agent 模式，已自动使用基础推演模式生成报告。";
}

export function getDeepModeDisabledCopy(reason = ""): string {
  return reason
    ? `服务端未启用深度 Agent 模式，本次将使用基础模式。${reason}`
    : "服务端未启用深度 Agent 模式，本次将使用基础模式。";
}
