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
  JsonObject,
  SimulationStepRunCostRecord,
  SimulationTaskRunRecord,
  SystemSettingRecord,
  UserCreditAccountRecord,
  UserFeedbackRecord,
  UserModelProviderRecord,
} from "./types.js";
import type { CommercialRepository } from "./repository.js";

export interface QueryClient {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}

type DbValue = string | number | boolean | null | Date | JsonObject | unknown[];
type DbRow = Record<string, DbValue>;

export class PostgresCommercialRepository implements CommercialRepository {
  constructor(private readonly client: QueryClient) {}

  async saveUser(user: CommercialUserRecord): Promise<void> {
    await this.client.query(
      `
        insert into users (
          id, email, email_normalized, password_hash, role, tier, status,
          features, last_login_at, created_at, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)
        on conflict (id) do update set
          email = excluded.email,
          email_normalized = excluded.email_normalized,
          password_hash = excluded.password_hash,
          role = excluded.role,
          tier = excluded.tier,
          status = excluded.status,
          features = excluded.features,
          last_login_at = excluded.last_login_at,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `,
      [
        user.id,
        user.email,
        user.emailNormalized,
        user.passwordHash,
        user.role,
        user.tier,
        user.status,
        toJsonb(user.features),
        user.lastLoginAt ?? null,
        user.createdAt,
        user.updatedAt,
      ],
    );
  }

  async getUser(userId: string): Promise<CommercialUserRecord | undefined> {
    const { rows } = await this.client.query<DbRow>(
      `
        select
          id, email, email_normalized, password_hash, role, tier, status,
          features, last_login_at, created_at, updated_at
        from users
        where id = $1
      `,
      [userId],
    );
    return mapOptional(rows[0], mapCommercialUser);
  }

  async findUserByEmail(
    email: string,
  ): Promise<CommercialUserRecord | undefined> {
    const { rows } = await this.client.query<DbRow>(
      `
        select
          id, email, email_normalized, password_hash, role, tier, status,
          features, last_login_at, created_at, updated_at
        from users
        where email_normalized = $1
      `,
      [normalizeEmail(email)],
    );
    return mapOptional(rows[0], mapCommercialUser);
  }

  async saveSession(session: CommercialSessionRecord): Promise<void> {
    await this.client.query(
      `
        insert into user_sessions (
          id, user_id, token_hash, user_agent, ip_hash, expires_at, revoked_at,
          created_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8)
        on conflict (id) do update set
          user_id = excluded.user_id,
          token_hash = excluded.token_hash,
          user_agent = excluded.user_agent,
          ip_hash = excluded.ip_hash,
          expires_at = excluded.expires_at,
          revoked_at = excluded.revoked_at,
          created_at = excluded.created_at
      `,
      [
        session.id,
        session.userId,
        session.tokenHash,
        session.userAgent ?? null,
        session.ipHash ?? null,
        session.expiresAt,
        session.revokedAt ?? null,
        session.createdAt,
      ],
    );
  }

  async findSessionByTokenHash(
    tokenHash: string,
  ): Promise<CommercialSessionRecord | undefined> {
    const { rows } = await this.client.query<DbRow>(
      `
        select
          id, user_id, token_hash, user_agent, ip_hash, expires_at, revoked_at,
          created_at
        from user_sessions
        where token_hash = $1
      `,
      [tokenHash],
    );
    return mapOptional(rows[0], mapCommercialSession);
  }

  async saveCreditAccount(account: UserCreditAccountRecord): Promise<void> {
    await this.client.query(
      `
        insert into user_credit_accounts (
          user_id, balance, frozen_credits, total_redeemed, total_captured,
          updated_at
        )
        values ($1, $2, $3, $4, $5, $6)
        on conflict (user_id) do update set
          balance = excluded.balance,
          frozen_credits = excluded.frozen_credits,
          total_redeemed = excluded.total_redeemed,
          total_captured = excluded.total_captured,
          updated_at = excluded.updated_at
      `,
      [
        account.userId,
        account.balance,
        account.frozenCredits,
        account.totalRedeemed,
        account.totalCaptured,
        account.updatedAt,
      ],
    );
  }

  async getCreditAccount(
    userId: string,
  ): Promise<UserCreditAccountRecord | undefined> {
    const { rows } = await this.client.query<DbRow>(
      `
        select
          user_id, balance, frozen_credits, total_redeemed, total_captured,
          updated_at
        from user_credit_accounts
        where user_id = $1
      `,
      [userId],
    );
    return mapOptional(rows[0], mapUserCreditAccount);
  }

