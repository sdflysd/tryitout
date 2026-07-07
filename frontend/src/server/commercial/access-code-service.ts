import { randomUUID } from "node:crypto";

import type {
  CommercialFeature,
  UserTier,
} from "../../contracts/commercial.js";
import {
  generateAccessCode as defaultGenerateAccessCode,
  hashAccessCode as defaultHashAccessCode,
  maskAccessCode as defaultMaskAccessCode,
} from "./access-code-secrets.js";
import type { CommercialRepository } from "./repository.js";
import type {
  AccessCodeBatchRecord,
  AccessCodeRecord,
  AccessCodeRedemptionRecord,
  AdminAuditLogRecord,
  JsonObject,
} from "./types.js";

export type AccessCodeServiceErrorCode =
  | "access_code_not_found"
  | "access_code_not_redeemable"
  | "access_code_batch_not_found"
  | "invalid_access_code_input";

export class AccessCodeServiceError extends Error {
  readonly code: AccessCodeServiceErrorCode;

  constructor(code: AccessCodeServiceErrorCode, message: string) {
    super(message);
    this.name = "AccessCodeServiceError";
    this.code = code;
  }
}

export interface AccessCodeServiceOptions {
  repository: CommercialRepository;
  accessCodePepper: string;
  now?: () => Date | string;
  createId?: (prefix?: string) => string;
  generateAccessCode?: () => string;
  hashAccessCode?: (code: string, pepper: string) => string;
  maskAccessCode?: (code: string) => string;
}

export interface CreateAccessCodeBatchInput {
  createdByUserId?: string;
  name: string;
  source?: string;
  codeCount: number;
  credits: number;
  tier?: UserTier;
  features: CommercialFeature[];
  expiresAt?: string;
  notes?: string;
  metadata?: JsonObject;
}

export interface CreateSingleAccessCodeInput {
  createdByUserId?: string;
  name?: string;
  source?: string;
  credits: number;
  tier?: UserTier;
  features: CommercialFeature[];
  expiresAt?: string;
  notes?: string;
  metadata?: JsonObject;
}

export interface CreatedAccessCode {
  rawCode: string;
  record: AccessCodeRecord;
}

const ACCESS_CODE_GENERATION_MAX_ATTEMPTS_PER_CODE = 20;

export class AccessCodeService {
  private readonly repository: CommercialRepository;
  private readonly accessCodePepper: string;
  private readonly now: () => Date | string;
  private readonly createId: (prefix?: string) => string;
  private readonly generateAccessCode: () => string;
  private readonly hashAccessCode: (code: string, pepper: string) => string;
  private readonly maskAccessCode: (code: string) => string;

  constructor(options: AccessCodeServiceOptions) {
    this.repository = options.repository;
    this.accessCodePepper = options.accessCodePepper;
    this.now = options.now ?? (() => new Date());
    this.createId =
      options.createId ?? ((prefix = "id") => `${prefix}_${randomUUID()}`);
    this.generateAccessCode =
      options.generateAccessCode ?? defaultGenerateAccessCode;
    this.hashAccessCode = options.hashAccessCode ?? defaultHashAccessCode;
    this.maskAccessCode = options.maskAccessCode ?? defaultMaskAccessCode;
  }

  async createAccessCodeBatch(
    input: CreateAccessCodeBatchInput,
  ): Promise<{ batch: AccessCodeBatchRecord; codes: CreatedAccessCode[] }> {
    validateBatchInput(input);

    const nowIso = this.currentDate().toISOString();
    const batch: AccessCodeBatchRecord = {
      id: this.createId("batch"),
      createdByUserId: input.createdByUserId,
      name: input.name.trim(),
      source: input.source,
      codeCount: input.codeCount,
      credits: input.credits,
      tier: input.tier,
      features: [...input.features],
      expiresAt: input.expiresAt,
      notes: input.notes,
      metadata: input.metadata ?? {},
      createdAt: nowIso,
    };

    const codes = this.generateUniqueCodes(input, batch.id, nowIso);

    await this.repository.createAccessCodeBatchWithCodes(
      batch,
      codes.map((code) => code.record),
    );

    return { batch, codes };
  }

