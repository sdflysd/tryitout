import {
  ADMIN_AUDIT_ACTIONS,
  type AdminAuditAction,
  resolveCommercialEntitlements,
} from "../../contracts/commercial.js";
import type {
  AccessCodeBatchRecord,
  AccessCodeRecord,
  AccessCodeRedemptionRecord,
  AdminAuditLogRecord,
  AnalyticsEventRecord,
  CommercialSessionRecord,
  CommercialSimulationCheckpointRecord,
  CommercialSimulationReportRecord,
  CommercialSimulationTaskRecord,
  CommercialUserRecord,
  CreditLedgerEntryRecord,
  JsonObject,
  PlatformModelProfileRecord,
  PlatformModelProviderRecord,
  SimulationStepRunCostRecord,
  SimulationTaskRunRecord,
  SystemSettingRecord,
  UserCreditAccountRecord,
  UserFeedbackRecord,
  WorkerHeartbeatRecord,
  UserModelProviderRecord,
} from "./types.js";

export interface CreditLedgerTransitionResult {
  account: UserCreditAccountRecord;
  ledger: CreditLedgerEntryRecord;
}

export interface RedeemAccessCodeWithCreditLedgerResult extends CreditLedgerTransitionResult {
  redemption: AccessCodeRedemptionRecord;
}

export interface CommercialRepository {
  saveUser(user: CommercialUserRecord): Promise<void>;
  getUser(userId: string): Promise<CommercialUserRecord | undefined>;
  getEffectiveUser(
    userId: string,
    at?: Date | string,
  ): Promise<CommercialUserRecord | undefined>;
  listUsers(): Promise<CommercialUserRecord[]>;
  findUserByEmail(email: string): Promise<CommercialUserRecord | undefined>;
  createUserWithCreditAccount(
    user: CommercialUserRecord,
    account: UserCreditAccountRecord,
  ): Promise<void>;

  saveSession(session: CommercialSessionRecord): Promise<void>;
  findSessionByTokenHash(
    tokenHash: string,
  ): Promise<CommercialSessionRecord | undefined>;
  revokeUserSessions(userId: string, revokedAt: string): Promise<void>;

  saveCreditAccount(account: UserCreditAccountRecord): Promise<void>;
  getCreditAccount(
    userId: string,
  ): Promise<UserCreditAccountRecord | undefined>;
  listCreditAccounts(): Promise<UserCreditAccountRecord[]>;
  appendCreditLedgerEntry(entry: CreditLedgerEntryRecord): Promise<void>;
  listCreditLedgerEntries(
    userId?: string,
  ): Promise<CreditLedgerEntryRecord[]>;
  findCreditLedgerEntryByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<CreditLedgerEntryRecord | undefined>;
  getCreditLedgerEntry(
    ledgerEntryId: string,
  ): Promise<CreditLedgerEntryRecord | undefined>;
  findCreditLedgerEntryByMetadata(
    metadataKey: string,
    metadataValue: string,
    entryTypes?: CreditLedgerEntryRecord["entryType"][],
  ): Promise<CreditLedgerEntryRecord | undefined>;
  holdCreditsForTask(input: {
    ledgerEntry: CreditLedgerEntryRecord;
    amount: number;
    taskUpdatedAt: string;
  }): Promise<CreditLedgerTransitionResult | undefined>;
  captureHeldCredits(input: {
    ledgerEntry: CreditLedgerEntryRecord;
    holdLedgerId: string;
    amount: number;
  }): Promise<CreditLedgerTransitionResult | undefined>;
  releaseHeldCredits(input: {
    ledgerEntry: CreditLedgerEntryRecord;
    holdLedgerId: string;
    amount: number;
  }): Promise<CreditLedgerTransitionResult | undefined>;
  refundCapturedCreditsWithAudit(input: {
    ledgerEntry: CreditLedgerEntryRecord;
    captureLedgerId: string;
    amount: number;
    auditLog: AdminAuditLogRecord;
  }): Promise<CreditLedgerTransitionResult | undefined>;
  adjustCreditsWithAudit(input: {
    ledgerEntry: CreditLedgerEntryRecord;
    amount: number;
    auditLog: AdminAuditLogRecord;
  }): Promise<CreditLedgerTransitionResult | undefined>;

  saveAccessCodeBatch(batch: AccessCodeBatchRecord): Promise<void>;
  listAccessCodeBatches(): Promise<AccessCodeBatchRecord[]>;
  createAccessCodeBatchWithCodes(
    batch: AccessCodeBatchRecord,
    codes: AccessCodeRecord[],
  ): Promise<void>;
  getAccessCodeBatch(
    batchId: string,
  ): Promise<AccessCodeBatchRecord | undefined>;
  saveAccessCode(code: AccessCodeRecord): Promise<void>;
  getAccessCode(codeId: string): Promise<AccessCodeRecord | undefined>;
  listAccessCodes(): Promise<AccessCodeRecord[]>;
  listAccessCodesByBatch(batchId: string): Promise<AccessCodeRecord[]>;
  findAccessCodeByHash(codeHash: string): Promise<AccessCodeRecord | undefined>;
  saveAccessCodeRedemption(
    redemption: AccessCodeRedemptionRecord,
  ): Promise<void>;
  redeemAccessCode(
    code: AccessCodeRecord,
    redemption: AccessCodeRedemptionRecord,
  ): Promise<boolean>;
  redeemAccessCodeWithCreditLedger(
    code: AccessCodeRecord,
    redemption: AccessCodeRedemptionRecord,
    ledgerEntry: CreditLedgerEntryRecord,
  ): Promise<RedeemAccessCodeWithCreditLedgerResult | undefined>;
  findAccessCodeRedemptionByCodeId(
    accessCodeId: string,
  ): Promise<AccessCodeRedemptionRecord | undefined>;
  disableAccessCodeWithAudit(
    codeId: string,
    disabledAt: string,
    auditLog: AdminAuditLogRecord,
  ): Promise<AccessCodeRecord | undefined>;
  restoreAccessCodeWithAudit(
    codeId: string,
    restoredAt: string,
    auditLog: AdminAuditLogRecord,
  ): Promise<AccessCodeRecord | undefined>;
  softDeleteAccessCodeWithAudit(
    codeId: string,
    deletedAt: string,
    auditLog: AdminAuditLogRecord,
  ): Promise<AccessCodeRecord | undefined>;
  disableAccessCodeBatchWithAudit(
    batchId: string,
    disabledAt: string,
    auditLog: AdminAuditLogRecord,
  ): Promise<
    | { batch: AccessCodeBatchRecord; disabledCodeCount: number }
    | undefined
  >;

