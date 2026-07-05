import type { Simulation, SimulationType } from "../types";
import type { ClientValidationEvent } from "../validation-events";

export function getDeepReportPaywallCopy(type: SimulationType): {
  title: string;
  description: string;
  cta: string;
  contactPlaceholder: string;
} {
  if (type === "dating") {
    return {
      title: "解锁完整情感沙盘",
      description: "查看 Agent 博弈回放、完整 30 天走向、关键变量和 7 天沟通计划。",
      cta: "加入内测并临时解锁",
      contactPlaceholder: "微信/邮箱，方便回访真实结果",
    };
  }
  if (type === "life_choice") {
    return {
      title: "解锁完整抉择沙盘",
      description: "查看多路线机会成本、Agent 投票、关键变量和后悔防御计划。",
      cta: "加入内测并临时解锁",
      contactPlaceholder: "微信/邮箱，方便 7 天后回访",
    };
  }
  return {
    title: "解锁完整搞钱沙盘",
    description: "查看客户/竞品/渠道 Agent 博弈、付费触发点和 7 天 MVP 验证计划。",
    cta: "加入内测并临时解锁",
    contactPlaceholder: "微信/邮箱，方便给你发深度版",
  };
}

function scenarioType(simulation: Simulation): SimulationType {
  return simulation.type || simulation.userInput.type;
}

export function buildPaywallClickEvent(simulation: Simulation, price: string): ClientValidationEvent {
  return {
    type: "paywall_clicked",
    simulationId: simulation.id,
    scenarioType: scenarioType(simulation),
    priceIntent: price,
  };
}

export function buildPaywallLeadEvent(
  simulation: Simulation,
  price: string,
  contact: string,
): ClientValidationEvent {
  return {
    type: "paywall_lead_submitted",
    simulationId: simulation.id,
    scenarioType: scenarioType(simulation),
    priceIntent: price,
    contact,
  };
}

export function buildDeepReportUnlockIntentEvent(
  simulation: Simulation,
  price: string,
): ClientValidationEvent {
  return {
    type: "deep_report_unlock_intent",
    simulationId: simulation.id,
    scenarioType: scenarioType(simulation),
    priceIntent: price,
    deepModeRequested: simulation.runtimeDiagnostics?.requestedInteractionMode === "enabled",
    deepModeAvailable: simulation.runtimeDiagnostics?.deepModeAvailable,
    fallbackStageCount: simulation.runtimeDiagnostics?.fallbackStageCount,
  };
}
