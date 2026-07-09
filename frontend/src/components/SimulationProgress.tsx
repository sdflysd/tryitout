import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertCircle, Bot, ShieldAlert, Sparkles, Terminal } from "lucide-react";
import AgentSandboxLive from "./AgentSandboxLive";
import type { SimulationProgressEvent, SimulationType } from "../types";
import { DEFAULT_LANGUAGE, Language } from "../language";

interface SimulationProgressProps {
  isGenerating: boolean;
  simulationType: SimulationType;
  errorMsg?: string;
  canResume?: boolean;
  onRetry?: () => void;
  onCancel?: () => void;
  progressEvent?: SimulationProgressEvent | null;
  language?: Language;
  elapsedMs?: number;
}

type ProgressLog = {
  text: string;
  delay: number;
};

type ProgressCopy = {
  logs: ProgressLog[];
  heading: string;
  subHeading: string;
  progressLabel: string;
  tipLead: string;
  tipBody: string;
  accentBg: string;
  accentText: string;
  accentBorder: string;
  tipBg: string;
  tipBorder: string;
  tipText: string;
  icon: "cpu" | "heart" | "compass";
};

type ProgressDisplayState = {
  percent: number;
  logs: string[];
  activeMessage: string;
};

type FriendlyProgressCopy = {
  activeMessage: string;
  logs: string[];
};

const LOG_DELAYS = [
  0,
  2000,
  4500,
  7000,
  9500,
  12000,
  14500,
  17000,
  19500,
  22000,
  24500,
  27000,
  29500,
  32000,
  34500,
  37000,
];

function withDelays(texts: string[]): ProgressLog[] {
  return texts.map((text, index) => ({
    text,
    delay: LOG_DELAYS[index] ?? index * 2500,
  }));
}