  saveCommercialTask(task: CommercialSimulationTaskRecord): Promise<void>;
  getCommercialTask(
    taskId: string,
  ): Promise<CommercialSimulationTaskRecord | undefined>;
  listCommercialTasks(
    userId?: string,
  ): Promise<CommercialSimulationTaskRecord[]>;
  findCommercialTaskByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<CommercialSimulationTaskRecord | undefined>;
  findActiveCommercialTaskByUserId(
    userId: string,
  ): Promise<CommercialSimulationTaskRecord | undefined>;
  saveSimulationTaskRun(run: SimulationTaskRunRecord): Promise<void>;
  appendSimulationTaskRun(run: SimulationTaskRunRecord): Promise<void>;
  listSimulationTaskRuns(taskId: string): Promise<SimulationTaskRunRecord[]>;
  appendSimulationStepRunCost(run: SimulationStepRunCostRecord): Promise<void>;
  listSimulationStepRunCosts(
    taskId?: string,
  ): Promise<SimulationStepRunCostRecord[]>;
  saveCommercialCheckpoint(
    checkpoint: CommercialSimulationCheckpointRecord,
  ): Promise<void>;
  getLatestCommercialCheckpoint(
    taskId: string,
  ): Promise<CommercialSimulationCheckpointRecord | undefined>;
  saveWorkerHeartbeat(heartbeat: WorkerHeartbeatRecord): Promise<void>;
  listWorkerHeartbeats(): Promise<WorkerHeartbeatRecord[]>;
  saveCommercialReport(report: CommercialSimulationReportRecord): Promise<void>;
  getCommercialReportByTaskId(
    taskId: string,
  ): Promise<CommercialSimulationReportRecord | undefined>;
  listCommercialReports(
    userId?: string,
  ): Promise<CommercialSimulationReportRecord[]>;

  appendAnalyticsEvent(event: AnalyticsEventRecord): Promise<void>;
  listAnalyticsEvents(): Promise<AnalyticsEventRecord[]>;
  appendUserFeedback(feedback: UserFeedbackRecord): Promise<void>;
  listUserFeedback(userId?: string): Promise<UserFeedbackRecord[]>;
  saveUserModelProvider(provider: UserModelProviderRecord): Promise<void>;
  listUserModelProviders(userId: string): Promise<UserModelProviderRecord[]>;
  savePlatformModelProvider(provider: PlatformModelProviderRecord): Promise<void>;
  getPlatformModelProvider(providerId: string): Promise<PlatformModelProviderRecord | undefined>;
  listPlatformModelProviders(): Promise<PlatformModelProviderRecord[]>;
  savePlatformModelProfile(profile: PlatformModelProfileRecord): Promise<void>;
  getPlatformModelProfile(profileId: string): Promise<PlatformModelProfileRecord | undefined>;
  listPlatformModelProfiles(): Promise<PlatformModelProfileRecord[]>;
  saveSystemSetting(setting: SystemSettingRecord): Promise<void>;
  getSystemSetting(key: string): Promise<SystemSettingRecord | undefined>;
  appendAdminAuditLog(log: AdminAuditLogRecord): Promise<void>;
  listAdminAuditLogs(): Promise<AdminAuditLogRecord[]>;
}

export class InMemoryCommercialRepository implements CommercialRepository {
  private readonly users = new Map<string, CommercialUserRecord>();
  private readonly sessions = new Map<string, CommercialSessionRecord>();
  private readonly creditAccounts = new Map<string, UserCreditAccountRecord>();
  private readonly creditLedger: CreditLedgerEntryRecord[] = [];
  private readonly accessCodeBatches = new Map<string, AccessCodeBatchRecord>();
  private readonly accessCodes = new Map<string, AccessCodeRecord>();
  private readonly accessCodeRedemptions: AccessCodeRedemptionRecord[] = [];
  private readonly commercialTasks = new Map<
    string,
    CommercialSimulationTaskRecord
  >();
  private readonly taskRuns: SimulationTaskRunRecord[] = [];
  private readonly stepRunCosts: SimulationStepRunCostRecord[] = [];
  private readonly checkpoints: CommercialSimulationCheckpointRecord[] = [];
  private readonly workerHeartbeats = new Map<string, WorkerHeartbeatRecord>();
  private readonly reports = new Map<string, CommercialSimulationReportRecord>();
  private readonly analyticsEvents: AnalyticsEventRecord[] = [];
  private readonly feedback: UserFeedbackRecord[] = [];
  private readonly modelProviders = new Map<string, UserModelProviderRecord>();
  private readonly platformModelProviders = new Map<string, PlatformModelProviderRecord>();
  private readonly platformModelProfiles = new Map<string, PlatformModelProfileRecord>();
  private readonly systemSettings = new Map<string, SystemSettingRecord>();
  private readonly auditLogs: AdminAuditLogRecord[] = [];

