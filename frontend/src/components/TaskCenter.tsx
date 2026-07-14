import React from "react";
import {
  Activity,
  AlertCircle,
  FileText,
  ListChecks,
  LoaderCircle,
  RefreshCcw,
  XCircle,
} from "lucide-react";

import { DEFAULT_LANGUAGE, type Language } from "../language.js";
import type {
  SimulationTaskStatus,
  SimulationTaskStatusResponse,
} from "../contracts/simulation-task.js";

interface TaskCenterProps {
  tasks: SimulationTaskStatusResponse[];
  language?: Language;
  isLoading?: boolean;
  error?: string;
  onRefresh?: () => void;
  onViewProgress: (task: SimulationTaskStatusResponse) => void;
  onRetry: (task: SimulationTaskStatusResponse) => void;
  onCancel: (task: SimulationTaskStatusResponse) => void;
  onViewReport: (task: SimulationTaskStatusResponse) => void;
}

type TaskCenterCopy = {
  title: string;
  subtitle: (count: number) => string;
  loading: string;
  errorPrefix: string;
  refresh: string;
  updated: string;
  progress: string;
  retry: string;
  cancel: string;
  report: string;
  progressActionLabel: (taskId: string) => string;
  retryActionLabel: (taskId: string) => string;
  cancelActionLabel: (taskId: string) => string;
  reportActionLabel: (taskId: string) => string;
  progressbarLabel: (taskId: string) => string;
  mode: Record<SimulationTaskStatusResponse["mode"], string>;
  scenario: Record<SimulationTaskStatusResponse["scenarioType"], string>;
  status: Record<SimulationTaskStatus, string>;
};

const TASK_CENTER_COPY = {
  "zh-CN": {
    title: "我的任务",
    subtitle: (count: number) => `${count} 个近期任务`,
    loading: "刷新中",
    errorPrefix: "加载失败",
    refresh: "刷新",
    updated: "更新",
    progress: "进度",
    retry: "重试",
    cancel: "取消",
    report: "报告",
    progressActionLabel: (taskId: string) => `查看任务进度 ${taskId}`,
    retryActionLabel: (taskId: string) => `重试任务 ${taskId}`,
    cancelActionLabel: (taskId: string) => `取消任务 ${taskId}`,
    reportActionLabel: (taskId: string) => `查看报告 ${taskId}`,
    progressbarLabel: (taskId: string) => `任务进度 ${taskId}`,
    mode: {
      enabled: "智能体",
      legacy: "基础",
    },
    scenario: {
      side_hustle: "副业",
      dating: "恋爱",
      life_choice: "抉择",
    },
    status: {
      queued: "排队中",
      running: "运行中",
      paused: "已暂停",
      recoverable_failed: "可恢复",
      failed: "失败",
      completed: "已完成",
      cancelled: "已取消",
    },
  },
  "en-US": {
    title: "My tasks",
    subtitle: (count: number) => `${count} recent task${count === 1 ? "" : "s"}`,
    loading: "Refreshing",
    errorPrefix: "Unable to load",
    refresh: "Refresh",
    updated: "Updated",
    progress: "Progress",
    retry: "Retry",
    cancel: "Cancel",
    report: "Report",
    progressActionLabel: (taskId: string) => `View progress ${taskId}`,
    retryActionLabel: (taskId: string) => `Retry task ${taskId}`,
    cancelActionLabel: (taskId: string) => `Cancel task ${taskId}`,
    reportActionLabel: (taskId: string) => `View report ${taskId}`,
    progressbarLabel: (taskId: string) => `Task progress ${taskId}`,
    mode: {
      enabled: "Agent",
      legacy: "Basic",
    },
    scenario: {
      side_hustle: "Side hustle",
      dating: "Dating",
      life_choice: "Choice",
    },
    status: {
      queued: "Queued",
      running: "Running",
      paused: "Paused",
      recoverable_failed: "Recoverable",
      failed: "Failed",
      completed: "Completed",
      cancelled: "Cancelled",
    },
  },
} satisfies Record<Language, TaskCenterCopy>;

const STATUS_TONE = {
  queued: "border-slate-300/25 bg-slate-300/10 text-slate-100",
  running: "border-cyan-300/30 bg-cyan-300/12 text-cyan-100",
  paused: "border-amber-300/30 bg-amber-300/12 text-amber-100",
  recoverable_failed: "border-amber-300/35 bg-amber-300/14 text-amber-100",
  failed: "border-rose-300/35 bg-rose-300/12 text-rose-100",
  completed: "border-emerald-300/35 bg-emerald-300/12 text-emerald-100",
  cancelled: "border-white/15 bg-white/8 text-white/48",
} satisfies Record<SimulationTaskStatus, string>;

