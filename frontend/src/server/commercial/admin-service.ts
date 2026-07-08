import type {
  AccessCodeStatus,
  CommercialFeature,
  CommercialTaskStatus,
  UserRole,
  UserTier,
} from "../../contracts/commercial.js";
import type {
  AccessCodeService,
  CreateAccessCodeBatchInput,
} from "./access-code-service.js";
import type { AdminAuditService } from "./audit-service.js";
import type { CreditService, CreditTransitionResult } from "./credit-service.js";
import type { CommercialRepository } from "./repository.js";
import type {
  QueueSummary,
  WorkerMonitoringService,
} from "./worker-monitoring.js";
import type {
  AccessCodeBatchRecord,
  AccessCodeRecord,
  AdminAuditLogRecord,
  CommercialSimulationReportRecord,
  CommercialSimulationTaskRecord,
  CommercialUserRecord,
  CreditLedgerEntryRecord,
  JsonObject,
  SimulationStepRunCostRecord,
  SystemSettingRecord,
  UserFeedbackRecord,
  UserCreditAccountRecord,
} from "./types.js";

export type CommercialAdminServiceErrorCode =
  | "invalid_admin_input"
  | "user_not_found"
  | "task_not_found"
  | "report_not_found";

export class CommercialAdminServiceError extends Error {
  readonly code: CommercialAdminServiceErrorCode;

  constructor(code: CommercialAdminServiceErrorCode, message: string) {
    super(message);
    this.name = "CommercialAdminServiceError";
    this.code = code;
  }
}

export interface CommercialAdminServiceOptions {
  repository: CommercialRepository;
  accessCodeService: AccessCodeService;
  creditService: CreditService;
  auditService: AdminAuditService;
  workerMonitoringService?: WorkerMonitoringService;
  now?: () => Date | string;
}

export interface AdminRequestContext {
  ipHash?: string;
  userAgent?: string;
}

export interface AdminUserSummary {
  id: string;
  email: string;
  emailNormalized: string;
  role: UserRole;
  tier: UserTier;
  status: CommercialUserRecord["status"];
  features: CommercialFeature[];
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
  creditAccount?: Omit<UserCreditAccountRecord, "userId">;
  taskSummary: {
    total: number;
    completed: number;
    failed: number;
    active: number;
  };
}

export interface AdminListUsersInput {
  search?: string;
  status?: CommercialUserRecord["status"];
  tier?: UserTier;
  role?: UserRole;
  limit?: number;
  offset?: number;
}

export interface AdminListUsersResult {
  total: number;
  items: AdminUserSummary[];
}

export interface AdminOverview {
  users: {
    total: number;
    active: number;
    disabled: number;
    redeemed: number;
  };
  tasks: {
    total: number;
    byStatus: Record<CommercialTaskStatus, number>;
    completionRate: number;
    failureRate: number;
  };
  credits: {
    totalBalance: number;
    totalFrozen: number;
    totalRedeemed: number;
    consumed: number;
  };
  costs: {
    estimatedTotal: number;
  };
  queue: {
    backlog: number;
    oldestQueuedAt?: string;
  } & Partial<QueueSummary>;
  accessCodes: {
    total: number;
    active: number;
    redeemed: number;
    disabled: number;
    expired: number;
  };
}

export interface AdminCreateAccessCodeBatchInput
  extends CreateAccessCodeBatchInput {
  actorUserId: string;
  requestContext?: AdminRequestContext;
}

export interface AdminCreatedAccessCode {
  id: string;
  rawCode: string;
  codeMask: string;
  status: AccessCodeStatus;
  credits: number;
  tier?: UserTier;
  features: CommercialFeature[];
  expiresAt?: string;
  createdAt: string;
}

export interface AdminCreateAccessCodeBatchResult {
  batch: AccessCodeBatchRecord;
  codes: AdminCreatedAccessCode[];
}

export interface AdminDisableAccessCodeBatchInput {
  actorUserId: string;
  batchId: string;
  reason: string;
  requestContext?: AdminRequestContext;
}

export interface AdminAdjustUserCreditsInput {
  actorUserId: string;
  userId: string;
  amount: number;
  reason: string;
  idempotencyKey: string;
  metadata?: JsonObject;
}

export interface AdminUserStatusInput {
  actorUserId: string;
  userId: string;
  reason: string;
  requestContext?: AdminRequestContext;
}

export interface AdminTaskDetailInput {
  actorUserId: string;
  taskId: string;
  includeSensitiveReportSummary?: boolean;
  requestContext?: AdminRequestContext;
}

