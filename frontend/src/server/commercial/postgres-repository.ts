import { AsyncLocalStorage } from "node:async_hooks";

import {
  ADMIN_AUDIT_ACTIONS,
  type AdminAuditAction,
} from "../../contracts/commercial.js";
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
import type {
  CommercialRepository,
  CreditLedgerTransitionResult,
  RedeemAccessCodeWithCreditLedgerResult,
} from "./repository.js";
import { validateAccessCodeBatchCodes } from "./repository.js";

export interface QueryClient {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
  connect?(): Promise<AcquiredQueryClient>;
}

export interface AcquiredQueryClient extends QueryClient {
  release(): void;
}

type DbValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Date
  | JsonObject
  | unknown[];
type DbRow = Record<string, DbValue>;

export class PostgresCommercialRepository implements CommercialRepository {
  private readonly transactionContext = new AsyncLocalStorage<QueryClient>();

  constructor(private readonly client: QueryClient) {}

  private async query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }> {
    return (this.transactionContext.getStore() ?? this.client).query<T>(sql, params);
  }

  private async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.transactionContext.getStore() !== undefined) {
      return work();
    }

    const acquiredClient = await this.client.connect?.();
    const transactionClient = acquiredClient ?? this.client;
    await transactionClient.query("begin");
    try {
      const result = await this.transactionContext.run(transactionClient, work);
      await transactionClient.query("commit");
      return result;
    } catch (error) {
      await transactionClient.query("rollback");
      throw error;
    } finally {
      acquiredClient?.release();
    }
  }

  async saveUser(user: CommercialUserRecord): Promise<void> {
    await this.query(
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
    const { rows } = await this.query<DbRow>(
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
    const { rows } = await this.query<DbRow>(
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

  async createUserWithCreditAccount(
    user: CommercialUserRecord,
    account: UserCreditAccountRecord,
  ): Promise<void> {
    await this.query(
      `
        with inserted_user as (
          insert into users (
            id, email, email_normalized, password_hash, role, tier, status,
            features, last_login_at, created_at, updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)
          returning id
        )
        insert into user_credit_accounts (
          user_id, balance, frozen_credits, total_redeemed, total_captured,
          updated_at
        )
        select id, $12, $13, $14, $15, $16
        from inserted_user
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
        account.balance,
        account.frozenCredits,
        account.totalRedeemed,
        account.totalCaptured,
        account.updatedAt,
      ],
    );
  }

  async saveSession(session: CommercialSessionRecord): Promise<void> {
    await this.query(
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
    const { rows } = await this.query<DbRow>(
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

  async revokeUserSessions(userId: string, revokedAt: string): Promise<void> {
    await this.query(
      `
        update user_sessions
        set revoked_at = $2
        where user_id = $1
          and revoked_at is null
      `,
      [userId, revokedAt],
    );
  }

  async saveCreditAccount(account: UserCreditAccountRecord): Promise<void> {
    await this.query(
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
    const { rows } = await this.query<DbRow>(
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
    await this.query(
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
    const { rows } = await this.query<DbRow>(
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

  async getCreditLedgerEntry(
    ledgerEntryId: string,
  ): Promise<CreditLedgerEntryRecord | undefined> {
    const { rows } = await this.query<DbRow>(
      `
        select
          id, user_id, task_id, access_code_id, entry_type, amount,
          balance_after, frozen_after, idempotency_key, reason, metadata,
          created_at
        from credit_ledger
        where id = $1
      `,
      [ledgerEntryId],
    );
    return mapOptional(rows[0], mapCreditLedgerEntry);
  }

  async findCreditLedgerEntryByMetadata(
    metadataKey: string,
    metadataValue: string,
    entryTypes?: CreditLedgerEntryRecord["entryType"][],
  ): Promise<CreditLedgerEntryRecord | undefined> {
    const { rows } = await this.query<DbRow>(
      `
        select
          id, user_id, task_id, access_code_id, entry_type, amount,
          balance_after, frozen_after, idempotency_key, reason, metadata,
          created_at
        from credit_ledger
        where metadata ->> $1 = $2
          and ($3::text[] is null or entry_type = any($3::text[]))
        order by created_at asc, id asc
        limit 1
      `,
      [metadataKey, metadataValue, entryTypes ?? null],
    );
    return mapOptional(rows[0], mapCreditLedgerEntry);
  }

  async holdCreditsForTask(input: {
    ledgerEntry: CreditLedgerEntryRecord;
    amount: number;
    taskUpdatedAt: string;
  }): Promise<CreditLedgerTransitionResult | undefined> {
    const { ledgerEntry, amount } = input;
    return this.runInTransaction(async () => {
      const taskRows = await this.query<DbRow>(
        `
          select id, user_id
          from simulation_tasks
          where id = $1
            and user_id = $2
            and credit_hold_ledger_id is null
          for update
        `,
        [ledgerEntry.taskId ?? null, ledgerEntry.userId],
      );
      if (!taskRows.rows[0]) {
        return undefined;
      }

      const accountRows = await this.query<DbRow>(
        `
          update user_credit_accounts
          set
            balance = balance - $2,
            frozen_credits = frozen_credits + $2,
            updated_at = $3
          where user_id = $1
            and balance >= $2
          returning
            user_id as account_user_id, balance, frozen_credits,
            total_redeemed, total_captured, updated_at
        `,
        [ledgerEntry.userId, amount, ledgerEntry.createdAt],
      );
      const account = mapOptional(accountRows.rows[0], mapJoinedUserCreditAccount);
      if (!account) {
        return undefined;
      }

      const ledgerRows = await this.query<DbRow>(
        `
          insert into credit_ledger (
            id, user_id, task_id, access_code_id, entry_type, amount,
            balance_after, frozen_after, idempotency_key, reason, metadata,
            created_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
          returning
            id, user_id, task_id, access_code_id, entry_type, amount,
            balance_after, frozen_after, idempotency_key, reason, metadata,
            created_at
        `,
        [
          ledgerEntry.id,
          account.userId,
          ledgerEntry.taskId ?? null,
          ledgerEntry.accessCodeId ?? null,
          ledgerEntry.entryType,
          -amount,
          account.balance,
          account.frozenCredits,
          ledgerEntry.idempotencyKey,
          ledgerEntry.reason ?? null,
          toJsonb(ledgerEntry.metadata ?? {}),
          ledgerEntry.createdAt,
        ],
      );
      const ledger = mapCreditLedgerEntry(ledgerRows.rows[0]!);

      const taskUpdateRows = await this.query<DbRow>(
        `
          update simulation_tasks
          set credit_hold_ledger_id = $2,
              updated_at = $3
          where id = $1
            and credit_hold_ledger_id is null
          returning id
        `,
        [ledgerEntry.taskId ?? null, ledger.id, input.taskUpdatedAt],
      );
      if (!taskUpdateRows.rows[0]) {
        throw new Error("simulation_tasks.creditHoldLedgerId must be null");
      }

      return { account, ledger };
    });
  }

  async captureHeldCredits(input: {
    ledgerEntry: CreditLedgerEntryRecord;
    holdLedgerId: string;
    amount: number;
  }): Promise<CreditLedgerTransitionResult | undefined> {
    return this.completeHeldCredits({
      ...input,
      entryType: "capture",
      balanceDelta: 0,
      frozenDelta: -input.amount,
      capturedDelta: input.amount,
      completionTypes: ["capture", "release"],
    });
  }

  async releaseHeldCredits(input: {
    ledgerEntry: CreditLedgerEntryRecord;
    holdLedgerId: string;
    amount: number;
  }): Promise<CreditLedgerTransitionResult | undefined> {
    return this.completeHeldCredits({
      ...input,
      entryType: "release",
      balanceDelta: input.amount,
      frozenDelta: -input.amount,
      capturedDelta: 0,
      completionTypes: ["capture", "release"],
    });
  }

  async refundCapturedCreditsWithAudit(input: {
    ledgerEntry: CreditLedgerEntryRecord;
    captureLedgerId: string;
    amount: number;
    auditLog: AdminAuditLogRecord;
  }): Promise<CreditLedgerTransitionResult | undefined> {
    const { ledgerEntry, amount, auditLog } = input;
    const ledgerMetadata = linkMetadata(ledgerEntry.metadata, {
      captureLedgerId: input.captureLedgerId,
    });
    return this.runInTransaction(async () => {
      const captureRows = await this.query<DbRow>(
        `
          select id, user_id, task_id, amount
          from credit_ledger
          where id = $1
            and user_id = $2
            and task_id = $3
            and entry_type = 'capture'
          for update
        `,
        [input.captureLedgerId, ledgerEntry.userId, ledgerEntry.taskId ?? null],
      );
      const capture = mapOptional(captureRows.rows[0], mapLockedCreditLedgerReference);
      if (!capture) {
        return undefined;
      }

      const existingRefund = await this.query<DbRow>(
        `
          select id
          from credit_ledger
          where entry_type = 'refund'
            and metadata ->> 'captureLedgerId' = $1
          limit 1
        `,
        [capture.id],
      );
      if (existingRefund.rows[0]) {
        return undefined;
      }

      const accountRows = await this.query<DbRow>(
        `
          update user_credit_accounts
          set
            balance = balance + $2,
            updated_at = $3
          where user_id = $1
          returning
            user_id as account_user_id, balance, frozen_credits,
            total_redeemed, total_captured, updated_at
        `,
        [capture.userId, amount, ledgerEntry.createdAt],
      );
      const account = mapOptional(accountRows.rows[0], mapJoinedUserCreditAccount);
      if (!account) {
        throw new Error("user_credit_accounts.user_id must exist");
      }

      const ledgerRows = await this.query<DbRow>(
        `
          insert into credit_ledger (
            id, user_id, task_id, access_code_id, entry_type, amount,
            balance_after, frozen_after, idempotency_key, reason, metadata,
            created_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
          returning
            id, user_id, task_id, access_code_id, entry_type, amount,
            balance_after, frozen_after, idempotency_key, reason, metadata,
            created_at
        `,
        [
          ledgerEntry.id,
          account.userId,
          capture.taskId ?? null,
          ledgerEntry.accessCodeId ?? null,
          ledgerEntry.entryType,
          amount,
          account.balance,
          account.frozenCredits,
          ledgerEntry.idempotencyKey,
          ledgerEntry.reason ?? null,
          toJsonb(ledgerMetadata),
          ledgerEntry.createdAt,
        ],
      );
      const ledger = mapCreditLedgerEntry(ledgerRows.rows[0]!);

      const auditRows = await this.query<DbRow>(
        `
          insert into admin_audit_logs (
            id, actor_user_id, action, target_type, target_id, metadata,
            ip_hash, user_agent, created_at
          )
          values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
          returning id
        `,
        [
          auditLog.id,
          auditLog.actorUserId ?? null,
          auditLog.action,
          auditLog.targetType,
          auditLog.targetId ?? null,
          toJsonb(auditLog.metadata),
          auditLog.ipHash ?? null,
          auditLog.userAgent ?? null,
          auditLog.createdAt,
        ],
      );
      if (!auditRows.rows[0]) {
        throw new Error("admin_audit_logs.id must be inserted");
      }

      return { account, ledger };
    });
  }

  async adjustCreditsWithAudit(input: {
    ledgerEntry: CreditLedgerEntryRecord;
    amount: number;
    auditLog: AdminAuditLogRecord;
  }): Promise<CreditLedgerTransitionResult | undefined> {
    const { ledgerEntry, amount, auditLog } = input;
    const { rows } = await this.query<DbRow>(
      `
        with updated_account as (
          update user_credit_accounts
          set
            balance = balance + $2,
            updated_at = $3
          where user_id = $1
            and balance + $2 >= 0
          returning
            user_id as account_user_id, balance, frozen_credits,
            total_redeemed, total_captured, updated_at
        ),
        inserted_ledger as (
          insert into credit_ledger (
            id, user_id, task_id, access_code_id, entry_type, amount,
            balance_after, frozen_after, idempotency_key, reason, metadata,
            created_at
          )
          select
            $4, updated_account.account_user_id, $5, $6, $7, $2,
            updated_account.balance, updated_account.frozen_credits, $8, $9,
            $10::jsonb, $11
          from updated_account
          returning
            id, user_id, task_id, access_code_id, entry_type, amount,
            balance_after, frozen_after, idempotency_key, reason, metadata,
            created_at
        ),
        inserted_audit as (
          insert into admin_audit_logs (
            id, actor_user_id, action, target_type, target_id, metadata,
            ip_hash, user_agent, created_at
          )
          select $12, $13, $14, $15, $16, $17::jsonb, $18, $19, $20
          from inserted_ledger
          returning id
        )
        select
          updated_account.account_user_id, updated_account.balance,
          updated_account.frozen_credits, updated_account.total_redeemed,
          updated_account.total_captured, updated_account.updated_at,
          inserted_ledger.id, inserted_ledger.user_id, inserted_ledger.task_id,
          inserted_ledger.access_code_id, inserted_ledger.entry_type,
          inserted_ledger.amount, inserted_ledger.balance_after,
          inserted_ledger.frozen_after, inserted_ledger.idempotency_key,
          inserted_ledger.reason, inserted_ledger.metadata,
          inserted_ledger.created_at
        from updated_account
        join inserted_ledger on true
        join inserted_audit on true
      `,
      [
        ledgerEntry.userId,
        amount,
        ledgerEntry.createdAt,
        ledgerEntry.id,
        ledgerEntry.taskId ?? null,
        ledgerEntry.accessCodeId ?? null,
        ledgerEntry.entryType,
        ledgerEntry.idempotencyKey,
        ledgerEntry.reason ?? null,
        toJsonb(ledgerEntry.metadata ?? {}),
        ledgerEntry.createdAt,
        auditLog.id,
        auditLog.actorUserId ?? null,
        auditLog.action,
        auditLog.targetType,
        auditLog.targetId ?? null,
        toJsonb(auditLog.metadata),
        auditLog.ipHash ?? null,
        auditLog.userAgent ?? null,
        auditLog.createdAt,
      ],
    );

    return mapOptional(rows[0], mapCreditLedgerTransition);
  }

  async saveAccessCodeBatch(batch: AccessCodeBatchRecord): Promise<void> {
    await this.query(
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

  async createAccessCodeBatchWithCodes(
    batch: AccessCodeBatchRecord,
    codes: AccessCodeRecord[],
  ): Promise<void> {
    validateAccessCodeBatchCodes(batch, codes);

    await this.query(
      `
        with inserted_batch as (
          insert into access_code_batches (
            id, created_by_user_id, name, source, code_count, credits, tier,
            features, expires_at, disabled_at, notes, metadata, created_at
          )
          values (
            $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12::jsonb,
            $13
          )
          returning id
        )
        insert into access_codes (
          id, batch_id, code_hash, code_mask, status, credits, tier, features,
          expires_at, redeemed_by_user_id, redeemed_at, disabled_at, created_at
        )
        select
          code.id,
          inserted_batch.id,
          code."codeHash",
          code."codeMask",
          code.status,
          code.credits,
          code.tier,
          code.features,
          code."expiresAt",
          code."redeemedByUserId",
          code."redeemedAt",
          code."disabledAt",
          code."createdAt"
        from inserted_batch
        join jsonb_to_recordset($14::jsonb) as code(
          id text,
          "batchId" text,
          "codeHash" text,
          "codeMask" text,
          status text,
          credits integer,
          tier text,
          features jsonb,
          "expiresAt" timestamptz,
          "redeemedByUserId" text,
          "redeemedAt" timestamptz,
          "disabledAt" timestamptz,
          "createdAt" timestamptz
        ) on code."batchId" = inserted_batch.id
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
        toJsonb(codes.map(toAccessCodeJson)),
      ],
    );
  }

  async getAccessCodeBatch(
    batchId: string,
  ): Promise<AccessCodeBatchRecord | undefined> {
    const { rows } = await this.query<DbRow>(
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
    await this.query(
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
    const { rows } = await this.query<DbRow>(
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

  async getAccessCode(
    codeId: string,
  ): Promise<AccessCodeRecord | undefined> {
    const { rows } = await this.query<DbRow>(
      `
        select
          id, batch_id, code_hash, code_mask, status, credits, tier, features,
          expires_at, redeemed_by_user_id, redeemed_at, disabled_at, created_at
        from access_codes
        where id = $1
      `,
      [codeId],
    );
    return mapOptional(rows[0], mapAccessCode);
  }

  async listAccessCodesByBatch(batchId: string): Promise<AccessCodeRecord[]> {
    const { rows } = await this.query<DbRow>(
      `
        select
          id, batch_id, code_hash, code_mask, status, credits, tier, features,
          expires_at, redeemed_by_user_id, redeemed_at, disabled_at, created_at
        from access_codes
        where batch_id = $1
        order by created_at asc, id asc
      `,
      [batchId],
    );
    return rows.map(mapAccessCode);
  }

  async saveAccessCodeRedemption(
    redemption: AccessCodeRedemptionRecord,
  ): Promise<void> {
    await this.query(
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

  async redeemAccessCode(
    code: AccessCodeRecord,
    redemption: AccessCodeRedemptionRecord,
  ): Promise<boolean> {
    if (redemption.accessCodeId !== code.id) {
      throw new Error("access_code_redemptions.accessCodeId must match access_codes.id");
    }

    const { rows } = await this.query<DbRow>(
      `
        with updated_code as (
          update access_codes
          set
            status = 'redeemed',
            redeemed_by_user_id = $2,
            redeemed_at = $3
          where id = $1
            and status = 'active'
            and redeemed_at is null
            and disabled_at is null
            and (expires_at is null or expires_at > $3)
          returning id, credits, tier, features
        ),
        inserted_redemption as (
          insert into access_code_redemptions (
            id, access_code_id, user_id, credit_ledger_id, credits,
            tier_granted, features_granted, redeemed_at, metadata
          )
          select
            $4,
            updated_code.id,
            $5,
            $6,
            updated_code.credits,
            updated_code.tier,
            updated_code.features,
            $7,
            $8::jsonb
          from updated_code
          returning id
        )
        select true as redeemed
        from inserted_redemption
      `,
      [
        code.id,
        code.redeemedByUserId ?? redemption.userId,
        redemption.redeemedAt,
        redemption.id,
        redemption.userId,
        redemption.creditLedgerId ?? null,
        redemption.redeemedAt,
        toJsonb(redemption.metadata),
      ],
    );

    return rows.length > 0;
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

    return this.runInTransaction(async () => {
      const codeRows = await this.query<DbRow>(
        `
          select id, credits, tier, features
          from access_codes
          where id = $1
            and status = 'active'
            and redeemed_at is null
            and disabled_at is null
            and (expires_at is null or expires_at > $2)
          for update
        `,
        [code.id, redemption.redeemedAt],
      );
      const lockedCode = codeRows.rows[0];
      if (!lockedCode) {
        return undefined;
      }
      const codeCredits = numberField(lockedCode, "credits", "access_codes");
      const codeTier = optionalStringField(
        lockedCode,
        "tier",
        "access_codes",
      ) as AccessCodeRedemptionRecord["tierGranted"] | undefined;
      const codeFeatures = arrayField(lockedCode, "features", "access_codes");

      await this.query(
        `
          update access_codes
          set
            status = 'redeemed',
            redeemed_by_user_id = $2,
            redeemed_at = $3
          where id = $1
        `,
        [code.id, code.redeemedByUserId ?? redemption.userId, redemption.redeemedAt],
      );

      const accountRows = await this.query<DbRow>(
        `
          update user_credit_accounts
          set
            balance = balance + $2,
            total_redeemed = total_redeemed + $2,
            updated_at = $3
          where user_id = $1
          returning
            user_id as account_user_id, balance, frozen_credits,
            total_redeemed, total_captured, updated_at
        `,
        [ledgerEntry.userId, codeCredits, ledgerEntry.createdAt],
      );
      const account = mapOptional(accountRows.rows[0], mapJoinedUserCreditAccount);
      if (!account) {
        throw new Error("user_credit_accounts.user_id must exist");
      }

      const ledgerRows = await this.query<DbRow>(
        `
          insert into credit_ledger (
            id, user_id, task_id, access_code_id, entry_type, amount,
            balance_after, frozen_after, idempotency_key, reason, metadata,
            created_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
          returning
            id, user_id, task_id, access_code_id, entry_type, amount,
            balance_after, frozen_after, idempotency_key, reason, metadata,
            created_at
        `,
        [
          ledgerEntry.id,
          account.userId,
          ledgerEntry.taskId ?? null,
          code.id,
          ledgerEntry.entryType,
          codeCredits,
          account.balance,
          account.frozenCredits,
          ledgerEntry.idempotencyKey,
          ledgerEntry.reason ?? null,
          toJsonb(ledgerEntry.metadata ?? {}),
          ledgerEntry.createdAt,
        ],
      );
      const ledger = mapCreditLedgerEntry(ledgerRows.rows[0]!);

      const redemptionRows = await this.query<DbRow>(
        `
          insert into access_code_redemptions (
            id, access_code_id, user_id, credit_ledger_id, credits,
            tier_granted, features_granted, redeemed_at, metadata
          )
          values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb)
          returning
            id as redemption_id, access_code_id as redemption_access_code_id,
            user_id as redemption_user_id,
            credit_ledger_id as redemption_credit_ledger_id,
            credits as redemption_credits, tier_granted as redemption_tier_granted,
            features_granted as redemption_features_granted,
            redeemed_at as redemption_redeemed_at,
            metadata as redemption_metadata
        `,
        [
          redemption.id,
          code.id,
          redemption.userId,
          ledger.id,
          codeCredits,
          codeTier ?? null,
          toJsonb(codeFeatures),
          redemption.redeemedAt,
          toJsonb(redemption.metadata),
        ],
      );
      const storedRedemption = mapAliasedAccessCodeRedemption(redemptionRows.rows[0]!);

      return { account, ledger, redemption: storedRedemption };
    });
  }

  async findAccessCodeRedemptionByCodeId(
    accessCodeId: string,
  ): Promise<AccessCodeRedemptionRecord | undefined> {
    const { rows } = await this.query<DbRow>(
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

  async disableAccessCodeWithAudit(
    codeId: string,
    disabledAt: string,
    auditLog: AdminAuditLogRecord,
  ): Promise<AccessCodeRecord | undefined> {
    const { rows } = await this.query<DbRow>(
      `
        with updated_code as (
          update access_codes
          set status = 'disabled', disabled_at = $2
          where id = $1
            and status = 'active'
            and redeemed_at is null
            and disabled_at is null
          returning
            id, batch_id, code_hash, code_mask, status, credits, tier,
            features, expires_at, redeemed_by_user_id, redeemed_at,
            disabled_at, created_at
        ),
        target_code as (
          select
            id, batch_id, code_hash, code_mask, status, credits, tier,
            features, expires_at, redeemed_by_user_id, redeemed_at,
            disabled_at, created_at
          from access_codes
          where id = $1
        ),
        inserted_audit as (
          insert into admin_audit_logs (
            id, actor_user_id, action, target_type, target_id, metadata,
            ip_hash, user_agent, created_at
          )
          select $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11
          from target_code
          returning id
        )
        select
          id, batch_id, code_hash, code_mask, status, credits, tier, features,
          expires_at, redeemed_by_user_id, redeemed_at, disabled_at, created_at
        from updated_code
        where exists (select 1 from inserted_audit)
        union all
        select
          target_code.id, target_code.batch_id, target_code.code_hash,
          target_code.code_mask, target_code.status, target_code.credits,
          target_code.tier, target_code.features, target_code.expires_at,
          target_code.redeemed_by_user_id, target_code.redeemed_at,
          target_code.disabled_at, target_code.created_at
        from target_code
        where not exists (select 1 from updated_code)
          and exists (select 1 from inserted_audit)
      `,
      [
        codeId,
        disabledAt,
        auditLog.id,
        auditLog.actorUserId ?? null,
        auditLog.action,
        auditLog.targetType,
        auditLog.targetId ?? null,
        toJsonb(auditLog.metadata),
        auditLog.ipHash ?? null,
        auditLog.userAgent ?? null,
        auditLog.createdAt,
      ],
    );

    return mapOptional(rows[0], mapAccessCode);
  }

  async disableAccessCodeBatchWithAudit(
    batchId: string,
    disabledAt: string,
    auditLog: AdminAuditLogRecord,
  ): Promise<
    | { batch: AccessCodeBatchRecord; disabledCodeCount: number }
    | undefined
  > {
    const { rows } = await this.query<DbRow>(
      `
        with updated_batch as (
          update access_code_batches
          set disabled_at = coalesce(disabled_at, $2)
          where id = $1
          returning
            id, created_by_user_id, name, source, code_count, credits, tier,
            features, expires_at, disabled_at, notes, metadata, created_at
        ),
        updated_codes as (
          update access_codes
          set status = 'disabled', disabled_at = $2
          where batch_id = $1
            and exists (select 1 from updated_batch)
            and status = 'active'
            and redeemed_at is null
            and disabled_at is null
          returning id
        ),
        disabled_count as (
          select count(*)::integer as "disabledCodeCount"
          from updated_codes
        ),
        inserted_audit as (
          insert into admin_audit_logs (
            id, actor_user_id, action, target_type, target_id, metadata,
            ip_hash, user_agent, created_at
          )
          select
            $3,
            $4,
            $5,
            $6,
            $7,
            ($8::jsonb || jsonb_build_object(
              'disabledCodeCount',
              disabled_count."disabledCodeCount"
            )),
            $9,
            $10,
            $11
          from updated_batch, disabled_count
          returning id
        )
        select
          updated_batch.id,
          updated_batch.created_by_user_id,
          updated_batch.name,
          updated_batch.source,
          updated_batch.code_count,
          updated_batch.credits,
          updated_batch.tier,
          updated_batch.features,
          updated_batch.expires_at,
          updated_batch.disabled_at,
          updated_batch.notes,
          updated_batch.metadata,
          updated_batch.created_at,
          disabled_count."disabledCodeCount"
        from updated_batch, disabled_count
        where exists (select 1 from inserted_audit)
      `,
      [
        batchId,
        disabledAt,
        auditLog.id,
        auditLog.actorUserId ?? null,
        auditLog.action,
        auditLog.targetType,
        auditLog.targetId ?? null,
        toJsonb(auditLog.metadata),
        auditLog.ipHash ?? null,
        auditLog.userAgent ?? null,
        auditLog.createdAt,
      ],
    );

    return mapOptional(rows[0], mapDisabledAccessCodeBatchResult);
  }

  async saveCommercialTask(
    task: CommercialSimulationTaskRecord,
  ): Promise<void> {
    await this.query(
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
    const { rows } = await this.query<DbRow>(
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
    await this.query(
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
    const { rows } = await this.query<DbRow>(
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
    await this.query(
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
    const { rows } = await this.query<DbRow>(
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
    await this.query(
      `
        insert into simulation_reports (
          id, task_id, user_id, public_report, deep_report, share_card,
          unlocked, created_at, updated_at
        )
        values (
          $1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9
        )
        on conflict (id) do update set
          -- Updates are keyed by stable id to match InMemoryCommercialRepository.
          -- A different id with the same task_id should surface the DB unique
          -- constraint instead of becoming a natural-key upsert.
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
    const { rows } = await this.query<DbRow>(
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
    await this.query(
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
    const { rows } = await this.query<DbRow>(
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
    await this.query(
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
    const { rows } = await this.query<DbRow>(
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
    await this.query(
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
          -- Updates are keyed by stable id to match InMemoryCommercialRepository.
          -- A different id with the same (user_id, provider) should surface the
          -- DB unique constraint instead of becoming a natural-key upsert.
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
    const { rows } = await this.query<DbRow>(
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
    await this.query(
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
    const { rows } = await this.query<DbRow>(
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
    assertAdminAuditAction(log.action);
    await this.query(
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
    const { rows } = await this.query<DbRow>(
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

  private async completeHeldCredits(input: {
    ledgerEntry: CreditLedgerEntryRecord;
    holdLedgerId: string;
    amount: number;
    entryType: "capture" | "release";
    balanceDelta: number;
    frozenDelta: number;
    capturedDelta: number;
    completionTypes: CreditLedgerEntryRecord["entryType"][];
  }): Promise<CreditLedgerTransitionResult | undefined> {
    const { ledgerEntry } = input;
    const ledgerMetadata = linkMetadata(ledgerEntry.metadata, {
      holdLedgerId: input.holdLedgerId,
    });
    return this.runInTransaction(async () => {
      const holdRows = await this.query<DbRow>(
        `
          select id, user_id, task_id, amount
          from credit_ledger
          where id = $1
            and user_id = $2
            and task_id = $3
            and entry_type = 'hold'
          for update
        `,
        [input.holdLedgerId, ledgerEntry.userId, ledgerEntry.taskId ?? null],
      );
      const hold = mapOptional(holdRows.rows[0], mapLockedCreditLedgerReference);
      if (!hold) {
        return undefined;
      }

      const completedRows = await this.query<DbRow>(
        `
          select id
          from credit_ledger
          where entry_type = any($2::text[])
            and metadata ->> 'holdLedgerId' = $1
          limit 1
        `,
        [hold.id, input.completionTypes],
      );
      if (completedRows.rows[0]) {
        return undefined;
      }

      const accountRows = await this.query<DbRow>(
        `
          update user_credit_accounts
          set
            balance = balance + $2,
            frozen_credits = frozen_credits + $3,
            total_captured = total_captured + $4,
            updated_at = $5
          where user_id = $1
            and frozen_credits + $3 >= 0
            and balance + $2 >= 0
          returning
            user_id as account_user_id, balance, frozen_credits,
            total_redeemed, total_captured, updated_at
        `,
        [
          hold.userId,
          input.balanceDelta,
          input.frozenDelta,
          input.capturedDelta,
          ledgerEntry.createdAt,
        ],
      );
      const account = mapOptional(accountRows.rows[0], mapJoinedUserCreditAccount);
      if (!account) {
        return undefined;
      }

      const ledgerRows = await this.query<DbRow>(
        `
          insert into credit_ledger (
            id, user_id, task_id, access_code_id, entry_type, amount,
            balance_after, frozen_after, idempotency_key, reason, metadata,
            created_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
          returning
            id, user_id, task_id, access_code_id, entry_type, amount,
            balance_after, frozen_after, idempotency_key, reason, metadata,
            created_at
        `,
        [
          ledgerEntry.id,
          account.userId,
          hold.taskId ?? null,
          ledgerEntry.accessCodeId ?? null,
          input.entryType,
          input.entryType === "capture" ? -input.amount : input.amount,
          account.balance,
          account.frozenCredits,
          ledgerEntry.idempotencyKey,
          ledgerEntry.reason ?? null,
          toJsonb(ledgerMetadata),
          ledgerEntry.createdAt,
        ],
      );
      const ledger = mapCreditLedgerEntry(ledgerRows.rows[0]!);

      return { account, ledger };
    });
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

function linkMetadata(
  metadata: CreditLedgerEntryRecord["metadata"],
  linkage: JsonObject,
): JsonObject {
  return {
    ...(metadata ?? {}),
    ...linkage,
  };
}

function assertAdminAuditAction(action: string): asserts action is AdminAuditAction {
  if (!ADMIN_AUDIT_ACTIONS.includes(action as AdminAuditAction)) {
    throw new Error("admin_audit_logs.action must be known");
  }
}

function toAccessCodeJson(code: AccessCodeRecord): JsonObject {
  return {
    id: code.id,
    batchId: code.batchId,
    codeHash: code.codeHash,
    codeMask: code.codeMask,
    status: code.status,
    credits: code.credits,
    tier: code.tier ?? null,
    features: code.features,
    expiresAt: code.expiresAt ?? null,
    redeemedByUserId: code.redeemedByUserId ?? null,
    redeemedAt: code.redeemedAt ?? null,
    disabledAt: code.disabledAt ?? null,
    createdAt: code.createdAt,
  };
}

function mapOptional<T>(row: DbRow | undefined, mapper: (row: DbRow) => T): T | undefined {
  return row === undefined ? undefined : mapper(row);
}

function rowValue(row: DbRow, field: string, table: string): DbValue {
  if (!Object.hasOwn(row, field)) {
    throw new Error(`${table}.${field} is required`);
  }

  return row[field];
}

function maybeString(value: DbValue, label: string): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }

  return value;
}

function maybeTimestamp(value: DbValue, label: string): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" && !(value instanceof Date)) {
    throw new Error(`${label} must be a timestamp`);
  }

  return value instanceof Date ? value.toISOString() : value;
}

function optionalStringField(
  row: DbRow,
  field: string,
  table: string,
): string | undefined {
  return maybeString(row[field], `${table}.${field}`);
}

function stringField(row: DbRow, field: string, table: string): string {
  const value = maybeString(rowValue(row, field, table), `${table}.${field}`);
  if (value === undefined) {
    throw new Error(`${table}.${field} is required`);
  }

  return value;
}

function optionalTimestampField(
  row: DbRow,
  field: string,
  table: string,
): string | undefined {
  return maybeTimestamp(row[field], `${table}.${field}`);
}

function timestampField(row: DbRow, field: string, table: string): string {
  const value = maybeTimestamp(rowValue(row, field, table), `${table}.${field}`);
  if (value === undefined) {
    throw new Error(`${table}.${field} is required`);
  }

  return value;
}

function optionalNumberField(
  row: DbRow,
  field: string,
  table: string,
): number | undefined {
  const value = row[field];
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" && typeof value !== "string") {
    throw new Error(`${table}.${field} must be a number`);
  }

  const numberValue = typeof value === "number" ? value : Number(value);
  if (typeof value === "string" && value.trim() === "") {
    throw new Error(`${table}.${field} must be a number`);
  }

  if (!Number.isFinite(numberValue)) {
    throw new Error(`${table}.${field} must be a number`);
  }

  return numberValue;
}

function numberField(row: DbRow, field: string, table: string): number {
  const value = optionalNumberField(row, field, table);
  if (value === undefined) {
    throw new Error(`${table}.${field} is required`);
  }

  return value;
}

function booleanField(row: DbRow, field: string, table: string): boolean {
  const value = rowValue(row, field, table);
  if (typeof value !== "boolean") {
    throw new Error(`${table}.${field} must be a boolean`);
  }

  return value;
}

function optionalJsonObjectField(
  row: DbRow,
  field: string,
  table: string,
): JsonObject | undefined {
  const value = row[field];
  if (value === null || value === undefined) {
    return undefined;
  }

  if (
    typeof value !== "object" ||
    Array.isArray(value) ||
    value instanceof Date
  ) {
    throw new Error(`${table}.${field} must be a JSON object`);
  }

  return value as JsonObject;
}

function jsonObjectField(row: DbRow, field: string, table: string): JsonObject {
  const value = optionalJsonObjectField(row, field, table);
  if (value === undefined) {
    throw new Error(`${table}.${field} is required`);
  }

  return value;
}

function arrayField<T>(row: DbRow, field: string, table: string): T[] {
  const value = row[field];
  if (!Array.isArray(value)) {
    throw new Error(`${table}.${field} must be an array`);
  }

  return value as T[];
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
  const table = "users";
  const record: CommercialUserRecord = {
    id: stringField(row, "id", table),
    email: stringField(row, "email", table),
    emailNormalized: stringField(row, "email_normalized", table),
    passwordHash: stringField(row, "password_hash", table),
    role: stringField(row, "role", table) as CommercialUserRecord["role"],
    tier: stringField(row, "tier", table) as CommercialUserRecord["tier"],
    status: stringField(row, "status", table) as CommercialUserRecord["status"],
    features: arrayField(row, "features", table),
    createdAt: timestampField(row, "created_at", table),
    updatedAt: timestampField(row, "updated_at", table),
  };
  assignIfDefined(
    record,
    "lastLoginAt",
    optionalTimestampField(row, "last_login_at", table),
  );
  return record;
}

function mapCommercialSession(row: DbRow): CommercialSessionRecord {
  const table = "user_sessions";
  const record: CommercialSessionRecord = {
    id: stringField(row, "id", table),
    userId: stringField(row, "user_id", table),
    tokenHash: stringField(row, "token_hash", table),
    expiresAt: timestampField(row, "expires_at", table),
    createdAt: timestampField(row, "created_at", table),
  };
  assignIfDefined(record, "userAgent", optionalStringField(row, "user_agent", table));
  assignIfDefined(record, "ipHash", optionalStringField(row, "ip_hash", table));
  assignIfDefined(record, "revokedAt", optionalTimestampField(row, "revoked_at", table));
  return record;
}

function mapUserCreditAccount(row: DbRow): UserCreditAccountRecord {
  const table = "user_credit_accounts";
  return {
    userId: stringField(row, "user_id", table),
    balance: numberField(row, "balance", table),
    frozenCredits: numberField(row, "frozen_credits", table),
    totalRedeemed: numberField(row, "total_redeemed", table),
    totalCaptured: numberField(row, "total_captured", table),
    updatedAt: timestampField(row, "updated_at", table),
  };
}

function mapJoinedUserCreditAccount(row: DbRow): UserCreditAccountRecord {
  const table = "user_credit_accounts";
  return {
    userId: stringField(row, "account_user_id", table),
    balance: numberField(row, "balance", table),
    frozenCredits: numberField(row, "frozen_credits", table),
    totalRedeemed: numberField(row, "total_redeemed", table),
    totalCaptured: numberField(row, "total_captured", table),
    updatedAt: timestampField(row, "updated_at", table),
  };
}

function mapCreditLedgerEntry(row: DbRow): CreditLedgerEntryRecord {
  const table = "credit_ledger";
  const record: CreditLedgerEntryRecord = {
    id: stringField(row, "id", table),
    userId: stringField(row, "user_id", table),
    entryType: stringField(
      row,
      "entry_type",
      table,
    ) as CreditLedgerEntryRecord["entryType"],
    amount: numberField(row, "amount", table),
    balanceAfter: numberField(row, "balance_after", table),
    idempotencyKey: stringField(row, "idempotency_key", table),
    createdAt: timestampField(row, "created_at", table),
  };
  assignIfDefined(record, "taskId", optionalStringField(row, "task_id", table));
  assignIfDefined(record, "accessCodeId", optionalStringField(row, "access_code_id", table));
  assignIfDefined(record, "frozenAfter", optionalNumberField(row, "frozen_after", table));
  assignIfDefined(record, "reason", optionalStringField(row, "reason", table));
  assignIfDefined(record, "metadata", optionalJsonObjectField(row, "metadata", table));
  return record;
}

function mapCreditLedgerTransition(row: DbRow): CreditLedgerTransitionResult {
  return {
    account: mapJoinedUserCreditAccount(row),
    ledger: mapCreditLedgerEntry(row),
  };
}

function mapCreditLedgerTransitionWithRedemption(
  row: DbRow,
): RedeemAccessCodeWithCreditLedgerResult {
  return {
    ...mapCreditLedgerTransition(row),
    redemption: {
      id: stringField(row, "redemption_id", "access_code_redemptions"),
      accessCodeId: stringField(
        row,
        "redemption_access_code_id",
        "access_code_redemptions",
      ),
      userId: stringField(row, "redemption_user_id", "access_code_redemptions"),
      creditLedgerId: stringField(
        row,
        "redemption_credit_ledger_id",
        "access_code_redemptions",
      ),
      credits: numberField(row, "redemption_credits", "access_code_redemptions"),
      featuresGranted: arrayField(
        row,
        "redemption_features_granted",
        "access_code_redemptions",
      ),
      redeemedAt: timestampField(
        row,
        "redemption_redeemed_at",
        "access_code_redemptions",
      ),
      metadata: jsonObjectField(
        row,
        "redemption_metadata",
        "access_code_redemptions",
      ),
      ...(optionalStringField(
        row,
        "redemption_tier_granted",
        "access_code_redemptions",
      ) !== undefined
        ? {
            tierGranted: optionalStringField(
              row,
              "redemption_tier_granted",
              "access_code_redemptions",
            ) as AccessCodeRedemptionRecord["tierGranted"],
          }
        : {}),
    },
  };
}

function mapAliasedAccessCodeRedemption(row: DbRow): AccessCodeRedemptionRecord {
  const table = "access_code_redemptions";
  const record: AccessCodeRedemptionRecord = {
    id: stringField(row, "redemption_id", table),
    accessCodeId: stringField(row, "redemption_access_code_id", table),
    userId: stringField(row, "redemption_user_id", table),
    creditLedgerId: stringField(row, "redemption_credit_ledger_id", table),
    credits: numberField(row, "redemption_credits", table),
    featuresGranted: arrayField(row, "redemption_features_granted", table),
    redeemedAt: timestampField(row, "redemption_redeemed_at", table),
    metadata: jsonObjectField(row, "redemption_metadata", table),
  };
  assignIfDefined(
    record,
    "tierGranted",
    optionalStringField(row, "redemption_tier_granted", table) as
      | AccessCodeRedemptionRecord["tierGranted"]
      | undefined,
  );
  return record;
}

function mapLockedCreditLedgerReference(row: DbRow): {
  id: string;
  userId: string;
  taskId?: string;
  amount: number;
} {
  const table = "credit_ledger";
  const record = {
    id: stringField(row, "id", table),
    userId: stringField(row, "user_id", table),
    amount: numberField(row, "amount", table),
  };
  return {
    ...record,
    ...(optionalStringField(row, "task_id", table) !== undefined
      ? { taskId: optionalStringField(row, "task_id", table) }
      : {}),
  };
}

function mapAccessCodeBatch(row: DbRow): AccessCodeBatchRecord {
  const table = "access_code_batches";
  const record: AccessCodeBatchRecord = {
    id: stringField(row, "id", table),
    name: stringField(row, "name", table),
    codeCount: numberField(row, "code_count", table),
    credits: numberField(row, "credits", table),
    features: arrayField(row, "features", table),
    metadata: jsonObjectField(row, "metadata", table),
    createdAt: timestampField(row, "created_at", table),
  };
  assignIfDefined(record, "createdByUserId", optionalStringField(row, "created_by_user_id", table));
  assignIfDefined(record, "source", optionalStringField(row, "source", table));
  assignIfDefined(record, "tier", optionalStringField(row, "tier", table) as AccessCodeBatchRecord["tier"]);
  assignIfDefined(record, "expiresAt", optionalTimestampField(row, "expires_at", table));
  assignIfDefined(record, "disabledAt", optionalTimestampField(row, "disabled_at", table));
  assignIfDefined(record, "notes", optionalStringField(row, "notes", table));
  return record;
}

function mapAccessCode(row: DbRow): AccessCodeRecord {
  const table = "access_codes";
  const record: AccessCodeRecord = {
    id: stringField(row, "id", table),
    batchId: stringField(row, "batch_id", table),
    codeHash: stringField(row, "code_hash", table),
    codeMask: stringField(row, "code_mask", table),
    status: stringField(row, "status", table) as AccessCodeRecord["status"],
    credits: numberField(row, "credits", table),
    features: arrayField(row, "features", table),
    createdAt: timestampField(row, "created_at", table),
  };
  assignIfDefined(record, "tier", optionalStringField(row, "tier", table) as AccessCodeRecord["tier"]);
  assignIfDefined(record, "expiresAt", optionalTimestampField(row, "expires_at", table));
  assignIfDefined(record, "redeemedByUserId", optionalStringField(row, "redeemed_by_user_id", table));
  assignIfDefined(record, "redeemedAt", optionalTimestampField(row, "redeemed_at", table));
  assignIfDefined(record, "disabledAt", optionalTimestampField(row, "disabled_at", table));
  return record;
}

function mapAccessCodeRedemption(row: DbRow): AccessCodeRedemptionRecord {
  const table = "access_code_redemptions";
  const record: AccessCodeRedemptionRecord = {
    id: stringField(row, "id", table),
    accessCodeId: stringField(row, "access_code_id", table),
    userId: stringField(row, "user_id", table),
    credits: numberField(row, "credits", table),
    featuresGranted: arrayField(row, "features_granted", table),
    redeemedAt: timestampField(row, "redeemed_at", table),
    metadata: jsonObjectField(row, "metadata", table),
  };
  assignIfDefined(record, "creditLedgerId", optionalStringField(row, "credit_ledger_id", table));
  assignIfDefined(record, "tierGranted", optionalStringField(row, "tier_granted", table) as AccessCodeRedemptionRecord["tierGranted"]);
  return record;
}

function mapDisabledAccessCodeBatchResult(row: DbRow): {
  batch: AccessCodeBatchRecord;
  disabledCodeCount: number;
} {
  return {
    batch: mapAccessCodeBatch(row),
    disabledCodeCount: numberField(
      row,
      Object.hasOwn(row, "disabledCodeCount")
        ? "disabledCodeCount"
        : "disabled_code_count",
      "access_code_batches",
    ),
  };
}

function mapCommercialTask(row: DbRow): CommercialSimulationTaskRecord {
  const table = "simulation_tasks";
  const record: CommercialSimulationTaskRecord = {
    id: stringField(row, "id", table),
    userId: stringField(row, "user_id", table),
    scenarioType: stringField(
      row,
      "scenario_type",
      table,
    ) as CommercialSimulationTaskRecord["scenarioType"],
    interactionMode: stringField(
      row,
      "interaction_mode",
      table,
    ) as CommercialSimulationTaskRecord["interactionMode"],
    providerMode: stringField(
      row,
      "provider_mode",
      table,
    ) as CommercialSimulationTaskRecord["providerMode"],
    status: stringField(row, "status", table) as CommercialSimulationTaskRecord["status"],
    creditCost: numberField(row, "credit_cost", table),
    createdAt: timestampField(row, "created_at", table),
    updatedAt: timestampField(row, "updated_at", table),
  };
  assignIfDefined(record, "creditHoldLedgerId", optionalStringField(row, "credit_hold_ledger_id", table));
  assignIfDefined(record, "priority", optionalNumberField(row, "priority", table));
  assignIfDefined(record, "queueWeight", optionalNumberField(row, "queue_weight", table));
  assignIfDefined(record, "idempotencyKey", optionalStringField(row, "idempotency_key", table));
  assignIfDefined(record, "inputSummary", optionalJsonObjectField(row, "input_summary", table));
  assignIfDefined(record, "errorCode", optionalStringField(row, "error_code", table));
  assignIfDefined(record, "queuedAt", optionalTimestampField(row, "queued_at", table));
  assignIfDefined(record, "startedAt", optionalTimestampField(row, "started_at", table));
  assignIfDefined(record, "completedAt", optionalTimestampField(row, "completed_at", table));
  return record;
}

function mapSimulationTaskRun(row: DbRow): SimulationTaskRunRecord {
  const table = "simulation_task_runs";
  const record: SimulationTaskRunRecord = {
    id: stringField(row, "id", table),
    taskId: stringField(row, "task_id", table),
    status: stringField(row, "status", table) as SimulationTaskRunRecord["status"],
    startedAt: timestampField(row, "started_at", table),
  };
  assignIfDefined(record, "workerId", optionalStringField(row, "worker_id", table));
  assignIfDefined(record, "attempt", optionalNumberField(row, "attempt", table));
  assignIfDefined(record, "errorCode", optionalStringField(row, "error_code", table));
  assignIfDefined(record, "completedAt", optionalTimestampField(row, "completed_at", table));
  assignIfDefined(record, "metadata", optionalJsonObjectField(row, "metadata", table));
  return record;
}

function mapSimulationStepRunCost(row: DbRow): SimulationStepRunCostRecord {
  const table = "simulation_step_runs";
  const record: SimulationStepRunCostRecord = {
    id: stringField(row, "id", table),
    taskId: stringField(row, "task_id", table),
    stepName: stringField(row, "step_name", table),
    status: stringField(row, "status", table) as SimulationStepRunCostRecord["status"],
    startedAt: timestampField(row, "started_at", table),
  };
  assignIfDefined(record, "taskRunId", optionalStringField(row, "task_run_id", table));
  assignIfDefined(record, "stageIndex", optionalNumberField(row, "stage_index", table));
  assignIfDefined(record, "roundIndex", optionalNumberField(row, "round_index", table));
  assignIfDefined(record, "agentId", optionalStringField(row, "agent_id", table));
  assignIfDefined(record, "provider", optionalStringField(row, "provider", table));
  assignIfDefined(record, "modelId", optionalStringField(row, "model_id", table));
  assignIfDefined(record, "modelProfileId", optionalStringField(row, "model_profile_id", table));
  assignIfDefined(record, "promptTokens", optionalNumberField(row, "prompt_tokens", table));
  assignIfDefined(record, "completionTokens", optionalNumberField(row, "completion_tokens", table));
  assignIfDefined(record, "totalTokens", optionalNumberField(row, "total_tokens", table));
  assignIfDefined(record, "cachedTokens", optionalNumberField(row, "cached_tokens", table));
  assignIfDefined(record, "estimatedCost", optionalNumberField(row, "estimated_cost", table));
  assignIfDefined(record, "latencyMs", optionalNumberField(row, "latency_ms", table));
  assignIfDefined(record, "retryCount", optionalNumberField(row, "retry_count", table));
  assignIfDefined(record, "errorCode", optionalStringField(row, "error_code", table));
  assignIfDefined(record, "completedAt", optionalTimestampField(row, "completed_at", table));
  assignIfDefined(record, "metadata", optionalJsonObjectField(row, "metadata", table));
  return record;
}

function mapCommercialReport(row: DbRow): CommercialSimulationReportRecord {
  const table = "simulation_reports";
  const record: CommercialSimulationReportRecord = {
    id: stringField(row, "id", table),
    taskId: stringField(row, "task_id", table),
    userId: stringField(row, "user_id", table),
    unlocked: booleanField(row, "unlocked", table),
    createdAt: timestampField(row, "created_at", table),
    updatedAt: timestampField(row, "updated_at", table),
  };
  assignIfDefined(
    record,
    "publicReport",
    optionalJsonObjectField(row, "public_report", table) as unknown as
      | CommercialSimulationReportRecord["publicReport"]
      | undefined,
  );
  assignIfDefined(
    record,
    "deepReport",
    optionalJsonObjectField(row, "deep_report", table) as
      | CommercialSimulationReportRecord["deepReport"]
      | undefined,
  );
  assignIfDefined(record, "shareCard", optionalJsonObjectField(row, "share_card", table));
  return record;
}

function mapAnalyticsEvent(row: DbRow): AnalyticsEventRecord {
  const table = "analytics_events";
  const record: AnalyticsEventRecord = {
    id: stringField(row, "id", table),
    eventType: stringField(row, "event_type", table),
    properties: jsonObjectField(row, "properties", table),
    occurredAt: timestampField(row, "occurred_at", table),
  };
  assignIfDefined(record, "userId", optionalStringField(row, "user_id", table));
  assignIfDefined(record, "taskId", optionalStringField(row, "task_id", table));
  assignIfDefined(record, "sessionId", optionalStringField(row, "session_id", table));
  assignIfDefined(record, "source", optionalStringField(row, "source", table));
  return record;
}

function mapUserFeedback(row: DbRow): UserFeedbackRecord {
  const table = "user_feedback";
  const record: UserFeedbackRecord = {
    id: stringField(row, "id", table),
    metadata: jsonObjectField(row, "metadata", table),
    createdAt: timestampField(row, "created_at", table),
  };
  assignIfDefined(record, "userId", optionalStringField(row, "user_id", table));
  assignIfDefined(record, "taskId", optionalStringField(row, "task_id", table));
  assignIfDefined(record, "reportId", optionalStringField(row, "report_id", table));
  assignIfDefined(record, "rating", optionalNumberField(row, "rating", table));
  assignIfDefined(record, "feedbackType", optionalStringField(row, "feedback_type", table));
  assignIfDefined(record, "comment", optionalStringField(row, "comment", table));
  return record;
}

function mapUserModelProvider(row: DbRow): UserModelProviderRecord {
  const table = "user_model_providers";
  const record: UserModelProviderRecord = {
    id: stringField(row, "id", table),
    userId: stringField(row, "user_id", table),
    provider: stringField(row, "provider", table),
    displayName: stringField(row, "display_name", table),
    baseUrl: stringField(row, "base_url", table),
    encryptedApiKey: stringField(row, "encrypted_api_key", table),
    apiKeyMask: stringField(row, "api_key_mask", table),
    status: stringField(row, "status", table) as UserModelProviderRecord["status"],
    createdAt: timestampField(row, "created_at", table),
    updatedAt: timestampField(row, "updated_at", table),
  };
  assignIfDefined(record, "modelFast", optionalStringField(row, "model_fast", table));
  assignIfDefined(record, "modelBalanced", optionalStringField(row, "model_balanced", table));
  assignIfDefined(record, "modelDeep", optionalStringField(row, "model_deep", table));
  assignIfDefined(record, "lastTestedAt", optionalTimestampField(row, "last_tested_at", table));
  assignIfDefined(record, "lastTestStatus", optionalStringField(row, "last_test_status", table) as UserModelProviderRecord["lastTestStatus"]);
  return record;
}

function mapSystemSetting(row: DbRow): SystemSettingRecord {
  const table = "system_settings";
  const record: SystemSettingRecord = {
    key: stringField(row, "key", table),
    value: rowValue(row, "value", table),
    createdAt: timestampField(row, "created_at", table),
    updatedAt: timestampField(row, "updated_at", table),
  };
  assignIfDefined(record, "description", optionalStringField(row, "description", table));
  assignIfDefined(record, "updatedByUserId", optionalStringField(row, "updated_by_user_id", table));
  return record;
}

function mapAdminAuditLog(row: DbRow): AdminAuditLogRecord {
  const table = "admin_audit_logs";
  const action = stringField(row, "action", table);
  assertAdminAuditAction(action);
  const record: AdminAuditLogRecord = {
    id: stringField(row, "id", table),
    action,
    targetType: stringField(row, "target_type", table),
    metadata: jsonObjectField(row, "metadata", table),
    createdAt: timestampField(row, "created_at", table),
  };
  assignIfDefined(record, "actorUserId", optionalStringField(row, "actor_user_id", table));
  assignIfDefined(record, "targetId", optionalStringField(row, "target_id", table));
  assignIfDefined(record, "ipHash", optionalStringField(row, "ip_hash", table));
  assignIfDefined(record, "userAgent", optionalStringField(row, "user_agent", table));
  return record;
}