  async saveUser(user: CommercialUserRecord): Promise<void> {
    assertUniqueById(
      this.users.values(),
      user.id,
      (existing) => existing.emailNormalized === user.emailNormalized,
      "users.emailNormalized",
    );
    this.users.set(user.id, user);
  }

  async getUser(userId: string): Promise<CommercialUserRecord | undefined> {
    return this.users.get(userId);
  }

  async getEffectiveUser(
    userId: string,
    at: Date | string = new Date(),
  ): Promise<CommercialUserRecord | undefined> {
    const user = this.users.get(userId);
    if (!user) {
      return undefined;
    }

    const entitlements = resolveCommercialEntitlements(
      { tier: user.tier, features: user.features },
      this.accessCodeRedemptions
        .filter((redemption) => redemption.userId === userId)
        .map((redemption) => ({
          tier: redemption.tierGranted,
          features: redemption.featuresGranted,
          startsAt: redemption.entitlementStartsAt ?? redemption.redeemedAt,
          expiresAt: redemption.entitlementExpiresAt,
        })),
      at,
    );

    return {
      ...user,
      tier: entitlements.tier,
      features: entitlements.features,
    };
  }

  async listUsers(): Promise<CommercialUserRecord[]> {
    return [...this.users.values()].sort(sortByCreatedAtDescThenId);
  }

  async findUserByEmail(
    email: string,
  ): Promise<CommercialUserRecord | undefined> {
    const normalized = normalizeEmail(email);
    return [...this.users.values()].find(
      (user) => user.emailNormalized === normalized,
    );
  }

  async createUserWithCreditAccount(
    user: CommercialUserRecord,
    account: UserCreditAccountRecord,
  ): Promise<void> {
    if (this.users.has(user.id)) {
      throw new Error("users.id must be unique");
    }
    assertUniqueById(
      this.users.values(),
      user.id,
      (existing) => existing.emailNormalized === user.emailNormalized,
      "users.emailNormalized",
    );
    if (user.id !== account.userId) {
      throw new Error("user_credit_accounts.userId must match users.id");
    }
    if (this.creditAccounts.has(account.userId)) {
      throw new Error("user_credit_accounts.userId must be unique");
    }

    this.users.set(user.id, user);
    this.creditAccounts.set(account.userId, account);
  }

  async saveSession(session: CommercialSessionRecord): Promise<void> {
    assertUniqueById(
      this.sessions.values(),
      session.id,
      (existing) => existing.tokenHash === session.tokenHash,
      "user_sessions.tokenHash",
    );
    this.sessions.set(session.id, session);
  }

  async findSessionByTokenHash(
    tokenHash: string,
  ): Promise<CommercialSessionRecord | undefined> {
    return [...this.sessions.values()].find(
      (session) => session.tokenHash === tokenHash,
    );
  }

  async revokeUserSessions(userId: string, revokedAt: string): Promise<void> {
    for (const [sessionId, session] of this.sessions) {
      if (session.userId === userId && session.revokedAt === undefined) {
        this.sessions.set(sessionId, {
          ...session,
          revokedAt,
        });
      }
    }
  }

  async saveCreditAccount(account: UserCreditAccountRecord): Promise<void> {
    this.creditAccounts.set(account.userId, account);
  }

  async getCreditAccount(
    userId: string,
  ): Promise<UserCreditAccountRecord | undefined> {
    return this.creditAccounts.get(userId);
  }

  async listCreditAccounts(): Promise<UserCreditAccountRecord[]> {
    return [...this.creditAccounts.values()].sort((left, right) =>
      left.userId.localeCompare(right.userId),
    );
  }

  async appendCreditLedgerEntry(
    entry: CreditLedgerEntryRecord,
  ): Promise<void> {
    assertUniqueById(
      this.creditLedger,
      entry.id,
      (existing) => existing.idempotencyKey === entry.idempotencyKey,
      "credit_ledger.idempotencyKey",
    );
    appendById(this.creditLedger, entry, "credit_ledger.id");
  }

  async listCreditLedgerEntries(
    userId?: string,
  ): Promise<CreditLedgerEntryRecord[]> {
    return this.creditLedger
      .filter((entry) => userId === undefined || entry.userId === userId)
      .sort(sortByCreatedAtDescThenId);
  }

  async findCreditLedgerEntryByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<CreditLedgerEntryRecord | undefined> {
    return this.creditLedger.find(
      (entry) => entry.idempotencyKey === idempotencyKey,
    );
  }

  async getCreditLedgerEntry(
    ledgerEntryId: string,
  ): Promise<CreditLedgerEntryRecord | undefined> {
    return this.creditLedger.find((entry) => entry.id === ledgerEntryId);
  }

  async findCreditLedgerEntryByMetadata(
    metadataKey: string,
    metadataValue: string,
    entryTypes?: CreditLedgerEntryRecord["entryType"][],
  ): Promise<CreditLedgerEntryRecord | undefined> {
    return this.creditLedger.find((entry) => {
      if (
        entryTypes !== undefined &&
        !entryTypes.includes(entry.entryType)
      ) {
        return false;
      }

      return entry.metadata?.[metadataKey] === metadataValue;
    });
  }

  async saveAccessCodeBatch(batch: AccessCodeBatchRecord): Promise<void> {
    this.accessCodeBatches.set(batch.id, batch);
  }

  async listAccessCodeBatches(): Promise<AccessCodeBatchRecord[]> {
    return [...this.accessCodeBatches.values()].sort(sortByCreatedAtDescThenId);
  }

