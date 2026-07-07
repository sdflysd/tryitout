import type { CommercialRepository } from "./repository.js";
import type {
  AccessCodeRecord,
  AccessCodeRedemptionRecord,
  AdminAuditLogRecord,
  AnalyticsEventRecord,
  CommercialSessionRecord,
  CommercialSimulationTaskRecord,
  CommercialUserRecord,
  CreditLedgerEntryRecord,
  JsonObject,
  SimulationReportRecord,
  SystemSettingRecord,
  UserCreditAccountRecord,
  UserFeedbackRecord,
  UserModelProviderRecord,
} from "./types.js";

export interface QueryClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  tier: CommercialUserRecord["tier"];
  features: CommercialUserRecord["features"];
  is_admin: boolean;
  disabled_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date | string;
  revoked_at: Date | string | null;
  created_at: Date | string;
}

interface CreditAccountRow {
  user_id: string;
  balance: number;
  created_at: Date | string;
  updated_at: Date | string;
}

interface LedgerRow {
  id: string;
  user_id: string;
  type: CreditLedgerEntryRecord["type"];
  amount: number;
  balance_after: number;
  idempotency_key: string;
  reference_type: string | null;
  reference_id: string | null;
  metadata: JsonObject;
  created_at: Date | string;
}

interface AccessCodeRow {
  id: string;
  code_hash: string;
  masked_code: string;
  status: AccessCodeRecord["status"];
  credit_amount: number;
  tier: AccessCodeRecord["tier"];
  features: AccessCodeRecord["features"];
  expires_at: Date | string | null;
  redeemed_by_user_id: string | null;
  redeemed_at: Date | string | null;
  disabled_at: Date | string | null;
  created_by_admin_user_id: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface AccessCodeRedemptionRow {
  id: string;
  access_code_id: string;
  user_id: string;
  ledger_entry_id: string;
  redeemed_at: Date | string;
}

interface CommercialTaskRow {
  id: string;
  user_id: string;
  status: CommercialSimulationTaskRecord["status"];
  scenario: CommercialSimulationTaskRecord["scenario"];
  user_input: string;
  interaction_mode: CommercialSimulationTaskRecord["interactionMode"];
  provider_mode: CommercialSimulationTaskRecord["providerMode"];
  credit_cost: number;
  credit_hold_ledger_entry_id: string | null;
  credit_captured_ledger_entry_id: string | null;
  credit_released_ledger_entry_id: string | null;
  queue_job_id: string | null;
  report_id: string | null;
  error_code: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface SimulationReportRow {
  id: string;
  task_id: string;
  user_id: string;
  report: SimulationReportRecord["report"];
  created_at: Date | string;
}

interface UserModelProviderRow {
  id: string;
  user_id: string;
  provider_type: UserModelProviderRecord["provider"];
  base_url: string;
  encrypted_api_key: string;
  model_name: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface UserFeedbackRow {
  id: string;
  user_id: string;
  task_id: string;
  report_id: string;
  rating: number;
  useful: boolean;
  text: string | null;
  created_at: Date | string;
}

interface AuditLogRow {
  id: string;
  admin_user_id: string;
  action: string;
  target_type: string;
  target_id: string;
  metadata: JsonObject;
  created_at: Date | string;
}

interface SystemSettingRow {
  key: string;
  value: JsonObject;
  updated_by_admin_user_id: string;
  updated_at: Date | string;
}

export class PostgresCommercialRepository implements CommercialRepository {
  constructor(private readonly client: QueryClient) {}

  async runInTransaction<T>(callback: (repository: CommercialRepository) => Promise<T>): Promise<T> {
    await this.client.query("BEGIN");
    try {
      const result = await callback(this);
      await this.client.query("COMMIT");
      return result;
    } catch (error) {
      await this.client.query("ROLLBACK");
      throw error;
    }
  }

