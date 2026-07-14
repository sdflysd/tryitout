import { useState } from "react";
import { motion } from "motion/react";
import { AlertCircle, ArrowRight, Compass, Flame, Heart, History, PencilLine, Play, Sparkles, Trash2 } from "lucide-react";
import { Simulation, SimulationType, UserInput } from "../types";
import type { SimulationTaskStatusResponse } from "../contracts/simulation-task";
import { DEFAULT_LANGUAGE, Language } from "../language";
import { postValidationEvent } from "../validation-events";
import AgentSandboxPreview from "./AgentSandboxPreview";
import TaskCenter from "./TaskCenter";
import { getHomeHeroCopy } from "./home-copy";
import { getPrivacySafetyCopy } from "./privacy-copy";

interface HomeViewProps {
  onStart: (type: SimulationType) => void;
  onSelectHistory: (simulation: Simulation) => void;
  historyList: Simulation[];
  onSelectTemplate: (input: UserInput) => void;
  lastInputDraft?: UserInput;
  onContinueDraft?: (input: UserInput) => void;
  onDeleteHistory?: (simulationId: string) => void;
  language?: Language;
  commercialTasks?: SimulationTaskStatusResponse[];
  commercialTasksLoading?: boolean;
  commercialTasksError?: string;
  onRefreshCommercialTasks?: () => void;
  onTaskViewProgress?: (task: SimulationTaskStatusResponse) => void;
  onTaskRetry?: (task: SimulationTaskStatusResponse) => void;
  onTaskCancel?: (task: SimulationTaskStatusResponse) => void;
  onTaskViewReport?: (task: SimulationTaskStatusResponse) => void;
}

type TemplateItem = {
  title: string;
  desc: string;
  tag: string;
  input: UserInput;
};

