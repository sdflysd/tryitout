export const INITIAL_USER_CREDITS_SETTING_KEY = "users.initial_credits";
export const DEFAULT_INITIAL_USER_CREDITS = 3;
export const INITIAL_USER_CREDITS_SETTING_DESCRIPTION =
  "Initial available credits for newly registered users";

export function resolveInitialUserCredits(value: unknown): number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0
    ? value
    : DEFAULT_INITIAL_USER_CREDITS;
}
