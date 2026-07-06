import { Activity, Radio, Sparkles, TerminalSquare, Zap } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import React from "react";

import AgentLifeformNetwork from "./AgentLifeformNetwork";
import { getAgentSandboxScenario, getLiveSandboxPhase } from "./agent-sandbox-model";
import type { SimulationProgressEvent, SimulationType } from "../types";
import { DEFAULT_LANGUAGE, Language } from "../language";

interface AgentSandboxLiveProps {
  simulationType: SimulationType;
  progressEvent?: SimulationProgressEvent | null;
  language?: Language;
}

const ACCENT_STYLES = {
  amber: {
    text: "text-amber-200",
    strongText: "text-amber-300",
    border: "border-amber-300/36",
    strongBorder: "border-amber-300/75",
    panel: "bg-amber-300/10",
    softPanel: "bg-amber-200/10",
    activeBg: "bg-amber-300",
    line: "stroke-amber-300/55",
    progress: "bg-gradient-to-r from-amber-200 via-orange-300 to-pink-300",
    glow: "shadow-[0_0_34px_rgba(251,191,36,0.32)]",
  },
  rose: {
    text: "text-rose-200",
    strongText: "text-rose-300",
    border: "border-rose-300/36",
    strongBorder: "border-rose-300/75",
    panel: "bg-rose-300/10",
    softPanel: "bg-rose-200/10",
    activeBg: "bg-rose-300",
    line: "stroke-rose-300/55",
    progress: "bg-gradient-to-r from-rose-200 via-fuchsia-300 to-indigo-300",
    glow: "shadow-[0_0_34px_rgba(251,113,133,0.32)]",
  },
  indigo: {
    text: "text-indigo-100",
    strongText: "text-cyan-200",
    border: "border-indigo-300/36",
    strongBorder: "border-cyan-300/75",
    panel: "bg-indigo-300/10",
    softPanel: "bg-cyan-200/10",
    activeBg: "bg-cyan-300",
    line: "stroke-cyan-300/50",
    progress: "bg-gradient-to-r from-indigo-300 via-cyan-300 to-violet-300",
    glow: "shadow-[0_0_34px_rgba(103,232,249,0.28)]",
  },
} as const;

const PHASE_CHIPS = [
  "智能体入场",
  "世界初始化",
  "事件生成",
  "Agent 交锋",
  "裁判仲裁",
  "报告合成",
];

const EN_PHASE_CHIPS = [
  "Agents Arriving",
  "World Setup",
  "Event Generation",
  "Agent Challenge",
  "Arbiter Review",
  "Report Synthesis",
];

function clampPercent(percent: number): number {
  return Math.max(0, Math.min(100, Math.round(percent)));
}

