import type {
  AccessCodeStatus,
  AdminAuditAction,
  CommercialFeature,
  CommercialTaskStatus,
  CreditLedgerEntryType,
  ProviderMode,
  UserRole,
  UserTier,
} from "../../contracts/commercial.js";
import type {
  InteractionMode,
  Report,
  SimulationApiResponse,
  SimulationType,
} from "../../types.js";

export type JsonObject = Record<string, unknown>;

export type CommercialUserStatus = "active" | "disabled" | "deleted";
export type SimulationTaskRunStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled";
export type SimulationStepRunCostStatus = "started" | "completed" | "failed";
export type UserModelProviderStatus = "active" | "disabled";
export type UserModelProviderTestStatus = "passed" | "failed";

export interface CommercialUserRecord {
  id: string;
  email: string;
  emailNormalized: string;
  passwordHash: string;
  role: UserRole;
  tier: UserTier;
  status: CommercialUserStatus;
  features: CommercialFeature[];
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommercialSessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  userAgent?: string;
  ipHash?: string;
  expiresAt: string;
  revokedAt?: string;
  createdAt: string;
}

export interface UserCreditAccountRecord {
  userId: string;
  balance: number;
  frozenCredits: number;
  totalRedeemed: number;
  totalCaptured: number;
  updatedAt: string;
}

export interface CreditLedgerEntryRecord {
  id: string;
  userId: string;
  taskId?: string;
  accessCodeId?: string;
  entryType: CreditLedgerEntryType;
  amount: number;
  balanceAfter: number;
  frozenAfter?: number;
  idempotencyKey: string;
  reason?: string;
  metadata?: JsonObject;
  createdAt: string;
}

export interface AccessCodeBatchRecord {
  id: string;
  createdByUserId?: string;
  name: string;
  source?: string;
  codeCount: number;
  credits: number;
  tier?: UserTier;
  features: CommercialFeature[];
  expiresAt?: string;
  disabledAt?: string;
  notes?: string;
  metadata: JsonObject;
  createdAt: string;
}

export interface AccessCodeRecord {
  id: string;
  batchId: string;
  codeHash: string;
  codeMask: string;
  status: AccessCodeStatus;
  credits: number;
  tier?: UserTier;
  features: CommercialFeature[];
  expiresAt?: string;
  redeemedByUserId?: string;
  redeemedAt?: string;
  disabledAt?: string;
  createdAt: string;
}

export interface AccessCodeRedemptionRecord {
  id: string;
  accessCodeId: string;
  userId: string;
  creditLedgerId?: string;
  credits: number;
  tierGranted?: UserTier;
  featuresGranted: CommercialFeature[];
  redeemedAt: string;
  metadata: JsonObject;
}

export interface CommercialSimulationTaskRecord {
  id: string;
  userId: string;
  scenarioType: SimulationType;
  interactionMode: InteractionMode;
  providerMode: ProviderMode;
  status: CommercialTaskStatus;
  creditCost: number;
  creditHoldLedgerId?: string;
  priority?: number;
  queueWeight?: number;
  idempotencyKey?: string;
  inputSummary?: JsonObject;
  errorCode?: string;
  queuedAt?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SimulationTaskRunRecord {
  id: string;
  taskId: string;
  workerId?: string;
  attempt?: number;
  status: SimulationTaskRunStatus;
  errorCode?: string;
  startedAt: string;
  completedAt?: string;
  metadata?: JsonObject;
}

export interface WorkerHeartbeatRecord {
  workerId: string;
  activeWeight: number;
  currentTaskId?: string;
  lastHeartbeatAt: string;
}

export interface SimulationStepRunCostRecord {
  id: string;
  taskRunId?: string;
  taskId: string;
  stageIndex?: number;
  stepName: string;
  roundIndex?: number;
  agentId?: string;
  provider?: string;
  modelId?: string;
  modelProfileId?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
  estimatedCost?: number;
  latencyMs?: number;
  retryCount?: number;
  status: SimulationStepRunCostStatus;
  errorCode?: string;
  startedAt: string;
  completedAt?: string;
  metadata?: JsonObject;
}

export interface CommercialSimulationReportRecord {
  id: string;
  taskId: string;
  userId: string;
  publicReport?: SimulationApiResponse;
  deepReport?: Report | JsonObject;
  shareCard?: JsonObject;
  unlocked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsEventRecord {
  id: string;
  userId?: string;
  taskId?: string;
  sessionId?: string;
  eventType: string;
  source?: string;
  properties: JsonObject;
  occurredAt: string;
}

export interface UserFeedbackRecord {
  id: string;
  userId?: string;
  taskId?: string;
  reportId?: string;
  rating?: number;
  feedbackType?: string;
  comment?: string;
  metadata: JsonObject;
  createdAt: string;
}

export interface UserModelProviderRecord {
  id: string;
  userId: string;
  provider: string;
  displayName: string;
  baseUrl: string;
  encryptedApiKey: string;
  apiKeyMask: string;
  modelFast?: string;
  modelBalanced?: string;
  modelDeep?: string;
  status: UserModelProviderStatus;
  lastTestedAt?: string;
  lastTestStatus?: UserModelProviderTestStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SystemSettingRecord {
  key: string;
  value: unknown;
  description?: string;
  updatedByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAuditLogRecord {
  id: string;
  actorUserId?: string;
  action: AdminAuditAction;
  targetType: string;
  targetId?: string;
  metadata: JsonObject;
  ipHash?: string;
  userAgent?: string;
  createdAt: string;
}
