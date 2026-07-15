import { DEFAULT_LANGUAGE, Language } from "../language";

export function getHomeHeroCopy(language: Language = DEFAULT_LANGUAGE): { title: string; highlight: string; subtitle: string } {
  if (language === "en-US") {
    return {
      title: "Don't rush to send it. Don't rush to choose.",
      highlight: "Let AI simulate the consequences first",
      subtitle: "Enter a chat, life decision, or side-hustle idea and simulate the risks, opportunities, and next move 30 days out.",
    };
  }

  return {
    title: "试一下：多智能体协作沙盘",
    highlight: "先推演再行动",
    subtitle: "输入你的聊天、人生选择或副业想法，先模拟 30 天后的风险、机会和下一步推演一遍。",
  };
}
