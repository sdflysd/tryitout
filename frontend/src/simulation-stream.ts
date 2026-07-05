import type {
  SimulationApiResponse,
  SimulationProgressEvent,
  SimulationRequest,
} from "./types";

export type ParsedSimulationStreamEvent =
  | { type: "progress"; data: SimulationProgressEvent }
  | { type: "completed"; data: SimulationApiResponse }
  | { type: "error"; data: { error?: string } };

export function parseSimulationStreamChunk(
  buffer: string,
  chunk: string,
): { events: ParsedSimulationStreamEvent[]; buffer: string } {
  const normalized = (buffer + chunk).replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  const remainder = parts.pop() ?? "";
  const events = parts
    .map(parseSseBlock)
    .filter((event): event is ParsedSimulationStreamEvent => Boolean(event));

  return {
    events,
    buffer: remainder,
  };
}

export async function runSimulationStream(
  requestBody: SimulationRequest,
  {
    onProgress,
  }: {
    onProgress?: (event: SimulationProgressEvent) => void;
  } = {},
): Promise<SimulationApiResponse> {
  const response = await fetch("/api/simulations/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const message =
      typeof errData.error === "string"
        ? errData.error
        : `HTTP error! status: ${response.status}`;
    throw new Error(message);
  }

  if (!response.body) {
    throw new Error("浏览器不支持读取模拟进度流。");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed: SimulationApiResponse | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    const parsed = parseSimulationStreamChunk(
      buffer,
      decoder.decode(value, { stream: true }),
    );
    buffer = parsed.buffer;

    for (const event of parsed.events) {
      if (event.type === "progress") {
        onProgress?.(event.data);
      } else if (event.type === "completed") {
        completed = event.data;
      } else if (event.type === "error") {
        throw new Error(event.data.error || "模拟进度流返回错误。");
      }
    }
  }

  if (completed) {
    return completed;
  }

  throw new Error("模拟进度流已结束，但没有返回最终报告。");
}

function parseSseBlock(block: string): ParsedSimulationStreamEvent | undefined {
  let type = "message";
  const dataLines: string[] = [];

  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) {
      type = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return undefined;
  }

  const data = JSON.parse(dataLines.join("\n")) as unknown;

  if (type === "progress" || type === "completed" || type === "error") {
    return {
      type,
      data,
    } as ParsedSimulationStreamEvent;
  }

  return undefined;
}
