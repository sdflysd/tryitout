import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Clock3,
  ListChecks,
} from "lucide-react";

import {
  fetchAdminTasks,
  type AdminTaskRowDto,
} from "./admin-client.js";

interface TasksPageProps {
  tasks?: AdminTaskRowDto[];
  fetchTasks?: () => Promise<AdminTaskRowDto[]>;
}

const EMPTY_TASKS: AdminTaskRowDto[] = [];

export default function TasksPage({
  tasks,
  fetchTasks = fetchAdminTasks,
}: TasksPageProps) {
  const [rows, setRows] = useState(tasks ?? EMPTY_TASKS);
  const [isLoading, setIsLoading] = useState(tasks === undefined);
  const [loadError, setLoadError] = useState("");
  const selectedTask = rows[0];
  const failedTasks = rows.filter((task) => task.status === "failed").length;
  const activeTasks = rows.filter((task) => task.status === "queued" || task.status === "running").length;
  const totalCost = rows.reduce((total, task) => total + task.estimatedCost, 0);
  const totalTokens = rows.reduce(
    (total, task) => total + task.promptTokens + task.completionTokens,
    0,
  );

  useEffect(() => {
    if (tasks !== undefined) {
      setRows(tasks);
      setIsLoading(false);
      setLoadError("");
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    void fetchTasks()
      .then((nextTasks) => {
        if (!cancelled) {
          setRows(nextTasks);
          setLoadError("");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Unable to load commercial tasks");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fetchTasks, tasks]);

  return (
    <div className="space-y-5">
      {(isLoading || loadError) && (
        <section className="border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-600">
          {isLoading ? "Loading commercial tasks" : loadError}
        </section>
      )}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="Task operations metrics">
        <Metric title="Active Queue" value={activeTasks} detail="Queued and running" tone="cyan" />
        <Metric title="Failed Tasks" value={failedTasks} detail="Provider, worker, or validation errors" tone="rose" />
        <Metric title="Tokens" value={totalTokens} detail="Prompt plus completion" tone="emerald" />
        <Metric title="Estimated Cost" value={formatCurrency(totalCost)} detail="Commercial task spend" tone="amber" />
      </section>

      <section className="border border-slate-200 bg-white">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-black text-slate-950">Task Operations</h2>
              <p className="text-xs font-semibold text-slate-500">Queue latency, worker execution, paid credits, token burn, and failure codes.</p>
            </div>
          </div>
          <div className="text-xs font-bold text-slate-500">{rows.length} tasks tracked</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.13em] text-slate-500">
              <tr>
                <th className="px-4 py-2 font-black">Task ID</th>
                <th className="px-4 py-2 font-black">User</th>
                <th className="px-4 py-2 font-black">Scenario</th>
                <th className="px-4 py-2 font-black">Mode</th>
                <th className="px-4 py-2 font-black">Status</th>
                <th className="px-4 py-2 font-black">Queue Wait</th>
                <th className="px-4 py-2 font-black">Run Duration</th>
                <th className="px-4 py-2 font-black">Credits</th>
                <th className="px-4 py-2 font-black">Tokens</th>
                <th className="px-4 py-2 font-black">Cost</th>
                <th className="px-4 py-2 font-black">Error</th>
                <th className="px-4 py-2 font-black">Worker</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((task) => (
                <tr key={task.id}>
                  <td className="px-4 py-3 font-mono font-black text-slate-950">{task.id}</td>
                  <td className="px-4 py-3 font-semibold text-slate-700">{task.userEmail}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">{task.scenarioType}</td>
                  <td className="px-4 py-3">
                    <div className="font-mono font-black text-slate-950">{task.interactionMode}</div>
                    <div className="mt-1 font-mono text-[10px] text-slate-400">{task.providerMode}</div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={task.status} />
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-700">{formatDuration(task.queueWaitMs)}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">{formatDuration(task.runDurationMs)}</td>
                  <td className="px-4 py-3 font-mono font-black text-slate-950">{task.credits}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">{task.promptTokens + task.completionTokens}</td>
                  <td className="px-4 py-3 font-mono font-black text-slate-950">{formatCurrency(task.estimatedCost)}</td>
                  <td className="px-4 py-3 font-mono text-rose-700">{task.errorCode ?? "none"}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">{task.workerId ?? "unassigned"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-xs font-bold text-slate-500">
                    No commercial tasks loaded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(320px,0.72fr)_minmax(0,1.28fr)]">
        <section className="border border-slate-200 bg-white">
          <div className="flex min-h-12 items-center justify-between border-b border-slate-200 px-4">
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-slate-500" aria-hidden="true" />
              <h2 className="text-sm font-black text-slate-950">Timeline</h2>
            </div>
            <span className="rounded-sm bg-slate-100 px-2 py-1 font-mono text-[10px] font-black text-slate-500">
              {selectedTask?.id ?? "none"}
            </span>
          </div>
          <div className="space-y-3 p-4">
            {selectedTask?.timeline.map((item) => (
              <div key={`${item.label}-${item.at}`} className="grid grid-cols-[8px_minmax(0,1fr)] gap-3">
                <span className="mt-1.5 h-2 w-2 bg-slate-950" aria-hidden="true" />
                <div>
                  <div className="text-xs font-black text-slate-950">{item.label}</div>
                  <div className="mt-1 font-mono text-[10px] font-bold text-slate-500">{formatDateTime(item.at)}</div>
                </div>
              </div>
            )) ?? (
              <div className="border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs font-bold text-slate-500">
                Select a task to inspect queue and worker transitions.
              </div>
            )}
          </div>
        </section>

        <section className="border border-slate-200 bg-white">
          <div className="flex min-h-12 items-center justify-between border-b border-slate-200 px-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-slate-500" aria-hidden="true" />
              <h2 className="text-sm font-black text-slate-950">Step Cost Table</h2>
            </div>
            <span className="text-xs font-bold text-slate-500">No prompts or reports exposed</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.13em] text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-black">Step</th>
                  <th className="px-4 py-2 font-black">Provider</th>
                  <th className="px-4 py-2 font-black">Model</th>
                  <th className="px-4 py-2 font-black">Tokens</th>
                  <th className="px-4 py-2 font-black">Cost</th>
                  <th className="px-4 py-2 font-black">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selectedTask?.stepCosts.map((step) => (
                  <tr key={`${step.stepName}-${step.provider}-${step.modelId}`}>
                    <td className="px-4 py-3 font-mono font-black text-slate-950">{step.stepName}</td>
                    <td className="px-4 py-3 font-mono text-slate-700">{step.provider}</td>
                    <td className="px-4 py-3 font-mono text-slate-700">{step.modelId}</td>
                    <td className="px-4 py-3 font-mono text-slate-700">{step.tokens}</td>
                    <td className="px-4 py-3 font-mono font-black text-slate-950">{formatCurrency(step.estimatedCost)}</td>
                    <td className="px-4 py-3 font-mono text-slate-700">{step.status}</td>
                  </tr>
                )) ?? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-xs font-bold text-slate-500">
                      Step cost data will appear after worker execution.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-200 p-4">
            <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Use error codes and step costs together before issuing refunds; avoid exposing raw user prompts or report text in operator views.</span>
            </div>
          </div>
        </section>
      </section>
    </div>
  );
}

function Metric({
  title,
  value,
  detail,
  tone,
}: {
  title: string;
  value: string | number;
  detail: string;
  tone: "cyan" | "rose" | "emerald" | "amber";
}) {
  const toneClass = {
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-950",
    rose: "border-rose-200 bg-rose-50 text-rose-950",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-950",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
  }[tone];
  return (
    <div className={`min-h-24 border p-4 ${toneClass}`}>
      <div className="text-[10px] font-black uppercase tracking-[0.14em] opacity-60">{title}</div>
      <div className="mt-3 font-mono text-2xl font-black tracking-tight">{value}</div>
      <div className="mt-2 text-xs font-semibold opacity-70">{detail}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: AdminTaskRowDto["status"] }) {
  const className = {
    queued: "bg-slate-100 text-slate-600",
    running: "bg-cyan-50 text-cyan-700",
    completed: "bg-emerald-50 text-emerald-700",
    failed: "bg-rose-50 text-rose-700",
    cancelled: "bg-slate-100 text-slate-600",
    refunded: "bg-amber-50 text-amber-700",
  }[status];
  return (
    <span className={`rounded-sm px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${className}`}>
      {status}
    </span>
  );
}

function formatDuration(value: number | undefined): string {
  if (value === undefined) {
    return "none";
  }
  if (value < 1000) {
    return `${value}ms`;
  }
  return `${(value / 1000).toFixed(1)}s`;
}

function formatCurrency(value: number): string {
  return `¥${value.toFixed(2)}`;
}

function formatDateTime(value: string): string {
  return value.replace("T", " ").slice(0, 16);
}
