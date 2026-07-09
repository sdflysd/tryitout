import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Play, Check, BadgeAlert, Flame, Heart, Compass, ListChecks, Plus, Trash2, X } from "lucide-react";
import { AgentRuntimeCapabilities, UserInput, SimulationType } from "../types";
import type { ProviderMode } from "../contracts/commercial";
import { getDeepModeCopy, getDeepModeDisabledCopy } from "./deep-mode-copy";
import { getStartSimulationButtonLabel } from "./input-view-copy";
import { getPrivacySafetyCopy } from "./privacy-copy";
import { DEFAULT_LANGUAGE, Language } from "../language";
import {
  CUSTOM_OPTION_VALUE,
  resolveCustomMultiChoice,
  resolveCustomSingleChoice,
} from "./custom-option-inputs";
import {
  DEFAULT_LIFE_CHOICE_FINANCIAL_BUFFER,
  LIFE_CHOICE_FINANCIAL_BUFFER_OPTIONS,
  LIFE_CHOICE_FINANCIAL_BUFFER_QUESTION,
} from "./life-choice-form-options";
import {
  EditableLifeChoiceOption,
  buildLifeChoiceSubmissionOptions,
  createBlankLifeChoiceOption,
  normalizeLifeChoiceOptions,
  relabelLifeChoiceOptions,
  resolveLifeChoiceCoreFear,
  structureLifeChoiceInput,
} from "./life-choice-structure";
import { structureLifeChoiceForReview } from "./life-choice-structure-flow";

export interface CommercialActionNotice {
  tone: "login" | "credits";
  title: string;
  message: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}

interface InputViewProps {
  simulationType: SimulationType;
  onTypeChange: (type: SimulationType) => void;
  initialIdea?: string;
  initialInput?: UserInput;
  onBack: () => void;
  onSubmit: (input: UserInput) => void;
  isGenerating: boolean;
  deepAgentMode?: boolean;
  onDeepAgentModeChange?: (enabled: boolean) => void;
  runtimeCapabilities?: AgentRuntimeCapabilities;
  language?: Language;
  commercialMode?: boolean;
  requiredCredits?: number;
  availableCredits?: number;
  frozenCredits?: number;
  providerMode?: ProviderMode;
  onProviderModeChange?: (providerMode: ProviderMode) => void;
  byokAvailable?: boolean;
  commercialActionNotice?: CommercialActionNotice;
  onCommercialActionNoticeClose?: () => void;
}

interface InputViewInitialState {
  projectIdea: string;
  targetUser: string;
  selectedSkills: string[];
  dailyTime: string;
  budget: string;
  monetization: string;
  selectedChannels: string[];
  userStatus: string;
  relationshipStatus: string;
  datingDuration: string;
  targetPersonality: string;
  chatLogOrIssue: string;
  proposedAction: string;
  decisionContext: string;
  lifeChoiceOptions: EditableLifeChoiceOption[];
  financialBuffer: string;
  familySupport: string;
  coreFear: string;
}

const SKILL_OPTIONS = [
  "写代码",
  "剪辑视频",
  "设计排版",
  "小红书运营",
  "网络销售",
  "文案撰写",
  "AI工具使用",
  "社群管理",
  "英语翻译",
  "线下推广"
];

const TIME_OPTIONS = [
  { label: "30 分钟以内", value: "30分钟以内" },
  { label: "每天 1 小时", value: "1小时" },
  { label: "每天 2 小时", value: "2小时" },
  { label: "每天 3-4 小时", value: "3-4小时" },
  { label: "每天 5 小时以上", value: "5小时以上" }
];

const BUDGET_OPTIONS = [
  { label: "0 元 (白手起家)", value: "0元" },
  { label: "100 元以内", value: "100元以内" },
  { label: "500 元以内", value: "500元以内" },
  { label: "1000 元以内", value: "1000元以内" },
  { label: "3000 元以上", value: "3000元以上" }
];

const MONETIZATION_OPTIONS = [
  "单次收费 (如按次帮改简历、按次付费买资料)",
  "会员订阅 (如月度学习群、工具会员周期订阅)",
  "接单服务 (如帮剪视频、代发文章、定制开发)",
  "流量/广告变现 (如起号接广、挂横幅联盟广告)",
  "私域成交 (如引流到微信卖高客单咨询、实物)",
  "卖网课/社群资料 (如新手AI实操指南、变现资料包)"
];

const CHANNEL_OPTIONS = [
  "小红书 (视觉对比/图文种草)",
  "闲鱼 (二手转让/资料交易/服务代挂)",
  "微信群/微信朋友圈 (私域圈子冷启动)",
  "抖音/快手 (短视频引流/切片带货)",
  "知乎/垂直论坛 (知识解答/硬核测评引流)",
  "B站 (长视频干货/项目拆解)",
  "SEO自然流/独立站 (搜索引擎关键词自然流)"
];

const BACKGROUND_OPTIONS = [
  "在校大学生 (每天下课有闲、缺乏实战经验)",
  "刚毕业求职者 (对工作迷茫、急迫渴望搞钱)",
  "初入职场新人 (搬砖累、工资不高、想求第二收入)",
  "自由职业者 (时间充裕、多线作战、有一定网感)",
  "朝九晚五上班族 (寻求副业防御风险、精力有限)"
];

const RELATIONSHIP_STATUS_OPTIONS = [
  "暗恋暗戳戳 (没表白、试探中)",
  "暧昧拉扯期 (聊得热烈、未确定关系)",
  "冷战危机中 (刚吵架、互相不理睬)",
  "热恋磨合期 (常因为生活琐事碰撞)",
  "面临分手/挽回期 (临近冰点，想高情商逆盘)"
];

const DATING_DURATION_OPTIONS = [
  "1个月以内 (热乎劲刚起)",
  "1-3个月 (暧昧正浓)",
  "3-12个月 (深层磨合阶段)",
  "1-3年 (长线稳定有倦怠)",
  "3年以上 (老夫老妻/长跑瓶颈)"
];

const PERSONALITY_OPTIONS = [
  "敏感慢热、防备心极强、极度吃软不吃硬",
  "活泼外向、直爽急性子、极度注重情绪价值",
  "理智现实、极强边界感、注重实质行动与付出",
  "回避型人格、一遇冲突就消失、内心极缺乏安全感",
  "骄傲自负、嘴硬心软、喜欢被捧着、对细节敏感"
];

const SUPPORT_OPTIONS = [
  "强力催逼/极力干涉 (压力拉满)",
  "放任自流/自主支配 (不帮也不干涉)",
  "鼎力支持/精神金钱双垫底 (全力配合)"
];

const LIGHT_FIELD_TEXT_CLASS = "text-gray-950 placeholder:text-gray-400";

const SKILL_OPTION_LABELS_EN: Record<string, string> = {
  写代码: "Coding",
  剪辑视频: "Video editing",
  设计排版: "Design and layout",
  小红书运营: "Xiaohongshu operations",
  网络销售: "Online sales",
  文案撰写: "Copywriting",
  AI工具使用: "AI tool use",
  社群管理: "Community management",
  英语翻译: "English translation",
  线下推广: "Offline promotion",
};

const TIME_OPTION_LABELS_EN: Record<string, string> = {
  "30分钟以内": "Up to 30 minutes",
  "1小时": "1 hour per day",
  "2小时": "2 hours per day",
  "3-4小时": "3-4 hours per day",
  "5小时以上": "5+ hours per day",
};

const BUDGET_OPTION_LABELS_EN: Record<string, string> = {
  "0元": "$0 / bootstrap",
  "100元以内": "Under 100 RMB",
  "500元以内": "Under 500 RMB",
  "1000元以内": "Under 1,000 RMB",
  "3000元以上": "3,000+ RMB",
};

const MONETIZATION_OPTION_LABELS_EN: Record<string, string> = {
  "单次收费 (如按次帮改简历、按次付费买资料)": "One-off payment, such as per resume edit or paid resource",
  "会员订阅 (如月度学习群、工具会员周期订阅)": "Membership or subscription",
  "接单服务 (如帮剪视频、代发文章、定制开发)": "Freelance service orders",
  "流量/广告变现 (如起号接广、挂横幅联盟广告)": "Traffic or ad monetization",
  "私域成交 (如引流到微信卖高客单咨询、实物)": "Private-domain sales",
  "卖网课/社群资料 (如新手AI实操指南、变现资料包)": "Courses, community, or paid resource packs",
};

const CHANNEL_OPTION_LABELS_EN: Record<string, string> = {
  "小红书 (视觉对比/图文种草)": "Xiaohongshu visual posts",
  "闲鱼 (二手转让/资料交易/服务代挂)": "Xianyu listings or service posts",
  "微信群/微信朋友圈 (私域圈子冷启动)": "WeChat groups or Moments",
  "抖音/快手 (短视频引流/切片带货)": "Douyin/Kuaishou short videos",
  "知乎/垂直论坛 (知识解答/硬核测评引流)": "Zhihu or niche forums",
  "B站 (长视频干货/项目拆解)": "Bilibili long-form content",
  "SEO自然流/独立站 (搜索引擎关键词自然流)": "SEO or independent site traffic",
};