export function getSimulationProgressCopy(
  type: SimulationType,
  language: Language = DEFAULT_LANGUAGE,
): ProgressCopy {
  if (language === "en-US") {
    if (type === "dating") {
      return {
        logs: withDelays([
          "Parsing your relationship status, conflict trigger, and planned message...",
          "Extracting safety, boundaries, and emotional risk zones...",
          "Generating 7 relationship Agents: you, TA, coach, boundaries, and reality checks...",
          "TA Agent is entering the sandbox to simulate guarded expectations and real responses...",
          "Communication Coach Agent is marking what helps and what hurts...",
          "External Pressure Agent is checking misunderstandings, rivals, and real-life friction...",
          "Relationship Analyst Agent is calculating warmth and communication resistance...",
          "[Sandbox online] Simulating the next 30 days of relationship interaction...",
          "> Days 1-3: first response and repair test...",
          "> Days 4-7: pacing, warmth, and restraint...",
          "> Days 8-15: old friction and core conflict may resurface...",
          "> Days 16-23: trust rebuild or cooldown pressure...",
          "> Days 24-30: outcome narrows toward closeness, distance, or letting go...",
          "Relationship Coach Agent is summarizing shifts, risks, and repair strategy...",
          "Drafting a 7-day high-EQ communication calendar...",
          "Rendering the final relationship decision report and share card...",
        ]),
        heading: "Building the AI relationship multi-agent sandbox...",
        subHeading: "We are simulating 7 emotional roles over the next 30 days around TA's response, communication rhythm, and relationship safety. Keep this page open while the Agents finish the run.",
        progressLabel: "Calculating relationship simulation confidence...",
        tipLead: "Relationship sandbox note:",
        tipBody: "We simulate 5 stages because many relationships do not break on one sentence, but on follow-up pressure, old triggers, or unstable pacing. Seeing the rhythm first is cheaper than testing it live.",
        accentBg: "bg-rose-500",
        accentText: "text-rose-500",
        accentBorder: "border-rose-300",
        tipBg: "bg-rose-50/60",
        tipBorder: "border-rose-100",
        tipText: "text-rose-800",
        icon: "heart",
      };
    }

    if (type === "life_choice") {
      return {
        logs: withDelays([
          "Parsing your options, real resources, and biggest fear...",
          "Extracting opportunity cost, regret risk, and survival assumptions...",
          "Generating 7 decision Agents: self, route advocates, peers, family, resources, and fear...",
          "Primary Route Agent is entering to amplify upside and hidden costs...",
          "Alternative Route Agent is calculating stability and ceiling limits...",
          "Peer Pressure Agent is simulating comparison, FOMO, and mental drag...",
          "Survival Baseline Agent is checking cash buffer and worst-case resilience...",
          "[Sandbox online] Simulating 30 days of decision friction...",
          "> Days 1-3: competing voices enter at once...",
          "> Days 4-7: small attempts and sunk-cost signals begin...",
          "> Days 8-15: the hardest pain points become visible...",
          "> Days 16-23: opportunity cost and regret push back...",
          "> Days 24-30: results converge around long-term value and reality costs...",
          "Life Coach Agent is summarizing trade-offs, upside, and fallback routes...",
          "Drafting a 7-day regret-defense checklist...",
          "Rendering the final life choice report and share card...",
        ]),
        heading: "Building the AI life-choice multi-agent sandbox...",
        subHeading: "We are simulating 7 real-world voices over the next 30 days around opportunity cost, stress tolerance, and survival baseline. Keep this page open while the Agents finish the run.",
        progressLabel: "Calculating life-choice simulation confidence...",
        tipLead: "Decision sandbox note:",
        tipBody: "Major choices are rarely hard only at the moment of decision. The hard parts often show up in delayed pressure, regret, and resource limits. Simulating them first helps you move with less fog.",
        accentBg: "bg-indigo-600",
        accentText: "text-indigo-500",
        accentBorder: "border-indigo-300",
        tipBg: "bg-indigo-50/60",
        tipBorder: "border-indigo-100",
        tipText: "text-indigo-800",
        icon: "compass",
      };
    }

    return {
      logs: withDelays([
        "Parsing your side-hustle idea and current resources...",
        "Extracting the 4 core business validation assumptions...",
        "Generating 7 business Agents with different incentives...",
        "Target Customer Agent is entering to test pain intensity and budget resistance...",
        "Competitor Agent is checking commoditization and free alternatives...",
        "Platform Traffic Agent is simulating cold-start friction across channels...",
        "Execution Coach Agent is estimating how your available time converts into output...",
        "[Sandbox online] Simulating a 30-day business worldline...",
        "> Days 1-3: idea meets execution detail creep...",
        "> Days 4-7: first MVP test meets real feedback...",
        "> Days 8-15: acquisition test exposes traffic quality...",
        "> Days 16-23: bottlenecks, energy dips, and pivot decisions appear...",
        "> Days 24-30: trial users, paid conversion, and cash flow are reconciled...",
        "Business Analyst Agent is summarizing gains, risks, and pivot strategy...",
        "Execution Coach is drafting next week's 7-day MVP action plan...",
        "Rendering the final decision report and share card...",
      ]),
      heading: "Building the AI business multi-agent sandbox...",
      subHeading: "We are simulating 7 roles over the next 30 days around target customer demand, competitors, platform traffic, execution, and cash flow. Keep this page open while the Agents finish the run.",
      progressLabel: "Calculating sandbox simulation confidence...",
      tipLead: "Sandbox note:",
      tipBody: "We simulate 5 stages because many side-hustle ideas fail after the first traffic test or when energy and cash flow start to bite. A dry run can save real money and time.",
      accentBg: "bg-amber-500",
      accentText: "text-amber-500",
      accentBorder: "border-amber-300",
      tipBg: "bg-amber-50/60",
      tipBorder: "border-amber-100",
      tipText: "text-amber-800",
      icon: "cpu",
    };
  }

  if (type === "dating") {
    return {
      logs: withDelays([
        "正在拆解你的恋爱状态、冲突导火索与待发送话术...",
        "正在抽提这段关系里的安全感、边界感与情绪雷区...",
        "正在生成 7 个情感博弈 Agent：你、TA、情感教练与现实声音...",
        "TA Agent 正在入场，模拟慢热、防备、期待与真实回应...",
        "情感教练 Agent 正在标注话术里的加分点和扣分点...",
        "外部干扰 Agent 正在评估误会、竞争者与现实压力...",
        "关系分析师 Agent 正在计算亲密契合度与沟通阻力...",
        "【沙盘启动】开始演绎 30 天情感互动世界线...",
        "▶ 推演第 1-3 天：破冰与回应测试，观察 TA 的第一反应...",
        "▶ 推演第 4-7 天：暧昧拉扯与情绪流动，避免用力过猛...",
        "▶ 推演第 8-15 天：核心矛盾逼近，旧雷区可能再次冒头...",
        "▶ 推演第 16-23 天：信任重建或关系降温，心态迎来考验...",
        "▶ 推演第 24-30 天：关系走向收束，判断升温、退回或放手...",
        "情感教练 Agent 正在汇总心理变化、风险点与破局策略...",
        "正在起草接下来 7 天的高情商沟通日历...",
        "正在渲染合成最终情感决策报告与分享卡片...",
      ]),
      heading: "正在构建 AI 恋爱沟通多智能体沙盘...",
      subHeading: "我们正在模拟 7 种情感角色未来 30 天围绕 TA 回应、沟通节奏与关系安全感的变化。请保持页面打开，Agent 会持续输出运行进度。",
      progressLabel: "情感关系演绎置信度计算中...",
      tipLead: "恋爱沙盘提醒：",
      tipBody: "我们推演 5 个阶段，是因为很多关系不是毁在一句话，而是毁在第 4-7 天的追问、第 8-15 天的旧雷区复燃，或第 16-23 天心态失衡。先在沙盘里看清互动节奏，比现实里硬碰硬更值。",
      accentBg: "bg-rose-500",
      accentText: "text-rose-500",
      accentBorder: "border-rose-300",
      tipBg: "bg-rose-50/60",
      tipBorder: "border-rose-100",
      tipText: "text-rose-800",
      icon: "heart",
    };
  }

  if (type === "life_choice") {
    return {
      logs: withDelays([
        "正在拆解你的几个选择、现实资源与最大恐惧...",
        "正在抽提机会成本、后悔风险与生存底线假设...",
        "正在生成 7 个抉择博弈 Agent：自我、选项游说家、同辈与长辈声音...",
        "主推方向 Agent 正在入场，放大它的收益与隐性代价...",
        "备选方向 Agent 正在入场，核算稳定感与天花板限制...",
        "同辈压力 Agent 正在模拟 FOMO、比较与精神内耗...",
        "生存底线精算师 Agent 正在评估现金缓冲和最坏情况...",
        "【沙盘启动】开始演绎 30 天抉择摩擦世界线...",
        "▶ 推演第 1-3 天：抉择撕裂期，各种声音同时入场...",
        "▶ 推演第 4-7 天：模拟尝试与沉没成本，开始真实动起来...",
        "▶ 推演第 8-15 天：痛点爆发期，看见该选项最难熬的一面...",
        "▶ 推演第 16-23 天：机会成本反扑，后悔感开始攻击心态...",
        "▶ 推演第 24-30 天：结果收束，核算长线增值与现实损益...",
        "人生教练 Agent 正在汇总各个方向的代价、红利与退路...",
        "正在起草接下来 7 天的后悔防御行动清单...",
        "正在渲染合成最终人生抉择报告与分享卡片...",
      ]),
      heading: "正在构建 AI 人生抉择多智能体沙盘...",
      subHeading: "我们正在模拟 7 种现实声音未来 30 天围绕机会成本、心理承受力与生存底线的拉扯。请保持页面打开，Agent 会持续输出运行进度。",
      progressLabel: "人生抉择演绎置信度计算中...",
      tipLead: "抉择沙盘提醒：",
      tipBody: "我们推演 5 个阶段，是因为重大选择最难的不是做决定那一秒，而是第 8-15 天痛点爆发、第 16-23 天后悔感反扑。提前把代价摊开，才能少被情绪牵着走。",
      accentBg: "bg-indigo-600",
      accentText: "text-indigo-500",
      accentBorder: "border-indigo-300",
      tipBg: "bg-indigo-50/60",
      tipBorder: "border-indigo-100",
      tipText: "text-indigo-800",
      icon: "compass",
    };
  }

  return {
    logs: withDelays([
      "正在拆解分析你的副业想法与现存一手资源...",
      "正在抽提该项目的 4 个核心商业验证底层假设...",
      "正在生成 7 个态度迥异的利益博弈 Agent 智能体角色...",
      "目标客户 Agent 正在加入世界线，模拟痛点真实度与预算抗阻...",
      "竞品 Agent 正在入场博弈，检测同质化免费替代方案威胁...",
      "平台流量 Agent 开始运算，演绎小红书/闲鱼算法冷启动摩擦...",
      "执行教练 Agent 正在加入，评估你每天所投时间的真实转化率...",
      "【沙盘启动】开始演绎 30 天世界历程...",
      "▶ 推演第 1-3 天：想法落地期，热血冲动遇上细节膨胀...",
      "▶ 推演第 4-7 天：第一期 MVP测试，遭遇真实反馈拷打...",
      "▶ 推演第 8-15 天：首次获客试水，同业压迫与流量失焦...",
      "▶ 推演第 16-23 天：瓶颈暴露，心态出现波动，面临生死决策...",
      "▶ 推演第 24-30 天：结果收束，试用用户/付费转化大盘算账...",
      "商业分析师 Agent 正在汇总损益、分析机会并制定转型策略...",
      "执行教练正在起草下周 7 天 MVP 爆款落地执行红书计划书...",
      "正在渲染合成最终深度决策报告与多渠道分享卡片...",
    ]),
    heading: "正在构建 AI 利益博弈多智能体沙盘...",
    subHeading: "我们正在用 Gemini 超脑模拟 7 种角色未来 30 天在目标渠道下的摩擦演变。请保持页面打开，Agent 会持续输出运行进度。",
    progressLabel: "沙盘演绎置信度计算中...",
    tipLead: "兄弟懂门道：",
    tipBody: "为什么我们要推演 5 个阶段？因为 90% 的副业想法都在第 8-15 天（获客期发现没流量）或者第 16-23 天（精力不够/心态崩溃）死掉。提前在沙盘模拟一次死法，能在现实中帮你省下大笔冤枉钱和时间。",
    accentBg: "bg-amber-500",
    accentText: "text-amber-500",
    accentBorder: "border-amber-300",
    tipBg: "bg-amber-50/60",
    tipBorder: "border-amber-100",
    tipText: "text-amber-800",
    icon: "cpu",
  };
}