export interface AdminSensitiveReportSummary {
  reportId: string;
  unlocked: boolean;
  hasPublicReport: boolean;
  hasDeepReport: boolean;
  deepReportTopLevelKeys: string[];
  deepReportEstimatedBytes: number;
}

export interface AdminTaskDetail {
  task: CommercialSimulationTaskRecord;
  user?: AdminUserSummary;
  runs: Awaited<ReturnType<CommercialRepository["listSimulationTaskRuns"]>>;
  stepCosts: SimulationStepRunCostRecord[];
  report?: Pick<
    CommercialSimulationReportRecord,
    "id" | "taskId" | "userId" | "unlocked" | "createdAt" | "updatedAt"
  > & {
    hasPublicReport: boolean;
    hasDeepReport: boolean;
    hasShareCard: boolean;
  };
  sensitiveReportSummary?: AdminSensitiveReportSummary;
}

export interface AdminUserDetail {
  user: AdminUserSummary;
  creditAccount?: UserCreditAccountRecord;
  tasks: CommercialSimulationTaskRecord[];
  creditLedger: CreditLedgerEntryRecord[];
  redemptions: Array<{
    accessCodeId: string;
    batchId: string;
    codeMask: string;
    credits: number;
    redeemedAt: string;
  }>;
}

export interface AdminAccessCodeBatchSummary {
  id: string;
  name: string;
  source?: string;
  codeCount: number;
  credits: number;
  tier?: UserTier;
  features: CommercialFeature[];
  expiresAt?: string;
  disabledAt?: string;
  notes?: string;
  createdAt: string;
  status: "active" | "disabled" | "expired";
  redeemedCount: number;
  activeCount: number;
  disabledCount: number;
  expiredCount: number;
  redemptionRate: number;
}

export interface AdminTaskTimelineItem {
  label: string;
  at: string;
}

export interface AdminTaskStepCost {
  stepName: string;
  provider: string;
  modelId: string;
  tokens: number;
  estimatedCost: number;
  status: "completed" | "failed" | "skipped";
}

export interface AdminTaskRow {
  id: string;
  userEmail: string;
  scenarioType: string;
  interactionMode: string;
  providerMode: string;
  status: CommercialTaskStatus;
  queueWaitMs?: number;
  runDurationMs?: number;
  credits: number;
  promptTokens: number;
  completionTokens: number;
  estimatedCost: number;
  errorCode?: string;
  workerId?: string;
  createdAt?: string;
  timeline: AdminTaskTimelineItem[];
  stepCosts: AdminTaskStepCost[];
}

export interface AdminCostGroup {
  key: string;
  cost: number;
  tokens: number;
}

export interface AdminCostSummary {
  totalEstimatedCost: number;
  providerGroups: AdminCostGroup[];
  modelGroups: AdminCostGroup[];
  stepGroups: AdminCostGroup[];
  taskGroups: AdminCostGroup[];
  outcomeGroups: AdminCostGroup[];
}

export interface AdminCreditAccountSummary {
  userId: string;
  userEmail: string;
  balance: number;
  frozenCredits: number;
  totalRedeemed: number;
  totalCaptured: number;
  updatedAt: string;
}

export interface AdminCreditLedgerSummary {
  id: string;
  userId: string;
  userEmail: string;
  taskId?: string;
  accessCodeId?: string;
  entryType: CreditLedgerEntryRecord["entryType"];
  amount: number;
  balanceAfter: number;
  frozenAfter?: number;
  idempotencyKey: string;
  reason?: string;
  createdAt: string;
}

export interface AdminCreditOperations {
  accounts: AdminCreditAccountSummary[];
  ledger: AdminCreditLedgerSummary[];
}

export interface AdminFeedbackItem {
  id: string;
  userId?: string;
  userEmail?: string;
  taskId?: string;
  reportId?: string;
  rating?: number;
  feedbackType?: string;
  comment?: string;
  metadata: JsonObject;
  createdAt: string;
}

export interface AdminFeedbackSummary {
  total: number;
  averageRating: number;
  withComments: number;
}

export interface AdminFeedbackResult {
  summary: AdminFeedbackSummary;
  items: AdminFeedbackItem[];
}

export interface AdminSettingItem {
  key: string;
  value: unknown;
  description?: string;
  updatedByUserId?: string;
  configured: boolean;
  updatedAt?: string;
}

export interface AdminSettingsResult {
  items: AdminSettingItem[];
}

const TASK_STATUSES: CommercialTaskStatus[] = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
  "refunded",
];

const KNOWN_SYSTEM_SETTING_KEYS: Array<{
  key: string;
  description: string;
}> = [
  { key: "queue.paused", description: "Pause commercial queue" },
  { key: "commercial.mode", description: "Commercial mode runtime flag" },
  { key: "access_codes.disabled", description: "Disable access-code redemption" },
  { key: "support.banner", description: "Operator support banner" },
];

