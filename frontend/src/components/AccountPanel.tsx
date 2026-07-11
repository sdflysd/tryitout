import {
  CreditCard,
  KeyRound,
  LogOut,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import type {
  CommercialCredentialsDto,
  CommercialCreditAccountDto,
  CommercialUserDto,
  PublicModelProviderDto,
  RedeemAccessCodeInputDto,
  SaveModelProviderInputDto,
} from "../commercial-client.js";
import type { ProviderMode } from "../contracts/commercial.js";
import { hasCommercialFeature } from "../contracts/commercial.js";
import type { Language } from "../language.js";
import type { PlatformModelOption } from "../model-options.js";

interface AccountPanelProps {
  user?: CommercialUserDto;
  account?: CommercialCreditAccountDto;
  modelProvider?: PublicModelProviderDto;
  language?: Language;
  providerMode?: ProviderMode;
  byokAvailable?: boolean;
  showModelConfiguration?: boolean;
  modelPage?: boolean;
  selectedModelProfileId?: string;
  selectedCredentialId?: string;
  platformModels?: PlatformModelOption[];
  statusMessage?: string;
  errorMessage?: string;
  busy?: boolean;
  onLogin?: (input: CommercialCredentialsDto) => Promise<void> | void;
  onRegister?: (input: CommercialCredentialsDto) => Promise<void> | void;
  onLogout?: () => Promise<void> | void;
  onRedeem?: (input: RedeemAccessCodeInputDto) => Promise<void> | void;
  onSaveModelProvider?: (input: SaveModelProviderInputDto) => Promise<void> | void;
  onTestModelProvider?: () => Promise<void> | void;
  onDeleteModelProvider?: () => Promise<void> | void;
  onProviderModeChange?: (providerMode: ProviderMode) => void;
  onModelProfileChange?: (modelProfileId: string) => void;
  onCredentialChange?: (credentialId: string) => void;
  createIdempotencyKey?: (prefix: string) => string;
}

const ACCOUNT_PANEL_COPY = {
  "zh-CN": {
    accountLabel: "账号",
    signedOutDescription: "登录后可查看额度、兑换访问码并管理模型配置。",
    adminConsole: "进入后台",
    logout: "退出登录",
    metrics: {
      available: "可用额度",
      frozen: "冻结额度",
      redeemed: "累计兑换",
      captured: "累计消耗",
    },
    modelProvider: "模型供应商",
    modelSource: "模型来源",
    platformModel: "平台模型",
    byokModel: "我的 API Key",
    modelConfig: "模型配置",
    modelConfigDescription: "当前推演使用的模型来源与模型配置。",
    modelSettingsTitle: "模型设置",
    modelSettingsDescription: "高级用户可以接入自己的 OpenAI 兼容供应商；平台模型由管理员托管。",
    openModelConfig: "模型配置",
    currentSelection: "当前选择",
    usePlatformModel: "使用平台模型",
    useMyApiKey: "使用我的 API Key",
    platformModelChoice: "平台模型选择",
    apiKeyChoice: "API Key 选择",
    noApiKeyConfigured: "尚未配置可用的 API Key",
    noPlatformModelsConfigured: "管理员尚未启用平台模型",
    byokUnavailable: "需要先兑换包含 BYOK 权益的卡密，才能使用自己的 API Key。",
    configureApiKey: "需要 BYOK 权益",
    recommended: "推荐",
    quality: {
      fast: "快速",
      balanced: "均衡",
      deep: "深度",
    },
    byokSettings: "BYOK 模型设置",
    byokDescription: "配置你自己的 OpenAI 兼容模型，用于推演。",
    byokLockedTitle: "我的 API Key 未开通",
    byokLockedDescription: "该能力由卡密权益授予。请兑换包含 custom_model_provider 权益的卡密后再配置。",
    testStatus: "测试",
    testError: "失败原因",
    provider: "供应商",
    displayName: "显示名称",
    baseUrl: "OpenAI 兼容 Base URL",
    apiKey: "API Key",
    fastModel: "快速模型",
    balancedModel: "均衡模型",
    deepModel: "深度模型",
    saveProvider: "保存配置",
    testProvider: "测试配置",
    deleteProvider: "删除配置",
    accessCode: "访问码",
    redeemCode: "兑换访问码",
    email: "邮箱",
    password: "密码",
    signIn: "登录",
    createAccount: "创建账号",
  },
  "en-US": {
    accountLabel: "Account",
    signedOutDescription: "Sign in for paid credits, access-code redemption, and model settings.",
    adminConsole: "Admin console",
    logout: "Logout",
    metrics: {
      available: "Available credits",
      frozen: "Frozen credits",
      redeemed: "Redeemed total",
      captured: "Captured total",
    },
    modelProvider: "Model provider",
    modelSource: "Model source",
    platformModel: "Platform model",
    byokModel: "My API key",
    modelConfig: "Model configuration",
    modelConfigDescription: "Model source and credentials used for simulations.",
    modelSettingsTitle: "Model settings",
    modelSettingsDescription: "Advanced users can connect their own OpenAI-compatible provider; platform models are managed by admins.",
    openModelConfig: "Model configuration",
    currentSelection: "Current selection",
    usePlatformModel: "Use platform model",
    useMyApiKey: "Use my API key",
    platformModelChoice: "Platform model choice",
    apiKeyChoice: "API key choice",
    noApiKeyConfigured: "No available API key configured",
    noPlatformModelsConfigured: "No platform models enabled by admin",
    byokUnavailable: "Redeem an access code with BYOK entitlement before using your own API key.",
    configureApiKey: "BYOK access required",
    recommended: "Recommended",
    quality: {
      fast: "Fast",
      balanced: "Balanced",
      deep: "Deep",
    },
    byokSettings: "BYOK model settings",
    byokDescription: "OpenAI-compatible provider for your own paid runs.",
    byokLockedTitle: "My API key is locked",
    byokLockedDescription: "This option is granted by access-code entitlement. Redeem a code with custom_model_provider before configuring it.",
    testStatus: "Test",
    testError: "Failure reason",
    provider: "Provider",
    displayName: "Display name",
    baseUrl: "OpenAI-compatible base URL",
    apiKey: "API key",
    fastModel: "Fast model",
    balancedModel: "Balanced model",
    deepModel: "Deep model",
    saveProvider: "Save provider",
    testProvider: "Test provider",
    deleteProvider: "Delete provider",
    accessCode: "Access code",
    redeemCode: "Redeem code",
    email: "Email",
    password: "Password",
    signIn: "Sign in",
    createAccount: "Create account",
  },
} satisfies Record<Language, {
  accountLabel: string;
  signedOutDescription: string;
  adminConsole: string;
  logout: string;
  metrics: {
    available: string;
    frozen: string;
    redeemed: string;
    captured: string;
  };
  modelProvider: string;
  modelSource: string;
  platformModel: string;
  byokModel: string;
  modelConfig: string;
  modelConfigDescription: string;
  modelSettingsTitle: string;
  modelSettingsDescription: string;
  openModelConfig: string;
  currentSelection: string;
  usePlatformModel: string;
  useMyApiKey: string;
  platformModelChoice: string;
  apiKeyChoice: string;
  noApiKeyConfigured: string;
  noPlatformModelsConfigured: string;
  byokUnavailable: string;
  configureApiKey: string;
  recommended: string;
  quality: {
    fast: string;
    balanced: string;
    deep: string;
  };
  byokSettings: string;
  byokDescription: string;
  byokLockedTitle: string;
  byokLockedDescription: string;
  testStatus: string;
  testError: string;
  provider: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
  fastModel: string;
  balancedModel: string;
  deepModel: string;
  saveProvider: string;
  testProvider: string;
  deleteProvider: string;
  accessCode: string;
  redeemCode: string;
  email: string;
  password: string;
  signIn: string;
  createAccount: string;
}>;

export default function AccountPanel({
  user,
  account,
  modelProvider,
  language = "zh-CN",
  providerMode = "platform",
  byokAvailable = false,
  showModelConfiguration = true,
  modelPage = false,
  selectedModelProfileId,
  selectedCredentialId,
  platformModels = [],
  statusMessage,
  errorMessage,
  busy = false,
  onLogin,
  onRegister,
  onLogout,
  onRedeem,
  onSaveModelProvider,
  onTestModelProvider,
  onDeleteModelProvider,
  onProviderModeChange,
  onModelProfileChange,
  onCredentialChange,
  createIdempotencyKey = defaultCreateIdempotencyKey,
}: AccountPanelProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [provider, setProvider] = useState(modelProvider?.provider ?? "openai");
  const [displayName, setDisplayName] = useState(modelProvider?.displayName ?? "OpenAI-compatible");
  const [baseUrl, setBaseUrl] = useState(modelProvider?.baseUrl ?? "https://api.openai.com/v1");
  const [apiKey, setApiKey] = useState("");
  const [modelFast, setModelFast] = useState(modelProvider?.modelFast ?? "");
  const [modelBalanced, setModelBalanced] = useState(modelProvider?.modelBalanced ?? "");
  const [modelDeep, setModelDeep] = useState(modelProvider?.modelDeep ?? "");
  const canOpenAdmin = user?.role === "owner" || user?.role === "admin" || user?.features.includes("admin_ops") === true;
  const canConfigureByok = user ? hasCommercialFeature(user, "custom_model_provider") : false;
  const copy = ACCOUNT_PANEL_COPY[language];
  const selectedPlatformModel =
    platformModels.find((model) => model.id === selectedModelProfileId) ??
    platformModels[0];
  const selectedProviderLabel =
    providerMode === "byok"
      ? modelProvider
        ? `${modelProvider.displayName} (${modelProvider.apiKeyMask})`
        : copy.noApiKeyConfigured
      : selectedPlatformModel
        ? `${selectedPlatformModel.label} (${selectedPlatformModel.modelId})`
        : copy.platformModel;

  useEffect(() => {
    setProvider(modelProvider?.provider ?? "openai");
    setDisplayName(modelProvider?.displayName ?? "OpenAI-compatible");
    setBaseUrl(modelProvider?.baseUrl ?? "https://api.openai.com/v1");
    setModelFast(modelProvider?.modelFast ?? "");
    setModelBalanced(modelProvider?.modelBalanced ?? "");
    setModelDeep(modelProvider?.modelDeep ?? "");
  }, [modelProvider]);

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

  const handleProviderSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSaveModelProvider?.({
      provider: provider.trim() || "openai",
      displayName: displayName.trim() || "OpenAI-compatible",
      baseUrl: baseUrl.trim(),
      apiKey,
      modelFast: trimmedOptional(modelFast),
      modelBalanced: trimmedOptional(modelBalanced),
      modelDeep: trimmedOptional(modelDeep),
    });
    setApiKey("");
  };

  if (modelPage && user) {
    return (
      <section
        id="account-panel"
        className="border border-white/10 bg-white/[0.055] p-4 text-left text-white shadow-lg shadow-black/10 backdrop-blur-md md:p-5"
        aria-label={copy.modelSettingsTitle}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-cyan-200" aria-hidden="true" />
              <h1 className="text-sm font-black text-white">{copy.modelSettingsTitle}</h1>
              <span className="rounded-sm border border-cyan-200/20 bg-cyan-200/10 px-1.5 py-0.5 font-mono text-[10px] font-black uppercase tracking-[0.08em] text-cyan-100">
                {user.tier}
              </span>
            </div>
            <p className="mt-1 max-w-2xl text-[11px] font-semibold leading-relaxed text-white/54">
              {copy.modelSettingsDescription}
            </p>
            <p className="mt-1 break-all text-[10px] font-semibold text-white/38">
              {user.email}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <a
              href="/account"
              className="inline-flex min-h-8 items-center justify-center rounded-md border border-white/10 bg-white/7 px-2.5 text-[10px] font-black text-white/70 transition-colors hover:border-white/20 hover:bg-white/10"
            >
              {copy.accountLabel}
            </a>
            <button
              type="button"
              onClick={() => void onLogout?.()}
              disabled={busy}
              className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/7 px-2.5 text-[10px] font-black text-white/70 transition-colors hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              {copy.logout}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(300px,0.95fr)]">
          <ModelSourceSelector
            copy={copy}
            providerMode={providerMode}
            byokAvailable={byokAvailable}
            canConfigureByok={canConfigureByok}
            modelProvider={modelProvider}
            selectedModelProfileId={selectedModelProfileId}
            selectedCredentialId={selectedCredentialId}
            platformModels={platformModels}
            onProviderModeChange={onProviderModeChange}
            onModelProfileChange={onModelProfileChange}
            onCredentialChange={onCredentialChange}
          />
          {canConfigureByok && providerMode === "byok" ? (
            <ByokProviderForm
              copy={copy}
              modelProvider={modelProvider}
              provider={provider}
              displayName={displayName}
              baseUrl={baseUrl}
              apiKey={apiKey}
              modelFast={modelFast}
              modelBalanced={modelBalanced}
              modelDeep={modelDeep}
              busy={busy}
              onProviderChange={setProvider}
              onDisplayNameChange={setDisplayName}
              onBaseUrlChange={setBaseUrl}
              onApiKeyChange={setApiKey}
              onModelFastChange={setModelFast}
              onModelBalancedChange={setModelBalanced}
              onModelDeepChange={setModelDeep}
              onSubmit={handleProviderSubmit}
              onTestModelProvider={onTestModelProvider}
              onDeleteModelProvider={onDeleteModelProvider}
              onSaveModelProvider={onSaveModelProvider}
            />
          ) : !canConfigureByok ? (
            <ByokLockedPanel copy={copy} />
          ) : null}
        </div>

        {(statusMessage || errorMessage) && (
          <p className={`mt-3 text-[11px] font-bold ${errorMessage ? "text-rose-200" : "text-white/50"}`}>
            {errorMessage || statusMessage}
          </p>
        )}
      </section>
    );
  }

  return (
    <section
      id="account-panel"
      className="border border-white/10 bg-white/[0.055] p-4 text-left text-white shadow-lg shadow-black/10 backdrop-blur-md md:p-5"
      aria-label={copy.accountLabel}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <UserRound className="h-4 w-4 text-cyan-200" aria-hidden="true" />
            <h2 className="text-xs font-black text-white">{copy.accountLabel}</h2>
            {user && (
              <span className="rounded-sm border border-cyan-200/20 bg-cyan-200/10 px-1.5 py-0.5 font-mono text-[10px] font-black uppercase tracking-[0.08em] text-cyan-100">
                {user.tier}
              </span>
            )}
          </div>
          <p className="mt-1 break-all text-[11px] font-semibold text-white/54">
            {user?.email ?? copy.signedOutDescription}
          </p>
        </div>

        {user ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            {canOpenAdmin && (
              <a
                href="/admin"
                className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-cyan-200/25 bg-cyan-200/10 px-2.5 text-[10px] font-black text-cyan-100 transition-colors hover:bg-cyan-200/15"
              >
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {copy.adminConsole}
              </a>
            )}
            <button
              type="button"
              onClick={() => void onLogout?.()}
              disabled={busy}
              className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/7 px-2.5 text-[10px] font-black text-white/70 transition-colors hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              {copy.logout}
            </button>
          </div>
        ) : null}
      </div>

      {user ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <AccountMetric label={copy.metrics.available} value={account?.balance ?? 0} tone="emerald" />
              <AccountMetric label={copy.metrics.frozen} value={account?.frozenCredits ?? 0} tone="amber" />
              <AccountMetric label={copy.metrics.redeemed} value={account?.totalRedeemed ?? 0} tone="cyan" />
              <AccountMetric label={copy.metrics.captured} value={account?.totalCaptured ?? 0} tone="slate" />
            </div>
            {modelProvider !== undefined && (
              <div className="border border-white/10 bg-black/14 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.12em] text-white/42">{copy.modelProvider}</span>
                  <span className="rounded-sm border border-emerald-200/20 bg-emerald-200/10 px-1.5 py-0.5 text-[10px] font-black text-emerald-100">{modelProvider.status}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-bold text-white/62">
                  <span>{modelProvider.displayName}</span>
                  <span className="font-mono text-cyan-100">{modelProvider.apiKeyMask}</span>
                </div>
              </div>
            )}
            {showModelConfiguration ? (
              <ModelSourceSelector
                copy={copy}
                providerMode={providerMode}
                byokAvailable={byokAvailable}
                canConfigureByok={canConfigureByok}
                modelProvider={modelProvider}
                selectedModelProfileId={selectedModelProfileId}
                selectedCredentialId={selectedCredentialId}
                platformModels={platformModels}
                onProviderModeChange={onProviderModeChange}
                onModelProfileChange={onModelProfileChange}
                onCredentialChange={onCredentialChange}
              />
            ) : (
              <div className="border border-white/10 bg-black/14 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-white/42">
                      {copy.currentSelection}
                    </div>
                    <div className="mt-1 text-xs font-black text-white">
                      {providerMode === "byok" ? copy.byokModel : copy.platformModel}
                    </div>
                    <p className="mt-1 text-[11px] font-bold text-white/50">
                      {selectedProviderLabel}
                    </p>
                  </div>
                  <a
                    href="/account/models"
                    className="inline-flex min-h-8 items-center justify-center rounded-md border border-cyan-200/25 bg-cyan-200/10 px-2.5 text-[10px] font-black text-cyan-100 transition-colors hover:bg-cyan-200/15"
                  >
                    {copy.openModelConfig}
                  </a>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={(event) => void handleRedeemSubmit(event)} className="grid content-start gap-2 sm:grid-cols-[1fr_auto] lg:grid-cols-1">
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-white/42">{copy.accessCode}</span>
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
              className="inline-flex min-h-9 items-center justify-center gap-1.5 self-end rounded-md bg-cyan-200 px-3 text-[10px] font-black text-slate-950 transition-colors hover:bg-cyan-100 disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/40 lg:self-auto"
            >
              <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
              {copy.redeemCode}
            </button>
          </form>
        </div>
      ) : (
        <form onSubmit={(event) => void handleAuthSubmit(event, "login")} className="mt-3 grid gap-2 lg:grid-cols-[minmax(160px,1fr)_minmax(140px,0.7fr)_auto_auto]">
          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-white/42">{copy.email}</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="min-h-9 w-full rounded-md border border-white/10 bg-black/20 px-3 text-xs font-semibold text-white outline-none placeholder:text-white/30 focus:border-cyan-200/40 focus:ring-2 focus:ring-cyan-200/10"
              placeholder="buyer@example.com"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-white/42">{copy.password}</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="min-h-9 w-full rounded-md border border-white/10 bg-black/20 px-3 text-xs font-semibold text-white outline-none placeholder:text-white/30 focus:border-cyan-200/40 focus:ring-2 focus:ring-cyan-200/10"
              placeholder="account-password"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !onLogin}
            className="inline-flex min-h-9 items-center justify-center gap-1.5 self-end rounded-md bg-white px-3 text-[10px] font-black text-slate-950 transition-colors hover:bg-cyan-50 disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/40"
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            {copy.signIn}
          </button>
          <button
            type="button"
            onClick={() => void handleRegisterClick()}
            disabled={busy || !onRegister}
            className="inline-flex min-h-9 items-center justify-center gap-1.5 self-end rounded-md border border-cyan-200/25 bg-cyan-200/10 px-3 text-[10px] font-black text-cyan-100 transition-colors hover:bg-cyan-200/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
            {copy.createAccount}
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

function ModelSourceSelector({
  copy,
  providerMode,
  byokAvailable,
  canConfigureByok,
  modelProvider,
  selectedModelProfileId,
  selectedCredentialId,
  platformModels,
  onProviderModeChange,
  onModelProfileChange,
  onCredentialChange,
}: {
  copy: typeof ACCOUNT_PANEL_COPY[Language];
  providerMode: ProviderMode;
  byokAvailable: boolean;
  canConfigureByok: boolean;
  modelProvider?: PublicModelProviderDto;
  selectedModelProfileId?: string;
  selectedCredentialId?: string;
  platformModels: PlatformModelOption[];
  onProviderModeChange?: (providerMode: ProviderMode) => void;
  onModelProfileChange?: (modelProfileId: string) => void;
  onCredentialChange?: (credentialId: string) => void;
}) {
  const selectedPlatformId = selectedModelProfileId ?? platformModels[0]?.id ?? "";

  return (
    <fieldset className="border border-white/10 bg-black/14 p-3">
      <legend className="px-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/42">
        {copy.modelSource}
      </legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className={`flex min-h-11 items-center gap-2 border px-3 py-2 text-xs ${
          providerMode === "platform"
            ? "border-cyan-200/40 bg-cyan-200/10 font-black text-cyan-100"
            : "border-white/10 bg-white/7 font-bold text-white/62"
        }`}>
          <input
            type="radio"
            name="accountProviderMode"
            value="platform"
            checked={providerMode === "platform"}
            onChange={() => onProviderModeChange?.("platform")}
            className="accent-cyan-200"
          />
          <span>{copy.platformModel}</span>
        </label>
        <label className={`flex min-h-11 items-center gap-2 border px-3 py-2 text-xs ${
          providerMode === "byok"
            ? "border-cyan-200/40 bg-cyan-200/10 font-black text-cyan-100"
            : "border-white/10 bg-white/7 font-bold text-white/62"
        } ${canConfigureByok ? "" : "opacity-75"}`}>
          <input
            type="radio"
            name="accountProviderMode"
            value="byok"
            checked={providerMode === "byok"}
            disabled={!canConfigureByok}
            onChange={() => onProviderModeChange?.("byok")}
            className="accent-cyan-200"
          />
          <span>{copy.useMyApiKey}</span>
          {!canConfigureByok && (
            <span className="ml-auto rounded-sm border border-white/10 bg-white/7 px-1.5 py-0.5 text-[9px] font-black text-white/42">
              {copy.configureApiKey}
            </span>
          )}
        </label>
      </div>

      {platformModels.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/42">
            {copy.platformModelChoice}
          </div>
          <div className="grid gap-2">
            {platformModels.map((model) => {
              const selected = model.id === selectedPlatformId;
              return (
                <button
                  key={model.id}
                  type="button"
                  data-model-profile-id={model.id}
                  onClick={() => {
                    onModelProfileChange?.(model.id);
                    onProviderModeChange?.("platform");
                  }}
                  className={`min-h-[4.25rem] border p-3 text-left transition-colors ${
                    selected
                      ? "border-cyan-200/40 bg-cyan-200/10 text-white"
                      : "border-white/10 bg-white/7 text-white/70 hover:border-cyan-200/25 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-black">{model.label}</div>
                      <div className="mt-1 font-mono text-[10px] font-bold text-white/48">
                        {model.modelId}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {selected && (
                        <span className="rounded-sm bg-cyan-200 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-slate-950">
                          {copy.recommended}
                        </span>
                      )}
                      {model.quality && (
                        <span className="rounded-sm border border-white/10 bg-black/18 px-1.5 py-0.5 text-[9px] font-black text-white/56">
                          {copy.quality[model.quality]}
                        </span>
                      )}
                    </div>
                  </div>
                  {model.providerLabel && (
                    <div className="mt-2 text-[10px] font-bold text-cyan-100/80">
                      {model.providerLabel}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {platformModels.length === 0 && (
        <p className="mt-3 border border-amber-200/20 bg-amber-200/10 p-3 text-[11px] font-bold leading-relaxed text-amber-100">
          {copy.noPlatformModelsConfigured}
        </p>
      )}

      {(byokAvailable || modelProvider !== undefined) && (
        <label className="mt-3 block">
          <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-white/42">
            {copy.apiKeyChoice}
          </span>
          <select
            value={selectedCredentialId ?? modelProvider?.id ?? ""}
            disabled={!byokAvailable || modelProvider === undefined}
            onChange={(event) => {
              onCredentialChange?.(event.target.value);
              onProviderModeChange?.("byok");
            }}
            className="min-h-9 w-full rounded-md border border-white/10 bg-black/20 px-3 text-xs font-semibold text-white outline-none focus:border-cyan-200/40 focus:ring-2 focus:ring-cyan-200/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {modelProvider ? (
              <option value={modelProvider.id}>
                {modelProvider.displayName} - {modelProvider.apiKeyMask}
              </option>
            ) : (
              <option value="">{copy.noApiKeyConfigured}</option>
            )}
          </select>
        </label>
      )}

      {!canConfigureByok && (
        <p className="mt-2 text-[11px] font-bold leading-relaxed text-white/46">
          {copy.byokUnavailable}
        </p>
      )}
    </fieldset>
  );
}

function ByokProviderForm({
  copy,
  modelProvider,
  provider,
  displayName,
  baseUrl,
  apiKey,
  modelFast,
  modelBalanced,
  modelDeep,
  busy,
  onProviderChange,
  onDisplayNameChange,
  onBaseUrlChange,
  onApiKeyChange,
  onModelFastChange,
  onModelBalancedChange,
  onModelDeepChange,
  onSubmit,
  onTestModelProvider,
  onDeleteModelProvider,
  onSaveModelProvider,
}: {
  copy: typeof ACCOUNT_PANEL_COPY[Language];
  modelProvider?: PublicModelProviderDto;
  provider: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
  modelFast: string;
  modelBalanced: string;
  modelDeep: string;
  busy: boolean;
  onProviderChange: (value: string) => void;
  onDisplayNameChange: (value: string) => void;
  onBaseUrlChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onModelFastChange: (value: string) => void;
  onModelBalancedChange: (value: string) => void;
  onModelDeepChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTestModelProvider?: () => Promise<void> | void;
  onDeleteModelProvider?: () => Promise<void> | void;
  onSaveModelProvider?: (input: SaveModelProviderInputDto) => Promise<void> | void;
}) {
  return (
    <form onSubmit={onSubmit} className="border border-cyan-200/15 bg-black/14 p-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-[10px] font-black uppercase tracking-[0.12em] text-cyan-100">{copy.byokSettings}</h3>
          <p className="mt-0.5 text-[10px] font-semibold text-white/42">{copy.byokDescription}</p>
        </div>
        {modelProvider?.lastTestStatus && (
          <span className="rounded-sm border border-white/10 bg-white/7 px-1.5 py-0.5 text-[10px] font-black text-white/62">
            {copy.testStatus} {modelProvider.lastTestStatus}
          </span>
        )}
      </div>
      {modelProvider?.lastTestStatus === "failed" && modelProvider.lastTestError && (
        <p className="mt-2 border border-rose-200/20 bg-rose-200/10 p-2 text-[11px] font-bold leading-relaxed text-rose-100">
          {copy.testError}: {modelProvider.lastTestError}
        </p>
      )}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-white/42">{copy.provider}</span>
          <input
            value={provider}
            onChange={(event) => onProviderChange(event.target.value)}
            className="min-h-9 w-full rounded-md border border-white/10 bg-black/20 px-3 text-xs font-semibold text-white outline-none placeholder:text-white/30 focus:border-cyan-200/40 focus:ring-2 focus:ring-cyan-200/10"
            placeholder="openai"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-white/42">{copy.displayName}</span>
          <input
            value={displayName}
            onChange={(event) => onDisplayNameChange(event.target.value)}
            className="min-h-9 w-full rounded-md border border-white/10 bg-black/20 px-3 text-xs font-semibold text-white outline-none placeholder:text-white/30 focus:border-cyan-200/40 focus:ring-2 focus:ring-cyan-200/10"
            placeholder="OpenAI-compatible"
          />
        </label>
      </div>
      <label className="mt-2 block">
        <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-white/42">{copy.baseUrl}</span>
        <input
          type="url"
          value={baseUrl}
          onChange={(event) => onBaseUrlChange(event.target.value)}
          className="min-h-9 w-full rounded-md border border-white/10 bg-black/20 px-3 text-xs font-semibold text-white outline-none placeholder:text-white/30 focus:border-cyan-200/40 focus:ring-2 focus:ring-cyan-200/10"
          placeholder="https://api.openai.com/v1"
        />
      </label>
      <label className="mt-2 block">
        <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-white/42">{copy.apiKey}</span>
        <input
          type="password"
          value={apiKey}
          onChange={(event) => onApiKeyChange(event.target.value)}
          className="min-h-9 w-full rounded-md border border-white/10 bg-black/20 px-3 text-xs font-semibold text-white outline-none placeholder:text-white/30 focus:border-cyan-200/40 focus:ring-2 focus:ring-cyan-200/10"
          placeholder={modelProvider?.apiKeyMask ?? "sk-..."}
        />
      </label>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-white/42">{copy.fastModel}</span>
          <input
            value={modelFast}
            onChange={(event) => onModelFastChange(event.target.value)}
            className="min-h-9 w-full rounded-md border border-white/10 bg-black/20 px-3 text-xs font-semibold text-white outline-none placeholder:text-white/30 focus:border-cyan-200/40 focus:ring-2 focus:ring-cyan-200/10"
            placeholder="gpt-4o-mini"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-white/42">{copy.balancedModel}</span>
          <input
            value={modelBalanced}
            onChange={(event) => onModelBalancedChange(event.target.value)}
            className="min-h-9 w-full rounded-md border border-white/10 bg-black/20 px-3 text-xs font-semibold text-white outline-none placeholder:text-white/30 focus:border-cyan-200/40 focus:ring-2 focus:ring-cyan-200/10"
            placeholder="gpt-4o"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-white/42">{copy.deepModel}</span>
          <input
            value={modelDeep}
            onChange={(event) => onModelDeepChange(event.target.value)}
            className="min-h-9 w-full rounded-md border border-white/10 bg-black/20 px-3 text-xs font-semibold text-white outline-none placeholder:text-white/30 focus:border-cyan-200/40 focus:ring-2 focus:ring-cyan-200/10"
            placeholder="gpt-4.1"
          />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy || !onSaveModelProvider}
          className="inline-flex min-h-8 items-center justify-center rounded-md bg-cyan-200 px-2.5 text-[10px] font-black text-slate-950 transition-colors hover:bg-cyan-100 disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/40"
        >
          {copy.saveProvider}
        </button>
        <button
          type="button"
          onClick={() => void onTestModelProvider?.()}
          disabled={busy || !modelProvider || !onTestModelProvider}
          className="inline-flex min-h-8 items-center justify-center rounded-md border border-white/10 bg-white/7 px-2.5 text-[10px] font-black text-white/70 transition-colors hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {copy.testProvider}
        </button>
        {modelProvider && (
          <button
            type="button"
            onClick={() => void onDeleteModelProvider?.()}
            disabled={busy || !onDeleteModelProvider}
            className="inline-flex min-h-8 items-center justify-center rounded-md border border-rose-200/20 bg-rose-200/10 px-2.5 text-[10px] font-black text-rose-100 transition-colors hover:bg-rose-200/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {copy.deleteProvider}
          </button>
        )}
      </div>
    </form>
  );
}

function ByokLockedPanel({
  copy,
}: {
  copy: typeof ACCOUNT_PANEL_COPY[Language];
}) {
  return (
    <div className="border border-white/10 bg-black/14 p-3">
      <h3 className="text-[10px] font-black uppercase tracking-[0.12em] text-white/58">
        {copy.byokLockedTitle}
      </h3>
      <p className="mt-2 text-[11px] font-bold leading-relaxed text-white/46">
        {copy.byokLockedDescription}
      </p>
    </div>
  );
}

function defaultCreateIdempotencyKey(prefix: string): string {
  const random =
    globalThis.crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2, 12);
  return `${prefix}_${Date.now()}_${random}`;
}

function trimmedOptional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