  async saveUser(user: CommercialUserRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO users (
        id, email, password_hash, tier, features, is_admin, disabled_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        password_hash = EXCLUDED.password_hash,
        tier = EXCLUDED.tier,
        features = EXCLUDED.features,
        is_admin = EXCLUDED.is_admin,
        disabled_at = EXCLUDED.disabled_at,
        updated_at = EXCLUDED.updated_at`,
      [
        user.id,
        user.email,
        user.passwordHash,
        user.tier,
        JSON.stringify(user.features),
        user.isAdmin,
        user.disabledAt ?? null,
        user.createdAt,
        user.updatedAt,
      ],
    );
  }

  async getUser(userId: string): Promise<CommercialUserRecord | undefined> {
    const result = await this.client.query<UserRow>("SELECT * FROM users WHERE id = $1", [userId]);
    return mapUser(result.rows[0]);
  }

  async findUserByEmail(email: string): Promise<CommercialUserRecord | undefined> {
    const result = await this.client.query<UserRow>("SELECT * FROM users WHERE lower(email) = $1", [
      normalizeEmail(email),
    ]);
    return mapUser(result.rows[0]);
  }

  async listUsers(): Promise<CommercialUserRecord[]> {
    const result = await this.client.query<UserRow>("SELECT * FROM users ORDER BY created_at DESC");
    return result.rows.map((row) => mapUser(row)).filter(isPresent);
  }

  async saveSession(session: CommercialSessionRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO user_sessions (
        id, user_id, token_hash, expires_at, revoked_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        token_hash = EXCLUDED.token_hash,
        expires_at = EXCLUDED.expires_at,
        revoked_at = EXCLUDED.revoked_at`,
      [
        session.id,
        session.userId,
        session.tokenHash,
        session.expiresAt,
        session.revokedAt ?? null,
        session.createdAt,
      ],
    );
  }

  async findSessionByTokenHash(tokenHash: string): Promise<CommercialSessionRecord | undefined> {
    const result = await this.client.query<SessionRow>("SELECT * FROM user_sessions WHERE token_hash = $1", [
      tokenHash,
    ]);
    return mapSession(result.rows[0]);
  }

  async revokeSession(sessionId: string, revokedAt: Date): Promise<void> {
    await this.client.query("UPDATE user_sessions SET revoked_at = $2 WHERE id = $1", [
      sessionId,
      revokedAt,
    ]);
  }

  async saveCreditAccount(account: UserCreditAccountRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO user_credit_accounts (user_id, balance, created_at, updated_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id) DO UPDATE SET
        balance = EXCLUDED.balance,
        updated_at = EXCLUDED.updated_at`,
      [account.userId, account.balance, account.createdAt, account.updatedAt],
    );
  }

  async getCreditAccount(userId: string): Promise<UserCreditAccountRecord | undefined> {
    const result = await this.client.query<CreditAccountRow>(
      "SELECT * FROM user_credit_accounts WHERE user_id = $1",
      [userId],
    );
    return mapCreditAccount(result.rows[0]);
  }

  async appendLedgerEntry(entry: CreditLedgerEntryRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO credit_ledger (
        id, user_id, type, amount, balance_after, idempotency_key,
        reference_type, reference_id, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        entry.id,
        entry.userId,
        entry.type,
        entry.amount,
        entry.balanceAfter,
        entry.idempotencyKey,
        entry.referenceType ?? null,
        entry.referenceId ?? null,
        entry.metadata,
        entry.createdAt,
      ],
    );
  }

  async findLedgerEntryByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<CreditLedgerEntryRecord | undefined> {
    const result = await this.client.query<LedgerRow>(
      "SELECT * FROM credit_ledger WHERE idempotency_key = $1",
      [idempotencyKey],
    );
    return mapLedgerEntry(result.rows[0]);
  }

  async getLedgerEntry(entryId: string): Promise<CreditLedgerEntryRecord | undefined> {
    const result = await this.client.query<LedgerRow>("SELECT * FROM credit_ledger WHERE id = $1", [
      entryId,
    ]);
    return mapLedgerEntry(result.rows[0]);
  }

  async listLedgerEntriesForUser(userId: string): Promise<CreditLedgerEntryRecord[]> {
    const result = await this.client.query<LedgerRow>(
      "SELECT * FROM credit_ledger WHERE user_id = $1 ORDER BY created_at ASC",
      [userId],
    );
    return result.rows.map((row) => mapLedgerEntry(row)).filter(isPresent);
  }

  async saveAccessCode(accessCode: AccessCodeRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO access_codes (
        id, code_hash, masked_code, status, credit_amount, tier, features, expires_at,
        redeemed_by_user_id, redeemed_at, disabled_at, created_by_admin_user_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        redeemed_by_user_id = EXCLUDED.redeemed_by_user_id,
        redeemed_at = EXCLUDED.redeemed_at,
        disabled_at = EXCLUDED.disabled_at,
        updated_at = EXCLUDED.updated_at`,
      [
        accessCode.id,
        accessCode.codeHash,
        accessCode.maskedCode,
        accessCode.status,
        accessCode.creditAmount,
        accessCode.tier,
        JSON.stringify(accessCode.features),
        accessCode.expiresAt ?? null,
        accessCode.redeemedByUserId ?? null,
        accessCode.redeemedAt ?? null,
        accessCode.disabledAt ?? null,
        accessCode.createdByAdminUserId,
        accessCode.createdAt,
        accessCode.updatedAt,
      ],
    );
  }

