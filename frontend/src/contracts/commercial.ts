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
  "access_code_batch_exported",
  "access_code_disabled",
  "access_code_restored",
  "access_code_deleted",
  "access_codes_bulk_disabled",
  "access_codes_bulk_restored",
  "access_codes_bulk_deleted",
  "user_credit_adjusted",
  "credits_adjusted",
  "user_created",
  "task_refunded",
  "task_retried",
  "task_cancelled",
  "user_updated",
  "user_disabled",
  "user_restored",
  "user_deleted",
  "user_tier_changed",
  "sensitive_report_viewed",
  "platform_model_provider_saved",
  "platform_model_provider_tested",
  "platform_model_provider_models_listed",
  "platform_model_profiles_updated",
  "system_setting_updated",
  "queue_paused",
  "queue_resumed",
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

export interface CommercialEntitlementGrant {
  tier?: UserTier;
  features: CommercialFeature[];
  startsAt?: string;
  expiresAt?: string;
}

export function hasCommercialFeature(
  entitlements: CommercialEntitlements,
  feature: CommercialFeature,
): boolean {
  return entitlements.features.includes(feature);
}

export function resolveCommercialEntitlements(
  baseline: CommercialEntitlements,
  grants: CommercialEntitlementGrant[],
  at: Date | string = new Date(),
): CommercialEntitlements {
  const atMs = dateValue(at);
  const activeGrants = grants.filter((grant) => isGrantActive(grant, atMs));
  const tier = activeGrants.reduce(
    (current, grant) => highestTier(current, grant.tier),
    baseline.tier,
  );
  const features = mergeUniqueFeatures(
    baseline.features,
    activeGrants.flatMap((grant) => grant.features),
  );

  return { tier, features };
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

function highestTier(current: UserTier, candidate: UserTier | undefined): UserTier {
  if (candidate === undefined) {
    return current;
  }

  return USER_TIERS.indexOf(candidate) > USER_TIERS.indexOf(current)
    ? candidate
    : current;
}

function mergeUniqueFeatures(
  current: CommercialFeature[],
  granted: CommercialFeature[],
): CommercialFeature[] {
  return [...new Set([...current, ...granted])];
}

function isGrantActive(
  grant: CommercialEntitlementGrant,
  atMs: number,
): boolean {
  const startsAtMs = optionalDateValue(grant.startsAt);
  const expiresAtMs = optionalDateValue(grant.expiresAt);

  if (startsAtMs !== undefined && startsAtMs > atMs) {
    return false;
  }
  if (expiresAtMs !== undefined && expiresAtMs <= atMs) {
    return false;
  }

  return true;
}

function dateValue(value: Date | string): number {
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? ms : Number.NaN;
}

function optionalDateValue(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : Number.NaN;
}