export function getProgressDisplayState(
  progressEvent?: SimulationProgressEvent | null,
  language: Language = DEFAULT_LANGUAGE,
  simulationType?: SimulationType,
): ProgressDisplayState {
  if (!progressEvent) {
    if (language === "en-US") {
      return {
        percent: 0,
        logs: ["Waiting for backend progress events and opening the sandbox connection..."],
        activeMessage: "Waiting for backend progress events...",
      };
    }

    return {
      percent: 0,
      logs: ["等待后端进度事件，正在建立沙盘连接..."],
      activeMessage: "等待后端进度事件...",
    };
  }

  if (progressEvent.status !== "queued" && simulationType !== undefined) {
    const friendlyCopy = getFriendlyProgressCopy(progressEvent, language, simulationType);
    return {
      percent: progressEvent.percent,
      logs: friendlyCopy.logs,
      activeMessage: friendlyCopy.activeMessage,
    };
  }

  return {
    percent: progressEvent.percent,
    logs: [progressEvent.message],
    activeMessage: progressEvent.message,
  };
}

function getFriendlyProgressCopy(
  progressEvent: SimulationProgressEvent,
  language: Language,
  simulationType: SimulationType,
): FriendlyProgressCopy {
  const copy = language === "en-US"
    ? getEnglishFriendlyProgressCopy(progressEvent, simulationType)
    : getChineseFriendlyProgressCopy(progressEvent, simulationType);
  const backendMessage = shouldIncludeBackendProgressMessage(progressEvent.message)
    ? progressEvent.message
    : undefined;

  return {
    activeMessage: copy.activeMessage,
    logs: backendMessage === undefined
      ? copy.logs
      : [...copy.logs, backendMessage],
  };
}

