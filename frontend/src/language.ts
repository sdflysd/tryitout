export type Language = "zh-CN" | "en-US";

export const DEFAULT_LANGUAGE: Language = "zh-CN";
export const LANGUAGE_STORAGE_KEY = "tryitout_language";

export function parseStoredLanguage(value: string | null): Language | undefined {
  if (value === "zh-CN" || value === "en-US") {
    return value;
  }

  return undefined;
}

export function getNextLanguage(language: Language): Language {
  return language === "zh-CN" ? "en-US" : "zh-CN";
}

export function getLanguageToggleLabel(language: Language): string {
  return language === "zh-CN" ? "EN" : "中";
}
