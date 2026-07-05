import type {
  StructuredLifeChoiceInput,
} from "./life-choice-structure";

export type LifeChoiceStructureSource = "agent" | "fallback";

export interface RemoteStructuredLifeChoiceInput extends StructuredLifeChoiceInput {
  source: LifeChoiceStructureSource;
  fallbackReason?: string;
}

interface RequestLifeChoiceStructureOptions {
  fetchImpl?: typeof fetch;
}

export async function requestLifeChoiceStructure(
  decisionContext: string,
  options: RequestLifeChoiceStructureOptions = {},
): Promise<RemoteStructuredLifeChoiceInput> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl("/api/life-choice/structure", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ decisionContext }),
  });

  const data = (await response.json().catch(() => ({}))) as Partial<
    RemoteStructuredLifeChoiceInput & { error: string }
  >;

  if (!response.ok) {
    throw new Error(data.error || `HTTP error! status: ${response.status}`);
  }

  if (!Array.isArray(data.options)) {
    throw new Error("整理选择接口返回格式不正确。");
  }

  return data as RemoteStructuredLifeChoiceInput;
}
