import { randomUUID } from "node:crypto";

import { hashAccessCode } from "./access-codes.js";
import type { CommercialRepository } from "./repository.js";
import type { CreditLedgerEntryRecord } from "./types.js";

export interface CreditServiceOptions {
  accessCodePepper: string;
  now?: () => Date;
}

export class CreditServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CreditServiceError";
  }
}

export class CreditService {
  private readonly now: () => Date;

  constructor(
    private readonly repository: CommercialRepository,
    private readonly options: CreditServiceOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async redeemAccessCode(input: {
    userId: string;
    code: string;
    idempotencyKey: string;
  }): Promise<{ balance: number; ledgerEntry: CreditLedgerEntryRecord }> {
    return this.repository.runInTransaction(async (repository) => {
      const existing = await repository.findLedgerEntryByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        return { balance: existing.balanceAfter, ledgerEntry: existing };
      }

      const accessCode = await repository.findAccessCodeByHash(
        hashAccessCode(input.code, this.options.accessCodePepper),
      );
      if (!accessCode || accessCode.status !== "active") {
        throw new CreditServiceError("access_code_not_active", "Access code is not active.");
      }
      if (accessCode.expiresAt && accessCode.expiresAt <= this.now()) {
        throw new CreditServiceError("access_code_not_active", "Access code is not active.");
      }
      if (await repository.findAccessCodeRedemption(accessCode.id)) {
        throw new CreditServiceError("access_code_not_active", "Access code is not active.");
      }

      const account = await requireCreditAccount(repository, input.userId);
      const timestamp = this.now();
      const nextBalance = account.balance + accessCode.creditAmount;
      const ledgerEntry: CreditLedgerEntryRecord = {
        id: createId("ledger"),
        userId: input.userId,
        type: "redeem",
        amount: accessCode.creditAmount,
        balanceAfter: nextBalance,
        idempotencyKey: input.idempotencyKey,
        referenceType: "access_code",
        referenceId: accessCode.id,
        metadata: { accessCodeId: accessCode.id },
        createdAt: timestamp,
      };

      await repository.saveCreditAccount({
        ...account,
        balance: nextBalance,
        updatedAt: timestamp,
      });
      await repository.appendLedgerEntry(ledgerEntry);
      await repository.saveAccessCode({
        ...accessCode,
        status: "redeemed",
        redeemedByUserId: input.userId,
        redeemedAt: timestamp,
        updatedAt: timestamp,
      });
      await repository.saveAccessCodeRedemption({
        id: createId("redemption"),
        accessCodeId: accessCode.id,
        userId: input.userId,
        ledgerEntryId: ledgerEntry.id,
        redeemedAt: timestamp,
      });

      const user = await repository.getUser(input.userId);
      if (user) {
        await repository.saveUser({
          ...user,
          tier: accessCode.tier,
          features: [...new Set([...user.features, ...accessCode.features])],
          updatedAt: timestamp,
        });
      }

      return { balance: nextBalance, ledgerEntry };
    });
  }