const BACKGROUND_OPTION_LABELS_EN: Record<string, string> = {
  "在校大学生 (每天下课有闲、缺乏实战经验)": "College student with spare time after class",
  "刚毕业求职者 (对工作迷茫、急迫渴望搞钱)": "Recent graduate looking for direction and income",
  "初入职场新人 (搬砖累、工资不高、想求第二收入)": "Early-career worker seeking a second income",
  "自由职业者 (时间充裕、多线作战、有一定网感)": "Freelancer with flexible time and platform sense",
  "朝九晚五上班族 (寻求副业防御风险、精力有限)": "9-to-5 worker with limited energy for a side income",
};

const RELATIONSHIP_STATUS_OPTION_LABELS_EN: Record<string, string> = {
  "暗恋暗戳戳 (没表白、试探中)": "Crush / testing the waters",
  "暧昧拉扯期 (聊得热烈、未确定关系)": "Situationship / not official yet",
  "冷战危机中 (刚吵架、互相不理睬)": "Cold war after a conflict",
  "热恋磨合期 (常因为生活琐事碰撞)": "In love but adjusting to friction",
  "面临分手/挽回期 (临近冰点，想高情商逆盘)": "Breakup or repair phase",
};

const DATING_DURATION_OPTION_LABELS_EN: Record<string, string> = {
  "1个月以内 (热乎劲刚起)": "Less than 1 month",
  "1-3个月 (暧昧正浓)": "1-3 months",
  "3-12个月 (深层磨合阶段)": "3-12 months",
  "1-3年 (长线稳定有倦怠)": "1-3 years",
  "3年以上 (老夫老妻/长跑瓶颈)": "3+ years",
};

const PERSONALITY_OPTION_LABELS_EN: Record<string, string> = {
  "敏感慢热、防备心极强、极度吃软不吃硬": "Sensitive, slow to warm up, guarded, responds better to softness",
  "活泼外向、直爽急性子、极度注重情绪价值": "Outgoing, direct, impatient, highly values emotional care",
  "理智现实、极强边界感、注重实质行动与付出": "Practical, rational, strong boundaries, values concrete action",
  "回避型人格、一遇冲突就消失、内心极缺乏安全感": "Avoidant under conflict, disappears when stressed, insecure underneath",
  "骄傲自负、嘴硬心软、喜欢被捧着、对细节敏感": "Proud, stubborn, soft-hearted, sensitive to details and affirmation",
};

const FINANCIAL_BUFFER_OPTION_LABELS_EN: Record<string, string> = {
  [DEFAULT_LIFE_CHOICE_FINANCIAL_BUFFER]: "No independent income; mainly family support, allowance, or aid",
  "生活费紧张，需要兼职或打工才能维持": "Tight living expenses; need part-time work to stay afloat",
  "已断供/欠费/负债，短期必须先赚钱": "Already overdue or in debt; must earn money soon",
  "存款不足 5000 元，几乎没有缓冲": "Under 5,000 RMB saved; almost no buffer",
  "能撑 1-3 个月，压力很快会到": "Can last 1-3 months before pressure arrives",
  "能撑 3-6 个月，有一点试错空间": "Can last 3-6 months with some room to experiment",
  "能撑半年以上，经济安全垫较厚": "Can last 6+ months with a solid buffer",
};

const SUPPORT_OPTION_LABELS_EN: Record<string, string> = {
  "强力催逼/极力干涉 (压力拉满)": "Strong pressure or heavy interference",
  "放任自流/自主支配 (不帮也不干涉)": "Hands-off; neither helping nor interfering",
  "鼎力支持/精神金钱双垫底 (全力配合)": "Strong emotional and financial support",
};

const INPUT_FORM_COPY = {
  "zh-CN": {
    currentLength: (count: number, minimum?: number) =>
      minimum ? `目前字数: ${count} (需 ≥${minimum})` : `目前字数: ${count}`,
    commercial: {
      credits: "商业额度",
    },
    sideHustle: {
      projectSection: "你的项目构想",
      projectQuestion: "你想做什么副业想法？",
      projectPlaceholder: "我想做一个 AI 简历优化小程序，帮面临求职的应届生和转行者优化简历。打算在小红书发改前/改后的对比图引流，收费 9.9 元一次...",
      projectHint: "建议输入 15 - 500 字，越详细模拟越准",
      targetUserLabel: "你准备卖给谁？（你的目标客户是谁）",
      targetUserPlaceholder: "如：高校应届求职生、找网感想在小红书副业起步的宝妈等",
      resourcesSection: "你的现有一手资源",
      skillsLabel: "你目前会些什么技能？（可多选）",
      timeLabel: "每天可投空闲时间",
      budgetLabel: "准备投入的启动资金",
      strategySection: "运营与变现策略",
      monetizationLabel: "你计划通过什么方式赚到钱？",
      monetizationPlaceholder: "-- 由 AI 评估制定最合理的变现方式 --",
      customMonetizationOption: "其他/自定义变现方式",
      customMonetizationLabel: "自定义变现方式",
      customMonetizationPlaceholder: "如：校园代理分销、线下工作坊、企业内训、联名返佣...",
      channelLabel: "你打算在哪里找到第一批客户？（可多选）",
      customChannelLabel: "自定义获客渠道",
      customChannelPlaceholder: "如：校园社群、线下摆摊、豆瓣小组、行业微信群...",
      customChannelHelp: "填写后会和上面的已选渠道一起提交。",
      backgroundSection: "你的现实状态背景",
      userStatusLabel: "你当前属于哪类年轻人群？",
      customUserStatusOption: "其他/自定义现实状态背景",
      customUserStatusLabel: "自定义现实状态背景",
      customUserStatusPlaceholder: "如：宝妈重返职场、县城自由职业、备考间隙做副业...",
    },
    dating: {
      conflictSection: "双方相处背景与核心冲突",
      conflictLabel: "事件核心、导火索或当下现状",
      conflictPlaceholder: "如：我们本来是暧昧期，但昨晚我因为急于确立关系，发了一段长作文告白。对方却回了一句『我觉得有点太快了，还是慢点吧』，然后今天一天回复都冷冷清清，很敷衍...",
      conflictHint: "描述越生动具体、细节越多，推导结果越精准",
      actionLabel: "你下一步打算怎么回复、或准备怎么做？",
      actionPlaceholder: "如：我打算回复说『对不起，昨晚是我太冲动给你压力了，我们还是做朋友吧，不用有心理包袱』，然后这周末不主动约TA了...",
      actionHint: "你的待评估话术/方案",
      statusSection: "关系属性与交往时长",
      statusLabel: "你们目前处于哪种相处阶段？",
      durationLabel: "你们已经相识/恋爱多久了？",
      personalitySection: "对方的性格侧写",
      personalityLabel: "选择最符合 TA 性格底色的一项：",
      customPersonalityOption: "其他/自定义性格侧写",
      customPersonalityLabel: "自定义性格侧写",
      customPersonalityPlaceholder: "如：表面很洒脱但很怕被抛下，遇到压力会先冷处理，确认安全后才愿意解释...",
    },
    lifeChoice: {
      dilemmaSection: "先把纠结原样写下来",
      dilemmaLabel: "你正在纠结什么？",
      dilemmaPlaceholder: "不用整理成 A/B。直接写：我现在在考虑继续留上海大厂、回老家进事业单位，也可能先休息三个月。我的存款大概能撑半年，父母希望我回去，最怕选错之后后悔...",
      dilemmaHint: "写背景、可能方向、现实限制和担心就好",
      organizeIdle: "整理选择",
      organizeBusy: "正在整理",
      organizeHelp: "Agent 会先识别出 2-4 个可能选择，你可以改字、删掉或新增。",
      reviewTitle: "确认我整理出的选择",
      reviewHelp: "提交前可以手动修改，最多保留 4 个核心方向。",
      addChoice: "新增选择",
      optionTitlePlaceholder: "这个选择是什么",
      optionDescriptionPlaceholder: "补充代价、收益或限制，可不填",
      deleteChoice: "删除选择",
      fearLabel: "你在这场抉择中，最大的恐惧或最坏的担忧是什么？",
      fearPlaceholder: "如：最怕考研没考上，白白荒废两年，家里还没钱，最后连外包工作也找不到，彻底跟社会脱节...",
      fearHint: "可选补充；如果上面已经写清楚，我会结合原始描述分析",
      realitySection: "现实粮草与后盾安全底气",
      financialBufferQuestion: LIFE_CHOICE_FINANCIAL_BUFFER_QUESTION,
      familySupportQuestion: "父母/长辈对你做出的抉择是什么态度？",
    },
  },
  "en-US": {
    currentLength: (count: number, minimum?: number) =>
      minimum ? `Current length: ${count} (min ${minimum})` : `Current length: ${count}`,
    commercial: {
      credits: "Commercial credits",
    },
    sideHustle: {
      projectSection: "Your project idea",
      projectQuestion: "What side-hustle idea do you want to test?",
      projectPlaceholder: "Example: I want to build an AI resume optimization mini-tool for graduates and career switchers, promote before/after examples on Xiaohongshu, and charge 9.9 RMB per edit...",
      projectHint: "Aim for 15-500 characters; more detail makes the simulation sharper",
      targetUserLabel: "Who are you selling to?",
      targetUserPlaceholder: "Example: college job seekers, career switchers, parents starting a Xiaohongshu side hustle...",
      resourcesSection: "Your existing resources",
      skillsLabel: "What skills do you already have? Multiple choices allowed.",
      timeLabel: "Daily free time",
      budgetLabel: "Startup budget",
      strategySection: "Your operations and monetization strategy",
      monetizationLabel: "How do you plan to make money?",
      monetizationPlaceholder: "-- Let AI assess the most reasonable monetization model --",
      customMonetizationOption: "Other/custom monetization",
      customMonetizationLabel: "Custom monetization",
      customMonetizationPlaceholder: "Example: campus resellers, offline workshop, corporate training, affiliate commission...",
      channelLabel: "Where will you find the first customers? Multiple choices allowed.",
      customChannelLabel: "Custom acquisition channel",
      customChannelPlaceholder: "Example: campus communities, offline booth, Douban group, industry WeChat group...",
      customChannelHelp: "This will be submitted together with the selected channels above.",
      backgroundSection: "Your real-world background",
      userStatusLabel: "Which real-world situation best describes you?",
      customUserStatusOption: "Other/custom background",
      customUserStatusLabel: "Custom background",
      customUserStatusPlaceholder: "Example: parent returning to work, county-town freelancer, side hustle while preparing for exams...",
    },
    dating: {
      conflictSection: "Relationship background and core conflict",
      conflictLabel: "Current status or trigger",
      conflictPlaceholder: "Example: We were in a situationship, but last night I pushed for clarity too quickly. They replied that things felt too fast, and today their messages have been cold...",
      conflictHint: "The more vivid and specific the context, the sharper the simulation.",
      actionLabel: "Your planned reply or action",
      actionPlaceholder: "Example: I want to say, 'Sorry, I was too impulsive last night and put pressure on you. We can stay friends for now, no pressure.' Then I will stop initiating plans this weekend...",
      actionHint: "The message or plan you want evaluated",
      statusSection: "Relationship status and duration",
      statusLabel: "What stage are you currently in?",
      durationLabel: "How long have you known or dated each other?",
      personalitySection: "TA personality profile",
      personalityLabel: "Choose the profile closest to TA:",
      customPersonalityOption: "Other/custom personality profile",
      customPersonalityLabel: "Custom personality profile",
      customPersonalityPlaceholder: "Example: looks relaxed on the surface but fears abandonment; goes silent under pressure, then explains once safe...",
    },
    lifeChoice: {
      dilemmaSection: "Write the dilemma as-is",
      dilemmaLabel: "What are you torn about?",
      dilemmaPlaceholder: "No need to format it as A/B. Write the raw context: I am considering staying at a big-city tech job, returning home for a public-sector role, or taking three months off...",
      dilemmaHint: "Include background, possible directions, constraints, and worries.",
      organizeIdle: "Organize options",
      organizeBusy: "Organizing",
      organizeHelp: "Agent will identify 2-4 possible options; you can edit, delete, or add them.",
      reviewTitle: "Confirm the organized options",
      reviewHelp: "You can edit before submitting. Keep up to 4 core directions.",
      addChoice: "Add option",
      optionTitlePlaceholder: "What is this option?",
      optionDescriptionPlaceholder: "Add costs, upside, or constraints; optional",
      deleteChoice: "Delete option",
      fearLabel: "What is your biggest fear or worst-case worry in this decision?",
      fearPlaceholder: "Example: I fear failing the exam, wasting two years, running out of family support, and falling behind professionally...",
      fearHint: "Optional. If you already wrote it above, the simulation will use that context.",
      realitySection: "Reality buffer and support base",
      financialBufferQuestion: "What is your current income and safety buffer?",
      familySupportQuestion: "How do your parents or elders feel about this decision?",
    },
  },
} as const;

