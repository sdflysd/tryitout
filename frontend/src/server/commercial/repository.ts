import type {
  AccessCodeRecord,
  AccessCodeRedemptionRecord,
  AdminAuditLogRecord,
  AnalyticsEventRecord,
  CommercialSessionRecord,
  CommercialSimulationTaskRecord,
  CommercialUserRecord,
  CreditLedgerEntryRecord,
  SimulationReportRecord,
  SystemSettingRecord,
  UserCreditAccountRecord,
  UserFeedbackRecord,
} from "./types.js";

export interface CommercialRepository {
  runInTransaction<T>(callback: (repository: CommercialRepository) => Promise<T>): Promise<T>;

  saveUser(user: CommercialUserRecord): Promise<void>;
  getUser(userId: string): Promise<CommercialUserRecord | undefined>;
  findUserByEmail(email: string): Promise<CommercialUserRecord | undefined>;

  saveSession(session: CommercialSessionRecord): Promise<void>;
  findSessionByTokenHash(tokenHash: string): Promise<CommercialSessionRecord | undefined>;
  revokeSession(sessionId: string, revokedAt: Date): Promise<void>;

  saveCreditAccount(account: UserCreditAccountRecord): Promise<void>;
  getCreditAccount(userId: string): Promise<UserCreditAccountRecord | undefined>;
  appendLedgerEntry(entry: CreditLedgerEntryRecord): Promise<void>;
  findLedgerEntryByIdempotencyKey(idempotencyKey: string): Promise<CreditLedgerEntryRecord | undefined>;
  getLedgerEntry(entryId: string): Promise<CreditLedgerEntryRecord | undefined>;
  listLedgerEntriesForUser(userId: string): Promise<CreditLedgerEntryRecord[]>;

  saveAccessCode(accessCode: AccessCodeRecord): Promise<void>;
  findAccessCodeByHash(codeHash: string): Promise<AccessCodeRecord | undefined>;
  getAccessCode(accessCodeId: string): Promise<AccessCodeRecord | undefined>;
  saveAccessCodeRedemption(redemption: AccessCodeRedemptionRecord): Promise<void>;
  findAccessCodeRedemption(accessCodeId: string): Promise<AccessCodeRedemptionRecord | undefined>;

  saveCommercialTask(task: CommercialSimulationTaskRecord): Promise<void>;
  getCommercialTask(taskId: string): Promise<CommercialSimulationTaskRecord | undefined>;
  listActiveCommercialTasksForUser(userId: string): Promise<CommercialSimulationTaskRecord[]>;

  saveSimulationReport(report: SimulationReportRecord): Promise<void>;
  getSimulationReport(reportId: string): Promise<SimulationReportRecord | undefined>;
  getSimulationReportForTask(taskId: string): Promise<SimulationReportRecord | undefined>;

  appendUserFeedback(feedback: UserFeedbackRecord): Promise<void>;
  appendAnalyticsEvent(event: AnalyticsEventRecord): Promise<void>;

  appendAdminAuditLog(entry: AdminAuditLogRecord): Promise<void>;
  listAdminAuditLogs(): Promise<AdminAuditLogRecord[]>;

  saveSystemSetting(setting: SystemSettingRecord): Promise<void>;
  getSystemSetting(key: string): Promise<SystemSettingRecord | undefined>;
}

export class InMemoryCommercialRepository implements CommercialRepository {
  private users = new Map<string, CommercialUserRecord>();
  private sessions = new Map<string, CommercialSessionRecord>();
  private creditAccounts = new Map<string, UserCreditAccountRecord>();
  private ledgerEntries = new Map<string, CreditLedgerEntryRecord>();
  private accessCodes = new Map<string, AccessCodeRecord>();
  private accessCodeRedemptions = new Map<string, AccessCodeRedemptionRecord>();
  private tasks = new Map<string, CommercialSimulationTaskRecord>();
  private reports = new Map<string, SimulationReportRecord>();
  private feedback: UserFeedbackRecord[] = [];
  private analyticsEvents: AnalyticsEventRecord[] = [];
  private auditLogs: AdminAuditLogRecord[] = [];
  private systemSettings = new Map<string, SystemSettingRecord>();

  async runInTransaction<T>(callback: (repository: CommercialRepository) => Promise<T>): Promise<T> {
    return callback(this);
  }

  async saveUser(user: CommercialUserRecord): Promise<void> {
    this.users.set(user.id, { ...user });
  }

  async getUser(userId: string): Promise<CommercialUserRecord | undefined> {
    return cloneRecord(this.users.get(userId));
  }

  async findUserByEmail(email: string): Promise<CommercialUserRecord | undefined> {
    const normalizedEmail = normalizeEmail(email);
    for (const user of this.users.values()) {
      if (normalizeEmail(user.email) === normalizedEmail) {
        return cloneRecord(user);
      }
    }
    return undefined;
  }

  async saveSession(session: CommercialSessionRecord): Promise<void> {
    this.sessions.set(session.id, { ...session });
  }