export class CommercialAdminService {
  private readonly repository: CommercialRepository;
  private readonly accessCodeService: AccessCodeService;
  private readonly creditService: CreditService;
  private readonly auditService: AdminAuditService;
  private readonly workerMonitoringService?: WorkerMonitoringService;
  private readonly now: () => Date | string;

  constructor(options: CommercialAdminServiceOptions) {
    this.repository = options.repository;
    this.accessCodeService = options.accessCodeService;
    this.creditService = options.creditService;
    this.auditService = options.auditService;
    this.workerMonitoringService = options.workerMonitoringService;
    this.now = options.now ?? (() => new Date());
  }

  async getOverview(): Promise<AdminOverview> {
    const [
      users,
      accounts,
      tasks,
      creditLedger,
      costs,
      accessCodes,
      queueSummary,
    ] = await Promise.all([
      this.repository.listUsers(),
      this.repository.listCreditAccounts(),
      this.repository.listCommercialTasks(),
      this.repository.listCreditLedgerEntries(),
      this.repository.listSimulationStepRunCosts(),
      this.repository.listAccessCodes(),
      this.workerMonitoringService?.getQueueSummary(),
    ]);

    const tasksByStatus = emptyTaskStatusCounts();
    for (const task of tasks) {
      tasksByStatus[task.status] += 1;
    }
    const accessCodeCounts = emptyAccessCodeStatusCounts();
    const redeemedUserIds = new Set<string>();
    for (const code of accessCodes) {
      accessCodeCounts[code.status] += 1;
      if (code.redeemedByUserId !== undefined) {
        redeemedUserIds.add(code.redeemedByUserId);
      }
    }

    return {
      users: {
        total: users.length,
        active: users.filter((user) => user.status === "active").length,
        disabled: users.filter((user) => user.status === "disabled").length,
        redeemed: redeemedUserIds.size,
      },
      tasks: {
        total: tasks.length,
        byStatus: tasksByStatus,
        completionRate: rate(tasksByStatus.completed, tasks.length),
        failureRate: rate(tasksByStatus.failed, tasks.length),
      },
      credits: {
        totalBalance: sum(accounts, (account) => account.balance),
        totalFrozen: sum(accounts, (account) => account.frozenCredits),
        totalRedeemed: sum(accounts, (account) => account.totalRedeemed),
        consumed: Math.abs(
          sum(
            creditLedger.filter((entry) => entry.entryType === "capture"),
            (entry) => entry.amount,
          ),
        ),
      },
      costs: {
        estimatedTotal: roundMoney(sum(costs, (cost) => cost.estimatedCost ?? 0)),
      },
      queue: {
        backlog: (queueSummary?.queued ?? tasksByStatus.queued) + (queueSummary?.running ?? tasksByStatus.running),
        ...oldestQueuedAt(tasks),
        ...(queueSummary ?? {}),
      },
      accessCodes: {
        total: accessCodes.length,
        ...accessCodeCounts,
      },
    };
  }

  async listUsers(input: AdminListUsersInput = {}): Promise<AdminListUsersResult> {
    const [users, accounts, tasks] = await Promise.all([
      this.repository.listUsers(),
      this.repository.listCreditAccounts(),
      this.repository.listCommercialTasks(),
    ]);
    const accountByUserId = new Map(accounts.map((account) => [account.userId, account]));
    const tasksByUserId = groupBy(tasks, (task) => task.userId);
    const search = input.search?.trim().toLowerCase();

    const filtered = users.filter((user) => {
      if (input.status !== undefined && user.status !== input.status) return false;
      if (input.tier !== undefined && user.tier !== input.tier) return false;
      if (input.role !== undefined && user.role !== input.role) return false;
      if (
        search !== undefined &&
        !user.email.toLowerCase().includes(search) &&
        !user.emailNormalized.toLowerCase().includes(search) &&
        !user.id.toLowerCase().includes(search)
      ) {
        return false;
      }
      return true;
    });

    const offset = input.offset ?? 0;
    const limit = input.limit ?? filtered.length;
    return {
      total: filtered.length,
      items: filtered
        .slice(offset, offset + limit)
        .map((user) =>
          toAdminUserSummary(user, accountByUserId.get(user.id), tasksByUserId.get(user.id) ?? []),
        ),
    };
  }

