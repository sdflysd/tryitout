import { useState, useEffect, type FormEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Flame, KeyRound, LogIn, LogOut, ShieldCheck, Sparkles, UserPlus, WalletCards } from "lucide-react";
import { fetchAgentRuntimeCapabilities } from "./agent-runtime-client";
import { getDeepModeUnavailableNotice } from "./components/deep-mode-copy";
import HomeView from "./components/HomeView";
import InputView from "./components/InputView";
import SimulationProgress from "./components/SimulationProgress";
import ReportView from "./components/ReportView";
import ShareCard from "./components/ShareCard";
import AdminDashboard from "./components/admin/AdminDashboard";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  Language,
  getLanguageToggleLabel,
  getNextLanguage,
  parseStoredLanguage,
} from "./language";
import {
  getSimulationCreditCost,
} from "./contracts/commercial";
import {
  getCommercialCredits,
  getCommercialUser,
  loginCommercialUser,
  logoutCommercialUser,
  redeemCommercialAccessCode,
  registerCommercialUser,
  type CommercialUser,
} from "./commercial-client";
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

interface AppProps {
  commercialMode?: boolean;
  initialCommercialUser?: CommercialUser;
  initialCreditBalance?: number;
}

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

export default function App({
  commercialMode = isCommercialClientModeEnabled(),
  initialCommercialUser,
  initialCreditBalance = 0,
}: AppProps = {}) {
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
  const [recoverableSimulationId, setRecoverableSimulationId] = useState<string | undefined>(undefined);
  const [commercialUser, setCommercialUser] = useState<CommercialUser | undefined>(initialCommercialUser);
  const [creditBalance, setCreditBalance] = useState(initialCreditBalance);
  const [commercialEmail, setCommercialEmail] = useState("");
  const [commercialPassword, setCommercialPassword] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [commercialMessage, setCommercialMessage] = useState("");
  const [commercialAuthMode, setCommercialAuthMode] = useState<"login" | "register">("login");
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
    if (!commercialMode) return;

    let cancelled = false;
    void refreshCommercialAccount()
      .catch(() => undefined);

    async function refreshCommercialAccount() {
      const userResult = await getCommercialUser();
      if (cancelled) return;
      setCommercialUser(userResult.user);
      const credits = await getCommercialCredits();
      if (cancelled) return;
      setCreditBalance(credits.balance);
    }

    return () => {
      cancelled = true;
    };
  }, [commercialMode]);

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
        buildSimulationRequestBody(userInput, { deepAgentMode: deepModeRequested }),
        {
          onProgress: setProgressEvent,
        },
      );
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
    if (commercialMode && creditBalance < requiredCredits) {
      setErrorMsg("insufficient_credits");
      return;
    }
    setSelectedType(input.type);
    setTemplateInput(input);
    void handleStartSimulation(input);
  };

  const handleCommercialAuth = async (mode: "login" | "register") => {
    setCommercialMessage("");
    try {
      const result = mode === "login"
        ? await loginCommercialUser({
            email: commercialEmail,
            password: commercialPassword,
          })
        : await registerCommercialUser({
            email: commercialEmail,
            password: commercialPassword,
          });
      setCommercialUser(result.user);
      const credits = await getCommercialCredits();
      setCreditBalance(credits.balance);
      setCommercialPassword("");
      setCommercialMessage(mode === "login" ? "登录成功。" : "注册成功。");
    } catch (error) {
      setCommercialMessage(formatCommercialAuthMessage(error instanceof Error ? error.message : "auth_failed"));
    }
  };

  const handleRedeemAccessCode = async (event: FormEvent) => {
    event.preventDefault();
    setCommercialMessage("");
    try {
      const result = await redeemCommercialAccessCode(accessCode);
      setCreditBalance(result.balance);
      setAccessCode("");
      setCommercialMessage("兑换码已到账。");
    } catch (error) {
      setCommercialMessage(error instanceof Error ? error.message : "redeem_failed");
    }
  };

  const handleCommercialLogout = async () => {
    await logoutCommercialUser();
    setCommercialUser(undefined);
    setCreditBalance(0);
  };

  const requiredCredits = getSimulationCreditCost({
    interactionMode: deepAgentMode ? "enabled" : "legacy",
    providerMode: "platform",
  });

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

  return (
    <div id="app-root-container" className="min-h-screen flex flex-col bg-[#050711] text-[#f8fafc]">
      {/* Header */}
      <header id="app-global-header" className="sticky top-0 z-40 border-b border-white/10 bg-[#050711]/92 px-6 py-4 text-white backdrop-blur-md">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div 
            id="brand-logo-container"
            onClick={handleRestart}
            className="flex items-center gap-2.5 cursor-pointer"
          >
            <div className="w-9 h-9 bg-white/8 border border-white/10 rounded-xl flex items-center justify-center text-white shadow-md">
              <Flame className="w-5 h-5 fill-amber-400 text-amber-400 animate-pulse" />
            </div>
            <div>
              <span className="block font-black text-sm tracking-tight text-white leading-none">tryitout</span>
              <span className="block text-[9px] font-bold text-amber-600 tracking-wider uppercase mt-1">试一下</span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-semibold text-white/60">
            <span className="hidden md:inline-flex items-center gap-1 bg-white/6 border border-white/10 text-white/58 px-2.5 py-1 rounded-md text-3xs font-mono">
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>Multi-Agent Sandbox</span>
            </span>
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

      {commercialMode && !commercialUser && (
        <CommercialAuthScreen
          email={commercialEmail}
          password={commercialPassword}
          message={commercialMessage}
          mode={commercialAuthMode}
          onEmailChange={setCommercialEmail}
          onPasswordChange={setCommercialPassword}
          onModeChange={(mode) => {
            setCommercialAuthMode(mode);
            setCommercialMessage("");
          }}
          onSubmit={(mode) => void handleCommercialAuth(mode)}
        />
      )}

      {commercialMode && commercialUser && (
        <section
          id="commercial-account-bar"
          className="border-b border-white/10 bg-[#0a0f1f] px-4 py-3 text-white"
          aria-label="商用账号"
        >
          <div className="mx-auto grid max-w-6xl gap-3 md:grid-cols-[1fr_auto] md:items-center">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <div className="inline-flex items-center gap-2 text-xs font-black text-white/80">
                <WalletCards className="h-4 w-4 text-emerald-300" />
                <span>当前账号</span>
              </div>
              <span className="inline-flex w-fit items-center gap-1 rounded-md border border-emerald-300/30 bg-emerald-300/10 px-2 py-1 text-xs font-semibold text-emerald-100">
                积分余额：{creditBalance}
              </span>
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-white/66">
                <span>{commercialUser.email}</span>
                <button
                  type="button"
                  onClick={() => void handleCommercialLogout()}
                  className="inline-flex min-h-9 items-center gap-1 rounded-md border border-white/12 bg-white/7 px-2 text-white/70 transition-colors hover:bg-white/12"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>退出</span>
                </button>
              </div>
            </div>
            <form onSubmit={handleRedeemAccessCode} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="inline-flex items-center gap-2 text-xs font-black text-white/72" htmlFor="commercial-access-code">
                <KeyRound className="h-4 w-4 text-amber-300" />
                <span>兑换码</span>
              </label>
              <input
                id="commercial-access-code"
                value={accessCode}
                onChange={(event) => setAccessCode(event.target.value)}
                placeholder="TIO-XXXX-XXXX-XXXX"
                className="h-9 min-w-0 rounded-md border border-white/12 bg-white px-3 text-xs font-semibold text-slate-950 placeholder:text-slate-400"
              />
              <button
                type="submit"
                className="h-9 rounded-md bg-emerald-400 px-3 text-xs font-black text-emerald-950 transition-colors hover:bg-emerald-300"
              >
                兑换
              </button>
            </form>
            {commercialMessage && (
              <div className="text-xs font-semibold text-amber-100" aria-live="polite">
                {commercialMessage}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Main Container */}
      {(!commercialMode || commercialUser) && (
      <main id="app-main-content" className="flex-1 py-4 md:py-8">
        <AnimatePresence mode="wait">
          {view === "home" && (
            <motion.div
              key="home"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {commercialUser?.isAdmin ? (
                <AdminDashboard adminEmail={commercialUser.email} />
              ) : (
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
              )}
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
                creditBalance={creditBalance}
                requiredCredits={requiredCredits}
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
        </AnimatePresence>
      </main>
      )}

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

function CommercialAuthScreen({
  email,
  password,
  message,
  mode,
  onEmailChange,
  onPasswordChange,
  onModeChange,
  onSubmit,
}: {
  email: string;
  password: string;
  message: string;
  mode: "login" | "register";
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onModeChange: (mode: "login" | "register") => void;
  onSubmit: (mode: "login" | "register") => void;
}) {
  const isLogin = mode === "login";

  return (
    <main
      id="commercial-auth-screen"
      className="flex flex-1 items-center justify-center px-4 py-8 md:py-12"
      aria-label="TryItOut 商用版认证"
    >
      <section className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-amber-200/20 bg-white/8 text-amber-300">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <h1 className="mt-4 text-2xl font-black leading-tight text-white md:text-3xl">
            欢迎使用 TryItOut 商用版
          </h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-white/58">
            登录后进入积分沙盘、任务队列和管理员工作台。
          </p>
        </div>

        <form
          className="rounded-md border border-white/12 bg-[#111622] p-6 shadow-2xl shadow-black/24"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(mode);
          }}
        >
          <div className="grid grid-cols-2 rounded-md border border-white/10 bg-white/5 p-1" role="tablist" aria-label="认证方式">
            <button
              type="button"
              role="tab"
              aria-selected={isLogin}
              onClick={() => onModeChange("login")}
              className={`min-h-10 rounded-md text-sm font-black transition-colors ${
                isLogin ? "bg-white text-slate-950" : "text-white/68 hover:bg-white/8 hover:text-white"
              }`}
            >
              安全登录
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!isLogin}
              onClick={() => onModeChange("register")}
              className={`min-h-10 rounded-md text-sm font-black transition-colors ${
                !isLogin ? "bg-white text-slate-950" : "text-white/68 hover:bg-white/8 hover:text-white"
              }`}
            >
              创建账号
            </button>
          </div>

          <div className="mt-5">
            <h2 className="text-lg font-black text-white">{isLogin ? "账号登录" : "注册新账号"}</h2>
            <p className="mt-1 text-xs font-semibold leading-5 text-white/54">
              {isLogin ? "使用已开通的商用账号进入工作台。" : "创建账号后可通过兑换码激活积分。"}
            </p>
          </div>

          <label className="mt-5 block text-xs font-bold text-white/70" htmlFor="commercial-email">
            邮箱
          </label>
          <input
            id="commercial-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            placeholder="name@company.com"
            className="mt-1 h-11 w-full rounded-md border border-white/12 bg-white px-3 text-sm font-semibold text-slate-950 outline-none placeholder:text-slate-400 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/25"
          />
          <label className="mt-3 block text-xs font-bold text-white/70" htmlFor="commercial-password">
            密码
          </label>
          <input
            id="commercial-password"
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            placeholder={isLogin ? "输入账号密码" : "至少 8 位，建议包含字母和数字"}
            className="mt-1 h-11 w-full rounded-md border border-white/12 bg-white px-3 text-sm font-semibold text-slate-950 outline-none placeholder:text-slate-400 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/25"
          />
          <button
            type="submit"
            className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-amber-300 px-4 text-sm font-black text-slate-950 transition-colors hover:bg-amber-200"
          >
            {isLogin ? <LogIn className="h-4 w-4" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />}
            <span>{isLogin ? "进入工作台" : "创建并进入"}</span>
          </button>
          {message && (
            <div className="mt-4 rounded-md border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs font-bold leading-5 text-amber-100" aria-live="polite">
              {message}
            </div>
          )}

          <div className="mt-5 grid gap-2 border-t border-white/10 pt-4 text-xs font-semibold text-white/54 sm:grid-cols-2">
            <div>
              <div className="font-black text-white/78">账号安全</div>
              <div className="mt-1">会话 Cookie 仅服务端可读。</div>
            </div>
            <div>
              <div className="font-black text-white/78">服务状态</div>
              <div className="mt-1">积分、任务和审计记录实时同步。</div>
            </div>
          </div>
        </form>
      </section>
    </main>
  );
}

export function formatCommercialAuthMessage(message: string): string {
  const labels: Record<string, string> = {
    email_already_registered: "该邮箱已注册，请直接登录。",
    invalid_credentials: "邮箱或密码不正确，请检查后重试。",
    auth_failed: "认证失败，请稍后重试。",
    user_disabled: "该账号已被停用，请联系管理员。",
    password_too_short: "密码至少需要 8 位。",
    invalid_email: "请输入有效邮箱地址。",
  };
  return labels[message] ?? message;
}

function isCommercialClientModeEnabled(): boolean {
  const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const value = metaEnv?.VITE_COMMERCIAL_MODE_ENABLED?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}
