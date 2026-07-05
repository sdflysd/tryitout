# 人生试错机 (Life Sandbox Engine) - 后端 API 对接文档

本文档为“人生试错机”（多模态沙盘推演与博弈系统）前端与后端服务对接的详细接口文档。旨在指导开发人员进行服务端接口实现与前端集成。

---

## 1. 核心接口：推演计算接口

用于发起副业搞钱、恋爱聊天拉扯、重大人生抉择的30天沙盘推演，并返回深度推演报告、博弈多Agent立场和30天时间剧本。

*   **接口路径**: `/api/simulations`
*   **请求方法**: `POST`
*   **Content-Type**: `application/json`

---

## 2. 请求报文 (Request Body)

请求为包含 `userInput` 对象的 JSON 数据，通过 `type` 字段区分三种推演模式，不同模式对应不同的字段。

```json
{
  "userInput": {
    "type": "side_hustle" | "dating" | "life_choice",
    
    // 1. 副业搞钱模式专用字段 (当 type 为 "side_hustle" 时)
    "projectIdea": "例如：开一家社区自习室，通过线上小程序预约收费，提供安静学习空间...",
    "budget": "例如：前期投入 3000 元（买桌椅），后期按月付租金...",
    "availableTime": "例如：每天晚上 8 点到 10 点，周末全天...",
    "skills": "例如：文案策划、基础前端开发、社群运营经验...",
    
    // 2. 恋爱聊天拉扯专用字段 (当 type 为 "dating" 时)
    "scenarioBackground": "对方冷战、表白被拒、日常冷淡、被催婚、约会规划...",
    "chatLogOrIssue": "对方发：‘我想我们还是做朋友吧。’ 我该怎么回才能扭转局势...",
    "relationshipStage": "暗恋、暧昧、恋爱中、冷静期、面临分手、已分手挽回...",
    "worries": "担心回复显得太舔、担心彻底没话题、担心对方退群或拉黑...",
    
    // 3. 重大人生抉择专用字段 (当 type 为 "life_choice" 时)
    "decisionTitle": "例如：字节跳动 Offer VS 考公上岸...",
    "optionA": "选项A：大厂年薪35万，加班多，中年危机高，在大城市拼搏...",
    "optionB": "选项B：老家三线城市国税局公务员，月薪6k，安稳有编制，离父母近...",
    "personalWorries": "害怕大厂35岁被裁无处可去；又怕回老家生活太枯燥、晋升无望一辈子不甘心..."
  }
}
```

---

## 3. 响应报文 (Response Body)

接口响应统一返回一个 `Simulation` 推演对象。以下是完整的 JSON 返回 schema 与字段描述：

### 字段层级结构

```json
{
  "id": "String (唯一标识ID)",
  "type": "side_hustle | dating | life_choice (推演类型)",
  "userInput": { ... }, // 对应传入的 userInput
  "createdAt": "String (ISO 日期时间格式)",
  
  // 核心推演结果报告
  "report": {
    "projectName": "String (项目或抉择阶段名称)",
    "successProbability": "Number (0-100，胜率/心安避险系数)",
    "expectedRevenue": "String (首月模拟收益/倾向描述)",
    "riskLevel": "low | medium | high | extreme (风险系数)",
    "shouldDo": "strong_yes | test_small | not_directly | change_direction | not_recommended (裁决)",
    "scores": {
      "demandStrength": "Number (0-100，需求强度/好感度/A选项成长力)",
      "willingnessToPay": "Number (0-100，付费意愿/信任底线/B选项成长力)",
      "acquisitionDifficulty": "Number (0-100，获客难度/沟通摩擦/A选项现实阻力)",
      "competitionPressure": "Number (0-100，竞争压力/防备度/B选项现实阻力)",
      "executionFit": "Number (0-100，执行匹配度/情商匹配/自身抗压力)",
      "monetizationClarity": "Number (0-100，变现清晰/前景/长远防险力)"
    },
    "opportunities": ["String (可行性机会/突破口 1-3个)"],
    "risks": ["String (深水致命陷阱/踩雷点 1-3个)"],
    "pivotSuggestions": [
      {
        "title": "String (微调方案标题)",
        "description": "String (微调方案具体实操)"
      }
    ],
    "actionPlan7Days": [
      {
        "day": "Number (1-7天)",
        "title": "String (当日行动主题)",
        "action": "String (当日具体落地动作)"
      }
    ]
  },
  
  // 7 位 AI 多方角色群星博弈言论
  "agents": [
    {
      "id": "String (Agent 唯一标识)",
      "name": "String (角色名，如 挑剔的客户、竞争对手、高情商军师、严厉的丈母娘)",
      "role": "String (身份，如 核心消费者、防守方、决策人、反对派)",
      "stance": "支持 | 质疑 | 拷打 | 观察 (态度倾向)",
      "keyJudgment": "String (核心博弈评语，指出优劣势或心理状态)",
      "objection": "String (致命担忧或致命一击批判)"
    }
  ],
  
  // 30 天推演演进剧本
  "stages": [
    {
      "timeRange": "String (时间区间，如 Day 1-5, Day 6-12)",
      "title": "String (阶段里程碑标题)",
      "summary": "String (这几天里发生的博弈、摩擦和演化总结)",
      "keyDecision": "String (此阶段玩家面临的两难抉择或踩雷危机)",
      "nextSuggestion": "String (专家给出的破局突破方向)",
      "events": [
        {
          "title": "String (大事件名称)",
          "description": "String (事件具体经过)",
          "impact": "positive | negative (事件对事态的损益影响)"
        }
      ],
      "stateAfter": {
        "productClarity": "Number (0-100，产品清晰度/好感信任/决断清晰)",
        "executionEnergy": "Number (0-100，执行动力/精力精力/精神抗压)",
        "trafficProgress": "Number (0-100，获客流量/破冰感/A路线可行性)",
        "revenue": "String (累计收益或累计羁绊/生存底气值)"
      }
    }
  ]
}
```