  async getUserDetail(userId: string): Promise<AdminUserDetail> {
    validateRequired(userId, "User id");
    const user = await this.repository.getUser(userId);
    if (!user) {
      throw new CommercialAdminServiceError("user_not_found", "User not found");
    }
    const [account, tasks, ledger, accessCodes] = await Promise.all([
      this.repository.getCreditAccount(userId),
      this.repository.listCommercialTasks(userId),
      this.repository.listCreditLedgerEntries(userId),
      this.repository.listAccessCodes(),
    ]);

    return {
      user: toAdminUserSummary(user, account, tasks),
      ...(account !== undefined ? { creditAccount: account } : {}),
      tasks,
      creditLedger: ledger,
      redemptions: accessCodes
        .filter((code) => code.redeemedByUserId === userId && code.redeemedAt !== undefined)
        .map((code) => ({
          accessCodeId: code.id,
          batchId: code.batchId,
          codeMask: code.codeMask,
          credits: code.credits,
          redeemedAt: code.redeemedAt!,
        })),
    };
  }

  async listAccessCodeBatches(): Promise<AdminAccessCodeBatchSummary[]> {
    const [batches, codes] = await Promise.all([
      this.repository.listAccessCodeBatches(),
      this.repository.listAccessCodes(),
    ]);
    const codesByBatchId = groupBy(codes, (code) => code.batchId);
    const now = this.currentDate();

    return batches.map((batch) =>
      toAdminAccessCodeBatchSummary(batch, codesByBatchId.get(batch.id) ?? [], now),
    );
  }

  async listTasks(): Promise<AdminTaskRow[]> {
    const [tasks, users, allCosts] = await Promise.all([
      this.repository.listCommercialTasks(),
      this.repository.listUsers(),
      this.repository.listSimulationStepRunCosts(),
    ]);
    const usersById = new Map(users.map((user) => [user.id, user]));
    const costsByTaskId = groupBy(allCosts, (cost) => cost.taskId);

    return Promise.all(
      tasks.map(async (task) => {
        const runs = await this.repository.listSimulationTaskRuns(task.id);
        return toAdminTaskRow(
          task,
          usersById.get(task.userId),
          runs,
          costsByTaskId.get(task.id) ?? [],
        );
      }),
    );
  }

  async getCostSummary(): Promise<AdminCostSummary> {
    const [costs, tasks] = await Promise.all([
      this.repository.listSimulationStepRunCosts(),
      this.repository.listCommercialTasks(),
    ]);
    const tasksById = new Map(tasks.map((task) => [task.id, task]));

    return {
      totalEstimatedCost: roundMoney(sum(costs, (cost) => cost.estimatedCost ?? 0)),
      providerGroups: groupCosts(costs, (cost) => cost.provider ?? "unknown"),
      modelGroups: groupCosts(costs, (cost) => cost.modelId ?? "unknown"),
      stepGroups: groupCosts(costs, (cost) => cost.stepName),
      taskGroups: groupCosts(costs, (cost) => cost.taskId),
      outcomeGroups: groupCosts(
        costs,
        (cost) => tasksById.get(cost.taskId)?.status ?? cost.status,
      ),
    };
  }

  async getCreditOperations(): Promise<AdminCreditOperations> {
    const [accounts, ledger, users] = await Promise.all([
      this.repository.listCreditAccounts(),
      this.repository.listCreditLedgerEntries(),
      this.repository.listUsers(),
    ]);
    const usersById = new Map(users.map((user) => [user.id, user]));

    return {
      accounts: accounts.map((account) =>
        toAdminCreditAccountSummary(account, usersById.get(account.userId)),
      ),
      ledger: ledger.map((entry) =>
        toAdminCreditLedgerSummary(entry, usersById.get(entry.userId)),
      ),
    };
  }

  async getFeedback(): Promise<AdminFeedbackResult> {
    const [feedback, users] = await Promise.all([
      this.repository.listUserFeedback(),
      this.repository.listUsers(),
    ]);
    const usersById = new Map(users.map((user) => [user.id, user]));
    const ratings = feedback
      .map((item) => item.rating)
      .filter((rating): rating is number => rating !== undefined);

    return {
      summary: {
        total: feedback.length,
        averageRating: ratings.length === 0
          ? 0
          : roundRatio(sum(ratings, (rating) => rating) / ratings.length),
        withComments: feedback.filter((item) => Boolean(item.comment?.trim())).length,
      },
      items: feedback.map((item) => toAdminFeedbackItem(item, usersById.get(item.userId ?? ""))),
    };
  }

  async getSettings(): Promise<AdminSettingsResult> {
    const items = await Promise.all(
      KNOWN_SYSTEM_SETTING_KEYS.map(async (known) => {
        const setting = await this.repository.getSystemSetting(known.key);
        return toAdminSettingItem(known, setting);
      }),
    );

    return { items };
  }

