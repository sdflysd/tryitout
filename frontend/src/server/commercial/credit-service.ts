import { randomUUID } from "node:crypto";

import {
  hashAccessCode as defaultHashAccessCode,
} from "./access-code-secrets.js";
import type { CommercialRepository } from "./repository.js";
import type {
  AccessCodeRedemptionRecord,
  AdminAuditLogRecord,
  CreditLedgerEntryRecord,
  JsonObject,
  UserCreditAccountRecord,
} from "./types.js";

export type CreditServiceErrorCode =
  | "access_code_not_found"
  | "access_code_not_redeemable"
  | "account_not_found"
  | "hold_not_found"
  | "capture_not_found"
  | "hold_already_completed"
  | "capture_already_refunded"
  | "insufficient_credits"
  | "invalid_credit_input";

export class CreditServiceError extends Error {
  readonly code: CreditServiceErrorCode;

  constructor(code: CreditServiceErrorCode, message: string) {
    super(message);
    this.name = "CreditServiceError";
    this.code = code;
  }
}

export interface CreditServiceOptions {
  repository: CommercialRepository;
  accessCodePepper: string;
  now?: () => Date | string;
  createId?: (prefix?: string) => string;
  hashAccessCode?: (code: string, pepper: string) => string;
}

export interface RedeemAccessCodeInput {
  userId: string;
  rawCode: string;
  idempotencyKey: string;
  metadata?: JsonObject;
}

export interface HoldCreditsForTaskInput {
  userId: string;
  taskId: string;
  amount: number;
  idempotencyKey: string;
  reason?: string;
  metadata?: JsonObject;
}

export interface CaptureHeldCreditsInput {
  userId: string;
  taskId: string;
  holdLedgerId: string;
  idempotencyKey: string;
  reason?: string;
  metadata?: JsonObject;
}

export interface ReleaseHeldCreditsInput {
  userId: string;
  taskId: string;
  holdLedgerId: string;
  idempotencyKey: string;
  reason?: string;
  metadata?: JsonObject;
}

export interface RefundCapturedCreditsInput {
  userId: string;
  taskId: string;
  captureLedgerId: string;
  actorUserId: string;
  reason: string;
  idempotencyKey: string;
  metadata?: JsonObject;
}

export interface AdjustCreditsInput {
  userId: string;
  amount: number;
  actorUserId: string;
  reason: string;
  idempotencyKey: string;
  metadata?: JsonObject;
}

export interface CreditTransitionResult {
  account: UserCreditAccountRecord;
  ledger: CreditLedgerEntryRecord;
}

export interface RedeemAccessCodeResult extends CreditTransitionResult {
  redemption: AccessCodeRedemptionRecord;
}

export class CreditService {
  private readonly repository: CommercialRepository;
  private readonly accessCodePepper: string;
  private readonly now: () => Date | string;
  private readonly createId: (prefix?: string) => string;
  private readonly hashAccessCode: (code: string, pepper: string) => string;

  constructor(options: CreditServiceOptions) {
    this.repository = options.repository;
    this.accessCodePepper = options.accessCodePepper;
    this.now = options.now ?? (() => new Date());
    this.createId =
      options.createId ?? ((prefix = "id") => `${prefix}_${randomUUID()}`);
    this.hashAccessCode = options.hashAccessCode ?? defaultHashAccessCode;
  }

