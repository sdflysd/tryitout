import {
  AlertTriangle,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Vote,
} from "lucide-react";
import React from "react";

import type {
  AgentActionType,
  AgentVerdict,
  SimulationType,
  SimulationStage,
  WorldStateDelta,
} from "../types";
import { formatWorldStateDelta } from "./simulation-variable-labels";

export function getAgentActionLabel(type: AgentActionType): string {
  switch (type) {
    case "like":
      return "点赞";
    case "dislike":
      return "点踩";
    case "reply":
      return "回复";
    case "challenge":
      return "质疑";
    case "support":
      return "支持";
    case "warn":
      return "警告";
    case "vote":
      return "投票";
    case "update_memory":
      return "更新记忆";
    default: {
      const exhaustive: never = type;
      return exhaustive;
    }
  }
}

function getAgentActionIcon(type: AgentActionType) {
  switch (type) {
    case "like":
    case "support":
      return ThumbsUp;
    case "dislike":
      return ThumbsDown;
    case "warn":
      return AlertTriangle;
    case "vote":
      return Vote;
    case "update_memory":
      return RefreshCw;
    case "reply":
    case "challenge":
    default:
      return MessageSquare;
  }
}

function getAgentActionTone(type: AgentActionType, impact: "positive" | "negative" | "neutral") {
  if (type === "warn" || impact === "negative") {
    return "bg-rose-50 text-rose-700 border-rose-100";
  }

  if (type === "like" || type === "support" || impact === "positive") {
    return "bg-emerald-50 text-emerald-700 border-emerald-100";
  }

  if (type === "challenge") {
    return "bg-amber-50 text-amber-700 border-amber-100";
  }

  return "bg-blue-50 text-blue-700 border-blue-100";
}

function getAgentVerdictLabel(verdict: AgentVerdict): string {
  switch (verdict) {
    case "continue":
      return "继续";
    case "pivot":
      return "转向";
    case "stop":
      return "停止";
    case "wait":
      return "等待";
    case "escalate":
      return "升级";
    default: {
      const exhaustive: never = verdict;
      return exhaustive;
    }
  }
}

export function formatVoteConfidence(confidence: number): string {
  return `CONF ${Math.round(confidence)}%`;
}

function formatStateDelta(delta: WorldStateDelta, simulationType: SimulationType): string {
  const entries = Object.entries(delta).filter(([, value]) => value !== undefined);

  if (entries.length === 0) {
    return "无状态票";
  }

  return formatWorldStateDelta(delta, simulationType, " · ");
}

function looksLikeInternalId(value: string): boolean {
  return /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/i.test(value);
}

function formatAgentReference(
  agentId: string,
  agentDisplayNameById: Map<string, string> | undefined,
): string {
  return agentDisplayNameById?.get(agentId) ?? (looksLikeInternalId(agentId) ? "某个推演角色" : agentId);
}

export default function AgentInteractionReplay({
  stage,
  simulationType = "side_hustle",
  agentDisplayNameById,
}: {
  stage: SimulationStage;
  simulationType?: SimulationType;
  agentDisplayNameById?: Map<string, string>;
}) {
  if (!stage.interactions) {
    return null;
  }

  const { interactions } = stage;

  return (
    <section aria-label="Agent 互动复盘" className="space-y-3 border-t border-gray-150 pt-4 text-left">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-blue-500 shrink-0" />
          <span className="text-2xs font-black text-gray-900 uppercase tracking-wider">
            Agent 互动复盘
          </span>
        </div>
        <span className="text-3xs font-mono text-gray-400">
          {interactions.activatedAgentIds.length} AGENTS · {interactions.actions.length} ACTIONS
        </span>
      </div>

      <div className="border-l-2 border-blue-200 pl-3 space-y-1">
        <span className="flex items-center gap-1.5 text-2xs font-bold text-blue-700">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>仲裁总结</span>
        </span>
        <p className="text-2xs md:text-xs text-gray-600 leading-relaxed">
          {interactions.arbiterSummary}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          <span className="block text-3xs font-bold text-gray-400 uppercase tracking-wider">
            行动链路
          </span>
          <div className="space-y-2">
            {interactions.actions.map((action) => {
              const Icon = getAgentActionIcon(action.type);

              return (
                <div
                  key={action.id}
                  className="bg-white p-3 rounded-xl border border-gray-150 shadow-2xs space-y-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-sm border ${getAgentActionTone(action.type, action.impact)}`}
                    >
                      <Icon className="w-3 h-3" />
                      <span>{getAgentActionLabel(action.type)}</span>
                    </span>
                    <span className="text-3xs font-mono text-gray-400 truncate">
                      {formatAgentReference(action.actorAgentId, agentDisplayNameById)}
                      {action.targetAgentId ? ` -> ${formatAgentReference(action.targetAgentId, agentDisplayNameById)}` : ""}
                    </span>
                  </div>
                  <p className="text-2xs md:text-xs text-gray-800 leading-relaxed font-medium">
                    {action.content}
                  </p>
                  <p className="text-3xs text-gray-500 leading-relaxed">
                    {action.reason}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <span className="block text-3xs font-bold text-gray-400 uppercase tracking-wider">
            投票结果
          </span>
          <div className="space-y-2">
            {interactions.votes.map((vote) => (
              <div
                key={vote.agentId}
                className="bg-white p-3 rounded-xl border border-gray-150 shadow-2xs space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-sm bg-indigo-50 text-indigo-700 border border-indigo-100">
                    <Vote className="w-3 h-3" />
                    <span>{getAgentVerdictLabel(vote.verdict)}</span>
                  </span>
                  <span className="text-3xs font-mono text-gray-400">
                    {formatVoteConfidence(vote.confidence)}
                  </span>
                </div>
                <p className="text-3xs font-mono text-gray-500 truncate">
                  {formatAgentReference(vote.agentId, agentDisplayNameById)}
                </p>
                <p className="text-2xs md:text-xs text-gray-700 leading-relaxed">
                  {vote.rationale}
                </p>
                <p className="text-3xs text-gray-400 leading-relaxed">
                  {formatStateDelta(vote.stateDeltaVote, simulationType)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
