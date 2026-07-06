import type {
  AccessCodeStatus,
  CommercialFeature,
  CommercialProviderMode,
  CommercialTaskStatus,
  CreditLedgerEntryType,
  UserTier,
} from "../../contracts/commercial.js";
import type { InteractionMode, Report, SimulationType } from "../../types.js";

export type JsonObject = Record<string, unknown>;

export interface CommercialUserRecord {
  id: string;
  email: string;
  passwordHash: string;
  tier: UserTier;
  features: CommercialFeature[];
  isAdmin: boolean;
  disabledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommercialSessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date;
  createdAt: Date;
}

export interface UserCreditAccountRecord {
  userId: string;
  balance: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreditLedgerEntryRecord {
  id: string;
  userId: string;
  type: CreditLedgerEntryType;
  amount: number;
  balanceAfter: number;
  idempotencyKey: string;
  referenceType?: string;
  referenceId?: string;
  metadata: JsonObject;
  createdAt: Date;
}

export interface AccessCodeRecord {
  id: string;
  codeHash: string;
  maskedCode: string;
  status: AccessCodeStatus;
  creditAmount: number;
  tier: UserTier;
  features: CommercialFeature[];
  expiresAt?: Date;
  redeemedByUserId?: string;
  redeemedAt?: Date;
  disabledAt?: Date;
  createdByAdminUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccessCodeRedemptionRecord {
  id: string;
  accessCodeId: string;
  userId: string;
  ledgerEntryId: string;
  redeemedAt: Date;
}

export interface CommercialSimulationTaskRecord {
  id: string;
  userId: string;
  status: CommercialTaskStatus;
  scenario: SimulationType;
  userInput: string;
  interactionMode: InteractionMode;
  providerMode: CommercialProviderMode;
  creditCost: number;
  creditHoldLedgerEntryId?: string;
  creditCapturedLedgerEntryId?: string;
  creditReleasedLedgerEntryId?: string;
  queueJobId?: string;
  reportId?: string;
  errorCode?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SimulationReportRecord {
  id: string;
  taskId: string;
  userId: string;
  report: Report;
  createdAt: Date;
}

export interface UserFeedbackRecord {
  id: string;
  userId: string;
  taskId: string;
  reportId: string;
  rating: number;
  useful: boolean;
  text?: string;
  createdAt: Date;
}

export interface UserModelProviderRecord {
  id: string;
  userId: string;
  provider: "openai_compatible";
  baseUrl: string;
  encryptedApiKey: string;
  model: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AnalyticsEventRecord {
  id: string;
  userId?: string;
  eventType: string;
  payload: JsonObject;
  createdAt: Date;
}

export interface AdminAuditLogRecord {
  id: string;
  adminUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: JsonObject;
  createdAt: Date;
}

export interface SystemSettingRecord {
  key: string;
  value: JsonObject;
  updatedByAdminUserId: string;
  updatedAt: Date;
}
