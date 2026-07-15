import { Radar, Sparkles, Waves } from "lucide-react";
import React from "react";

import AgentSandboxOrb from "./AgentSandboxOrb";
import { getAgentSandboxScenario } from "./agent-sandbox-model";
import type { SimulationType } from "../types";
import { DEFAULT_LANGUAGE, Language } from "../language";

interface AgentSandboxPreviewProps {
  simulationType: SimulationType;
  language?: Language;
}

const ACCENT_STYLES = {
  amber: {
    text: "text-amber-200",
    brightText: "text-amber-300",
    mutedText: "text-amber-100/70",
    border: "border-amber-300/35",
    strongBorder: "border-amber-300/70",
    panel: "bg-amber-300/10",
    softPanel: "bg-amber-200/10",
    glow: "shadow-[0_0_38px_rgba(251,191,36,0.34)]",
    dot: "bg-amber-300",
    gradient: "from-amber-300 via-orange-400 to-pink-400",
  },
  rose: {
    text: "text-rose-200",
    brightText: "text-rose-300",
    mutedText: "text-rose-100/70",
    border: "border-rose-300/35",
    strongBorder: "border-rose-300/70",
    panel: "bg-rose-300/10",
    softPanel: "bg-rose-200/10",
    glow: "shadow-[0_0_38px_rgba(251,113,133,0.34)]",
    dot: "bg-rose-300",
    gradient: "from-rose-300 via-fuchsia-400 to-indigo-300",
  },
  indigo: {
    text: "text-indigo-200",
    brightText: "text-cyan-200",
    mutedText: "text-indigo-100/70",
    border: "border-indigo-300/35",
    strongBorder: "border-cyan-300/70",
    panel: "bg-indigo-300/10",
    softPanel: "bg-cyan-200/10",
    glow: "shadow-[0_0_38px_rgba(103,232,249,0.28)]",
    dot: "bg-cyan-300",
    gradient: "from-indigo-300 via-cyan-300 to-violet-300",
  },
} as const;

export default function AgentSandboxPreview({
  simulationType,
  language = DEFAULT_LANGUAGE,
}: AgentSandboxPreviewProps) {
  const scenario = React.useMemo(
    () => getAgentSandboxScenario(simulationType, language),
    [language, simulationType],
  );
  const accent = ACCENT_STYLES[scenario.accentName];
  const isEnglish = language === "en-US";
  const activeAgentIds = React.useMemo(
    () => [
      scenario.agents[0]?.id,
      scenario.agents[3]?.id,
      scenario.agents[5]?.id,
    ].filter((agentId): agentId is string => Boolean(agentId)),
    [scenario],
  );

  return (
    <section
      id="agent-starmap-preview-dashboard"
      aria-label={isEnglish ? "AI multi-agent sandbox preview" : "AI 多智能体沙盘预演"}
      className="relative mx-auto flex h-full min-h-[34rem] w-full max-w-5xl flex-col overflow-hidden rounded-[1.75rem] border border-white/12 bg-[#050711] px-4 py-5 text-left text-white shadow-2xl shadow-black/30 sm:px-5 lg:min-h-[39rem]"
    >
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className={`absolute inset-0 bg-gradient-to-br ${accent.gradient} opacity-[0.08]`} />
        <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.10),transparent_18%,rgba(125,211,252,0.10)_42%,transparent_62%,rgba(244,114,182,0.08)_86%,transparent)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:38px_38px] opacity-35" />
      </div>

      <div className="relative z-10 mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border ${accent.strongBorder} ${accent.panel} ${accent.glow}`}>
            <Sparkles className={`h-5 w-5 ${accent.brightText}`} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-black tracking-tight text-white">
              {isEnglish ? "AI Starmap Sandbox" : "AI 星图沙盘"}
            </h2>
            <p className={`text-xs font-semibold ${accent.mutedText}`}>
              {scenario.title} · {isEnglish ? "Multiple agents are collaborating on the simulation" : "多位智能体正在协作推演"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            id="viral-signature"
            className={`inline-flex min-h-10 items-center gap-2 rounded-full border ${accent.border} bg-white/8 px-3 text-xs font-black ${accent.text} backdrop-blur-md`}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{isEnglish ? "Future outcomes visualized" : "未来后果可视化"}</span>
          </div>
          <div className={`inline-flex min-h-10 items-center rounded-full border ${accent.border} bg-white/8 px-3 text-xs font-black ${accent.text} backdrop-blur-md`}>
            <span>{isEnglish ? "32% sync" : "32% 协作同步"}</span>
          </div>
        </div>
      </div>

      <div className="relative z-10 grid flex-1 gap-4">
        <AgentSandboxOrb
          scenario={scenario}
          interactionMode="support"
          activeAgentIds={activeAgentIds}
          activeStageLabel={isEnglish ? "30-day preview" : "30 天预演"}
          activeStageTitle={scenario.centerLabel}
          progressPercent={32}
          language={language}
          compact
        />

        <div className="grid gap-3 md:grid-cols-[minmax(0,1.18fr)_minmax(0,0.82fr)]">
          <div id="agent-preview-orb-stage-rail" className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 shadow-xl shadow-black/20 backdrop-blur-xl">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
              <Radar className={`h-4 w-4 ${accent.brightText}`} aria-hidden="true" />
                <span className="text-xs font-black uppercase tracking-[0.18em] text-white/55">Stage Rail</span>
              </div>
              <span className={`text-[10px] font-black ${accent.text}`}>
                {isEnglish ? "5 stages" : "5 阶段"}
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-5 md:grid-cols-1 lg:grid-cols-5">
              {scenario.stages.map((stage, index) => (
                <div
                  key={stage.id}
                  className={`rounded-xl border px-2.5 py-2 ${
                    index === 2
                      ? `${accent.border} ${accent.panel}`
                      : "border-white/10 bg-white/[0.045]"
                  }`}
                >
                  <span className="block text-[10px] font-black text-white/58">{stage.label}</span>
                  <span className="mt-1 block text-[11px] font-black leading-snug text-white">{stage.title}</span>
                </div>
              ))}
            </div>
          </div>

          <div id="agent-preview-signal-rail" className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 shadow-xl shadow-black/20 backdrop-blur-xl">
            <div className="mb-2 flex items-center gap-2">
              <Waves className={`h-4 w-4 ${accent.brightText}`} aria-hidden="true" />
              <span className="text-xs font-black uppercase tracking-[0.18em] text-white/55">Signal Rail</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {scenario.metrics.map((metric) => (
                <div key={metric.id} className={`rounded-xl border ${accent.border} ${accent.panel} px-3 py-2`}>
                  <span className="block text-[11px] font-black text-white">{metric.label}</span>
                  <span className={`text-[10px] font-bold uppercase ${accent.text}`}>{metric.id}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {scenario.agents.slice(0, 3).map((agent) => (
                <span key={agent.id} className="rounded-full border border-white/10 bg-white/6 px-2 py-1 text-[10px] font-black text-white/48">
                  {agent.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
