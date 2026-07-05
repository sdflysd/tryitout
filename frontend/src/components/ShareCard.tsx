import React, { useState } from "react";
import { motion } from "motion/react";
import { Copy, X, Sparkles, Trophy, ShieldAlert, CheckCircle, Smartphone } from "lucide-react";
import { Simulation, SimulationType } from "../types";
import { postValidationEvent } from "../validation-events";

interface ShareCardProps {
  simulation: Simulation;
  onClose: () => void;
}

type ShareTheme = "space_grey" | "gold" | "cyber_purple";

type ShareCardCopy = {
  modalTitle: string;
  modalDescription: string;
  subjectLabel: string;
  probabilityLabel: string;
  expectedLabel: string;
  riskLabel: string;
  recommendationLabel: string;
  planLabel: string;
  posterBadge: string;
  footerLine: string;
  fallbackName: string;
};

function getSimulationType(simulation: Simulation): SimulationType {
  return simulation.type || simulation.userInput.type || "side_hustle";
}

export function getShareCardCopy(type: SimulationType): ShareCardCopy {
  if (type === "dating") {
    return {
      modalTitle: "情感沟通卡片生成器",
      modalDescription: "选择风格，长按保存或复制文字到朋友圈/群聊，让懂你的人一起参谋。",
      subjectLabel: "关系课题",
      probabilityLabel: "30天升温/修复概率",
      expectedLabel: "预期关系走向",
      riskLabel: "关系风险评级",
      recommendationLabel: "AI 最终沟通建议",
      planLabel: "未来一周高情商沟通计划",
      posterBadge: "我的情感走向",
      footerLine: "重要关系沟通，先模拟一次",
      fallbackName: "情感互动修复评估",
    };
  }

  if (type === "life_choice") {
    return {
      modalTitle: "人生抉择卡片生成器",
      modalDescription: "选择风格，长按保存或复制文字到朋友圈/群聊，让信任的人一起参谋。",
      subjectLabel: "人生抉择",
      probabilityLabel: "30天心安避坑系数",
      expectedLabel: "预期抉择走向",
      riskLabel: "后悔风险评级",
      recommendationLabel: "AI 最终避坑建议",
      planLabel: "未来一周后悔防御计划",
      posterBadge: "我的抉择推演",
      footerLine: "重大人生抉择，先模拟一次",
      fallbackName: "人生抉择损益评估",
    };
  }

  return {
    modalTitle: "搞钱试错卡片生成器",
    modalDescription: "选择风格，长按保存或复制文字到朋友圈/群聊，让群里兄弟们一起参谋。",
    subjectLabel: "项目想法",
    probabilityLabel: "30天模拟胜率",
    expectedLabel: "预期首月收益",
    riskLabel: "主要风险评级",
    recommendationLabel: "AI 最终决策建议",
    planLabel: "未来一周MVP计划",
    posterBadge: "我的副业结局",
    footerLine: "重要副业决定，先模拟一次",
    fallbackName: "未命名",
  };
}

function getDisplayName(simulation: Simulation, fallbackName: string) {
  return (
    simulation.report.projectName ||
    simulation.userInput.projectIdea ||
    simulation.userInput.chatLogOrIssue ||
    simulation.userInput.relationshipStatus ||
    simulation.userInput.optionA ||
    fallbackName
  );
}

function getRecommendedRoute(simulation: Simulation) {
  const comparison = simulation.routeComparison;
  if (!comparison) {
    return undefined;
  }

  return comparison.routes.find((route) => route.id === comparison.recommendedRouteId) ?? comparison.routes[0];
}

function getAgentObjection(simulation: Simulation): string {
  return (
    simulation.agents.find((agent) => agent.objection)?.objection ??
    simulation.report.risks[0] ??
    "暂无关键反对意见"
  );
}

