import type { ReactNode } from "react";
import {
  useEffect,
  useState,
  type FormEvent,
} from "react";
import {
  CreditCard,
  History,
  ShieldAlert,
  UserCog,
} from "lucide-react";

import {
  adjustAdminUserCredits,
  fetchAdminUsers,
  type AdminUserRowDto,
} from "./admin-client.js";

interface UsersPageProps {
  users?: AdminUserRowDto[];
  fetchUsers?: () => Promise<AdminUserRowDto[]>;
}

const EMPTY_USERS: AdminUserRowDto[] = [];

export default function UsersPage({
  users,
  fetchUsers = fetchAdminUsers,
}: UsersPageProps) {
  const [rows, setRows] = useState<AdminUserRowDto[]>(users ?? EMPTY_USERS);
  const [isLoading, setIsLoading] = useState(users === undefined);
  const [loadError, setLoadError] = useState("");
  const [adjustment, setAdjustment] = useState({
    amount: 0,
    idempotencyKey: "",
    reason: "",
  });
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedUserId, setSelectedUserId] = useState(users?.[0]?.id ?? "");
  const selectedUser = rows.find((user) => user.id === selectedUserId) ?? rows[0];
  const activeUsers = rows.filter((user) => user.status === "active").length;
  const disabledUsers = rows.filter((user) => user.status === "disabled").length;
  const totalAvailable = rows.reduce((total, user) => total + user.availableCredits, 0);
  const totalFrozen = rows.reduce((total, user) => total + user.frozenCredits, 0);
  const totalRedeemedBatches = rows.reduce(
    (total, user) => total + user.redeemedBatchCount,
    0,
  );
  const totalFailedTasks = rows.reduce(
    (total, user) => total + user.failedTaskCount,
    0,
  );

  useEffect(() => {
    if (users !== undefined) {
      setRows(users);
      setIsLoading(false);
      setLoadError("");
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    void fetchUsers()
      .then((nextUsers) => {
        if (!cancelled) {
          setRows(nextUsers);
          setLoadError("");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Unable to load commercial users");
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
  }, [fetchUsers, users]);

  const handleAdjustCredits = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedUser === undefined) {
      setStatusMessage("Select a user before adjusting credits.");
      return;
    }
    setStatusMessage("Submitting credit adjustment...");
    const result = await adjustAdminUserCredits(selectedUser.id, {
      amount: adjustment.amount,
      reason: adjustment.reason,
      idempotencyKey: adjustment.idempotencyKey,
    });
    setRows((currentRows) =>
      currentRows.map((user) =>
        user.id === selectedUser.id
          ? {
              ...user,
              availableCredits: result.account.balance,
              frozenCredits: result.account.frozenCredits,
              recentActivityAt: result.ledger.createdAt,
            }
          : user,
      ),
    );
    setStatusMessage(`Credit adjustment recorded: ${result.ledger.amount} credits.`);
  };

  return (
    <div className="space-y-5">
      {(isLoading || loadError) && (
        <section className="border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-600">
          {isLoading ? "Loading commercial users" : loadError}
        </section>
      )}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="User operations metrics">
        <Metric title="Active Users" value={activeUsers} detail={`${disabledUsers} disabled`} tone="emerald" />
        <Metric title="Available Credits" value={totalAvailable} detail={`${totalFrozen} frozen`} tone="cyan" />
        <Metric title="Redeemed Batches" value={totalRedeemedBatches} detail="Campaign conversion signal" tone="amber" />
        <Metric title="Failed Tasks" value={totalFailedTasks} detail="Needs support review" tone="rose" />
      </section>

      <section className="border border-slate-200 bg-white">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <UserCog className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-black text-slate-950">User Operations</h2>
              <p className="text-xs font-semibold text-slate-500">Commercial accounts, credit health, redemption source, and task reliability.</p>
            </div>
          </div>
          <div className="text-xs font-bold text-slate-500">{rows.length} users tracked</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.13em] text-slate-500">
              <tr>
                <th className="px-4 py-2 font-black">Email</th>
                <th className="px-4 py-2 font-black">Status</th>
                <th className="px-4 py-2 font-black">Tier</th>
                <th className="px-4 py-2 font-black">Available</th>
                <th className="px-4 py-2 font-black">Frozen</th>
                <th className="px-4 py-2 font-black">Redeemed Batches</th>
                <th className="px-4 py-2 font-black">Tasks</th>
                <th className="px-4 py-2 font-black">Completed</th>
                <th className="px-4 py-2 font-black">Failed</th>
                <th className="px-4 py-2 font-black">Recent Activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-3">
                    <div className="font-black text-slate-950">{user.email}</div>
                    <div className="mt-1 font-mono text-[10px] text-slate-400">{user.id}</div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={user.status} />
                  </td>
                  <td className="px-4 py-3 font-mono font-black text-slate-950">{user.tier}</td>
                  <td className="px-4 py-3 font-mono font-black text-emerald-700">{user.availableCredits}</td>
                  <td className="px-4 py-3 font-mono text-amber-700">{user.frozenCredits}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">{user.redeemedBatchCount}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">{user.taskCount}</td>
                  <td className="px-4 py-3 font-mono text-emerald-700">{user.completedTaskCount}</td>
                  <td className="px-4 py-3 font-mono text-rose-700">{user.failedTaskCount}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(user.recentActivityAt ?? user.lastLoginAt ?? user.createdAt)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-xs font-bold text-slate-500">
                    No commercial users loaded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(340px,0.8fr)_minmax(0,1.2fr)]">
        <form onSubmit={(event) => void handleAdjustCredits(event)} className="border border-slate-200 bg-white p-4">
          <div className="mb-4 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <h2 className="text-sm font-black text-slate-950">Credit Adjustment</h2>
          </div>
          <div className="grid gap-3">
            <Field label="Target user">
              <select
                className="admin-input"
                value={selectedUser?.id ?? selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
              >
                {rows.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.email}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Amount">
                <input
                  className="admin-input"
                  type="number"
                  value={adjustment.amount}
                  onChange={(event) => setAdjustment({ ...adjustment, amount: Number(event.target.value) })}
                />
              </Field>
              <Field label="Idempotency key">
                <input
                  className="admin-input"
                  value={adjustment.idempotencyKey}
                  onChange={(event) => setAdjustment({ ...adjustment, idempotencyKey: event.target.value })}
                  placeholder="support-ticket-123"
                />
              </Field>
            </div>
            <Field label="Reason">
              <textarea
                className="admin-input min-h-20"
                value={adjustment.reason}
                onChange={(event) => setAdjustment({ ...adjustment, reason: event.target.value })}
                placeholder="Paid support grant, refund, migration correction..."
              />
            </Field>
          </div>
          <button type="submit" className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-md bg-slate-950 px-4 text-xs font-black text-white">
            Confirm adjustment
          </button>
          {statusMessage && <p className="mt-3 text-xs font-bold text-slate-500">{statusMessage}</p>}
        </form>

        <section className="border border-slate-200 bg-white">
          <div className="flex min-h-12 items-center justify-between border-b border-slate-200 px-4">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-slate-500" aria-hidden="true" />
              <h2 className="text-sm font-black text-slate-950">Recent Activity</h2>
            </div>
            <span className="rounded-sm bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
              masked account view
            </span>
          </div>
          <div className="grid gap-3 p-4 md:grid-cols-3">
            <ActivityCell label="Last activity" value={formatDateTime(selectedUser?.recentActivityAt)} />
            <ActivityCell label="Active tasks" value={selectedUser?.activeTaskCount ?? 0} />
            <ActivityCell label="Failure ratio" value={formatRatio(selectedUser?.failedTaskCount ?? 0, selectedUser?.taskCount ?? 0)} />
          </div>
          <div className="border-t border-slate-200 p-4">
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Credit changes must carry a reason and idempotency key so finance, support, and audit logs can reconcile the operator action.</span>
            </div>
          </div>
        </section>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-xs font-black text-slate-700">
      <span>{label}</span>
      {children}
    </label>
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
  tone: "emerald" | "cyan" | "amber" | "rose";
}) {
  const toneClass = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-950",
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-950",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    rose: "border-rose-200 bg-rose-50 text-rose-950",
  }[tone];
  return (
    <div className={`min-h-24 border p-4 ${toneClass}`}>
      <div className="text-[10px] font-black uppercase tracking-[0.14em] opacity-60">{title}</div>
      <div className="mt-3 font-mono text-2xl font-black tracking-tight">{value}</div>
      <div className="mt-2 text-xs font-semibold opacity-70">{detail}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: AdminUserRowDto["status"] }) {
  const className =
    status === "active"
      ? "bg-emerald-50 text-emerald-700"
      : "bg-rose-50 text-rose-700";
  return (
    <span className={`rounded-sm px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${className}`}>
      {status}
    </span>
  );
}

function ActivityCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-slate-200 bg-slate-50 p-3">
      <div className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">{label}</div>
      <div className="mt-2 font-mono text-sm font-black text-slate-950">{value}</div>
    </div>
  );
}

function formatDateTime(value: string | undefined): string {
  return value === undefined ? "none" : value.replace("T", " ").slice(0, 16);
}

function formatRatio(numerator: number, denominator: number): string {
  if (denominator === 0) {
    return "0.00%";
  }
  return `${((numerator / denominator) * 100).toFixed(2)}%`;
}