---

## 4. 模式专属字段与大模型 (LLM) Prompt 生成指导

为了确保 AI 生成的返回 JSON 高度符合各模式的主题语境，后端在调用大模型 (如 `gemini-2.5-flash`) 时，必须根据不同模式构造对应的 System Instructions：

### 4.1 副业搞钱模式 (`side_hustle`)
*   **语气风格**: 辛辣、商业导向、接地气、黑话、大白话。
*   **评分映射**: Focus on **客户付费意愿**、**起号流量门槛**、**商业盈利闭环**。
*   **Agent 角色推荐**: 挑剔的付费用户、冷酷的竞品同行、挑剔的合伙人、理性的老程序员等。
*   **时间线维度**: 种子期 -> 种子测试 -> 流量获客 -> 转化变现 -> 长效留存。

### 4.2 恋爱聊天推演模式 (`dating`)
*   **语气风格**: 情感细腻、精算博弈、微操拉扯、透视心理。
*   **评分映射**:
    *   `demandStrength` -> 原始好感度 (对方对你的第一印象)
    *   `willingnessToPay` -> 信任包容力 (对方对你的容错底线)
    *   `acquisitionDifficulty` -> 沟通摩擦阻力 (聊死或踩雷风险)
    *   `competitionPressure` -> 对方防备防线 (退缩与不安全感)
    *   `executionFit` -> 情商匹配度 (话术与情感表达)
    *   `monetizationClarity` -> 相处前景指数 (未来相处的现实基础)
*   **Agent 角色推荐**: 敏感的博弈对象(TA)、TA的挑剔闺蜜、高情商两性精算师、情感刺客(情敌)等。
*   **时间线维度**: 试探破冰 -> 情绪微澜 -> 心理交锋 -> 破局台阶 -> 关系落槌。

### 4.3 人生重大抉择模式 (`life_choice`)
*   **语气风格**: 深度透视、沉稳宏观、辩证批判、后悔度规避、人生教练。
*   **评分映射**:
    *   `demandStrength` -> 选项A成长力 (长线增值红利)
    *   `willingnessToPay` -> 选项B成长力 (备选路线长线潜能)
    *   `acquisitionDifficulty` -> 选项A现实阻力 (做选择A面临的代价阻碍)
    *   `competitionPressure` -> 选项B现实阻力 (做选择B面临的代价阻碍)
    *   `executionFit` -> 抗压匹配度 (应对最坏担忧的决心)
    *   `monetizationClarity` -> 长远防险底线 (存款及家庭兜底能力)
*   **Agent 角色推荐**: 20年后的自己、焦虑的家庭长辈、冷酷的社会现实算盘、理想主义人生导师等。
*   **时间线维度**: 决断阵痛 -> 摩擦碰撞 -> 妥协防御 -> 胜负分晓 -> 后悔对撞。

---

## 5. 各模式响应示例 (JSON Sample)