function getChineseFriendlyProgressCopy(
  progressEvent: SimulationProgressEvent,
  simulationType: SimulationType,
): FriendlyProgressCopy {
  const stageLabel = getChineseStageLabel(progressEvent.stageIndex);
  const suffix = getChineseStatusSuffix(progressEvent.status);

  if (progressEvent.step === "safety_check") {
    return {
      activeMessage: `正在检查输入边界与安全风险${suffix}`,
      logs: [
        "正在识别敏感内容、现实风险和不适合推演的方向...",
        "正在确认沙盘可以在安全边界内继续运行...",
      ],
    };
  }

  if (progressEvent.step === "generate_agents") {
    return getChineseAgentCreationCopy(simulationType, suffix);
  }

  if (progressEvent.step === "initialize_world_state") {
    return {
      activeMessage: `正在初始化 30 天沙盘世界状态${suffix}`,
      logs: getChineseWorldStateLogs(simulationType),
    };
  }

  if (progressEvent.step === "generate_world_event") {
    return {
      activeMessage: `正在生成${stageLabel}的关键外部事件${suffix}`,
      logs: [
        `正在为${stageLabel}加入真实世界变量、压力和意外反馈...`,
        getChineseStageContext(progressEvent.stageIndex, simulationType),
      ],
    };
  }

  if (progressEvent.step === "generate_agent_actions") {
    return {
      activeMessage: `正在让 Agent 进行${stageLabel}互动博弈${suffix}`,
      logs: [
        `各个 Agent 正在根据${stageLabel}事件给出回应、质疑、支持和投票...`,
        getChineseStageContext(progressEvent.stageIndex, simulationType),
      ],
    };
  }

  if (progressEvent.step === "arbitrate_stage") {
    return {
      activeMessage: `正在仲裁${stageLabel}结果并更新沙盘状态${suffix}`,
      logs: [
        "裁判 Agent 正在汇总各方投票，合并状态变化...",
        `正在把${stageLabel}的结果写回 30 天世界线...`,
      ],
    };
  }

  if (progressEvent.step === "simulate_stage") {
    return {
      activeMessage: `正在推演${stageLabel}${suffix}`,
      logs: [
        getChineseStageContext(progressEvent.stageIndex, simulationType),
        `正在记录${stageLabel}的关键转折、风险和机会...`,
      ],
    };
  }

  if (progressEvent.step === "generate_report") {
    return {
      activeMessage: `正在生成最终决策报告${suffix}`,
      logs: [
        "分析师 Agent 正在汇总 30 天沙盘里的收益、风险和转向信号...",
        "正在整理可执行建议、未来 7 天行动表和关键提醒...",
      ],
    };
  }

  return {
    activeMessage: `正在生成路线对比沙盘${suffix}`,
    logs: [
      "正在对比主路线、备选路线和放弃路线的收益与代价...",
      "正在把不同选择的现实成本整理进最终报告...",
    ],
  };
}

