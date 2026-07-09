import { randomUUID } from "node:crypto";

import {
  ADMIN_AUDIT_ACTIONS,
  type AdminAuditAction,
} from "../../contracts/commercial.js";
import type { CommercialRepository } from "./repository.js";
import type {
  AdminAuditLogRecord,
  JsonObject,
} from "./types.js";

export type AdminAuditServiceErrorCode =
  | "invalid_audit_action"
  | "invalid_audit_input"
  | "invalid_audit_target";

export class AdminAuditServiceError extends Error {
  readonly code: AdminAuditServiceErrorCode;

  constructor(code: AdminAuditServiceErrorCode, message: string) {
    super(message);
    this.name = "AdminAuditServiceError";
    this.code = code;
  }
}

export interface AdminAuditServiceOptions {
  repository: CommercialRepository;
  now?: () => Date | string;
  createId?: (prefix?: string) => string;
}

export interface AppendAdminAuditInput {
  actorUserId: string;
  action: AdminAuditAction | string;
  targetType: string;
  targetId: string;
  metadata?: JsonObject;
  ipHash?: string;
  userAgent?: string;
}

const AUDIT_TARGET_TYPES: Record<AdminAuditAction, string> = {
  access_code_batch_created: "access_code_batch",
  access_code_batch_disabled: "access_code_batch",
  access_code_batch_exported: "access_code_batch",
  access_code_disabled: "access_code",
  access_code_deleted: "access_code",
  access_codes_bulk_disabled: "access_code",
  access_codes_bulk_deleted: "access_code",
  user_credit_adjusted: "user",
  credits_adjusted: "user",
  user_created: "user",
  task_refunded: "task",
  task_retried: "task",
  task_cancelled: "task",
  user_updated: "user",
  user_disabled: "user",
  user_restored: "user",
  user_deleted: "user",
  user_tier_changed: "user",
  sensitive_report_viewed: "report",
  platform_model_provider_saved: "platform_model_provider",
  platform_model_provider_tested: "platform_model_provider",
  platform_model_provider_models_listed: "platform_model_provider",
  platform_model_profiles_updated: "platform_model_profile",
  system_setting_updated: "system_setting",
  queue_paused: "queue",
  queue_resumed: "queue",
};

export class AdminAuditService {
  private readonly repository: CommercialRepository;
  private readonly now: () => Date | string;
  private readonly createId: (prefix?: string) => string;

  constructor(options: AdminAuditServiceOptions) {
    this.repository = options.repository;
    this.now = options.now ?? (() => new Date());
    this.createId =
      options.createId ?? ((prefix = "id") => `${prefix}_${randomUUID()}`);
  }

  async append(input: AppendAdminAuditInput): Promise<AdminAuditLogRecord> {
    const action = assertAuditAction(input.action);
    const actorUserId = requireTrimmed(input.actorUserId, "Actor user id");
    const targetType = requireTrimmed(input.targetType, "Target type");
    const targetId = requireTrimmed(input.targetId ?? "", "Target id");
    const ipHash = optionalTrimmed(input.ipHash);
    const userAgent = optionalTrimmed(input.userAgent);

    if (targetType !== AUDIT_TARGET_TYPES[action]) {
      throw new AdminAuditServiceError(
        "invalid_audit_target",
        `Audit action ${action} must target ${AUDIT_TARGET_TYPES[action]}`,
      );
    }

    const log: AdminAuditLogRecord = {
      id: this.createId("admin_audit_log"),
      actorUserId,
      action,
      targetType,
      targetId,
      metadata: cloneJsonObject(input.metadata ?? {}),
      ...(ipHash !== undefined ? { ipHash } : {}),
      ...(userAgent !== undefined ? { userAgent } : {}),
      createdAt: this.currentDate().toISOString(),
    };

    await this.repository.appendAdminAuditLog(log);
    return log;
  }

  private currentDate(): Date {
    const value = this.now();
    return value instanceof Date ? value : new Date(value);
  }
}

export function assertAuditAction(action: string): AdminAuditAction {
  if (ADMIN_AUDIT_ACTIONS.includes(action as AdminAuditAction)) {
    return action as AdminAuditAction;
  }
  throw new AdminAuditServiceError(
    "invalid_audit_action",
    `Unknown admin audit action: ${action}`,
  );
}

function requireTrimmed(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new AdminAuditServiceError(
      "invalid_audit_input",
      `${label} is required`,
    );
  }
  return trimmed;
}

function optionalTrimmed(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function cloneJsonObject(metadata: JsonObject): JsonObject {
  return JSON.parse(JSON.stringify(metadata)) as JsonObject;
}
