import { randomUUID } from "node:crypto";

import type { CommercialFeature, UserTier } from "../../contracts/commercial.js";
import {
  generateAccessCode,
  hashAccessCode,
  maskAccessCode,
} from "./access-codes.js";
import type { CreditService } from "./credit-service.js";
import type { CommercialRepository } from "./repository.js";
import type {
  AccessCodeRecord,
  AdminAuditLogRecord,
  CreditLedgerEntryRecord,
  JsonObject,
} from "./types.js";

export interface CommercialAdminServiceOptions {
  accessCodePepper: string;
  now?: () => Date;
}

export interface CreatedAccessCodeDto {
  accessCodeId: string;
  rawCode: string;
  maskedCode: string;
}

export class CommercialAdminServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CommercialAdminServiceError";
  }
}

export class CommercialAdminService {
  private readonly now: () => Date;

  constructor(
    private readonly repository: CommercialRepository,
    private readonly creditService: CreditService,
    private readonly options: CommercialAdminServiceOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async createAccessCode(input: {
    adminUserId: string;
    creditAmount: number;
    tier: UserTier;
    features: CommercialFeature[];
    expiresAt?: Date;
  }): Promise<CreatedAccessCodeDto> {
    const [created] = await this.createAccessCodeBatch({ ...input, count: 1 });
    if (!created) {
      throw new CommercialAdminServiceError("access_code_not_created", "Access code was not created.");
    }
    return created;
  }

  async createAccessCodeBatch(input: {
    adminUserId: string;
    count: number;
    creditAmount: number;
    tier: UserTier;
    features: CommercialFeature[];
    expiresAt?: Date;
  }): Promise<CreatedAccessCodeDto[]> {
    await this.requireAdminUser(input.adminUserId);
    if (!Number.isInteger(input.count) || input.count < 1 || input.count > 500) {
      throw new CommercialAdminServiceError("invalid_code_count", "Access code count must be between 1 and 500.");
    }
    if (!Number.isInteger(input.creditAmount) || input.creditAmount <= 0) {
      throw new CommercialAdminServiceError("invalid_credit_amount", "Credit amount must be positive.");
    }

    const timestamp = this.now();
    const created: CreatedAccessCodeDto[] = [];

    await this.repository.runInTransaction(async (repository) => {
      for (let index = 0; index < input.count; index += 1) {
        const rawCode = await this.generateUniqueAccessCode(repository);
        const accessCode: AccessCodeRecord = {
          id: createId("code"),
          codeHash: hashAccessCode(rawCode, this.options.accessCodePepper),
          maskedCode: maskAccessCode(rawCode),
          status: "active",
          creditAmount: input.creditAmount,
          tier: input.tier,
          features: [...input.features],
          expiresAt: input.expiresAt,
          redeemedByUserId: undefined,
          redeemedAt: undefined,
          disabledAt: undefined,
          createdByAdminUserId: input.adminUserId,
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        await repository.saveAccessCode(accessCode);
        created.push({
          accessCodeId: accessCode.id,
          rawCode,
          maskedCode: accessCode.maskedCode,
        });
      }

      await this.appendAuditLogWithRepository(repository, {
        adminUserId: input.adminUserId,
        action: input.count === 1 ? "access_code.created" : "access_code.batch_created",
        targetType: "access_code",
        targetId: input.count === 1 ? created[0]?.accessCodeId ?? "unknown" : "batch",
        metadata: {
          count: input.count,
          creditAmount: input.creditAmount,
          tier: input.tier,
          features: input.features,
        },
      });
    });

    return created;
  }

  async disableAccessCode(input: {
    adminUserId: string;
    accessCodeId: string;
    reason: string;
  }): Promise<void> {
    await this.requireAdminUser(input.adminUserId);
    await this.repository.runInTransaction(async (repository) => {
      const accessCode = await repository.getAccessCode(input.accessCodeId);
      if (!accessCode) {
        throw new CommercialAdminServiceError("access_code_not_found", "Access code was not found.");
      }

      const timestamp = this.now();
      await repository.saveAccessCode({
        ...accessCode,
        status: "disabled",
        disabledAt: timestamp,
        updatedAt: timestamp,
      });
      await this.appendAuditLogWithRepository(repository, {
        adminUserId: input.adminUserId,
        action: "access_code.disabled",
        targetType: "access_code",
        targetId: input.accessCodeId,
        metadata: { reason: input.reason },
      });
    });
  }

  async adjustUserCredits(input: {
    adminUserId: string;
    userId: string;
    amount: number;
    reason: string;
  }): Promise<CreditLedgerEntryRecord> {
    await this.requireAdminUser(input.adminUserId);
    const ledgerEntry = await this.creditService.adjustCredits({
      userId: input.userId,
      amount: input.amount,
      adminUserId: input.adminUserId,
      reason: input.reason,
      idempotencyKey: `admin_adjustment:${input.adminUserId}:${input.userId}:${createId("idem")}`,
    });

    await this.appendAuditLog({
      adminUserId: input.adminUserId,
      action: "credits.adjusted",
      targetType: "user",
      targetId: input.userId,
      metadata: {
        amount: input.amount,
        balanceAfter: ledgerEntry.balanceAfter,
        reason: input.reason,
      },
    });

    return ledgerEntry;
  }

  async disableUser(input: {
    adminUserId: string;
    userId: string;
    reason: string;
  }): Promise<void> {
    await this.requireAdminUser(input.adminUserId);
    await this.repository.runInTransaction(async (repository) => {
      const user = await repository.getUser(input.userId);
      if (!user) {
        throw new CommercialAdminServiceError("user_not_found", "User was not found.");
      }

      await repository.saveUser({
        ...user,
        disabledAt: user.disabledAt ?? this.now(),
        updatedAt: this.now(),
      });
      await this.appendAuditLogWithRepository(repository, {
        adminUserId: input.adminUserId,
        action: "user.disabled",
        targetType: "user",
        targetId: input.userId,
        metadata: { reason: input.reason },
      });
    });
  }

  async updateSystemSetting(input: {
    adminUserId: string;
    key: string;
    value: JsonObject;
  }): Promise<void> {
    await this.requireAdminUser(input.adminUserId);
    await this.repository.runInTransaction(async (repository) => {
      await repository.saveSystemSetting({
        key: input.key,
        value: input.value,
        updatedByAdminUserId: input.adminUserId,
        updatedAt: this.now(),
      });
      await this.appendAuditLogWithRepository(repository, {
        adminUserId: input.adminUserId,
        action: "system_setting.updated",
        targetType: "system_setting",
        targetId: input.key,
        metadata: { value: input.value },
      });
    });
  }

  async appendAuditLog(input: {
    adminUserId: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: JsonObject;
  }): Promise<AdminAuditLogRecord> {
    return this.appendAuditLogWithRepository(this.repository, input);
  }

  private async appendAuditLogWithRepository(
    repository: CommercialRepository,
    input: {
      adminUserId: string;
      action: string;
      targetType: string;
      targetId: string;
      metadata?: JsonObject;
    },
  ): Promise<AdminAuditLogRecord> {
    const entry: AdminAuditLogRecord = {
      id: createId("audit"),
      adminUserId: input.adminUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata ?? {},
      createdAt: this.now(),
    };
    await repository.appendAdminAuditLog(entry);
    return entry;
  }

  private async generateUniqueAccessCode(repository: CommercialRepository): Promise<string> {
    for (let attempts = 0; attempts < 10; attempts += 1) {
      const code = generateAccessCode();
      const codeHash = hashAccessCode(code, this.options.accessCodePepper);
      if (!(await repository.findAccessCodeByHash(codeHash))) {
        return code;
      }
    }
    throw new CommercialAdminServiceError("access_code_collision", "Unable to generate a unique access code.");
  }

  private async requireAdminUser(adminUserId: string): Promise<void> {
    const admin = await this.repository.getUser(adminUserId);
    if (!admin || !admin.isAdmin || admin.disabledAt) {
      throw new CommercialAdminServiceError("admin_required", "Admin privileges are required.");
    }
  }
}

function createId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