export default function ShareCard({ simulation, onClose }: ShareCardProps) {
  const [selectedTheme, setSelectedTheme] = useState<ShareTheme>("gold");
  const [copiedText, setCopiedText] = useState(false);
  const { report } = simulation;
  const copy = getShareCardCopy(getSimulationType(simulation));
  const displayName = getDisplayName(simulation, copy.fallbackName);
  const recommendedRoute = getRecommendedRoute(simulation);
  const agentObjection = getAgentObjection(simulation);

  const handleCopyText = () => {
    void postValidationEvent({
      type: "share_clicked",
      simulationId: simulation.id,
      scenarioType: getSimulationType(simulation),
    });

    const textToCopy = `
【试一下】
${copy.subjectLabel}：《${displayName}》
━━━━━━━━━━━━━━━━━━━━
${copy.probabilityLabel}：${report.successProbability}%
${copy.expectedLabel}：${report.expectedRevenue}
${copy.riskLabel}：${report.riskLevel === "low" ? "低风险" : report.riskLevel === "medium" ? "中等风险" : report.riskLevel === "high" ? "高风险" : "极高风险"}
${recommendedRoute ? `推荐路线：${recommendedRoute.title}（后悔风险 ${recommendedRoute.regretRisk}%）` : ""}
━━━━━━━━━━━━━━━━━━━━
【${copy.recommendationLabel}】：
${report.finalRecommendation}

【${copy.planLabel}】：
${report.actionPlan7Days.slice(0, 3).map(p => `Day ${p.day}: ${p.title} - ${p.action}`).join("\n")}

※ ${copy.footerLine}！
    `.trim();

    navigator.clipboard.writeText(textToCopy);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const getThemeStyles = (theme: ShareTheme) => {
    switch (theme) {
      case "space_grey":
        return {
          bg: "bg-[#18181b] text-zinc-100",
          cardBg: "bg-zinc-900 border-zinc-800",
          accentText: "text-zinc-400",
          divider: "border-zinc-800",
          badge: "bg-zinc-800 text-zinc-300 border-zinc-700",
          highlight: "text-amber-400",
          btnColor: "bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
        };
      case "cyber_purple":
        return {
          bg: "bg-[#0b0314] text-purple-100",
          cardBg: "bg-purple-950/40 border-purple-900/60",
          accentText: "text-purple-300",
          divider: "border-purple-900/60",
          badge: "bg-purple-900/50 text-purple-200 border-purple-800",
          highlight: "text-fuchsia-400",
          btnColor: "bg-purple-900 hover:bg-purple-800 text-purple-100"
        };
      case "gold":
      default:
        return {
          bg: "bg-amber-950 text-amber-50",
          cardBg: "bg-amber-900/40 border-amber-800/60",
          accentText: "text-amber-300/80",
          divider: "border-amber-800/60",
          badge: "bg-amber-900/60 text-amber-100 border-amber-700/60",
          highlight: "text-yellow-400",
          btnColor: "bg-amber-500 hover:bg-amber-600 text-gray-950 font-bold"
        };
    }
  };

  const st = getThemeStyles(selectedTheme);

  return (
    <div id="share-card-modal" className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50 overflow-y-auto backdrop-blur-xs">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl p-5 md:p-6 max-w-sm w-full shadow-2xl relative text-center space-y-5"
      >
        {/* Modal Close Button */}
        <button
          id="btn-close-share"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-left space-y-1">
          <h2 id="share-modal-title" className="text-sm font-black text-gray-950 flex items-center gap-1.5">
            <Sparkles className="w-4.5 h-4.5 text-amber-500" />
            <span>{copy.modalTitle}</span>
          </h2>
          <p className="text-3xs text-gray-400">{copy.modalDescription}</p>
        </div>

        {/* Theme Swapping Selectors */}
        <div className="flex gap-2 justify-center">
          {[
            { id: "gold", label: "鎏金黄" },
            { id: "space_grey", label: "极客灰" },
            { id: "cyber_purple", label: "霓虹紫" }
          ].map((theme) => (
            <button
              key={theme.id}
              onClick={() => setSelectedTheme(theme.id as ShareTheme)}
              className={`text-2xs px-3 py-1.5 rounded-lg border font-bold transition-all cursor-pointer ${
                selectedTheme === theme.id
                  ? "bg-amber-500 border-amber-500 text-gray-950 shadow-xs scale-98"
                  : "bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-600"
              }`}
            >
              {theme.label}
            </button>
          ))}
        </div>

        {/* Visual Poster Card Container */}
        <div 
          id="share-poster-card" 
          className={`rounded-2xl p-5 border text-left shadow-lg relative overflow-hidden transition-all duration-300 font-sans ${st.bg} ${st.cardBg}`}
        >
          {/* Subtle decor circles */}
          <div className="absolute -top-12 -right-12 w-28 h-28 bg-white/5 rounded-full blur-xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-12 w-28 h-28 bg-white/5 rounded-full blur-xl pointer-events-none" />

          {/* Slogan */}
          <div className="flex justify-between items-center border-b border-white/10 pb-2 mb-3 text-3xs font-mono tracking-widest uppercase">
            <span>Beta Life Simulator</span>
            <span>试一下</span>
          </div>

          <div className="space-y-3.5">
            <span className="text-[10px] bg-white/15 text-white border border-white/10 px-2 py-0.5 rounded-sm inline-block">
              {copy.posterBadge}
            </span>
            
            <h3 className="text-base font-black tracking-tight leading-tight">
              《{displayName.length > 15 ? displayName.slice(0, 15) : displayName}》
            </h3>

            {/* Poster grid stats */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className={`p-2.5 rounded-xl border flex flex-col justify-center ${st.badge}`}>
                <span className="text-3xs font-semibold opacity-60 block">{copy.probabilityLabel.replace("30天", "")}</span>
                <span className={`text-sm font-black ${st.highlight}`}>{report.successProbability}%</span>
              </div>
              <div className={`p-2.5 rounded-xl border flex flex-col justify-center ${st.badge}`}>
                <span className="text-3xs font-semibold opacity-60 block">{copy.riskLabel}</span>
                <span className="text-xs font-black">
                  {report.riskLevel === "low" ? "低风险" : report.riskLevel === "medium" ? "中等风险" : report.riskLevel === "high" ? "高风险" : "极高风险"}
                </span>
              </div>
            </div>

            {/* expected profit info */}
            <div className={`p-3 rounded-xl border flex justify-between items-center ${st.badge}`}>
              <span className="text-3xs font-semibold opacity-60">{copy.expectedLabel}</span>
              <span className={`text-xs font-black ${st.highlight}`}>{report.expectedRevenue}</span>
            </div>

            {recommendedRoute && (
              <div className={`p-3 rounded-xl border space-y-1 ${st.badge}`}>
                <span className="text-3xs font-semibold opacity-60">推荐路线</span>
                <p className={`text-xs font-black ${st.highlight}`}>{recommendedRoute.title}</p>
                <p className="text-3xs opacity-75">后悔风险 {recommendedRoute.regretRisk}%</p>
              </div>
            )}

            <div className={`p-3 rounded-xl border space-y-1 ${st.badge}`}>
              <span className="text-3xs font-semibold opacity-60">Agent 反对意见</span>
              <p className="text-[10px] leading-relaxed opacity-90">
                {agentObjection.length > 46 ? `${agentObjection.slice(0, 46)}...` : agentObjection}
              </p>
            </div>

            {/* Summary bubble */}
            <div className="space-y-1 pt-1.5">
              <span className="block text-3xs font-bold uppercase tracking-wider opacity-60">AI 深度洞察：</span>
              <p className="text-[11px] leading-relaxed opacity-90 italic">
                “ {report.finalRecommendation.length > 70 ? report.finalRecommendation.slice(0, 70) + "..." : report.finalRecommendation} ”
              </p>
            </div>

            {/* Bottom barcode decoration representing ticketing / validation */}
            <div className="flex items-center justify-between border-t border-white/10 pt-3.5 mt-2">
              <div className="space-y-0.5">
                <span className="block text-3xs font-black tracking-wide uppercase opacity-75">试一下</span>
                <span className="block text-[8px] opacity-40">{copy.footerLine}</span>
              </div>
              
              {/* Fake Ticket barcode block */}
              <div className="flex flex-col items-end opacity-50 select-none">
                <div className="flex gap-[1px] h-5 items-stretch">
                  {[2, 1, 3, 1, 2, 4, 1, 3, 2, 1, 2, 3, 1, 2, 4, 1].map((w, idx) => (
                    <div key={idx} className="bg-white" style={{ width: `${w}px` }} />
                  ))}
                </div>
                <span className="text-[7px] font-mono mt-0.5 tracking-widest uppercase">ID:{simulation.id.slice(0, 8)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Copy text action & status */}
        <div className="flex gap-2.5 pt-1">
          <button
            id="btn-copy-clipboard"
            onClick={handleCopyText}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 p-3 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
              copiedText 
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-700"
            }`}
          >
            {copiedText ? (
              <>
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                <span>复制成功！</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>一键复制文字口令</span>
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