  private generateUniqueCodes(
    input: CreateAccessCodeBatchInput,
    batchId: string,
    nowIso: string,
  ): CreatedAccessCode[] {
    const codes: CreatedAccessCode[] = [];
    const generatedHashes = new Set<string>();
    const maxAttempts =
      input.codeCount * ACCESS_CODE_GENERATION_MAX_ATTEMPTS_PER_CODE;
    let attempts = 0;

    while (codes.length < input.codeCount && attempts < maxAttempts) {
      attempts += 1;
      const rawCode = this.generateAccessCode();
      const codeHash = this.safeHashAccessCode(rawCode);
      if (generatedHashes.has(codeHash)) {
        continue;
      }

      generatedHashes.add(codeHash);
      const record: AccessCodeRecord = {
        id: this.createId("access_code"),
        batchId,
        codeHash,
        codeMask: this.maskAccessCode(rawCode),
        status: "active",
        credits: input.credits,
        tier: input.tier,
        features: [...input.features],
        expiresAt: input.expiresAt,
        createdAt: nowIso,
      };
      codes.push({ rawCode, record });
    }

    if (codes.length !== input.codeCount) {
      throw new AccessCodeServiceError(
        "invalid_access_code_input",
        "Unable to generate enough unique access codes",
      );
    }

    return codes;
  }

  async createSingleAccessCode(
    input: CreateSingleAccessCodeInput,
  ): Promise<CreatedAccessCode> {
    const result = await this.createAccessCodeBatch({
      ...input,
      name: input.name ?? "Single access code",
      codeCount: 1,
    });

    return result.codes[0]!;
  }

  async findRedeemableCode(
    rawCode: string,
  ): Promise<AccessCodeRecord | undefined> {
    const codeHash = this.safeHashAccessCode(rawCode);
    const code = await this.repository.findAccessCodeByHash(codeHash);
    if (!code) {
      return undefined;
    }

    this.assertRedeemable(code, this.currentDate());
    return code;
  }

  async markRedeemed(
    accessCodeId: string,
    userId: string,
    creditLedgerId?: string,
    metadata?: JsonObject,
  ): Promise<AccessCodeRedemptionRecord> {
    if (!accessCodeId.trim() || !userId.trim()) {
      throw new AccessCodeServiceError(
        "invalid_access_code_input",
        "Access code id and user id are required",
      );
    }

    const code = await this.repository.getAccessCode(accessCodeId);
    if (!code) {
      throw new AccessCodeServiceError(
        "access_code_not_found",
        "Access code not found",
      );
    }
    const nowDate = this.currentDate();
    this.assertRedeemable(code, nowDate);

    const nowIso = nowDate.toISOString();
    const redemption: AccessCodeRedemptionRecord = {
      id: this.createId("access_code_redemption"),
      accessCodeId,
      userId,
      creditLedgerId,
      credits: code.credits,
      tierGranted: code.tier,
      featuresGranted: [...code.features],
      redeemedAt: nowIso,
      metadata: metadata ?? {},
    };

    const redeemed = await this.repository.redeemAccessCode(
      {
        ...code,
        status: "redeemed",
        redeemedByUserId: userId,
        redeemedAt: nowIso,
      },
      redemption,
    );
    if (!redeemed) {
      throw new AccessCodeServiceError(
        "access_code_not_redeemable",
        "Access code cannot be redeemed",
      );
    }

    return redemption;
  }

  async disableAccessCode(
    accessCodeId: string,
    actorUserId: string,
    metadata?: JsonObject,
  ): Promise<AccessCodeRecord> {
    if (!accessCodeId.trim() || !actorUserId.trim()) {
      throw new AccessCodeServiceError(
        "invalid_access_code_input",
        "Access code id and actor user id are required",
      );
    }

    const code = await this.repository.getAccessCode(accessCodeId);
    if (!code) {
      throw new AccessCodeServiceError(
        "access_code_not_found",
        "Access code not found",
      );
    }
    const nowIso = this.currentDate().toISOString();
    const auditLog: AdminAuditLogRecord = {
      id: this.createId("admin_audit_log"),
      actorUserId,
      action: "access_code_disabled",
      targetType: "access_code",
      targetId: accessCodeId,
      metadata: metadata ?? {},
      createdAt: nowIso,
    };
    const disabledCode = await this.repository.disableAccessCodeWithAudit(
      accessCodeId,
      nowIso,
      auditLog,
    );

    if (!disabledCode) {
      throw new AccessCodeServiceError(
        "access_code_not_found",
        "Access code not found",
      );
    }

    return disabledCode;
  }

