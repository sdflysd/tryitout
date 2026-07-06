import { DEFAULT_LANGUAGE, Language } from "../language";

export function getPrivacySafetyCopy(language: Language = DEFAULT_LANGUAGE): string {
  if (language === "en-US") {
    return "Privacy note: do not enter ID numbers, phone numbers, legal names, or full addresses. Validation events only record behavior, ratings, price intent, and short feedback you choose to submit; raw chat or full original inputs are not written into validation events. For investment, medical, legal, or personal-safety issues, rely on qualified professionals.";
  }

  return "隐私提醒：请勿填写身份证、手机号、真实姓名或完整住址。验证埋点只记录行为、评分、价格意愿和你主动填写的短反馈，不会把完整原始聊天写入验证事件；涉及投资、医疗、法律或人身安全的问题，请以专业人士建议为准。";
}