  async findAccessCodeByHash(codeHash: string): Promise<AccessCodeRecord | undefined> {
    const result = await this.client.query<AccessCodeRow>("SELECT * FROM access_codes WHERE code_hash = $1", [
      codeHash,
    ]);
    return mapAccessCode(result.rows[0]);
  }

  async getAccessCode(accessCodeId: string): Promise<AccessCodeRecord | undefined> {
    const result = await this.client.query<AccessCodeRow>("SELECT * FROM access_codes WHERE id = $1", [
      accessCodeId,
    ]);
    return mapAccessCode(result.rows[0]);
  }

  async listAccessCodes(): Promise<AccessCodeRecord[]> {
    const result = await this.client.query<AccessCodeRow>("SELECT * FROM access_codes ORDER BY created_at DESC");
    return result.rows.map((row) => mapAccessCode(row)).filter(isPresent);
  }

  async saveAccessCodeRedemption(redemption: AccessCodeRedemptionRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO access_code_redemptions (
        id, access_code_id, user_id, ledger_entry_id, redeemed_at
      ) VALUES ($1, $2, $3, $4, $5)`,
      [
        redemption.id,
        redemption.accessCodeId,
        redemption.userId,
        redemption.ledgerEntryId,
        redemption.redeemedAt,
      ],
    );
  }

  async findAccessCodeRedemption(
    accessCodeId: string,
  ): Promise<AccessCodeRedemptionRecord | undefined> {
    const result = await this.client.query<AccessCodeRedemptionRow>(
      "SELECT * FROM access_code_redemptions WHERE access_code_id = $1",
      [accessCodeId],
    );
    return mapAccessCodeRedemption(result.rows[0]);
  }

  async saveCommercialTask(task: CommercialSimulationTaskRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO simulation_tasks (
        id, user_id, status, scenario, user_input, interaction_mode, provider_mode,
        credit_cost, created_at, updated_at, credit_hold_ledger_entry_id,
        credit_captured_ledger_entry_id, credit_released_ledger_entry_id,
        queue_job_id, report_id, error_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        credit_hold_ledger_entry_id = EXCLUDED.credit_hold_ledger_entry_id,
        credit_captured_ledger_entry_id = EXCLUDED.credit_captured_ledger_entry_id,
        credit_released_ledger_entry_id = EXCLUDED.credit_released_ledger_entry_id,
        queue_job_id = EXCLUDED.queue_job_id,
        report_id = EXCLUDED.report_id,
        error_code = EXCLUDED.error_code,
        updated_at = EXCLUDED.updated_at`,
      [
        task.id,
        task.userId,
        task.status,
        task.scenario,
        task.userInput,
        task.interactionMode,
        task.providerMode,
        task.creditCost,
        task.createdAt,
        task.updatedAt,
        task.creditHoldLedgerEntryId ?? null,
        task.creditCapturedLedgerEntryId ?? null,
        task.creditReleasedLedgerEntryId ?? null,
        task.queueJobId ?? null,
        task.reportId ?? null,
        task.errorCode ?? null,
      ],
    );
  }

  async getCommercialTask(taskId: string): Promise<CommercialSimulationTaskRecord | undefined> {
    const result = await this.client.query<CommercialTaskRow>("SELECT * FROM simulation_tasks WHERE id = $1", [
      taskId,
    ]);
    return mapCommercialTask(result.rows[0]);
  }

  async listActiveCommercialTasksForUser(userId: string): Promise<CommercialSimulationTaskRecord[]> {
    const result = await this.client.query<CommercialTaskRow>(
      "SELECT * FROM simulation_tasks WHERE user_id = $1 AND status IN ('queued', 'running')",
      [userId],
    );
    return result.rows.map((row) => mapCommercialTask(row)).filter(isPresent);
  }

  async listCommercialTasks(): Promise<CommercialSimulationTaskRecord[]> {
    const result = await this.client.query<CommercialTaskRow>(
      "SELECT * FROM simulation_tasks ORDER BY created_at DESC",
    );
    return result.rows.map((row) => mapCommercialTask(row)).filter(isPresent);
  }