  async appendCreditLedgerEntry(
    entry: CreditLedgerEntryRecord,
  ): Promise<void> {
    await this.client.query(
      `
        insert into credit_ledger (
          id, user_id, task_id, access_code_id, entry_type, amount,
          balance_after, frozen_after, idempotency_key, reason, metadata,
          created_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
      `,
      [
        entry.id,
        entry.userId,
        entry.taskId ?? null,
        entry.accessCodeId ?? null,
        entry.entryType,
        entry.amount,
        entry.balanceAfter,
        entry.frozenAfter ?? 0,
        entry.idempotencyKey,
        entry.reason ?? null,
        toJsonb(entry.metadata ?? {}),
        entry.createdAt,
      ],
    );
  }

  async findCreditLedgerEntryByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<CreditLedgerEntryRecord | undefined> {
    const { rows } = await this.client.query<DbRow>(
      `
        select
          id, user_id, task_id, access_code_id, entry_type, amount,
          balance_after, frozen_after, idempotency_key, reason, metadata,
          created_at
        from credit_ledger
        where idempotency_key = $1
      `,
      [idempotencyKey],
    );
    return mapOptional(rows[0], mapCreditLedgerEntry);
  }

  async saveAccessCodeBatch(batch: AccessCodeBatchRecord): Promise<void> {
    await this.client.query(
      `
        insert into access_code_batches (
          id, created_by_user_id, name, source, code_count, credits, tier,
          features, expires_at, disabled_at, notes, metadata, created_at
        )
        values (
          $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12::jsonb,
          $13
        )
        on conflict (id) do update set
          created_by_user_id = excluded.created_by_user_id,
          name = excluded.name,
          source = excluded.source,
          code_count = excluded.code_count,
          credits = excluded.credits,
          tier = excluded.tier,
          features = excluded.features,
          expires_at = excluded.expires_at,
          disabled_at = excluded.disabled_at,
          notes = excluded.notes,
          metadata = excluded.metadata,
          created_at = excluded.created_at
      `,
      [
        batch.id,
        batch.createdByUserId ?? null,
        batch.name,
        batch.source ?? null,
        batch.codeCount,
        batch.credits,
        batch.tier ?? null,
        toJsonb(batch.features),
        batch.expiresAt ?? null,
        batch.disabledAt ?? null,
        batch.notes ?? null,
        toJsonb(batch.metadata),
        batch.createdAt,
      ],
    );
  }

  async getAccessCodeBatch(
    batchId: string,
  ): Promise<AccessCodeBatchRecord | undefined> {
    const { rows } = await this.client.query<DbRow>(
      `
        select
          id, created_by_user_id, name, source, code_count, credits, tier,
          features, expires_at, disabled_at, notes, metadata, created_at
        from access_code_batches
        where id = $1
      `,
      [batchId],
    );
    return mapOptional(rows[0], mapAccessCodeBatch);
  }

  async saveAccessCode(code: AccessCodeRecord): Promise<void> {
    await this.client.query(
      `
        insert into access_codes (
          id, batch_id, code_hash, code_mask, status, credits, tier, features,
          expires_at, redeemed_by_user_id, redeemed_at, disabled_at, created_at
        )
        values (
          $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13
        )
        on conflict (id) do update set
          batch_id = excluded.batch_id,
          code_hash = excluded.code_hash,
          code_mask = excluded.code_mask,
          status = excluded.status,
          credits = excluded.credits,
          tier = excluded.tier,
          features = excluded.features,
          expires_at = excluded.expires_at,
          redeemed_by_user_id = excluded.redeemed_by_user_id,
          redeemed_at = excluded.redeemed_at,
          disabled_at = excluded.disabled_at,
          created_at = excluded.created_at
      `,
      [
        code.id,
        code.batchId,
        code.codeHash,
        code.codeMask,
        code.status,
        code.credits,
        code.tier ?? null,
        toJsonb(code.features),
        code.expiresAt ?? null,
        code.redeemedByUserId ?? null,
        code.redeemedAt ?? null,
        code.disabledAt ?? null,
        code.createdAt,
      ],
    );
  }

  async findAccessCodeByHash(
    codeHash: string,
  ): Promise<AccessCodeRecord | undefined> {
    const { rows } = await this.client.query<DbRow>(
      `
        select
          id, batch_id, code_hash, code_mask, status, credits, tier, features,
          expires_at, redeemed_by_user_id, redeemed_at, disabled_at, created_at
        from access_codes
        where code_hash = $1
      `,
      [codeHash],
    );
    return mapOptional(rows[0], mapAccessCode);
  }

  async saveAccessCodeRedemption(
    redemption: AccessCodeRedemptionRecord,
  ): Promise<void> {
    await this.client.query(
      `
        insert into access_code_redemptions (
          id, access_code_id, user_id, credit_ledger_id, credits, tier_granted,
          features_granted, redeemed_at, metadata
        )
        values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb)
      `,
      [
        redemption.id,
        redemption.accessCodeId,
        redemption.userId,
        redemption.creditLedgerId ?? null,
        redemption.credits,
        redemption.tierGranted ?? null,
        toJsonb(redemption.featuresGranted),
        redemption.redeemedAt,
        toJsonb(redemption.metadata),
      ],
    );
  }