function getInputFormCopy(language: Language) {
  return INPUT_FORM_COPY[language];
}

function getLocalizedOptionLabel(
  value: string,
  language: Language,
  englishLabels: Record<string, string>,
): string {
  return language === "en-US" ? englishLabels[value] ?? value : value;
}

function getLocalizedOptionLabelWithDefault(
  value: string,
  defaultLabel: string,
  language: Language,
  englishLabels: Record<string, string>,
): string {
  return language === "en-US" ? englishLabels[value] ?? defaultLabel : defaultLabel;
}

function getCompactLocalizedOptionLabel(
  value: string,
  language: Language,
  englishLabels: Record<string, string>,
): string {
  if (language === "en-US") {
    return englishLabels[value] ?? value;
  }

  return value.split(" (")[0];
}

function createEmptyInitialInputState(): InputViewInitialState {
  return {
    projectIdea: "",
    targetUser: "",
    selectedSkills: [],
    dailyTime: "",
    budget: "",
    monetization: "",
    selectedChannels: [],
    userStatus: "",
    relationshipStatus: "",
    datingDuration: "",
    targetPersonality: "",
    chatLogOrIssue: "",
    proposedAction: "",
    decisionContext: "",
    lifeChoiceOptions: [],
    financialBuffer: "",
    familySupport: "",
    coreFear: "",
  };
}

export function deriveInitialInputState(input?: UserInput): InputViewInitialState {
  const state = createEmptyInitialInputState();
  if (!input) return state;

  return {
    ...state,
    projectIdea: input.projectIdea ?? "",
    targetUser: input.targetUser ?? "",
    selectedSkills: input.skills ? [...input.skills] : [],
    dailyTime: input.dailyTime ?? "",
    budget: input.budget ?? "",
    monetization: input.monetization ?? "",
    selectedChannels: input.acquisitionChannel ? [...input.acquisitionChannel] : [],
    userStatus: input.userStatus ?? "",
    relationshipStatus: input.relationshipStatus ?? "",
    datingDuration: input.datingDuration ?? "",
    targetPersonality: input.targetPersonality ?? "",
    chatLogOrIssue: input.chatLogOrIssue ?? "",
    proposedAction: input.proposedAction ?? "",
    decisionContext: input.decisionContext ?? "",
    lifeChoiceOptions: relabelLifeChoiceOptions(
      input.lifeChoiceOptions?.map((option, index) => ({
        id: `template-life-choice-option-${index}`,
        label: option.label,
        title: option.title,
        description: option.description ?? "",
      })) ?? [],
    ),
    financialBuffer: input.financialBuffer ?? "",
    familySupport: input.familySupport ?? "",
    coreFear: input.coreFear ?? "",
  };
}

