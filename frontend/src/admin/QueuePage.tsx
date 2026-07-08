import { useEffect, useState } from "react";
import {
  Activity,
  ServerCog,
  Workflow,
} from "lucide-react";

import {
  fetchAdminQueue,
  type AdminOverviewDto,
} from "./admin-client.js";

interface QueuePageProps {
  queue?: AdminOverviewDto["queue"];
  fetchQueue?: () => Promise<AdminOverviewDto["queue"]>;
}

const EMPTY_QUEUE: AdminOverviewDto["queue"] = {
  backlog: 0,
  queued: 0,
  running: 0,
  retrying: 0,
  stuck: 0,
  activeWeight: 0,
  maxWeight: 0,
  workers: [],
};

export default function QueuePage({
  queue,
  fetchQueue = fetchAdminQueue,
}: QueuePageProps) {
  const [resolvedQueue, setResolvedQueue] = useState(queue ?? EMPTY_QUEUE);
  const [isLoading, setIsLoading] = useState(queue === undefined);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (queue !== undefined) {
      setResolvedQueue(queue);
      setIsLoading(false);
      setLoadError("");
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    void fetchQueue()
      .then((nextQueue) => {
        if (!cancelled) {
          setResolvedQueue(nextQueue);
          setLoadError("");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Unable to load queue operations");
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
  }, [fetchQueue, queue]);

  return (
    <div className="space-y-5">
      {(isLoading || loadError) && (
        <section className="border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-600">
          {isLoading ? "Loading queue operations" : loadError}
        </section>
      )}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Metric title="Backlog" value={resolvedQueue.backlog} detail={`Oldest ${resolvedQueue.oldestQueuedAt ?? "none"}`} />
        <Metric title="Queued" value={resolvedQueue.queued ?? 0} detail="Waiting for worker claim" />
        <Metric title="Running" value={resolvedQueue.running ?? 0} detail="Currently executing" />
        <Metric title="Retrying" value={resolvedQueue.retrying ?? 0} detail="Queued after an error" />
        <Metric title="Stuck" value={resolvedQueue.stuck ?? 0} detail="Past monitoring threshold" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <section className="border border-slate-200 bg-white">
          <PanelTitle icon={Workflow} title="Queue Operations" action={`${resolvedQueue.activeWeight ?? 0}/${resolvedQueue.maxWeight ?? 0} weight`} />
          <div className="grid gap-3 p-4 md:grid-cols-2">
            <WeightCell label="Active Weight" value={resolvedQueue.activeWeight ?? 0} />
            <WeightCell label="Max Weight" value={resolvedQueue.maxWeight ?? 0} />
          </div>
          <div className="border-t border-slate-200 p-4">
            <div className="flex items-start gap-2 rounded-md border border-cyan-200 bg-cyan-50 p-3 text-xs font-semibold text-cyan-800">
              <Activity className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Queue data is read-only here; worker control actions should be audited before they are added.</span>
            </div>
          </div>
        </section>

        <section className="border border-slate-200 bg-white">
          <PanelTitle icon={ServerCog} title="Workers" action={`${resolvedQueue.workers?.length ?? 0} heartbeats`} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="border-y border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.13em] text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-black">Worker</th>
                  <th className="px-4 py-2 font-black">Active Weight</th>
                  <th className="px-4 py-2 font-black">Current Task</th>
                  <th className="px-4 py-2 font-black">Heartbeat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {resolvedQueue.workers?.map((worker) => (
                  <tr key={worker.workerId}>
                    <td className="px-4 py-3 font-mono font-black text-slate-950">{worker.workerId}</td>
                    <td className="px-4 py-3 font-mono text-slate-700">{worker.activeWeight}</td>
                    <td className="px-4 py-3 font-mono text-slate-700">{worker.currentTaskId ?? "none"}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDateTime(worker.lastHeartbeatAt)}</td>
                  </tr>
                )) ?? null}
                {(resolvedQueue.workers?.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-xs font-bold text-slate-500">
                      No worker heartbeats loaded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </div>
  );
}

function Metric({ title, value, detail }: { title: string; value: number; detail: string }) {
  return (
    <div className="min-h-24 border border-slate-200 bg-white p-4 text-slate-950">
      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{title}</div>
      <div className="mt-3 font-mono text-2xl font-black tracking-tight">{value}</div>
      <div className="mt-2 text-xs font-semibold text-slate-500">{detail}</div>
    </div>
  );
}

function PanelTitle({
  icon: Icon,
  title,
  action,
}: {
  icon: typeof Workflow;
  title: string;
  action: string;
}) {
  return (
    <div className="flex min-h-12 items-center justify-between px-4">
      <div className="flex items-center gap-2 text-sm font-black">
        <Icon className="h-4 w-4 text-slate-500" aria-hidden="true" />
        <span>{title}</span>
      </div>
      <span className="rounded-sm bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{action}</span>
    </div>
  );
}

function WeightCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-slate-200 bg-slate-50 p-3">
      <div className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">{label}</div>
      <div className="mt-2 font-mono text-xl font-black text-slate-950">{value}</div>
    </div>
  );
}

function formatDateTime(value: string): string {
  return value.replace("T", " ").slice(0, 16);
}