### 5.1 恋爱聊天推演模式响应示例 (`dating`)
```json
{
  "id": "sim_dating_99812",
  "type": "dating",
  "userInput": {
    "type": "dating",
    "scenarioBackground": "相亲认识两周，昨晚约会对方说觉得进程有点快，想慢一点，然后今天微信回复字数明显变少。",
    "chatLogOrIssue": "对方今天发：‘刚下班，挺累的。’ 我该怎么回复？我想回：‘那今晚不打扰你了，你早点泡脚睡觉吧，明天再找你。’",
    "relationshipStage": "暧昧阶段",
    "worries": "担心显得像个没有情商的宿管阿姨，又怕对方借机冷淡退群。"
  },
  "createdAt": "2026-06-25T08:00:00Z",
  "report": {
    "projectName": "关系慢热期破冰拉扯",
    "successProbability": 68,
    "expectedRevenue": "30天安全筑基，对方防御感软化",
    "riskLevel": "medium",
    "shouldDo": "test_small",
    "scores": {
      "demandStrength": 55,
      "willingnessToPay": 60,
      "acquisitionDifficulty": 45,
      "competitionPressure": 50,
      "executionFit": 72,
      "monetizationClarity": 65
    },
    "opportunities": [
      "对方主动报备‘下班很累’，说明仍保留基本的安全分享，未彻底关死窗口。",
      "选择退让不纠缠、给对方降压是极其正确的姿态。"
    ],
    "risks": [
      "‘泡脚睡觉，明天再找你’带着机械的保姆式关怀，对高压状态的人无趣且敷衍。",
      "如果后续不进行幽默情绪调味，很容易流向无话可说的客套冰冻区。"
    ],
    "pivotSuggestions": [
      {
        "title": "情绪共振微调话术",
        "description": "不要命令对方‘泡脚睡觉’，换成：‘今天搬砖辛苦了！给你点一个赛博捏脚套餐💆。你先葛优躺充个电，我晚点再来找你。’既幽默又降压。"
      }
    ],
    "actionPlan7Days": [
      { "day": 1, "title": "降压留白", "action": "发送上述情绪话术后，立刻停止发微信，保持4-6小时静音，给TA绝对消化空间。" },
      { "day": 2, "title": "第三方分享", "action": "不聊情感话题，分享一张有趣的猫咪或美食图，配一句话：‘今天偶遇一个超治愈的家伙，感觉你也会喜欢。’不求回复。" }
    ]
  },
  "agents": [
    {
      "id": "agent_dating_1",
      "name": "慢热的相亲对象 (TA)",
      "role": "恋爱博弈对方",
      "stance": "质疑",
      "keyJudgment": "我觉得你虽然挺上心，但嘘寒问暖得像我爸，这让我压力很大，完全找不到心动感。",
      "objection": "千万不要每天准点发‘早安、晚安、多喝热水’，再发我就直接免打扰了。"
    },
    {
      "id": "agent_dating_2",
      "name": "高情商两性精算师",
      "role": "恋爱分析师",
      "stance": "支持",
      "keyJudgment": "你的退让极其及时，懂得以退为进，比那些被冷淡就疯狂连环问‘你是不是讨厌我’的选手聪明十倍。",
      "objection": ""
    }
  ],
  "stages": [
    {
      "timeRange": "Day 1-5",
      "title": "破除冰封与安全撤退",
      "summary": "回复幽默话术后不纠缠，对方在深夜得到了极度舒适的个人空间，对你的侵略性防线开始动摇。",
      "keyDecision": "要不要在第三天对方主动说‘哈哈那个猫真可爱’时，顺着杆子发起深度约会？",
      "nextSuggestion": "切勿操之过急！回一个幽默表情包，维持高情绪价值，然后继续降温，吊一下胃口。",
      "events": [
        { "title": "对方微弱主动", "description": "TA对你的猫咪表情进行了回复，并主动吐槽了今天的老板。", "impact": "positive" }
      ],
      "stateAfter": {
        "productClarity": 65,
        "executionEnergy": 80,
        "trafficProgress": 70,
        "revenue": "60"
      }
    }
  ]
}
```

---

## 6. 对接开发自检清单 (Backend Development Checklist)

1.  **JSON 解析容错**:
    *   由于 LLM 输出可能存在不确定性，后端必须使用严谨的 `Prompt` 配合 `responseSchema` 结构化输出参数（如 Gemini 的 `Structured Outputs` 或 `JSON Schema` 功能）以确保返回格式与 TypeScript 的 `Simulation` 接口强匹配。
2.  **大模型温度参数 (Temperature)**:
    *   建议设置在 `0.65 - 0.8` 之间，既保证了多智能体“拷打”的辛辣与趣味，又防止生成天马行空的破缺 JSON。
3.  **异常保护**:
    *   如果大模型返回超时或解析失败，后端应有优雅的降级机制，填充符合该模式的兜底数据，不可直接报 `500` 导致前端崩溃。
