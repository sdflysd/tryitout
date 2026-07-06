import { DEFAULT_LANGUAGE, Language } from "../language";

export function getHomeHeroCopy(language: Language = DEFAULT_LANGUAGE): { title: string; highlight: string; subtitle: string } {
  if (language === "en-US") {
    return {
      title: "Don't rush to send it. Don't rush to choose.",
      highlight: "Let AI simulate the consequences first",
      subtitle: "Enter a chat, life decision, or side-hustle idea and preview the risks, opportunities, and next move 30 days out.",
    };
  }

  return {
    title: "别急着发，别急着选",
    highlight: "先让 AI 替你试一次后果",
    subtitle: "输入你的聊天、人生选择或副业想法，先模拟试一次 30 天后的风险、机会和下一步。",
  };
}
