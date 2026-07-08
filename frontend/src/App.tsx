import { useState, useEffect, type FormEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CreditCard, Flame, LogIn, ShieldCheck, Sparkles, UserRound, UserPlus } from "lucide-react";
import AdminApp from "./admin/AdminApp";
import { fetchAgentRuntimeCapabilities } from "./agent-runtime-client";
import {
  CommercialClientError,
  fetchCommercialCredits,
  fetchCommercialMe,
  loginCommercialUser,
  logoutCommercialUser,
  redeemAccessCode,
  registerCommercialUser,
  type CommercialCreditAccountDto,
  type CommercialCredentialsDto,
  type CommercialUserDto,
  type RedeemAccessCodeInputDto,
} from "./commercial-client";
import { getSimulationCreditCost } from "./contracts/commercial";
import { getDeepModeUnavailableNotice } from "./components/deep-mode-copy";
import AccountPanel from "./components/AccountPanel";
import HomeView from "./components/HomeView";
import InputView from "./components/InputView";
import SimulationProgress from "./components/SimulationProgress";
import ReportView from "./components/ReportView";
import ShareCard from "./components/ShareCard";
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
  isRecoverableSimulationTaskError,
  resumeSimulationTaskUntilComplete,
  runSimulationTaskUntilComplete,
} from "./simulation-tasks";
import {
  AgentRuntimeCapabilities,
  Simulation,
  UserInput,
  SimulationType,
  SimulationProgressEvent,
} from "./types";
import { postValidationEvent } from "./validation-events";
import type { ClientValidationEvent } from "./validation-events";

type ViewState = "home" | "input" | "generating" | "report";

export const HISTORY_STORAGE_KEY = "money_simulator_history";
export const LAST_INPUT_DRAFT_STORAGE_KEY = "money_simulator_last_input_draft";

const MAX_HISTORY_ITEMS = 5;
const SIMULATION_TYPES: SimulationType[] = ["side_hustle", "dating", "life_choice"];

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

function getCommercialErrorMessage(error: unknown): string {
  if (error instanceof CommercialClientError) {
    return error.message;
  }
  return error instanceof Error ? error.message : "Commercial account request failed.";
}

