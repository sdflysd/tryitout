import type { Simulation, SimulationType } from "../types.js";

export type ShareCardCopy = {
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

export type SharePosterOutcome = "native-share" | "image-clipboard" | "downloaded-text" | "downloaded";

type ShareNavigator = {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
  clipboard?: {
    write?: (items: ClipboardItem[]) => Promise<void>;
    writeText?: (text: string) => Promise<void>;
  };
};

export type SharePosterEnvironment = {
  navigator: ShareNavigator;
  ClipboardItem?: typeof ClipboardItem;
  fileFactory?: (parts: BlobPart[], fileName: string, options?: FilePropertyBag) => File;
  downloadFile?: (image: Blob, fileName: string) => void;
};

export type SharePosterInput = {
  image: Blob;
  fileName: string;
  title: string;
  text: string;
};

export async function renderSharePosterBlob(element: HTMLElement): Promise<Blob> {
  const { toBlob } = await import("html-to-image");
  const pixelRatio = Math.min(window.devicePixelRatio || 2, 3);
  const blob = await toBlob(element, {
    cacheBust: true,
    pixelRatio,
    backgroundColor: "#ffffff",
  });

  if (!blob) {
    throw new Error("Unable to render share poster image.");
  }

  return blob;
}

export function downloadPosterImage(image: Blob, fileName: string): void {
  const url = URL.createObjectURL(image);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createBrowserShareEnvironment(): SharePosterEnvironment {
  return {
    navigator: window.navigator,
    ClipboardItem: typeof ClipboardItem !== "undefined" ? ClipboardItem : undefined,
    downloadFile: downloadPosterImage,
  };
}

export function getSimulationType(simulation: Simulation): SimulationType {
  return simulation.type || simulation.userInput.type || "side_hustle";
}

export function getShareCardCopy(type: SimulationType): ShareCardCopy {
  if (type === "dating") {
    return {
      modalTitle: "情感沟通卡片生成器",
      modalDescription: "选择风格，长按保存或一键分享到微信，让懂你的人一起参谋。",
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
      modalDescription: "选择风格，长按保存或一键分享到微信，让信任的人一起参谋。",
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
    modalDescription: "选择风格，长按保存或一键分享到微信，让群里兄弟们一起参谋。",
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

export function getDisplayName(simulation: Simulation, fallbackName: string) {
  return (
    simulation.report.projectName ||
    simulation.userInput.projectIdea ||
    simulation.userInput.chatLogOrIssue ||
    simulation.userInput.relationshipStatus ||
    simulation.userInput.optionA ||
    fallbackName
  );
}

export function getRecommendedRoute(simulation: Simulation) {
  const comparison = simulation.routeComparison;
  if (!comparison) {
    return undefined;
  }

  return comparison.routes.find((route) => route.id === comparison.recommendedRouteId) ?? comparison.routes[0];
}

export function getAgentObjection(simulation: Simulation): string {
  return (
    simulation.agents.find((agent) => agent.objection)?.objection ??
    simulation.report.risks[0] ??
    "暂无关键反对意见"
  );
}

function getRiskLevelLabel(riskLevel: Simulation["report"]["riskLevel"]) {
  return riskLevel === "low"
    ? "低风险"
    : riskLevel === "medium"
      ? "中等风险"
      : riskLevel === "high"
        ? "高风险"
        : "极高风险";
}

export function buildShareCardText(simulation: Simulation): string {
  const copy = getShareCardCopy(getSimulationType(simulation));
  const displayName = getDisplayName(simulation, copy.fallbackName);
  const recommendedRoute = getRecommendedRoute(simulation);
  const { report } = simulation;

  return `
【试一下】
${copy.subjectLabel}：《${displayName}》
━━━━━━━━━━━━━━━━━━━━
${copy.probabilityLabel}：${report.successProbability}%
${copy.expectedLabel}：${report.expectedRevenue}
${copy.riskLabel}：${getRiskLevelLabel(report.riskLevel)}
${recommendedRoute ? `推荐路线：${recommendedRoute.title}（后悔风险 ${recommendedRoute.regretRisk}%）` : ""}
━━━━━━━━━━━━━━━━━━━━
【${copy.recommendationLabel}】：
${report.finalRecommendation}

【${copy.planLabel}】：
${report.actionPlan7Days.slice(0, 3).map((p) => `Day ${p.day}: ${p.title} - ${p.action}`).join("\n")}

※ ${copy.footerLine}！
    `.trim();
}

function createShareFile(input: SharePosterInput, env: SharePosterEnvironment): File | undefined {
  const options = { type: input.image.type || "image/png" };

  try {
    if (env.fileFactory) {
      return env.fileFactory([input.image], input.fileName, options);
    }

    if (typeof File !== "undefined") {
      return new File([input.image], input.fileName, options);
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export async function sharePosterImageWithFallback(
  input: SharePosterInput,
  env: SharePosterEnvironment,
): Promise<SharePosterOutcome> {
  const shareFile = createShareFile(input, env);
  const shareData: ShareData | undefined = shareFile
    ? { title: input.title, text: input.text, files: [shareFile] }
    : undefined;

  if (
    shareData &&
    env.navigator.share &&
    env.navigator.canShare?.(shareData)
  ) {
    try {
      await env.navigator.share(shareData);
      return "native-share";
    } catch {
      // Fall through to local sharing options if the share sheet is cancelled or rejected.
    }
  }

  const ClipboardItemCtor =
    env.ClipboardItem ?? (typeof ClipboardItem !== "undefined" ? ClipboardItem : undefined);

  if (ClipboardItemCtor && env.navigator.clipboard?.write) {
    try {
      await env.navigator.clipboard.write([
        new ClipboardItemCtor({ [input.image.type || "image/png"]: input.image }),
      ]);
      return "image-clipboard";
    } catch {
      // Fall through to download/text fallback.
    }
  }

  env.downloadFile?.(input.image, input.fileName);

  if (env.navigator.clipboard?.writeText) {
    try {
      await env.navigator.clipboard.writeText(input.text);
      return "downloaded-text";
    } catch {
      return "downloaded";
    }
  }

  return "downloaded";
}
