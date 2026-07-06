import type { InteractionMode } from "../types.js";

export const USER_TIERS = ["basic", "pro", "business"] as const;
export type UserTier = (typeof USER_TIERS)[number];

export const COMMERCIAL_FEATURES = ["custom_model_provider"] as const;
export type CommercialFeature = (typeof COMMERCIAL_FEATURES)[number];

export const ACCESS_CODE_STATUSES = ["active", "redeemed", "disabled", "expired"] as const;
export type AccessCodeStatus = (typeof ACCESS_CODE_STATUSES)[number];

export const CREDIT_LEDGER_ENTRY_TYPES = ["redeem", "hold", "capture", "release", "adjustment"] as const;
export type CreditLedgerEntryType = (typeof CREDIT_LEDGER_ENTRY_TYPES)[number];

export const COMMERCIAL_TASK_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
  "refunded",
] as const;
export type CommercialTaskStatus = (typeof COMMERCIAL_TASK_STATUSES)[number];

export type CommercialProviderMode = "platform" | "byok";

export const SIMULATION_CREDIT_COSTS = {
  platform: {
    legacy: 1,
    enabled: 3,
  },
  byok: {
    legacy: 1,
    enabled: 2,
  },
} as const satisfies Record<CommercialProviderMode, Record<InteractionMode, number>>;

export interface CommercialEntitlements {
  tier: UserTier;
  features: readonly CommercialFeature[];
}

export function hasCommercialFeature(
  entitlements: CommercialEntitlements,
  feature: CommercialFeature,
): boolean {
  return entitlements.features.includes(feature);
}

export function getSimulationCreditCost(options: {
  interactionMode: InteractionMode;
  providerMode: CommercialProviderMode;
}): number {
  return SIMULATION_CREDIT_COSTS[options.providerMode][options.interactionMode];
}
