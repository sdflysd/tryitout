import { useEffect, useState } from "react";
import {
  Activity,
  BadgeDollarSign,
  ClipboardList,
  Coins,
  FileClock,
  Gauge,
  KeyRound,
  MessageSquareText,
  Settings,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react";

import AccessCodesPage from "./AccessCodesPage.js";
import {
  fetchAdminOverview,
  type AdminOverviewDto,
} from "./admin-client.js";

interface AdminAppProps {
  overview?: AdminOverviewDto;
  fetchOverview?: () => Promise<AdminOverviewDto>;
  initialView?: AdminNavLabel;
}

const NAV_ITEMS = [
  { label: "Overview", icon: Gauge },
  { label: "Users", icon: Users },
  { label: "Access Codes", icon: KeyRound },
  { label: "Credits", icon: Coins },
  { label: "Tasks", icon: ClipboardList },
  { label: "Queue", icon: Workflow },
  { label: "Costs", icon: BadgeDollarSign },
  { label: "Feedback", icon: MessageSquareText },
  { label: "Settings", icon: Settings },
  { label: "Audit Logs", icon: FileClock },
] as const;

type AdminNavLabel = typeof NAV_ITEMS[number]["label"];

const EMPTY_OVERVIEW: AdminOverviewDto = {
  users: {
    total: 0,
    active: 0,
    disabled: 0,
    redeemed: 0,
  },
  tasks: {
    total: 0,
    byStatus: {
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      refunded: 0,
    },
    completionRate: 0,
    failureRate: 0,
  },
  credits: {
    totalBalance: 0,
    totalFrozen: 0,
    totalRedeemed: 0,
    consumed: 0,
  },
  costs: {
    estimatedTotal: 0,
  },
  queue: {
    backlog: 0,
  },
  accessCodes: {
    total: 0,
    active: 0,
    redeemed: 0,
    disabled: 0,
    expired: 0,
  },
};

export default function AdminApp({
  overview: initialOverview,
  fetchOverview = fetchAdminOverview,
  initialView = "Overview",
}: AdminAppProps = {}) {
  const [overview, setOverview] = useState<AdminOverviewDto | undefined>(
    initialOverview,
  );
  const [activeView, setActiveView] = useState<AdminNavLabel>(initialView);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const resolvedOverview = overview ?? EMPTY_OVERVIEW;
  const isLoading = overview === undefined;
  const completionRate = formatPercent(resolvedOverview.tasks.completionRate);
  const failureRate = formatPercent(resolvedOverview.tasks.failureRate);
  const redemptionRate = formatPercent(
    resolvedOverview.accessCodes.total === 0
      ? 0
      : resolvedOverview.accessCodes.redeemed / resolvedOverview.accessCodes.total,
  );

  useEffect(() => {
    if (initialOverview !== undefined) {
      return;
    }
    let cancelled = false;
    void fetchOverview()
      .then((nextOverview) => {
        if (!cancelled) {
          setOverview(nextOverview);
          setLoadError(undefined);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Unable to load admin overview");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fetchOverview, initialOverview]);

  return (
    <div id="admin-app-shell" className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <div className="grid min-h-screen lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="border-r border-slate-200 bg-white px-3 py-4">
          <div className="mb-5 flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <div className="text-sm font-black tracking-tight">tryitout admin</div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Commercial Ops</div>
            </div>
          </div>

          <nav className="space-y-1" aria-label="Admin navigation">
            {NAV_ITEMS.map((item, index) => {
              const Icon = item.icon;
              const active = item.label === activeView;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setActiveView(item.label)}
                  className={`flex min-h-10 w-full items-center gap-2.5 rounded-md px-3 text-left text-xs font-bold transition-colors ${
                    active
                      ? "bg-slate-950 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0">
          <header className="border-b border-slate-200 bg-white px-5 py-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Platform Control Center</div>
                <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">{activeView}</h1>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-bold">
                <span className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">Commercial mode monitored</span>
                <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700">Queue Backlog {resolvedOverview.queue.backlog}</span>
                <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">Oldest {resolvedOverview.queue.oldestQueuedAt ?? "none"}</span>
              </div>
            </div>
          </header>

          <div className="space-y-5 p-5">
            {(isLoading || loadError !== undefined) && (
              <section className="border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-600">
                {loadError !== undefined ? loadError : "Loading live metrics"}
              </section>
            )}
            {activeView === "Access Codes" ? (
              <AccessCodesPage />
            ) : (
              <OverviewDashboard
                overview={resolvedOverview}
                completionRate={completionRate}
                failureRate={failureRate}
                redemptionRate={redemptionRate}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function OverviewDashboard({
  overview,
  completionRate,
  failureRate,
  redemptionRate,
}: {
  overview: AdminOverviewDto;
  completionRate: string;
  failureRate: string;
  redemptionRate: string;
}) {
  return (
    <>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5" aria-label="Admin metrics">
        <Metric title="Total Users" value={overview.users.total} detail={`${overview.users.active} active / ${overview.users.disabled} disabled`} tone="slate" />
        <Metric title="Redeemed Users" value={overview.users.redeemed} detail={`${redemptionRate} code redemption`} tone="emerald" />
        <Metric title="Task Completion" value={completionRate} detail={`${overview.tasks.byStatus.completed} completed`} tone="cyan" />
        <Metric title="Failure Rate" value={failureRate} detail={`${overview.tasks.byStatus.failed} failed tasks`} tone="rose" />
        <Metric title="Estimated Cost" value={`¥${overview.costs.estimatedTotal.toFixed(2)}`} detail={`${overview.credits.consumed} credits consumed`} tone="amber" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <div className="space-y-5">
          <div className="border border-slate-200 bg-white">
            <PanelHeader title="Recent Failures" icon={Activity} action={`${overview.tasks.byStatus.failed} open`} />
            <table className="w-full text-left text-xs">
              <thead className="border-y border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-black">Area</th>
                  <th className="px-4 py-2 font-black">Signal</th>
                  <th className="px-4 py-2 font-black">Impact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <SignalRow area="Tasks" signal={`${failureRate} failed`} impact="Review provider, worker, and prompt safety errors" />
                <SignalRow area="Queue" signal={`${overview.queue.backlog} backlog`} impact="Watch capacity before paid users stall" />
                <SignalRow area="Codes" signal={`${overview.accessCodes.disabled} disabled`} impact="Audit campaign shutdowns and partner batches" />
              </tbody>
            </table>
          </div>

          <div className="border border-slate-200 bg-white">
            <PanelHeader title="High Cost Tasks" icon={BadgeDollarSign} action={`¥${overview.costs.estimatedTotal.toFixed(2)} total`} />
            <div className="grid gap-3 p-4 md:grid-cols-3">
              <CostCell label="Credits Redeemed" value={overview.credits.totalRedeemed} />
              <CostCell label="Credits Frozen" value={overview.credits.totalFrozen} />
              <CostCell label="Credits Balance" value={overview.credits.totalBalance} />
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="border border-slate-200 bg-white">
            <PanelHeader title="Redemption Watch" icon={KeyRound} action={`${overview.accessCodes.total} codes`} />
            <div className="space-y-3 p-4">
              <ProgressLine label="Active" value={overview.accessCodes.active} total={overview.accessCodes.total} tone="emerald" />
              <ProgressLine label="Redeemed" value={overview.accessCodes.redeemed} total={overview.accessCodes.total} tone="cyan" />
              <ProgressLine label="Disabled" value={overview.accessCodes.disabled} total={overview.accessCodes.total} tone="rose" />
              <ProgressLine label="Expired" value={overview.accessCodes.expired} total={overview.accessCodes.total} tone="slate" />
            </div>
          </div>

          <div className="border border-slate-200 bg-slate-950 p-4 text-white">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Operator Focus</div>
                <div className="mt-1 text-lg font-black">Protect paid execution</div>
              </div>
              <Workflow className="h-5 w-5 text-cyan-300" aria-hidden="true" />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <MiniStat label="Queued" value={overview.tasks.byStatus.queued} />
              <MiniStat label="Running" value={overview.tasks.byStatus.running} />
              <MiniStat label="Refunded" value={overview.tasks.byStatus.refunded} />
            </div>
          </div>
        </div>
      </section>
    </>
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
  tone: "slate" | "emerald" | "cyan" | "rose" | "amber";
}) {
  const toneClass = {
    slate: "border-slate-200 bg-white text-slate-950",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-950",
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-950",
    rose: "border-rose-200 bg-rose-50 text-rose-950",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
  }[tone];
  return (
    <div className={`min-h-28 border p-4 ${toneClass}`}>
      <div className="text-[10px] font-black uppercase tracking-[0.14em] opacity-60">{title}</div>
      <div className="mt-3 text-2xl font-black tracking-tight">{value}</div>
      <div className="mt-2 text-xs font-semibold opacity-70">{detail}</div>
    </div>
  );
}

function PanelHeader({
  title,
  icon: Icon,
  action,
}: {
  title: string;
  icon: typeof Activity;
  action: string;
}) {
  return (
    <div className="flex min-h-12 items-center justify-between px-4">
      <div className="flex items-center gap-2 text-sm font-black">
        <Icon className="h-4 w-4 text-slate-500" aria-hidden="true" />
        <span>{title}</span>
      </div>
      <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{action}</span>
    </div>
  );
}

function SignalRow({
  area,
  signal,
  impact,
}: {
  area: string;
  signal: string;
  impact: string;
}) {
  return (
    <tr>
      <td className="px-4 py-3 font-black text-slate-950">{area}</td>
      <td className="px-4 py-3 font-semibold text-slate-700">{signal}</td>
      <td className="px-4 py-3 text-slate-500">{impact}</td>
    </tr>
  );
}

function CostCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-slate-200 bg-slate-50 p-3">
      <div className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">{label}</div>
      <div className="mt-2 font-mono text-xl font-black text-slate-950">{value}</div>
    </div>
  );
}

function ProgressLine({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "emerald" | "cyan" | "rose" | "slate";
}) {
  const width = total === 0 ? 0 : Math.round((value / total) * 100);
  const barClass = {
    emerald: "bg-emerald-500",
    cyan: "bg-cyan-500",
    rose: "bg-rose-500",
    slate: "bg-slate-500",
  }[tone];
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs font-bold">
        <span>{label}</span>
        <span className="font-mono">{value}</span>
      </div>
      <div className="h-2 bg-slate-100">
        <div className={`h-full ${barClass}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-white/10 bg-white/6 p-3">
      <div className="font-mono text-lg font-black">{value}</div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</div>
    </div>
  );
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}
