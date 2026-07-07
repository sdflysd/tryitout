import type {
  AccessCodeBatchRecord,
  AccessCodeRecord,
  AccessCodeRedemptionRecord,
  AdminAuditLogRecord,
  AnalyticsEventRecord,
  CommercialSessionRecord,
  CommercialSimulationReportRecord,
  CommercialSimulationTaskRecord,
  CommercialUserRecord,
  CreditLedgerEntryRecord,
  SimulationStepRunCostRecord,
  SimulationTaskRunRecord,
  SystemSettingRecord,
  UserCreditAccountRecord,
  UserFeedbackRecord,
  UserModelProviderRecord,
} from "./types.js";

export interface CommercialRepository {
  saveUser(user: CommercialUserRecord): Promise<void>;
  getUser(userId: string): Promise<CommercialUserRecord | undefined>;
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
  appendCreditLedgerEntry(entry: CreditLedgerEntryRecord): Promise<void>;
  findCreditLedgerEntryByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<CreditLedgerEntryRecord | undefined>;

  saveAccessCodeBatch(batch: AccessCodeBatchRecord): Promise<void>;
  getAccessCodeBatch(
    batchId: string,
  ): Promise<AccessCodeBatchRecord | undefined>;
  saveAccessCode(code: AccessCodeRecord): Promise<void>;
  getAccessCode(codeId: string): Promise<AccessCodeRecord | undefined>;
  listAccessCodesByBatch(batchId: string): Promise<AccessCodeRecord[]>;
  findAccessCodeByHash(codeHash: string): Promise<AccessCodeRecord | undefined>;
  saveAccessCodeRedemption(
    redemption: AccessCodeRedemptionRecord,
  ): Promise<void>;
  findAccessCodeRedemptionByCodeId(
    accessCodeId: string,
  ): Promise<AccessCodeRedemptionRecord | undefined>;

  saveCommercialTask(task: CommercialSimulationTaskRecord): Promise<void>;
  getCommercialTask(
    taskId: string,
  ): Promise<CommercialSimulationTaskRecord | undefined>;
  appendSimulationTaskRun(run: SimulationTaskRunRecord): Promise<void>;
  listSimulationTaskRuns(taskId: string): Promise<SimulationTaskRunRecord[]>;
  appendSimulationStepRunCost(run: SimulationStepRunCostRecord): Promise<void>;
  listSimulationStepRunCosts(
    taskId: string,
  ): Promise<SimulationStepRunCostRecord[]>;
  saveCommercialReport(report: CommercialSimulationReportRecord): Promise<void>;
  getCommercialReportByTaskId(
    taskId: string,
  ): Promise<CommercialSimulationReportRecord | undefined>;

  appendAnalyticsEvent(event: AnalyticsEventRecord): Promise<void>;
  listAnalyticsEvents(): Promise<AnalyticsEventRecord[]>;
  appendUserFeedback(feedback: UserFeedbackRecord): Promise<void>;
  listUserFeedback(userId?: string): Promise<UserFeedbackRecord[]>;
  saveUserModelProvider(provider: UserModelProviderRecord): Promise<void>;
  listUserModelProviders(userId: string): Promise<UserModelProviderRecord[]>;
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
  private readonly reports = new Map<string, CommercialSimulationReportRecord>();
  private readonly analyticsEvents: AnalyticsEventRecord[] = [];
  private readonly feedback: UserFeedbackRecord[] = [];
  private readonly modelProviders = new Map<string, UserModelProviderRecord>();
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

  async findCreditLedgerEntryByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<CreditLedgerEntryRecord | undefined> {
    return this.creditLedger.find(
      (entry) => entry.idempotencyKey === idempotencyKey,
    );
  }

  async saveAccessCodeBatch(batch: AccessCodeBatchRecord): Promise<void> {
    this.accessCodeBatches.set(batch.id, batch);
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

  async listAccessCodesByBatch(batchId: string): Promise<AccessCodeRecord[]> {
    return [...this.accessCodes.values()].filter(
      (code) => code.batchId === batchId,
    );
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

  async findAccessCodeRedemptionByCodeId(
    accessCodeId: string,
  ): Promise<AccessCodeRedemptionRecord | undefined> {
    return this.accessCodeRedemptions.find(
      (redemption) => redemption.accessCodeId === accessCodeId,
    );
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

  async appendSimulationTaskRun(run: SimulationTaskRunRecord): Promise<void> {
    appendById(this.taskRuns, run, "simulation_task_runs.id");
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
    taskId: string,
  ): Promise<SimulationStepRunCostRecord[]> {
    return this.stepRunCosts.filter((run) => run.taskId === taskId);
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

  async saveSystemSetting(setting: SystemSettingRecord): Promise<void> {
    this.systemSettings.set(setting.key, setting);
  }

  async getSystemSetting(
    key: string,
  ): Promise<SystemSettingRecord | undefined> {
    return this.systemSettings.get(key);
  }

  async appendAdminAuditLog(log: AdminAuditLogRecord): Promise<void> {
    appendById(this.auditLogs, log, "admin_audit_logs.id");
  }

  async listAdminAuditLogs(): Promise<AdminAuditLogRecord[]> {
    return [...this.auditLogs];
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
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
