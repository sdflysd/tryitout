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
  | "idempotency_conflict"
  | "task_not_found"
  | "task_hold_conflict"
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

    const codeHash = this.safeHashAccessCode(input.rawCode);
    const code = await this.repository.findAccessCodeByHash(codeHash);
    if (!code) {
      throw new CreditServiceError("access_code_not_found", "Access code not found");
    }
    const fingerprint = createRequestFingerprint({
      operation: "redeem_access_code",
      requestUserId: input.userId,
      accessCodeId: code.id,
      amount: code.credits,
    });
    const existingLedger = await this.findExistingLedger(input.idempotencyKey);
    if (existingLedger !== undefined) {
      this.assertIdempotentReplay(existingLedger, "redeem", fingerprint);
      const account = await this.requireAccount(input.userId);
      const redemption = await this.repository.findAccessCodeRedemptionByCodeId(
        code.id,
      );
      if (!redemption || redemption.userId !== input.userId) {
        throw new CreditServiceError(
          "idempotency_conflict",
          "Idempotency key conflicts with a different request",
        );
      }
      return { account, ledger: existingLedger, redemption };
    }
    const nowDate = this.currentDate();
    this.assertRedeemable(code, nowDate);

    const nowIso = nowDate.toISOString();
    const ledger: CreditLedgerEntryRecord = {
      id: this.createId("credit_ledger"),
      userId: input.userId,
      accessCodeId: code.id,
      entryType: "redeem",
      amount: code.credits,
      balanceAfter: 0,
      frozenAfter: 0,
      idempotencyKey: input.idempotencyKey,
      reason: "access_code",
      metadata: requestMetadata(input.metadata, {
        operation: "redeem_access_code",
        requestUserId: input.userId,
        accessCodeId: code.id,
        amount: code.credits,
        requestFingerprint: fingerprint,
      }),
      createdAt: nowIso,
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
      ledger,
    );
    if (!redeemed) {
      throw new CreditServiceError(
        "access_code_not_redeemable",
        "Access code cannot be redeemed",
      );
    }

    return redeemed;
  }

  async holdCreditsForTask(
    input: HoldCreditsForTaskInput,
  ): Promise<CreditTransitionResult> {
    this.validateTaskAmountInput(input);

    const fingerprint = createRequestFingerprint({
      operation: "hold_task_credits",
      requestUserId: input.userId,
      taskId: input.taskId,
      amount: input.amount,
      reason: input.reason,
    });
    const existing = await this.returnExistingTransition(
      input.idempotencyKey,
      "hold",
      fingerprint,
    );
    if (existing !== undefined) {
      return existing;
    }

    const nowIso = this.currentDate().toISOString();
    const ledger: CreditLedgerEntryRecord = {
      id: this.createId("credit_ledger"),
      userId: input.userId,
      taskId: input.taskId,
      entryType: "hold",
      amount: -input.amount,
      balanceAfter: 0,
      frozenAfter: 0,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
      metadata: requestMetadata(input.metadata, {
        operation: "hold_task_credits",
        requestUserId: input.userId,
        taskId: input.taskId,
        amount: input.amount,
        reason: input.reason,
        requestFingerprint: fingerprint,
      }),
      createdAt: nowIso,
    };

    const stored = await this.repository.holdCreditsForTask({
      ledgerEntry: ledger,
      amount: input.amount,
      taskUpdatedAt: nowIso,
    });
    if (stored !== undefined) {
      return stored;
    }

    await this.throwHoldFailure(input);
  }

  async captureHeldCredits(
    input: CaptureHeldCreditsInput,
  ): Promise<CreditTransitionResult> {
    validateRequired(input.userId, "User id");
    validateRequired(input.taskId, "Task id");
    validateRequired(input.holdLedgerId, "Hold ledger id");
    validateRequired(input.idempotencyKey, "Idempotency key");

    const fingerprint = createRequestFingerprint({
      operation: "capture_hold",
      requestUserId: input.userId,
      taskId: input.taskId,
      holdLedgerId: input.holdLedgerId,
    });
    const existing = await this.returnExistingTransition(
      input.idempotencyKey,
      "capture",
      fingerprint,
    );
    if (existing !== undefined) {
      return existing;
    }

    const { hold, amount } = await this.requireOpenHold(input);
    const account = await this.requireAccount(input.userId);
    if (account.frozenCredits < amount) {
      throw new CreditServiceError(
        "insufficient_credits",
        "Frozen credit balance is insufficient",
      );
    }

    const nowIso = this.currentDate().toISOString();
    const ledger: CreditLedgerEntryRecord = {
      id: this.createId("credit_ledger"),
      userId: input.userId,
      taskId: input.taskId,
      entryType: "capture",
      amount: -amount,
      balanceAfter: 0,
      frozenAfter: 0,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
      metadata: requestMetadata(input.metadata, {
        operation: "capture_hold",
        requestUserId: input.userId,
        taskId: input.taskId,
        holdLedgerId: hold.id,
        amount,
        reason: input.reason,
        requestFingerprint: fingerprint,
      }),
      createdAt: nowIso,
    };

    const stored = await this.repository.captureHeldCredits({
      ledgerEntry: ledger,
      holdLedgerId: hold.id,
      amount,
    });
    if (stored !== undefined) {
      return stored;
    }
    await this.throwHoldCompletionFailure(input);
  }

  async releaseHeldCredits(
    input: ReleaseHeldCreditsInput,
  ): Promise<CreditTransitionResult> {
    validateRequired(input.userId, "User id");
    validateRequired(input.taskId, "Task id");
    validateRequired(input.holdLedgerId, "Hold ledger id");
    validateRequired(input.idempotencyKey, "Idempotency key");

    const fingerprint = createRequestFingerprint({
      operation: "release_hold",
      requestUserId: input.userId,
      taskId: input.taskId,
      holdLedgerId: input.holdLedgerId,
      reason: input.reason,
    });
    const existing = await this.returnExistingTransition(
      input.idempotencyKey,
      "release",
      fingerprint,
    );
    if (existing !== undefined) {
      return existing;
    }

    const { hold, amount } = await this.requireOpenHold(input);
    const account = await this.requireAccount(input.userId);
    if (account.frozenCredits < amount) {
      throw new CreditServiceError(
        "insufficient_credits",
        "Frozen credit balance is insufficient",
      );
    }

    const nowIso = this.currentDate().toISOString();
    const ledger: CreditLedgerEntryRecord = {
      id: this.createId("credit_ledger"),
      userId: input.userId,
      taskId: input.taskId,
      entryType: "release",
      amount,
      balanceAfter: 0,
      frozenAfter: 0,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
      metadata: requestMetadata(input.metadata, {
        operation: "release_hold",
        requestUserId: input.userId,
        taskId: input.taskId,
        holdLedgerId: hold.id,
        amount,
        reason: input.reason,
        requestFingerprint: fingerprint,
      }),
      createdAt: nowIso,
    };

    const stored = await this.repository.releaseHeldCredits({
      ledgerEntry: ledger,
      holdLedgerId: hold.id,
      amount,
    });
    if (stored !== undefined) {
      return stored;
    }
    await this.throwHoldCompletionFailure(input);
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

    const fingerprint = createRequestFingerprint({
      operation: "refund_capture",
      requestUserId: input.userId,
      taskId: input.taskId,
      captureLedgerId: input.captureLedgerId,
      actorUserId: input.actorUserId,
      reason: input.reason,
    });
    const existing = await this.returnExistingTransition(
      input.idempotencyKey,
      "refund",
      fingerprint,
    );
    if (existing !== undefined) {
      return existing;
    }

    const capture = await this.requireCapture(input.captureLedgerId, input);
    const amount = Math.abs(capture.amount);
    const nowIso = this.currentDate().toISOString();
    const ledger: CreditLedgerEntryRecord = {
      id: this.createId("credit_ledger"),
      userId: input.userId,
      taskId: input.taskId,
      entryType: "refund",
      amount,
      balanceAfter: 0,
      frozenAfter: 0,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
      metadata: requestMetadata(input.metadata, {
        operation: "refund_capture",
        requestUserId: input.userId,
        taskId: input.taskId,
        actorUserId: input.actorUserId,
        captureLedgerId: capture.id,
        amount,
        reason: input.reason,
        requestFingerprint: fingerprint,
      }),
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

    const stored = await this.repository.refundCapturedCreditsWithAudit({
      ledgerEntry: ledger,
      captureLedgerId: capture.id,
      amount,
      auditLog,
    });
    if (stored !== undefined) {
      return stored;
    }
    await this.throwRefundFailure(capture.id);
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

    const fingerprint = createRequestFingerprint({
      operation: "adjust_credits",
      requestUserId: input.userId,
      actorUserId: input.actorUserId,
      amount: input.amount,
      reason: input.reason,
    });
    const existing = await this.returnExistingTransition(
      input.idempotencyKey,
      "adjustment",
      fingerprint,
    );
    if (existing !== undefined) {
      return existing;
    }

    const nowIso = this.currentDate().toISOString();
    const ledger: CreditLedgerEntryRecord = {
      id: this.createId("credit_ledger"),
      userId: input.userId,
      entryType: "adjustment",
      amount: input.amount,
      balanceAfter: 0,
      frozenAfter: 0,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
      metadata: requestMetadata(input.metadata, {
        operation: "adjust_credits",
        requestUserId: input.userId,
        actorUserId: input.actorUserId,
        amount: input.amount,
        reason: input.reason,
        requestFingerprint: fingerprint,
      }),
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

    const stored = await this.repository.adjustCreditsWithAudit({
      ledgerEntry: ledger,
      amount: input.amount,
      auditLog,
    });
    if (stored !== undefined) {
      return stored;
    }
    await this.throwAdjustmentFailure(input.userId, input.amount);
  }

  private async returnExistingTransition(
    idempotencyKey: string,
    entryType: CreditLedgerEntryRecord["entryType"],
    fingerprint: string,
  ): Promise<CreditTransitionResult | undefined> {
    const ledger = await this.findExistingLedger(idempotencyKey);
    if (ledger === undefined) {
      return undefined;
    }

    this.assertIdempotentReplay(ledger, entryType, fingerprint);
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

  private assertIdempotentReplay(
    ledger: CreditLedgerEntryRecord,
    entryType: CreditLedgerEntryRecord["entryType"],
    fingerprint: string,
  ): void {
    if (
      ledger.entryType !== entryType ||
      ledger.metadata?.requestFingerprint !== fingerprint
    ) {
      throw new CreditServiceError(
        "idempotency_conflict",
        "Idempotency key conflicts with a different request",
      );
    }
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

  private async throwHoldFailure(input: HoldCreditsForTaskInput): Promise<never> {
    const task = await this.repository.getCommercialTask(input.taskId);
    if (!task || task.userId !== input.userId) {
      throw new CreditServiceError("task_not_found", "Task not found");
    }
    if (task.creditHoldLedgerId !== undefined) {
      throw new CreditServiceError(
        "task_hold_conflict",
        "Task already has a credit hold",
      );
    }
    const account = await this.requireAccount(input.userId);
    if (account.balance < input.amount) {
      throw new CreditServiceError(
        "insufficient_credits",
        "Available credit balance is insufficient",
      );
    }
    throw new CreditServiceError(
      "invalid_credit_input",
      "Credit hold could not be applied",
    );
  }

  private async throwHoldCompletionFailure(input: {
    userId: string;
    taskId: string;
    holdLedgerId: string;
  }): Promise<never> {
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
    throw new CreditServiceError(
      "insufficient_credits",
      "Frozen credit balance is insufficient",
    );
  }

  private async throwRefundFailure(captureLedgerId: string): Promise<never> {
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
    throw new CreditServiceError(
      "invalid_credit_input",
      "Credit refund could not be applied",
    );
  }

  private async throwAdjustmentFailure(
    userId: string,
    amount: number,
  ): Promise<never> {
    const account = await this.requireAccount(userId);
    if (account.balance + amount < 0) {
      throw new CreditServiceError(
        "insufficient_credits",
        "Credit adjustment would make balance negative",
      );
    }
    throw new CreditServiceError(
      "invalid_credit_input",
      "Credit adjustment could not be applied",
    );
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

function requestMetadata(
  metadata: JsonObject | undefined,
  fields: JsonObject,
): JsonObject {
  return {
    ...(metadata ?? {}),
    ...Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined),
    ),
  };
}

function createRequestFingerprint(fields: JsonObject): string {
  return JSON.stringify(sortJsonObject(stripUndefined(fields)));
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripUndefined);
  }
  if (isPlainJsonObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, stripUndefined(item)]),
    );
  }
  return value;
}

function sortJsonObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonObject);
  }
  if (isPlainJsonObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortJsonObject(value[key])]),
    );
  }
  return value;
}

function isPlainJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
