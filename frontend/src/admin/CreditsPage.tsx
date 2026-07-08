import { useEffect, useState } from "react";
import {
  CreditCard,
  History,
} from "lucide-react";

import {
  fetchAdminCreditOperations,
  type AdminCreditOperationsDto,
} from "./admin-client.js";

interface CreditsPageProps {
  operations?: AdminCreditOperationsDto;
  fetchOperations?: () => Promise<AdminCreditOperationsDto>;
}

const EMPTY_OPERATIONS: AdminCreditOperationsDto = {
  accounts: [],
  ledger: [],
};

export default function CreditsPage({
  operations,
  fetchOperations = fetchAdminCreditOperations,
}: CreditsPageProps) {
  const [resolvedOperations, setResolvedOperations] = useState(operations ?? EMPTY_OPERATIONS);
  const [isLoading, setIsLoading] = useState(operations === undefined);
  const [loadError, setLoadError] = useState("");
  const totalBalance = resolvedOperations.accounts.reduce((total, account) => total + account.balance, 0);
  const totalFrozen = resolvedOperations.accounts.reduce((total, account) => total + account.frozenCredits, 0);
  const totalRedeemed = resolvedOperations.accounts.reduce((total, account) => total + account.totalRedeemed, 0);
  const totalCaptured = resolvedOperations.accounts.reduce((total, account) => total + account.totalCaptured, 0);

  useEffect(() => {
    if (operations !== undefined) {
      setResolvedOperations(operations);
      setIsLoading(false);
      setLoadError("");
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    void fetchOperations()
      .then((nextOperations) => {
        if (!cancelled) {
          setResolvedOperations(nextOperations);
          setLoadError("");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Unable to load credit operations");
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
  }, [fetchOperations, operations]);

  return (
    <div className="space-y-5">
      {(isLoading || loadError) && (
        <section className="border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-600">
          {isLoading ? "Loading credit operations" : loadError}
        </section>
      )}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric title="Balance" value={totalBalance} detail={`${resolvedOperations.accounts.length} accounts`} tone="emerald" />
        <Metric title="Frozen" value={totalFrozen} detail="Held for running tasks" tone="amber" />
        <Metric title="Redeemed" value={totalRedeemed} detail="Access-code grants" tone="cyan" />
        <Metric title="Captured" value={totalCaptured} detail="Paid executions consumed" tone="rose" />
      </section>

      <section className="border border-slate-200 bg-white">
        <PanelTitle icon={CreditCard} title="Credit Accounts" action={`${resolvedOperations.accounts.length} accounts`} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-xs">
            <thead className="border-y border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.13em] text-slate-500">
              <tr>
                <th className="px-4 py-2 font-black">User</th>
                <th className="px-4 py-2 font-black">Balance</th>
                <th className="px-4 py-2 font-black">Frozen</th>
                <th className="px-4 py-2 font-black">Redeemed</th>
                <th className="px-4 py-2 font-black">Captured</th>
                <th className="px-4 py-2 font-black">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {resolvedOperations.accounts.map((account) => (
                <tr key={account.userId}>
                  <td className="px-4 py-3">
                    <div className="font-black text-slate-950">{account.userEmail}</div>
                    <div className="mt-1 font-mono text-[10px] text-slate-400">{account.userId}</div>
                  </td>
                  <td className="px-4 py-3 font-mono font-black text-emerald-700">{account.balance}</td>
                  <td className="px-4 py-3 font-mono text-amber-700">{account.frozenCredits}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">{account.totalRedeemed}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">{account.totalCaptured}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(account.updatedAt)}</td>
                </tr>
              ))}
              {resolvedOperations.accounts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs font-bold text-slate-500">
                    No credit accounts loaded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border border-slate-200 bg-white">
        <PanelTitle icon={History} title="Credit Ledger" action={`${resolvedOperations.ledger.length} entries`} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead className="border-y border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.13em] text-slate-500">
              <tr>
                <th className="px-4 py-2 font-black">Entry</th>
                <th className="px-4 py-2 font-black">User</th>
                <th className="px-4 py-2 font-black">Type</th>
                <th className="px-4 py-2 font-black">Amount</th>
                <th className="px-4 py-2 font-black">Balance After</th>
                <th className="px-4 py-2 font-black">Idempotency</th>
                <th className="px-4 py-2 font-black">Reason</th>
                <th className="px-4 py-2 font-black">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {resolvedOperations.ledger.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-4 py-3 font-mono font-black text-slate-950">{entry.id}</td>
                  <td className="px-4 py-3 font-semibold text-slate-700">{entry.userEmail}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">{entry.entryType}</td>
                  <td className="px-4 py-3 font-mono font-black text-slate-950">{entry.amount}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">{entry.balanceAfter}</td>
                  <td className="px-4 py-3 font-mono text-[10px] text-slate-500">{entry.idempotencyKey}</td>
                  <td className="px-4 py-3 text-slate-500">{entry.reason ?? "none"}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(entry.createdAt)}</td>
                </tr>
              ))}
              {resolvedOperations.ledger.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-xs font-bold text-slate-500">
                    No credit ledger entries loaded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
  value: number;
  detail: string;
  tone: "emerald" | "amber" | "cyan" | "rose";
}) {
  const toneClass = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-950",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-950",
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

function PanelTitle({
  icon: Icon,
  title,
  action,
}: {
  icon: typeof CreditCard;
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

function formatDateTime(value: string): string {
  return value.replace("T", " ").slice(0, 16);
}