  async findAccessCodeRedemptionByCodeId(
    accessCodeId: string,
  ): Promise<AccessCodeRedemptionRecord | undefined> {
    const { rows } = await this.client.query<DbRow>(
      `
        select
          id, access_code_id, user_id, credit_ledger_id, credits, tier_granted,
          features_granted, redeemed_at, metadata
        from access_code_redemptions
        where access_code_id = $1
      `,
      [accessCodeId],
    );
    return mapOptional(rows[0], mapAccessCodeRedemption);
  }

  async saveCommercialTask(
    task: CommercialSimulationTaskRecord,
  ): Promise<void> {
    await this.client.query(
      `
        insert into simulation_tasks (
          id, user_id, scenario_type, interaction_mode, provider_mode, status,
          credit_cost, credit_hold_ledger_id, priority, queue_weight,
          idempotency_key, input_summary, error_code, queued_at, started_at,
          completed_at, created_at, updated_at
        )
        values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13,
          $14, $15, $16, $17, $18
        )
        on conflict (id) do update set
          user_id = excluded.user_id,
          scenario_type = excluded.scenario_type,
          interaction_mode = excluded.interaction_mode,
          provider_mode = excluded.provider_mode,
          status = excluded.status,
          credit_cost = excluded.credit_cost,
          credit_hold_ledger_id = excluded.credit_hold_ledger_id,
          priority = excluded.priority,
          queue_weight = excluded.queue_weight,
          idempotency_key = excluded.idempotency_key,
          input_summary = excluded.input_summary,
          error_code = excluded.error_code,
          queued_at = excluded.queued_at,
          started_at = excluded.started_at,
          completed_at = excluded.completed_at,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `,
      [
        task.id,
        task.userId,
        task.scenarioType,
        task.interactionMode,
        task.providerMode,
        task.status,
        task.creditCost,
        task.creditHoldLedgerId ?? null,
        task.priority ?? 0,
        task.queueWeight ?? 1,
        task.idempotencyKey ?? null,
        toJsonb(task.inputSummary ?? {}),
        task.errorCode ?? null,
        task.queuedAt ?? task.createdAt,
        task.startedAt ?? null,
        task.completedAt ?? null,
        task.createdAt,
        task.updatedAt,
      ],
    );
  }

  async getCommercialTask(
    taskId: string,
  ): Promise<CommercialSimulationTaskRecord | undefined> {
    const { rows } = await this.client.query<DbRow>(
      `
        select
          id, user_id, scenario_type, interaction_mode, provider_mode, status,
          credit_cost, credit_hold_ledger_id, priority, queue_weight,
          idempotency_key, input_summary, error_code, queued_at, started_at,
          completed_at, created_at, updated_at
        from simulation_tasks
        where id = $1
      `,
      [taskId],
    );
    return mapOptional(rows[0], mapCommercialTask);
  }

  async appendSimulationTaskRun(
    run: SimulationTaskRunRecord,
  ): Promise<void> {
    await this.client.query(
      `
        insert into simulation_task_runs (
          id, task_id, worker_id, attempt, status, error_code, started_at,
          completed_at, metadata
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      `,
      [
        run.id,
        run.taskId,
        run.workerId ?? null,
        run.attempt ?? 1,
        run.status,
        run.errorCode ?? null,
        run.startedAt,
        run.completedAt ?? null,
        toJsonb(run.metadata ?? {}),
      ],
    );
  }

  async listSimulationTaskRuns(
    taskId: string,
  ): Promise<SimulationTaskRunRecord[]> {
    const { rows } = await this.client.query<DbRow>(
      `
        select
          id, task_id, worker_id, attempt, status, error_code, started_at,
          completed_at, metadata
        from simulation_task_runs
        where task_id = $1
        order by started_at asc, id asc
      `,
      [taskId],
    );
    return rows.map(mapSimulationTaskRun);
  }

  async appendSimulationStepRunCost(
    run: SimulationStepRunCostRecord,
  ): Promise<void> {
    await this.client.query(
      `
        insert into simulation_step_runs (
          id, task_run_id, task_id, stage_index, step_name, round_index,
          agent_id, provider, model_id, model_profile_id, prompt_tokens,
          completion_tokens, total_tokens, cached_tokens, estimated_cost,
          latency_ms, retry_count, status, error_code, started_at,
          completed_at, metadata
        )
        values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22::jsonb
        )
      `,
      [
        run.id,
        run.taskRunId ?? null,
        run.taskId,
        run.stageIndex ?? null,
        run.stepName,
        run.roundIndex ?? null,
        run.agentId ?? null,
        run.provider ?? null,
        run.modelId ?? null,
        run.modelProfileId ?? null,
        run.promptTokens ?? null,
        run.completionTokens ?? null,
        run.totalTokens ?? null,
        run.cachedTokens ?? null,
        run.estimatedCost ?? null,
        run.latencyMs ?? null,
        run.retryCount ?? 0,
        run.status,
        run.errorCode ?? null,
        run.startedAt,
        run.completedAt ?? null,
        toJsonb(run.metadata ?? {}),
      ],
    );
  }