  async holdCredits(input: {
    userId: string;
    amount: number;
    taskId: string;
    idempotencyKey: string;
  }): Promise<CreditLedgerEntryRecord> {
    return this.repository.runInTransaction(async (repository) => {
      const existing = await repository.findLedgerEntryByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        return existing;
      }

      const account = await requireCreditAccount(repository, input.userId);
      if (account.balance < input.amount) {
        throw new CreditServiceError("insufficient_credits", "Insufficient credits.");
      }

      const timestamp = this.now();
      const nextBalance = account.balance - input.amount;
      const entry: CreditLedgerEntryRecord = {
        id: createId("ledger"),
        userId: input.userId,
        type: "hold",
        amount: -input.amount,
        balanceAfter: nextBalance,
        idempotencyKey: input.idempotencyKey,
        referenceType: "simulation_task",
        referenceId: input.taskId,
        metadata: { taskId: input.taskId },
        createdAt: timestamp,
      };

      await repository.saveCreditAccount({ ...account, balance: nextBalance, updatedAt: timestamp });
      await repository.appendLedgerEntry(entry);
      return entry;
    });
  }

  async captureHeldCredits(input: {
    userId: string;
    holdLedgerEntryId: string;
    taskId: string;
    idempotencyKey: string;
  }): Promise<CreditLedgerEntryRecord> {
    return this.repository.runInTransaction(async (repository) => {
      const existing = await repository.findLedgerEntryByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        return existing;
      }

      const hold = await requireHoldLedger(repository, input.userId, input.holdLedgerEntryId);
      const account = await requireCreditAccount(repository, input.userId);
      const entry: CreditLedgerEntryRecord = {
        id: createId("ledger"),
        userId: input.userId,
        type: "capture",
        amount: Math.abs(hold.amount),
        balanceAfter: account.balance,
        idempotencyKey: input.idempotencyKey,
        referenceType: "simulation_task",
        referenceId: input.taskId,
        metadata: { taskId: input.taskId, holdLedgerEntryId: hold.id },
        createdAt: this.now(),
      };

      await repository.appendLedgerEntry(entry);
      return entry;
    });
  }

  async releaseHeldCredits(input: {
    userId: string;
    holdLedgerEntryId: string;
    taskId: string;
    idempotencyKey: string;
  }): Promise<CreditLedgerEntryRecord> {
    return this.repository.runInTransaction(async (repository) => {
      const existing = await repository.findLedgerEntryByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        return existing;
      }

      const hold = await requireHoldLedger(repository, input.userId, input.holdLedgerEntryId);
      const account = await requireCreditAccount(repository, input.userId);
      const timestamp = this.now();
      const amount = Math.abs(hold.amount);
      const nextBalance = account.balance + amount;
      const entry: CreditLedgerEntryRecord = {
        id: createId("ledger"),
        userId: input.userId,
        type: "release",
        amount,
        balanceAfter: nextBalance,
        idempotencyKey: input.idempotencyKey,
        referenceType: "simulation_task",
        referenceId: input.taskId,
        metadata: { taskId: input.taskId, holdLedgerEntryId: hold.id },
        createdAt: timestamp,
      };

      await repository.saveCreditAccount({ ...account, balance: nextBalance, updatedAt: timestamp });
      await repository.appendLedgerEntry(entry);
      return entry;
    });
  }

  async adjustCredits(input: {
    userId: string;
    amount: number;
    adminUserId: string;
    reason: string;
    idempotencyKey: string;
  }): Promise<CreditLedgerEntryRecord> {
    return this.repository.runInTransaction(async (repository) => {
      const existing = await repository.findLedgerEntryByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        return existing;
      }

      const account = await requireCreditAccount(repository, input.userId);
      const timestamp = this.now();
      const nextBalance = account.balance + input.amount;
      if (nextBalance < 0) {
        throw new CreditServiceError("insufficient_credits", "Insufficient credits.");
      }

      const entry: CreditLedgerEntryRecord = {
        id: createId("ledger"),
        userId: input.userId,
        type: "adjustment",
        amount: input.amount,
        balanceAfter: nextBalance,
        idempotencyKey: input.idempotencyKey,
        referenceType: "admin_adjustment",
        referenceId: input.adminUserId,
        metadata: { adminUserId: input.adminUserId, reason: input.reason },
        createdAt: timestamp,
      };

      await repository.saveCreditAccount({ ...account, balance: nextBalance, updatedAt: timestamp });
      await repository.appendLedgerEntry(entry);
      return entry;
    });
  }
}

async function requireCreditAccount(
  repository: CommercialRepository,
  userId: string,
): Promise<Awaited<ReturnType<CommercialRepository["getCreditAccount"]>> & {}> {
  const account = await repository.getCreditAccount(userId);
  if (!account) {
    throw new CreditServiceError("credit_account_not_found", "Credit account was not found.");
  }
  return account;
}

async function requireHoldLedger(
  repository: CommercialRepository,
  userId: string,
  holdLedgerEntryId: string,
): Promise<CreditLedgerEntryRecord> {
  const hold = await repository.getLedgerEntry(holdLedgerEntryId);
  if (!hold || hold.userId !== userId || hold.type !== "hold") {
    throw new CreditServiceError("hold_not_found", "Credit hold was not found.");
  }
  return hold;
}

function createId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
