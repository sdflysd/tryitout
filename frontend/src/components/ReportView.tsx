import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  TrendingUp, AlertTriangle, Lightbulb, Compass, Calendar, 
  MessageSquare, UserCheck, ShieldAlert, Sparkles, CheckCircle2, 
  RefreshCw, ArrowUpRight, Share2, HelpCircle, ChevronRight, Play, PencilLine
} from "lucide-react";
import { Simulation, Agent, SimulationStage } from "../types";
import { postValidationEvent } from "../validation-events";
import AgentInteractionReplay from "./AgentInteractionReplay";
import RouteComparisonPanel from "./RouteComparisonPanel";
import { createHorizontalDragScrollController } from "./drag-scroll";
import {
  buildDeepReportUnlockIntentEvent,
  buildPaywallClickEvent,
  buildPaywallLeadEvent,
  getDeepReportPaywallCopy,
} from "./paywall-copy";
import OutcomeFeedbackPanel from "./OutcomeFeedbackPanel";
import {
  getVisibleActionPlan,
  hasAgentInteractions,
  shouldShowDeepSection,
} from "./report-access";
import { buildFeedbackEvent, buildReportViewedEvent } from "./report-feedback";
import {
  buildAgentEvidenceRows,
  buildAgentMemoryEvidence,
  buildArbiterEvidence,
  buildKeyVariables,
  getReportModeSummary,
} from "./report-insights";
import { createReportViewedTracker } from "./report-feedback";

const reportViewedTracker = createReportViewedTracker();

interface ReportViewProps {
  simulation: Simulation;
  onRestart: () => void;
  onOpenShareCard: () => void;
  onEditInput: () => void;
}