  async listSimulationStepRunCosts(
    taskId: string,
  ): Promise<SimulationStepRunCostRecord[]> {
    const { rows } = await this.client.query<DbRow>(
      `
        select
          id, task_run_id, task_id, stage_index, step_name, round_index,
          agent_id, provider, model_id, model_profile_id, prompt_tokens,
          completion_tokens, total_tokens, cached_tokens, estimated_cost,
          latency_ms, retry_count, status, error_code, started_at,
          completed_at, metadata
        from simulation_step_runs
        where task_id = $1
        order by started_at asc, id asc
      `,
      [taskId],
    );
    return rows.map(mapSimulationStepRunCost);
  }

  async saveCommercialReport(
    report: CommercialSimulationReportRecord,
  ): Promise<void> {
    await this.client.query(
      `
        insert into simulation_reports (
          id, task_id, user_id, public_report, deep_report, share_card,
          unlocked, created_at, updated_at
        )
        values (
          $1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9
        )
        on conflict (id) do update set
          task_id = excluded.task_id,
          user_id = excluded.user_id,
          public_report = excluded.public_report,
          deep_report = excluded.deep_report,
          share_card = excluded.share_card,
          unlocked = excluded.unlocked,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `,
      [
        report.id,
        report.taskId,
        report.userId,
        nullableJsonb(report.publicReport),
        nullableJsonb(report.deepReport),
        nullableJsonb(report.shareCard),
        report.unlocked,
        report.createdAt,
        report.updatedAt,
      ],
    );
  }

  async getCommercialReportByTaskId(
    taskId: string,
  ): Promise<CommercialSimulationReportRecord | undefined> {
    const { rows } = await this.client.query<DbRow>(
      `
        select
          id, task_id, user_id, public_report, deep_report, share_card,
          unlocked, created_at, updated_at
        from simulation_reports
        where task_id = $1
      `,
      [taskId],
    );
    return mapOptional(rows[0], mapCommercialReport);
  }

  async appendAnalyticsEvent(event: AnalyticsEventRecord): Promise<void> {
    await this.client.query(
      `
        insert into analytics_events (
          id, user_id, task_id, session_id, event_type, source, properties,
          occurred_at
        )
        values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
      `,
      [
        event.id,
        event.userId ?? null,
        event.taskId ?? null,
        event.sessionId ?? null,
        event.eventType,
        event.source ?? null,
        toJsonb(event.properties),
        event.occurredAt,
      ],
    );
  }

  async listAnalyticsEvents(): Promise<AnalyticsEventRecord[]> {
    const { rows } = await this.client.query<DbRow>(
      `
        select
          id, user_id, task_id, session_id, event_type, source, properties,
          occurred_at
        from analytics_events
        order by occurred_at asc, id asc
      `,
    );
    return rows.map(mapAnalyticsEvent);
  }

  async appendUserFeedback(feedback: UserFeedbackRecord): Promise<void> {
    await this.client.query(
      `
        insert into user_feedback (
          id, user_id, task_id, report_id, rating, feedback_type, comment,
          metadata, created_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
      `,
      [
        feedback.id,
        feedback.userId ?? null,
        feedback.taskId ?? null,
        feedback.reportId ?? null,
        feedback.rating ?? null,
        feedback.feedbackType ?? null,
        feedback.comment ?? null,
        toJsonb(feedback.metadata),
        feedback.createdAt,
      ],
    );
  }

  async listUserFeedback(userId?: string): Promise<UserFeedbackRecord[]> {
    const params = userId === undefined ? undefined : [userId];
    const { rows } = await this.client.query<DbRow>(
      `
        select
          id, user_id, task_id, report_id, rating, feedback_type, comment,
          metadata, created_at
        from user_feedback
        ${userId === undefined ? "" : "where user_id = $1"}
        order by created_at asc, id asc
      `,
      params,
    );
    return rows.map(mapUserFeedback);
  }

