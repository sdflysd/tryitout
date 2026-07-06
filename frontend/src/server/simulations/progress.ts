import type {
  SimulationProgressEvent,
  SimulationProgressStep,
} from "../../types.js";

const STAGE_COUNT = 5;
const TOTAL_PROGRESS_UNITS = 10;

export function emitSimulationProgress({
  simulationId,
  step,
  stageIndex,
  status,
  onProgress,
}: {
  simulationId: string;
  step: SimulationProgressStep;
  stageIndex?: number;
  status: SimulationProgressEvent["status"];
  onProgress?: (event: SimulationProgressEvent) => void;
}): void {
  if (!onProgress) {
    return;
  }

  onProgress({
    simulationId,
    step,
    stageIndex,
    status,
    percent: getProgressPercent(step, stageIndex, status),
    message: getProgressMessage(step, stageIndex, status),
    createdAt: new Date().toISOString(),
  });
}

function getProgressPercent(
  step: SimulationProgressStep,
  stageIndex: number | undefined,
  status: SimulationProgressEvent["status"],
): number {
  if (
    step === "generate_world_event" ||
    step === "generate_agent_actions" ||
    step === "arbitrate_stage"
  ) {
    return getInteractiveStageProgressPercent(step, stageIndex, status);
  }

  const completedUnits = getProgressUnit(step, stageIndex) - (status === "completed" ? 0 : 1);

  return Math.max(
    0,
    Math.min(100, Math.round((completedUnits / TOTAL_PROGRESS_UNITS) * 100)),
  );
}

function getInteractiveStageProgressPercent(
  step: Extract<
    SimulationProgressStep,
    "generate_world_event" | "generate_agent_actions" | "arbitrate_stage"
  >,
  stageIndex: number | undefined,
  status: SimulationProgressEvent["status"],
): number {
  const stageUnit = getProgressUnit("simulate_stage", stageIndex);
  const stageStartUnit = stageUnit - 1;
  const substepIndex = {
    generate_world_event: 0,
    generate_agent_actions: 1,
    arbitrate_stage: 2,
  }[step];
  const substepStatusOffset = status === "completed" ? 1 : 0;
  const completedSubsteps = substepIndex + substepStatusOffset;
  const completedUnits = stageStartUnit + completedSubsteps / 3;

  return Math.max(
    0,
    Math.min(100, Math.round((completedUnits / TOTAL_PROGRESS_UNITS) * 100)),
  );
}

function getProgressUnit(step: SimulationProgressStep, stageIndex?: number): number {
  if (step === "safety_check") {
    return 1;
  }
  if (step === "generate_agents") {
    return 2;
  }
  if (step === "initialize_world_state") {
    return 3;
  }
  if (step === "generate_report" || step === "generate_route_comparison") {
    return TOTAL_PROGRESS_UNITS;
  }

  return 3 + Math.max(1, Math.min(STAGE_COUNT, stageIndex ?? 1));
}

function getProgressMessage(
  step: SimulationProgressStep,
  stageIndex: number | undefined,
  status: SimulationProgressEvent["status"],
): string {
  const suffix = status === "completed" ? "完成" : status === "failed" ? "失败" : "开始";

  if (step === "safety_check") {
    return `内容安全检查${suffix}。`;
  }
  if (step === "generate_agents") {
    return `多智能体角色生成${suffix}。`;
  }
  if (step === "initialize_world_state") {
    return `沙盘初始世界状态${suffix}。`;
  }
  if (step === "simulate_stage") {
    return `第 ${stageIndex ?? 1} 阶段推演${suffix}。`;
  }
  if (step === "generate_report") {
    return `最终决策报告生成${suffix}。`;
  }
  if (step === "generate_route_comparison") {
    return `路线对比沙盘生成${suffix}。`;
  }
  if (step === "generate_world_event") {
    return `第 ${stageIndex ?? 1} 阶段世界事件生成${suffix}。`;
  }
  if (step === "generate_agent_actions") {
    return `第 ${stageIndex ?? 1} 阶段 Agent 互动生成${suffix}。`;
  }

  return `第 ${stageIndex ?? 1} 阶段裁判仲裁${suffix}。`;
}