const templates: Record<SimulationType, TemplateItem[]> = {
  side_hustle: [
    {
      title: "AI 简历优化小程序",
      desc: "面向应届生的求职简历智能润色，小红书引流，客单价 9.9 元。",
      tag: "求职服务",
      input: {
        type: "side_hustle",
        projectIdea: "我想做一个 AI 简历优化小程序，帮面临求职的应届生和转行者优化简历。打算在小红书发改前/改后的视觉对比图引流，客单 9.9 元。我每天可投 2 小时，预算 500 元。",
        targetUser: "找工作或写不出好简历的应届毕业生、求职转行者",
        skills: ["AI工具使用", "文案撰写", "设计排版"],
        dailyTime: "2小时",
        budget: "500元以内",
        monetization: "单次收费 (如按次帮改简历、按次付费买资料)",
        acquisitionChannel: ["小红书 (视觉对比/图文种草)", "闲鱼 (二手转让/资料交易/服务代挂)"],
        userStatus: "在校大学生 (每天下课有闲、缺乏实战经验)",
      },
    },
    {
      title: "闲鱼虚拟资料变现项目",
      desc: "售卖细分领域的 ChatGPT 精选指令包与 AI 绘画优质词合集，0 门槛上手。",
      tag: "虚拟资料",
      input: {
        type: "side_hustle",
        projectIdea: "在闲鱼上挂售特定行业的 ChatGPT 专属工作流指令合集与 Midjourney 精美词库，定价 4.9 元一份。利用自动化发货，预算 0 元，每天仅投入 1 小时打理。",
        targetUser: "对 AI 刚需但懒得找指令、想要现成 AI 教程资料的人群",
        skills: ["AI工具使用", "设计排版", "社群管理"],
        dailyTime: "1小时",
        budget: "0元",
        monetization: "单次收费 (如按次帮改简历、按次付费买资料)",
        acquisitionChannel: ["闲鱼 (二手转让/资料交易/服务代挂)"],
        userStatus: "朝九晚五上班族 (寻求副业防御风险、精力有限)",
      },
    },
    {
      title: "小红书 AI 穿搭博主号",
      desc: "使用 AI 绘图生成模特穿搭图吸引流量，引流到私域进行定制服装销售。",
      tag: "流量变现",
      input: {
        type: "side_hustle",
        projectIdea: "在小红书建立一个 AI 虚拟美女/穿搭展示博主号。利用 AI 生成穿搭效果图吸引流量和精准女粉丝，后期引流到微信卖定制服装或接广告。无启动资金，每天可投入 3 小时。",
        targetUser: "时尚女性、寻求平价穿搭及 AI 美女图片鉴赏的用户群",
        skills: ["AI工具使用", "剪辑视频", "小红书运营"],
        dailyTime: "3-4小时",
        budget: "0元",
        monetization: "流量/广告变现 (如起号接广、挂横幅联盟广告)",
        acquisitionChannel: ["小红书 (视觉对比/图文种草)"],
        userStatus: "自由职业者 (时间充裕、多线作战、有一定网感)",
      },
    }
  ],
  dating: [
    {
      title: "暧昧期降温挽回沟通",
      desc: "原本聊得很好的暧昧对象突然变得客气冷淡，测试下一步挽回话术。",
      tag: "暧昧降温",
      input: {
        type: "dating",
        relationshipStatus: "暧昧拉扯期 (聊得热烈、未确定关系)",
        datingDuration: "1个月以内 (热乎劲刚起)",
        targetPersonality: "敏感慢热、防备心极强、极度吃软不吃硬",
        chatLogOrIssue: "昨天因为我太心急，发长小作文要确立关系，TA 回了句“抱歉，我觉得我们还是慢点吧”然后变冷淡了。",
        proposedAction: "对不起，我昨天确实有点冲动了，给你造成了压力，我们先继续做普通朋友吧，不给你压力。我只是想把心意传达给你。",
      },
    },
    {
      title: "冷战期高情商破冰",
      desc: "因为生活琐事和对方发生激烈争吵，已经冷战3天，试错最佳破冰回复。",
      tag: "冷战破冰",
      input: {
        type: "dating",
        relationshipStatus: "冷战危机中 (刚吵架、互相不理睬)",
        datingDuration: "1-3年 (长线稳定有倦怠)",
        targetPersonality: "骄傲自负、嘴硬心软、喜欢被捧着、对细节敏感",
        chatLogOrIssue: "因为我忘记了我们的纪念日，还找借口说加班，对方大发雷霆。目前已经 3 天互不理睬了。",
        proposedAction: "我想了很久，我知道我不应该找借口，忘记纪念日确实是我的不称职。我给你订了你最爱吃的蛋糕和花送到了你公司，不求你立刻原谅，但我希望能当面诚恳地跟你说声对不起。",
      },
    },
    {
      title: "暗恋对象告白试错",
      desc: "暗恋同桌/同事许久，打算在周末约出来正式告白，推演不同切入方式。",
      tag: "暗恋表白",
      input: {
        type: "dating",
        relationshipStatus: "暗恋暗戳戳 (没表白、试探中)",
        datingDuration: "3-12个月 (深层磨合阶段)",
        targetPersonality: "理智现实、极强边界感、注重实质行动与付出",
        chatLogOrIssue: "我很喜欢 TA，但不知道 TA 对我是朋友的好感还是男女之间的。打算周末约出来看电影，看完表白，害怕直接被拒导致朋友都做不成。",
        proposedAction: "其实这半年多来，跟你在一起的每一时刻我都特别开心。你总能理解我的奇思妙想。我想不仅仅只做你的倾听者，我想正式追求你，做你身边的守护者。你不用急着回答，可以考虑一下。",
      },
    }
  ],
  life_choice: [
    {
      title: "考公考研 vs 直接大厂外包",
      desc: "家里催考编，自己拿到了中厂外包Offer，在稳定与微薄面包之间纠结。",
      tag: "求职抉择",
      input: {
        type: "life_choice",
        decisionContext: "家里催考编，自己拿到了中厂外包 Offer，在稳定与微薄面包之间纠结。积蓄只有 3000 元，需要向家里要备考生活费。父母极其支持考公，甚至说考不上可以供我 2 年。",
        lifeChoiceOptions: [
          { label: "A", title: "全身心脱产备考国家公务员", description: "追求长久稳定和家庭期望。" },
          { label: "B", title: "接受中厂外包开发 Offer", description: "月薪 9K，立即实现经济自立。" },
        ],
        optionA: "全身心脱产备考国家公务员，追求长久稳定和家庭期望。",
        optionB: "接受目前拿到的中厂外包开发 Offer，月薪 9K，立即实现经济自立。",
        financialBuffer: "存款不足 5000 元，几乎没有缓冲",
        familySupport: "鼎力支持/精神金钱双垫底 (全力配合)",
        coreFear: "考公竞争太大，害怕脱产 2 年后一无所有，且外包履历以后也废了。",
      },
    },
    {
      title: "一线城市卷大厂 vs 回老家体制内",
      desc: "大厂3年精疲力竭面临年龄红线，老家有事业单位关系，纠结留下还是回去。",
      tag: "围城抉择",
      input: {
        type: "life_choice",
        decisionContext: "大厂 3 年精疲力竭，面临年龄红线；老家有事业单位机会，纠结留在一线继续高薪内耗，还是回老家换稳定生活。",
        lifeChoiceOptions: [
          { label: "A", title: "继续留在上海大厂做高级开发", description: "年薪 35W，但天天加班到 10 点，颈椎严重磨损，随时面临裁员。" },
          { label: "B", title: "接受老家三线城市事业单位编制", description: "月薪 4K，但有双休和独立婚房，生活闲适。" },
        ],
        optionA: "继续留在上海大厂做高级开发，高薪年薪 35W，但天天加班到 10 点，颈椎严重磨损，随时面临裁员。",
        optionB: "接受老家三线城市商业局下属事业单位的编制，月薪 4K 但有双休和独立婚房，生活闲适。",
        financialBuffer: "能撑半年以上，经济安全垫较厚",
        familySupport: "强力催逼/极力干涉 (压力拉满)",
        coreFear: "回老家后生活一眼看到底，感觉自己在二十多岁就死去了，极度不甘心。",
      },
    }
  ]
};

