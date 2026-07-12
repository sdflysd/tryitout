import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ShareCard from "./ShareCard.js";
import {
  buildShareCardText,
  copyShareTextToClipboard,
  sharePosterImageWithFallback,
} from "./share-card-sharing.js";
import type { Simulation } from "../types.js";

const baseSimulation: Simulation = {
  id: "sim-test-0001",
  type: "dating",
  userInput: {
    type: "dating",
    relationshipStatus: "暧昧冷淡期",
    chatLogOrIssue: "TA 最近回复变慢",
  },
  agents: [],
  stages: [],
  createdAt: "2026-06-26T00:00:00.000Z",
  report: {
    projectName: "暧昧拉扯期低压修复评估",
    successProbability: 78,
    expectedRevenue: "情感安全感回升",
    riskLevel: "medium",
    finalRecommendation: "建议放慢推进速度，用低压力、可回应的生活化表达重新建立安全感。",
    finalOutcome: "关系回到可沟通状态",
    shouldDo: "test_small",
    scores: {
      demandStrength: 72,
      willingnessToPay: 65,
      acquisitionDifficulty: 58,
      competitionPressure: 46,
      executionFit: 74,
      monetizationClarity: 60,
    },
    opportunities: ["对方仍保留回应窗口"],
    risks: ["过度追问会触发防备"],
    pivotSuggestions: [
      {
        title: "换成低压回应",
        description: "先承认对方节奏，再给出轻量邀约。",
      },
    ],
    actionPlan7Days: [
      {
        day: 1,
        title: "降压开场",
        action: "发送一句不索取答案的轻量关心。",
      },
    ],
  },
};

test("dating share card uses relationship language instead of side-hustle copy", () => {
  const html = renderToStaticMarkup(
    <ShareCard simulation={baseSimulation} onClose={() => undefined} />,
  );

  assert.match(html, /情感|关系|TA|亲密/);
  assert.doesNotMatch(html, /副业|搞钱|现金流|跑通胜率|MVP|兄弟们一起参谋/);
});

test("share card highlights route outcome, agent objection, and regret risk", () => {
  const html = renderToStaticMarkup(
    <ShareCard
      simulation={{
        ...baseSimulation,
        type: "side_hustle",
        userInput: { type: "side_hustle", projectIdea: "AI 简历优化" },
        agents: [
          {
            id: "customer_agent",
            name: "客户 Agent",
            role: "目标客户",
            stance: "质疑",
            keyJudgment: "需要案例",
            objection: "缺少真实案例，付费会犹豫。",
          },
        ],
        routeComparison: {
          recommendedRouteId: "mvp",
          routes: [
            {
              id: "mvp",
              label: "B",
              title: "MVP 手动验证",
              premise: "先服务再开发。",
              stageSummaries: [],
              finalState: {
                day: 30,
                productClarity: 60,
                executionEnergy: 60,
                trafficProgress: 40,
                trialUsers: 5,
                paidUsers: 1,
                revenue: 99,
                riskLevel: 40,
                confidence: 60,
              },
              successProbability: 64,
              regretRisk: 28,
              upside: "低成本看到信号",
              downside: "增长慢",
              triggerToChoose: "5 人愿意付费",
            },
          ],
          tradeoffs: [],
          sensitivityVariables: [],
          sevenDayProbe: [],
        },
      }}
      onClose={() => undefined}
    />,
  );

  assert.match(html, /MVP 手动验证/);
  assert.match(html, /缺少真实案例/);
  assert.match(html, /后悔风险|28%/);
});

test("share card presents a WeChat image share call to action", () => {
  const html = renderToStaticMarkup(
    <ShareCard simulation={baseSimulation} onClose={() => undefined} />,
  );

  assert.match(html, /一键分享到微信/);
  assert.doesNotMatch(html, /一键复制文字口令/);
});

test("share card disables the WeChat action until a poster image is prepared", () => {
  const html = renderToStaticMarkup(
    <ShareCard simulation={baseSimulation} onClose={() => undefined} />,
  );

  assert.match(html, /id="btn-share-wechat"[^>]*disabled/);
});

test("share poster uses native file sharing when the browser supports image files", async () => {
  const calls: string[] = [];
  const image = new Blob(["png"], { type: "image/png" });

  const outcome = await sharePosterImageWithFallback(
    {
      image,
      fileName: "life-card.png",
      title: "试一下",
      text: "分享文字",
    },
    {
      navigator: {
        canShare(data) {
          calls.push(`canShare:${data.files?.[0]?.name}`);
          return true;
        },
        async share(data) {
          calls.push(`share:${data.files?.[0]?.name}:${data.text}`);
        },
      },
      fileFactory(_parts, fileName, options) {
        return { name: fileName, type: options?.type } as File;
      },
      downloadFile() {
        assert.fail("native sharing should not download");
      },
    },
  );

  assert.equal(outcome, "native-share");
  assert.deepEqual(calls, [
    "canShare:life-card.png",
    "share:life-card.png:分享文字",
  ]);
});

