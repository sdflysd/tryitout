import {
  BadgeDollarSign,
  Boxes,
  Cpu,
  Layers3,
  Route,
} from "lucide-react";

import { type Language } from "../language.js";
import type {
  AdminCostGroupDto,
  AdminCostSummaryDto,
} from "./admin-client.js";
import { getAdminCopy, type AdminCopy } from "./admin-copy.js";

interface CostsPageProps {
  summary?: AdminCostSummaryDto;
  language?: Language;
}

const EMPTY_SUMMARY: AdminCostSummaryDto = {
  totalEstimatedCost: 0,
  providerGroups: [],
  modelGroups: [],
  stepGroups: [],
  taskGroups: [],
  outcomeGroups: [],
};

export default function CostsPage({ summary = EMPTY_SUMMARY, language }: CostsPageProps) {
  const copy = getAdminCopy(language);
  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5" aria-label={copy.costs.metricsAriaLabel}>
        <Metric title={copy.costs.metrics.totalEstimatedCost} value={formatCurrency(summary.totalEstimatedCost)} detail={copy.costs.metrics.allCalls} tone="amber" />
        <Metric title={copy.costs.metrics.provider} value={summary.providerGroups.length} detail={copy.costs.metrics.vendorSplit} tone="cyan" />
        <Metric title={copy.costs.metrics.model} value={summary.modelGroups.length} detail={copy.costs.metrics.modelMix} tone="emerald" />
        <Metric title={copy.costs.metrics.step} value={summary.stepGroups.length} detail={copy.costs.metrics.workflowSpend} tone="slate" />
        <Metric title={copy.costs.metrics.task} value={summary.taskGroups.length} detail={copy.costs.metrics.highCostTrail} tone="rose" />
      </section>

      <section className="border border-slate-200 bg-white">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <BadgeDollarSign className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-black text-slate-950">{copy.costs.title}</h2>
              <p className="text-xs font-semibold text-slate-500">{copy.costs.description}</p>
            </div>
          </div>
          <div className="font-mono text-xs font-black text-slate-700">{formatCurrency(summary.totalEstimatedCost)}</div>
        </div>

        <div className="grid gap-5 p-4 xl:grid-cols-2">
          <CostGroupTable title={copy.costs.group.provider} icon={Boxes} groups={summary.providerGroups} copy={copy} />
          <CostGroupTable title={copy.costs.group.model} icon={Cpu} groups={summary.modelGroups} copy={copy} />
          <CostGroupTable title={copy.costs.group.step} icon={Layers3} groups={summary.stepGroups} copy={copy} />
          <CostGroupTable title={copy.costs.group.task} icon={Route} groups={summary.taskGroups} copy={copy} />
        </div>
      </section>

      <section className="border border-slate-200 bg-white">
        <div className="flex min-h-12 items-center justify-between border-b border-slate-200 px-4">
          <h2 className="text-sm font-black text-slate-950">{copy.costs.outcome.title}</h2>
          <span className="text-xs font-bold text-slate-500">{copy.costs.outcome.watch}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.13em] text-slate-500">
              <tr>
                <th className="px-4 py-2 font-black">{copy.costs.outcome.column}</th>
                <th className="px-4 py-2 font-black">{copy.costs.group.tokens}</th>
                <th className="px-4 py-2 font-black">{copy.costs.group.cost}</th>
                <th className="px-4 py-2 font-black">{copy.costs.group.share}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.outcomeGroups.map((group) => (
                <tr key={group.key}>
                  <td className="px-4 py-3 font-mono font-black text-slate-950">{group.key}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">{group.tokens}</td>
                  <td className="px-4 py-3 font-mono font-black text-slate-950">{formatCurrency(group.cost)}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">{formatShare(group.cost, summary.totalEstimatedCost)}</td>
                </tr>
              ))}
              {summary.outcomeGroups.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-xs font-bold text-slate-500">
                    {copy.costs.outcome.empty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function CostGroupTable({
  title,
  icon: Icon,
  groups,
  copy,
}: {
  title: string;
  icon: typeof Boxes;
  groups: AdminCostGroupDto[];
  copy: AdminCopy;
}) {
  const totalCost = groups.reduce((total, group) => total + group.cost, 0);
  return (
    <section className="border border-slate-200">
      <div className="flex min-h-11 items-center justify-between border-b border-slate-200 bg-slate-50 px-3">
        <div className="flex items-center gap-2 text-sm font-black text-slate-950">
          <Icon className="h-4 w-4 text-slate-500" aria-hidden="true" />
          <span>{title}</span>
        </div>
        <span className="font-mono text-[10px] font-black text-slate-500">{formatCurrency(totalCost)}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[440px] text-left text-xs">
          <thead className="border-b border-slate-200 text-[10px] uppercase tracking-[0.13em] text-slate-500">
            <tr>
              <th className="px-3 py-2 font-black">{title}</th>
              <th className="px-3 py-2 font-black">{copy.costs.group.tokens}</th>
              <th className="px-3 py-2 font-black">{copy.costs.group.cost}</th>
              <th className="px-3 py-2 font-black">{copy.costs.group.share}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {groups.map((group) => (
              <tr key={group.key}>
                <td className="px-3 py-3 font-mono font-black text-slate-950">{group.key}</td>
                <td className="px-3 py-3 font-mono text-slate-700">{group.tokens}</td>
                <td className="px-3 py-3 font-mono font-black text-slate-950">{formatCurrency(group.cost)}</td>
                <td className="px-3 py-3 font-mono text-slate-700">{formatShare(group.cost, totalCost)}</td>
              </tr>
            ))}
            {groups.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-xs font-bold text-slate-500">
                  {copy.costs.group.empty(title)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Metric({
  title,
  value,
  detail,
  tone,
}: {
  title: string;
  value: string | number;
  detail: string;
  tone: "amber" | "cyan" | "emerald" | "slate" | "rose";
}) {
  const toneClass = {
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-950",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-950",
    slate: "border-slate-200 bg-white text-slate-950",
    rose: "border-rose-200 bg-rose-50 text-rose-950",
  }[tone];
  return (
    <div className={`min-h-24 border p-4 ${toneClass}`}>
      <div className="text-[10px] font-black uppercase tracking-[0.14em] opacity-60">{title}</div>
      <div className="mt-3 font-mono text-2xl font-black tracking-tight">{value}</div>
      <div className="mt-2 text-xs font-semibold opacity-70">{detail}</div>
    </div>
  );
}

function formatCurrency(value: number): string {
  return `¥${value.toFixed(2)}`;
}

function formatShare(value: number, total: number): string {
  if (total === 0) {
    return "0.00%";
  }
  return `${((value / total) * 100).toFixed(2)}%`;
}
