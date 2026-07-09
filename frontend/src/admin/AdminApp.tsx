import { useEffect, useState } from "react";
import {
  Activity,
  BadgeDollarSign,
  ClipboardList,
  Coins,
  FileClock,
  Gauge,
  KeyRound,
  LogOut,
  MessageSquareText,
  Settings,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react";

import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  getLanguageToggleLabel,
  getNextLanguage,
  parseStoredLanguage,
  type Language,
} from "../language.js";
import AccessCodesPage from "./AccessCodesPage.js";
import AuditLogsPage from "./AuditLogsPage.js";
import CostsPage from "./CostsPage.js";
import CreditsPage from "./CreditsPage.js";
import FeedbackPage from "./FeedbackPage.js";
import QueuePage from "./QueuePage.js";
import SettingsPage from "./SettingsPage.js";
import TasksPage from "./TasksPage.js";
import UsersPage from "./UsersPage.js";
import {
  AdminClientError,
  fetchAdminOverview,
  type AdminOverviewDto,
} from "./admin-client.js";
import { logoutCommercialUser } from "../commercial-client.js";
import { getAdminCopy, type AdminCopy } from "./admin-copy.js";

interface AdminAppProps {
  overview?: AdminOverviewDto;
  fetchOverview?: () => Promise<AdminOverviewDto>;
  initialView?: AdminNavLabel;
  initialLoadError?: AdminClientError | Error;
  initialLanguage?: Language;
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
    queued: 0,
    running: 0,
    retrying: 0,
    stuck: 0,
    activeWeight: 0,
    maxWeight: 0,
    workers: [],
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
  initialLoadError,
  initialLanguage,
}: AdminAppProps = {}) {
  const [overview, setOverview] = useState<AdminOverviewDto | undefined>(
    initialOverview,
  );
  const [activeView, setActiveView] = useState<AdminNavLabel>(initialView);
  const [loadError, setLoadError] = useState<AdminClientError | Error | undefined>(initialLoadError);
  const [logoutError, setLogoutError] = useState("");
  const [language, setLanguage] = useState<Language>(() => initialLanguage ?? getInitialAdminLanguage());
  const resolvedOverview = overview ?? EMPTY_OVERVIEW;
  const copy = getAdminCopy(language);
  const isLoading = overview === undefined;
  const authenticationError =
    loadError !== undefined && isAuthenticationError(loadError);
  const completionRate = formatPercent(resolvedOverview.tasks.completionRate);
  const failureRate = formatPercent(resolvedOverview.tasks.failureRate);
  const redemptionRate = formatPercent(
    resolvedOverview.accessCodes.total === 0
      ? 0
      : resolvedOverview.accessCodes.redeemed / resolvedOverview.accessCodes.total,
    );

  useEffect(() => {
    if (initialLanguage !== undefined) {
      return;
    }
    try {
      globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Ignore unavailable storage in SSR/tests.
    }
  }, [initialLanguage, language]);

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
          setLoadError(error instanceof Error ? error : new Error("Unable to load admin overview"));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fetchOverview, initialOverview]);

  if (authenticationError) {
    return <AdminLoginGate copy={copy} />;
  }

  const handleLogout = async () => {
    setLogoutError("");
    try {
      await logoutAdminSession();
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : "Logout failed");
    }
  };

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
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{copy.brandSubtitle}</div>
            </div>
          </div>

          <nav className="space-y-1" aria-label={copy.navAriaLabel}>
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
                  <span>{copy.nav[item.label]}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0">
          <header className="border-b border-slate-200 bg-white px-5 py-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{copy.shell.eyebrow}</div>
                <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">{copy.nav[activeView]}</h1>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                <button
                  id="btn-admin-toggle-language"
                  type="button"
                  onClick={() => setLanguage((current) => getNextLanguage(current))}
                  className="inline-flex min-h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition-colors hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700"
                  aria-label={copy.languageToggleAriaLabel}
                  title={copy.languageToggleAriaLabel}
                >
                  {getLanguageToggleLabel(language)}
                </button>
                <button
                  id="btn-admin-logout"
                  type="button"
                  onClick={() => void handleLogout()}
                  className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  {copy.shell.logout}
                </button>
                <span className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">{copy.shell.badges.commercialMode}</span>
                <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700">{copy.shell.badges.queueBacklog} {resolvedOverview.queue.backlog}</span>
                <span className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-cyan-700">{copy.shell.badges.activeWeight} {resolvedOverview.queue.activeWeight ?? 0}/{resolvedOverview.queue.maxWeight ?? 0}</span>
                <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">{copy.shell.badges.oldest} {resolvedOverview.queue.oldestQueuedAt ?? copy.shell.badges.none}</span>
              </div>
            </div>
          </header>

          <div className="space-y-5 p-5">
            {logoutError && (
              <section className="border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
                {logoutError}
              </section>
            )}
            {(isLoading || loadError !== undefined) && (
              <section className="border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-600">
                {loadError !== undefined ? (
                  isAuthenticationError(loadError) ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <span>{copy.shell.loginRequired}</span>
                      <a
                        href="/login"
                        className="inline-flex min-h-9 items-center justify-center rounded-md bg-slate-950 px-3 text-[10px] font-black text-white"
                      >
                        {copy.shell.loginAction}
                      </a>
                    </div>
                  ) : (
                    getLoadErrorMessage(loadError)
                  )
                ) : copy.shell.loading}
              </section>
            )}
            <AdminView
              activeView={activeView}
              overview={resolvedOverview}
              completionRate={completionRate}
              failureRate={failureRate}
              redemptionRate={redemptionRate}
              language={language}
              copy={copy}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

