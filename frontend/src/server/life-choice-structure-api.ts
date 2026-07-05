import { structureLifeChoiceInput } from "../components/life-choice-structure.js";
import type { AiGateway } from "./ai/ai-gateway.js";
import type { ModelSelection } from "./ai/types.js";
import {
  structureLifeChoiceWithAgent,
  type AgentStructuredLifeChoiceInput,
} from "./life-choice-structure-agent.js";

export type LifeChoiceStructureApiBody =
  | AgentStructuredLifeChoiceInput
  | { error: string };

export interface LifeChoiceStructureApiResult {
  status: number;
  body: LifeChoiceStructureApiBody;
}

interface LifeChoiceStructureRequestBody {
  decisionContext?: unknown;
  modelSelection?: unknown;
}

interface HandleLifeChoiceStructureDeps {
  getGateway: () => AiGateway;
  structureWithAgent?: typeof structureLifeChoiceWithAgent;
}

const MIN_DECISION_CONTEXT_LENGTH = 15;

export async function handleLifeChoiceStructureRequest(
  requestBody: LifeChoiceStructureRequestBody | undefined,
  deps: HandleLifeChoiceStructureDeps,
): Promise<LifeChoiceStructureApiResult> {
  const decisionContext = getDecisionContext(requestBody);
  if (decisionContext.length < MIN_DECISION_CONTEXT_LENGTH) {
    return {
      status: 400,
      body: {
        error: "把你正在纠结的事先写完整一点，至少 15 个字。",
      },
    };
  }

  try {
    const gateway = deps.getGateway();
    const structureWithAgent =
      deps.structureWithAgent ?? structureLifeChoiceWithAgent;
    const structured = await structureWithAgent({
      gateway,
      decisionContext,
      modelSelection: getModelSelection(requestBody),
    });

    return {
      status: 200,
      body: structured,
    };
  } catch {
    return {
      status: 200,
      body: {
        ...structureLifeChoiceInput(decisionContext),
        source: "fallback",
        fallbackReason: "agent unavailable",
      },
    };
  }
}

function getDecisionContext(
  requestBody: LifeChoiceStructureRequestBody | undefined,
): string {
  return typeof requestBody?.decisionContext === "string"
    ? requestBody.decisionContext.trim()
    : "";
}

function getModelSelection(
  requestBody: LifeChoiceStructureRequestBody | undefined,
): ModelSelection | undefined {
  return requestBody?.modelSelection &&
    typeof requestBody.modelSelection === "object" &&
    !Array.isArray(requestBody.modelSelection)
    ? (requestBody.modelSelection as ModelSelection)
    : undefined;
}
