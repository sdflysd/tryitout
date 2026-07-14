import { useState, useEffect, useRef, type FormEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CreditCard, Flame, LogIn, ShieldCheck, Sparkles, UserRound, UserPlus } from "lucide-react";
import AdminApp from "./admin/AdminApp";
import { fetchAgentRuntimeCapabilities } from "./agent-runtime-client";
import {
  CommercialClientError,
  deleteModelProvider,
  fetchCommercialCredits,
  fetchCommercialMe,
  fetchModelProvider,
  fetchPlatformModels,
  loginCommercialUser,
  logoutCommercialUser,
  redeemAccessCode,
  registerCommercialUser,
  saveModelProvider,
  testModelProvider,
  type CommercialCreditAccountDto,
  type CommercialCredentialsDto,
  type CommercialUserDto,
  type PublicModelProviderDto,
  type RedeemAccessCodeInputDto,
  type SaveModelProviderInputDto,
} from "./commercial-client";
import { getSimulationCreditCost, hasCommercialFeature, type ProviderMode } from "./contracts/commercial";
import type {
  CreateSimulationTaskRequest,
  SimulationTaskStatusResponse,
} from "./contracts/simulation-task";
import { getDeepModeUnavailableNotice } from "./components/deep-mode-copy";
import AccountPanel from "./components/AccountPanel";
import HomeView from "./components/HomeView";
import InputView, { type CommercialActionNotice } from "./components/InputView";
import SimulationProgress from "./components/SimulationProgress";
import ReportView from "./components/ReportView";
import ShareCard from "./components/ShareCard";
import {
  DEFAULT_PLATFORM_MODEL_PROFILE_ID,
  type PlatformModelOption,
} from "./model-options";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  Language,
  getLanguageToggleLabel,
  getNextLanguage,
  parseStoredLanguage,
} from "./language";
import { buildSimulationRequestBody } from "./simulation-request";
import {
  buildSimulationCompletedEvent,
  buildSimulationFailedEvent,
} from "./simulation-analytics";
import {
  cancelSimulationTask,
  fetchActiveSimulationTask,
  fetchSimulationTasks,
  getSimulationTaskReport,
  isRecoverableSimulationTaskError,
  resumeSimulationTaskUntilComplete,
  runSimulationTaskUntilComplete,
  watchSimulationTaskUntilComplete,
} from "./simulation-tasks";
import {
  AgentRuntimeCapabilities,
  ModelSelection,
  Simulation,
  UserInput,
  SimulationType,
  SimulationApiResponse,
  SimulationProgressEvent,
} from "./types";
import { postValidationEvent } from "./validation-events";
import type { ClientValidationEvent } from "./validation-events";

type ViewState = "home" | "input" | "generating" | "report";

export const HISTORY_STORAGE_KEY = "money_simulator_history";
export const LAST_INPUT_DRAFT_STORAGE_KEY = "money_simulator_last_input_draft";
export const MODEL_PROFILE_STORAGE_KEY = "money_simulator_model_profile_id";
export const MODEL_CREDENTIAL_STORAGE_KEY = "money_simulator_model_credential_id";

const MAX_HISTORY_ITEMS = 5;
const SIMULATION_TYPES: SimulationType[] = ["side_hustle", "dating", "life_choice"];

interface AppProps {
  initialCommercialUser?: CommercialUserDto;
  initialCommercialAccount?: CommercialCreditAccountDto;
  initialCommercialModelProvider?: PublicModelProviderDto;
  initialPlatformModels?: PlatformModelOption[];
  initialLanguage?: Language;
}

const APP_COPY = {
  "zh-CN": {
    nav: {
      account: "账号",
      login: "登录",
      register: "注册",
    },
    auth: {
      loginTitle: "账号登录",
      registerTitle: "账号注册",
      email: "邮箱",
      password: "密码",
      loginButton: "登录账号",
      registerButton: "创建账号",
      backHome: "返回首页",
      switchToLogin: "已有账号登录",
      switchToRegister: "注册新账号",
    },
    account: {
      title: "账号设置",
      signedOutDescription: "请先登录账号，再查看额度、兑换访问码和配置模型。",
      loginButton: "登录账号",
      registerButton: "创建账号",
    },
    commercialStatus: {
      signingIn: "正在登录...",
      signedIn: "已登录，额度已加载。",
      creatingAccount: "正在创建账号...",
      accountCreated: "账号已创建，额度已加载。",
      signedOut: "已退出登录。",
      redeeming: "正在兑换访问码...",
      redeemed: (credits: number) => `已兑换 ${credits} 点额度。`,
      savingProvider: "正在保存 BYOK 模型配置...",
      providerSaved: "BYOK 模型配置已保存。",
      testingProvider: "正在测试 BYOK 模型配置...",
      providerTestPassed: "BYOK 模型配置测试通过。",
      providerTestFailed: "BYOK 模型配置测试失败。",
      deletingProvider: "正在删除 BYOK 模型配置...",
      providerDeleted: "BYOK 模型配置已删除。",
      activeQueued: "任务已进入商业队列，等待 worker 处理。",
      activeStarted: "检测到已有商业任务，正在接管进度。",
      loginRequired: "请先登录账号或注册后再启动推演。",
      insufficientCredits: "当前可用额度不足。请先兑换访问码或联系运营充值后再启动推演。",
    },
    commercialAction: {
      loginTitle: "需要登录",
      loginPrimary: "去登录",
      loginSecondary: "注册账号",
      creditsTitle: "额度不足",
      creditsPrimary: "去账号页兑换",
    },
  },
  "en-US": {
    nav: {
      account: "Account",
      login: "Sign in",
      register: "Register",
    },
    auth: {
      loginTitle: "Account login",
      registerTitle: "Account registration",
      email: "Email",
      password: "Password",
      loginButton: "Sign in to account",
      registerButton: "Create account",
      backHome: "Back to home",
      switchToLogin: "Already have an account",
      switchToRegister: "Create account",
    },
    account: {
      title: "Account settings",
      signedOutDescription: "Sign in before viewing credits, redeeming access codes, or configuring models.",
      loginButton: "Sign in",
      registerButton: "Create account",
    },
    commercialStatus: {
      signingIn: "Signing in...",
      signedIn: "Signed in. Credits loaded.",
      creatingAccount: "Creating account...",
      accountCreated: "Account created. Credits loaded.",
      signedOut: "Signed out.",
      redeeming: "Redeeming access code...",
      redeemed: (credits: number) => `Redeemed ${credits} credits.`,
      savingProvider: "Saving BYOK model provider...",
      providerSaved: "BYOK model provider saved.",
      testingProvider: "Testing BYOK model provider...",
      providerTestPassed: "BYOK model provider test passed.",
      providerTestFailed: "BYOK model provider test failed.",
      deletingProvider: "Deleting BYOK model provider...",
      providerDeleted: "BYOK model provider deleted.",
      activeQueued: "The commercial task is queued and waiting for a worker.",
      activeStarted: "Found an active commercial task and attached to its progress.",
      loginRequired: "Sign in or create an account before starting a simulation.",
      insufficientCredits: "Insufficient available credits. Redeem an access code or ask support to top up before starting.",
    },
    commercialAction: {
      loginTitle: "Sign in required",
      loginPrimary: "Sign in",
      loginSecondary: "Create account",
      creditsTitle: "Insufficient credits",
      creditsPrimary: "Open account settings",
    },
  },
} satisfies Record<Language, {
  nav: {
    account: string;
    login: string;
    register: string;
  };
  auth: {
    loginTitle: string;
    registerTitle: string;
    email: string;
    password: string;
    loginButton: string;
    registerButton: string;
    backHome: string;
    switchToLogin: string;
    switchToRegister: string;
  };
  account: {
    title: string;
    signedOutDescription: string;
    loginButton: string;
    registerButton: string;
  };
  commercialStatus: {
    signingIn: string;
    signedIn: string;
    creatingAccount: string;
    accountCreated: string;
    signedOut: string;
    redeeming: string;
    redeemed: (credits: number) => string;
    savingProvider: string;
    providerSaved: string;
    testingProvider: string;
    providerTestPassed: string;
    providerTestFailed: string;
    deletingProvider: string;
    providerDeleted: string;
    activeQueued: string;
    activeStarted: string;
    loginRequired: string;
    insufficientCredits: string;
  };
  commercialAction: {
    loginTitle: string;
    loginPrimary: string;
    loginSecondary: string;
    creditsTitle: string;
    creditsPrimary: string;
  };
}>;

export function addSimulationToHistoryList(
  history: Simulation[],
  newSimulation: Simulation,
): Simulation[] {
  return [
    newSimulation,
    ...history.filter((item) => item.id !== newSimulation.id),
  ].slice(0, MAX_HISTORY_ITEMS);
}

export function deleteSimulationFromHistoryList(
  history: Simulation[],
  simulationId: string,
): Simulation[] {
  return history.filter((item) => item.id !== simulationId);
}

