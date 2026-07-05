import { structureLifeChoiceInput } from "../components/life-choice-structure.js";
import type {
  EditableLifeChoiceOption,
  StructuredLifeChoiceInput,
} from "../components/life-choice-structure.js";
import type { AiGateway } from "./ai/ai-gateway.js";
import type { ModelSelection } from "./ai/types.js";

export type LifeChoiceStructureSource = "agent" | "fallback";

const DEFAULT_STUDENT_FINANCIAL_BUFFER =
  "无独立收入，主要靠生活费/助学金/家里支持";

export interface AgentStructuredLifeChoiceInput extends StructuredLifeChoiceInput {
  source: LifeChoiceStructureSource;
  fallbackReason?: string;
}

interface StructureLifeChoiceWithAgentParams {
  gateway: AiGateway;
  decisionContext: string;
  modelSelection?: ModelSelection;
}

interface LifeChoiceAgentOption {
  title?: unknown;
  name?: unknown;
  label?: unknown;
  description?: unknown;
  details?: unknown;
  reason?: unknown;
}

interface LifeChoiceAgentResponse {
  options?: unknown;
  choices?: unknown;
  directions?: unknown;
  decisionOptions?: unknown;
  lifeChoiceOptions?: unknown;
  coreFear?: unknown;
  fear?: unknown;
  biggestFear?: unknown;
  financialBuffer?: unknown;
  economic_source?: unknown;
  economicSource?: unknown;
  familySupport?: unknown;
  family_attitude?: unknown;
  familyAttitude?: unknown;
}

const LIFE_CHOICE_STRUCTURE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    options: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          description: { type: "string" },
        },
        required: ["title"],
      },
    },
    coreFear: { type: "string" },
    financialBuffer: { type: "string" },
    familySupport: { type: "string" },
  },
  required: ["options"],
};

export async function structureLifeChoiceWithAgent({
  gateway,
  decisionContext,
  modelSelection,
}: StructureLifeChoiceWithAgentParams): Promise<AgentStructuredLifeChoiceInput> {
  try {
    const request = gateway.createRequest({
      step: "parse_scenario",
      scenarioType: "life_choice",
      modelSelection,
      systemPrompt: buildLifeChoiceStructureSystemPrompt(),
      userPrompt: buildLifeChoiceStructureUserPrompt(decisionContext),
      jsonSchema: LIFE_CHOICE_STRUCTURE_SCHEMA,
    });
    const result = await gateway.generateJson<LifeChoiceAgentResponse>(request);
    return normalizeAgentResponse(decisionContext, result.data);
  } catch (error) {
    return {
      ...structureLifeChoiceInput(decisionContext),
      source: "fallback",
      fallbackReason: error instanceof Error ? error.message : "agent structure failed",
    };
  }
}

function normalizeAgentResponse(
  decisionContext: string,
  response: LifeChoiceAgentResponse,
): AgentStructuredLifeChoiceInput {
  const options = normalizeAgentOptions(getAgentOptionsValue(response));
  if (options.length < 2) {
    throw new Error("Agent response must include at least 2 options");
  }

  return {
    decisionContext: decisionContext.trim(),
    options,
    financialBuffer: resolveFinancialBuffer(decisionContext, response),
    familySupport: getFirstOptionalString(
      response.familySupport,
      response.family_attitude,
      response.familyAttitude,
    ),
    coreFear: getFirstOptionalString(
      response.coreFear,
      response.fear,
      response.biggestFear,
    ),
    source: "agent",
  };
}

function resolveFinancialBuffer(
  decisionContext: string,
  response: LifeChoiceAgentResponse,
): string {
  const explicitFinancialBuffer = getFirstOptionalString(
    response.financialBuffer,
    response.economic_source,
    response.economicSource,
  );
  if (explicitFinancialBuffer) {
    return explicitFinancialBuffer;
  }

  return looksLikeStudentNoIncomeChoice(decisionContext)
    ? DEFAULT_STUDENT_FINANCIAL_BUFFER
    : "";
}

function looksLikeStudentNoIncomeChoice(decisionContext: string): boolean {
  const normalized = decisionContext.trim();
  const hasStudentSignal =
    /学生|在校|在读|高[一二三1-3]|高中|初中|中专|大专|大学|本科|研究生|上学|学业|升学|读书|学习/.test(
      normalized,
    );
  const hasWorkOrMoneySignal =
    /打工|工作|就业|赚钱|挣钱|收入|生活费|学费|助学金|兼职|养活|经济|存款|现金/.test(
      normalized,
    );

  return hasStudentSignal && hasWorkOrMoneySignal;
}

function getAgentOptionsValue(response: LifeChoiceAgentResponse): unknown {
  const explicitOptions = response.options ??
    response.choices ??
    response.directions ??
    response.decisionOptions ??
    response.lifeChoiceOptions;
  if (explicitOptions) {
    return explicitOptions;
  }

  return findFirstOptionLikeArray(response);
}

function findFirstOptionLikeArray(response: LifeChoiceAgentResponse): unknown {
  for (const value of Object.values(response)) {
    if (isOptionLikeArray(value)) {
      return value;
    }
  }

  return undefined;
}

function isOptionLikeArray(value: unknown): value is LifeChoiceAgentOption[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 4) {
    return false;
  }

  return value
    .slice(0, 2)
    .every((item) => {
      if (!item || typeof item !== "object") return false;
      const option = item as LifeChoiceAgentOption;
      return Boolean(getFirstOptionalString(option.title, option.name, option.label));
    });
}

function normalizeAgentOptions(options: unknown): EditableLifeChoiceOption[] {
  if (!Array.isArray(options)) return [];

  return options
    .map((option: LifeChoiceAgentOption, index) => {
      const title = getFirstOptionalString(
        option.title,
        option.name,
        option.label,
      );
      const description = getFirstOptionalString(
        option.description,
        option.details,
        option.reason,
      );
      return {
        id: `life-choice-option-agent-${index}`,
        label: ["A", "B", "C", "D"][index] ?? String(index + 1),
        title,
        description,
      };
    })
    .filter((option) => option.title.length > 0)
    .slice(0, 4);
}

function getOptionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getFirstOptionalString(...values: unknown[]): string {
  for (const value of values) {
    const normalized = getOptionalString(value);
    if (normalized) return normalized;
  }

  return "";
}

function buildLifeChoiceStructureSystemPrompt(): string {
  return [
    "你是人生选择输入整理 Agent。",
    "你的任务不是替用户做决定，而是从自由描述中提取 2-4 个可比较的人生方向，供用户确认和修改。",
    "不要编造用户没有表达的选择；可以把口语化选择改写为更清晰的短标题。",
    "如果用户写了恐惧、经济来源、家庭态度，也提取到对应字段。",
    "如果用户明显是在读学生、没有稳定工作，正在纠结继续学业还是打工/兼职/就业，把 financialBuffer 写成“无独立收入，主要靠生活费/助学金/家里支持”。",
    "只输出符合 schema 的 JSON。",
  ].join("\n");
}

function buildLifeChoiceStructureUserPrompt(decisionContext: string): string {
  return `请整理这段人生选择描述：\n${decisionContext.trim()}`;
}