  async createAccessCodeBatchWithCodes(
    batch: AccessCodeBatchRecord,
    codes: AccessCodeRecord[],
  ): Promise<void> {
    validateAccessCodeBatchCodes(batch, codes);
    if (this.accessCodeBatches.has(batch.id)) {
      throw new Error("access_code_batches.id must be unique");
    }

    for (const code of codes) {
      if (this.accessCodes.has(code.id)) {
        throw new Error("access_codes.id must be unique");
      }
      assertUniqueById(
        this.accessCodes.values(),
        code.id,
        (existing) => existing.codeHash === code.codeHash,
        "access_codes.codeHash",
      );
    }

    this.accessCodeBatches.set(batch.id, batch);
    for (const code of codes) {
      this.accessCodes.set(code.id, code);
    }
  }

  async getAccessCodeBatch(
    batchId: string,
  ): Promise<AccessCodeBatchRecord | undefined> {
    return this.accessCodeBatches.get(batchId);
  }

  async saveAccessCode(code: AccessCodeRecord): Promise<void> {
    assertUniqueById(
      this.accessCodes.values(),
      code.id,
      (existing) => existing.codeHash === code.codeHash,
      "access_codes.codeHash",
    );
    this.accessCodes.set(code.id, code);
  }

  async getAccessCode(
    codeId: string,
  ): Promise<AccessCodeRecord | undefined> {
    return this.accessCodes.get(codeId);
  }

  async listAccessCodes(): Promise<AccessCodeRecord[]> {
    return [...this.accessCodes.values()]
      .filter((code) => code.deletedAt === undefined)
      .sort(sortByCreatedAtDescThenId);
  }

  async listAccessCodesByBatch(batchId: string): Promise<AccessCodeRecord[]> {
    return [...this.accessCodes.values()]
      .filter((code) => code.deletedAt === undefined)
      .filter((code) => code.batchId === batchId);
  }

  async findAccessCodeByHash(
    codeHash: string,
  ): Promise<AccessCodeRecord | undefined> {
    return [...this.accessCodes.values()].find(
      (code) => code.codeHash === codeHash,
    );
  }

  async saveAccessCodeRedemption(
    redemption: AccessCodeRedemptionRecord,
  ): Promise<void> {
    assertUniqueById(
      this.accessCodeRedemptions,
      redemption.id,
      (existing) => existing.accessCodeId === redemption.accessCodeId,
      "access_code_redemptions.accessCodeId",
    );
    appendById(
      this.accessCodeRedemptions,
      redemption,
      "access_code_redemptions.id",
    );
  }

  async redeemAccessCode(
    code: AccessCodeRecord,
    redemption: AccessCodeRedemptionRecord,
  ): Promise<boolean> {
    if (redemption.accessCodeId !== code.id) {
      throw new Error("access_code_redemptions.accessCodeId must match access_codes.id");
    }

    const existing = this.accessCodes.get(code.id);
    if (
      !existing ||
      existing.status !== "active" ||
      existing.redeemedAt !== undefined ||
      existing.disabledAt !== undefined
    ) {
      return false;
    }

    assertUniqueById(
      this.accessCodeRedemptions,
      redemption.id,
      (item) => item.accessCodeId === redemption.accessCodeId,
      "access_code_redemptions.accessCodeId",
    );
    appendById(
      this.accessCodeRedemptions,
      redemption,
      "access_code_redemptions.id",
    );
    this.accessCodes.set(code.id, {
      ...existing,
      status: "redeemed",
      redeemedByUserId: code.redeemedByUserId ?? redemption.userId,
      redeemedAt: code.redeemedAt ?? redemption.redeemedAt,
    });
    return true;
  }

  async redeemAccessCodeWithCreditLedger(
    code: AccessCodeRecord,
    redemption: AccessCodeRedemptionRecord,
    ledgerEntry: CreditLedgerEntryRecord,
  ): Promise<RedeemAccessCodeWithCreditLedgerResult | undefined> {
    if (redemption.accessCodeId !== code.id) {
      throw new Error("access_code_redemptions.accessCodeId must match access_codes.id");
    }
    if (ledgerEntry.accessCodeId !== code.id) {
      throw new Error("credit_ledger.accessCodeId must match access_codes.id");
    }
    if (redemption.creditLedgerId !== ledgerEntry.id) {
      throw new Error("access_code_redemptions.creditLedgerId must match credit_ledger.id");
    }
    if (redemption.userId !== ledgerEntry.userId) {
      throw new Error("access_code_redemptions.userId must match credit_ledger.userId");
    }

    const existing = this.accessCodes.get(code.id);
    if (
      !existing ||
      existing.status !== "active" ||
      existing.redeemedAt !== undefined ||
      existing.disabledAt !== undefined
    ) {
      return undefined;
    }

    assertUniqueById(
      this.accessCodeRedemptions,
      redemption.id,
      (item) => item.accessCodeId === redemption.accessCodeId,
      "access_code_redemptions.accessCodeId",
    );
    this.assertCreditLedgerAppendable(ledgerEntry);
    const account = this.requireExistingCreditAccount(ledgerEntry.userId);
    const updatedAccount = {
      ...account,
      balance: account.balance + existing.credits,
      totalRedeemed: account.totalRedeemed + existing.credits,
      updatedAt: ledgerEntry.createdAt,
    };
    const storedLedger = {
      ...ledgerEntry,
      amount: existing.credits,
      balanceAfter: updatedAccount.balance,
      frozenAfter: updatedAccount.frozenCredits,
    };

    this.accessCodes.set(code.id, {
      ...existing,
      status: "redeemed",
      redeemedByUserId: code.redeemedByUserId ?? redemption.userId,
      redeemedAt: code.redeemedAt ?? redemption.redeemedAt,
    });
    this.creditAccounts.set(updatedAccount.userId, updatedAccount);
    this.creditLedger.push(storedLedger);
    this.accessCodeRedemptions.push(redemption);
    return { account: updatedAccount, ledger: storedLedger, redemption };
  }

