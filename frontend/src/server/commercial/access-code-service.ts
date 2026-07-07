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

    const codes: CreatedAccessCode[] = [];
    for (let index = 0; index < input.codeCount; index += 1) {
      const rawCode = this.generateAccessCode();
      const record: AccessCodeRecord = {
        id: this.createId("access_code"),
        batchId: batch.id,
        codeHash: this.safeHashAccessCode(rawCode),
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

    await this.repository.saveAccessCodeBatch(batch);
    for (const code of codes) {
      await this.repository.saveAccessCode(code.record);
    }

    return { batch, codes };
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

    this.assertRedeemable(code);
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
    this.assertRedeemable(code);

    const nowIso = this.currentDate().toISOString();
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

    await this.repository.saveAccessCode({
      ...code,
      status: "redeemed",
      redeemedByUserId: userId,
      redeemedAt: nowIso,
    });
    await this.repository.saveAccessCodeRedemption(redemption);

    return redemption;
  }

  async disableAccessCode(
    accessCodeId: string,
    actorUserId: string,
    metadata?: JsonObject,
  ): Promise<AccessCodeRecord> {
    if (!accessCodeId.trim()) {
      throw new AccessCodeServiceError(
        "invalid_access_code_input",
        "Access code id is required",
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
    const disabledCode =
      code.status === "active"
        ? {
            ...code,
            status: "disabled" as const,
            disabledAt: nowIso,
          }
        : code;

    if (disabledCode !== code) {
      await this.repository.saveAccessCode(disabledCode);
    }
    await this.repository.appendAdminAuditLog({
      id: this.createId("admin_audit_log"),
      actorUserId,
      action: "access_code_disabled",
      targetType: "access_code",
      targetId: accessCodeId,
      metadata: metadata ?? {},
      createdAt: nowIso,
    });

    return disabledCode;
  }

  async disableAccessCodeBatch(
    batchId: string,
    actorUserId: string,
    metadata?: JsonObject,
  ): Promise<{ batch: AccessCodeBatchRecord; disabledCodeCount: number }> {
    if (!batchId.trim()) {
      throw new AccessCodeServiceError(
        "invalid_access_code_input",
        "Access code batch id is required",
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
    const disabledBatch = {
      ...batch,
      disabledAt: batch.disabledAt ?? nowIso,
    };
    const codes = await this.repository.listAccessCodesByBatch(batchId);
    let disabledCodeCount = 0;

    await this.repository.saveAccessCodeBatch(disabledBatch);
    for (const code of codes) {
      if (code.status !== "active") {
        continue;
      }

      disabledCodeCount += 1;
      await this.repository.saveAccessCode({
        ...code,
        status: "disabled",
        disabledAt: nowIso,
      });
    }
    await this.repository.appendAdminAuditLog({
      id: this.createId("admin_audit_log"),
      actorUserId,
      action: "access_code_batch_disabled",
      targetType: "access_code_batch",
      targetId: batchId,
      metadata: {
        ...(metadata ?? {}),
        disabledCodeCount,
      },
      createdAt: nowIso,
    });

    return { batch: disabledBatch, disabledCodeCount };
  }

  private assertRedeemable(code: AccessCodeRecord): void {
    if (
      code.status !== "active" ||
      code.redeemedAt !== undefined ||
      code.disabledAt !== undefined ||
      isExpired(code.expiresAt, this.currentDate())
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
  if (!Number.isFinite(input.credits) || input.credits < 0) {
    throw new AccessCodeServiceError(
      "invalid_access_code_input",
      "Credits must be a non-negative number",
    );
  }
  if (!Array.isArray(input.features)) {
    throw new AccessCodeServiceError(
      "invalid_access_code_input",
      "Features are required",
    );
  }
}

function isExpired(expiresAt: string | undefined, now: Date): boolean {
  if (expiresAt === undefined) {
    return false;
  }

  const expiresAtMs = Date.parse(expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs <= now.getTime();
}