export default function ReportView({ simulation, onRestart, onOpenShareCard, onEditInput }: ReportViewProps) {
  const { report, agents, stages } = simulation;
  
  const simType = simulation.type || simulation.userInput.type || "side_hustle";

  const [selectedAgentId, setSelectedAgentId] = useState<string>(agents[1]?.id || agents[0]?.id);
  const [expandedStageIndex, setExpandedStageIndex] = useState<number>(0); // Default expand stage 1
  const [checkedDays, setCheckedDays] = useState<number[]>([]);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState("");
  const [feedbackPrice, setFeedbackPrice] = useState("");
  const [feedbackText, setFeedbackText] = useState("");
  const [selectedPaywallPrice, setSelectedPaywallPrice] = useState("");
  const [paywallContact, setPaywallContact] = useState("");
  const [deepReportUnlocked, setDeepReportUnlocked] = useState(false);
  const agentRailDrag = useMemo(() => createHorizontalDragScrollController(), []);

  useEffect(() => {
    if (reportViewedTracker.shouldPost(simulation)) {
      void postValidationEvent(buildReportViewedEvent(simulation));
    }
  }, [simulation]);

  const handleToggleDay = (day: number) => {
    if (checkedDays.includes(day)) {
      setCheckedDays(checkedDays.filter(d => d !== day));
    } else {
      setCheckedDays([...checkedDays, day]);
    }
  };

  const submitFeedback = (e: React.FormEvent) => {
    e.preventDefault();
    void postValidationEvent(
      buildFeedbackEvent(simulation, {
        rating: feedbackRating,
        usefulness: feedbackRating,
        price: feedbackPrice,
        text: feedbackText,
      }),
    );
    setFeedbackSubmitted(true);
  };

  const getShouldDoDetails = (verdict: string, type: string) => {
    if (type === "dating") {
      switch (verdict) {
        case "strong_yes":
          return {
            title: "高情商极佳回复！",
            desc: "对方此时对你的安全感处于高位，这个切入方向和话术极为合拍，能瞬间拉近距离！",
            color: "text-emerald-700 bg-emerald-50 border-emerald-200",
            iconColor: "text-emerald-500"
          };
        case "test_small":
          return {
            title: "可以稳步发送，注意留白",
            desc: "话术可行，但对方慢热，建议不要连珠炮式轰炸，给TA留出2-3小时充分的消化空间。",
            color: "text-blue-700 bg-blue-50 border-blue-200",
            iconColor: "text-blue-500"
          };
        case "not_directly":
          return {
            title: "不推荐直接发送此方案",
            desc: "这句回复带有明显的解释性或微弱的讨好，极易撞上TA的回避心理，引起敷衍对待。",
            color: "text-amber-700 bg-amber-50 border-amber-200",
            iconColor: "text-amber-500"
          };
        case "change_direction":
          return {
            title: "建议立刻换个情绪话术",
            desc: "对方可能处于情绪内耗中，此话术可能过于生硬。建议参考下方AI极力提倡的情绪微调路线。",
            color: "text-purple-700 bg-purple-50 border-purple-200",
            iconColor: "text-purple-500"
          };
        case "not_recommended":
        default:
          return {
            title: "千万别发，听劝！",
            desc: "此言一出基本会触发冷战冰点，直接将TA的防备拉满，甚至面临拉黑退群的风险！",
            color: "text-rose-700 bg-rose-50 border-rose-200",
            iconColor: "text-rose-500"
          };
      }
    } else if (type === "life_choice") {
      switch (verdict) {
        case "strong_yes":
          return {
            title: "长线最优之选，果断去闯！",
            desc: "此决断高度契合你未来的职业成长性和生存保障，虽然前期辛苦，但能有效防御最坏的担忧。",
            color: "text-emerald-700 bg-emerald-50 border-emerald-200",
            iconColor: "text-emerald-500"
          };
        case "test_small":
          return {
            title: "可以试水，但必须留有Plan B",
            desc: "可行但容错率中等。建议你给自己设置3个月时间线，如果不达预期必须执行后路策略。",
            color: "text-blue-700 bg-blue-50 border-blue-200",
            iconColor: "text-blue-500"
          };
        case "not_directly":
          return {
            title: "千万不要仓促做这个抉择",
            desc: "你现在的资金储备或家庭支持不够强劲，强行上路可能会在第二个月陷入巨大的内耗和中断焦虑。",
            color: "text-amber-700 bg-amber-50 border-amber-200",
            iconColor: "text-amber-500"
          };
        case "change_direction":
          return {
            title: "建议选择第三种‘混合策略’",
            desc: "不一定要非黑即白。建议走一边保留现状/兼职，一边暗自筹备备选项的微调道路，防御风险。",
            color: "text-purple-700 bg-purple-50 border-purple-200",
            iconColor: "text-purple-500"
          };
        case "not_recommended":
        default:
          return {
            title: "极其不推荐走这条路",
            desc: "机会成本过高，且现实阻碍极其致命，极易落入你最担心的最坏结局中。请立刻悬崖勒马！",
            color: "text-rose-700 bg-rose-50 border-rose-200",
            iconColor: "text-rose-500"
          };
      }
    } else {
      // side_hustle default
      switch (verdict) {
        case "strong_yes":
          return {
            title: "强烈建议做！",
            desc: "兄弟，这个方向的商业闭环非常清晰，客户痛点强烈且变现链条短，值得你全力以赴。",
            color: "text-emerald-700 bg-emerald-50 border-emerald-200",
            iconColor: "text-emerald-500"
          };
        case "test_small":
          return {
            title: "可以极小成本测试",
            desc: "有可行性，但建议千万别重资产开发。先做一个最简可行性MVP或手动单，见效后再说。",
            color: "text-blue-700 bg-blue-50 border-blue-200",
            iconColor: "text-blue-500"
          };
        case "not_directly":
          return {
            title: "不建议直接做原方案",
            desc: "直接切入极易撞墙，同质化非常严重。你需要改变定位，或增加差异化护城河再动。",
            color: "text-amber-700 bg-amber-50 border-amber-200",
            iconColor: "text-amber-500"
          };
        case "change_direction":
          return {
            title: "建议换个微调方向",
            desc: "痛点和需求确实有，但你的策略、渠道或变现可能想偏了。不妨看下面的转型路线建议。",
            color: "text-purple-700 bg-purple-50 border-purple-200",
            iconColor: "text-purple-500"
          };
        case "not_recommended":
        default:
          return {
            title: "不推荐投入精力",
            desc: "红海一片、获客极难或变现几乎为零，强行干只会既亏钱又耗体力。听AI劝，换方向！",
            color: "text-rose-700 bg-rose-50 border-rose-200",
            iconColor: "text-rose-500"
          };
      }
    }
  };

  const verdict = getShouldDoDetails(report.shouldDo, simType);
  const selectedAgent = agents.find(a => a.id === selectedAgentId) || agents[0];
  const deepReportPaywallCopy = getDeepReportPaywallCopy(simType);
  const deepSectionVisible = shouldShowDeepSection(simulation, deepReportUnlocked);
  const visibleActionPlan = getVisibleActionPlan(report.actionPlan7Days, deepReportUnlocked);
  const agentEvidence = buildAgentEvidenceRows(simulation);
  const arbiterEvidence = buildArbiterEvidence(simulation);
  const keyVariables = buildKeyVariables(simulation);
  const agentMemoryEvidence = buildAgentMemoryEvidence(simulation);
  const reportModeSummary = getReportModeSummary(simulation);
  const coreAgentCount = agents.filter((agent) => agent.layer !== "peripheral").length;
  const peripheralAgentCount = agents.filter((agent) => agent.layer === "peripheral").length;
  const agentPanelDescription =
    peripheralAgentCount > 0
      ? `${coreAgentCount} 位主 Agent 与 ${peripheralAgentCount} 位外围参与 Agent 已进入本次博弈，可切换查看各自底线立场。`
      : `点击切换以下 ${agents.length} 位博弈 Agent，查看客户、同行、心理分析师或家长伴侣的底线立场。`;

  // Map theme variables
  const theme = {
    side_hustle: {
      color: "amber",
      text: "text-amber-600",
      bg: "bg-amber-500 hover:bg-amber-600",
      badgeBg: "bg-amber-400",
      badgeText: "搞钱评估报告",
      circleStroke: "stroke-amber-500",
      metricIcon: "¥",
      metricLabel: "模拟首月收益预测",
      scoreTitle: "项目可行性六维评分面板",
      timelineTitle: "30 天推演演进剧本时间线",
      timelineDesc: "副业生命周期的 5 大关键里程碑演绎。点击切换可查看具体事件、世界参数变更及教练建议。",
      stateLabels: {
        product: "产品清晰度",
        energy: "执行动力",
        traffic: "获客流量进度",
        revenue: "累计模拟收入"
      },
      pivotTitle: "AI 商业分析师提议的【商业微调与转型方案】",
      pivotDesc: "如果原计划难以跑通，试一试转换成以下策略，可以让胜率和付费意愿大幅提升。",
      actionTitle: "落地首期 7 天实操行动计划表",
      actionDesc: "不要一上来就写庞大代码或重金推广。按照这个日历逐步开展小样本需求测试。",
      scoresMap: {
        demandStrength: "需求强度 (痛点真伪)",
        willingnessToPay: "付费意愿 (掏钱爽快度)",
        acquisitionDifficulty: "获客难度 (流量门槛)",
        competitionPressure: "竞争压力 (同行厮杀)",
        executionFit: "执行匹配 (自身技能精力)",
        monetizationClarity: "变现清晰 (盈利模式)"
      },
      asterisk: "*获客难度和竞争压力得分越高代表越困难、厮杀越重。"
    },
    dating: {
      color: "rose",
      text: "text-rose-600",
      bg: "bg-rose-500 hover:bg-rose-600",
      badgeBg: "bg-rose-400",
      badgeText: "情感契合报告",
      circleStroke: "stroke-rose-500",
      metricIcon: "❤️",
      metricLabel: "30天情感好感走向",
      scoreTitle: "亲密关系阻碍六维评分面板",
      timelineTitle: "30 天情感互动博弈演化剧本",
      timelineDesc: "亲密关系冲突在30天内的5大关键演化波峰。点击切换可查看双方心理解构与建议。",
      stateLabels: {
        product: "好感信任度",
        energy: "交往精力",
        traffic: "沟通破冰感",
        revenue: "亲密情感羁绊"
      },
      pivotTitle: "高情商两性精算师给出的【话术微调与姿态逆转】",
      pivotDesc: "如果你当下的想法被判定高危，千万不要硬碰硬，试一试AI提议的高情商缓和与拉扯策略。",
      actionTitle: "高情商首期 7 天沟通破冰日历",
      actionDesc: "两性博弈最忌用力过猛。跟着这份精算指南，每天克制、平稳心态，慢慢赢回TA的安全感。",
      scoresMap: {
        demandStrength: "原始好感度 (TA对你的初印象)",
        willingnessToPay: "信任包容力 (TA对你的容错底线)",
        acquisitionDifficulty: "沟通摩擦阻力 (聊死或踩雷风险)",
        competitionPressure: "对方防备防线 (退缩与不安全感)",
        executionFit: "情商匹配度 (话术与情感表达)",
        monetizationClarity: "相处前景指数 (未来相处现实基础)"
      },
      asterisk: "*沟通摩擦阻力和对方防备防线得分越高代表冰点越厚、心理越防备。"
    },
    life_choice: {
      color: "indigo",
      text: "text-indigo-600",
      bg: "bg-indigo-600 hover:bg-indigo-700",
      badgeBg: "bg-indigo-500",
      badgeText: "抉择后悔损益大评级",
      circleStroke: "stroke-indigo-500",
      metricIcon: "⚖️",
      metricLabel: "抉择最终倾向建议",
      scoreTitle: "机会后悔度六维算盘面板",
      timelineTitle: "30 天抉择摩擦损益跟踪剧本",
      timelineDesc: "几个候选方向在30天内的5个残酷碰撞点。点击切换可查看你最恐惧的事如何被逐步防御。",
      stateLabels: {
        product: "决断清晰度",
        energy: "精神抗压度",
        traffic: "主推方向可行性",
        revenue: "生存安全底气"
      },
      pivotTitle: "终极人生教练提倡的【双向避坑组合方案】",
      pivotDesc: "谁说选择只有向左或向右？看看人生教练提议的混合过渡路线，如何在规避最坏情况下博取最大面。",
      actionTitle: "后悔防御落地 7 天避险清单",
      actionDesc: "下定决心不是瞬间的事，是一步步拆解对未来的不确定。按此清单，稳扎稳打清算所有退路。",
      scoresMap: {
        demandStrength: "主推方向成长力 (长线增值红利)",
        willingnessToPay: "备选方向成长力 (其他路线长线潜能)",
        acquisitionDifficulty: "主推方向现实阻力 (执行时面临的阻碍)",
        competitionPressure: "备选方向现实阻力 (其他路线的代价)",
        executionFit: "抗压匹配度 (自身应对最坏担忧决心)",
        monetizationClarity: "长远防险底线 (存款及家庭兜底力)"
      },
      asterisk: "*现实阻力得分越高代表执行对应路线的代价和牺牲越明显。"
    }
  }[simType];

  return (
    <div id="report-view-container" className="max-w-4xl mx-auto px-4 py-6 space-y-8">
      
      {/* Top Banner Navigation */}
      <div id="report-navbar" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          id="btn-restart-from-report"
          onClick={onRestart}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-950 transition-colors p-2 -ml-2 hover:bg-gray-100 rounded-lg cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          <span>重新开一局</span>
        </button>
        
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            id="btn-edit-report-input"
            onClick={onEditInput}
            className="inline-flex items-center justify-center gap-1.5 text-xs font-bold text-gray-700 px-4 py-2.5 rounded-xl border border-gray-200 bg-white shadow-xs transition-colors hover:bg-gray-50 hover:text-gray-950 cursor-pointer"
          >
            <PencilLine className="w-4 h-4" />
            <span>编辑输入</span>
          </button>

          <button
            id="btn-open-share-card"
            onClick={onOpenShareCard}
            className={`inline-flex items-center justify-center gap-1.5 text-xs font-bold text-white px-4 py-2.5 rounded-xl shadow-xs transition-colors cursor-pointer ${theme.bg}`}
          >
            <Share2 className="w-4 h-4" />
            <span>生成分享精算卡片</span>
          </button>
        </div>
      </div>

      {/* Hero Overview Header */}
      <motion.div 
        id="report-hero-card"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl border border-gray-150 p-6 md:p-8 shadow-xs relative overflow-hidden text-left"
      >
        <div className={`absolute top-0 right-0 ${theme.badgeBg} text-white text-3xs font-black px-3 py-1.5 rounded-bl-xl tracking-wider uppercase`}>
          {theme.badgeText}
        </div>

        <div className="space-y-4">
          <span className="text-2xs font-bold text-gray-400 uppercase tracking-widest block">Simulation Report</span>
          <h1 id="report-project-name" className="text-xl md:text-2xl font-black text-gray-950 tracking-tight pr-16">
            {simType === "side_hustle" && `项目：《${report.projectName || simulation.userInput.projectIdea.slice(0, 15) + "..."}》`}
            {simType === "dating" && `关系阶段：《${report.projectName || "聊天破冰矛盾解套"}》`}
            {simType === "life_choice" && `重大抉择天平：《${report.projectName || "天平碰撞抉择"}》`}
          </h1>

          <div
            id="report-mode-summary"
            className={`inline-flex max-w-full flex-col rounded-xl border px-3 py-2 ${
              reportModeSummary.tone === "deep"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-gray-200 bg-gray-50 text-gray-700"
            }`}
          >
            <span className="text-2xs font-black">{reportModeSummary.label}</span>
            <span className="text-3xs font-semibold leading-relaxed opacity-80">
              {reportModeSummary.detail}
            </span>
          </div>

          {/* Key Metrics Grid */}
          <div id="report-metrics-grid" className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3">
            {/* Probability Metric */}
            <div className="bg-gray-50 border border-gray-100 p-4 rounded-2xl flex items-center gap-4">
              <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="28" cy="28" r="24" className="stroke-gray-200 fill-none" strokeWidth="4" />
                  <circle cx="28" cy="28" r="24" className={`${theme.circleStroke} fill-none`} strokeWidth="4" 
                    strokeDasharray={`${2 * Math.PI * 24}`}
                    strokeDashoffset={`${2 * Math.PI * 24 * (1 - report.successProbability / 100)}`}
                  />
                </svg>
                <span className="absolute text-xs font-black text-gray-950">{report.successProbability}%</span>
              </div>
              <div>
                <span className="block text-3xs font-bold text-gray-400">
                  {simType === "side_hustle" && "30天跑通胜率"}
                  {simType === "dating" && "30天挽回/升温概率"}
                  {simType === "life_choice" && "长远心安避坑系数"}
                </span>
                <span className="text-sm font-black text-gray-950">
                  {report.successProbability >= 70 ? "大有可为" : report.successProbability >= 45 ? "博一博单车变摩托" : "九死一生"}
                </span>
              </div>
            </div>

            {/* Expected Revenue */}
            <div className="bg-gray-50 border border-gray-100 p-4 rounded-2xl flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg ${
                simType === "side_hustle" ? "bg-amber-50 text-amber-600" : simType === "dating" ? "bg-rose-50 text-rose-500" : "bg-indigo-50 text-indigo-500"
              }`}>
                {theme.metricIcon}
              </div>
              <div>
                <span className="block text-3xs font-bold text-gray-400">{theme.metricLabel}</span>
                <span id="report-expected-revenue" className="text-sm font-black text-gray-950">{report.expectedRevenue}</span>
              </div>
            </div>

            {/* Risk Level */}
            <div className="bg-gray-50 border border-gray-100 p-4 rounded-2xl flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                simType === "side_hustle" ? "bg-amber-50 text-amber-500" : simType === "dating" ? "bg-rose-50 text-rose-500" : "bg-indigo-50 text-indigo-500"
              }`}>
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <span className="block text-3xs font-bold text-gray-400">
                  {simType === "side_hustle" && "项目风险评级"}
                  {simType === "dating" && "关系破裂风险"}
                  {simType === "life_choice" && "心累后悔指数"}
                </span>
                <span id="report-risk-level" className={`text-xs font-black uppercase ${
                  report.riskLevel === "high" || report.riskLevel === "very_high" ? "text-rose-600" : "text-emerald-600"
                }`}>
                  {report.riskLevel === "low" ? "低风险" : report.riskLevel === "medium" ? "中等风险" : report.riskLevel === "high" ? "高风险" : "极高风险"}
                </span>
              </div>
            </div>
          </div>

          {/* Verdict Box */}
          <div id="report-verdict-box" className={`p-4 rounded-2xl border ${verdict.color} mt-4 space-y-1 text-left`}>
            <div className="flex items-center gap-2 font-bold text-xs md:text-sm">
              <CheckCircle2 className={`w-5 h-5 shrink-0 ${verdict.iconColor}`} />
              <span>行动大裁决：{verdict.title}</span>
            </div>
            <p className="text-2xs md:text-xs leading-relaxed opacity-90">{verdict.desc}</p>
          </div>
        </div>
      </motion.div>

      <div id="report-explainability-panel" className="bg-white rounded-3xl border border-gray-150 p-6 shadow-xs text-left space-y-5">
        <h2 className="text-base font-bold text-gray-950">为什么 AI 会这么判断</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <h3 className="text-xs font-black text-gray-800 mb-2">裁判依据</h3>
            <ul className="space-y-2">
              {arbiterEvidence.map((item, index) => (
                <li key={index} className="text-2xs text-gray-600 leading-relaxed">{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-black text-gray-800 mb-2">{agentEvidence.title}</h3>
            {agentEvidence.rows.length > 0 ? agentEvidence.rows.slice(0, 4).map((row, index) => (
              <p key={index} className="text-2xs text-gray-600 leading-relaxed">
                第 {row.stageIndex} 阶段 · {row.agentName}
                {agentEvidence.kind === "votes" && row.verdict && row.confidence !== undefined
                  ? `: ${row.verdict} / ${row.confidence}% - `
                  : "："}
                {row.rationale}
              </p>
            )) : (
              <p className="text-2xs text-gray-500 leading-relaxed">当前报告没有逐 Agent 投票数据。</p>
            )}
          </div>
          <div>
            <h3 className="text-xs font-black text-gray-800 mb-2">关键变量</h3>
            <ul className="space-y-2">
              {keyVariables.map((item, index) => (
                <li key={index} className="text-2xs text-gray-600 leading-relaxed">{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {agentMemoryEvidence.length > 0 && (
        <div id="report-agent-memory-evidence" className="bg-white rounded-3xl border border-gray-150 p-6 shadow-xs text-left space-y-3">
          <h2 className="text-base font-bold text-gray-950">Agent 记忆证据</h2>
          <ul className="space-y-2">
            {agentMemoryEvidence.map((item, index) => (
              <li key={index} className="text-2xs text-gray-600 leading-relaxed">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      <RouteComparisonPanel simulation={simulation} />

      {/* Score Radar / Bar Grid */}
      <div id="report-score-panel" className="bg-white rounded-3xl border border-gray-150 p-6 shadow-xs text-left">
        <h2 className="text-base font-bold text-gray-950 mb-5 flex items-center gap-2">
          <TrendingUp className={`w-5 h-5 ${theme.text}`} />
          <span>{theme.scoreTitle}</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-left">
          {Object.entries({
            [theme.scoresMap.demandStrength]: report.scores.demandStrength,
            [theme.scoresMap.willingnessToPay]: report.scores.willingnessToPay,
            [theme.scoresMap.acquisitionDifficulty]: report.scores.acquisitionDifficulty,
            [theme.scoresMap.competitionPressure]: report.scores.competitionPressure,
            [theme.scoresMap.executionFit]: report.scores.executionFit,
            [theme.scoresMap.monetizationClarity]: report.scores.monetizationClarity,
          }).map(([key, score]) => {
            // High danger scores (3rd and 4th keys) represent resistance/friction
            const isDangerMetric = key.includes("获客难度") || key.includes("竞争压力") || key.includes("摩擦") || key.includes("防备") || key.includes("阻力");
            const barColor = isDangerMetric 
              ? score >= 75 ? "bg-rose-500" : score >= 50 ? "bg-amber-500" : "bg-emerald-500"
              : score >= 70 ? "bg-emerald-500" : score >= 45 ? "bg-amber-500" : "bg-rose-500";
            
            return (
              <div key={key} className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-gray-700">{key}</span>
                  <span className="font-mono font-bold text-gray-900">{score}分</span>
                </div>
                <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${score}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-3xs text-gray-400 mt-5 text-center">
          {theme.asterisk}
        </p>
      </div>

      {/* Multi-Agent Sandbox Objections Dialog (多智能体拷打面板) */}
      <div id="report-agents-sandbox" className="bg-white rounded-3xl border border-gray-150 p-6 shadow-xs space-y-6 text-left">
        <div>
          <h2 className="text-base font-bold text-gray-950 flex items-center gap-2">
            <Compass className={`w-5 h-5 ${theme.text}`} />
            <span>AI 利益多方角色群星博弈</span>
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {agentPanelDescription}
          </p>
        </div>

        {/* Horizontal scroll select on mobile */}
        <div
          className="flex gap-2 overflow-x-auto pb-2 -mx-2 px-2 scrollbar-none cursor-grab active:cursor-grabbing select-none touch-pan-x"
          onPointerDown={agentRailDrag.onPointerDown}
          onPointerMove={agentRailDrag.onPointerMove}
          onPointerUp={agentRailDrag.onPointerUp}
          onPointerCancel={agentRailDrag.onPointerCancel}
          onClickCapture={(event) => {
            if (agentRailDrag.consumeClickSuppression()) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
        >
          {agents.map((agent) => {
            const isSelected = agent.id === selectedAgentId;
            const stanceBadge = agent.stance === "支持" 
              ? "bg-emerald-500" 
              : agent.stance === "质疑" 
              ? "bg-amber-500" 
              : agent.stance === "拷打" 
              ? "bg-rose-500" 
              : "bg-blue-500";
              
            return (
              <button
                id={`btn-select-agent-${agent.id}`}
                key={agent.id}
                type="button"
                onClick={() => setSelectedAgentId(agent.id)}
                className={`px-4 py-3.5 rounded-2xl border text-xs shrink-0 font-bold transition-all text-left flex items-center gap-2.5 cursor-pointer ${
                  isSelected
                    ? "bg-gray-950 border-gray-950 text-white shadow-md scale-98"
                    : "bg-gray-50 hover:bg-gray-100 border-gray-150 text-gray-700"
                }`}
              >
                <span className="text-base">
                  {agent.role.includes("客户") || agent.role.includes("伴侣") || agent.role.includes("对方") ? "🛍️" 
                    : agent.role.includes("竞品") || agent.role.includes("诱惑") ? "⚔️" 
                    : agent.role.includes("流量") || agent.role.includes("亲友") || agent.role.includes("闺蜜") ? "📲" 
                    : agent.role.includes("本人") || agent.role.includes("执行者") || agent.role.includes("抉择人") ? "👤" 
                    : agent.role.includes("合伙") || agent.role.includes("朋友") || agent.role.includes("红娘") ? "👥" 
                    : agent.role.includes("教练") || agent.role.includes("导师") || agent.role.includes("算盘") ? "🎯" 
                    : "📊"}
                </span>
                <div>
                  <span className="block">{agent.name}</span>
                  <span className="block text-[9px] opacity-60 font-normal">{agent.role}</span>
                </div>
                <span className={`w-2 h-2 rounded-full ${stanceBadge}`} />
              </button>
            );
          })}
        </div>

        {/* Selected Agent Quote bubble */}
        <AnimatePresence mode="wait">
          <motion.div
            id="agent-objection-bubble"
            key={selectedAgentId}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="bg-gray-50 border border-gray-150 rounded-2xl p-5 text-left relative"
          >
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-2 border-b border-gray-150 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <span className="text-lg">
                  {selectedAgent.role.includes("客户") || selectedAgent.role.includes("伴侣") || selectedAgent.role.includes("对方") ? "🛍️" 
                    : selectedAgent.role.includes("竞品") || selectedAgent.role.includes("诱惑") ? "⚔️" 
                    : selectedAgent.role.includes("流量") || selectedAgent.role.includes("亲友") || selectedAgent.role.includes("闺蜜") ? "📲" 
                    : selectedAgent.role.includes("本人") || selectedAgent.role.includes("执行者") || selectedAgent.role.includes("抉择人") ? "👤" 
                    : selectedAgent.role.includes("合伙") || selectedAgent.role.includes("朋友") || selectedAgent.role.includes("红娘") ? "👥" 
                    : selectedAgent.role.includes("教练") || selectedAgent.role.includes("导师") || selectedAgent.role.includes("算盘") ? "🎯" 
                    : "📊"}
                </span>
                <div>
                  <h3 className="font-bold text-gray-950 text-sm">{selectedAgent.name}</h3>
                  <p className="text-3xs text-gray-400">角色身份: {selectedAgent.role}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm text-white ${
                  selectedAgent.stance === "支持" 
                    ? "bg-emerald-500" 
                    : selectedAgent.stance === "质疑" 
                    ? "bg-amber-500" 
                    : selectedAgent.stance === "拷打" 
                    ? "bg-rose-500" 
                    : "bg-blue-500"
                }`}>
                  立场：{selectedAgent.stance}
                </span>
              </div>
            </div>

            <div className="space-y-3.5">
              <div className="relative">
                <span className="absolute -top-3 -left-2 text-4xl font-serif text-gray-200 select-none">“</span>
                <p className="text-xs md:text-sm text-gray-800 italic font-medium leading-relaxed pl-4 pt-1 relative z-10">
                  {selectedAgent.keyJudgment}
                </p>
              </div>

              {selectedAgent.objection && (
                <div className="bg-rose-50/50 border border-rose-100 p-3 rounded-xl mt-3 space-y-1">
                  <span className="block text-2xs font-bold text-rose-800 flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>致命担忧：</span>
                  </span>
                  <p className="text-2xs text-rose-700 font-medium pl-4 leading-relaxed">
                    {selectedAgent.objection}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 30-Day Timeline (30天推演时间线) */}
      <div id="report-timeline" className="bg-white rounded-3xl border border-gray-150 p-6 shadow-xs space-y-6 text-left">
        <div>
          <h2 className="text-base font-bold text-gray-950 flex items-center gap-2">
            <Calendar className={`w-5 h-5 ${theme.text}`} />
            <span>{theme.timelineTitle}</span>
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {theme.timelineDesc}
          </p>
        </div>

        {/* Timeline Horizontal Steps Selector */}
        <div className="grid grid-cols-5 gap-1 md:gap-2">
          {stages.map((stage, idx) => {
            const isExpanded = idx === expandedStageIndex;
            return (
              <button
                id={`btn-timeline-step-${idx}`}
                key={idx}
                type="button"
                onClick={() => setExpandedStageIndex(idx)}
                className={`py-2 px-1 text-center rounded-xl border text-[10px] md:text-xs font-bold transition-all cursor-pointer truncate ${
                  isExpanded
                    ? simType === "side_hustle" ? "bg-amber-500 border-amber-500 text-gray-950 shadow-sm" : simType === "dating" ? "bg-rose-500 border-rose-500 text-white shadow-sm" : "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                    : "bg-gray-50 hover:bg-gray-100 border-gray-150 text-gray-500"
                }`}
              >
                <span className="block md:hidden">段 {idx + 1}</span>
                <span className="hidden md:block">{stage.timeRange}</span>
              </button>
            );
          })}
        </div>

        {/* Expanded Stage Log Content */}
        <div id="timeline-stage-detail" className="bg-gray-50 border border-gray-150 rounded-2xl p-5 space-y-5 text-left">
          <div className="flex items-center justify-between border-b border-gray-150 pb-2.5">
            <h3 className="font-black text-gray-950 text-sm">
              {stages[expandedStageIndex].timeRange} · {stages[expandedStageIndex].title}
            </h3>
            <span className="text-3xs font-mono text-gray-400">STAGE {expandedStageIndex + 1} OF 5</span>
          </div>

          <p className="text-xs text-gray-700 leading-relaxed font-normal">
            {stages[expandedStageIndex].summary}
          </p>

          {deepSectionVisible ? (
            <AgentInteractionReplay stage={stages[expandedStageIndex]} simulationType={simType} />
          ) : hasAgentInteractions(simulation) ? (
            <div className="bg-white border border-amber-100 rounded-2xl p-4 text-xs text-amber-800">
              Agent 博弈回放属于深度报告内容。选择上方内测价格后可临时解锁。
            </div>
          ) : null}

          {/* Events array */}
          <div className="space-y-3">
            <span className="block text-2xs font-bold text-gray-400 uppercase tracking-wider">发生摩擦大事件：</span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {stages[expandedStageIndex].events.map((evt, i) => (
                <div key={i} className="bg-white p-3 rounded-xl border border-gray-150 shadow-2xs space-y-1">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-sm ${
                    evt.impact === "positive" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                  }`}>
                    {evt.impact === "positive" ? "✓ 积极因素" : "✗ 产生冲突"}
                  </span>
                  <h4 className="font-bold text-gray-900 text-xs">{evt.title}</h4>
                  <p className="text-2xs text-gray-500 leading-normal">{evt.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* World state status list */}
          <div className="bg-white p-4 rounded-xl border border-gray-150 space-y-2">
            <span className="block text-2xs font-bold text-gray-400 uppercase tracking-wider mb-2">该阶段结束后的核心要素状态：</span>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="p-2 border-r border-gray-100 last:border-0 text-left">
                <span className="block text-3xs font-medium text-gray-400">{theme.stateLabels.product}</span>
                <span className="text-xs md:text-sm font-black text-gray-800">{stages[expandedStageIndex].stateAfter.productClarity}/100</span>
              </div>
              <div className="p-2 border-r border-gray-100 last:border-0 text-left">
                <span className="block text-3xs font-medium text-gray-400">{theme.stateLabels.energy}</span>
                <span className="text-xs md:text-sm font-black text-gray-800">{stages[expandedStageIndex].stateAfter.executionEnergy}/100</span>
              </div>
              <div className="p-2 border-r border-gray-100 last:border-0 text-left">
                <span className="block text-3xs font-medium text-gray-400">{theme.stateLabels.traffic}</span>
                <span className="text-xs md:text-sm font-black text-gray-800">{stages[expandedStageIndex].stateAfter.trafficProgress}/100</span>
              </div>
              <div className="p-2 text-left">
                <span className="block text-3xs font-medium text-gray-400">{theme.stateLabels.revenue}</span>
                <span className={`text-xs md:text-sm font-black ${
                  simType === "side_hustle" ? "text-emerald-600" : "text-gray-800"
                }`}>
                  {simType === "side_hustle" ? `¥${stages[expandedStageIndex].stateAfter.revenue}` : `${stages[expandedStageIndex].stateAfter.revenue}/100`}
                </span>
              </div>
            </div>
          </div>

          {/* Coach's suggestion and decisions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div className="space-y-1">
              <span className="block text-2xs font-bold text-rose-500">
                {simType === "side_hustle" && "此阶段遇到的【生死抉择】："}
                {simType === "dating" && "此阶段核心【情感纠结/踩雷危机】："}
                {simType === "life_choice" && "此阶段面临的【两难挣扎点】："}
              </span>
              <p className="text-2xs text-gray-700 leading-relaxed bg-rose-50/50 p-2.5 rounded-lg border border-rose-100">
                {stages[expandedStageIndex].keyDecision}
              </p>
            </div>
            <div className="space-y-1">
              <span className="block text-2xs font-bold text-emerald-600">
                {simType === "side_hustle" && "执行教练给出的【破局建议】："}
                {simType === "dating" && "高情商导师建议的【拉扯与台阶】："}
                {simType === "life_choice" && "人生避险教练建议的【退路与防御】："}
              </span>
              <p className="text-2xs text-gray-700 leading-relaxed bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-100">
                {stages[expandedStageIndex].nextSuggestion}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bento Opportunities vs Risks */}
      <div id="report-opportunities-risks" className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
        {/* Opportunities card */}
        <div className="bg-white rounded-3xl border border-gray-150 p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 font-bold text-gray-950 text-sm">
            <Lightbulb className="w-5 h-5 text-emerald-500" />
            <span>
              {simType === "side_hustle" && "核心可行性红利（最大机会）"}
              {simType === "dating" && "情感升温核心突破口（积极红利）"}
              {simType === "life_choice" && "该选择长线优势红利（长远好处）"}
            </span>
          </div>
          <ul className="space-y-3">
            {report.opportunities.map((opp, idx) => (
              <li key={idx} className="flex items-start gap-2.5 text-xs text-gray-600 leading-relaxed">
                <span className="w-5 h-5 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <span>{opp}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Risks card */}
        <div className="bg-white rounded-3xl border border-gray-150 p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 font-bold text-gray-950 text-sm">
            <ShieldAlert className="w-5 h-5 text-rose-500" />
            <span>
              {simType === "side_hustle" && "深水致命陷阱（最大风险）"}
              {simType === "dating" && "潜在冷战/关系冰封踩雷点"}
              {simType === "life_choice" && "重大机会成本牺牲（最坏代价）"}
            </span>
          </div>
          <ul className="space-y-3">
            {report.risks.map((risk, idx) => (
              <li key={idx} className="flex items-start gap-2.5 text-xs text-gray-600 leading-relaxed">
                <span className="w-5 h-5 rounded-md bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Pivot suggestions (转型与变现方向建议) */}
      <div id="report-pivot-suggestions" className="bg-white rounded-3xl border border-gray-150 p-6 shadow-xs space-y-5 text-left">
        <div>
          <h2 className="text-base font-bold text-gray-950 flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-purple-500" />
            <span>{theme.pivotTitle}</span>
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {theme.pivotDesc}
          </p>
        </div>

        <div className="space-y-3">
          {report.pivotSuggestions.map((piv, idx) => (
            <div key={idx} className="p-4 bg-purple-50/40 border border-purple-100 rounded-2xl flex items-start gap-3.5">
              <span className="text-xl bg-purple-100 text-purple-700 w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold">
                💡
              </span>
              <div className="space-y-1">
                <h3 className="font-bold text-gray-900 text-xs md:text-sm">{piv.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed font-normal">{piv.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 7-Day Action Plan (落地一期爆款执行红书计划) */}
      <div id="report-action-plan" className="bg-white rounded-3xl border border-gray-150 p-6 shadow-xs space-y-5 text-left">
        <div>
          <h2 className="text-base font-bold text-gray-950 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            <span>{theme.actionTitle}</span>
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {theme.actionDesc}
          </p>
        </div>

        <div className="space-y-2.5">
          {visibleActionPlan.map((item) => {
            const isChecked = checkedDays.includes(item.day);
            return (
              <div
                id={`action-plan-day-${item.day}`}
                key={item.day}
                onClick={() => handleToggleDay(item.day)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3.5 ${
                  isChecked
                    ? "bg-emerald-50/50 border-emerald-300 opacity-75"
                    : "bg-gray-50 hover:bg-gray-100 border-gray-150"
                }`}
              >
                <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                  isChecked ? "bg-emerald-500 border-emerald-500 text-white" : "border-gray-300 bg-white"
                }`}>
                  {isChecked && <span className="text-[10px] font-bold">✓</span>}
                </div>
                
                <div className="space-y-1 pr-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-3xs font-black font-mono text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-sm">
                      DAY {item.day}
                    </span>
                    <h3 className={`font-bold text-xs md:text-sm ${isChecked ? "line-through text-gray-400" : "text-gray-900"}`}>
                      {item.title}
                    </h3>
                  </div>
                  <p className={`text-2xs leading-relaxed font-normal ${isChecked ? "line-through text-gray-400" : "text-gray-500"}`}>
                    {item.action}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div id="deep-report-paywall" className="bg-white rounded-3xl border border-gray-150 p-6 shadow-xs text-left">
        <h2 className="text-base font-bold text-gray-950">{deepReportPaywallCopy.title}</h2>
        <p className="text-xs text-gray-500 mt-1">{deepReportPaywallCopy.description}</p>
        <div className="grid grid-cols-3 gap-2 mt-4">
          {["3.9", "9.9", "19.9"].map((price) => (
            <button
              key={price}
              type="button"
              onClick={() => {
                setSelectedPaywallPrice(price);
                void postValidationEvent(buildPaywallClickEvent(simulation, price));
              }}
              className={`font-bold text-xs py-3 rounded-xl transition-colors cursor-pointer ${
                selectedPaywallPrice === price
                  ? "bg-amber-500 text-gray-950"
                  : "bg-gray-950 hover:bg-gray-800 text-white"
              }`}
            >
              {price} 元
            </button>
          ))}
        </div>
        {selectedPaywallPrice && (
          <div className="mt-4 space-y-3">
            <input
              value={paywallContact}
              onChange={(event) => setPaywallContact(event.target.value)}
              placeholder={deepReportPaywallCopy.contactPlaceholder}
              className="w-full text-xs p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-300"
            />
            <button
              type="button"
              onClick={() => {
                void postValidationEvent(
                  buildPaywallLeadEvent(simulation, selectedPaywallPrice, paywallContact),
                );
                void postValidationEvent(
                  buildDeepReportUnlockIntentEvent(simulation, selectedPaywallPrice),
                );
                setDeepReportUnlocked(true);
              }}
              className="w-full bg-amber-500 hover:bg-amber-600 text-gray-950 font-black text-xs py-3 rounded-xl cursor-pointer"
            >
              {deepReportPaywallCopy.cta}
            </button>
            {deepReportUnlocked && (
              <p className="text-2xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                已临时解锁深度内容。我们会用你的价格选择验证深度报告价值，不会在这里发起真实扣费。
              </p>
            )}
          </div>
        )}
      </div>

      <OutcomeFeedbackPanel simulation={simulation} />

      {/* User Feedback Panel */}
      <div id="report-feedback-section" className="bg-white rounded-3xl border border-gray-150 p-6 shadow-xs text-left">
        <h2 className="text-base font-bold text-gray-950 mb-1 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-blue-500" />
          <span>这份推演评估符合你的实际直觉吗？</span>
        </h2>
        <p className="text-xs text-gray-500 mb-6">
          你的反馈是沙盘演化最硬核的底层数据！我们会以此调优Agent性格特征。
        </p>

        {feedbackSubmitted ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-8 text-center space-y-3 bg-emerald-50/40 border border-emerald-100 rounded-2xl"
          >
            <span className="text-3xl">🎉</span>
            <h3 className="font-bold text-emerald-800 text-sm">反馈提交成功！</h3>
            <p className="text-2xs text-emerald-600 max-w-sm mx-auto">
              感谢兄弟支持。前 100 位真实反馈的用户将自动获得“试一下”后续高精公测白名单。
            </p>
          </motion.div>
        ) : (
          <form onSubmit={submitFeedback} className="space-y-5">
            {/* Accuracy Rating */}
            <div className="space-y-2">
              <span className="block text-xs font-bold text-gray-800">1. 兄弟，你觉得AI模拟的准确度如何？</span>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {[
                  { value: "准", label: "很准，直击痛点" },
                  { value: "有点用", label: "有点意思" },
                  { value: "一般", label: "凑合，一般" },
                  { value: "不准", label: "不够准/有偏差" },
                  { value: "空泛", label: "太空泛/鸡汤" }
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setFeedbackRating(item.value)}
                    className={`p-2.5 rounded-xl border text-xs font-semibold text-center cursor-pointer transition-colors ${
                      feedbackRating === item.value
                        ? "bg-blue-500 border-blue-500 text-white"
                        : "bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-600"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Price evaluation survey */}
            <div className="space-y-2">
              <span className="block text-xs font-bold text-gray-800">2. 你愿意为这样一份高避坑价值的深度评估计划付多少钱？</span>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {[
                  { value: "0", label: "不愿意付费" },
                  { value: "1.9", label: "1.9 元" },
                  { value: "3.9", label: "3.9 元" },
                  { value: "9.9", label: "9.9 元 (推荐)" },
                  { value: "19.9", label: "19.9 元及以上" }
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setFeedbackPrice(item.value)}
                    className={`p-2.5 rounded-xl border text-xs font-semibold text-center cursor-pointer transition-colors ${
                      feedbackPrice === item.value
                        ? "bg-blue-500 border-blue-500 text-white"
                        : "bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-600"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Text input comments */}
            <div className="space-y-2">
              <label htmlFor="feedback-comment" className="block text-xs font-bold text-gray-800">3. 其他吐嘈或想对开发者说的话 (选填)：</label>
              <textarea
                id="feedback-comment"
                rows={3}
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder={
                  simType === "side_hustle" ? "如：希望能增加‘恋爱聊天模拟’、‘宿舍博弈沙盘’、支持上传小红书截图等等..."
                  : simType === "dating" ? "如：希望能支持直接上传聊天微信截图、智能话术扩写、性格测试一键生成等等..."
                  : "如：希望能加入买房还是租房评估、留学还是考研评估、以及配偶意见加权权重等..."
                }
                className="w-full text-xs p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 bg-gray-50/40"
              />
            </div>

            <button
              id="btn-submit-feedback"
              type="submit"
              className="w-full bg-gray-950 hover:bg-gray-800 text-white font-bold text-xs py-3 rounded-xl transition-colors cursor-pointer text-center"
            >
              提交我的真实反馈
            </button>
          </form>
        )}
      </div>

      {/* Bottom Disclaimer */}
      <div id="report-bottom-credits" className="text-center pt-4">
        <p className="text-2xs text-gray-400 font-mono">
          试一下 | Powered by Google Gemini 3.5 Flash & Antigravity Agent
        </p>
      </div>
      
    </div>
  );
}