export default function InputView({ 
  simulationType, 
  onTypeChange, 
  initialIdea = "", 
  initialInput,
  onBack, 
  onSubmit, 
  isGenerating,
  deepAgentMode = false,
  onDeepAgentModeChange,
  runtimeCapabilities,
  language = DEFAULT_LANGUAGE,
  commercialMode = false,
  requiredCredits = 0,
  availableCredits = 0,
  frozenCredits = 0,
  providerMode = "platform",
  onProviderModeChange,
  byokAvailable = false,
  commercialActionNotice,
  onCommercialActionNoticeClose,
}: InputViewProps) {
  // Side Hustle States
  const [projectIdea, setProjectIdea] = useState("");
  const [targetUser, setTargetUser] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [dailyTime, setDailyTime] = useState("");
  const [budget, setBudget] = useState("");
  const [monetization, setMonetization] = useState("");
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [userStatus, setUserStatus] = useState("");
  const [customMonetization, setCustomMonetization] = useState("");
  const [customChannel, setCustomChannel] = useState("");
  const [customUserStatus, setCustomUserStatus] = useState("");

  // Dating States
  const [relationshipStatus, setRelationshipStatus] = useState("");
  const [datingDuration, setDatingDuration] = useState("");
  const [targetPersonality, setTargetPersonality] = useState("");
  const [chatLogOrIssue, setChatLogOrIssue] = useState("");
  const [proposedAction, setProposedAction] = useState("");
  const [customTargetPersonality, setCustomTargetPersonality] = useState("");

  // Life Choice States
  const [decisionContext, setDecisionContext] = useState("");
  const [lifeChoiceOptions, setLifeChoiceOptions] = useState<EditableLifeChoiceOption[]>([]);
  const [lifeChoiceMergeNotice, setLifeChoiceMergeNotice] = useState("");
  const [lifeChoiceStructureNotice, setLifeChoiceStructureNotice] = useState("");
  const [isStructuringLifeChoice, setIsStructuringLifeChoice] = useState(false);
  const [financialBuffer, setFinancialBuffer] = useState("");
  const [familySupport, setFamilySupport] = useState("");
  const [coreFear, setCoreFear] = useState("");

  const [error, setError] = useState("");
  const isEnglish = language === "en-US";
  const formCopy = getInputFormCopy(language);
  void providerMode;
  void onProviderModeChange;
  void byokAvailable;
  const deepModeCopy = getDeepModeCopy(language);
  const deepModeUnavailable = runtimeCapabilities?.deepModeAvailable === false;
  const deepModeDescription = deepModeUnavailable
    ? getDeepModeDisabledCopy(runtimeCapabilities.reason, language)
    : deepModeCopy.description;
  const privacySafetyCopy = getPrivacySafetyCopy(language);
  void commercialMode;
  void requiredCredits;
  void availableCredits;
  void frozenCredits;

  useEffect(() => {
    if (!initialInput) return;

    const state = deriveInitialInputState(initialInput);
    setProjectIdea(state.projectIdea);
    setTargetUser(state.targetUser);
    setSelectedSkills(state.selectedSkills);
    setDailyTime(state.dailyTime);
    setBudget(state.budget);
    setMonetization(state.monetization);
    setSelectedChannels(state.selectedChannels);
    setUserStatus(state.userStatus);
    setCustomMonetization("");
    setCustomChannel("");
    setCustomUserStatus("");
    setRelationshipStatus(state.relationshipStatus);
    setDatingDuration(state.datingDuration);
    setTargetPersonality(state.targetPersonality);
    setChatLogOrIssue(state.chatLogOrIssue);
    setProposedAction(state.proposedAction);
    setCustomTargetPersonality("");
    setDecisionContext(state.decisionContext);
    setLifeChoiceOptions(state.lifeChoiceOptions);
    setLifeChoiceMergeNotice("");
    setLifeChoiceStructureNotice("");
    setFinancialBuffer(state.financialBuffer);
    setFamilySupport(state.familySupport);
    setCoreFear(state.coreFear);
    setError("");
  }, [initialInput]);

  // Sync and Parse initialIdea
  useEffect(() => {
    if (initialInput) return;
    if (initialIdea) {
      if (initialIdea.startsWith("【恋爱状态】")) {
        // Parsing Dating template
        const lines = initialIdea.split("\n");
        lines.forEach(line => {
          if (line.startsWith("【恋爱状态】：")) setRelationshipStatus(line.replace("【恋爱状态】：", "").trim());
          if (line.startsWith("【相识时长】：")) setDatingDuration(line.replace("【相识时长】：", "").trim());
          if (line.startsWith("【对方性格】：")) setTargetPersonality(line.replace("【对方性格】：", "").trim());
          if (line.startsWith("【核心冲突】：")) setChatLogOrIssue(line.replace("【核心冲突】：", "").trim());
          if (line.startsWith("【打算说的话】：")) setProposedAction(line.replace("【打算说的话】：", "").trim());
        });
      } else if (initialIdea.startsWith("【选项 A】")) {
        const structured = structureLifeChoiceInput(initialIdea);
        setDecisionContext(structured.decisionContext);
        setLifeChoiceOptions(structured.options);
        setLifeChoiceMergeNotice(structured.mergeNotice || "");
        setLifeChoiceStructureNotice("");
        setFinancialBuffer(structured.financialBuffer);
        setFamilySupport(structured.familySupport);
        setCoreFear(structured.coreFear);
      } else {
        // Parsing Side Hustle
        setProjectIdea(initialIdea);
        
        // Intelligent Defaults
        if (initialIdea.includes("简历")) {
          setTargetUser("找工作或写不出好简历的应届毕业生、求职转行者");
          setSelectedSkills(["AI工具使用", "文案撰写", "设计排版"]);
          setDailyTime("2小时");
          setBudget("500元以内");
          setMonetization("单次收费 (如按次帮改简历、按次付费买资料)");
          setSelectedChannels(["小红书 (视觉对比/图文种草)", "闲鱼 (二手转让/资料交易/服务代挂)"]);
          setUserStatus("在校大学生 (每天下课有闲、缺乏实战经验)");
        } else if (initialIdea.includes("闲鱼")) {
          setTargetUser("对AI刚需但懒得找指令、想要现成AI教程资料的人群");
          setSelectedSkills(["AI工具使用", "设计排版", "社群管理"]);
          setDailyTime("1小时");
          setBudget("0元");
          setMonetization("单次收费 (如按次帮改简历、按次付费买资料)");
          setSelectedChannels(["闲鱼 (二手转让/资料交易/服务代挂)"]);
          setUserStatus("朝九晚五上班族 (寻求副业防御风险、精力有限)");
        } else if (initialIdea.includes("博主")) {
          setTargetUser("时尚女性、寻求平价穿搭及AI美女图片鉴赏的用户群");
          setSelectedSkills(["AI工具使用", "剪辑视频", "小红书运营"]);
          setDailyTime("3-4小时");
          setBudget("0元");
          setMonetization("流量/广告变现 (如起号接广、挂横幅联盟广告)");
          setSelectedChannels(["小红书 (视觉对比/图文种草)"]);
          setUserStatus("自由职业者 (时间充裕、多线作战、有一定网感)");
        }
      }
    }
  }, [initialIdea, initialInput]);

  const handleToggleSkill = (skill: string) => {
    if (selectedSkills.includes(skill)) {
      setSelectedSkills(selectedSkills.filter(s => s !== skill));
    } else {
      setSelectedSkills([...selectedSkills, skill]);
    }
  };

  const handleToggleChannel = (channel: string) => {
    if (selectedChannels.includes(channel)) {
      setSelectedChannels(selectedChannels.filter(c => c !== channel));
    } else {
      setSelectedChannels([...selectedChannels, channel]);
    }
  };

  const handleStructureLifeChoice = async () => {
    setError("");
    setLifeChoiceStructureNotice("");

    if (!decisionContext || decisionContext.trim().length < 15) {
      setError(isEnglish
        ? "Describe the decision in at least 15 characters. Include the context, possible options, and worries."
        : "把你正在纠结的事先写完整一点，至少 15 个字。可以直接说背景、可能选择和担心。");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setIsStructuringLifeChoice(true);
    try {
      const structured = await structureLifeChoiceForReview(decisionContext);
      if (structured.options.length < 2) {
        setError(isEnglish
          ? "I could not identify at least 2 options from your description. Add one sentence about the directions you are considering."
          : "我还没能从你的描述里整理出至少 2 个选择。可以多写一句：你正在考虑哪些方向？");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      setLifeChoiceOptions(structured.options);
      setLifeChoiceMergeNotice(structured.mergeNotice || "");
      setLifeChoiceStructureNotice(structured.notice);
      if (structured.financialBuffer) setFinancialBuffer(structured.financialBuffer);
      if (structured.familySupport) setFamilySupport(structured.familySupport);
      if (structured.coreFear) setCoreFear(structured.coreFear);
    } finally {
      setIsStructuringLifeChoice(false);
    }
  };

  const handleLifeChoiceOptionChange = (
    id: string,
    field: "title" | "description",
    value: string,
  ) => {
    setLifeChoiceOptions((current) =>
      current.map((option) =>
        option.id === id ? { ...option, [field]: value } : option,
      ),
    );
  };

  const handleAddLifeChoiceOption = () => {
    setLifeChoiceOptions((current) => {
      if (current.length >= 4) return current;
      return relabelLifeChoiceOptions([
        ...current,
        createBlankLifeChoiceOption(`${current.length}-${Date.now()}`),
      ]);
    });
  };

  const handleRemoveLifeChoiceOption = (id: string) => {
    setLifeChoiceOptions((current) =>
      relabelLifeChoiceOptions(current.filter((option) => option.id !== id)),
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (simulationType === "side_hustle") {
      if (!projectIdea || projectIdea.trim().length < 15) {
        setError(isEnglish
          ? "Please describe the side-hustle idea in at least 15 characters so the simulation has enough signal."
          : "兄弟，副业项目描述至少需要输入 15 个字以上，写详细点推演才够准！");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (!dailyTime) {
        setError(isEnglish ? "Choose how much free time you can invest each day." : "请选择你每天能够投入的空闲时间。");
        return;
      }
      if (!budget) {
        setError(isEnglish ? "Choose the budget you are willing to invest." : "请选择你准备投入的资金预算。");
        return;
      }

      const resolvedMonetization = resolveCustomSingleChoice({
        selectedValue: monetization,
        customValue: customMonetization,
        fieldLabel: "变现方式",
      });
      if ("error" in resolvedMonetization) {
        setError(resolvedMonetization.error);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      const resolvedUserStatus = resolveCustomSingleChoice({
        selectedValue: userStatus,
        customValue: customUserStatus,
        fieldLabel: "现实状态背景",
      });
      if ("error" in resolvedUserStatus) {
        setError(resolvedUserStatus.error);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      const resolvedChannels = resolveCustomMultiChoice({
        selectedValues: selectedChannels,
        customValue: customChannel,
      });

      onSubmit({
        type: "side_hustle",
        projectIdea: projectIdea.trim(),
        targetUser: targetUser.trim() || "未明确定义，由AI智能分析",
        skills: selectedSkills.length > 0 ? selectedSkills : ["自学者", "AI探索家"],
        dailyTime,
        budget,
        monetization: resolvedMonetization.value || "待AI制定最优方案",
        acquisitionChannel: resolvedChannels.length > 0 ? resolvedChannels : ["随缘获客"],
        userStatus: resolvedUserStatus.value || "兼职副业试水者"
      });
    } else if (simulationType === "dating") {
      if (!chatLogOrIssue || chatLogOrIssue.trim().length < 15) {
        setError(isEnglish
          ? "Describe the relationship conflict and current context in at least 15 characters."
          : "恋爱矛盾与现状背景至少需要输入 15 个字以上，写详细点推导才符合TA的真实心理！");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (!proposedAction || proposedAction.trim().length < 5) {
        setError(isEnglish
          ? "Your planned reply or action is too short. Add at least 5 characters."
          : "你打算回复的话语或行动方案过短（需 ≥5字），不然AI没法精确评估TA的内心防备喔。");
        return;
      }

      const resolvedTargetPersonality = resolveCustomSingleChoice({
        selectedValue: targetPersonality,
        customValue: customTargetPersonality,
        fieldLabel: "性格侧写",
      });
      if ("error" in resolvedTargetPersonality) {
        setError(resolvedTargetPersonality.error);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      onSubmit({
        type: "dating",
        relationshipStatus: relationshipStatus || "暧昧拉扯期 (聊得热烈、未确定关系)",
        datingDuration: datingDuration || "1-3个月",
        targetPersonality: resolvedTargetPersonality.value || "活泼外向、直爽性子、偏好情绪价值",
        chatLogOrIssue: chatLogOrIssue.trim(),
        proposedAction: proposedAction.trim()
      });
    } else if (simulationType === "life_choice") {
      if (!decisionContext || decisionContext.trim().length < 15) {
        setError(isEnglish
          ? "Describe the decision in at least 15 characters. Include the context, possible options, and worries."
          : "把你正在纠结的事先写完整一点，至少 15 个字。可以直接说背景、可能选择和担心。");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const normalizedLifeChoiceOptions = normalizeLifeChoiceOptions(lifeChoiceOptions);
      if (normalizedLifeChoiceOptions.length < 2) {
        setError(isEnglish
          ? "Click \"Organize options\" first and confirm at least 2 comparable choices."
          : "请先点击“整理选择”，并确认至少 2 个可比较的选择。");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const compatibleOptions = buildLifeChoiceSubmissionOptions(normalizedLifeChoiceOptions);
      const resolvedCoreFear = resolveLifeChoiceCoreFear(coreFear, decisionContext);

      onSubmit({
        type: "life_choice",
        decisionContext: decisionContext.trim(),
        lifeChoiceOptions: normalizedLifeChoiceOptions.map((option) => ({
          label: option.label,
          title: option.title,
          description: option.description || undefined,
        })),
        optionA: compatibleOptions.optionA,
        optionB: compatibleOptions.optionB,
        financialBuffer: financialBuffer || DEFAULT_LIFE_CHOICE_FINANCIAL_BUFFER,
        familySupport: familySupport || "放任自流/自主支配 (不帮也不干涉)",
        coreFear: resolvedCoreFear
      });
    }
  };

  // Color theme helpers based on active simulationType
  const theme = {
    side_hustle: {
      accent: "amber",
      text: "text-amber-600",
      bg: "bg-amber-500",
      bgLight: "bg-amber-50/60",
      border: "border-amber-400",
      ring: "focus:ring-amber-300",
      header: "试一下",
      icon: <Flame className="w-6 h-6 text-amber-500 shrink-0" />
    },
    dating: {
      accent: "rose",
      text: "text-rose-600",
      bg: "bg-rose-500",
      bgLight: "bg-rose-50/60",
      border: "border-rose-400",
      ring: "focus:ring-rose-300",
      header: "恋爱沟通与矛盾破解沙盘",
      icon: <Heart className="w-6 h-6 text-rose-500 shrink-0 fill-rose-500/10" />
    },
    life_choice: {
      accent: "indigo",
      text: "text-indigo-600",
      bg: "bg-indigo-600",
      bgLight: "bg-indigo-50/60",
      border: "border-indigo-400",
      ring: "focus:ring-indigo-300",
      header: "重大人生抉择与后悔精算盘",
      icon: <Compass className="w-6 h-6 text-indigo-500 shrink-0" />
    }
  }[simulationType];
  const inputHeaders: Record<SimulationType, string> = isEnglish
    ? {
        side_hustle: "TryItOut Side-Hustle Sandbox",
        dating: "Dating Communication Sandbox",
        life_choice: "Life Choice Regret Calculator",
      }
    : {
        side_hustle: "试一下",
        dating: "恋爱沟通与矛盾破解沙盘",
        life_choice: "重大人生抉择与后悔精算盘",
      };

  return (
    <div id="input-view-container" className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div id="input-header" className="flex items-center justify-between mb-8">
        <button
          id="btn-back-home"
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-950 transition-colors p-2 -ml-2 hover:bg-gray-100 rounded-lg cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{isEnglish ? "Back home" : "返回首页"}</span>
        </button>
        <span className="text-2xs font-mono text-gray-400 uppercase tracking-widest">{simulationType} MODE</span>
      </div>

      <div className="mb-6 text-left">
        <h1 id="input-view-title" className="text-xl md:text-2xl font-black text-gray-950 flex items-center gap-2">
          {theme.icon}
          <span>{inputHeaders[simulationType]}</span>
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          {isEnglish
            ? "Fill this in honestly. The sandbox uses your first-hand context, personality signals, and constraints to simulate the strictest conflict path."
            : "请诚恳填写。本沙盘将根据你提供的一手信息、性格数据及环境阻力，推演出最严苛、最真实的冲突过程。"}
        </p>
        <p className="text-3xs text-gray-400 leading-relaxed bg-gray-50 border border-gray-150 rounded-xl p-3 mt-3">
          {privacySafetyCopy}
        </p>
      </div>

      {/* Manual Type Switcher inside form */}
      <div className="grid grid-cols-3 gap-2 p-1 bg-gray-100 rounded-xl mb-6">
        {(["side_hustle", "dating", "life_choice"] as SimulationType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onTypeChange(t)}
            className={`py-2 px-2 text-3xs md:text-xs font-bold rounded-lg transition-all cursor-pointer ${
              simulationType === t 
                ? "bg-white text-gray-900 shadow-xs" 
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {t === "side_hustle" && (isEnglish ? "Side Hustle" : "副业搞钱")}
            {t === "dating" && (isEnglish ? "Dating Chat" : "恋爱聊天")}
            {t === "life_choice" && (isEnglish ? "Life Choice" : "人生选择")}
          </button>
        ))}
      </div>

      {error && (
        <div id="error-banner" className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl text-xs flex items-start gap-2.5 mb-6 text-left">
          <BadgeAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">{isEnglish ? "Incomplete input" : "输入不完整提示"}</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {commercialMode && commercialActionNotice && (
        <div
          id="commercial-action-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/68 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="commercial-action-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-white/12 bg-white p-5 text-left text-slate-950 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-600">
                  {formCopy.commercial.credits}
                </p>
                <h2 id="commercial-action-modal-title" className="text-base font-black text-slate-950">
                  {commercialActionNotice.title}
                </h2>
              </div>
              <button
                id="btn-close-commercial-action-modal"
                type="button"
                onClick={onCommercialActionNoticeClose}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-950 cursor-pointer"
                aria-label={isEnglish ? "Close prompt" : "关闭提示"}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-600">
              {commercialActionNotice.message}
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              {commercialActionNotice.secondaryHref && commercialActionNotice.secondaryLabel && (
                <a
                  href={commercialActionNotice.secondaryHref}
                  className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 transition-colors hover:bg-slate-50"
                >
                  {commercialActionNotice.secondaryLabel}
                </a>
              )}
              <a
                href={commercialActionNotice.primaryHref}
                className={`inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-xs font-black text-white transition-colors ${
                  commercialActionNotice.tone === "login"
                    ? "bg-cyan-700 hover:bg-cyan-800"
                    : "bg-rose-700 hover:bg-rose-800"
                }`}
              >
                {commercialActionNotice.primaryLabel}
              </a>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 text-left">
        {/* ==================== 1. SIDE HUSTLE FORM ==================== */}
        {simulationType === "side_hustle" && (
          <>
            {/* Section 1: Core Project */}
            <div className="bg-white p-5 rounded-2xl border border-gray-150 shadow-xs space-y-4">
              <div className="border-b border-gray-100 pb-3">
                <span className="text-xs font-black text-amber-600 font-mono tracking-widest mr-2">01.</span>
                <span className="text-sm font-bold text-gray-950">{formCopy.sideHustle.projectSection}</span>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="input-project-idea" className="block text-xs font-bold text-gray-800">
                  {formCopy.sideHustle.projectQuestion} <span className="text-rose-500">*</span>
                </label>
                <textarea
                  id="input-project-idea"
                  rows={4}
                  required
                  value={projectIdea}
                  onChange={(e) => setProjectIdea(e.target.value)}
                  placeholder={formCopy.sideHustle.projectPlaceholder}
                  className={`w-full text-xs md:text-sm p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-300 focus:border-amber-400 outline-none bg-gray-50/40 ${LIGHT_FIELD_TEXT_CLASS}`}
                />
                <div className="flex justify-between items-center text-2xs text-gray-400">
                  <span>{formCopy.sideHustle.projectHint}</span>
                  <span className={projectIdea.length >= 15 ? "text-emerald-600 font-medium" : "text-rose-500"}>
                    {formCopy.currentLength(projectIdea.length, 15)}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                <label htmlFor="input-target-user" className="block text-xs font-bold text-gray-800">
                  {formCopy.sideHustle.targetUserLabel}
                </label>
                <input
                  id="input-target-user"
                  type="text"
                  value={targetUser}
                  onChange={(e) => setTargetUser(e.target.value)}
                  placeholder={formCopy.sideHustle.targetUserPlaceholder}
                  className={`w-full text-xs md:text-sm p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-300 focus:border-amber-400 outline-none bg-gray-50/40 ${LIGHT_FIELD_TEXT_CLASS}`}
                />
              </div>
            </div>

            {/* Section 2: Personal Assets */}
            <div className="bg-white p-5 rounded-2xl border border-gray-150 shadow-xs space-y-5">
              <div className="border-b border-gray-100 pb-3">
                <span className="text-xs font-black text-amber-600 font-mono tracking-widest mr-2">02.</span>
                <span className="text-sm font-bold text-gray-950">{formCopy.sideHustle.resourcesSection}</span>
              </div>

              {/* Skills */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-800">
                  {formCopy.sideHustle.skillsLabel}
                </label>
                <div className="flex flex-wrap gap-2">
                  {SKILL_OPTIONS.map((skill) => {
                    const isSelected = selectedSkills.includes(skill);
                    return (
                      <button
                        id={`skill-btn-${skill}`}
                        key={skill}
                        type="button"
                        onClick={() => handleToggleSkill(skill)}
                        className={`inline-flex items-center gap-1 text-xs px-3 py-2 rounded-lg border font-medium cursor-pointer transition-all ${
                          isSelected
                            ? "bg-amber-500 border-amber-500 text-white font-bold shadow-xs"
                            : "bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-600"
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                        <span>{getLocalizedOptionLabel(skill, language, SKILL_OPTION_LABELS_EN)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time Commit & Budget */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1">
                {/* Time */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-gray-800">
                    {formCopy.sideHustle.timeLabel} <span className="text-rose-500">*</span>
                  </label>
                  <div className="space-y-1.5">
                    {TIME_OPTIONS.map((opt) => (
                      <label
                        key={opt.value}
                        className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                          dailyTime === opt.value
                            ? "bg-amber-50/60 border-amber-400 font-bold text-amber-950"
                            : "bg-gray-50/40 hover:bg-gray-50 border-gray-200 text-gray-600"
                        }`}
                      >
                        <input
                          type="radio"
                          name="dailyTime"
                          value={opt.value}
                          checked={dailyTime === opt.value}
                          onChange={() => setDailyTime(opt.value)}
                          className="accent-amber-500 w-4 h-4 shrink-0"
                        />
                        <span>{getLocalizedOptionLabelWithDefault(opt.value, opt.label, language, TIME_OPTION_LABELS_EN)}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Budget */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-gray-800">
                    {formCopy.sideHustle.budgetLabel} <span className="text-rose-500">*</span>
                  </label>
                  <div className="space-y-1.5">
                    {BUDGET_OPTIONS.map((opt) => (
                      <label
                        key={opt.value}
                        className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                          budget === opt.value
                            ? "bg-amber-50/60 border-amber-400 font-bold text-amber-950"
                            : "bg-gray-50/40 hover:bg-gray-50 border-gray-200 text-gray-600"
                        }`}
                      >
                        <input
                          type="radio"
                          name="budget"
                          value={opt.value}
                          checked={budget === opt.value}
                          onChange={() => setBudget(opt.value)}
                          className="accent-amber-500 w-4 h-4 shrink-0"
                        />
                        <span>{getLocalizedOptionLabelWithDefault(opt.value, opt.label, language, BUDGET_OPTION_LABELS_EN)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: Strategies */}
            <div className="bg-white p-5 rounded-2xl border border-gray-150 shadow-xs space-y-4">
              <div className="border-b border-gray-100 pb-3">
                <span className="text-xs font-black text-amber-600 font-mono tracking-widest mr-2">03.</span>
                <span className="text-sm font-bold text-gray-950">{formCopy.sideHustle.strategySection}</span>
              </div>

              <div className="space-y-2">
                <label htmlFor="select-monetization" className="block text-xs font-bold text-gray-800">
                  {formCopy.sideHustle.monetizationLabel}
                </label>
                <select
                  id="select-monetization"
                  value={monetization}
                  onChange={(e) => setMonetization(e.target.value)}
                  className={`w-full text-xs md:text-sm p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 bg-gray-50/40 cursor-pointer ${LIGHT_FIELD_TEXT_CLASS}`}
                >
                  <option value="">{formCopy.sideHustle.monetizationPlaceholder}</option>
                  {MONETIZATION_OPTIONS.map((opt, i) => (
                    <option key={i} value={opt}>
                      {getLocalizedOptionLabel(opt, language, MONETIZATION_OPTION_LABELS_EN)}
                    </option>
                  ))}
                  <option value={CUSTOM_OPTION_VALUE}>{formCopy.sideHustle.customMonetizationOption}</option>
                </select>
                {monetization === CUSTOM_OPTION_VALUE && (
                  <div className="space-y-1.5 pt-1">
                    <label htmlFor="input-custom-monetization" className="block text-2xs font-bold text-gray-700">
                      {formCopy.sideHustle.customMonetizationLabel}
                    </label>
                    <input
                      id="input-custom-monetization"
                      type="text"
                      value={customMonetization}
                      onChange={(e) => setCustomMonetization(e.target.value)}
                      placeholder={formCopy.sideHustle.customMonetizationPlaceholder}
                      className={`w-full text-xs md:text-sm p-3 border border-amber-200 rounded-xl focus:ring-2 focus:ring-amber-300 focus:border-amber-400 outline-none bg-amber-50/30 ${LIGHT_FIELD_TEXT_CLASS}`}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-800">
                  {formCopy.sideHustle.channelLabel}
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {CHANNEL_OPTIONS.map((ch, i) => {
                    const isSelected = selectedChannels.includes(ch);
                    return (
                      <button
                        id={`channel-btn-${i}`}
                        key={i}
                        type="button"
                        onClick={() => handleToggleChannel(ch)}
                        className={`flex items-center gap-2 text-left text-xs p-3 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? "bg-amber-500 border-amber-500 text-white font-bold"
                            : "bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-600"
                        }`}
                      >
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center border text-[10px] ${
                          isSelected ? "bg-white text-amber-600 border-white" : "border-gray-300"
                        }`}>
                          {isSelected ? "✓" : ""}
                        </span>
                        <span>{getLocalizedOptionLabel(ch, language, CHANNEL_OPTION_LABELS_EN)}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="space-y-1.5 pt-1">
                  <label htmlFor="input-custom-channel" className="block text-2xs font-bold text-gray-700">
                    {formCopy.sideHustle.customChannelLabel}
                  </label>
                  <input
                    id="input-custom-channel"
                    type="text"
                    value={customChannel}
                    onChange={(e) => setCustomChannel(e.target.value)}
                    placeholder={formCopy.sideHustle.customChannelPlaceholder}
                    className={`w-full text-xs md:text-sm p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-300 focus:border-amber-400 outline-none bg-gray-50/40 ${LIGHT_FIELD_TEXT_CLASS}`}
                  />
                  <p className="text-2xs text-gray-400">{formCopy.sideHustle.customChannelHelp}</p>
                </div>
              </div>
            </div>

            {/* Section 4: Background */}
            <div className="bg-white p-5 rounded-2xl border border-gray-150 shadow-xs space-y-4">
              <div className="border-b border-gray-100 pb-3">
                <span className="text-xs font-black text-amber-600 font-mono tracking-widest mr-2">04.</span>
                <span className="text-sm font-bold text-gray-950">{formCopy.sideHustle.backgroundSection}</span>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-800">
                  {formCopy.sideHustle.userStatusLabel}
                </label>
                <div className="space-y-2">
                  {BACKGROUND_OPTIONS.map((opt, i) => (
                    <label
                      key={i}
                      className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                        userStatus === opt
                          ? "bg-amber-50/60 border-amber-400 font-bold text-amber-950"
                          : "bg-gray-50/40 hover:bg-gray-50 border-gray-200 text-gray-600"
                      }`}
                    >
                      <input
                        type="radio"
                        name="userStatus"
                        value={opt}
                        checked={userStatus === opt}
                        onChange={() => setUserStatus(opt)}
                        className="accent-amber-500 w-4.5 h-4.5 mt-0.5 shrink-0"
                      />
                      <span>{getLocalizedOptionLabel(opt, language, BACKGROUND_OPTION_LABELS_EN)}</span>
                    </label>
                  ))}
                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      userStatus === CUSTOM_OPTION_VALUE
                        ? "bg-amber-50/60 border-amber-400 font-bold text-amber-950"
                        : "bg-gray-50/40 hover:bg-gray-50 border-gray-200 text-gray-600"
                    }`}
                  >
                    <input
                      type="radio"
                      name="userStatus"
                      value={CUSTOM_OPTION_VALUE}
                      checked={userStatus === CUSTOM_OPTION_VALUE}
                      onChange={() => setUserStatus(CUSTOM_OPTION_VALUE)}
                      className="accent-amber-500 w-4.5 h-4.5 mt-0.5 shrink-0"
                    />
                    <span>{formCopy.sideHustle.customUserStatusOption}</span>
                  </label>
                  {userStatus === CUSTOM_OPTION_VALUE && (
                    <div className="space-y-1.5 pl-0 md:pl-7">
                      <label htmlFor="input-custom-user-status" className="block text-2xs font-bold text-gray-700">
                        {formCopy.sideHustle.customUserStatusLabel}
                      </label>
                      <input
                        id="input-custom-user-status"
                        type="text"
                        value={customUserStatus}
                        onChange={(e) => setCustomUserStatus(e.target.value)}
                        placeholder={formCopy.sideHustle.customUserStatusPlaceholder}
                        className={`w-full text-xs md:text-sm p-3 border border-amber-200 rounded-xl focus:ring-2 focus:ring-amber-300 focus:border-amber-400 outline-none bg-amber-50/30 ${LIGHT_FIELD_TEXT_CLASS}`}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ==================== 2. DATING FORM ==================== */}
        {simulationType === "dating" && (
          <>
            {/* Section 1: Conflict Background */}
            <div className="bg-white p-5 rounded-2xl border border-gray-150 shadow-xs space-y-4">
              <div className="border-b border-gray-100 pb-3">
                <span className="text-xs font-black text-rose-600 font-mono tracking-widest mr-2">01.</span>
                <span className="text-sm font-bold text-gray-950">{formCopy.dating.conflictSection}</span>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="input-chat-log" className="block text-xs font-bold text-gray-800">
                  {formCopy.dating.conflictLabel} <span className="text-rose-500">*</span>
                </label>
                <textarea
                  id="input-chat-log"
                  rows={4}
                  required
                  value={chatLogOrIssue}
                  onChange={(e) => setChatLogOrIssue(e.target.value)}
                  placeholder={formCopy.dating.conflictPlaceholder}
                  className={`w-full text-xs md:text-sm p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rose-300 focus:border-rose-400 outline-none bg-gray-50/40 ${LIGHT_FIELD_TEXT_CLASS}`}
                />
                <div className="flex justify-between items-center text-2xs text-gray-400">
                  <span>{formCopy.dating.conflictHint}</span>
                  <span className={chatLogOrIssue.length >= 15 ? "text-emerald-600 font-medium" : "text-rose-500"}>
                    {formCopy.currentLength(chatLogOrIssue.length, 15)}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                <label htmlFor="input-proposed-action" className="block text-xs font-bold text-gray-800">
                  {formCopy.dating.actionLabel} <span className="text-rose-500">*</span>
                </label>
                <textarea
                  id="input-proposed-action"
                  rows={3}
                  required
                  value={proposedAction}
                  onChange={(e) => setProposedAction(e.target.value)}
                  placeholder={formCopy.dating.actionPlaceholder}
                  className={`w-full text-xs md:text-sm p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rose-300 focus:border-rose-400 outline-none bg-gray-50/40 ${LIGHT_FIELD_TEXT_CLASS}`}
                />
                <div className="flex justify-between items-center text-2xs text-gray-400">
                  <span>{formCopy.dating.actionHint}</span>
                  <span className={proposedAction.length >= 5 ? "text-emerald-600 font-medium" : "text-rose-500"}>
                    {formCopy.currentLength(proposedAction.length, 5)}
                  </span>
                </div>
              </div>
            </div>

            {/* Section 2: Relationship States */}
            <div className="bg-white p-5 rounded-2xl border border-gray-150 shadow-xs space-y-5">
              <div className="border-b border-gray-100 pb-3">
                <span className="text-xs font-black text-rose-600 font-mono tracking-widest mr-2">02.</span>
                <span className="text-sm font-bold text-gray-950">{formCopy.dating.statusSection}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Status */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-gray-800">
                    {formCopy.dating.statusLabel}
                  </label>
                  <div className="space-y-1.5">
                    {RELATIONSHIP_STATUS_OPTIONS.map((opt) => (
                      <label
                        key={opt}
                        className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                          relationshipStatus === opt
                            ? "bg-rose-50/60 border-rose-400 font-bold text-rose-950"
                            : "bg-gray-50/40 hover:bg-gray-50 border-gray-200 text-gray-600"
                        }`}
                      >
                        <input
                          type="radio"
                          name="relationshipStatus"
                          value={opt}
                          checked={relationshipStatus === opt}
                          onChange={() => setRelationshipStatus(opt)}
                          className="accent-rose-500 w-4 h-4 shrink-0"
                        />
                        <span>{getCompactLocalizedOptionLabel(opt, language, RELATIONSHIP_STATUS_OPTION_LABELS_EN)}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Duration */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-gray-800">
                    {formCopy.dating.durationLabel}
                  </label>
                  <div className="space-y-1.5">
                    {DATING_DURATION_OPTIONS.map((opt) => (
                      <label
                        key={opt}
                        className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                          datingDuration === opt
                            ? "bg-rose-50/60 border-rose-400 font-bold text-rose-950"
                            : "bg-gray-50/40 hover:bg-gray-50 border-gray-200 text-gray-600"
                        }`}
                      >
                        <input
                          type="radio"
                          name="datingDuration"
                          value={opt}
                          checked={datingDuration === opt}
                          onChange={() => setDatingDuration(opt)}
                          className="accent-rose-500 w-4 h-4 shrink-0"
                        />
                        <span>{getCompactLocalizedOptionLabel(opt, language, DATING_DURATION_OPTION_LABELS_EN)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: Target Personality */}
            <div className="bg-white p-5 rounded-2xl border border-gray-150 shadow-xs space-y-4">
              <div className="border-b border-gray-100 pb-3">
                <span className="text-xs font-black text-rose-600 font-mono tracking-widest mr-2">03.</span>
                <span className="text-sm font-bold text-gray-950">{formCopy.dating.personalitySection}</span>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-800">
                  {formCopy.dating.personalityLabel}
                </label>
                <div className="space-y-2">
                  {PERSONALITY_OPTIONS.map((opt) => (
                    <label
                      key={opt}
                      className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                        targetPersonality === opt
                          ? "bg-rose-50/60 border-rose-400 font-bold text-rose-950"
                          : "bg-gray-50/40 hover:bg-gray-50 border-gray-200 text-gray-600"
                      }`}
                    >
                      <input
                        type="radio"
                        name="targetPersonality"
                        value={opt}
                        checked={targetPersonality === opt}
                        onChange={() => setTargetPersonality(opt)}
                        className="accent-rose-500 w-4.5 h-4.5 mt-0.5 shrink-0"
                      />
                      <span>{getLocalizedOptionLabel(opt, language, PERSONALITY_OPTION_LABELS_EN)}</span>
                    </label>
                  ))}
                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      targetPersonality === CUSTOM_OPTION_VALUE
                        ? "bg-rose-50/60 border-rose-400 font-bold text-rose-950"
                        : "bg-gray-50/40 hover:bg-gray-50 border-gray-200 text-gray-600"
                    }`}
                  >
                    <input
                      type="radio"
                      name="targetPersonality"
                      value={CUSTOM_OPTION_VALUE}
                      checked={targetPersonality === CUSTOM_OPTION_VALUE}
                      onChange={() => setTargetPersonality(CUSTOM_OPTION_VALUE)}
                      className="accent-rose-500 w-4.5 h-4.5 mt-0.5 shrink-0"
                    />
                    <span>{formCopy.dating.customPersonalityOption}</span>
                  </label>
                  {targetPersonality === CUSTOM_OPTION_VALUE && (
                    <div className="space-y-1.5 pl-0 md:pl-7">
                      <label htmlFor="input-custom-target-personality" className="block text-2xs font-bold text-gray-700">
                        {formCopy.dating.customPersonalityLabel}
                      </label>
                      <textarea
                        id="input-custom-target-personality"
                        rows={3}
                        value={customTargetPersonality}
                        onChange={(e) => setCustomTargetPersonality(e.target.value)}
                        placeholder={formCopy.dating.customPersonalityPlaceholder}
                        className={`w-full text-xs md:text-sm p-3 border border-rose-200 rounded-xl focus:ring-2 focus:ring-rose-300 focus:border-rose-400 outline-none bg-rose-50/30 ${LIGHT_FIELD_TEXT_CLASS}`}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ==================== 3. LIFE CHOICE FORM ==================== */}
        {simulationType === "life_choice" && (
          <>
            {/* Section 1: Options & Fears */}
            <div className="bg-white p-5 rounded-2xl border border-gray-150 shadow-xs space-y-4">
              <div className="border-b border-gray-100 pb-3">
                <span className="text-xs font-black text-indigo-600 font-mono tracking-widest mr-2">01.</span>
                <span className="text-sm font-bold text-gray-950">{formCopy.lifeChoice.dilemmaSection}</span>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="input-decision-context" className="block text-xs font-bold text-gray-800">
                  {formCopy.lifeChoice.dilemmaLabel} <span className="text-rose-500">*</span>
                </label>
                <textarea
                  id="input-decision-context"
                  rows={6}
                  required
                  value={decisionContext}
                  onChange={(e) => setDecisionContext(e.target.value)}
                  placeholder={formCopy.lifeChoice.dilemmaPlaceholder}
                  className={`w-full text-xs md:text-sm p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none bg-gray-50/40 leading-relaxed ${LIGHT_FIELD_TEXT_CLASS}`}
                />
                <div className="flex justify-between items-center text-2xs text-gray-400">
                  <span>{formCopy.lifeChoice.dilemmaHint}</span>
                  <span className={decisionContext.length >= 15 ? "text-emerald-600 font-medium" : "text-rose-500"}>
                    {formCopy.currentLength(decisionContext.length, 15)}
                  </span>
                </div>
              </div>

              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <button
                  id="btn-structure-life-choice"
                  type="button"
                  onClick={handleStructureLifeChoice}
                  disabled={isStructuringLifeChoice}
                  className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 text-white rounded-xl text-xs font-bold transition-colors ${
                    isStructuringLifeChoice
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-indigo-600 hover:bg-indigo-700 cursor-pointer"
                  }`}
                >
                  <ListChecks className="w-4 h-4" />
                  <span>{isStructuringLifeChoice ? formCopy.lifeChoice.organizeBusy : formCopy.lifeChoice.organizeIdle}</span>
                </button>
                <p className="text-2xs text-gray-500 leading-relaxed">
                  {formCopy.lifeChoice.organizeHelp}
                </p>
              </div>

              {lifeChoiceOptions.length > 0 && (
                <div className="space-y-3 border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black text-gray-950">{formCopy.lifeChoice.reviewTitle}</p>
                      <p className="text-2xs text-gray-400 mt-0.5">{formCopy.lifeChoice.reviewHelp}</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddLifeChoiceOption}
                      disabled={lifeChoiceOptions.length >= 4}
                      className={`inline-flex items-center justify-center w-10 h-10 rounded-xl border transition-colors ${
                        lifeChoiceOptions.length >= 4
                          ? "bg-gray-50 border-gray-150 text-gray-300 cursor-not-allowed"
                          : "bg-white border-indigo-200 text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                      }`}
                      aria-label={formCopy.lifeChoice.addChoice}
                      title={formCopy.lifeChoice.addChoice}
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {lifeChoiceMergeNotice && (
                    <div className="bg-indigo-50/70 border border-indigo-100 text-indigo-800 rounded-xl p-3 text-2xs leading-relaxed">
                      {lifeChoiceMergeNotice}
                    </div>
                  )}

                  {lifeChoiceStructureNotice && (
                    <div className="bg-amber-50/80 border border-amber-100 text-amber-800 rounded-xl p-3 text-2xs leading-relaxed">
                      {lifeChoiceStructureNotice}
                    </div>
                  )}

                  <div className="space-y-2.5">
                    {lifeChoiceOptions.map((option) => (
                      <div
                        key={option.id}
                        className="grid grid-cols-[2.5rem_1fr_auto] gap-2 items-start p-3 border border-gray-200 rounded-xl bg-gray-50/40"
                      >
                        <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white text-xs font-black flex items-center justify-center shrink-0">
                          {option.label}
                        </div>
                        <div className="space-y-2 min-w-0">
                          <input
                            value={option.title}
                            onChange={(e) => handleLifeChoiceOptionChange(option.id, "title", e.target.value)}
                            placeholder={formCopy.lifeChoice.optionTitlePlaceholder}
                            className={`w-full text-xs md:text-sm p-2.5 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 bg-white ${LIGHT_FIELD_TEXT_CLASS}`}
                          />
                          <input
                            value={option.description}
                            onChange={(e) => handleLifeChoiceOptionChange(option.id, "description", e.target.value)}
                            placeholder={formCopy.lifeChoice.optionDescriptionPlaceholder}
                            className={`w-full text-2xs md:text-xs p-2.5 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 bg-white ${LIGHT_FIELD_TEXT_CLASS}`}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveLifeChoiceOption(option.id)}
                          disabled={lifeChoiceOptions.length <= 2}
                          className={`w-9 h-9 inline-flex items-center justify-center rounded-lg transition-colors ${
                            lifeChoiceOptions.length <= 2
                              ? "text-gray-300 cursor-not-allowed"
                              : "text-gray-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                          }`}
                          aria-label={`${formCopy.lifeChoice.deleteChoice} ${option.label}`}
                          title={formCopy.lifeChoice.deleteChoice}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1.5 pt-2">
                <label htmlFor="input-core-fear" className="block text-xs font-bold text-gray-800">
                  {formCopy.lifeChoice.fearLabel}
                </label>
                <textarea
                  id="input-core-fear"
                  rows={3}
                  value={coreFear}
                  onChange={(e) => setCoreFear(e.target.value)}
                  placeholder={formCopy.lifeChoice.fearPlaceholder}
                  className={`w-full text-xs md:text-sm p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none bg-gray-50/40 ${LIGHT_FIELD_TEXT_CLASS}`}
                />
                <div className="flex justify-between items-center text-2xs text-gray-400">
                  <span>{formCopy.lifeChoice.fearHint}</span>
                  <span className={coreFear.trim().length >= 5 ? "text-emerald-600 font-medium" : "text-gray-400"}>
                    {formCopy.currentLength(coreFear.length)}
                  </span>
                </div>
              </div>
            </div>

            {/* Section 2: Reality Buffers */}
            <div className="bg-white p-5 rounded-2xl border border-gray-150 shadow-xs space-y-5">
              <div className="border-b border-gray-100 pb-3">
                <span className="text-xs font-black text-indigo-600 font-mono tracking-widest mr-2">02.</span>
                <span className="text-sm font-bold text-gray-950">{formCopy.lifeChoice.realitySection}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Financial Buffer */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-gray-800">
                    {formCopy.lifeChoice.financialBufferQuestion}
                  </label>
                  <div className="space-y-1.5">
                    {LIFE_CHOICE_FINANCIAL_BUFFER_OPTIONS.map((opt) => (
                      <label
                        key={opt}
                        className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                          financialBuffer === opt
                            ? "bg-indigo-50/60 border-indigo-400 font-bold text-indigo-950"
                            : "bg-gray-50/40 hover:bg-gray-50 border-gray-200 text-gray-600"
                        }`}
                      >
                        <input
                          type="radio"
                          name="financialBuffer"
                          value={opt}
                          checked={financialBuffer === opt}
                          onChange={() => setFinancialBuffer(opt)}
                          className="accent-indigo-600 w-4 h-4 shrink-0"
                        />
                        <span>{getCompactLocalizedOptionLabel(opt, language, FINANCIAL_BUFFER_OPTION_LABELS_EN)}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Family support */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-gray-800">
                    {formCopy.lifeChoice.familySupportQuestion}
                  </label>
                  <div className="space-y-1.5">
                    {SUPPORT_OPTIONS.map((opt) => (
                      <label
                        key={opt}
                        className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                          familySupport === opt
                            ? "bg-indigo-50/60 border-indigo-400 font-bold text-indigo-950"
                            : "bg-gray-50/40 hover:bg-gray-50 border-gray-200 text-gray-600"
                        }`}
                      >
                        <input
                          type="radio"
                          name="familySupport"
                          value={opt}
                          checked={familySupport === opt}
                          onChange={() => setFamilySupport(opt)}
                          className="accent-indigo-600 w-4 h-4 shrink-0"
                        />
                        <span>{getCompactLocalizedOptionLabel(opt, language, SUPPORT_OPTION_LABELS_EN)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Submit Action */}
        <div id="form-actions" className="pt-4 space-y-4">
          <label className="flex items-start gap-3 bg-gray-50 border border-gray-150 rounded-2xl p-4 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(deepAgentMode) && !deepModeUnavailable}
              disabled={deepModeUnavailable}
              onChange={(event) => onDeepAgentModeChange?.(event.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="block text-xs font-black text-gray-900">{deepModeCopy.title}</span>
              <span className="block text-2xs text-gray-500 leading-relaxed mt-1">{deepModeDescription}</span>
            </span>
          </label>
          <button
            id="btn-trigger-simulation"
            type="submit"
            disabled={isGenerating}
            className={`w-full inline-flex items-center justify-center gap-2.5 text-white font-bold px-8 py-4 rounded-xl shadow-md hover:shadow-lg transition-all duration-155 active:scale-98 cursor-pointer text-base ${
              isGenerating ? "bg-gray-400 cursor-not-allowed" : theme.bg + " hover:opacity-90"
            }`}
          >
            <Play className="w-5 h-5 fill-white" />
            <span>{isGenerating
              ? (isEnglish ? "Loading and evolving the sandbox..." : "正在加载博弈沙盘并进行演化...")
              : getStartSimulationButtonLabel(language)}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}