function cloneUserInput(input: UserInput): UserInput {
  return {
    ...input,
    skills: input.skills ? [...input.skills] : undefined,
    acquisitionChannel: input.acquisitionChannel ? [...input.acquisitionChannel] : undefined,
    lifeChoiceOptions: input.lifeChoiceOptions?.map((option) => ({ ...option })),
  };
}

export function getTemplateSimulationInput(type: SimulationType, index: number): UserInput {
  const template = templates[type][index];
  if (!template) {
    throw new Error(`Unknown template: ${type}/${index}`);
  }

  return cloneUserInput(template.input);
}

const categoryInfo = {
  side_hustle: {
    title: "副业搞钱",
    subtitle: "把项目放进市场、流量、现金流的虚拟世界里先跑一遍",
    desc: "目标客户、竞品、平台流量、执行教练、现金流、风险审计和裁判会围绕你的想法连续压测 30 天。",
    icon: Flame,
    accent: "amber",
    active: "border-amber-300/70 bg-amber-300/14 text-amber-100 shadow-[0_0_28px_rgba(251,191,36,0.18)]",
    button: "bg-amber-300 text-slate-950 hover:bg-amber-200",
  },
  dating: {
    title: "恋爱聊天",
    subtitle: "把下一句话放进 TA、情绪、边界和现实压力里预演",
    desc: "TA、沟通教练、边界、情绪、现实条件、旁观朋友和裁判会模拟关系升温或降温的路径。",
    icon: Heart,
    accent: "rose",
    active: "border-rose-300/70 bg-rose-300/14 text-rose-100 shadow-[0_0_28px_rgba(251,113,133,0.2)]",
    button: "bg-rose-400 text-white hover:bg-rose-300",
  },
  life_choice: {
    title: "重大抉择",
    subtitle: "把人生分岔口交给未来自己、资源和机会成本共同推演",
    desc: "选项 A、选项 B、未来自己、家人现实、资源盘点、核心恐惧和裁判会把代价摊开。",
    icon: Compass,
    accent: "indigo",
    active: "border-cyan-300/70 bg-cyan-300/12 text-cyan-100 shadow-[0_0_28px_rgba(103,232,249,0.18)]",
    button: "bg-cyan-300 text-slate-950 hover:bg-cyan-200",
  },
} as const;

const categoryInfoEn = {
  side_hustle: {
    ...categoryInfo.side_hustle,
    title: "Side Hustle",
    subtitle: "Run the idea through market, traffic, and cash-flow pressure first",
    desc: "Target customers, competitors, platform traffic, execution coaching, cash flow, risk audit, and the arbiter stress-test your idea across 30 days.",
  },
  dating: {
    ...categoryInfo.dating,
    title: "Dating Chat",
    subtitle: "Preview the next message against TA, emotions, boundaries, and reality",
    desc: "TA, a communication coach, boundaries, emotions, reality constraints, an outside friend, and the arbiter simulate how the relationship warms up or cools down.",
  },
  life_choice: {
    ...categoryInfo.life_choice,
    title: "Life Choice",
    subtitle: "Let future self, resources, and opportunity cost debate the fork",
    desc: "Option A, Option B, future self, family reality, resources, core fear, and the arbiter lay out the trade-offs.",
  },
};