  async redeemAccessCode(
    input: RedeemAccessCodeInput,
  ): Promise<RedeemAccessCodeResult> {
    validateRequired(input.userId, "User id");
    validateRequired(input.rawCode, "Access code");
    validateRequired(input.idempotencyKey, "Idempotency key");

    const existingLedger = await this.findExistingLedger(input.idempotencyKey);
    if (existingLedger !== undefined) {
      const account = await this.requireAccount(existingLedger.userId);
      const redemption = existingLedger.accessCodeId
        ? await this.repository.findAccessCodeRedemptionByCodeId(
            existingLedger.accessCodeId,
          )
        : undefined;
      if (!redemption) {
        throw new CreditServiceError(
          "access_code_not_redeemable",
          "Access code redemption was not recorded",
        );
      }
      return { account, ledger: existingLedger, redemption };
    }

    const codeHash = this.safeHashAccessCode(input.rawCode);
    const code = await this.repository.findAccessCodeByHash(codeHash);
    if (!code) {
      throw new CreditServiceError("access_code_not_found", "Access code not found");
    }
    const nowDate = this.currentDate();
    this.assertRedeemable(code, nowDate);

    const account = await this.requireAccount(input.userId);
    const nowIso = nowDate.toISOString();
    const ledger: CreditLedgerEntryRecord = {
      id: this.createId("credit_ledger"),
      userId: input.userId,
      accessCodeId: code.id,
      entryType: "redeem",
      amount: code.credits,
      balanceAfter: account.balance + code.credits,
      frozenAfter: account.frozenCredits,
      idempotencyKey: input.idempotencyKey,
      reason: "access_code",
      metadata: input.metadata ?? {},
      createdAt: nowIso,
    };
    const nextAccount: UserCreditAccountRecord = {
      ...account,
      balance: ledger.balanceAfter,
      totalRedeemed: account.totalRedeemed + code.credits,
      updatedAt: nowIso,
    };
    const redemption: AccessCodeRedemptionRecord = {
      id: this.createId("access_code_redemption"),
      accessCodeId: code.id,
      userId: input.userId,
      creditLedgerId: ledger.id,
      credits: code.credits,
      tierGranted: code.tier,
      featuresGranted: [...code.features],
      redeemedAt: nowIso,
      metadata: input.metadata ?? {},
    };

    const redeemed = await this.repository.redeemAccessCodeWithCreditLedger(
      {
        ...code,
        status: "redeemed",
        redeemedByUserId: input.userId,
        redeemedAt: nowIso,
      },
      redemption,
      nextAccount,
      ledger,
    );
    if (!redeemed) {
      throw new CreditServiceError(
        "access_code_not_redeemable",
        "Access code cannot be redeemed",
      );
    }

    return { account: nextAccount, ledger, redemption };
  }

  async holdCreditsForTask(
    input: HoldCreditsForTaskInput,
  ): Promise<CreditTransitionResult> {
    this.validateTaskAmountInput(input);

    const existing = await this.returnExistingTransition(input.idempotencyKey);
    if (existing !== undefined) {
      if (existing.ledger.entryType === "hold") {
        await this.attachHoldLedgerToTask(
          input.taskId,
          existing.ledger.id,
          existing.ledger.createdAt,
        );
      }
      return existing;
    }

    const account = await this.requireAccount(input.userId);
    if (account.balance < input.amount) {
      throw new CreditServiceError(
        "insufficient_credits",
        "Available credit balance is insufficient",
      );
    }

    const nowIso = this.currentDate().toISOString();
    const nextAccount: UserCreditAccountRecord = {
      ...account,
      balance: account.balance - input.amount,
      frozenCredits: account.frozenCredits + input.amount,
      updatedAt: nowIso,
    };
    const ledger: CreditLedgerEntryRecord = {
      id: this.createId("credit_ledger"),
      userId: input.userId,
      taskId: input.taskId,
      entryType: "hold",
      amount: -input.amount,
      balanceAfter: nextAccount.balance,
      frozenAfter: nextAccount.frozenCredits,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
      metadata: input.metadata ?? {},
      createdAt: nowIso,
    };

    const storedLedger = await this.repository.applyCreditLedgerEntry(
      nextAccount,
      ledger,
    );
    await this.attachHoldLedgerToTask(input.taskId, storedLedger.id, nowIso);
    return { account: nextAccount, ledger: storedLedger };
  }