export async function logoutAdminSession(
  location: Pick<Location, "assign"> | undefined = globalThis.location,
): Promise<void> {
  await logoutCommercialUser();
  location?.assign("/login");
}

function AdminLoginGate({ copy }: { copy: AdminCopy }) {
  return (
    <main id="admin-login-gate" className="grid min-h-screen place-items-center bg-[#f5f7fb] px-4 text-slate-950">
      <section className="w-full max-w-md border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="text-sm font-black tracking-tight">tryitout admin</div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{copy.brandSubtitle}</div>
          </div>
        </div>
        <p className="mt-5 text-sm font-bold text-slate-700">{copy.shell.loginRequired}</p>
        <a
          href="/login"
          className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-xs font-black text-white"
        >
          {copy.shell.loginAction}
        </a>
      </section>
    </main>
  );
}

function AdminView({
  activeView,
  overview,
  completionRate,
  failureRate,
  redemptionRate,
  language,
  copy,
}: {
  activeView: AdminNavLabel;
  overview: AdminOverviewDto;
  completionRate: string;
  failureRate: string;
  redemptionRate: string;
  language: Language;
  copy: AdminCopy;
}) {
  if (activeView === "Access Codes") {
    return <AccessCodesPage language={language} />;
  }
  if (activeView === "Users") {
    return <UsersPage language={language} />;
  }
  if (activeView === "Tasks") {
    return <TasksPage language={language} />;
  }
  if (activeView === "Credits") {
    return <CreditsPage />;
  }
  if (activeView === "Queue") {
    return <QueuePage />;
  }
  if (activeView === "Costs") {
    return <CostsPage language={language} />;
  }
  if (activeView === "Feedback") {
    return <FeedbackPage />;
  }
  if (activeView === "Settings") {
    return <SettingsPage />;
  }
  if (activeView === "Audit Logs") {
    return <AuditLogsPage />;
  }

  return (
    <OverviewDashboard
      overview={overview}
      completionRate={completionRate}
      failureRate={failureRate}
      redemptionRate={redemptionRate}
      copy={copy}
    />
  );
}