export default function HomeView({
  onStart,
  onSelectHistory,
  historyList,
  onSelectTemplate,
  lastInputDraft,
  onContinueDraft,
  onDeleteHistory,
  language = DEFAULT_LANGUAGE,
  commercialTasks = [],
  commercialTasksLoading = false,
  commercialTasksError = "",
  onRefreshCommercialTasks,
  onTaskViewProgress = () => undefined,
  onTaskRetry = () => undefined,
  onTaskCancel = () => undefined,
  onTaskViewReport = () => undefined,
}: HomeViewProps) {
  const [activeTab, setActiveTab] = useState<SimulationType>("side_hustle");
  const isEnglish = language === "en-US";
  const heroCopy = getHomeHeroCopy(language);
  const privacySafetyCopy = getPrivacySafetyCopy(language);
  const localizedCategoryInfo = isEnglish ? categoryInfoEn : categoryInfo;
  const activeInfo = localizedCategoryInfo[activeTab];

  const handleStart = (type: SimulationType) => {
    void postValidationEvent({
      type: "input_started",
      scenarioType: type,
    });
    onStart(type);
  };

  const handleSelectTemplate = (type: SimulationType, index: number) => {
    const input = getTemplateSimulationInput(type, index);
    onSelectTemplate(input);
  };

  return (
    <div id="home-view-container" className="bg-[#050711] text-white">
      <section id="home-starmap-shell" className="relative overflow-hidden px-4 pb-8 pt-7 md:pb-10 md:pt-10">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(251,191,36,0.11),transparent_28%,rgba(103,232,249,0.09)_55%,transparent_76%,rgba(244,114,182,0.08))]" />
          <div
            id="home-ambient-mesh"
            className="absolute inset-0 bg-[conic-gradient(from_145deg_at_62%_36%,rgba(251,191,36,0.18),rgba(14,165,233,0.06)_24%,rgba(168,85,247,0.16)_42%,rgba(244,114,182,0.08)_58%,rgba(5,7,17,0)_78%,rgba(251,191,36,0.12))] opacity-70 mix-blend-screen"
          />
          <div className="absolute inset-0 bg-[linear-gradient(155deg,transparent_0%,rgba(255,255,255,0.055)_36%,transparent_47%,rgba(103,232,249,0.075)_58%,transparent_72%)]" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/45 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-200/25 to-transparent" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:44px_44px] opacity-35" />
        </div>

        <div id="home-toolbench-shell" className="relative z-10 mx-auto max-w-6xl">
          <motion.div
            id="home-toolbench-hero"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="grid items-stretch gap-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(31rem,1.08fr)]"
          >
            <div className="flex min-h-[34rem] flex-col justify-center py-4 text-left lg:min-h-[39rem]">
              <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-amber-300/35 bg-amber-300/10 px-3.5 py-2 text-xs font-black tracking-wide text-amber-100 shadow-[0_0_28px_rgba(251,191,36,0.12)] backdrop-blur-md">
                <Sparkles className="h-3.5 w-3.5 text-amber-200" aria-hidden="true" />
                <span>{isEnglish ? "AI Starmap Sandbox · 30-Day Simulation" : "AI 星图沙盘 · 30 天推演"}</span>
              </div>
              <div className="mb-4 w-fit border-l border-cyan-200/40 pl-3 text-[11px] font-black uppercase tracking-[0.24em] text-cyan-100/72">
                {isEnglish ? "Shareable AI Decision Sandbox" : "传播级 AI 决策沙盘"}
              </div>

              <h1 id="home-main-title" className="max-w-3xl text-xl font-extrabold leading-[1.14] tracking-tight text-white md:text-[1.95rem] lg:text-[2.1rem]">
                <span className="block whitespace-nowrap">{heroCopy.title}</span>
                <br />
                <span className="bg-gradient-to-r from-amber-200 via-orange-300 to-fuchsia-300 bg-clip-text text-transparent">
                  {heroCopy.highlight}
                </span>
              </h1>

              <p id="home-subtitle" className="mt-5 max-w-xl text-sm leading-7 text-white/68 md:text-base">
                {heroCopy.subtitle} {isEnglish
                  ? "7 agents build a worldline around your choice so you can see the consequences before acting."
                  : "7 个智能体正在围绕你的选择建立世界线，先把后果推演一遍，再决定要不要真的行动。"}
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <button
                  id={`btn-launch-${activeTab}`}
                  onClick={() => handleStart(activeTab)}
                  className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-6 text-sm font-black transition-all duration-200 active:scale-98 cursor-pointer ${activeInfo.button}`}
                >
                  <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                  <span>{isEnglish ? "Enter simulation" : "进入星图推演"}</span>
                </button>
              </div>

              <div id="home-scenario-tool-grid" className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {(["side_hustle", "dating", "life_choice"] as SimulationType[]).map((type) => {
                  const info = localizedCategoryInfo[type];
                  const Icon = info.icon;
                  const isActive = activeTab === type;

                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setActiveTab(type)}
                      className={`min-h-28 rounded-2xl border p-3 text-left transition-all duration-200 cursor-pointer ${
                        isActive
                          ? info.active
                          : "border-white/10 bg-white/[0.06] text-white/70 hover:border-white/18 hover:bg-white/[0.09] hover:text-white"
                      }`}
                    >
                      <span className="mb-3 flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/8">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="block text-sm font-black leading-tight">{info.title}</span>
                      <span className="mt-2 line-clamp-2 block text-[11px] leading-relaxed text-white/48">
                        {info.subtitle}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div id="home-example-tool-strip" className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="text-left sm:col-span-3">
                  <h2 className="flex items-center gap-2 text-sm font-black text-white md:text-base">
                    <Sparkles className="h-4 w-4 text-amber-200" aria-hidden="true" />
                    <span>{isEnglish ? "Load a real example" : "真实案例，直接载入"}</span>
                  </h2>
                  <p className="mt-1.5 text-xs leading-relaxed text-white/42">
                    {isEnglish
                      ? "Load a real example, review it, then start the simulation."
                      : "点击加载真实案例，确认后再开始推演。"}
                  </p>
                </div>

                {templates[activeTab].map((tpl, idx) => (
                  <div
                    id={`template-item-${activeTab}-${idx}`}
                    key={idx}
                    onClick={() => handleSelectTemplate(activeTab, idx)}
                    className="group flex min-h-32 cursor-pointer flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-left shadow-xl shadow-black/15 backdrop-blur-xl transition-all duration-200 hover:border-amber-200/45 hover:bg-white/[0.09]"
                  >
                    <div>
                      <span className="rounded-full border border-white/10 bg-white/8 px-2 py-1 text-[10px] font-black text-white/58">
                        {tpl.tag}
                      </span>
                      <h3 className="mt-3 line-clamp-2 text-xs font-black leading-snug text-white transition-colors group-hover:text-amber-100">{tpl.title}</h3>
                      <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-white/42">{tpl.desc}</p>
                    </div>
                    <span className="mt-3 inline-flex items-center gap-1 text-[10px] font-black text-amber-200 opacity-0 transition-opacity group-hover:opacity-100">
                      {isEnglish ? "Load template" : "载入模板"}
                      <ArrowRight className="h-3 w-3" aria-hidden="true" />
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <AgentSandboxPreview simulationType={activeTab} language={language} />
          </motion.div>
        </div>
      </section>

      <section className="border-t border-white/10 bg-[#080b16] px-4 py-10">
        <div className="mx-auto max-w-6xl">
          {lastInputDraft && onContinueDraft && (
            <div className="mb-8 rounded-3xl border border-cyan-200/20 bg-cyan-300/[0.075] p-4 text-left shadow-xl shadow-black/15 backdrop-blur-xl">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-200/25 bg-white/8 text-cyan-100">
                    <PencilLine className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-white">{isEnglish ? "Continue last draft" : "继续编辑上次输入"}</h2>
                    <p className="mt-1 text-xs leading-relaxed text-white/50">
                      {isEnglish
                        ? "Your last simulation input is saved locally. Return to the form, adjust it, and simulate again."
                        : "上次开始推演时的内容还在本机，可以回到表单修改后重新模拟。"}
                    </p>
                  </div>
                </div>
                <button
                  id="btn-continue-last-input-draft"
                  onClick={() => onContinueDraft(lastInputDraft)}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-4 text-xs font-black text-slate-950 transition-colors hover:bg-cyan-200 cursor-pointer"
                >
                  <span>{isEnglish ? "Continue editing" : "继续编辑"}</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          <TaskCenter
            tasks={commercialTasks}
            language={language}
            isLoading={commercialTasksLoading}
            error={commercialTasksError}
            onRefresh={onRefreshCommercialTasks}
            onViewProgress={onTaskViewProgress}
            onRetry={onTaskRetry}
            onCancel={onTaskCancel}
            onViewReport={onTaskViewReport}
          />

          {historyList.length > 0 && (
            <div id="history-section" className="mt-10 rounded-3xl border border-white/10 bg-white/[0.055] p-6 text-left shadow-xl shadow-black/15 backdrop-blur-xl">
              <h2 className="mb-4 flex items-center gap-2 text-base font-black text-white md:text-lg">
                <History className="h-5 w-5 text-white/55" aria-hidden="true" />
                <span>{isEnglish ? "My simulation history" : "我的历史推演记录"}</span>
              </h2>

              <div className="divide-y divide-white/10">
                {historyList.map((hist) => {
                  const statusColor = hist.report.successProbability >= 70
                    ? "text-emerald-200 bg-emerald-300/10 border-emerald-300/20"
                    : hist.report.successProbability >= 45
                    ? "text-amber-100 bg-amber-300/10 border-amber-300/20"
                    : "text-rose-100 bg-rose-300/10 border-rose-300/20";

                  let scenarioTag = isEnglish ? "Side Hustle" : "副业搞钱";
                  if (hist.type === "dating") scenarioTag = isEnglish ? "Dating Chat" : "恋爱聊天";
                  if (hist.type === "life_choice") scenarioTag = isEnglish ? "Life Choice" : "重大选择";

                  return (
                    <div
                      id={`history-item-${hist.id}`}
                      key={hist.id}
                      onClick={() => onSelectHistory(hist)}
                      className="flex cursor-pointer items-center justify-between rounded-2xl px-2 py-3.5 transition-colors duration-150 hover:bg-white/8"
                    >
                      <div className="min-w-0 flex-1 pr-4">
                        <div className="mb-1 flex items-center gap-1.5">
                          <span className="rounded-full bg-white/8 px-2 py-0.5 text-[9px] font-black text-white/50">
                            {scenarioTag}
                          </span>
                          <h3 className="truncate text-xs font-bold text-white">
                            {hist.report.projectName || (isEnglish ? "Untitled simulation" : "未命名推演")}
                          </h3>
                        </div>
                        <p className="text-[10px] text-white/35">
                          {isEnglish ? "Simulated at" : "推演时间"}: {new Date(hist.createdAt).toLocaleString(isEnglish ? "en-US" : "zh-CN", { hour12: false })}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`rounded-lg border px-2 py-1 text-[10px] font-black ${statusColor}`}>
                          {isEnglish ? "Win rate" : "胜率"}: {hist.report.successProbability}%
                        </span>
                        <span className="hidden text-xs font-bold text-white/45 md:inline">
                          {isEnglish ? "View report" : "查看报告"}
                        </span>
                        {onDeleteHistory && (
                          <button
                            id={`btn-delete-history-${hist.id}`}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onDeleteHistory(hist.id);
                            }}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/6 text-white/42 transition-colors hover:border-rose-300/35 hover:bg-rose-300/12 hover:text-rose-100 cursor-pointer"
                            aria-label={isEnglish ? "Delete report" : "删除报告"}
                            title={isEnglish ? "Delete report" : "删除报告"}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div id="home-disclaimer" className="mt-10 flex items-start gap-2 rounded-3xl border border-white/10 bg-white/[0.045] p-4 text-left">
            <AlertCircle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-white/38" aria-hidden="true" />
            <p className="text-[10px] leading-relaxed text-white/36">
              <span className="font-bold text-white/50">{isEnglish ? "Disclaimer:" : "免责声明："}</span>
              {isEnglish
                ? "Relationship fit, high-EQ reply evaluation, life-choice opportunity cost, and win-rate percentages are simulated by large language models through configured Agent roles. Real life has countless variables and force majeure. Results are not investment, legal, career, or emotional-contract advice; review them critically. "
                : "本试一下提供之恋爱契合度、高情商回复评价、重大抉择机会成本损益以及胜率百分比，均由大语言模型经过设定利益角色智能体模拟博弈演算而来。真实人生受制于无数变量与不可抗力，模拟所得结论不构成任何实质的投资建议、法律声明、职业推荐或情感契约，请带着批判性思维理性参考。"}
              {privacySafetyCopy}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