  async holdCreditsForTask(input: {
    ledgerEntry: CreditLedgerEntryRecord;
    amount: number;
    taskUpdatedAt: string;
  }): Promise<CreditLedgerTransitionResult | undefined> {
    const { ledgerEntry, amount } = input;
    this.assertCreditLedgerAppendable(ledgerEntry);
    const task = ledgerEntry.taskId
      ? this.commercialTasks.get(ledgerEntry.taskId)
      : undefined;
    const account = this.creditAccounts.get(ledgerEntry.userId);
    if (
      !task ||
      task.userId !== ledgerEntry.userId ||
      task.creditHoldLedgerId !== undefined ||
      !account ||
      account.balance < amount
    ) {
      return undefined;
    }

    const updatedAccount = {
      ...account,
      balance: account.balance - amount,
      frozenCredits: account.frozenCredits + amount,
      updatedAt: ledgerEntry.createdAt,
    };
    const storedLedger = {
      ...ledgerEntry,
      amount: -amount,
      balanceAfter: updatedAccount.balance,
      frozenAfter: updatedAccount.frozenCredits,
    };
    this.creditAccounts.set(updatedAccount.userId, updatedAccount);
    this.creditLedger.push(storedLedger);
    this.commercialTasks.set(task.id, {
      ...task,
      creditHoldLedgerId: storedLedger.id,
      updatedAt: input.taskUpdatedAt,
    });
    return { account: updatedAccount, ledger: storedLedger };
  }

  async captureHeldCredits(input: {
    ledgerEntry: CreditLedgerEntryRecord;
    holdLedgerId: string;
    amount: number;
  }): Promise<CreditLedgerTransitionResult | undefined> {
    const { ledgerEntry, amount } = input;
    this.assertCreditLedgerAppendable(ledgerEntry);
    const hold = this.creditLedger.find((entry) => entry.id === input.holdLedgerId);
    const account = this.creditAccounts.get(ledgerEntry.userId);
    if (
      !this.isMatchingOpenHold(hold, ledgerEntry) ||
      !account ||
      account.frozenCredits < amount
    ) {
      return undefined;
    }

    const updatedAccount = {
      ...account,
      frozenCredits: account.frozenCredits - amount,
      totalCaptured: account.totalCaptured + amount,
      updatedAt: ledgerEntry.createdAt,
    };
    const storedLedger = {
      ...ledgerEntry,
      amount: -amount,
      balanceAfter: updatedAccount.balance,
      frozenAfter: updatedAccount.frozenCredits,
      metadata: linkMetadata(ledgerEntry.metadata, {
        holdLedgerId: input.holdLedgerId,
      }),
    };
    this.creditAccounts.set(updatedAccount.userId, updatedAccount);
    this.creditLedger.push(storedLedger);
    return { account: updatedAccount, ledger: storedLedger };
  }

  async releaseHeldCredits(input: {
    ledgerEntry: CreditLedgerEntryRecord;
    holdLedgerId: string;
    amount: number;
  }): Promise<CreditLedgerTransitionResult | undefined> {
    const { ledgerEntry, amount } = input;
    this.assertCreditLedgerAppendable(ledgerEntry);
    const hold = this.creditLedger.find((entry) => entry.id === input.holdLedgerId);
    const account = this.creditAccounts.get(ledgerEntry.userId);
    if (
      !this.isMatchingOpenHold(hold, ledgerEntry) ||
      !account ||
      account.frozenCredits < amount
    ) {
      return undefined;
    }

    const updatedAccount = {
      ...account,
      balance: account.balance + amount,
      frozenCredits: account.frozenCredits - amount,
      updatedAt: ledgerEntry.createdAt,
    };
    const storedLedger = {
      ...ledgerEntry,
      amount,
      balanceAfter: updatedAccount.balance,
      frozenAfter: updatedAccount.frozenCredits,
      metadata: linkMetadata(ledgerEntry.metadata, {
        holdLedgerId: input.holdLedgerId,
      }),
    };
    this.creditAccounts.set(updatedAccount.userId, updatedAccount);
    this.creditLedger.push(storedLedger);
    return { account: updatedAccount, ledger: storedLedger };
  }

  async refundCapturedCreditsWithAudit(input: {
    ledgerEntry: CreditLedgerEntryRecord;
    captureLedgerId: string;
    amount: number;
    auditLog: AdminAuditLogRecord;
  }): Promise<CreditLedgerTransitionResult | undefined> {
    const { ledgerEntry, amount, auditLog } = input;
    this.assertCreditLedgerAppendable(ledgerEntry);
    if (this.auditLogs.some((log) => log.id === auditLog.id)) {
      throw new Error("admin_audit_logs.id must be unique");
    }
    const capture = this.creditLedger.find((entry) => entry.id === input.captureLedgerId);
    const account = this.creditAccounts.get(ledgerEntry.userId);
    if (
      !capture ||
      capture.entryType !== "capture" ||
      capture.userId !== ledgerEntry.userId ||
      capture.taskId !== ledgerEntry.taskId ||
      this.creditLedger.some(
        (entry) =>
          entry.entryType === "refund" &&
          entry.metadata?.captureLedgerId === input.captureLedgerId,
      ) ||
      !account
    ) {
      return undefined;
    }

    const updatedAccount = {
      ...account,
      balance: account.balance + amount,
      updatedAt: ledgerEntry.createdAt,
    };
    const storedLedger = {
      ...ledgerEntry,
      amount,
      balanceAfter: updatedAccount.balance,
      frozenAfter: updatedAccount.frozenCredits,
      metadata: linkMetadata(ledgerEntry.metadata, {
        captureLedgerId: input.captureLedgerId,
      }),
    };
    this.creditAccounts.set(updatedAccount.userId, updatedAccount);
    this.creditLedger.push(storedLedger);
    this.auditLogs.push(auditLog);
    return { account: updatedAccount, ledger: storedLedger };
  }