function getEnglishFriendlyProgressCopy(
  progressEvent: SimulationProgressEvent,
  simulationType: SimulationType,
): FriendlyProgressCopy {
  const stageLabel = getEnglishStageLabel(progressEvent.stageIndex);
  const suffix = getEnglishStatusSuffix(progressEvent.status);

  if (progressEvent.step === "safety_check") {
    return {
      activeMessage: `Checking boundaries and safety risks${suffix}`,
      logs: [
        "Scanning the input for sensitive constraints and risky directions...",
        "Confirming the sandbox can continue inside safe boundaries...",
      ],
    };
  }

  if (progressEvent.step === "generate_agents") {
    return getEnglishAgentCreationCopy(simulationType, suffix);
  }

  if (progressEvent.step === "initialize_world_state") {
    return {
      activeMessage: `Initializing the 30-day sandbox world state${suffix}`,
      logs: getEnglishWorldStateLogs(simulationType),
    };
  }

  if (progressEvent.step === "generate_world_event") {
    return {
      activeMessage: `Generating the key outside event for ${stageLabel}${suffix}`,
      logs: [
        `Adding real-world variables, pressure, and surprise feedback for ${stageLabel}...`,
        getEnglishStageContext(progressEvent.stageIndex, simulationType),
      ],
    };
  }

  if (progressEvent.step === "generate_agent_actions") {
    return {
      activeMessage: `Running Agent interaction for ${stageLabel}${suffix}`,
      logs: [
        `Agents are responding, challenging, supporting, and voting around ${stageLabel}...`,
        getEnglishStageContext(progressEvent.stageIndex, simulationType),
      ],
    };
  }

  if (progressEvent.step === "arbitrate_stage") {
    return {
      activeMessage: `Arbitrating ${stageLabel} and updating sandbox state${suffix}`,
      logs: [
        "The Arbiter Agent is merging votes and state changes...",
        `Writing the ${stageLabel} outcome back into the 30-day worldline...`,
      ],
    };
  }

  if (progressEvent.step === "simulate_stage") {
    return {
      activeMessage: `Simulating ${stageLabel}${suffix}`,
      logs: [
        getEnglishStageContext(progressEvent.stageIndex, simulationType),
        `Recording the key turns, risks, and opportunities in ${stageLabel}...`,
      ],
    };
  }

  if (progressEvent.step === "generate_report") {
    return {
      activeMessage: `Generating the final decision report${suffix}`,
      logs: [
        "The analyst Agent is summarizing gains, risks, and pivot signals from the 30-day sandbox...",
        "Preparing the next 7 days of actions and practical warnings...",
      ],
    };
  }

  return {
    activeMessage: `Generating the route comparison sandbox${suffix}`,
    logs: [
      "Comparing the main route, backup route, and stop route across upside and costs...",
      "Folding the real-world trade-offs into the final report...",
    ],
  };
}

function getChineseAgentCreationCopy(
  simulationType: SimulationType,
  suffix: string,
): FriendlyProgressCopy {
  if (simulationType === "dating") {
    return {
      activeMessage: `正在创建 7 个情感沟通智能体${suffix}`,
      logs: [
        "TA Agent 正在入场，模拟慢热、防备、期待与真实回应...",
        "情感教练 Agent 正在标注话术里的加分点和扣分点...",
        "外部干扰 Agent 正在加入，评估误会、竞争者与现实压力...",
      ],
    };
  }

  if (simulationType === "life_choice") {
    return {
      activeMessage: `正在创建 7 个人生抉择智能体${suffix}`,
      logs: [
        "主推方向 Agent 正在入场，放大收益与隐性代价...",
        "备选方向 Agent 正在核算稳定感与天花板限制...",
        "生存底线精算师 Agent 正在评估现金缓冲和最坏情况...",
      ],
    };
  }

  return {
    activeMessage: `正在创建 7 个商业智能体${suffix}`,
    logs: [
      "目标客户 Agent 正在入场，测试痛点真实度与预算抗阻...",
      "竞品 Agent 正在检查同质化和免费替代方案威胁...",
      "平台流量 Agent 正在推演冷启动摩擦与获客质量...",
    ],
  };
}

function getEnglishAgentCreationCopy(
  simulationType: SimulationType,
  suffix: string,
): FriendlyProgressCopy {
  if (simulationType === "dating") {
    return {
      activeMessage: `Creating 7 relationship Agents${suffix}`,
      logs: [
        "TA Agent is entering to model guarded expectations and real responses...",
        "Communication Coach Agent is marking what helps and what hurts...",
        "External Pressure Agent is checking misunderstandings, rivals, and real-life friction...",
      ],
    };
  }

  if (simulationType === "life_choice") {
    return {
      activeMessage: `Creating 7 life-choice Agents${suffix}`,
      logs: [
        "Primary Route Agent is entering to amplify upside and hidden costs...",
        "Alternative Route Agent is calculating stability and ceiling limits...",
        "Survival Baseline Agent is checking cash buffer and worst-case resilience...",
      ],
    };
  }

  return {
    activeMessage: `Creating 7 business Agents${suffix}`,
    logs: [
      "Target Customer Agent is entering to test pain intensity and budget resistance...",
      "Competitor Agent is checking commoditization and free alternatives...",
      "Platform Traffic Agent is simulating cold-start friction and acquisition quality...",
    ],
  };
}