  async saveUserModelProvider(
    provider: UserModelProviderRecord,
  ): Promise<void> {
    await this.client.query(
      `
        insert into user_model_providers (
          id, user_id, provider, display_name, base_url, encrypted_api_key,
          api_key_mask, model_fast, model_balanced, model_deep, status,
          last_tested_at, last_test_status, created_at, updated_at
        )
        values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
        )
        on conflict (id) do update set
          user_id = excluded.user_id,
          provider = excluded.provider,
          display_name = excluded.display_name,
          base_url = excluded.base_url,
          encrypted_api_key = excluded.encrypted_api_key,
          api_key_mask = excluded.api_key_mask,
          model_fast = excluded.model_fast,
          model_balanced = excluded.model_balanced,
          model_deep = excluded.model_deep,
          status = excluded.status,
          last_tested_at = excluded.last_tested_at,
          last_test_status = excluded.last_test_status,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `,
      [
        provider.id,
        provider.userId,
        provider.provider,
        provider.displayName,
        provider.baseUrl,
        provider.encryptedApiKey,
        provider.apiKeyMask,
        provider.modelFast ?? null,
        provider.modelBalanced ?? null,
        provider.modelDeep ?? null,
        provider.status,
        provider.lastTestedAt ?? null,
        provider.lastTestStatus ?? null,
        provider.createdAt,
        provider.updatedAt,
      ],
    );
  }

  async listUserModelProviders(
    userId: string,
  ): Promise<UserModelProviderRecord[]> {
    const { rows } = await this.client.query<DbRow>(
      `
        select
          id, user_id, provider, display_name, base_url, encrypted_api_key,
          api_key_mask, model_fast, model_balanced, model_deep, status,
          last_tested_at, last_test_status, created_at, updated_at
        from user_model_providers
        where user_id = $1
        order by created_at asc, id asc
      `,
      [userId],
    );
    return rows.map(mapUserModelProvider);
  }

  async saveSystemSetting(setting: SystemSettingRecord): Promise<void> {
    await this.client.query(
      `
        insert into system_settings (
          key, value, description, updated_by_user_id, created_at, updated_at
        )
        values ($1, $2::jsonb, $3, $4, $5, $6)
        on conflict (key) do update set
          value = excluded.value,
          description = excluded.description,
          updated_by_user_id = excluded.updated_by_user_id,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `,
      [
        setting.key,
        toJsonb(setting.value),
        setting.description ?? null,
        setting.updatedByUserId ?? null,
        setting.createdAt,
        setting.updatedAt,
      ],
    );
  }

  async getSystemSetting(
    key: string,
  ): Promise<SystemSettingRecord | undefined> {
    const { rows } = await this.client.query<DbRow>(
      `
        select
          key, value, description, updated_by_user_id, created_at, updated_at
        from system_settings
        where key = $1
      `,
      [key],
    );
    return mapOptional(rows[0], mapSystemSetting);
  }

  async appendAdminAuditLog(log: AdminAuditLogRecord): Promise<void> {
    await this.client.query(
      `
        insert into admin_audit_logs (
          id, actor_user_id, action, target_type, target_id, metadata, ip_hash,
          user_agent, created_at
        )
        values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
      `,
      [
        log.id,
        log.actorUserId ?? null,
        log.action,
        log.targetType,
        log.targetId ?? null,
        toJsonb(log.metadata),
        log.ipHash ?? null,
        log.userAgent ?? null,
        log.createdAt,
      ],
    );
  }