  async adjustCreditsWithAudit(input: {
    ledgerEntry: CreditLedgerEntryRecord;
    amount: number;
    auditLog: AdminAuditLogRecord;
  }): Promise<CreditLedgerTransitionResult | undefined> {
    const { ledgerEntry, amount, auditLog } = input;
    this.assertCreditLedgerAppendable(ledgerEntry);
    if (this.auditLogs.some((log) => log.id === auditLog.id)) {
      throw new Error("admin_audit_logs.id must be unique");
    }
    const account = this.creditAccounts.get(ledgerEntry.userId);
    if (!account || account.balance + amount < 0) {
      return undefined;
    }

    const updatedAccount = {
      ...account,
      balance: account.balance + amount,
      updatedAt: ledgerEntry.createdAt,
    };
    const storedLedger = {
      ...ledgerEntry,
      amount,
      balanceAfter: updatedAccount.balance,
      frozenAfter: updatedAccount.frozenCredits,
    };
    this.creditAccounts.set(updatedAccount.userId, updatedAccount);
    this.creditLedger.push(storedLedger);
    this.auditLogs.push(auditLog);
    return { account: updatedAccount, ledger: storedLedger };
  }

  async findAccessCodeRedemptionByCodeId(
    accessCodeId: string,
  ): Promise<AccessCodeRedemptionRecord | undefined> {
    return this.accessCodeRedemptions.find(
      (redemption) => redemption.accessCodeId === accessCodeId,
    );
  }

  async disableAccessCodeWithAudit(
    codeId: string,
    disabledAt: string,
    auditLog: AdminAuditLogRecord,
  ): Promise<AccessCodeRecord | undefined> {
    if (this.auditLogs.some((log) => log.id === auditLog.id)) {
      throw new Error("admin_audit_logs.id must be unique");
    }

    const code = this.accessCodes.get(codeId);
    if (!code) {
      return undefined;
    }

    const updatedCode =
      code.status === "active" &&
      code.redeemedAt === undefined &&
      code.disabledAt === undefined
        ? { ...code, status: "disabled" as const, disabledAt }
        : code;

    if (updatedCode !== code) {
      this.accessCodes.set(codeId, updatedCode);
    }
    appendById(this.auditLogs, auditLog, "admin_audit_logs.id");
    return updatedCode;
  }

  async restoreAccessCodeWithAudit(
    codeId: string,
    _restoredAt: string,
    auditLog: AdminAuditLogRecord,
  ): Promise<AccessCodeRecord | undefined> {
    if (this.auditLogs.some((log) => log.id === auditLog.id)) {
      throw new Error("admin_audit_logs.id must be unique");
    }

    const code = this.accessCodes.get(codeId);
    if (!code || code.deletedAt !== undefined) {
      return undefined;
    }

    const updatedCode =
      code.status === "disabled" &&
      code.redeemedAt === undefined
        ? omitUndefined({
            ...code,
            status: "active" as const,
            disabledAt: undefined,
          })
        : code;

    if (updatedCode !== code) {
      this.accessCodes.set(codeId, updatedCode);
    }
    appendById(this.auditLogs, auditLog, "admin_audit_logs.id");
    return updatedCode;
  }

  async softDeleteAccessCodeWithAudit(
    codeId: string,
    deletedAt: string,
    auditLog: AdminAuditLogRecord,
  ): Promise<AccessCodeRecord | undefined> {
    if (this.auditLogs.some((log) => log.id === auditLog.id)) {
      throw new Error("admin_audit_logs.id must be unique");
    }

    const code = this.accessCodes.get(codeId);
    if (!code) {
      return undefined;
    }

    const updatedCode = {
      ...code,
      deletedAt: code.deletedAt ?? deletedAt,
    };
    this.accessCodes.set(codeId, updatedCode);
    appendById(this.auditLogs, auditLog, "admin_audit_logs.id");
    return updatedCode;
  }

  async disableAccessCodeBatchWithAudit(
    batchId: string,
    disabledAt: string,
    auditLog: AdminAuditLogRecord,
  ): Promise<
    | { batch: AccessCodeBatchRecord; disabledCodeCount: number }
    | undefined
  > {
    if (this.auditLogs.some((log) => log.id === auditLog.id)) {
      throw new Error("admin_audit_logs.id must be unique");
    }

    const batch = this.accessCodeBatches.get(batchId);
    if (!batch) {
      return undefined;
    }

    const disabledBatch = {
      ...batch,
      disabledAt: batch.disabledAt ?? disabledAt,
    };
    const activeCodes = [...this.accessCodes.values()].filter(
      (code) =>
        code.batchId === batchId &&
        code.status === "active" &&
        code.redeemedAt === undefined &&
        code.disabledAt === undefined,
    );
    const disabledCodeCount = activeCodes.length;

    this.accessCodeBatches.set(batchId, disabledBatch);
    for (const code of activeCodes) {
      this.accessCodes.set(code.id, {
        ...code,
        status: "disabled",
        disabledAt,
      });
    }
    appendById(
      this.auditLogs,
      {
        ...auditLog,
        metadata: {
          ...auditLog.metadata,
          disabledCodeCount,
        },
      },
      "admin_audit_logs.id",
    );

    return { batch: disabledBatch, disabledCodeCount };
  }

  async saveCommercialTask(
    task: CommercialSimulationTaskRecord,
  ): Promise<void> {
    if (task.idempotencyKey !== undefined) {
      assertUniqueById(
        this.commercialTasks.values(),
        task.id,
        (existing) => existing.idempotencyKey === task.idempotencyKey,
        "simulation_tasks.idempotencyKey",
      );
    }
    this.commercialTasks.set(task.id, task);
  }