function getChineseWorldStateLogs(simulationType: SimulationType): string[] {
  if (simulationType === "dating") {
    return [
      "正在设置 TA 回应、沟通节奏、边界感和关系温度...",
      "正在把旧矛盾、现实压力和情绪波动写入初始状态...",
    ];
  }
  if (simulationType === "life_choice") {
    return [
      "正在设置资源、机会成本、心理承受力和生存底线...",
      "正在把后悔风险、家庭影响和同辈比较写入初始状态...",
    ];
  }
  return [
    "正在设置目标客户、竞品压力、流量冷启动和现金流变量...",
    "正在把时间投入、预算限制和执行能量写入初始状态...",
  ];
}

function getEnglishWorldStateLogs(simulationType: SimulationType): string[] {
  if (simulationType === "dating") {
    return [
      "Setting TA's response pattern, communication rhythm, boundaries, and relationship warmth...",
      "Writing old friction, real-life pressure, and emotional swings into the initial state...",
    ];
  }
  if (simulationType === "life_choice") {
    return [
      "Setting resources, opportunity cost, stress tolerance, and survival baseline...",
      "Writing regret risk, family impact, and peer comparison into the initial state...",
    ];
  }
  return [
    "Setting target customers, competitor pressure, traffic cold start, and cash-flow variables...",
    "Writing time budget, money limits, and execution energy into the initial state...",
  ];
}

function getChineseStageContext(
  stageIndex: number | undefined,
  simulationType: SimulationType,
): string {
  const stage = Math.max(1, Math.min(5, stageIndex ?? 1));
  const sideHustle = [
    "▶ 推演第 1-3 天：想法落地期，热血冲动遇上执行细节...",
    "▶ 推演第 4-7 天：第一期 MVP 测试，遭遇真实反馈...",
    "▶ 推演第 8-15 天：首次获客试水，暴露流量质量和竞品压力...",
    "▶ 推演第 16-23 天：瓶颈暴露，精力、预算和转向决策开始拉扯...",
    "▶ 推演第 24-30 天：结果收束，核算试用用户、付费转化和现金流...",
  ];
  const dating = [
    "▶ 推演第 1-3 天：破冰与回应测试，观察 TA 的第一反应...",
    "▶ 推演第 4-7 天：暧昧拉扯与情绪流动，避免用力过猛...",
    "▶ 推演第 8-15 天：核心矛盾逼近，旧雷区可能再次冒头...",
    "▶ 推演第 16-23 天：信任重建或关系降温，心态迎来考验...",
    "▶ 推演第 24-30 天：关系走向收束，判断升温、退回或放手...",
  ];
  const lifeChoice = [
    "▶ 推演第 1-3 天：抉择撕裂期，各种声音同时入场...",
    "▶ 推演第 4-7 天：模拟尝试与沉没成本，开始真实动起来...",
    "▶ 推演第 8-15 天：痛点爆发期，看见该选项最难熬的一面...",
    "▶ 推演第 16-23 天：机会成本反扑，后悔感开始攻击心态...",
    "▶ 推演第 24-30 天：结果收束，核算长线增值与现实损益...",
  ];

  if (simulationType === "dating") {
    return dating[stage - 1];
  }
  if (simulationType === "life_choice") {
    return lifeChoice[stage - 1];
  }
  return sideHustle[stage - 1];
}

function getEnglishStageContext(
  stageIndex: number | undefined,
  simulationType: SimulationType,
): string {
  const stage = Math.max(1, Math.min(5, stageIndex ?? 1));
  const sideHustle = [
    "> Days 1-3: idea meets execution detail creep...",
    "> Days 4-7: first MVP test meets real feedback...",
    "> Days 8-15: acquisition test exposes traffic quality and competitor pressure...",
    "> Days 16-23: bottlenecks, energy dips, and pivot decisions appear...",
    "> Days 24-30: trial users, paid conversion, and cash flow are reconciled...",
  ];
  const dating = [
    "> Days 1-3: first response and repair test...",
    "> Days 4-7: pacing, warmth, and restraint...",
    "> Days 8-15: old friction and core conflict may resurface...",
    "> Days 16-23: trust rebuild or cooldown pressure...",
    "> Days 24-30: outcome narrows toward closeness, distance, or letting go...",
  ];
  const lifeChoice = [
    "> Days 1-3: competing voices enter at once...",
    "> Days 4-7: small attempts and sunk-cost signals begin...",
    "> Days 8-15: the hardest pain points become visible...",
    "> Days 16-23: opportunity cost and regret push back...",
    "> Days 24-30: results converge around long-term value and reality costs...",
  ];

  if (simulationType === "dating") {
    return dating[stage - 1];
  }
  if (simulationType === "life_choice") {
    return lifeChoice[stage - 1];
  }
  return sideHustle[stage - 1];
}