  async saveSimulationReport(report: SimulationReportRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO simulation_reports (id, task_id, user_id, report, created_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET report = EXCLUDED.report`,
      [report.id, report.taskId, report.userId, report.report, report.createdAt],
    );
  }

  async getSimulationReport(reportId: string): Promise<SimulationReportRecord | undefined> {
    const result = await this.client.query<SimulationReportRow>(
      "SELECT * FROM simulation_reports WHERE id = $1",
      [reportId],
    );
    return mapSimulationReport(result.rows[0]);
  }

  async getSimulationReportForTask(taskId: string): Promise<SimulationReportRecord | undefined> {
    const result = await this.client.query<SimulationReportRow>(
      "SELECT * FROM simulation_reports WHERE task_id = $1",
      [taskId],
    );
    return mapSimulationReport(result.rows[0]);
  }

  async saveUserModelProvider(provider: UserModelProviderRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO user_model_providers (
        id, user_id, provider_type, base_url, encrypted_api_key, model_name, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (user_id) DO UPDATE SET
        provider_type = EXCLUDED.provider_type,
        base_url = EXCLUDED.base_url,
        encrypted_api_key = EXCLUDED.encrypted_api_key,
        model_name = EXCLUDED.model_name,
        updated_at = EXCLUDED.updated_at`,
      [
        provider.id,
        provider.userId,
        provider.provider,
        provider.baseUrl,
        provider.encryptedApiKey,
        provider.model,
        provider.createdAt,
        provider.updatedAt,
      ],
    );
  }

  async getUserModelProvider(userId: string): Promise<UserModelProviderRecord | undefined> {
    const result = await this.client.query<UserModelProviderRow>(
      "SELECT * FROM user_model_providers WHERE user_id = $1",
      [userId],
    );
    return mapUserModelProvider(result.rows[0]);
  }

  async deleteUserModelProvider(userId: string): Promise<void> {
    await this.client.query("DELETE FROM user_model_providers WHERE user_id = $1", [userId]);
  }

  async appendUserFeedback(feedback: UserFeedbackRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO user_feedback (id, user_id, task_id, report_id, rating, useful, text, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        feedback.id,
        feedback.userId,
        feedback.taskId,
        feedback.reportId,
        feedback.rating,
        feedback.useful,
        feedback.text ?? null,
        feedback.createdAt,
      ],
    );
  }

  async listUserFeedback(): Promise<UserFeedbackRecord[]> {
    const result = await this.client.query<UserFeedbackRow>(
      "SELECT * FROM user_feedback ORDER BY created_at DESC",
    );
    return result.rows.map((row) => mapUserFeedback(row)).filter(isPresent);
  }

  async appendAnalyticsEvent(event: AnalyticsEventRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO analytics_events (id, user_id, event_type, payload, created_at)
      VALUES ($1, $2, $3, $4, $5)`,
      [event.id, event.userId ?? null, event.eventType, event.payload, event.createdAt],
    );
  }

  async appendAdminAuditLog(entry: AdminAuditLogRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO admin_audit_logs (
        id, admin_user_id, action, target_type, target_id, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.id,
        entry.adminUserId,
        entry.action,
        entry.targetType,
        entry.targetId,
        entry.metadata,
        entry.createdAt,
      ],
    );
  }

  async listAdminAuditLogs(): Promise<AdminAuditLogRecord[]> {
    const result = await this.client.query<AuditLogRow>(
      "SELECT * FROM admin_audit_logs ORDER BY created_at DESC",
    );
    return result.rows.map((row) => mapAuditLog(row)).filter(isPresent);
  }

  async saveSystemSetting(setting: SystemSettingRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO system_settings (key, value, updated_by_admin_user_id, updated_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_by_admin_user_id = EXCLUDED.updated_by_admin_user_id,
        updated_at = EXCLUDED.updated_at`,
      [setting.key, setting.value, setting.updatedByAdminUserId, setting.updatedAt],
    );
  }

  async getSystemSetting(key: string): Promise<SystemSettingRecord | undefined> {
    const result = await this.client.query<SystemSettingRow>("SELECT * FROM system_settings WHERE key = $1", [
      key,
    ]);
    return mapSystemSetting(result.rows[0]);
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function optionalDate(value: Date | string | null | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }
  return value instanceof Date ? value : new Date(value);
}

function requiredDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function mapUser(row: UserRow | undefined): CommercialUserRecord | undefined {
  if (!row) {
    return undefined;
  }
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    tier: row.tier,
    features: row.features,
    isAdmin: row.is_admin,
    disabledAt: optionalDate(row.disabled_at),
    createdAt: requiredDate(row.created_at),
    updatedAt: requiredDate(row.updated_at),
  };
}

function mapSession(row: SessionRow | undefined): CommercialSessionRecord | undefined {
  if (!row) {
    return undefined;
  }
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: requiredDate(row.expires_at),
    revokedAt: optionalDate(row.revoked_at),
    createdAt: requiredDate(row.created_at),
  };
}