  async createAccessCodeBatch(
    input: AdminCreateAccessCodeBatchInput,
  ): Promise<AdminCreateAccessCodeBatchResult> {
    validateRequired(input.actorUserId, "Actor user id");
    const created = await this.accessCodeService.createAccessCodeBatch({
      createdByUserId: input.actorUserId,
      name: input.name,
      source: input.source,
      codeCount: input.codeCount,
      credits: input.credits,
      tier: input.tier,
      features: input.features,
      expiresAt: input.expiresAt,
      notes: input.notes,
      metadata: input.metadata,
    });

    await this.auditService.append({
      actorUserId: input.actorUserId,
      action: "access_code_batch_created",
      targetType: "access_code_batch",
      targetId: created.batch.id,
      metadata: stripUndefined({
        ...(input.metadata ?? {}),
        name: created.batch.name,
        source: created.batch.source,
        codeCount: created.batch.codeCount,
        credits: created.batch.credits,
        tier: created.batch.tier,
        features: created.batch.features,
        expiresAt: created.batch.expiresAt,
        notes: created.batch.notes,
      }),
      ipHash: input.requestContext?.ipHash,
      userAgent: input.requestContext?.userAgent,
    });

    return {
      batch: created.batch,
      codes: created.codes.map((code) => toAdminCreatedAccessCode(code)),
    };
  }

  async disableAccessCodeBatch(input: AdminDisableAccessCodeBatchInput): Promise<{
    batch: AccessCodeBatchRecord;
    disabledCodeCount: number;
  }> {
    validateRequired(input.actorUserId, "Actor user id");
    validateRequired(input.batchId, "Access-code batch id");
    validateRequired(input.reason, "Reason");
    return this.accessCodeService.disableAccessCodeBatch(
      input.batchId,
      input.actorUserId,
      {
        reason: input.reason,
        ...(input.requestContext?.ipHash !== undefined
          ? { ipHash: input.requestContext.ipHash }
          : {}),
      },
    );
  }

  async adjustUserCredits(
    input: AdminAdjustUserCreditsInput,
  ): Promise<CreditTransitionResult> {
    return this.creditService.adjustCredits(input);
  }

  async disableUser(input: AdminUserStatusInput): Promise<AdminUserSummary> {
    return this.updateUserStatus(input, "disabled");
  }

  async restoreUser(input: AdminUserStatusInput): Promise<AdminUserSummary> {
    return this.updateUserStatus(input, "active");
  }

  async getTaskDetail(input: AdminTaskDetailInput): Promise<AdminTaskDetail> {
    validateRequired(input.actorUserId, "Actor user id");
    validateRequired(input.taskId, "Task id");
    const task = await this.repository.getCommercialTask(input.taskId);
    if (!task) {
      throw new CommercialAdminServiceError("task_not_found", "Task not found");
    }
    const [user, account, userTasks, runs, stepCosts, report] = await Promise.all([
      this.repository.getUser(task.userId),
      this.repository.getCreditAccount(task.userId),
      this.repository.listCommercialTasks(task.userId),
      this.repository.listSimulationTaskRuns(task.id),
      this.repository.listSimulationStepRunCosts(task.id),
      this.repository.getCommercialReportByTaskId(task.id),
    ]);
    const detail: AdminTaskDetail = {
      task,
      ...(user !== undefined
        ? { user: toAdminUserSummary(user, account, userTasks) }
        : {}),
      runs,
      stepCosts,
      ...(report !== undefined ? { report: toSafeReportSummary(report) } : {}),
    };

    if (input.includeSensitiveReportSummary === true) {
      if (!report) {
        throw new CommercialAdminServiceError("report_not_found", "Report not found");
      }
      detail.sensitiveReportSummary = summarizeSensitiveReport(report);
      await this.auditService.append({
        actorUserId: input.actorUserId,
        action: "sensitive_report_viewed",
        targetType: "report",
        targetId: report.id,
        metadata: {
          taskId: task.id,
          userId: task.userId,
          summaryOnly: true,
        },
        ipHash: input.requestContext?.ipHash,
        userAgent: input.requestContext?.userAgent,
      });
    }

    return detail;
  }

  async getAuditLogs(): Promise<AdminAuditLogRecord[]> {
    return this.repository.listAdminAuditLogs();
  }

