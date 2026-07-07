import type { InteractionMode } from "../types.js";

export const USER_ROLES = ["user", "admin", "owner"] as const;
export const USER_TIERS = ["basic", "pro", "business"] as const;
export const COMMERCIAL_FEATURES = [
  "deep_mode",
  "priority_queue",
  "custom_model_provider",
  "admin_ops",
] as const;
export const PROVIDER_MODES = ["platform", "byok"] as const;
export const ACCESS_CODE_STATUSES = ["active", "redeemed", "disabled", "expired"] as const;
export const CREDIT_LEDGER_ENTRY_TYPES = [
  "redeem",
  "hold",
  "capture",
  "release",
  "refund",
  "adjustment",
] as const;
export const COMMERCIAL_TASK_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
  "refunded",
] as const;
export const ADMIN_AUDIT_ACTIONS = [
  "access_code_batch_created",
  "access_code_batch_disabled",
  "access_code_disabled",
  "credits_adjusted",
  "task_refunded",
  "user_tier_changed",
] as const;
export const SIMULATION_CREDIT_COSTS = {
  platform: { legacy: 1, enabled: 3 },
  byok: { legacy: 1, enabled: 2 },
} as const;

export type UserRole = typeof USER_ROLES[number];
export type UserTier = typeof USER_TIERS[number];
export type CommercialFeature = typeof COMMERCIAL_FEATURES[number];
export type ProviderMode = typeof PROVIDER_MODES[number];
export type AccessCodeStatus = typeof ACCESS_CODE_STATUSES[number];
export type CreditLedgerEntryType = typeof CREDIT_LEDGER_ENTRY_TYPES[number];
export type CommercialTaskStatus = typeof COMMERCIAL_TASK_STATUSES[number];
export type AdminAuditAction = typeof ADMIN_AUDIT_ACTIONS[number];

export interface CommercialEntitlements {
  tier: UserTier;
  features: CommercialFeature[];
}

export function hasCommercialFeature(
  entitlements: CommercialEntitlements,
  feature: CommercialFeature,
): boolean {
  return entitlements.features.includes(feature);
}

export function isAdminRole(role: UserRole): boolean {
  return role === "admin" || role === "owner";
}

export function getSimulationCreditCost({
  interactionMode,
  providerMode,
}: {
  interactionMode: InteractionMode;
  providerMode: ProviderMode;
}): number {
  return SIMULATION_CREDIT_COSTS[providerMode][interactionMode];
}