  async getCommercialTask(
    taskId: string,
  ): Promise<CommercialSimulationTaskRecord | undefined> {
    return this.commercialTasks.get(taskId);
  }

  async listCommercialTasks(
    userId?: string,
  ): Promise<CommercialSimulationTaskRecord[]> {
    return [...this.commercialTasks.values()]
      .filter((task) => userId === undefined || task.userId === userId)
      .sort(sortByCreatedAtDescThenId);
  }

  async findCommercialTaskByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<CommercialSimulationTaskRecord | undefined> {
    return [...this.commercialTasks.values()].find(
      (task) => task.idempotencyKey === idempotencyKey,
    );
  }

  async findActiveCommercialTaskByUserId(
    userId: string,
  ): Promise<CommercialSimulationTaskRecord | undefined> {
    return [...this.commercialTasks.values()]
      .filter(
        (task) =>
          task.userId === userId &&
          (
            task.status === "queued" ||
            task.status === "running" ||
            task.status === "recoverable_failed"
          ),
      )
      .sort((left, right) => {
        const leftQueuedAt = left.queuedAt ?? left.createdAt;
        const rightQueuedAt = right.queuedAt ?? right.createdAt;
        if (leftQueuedAt !== rightQueuedAt) {
          return leftQueuedAt.localeCompare(rightQueuedAt);
        }
        return left.createdAt.localeCompare(right.createdAt);
      })[0];
  }

  async appendSimulationTaskRun(run: SimulationTaskRunRecord): Promise<void> {
    appendById(this.taskRuns, run, "simulation_task_runs.id");
  }

  async saveSimulationTaskRun(run: SimulationTaskRunRecord): Promise<void> {
    upsertById(this.taskRuns, run);
  }

  async listSimulationTaskRuns(
    taskId: string,
  ): Promise<SimulationTaskRunRecord[]> {
    return this.taskRuns.filter((run) => run.taskId === taskId);
  }

  async appendSimulationStepRunCost(
    run: SimulationStepRunCostRecord,
  ): Promise<void> {
    appendById(this.stepRunCosts, run, "simulation_step_runs.id");
  }

  async listSimulationStepRunCosts(
    taskId?: string,
  ): Promise<SimulationStepRunCostRecord[]> {
    return this.stepRunCosts
      .filter((run) => taskId === undefined || run.taskId === taskId)
      .sort((left, right) => {
        if (left.startedAt !== right.startedAt) {
          return left.startedAt.localeCompare(right.startedAt);
        }
        return left.id.localeCompare(right.id);
      });
  }

  async saveCommercialCheckpoint(
    checkpoint: CommercialSimulationCheckpointRecord,
  ): Promise<void> {
    upsertById(this.checkpoints, checkpoint);
  }

  async getLatestCommercialCheckpoint(
    taskId: string,
  ): Promise<CommercialSimulationCheckpointRecord | undefined> {
    return this.checkpoints
      .filter((checkpoint) => checkpoint.taskId === taskId)
      .sort((left, right) => {
        if (left.createdAt !== right.createdAt) {
          return left.createdAt.localeCompare(right.createdAt);
        }
        return left.id.localeCompare(right.id);
      })
      .at(-1);
  }

  async saveWorkerHeartbeat(
    heartbeat: WorkerHeartbeatRecord,
  ): Promise<void> {
    if (!Number.isInteger(heartbeat.activeWeight) || heartbeat.activeWeight < 0) {
      throw new Error("worker_heartbeats.activeWeight must be a non-negative integer");
    }
    if (!heartbeat.workerId.trim()) {
      throw new Error("worker_heartbeats.workerId is required");
    }
    this.workerHeartbeats.set(heartbeat.workerId, { ...heartbeat });
  }

  async listWorkerHeartbeats(): Promise<WorkerHeartbeatRecord[]> {
    return [...this.workerHeartbeats.values()].sort((left, right) =>
      left.workerId.localeCompare(right.workerId),
    );
  }

  async saveCommercialReport(
    report: CommercialSimulationReportRecord,
  ): Promise<void> {
    assertUniqueById(
      this.reports.values(),
      report.id,
      (existing) => existing.taskId === report.taskId,
      "simulation_reports.taskId",
    );
    this.reports.set(report.id, report);
  }

  async getCommercialReportByTaskId(
    taskId: string,
  ): Promise<CommercialSimulationReportRecord | undefined> {
    return [...this.reports.values()].find((report) => report.taskId === taskId);
  }

  async listCommercialReports(
    userId?: string,
  ): Promise<CommercialSimulationReportRecord[]> {
    return [...this.reports.values()]
      .filter((report) => userId === undefined || report.userId === userId)
      .sort(sortByCreatedAtDescThenId);
  }

  async appendAnalyticsEvent(event: AnalyticsEventRecord): Promise<void> {
    appendById(this.analyticsEvents, event, "analytics_events.id");
  }

  async listAnalyticsEvents(): Promise<AnalyticsEventRecord[]> {
    return [...this.analyticsEvents];
  }

  async appendUserFeedback(feedback: UserFeedbackRecord): Promise<void> {
    appendById(this.feedback, feedback, "user_feedback.id");
  }

  async listUserFeedback(userId?: string): Promise<UserFeedbackRecord[]> {
    return userId === undefined
      ? [...this.feedback]
      : this.feedback.filter((item) => item.userId === userId);
  }

  async saveUserModelProvider(
    provider: UserModelProviderRecord,
  ): Promise<void> {
    assertUniqueById(
      this.modelProviders.values(),
      provider.id,
      (existing) =>
        existing.userId === provider.userId &&
        existing.provider === provider.provider,
      "user_model_providers.userId_provider",
    );
    this.modelProviders.set(provider.id, provider);
  }

