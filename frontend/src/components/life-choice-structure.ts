export interface EditableLifeChoiceOption {
  id: string;
  label: string;
  title: string;
  description: string;
}

export interface StructuredLifeChoiceInput {
  decisionContext: string;
  options: EditableLifeChoiceOption[];
  financialBuffer: string;
  familySupport: string;
  coreFear: string;
  mergeNotice?: string;
}

const OPTION_LABELS = ["A", "B", "C", "D"];
const MAX_VISIBLE_OPTIONS = 4;

export function createBlankLifeChoiceOption(idSuffix = Date.now().toString()): EditableLifeChoiceOption {
  return {
    id: `life-choice-option-${idSuffix}`,
    label: "",
    title: "",
    description: "",
  };
}

export function normalizeLifeChoiceOptions(
  options: EditableLifeChoiceOption[],
): EditableLifeChoiceOption[] {
  return relabelLifeChoiceOptions(
    options
      .map((option) => ({
        ...option,
        title: option.title.trim(),
        description: option.description.trim(),
      }))
      .filter((option) => option.title.length > 0),
  );
}

export function relabelLifeChoiceOptions(
  options: EditableLifeChoiceOption[],
): EditableLifeChoiceOption[] {
  return options
    .map((option) => ({
      ...option,
      title: option.title.trim(),
      description: option.description.trim(),
    }))
    .slice(0, MAX_VISIBLE_OPTIONS)
    .map((option, index) => ({
      ...option,
      label: OPTION_LABELS[index] ?? String(index + 1),
    }));
}

export function structureLifeChoiceInput(rawInput: string): StructuredLifeChoiceInput {
  const decisionContext = rawInput.trim();
  const labeled = parseLabeledTemplate(decisionContext);
  if (labeled.options.length > 0) {
    return labeled;
  }

  const extractedOptions = extractNaturalOptions(decisionContext);
  const options = normalizeExtractedOptions(extractedOptions);
  const mergedOptions = collapseOverflowOptions(options);

  return {
    decisionContext,
    options: mergedOptions.options,
    financialBuffer: "",
    familySupport: "",
    coreFear: inferCoreFear(decisionContext),
    mergeNotice: mergedOptions.mergeNotice,
  };
}

export function buildLifeChoiceSubmissionOptions(
  options: EditableLifeChoiceOption[],
): { optionA: string; optionB: string } {
  const normalized = normalizeLifeChoiceOptions(options);
  const [first, second, ...rest] = normalized;

  return {
    optionA: formatOptionForSubmission(first),
    optionB: [
      formatOptionForSubmission(second),
      ...rest.map((option) => `${option.label}. ${formatOptionForSubmission(option)}`),
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function resolveLifeChoiceCoreFear(coreFear: string, decisionContext: string): string {
  const trimmedFear = coreFear.trim();
  if (trimmedFear.length >= 5) {
    return trimmedFear;
  }

  const trimmedContext = decisionContext.trim();
  return trimmedContext
    ? `未单独填写，结合原始描述分析：${trimmedContext}`
    : "未单独填写，结合原始描述分析";
}

function parseLabeledTemplate(decisionContext: string): StructuredLifeChoiceInput {
  const fields = new Map<string, string>();

  for (const line of decisionContext.split(/\r?\n/)) {
    const match = line.match(/^【([^】]+)】：?\s*(.+)$/);
    if (!match) continue;
    fields.set(match[1].trim(), match[2].trim());
  }

  const options = OPTION_LABELS
    .map((label, index) => {
      const title = fields.get(`选项 ${label}`) || fields.get(`选项${label}`) || "";
      return {
        id: `life-choice-option-${label.toLowerCase()}-${index}`,
        label,
        title,
        description: "",
      };
    })
    .filter((option) => option.title.length > 0);

  return {
    decisionContext,
    options,
    financialBuffer: fields.get("积蓄情况") || "",
    familySupport: fields.get("长辈支持") || "",
    coreFear: fields.get("最大恐惧") || "",
  };
}

function extractNaturalOptions(decisionContext: string): string[] {
  const text = stripFearClause(decisionContext)
    .replace(/^我现在很纠结[:：]?\s*/, "")
    .replace(/^我可能/, "")
    .replace(/^可能/, "");
  const eitherOrOptions = extractEitherOrOptions(text);
  if (eitherOrOptions.length >= 2) {
    return eitherOrOptions;
  }

  const normalized = text
    .replace(/[。！？!?]/g, "；")
    .replace(/\n+/g, "；")
    .replace(/或者/g, "；")
    .replace(/也可以/g, "；")
    .replace(/还可以/g, "；")
    .replace(/也可能/g, "；")
    .replace(/可能/g, "；")
    .replace(/、/g, "；");

  return normalized
    .split(/[；;]/)
    .map(cleanOptionCandidate)
    .filter((candidate) => candidate.length >= 2);
}

function extractEitherOrOptions(text: string): string[] {
  const match = text.match(/(?:是|到底|究竟)?([^，。！？!?；;]{2,30}?)还是([^，。！？!?；;呢吗嘛]{2,30})(?:呢|吗|嘛)?/);
  if (!match) return [];

  return [match[1], match[2]]
    .map(cleanOptionCandidate)
    .filter((candidate) => candidate.length >= 2);
}

function normalizeExtractedOptions(candidates: string[]): EditableLifeChoiceOption[] {
  const unique: string[] = [];

  for (const candidate of candidates) {
    if (!unique.some((existing) => existing === candidate)) {
      unique.push(candidate);
    }
  }

  return unique.map((title, index) => ({
    id: `life-choice-option-${index}`,
    label: OPTION_LABELS[index] ?? String(index + 1),
    title,
    description: "",
  }));
}

function collapseOverflowOptions(options: EditableLifeChoiceOption[]): {
  options: EditableLifeChoiceOption[];
  mergeNotice?: string;
} {
  if (options.length <= MAX_VISIBLE_OPTIONS) {
    return { options };
  }

  const visible = options.slice(0, MAX_VISIBLE_OPTIONS - 1);
  const overflow = options.slice(MAX_VISIBLE_OPTIONS - 1);

  return {
    options: [
      ...visible,
      {
        id: "life-choice-option-overflow",
        label: OPTION_LABELS[MAX_VISIBLE_OPTIONS - 1],
        title: "其他待合并选择",
        description: overflow
          .map((option) => option.title)
          .join("；"),
      },
    ],
    mergeNotice: `我发现这里有 ${options.length} 个可能方向，先合并成 ${MAX_VISIBLE_OPTIONS} 组核心选择。`,
  };
}

function cleanOptionCandidate(candidate: string): string {
  return candidate
    .trim()
    .replace(/^(我|但我|然后我|先|再)?(可以|打算|准备|想要|想)?/, "")
    .replace(/^(选择|考虑|去|做)?/, "")
    .trim()
    .replace(/[，,]\s*$/, "");
}

function stripFearClause(text: string): string {
  return text.split(/最怕|最大恐惧|担心|害怕/)[0] ?? text;
}

function inferCoreFear(text: string): string {
  const match = text.match(/(?:最怕|最大恐惧|担心|害怕)(.+)$/);
  return match ? match[0].trim() : "";
}

function formatOptionForSubmission(option?: EditableLifeChoiceOption): string {
  if (!option) return "";
  return option.description
    ? `${option.title} - ${option.description}`
    : option.title;
}