test("share poster treats native share cancellation as a cancelled action without fallback side effects", async () => {
  const image = new Blob(["png"], { type: "image/png" });
  let downloaded = false;
  let copiedText = "";

  const outcome = await sharePosterImageWithFallback(
    {
      image,
      fileName: "life-card.png",
      title: "试一下",
      text: "分享文字",
    },
    {
      navigator: {
        canShare() {
          return true;
        },
        async share() {
          throw new DOMException("Share cancelled", "AbortError");
        },
        clipboard: {
          async writeText(text) {
            copiedText = text;
          },
        },
      },
      fileFactory(_parts, fileName, options) {
        return { name: fileName, type: options?.type } as File;
      },
      downloadFile() {
        downloaded = true;
      },
    },
  );

  assert.equal(outcome, "native-share-cancelled");
  assert.equal(downloaded, false);
  assert.equal(copiedText, "");
});

test("share poster copies image to clipboard when native file sharing is unavailable", async () => {
  const image = new Blob(["png"], { type: "image/png" });
  let writtenItems: ClipboardItem[] = [];
  let clipboardPayload: Record<string, Blob> | undefined;

  class TestClipboardItem {
    constructor(items: Record<string, Blob>) {
      clipboardPayload = items;
    }
  }

  const outcome = await sharePosterImageWithFallback(
    {
      image,
      fileName: "life-card.png",
      title: "试一下",
      text: "分享文字",
    },
    {
      ClipboardItem: TestClipboardItem as unknown as typeof ClipboardItem,
      navigator: {
        canShare() {
          return false;
        },
        clipboard: {
          async write(items) {
            writtenItems = items;
          },
        },
      },
      downloadFile() {
        assert.fail("image clipboard should not download");
      },
    },
  );

  assert.equal(outcome, "image-clipboard");
  assert.equal(writtenItems.length, 1);
  assert.deepEqual(Object.keys(clipboardPayload ?? {}), ["image/png"]);
});

test("share poster downloads image and copies text when image clipboard is unavailable", async () => {
  const image = new Blob(["png"], { type: "image/png" });
  let downloadedFileName = "";
  let copiedText = "";

  const outcome = await sharePosterImageWithFallback(
    {
      image,
      fileName: "life-card.png",
      title: "试一下",
      text: "分享文字",
    },
    {
      navigator: {
        canShare() {
          return false;
        },
        clipboard: {
          async writeText(text) {
            copiedText = text;
          },
        },
      },
      downloadFile(_image, fileName) {
        downloadedFileName = fileName;
      },
    },
  );

  assert.equal(outcome, "downloaded-text");
  assert.equal(downloadedFileName, "life-card.png");
  assert.equal(copiedText, "分享文字");
});

test("buildShareCardText preserves report, route, and action-plan payload", () => {
  const text = buildShareCardText({
    ...baseSimulation,
    type: "side_hustle",
    userInput: { type: "side_hustle", projectIdea: "AI 简历优化" },
    report: {
      ...baseSimulation.report,
      projectName: "AI 简历优化",
      successProbability: 64,
      expectedRevenue: "首月 99 元",
      riskLevel: "medium",
      finalRecommendation: "先做手动服务验证，不要急着开发自动化产品。",
    },
    routeComparison: {
      recommendedRouteId: "mvp",
      routes: [
        {
          id: "mvp",
          label: "B",
          title: "MVP 手动验证",
          premise: "先服务再开发。",
          stageSummaries: [],
          finalState: {
            day: 30,
            productClarity: 60,
            executionEnergy: 60,
            trafficProgress: 40,
            trialUsers: 5,
            paidUsers: 1,
            revenue: 99,
            riskLevel: 40,
            confidence: 60,
          },
          successProbability: 64,
          regretRisk: 28,
          upside: "低成本看到信号",
          downside: "增长慢",
          triggerToChoose: "5 人愿意付费",
        },
      ],
      tradeoffs: [],
      sensitivityVariables: [],
      sevenDayProbe: [],
    },
  });

  assert.match(text, /项目想法：《AI 简历优化》/);
  assert.match(text, /30天模拟胜率：64%/);
  assert.match(text, /预期首月收益：首月 99 元/);
  assert.match(text, /主要风险评级：中等风险/);
  assert.match(text, /推荐路线：MVP 手动验证（后悔风险 28%）/);
  assert.match(text, /先做手动服务验证/);
  assert.match(text, /Day 1: 降压开场 - 发送一句不索取答案的轻量关心。/);
});

test("copyShareTextToClipboard reports clipboard write failure", async () => {
  const copied = await copyShareTextToClipboard("分享文字", {
    navigator: {
      clipboard: {
        async writeText() {
          throw new Error("clipboard unavailable");
        },
      },
    },
  });

  assert.equal(copied, false);
});