  async captureHeldCredits(
    input: CaptureHeldCreditsInput,
  ): Promise<CreditTransitionResult> {
    validateRequired(input.userId, "User id");
    validateRequired(input.taskId, "Task id");
    validateRequired(input.holdLedgerId, "Hold ledger id");
    validateRequired(input.idempotencyKey, "Idempotency key");

    const existing = await this.returnExistingTransition(input.idempotencyKey);
    if (existing !== undefined) {
      return existing;
    }

    const { account, hold, amount } = await this.requireOpenHold(input);
    if (account.frozenCredits < amount) {
      throw new CreditServiceError(
        "insufficient_credits",
        "Frozen credit balance is insufficient",
      );
    }

    const nowIso = this.currentDate().toISOString();
    const nextAccount: UserCreditAccountRecord = {
      ...account,
      frozenCredits: account.frozenCredits - amount,
      totalCaptured: account.totalCaptured + amount,
      updatedAt: nowIso,
    };
    const ledger: CreditLedgerEntryRecord = {
      id: this.createId("credit_ledger"),
      userId: input.userId,
      taskId: input.taskId,
      entryType: "capture",
      amount: -amount,
      balanceAfter: nextAccount.balance,
      frozenAfter: nextAccount.frozenCredits,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
      metadata: {
        ...(input.metadata ?? {}),
        holdLedgerId: hold.id,
      },
      createdAt: nowIso,
    };

    const storedLedger = await this.repository.applyCreditLedgerEntry(
      nextAccount,
      ledger,
    );
    return { account: nextAccount, ledger: storedLedger };
  }

  async releaseHeldCredits(
    input: ReleaseHeldCreditsInput,
  ): Promise<CreditTransitionResult> {
    validateRequired(input.userId, "User id");
    validateRequired(input.taskId, "Task id");
    validateRequired(input.holdLedgerId, "Hold ledger id");
    validateRequired(input.idempotencyKey, "Idempotency key");

    const existing = await this.returnExistingTransition(input.idempotencyKey);
    if (existing !== undefined) {
      return existing;
    }

    const { account, hold, amount } = await this.requireOpenHold(input);
    if (account.frozenCredits < amount) {
      throw new CreditServiceError(
        "insufficient_credits",
        "Frozen credit balance is insufficient",
      );
    }

    const nowIso = this.currentDate().toISOString();
    const nextAccount: UserCreditAccountRecord = {
      ...account,
      balance: account.balance + amount,
      frozenCredits: account.frozenCredits - amount,
      updatedAt: nowIso,
    };
    const ledger: CreditLedgerEntryRecord = {
      id: this.createId("credit_ledger"),
      userId: input.userId,
      taskId: input.taskId,
      entryType: "release",
      amount,
      balanceAfter: nextAccount.balance,
      frozenAfter: nextAccount.frozenCredits,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
      metadata: {
        ...(input.metadata ?? {}),
        holdLedgerId: hold.id,
      },
      createdAt: nowIso,
    };

    const storedLedger = await this.repository.applyCreditLedgerEntry(
      nextAccount,
      ledger,
    );
    return { account: nextAccount, ledger: storedLedger };
  }

  async refundCapturedCredits(
    input: RefundCapturedCreditsInput,
  ): Promise<CreditTransitionResult> {
    validateRequired(input.userId, "User id");
    validateRequired(input.taskId, "Task id");
    validateRequired(input.captureLedgerId, "Capture ledger id");
    validateRequired(input.actorUserId, "Actor user id");
    validateRequired(input.reason, "Reason");
    validateRequired(input.idempotencyKey, "Idempotency key");

    const existing = await this.returnExistingTransition(input.idempotencyKey);
    if (existing !== undefined) {
      return existing;
    }

    const capture = await this.requireCapture(input.captureLedgerId, input);
    await this.assertCaptureNotRefunded(capture.id);
    const account = await this.requireAccount(input.userId);
    const amount = Math.abs(capture.amount);
    const nowIso = this.currentDate().toISOString();
    const nextAccount: UserCreditAccountRecord = {
      ...account,
      balance: account.balance + amount,
      updatedAt: nowIso,
    };
    const ledger: CreditLedgerEntryRecord = {
      id: this.createId("credit_ledger"),
      userId: input.userId,
      taskId: input.taskId,
      entryType: "refund",
      amount,
      balanceAfter: nextAccount.balance,
      frozenAfter: nextAccount.frozenCredits,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
      metadata: {
        ...(input.metadata ?? {}),
        actorUserId: input.actorUserId,
        captureLedgerId: capture.id,
      },
      createdAt: nowIso,
    };
    const auditLog: AdminAuditLogRecord = {
      id: this.createId("admin_audit_log"),
      actorUserId: input.actorUserId,
      action: "task_refunded",
      targetType: "task",
      targetId: input.taskId,
      metadata: {
        ...(input.metadata ?? {}),
        amount,
        captureLedgerId: capture.id,
        creditLedgerId: ledger.id,
        reason: input.reason,
      },
      createdAt: nowIso,
    };

    const storedLedger = await this.repository.applyCreditLedgerEntryWithAudit(
      nextAccount,
      ledger,
      auditLog,
    );
    return { account: nextAccount, ledger: storedLedger };
  }