export default function TaskCenter({
  tasks,
  language = DEFAULT_LANGUAGE,
  isLoading = false,
  error,
  onRefresh,
  onViewProgress,
  onRetry,
  onCancel,
  onViewReport,
}: TaskCenterProps) {
  if (tasks.length === 0 && !error && !isLoading) {
    return null;
  }

  const copy = TASK_CENTER_COPY[language];

  return (
    <section
      id="task-center"
      aria-label={copy.title}
      className="rounded-3xl border border-white/10 bg-white/[0.055] p-4 text-left text-white shadow-xl shadow-black/15 backdrop-blur-xl"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/8 text-amber-100">
            <ListChecks className="h-4.5 w-4.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-black text-white">{copy.title}</h2>
            <p className="mt-1 text-[11px] font-semibold text-white/45">
              {isLoading ? copy.loading : copy.subtitle(tasks.length)}
            </p>
          </div>
        </div>

        {onRefresh && (
          <button
            id="btn-task-center-refresh"
            type="button"
            onClick={onRefresh}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/8 px-3 text-[11px] font-black text-white/66 transition-colors hover:border-cyan-200/35 hover:bg-cyan-300/10 hover:text-cyan-100"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true" />
            <span>{copy.refresh}</span>
          </button>
        )}
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-2xl border border-rose-300/25 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-words">{copy.errorPrefix}: {error}</span>
        </div>
      )}

      {tasks.length > 0 && (
        <div className="mt-4 divide-y divide-white/10">
          {tasks.map((task) => renderTaskRow({
            task,
            copy,
            onViewProgress,
            onRetry,
            onCancel,
            onViewReport,
          }))}
        </div>
      )}
    </section>
  );
}

function renderTaskRow({
  task,
  copy,
  onViewProgress,
  onRetry,
  onCancel,
  onViewReport,
}: {
  task: SimulationTaskStatusResponse;
  copy: TaskCenterCopy;
  onViewProgress: (task: SimulationTaskStatusResponse) => void;
  onRetry: (task: SimulationTaskStatusResponse) => void;
  onCancel: (task: SimulationTaskStatusResponse) => void;
  onViewReport: (task: SimulationTaskStatusResponse) => void;
}) {
  const canViewProgress = task.status !== "completed";
  const canRetry = task.status === "queued" || task.recoverable;
  const canCancel = task.status === "running";
  const canViewReport = task.status === "completed";
  const progressPercent = clampProgress(task.progressPercent);

  return (
    <div
      key={task.simulationId}
      id={`task-center-row-${task.simulationId}`}
      className="grid gap-3 py-3 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
    >
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-lg border px-2 py-1 text-[10px] font-black ${STATUS_TONE[task.status]}`}>
            {copy.status[task.status]}
          </span>
          <span className="rounded-lg border border-white/10 bg-white/8 px-2 py-1 text-[10px] font-black text-white/54">
            {copy.scenario[task.scenarioType]}
          </span>
          <span className="rounded-lg border border-white/10 bg-white/8 px-2 py-1 text-[10px] font-black text-white/38">
            {copy.mode[task.mode]}
          </span>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center">
          <span className="truncate font-mono text-xs font-black text-white/80">
            {task.simulationId}
          </span>
          <span className="font-mono text-[10px] font-semibold text-white/34">
            {copy.updated} {formatTaskTime(task.updatedAt)}
          </span>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
            aria-label={copy.progressbarLabel(task.simulationId)}
            className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-200 via-cyan-200 to-emerald-200"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="w-9 text-right font-mono text-[10px] font-black text-white/42">
            {progressPercent}%
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        {canViewProgress && (
          <TaskActionButton
            id={`btn-task-progress-${task.simulationId}`}
            label={copy.progress}
            accessibleLabel={copy.progressActionLabel(task.simulationId)}
            tone="neutral"
            onClick={() => onViewProgress(task)}
            icon={<Activity className="h-3.5 w-3.5" aria-hidden="true" />}
          />
        )}
        {canRetry && (
          <TaskActionButton
            id={`btn-task-retry-${task.simulationId}`}
            label={copy.retry}
            accessibleLabel={copy.retryActionLabel(task.simulationId)}
            tone="amber"
            onClick={() => onRetry(task)}
            icon={<RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />}
          />
        )}
        {canCancel && (
          <TaskActionButton
            id={`btn-task-cancel-${task.simulationId}`}
            label={copy.cancel}
            accessibleLabel={copy.cancelActionLabel(task.simulationId)}
            tone="rose"
            onClick={() => onCancel(task)}
            icon={<XCircle className="h-3.5 w-3.5" aria-hidden="true" />}
          />
        )}
        {canViewReport && (
          <TaskActionButton
            id={`btn-task-report-${task.simulationId}`}
            label={copy.report}
            accessibleLabel={copy.reportActionLabel(task.simulationId)}
            tone="emerald"
            onClick={() => onViewReport(task)}
            icon={<FileText className="h-3.5 w-3.5" aria-hidden="true" />}
          />
        )}
        {task.status === "running" && (
          <LoaderCircle className="h-4 w-4 animate-spin text-cyan-100/72" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}

function TaskActionButton({
  id,
  label,
  accessibleLabel,
  tone,
  icon,
  onClick,
}: {
  id: string;
  label: string;
  accessibleLabel: string;
  tone: "neutral" | "amber" | "rose" | "emerald";
  icon: React.ReactNode;
  onClick: () => void;
}) {
  const toneClass = {
    neutral: "border-white/10 bg-white/8 text-white/64 hover:border-cyan-200/35 hover:bg-cyan-300/10 hover:text-cyan-100",
    amber: "border-amber-200/30 bg-amber-300/12 text-amber-100 hover:border-amber-100/60 hover:bg-amber-300/18",
    rose: "border-rose-300/35 bg-rose-500/10 text-rose-100 hover:border-rose-200/60 hover:bg-rose-500/18",
    emerald: "border-emerald-300/35 bg-emerald-300/12 text-emerald-100 hover:border-emerald-200/60 hover:bg-emerald-300/18",
  }[tone];

  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      aria-label={accessibleLabel}
      title={accessibleLabel}
      className={`inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-black transition-colors ${toneClass}`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatTaskTime(value: string): string {
  if (!value) {
    return "--";
  }
  return value.replace("T", " ").slice(0, 16);
}
