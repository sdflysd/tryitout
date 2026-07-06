import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSystemInstruction,
  buildUserPrompt,
} from "./prompt-builder.js";

test("buildSystemInstruction returns the detailed scenario-specific instructions", () => {
  assert.match(
    buildSystemInstruction("side_hustle"),
    /副业搞钱模拟器\/人生试错机/,
  );
  assert.match(
    buildSystemInstruction("dating"),
    /百分之百禁止生成任何商业、副业、产品或搞钱术语/,
  );
  assert.match(
    buildSystemInstruction("life_choice"),
    /重大人生抉择与机会成本试错沙盘/,
  );
  assert.match(buildSystemInstruction("side_hustle"), /违法|诈骗|灰产|黑产/);
  const datingInstruction = buildSystemInstruction("dating");
  assert.match(datingInstruction, /PUA/);
  assert.match(datingInstruction, /操控/);
  assert.match(datingInstruction, /欺骗/);
  assert.match(buildSystemInstruction("life_choice"), /免责声明/);
});

test("buildUserPrompt preserves scenario interpolation and fallback behavior", () => {
  const sideHustlePrompt = buildUserPrompt("side_hustle", {
    type: "side_hustle",
    projectIdea: "AI简历修改服务",
  });

  assert.match(sideHustlePrompt, /副业项目想法: "AI简历修改服务"/);
  assert.match(sideHustlePrompt, /目标客户人群: "未明确定义，由AI智能分析"/);

  const datingPrompt = buildUserPrompt("dating", {
    type: "dating",
    chatLogOrIssue: "对方最近回复变慢，我想问清楚。",
  });

  assert.match(
    datingPrompt,
    /聊天记录或面临的核心冲突: "对方最近回复变慢，我想问清楚。"/,
  );
  assert.match(datingPrompt, /你打算采取的回复\/沟通计划 \(Action\): "无"/);

  const lifeChoicePrompt = buildUserPrompt("life_choice", {
    type: "life_choice",
    optionA: "继续考研",
    optionB: "先去工作",
    decisionContext: "我在考研、工作和回老家之间纠结。",
    financialBuffer: "生活费紧张，需要兼职或打工才能维持",
    lifeChoiceOptions: [
      {
        label: "A",
        title: "继续考研",
        description: "争取学历提升",
      },
      {
        label: "B",
        title: "先去工作",
        description: "尽快获得现金流",
      },
      {
        label: "C",
        title: "回老家考编",
        description: "满足家庭稳定期待",
      },
    ],
  });

  assert.match(lifeChoicePrompt, /用户原始描述: "我在考研、工作和回老家之间纠结。"/);
  assert.match(lifeChoicePrompt, /C\. 回老家考编 - 满足家庭稳定期待/);
  assert.match(lifeChoicePrompt, /选项 A \(如考公考研\): "继续考研"/);
  assert.match(lifeChoicePrompt, /选项 B \(如直接就业\): "先去工作"/);
  assert.match(lifeChoicePrompt, /经济来源与安全垫: "生活费紧张，需要兼职或打工才能维持"/);
  assert.match(lifeChoicePrompt, /家庭长辈支持力度: "中规中矩"/);
});