function getChineseStageLabel(stageIndex: number | undefined): string {
  const labels = ["第 1-3 天", "第 4-7 天", "第 8-15 天", "第 16-23 天", "第 24-30 天"];
  return labels[Math.max(1, Math.min(5, stageIndex ?? 1)) - 1];
}

function getEnglishStageLabel(stageIndex: number | undefined): string {
  const labels = ["days 1-3", "days 4-7", "days 8-15", "days 16-23", "days 24-30"];
  return labels[Math.max(1, Math.min(5, stageIndex ?? 1)) - 1];
}

function getChineseStatusSuffix(status: SimulationProgressEvent["status"]): string {
  if (status === "completed") {
    return "完成";
  }
  if (status === "failed") {
    return "失败";
  }
  return "";
}

function getEnglishStatusSuffix(status: SimulationProgressEvent["status"]): string {
  if (status === "completed") {
    return " completed";
  }
  if (status === "failed") {
    return " failed";
  }
  return "";
}

function shouldIncludeBackendProgressMessage(message: string): boolean {
  return !/^[\s\S]*(?:generate_agents|generate_agent_actions|generate_world_event|arbitrate_stage|simulate_stage|initialize_world_state|generate_report|generate_route_comparison|safety_check)[\s\S]*$/.test(message);
}

