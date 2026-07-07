import {
  CreditCard,
  KeyRound,
  LogOut,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  useState,
  type FormEvent,
} from "react";

import type {
  CommercialCredentialsDto,
  CommercialCreditAccountDto,
  CommercialUserDto,
  PublicModelProviderDto,
  RedeemAccessCodeInputDto,
} from "../commercial-client.js";

interface AccountPanelProps {
  user?: CommercialUserDto;
  account?: CommercialCreditAccountDto;
  modelProvider?: PublicModelProviderDto;
  statusMessage?: string;
  errorMessage?: string;
  busy?: boolean;
  onLogin?: (input: CommercialCredentialsDto) => Promise<void> | void;
  onRegister?: (input: CommercialCredentialsDto) => Promise<void> | void;
  onLogout?: () => Promise<void> | void;
  onRedeem?: (input: RedeemAccessCodeInputDto) => Promise<void> | void;
  createIdempotencyKey?: (prefix: string) => string;
}

export default function AccountPanel({
  user,
  account,
  modelProvider,
  statusMessage,
  errorMessage,
  busy = false,
  onLogin,
  onRegister,
  onLogout,
  onRedeem,
  createIdempotencyKey = defaultCreateIdempotencyKey,
}: AccountPanelProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessCode, setAccessCode] = useState("");

  const handleAuthSubmit = async (
    event: FormEvent<HTMLFormElement>,
    action: "login" | "register",
  ) => {
    event.preventDefault();
    const input = { email: email.trim(), password };
    if (action === "login") {
      await onLogin?.(input);
    } else {
      await onRegister?.(input);
    }
  };

  const handleRedeemSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = accessCode.trim();
    if (!code) return;
    await onRedeem?.({
      code,
      idempotencyKey: createIdempotencyKey("redeem"),
    });
    setAccessCode("");
  };

  const handleRegisterClick = async () => {
    await onRegister?.({ email: email.trim(), password });
  };

  return (
    <section
      id="account-panel"
      className="border border-white/10 bg-white/[0.055] p-3 text-left text-white shadow-lg shadow-black/10 backdrop-blur-md"
      aria-label="Commercial account"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <UserRound className="h-4 w-4 text-cyan-200" aria-hidden="true" />
            <h2 className="text-xs font-black text-white">Commercial account</h2>
            {user && (
              <span className="rounded-sm border border-cyan-200/20 bg-cyan-200/10 px-1.5 py-0.5 font-mono text-[10px] font-black uppercase tracking-[0.08em] text-cyan-100">
                {user.tier}
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-[11px] font-semibold text-white/54">
            {user?.email ?? "Sign in for paid credits, access-code redemption, and task holds."}
          </p>
        </div>

        {user ? (
          <button
            type="button"
            onClick={() => void onLogout?.()}
            disabled={busy}
            className="inline-flex min-h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/7 px-2.5 text-[10px] font-black text-white/70 transition-colors hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            Logout
          </button>
        ) : null}
      </div>

      {user ? (
        <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)]">
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <AccountMetric label="Available credits" value={account?.balance ?? 0} tone="emerald" />
              <AccountMetric label="Frozen credits" value={account?.frozenCredits ?? 0} tone="amber" />
              <AccountMetric label="Redeemed total" value={account?.totalRedeemed ?? 0} tone="cyan" />
              <AccountMetric label="Captured total" value={account?.totalCaptured ?? 0} tone="slate" />
            </div>
            {modelProvider !== undefined && (
              <div className="border border-white/10 bg-black/14 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.12em] text-white/42">Model provider</span>
                  <span className="rounded-sm border border-emerald-200/20 bg-emerald-200/10 px-1.5 py-0.5 text-[10px] font-black text-emerald-100">{modelProvider.status}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-bold text-white/62">
                  <span>{modelProvider.displayName}</span>
                  <span className="font-mono text-cyan-100">{modelProvider.apiKeyMask}</span>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={(event) => void handleRedeemSubmit(event)} className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-white/42">Access code</span>
              <input
                value={accessCode}
                onChange={(event) => setAccessCode(event.target.value)}
                className="min-h-9 w-full rounded-md border border-white/10 bg-black/20 px-3 text-xs font-semibold text-white outline-none placeholder:text-white/30 focus:border-cyan-200/40 focus:ring-2 focus:ring-cyan-200/10"
                placeholder="TIO-XXXX-XXXX-XXXX"
              />
            </label>
            <button
              type="submit"
              disabled={busy || !onRedeem}
              className="inline-flex min-h-9 items-center justify-center gap-1.5 self-end rounded-md bg-cyan-200 px-3 text-[10px] font-black text-slate-950 transition-colors hover:bg-cyan-100 disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/40"
            >
              <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
              Redeem code
            </button>
          </form>
        </div>
      ) : (
        <form onSubmit={(event) => void handleAuthSubmit(event, "login")} className="mt-3 grid gap-2 lg:grid-cols-[minmax(160px,1fr)_minmax(140px,0.7fr)_auto_auto]">
          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-white/42">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="min-h-9 w-full rounded-md border border-white/10 bg-black/20 px-3 text-xs font-semibold text-white outline-none placeholder:text-white/30 focus:border-cyan-200/40 focus:ring-2 focus:ring-cyan-200/10"
              placeholder="buyer@example.com"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-white/42">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="min-h-9 w-full rounded-md border border-white/10 bg-black/20 px-3 text-xs font-semibold text-white outline-none placeholder:text-white/30 focus:border-cyan-200/40 focus:ring-2 focus:ring-cyan-200/10"
              placeholder="commercial-secret"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !onLogin}
            className="inline-flex min-h-9 items-center justify-center gap-1.5 self-end rounded-md bg-white px-3 text-[10px] font-black text-slate-950 transition-colors hover:bg-cyan-50 disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/40"
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Sign in
          </button>
          <button
            type="button"
            onClick={() => void handleRegisterClick()}
            disabled={busy || !onRegister}
            className="inline-flex min-h-9 items-center justify-center gap-1.5 self-end rounded-md border border-cyan-200/25 bg-cyan-200/10 px-3 text-[10px] font-black text-cyan-100 transition-colors hover:bg-cyan-200/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
            Create account
          </button>
        </form>
      )}

      {(statusMessage || errorMessage) && (
        <p className={`mt-2 text-[11px] font-bold ${errorMessage ? "text-rose-200" : "text-white/50"}`}>
          {errorMessage || statusMessage}
        </p>
      )}
    </section>
  );
}

function AccountMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "amber" | "cyan" | "slate";
}) {
  const toneClass = {
    emerald: "text-emerald-200",
    amber: "text-amber-200",
    cyan: "text-cyan-200",
    slate: "text-white",
  }[tone];

  return (
    <div className="border border-white/10 bg-black/14 p-2">
      <div className="text-[10px] font-bold text-white/42">{label}</div>
      <div className={`mt-1 font-mono text-lg font-black leading-none ${toneClass}`}>{value}</div>
    </div>
  );
}

function defaultCreateIdempotencyKey(prefix: string): string {
  const random =
    globalThis.crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2, 12);
  return `${prefix}_${Date.now()}_${random}`;
}