  async disableAccessCodeBatch(
    batchId: string,
    actorUserId: string,
    metadata?: JsonObject,
  ): Promise<{ batch: AccessCodeBatchRecord; disabledCodeCount: number }> {
    if (!batchId.trim() || !actorUserId.trim()) {
      throw new AccessCodeServiceError(
        "invalid_access_code_input",
        "Access code batch id and actor user id are required",
      );
    }

    const batch = await this.repository.getAccessCodeBatch(batchId);
    if (!batch) {
      throw new AccessCodeServiceError(
        "access_code_batch_not_found",
        "Access code batch not found",
      );
    }

    const nowIso = this.currentDate().toISOString();
    const auditLog: AdminAuditLogRecord = {
      id: this.createId("admin_audit_log"),
      actorUserId,
      action: "access_code_batch_disabled",
      targetType: "access_code_batch",
      targetId: batchId,
      metadata: metadata ?? {},
      createdAt: nowIso,
    };
    const disabled = await this.repository.disableAccessCodeBatchWithAudit(
      batchId,
      nowIso,
      auditLog,
    );

    if (!disabled) {
      throw new AccessCodeServiceError(
        "access_code_batch_not_found",
        "Access code batch not found",
      );
    }

    return disabled;
  }

  private assertRedeemable(code: AccessCodeRecord, now: Date): void {
    if (
      code.status !== "active" ||
      code.redeemedAt !== undefined ||
      code.disabledAt !== undefined ||
      isExpiredOrInvalid(code.expiresAt, now)
    ) {
      throw new AccessCodeServiceError(
        "access_code_not_redeemable",
        "Access code cannot be redeemed",
      );
    }
  }

  private safeHashAccessCode(rawCode: string): string {
    try {
      return this.hashAccessCode(rawCode, this.accessCodePepper);
    } catch (error) {
      throw new AccessCodeServiceError(
        "invalid_access_code_input",
        error instanceof Error ? error.message : "Invalid access code",
      );
    }
  }

  private currentDate(): Date {
    const value = this.now();
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) {
      throw new AccessCodeServiceError(
        "invalid_access_code_input",
        "Invalid current time",
      );
    }

    return date;
  }
}

function validateBatchInput(input: CreateAccessCodeBatchInput): void {
  if (!input.name.trim()) {
    throw new AccessCodeServiceError(
      "invalid_access_code_input",
      "Batch name is required",
    );
  }
  if (!Number.isInteger(input.codeCount) || input.codeCount < 1) {
    throw new AccessCodeServiceError(
      "invalid_access_code_input",
      "Code count must be a positive integer",
    );
  }
  if (!Number.isInteger(input.credits) || input.credits <= 0) {
    throw new AccessCodeServiceError(
      "invalid_access_code_input",
      "Credits must be a positive integer",
    );
  }
  if (!Array.isArray(input.features)) {
    throw new AccessCodeServiceError(
      "invalid_access_code_input",
      "Features are required",
    );
  }
  if (input.expiresAt !== undefined && !isValidDateString(input.expiresAt)) {
    throw new AccessCodeServiceError(
      "invalid_access_code_input",
      "Expiration must be a valid date string",
    );
  }
}

function isExpiredOrInvalid(expiresAt: string | undefined, now: Date): boolean {
  if (expiresAt === undefined) {
    return false;
  }

  const expiresAtMs = Date.parse(expiresAt);
  return !Number.isFinite(expiresAtMs) || expiresAtMs <= now.getTime();
}

function isValidDateString(value: string): boolean {
  const date = new Date(value);
  return Number.isFinite(date.getTime());
}