export default function AgentSandboxLive({
  simulationType,
  progressEvent = null,
  language = DEFAULT_LANGUAGE,
}: AgentSandboxLiveProps) {
  const scenario = getAgentSandboxScenario(simulationType, language);
  const accent = ACCENT_STYLES[scenario.accentName];
  const shouldReduceMotion = useReducedMotion();
  const isEnglish = language === "en-US";
  const percent = clampPercent(progressEvent?.percent ?? 0);
  const phase = getLiveSandboxPhase({
    scenario,
    step: progressEvent?.step,
    percent,
    stageIndex: progressEvent?.stageIndex,
    language,
  });
  const activeStage = scenario.stages[phase.activeStageIndex] ?? scenario.stages[0];
  const message = progressEvent?.message?.trim() || (isEnglish ? "Opening sandbox connection" : "建立沙盘连接");
  const activeChipLabel = phase.label === "智能体交互"
    ? "Agent 交锋"
    : phase.label === "Agent Interaction"
    ? "Agent Challenge"
    : phase.label;
  const phaseChips = isEnglish ? EN_PHASE_CHIPS : PHASE_CHIPS;

  return (
    <section
      id="agent-starmap-live"
      aria-label={isEnglish ? "Live AI starmap sandbox" : "实时 AI 星图沙盘"}
      className="mx-auto w-full max-w-6xl overflow-hidden px-4 py-6 text-left text-white"
    >
      <div id="simulation-command-center" className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#050711] p-4 shadow-2xl shadow-black/35 sm:p-5">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(251,191,36,0.10),transparent_26%,rgba(103,232,249,0.09)_54%,transparent_75%,rgba(244,114,182,0.07))]" />
          <div
            id="live-scan-plane"
            className="absolute inset-0 bg-[linear-gradient(100deg,transparent_0%,rgba(255,255,255,0.08)_42%,rgba(103,232,249,0.14)_49%,rgba(244,114,182,0.09)_53%,transparent_66%)] opacity-55"
          />
          <div
            id="signal-cascade"
            className="absolute inset-0 bg-[repeating-linear-gradient(115deg,transparent_0_22px,rgba(255,255,255,0.035)_23px,transparent_25px)] opacity-45"
          />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/40 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-200/25 to-transparent" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:42px_42px] opacity-30" />
        </div>

        <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-3">
              <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${accent.strongBorder} ${accent.panel} ${accent.glow}`}>
                <Radio className={`h-5 w-5 ${accent.strongText}`} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-black text-white">
                  {isEnglish ? "Live AI Starmap Sandbox" : "实时 AI 星图沙盘"}
                </h2>
                <p className="truncate text-xs font-semibold text-white/50">
                  {scenario.title} · {phase.label} · {isEnglish ? "simulation engine online" : "推演引擎在线"}
                </p>
              </div>
            </div>
            <p className="max-w-2xl text-sm font-semibold leading-6 text-white/74">{message}</p>
          </div>

          <div className={`w-full rounded-2xl border ${accent.strongBorder} bg-white/[0.07] p-3 backdrop-blur-xl lg:w-80`}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-black text-white/65">
                <Activity className={`h-3.5 w-3.5 ${accent.strongText}`} aria-hidden="true" />
                Signal Progress
              </span>
              <span className={`text-xl font-black ${accent.strongText}`}>{percent}%</span>
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
                aria-label={isEnglish ? "Live Agent sandbox progress" : "实时 Agent 沙盘进度"}
              className="h-2.5 overflow-hidden rounded-full bg-white/12"
            >
              <motion.div
                className={`h-full rounded-full ${accent.progress}`}
                initial={{ width: 0 }}
                animate={{ width: `${percent}%` }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.45, ease: "easeOut" }}
              />
            </div>
            <p className="mt-2 truncate text-xs font-bold text-white/58">{activeStage.label} · {activeStage.title}</p>
          </div>
        </div>

        <div className="relative z-10 mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.72fr)]">
          <AgentLifeformNetwork
            scenario={scenario}
            interactionMode={phase.interactionMode}
            activeAgentIds={phase.activeAgentIds}
            activeStageLabel={activeStage.label}
            activeStageTitle={activeStage.title}
            progressPercent={percent}
            variant="live"
            language={language}
          />

          <aside className="min-w-0 space-y-4">
            <div className="rounded-3xl border border-white/10 bg-white/[0.055] p-4 shadow-xl shadow-black/20 backdrop-blur-xl">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className={`h-4 w-4 ${accent.strongText}`} aria-hidden="true" />
                <span className="text-xs font-black uppercase tracking-[0.18em] text-white/55">Live Phases</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {phaseChips.map((chip) => {
                  const isActive = chip === activeChipLabel;

                  return (
                    <span
                      key={chip}
                      className={`inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-black ${
                        isActive ? `${accent.strongBorder} ${accent.panel} ${accent.text}` : "border-white/12 bg-white/6 text-white/48"
                      }`}
                    >
                      {chip}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.055] p-4 shadow-xl shadow-black/20 backdrop-blur-xl">
              <div className="mb-3 flex items-center gap-2">
                <Zap className={`h-4 w-4 ${accent.strongText}`} aria-hidden="true" />
                <span className="text-xs font-black uppercase tracking-[0.18em] text-white/55">Stage Rail</span>
              </div>
              <div className="space-y-2">
                {scenario.stages.map((stage, index) => {
                  const isActive = index === phase.activeStageIndex;

                  return (
                    <div
                      key={stage.id}
                      className={`rounded-2xl border p-3 ${
                        isActive ? `${accent.strongBorder} ${accent.panel}` : "border-white/10 bg-white/[0.045]"
                      }`}
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${isActive ? accent.activeBg : "bg-white/24"}`} />
                        <span className="text-[11px] font-black text-white/68">{stage.label}</span>
                      </div>
                      <p className="text-xs font-black text-white">{stage.title}</p>
                      <p className="mt-1 text-[11px] leading-snug text-white/48">{stage.focus}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.055] p-4 shadow-xl shadow-black/20 backdrop-blur-xl">
              <div className="mb-3 flex items-center gap-2">
                <TerminalSquare className={`h-4 w-4 ${accent.strongText}`} aria-hidden="true" />
                <span className="text-xs font-black uppercase tracking-[0.18em] text-white/55">Event Stream</span>
              </div>
              <div
                aria-live="polite"
                aria-atomic="true"
                className="space-y-2 text-xs font-semibold leading-5 text-white/62"
              >
                <p>{isEnglish ? "Connection:" : "连接状态："}{progressEvent ? (isEnglish ? " receiving backend events" : "接收后端事件") : (isEnglish ? " opening sandbox connection" : "建立沙盘连接")}</p>
                <p>{isEnglish ? "Current stage:" : "当前阶段："}{activeStage.label}{isEnglish ? ", " : "，"}{activeStage.title}</p>
                <p>{isEnglish ? "Event summary:" : "事件摘要："}{message}</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