  private async updateUserStatus(
    input: AdminUserStatusInput,
    nextStatus: CommercialUserRecord["status"],
  ): Promise<AdminUserSummary> {
    validateRequired(input.actorUserId, "Actor user id");
    validateRequired(input.userId, "User id");
    validateRequired(input.reason, "Reason");

    const user = await this.repository.getUser(input.userId);
    if (!user) {
      throw new CommercialAdminServiceError("user_not_found", "User not found");
    }

    const updatedAt = this.currentDate().toISOString();
    const updated: CommercialUserRecord = {
      ...user,
      status: nextStatus,
      updatedAt,
    };
    await this.repository.saveUser(updated);
    if (nextStatus === "disabled") {
      await this.repository.revokeUserSessions(user.id, updatedAt);
    }
    await this.auditService.append({
      actorUserId: input.actorUserId,
      action: nextStatus === "disabled" ? "user_disabled" : "user_restored",
      targetType: "user",
      targetId: user.id,
      metadata: {
        reason: input.reason,
        previousStatus: user.status,
      },
      ipHash: input.requestContext?.ipHash,
      userAgent: input.requestContext?.userAgent,
    });

    const [account, tasks] = await Promise.all([
      this.repository.getCreditAccount(user.id),
      this.repository.listCommercialTasks(user.id),
    ]);
    return toAdminUserSummary(updated, account, tasks);
  }

  private currentDate(): Date {
    const value = this.now();
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) {
      throw new CommercialAdminServiceError(
        "invalid_admin_input",
        "Invalid current time",
      );
    }
    return date;
  }
}

function toAdminUserSummary(
  user: CommercialUserRecord,
  account: UserCreditAccountRecord | undefined,
  tasks: CommercialSimulationTaskRecord[],
): AdminUserSummary {
  const summary: AdminUserSummary = {
    id: user.id,
    email: user.email,
    emailNormalized: user.emailNormalized,
    role: user.role,
    tier: user.tier,
    status: user.status,
    features: [...user.features],
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    taskSummary: summarizeTasks(tasks),
  };
  if (user.lastLoginAt !== undefined) {
    summary.lastLoginAt = user.lastLoginAt;
  }
  if (account !== undefined) {
    summary.creditAccount = {
      balance: account.balance,
      frozenCredits: account.frozenCredits,
      totalRedeemed: account.totalRedeemed,
      totalCaptured: account.totalCaptured,
      updatedAt: account.updatedAt,
    };
  }
  return summary;
}

function summarizeTasks(tasks: CommercialSimulationTaskRecord[]): AdminUserSummary["taskSummary"] {
  return {
    total: tasks.length,
    completed: tasks.filter((task) => task.status === "completed").length,
    failed: tasks.filter((task) => task.status === "failed").length,
    active: tasks.filter((task) => task.status === "queued" || task.status === "running").length,
  };
}

function toAdminCreatedAccessCode(input: {
  rawCode: string;
  record: AccessCodeRecord;
}): AdminCreatedAccessCode {
  const code: AdminCreatedAccessCode = {
    id: input.record.id,
    rawCode: input.rawCode,
    codeMask: input.record.codeMask,
    status: input.record.status,
    credits: input.record.credits,
    features: [...input.record.features],
    createdAt: input.record.createdAt,
  };
  if (input.record.tier !== undefined) {
    code.tier = input.record.tier;
  }
  if (input.record.expiresAt !== undefined) {
    code.expiresAt = input.record.expiresAt;
  }
  return code;
}

function toAdminAccessCodeBatchSummary(
  batch: AccessCodeBatchRecord,
  codes: AccessCodeRecord[],
  now: Date,
): AdminAccessCodeBatchSummary {
  const counts = emptyAccessCodeStatusCounts();
  for (const code of codes) {
    counts[code.status] += 1;
  }
  const status = batch.disabledAt !== undefined
    ? "disabled"
    : batch.expiresAt !== undefined && Date.parse(batch.expiresAt) <= now.getTime()
      ? "expired"
      : "active";
  const summary: AdminAccessCodeBatchSummary = {
    id: batch.id,
    name: batch.name,
    codeCount: batch.codeCount,
    credits: batch.credits,
    features: [...batch.features],
    createdAt: batch.createdAt,
    status,
    redeemedCount: counts.redeemed,
    activeCount: counts.active,
    disabledCount: counts.disabled,
    expiredCount: counts.expired,
    redemptionRate: rate(counts.redeemed, batch.codeCount),
  };
  if (batch.source !== undefined) summary.source = batch.source;
  if (batch.tier !== undefined) summary.tier = batch.tier;
  if (batch.expiresAt !== undefined) summary.expiresAt = batch.expiresAt;
  if (batch.disabledAt !== undefined) summary.disabledAt = batch.disabledAt;
  if (batch.notes !== undefined) summary.notes = batch.notes;
  return summary;
}