  async listAdminAuditLogs(): Promise<AdminAuditLogRecord[]> {
    const { rows } = await this.client.query<DbRow>(
      `
        select
          id, actor_user_id, action, target_type, target_id, metadata, ip_hash,
          user_agent, created_at
        from admin_audit_logs
        order by created_at asc, id asc
      `,
    );
    return rows.map(mapAdminAuditLog);
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toJsonb(value: unknown): string {
  return JSON.stringify(value) ?? "null";
}

function nullableJsonb(value: unknown | undefined): string | null {
  return value === undefined ? null : toJsonb(value);
}

function mapOptional<T>(row: DbRow | undefined, mapper: (row: DbRow) => T): T | undefined {
  return row === undefined ? undefined : mapper(row);
}

function maybeString(value: DbValue): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return value instanceof Date ? value.toISOString() : String(value);
}

function stringField(row: DbRow, field: string): string {
  return maybeString(row[field]) ?? "";
}

function numberField(row: DbRow, field: string): number {
  return Number(row[field]);
}

function booleanField(row: DbRow, field: string): boolean {
  return Boolean(row[field]);
}

function jsonObjectField(row: DbRow, field: string): JsonObject {
  const value = row[field];
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && !(value instanceof Date)
    ? (value as JsonObject)
    : {};
}

function maybeJsonObject(row: DbRow, field: string): JsonObject | undefined {
  return row[field] === null ? undefined : jsonObjectField(row, field);
}

function arrayField<T>(row: DbRow, field: string): T[] {
  const value = row[field];
  return Array.isArray(value) ? (value as T[]) : [];
}

function assignIfDefined<T, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function mapCommercialUser(row: DbRow): CommercialUserRecord {
  const record: CommercialUserRecord = {
    id: stringField(row, "id"),
    email: stringField(row, "email"),
    emailNormalized: stringField(row, "email_normalized"),
    passwordHash: stringField(row, "password_hash"),
    role: stringField(row, "role") as CommercialUserRecord["role"],
    tier: stringField(row, "tier") as CommercialUserRecord["tier"],
    status: stringField(row, "status") as CommercialUserRecord["status"],
    features: arrayField(row, "features"),
    createdAt: stringField(row, "created_at"),
    updatedAt: stringField(row, "updated_at"),
  };
  assignIfDefined(record, "lastLoginAt", maybeString(row.last_login_at));
  return record;
}

function mapCommercialSession(row: DbRow): CommercialSessionRecord {
  const record: CommercialSessionRecord = {
    id: stringField(row, "id"),
    userId: stringField(row, "user_id"),
    tokenHash: stringField(row, "token_hash"),
    expiresAt: stringField(row, "expires_at"),
    createdAt: stringField(row, "created_at"),
  };
  assignIfDefined(record, "userAgent", maybeString(row.user_agent));
  assignIfDefined(record, "ipHash", maybeString(row.ip_hash));
  assignIfDefined(record, "revokedAt", maybeString(row.revoked_at));
  return record;
}

function mapUserCreditAccount(row: DbRow): UserCreditAccountRecord {
  return {
    userId: stringField(row, "user_id"),
    balance: numberField(row, "balance"),
    frozenCredits: numberField(row, "frozen_credits"),
    totalRedeemed: numberField(row, "total_redeemed"),
    totalCaptured: numberField(row, "total_captured"),
    updatedAt: stringField(row, "updated_at"),
  };
}

function mapCreditLedgerEntry(row: DbRow): CreditLedgerEntryRecord {
  const record: CreditLedgerEntryRecord = {
    id: stringField(row, "id"),
    userId: stringField(row, "user_id"),
    entryType: stringField(
      row,
      "entry_type",
    ) as CreditLedgerEntryRecord["entryType"],
    amount: numberField(row, "amount"),
    balanceAfter: numberField(row, "balance_after"),
    idempotencyKey: stringField(row, "idempotency_key"),
    createdAt: stringField(row, "created_at"),
  };
  assignIfDefined(record, "taskId", maybeString(row.task_id));
  assignIfDefined(record, "accessCodeId", maybeString(row.access_code_id));
  assignIfDefined(record, "frozenAfter", row.frozen_after === null ? undefined : numberField(row, "frozen_after"));
  assignIfDefined(record, "reason", maybeString(row.reason));
  assignIfDefined(record, "metadata", maybeJsonObject(row, "metadata"));
  return record;
}

function mapAccessCodeBatch(row: DbRow): AccessCodeBatchRecord {
  const record: AccessCodeBatchRecord = {
    id: stringField(row, "id"),
    name: stringField(row, "name"),
    codeCount: numberField(row, "code_count"),
    credits: numberField(row, "credits"),
    features: arrayField(row, "features"),
    metadata: jsonObjectField(row, "metadata"),
    createdAt: stringField(row, "created_at"),
  };
  assignIfDefined(record, "createdByUserId", maybeString(row.created_by_user_id));
  assignIfDefined(record, "source", maybeString(row.source));
  assignIfDefined(record, "tier", maybeString(row.tier) as AccessCodeBatchRecord["tier"]);
  assignIfDefined(record, "expiresAt", maybeString(row.expires_at));
  assignIfDefined(record, "disabledAt", maybeString(row.disabled_at));
  assignIfDefined(record, "notes", maybeString(row.notes));
  return record;
}

function mapAccessCode(row: DbRow): AccessCodeRecord {
  const record: AccessCodeRecord = {
    id: stringField(row, "id"),
    batchId: stringField(row, "batch_id"),
    codeHash: stringField(row, "code_hash"),
    codeMask: stringField(row, "code_mask"),
    status: stringField(row, "status") as AccessCodeRecord["status"],
    credits: numberField(row, "credits"),
    features: arrayField(row, "features"),
    createdAt: stringField(row, "created_at"),
  };
  assignIfDefined(record, "tier", maybeString(row.tier) as AccessCodeRecord["tier"]);
  assignIfDefined(record, "expiresAt", maybeString(row.expires_at));
  assignIfDefined(record, "redeemedByUserId", maybeString(row.redeemed_by_user_id));
  assignIfDefined(record, "redeemedAt", maybeString(row.redeemed_at));
  assignIfDefined(record, "disabledAt", maybeString(row.disabled_at));
  return record;
}

function mapAccessCodeRedemption(row: DbRow): AccessCodeRedemptionRecord {
  const record: AccessCodeRedemptionRecord = {
    id: stringField(row, "id"),
    accessCodeId: stringField(row, "access_code_id"),
    userId: stringField(row, "user_id"),
    credits: numberField(row, "credits"),
    featuresGranted: arrayField(row, "features_granted"),
    redeemedAt: stringField(row, "redeemed_at"),
    metadata: jsonObjectField(row, "metadata"),
  };
  assignIfDefined(record, "creditLedgerId", maybeString(row.credit_ledger_id));
  assignIfDefined(record, "tierGranted", maybeString(row.tier_granted) as AccessCodeRedemptionRecord["tierGranted"]);
  return record;
}

function mapCommercialTask(row: DbRow): CommercialSimulationTaskRecord {
  const record: CommercialSimulationTaskRecord = {
    id: stringField(row, "id"),
    userId: stringField(row, "user_id"),
    scenarioType: stringField(
      row,
      "scenario_type",
    ) as CommercialSimulationTaskRecord["scenarioType"],
    interactionMode: stringField(
      row,
      "interaction_mode",
    ) as CommercialSimulationTaskRecord["interactionMode"],
    providerMode: stringField(
      row,
      "provider_mode",
    ) as CommercialSimulationTaskRecord["providerMode"],
    status: stringField(row, "status") as CommercialSimulationTaskRecord["status"],
    creditCost: numberField(row, "credit_cost"),
    createdAt: stringField(row, "created_at"),
    updatedAt: stringField(row, "updated_at"),
  };
  assignIfDefined(record, "creditHoldLedgerId", maybeString(row.credit_hold_ledger_id));
  assignIfDefined(record, "priority", row.priority === null ? undefined : numberField(row, "priority"));
  assignIfDefined(record, "queueWeight", row.queue_weight === null ? undefined : numberField(row, "queue_weight"));
  assignIfDefined(record, "idempotencyKey", maybeString(row.idempotency_key));
  assignIfDefined(record, "inputSummary", maybeJsonObject(row, "input_summary"));
  assignIfDefined(record, "errorCode", maybeString(row.error_code));
  assignIfDefined(record, "queuedAt", maybeString(row.queued_at));
  assignIfDefined(record, "startedAt", maybeString(row.started_at));
  assignIfDefined(record, "completedAt", maybeString(row.completed_at));
  return record;
}

function mapSimulationTaskRun(row: DbRow): SimulationTaskRunRecord {
  const record: SimulationTaskRunRecord = {
    id: stringField(row, "id"),
    taskId: stringField(row, "task_id"),
    status: stringField(row, "status") as SimulationTaskRunRecord["status"],
    startedAt: stringField(row, "started_at"),
  };
  assignIfDefined(record, "workerId", maybeString(row.worker_id));
  assignIfDefined(record, "attempt", row.attempt === null ? undefined : numberField(row, "attempt"));
  assignIfDefined(record, "errorCode", maybeString(row.error_code));
  assignIfDefined(record, "completedAt", maybeString(row.completed_at));
  assignIfDefined(record, "metadata", maybeJsonObject(row, "metadata"));
  return record;
}

function mapSimulationStepRunCost(row: DbRow): SimulationStepRunCostRecord {
  const record: SimulationStepRunCostRecord = {
    id: stringField(row, "id"),
    taskId: stringField(row, "task_id"),
    stepName: stringField(row, "step_name"),
    status: stringField(row, "status") as SimulationStepRunCostRecord["status"],
    startedAt: stringField(row, "started_at"),
  };
  assignIfDefined(record, "taskRunId", maybeString(row.task_run_id));
  assignIfDefined(record, "stageIndex", row.stage_index === null ? undefined : numberField(row, "stage_index"));
  assignIfDefined(record, "roundIndex", row.round_index === null ? undefined : numberField(row, "round_index"));
  assignIfDefined(record, "agentId", maybeString(row.agent_id));
  assignIfDefined(record, "provider", maybeString(row.provider));
  assignIfDefined(record, "modelId", maybeString(row.model_id));
  assignIfDefined(record, "modelProfileId", maybeString(row.model_profile_id));
  assignIfDefined(record, "promptTokens", row.prompt_tokens === null ? undefined : numberField(row, "prompt_tokens"));
  assignIfDefined(record, "completionTokens", row.completion_tokens === null ? undefined : numberField(row, "completion_tokens"));
  assignIfDefined(record, "totalTokens", row.total_tokens === null ? undefined : numberField(row, "total_tokens"));
  assignIfDefined(record, "cachedTokens", row.cached_tokens === null ? undefined : numberField(row, "cached_tokens"));
  assignIfDefined(record, "estimatedCost", row.estimated_cost === null ? undefined : numberField(row, "estimated_cost"));
  assignIfDefined(record, "latencyMs", row.latency_ms === null ? undefined : numberField(row, "latency_ms"));
  assignIfDefined(record, "retryCount", row.retry_count === null ? undefined : numberField(row, "retry_count"));
  assignIfDefined(record, "errorCode", maybeString(row.error_code));
  assignIfDefined(record, "completedAt", maybeString(row.completed_at));
  assignIfDefined(record, "metadata", maybeJsonObject(row, "metadata"));
  return record;
}

function mapCommercialReport(row: DbRow): CommercialSimulationReportRecord {
  const record: CommercialSimulationReportRecord = {
    id: stringField(row, "id"),
    taskId: stringField(row, "task_id"),
    userId: stringField(row, "user_id"),
    unlocked: booleanField(row, "unlocked"),
    createdAt: stringField(row, "created_at"),
    updatedAt: stringField(row, "updated_at"),
  };
  assignIfDefined(
    record,
    "publicReport",
    row.public_report === null
      ? undefined
      : (row.public_report as unknown as CommercialSimulationReportRecord["publicReport"]),
  );
  assignIfDefined(
    record,
    "deepReport",
    row.deep_report === null
      ? undefined
      : (row.deep_report as unknown as CommercialSimulationReportRecord["deepReport"]),
  );
  assignIfDefined(record, "shareCard", maybeJsonObject(row, "share_card"));
  return record;
}

function mapAnalyticsEvent(row: DbRow): AnalyticsEventRecord {
  const record: AnalyticsEventRecord = {
    id: stringField(row, "id"),
    eventType: stringField(row, "event_type"),
    properties: jsonObjectField(row, "properties"),
    occurredAt: stringField(row, "occurred_at"),
  };
  assignIfDefined(record, "userId", maybeString(row.user_id));
  assignIfDefined(record, "taskId", maybeString(row.task_id));
  assignIfDefined(record, "sessionId", maybeString(row.session_id));
  assignIfDefined(record, "source", maybeString(row.source));
  return record;
}

function mapUserFeedback(row: DbRow): UserFeedbackRecord {
  const record: UserFeedbackRecord = {
    id: stringField(row, "id"),
    metadata: jsonObjectField(row, "metadata"),
    createdAt: stringField(row, "created_at"),
  };
  assignIfDefined(record, "userId", maybeString(row.user_id));
  assignIfDefined(record, "taskId", maybeString(row.task_id));
  assignIfDefined(record, "reportId", maybeString(row.report_id));
  assignIfDefined(record, "rating", row.rating === null ? undefined : numberField(row, "rating"));
  assignIfDefined(record, "feedbackType", maybeString(row.feedback_type));
  assignIfDefined(record, "comment", maybeString(row.comment));
  return record;
}

function mapUserModelProvider(row: DbRow): UserModelProviderRecord {
  const record: UserModelProviderRecord = {
    id: stringField(row, "id"),
    userId: stringField(row, "user_id"),
    provider: stringField(row, "provider"),
    displayName: stringField(row, "display_name"),
    baseUrl: stringField(row, "base_url"),
    encryptedApiKey: stringField(row, "encrypted_api_key"),
    apiKeyMask: stringField(row, "api_key_mask"),
    status: stringField(row, "status") as UserModelProviderRecord["status"],
    createdAt: stringField(row, "created_at"),
    updatedAt: stringField(row, "updated_at"),
  };
  assignIfDefined(record, "modelFast", maybeString(row.model_fast));
  assignIfDefined(record, "modelBalanced", maybeString(row.model_balanced));
  assignIfDefined(record, "modelDeep", maybeString(row.model_deep));
  assignIfDefined(record, "lastTestedAt", maybeString(row.last_tested_at));
  assignIfDefined(record, "lastTestStatus", maybeString(row.last_test_status) as UserModelProviderRecord["lastTestStatus"]);
  return record;
}

function mapSystemSetting(row: DbRow): SystemSettingRecord {
  const record: SystemSettingRecord = {
    key: stringField(row, "key"),
    value: row.value,
    createdAt: stringField(row, "created_at"),
    updatedAt: stringField(row, "updated_at"),
  };
  assignIfDefined(record, "description", maybeString(row.description));
  assignIfDefined(record, "updatedByUserId", maybeString(row.updated_by_user_id));
  return record;
}

function mapAdminAuditLog(row: DbRow): AdminAuditLogRecord {
  const record: AdminAuditLogRecord = {
    id: stringField(row, "id"),
    action: stringField(row, "action"),
    targetType: stringField(row, "target_type"),
    metadata: jsonObjectField(row, "metadata"),
    createdAt: stringField(row, "created_at"),
  };
  assignIfDefined(record, "actorUserId", maybeString(row.actor_user_id));
  assignIfDefined(record, "targetId", maybeString(row.target_id));
  assignIfDefined(record, "ipHash", maybeString(row.ip_hash));
  assignIfDefined(record, "userAgent", maybeString(row.user_agent));
  return record;
}
