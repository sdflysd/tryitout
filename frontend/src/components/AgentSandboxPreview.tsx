import { Network, Radar, Sparkles, Waves } from "lucide-react";
import React from "react";

import AgentLifeformNetwork from "./AgentLifeformNetwork";
import { getAgentSandboxScenario } from "./agent-sandbox-model";
import type { SimulationType } from "../types";

interface AgentSandboxPreviewProps {
  simulationType: SimulationType;
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

export default function AgentSandboxPreview({ simulationType }: AgentSandboxPreviewProps) {
  const scenario = getAgentSandboxScenario(simulationType);
  const accent = ACCENT_STYLES[scenario.accentName];

  return (
    <section
      id="agent-starmap-preview"
      aria-label="AI 多智能体沙盘预演"
      className="relative mx-auto w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/12 bg-[#050711] px-4 py-5 text-left text-white shadow-2xl shadow-black/30 sm:px-5"
    >
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className={`absolute inset-0 bg-gradient-to-br ${accent.gradient} opacity-[0.08]`} />
        <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.10),transparent_18%,rgba(125,211,252,0.10)_42%,transparent_62%,rgba(244,114,182,0.08)_86%,transparent)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:38px_38px] opacity-35" />
      </div>

      <div className="relative z-10 mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border ${accent.strongBorder} ${accent.panel} ${accent.glow}`}>
            <Sparkles className={`h-5 w-5 ${accent.brightText}`} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-black tracking-tight text-white">AI 星图沙盘</h2>
            <p className={`text-xs font-semibold ${accent.mutedText}`}>{scenario.title} · 7 个智能体正在围绕你的选择建立世界线</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            id="viral-signature"
            className={`inline-flex min-h-10 items-center gap-2 rounded-full border ${accent.border} bg-white/8 px-3 text-xs font-black ${accent.text} backdrop-blur-md`}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span>未来后果可视化</span>
          </div>
          <div className={`inline-flex min-h-10 items-center gap-2 rounded-full border ${accent.border} bg-white/8 px-3 text-xs font-black ${accent.text} backdrop-blur-md`}>
            <Network className="h-3.5 w-3.5" aria-hidden="true" />
            <span>7 个智能体 · 5 个阶段 · 信号汇聚</span>
          </div>
        </div>
      </div>

      <div className="relative z-10 grid gap-4">
        <AgentLifeformNetwork
          scenario={scenario}
          interactionMode="support"
          activeAgentIds={["primary", "support", "risk"]}
          activeStageLabel="30 天预演"
          activeStageTitle={scenario.centerLabel}
          progressPercent={32}
          variant="preview"
        />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4 shadow-xl shadow-black/20 backdrop-blur-xl">
            <div className="mb-3 flex items-center gap-2">
              <Radar className={`h-4 w-4 ${accent.brightText}`} aria-hidden="true" />
              <span className="text-xs font-black uppercase tracking-[0.18em] text-white/55">Stage Rail</span>
            </div>
            <div className="space-y-2.5">
              {scenario.stages.map((stage, index) => (
                <div key={stage.id} className="grid grid-cols-[5.25rem_minmax(0,1fr)] items-start gap-3">
                  <div className="flex items-center gap-2 pt-0.5">
                    <span className={`h-2 w-2 rounded-full ${index === 2 ? accent.dot : "bg-white/24"}`} />
                    <span className="text-[11px] font-black text-white/70">{stage.label}</span>
                  </div>
                  <div>
                    <p className="text-xs font-black text-white">{stage.title}</p>
                    <p className="text-[11px] leading-snug text-white/50">{stage.focus}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4 shadow-xl shadow-black/20 backdrop-blur-xl">
            <div className="mb-3 flex items-center gap-2">
              <Waves className={`h-4 w-4 ${accent.brightText}`} aria-hidden="true" />
              <span className="text-xs font-black uppercase tracking-[0.18em] text-white/55">Signal Rail</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {scenario.metrics.map((metric) => (
                <div key={metric.id} className={`rounded-2xl border ${accent.border} ${accent.panel} px-3 py-2.5`}>
                  <span className="block text-xs font-black text-white">{metric.label}</span>
                  <span className={`text-[10px] font-bold uppercase ${accent.text}`}>{metric.id}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