function OverviewDashboard({
  overview,
  completionRate,
  failureRate,
  redemptionRate,
  copy,
}: {
  overview: AdminOverviewDto;
  completionRate: string;
  failureRate: string;
  redemptionRate: string;
  copy: AdminCopy;
}) {
  return (
    <>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5" aria-label={copy.overview.metricsAriaLabel}>
        <Metric title={copy.overview.metrics.totalUsers} value={overview.users.total} detail={copy.overview.details.activeDisabled(overview.users.active, overview.users.disabled)} tone="slate" />
        <Metric title={copy.overview.metrics.redeemedUsers} value={overview.users.redeemed} detail={copy.overview.details.codeRedemption(redemptionRate)} tone="emerald" />
        <Metric title={copy.overview.metrics.taskCompletion} value={completionRate} detail={copy.overview.details.completed(overview.tasks.byStatus.completed)} tone="cyan" />
        <Metric title={copy.overview.metrics.failureRate} value={failureRate} detail={copy.overview.details.failedTasks(overview.tasks.byStatus.failed)} tone="rose" />
        <Metric title={copy.overview.metrics.estimatedCost} value={`¥${overview.costs.estimatedTotal.toFixed(2)}`} detail={copy.overview.details.creditsConsumed(overview.credits.consumed)} tone="amber" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <div className="space-y-5">
          <div className="border border-slate-200 bg-white">
            <PanelHeader title={copy.overview.panels.recentFailures} icon={Activity} action={`${overview.tasks.byStatus.failed} open`} />
            <table className="w-full text-left text-xs">
              <thead className="border-y border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-black">{copy.overview.table.area}</th>
                  <th className="px-4 py-2 font-black">{copy.overview.table.signal}</th>
                  <th className="px-4 py-2 font-black">{copy.overview.table.impact}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <SignalRow area={copy.overview.signals.tasks} signal={copy.overview.signals.failed(failureRate)} impact={copy.overview.signals.taskImpact} />
                <SignalRow area={copy.overview.signals.queue} signal={copy.overview.signals.backlog(overview.queue.backlog)} impact={copy.overview.signals.queueImpact} />
                <SignalRow area={copy.overview.signals.stuckTasks} signal={copy.overview.signals.stuck(overview.queue.stuck ?? 0)} impact={copy.overview.signals.stuckImpact(overview.queue.retrying ?? 0, overview.queue.running ?? overview.tasks.byStatus.running)} />
                <SignalRow area={copy.overview.signals.codes} signal={copy.overview.signals.disabled(overview.accessCodes.disabled)} impact={copy.overview.signals.codeImpact} />
              </tbody>
            </table>
          </div>

          <div className="border border-slate-200 bg-white">
            <PanelHeader title={copy.overview.panels.highCostTasks} icon={BadgeDollarSign} action={copy.overview.costs.total(`¥${overview.costs.estimatedTotal.toFixed(2)}`)} />
            <div className="grid gap-3 p-4 md:grid-cols-3">
              <CostCell label={copy.overview.costs.creditsRedeemed} value={overview.credits.totalRedeemed} />
              <CostCell label={copy.overview.costs.creditsFrozen} value={overview.credits.totalFrozen} />
              <CostCell label={copy.overview.costs.creditsBalance} value={overview.credits.totalBalance} />
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="border border-slate-200 bg-white">
            <PanelHeader title={copy.overview.panels.redemptionWatch} icon={KeyRound} action={copy.overview.redemption.codes(overview.accessCodes.total)} />
            <div className="space-y-3 p-4">
              <ProgressLine label={copy.overview.redemption.active} value={overview.accessCodes.active} total={overview.accessCodes.total} tone="emerald" />
              <ProgressLine label={copy.overview.redemption.redeemed} value={overview.accessCodes.redeemed} total={overview.accessCodes.total} tone="cyan" />
              <ProgressLine label={copy.overview.redemption.disabled} value={overview.accessCodes.disabled} total={overview.accessCodes.total} tone="rose" />
              <ProgressLine label={copy.overview.redemption.expired} value={overview.accessCodes.expired} total={overview.accessCodes.total} tone="slate" />
            </div>
          </div>

          <div className="border border-slate-200 bg-slate-950 p-4 text-white">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{copy.overview.panels.operatorFocus}</div>
                <div className="mt-1 text-lg font-black">{copy.overview.panels.protectPaidExecution}</div>
              </div>
              <Workflow className="h-5 w-5 text-cyan-300" aria-hidden="true" />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <MiniStat label={copy.overview.miniStats.queued} value={overview.tasks.byStatus.queued} />
              <MiniStat label={copy.overview.miniStats.running} value={overview.queue.running ?? overview.tasks.byStatus.running} />
              <MiniStat label={copy.overview.miniStats.stuck} value={overview.queue.stuck ?? 0} />
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

function getInitialAdminLanguage(): Language {
  try {
    return parseStoredLanguage(globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY) ?? null) ?? DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

function isAuthenticationError(error: AdminClientError | Error): boolean {
  return error instanceof AdminClientError && (
    error.status === 401 ||
    error.code === "authentication_required" ||
    error.code === "admin_required"
  );
}

function getLoadErrorMessage(error: AdminClientError | Error): string {
  return error.message || "Unable to load admin overview";
}