  async findSessionByTokenHash(tokenHash: string): Promise<CommercialSessionRecord | undefined> {
    for (const session of this.sessions.values()) {
      if (session.tokenHash === tokenHash) {
        return cloneRecord(session);
      }
    }
    return undefined;
  }

  async revokeSession(sessionId: string, revokedAt: Date): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    this.sessions.set(sessionId, { ...session, revokedAt });
  }

  async saveCreditAccount(account: UserCreditAccountRecord): Promise<void> {
    this.creditAccounts.set(account.userId, { ...account });
  }

  async getCreditAccount(userId: string): Promise<UserCreditAccountRecord | undefined> {
    return cloneRecord(this.creditAccounts.get(userId));
  }

  async appendLedgerEntry(entry: CreditLedgerEntryRecord): Promise<void> {
    this.ledgerEntries.set(entry.id, cloneRecord(entry));
  }

  async findLedgerEntryByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<CreditLedgerEntryRecord | undefined> {
    for (const entry of this.ledgerEntries.values()) {
      if (entry.idempotencyKey === idempotencyKey) {
        return cloneRecord(entry);
      }
    }
    return undefined;
  }

  async getLedgerEntry(entryId: string): Promise<CreditLedgerEntryRecord | undefined> {
    return cloneRecord(this.ledgerEntries.get(entryId));
  }

  async listLedgerEntriesForUser(userId: string): Promise<CreditLedgerEntryRecord[]> {
    return [...this.ledgerEntries.values()]
      .filter((entry) => entry.userId === userId)
      .map((entry) => cloneRecord(entry));
  }

  async saveAccessCode(accessCode: AccessCodeRecord): Promise<void> {
    this.accessCodes.set(accessCode.id, cloneRecord(accessCode));
  }

  async findAccessCodeByHash(codeHash: string): Promise<AccessCodeRecord | undefined> {
    for (const accessCode of this.accessCodes.values()) {
      if (accessCode.codeHash === codeHash) {
        return cloneRecord(accessCode);
      }
    }
    return undefined;
  }

  async getAccessCode(accessCodeId: string): Promise<AccessCodeRecord | undefined> {
    return cloneRecord(this.accessCodes.get(accessCodeId));
  }

  async saveAccessCodeRedemption(redemption: AccessCodeRedemptionRecord): Promise<void> {
    this.accessCodeRedemptions.set(redemption.accessCodeId, cloneRecord(redemption));
  }

  async findAccessCodeRedemption(
    accessCodeId: string,
  ): Promise<AccessCodeRedemptionRecord | undefined> {
    return cloneRecord(this.accessCodeRedemptions.get(accessCodeId));
  }

  async saveCommercialTask(task: CommercialSimulationTaskRecord): Promise<void> {
    this.tasks.set(task.id, cloneRecord(task));
  }

  async getCommercialTask(taskId: string): Promise<CommercialSimulationTaskRecord | undefined> {
    return cloneRecord(this.tasks.get(taskId));
  }

  async listActiveCommercialTasksForUser(userId: string): Promise<CommercialSimulationTaskRecord[]> {
    return [...this.tasks.values()]
      .filter((task) => task.userId === userId && ["queued", "running"].includes(task.status))
      .map((task) => cloneRecord(task));
  }

  async listCommercialTasksForUserForTest(userId: string): Promise<CommercialSimulationTaskRecord[]> {
    return [...this.tasks.values()]
      .filter((task) => task.userId === userId)
      .map((task) => cloneRecord(task));
  }

  async saveSimulationReport(report: SimulationReportRecord): Promise<void> {
    this.reports.set(report.id, cloneRecord(report));
  }

  async getSimulationReport(reportId: string): Promise<SimulationReportRecord | undefined> {
    return cloneRecord(this.reports.get(reportId));
  }

  async getSimulationReportForTask(taskId: string): Promise<SimulationReportRecord | undefined> {
    for (const report of this.reports.values()) {
      if (report.taskId === taskId) {
        return cloneRecord(report);
      }
    }
    return undefined;
  }

  async appendUserFeedback(feedback: UserFeedbackRecord): Promise<void> {
    this.feedback.push(cloneRecord(feedback));
  }

  async appendAnalyticsEvent(event: AnalyticsEventRecord): Promise<void> {
    this.analyticsEvents.push(cloneRecord(event));
  }

  async listAnalyticsEventsForTest(): Promise<AnalyticsEventRecord[]> {
    return this.analyticsEvents.map((event) => cloneRecord(event));
  }

  async appendAdminAuditLog(entry: AdminAuditLogRecord): Promise<void> {
    this.auditLogs.push(cloneRecord(entry));
  }

  async listAdminAuditLogs(): Promise<AdminAuditLogRecord[]> {
    return this.auditLogs.map((entry) => cloneRecord(entry));
  }

  async saveSystemSetting(setting: SystemSettingRecord): Promise<void> {
    this.systemSettings.set(setting.key, cloneRecord(setting));
  }

  async getSystemSetting(key: string): Promise<SystemSettingRecord | undefined> {
    return cloneRecord(this.systemSettings.get(key));
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function cloneRecord<T>(record: T): T {
  if (record === undefined || record === null) {
    return record;
  }
  return { ...(record as object) } as T;
}