function mapCreditAccount(row: CreditAccountRow | undefined): UserCreditAccountRecord | undefined {
  if (!row) {
    return undefined;
  }
  return {
    userId: row.user_id,
    balance: row.balance,
    createdAt: requiredDate(row.created_at),
    updatedAt: requiredDate(row.updated_at),
  };
}

function mapLedgerEntry(row: LedgerRow | undefined): CreditLedgerEntryRecord | undefined {
  if (!row) {
    return undefined;
  }
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    amount: row.amount,
    balanceAfter: row.balance_after,
    idempotencyKey: row.idempotency_key,
    referenceType: row.reference_type ?? undefined,
    referenceId: row.reference_id ?? undefined,
    metadata: row.metadata,
    createdAt: requiredDate(row.created_at),
  };
}

function mapAccessCode(row: AccessCodeRow | undefined): AccessCodeRecord | undefined {
  if (!row) {
    return undefined;
  }
  return {
    id: row.id,
    codeHash: row.code_hash,
    maskedCode: row.masked_code,
    status: row.status,
    creditAmount: row.credit_amount,
    tier: row.tier,
    features: row.features,
    expiresAt: optionalDate(row.expires_at),
    redeemedByUserId: row.redeemed_by_user_id ?? undefined,
    redeemedAt: optionalDate(row.redeemed_at),
    disabledAt: optionalDate(row.disabled_at),
    createdByAdminUserId: row.created_by_admin_user_id,
    createdAt: requiredDate(row.created_at),
    updatedAt: requiredDate(row.updated_at),
  };
}

function mapAccessCodeRedemption(
  row: AccessCodeRedemptionRow | undefined,
): AccessCodeRedemptionRecord | undefined {
  if (!row) {
    return undefined;
  }
  return {
    id: row.id,
    accessCodeId: row.access_code_id,
    userId: row.user_id,
    ledgerEntryId: row.ledger_entry_id,
    redeemedAt: requiredDate(row.redeemed_at),
  };
}

function mapCommercialTask(
  row: CommercialTaskRow | undefined,
): CommercialSimulationTaskRecord | undefined {
  if (!row) {
    return undefined;
  }
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    scenario: row.scenario,
    userInput: row.user_input,
    interactionMode: row.interaction_mode,
    providerMode: row.provider_mode,
    creditCost: row.credit_cost,
    creditHoldLedgerEntryId: row.credit_hold_ledger_entry_id ?? undefined,
    creditCapturedLedgerEntryId: row.credit_captured_ledger_entry_id ?? undefined,
    creditReleasedLedgerEntryId: row.credit_released_ledger_entry_id ?? undefined,
    queueJobId: row.queue_job_id ?? undefined,
    reportId: row.report_id ?? undefined,
    errorCode: row.error_code ?? undefined,
    createdAt: requiredDate(row.created_at),
    updatedAt: requiredDate(row.updated_at),
  };
}

function mapSimulationReport(row: SimulationReportRow | undefined): SimulationReportRecord | undefined {
  if (!row) {
    return undefined;
  }
  return {
    id: row.id,
    taskId: row.task_id,
    userId: row.user_id,
    report: row.report,
    createdAt: requiredDate(row.created_at),
  };
}

function mapUserModelProvider(
  row: UserModelProviderRow | undefined,
): UserModelProviderRecord | undefined {
  if (!row) {
    return undefined;
  }
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider_type,
    baseUrl: row.base_url,
    encryptedApiKey: row.encrypted_api_key,
    model: row.model_name,
    createdAt: requiredDate(row.created_at),
    updatedAt: requiredDate(row.updated_at),
  };
}

function mapUserFeedback(row: UserFeedbackRow | undefined): UserFeedbackRecord | undefined {
  if (!row) {
    return undefined;
  }
  return {
    id: row.id,
    userId: row.user_id,
    taskId: row.task_id,
    reportId: row.report_id,
    rating: row.rating,
    useful: row.useful,
    text: row.text ?? undefined,
    createdAt: requiredDate(row.created_at),
  };
}

function mapAuditLog(row: AuditLogRow | undefined): AdminAuditLogRecord | undefined {
  if (!row) {
    return undefined;
  }
  return {
    id: row.id,
    adminUserId: row.admin_user_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    metadata: row.metadata,
    createdAt: requiredDate(row.created_at),
  };
}

function mapSystemSetting(row: SystemSettingRow | undefined): SystemSettingRecord | undefined {
  if (!row) {
    return undefined;
  }
  return {
    key: row.key,
    value: row.value,
    updatedByAdminUserId: row.updated_by_admin_user_id,
    updatedAt: requiredDate(row.updated_at),
  };
}

function isPresent<T>(value: T | undefined): value is T {
  return value !== undefined;
}
