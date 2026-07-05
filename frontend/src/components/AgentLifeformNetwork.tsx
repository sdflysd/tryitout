import { Bot, CircleDot, Radio, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import React from "react";

import type {
  SandboxAgent,
  SandboxInteractionMode,
  SandboxScenario,
} from "./agent-sandbox-model";

interface AgentLifeformNetworkProps {
  scenario: SandboxScenario;
  interactionMode: SandboxInteractionMode;
  activeAgentIds?: string[];
  activeStageLabel?: string;
  activeStageTitle?: string;
  progressPercent?: number;
  variant?: "preview" | "live";
}

type NodePosition = {
  x: number;
  y: number;
  className: string;
};

const NODE_POSITIONS: NodePosition[] = [
  { x: 50, y: 9, className: "left-1/2 top-3 -translate-x-1/2" },
  { x: 82, y: 22, className: "right-6 top-[3.75rem]" },
  { x: 86, y: 55, className: "right-3 top-[55%] -translate-y-1/2" },
  { x: 72, y: 84, className: "right-14 bottom-6" },
  { x: 50, y: 90, className: "left-1/2 bottom-3 -translate-x-1/2" },
  { x: 28, y: 84, className: "left-14 bottom-6" },
  { x: 18, y: 22, className: "left-6 top-[3.75rem]" },
];

const ALIAS_TO_INDEX = {
  primary: 0,
  challenger: 1,
  support: 3,
  risk: 5,
  arbiter: 6,
} as const;

const MODE_COPY: Record<SandboxInteractionMode, string> = {
  observe: "观测生命体",
  support: "协作信号",
  challenge: "质疑交锋",
  arbitrate: "仲裁校准",
  synthesize: "信号汇聚",
};

const MODE_TONE: Record<SandboxInteractionMode, string> = {
  observe: "border-white/15 bg-white/7 text-white/58",
  support: "border-emerald-300/35 bg-emerald-300/10 text-emerald-100",
  challenge: "border-rose-300/45 bg-rose-300/12 text-rose-100",
  arbitrate: "border-amber-300/45 bg-amber-300/12 text-amber-100",
  synthesize: "border-cyan-300/45 bg-cyan-300/12 text-cyan-100",
};

const MODE_GLOW_STROKE: Record<SandboxInteractionMode, string> = {
  observe: "rgba(255,255,255,0.42)",
  support: "rgba(110,231,183,0.95)",
  challenge: "rgba(251,113,133,0.98)",
  arbitrate: "rgba(251,191,36,0.98)",
  synthesize: "rgba(103,232,249,0.98)",
};

const MODE_PACKET_FILL: Record<SandboxInteractionMode, string> = {
  observe: "#ffffff",
  support: "#a7f3d0",
  challenge: "#fecdd3",
  arbitrate: "#fde68a",
  synthesize: "#a5f3fc",
};

const ACCENT_STYLES = {
  amber: {
    text: "text-amber-100",
    strongText: "text-amber-200",
    border: "border-amber-300/42",
    strongBorder: "border-amber-300/80",
    panel: "bg-amber-300/10",
    dot: "bg-amber-200",
    line: "stroke-amber-200/60",
    glow: "shadow-[0_0_42px_rgba(251,191,36,0.34)]",
    radial: "from-amber-200 via-orange-300 to-fuchsia-300",
  },
  rose: {
    text: "text-rose-100",
    strongText: "text-rose-200",
    border: "border-rose-300/42",
    strongBorder: "border-rose-300/80",
    panel: "bg-rose-300/10",
    dot: "bg-rose-200",
    line: "stroke-rose-200/60",
    glow: "shadow-[0_0_42px_rgba(251,113,133,0.34)]",
    radial: "from-rose-200 via-fuchsia-300 to-indigo-300",
  },
  indigo: {
    text: "text-indigo-100",
    strongText: "text-cyan-200",
    border: "border-cyan-300/38",
    strongBorder: "border-cyan-300/78",
    panel: "bg-cyan-300/10",
    dot: "bg-cyan-200",
    line: "stroke-cyan-200/58",
    glow: "shadow-[0_0_42px_rgba(103,232,249,0.30)]",
    radial: "from-indigo-200 via-cyan-200 to-violet-300",
  },
} as const;

function clampPercent(percent: number | undefined): number {
  if (percent === undefined) return 0;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

function resolveActiveAgentIds(agents: SandboxAgent[], activeAgentIds: string[]): Set<string> {
  const resolved = new Set<string>();

  for (const id of activeAgentIds) {
    const aliasIndex = ALIAS_TO_INDEX[id as keyof typeof ALIAS_TO_INDEX];
    if (aliasIndex !== undefined) {
      const agent = agents[aliasIndex];
      if (agent) resolved.add(agent.id);
      continue;
    }

    if (agents.some((agent) => agent.id === id)) {
      resolved.add(id);
    }
  }

  return resolved;
}

function getAgentPosition(scenario: SandboxScenario, agentId: string): NodePosition {
  const index = Math.max(0, scenario.agents.findIndex((agent) => agent.id === agentId));
  return NODE_POSITIONS[index] ?? NODE_POSITIONS[0];
}

function getLinkTone(mode: SandboxInteractionMode, activeMode: SandboxInteractionMode, accentLine: string): string {
  if (mode === activeMode) {
    return accentLine;
  }

  if (mode === "challenge") return "stroke-rose-200/20";
  if (mode === "arbitrate") return "stroke-amber-200/20";
  if (mode === "synthesize") return "stroke-cyan-200/20";
  if (mode === "support") return "stroke-emerald-200/18";
  return "stroke-white/12";
}

function getAgentLabel(scenario: SandboxScenario, agentId: string): string {
  return scenario.agents.find((agent) => agent.id === agentId)?.label ?? "Agent";
}

function isInteractionLinkActive(
  link: SandboxScenario["collaborationLinks"][number],
  activeIds: Set<string>,
  interactionMode: SandboxInteractionMode,
): boolean {
  if (link.mode !== interactionMode) return false;
  if (interactionMode === "observe") return false;

  return activeIds.has(link.sourceAgentId) || activeIds.has(link.targetAgentId);
}

function getNodeStateLabel(isActive: boolean, interactionMode: SandboxInteractionMode): string {
  if (!isActive) return "漂浮观测";
  if (interactionMode === "challenge") return "正在交锋";
  if (interactionMode === "arbitrate") return "正在仲裁";
  if (interactionMode === "synthesize") return "正在汇聚";
  return "正在协作";
}

export default function AgentLifeformNetwork({
  scenario,
  interactionMode,
  activeAgentIds = ["primary"],
  activeStageLabel = "世界线",
  activeStageTitle = scenario.centerLabel,
  progressPercent,
  variant = "preview",
}: AgentLifeformNetworkProps) {
  const accent = ACCENT_STYLES[scenario.accentName];
  const shouldReduceMotion = useReducedMotion();
  const activeIds = resolveActiveAgentIds(scenario.agents, activeAgentIds);
  const percent = clampPercent(progressPercent);
  const activeLinks = scenario.collaborationLinks.filter((link) =>
    isInteractionLinkActive(link, activeIds, interactionMode),
  );
  const activeLinkSummaries = activeLinks.map((link) => ({
    ...link,
    sourceLabel: getAgentLabel(scenario, link.sourceAgentId),
    targetLabel: getAgentLabel(scenario, link.targetAgentId),
  }));

  return (
    <div
      id="agent-lifeform-network"
      className={`interaction-mode-${interactionMode} relative min-w-0 overflow-hidden rounded-3xl border border-white/10 bg-[#060817]/86 p-4 shadow-2xl shadow-black/25`}
      data-interaction-mode={interactionMode}
      data-variant={variant}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className={`absolute inset-0 bg-gradient-to-br ${accent.radial} opacity-[0.075]`} />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_18%,rgba(255,255,255,0.16),transparent_2px),radial-gradient(circle_at_82%_28%,rgba(103,232,249,0.28),transparent_1px),radial-gradient(circle_at_42%_78%,rgba(244,114,182,0.22),transparent_1px),radial-gradient(circle_at_67%_64%,rgba(251,191,36,0.20),transparent_1px)] bg-[size:120px_120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:40px_40px] opacity-35" />
      </div>

      <div className="relative z-10 mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`inline-flex h-8 w-8 items-center justify-center rounded-2xl border ${accent.strongBorder} ${accent.panel} ${accent.glow}`}>
              <Sparkles className={`h-4 w-4 ${accent.strongText}`} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-black text-white">每个 Agent 都是一个生命体</p>
              <p className="truncate text-[10px] font-bold text-white/48">{activeStageLabel} · {activeStageTitle}</p>
            </div>
          </div>
        </div>
        <div className={`inline-flex min-h-8 items-center gap-2 rounded-full border px-3 text-[10px] font-black ${MODE_TONE[interactionMode]}`}>
          <Radio className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{MODE_COPY[interactionMode]}</span>
          {progressPercent !== undefined && <span>{percent}%</span>}
        </div>
      </div>

      {activeLinkSummaries.length > 0 && (
        <div
          id="agent-active-collaboration-panel"
          className="relative z-20 mb-3 flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-black/22 p-2"
          aria-label="当前 Agent 协作链路"
        >
          {activeLinkSummaries.map((link) => (
            <span
              key={link.id}
              className={`agent-action-callout inline-flex min-h-7 items-center rounded-full border px-2.5 text-[10px] font-black ${MODE_TONE[interactionMode]}`}
              data-link-id={link.id}
            >
              {link.sourceLabel} → {link.targetLabel}
              <span className="ml-1 text-white/72">{link.label}</span>
            </span>
          ))}
        </div>
      )}

      <div
        id="agent-lifeform-mobile-grid"
        data-legacy-id="agent-starmap-mobile-agents"
        className="relative z-10 grid grid-cols-2 gap-2 sm:hidden"
      >
        {scenario.agents.map((agent) => {
          const isActive = activeIds.has(agent.id);

          return (
            <div
              key={agent.id}
              className={`agent-lifeform-node min-w-0 rounded-2xl border bg-white/[0.07] p-3 ${
                isActive ? `${accent.strongBorder} ${accent.glow}` : "border-white/12"
              }`}
              data-agent-id={agent.id}
              data-active={isActive}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${isActive ? accent.dot : "bg-white/28"}`} />
                <span className={`rounded-full ${accent.panel} px-2 py-0.5 text-[10px] font-black ${accent.text}`}>{agent.stance}</span>
              </div>
              <p className="truncate text-xs font-black text-white">{agent.label}</p>
              <p className="truncate text-[10px] font-semibold text-white/48">{agent.role}</p>
              <p className="mt-2 text-[10px] font-bold text-white/40">{getNodeStateLabel(isActive, interactionMode)}</p>
            </div>
          );
        })}
      </div>

      <div id="agent-starmap-orbit" className="relative z-10 hidden min-h-[28rem] overflow-hidden sm:block">
        <div
          id="decision-horizon"
          className={`absolute bottom-5 left-1/2 h-24 w-[82%] -translate-x-1/2 border-t ${accent.border} bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.012)_42%,transparent)] opacity-80 [clip-path:polygon(13%_0,87%_0,100%_100%,0_100%)]`}
        >
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.052)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.052)_1px,transparent_1px)] bg-[size:32px_18px] opacity-45" />
          <div className="absolute left-1/2 top-2 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-white/42 to-transparent" />
        </div>
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <filter id={`active-agent-glow-${scenario.type}`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="0.85" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <circle cx="50" cy="50" r="28" fill="none" className="stroke-white/10" strokeWidth="0.4" strokeDasharray="1 2.4" />
          <circle cx="50" cy="50" r="42" fill="none" className="stroke-white/8" strokeWidth="0.32" />
          {scenario.collaborationLinks.map((link, index) => {
            const source = getAgentPosition(scenario, link.sourceAgentId);
            const target = getAgentPosition(scenario, link.targetAgentId);
            const isActiveLink = isInteractionLinkActive(link, activeIds, interactionMode);
            const dashOffset = shouldReduceMotion ? 0 : [14, 0, 14];
            const labelX = (source.x + target.x) / 2;
            const labelY = (source.y + target.y) / 2;

            return (
              <g
                key={link.id}
                className="agent-collaboration-link"
                data-link-mode={link.mode}
                data-link-id={link.id}
                data-active={isActiveLink}
              >
                {isActiveLink && (
                  <motion.line
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    className="agent-active-collaboration-rail agent-luminous-thread"
                    stroke={MODE_GLOW_STROKE[interactionMode]}
                    strokeWidth="1.18"
                    strokeLinecap="round"
                    opacity="0.24"
                    filter={`url(#active-agent-glow-${scenario.type})`}
                    animate={shouldReduceMotion ? undefined : { opacity: [0.16, 0.4, 0.16] }}
                    transition={shouldReduceMotion ? undefined : { duration: 1.55, delay: index * 0.08, repeat: Infinity, ease: "easeInOut" }}
                  />
                )}
                <motion.line
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  className={isActiveLink ? "agent-active-collaboration-rail agent-luminous-thread" : getLinkTone(link.mode, interactionMode, accent.line)}
                  stroke={isActiveLink ? MODE_GLOW_STROKE[interactionMode] : undefined}
                  strokeWidth={isActiveLink ? 0.52 : 0.26}
                  strokeLinecap="round"
                  strokeDasharray={isActiveLink ? "1.4 1.8" : "1 2.9"}
                  animate={shouldReduceMotion ? undefined : { strokeDashoffset: dashOffset }}
                  transition={shouldReduceMotion ? undefined : { duration: isActiveLink ? 1.25 : 4.2, delay: index * 0.08, repeat: Infinity, ease: "linear" }}
                />
                {isActiveLink && (
                  <>
                    <motion.circle
                      className="agent-signal-packet agent-bidirectional-signal"
                      r="0.8"
                      fill={MODE_PACKET_FILL[interactionMode]}
                      cx={source.x}
                      cy={source.y}
                      initial={{ cx: source.x, cy: source.y, opacity: 0.5 }}
                      animate={
                        shouldReduceMotion
                          ? undefined
                          : { cx: [source.x, target.x], cy: [source.y, target.y], opacity: [0.1, 1, 0.1] }
                      }
                      transition={shouldReduceMotion ? undefined : { duration: 1.65, delay: index * 0.14, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <motion.circle
                      className="agent-signal-packet agent-bidirectional-signal"
                      r="0.58"
                      fill="#ffffff"
                      cx={target.x}
                      cy={target.y}
                      initial={{ cx: target.x, cy: target.y, opacity: 0.28 }}
                      animate={
                        shouldReduceMotion
                          ? undefined
                          : { cx: [target.x, source.x], cy: [target.y, source.y], opacity: [0, 0.82, 0] }
                      }
                      transition={shouldReduceMotion ? undefined : { duration: 1.65, delay: 0.52 + index * 0.14, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <motion.circle
                      className="agent-signal-packet agent-bidirectional-signal"
                      r="0.34"
                      fill={MODE_GLOW_STROKE[interactionMode]}
                      cx={source.x}
                      cy={source.y}
                      initial={{ cx: source.x, cy: source.y, opacity: 0.22 }}
                      animate={
                        shouldReduceMotion
                          ? undefined
                          : { cx: [source.x, labelX, target.x], cy: [source.y, labelY, target.y], opacity: [0, 0.72, 0] }
                      }
                      transition={shouldReduceMotion ? undefined : { duration: 2.25, delay: 0.22 + index * 0.11, repeat: Infinity, ease: "easeInOut" }}
                    />
                  </>
                )}
                {isActiveLink && (
                  <g className="agent-action-callout" data-link-id={link.id}>
                    <rect
                      x={labelX - 7.8}
                      y={labelY - 3.6}
                      width="15.6"
                      height="7.2"
                      rx="2.4"
                      fill="rgba(5,7,17,0.82)"
                      stroke={MODE_GLOW_STROKE[interactionMode]}
                      strokeWidth="0.28"
                    />
                    <text
                      x={labelX}
                      y={labelY - 0.6}
                      className="fill-white"
                      fontSize="2.05"
                      fontWeight="900"
                      textAnchor="middle"
                    >
                      {getAgentLabel(scenario, link.sourceAgentId)} → {getAgentLabel(scenario, link.targetAgentId)}
                    </text>
                    <text
                      x={labelX}
                      y={labelY + 2.1}
                      fill={MODE_PACKET_FILL[interactionMode]}
                      fontSize="1.85"
                      fontWeight="900"
                      textAnchor="middle"
                    >
                      {link.label}
                    </text>
                  </g>
                )}
                <text
                  x={labelX}
                  y={labelY + (isActiveLink ? 5.8 : 0)}
                  className={isActiveLink ? "fill-white/76" : "fill-white/24"}
                  fontSize="2.3"
                  fontWeight="800"
                  textAnchor="middle"
                >
                  {link.label}
                </text>
              </g>
            );
          })}
        </svg>

        <motion.div
          id="agent-starmap-spectral-core"
          className={`absolute left-1/2 top-1/2 z-20 flex h-36 w-36 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border ${accent.strongBorder} bg-[#080b19]/94 p-4 text-center ${accent.glow}`}
          animate={shouldReduceMotion ? undefined : { scale: [1, 1.028, 1], opacity: [0.94, 1, 0.94] }}
          transition={shouldReduceMotion ? undefined : { duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className={`absolute inset-3 rounded-full bg-gradient-to-br ${accent.radial} opacity-15 blur-sm`} />
          <div className="absolute inset-0 rounded-full border border-white/12" />
          <CircleDot className={`relative mb-2 h-7 w-7 ${accent.strongText}`} aria-hidden="true" />
          <span className="relative text-sm font-black text-white">{activeStageTitle}</span>
          <span className={`relative mt-1 text-[10px] font-bold ${accent.text}`}>{activeStageLabel}</span>
          {progressPercent !== undefined && (
            <span className="relative mt-2 rounded-full border border-white/10 bg-white/8 px-2 py-0.5 text-[9px] font-black text-white/54">
              {percent}% SYNC
            </span>
          )}
        </motion.div>

        {scenario.agents.map((agent, index) => {
          const position = NODE_POSITIONS[index] ?? NODE_POSITIONS[0];
          const isActive = activeIds.has(agent.id);

          return (
            <motion.div
              key={agent.id}
              className={`agent-lifeform-node absolute z-30 flex w-28 flex-col rounded-[1.2rem] border bg-[#0b1022]/88 p-2 shadow-xl shadow-black/25 backdrop-blur-md lg:w-[7.5rem] ${
                isActive ? `${accent.strongBorder} ${accent.glow}` : "border-white/12"
              } ${position.className}`}
              data-agent-id={agent.id}
              data-active={isActive}
              animate={shouldReduceMotion ? undefined : { y: [0, index % 2 === 0 ? -5 : 5, 0] }}
              transition={shouldReduceMotion ? undefined : { duration: 4 + index * 0.13, delay: index * 0.12, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="pointer-events-none absolute -inset-2 rounded-[1.75rem] border border-white/5" />
              <div className={`pointer-events-none absolute -inset-1 rounded-[1.6rem] ${isActive ? `${accent.panel} blur-md` : "bg-white/[0.025]"}`} />
              <div className="relative mb-1.5 flex items-center justify-between gap-2">
                <span className="relative inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/12 bg-white/8">
                  <span className={`absolute h-2.5 w-2.5 rounded-full ${isActive ? accent.dot : "bg-white/35"}`} />
                  <Bot className={`h-3 w-3 ${isActive ? accent.strongText : "text-white/48"}`} aria-hidden="true" />
                </span>
                <span className={`rounded-full ${accent.panel} px-2 py-0.5 text-[9px] font-black ${accent.text}`}>
                  {agent.stance}
                </span>
              </div>
              <span className="relative truncate text-xs font-black text-white">{agent.label}</span>
              <span className="relative truncate text-[10px] font-semibold text-white/48">{agent.role}</span>
              <span className={`relative mt-1.5 text-[9px] font-black ${isActive ? accent.strongText : "text-white/34"}`}>
                {getNodeStateLabel(isActive, interactionMode)}
              </span>
            </motion.div>
          );
        })}
      </div>

      <div className="relative z-10 mt-3 flex flex-wrap gap-2 text-[10px] font-black text-white/42">
        <span className="rounded-full border border-white/10 bg-white/6 px-2.5 py-1">协作信号</span>
        <span className="rounded-full border border-rose-300/20 bg-rose-300/8 px-2.5 py-1 text-rose-100/68">质疑</span>
        <span className="rounded-full border border-amber-300/20 bg-amber-300/8 px-2.5 py-1 text-amber-100/68">仲裁</span>
        <span className="rounded-full border border-cyan-300/20 bg-cyan-300/8 px-2.5 py-1 text-cyan-100/68">汇聚</span>
      </div>
    </div>
  );
}