  async adjustCredits(
    input: AdjustCreditsInput,
  ): Promise<CreditTransitionResult> {
    validateRequired(input.userId, "User id");
    validateRequired(input.actorUserId, "Actor user id");
    validateRequired(input.reason, "Reason");
    validateRequired(input.idempotencyKey, "Idempotency key");
    validateIntegerAmount(input.amount, "Amount", { allowNegative: true });
    if (input.amount === 0) {
      throw new CreditServiceError(
        "invalid_credit_input",
        "Amount cannot be zero",
      );
    }

    const existing = await this.returnExistingTransition(input.idempotencyKey);
    if (existing !== undefined) {
      return existing;
    }

    const account = await this.requireAccount(input.userId);
    const nextBalance = account.balance + input.amount;
    if (nextBalance < 0) {
      throw new CreditServiceError(
        "insufficient_credits",
        "Credit adjustment would make balance negative",
      );
    }

    const nowIso = this.currentDate().toISOString();
    const nextAccount: UserCreditAccountRecord = {
      ...account,
      balance: nextBalance,
      updatedAt: nowIso,
    };
    const ledger: CreditLedgerEntryRecord = {
      id: this.createId("credit_ledger"),
      userId: input.userId,
      entryType: "adjustment",
      amount: input.amount,
      balanceAfter: nextBalance,
      frozenAfter: nextAccount.frozenCredits,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
      metadata: {
        ...(input.metadata ?? {}),
        actorUserId: input.actorUserId,
      },
      createdAt: nowIso,
    };
    const auditLog: AdminAuditLogRecord = {
      id: this.createId("admin_audit_log"),
      actorUserId: input.actorUserId,
      action: "credits_adjusted",
      targetType: "user",
      targetId: input.userId,
      metadata: {
        ...(input.metadata ?? {}),
        amount: input.amount,
        creditLedgerId: ledger.id,
        reason: input.reason,
      },
      createdAt: nowIso,
    };

    const storedLedger = await this.repository.applyCreditLedgerEntryWithAudit(
      nextAccount,
      ledger,
      auditLog,
    );
    return { account: nextAccount, ledger: storedLedger };
  }

  private async returnExistingTransition(
    idempotencyKey: string,
  ): Promise<CreditTransitionResult | undefined> {
    const ledger = await this.findExistingLedger(idempotencyKey);
    if (ledger === undefined) {
      return undefined;
    }

    return { account: await this.requireAccount(ledger.userId), ledger };
  }

  private async findExistingLedger(
    idempotencyKey: string,
  ): Promise<CreditLedgerEntryRecord | undefined> {
    validateRequired(idempotencyKey, "Idempotency key");
    return this.repository.findCreditLedgerEntryByIdempotencyKey(idempotencyKey);
  }

  private async requireAccount(
    userId: string,
  ): Promise<UserCreditAccountRecord> {
    const account = await this.repository.getCreditAccount(userId);
    if (!account) {
      throw new CreditServiceError(
        "account_not_found",
        "Credit account not found",
      );
    }
    return account;
  }

  private validateTaskAmountInput(input: HoldCreditsForTaskInput): void {
    validateRequired(input.userId, "User id");
    validateRequired(input.taskId, "Task id");
    validateRequired(input.idempotencyKey, "Idempotency key");
    validateIntegerAmount(input.amount, "Amount");
  }