function toAdminTaskRow(
  task: CommercialSimulationTaskRecord,
  user: CommercialUserRecord | undefined,
  runs: Awaited<ReturnType<CommercialRepository["listSimulationTaskRuns"]>>,
  costs: SimulationStepRunCostRecord[],
): AdminTaskRow {
  const latestRun = [...runs].sort((left, right) => {
    if (left.startedAt !== right.startedAt) {
      return right.startedAt.localeCompare(left.startedAt);
    }
    return right.id.localeCompare(left.id);
  })[0];
  const promptTokens = sum(costs, (cost) => cost.promptTokens ?? 0);
  const completionTokens = sum(costs, (cost) => cost.completionTokens ?? 0);
  const totalTokens = sum(costs, (cost) => cost.totalTokens ?? (cost.promptTokens ?? 0) + (cost.completionTokens ?? 0));
  const row: AdminTaskRow = {
    id: task.id,
    userEmail: user?.email ?? task.userId,
    scenarioType: task.scenarioType,
    interactionMode: task.interactionMode,
    providerMode: task.providerMode,
    status: task.status,
    credits: task.creditCost,
    promptTokens,
    completionTokens: completionTokens || Math.max(0, totalTokens - promptTokens),
    estimatedCost: roundMoney(sum(costs, (cost) => cost.estimatedCost ?? 0)),
    createdAt: task.createdAt,
    timeline: buildTaskTimeline(task),
    stepCosts: costs.map(toAdminTaskStepCost),
  };
  const queueWaitMs = diffMs(task.queuedAt ?? task.createdAt, task.startedAt);
  if (queueWaitMs !== undefined) row.queueWaitMs = queueWaitMs;
  const runDurationMs = diffMs(task.startedAt, task.completedAt);
  if (runDurationMs !== undefined) row.runDurationMs = runDurationMs;
  if (task.errorCode !== undefined) row.errorCode = task.errorCode;
  if (latestRun?.workerId !== undefined) row.workerId = latestRun.workerId;
  return row;
}

function toAdminTaskStepCost(cost: SimulationStepRunCostRecord): AdminTaskStepCost {
  return {
    stepName: cost.stepName,
    provider: cost.provider ?? "unknown",
    modelId: cost.modelId ?? "unknown",
    tokens: cost.totalTokens ?? (cost.promptTokens ?? 0) + (cost.completionTokens ?? 0),
    estimatedCost: roundMoney(cost.estimatedCost ?? 0),
    status: cost.status === "started" ? "skipped" : cost.status,
  };
}

function buildTaskTimeline(task: CommercialSimulationTaskRecord): AdminTaskTimelineItem[] {
  const items: AdminTaskTimelineItem[] = [];
  if (task.queuedAt !== undefined) {
    items.push({ label: "Queued", at: task.queuedAt });
  } else {
    items.push({ label: "Created", at: task.createdAt });
  }
  if (task.startedAt !== undefined) {
    items.push({ label: "Running", at: task.startedAt });
  }
  if (task.completedAt !== undefined) {
    items.push({ label: toTimelineCompletionLabel(task.status), at: task.completedAt });
  }
  return items;
}

