export const CUSTOM_OPTION_VALUE = "__custom__";

interface ResolveCustomSingleChoiceArgs {
  selectedValue: string;
  customValue: string;
  fieldLabel: string;
}

type ResolveCustomSingleChoiceResult =
  | { value: string }
  | { error: string };

export function resolveCustomSingleChoice({
  selectedValue,
  customValue,
  fieldLabel,
}: ResolveCustomSingleChoiceArgs): ResolveCustomSingleChoiceResult {
  if (selectedValue !== CUSTOM_OPTION_VALUE) {
    return { value: selectedValue };
  }

  const trimmedCustomValue = customValue.trim();
  if (!trimmedCustomValue) {
    return { error: `请填写自定义${fieldLabel}。` };
  }

  return { value: trimmedCustomValue };
}

interface ResolveCustomMultiChoiceArgs {
  selectedValues: string[];
  customValue: string;
}

export function resolveCustomMultiChoice({
  selectedValues,
  customValue,
}: ResolveCustomMultiChoiceArgs): string[] {
  const trimmedCustomValue = customValue.trim();
  if (!trimmedCustomValue || selectedValues.includes(trimmedCustomValue)) {
    return selectedValues;
  }

  return [...selectedValues, trimmedCustomValue];
}
