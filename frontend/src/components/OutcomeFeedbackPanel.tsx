import React, { useState } from "react";
import { Send, MessageSquare } from "lucide-react";
import type { Simulation } from "../types";
import type { ClientValidationEvent } from "../validation-events";
import { postValidationEvent } from "../validation-events";

type AdoptedRecommendation = "adopted" | "partially_adopted" | "ignored";
type OutcomeCategory = "better" | "neutral" | "worse" | "not_yet";

interface OutcomeFeedbackInput {
  adoptedRecommendation: AdoptedRecommendation;
  outcomeCategory: OutcomeCategory;
  contact: string;
  note: string;
}

interface OutcomeFeedbackPanelProps {
  simulation: Simulation;
}

const ADOPTION_OPTIONS: { value: AdoptedRecommendation; label: string }[] = [
  { value: "adopted", label: "已按建议执行" },
  { value: "partially_adopted", label: "部分采纳" },
  { value: "ignored", label: "暂未采纳" },
];

const OUTCOME_OPTIONS: { value: OutcomeCategory; label: string }[] = [
  { value: "better", label: "变好了" },
  { value: "neutral", label: "差不多" },
  { value: "worse", label: "更糟了" },
  { value: "not_yet", label: "还没发生" },
];

export function limitOutcomeFeedbackNote(note: string): string {
  return note.trim().slice(0, 240);
}

export function buildOutcomeFeedbackEvent(
  simulation: Simulation,
  input: OutcomeFeedbackInput,
): ClientValidationEvent {
  return {
    type: "simulation_outcome_feedback",
    simulationId: simulation.id,
    scenarioType: simulation.type || simulation.userInput.type,
    adoptedRecommendation: input.adoptedRecommendation,
    outcomeCategory: input.outcomeCategory,
    contact: input.contact.trim().slice(0, 120),
    text: limitOutcomeFeedbackNote(input.note),
  };
}

export default function OutcomeFeedbackPanel({ simulation }: OutcomeFeedbackPanelProps) {
  const [adoptedRecommendation, setAdoptedRecommendation] = useState<AdoptedRecommendation>("partially_adopted");
  const [outcomeCategory, setOutcomeCategory] = useState<OutcomeCategory>("not_yet");
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void postValidationEvent(
      buildOutcomeFeedbackEvent(simulation, {
        adoptedRecommendation,
        outcomeCategory,
        contact,
        note,
      }),
    );
    setSubmitted(true);
  };

  return (
    <section id="simulation-outcome-feedback" className="bg-white rounded-3xl border border-gray-150 p-6 shadow-xs text-left">
      <h2 className="text-base font-bold text-gray-950 mb-1 flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-emerald-500" />
        <span>后续真实结果</span>
      </h2>
      <p className="text-xs text-gray-500 mb-5">
        7 天后把真实进展回填到验证池，用来校准 Agent 判断；不会改动当前报告。
      </p>

      {submitted ? (
        <p className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-xs font-bold text-emerald-700">
          已记录结果反馈，谢谢。
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <span className="block text-xs font-bold text-gray-800">建议采纳情况</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {ADOPTION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setAdoptedRecommendation(option.value)}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                    adoptedRecommendation === option.value
                      ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                      : "border-gray-200 bg-gray-50 text-gray-600"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-bold text-gray-800">真实结果方向</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {OUTCOME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setOutcomeCategory(option.value)}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                    outcomeCategory === option.value
                      ? "border-blue-400 bg-blue-50 text-blue-800"
                      : "border-gray-200 bg-gray-50 text-gray-600"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block space-y-2">
            <span className="block text-xs font-bold text-gray-800">联系方式（可选）</span>
            <input
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              placeholder="微信、邮箱或留空"
              className="w-full rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-900 outline-none placeholder:text-gray-350 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
          <label className="block space-y-2">
            <span className="block text-xs font-bold text-gray-800">真实结果备注（可选）</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              maxLength={240}
              placeholder="例如：第 7 天实际拿到几个反馈、有没有付费、关系/选择有没有变化"
              className="w-full rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-900 outline-none placeholder:text-gray-350 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-xs font-bold text-white hover:bg-gray-800"
          >
            <Send className="w-4 h-4" />
            <span>提交结果反馈</span>
          </button>
        </form>
      )}
    </section>
  );
}
