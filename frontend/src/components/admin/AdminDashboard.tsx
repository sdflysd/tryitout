import {
  Activity,
  ClipboardList,
  Gauge,
  KeyRound,
  MessageSquareText,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";

interface AdminDashboardProps {
  adminEmail?: string;
}

const ADMIN_SECTIONS = [
  { label: "Overview", icon: Gauge },
  { label: "Users", icon: Users },
  { label: "Access Codes", icon: KeyRound },
  { label: "Tasks", icon: ClipboardList },
  { label: "Feedback", icon: MessageSquareText },
  { label: "Settings", icon: Settings },
  { label: "Audit Logs", icon: ScrollText },
] as const;

const METRICS = [
  { label: "Active users", value: "--", delta: "Awaiting data API" },
  { label: "Credits held", value: "--", delta: "Queue backed" },
  { label: "Open tasks", value: "--", delta: "Weighted concurrency" },
  { label: "Feedback", value: "--", delta: "Report quality" },
] as const;

export default function AdminDashboard({ adminEmail }: AdminDashboardProps) {
  return (
    <section
      id="admin-dashboard-root"
      className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 text-slate-100"
      aria-label="Commercial admin dashboard"
    >
      <div className="flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-black uppercase text-emerald-200">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <span>Admin-only operations</span>
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-normal text-white">Commercial Admin</h1>
          <p className="mt-1 text-sm font-semibold text-white/60">
            {adminEmail ?? "Admin session required"}
          </p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-md border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs font-black text-amber-100">
          <Activity className="h-4 w-4" aria-hidden="true" />
          <span>Live controls connect in next API pass</span>
        </div>
      </div>

      <nav
        className="flex gap-2 overflow-x-auto border-b border-white/10 pb-2"
        role="tablist"
        aria-label="Admin dashboard sections"
      >
        {ADMIN_SECTIONS.map(({ label, icon: Icon }, index) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={index === 0}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border px-3 text-xs font-black transition-colors ${
              index === 0
                ? "border-emerald-300/40 bg-emerald-300/12 text-emerald-100"
                : "border-white/10 bg-white/6 text-white/64 hover:bg-white/10"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="grid gap-3 md:grid-cols-4" aria-label="Admin overview metrics">
        {METRICS.map((metric) => (
          <div key={metric.label} className="rounded-md border border-white/10 bg-white/7 p-3">
            <div className="text-xs font-bold text-white/56">{metric.label}</div>
            <div className="mt-1 text-2xl font-black text-white">{metric.value}</div>
            <div className="mt-1 text-xs font-semibold text-emerald-200/80">{metric.delta}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="min-w-0" aria-label="Users operations table">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-sm font-black text-white">Users</h2>
            <span className="text-xs font-semibold text-white/50">Balance and entitlement review</span>
          </div>
          <div className="overflow-x-auto rounded-md border border-white/10">
            <table className="min-w-full border-collapse text-left text-xs">
              <thead className="bg-white/10 text-white/70">
                <tr>
                  <th className="px-3 py-2 font-black">User</th>
                  <th className="px-3 py-2 font-black">Status</th>
                  <th className="px-3 py-2 font-black">Balance</th>
                  <th className="px-3 py-2 font-black">Tier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8 bg-white/5 text-white/62">
                <tr>
                  <td className="px-3 py-3">No rows loaded</td>
                  <td className="px-3 py-3">--</td>
                  <td className="px-3 py-3">--</td>
                  <td className="px-3 py-3">--</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="min-w-0" aria-label="Access code and audit operations">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-sm font-black text-white">Access Codes</h2>
            <span className="text-xs font-semibold text-white/50">Creation output remains one-time</span>
          </div>
          <div className="overflow-x-auto rounded-md border border-white/10">
            <table className="min-w-full border-collapse text-left text-xs">
              <thead className="bg-white/10 text-white/70">
                <tr>
                  <th className="px-3 py-2 font-black">Code</th>
                  <th className="px-3 py-2 font-black">Credits</th>
                  <th className="px-3 py-2 font-black">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8 bg-white/5 text-white/62">
                <tr>
                  <td className="px-3 py-3">TIO-****-****-****</td>
                  <td className="px-3 py-3">--</td>
                  <td className="px-3 py-3">Generate / Disable</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {["Tasks", "Feedback", "Settings", "Audit Logs"].map((label) => (
          <section key={label} className="rounded-md border border-white/10 bg-white/6 p-3">
            <h2 className="text-sm font-black text-white">{label}</h2>
            <p className="mt-1 text-xs font-semibold leading-5 text-white/56">
              Operations data placeholder for the commercial MVP.
            </p>
          </section>
        ))}
      </div>
    </section>
  );
}
