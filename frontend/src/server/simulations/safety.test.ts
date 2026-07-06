import assert from "node:assert/strict";
import test from "node:test";

import {
  assessUserInputSafety,
  buildSafetyGuidance,
  getDefaultReportDisclaimer,
} from "./safety.js";
import type { UserInput } from "../../types.js";

test("assessUserInputSafety blocks illegal or gray side hustle requests", () => {
  const result = assessUserInputSafety({
    type: "side_hustle",
    projectIdea: "我想做一个赌博灰产引流项目，用话术诱导别人充值。",
  });

  assert.equal(result.ok, false);
  assert.equal(result.category, "illegal_or_gray_business");
  assert.match(result.message, /不能帮你推演具体执行方案/);
});

test("assessUserInputSafety blocks manipulative dating requests", () => {
  const result = assessUserInputSafety({
    type: "dating",
    chatLogOrIssue: "我想用 PUA 套路操控对方，还想监控她的位置。",
  });

  assert.equal(result.ok, false);
  assert.equal(result.category, "manipulative_or_privacy_invasive_relationship");
  assert.match(result.message, /健康沟通/);
});

test("assessUserInputSafety allows ordinary decision simulations", () => {
  const safeInputs: UserInput[] = [
    {
      type: "side_hustle",
      projectIdea: "AI 简历优化服务，先访谈应届生验证需求。",
    },
    {
      type: "dating",
      chatLogOrIssue: "对方回复变慢，我想知道怎么更真诚地沟通。",
    },
    {
      type: "life_choice",
      lifeChoiceOptions: [
        { label: "A", title: "继续考研" },
        { label: "B", title: "先去工作" },
      ],
    },
  ];

  for (const input of safeInputs) {
    assert.equal(assessUserInputSafety(input).ok, true);
  }
});

test("buildSafetyGuidance includes restricted categories and report disclaimer rule", () => {
  const guidance = buildSafetyGuidance("dating");

  assert.match(guidance, /PUA/);
  assert.match(guidance, /操控/);
  assert.match(guidance, /侵犯隐私/);
  assert.match(guidance, /免责声明/);
});

test("getDefaultReportDisclaimer is scenario-specific but always non-advisory", () => {
  const disclaimer = getDefaultReportDisclaimer("life_choice");

  assert.match(disclaimer, /模拟参考/);
  assert.match(disclaimer, /不构成/);
  assert.match(disclaimer, /职业|法律|心理/);
});