export default function App() {
  const pathname = globalThis.location?.pathname ?? "/";
  const authMode =
    pathname.startsWith("/register") ? "register"
      : pathname.startsWith("/login") ? "login"
        : undefined;

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
  const [commercialUser, setCommercialUser] = useState<CommercialUserDto | undefined>(undefined);
  const [commercialAccount, setCommercialAccount] = useState<CommercialCreditAccountDto | undefined>(undefined);
  const [commercialAvailable, setCommercialAvailable] = useState(
    () => typeof globalThis.window === "undefined",
  );
  const [commercialBusy, setCommercialBusy] = useState(false);
  const [commercialStatus, setCommercialStatus] = useState("");
  const [commercialError, setCommercialError] = useState("");
  const [recoverableSimulationId, setRecoverableSimulationId] = useState<string | undefined>(undefined);
  const [activeSimulationRequest, setActiveSimulationRequest] = useState<{
    userInput: UserInput;
    deepModeRequested: boolean;
    startedAt: number;
  } | undefined>(undefined);
  const [language, setLanguage] = useState<Language>(() => {
    try {
      return getInitialLanguageFromStorage(globalThis.localStorage);
    } catch {
      return DEFAULT_LANGUAGE;
    }
  });

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (stored) {
        setHistoryList(JSON.parse(stored));
      }
      setLastInputDraft(parseStoredUserInput(localStorage.getItem(LAST_INPUT_DRAFT_STORAGE_KEY)));
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

  const refreshCommercialAccount = async () => {
    const me = await fetchCommercialMe();
    const credits = await fetchCommercialCredits();
    setCommercialAvailable(true);
    setCommercialUser(me.user);
    setCommercialAccount(credits.account);
  };

  useEffect(() => {
    let cancelled = false;
    void fetchCommercialMe()
      .then(async (me) => {
        if (cancelled) return;
        setCommercialAvailable(true);
        setCommercialUser(me.user);
        const credits = await fetchCommercialCredits();
        if (cancelled) return;
        setCommercialAccount(credits.account);
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof CommercialClientError && error.status === 404) {
          setCommercialAvailable(false);
          return;
        }
        if (error instanceof CommercialClientError && error.status === 401) {
          setCommercialAvailable(true);
          setCommercialUser(undefined);
          setCommercialAccount(undefined);
          return;
        }
        setCommercialAvailable(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
    setProgressEvent(null);
    setRecoverableSimulationId(undefined);
    setIsGenerating(true);
    setView("generating");
    scrollToTopForViewChange();
    const startedAt = Date.now();
    const deepModeRequested = deepAgentMode;
    const interactionMode = deepModeRequested ? "enabled" : "legacy";
    const requiredCredits = getSimulationCreditCost({
      interactionMode,
      providerMode: "platform",
    });
    if (commercialAvailable && commercialUser === undefined) {
      setErrorMsg("请先登录商业账号或注册后再启动付费推演。");
      setIsGenerating(false);
      setView("input");
      scrollToTopForViewChange();
      return;
    }
    if (commercialAvailable && (commercialAccount?.balance ?? 0) < requiredCredits) {
      setErrorMsg("当前可用额度不足。请先兑换访问码或联系运营充值后再启动推演。");
      setIsGenerating(false);
      setView("input");
      scrollToTopForViewChange();
      return;
    }
    setActiveSimulationRequest({
      userInput,
      deepModeRequested,
      startedAt,
    });
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

    try {
      const data = await runSimulationTaskUntilComplete(
        {
          ...buildSimulationRequestBody(userInput, { deepAgentMode: deepModeRequested }),
          providerMode: "platform" as const,
          idempotencyKey: buildCommercialTaskIdempotencyKey(startedAt),
        },
        {
          onProgress: setProgressEvent,
        },
      );
      if (commercialUser) {
        void fetchCommercialCredits()
          .then(({ account }) => setCommercialAccount(account))
          .catch(() => undefined);
      }
      handleSimulationCompleted(data, userInput, {
        startedAt,
        deepModeRequested,
      });
    } catch (err: any) {
      handleSimulationFailed(err, userInput, {
        startedAt,
        deepModeRequested,
      });
    }
  };

  const handleResumeSimulation = async () => {
    if (!recoverableSimulationId || !activeSimulationRequest) {
      setView("input");
      setErrorMsg("");
      setProgressEvent(null);
      return;
    }

    setErrorMsg("");
    setIsGenerating(true);
    setView("generating");
    scrollToTopForViewChange();
    const resumedAt = Date.now();

    try {
      const data = await resumeSimulationTaskUntilComplete(recoverableSimulationId, {
        onProgress: setProgressEvent,
      });
      handleSimulationCompleted(data, activeSimulationRequest.userInput, {
        startedAt: activeSimulationRequest.startedAt,
        deepModeRequested: activeSimulationRequest.deepModeRequested,
      });
    } catch (err: any) {
      handleSimulationFailed(err, activeSimulationRequest.userInput, {
        startedAt: resumedAt,
        deepModeRequested: activeSimulationRequest.deepModeRequested,
      });
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
    setView("report");
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
    } else {
      setRecoverableSimulationId(undefined);
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
  };

  const handleSelectHistory = (simulation: Simulation) => {
    setCurrentSimulation(simulation);
    setView("report");
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
      setView("home");
      scrollToTopForViewChange();
    }
  };

  const handleLoadTemplate = (input: UserInput) => {
    setSelectedType(input.type);
    setTemplateIdea("");
    setTemplateInput(input);
    setView("input");
    scrollToTopForViewChange();
  };

  const handleEditInput = (input: UserInput) => {
    setSelectedType(input.type);
    setTemplateIdea("");
    setTemplateInput(input);
    setShowShareCard(false);
    setView("input");
    scrollToTopForViewChange();
  };

  const handleSubmitSimulation = (input: UserInput) => {
    setSelectedType(input.type);
    setTemplateInput(input);
    void handleStartSimulation(input);
  };

  const handleCommercialLogin = async (input: CommercialCredentialsDto) => {
    setCommercialBusy(true);
    setCommercialError("");
    setCommercialStatus("Signing in...");
    try {
      await loginCommercialUser(input);
      await refreshCommercialAccount();
      setCommercialStatus("Signed in. Credits loaded.");
    } catch (error) {
      setCommercialError(getCommercialErrorMessage(error));
    } finally {
      setCommercialBusy(false);
    }
  };

  const handleCommercialRegister = async (input: CommercialCredentialsDto) => {
    setCommercialBusy(true);
    setCommercialError("");
    setCommercialStatus("Creating account...");
    try {
      await registerCommercialUser(input);
      await loginCommercialUser(input);
      await refreshCommercialAccount();
      setCommercialStatus("Account created. Credits loaded.");
    } catch (error) {
      setCommercialError(getCommercialErrorMessage(error));
    } finally {
      setCommercialBusy(false);
    }
  };

  const handleCommercialLogout = async () => {
    setCommercialBusy(true);
    setCommercialError("");
    try {
      await logoutCommercialUser();
      setCommercialUser(undefined);
      setCommercialAccount(undefined);
      setCommercialStatus("Signed out.");
    } catch (error) {
      setCommercialError(getCommercialErrorMessage(error));
    } finally {
      setCommercialBusy(false);
    }
  };

  const handleCommercialRedeem = async (input: RedeemAccessCodeInputDto) => {
    setCommercialBusy(true);
    setCommercialError("");
    setCommercialStatus("Redeeming access code...");
    try {
      const result = await redeemAccessCode(input);
      setCommercialAccount(result.account);
      setCommercialStatus(`Redeemed ${result.redemption.credits} credits.`);
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
    setTemplateIdea("");
    setTemplateInput(undefined);
    setView("home");
    scrollToTopForViewChange();
  };

  const requiredCredits = getSimulationCreditCost({
    interactionMode: deepAgentMode ? "enabled" : "legacy",
    providerMode: "platform",
  });
  const commercialMode = commercialAvailable;

  return (
    <div id="app-root-container" className="min-h-screen flex flex-col bg-[#050711] text-[#f8fafc]">
      {/* Header */}
      <header id="app-global-header" className="sticky top-0 z-40 border-b border-white/10 bg-[#050711]/92 px-6 py-4 text-white backdrop-blur-md">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <a
            id="brand-logo-container"
            className="flex items-center gap-2.5 cursor-pointer"
            href="/"
            onClick={authMode ? undefined : handleRestart}
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
                href="/login"
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-cyan-200/20 bg-cyan-200/10 px-3 text-xs font-black text-cyan-100 transition-colors hover:border-cyan-200/40 hover:bg-cyan-200/15"
              >
                <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                <span>账号</span>
              </a>
            ) : (
              <>
                <a
                  id="link-commercial-login"
                  href="/login"
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-cyan-200/20 bg-cyan-200/10 px-3 text-xs font-black text-cyan-100 transition-colors hover:border-cyan-200/40 hover:bg-cyan-200/15"
                >
                  <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>登录</span>
                </a>
                <a
                  id="link-commercial-register"
                  href="/register"
                  className="hidden h-9 items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-white/7 px-3 text-xs font-black text-white/72 transition-colors hover:border-amber-200/40 hover:bg-amber-200/10 hover:text-amber-100 sm:inline-flex"
                >
                  <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>注册</span>
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
        {authMode && (
          <CommercialAuthPage
            mode={authMode}
            user={commercialUser}
            account={commercialAccount}
            busy={commercialBusy}
            statusMessage={commercialStatus}
            errorMessage={commercialError}
            onLogin={handleCommercialLogin}
            onRegister={handleCommercialRegister}
            onLogout={handleCommercialLogout}
            onRedeem={handleCommercialRedeem}
          />
        )}
        {!authMode && <AnimatePresence mode="wait">
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
                  setSelectedType(type);
                  setTemplateIdea("");
                  setTemplateInput(undefined);
                  setView("input");
                  scrollToTopForViewChange();
                }}
                onSelectHistory={handleSelectHistory}
                historyList={historyList}
                onSelectTemplate={handleLoadTemplate}
                lastInputDraft={lastInputDraft}
                onContinueDraft={handleEditInput}
                onDeleteHistory={handleDeleteHistory}
                language={language}
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
                progressEvent={progressEvent}
                onRetry={() => {
                  if (recoverableSimulationId) {
                    void handleResumeSimulation();
                  } else {
                    setView("input");
                    setErrorMsg("");
                    setProgressEvent(null);
                  }
                }}
                onCancel={() => {
                  setView("input");
                  setErrorMsg("");
                  setProgressEvent(null);
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
  user,
  account,
  busy,
  statusMessage,
  errorMessage,
  onLogin,
  onRegister,
  onLogout,
  onRedeem,
}: {
  mode: "login" | "register";
  user?: CommercialUserDto;
  account?: CommercialCreditAccountDto;
  busy: boolean;
  statusMessage: string;
  errorMessage: string;
  onLogin: (input: CommercialCredentialsDto) => Promise<void> | void;
  onRegister: (input: CommercialCredentialsDto) => Promise<void> | void;
  onLogout: () => Promise<void> | void;
  onRedeem: (input: RedeemAccessCodeInputDto) => Promise<void> | void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const isRegister = mode === "register";

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
            busy={busy}
            statusMessage={statusMessage}
            errorMessage={errorMessage}
            onLogout={onLogout}
            onRedeem={onRedeem}
          />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <UserRound className="h-4 w-4 text-cyan-200" aria-hidden="true" />
              <h1 className="text-sm font-black text-white">Commercial account</h1>
            </div>
            <form onSubmit={(event) => void handleSubmit(event)} className="mt-4 grid gap-3">
              <label className="block">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-white/42">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="min-h-10 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm font-semibold text-white outline-none placeholder:text-white/30 focus:border-cyan-200/40 focus:ring-2 focus:ring-cyan-200/10"
                  placeholder="buyer@example.com"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-white/42">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="min-h-10 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm font-semibold text-white outline-none placeholder:text-white/30 focus:border-cyan-200/40 focus:ring-2 focus:ring-cyan-200/10"
                  placeholder="commercial-secret"
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
                {isRegister ? "Create account" : "Sign in"}
              </button>
            </form>

            <div className="mt-4 flex items-center justify-between gap-3 text-xs font-bold text-white/58">
              <a href="/" className="text-white/58 transition-colors hover:text-white">返回首页</a>
              <a href={isRegister ? "/login" : "/register"} className="text-cyan-100 transition-colors hover:text-cyan-50">
                {isRegister ? "已有账号登录" : "注册新账号"}
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