export function parseStoredUserInput(stored: string | null): UserInput | undefined {
  if (!stored) return undefined;

  try {
    const parsed = JSON.parse(stored) as Partial<UserInput>;
    if (
      parsed &&
      typeof parsed === "object" &&
      SIMULATION_TYPES.includes(parsed.type as SimulationType)
    ) {
      return parsed as UserInput;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function scrollToTopForViewChange(): void {
  globalThis.scrollTo({ top: 0, left: 0, behavior: "instant" });
}

export function getInitialLanguageFromStorage(storage: Storage | undefined): Language {
  return parseStoredLanguage(storage?.getItem(LANGUAGE_STORAGE_KEY) ?? null) ?? DEFAULT_LANGUAGE;
}

export function getInitialModelProfileIdFromStorage(
  storage: Storage | undefined,
  initialPlatformModels?: PlatformModelOption[],
): string {
  const fallback = initialPlatformModels?.[0]?.id ?? DEFAULT_PLATFORM_MODEL_PROFILE_ID;
  try {
    const stored = storage?.getItem(MODEL_PROFILE_STORAGE_KEY);
    if (stored?.trim()) {
      return stored;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

export function buildShareCardOpenedEvent(simulation: Simulation): ClientValidationEvent {
  return {
    type: "share_card_opened",
    simulationId: simulation.id,
    scenarioType: simulation.type || simulation.userInput.type,
  };
}

export function buildCommercialTaskIdempotencyKey(now = Date.now()): string {
  const random =
    globalThis.crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2, 12);
  return `simulation_${now}_${random}`;
}

type CommercialTaskElapsedInput = Pick<
  SimulationTaskStatusResponse,
  "status" | "queuedAt" | "startedAt" | "createdAt" | "updatedAt"
>;

export function getCommercialTaskElapsedMs(
  task: CommercialTaskElapsedInput,
  now = Date.now(),
): number {
  const startedAt = getCommercialTaskElapsedStartMs(task);
  return startedAt === undefined ? 0 : Math.max(0, now - startedAt);
}

function getCommercialTaskElapsedStartMs(
  task: CommercialTaskElapsedInput,
): number | undefined {
  return parseIsoTimestampMs(getCommercialTaskElapsedTimestamp(task));
}

function getCommercialTaskElapsedTimestamp(
  task: CommercialTaskElapsedInput,
): string {
  if (task.status === "queued") {
    return task.queuedAt ?? task.createdAt ?? task.updatedAt;
  }
  return task.startedAt ?? task.queuedAt ?? task.createdAt ?? task.updatedAt;
}

function parseIsoTimestampMs(timestamp: string | undefined): number | undefined {
  if (timestamp === undefined) {
    return undefined;
  }
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function canUseByokProvider({
  user,
  provider,
}: {
  user?: Pick<CommercialUserDto, "tier" | "features">;
  provider?: Pick<PublicModelProviderDto, "status">;
}): boolean {
  return Boolean(
    user &&
      hasCommercialFeature(user, "custom_model_provider") &&
      provider?.status === "active",
  );
}

export function canConfigureByokProvider({
  user,
}: {
  user?: Pick<CommercialUserDto, "tier" | "features">;
}): boolean {
  return Boolean(user && hasCommercialFeature(user, "custom_model_provider"));
}

export function resolveCommercialSimulationCost({
  deepAgentMode,
  providerMode,
}: {
  deepAgentMode: boolean;
  providerMode: ProviderMode;
}): number {
  return getSimulationCreditCost({
    interactionMode: deepAgentMode ? "enabled" : "legacy",
    providerMode,
  });
}

export function buildCommercialModelSelection({
  providerMode,
  selectedModelProfileId,
  selectedCredentialId,
}: {
  providerMode: ProviderMode;
  selectedModelProfileId?: string;
  selectedCredentialId?: string;
  deepAgentMode: boolean;
}): ModelSelection | undefined {
  if (providerMode === "byok") {
    return selectedCredentialId
      ? {
          userCredentialId: selectedCredentialId,
        }
      : undefined;
  }

  return selectedModelProfileId
    ? { modelProfileId: selectedModelProfileId }
    : undefined;
}

export function resolveCommercialStartActionNotice({
  commercialMode,
  startAttempted,
  hasUser,
  availableCredits,
  requiredCredits,
  language = DEFAULT_LANGUAGE,
}: {
  commercialMode: boolean;
  startAttempted: boolean;
  hasUser: boolean;
  availableCredits: number;
  requiredCredits: number;
  language?: Language;
}): CommercialActionNotice | undefined {
  if (!commercialMode || !startAttempted) return undefined;

  const copy = APP_COPY[language];
  if (!hasUser) {
    return {
      tone: "login",
      title: copy.commercialAction.loginTitle,
      message: copy.commercialStatus.loginRequired,
      primaryHref: "/login",
      primaryLabel: copy.commercialAction.loginPrimary,
      secondaryHref: "/register",
      secondaryLabel: copy.commercialAction.loginSecondary,
    };
  }

  if (requiredCredits > 0 && availableCredits < requiredCredits) {
    return {
      tone: "credits",
      title: copy.commercialAction.creditsTitle,
      message: copy.commercialStatus.insufficientCredits,
      primaryHref: "/account",
      primaryLabel: copy.commercialAction.creditsPrimary,
    };
  }

  return undefined;
}

export function buildCommercialSimulationTaskRequest(
  userInput: UserInput,
  {
    deepAgentMode,
    providerMode,
    startedAt,
    modelSelection,
    createIdempotencyKey = () => buildCommercialTaskIdempotencyKey(startedAt),
  }: {
    deepAgentMode: boolean;
    providerMode: ProviderMode;
    startedAt: number;
    modelSelection?: ModelSelection;
    createIdempotencyKey?: (startedAt: number) => string;
  },
): CreateSimulationTaskRequest {
  return {
    ...buildSimulationRequestBody(userInput, { deepAgentMode }),
    providerMode,
    ...(modelSelection ? { modelSelection } : {}),
    idempotencyKey: createIdempotencyKey(startedAt),
  };
}

type CommercialTaskWatcherToken = {
  sequence: number;
  simulationId: string;
};

export function createCommercialTaskWatcherToken(
  previousSequence: number,
  simulationId: string,
): CommercialTaskWatcherToken {
  return {
    sequence: previousSequence + 1,
    simulationId,
  };
}

export function isCommercialTaskWatcherCurrent(
  currentToken: CommercialTaskWatcherToken | undefined,
  token: CommercialTaskWatcherToken,
): boolean {
  return currentToken?.sequence === token.sequence &&
    currentToken.simulationId === token.simulationId;
}

export function resolveCommercialTaskWatcherAfterUserChange(
  currentToken: CommercialTaskWatcherToken | undefined,
  previousUserId: string | undefined,
  nextUserId: string | undefined,
): CommercialTaskWatcherToken | undefined {
  return previousUserId === nextUserId ? currentToken : undefined;
}

type CommercialTaskRefreshToken = {
  sequence: number;
  userId?: string;
};

export function createCommercialTaskRefreshToken(
  previousSequence: number,
  userId: string | undefined,
): CommercialTaskRefreshToken {
  return {
    sequence: previousSequence + 1,
    ...(userId ? { userId } : {}),
  };
}

export function isCommercialTaskRefreshCurrent(
  currentToken: CommercialTaskRefreshToken | undefined,
  token: CommercialTaskRefreshToken,
  currentUserId: string | undefined,
): boolean {
  return currentToken?.sequence === token.sequence &&
    currentToken.userId === token.userId &&
    token.userId === currentUserId;
}

type CommercialTaskStartToken = {
  sequence: number;
  userId?: string;
};

export function createCommercialTaskStartToken(
  previousSequence: number,
  userId: string | undefined,
): CommercialTaskStartToken {
  return {
    sequence: previousSequence + 1,
    ...(userId ? { userId } : {}),
  };
}

export function isCommercialTaskStartCurrent(
  currentToken: CommercialTaskStartToken | undefined,
  token: CommercialTaskStartToken,
  currentUserId: string | undefined,
): boolean {
  return currentToken?.sequence === token.sequence &&
    currentToken.userId === token.userId &&
    token.userId === currentUserId;
}

export function resolveCommercialTaskStartAfterUserChange(
  currentToken: CommercialTaskStartToken | undefined,
  previousUserId: string | undefined,
  nextUserId: string | undefined,
): CommercialTaskStartToken | undefined {
  return previousUserId === nextUserId ? currentToken : undefined;
}

export function shouldApplyCommercialUserSideEffect(
  requestedUserId: string | undefined,
  currentUserId: string | undefined,
): boolean {
  return Boolean(requestedUserId && requestedUserId === currentUserId);
}

type CommercialTaskReportToken = {
  sequence: number;
  userId?: string;
  simulationId: string;
};

export function createCommercialTaskReportToken(
  previousSequence: number,
  userId: string | undefined,
  simulationId: string,
): CommercialTaskReportToken {
  return {
    sequence: previousSequence + 1,
    simulationId,
    ...(userId ? { userId } : {}),
  };
}

export function isCommercialTaskReportCurrent(
  currentToken: CommercialTaskReportToken | undefined,
  token: CommercialTaskReportToken,
  currentUserId: string | undefined,
): boolean {
  return Boolean(token.userId) &&
    currentToken?.sequence === token.sequence &&
    currentToken.userId === token.userId &&
    currentToken.simulationId === token.simulationId &&
    token.userId === currentUserId;
}

export function resolveCommercialTaskReportAfterUserChange(
  currentToken: CommercialTaskReportToken | undefined,
  previousUserId: string | undefined,
  nextUserId: string | undefined,
): CommercialTaskReportToken | undefined {
  return previousUserId === nextUserId ? currentToken : undefined;
}

export function shouldAttachActiveCommercialTaskForUser(
  requestedUserId: string | undefined,
  currentUserId: string | undefined,
): boolean {
  return Boolean(requestedUserId && requestedUserId === currentUserId);
}

export function shouldAttachActiveCommercialTaskForContext({
  requestedUserId,
  currentUserId,
  requestedWatcherSequence,
  currentWatcherSequence,
}: {
  requestedUserId: string | undefined;
  currentUserId: string | undefined;
  requestedWatcherSequence: number;
  currentWatcherSequence: number;
}): boolean {
  return shouldAttachActiveCommercialTaskForUser(requestedUserId, currentUserId) &&
    requestedWatcherSequence === currentWatcherSequence;
}

export function shouldClearCancelledCommercialTaskState(
  cancelledTaskId: string,
  currentAttachedTaskId: string | undefined,
): boolean {
  return cancelledTaskId === currentAttachedTaskId;
}

export function buildCommercialTaskReportSimulation(
  task: Pick<SimulationTaskStatusResponse, "simulationId" | "scenarioType" | "mode">,
  report: SimulationApiResponse,
): Simulation {
  return {
    id: task.simulationId,
    type: task.scenarioType,
    userInput: { type: task.scenarioType },
    agents: report.agents,
    stages: report.stages,
    report: report.report,
    createdAt: report.createdAt,
    interactionModeUsed: report.interactionModeUsed ?? task.mode,
    runtimeDiagnostics: report.runtimeDiagnostics,
    routeComparison: report.routeComparison,
  };
}

export function getCommercialPostAuthPath(): string {
  return "/";
}

export function redirectToCommercialPostAuthPath(
  location: Pick<Location, "assign"> | undefined = globalThis.location,
): void {
  location?.assign(getCommercialPostAuthPath());
}

function getCommercialErrorMessage(error: unknown): string {
  if (error instanceof CommercialClientError) {
    return error.message;
  }
  return error instanceof Error ? error.message : "Account request failed.";
}

export default function App({
  initialCommercialUser,
  initialCommercialAccount,
  initialCommercialModelProvider,
  initialPlatformModels,
  initialLanguage,
}: AppProps = {}) {
  const pathname = globalThis.location?.pathname ?? "/";
  const authMode =
    pathname.startsWith("/register") ? "register"
      : pathname.startsWith("/login") ? "login"
        : undefined;
  const modelConfigMode = pathname.startsWith("/account/models");
  const accountMode = pathname.startsWith("/account") && !modelConfigMode;

  if (pathname.startsWith("/admin")) {
    return <AdminApp />;
  }

  const [view, setView] = useState<ViewState>("home");
  const [historyList, setHistoryList] = useState<Simulation[]>([]);
  const [currentSimulation, setCurrentSimulation] = useState<Simulation | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [templateIdea, setTemplateIdea] = useState("");
  const [templateInput, setTemplateInput] = useState<UserInput | undefined>(undefined);
  const [lastInputDraft, setLastInputDraft] = useState<UserInput | undefined>(undefined);
  const [selectedType, setSelectedType] = useState<SimulationType>("side_hustle");
  const [showShareCard, setShowShareCard] = useState(false);
  const [progressEvent, setProgressEvent] = useState<SimulationProgressEvent | null>(null);
  const [deepAgentMode, setDeepAgentMode] = useState(false);
  const [deepModeNotice, setDeepModeNotice] = useState("");
  const [runtimeCapabilities, setRuntimeCapabilities] = useState<AgentRuntimeCapabilities | undefined>(undefined);
  const [commercialUser, setCommercialUser] = useState<CommercialUserDto | undefined>(initialCommercialUser);
  const [commercialAccount, setCommercialAccount] = useState<CommercialCreditAccountDto | undefined>(initialCommercialAccount);
  const [commercialModelProvider, setCommercialModelProvider] = useState<PublicModelProviderDto | undefined>(initialCommercialModelProvider);
  const [providerMode, setProviderMode] = useState<ProviderMode>("platform");
  const [platformModels, setPlatformModels] = useState<PlatformModelOption[]>(initialPlatformModels ?? []);
  const [selectedModelProfileId, setSelectedModelProfileId] = useState(() =>
    getInitialModelProfileIdFromStorage(globalThis.localStorage, initialPlatformModels),
  );
  const [selectedCredentialId, setSelectedCredentialId] = useState<string | undefined>(initialCommercialModelProvider?.id);
  const [commercialAvailable, setCommercialAvailable] = useState(
    () => typeof globalThis.window === "undefined",
  );
  const [commercialBusy, setCommercialBusy] = useState(false);
  const [commercialStatus, setCommercialStatus] = useState("");
  const [commercialError, setCommercialError] = useState("");
  const [commercialStartAttempted, setCommercialStartAttempted] = useState(false);
  const [commercialTasks, setCommercialTasks] = useState<SimulationTaskStatusResponse[]>([]);
  const [commercialTasksLoading, setCommercialTasksLoading] = useState(false);
  const [commercialTasksError, setCommercialTasksError] = useState("");
  const [recoverableSimulationId, setRecoverableSimulationId] = useState<string | undefined>(undefined);
  const [attachedCommercialTaskId, setAttachedCommercialTaskId] = useState<string | undefined>(undefined);
  const [progressElapsedStartMs, setProgressElapsedStartMs] = useState<number | undefined>(undefined);
  const [progressElapsedMs, setProgressElapsedMs] = useState<number | undefined>(undefined);
  const [activeSimulationRequest, setActiveSimulationRequest] = useState<{
    userInput: UserInput;
    deepModeRequested: boolean;
    startedAt: number;
  } | undefined>(undefined);
  const [language, setLanguage] = useState<Language>(() => {
    if (initialLanguage) {
      return initialLanguage;
    }
    try {
      return getInitialLanguageFromStorage(globalThis.localStorage);
    } catch {
      return DEFAULT_LANGUAGE;
    }
  });
  const appCopy = APP_COPY[language];
  const commercialTaskStartSequenceRef = useRef(0);
  const activeCommercialTaskStartRef = useRef<CommercialTaskStartToken | undefined>(undefined);
  const commercialTaskWatcherSequenceRef = useRef(0);
  const activeCommercialTaskWatcherRef = useRef<CommercialTaskWatcherToken | undefined>(undefined);
  const commercialTaskRefreshSequenceRef = useRef(0);
  const activeCommercialTaskRefreshRef = useRef<CommercialTaskRefreshToken | undefined>(undefined);
  const commercialTaskReportSequenceRef = useRef(0);
  const activeCommercialTaskReportRef = useRef<CommercialTaskReportToken | undefined>(undefined);
  const commercialUserIdRef = useRef(commercialUser?.id);
  const attachedCommercialTaskIdRef = useRef(attachedCommercialTaskId);
  const viewRef = useRef(view);

  useEffect(() => {
    commercialUserIdRef.current = commercialUser?.id;
  }, [commercialUser?.id]);

  useEffect(() => {
    attachedCommercialTaskIdRef.current = attachedCommercialTaskId;
  }, [attachedCommercialTaskId]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const setViewState = (nextView: ViewState) => {
    viewRef.current = nextView;
    setView(nextView);
  };

  const setAttachedCommercialTaskIdState = (simulationId: string | undefined) => {
    attachedCommercialTaskIdRef.current = simulationId;
    setAttachedCommercialTaskId(simulationId);
  };

  const setCommercialUserState = (user: CommercialUserDto | undefined) => {
    const previousUserId = commercialUserIdRef.current;
    const nextUserId = user?.id;
    activeCommercialTaskStartRef.current = resolveCommercialTaskStartAfterUserChange(
      activeCommercialTaskStartRef.current,
      previousUserId,
      nextUserId,
    );
    activeCommercialTaskWatcherRef.current = resolveCommercialTaskWatcherAfterUserChange(
      activeCommercialTaskWatcherRef.current,
      previousUserId,
      nextUserId,
    );
    activeCommercialTaskReportRef.current = resolveCommercialTaskReportAfterUserChange(
      activeCommercialTaskReportRef.current,
      previousUserId,
      nextUserId,
    );
    commercialUserIdRef.current = nextUserId;
    setCommercialUser(user);
  };

  const beginCommercialTaskStart = (): CommercialTaskStartToken => {
    const token = createCommercialTaskStartToken(
      commercialTaskStartSequenceRef.current,
      commercialUserIdRef.current,
    );
    commercialTaskStartSequenceRef.current = token.sequence;
    activeCommercialTaskStartRef.current = token;
    return token;
  };

  const invalidateCommercialTaskStart = (token?: CommercialTaskStartToken) => {
    if (
      token === undefined ||
      (
        activeCommercialTaskStartRef.current?.sequence === token.sequence &&
        activeCommercialTaskStartRef.current.userId === token.userId
      )
    ) {
      activeCommercialTaskStartRef.current = undefined;
    }
  };

  const isActiveCommercialTaskStart = (token: CommercialTaskStartToken): boolean =>
    isCommercialTaskStartCurrent(
      activeCommercialTaskStartRef.current,
      token,
      commercialUserIdRef.current,
    );

  const beginCommercialTaskWatcher = (simulationId: string): CommercialTaskWatcherToken => {
    const token = createCommercialTaskWatcherToken(
      commercialTaskWatcherSequenceRef.current,
      simulationId,
    );
    commercialTaskWatcherSequenceRef.current = token.sequence;
    activeCommercialTaskWatcherRef.current = token;
    return token;
  };

  const invalidateCommercialTaskWatcher = (simulationId?: string) => {
    if (
      simulationId === undefined ||
      activeCommercialTaskWatcherRef.current?.simulationId === simulationId
    ) {
      activeCommercialTaskWatcherRef.current = undefined;
    }
  };

  const isActiveCommercialTaskWatcher = (token: CommercialTaskWatcherToken): boolean =>
    isCommercialTaskWatcherCurrent(activeCommercialTaskWatcherRef.current, token);

  const beginCommercialTaskReport = (simulationId: string): CommercialTaskReportToken => {
    const token = createCommercialTaskReportToken(
      commercialTaskReportSequenceRef.current,
      commercialUserIdRef.current,
      simulationId,
    );
    commercialTaskReportSequenceRef.current = token.sequence;
    activeCommercialTaskReportRef.current = token;
    return token;
  };

  const invalidateCommercialTaskReport = (simulationId?: string) => {
    if (
      simulationId === undefined ||
      activeCommercialTaskReportRef.current?.simulationId === simulationId
    ) {
      activeCommercialTaskReportRef.current = undefined;
    }
  };

  const isActiveCommercialTaskReport = (token: CommercialTaskReportToken): boolean =>
    isCommercialTaskReportCurrent(
      activeCommercialTaskReportRef.current,
      token,
      commercialUserIdRef.current,
    );

  useEffect(() => {
    if (!isGenerating || progressElapsedStartMs === undefined) {
      setProgressElapsedMs(undefined);
      return;
    }

    const updateElapsed = () => {
      setProgressElapsedMs(Math.max(0, Date.now() - progressElapsedStartMs));
    };
    updateElapsed();
    const timerId = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timerId);
  }, [isGenerating, progressElapsedStartMs]);

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (stored) {
        setHistoryList(JSON.parse(stored));
      }
      setLastInputDraft(parseStoredUserInput(localStorage.getItem(LAST_INPUT_DRAFT_STORAGE_KEY)));
      const storedModelProfileId = localStorage.getItem(MODEL_PROFILE_STORAGE_KEY);
      if (storedModelProfileId && storedModelProfileId.trim()) {
        setSelectedModelProfileId(storedModelProfileId);
      }
      const storedCredentialId = localStorage.getItem(MODEL_CREDENTIAL_STORAGE_KEY);
      if (storedCredentialId) {
        setSelectedCredentialId(storedCredentialId);
      }
    } catch (e) {
      console.error("Failed to load history from localStorage:", e);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch (e) {
      console.error("Failed to save language to localStorage:", e);
    }
  }, [language]);

  useEffect(() => {
    try {
      localStorage.setItem(MODEL_PROFILE_STORAGE_KEY, selectedModelProfileId);
    } catch (e) {
      console.error("Failed to save selected model profile to localStorage:", e);
    }
  }, [selectedModelProfileId]);

  useEffect(() => {
    try {
      if (selectedCredentialId) {
        localStorage.setItem(MODEL_CREDENTIAL_STORAGE_KEY, selectedCredentialId);
      } else {
        localStorage.removeItem(MODEL_CREDENTIAL_STORAGE_KEY);
      }
    } catch (e) {
      console.error("Failed to save selected model credential to localStorage:", e);
    }
  }, [selectedCredentialId]);

  useEffect(() => {
    let cancelled = false;
    void fetchAgentRuntimeCapabilities().then((capabilities) => {
      if (cancelled) return;
      setRuntimeCapabilities(capabilities);
      if (capabilities.deepModeAvailable) {
        setDeepAgentMode(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (initialPlatformModels !== undefined) {
      return;
    }
    let cancelled = false;
    void fetchPlatformModels()
      .then((result) => {
        if (!cancelled) {
          setPlatformModels(result.models);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPlatformModels([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialPlatformModels]);

  const refreshCommercialAccount = async () => {
    const me = await fetchCommercialMe();
    const credits = await fetchCommercialCredits();
    const modelProvider = await fetchModelProvider();
    setCommercialAvailable(true);
    setCommercialUserState(me.user);
    setCommercialAccount(credits.account);
    setCommercialModelProvider(modelProvider.provider);
  };

  const refreshCommercialCreditsForUser = (requestedUserId: string | undefined) => {
    if (!shouldApplyCommercialUserSideEffect(requestedUserId, commercialUserIdRef.current)) {
      return;
    }
    void fetchCommercialCredits()
      .then(({ account }) => {
        if (shouldApplyCommercialUserSideEffect(requestedUserId, commercialUserIdRef.current)) {
          setCommercialAccount(account);
        }
      })
      .catch(() => undefined);
  };

  const refreshCommercialTasks = async ({
    clearError = true,
  }: { clearError?: boolean } = {}) => {
    const userId = commercialUserIdRef.current;
    const token = createCommercialTaskRefreshToken(
      commercialTaskRefreshSequenceRef.current,
      userId,
    );
    commercialTaskRefreshSequenceRef.current = token.sequence;
    activeCommercialTaskRefreshRef.current = token;

    if (!userId) {
      setCommercialTasks([]);
      setCommercialTasksLoading(false);
      if (clearError) {
        setCommercialTasksError("");
      }
      return;
    }
    setCommercialTasksLoading(true);
    if (clearError) {
      setCommercialTasksError("");
    }
    try {
      const tasks = await fetchSimulationTasks();
      if (!isCommercialTaskRefreshCurrent(
        activeCommercialTaskRefreshRef.current,
        token,
        commercialUserIdRef.current,
      )) {
        return;
      }
      setCommercialTasks(tasks);
    } catch (error) {
      if (isCommercialTaskRefreshCurrent(
        activeCommercialTaskRefreshRef.current,
        token,
        commercialUserIdRef.current,
      )) {
        setCommercialTasksError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (isCommercialTaskRefreshCurrent(
        activeCommercialTaskRefreshRef.current,
        token,
        commercialUserIdRef.current,
      )) {
        setCommercialTasksLoading(false);
      }
    }
  };

  useEffect(() => {
    void refreshCommercialTasks();
  }, [commercialUser?.id]);

  const handleTaskProgressEvent = (event: SimulationProgressEvent) => {
    setProgressEvent(event);
    setAttachedCommercialTaskIdState(event.simulationId);
    setRecoverableSimulationId(event.status === "queued" ? event.simulationId : undefined);
    const elapsedStartMs = parseIsoTimestampMs(event.createdAt);
    if (elapsedStartMs !== undefined) {
      setProgressElapsedStartMs(elapsedStartMs);
    }
  };

  const attachCommercialTaskProgress = (
    task: SimulationTaskStatusResponse,
    { scrollOnView = false }: { scrollOnView?: boolean } = {},
  ): number => {
    invalidateCommercialTaskWatcher();
    const elapsedStartMs = getCommercialTaskElapsedStartMs(task) ?? Date.now();
    const progressMessage =
      task.progressMessage ||
      (task.status === "queued"
        ? appCopy.commercialStatus.activeQueued
        : appCopy.commercialStatus.activeStarted);

    setAttachedCommercialTaskIdState(task.simulationId);
    setSelectedType(task.scenarioType);
    setErrorMsg("");
    setRecoverableSimulationId(
      task.status === "queued" || task.status === "recoverable_failed"
        ? task.simulationId
        : undefined,
    );
    setProgressElapsedStartMs(elapsedStartMs);
    setActiveSimulationRequest({
      userInput: { type: task.scenarioType },
      deepModeRequested: task.mode === "enabled",
      startedAt: elapsedStartMs,
    });
    setProgressEvent({
      simulationId: task.simulationId,
      step: "generate_agents",
      status: task.status === "queued" ? "queued" : "started",
      percent: task.progressPercent,
      message: progressMessage,
      createdAt: getCommercialTaskElapsedTimestamp(task),
    });
    setIsGenerating(true);
    setViewState("generating");
    if (scrollOnView) {
      scrollToTopForViewChange();
    }

    return elapsedStartMs;
  };

  const watchCommercialTaskFromStatus = (
    task: SimulationTaskStatusResponse,
    { scrollOnView = false }: { scrollOnView?: boolean } = {},
  ) => {
    const elapsedStartMs = attachCommercialTaskProgress(task, { scrollOnView });
    if (task.status === "recoverable_failed") {
      setErrorMsg(task.errorCode || "simulation task can be resumed");
      setIsGenerating(false);
      return;
    }

    const watcherToken = beginCommercialTaskWatcher(task.simulationId);
    void watchSimulationTaskUntilComplete(task.simulationId, {
      onProgress: (event) => {
        if (isActiveCommercialTaskWatcher(watcherToken)) {
          handleTaskProgressEvent(event);
        }
      },
    })
      .then((data) => {
        if (!isActiveCommercialTaskWatcher(watcherToken)) {
          return;
        }
        invalidateCommercialTaskWatcher(task.simulationId);
        setAttachedCommercialTaskIdState(undefined);
        handleSimulationCompleted(data, { type: task.scenarioType }, {
          startedAt: elapsedStartMs,
          deepModeRequested: task.mode === "enabled",
        });
      })
      .catch((error) => {
        if (!isActiveCommercialTaskWatcher(watcherToken)) {
          return;
        }
        invalidateCommercialTaskWatcher(task.simulationId);
        handleSimulationFailed(error, { type: task.scenarioType }, {
          startedAt: elapsedStartMs,
          deepModeRequested: task.mode === "enabled",
        });
        if (!isRecoverableSimulationTaskError(error)) {
          setAttachedCommercialTaskIdState(undefined);
        }
      });
  };

  async function attachActiveCommercialTask() {
    const requestedUserId = commercialUserIdRef.current;
    const requestedWatcherSequence = commercialTaskWatcherSequenceRef.current;
    if (!requestedUserId) {
      return;
    }
    const activeTask = await fetchActiveSimulationTask().catch(() => undefined);
    if (!shouldAttachActiveCommercialTaskForContext({
      requestedUserId,
      currentUserId: commercialUserIdRef.current,
      requestedWatcherSequence,
      currentWatcherSequence: commercialTaskWatcherSequenceRef.current,
    })) {
      return;
    }
    if (activeTask === undefined) {
      return;
    }
    if (attachedCommercialTaskIdRef.current === activeTask.simulationId) {
      return;
    }

    watchCommercialTaskFromStatus(activeTask);
  }

  useEffect(() => {
    let cancelled = false;
    void fetchCommercialMe()
      .then(async (me) => {
        if (cancelled) return;
        setCommercialAvailable(true);
        setCommercialUserState(me.user);
        const credits = await fetchCommercialCredits();
        if (cancelled) return;
        setCommercialAccount(credits.account);
        const modelProvider = await fetchModelProvider();
        if (cancelled) return;
        setCommercialModelProvider(modelProvider.provider);
        await attachActiveCommercialTask();
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof CommercialClientError && error.status === 404) {
          setCommercialAvailable(false);
          return;
        }
        if (error instanceof CommercialClientError && error.status === 401) {
          setCommercialAvailable(true);
          setCommercialUserState(undefined);
          setCommercialAccount(undefined);
          setCommercialModelProvider(undefined);
          setProviderMode("platform");
          setSelectedCredentialId(undefined);
          setAttachedCommercialTaskIdState(undefined);
          return;
        }
        setCommercialAvailable(false);
        setCommercialModelProvider(undefined);
        setProviderMode("platform");
        setSelectedCredentialId(undefined);
        setAttachedCommercialTaskIdState(undefined);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const byokAvailable = canUseByokProvider({
    user: commercialUser,
    provider: commercialModelProvider,
  });
  const byokConfigurable = canConfigureByokProvider({ user: commercialUser });
  const selectedPlatformModelId =
    platformModels.some((model) => model.id === selectedModelProfileId)
      ? selectedModelProfileId
      : platformModels[0]?.id;

  useEffect(() => {
    if (!byokConfigurable && providerMode === "byok") {
      setProviderMode("platform");
    }
  }, [byokConfigurable, providerMode]);

  useEffect(() => {
    if (platformModels.length === 0) {
      return;
    }
    if (!platformModels.some((model) => model.id === selectedModelProfileId)) {
      setSelectedModelProfileId(platformModels[0]!.id);
    }
  }, [platformModels, selectedModelProfileId]);

  useEffect(() => {
    if (commercialModelProvider?.status === "active") {
      setSelectedCredentialId(commercialModelProvider.id);
      return;
    }
    setSelectedCredentialId(undefined);
  }, [commercialModelProvider]);

  useEffect(() => {
    if (authMode && commercialUser) {
      redirectToCommercialPostAuthPath();
    }
  }, [authMode, commercialUser]);

  // Save to history helper
  const saveToHistory = (newSim: Simulation) => {
    try {
      setHistoryList((current) => {
        const updated = addSimulationToHistoryList(current, newSim);
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });
    } catch (e) {
      console.error("Failed to save simulation to history:", e);
    }
  };

  const saveInputDraft = (input: UserInput) => {
    setLastInputDraft(input);
    try {
      localStorage.setItem(LAST_INPUT_DRAFT_STORAGE_KEY, JSON.stringify(input));
    } catch (e) {
      console.error("Failed to save input draft to localStorage:", e);
    }
  };

  // Launch Simulation API call
  const handleStartSimulation = async (userInput: UserInput) => {
    saveInputDraft(userInput);
    setErrorMsg("");
    setCommercialStartAttempted(true);
    setProgressEvent(null);
    setRecoverableSimulationId(undefined);
    setIsGenerating(true);
    setViewState("generating");
    scrollToTopForViewChange();
    const startedAt = Date.now();
    const deepModeRequested = deepAgentMode;
    const selectedProviderMode: ProviderMode =
      providerMode === "byok" && byokAvailable ? "byok" : "platform";
    const modelSelection = buildCommercialModelSelection({
      providerMode: selectedProviderMode,
      selectedModelProfileId: selectedPlatformModelId,
      selectedCredentialId,
      deepAgentMode: deepModeRequested,
    });
    const requiredCredits = resolveCommercialSimulationCost({
      deepAgentMode: deepModeRequested,
      providerMode: selectedProviderMode,
    });
    if (commercialAvailable && commercialUser === undefined) {
      setErrorMsg(appCopy.commercialStatus.loginRequired);
      setIsGenerating(false);
      setViewState("input");
      scrollToTopForViewChange();
      return;
    }
    if (commercialAvailable && (commercialAccount?.balance ?? 0) < requiredCredits) {
      setErrorMsg(appCopy.commercialStatus.insufficientCredits);
      setIsGenerating(false);
      setViewState("input");
      scrollToTopForViewChange();
      return;
    }
    setActiveSimulationRequest({
      userInput,
      deepModeRequested,
      startedAt,
    });
    setProgressElapsedStartMs(startedAt);
    void postValidationEvent({
      type: "simulation_requested",
      scenarioType: userInput.type,
      deepModeRequested,
    });
    if (deepAgentMode) {
      void postValidationEvent({
        type: "deep_mode_requested",
        scenarioType: userInput.type,
        deepModeRequested: true,
      });
    }

    const startToken = beginCommercialTaskStart();
    let watcherToken: CommercialTaskWatcherToken | undefined;
    try {
      const data = await runSimulationTaskUntilComplete(
        buildCommercialSimulationTaskRequest(userInput, {
          deepAgentMode: deepModeRequested,
          providerMode: selectedProviderMode,
          startedAt,
          modelSelection,
          createIdempotencyKey: buildCommercialTaskIdempotencyKey,
        }),
        {
          onCreated: (created) => {
            if (!isActiveCommercialTaskStart(startToken)) {
              return;
            }
            watcherToken = beginCommercialTaskWatcher(created.simulationId);
            setAttachedCommercialTaskIdState(created.simulationId);
            void refreshCommercialTasks();
          },
          onProgress: (event) => {
            if (!isActiveCommercialTaskStart(startToken)) {
              return;
            }
            if (!watcherToken || isActiveCommercialTaskWatcher(watcherToken)) {
              handleTaskProgressEvent(event);
            }
          },
        },
      );
      if (!isActiveCommercialTaskStart(startToken)) {
        return;
      }
      if (watcherToken && !isActiveCommercialTaskWatcher(watcherToken)) {
        invalidateCommercialTaskStart(startToken);
        return;
      }
      invalidateCommercialTaskStart(startToken);
      if (watcherToken) {
        invalidateCommercialTaskWatcher(watcherToken.simulationId);
      }
      refreshCommercialCreditsForUser(startToken.userId);
      handleSimulationCompleted(data, userInput, {
        startedAt,
        deepModeRequested,
      });
    } catch (err: any) {
      if (!isActiveCommercialTaskStart(startToken)) {
        return;
      }
      if (watcherToken && !isActiveCommercialTaskWatcher(watcherToken)) {
        invalidateCommercialTaskStart(startToken);
        return;
      }
      invalidateCommercialTaskStart(startToken);
      if (watcherToken) {
        invalidateCommercialTaskWatcher(watcherToken.simulationId);
      }
      handleSimulationFailed(err, userInput, {
        startedAt,
        deepModeRequested,
      });
    }
  };

  const resumeCommercialSimulationTask = async (
    simulationId: string,
    request: {
      userInput: UserInput;
      deepModeRequested: boolean;
      startedAt: number;
    },
  ) => {
    setErrorMsg("");
    setIsGenerating(true);
    setViewState("generating");
    scrollToTopForViewChange();
    const resumedAt = Date.now();
    setProgressElapsedStartMs(request.startedAt);
    const watcherToken = beginCommercialTaskWatcher(simulationId);

    try {
      const data = await resumeSimulationTaskUntilComplete(simulationId, {
        onProgress: (event) => {
          if (isActiveCommercialTaskWatcher(watcherToken)) {
            handleTaskProgressEvent(event);
          }
        },
      });
      if (!isActiveCommercialTaskWatcher(watcherToken)) {
        return;
      }
      invalidateCommercialTaskWatcher(simulationId);
      handleSimulationCompleted(data, request.userInput, {
        startedAt: request.startedAt,
        deepModeRequested: request.deepModeRequested,
      });
    } catch (err: any) {
      if (!isActiveCommercialTaskWatcher(watcherToken)) {
        return;
      }
      invalidateCommercialTaskWatcher(simulationId);
      handleSimulationFailed(err, request.userInput, {
        startedAt: resumedAt,
        deepModeRequested: request.deepModeRequested,
      });
    }
  };

  const handleResumeSimulation = async () => {
    if (!recoverableSimulationId || !activeSimulationRequest) {
      setViewState("input");
      setErrorMsg("");
      setProgressEvent(null);
      return;
    }

    await resumeCommercialSimulationTask(recoverableSimulationId, activeSimulationRequest);
  };

  const handleCancelProgress = async () => {
    const taskId = attachedCommercialTaskIdRef.current;
    if (!taskId) {
      setViewState("input");
      setErrorMsg("");
      setProgressEvent(null);
      setProgressElapsedStartMs(undefined);
      setIsGenerating(false);
      return;
    }

    const requestedUserId = commercialUserIdRef.current;
    invalidateCommercialTaskWatcher(taskId);
    const cancelError = await cancelSimulationTask(taskId)
      .then(() => undefined)
      .catch((error) => getCommercialErrorMessage(error));
    const canClearCancelledTask = shouldClearCancelledCommercialTaskState(
      taskId,
      attachedCommercialTaskIdRef.current,
    );
    if (cancelError) {
      if (canClearCancelledTask) {
        setErrorMsg(cancelError);
        setIsGenerating(false);
      }
      return;
    }
    refreshCommercialCreditsForUser(requestedUserId);
    void refreshCommercialTasks();
    if (!canClearCancelledTask) {
      return;
    }
    setAttachedCommercialTaskIdState(undefined);
    setRecoverableSimulationId(undefined);
    setErrorMsg("");
    setProgressEvent(null);
    setProgressElapsedStartMs(undefined);
    setIsGenerating(false);
    if (viewRef.current === "generating") {
      setViewState("input");
    }
  };

  const handleSimulationCompleted = (
    data: Awaited<ReturnType<typeof runSimulationTaskUntilComplete>>,
    userInput: UserInput,
    {
      startedAt,
      deepModeRequested,
    }: {
      startedAt: number;
      deepModeRequested: boolean;
    },
  ) => {
    if (deepModeRequested && data.interactionModeUsed !== "enabled") {
      setDeepModeNotice(getDeepModeUnavailableNotice(language));
    } else {
      setDeepModeNotice("");
    }
    void postValidationEvent(
      buildSimulationCompletedEvent({
        response: data,
        scenarioType: userInput.type,
        durationMs: Date.now() - startedAt,
        deepModeRequested,
      }),
    );

    const newSimulation: Simulation = {
      id: data.id,
      type: userInput.type,
      userInput,
      agents: data.agents,
      stages: data.stages,
      report: data.report,
      createdAt: data.createdAt,
      interactionModeUsed: data.interactionModeUsed,
      runtimeDiagnostics: data.runtimeDiagnostics,
      routeComparison: data.routeComparison,
    };

    setCurrentSimulation(newSimulation);
    saveToHistory(newSimulation);
    setRecoverableSimulationId(undefined);
    setIsGenerating(false);
    setProgressEvent(null);
    setProgressElapsedStartMs(undefined);
    setViewState("report");
    void refreshCommercialTasks();
    scrollToTopForViewChange();
  };

  const handleSimulationFailed = (
    err: unknown,
    userInput: UserInput,
    {
      startedAt,
      deepModeRequested,
    }: {
      startedAt: number;
      deepModeRequested: boolean;
    },
  ) => {
    console.error("Simulation generation error:", err);
    setDeepModeNotice("");
    if (isRecoverableSimulationTaskError(err)) {
      setRecoverableSimulationId(err.simulationId);
      setAttachedCommercialTaskIdState(err.simulationId);
    } else {
      setRecoverableSimulationId(undefined);
      setAttachedCommercialTaskIdState(undefined);
    }
    void postValidationEvent(
      buildSimulationFailedEvent({
        scenarioType: userInput.type,
        durationMs: Date.now() - startedAt,
        deepModeRequested,
        error: err,
      }),
    );
    const message = err instanceof Error
      ? err.message
      : "智能沙盘博弈计算超时，可能是AI模型服务器拥堵，请重试。";
    setErrorMsg(message);
    setIsGenerating(false);
    setProgressElapsedStartMs(undefined);
    void refreshCommercialTasks();
  };

  const handleSelectHistory = (simulation: Simulation) => {
    setCommercialStartAttempted(false);
    setCurrentSimulation(simulation);
    setProgressElapsedStartMs(undefined);
    setViewState("report");
    scrollToTopForViewChange();
  };

  const handleDeleteHistory = (simulationId: string) => {
    setHistoryList((current) => {
      const updated = deleteSimulationFromHistoryList(current, simulationId);
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error("Failed to delete simulation from localStorage:", e);
      }
      return updated;
    });

    if (currentSimulation?.id === simulationId) {
      setCurrentSimulation(null);
      setViewState("home");
      scrollToTopForViewChange();
    }
  };

  const handleLoadTemplate = (input: UserInput) => {
    setCommercialStartAttempted(false);
    setSelectedType(input.type);
    setTemplateIdea("");
    setTemplateInput(input);
    setProgressElapsedStartMs(undefined);
    setViewState("input");
    scrollToTopForViewChange();
  };

  const handleEditInput = (input: UserInput) => {
    setCommercialStartAttempted(false);
    setSelectedType(input.type);
    setTemplateIdea("");
    setTemplateInput(input);
    setShowShareCard(false);
    setProgressElapsedStartMs(undefined);
    setViewState("input");
    scrollToTopForViewChange();
  };

  const handleSubmitSimulation = (input: UserInput) => {
    setSelectedType(input.type);
    setTemplateInput(input);
    void handleStartSimulation(input);
  };

  const handleViewTaskProgress = (task: SimulationTaskStatusResponse) => {
    setCommercialStartAttempted(false);
    watchCommercialTaskFromStatus(task, { scrollOnView: true });
  };

  const handleRetryTask = async (task: SimulationTaskStatusResponse) => {
    setCommercialStartAttempted(false);
    const startedAt = attachCommercialTaskProgress(task, { scrollOnView: true });
    const request = {
      userInput: { type: task.scenarioType } as UserInput,
      deepModeRequested: task.mode === "enabled",
      startedAt,
    };
    setRecoverableSimulationId(task.simulationId);
    setActiveSimulationRequest(request);

    try {
      await resumeCommercialSimulationTask(task.simulationId, request);
    } finally {
      await refreshCommercialTasks();
    }
  };

  const handleCancelTaskFromList = async (task: SimulationTaskStatusResponse) => {
    let cancelError = "";
    const taskId = task.simulationId;
    const requestedUserId = commercialUserIdRef.current;
    invalidateCommercialTaskWatcher(task.simulationId);
    try {
      await cancelSimulationTask(taskId);
      if (shouldClearCancelledCommercialTaskState(taskId, attachedCommercialTaskIdRef.current)) {
        setAttachedCommercialTaskIdState(undefined);
        setRecoverableSimulationId(undefined);
        setProgressEvent(null);
        setProgressElapsedStartMs(undefined);
        setErrorMsg("");
        setIsGenerating(false);
        if (viewRef.current === "generating") {
          setViewState("input");
        }
      }
      refreshCommercialCreditsForUser(requestedUserId);
    } catch (error) {
      cancelError = getCommercialErrorMessage(error);
    } finally {
      if (shouldApplyCommercialUserSideEffect(requestedUserId, commercialUserIdRef.current)) {
        await refreshCommercialTasks();
      }
      if (
        cancelError &&
        shouldApplyCommercialUserSideEffect(requestedUserId, commercialUserIdRef.current)
      ) {
        setCommercialTasksError(cancelError);
      }
    }
  };

  const handleViewTaskReport = async (task: SimulationTaskStatusResponse) => {
    setCommercialStartAttempted(false);
    setCommercialTasksError("");
    const reportToken = beginCommercialTaskReport(task.simulationId);
    try {
      const response = await getSimulationTaskReport(task.simulationId);
      if (!isActiveCommercialTaskReport(reportToken)) {
        return;
      }
      if (!response.report) {
        throw new Error(response.error || "simulation report not ready");
      }

      const simulation = buildCommercialTaskReportSimulation(task, response.report);
      setCurrentSimulation(simulation);
      saveToHistory(simulation);
      setShowShareCard(false);
      setDeepModeNotice("");
      setRecoverableSimulationId(undefined);
      setAttachedCommercialTaskIdState(undefined);
      setProgressEvent(null);
      setProgressElapsedStartMs(undefined);
      setIsGenerating(false);
      setViewState("report");
      scrollToTopForViewChange();
    } catch (error) {
      if (isActiveCommercialTaskReport(reportToken)) {
        setCommercialTasksError(getCommercialErrorMessage(error));
      }
    } finally {
      if (isActiveCommercialTaskReport(reportToken)) {
        invalidateCommercialTaskReport(task.simulationId);
      }
      void refreshCommercialTasks({ clearError: false });
    }
  };

  const handleCommercialLogin = async (input: CommercialCredentialsDto) => {
    setCommercialBusy(true);
    setCommercialError("");
    setCommercialStatus(appCopy.commercialStatus.signingIn);
    try {
      await loginCommercialUser(input);
      await refreshCommercialAccount();
      await attachActiveCommercialTask();
      setCommercialStatus(appCopy.commercialStatus.signedIn);
      redirectToCommercialPostAuthPath();
    } catch (error) {
      setCommercialError(getCommercialErrorMessage(error));
    } finally {
      setCommercialBusy(false);
    }
  };

  const handleCommercialRegister = async (input: CommercialCredentialsDto) => {
    setCommercialBusy(true);
    setCommercialError("");
    setCommercialStatus(appCopy.commercialStatus.creatingAccount);
    try {
      await registerCommercialUser(input);
      await loginCommercialUser(input);
      await refreshCommercialAccount();
      await attachActiveCommercialTask();
      setCommercialStatus(appCopy.commercialStatus.accountCreated);
      redirectToCommercialPostAuthPath();
    } catch (error) {
      setCommercialError(getCommercialErrorMessage(error));
    } finally {
      setCommercialBusy(false);
    }
  };

  const handleCommercialLogout = async () => {
    setCommercialBusy(true);
    setCommercialError("");
    invalidateCommercialTaskWatcher();
    invalidateCommercialTaskReport();
    try {
      await logoutCommercialUser();
      setCommercialUserState(undefined);
      setCommercialAccount(undefined);
      setCommercialModelProvider(undefined);
      setProviderMode("platform");
      setSelectedCredentialId(undefined);
      setAttachedCommercialTaskIdState(undefined);
      setCommercialStatus(appCopy.commercialStatus.signedOut);
    } catch (error) {
      setCommercialError(getCommercialErrorMessage(error));
    } finally {
      setCommercialBusy(false);
    }
  };

  const handleCommercialRedeem = async (input: RedeemAccessCodeInputDto) => {
    setCommercialBusy(true);
    setCommercialError("");
    setCommercialStatus(appCopy.commercialStatus.redeeming);
    try {
      const result = await redeemAccessCode(input);
      setCommercialAccount(result.account);
      setCommercialUserState(result.user);
      setCommercialStatus(appCopy.commercialStatus.redeemed(result.redemption.credits));
    } catch (error) {
      setCommercialError(getCommercialErrorMessage(error));
    } finally {
      setCommercialBusy(false);
    }
  };

  const handleSaveCommercialModelProvider = async (input: SaveModelProviderInputDto) => {
    setCommercialBusy(true);
    setCommercialError("");
    setCommercialStatus(appCopy.commercialStatus.savingProvider);
    try {
      const result = await saveModelProvider(input);
      setCommercialModelProvider(result.provider);
      setCommercialStatus(appCopy.commercialStatus.providerSaved);
    } catch (error) {
      setCommercialError(getCommercialErrorMessage(error));
    } finally {
      setCommercialBusy(false);
    }
  };

  const handleTestCommercialModelProvider = async () => {
    setCommercialBusy(true);
    setCommercialError("");
    setCommercialStatus(appCopy.commercialStatus.testingProvider);
    try {
      const result = await testModelProvider();
      setCommercialModelProvider(result.provider);
      setCommercialStatus(result.provider.lastTestStatus === "passed"
        ? appCopy.commercialStatus.providerTestPassed
        : `${appCopy.commercialStatus.providerTestFailed}${result.provider.lastTestError ? ` ${result.provider.lastTestError}` : ""}`);
    } catch (error) {
      setCommercialError(getCommercialErrorMessage(error));
    } finally {
      setCommercialBusy(false);
    }
  };

  const handleDeleteCommercialModelProvider = async () => {
    setCommercialBusy(true);
    setCommercialError("");
    setCommercialStatus(appCopy.commercialStatus.deletingProvider);
    try {
      await deleteModelProvider();
      setCommercialModelProvider(undefined);
      setProviderMode("platform");
      setSelectedCredentialId(undefined);
      setCommercialStatus(appCopy.commercialStatus.providerDeleted);
    } catch (error) {
      setCommercialError(getCommercialErrorMessage(error));
    } finally {
      setCommercialBusy(false);
    }
  };

  const handleOpenShareCard = () => {
    if (currentSimulation) {
      void postValidationEvent(buildShareCardOpenedEvent(currentSimulation));
    }
    setShowShareCard(true);
  };

  const handleRestart = () => {
    setCommercialStartAttempted(false);
    setTemplateIdea("");
    setTemplateInput(undefined);
    setProgressElapsedStartMs(undefined);
    setViewState("home");
    scrollToTopForViewChange();
  };

  const selectedProviderMode: ProviderMode =
    providerMode === "byok" && byokAvailable ? "byok" : "platform";
  const requiredCredits = resolveCommercialSimulationCost({
    deepAgentMode,
    providerMode: selectedProviderMode,
  });
  const commercialMode = commercialAvailable;
  const commercialActionNotice = resolveCommercialStartActionNotice({
    commercialMode,
    startAttempted: commercialStartAttempted,
    hasUser: Boolean(commercialUser),
    availableCredits: commercialAccount?.balance ?? 0,
    requiredCredits,
    language,
  });
  const showAuthPage = Boolean(authMode && !commercialUser);
  const showAccountPage = accountMode;
  const showModelConfigPage = modelConfigMode;
  const showWorkflow = !showAuthPage && !showAccountPage && !showModelConfigPage;

  return (
    <div id="app-root-container" className="min-h-screen flex flex-col bg-[#050711] text-[#f8fafc]">
      {/* Header */}
      <header id="app-global-header" className="sticky top-0 z-40 border-b border-white/10 bg-[#050711]/92 px-6 py-4 text-white backdrop-blur-md">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <a
            id="brand-logo-container"
            className="flex items-center gap-2.5 cursor-pointer"
            href="/"
            onClick={authMode || accountMode ? undefined : handleRestart}
          >
            <div className="w-9 h-9 bg-white/8 border border-white/10 rounded-xl flex items-center justify-center text-white shadow-md">
              <Flame className="w-5 h-5 fill-amber-400 text-amber-400 animate-pulse" />
            </div>
            <div>
              <span className="block font-black text-sm tracking-tight text-white leading-none">tryitout</span>
              <span className="block text-[9px] font-bold text-amber-600 tracking-wider uppercase mt-1">试一下</span>
            </div>
          </a>

          <div className="flex items-center gap-2 text-xs font-semibold text-white/60 sm:gap-3">
            <span className="hidden md:inline-flex items-center gap-1 bg-white/6 border border-white/10 text-white/58 px-2.5 py-1 rounded-md text-3xs font-mono">
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>Multi-Agent Sandbox</span>
            </span>
            {commercialUser ? (
              <a
                id="link-commercial-account"
                href="/account"
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-cyan-200/20 bg-cyan-200/10 px-3 text-xs font-black text-cyan-100 transition-colors hover:border-cyan-200/40 hover:bg-cyan-200/15"
              >
                <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{appCopy.nav.account}</span>
              </a>
            ) : (
              <>
                <a
                  id="link-commercial-login"
                  href="/login"
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-cyan-200/20 bg-cyan-200/10 px-3 text-xs font-black text-cyan-100 transition-colors hover:border-cyan-200/40 hover:bg-cyan-200/15"
                >
                  <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{appCopy.nav.login}</span>
                </a>
                <a
                  id="link-commercial-register"
                  href="/register"
                  className="hidden h-9 items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-white/7 px-3 text-xs font-black text-white/72 transition-colors hover:border-amber-200/40 hover:bg-amber-200/10 hover:text-amber-100 sm:inline-flex"
                >
                  <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{appCopy.nav.register}</span>
                </a>
              </>
            )}
            <button
              id="btn-toggle-language"
              type="button"
              onClick={() => setLanguage((current) => getNextLanguage(current))}
              className="inline-flex h-9 min-w-11 items-center justify-center rounded-xl border border-white/12 bg-white/7 px-3 text-xs font-black text-white/72 transition-colors hover:border-amber-200/40 hover:bg-amber-200/10 hover:text-amber-100 cursor-pointer"
              aria-label={language === "zh-CN" ? "Switch language to English" : "切换语言为中文"}
              title={language === "zh-CN" ? "Switch language to English" : "切换语言为中文"}
            >
              {getLanguageToggleLabel(language)}
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main id="app-main-content" className="flex-1 py-4 md:py-8">
        {showAuthPage && authMode && (
          <CommercialAuthPage
            mode={authMode}
            language={language}
            user={commercialUser}
            account={commercialAccount}
            modelProvider={commercialModelProvider}
            busy={commercialBusy}
            statusMessage={commercialStatus}
            errorMessage={commercialError}
            onLogin={handleCommercialLogin}
            onRegister={handleCommercialRegister}
            onLogout={handleCommercialLogout}
            onRedeem={handleCommercialRedeem}
            onSaveModelProvider={handleSaveCommercialModelProvider}
            onTestModelProvider={handleTestCommercialModelProvider}
            onDeleteModelProvider={handleDeleteCommercialModelProvider}
          />
        )}
        {showAccountPage && (
          <CommercialAccountPage
            user={commercialUser}
            account={commercialAccount}
            modelProvider={commercialModelProvider}
            language={language}
            providerMode={providerMode}
            byokAvailable={byokAvailable}
            showModelConfiguration={false}
            selectedModelProfileId={selectedPlatformModelId}
            selectedCredentialId={selectedCredentialId}
            platformModels={platformModels}
            busy={commercialBusy}
            statusMessage={commercialStatus}
            errorMessage={commercialError}
            onLogout={handleCommercialLogout}
            onRedeem={handleCommercialRedeem}
            onSaveModelProvider={handleSaveCommercialModelProvider}
            onTestModelProvider={handleTestCommercialModelProvider}
            onDeleteModelProvider={handleDeleteCommercialModelProvider}
            onProviderModeChange={setProviderMode}
            onModelProfileChange={setSelectedModelProfileId}
            onCredentialChange={setSelectedCredentialId}
          />
        )}
        {showModelConfigPage && (
          <CommercialAccountPage
            user={commercialUser}
            account={commercialAccount}
            modelProvider={commercialModelProvider}
            language={language}
            providerMode={providerMode}
            byokAvailable={byokAvailable}
            showModelConfiguration
            selectedModelProfileId={selectedPlatformModelId}
            selectedCredentialId={selectedCredentialId}
            platformModels={platformModels}
            busy={commercialBusy}
            statusMessage={commercialStatus}
            errorMessage={commercialError}
            onLogout={handleCommercialLogout}
            onRedeem={handleCommercialRedeem}
            onSaveModelProvider={handleSaveCommercialModelProvider}
            onTestModelProvider={handleTestCommercialModelProvider}
            onDeleteModelProvider={handleDeleteCommercialModelProvider}
            onProviderModeChange={setProviderMode}
            onModelProfileChange={setSelectedModelProfileId}
            onCredentialChange={setSelectedCredentialId}
          />
        )}
        {showWorkflow && <AnimatePresence mode="wait">
          {view === "home" && (
            <motion.div
              key="home"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <HomeView
                onStart={(type) => {
                  setCommercialStartAttempted(false);
                  setSelectedType(type);
                  setTemplateIdea("");
                  setTemplateInput(undefined);
                  setViewState("input");
                  scrollToTopForViewChange();
                }}
                onSelectHistory={handleSelectHistory}
                historyList={historyList}
                onSelectTemplate={handleLoadTemplate}
                lastInputDraft={lastInputDraft}
                onContinueDraft={handleEditInput}
                onDeleteHistory={handleDeleteHistory}
                language={language}
                commercialTasks={commercialTasks}
                commercialTasksLoading={commercialTasksLoading}
                commercialTasksError={commercialTasksError}
                onRefreshCommercialTasks={() => {
                  void refreshCommercialTasks();
                }}
                onTaskViewProgress={handleViewTaskProgress}
                onTaskRetry={(task) => {
                  void handleRetryTask(task);
                }}
                onTaskCancel={(task) => {
                  void handleCancelTaskFromList(task);
                }}
                onTaskViewReport={(task) => {
                  void handleViewTaskReport(task);
                }}
              />
            </motion.div>
          )}

          {view === "input" && (
            <motion.div
              key="input"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <InputView
                simulationType={selectedType}
                onTypeChange={(type) => {
                  setCommercialStartAttempted(false);
                  setSelectedType(type);
                  setTemplateIdea("");
                  setTemplateInput(undefined);
                }}
                initialIdea={templateIdea}
                initialInput={templateInput}
                onBack={handleRestart}
                onSubmit={handleSubmitSimulation}
                isGenerating={isGenerating}
                deepAgentMode={deepAgentMode}
                onDeepAgentModeChange={setDeepAgentMode}
                runtimeCapabilities={runtimeCapabilities}
                language={language}
                commercialMode={commercialMode}
                requiredCredits={requiredCredits}
                availableCredits={commercialAccount?.balance ?? 0}
                frozenCredits={commercialAccount?.frozenCredits ?? 0}
                providerMode={selectedProviderMode}
                byokAvailable={byokAvailable}
                onProviderModeChange={setProviderMode}
                commercialActionNotice={commercialActionNotice}
                onCommercialActionNoticeClose={() => setCommercialStartAttempted(false)}
              />
            </motion.div>
          )}

          {view === "generating" && (
            <motion.div
              key="generating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <SimulationProgress
                isGenerating={isGenerating}
                simulationType={selectedType}
                errorMsg={errorMsg}
                canResume={Boolean(recoverableSimulationId)}
                canCancelTask={Boolean(attachedCommercialTaskId)}
                progressEvent={progressEvent}
                elapsedMs={progressElapsedMs}
                onRetry={() => {
                  if (recoverableSimulationId) {
                    void handleResumeSimulation();
                  } else {
                    setViewState("input");
                    setErrorMsg("");
                    setProgressEvent(null);
                    setProgressElapsedStartMs(undefined);
                  }
                }}
                onCancel={() => {
                  void handleCancelProgress();
                }}
                language={language}
              />
            </motion.div>
          )}

          {view === "report" && currentSimulation && (
            <motion.div
              key="report"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {deepModeNotice && (
                <div className="max-w-4xl mx-auto px-4 pb-3">
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-3 text-xs font-semibold">
                    {deepModeNotice}
                  </div>
                </div>
              )}
              <ReportView
                simulation={currentSimulation}
                onRestart={handleRestart}
                onOpenShareCard={handleOpenShareCard}
                onEditInput={() => handleEditInput(currentSimulation.userInput)}
              />
            </motion.div>
          )}
        </AnimatePresence>}
      </main>

      {/* Share Poster Modal Overlay */}
      <AnimatePresence>
        {showShareCard && currentSimulation && (
          <ShareCard
            simulation={currentSimulation}
            onClose={() => setShowShareCard(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function CommercialAuthPage({
  mode,
  language,
  user,
  account,
  modelProvider,
  busy,
  statusMessage,
  errorMessage,
  onLogin,
  onRegister,
  onLogout,
  onRedeem,
  onSaveModelProvider,
  onTestModelProvider,
  onDeleteModelProvider,
}: {
  mode: "login" | "register";
  language: Language;
  user?: CommercialUserDto;
  account?: CommercialCreditAccountDto;
  modelProvider?: PublicModelProviderDto;
  busy: boolean;
  statusMessage: string;
  errorMessage: string;
  onLogin: (input: CommercialCredentialsDto) => Promise<void> | void;
  onRegister: (input: CommercialCredentialsDto) => Promise<void> | void;
  onLogout: () => Promise<void> | void;
  onRedeem: (input: RedeemAccessCodeInputDto) => Promise<void> | void;
  onSaveModelProvider: (input: SaveModelProviderInputDto) => Promise<void> | void;
  onTestModelProvider: () => Promise<void> | void;
  onDeleteModelProvider: () => Promise<void> | void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const isRegister = mode === "register";
  const copy = APP_COPY[language].auth;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = { email: email.trim(), password };
    if (isRegister) {
      await onRegister(input);
    } else {
      await onLogin(input);
    }
  };

  return (
    <section
      id={isRegister ? "auth-page-register" : "auth-page-login"}
      className="mx-auto grid min-h-[calc(100vh-8rem)] max-w-4xl place-items-center px-4 py-8"
    >
      <div className="w-full max-w-md border border-white/10 bg-white/[0.055] p-5 text-white shadow-lg shadow-black/10 backdrop-blur-md">
        {user ? (
          <AccountPanel
            user={user}
            account={account}
            modelProvider={modelProvider}
            showModelConfiguration={false}
            selectedCredentialId={modelProvider?.id}
            platformModels={[]}
            busy={busy}
            statusMessage={statusMessage}
            errorMessage={errorMessage}
            onLogout={onLogout}
            onRedeem={onRedeem}
            onSaveModelProvider={onSaveModelProvider}
            onTestModelProvider={onTestModelProvider}
            onDeleteModelProvider={onDeleteModelProvider}
          />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <UserRound className="h-4 w-4 text-cyan-200" aria-hidden="true" />
              <h1 className="text-sm font-black text-white">{isRegister ? copy.registerTitle : copy.loginTitle}</h1>
            </div>
            <form onSubmit={(event) => void handleSubmit(event)} className="mt-4 grid gap-3">
              <label className="block">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-white/42">{copy.email}</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="min-h-10 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm font-semibold text-white outline-none placeholder:text-white/30 focus:border-cyan-200/40 focus:ring-2 focus:ring-cyan-200/10"
                  placeholder="buyer@example.com"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-white/42">{copy.password}</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="min-h-10 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm font-semibold text-white outline-none placeholder:text-white/30 focus:border-cyan-200/40 focus:ring-2 focus:ring-cyan-200/10"
                  placeholder="account-password"
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                className="mt-1 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-cyan-200 px-4 text-xs font-black text-slate-950 transition-colors hover:bg-cyan-100 disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/40"
              >
                {isRegister ? (
                  <CreditCard className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                )}
                {isRegister ? copy.registerButton : copy.loginButton}
              </button>
            </form>

            <div className="mt-4 flex items-center justify-between gap-3 text-xs font-bold text-white/58">
              <a href="/" className="text-white/58 transition-colors hover:text-white">{copy.backHome}</a>
              <a href={isRegister ? "/login" : "/register"} className="text-cyan-100 transition-colors hover:text-cyan-50">
                {isRegister ? copy.switchToLogin : copy.switchToRegister}
              </a>
            </div>
            {(statusMessage || errorMessage) && (
              <p className={`mt-3 text-xs font-bold ${errorMessage ? "text-rose-200" : "text-white/50"}`}>
                {errorMessage || statusMessage}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function CommercialAccountPage({
  user,
  account,
  modelProvider,
  language,
  providerMode,
  byokAvailable,
  showModelConfiguration,
  selectedModelProfileId,
  selectedCredentialId,
  platformModels,
  busy,
  statusMessage,
  errorMessage,
  onLogout,
  onRedeem,
  onSaveModelProvider,
  onTestModelProvider,
  onDeleteModelProvider,
  onProviderModeChange,
  onModelProfileChange,
  onCredentialChange,
}: {
  user?: CommercialUserDto;
  account?: CommercialCreditAccountDto;
  modelProvider?: PublicModelProviderDto;
  language: Language;
  providerMode: ProviderMode;
  byokAvailable: boolean;
  showModelConfiguration: boolean;
  selectedModelProfileId: string;
  selectedCredentialId?: string;
  platformModels: PlatformModelOption[];
  busy: boolean;
  statusMessage: string;
  errorMessage: string;
  onLogout: () => Promise<void> | void;
  onRedeem: (input: RedeemAccessCodeInputDto) => Promise<void> | void;
  onSaveModelProvider: (input: SaveModelProviderInputDto) => Promise<void> | void;
  onTestModelProvider: () => Promise<void> | void;
  onDeleteModelProvider: () => Promise<void> | void;
  onProviderModeChange: (providerMode: ProviderMode) => void;
  onModelProfileChange: (modelProfileId: string) => void;
  onCredentialChange: (credentialId: string) => void;
}) {
  const copy = APP_COPY[language].account;

  return (
    <section
      id={showModelConfiguration ? "model-config-page" : "account-page"}
      className="mx-auto min-h-[calc(100vh-8rem)] max-w-4xl px-4 py-6 md:py-8"
    >
      {user ? (
        <AccountPanel
          user={user}
          account={account}
          modelProvider={modelProvider}
          language={language}
          providerMode={providerMode}
          byokAvailable={byokAvailable}
          showModelConfiguration={showModelConfiguration}
          modelPage={showModelConfiguration}
          selectedModelProfileId={selectedModelProfileId}
          selectedCredentialId={selectedCredentialId}
          platformModels={platformModels}
          busy={busy}
          statusMessage={statusMessage}
          errorMessage={errorMessage}
          onLogout={onLogout}
          onRedeem={onRedeem}
          onSaveModelProvider={onSaveModelProvider}
          onTestModelProvider={onTestModelProvider}
          onDeleteModelProvider={onDeleteModelProvider}
          onProviderModeChange={onProviderModeChange}
          onModelProfileChange={onModelProfileChange}
          onCredentialChange={onCredentialChange}
        />
      ) : (
        <div className="mx-auto max-w-md border border-white/10 bg-white/[0.055] p-5 text-white shadow-lg shadow-black/10 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <UserRound className="h-4 w-4 text-cyan-200" aria-hidden="true" />
            <h1 className="text-sm font-black text-white">{copy.title}</h1>
          </div>
          <p className="mt-2 text-xs font-semibold leading-relaxed text-white/58">
            {copy.signedOutDescription}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href="/login"
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md bg-cyan-200 px-3 text-[10px] font-black text-slate-950 transition-colors hover:bg-cyan-100"
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {copy.loginButton}
            </a>
            <a
              href="/register"
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/7 px-3 text-[10px] font-black text-white/70 transition-colors hover:border-white/20 hover:bg-white/10"
            >
              <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
              {copy.registerButton}
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