function toTimelineCompletionLabel(status: CommercialTaskStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function toAdminCreditAccountSummary(
  account: UserCreditAccountRecord,
  user: CommercialUserRecord | undefined,
): AdminCreditAccountSummary {
  return {
    userId: account.userId,
    userEmail: user?.email ?? account.userId,
    balance: account.balance,
    frozenCredits: account.frozenCredits,
    totalRedeemed: account.totalRedeemed,
    totalCaptured: account.totalCaptured,
    updatedAt: account.updatedAt,
  };
}

function toAdminCreditLedgerSummary(
  entry: CreditLedgerEntryRecord,
  user: CommercialUserRecord | undefined,
): AdminCreditLedgerSummary {
  const summary: AdminCreditLedgerSummary = {
    id: entry.id,
    userId: entry.userId,
    userEmail: user?.email ?? entry.userId,
    entryType: entry.entryType,
    amount: entry.amount,
    balanceAfter: entry.balanceAfter,
    idempotencyKey: entry.idempotencyKey,
    createdAt: entry.createdAt,
  };
  if (entry.taskId !== undefined) summary.taskId = entry.taskId;
  if (entry.accessCodeId !== undefined) summary.accessCodeId = entry.accessCodeId;
  if (entry.frozenAfter !== undefined) summary.frozenAfter = entry.frozenAfter;
  if (entry.reason !== undefined) summary.reason = entry.reason;
  return summary;
}

function toAdminFeedbackItem(
  feedback: UserFeedbackRecord,
  user: CommercialUserRecord | undefined,
): AdminFeedbackItem {
  const item: AdminFeedbackItem = {
    id: feedback.id,
    metadata: feedback.metadata,
    createdAt: feedback.createdAt,
  };
  if (feedback.userId !== undefined) item.userId = feedback.userId;
  if (user !== undefined) item.userEmail = user.email;
  if (feedback.taskId !== undefined) item.taskId = feedback.taskId;
  if (feedback.reportId !== undefined) item.reportId = feedback.reportId;
  if (feedback.rating !== undefined) item.rating = feedback.rating;
  if (feedback.feedbackType !== undefined) item.feedbackType = feedback.feedbackType;
  if (feedback.comment !== undefined) item.comment = feedback.comment;
  return item;
}

function toAdminSettingItem(
  known: { key: string; description: string },
  setting: SystemSettingRecord | undefined,
): AdminSettingItem {
  if (setting === undefined) {
    return {
      key: known.key,
      value: undefined,
      description: known.description,
      configured: false,
    };
  }
  return {
    key: setting.key,
    value: setting.value,
    description: setting.description ?? known.description,
    updatedByUserId: setting.updatedByUserId,
    configured: true,
    updatedAt: setting.updatedAt,
  };
}

function toSafeReportSummary(report: CommercialSimulationReportRecord): AdminTaskDetail["report"] {
  return {
    id: report.id,
    taskId: report.taskId,
    userId: report.userId,
    unlocked: report.unlocked,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    hasPublicReport: report.publicReport !== undefined,
    hasDeepReport: report.deepReport !== undefined,
    hasShareCard: report.shareCard !== undefined,
  };
}

function summarizeSensitiveReport(
  report: CommercialSimulationReportRecord,
): AdminSensitiveReportSummary {
  const deepReport = report.deepReport;
  return {
    reportId: report.id,
    unlocked: report.unlocked,
    hasPublicReport: report.publicReport !== undefined,
    hasDeepReport: deepReport !== undefined,
    deepReportTopLevelKeys:
      deepReport !== undefined && isPlainObject(deepReport)
        ? Object.keys(deepReport)
        : [],
    deepReportEstimatedBytes:
      deepReport === undefined ? 0 : JSON.stringify(deepReport).length,
  };
}

function emptyTaskStatusCounts(): Record<CommercialTaskStatus, number> {
  return Object.fromEntries(TASK_STATUSES.map((status) => [status, 0])) as Record<
    CommercialTaskStatus,
    number
  >;
}

function emptyAccessCodeStatusCounts(): Record<AccessCodeStatus, number> {
  return {
    active: 0,
    redeemed: 0,
    disabled: 0,
    expired: 0,
  };
}

function oldestQueuedAt(
  tasks: CommercialSimulationTaskRecord[],
): { oldestQueuedAt?: string } {
  const queuedAt = tasks
    .filter((task) => task.status === "queued" || task.status === "running")
    .map((task) => task.queuedAt ?? task.createdAt)
    .sort()[0];
  return queuedAt === undefined ? {} : { oldestQueuedAt: queuedAt };
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : roundRatio(numerator / denominator);
}

function roundRatio(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function sum<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((total, item) => total + pick(item), 0);
}

function groupCosts(
  costs: SimulationStepRunCostRecord[],
  pickKey: (item: SimulationStepRunCostRecord) => string,
): AdminCostGroup[] {
  const groups = new Map<string, AdminCostGroup>();
  for (const cost of costs) {
    const key = pickKey(cost);
    const existing = groups.get(key) ?? { key, cost: 0, tokens: 0 };
    groups.set(key, {
      key,
      cost: roundMoney(existing.cost + (cost.estimatedCost ?? 0)),
      tokens: existing.tokens + (cost.totalTokens ?? (cost.promptTokens ?? 0) + (cost.completionTokens ?? 0)),
    });
  }
  return [...groups.values()].sort((left, right) => {
    if (left.cost !== right.cost) {
      return right.cost - left.cost;
    }
    return left.key.localeCompare(right.key);
  });
}

function groupBy<T>(
  items: T[],
  pickKey: (item: T) => string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = pickKey(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function diffMs(start: string | undefined, end: string | undefined): number | undefined {
  if (start === undefined || end === undefined) {
    return undefined;
  }
  const startTime = Date.parse(start);
  const endTime = Date.parse(end);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
    return undefined;
  }
  return Math.max(0, endTime - startTime);
}

function validateRequired(value: string, label: string): void {
  if (!value.trim()) {
    throw new CommercialAdminServiceError(
      "invalid_admin_input",
      `${label} is required`,
    );
  }
}

function stripUndefined<T extends JsonObject>(value: T): JsonObject {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  );
}

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