  private async requireOpenHold(input: {
    userId: string;
    taskId: string;
    holdLedgerId: string;
  }): Promise<{
    account: UserCreditAccountRecord;
    hold: CreditLedgerEntryRecord;
    amount: number;
  }> {
    const hold = await this.repository.getCreditLedgerEntry(input.holdLedgerId);
    if (
      !hold ||
      hold.entryType !== "hold" ||
      hold.userId !== input.userId ||
      hold.taskId !== input.taskId
    ) {
      throw new CreditServiceError("hold_not_found", "Hold ledger entry not found");
    }

    const completed = await this.repository.findCreditLedgerEntryByMetadata(
      "holdLedgerId",
      hold.id,
      ["capture", "release"],
    );
    if (completed !== undefined) {
      throw new CreditServiceError(
        "hold_already_completed",
        "Hold has already been captured or released",
      );
    }

    return {
      account: await this.requireAccount(input.userId),
      hold,
      amount: Math.abs(hold.amount),
    };
  }

  private async requireCapture(
    captureLedgerId: string,
    input: { userId: string; taskId: string },
  ): Promise<CreditLedgerEntryRecord> {
    const capture = await this.repository.getCreditLedgerEntry(captureLedgerId);
    if (
      !capture ||
      capture.entryType !== "capture" ||
      capture.userId !== input.userId ||
      capture.taskId !== input.taskId
    ) {
      throw new CreditServiceError(
        "capture_not_found",
        "Capture ledger entry not found",
      );
    }

    return capture;
  }

  private async assertCaptureNotRefunded(captureLedgerId: string): Promise<void> {
    const refund = await this.repository.findCreditLedgerEntryByMetadata(
      "captureLedgerId",
      captureLedgerId,
      ["refund"],
    );
    if (refund !== undefined) {
      throw new CreditServiceError(
        "capture_already_refunded",
        "Capture has already been refunded",
      );
    }
  }

  private async attachHoldLedgerToTask(
    taskId: string,
    holdLedgerId: string,
    updatedAt: string,
  ): Promise<void> {
    const task = await this.repository.getCommercialTask(taskId);
    if (!task || task.creditHoldLedgerId !== undefined) {
      return;
    }

    await this.repository.saveCommercialTask({
      ...task,
      creditHoldLedgerId: holdLedgerId,
      updatedAt,
    });
  }

  private assertRedeemable(code: {
    status: string;
    redeemedAt?: string;
    disabledAt?: string;
    expiresAt?: string;
  }, now: Date): void {
    if (
      code.status !== "active" ||
      code.redeemedAt !== undefined ||
      code.disabledAt !== undefined ||
      isExpiredOrInvalid(code.expiresAt, now)
    ) {
      throw new CreditServiceError(
        "access_code_not_redeemable",
        "Access code cannot be redeemed",
      );
    }
  }

  private safeHashAccessCode(rawCode: string): string {
    try {
      return this.hashAccessCode(rawCode, this.accessCodePepper);
    } catch (error) {
      throw new CreditServiceError(
        "invalid_credit_input",
        error instanceof Error ? error.message : "Invalid access code",
      );
    }
  }

  private currentDate(): Date {
    const value = this.now();
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) {
      throw new CreditServiceError(
        "invalid_credit_input",
        "Invalid current time",
      );
    }
    return date;
  }
}

function isExpiredOrInvalid(expiresAt: string | undefined, now: Date): boolean {
  if (expiresAt === undefined) {
    return false;
  }

  const expiresAtMs = Date.parse(expiresAt);
  return !Number.isFinite(expiresAtMs) || expiresAtMs <= now.getTime();
}

function validateRequired(value: string, label: string): void {
  if (!value.trim()) {
    throw new CreditServiceError(
      "invalid_credit_input",
      `${label} is required`,
    );
  }
}

function validateIntegerAmount(
  value: number,
  label: string,
  options: { allowNegative?: boolean } = {},
): void {
  const minimum = options.allowNegative ? Number.NEGATIVE_INFINITY : 1;
  if (!Number.isInteger(value) || value < minimum) {
    throw new CreditServiceError(
      "invalid_credit_input",
      `${label} must be ${options.allowNegative ? "an integer" : "a positive integer"}`,
    );
  }
}
