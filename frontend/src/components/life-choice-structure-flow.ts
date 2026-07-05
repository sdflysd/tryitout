import {
  structureLifeChoiceInput,
  type StructuredLifeChoiceInput,
} from "./life-choice-structure";
import {
  requestLifeChoiceStructure,
  type RemoteStructuredLifeChoiceInput,
} from "./life-choice-structure-client";

type LifeChoiceStructureSource = "agent" | "fallback";

export interface LifeChoiceStructureReviewResult extends StructuredLifeChoiceInput {
  source: LifeChoiceStructureSource;
  fallbackReason?: string;
  notice: string;
}

interface StructureLifeChoiceForReviewDeps {
  requestStructure?: typeof requestLifeChoiceStructure;
}

export async function structureLifeChoiceForReview(
  decisionContext: string,
  deps: StructureLifeChoiceForReviewDeps = {},
): Promise<LifeChoiceStructureReviewResult> {
  try {
    const requestStructure = deps.requestStructure ?? requestLifeChoiceStructure;
    const structured = await requestStructure(decisionContext);
    return {
      ...structured,
      notice: getRemoteNotice(structured),
    };
  } catch (error) {
    const fallbackReason = error instanceof Error ? error.message : "request failed";
    return {
      ...structureLifeChoiceInput(decisionContext),
      source: "fallback",
      fallbackReason,
      notice: getFallbackNotice(fallbackReason),
    };
  }
}

function getRemoteNotice(structured: RemoteStructuredLifeChoiceInput): string {
  if (structured.source !== "fallback") {
    return "";
  }

  return getFallbackNotice(structured.fallbackReason ?? "agent unavailable");
}

function getFallbackNotice(reason: string): string {
  if (/agent response|options|返回格式|格式/i.test(reason)) {
    return "Agent 返回格式不稳定，已先用本地规则整理。你可以继续手动修改。";
  }

  return "Agent 暂时没连上，已先用本地规则整理。你可以继续手动修改。";
}