function formatElapsedRuntime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function SimulationProgress({
  isGenerating,
  simulationType,
  errorMsg,
  canResume = false,
  onRetry,
  onCancel,
  progressEvent,
  language = DEFAULT_LANGUAGE,
  elapsedMs,
}: SimulationProgressProps) {
  const [visibleLogs, setVisibleLogs] = useState<string[]>(
    () => getProgressDisplayState(progressEvent, language, simulationType).logs,
  );
  const [startedAt, setStartedAt] = useState<number | null>(
    () => elapsedMs === undefined && isGenerating ? Date.now() : null,
  );
  const [liveElapsedMs, setLiveElapsedMs] = useState(0);
  const isEnglish = language === "en-US";
  const copy = useMemo(
    () => getSimulationProgressCopy(simulationType, language),
    [simulationType, language],
  );
  const displayState = useMemo(
    () => getProgressDisplayState(progressEvent, language, simulationType),
    [progressEvent, language, simulationType],
  );
  const percent = displayState.percent;
  const shownElapsedMs = elapsedMs ?? liveElapsedMs;
  const elapsedLabel = isEnglish ? "Elapsed" : "已运行";
  const formattedElapsed = formatElapsedRuntime(shownElapsedMs);

  useEffect(() => {
    if (elapsedMs !== undefined) {
      return;
    }

    if (!isGenerating) {
      setStartedAt(null);
      return;
    }

    setStartedAt((currentStartedAt) => currentStartedAt ?? Date.now());
  }, [elapsedMs, isGenerating]);

  useEffect(() => {
    if (elapsedMs !== undefined || !isGenerating || startedAt === null) {
      return;
    }

    const updateElapsed = () => setLiveElapsedMs(Date.now() - startedAt);
    updateElapsed();
    const timerId = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timerId);
  }, [elapsedMs, isGenerating, startedAt]);

  // Render backend progress events as the terminal feed.
  useEffect(() => {
    if (!isGenerating) return;
    setVisibleLogs((prev) => {
      const nextLogs = displayState.logs.filter((log) => !prev.includes(log));
      return [...prev, ...nextLogs].slice(-16);
    });
  }, [displayState.logs, isGenerating]);

  // Scroll to bottom of terminal automatically
  useEffect(() => {
    const term = document.getElementById("terminal-screen");
    if (term) {
      term.scrollTop = term.scrollHeight;
    }
  }, [visibleLogs]);

  if (errorMsg) {
    return (
      <div id="simulation-error-container" className="max-w-md mx-auto px-4 py-12 text-center">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white border border-rose-200 rounded-2xl p-6 shadow-md text-left"
        >
          <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-600 mb-4">
            <ShieldAlert className="w-6 h-6" />
          </div>
          
          <h2 id="sim-error-title" className="text-lg font-bold text-gray-950 mb-2">
            {isEnglish ? "Sandbox simulation failed" : "沙盘模拟计算失败"}
          </h2>
          <p id="sim-error-desc" className="text-xs text-gray-600 leading-relaxed mb-6">
            {isEnglish
              ? "The model run did not complete. This may be a temporary model or server issue. Error details:"
              : "抱歉兄弟，模型计算似乎开小差了，或者是你的想法太奇妙，AI在演绎过程中撞墙了。报错信息如下："}
            <br />
            <span className="block bg-gray-50 text-rose-700 p-3 rounded-lg font-mono text-2xs mt-2 border border-gray-150 overflow-x-auto whitespace-pre-wrap">
              {errorMsg}
            </span>
          </p>

          <div className="flex gap-3">
            {onRetry && (
              <button
                id="btn-retry-simulation"
                onClick={onRetry}
                className="flex-1 bg-gray-950 hover:bg-gray-850 text-white font-semibold text-xs py-2.5 rounded-lg transition-colors cursor-pointer text-center"
              >
                {canResume
                  ? isEnglish ? "Resume simulation" : "继续模拟"
                  : isEnglish ? "Restart simulation" : "重新开始模拟"}
              </button>
            )}
            {onCancel && (
              <button
                id="btn-cancel-simulation"
                onClick={onCancel}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs py-2.5 rounded-lg transition-colors cursor-pointer text-center"
              >
                {isEnglish ? "Edit input" : "修改输入配置"}
              </button>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div id="simulation-progress-container" className="mx-auto w-full max-w-6xl bg-[#050711] py-6 text-white md:py-8">
      <AgentSandboxLive simulationType={simulationType} progressEvent={progressEvent} language={language} />

      <div className="mx-auto max-w-3xl px-4">
        <div className="rounded-3xl border border-white/10 bg-white/[0.055] p-4 text-left shadow-xl shadow-black/20 backdrop-blur-xl sm:p-5">
          <div className="mb-4">
            <h2 id="progress-heading" className="mb-1.5 flex items-center gap-1.5 text-base font-black text-white">
              <Sparkles className="h-4.5 w-4.5 text-amber-200" aria-hidden="true" />
              <span>{copy.heading}</span>
            </h2>
            <p id="progress-sub-heading" className="text-xs leading-5 text-white/54">
              {copy.subHeading}
            </p>
          </div>

          {/* Progress Bar */}
          <div id="progress-bar-wrapper">
            <div className="mb-1.5 flex items-center justify-between gap-3 text-xs font-bold text-white/70">
              <span className="flex min-w-0 items-center gap-1">
                <Bot className="h-3.5 w-3.5 shrink-0 text-amber-200" aria-hidden="true" />
                <span className="truncate">{displayState.activeMessage}</span>
              </span>
              <span className="font-mono">{percent}%</span>
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label={copy.progressLabel}
              className="h-2.5 w-full overflow-hidden rounded-full border border-white/10 bg-white/12"
            >
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-amber-200 via-orange-300 to-fuchsia-300"
                animate={{ width: `${percent}%` }}
                transition={{ duration: 0.2 }}
              />
            </div>
            <div
              id="progress-elapsed-runtime"
              className="mt-1.5 flex justify-end font-mono text-2xs font-semibold text-white/48"
              aria-live="polite"
            >
              <span>{elapsedLabel} {formattedElapsed}</span>
            </div>
          </div>
        </div>

        {/* Terminal Screen Console */}
        <div 
          id="terminal-container"
          className="mt-5 rounded-3xl border border-white/10 bg-black/70 p-4 text-left shadow-2xl shadow-black/30"
        >
          <div id="terminal-header" className="mb-3 flex items-center justify-between border-b border-white/10 pb-2.5 font-mono text-2xs text-white/42">
            <div className="flex items-center gap-2">
              <Terminal className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
              <span>AGENT_SANDBOX_STDOUT</span>
            </div>
            <span className="animate-pulse text-emerald-500">● LIVE CONSOLE</span>
          </div>

          <div 
            id="terminal-screen"
            className="h-60 space-y-1.5 overflow-y-auto pr-2 font-mono text-[11px] leading-relaxed text-white/72 scrollbar-thin scrollbar-thumb-gray-800 scroll-smooth"
          >
            <AnimatePresence>
              {visibleLogs.map((log, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-start gap-1.5"
                >
                  <span className="select-none text-amber-500">&gt;</span>
                  <span className={log.startsWith("▶") ? "font-semibold text-amber-300" : "text-white/72"}>
                    {log}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
            <div className="ml-1 inline-block h-3.5 w-1.5 animate-ping bg-amber-500" />
          </div>
        </div>

        {/* Sandbox Tip Card */}
        <div id="sandbox-tip-card" className="mt-5 flex items-start gap-2.5 rounded-3xl border border-amber-200/20 bg-amber-200/8 p-4 text-left">
          <AlertCircle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-amber-200" aria-hidden="true" />
          <p className="text-2xs leading-relaxed text-amber-50/76">
            <span className="font-bold">{copy.tipLead}</span>{copy.tipBody}
          </p>
        </div>
      </div>
    </div>
  );
}
