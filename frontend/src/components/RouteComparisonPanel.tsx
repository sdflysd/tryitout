import React, { useEffect, useRef } from "react";
import { Compass, GitCompare, ShieldAlert, Sparkles } from "lucide-react";
import type { Simulation } from "../types";
import { postValidationEvent } from "../validation-events";

interface RouteComparisonPanelProps {
  simulation: Simulation;
}

export default function RouteComparisonPanel({ simulation }: RouteComparisonPanelProps) {
  const routeComparison = simulation.routeComparison;
  const postedSimulationIds = useRef(new Set<string>());

  useEffect(() => {
    if (!routeComparison || postedSimulationIds.current.has(simulation.id)) {
      return;
    }

    postedSimulationIds.current.add(simulation.id);
    void postValidationEvent({
      type: "route_comparison_viewed",
      simulationId: simulation.id,
      scenarioType: simulation.type || simulation.userInput.type,
    });
  }, [routeComparison, simulation]);

  if (!routeComparison) {
    return null;
  }

  const recommendedRoute = routeComparison.routes.find(
    (route) => route.id === routeComparison.recommendedRouteId,
  ) ?? routeComparison.routes[0];

  return (
    <section id="route-comparison-panel" className="bg-white rounded-3xl border border-gray-150 p-6 shadow-xs text-left space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-gray-950 flex items-center gap-2">
            <GitCompare className="w-5 h-5 text-blue-500" />
            <span>路线对比沙盘</span>
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            推荐路线：{recommendedRoute.title}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-xl border border-blue-100 bg-blue-50 px-3 py-1.5 text-2xs font-black text-blue-700">
          <Sparkles className="w-3.5 h-3.5" />
          推荐路线
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {routeComparison.routes.map((route) => {
          const isRecommended = route.id === recommendedRoute.id;
          return (
            <article
              key={route.id}
              className={`rounded-2xl border p-4 space-y-3 ${
                isRecommended
                  ? "border-blue-200 bg-blue-50/50"
                  : "border-gray-150 bg-gray-50/50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="w-8 h-8 rounded-xl bg-gray-950 text-white text-xs font-black flex items-center justify-center">
                  {route.label}
                </span>
                <span className="text-2xs font-black text-gray-500">
                  {route.successProbability}% 胜率
                </span>
              </div>
              <h3 className="text-sm font-black text-gray-950">{route.title}</h3>
              <p className="text-2xs text-gray-600 leading-relaxed">{route.premise}</p>
              <div className="flex items-center gap-1.5 text-2xs font-bold text-rose-600">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>后悔风险 {route.regretRisk}%</span>
              </div>
              <div className="space-y-1 text-2xs text-gray-600 leading-relaxed">
                <p>上行：{route.upside}</p>
                <p>代价：{route.downside}</p>
                <p>触发条件：{route.triggerToChoose}</p>
              </div>
            </article>
          );
        })}
      </div>

      {routeComparison.sevenDayProbe.length > 0 && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
          <h3 className="text-xs font-black text-emerald-800 flex items-center gap-2">
            <Compass className="w-4 h-4" />
            <span>7 天验证动作</span>
          </h3>
          <ul className="mt-3 space-y-2">
            {routeComparison.sevenDayProbe.map((item, index) => (
              <li key={index} className="text-2xs text-emerald-800 leading-relaxed">
                {index + 1}. {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