  async listUserModelProviders(
    userId: string,
  ): Promise<UserModelProviderRecord[]> {
    return [...this.modelProviders.values()].filter(
      (provider) => provider.userId === userId,
    );
  }

  async savePlatformModelProvider(
    provider: PlatformModelProviderRecord,
  ): Promise<void> {
    assertUniqueById(
      this.platformModelProviders.values(),
      provider.id,
      (existing) => existing.displayName === provider.displayName,
      "platform_model_providers.displayName",
    );
    this.platformModelProviders.set(provider.id, provider);
  }

  async getPlatformModelProvider(
    providerId: string,
  ): Promise<PlatformModelProviderRecord | undefined> {
    return this.platformModelProviders.get(providerId);
  }

  async listPlatformModelProviders(): Promise<PlatformModelProviderRecord[]> {
    return [...this.platformModelProviders.values()].sort(sortByCreatedAtDescThenId);
  }

  async savePlatformModelProfile(
    profile: PlatformModelProfileRecord,
  ): Promise<void> {
    this.platformModelProfiles.set(profile.id, profile);
  }

  async getPlatformModelProfile(
    profileId: string,
  ): Promise<PlatformModelProfileRecord | undefined> {
    return this.platformModelProfiles.get(profileId);
  }

  async listPlatformModelProfiles(): Promise<PlatformModelProfileRecord[]> {
    return [...this.platformModelProfiles.values()].sort(sortByCreatedAtDescThenId);
  }

  async saveSystemSetting(setting: SystemSettingRecord): Promise<void> {
    this.systemSettings.set(setting.key, setting);
  }

  async getSystemSetting(
    key: string,
  ): Promise<SystemSettingRecord | undefined> {
    return this.systemSettings.get(key);
  }

  async appendAdminAuditLog(log: AdminAuditLogRecord): Promise<void> {
    assertAdminAuditAction(log.action);
    appendById(this.auditLogs, log, "admin_audit_logs.id");
  }

  async listAdminAuditLogs(): Promise<AdminAuditLogRecord[]> {
    return [...this.auditLogs];
  }

  private requireExistingCreditAccount(userId: string): UserCreditAccountRecord {
    const account = this.creditAccounts.get(userId);
    if (!account) {
      throw new Error("user_credit_accounts.userId must exist");
    }
    return account;
  }

  private isMatchingOpenHold(
    hold: CreditLedgerEntryRecord | undefined,
    entry: CreditLedgerEntryRecord,
  ): boolean {
    return (
      hold !== undefined &&
      hold.entryType === "hold" &&
      hold.userId === entry.userId &&
      hold.taskId === entry.taskId &&
      !this.creditLedger.some(
        (existing) =>
          (existing.entryType === "capture" || existing.entryType === "release") &&
          existing.metadata?.holdLedgerId === hold.id,
      )
    );
  }

  private assertCreditLedgerAppendable(entry: CreditLedgerEntryRecord): void {
    assertUniqueById(
      this.creditLedger,
      entry.id,
      (existing) => existing.idempotencyKey === entry.idempotencyKey,
      "credit_ledger.idempotencyKey",
    );
    if (this.creditLedger.some((existing) => existing.id === entry.id)) {
      throw new Error("credit_ledger.id must be unique");
    }
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateAccessCodeBatchCodes(
  batch: AccessCodeBatchRecord,
  codes: AccessCodeRecord[],
): void {
  if (batch.codeCount !== codes.length) {
    throw new Error("access_code_batches.codeCount must match access_codes");
  }

  const incomingCodeIds = new Set<string>();
  const incomingCodeHashes = new Set<string>();
  for (const code of codes) {
    if (code.batchId !== batch.id) {
      throw new Error("access_codes.batchId must match access_code_batches.id");
    }
    if (incomingCodeIds.has(code.id)) {
      throw new Error("access_codes.id must be unique");
    }
    if (incomingCodeHashes.has(code.codeHash)) {
      throw new Error("access_codes.codeHash must be unique");
    }
    incomingCodeIds.add(code.id);
    incomingCodeHashes.add(code.codeHash);
  }
}

function upsertById<T extends { id: string }>(items: T[], item: T): void {
  const index = items.findIndex((existing) => existing.id === item.id);
  if (index === -1) {
    items.push(item);
    return;
  }

  items[index] = item;
}

function appendById<T extends { id: string }>(
  items: T[],
  item: T,
  constraintName: string,
): void {
  if (items.some((existing) => existing.id === item.id)) {
    throw new Error(`${constraintName} must be unique`);
  }

  items.push(item);
}

function sortByCreatedAtDescThenId<T extends { id: string; createdAt: string }>(
  left: T,
  right: T,
): number {
  if (left.createdAt !== right.createdAt) {
    return right.createdAt.localeCompare(left.createdAt);
  }
  return left.id.localeCompare(right.id);
}

function linkMetadata(
  metadata: CreditLedgerEntryRecord["metadata"],
  linkage: JsonObject,
): JsonObject {
  return {
    ...(metadata ?? {}),
    ...linkage,
  };
}

function omitUndefined<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T;
}

function assertAdminAuditAction(action: string): asserts action is AdminAuditAction {
  if (!ADMIN_AUDIT_ACTIONS.includes(action as AdminAuditAction)) {
    throw new Error("admin_audit_logs.action must be known");
  }
}

function assertUniqueById<T extends { id: string }>(
  items: Iterable<T>,
  recordId: string,
  isUniqueMatch: (item: T) => boolean,
  constraintName: string,
): void {
  for (const item of items) {
    if (item.id !== recordId && isUniqueMatch(item)) {
      throw new Error(`${constraintName} must be unique`);
    }
  }
}
