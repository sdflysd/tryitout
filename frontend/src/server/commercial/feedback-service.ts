import { randomUUID } from "node:crypto";

import type { CommercialRepository } from "./repository.js";
import type { UserFeedbackRecord } from "./types.js";

export interface FeedbackServiceOptions {
  now?: () => Date;
  textLimit?: number;
}

export class FeedbackServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "FeedbackServiceError";
  }
}

export class FeedbackService {
  private readonly now: () => Date;
  private readonly textLimit: number;

  constructor(
    private readonly repository: CommercialRepository,
    options: FeedbackServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.textLimit = options.textLimit ?? 1000;
  }

  async submitFeedback(input: {
    userId: string;
    taskId: string;
    reportId: string;
    rating: number;
    useful: boolean;
    text?: string;
  }): Promise<UserFeedbackRecord> {
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      throw new FeedbackServiceError("invalid_rating", "Rating must be an integer from 1 to 5.");
    }
    if (typeof input.useful !== "boolean") {
      throw new FeedbackServiceError("invalid_useful", "Usefulness must be a boolean.");
    }

    const task = await this.repository.getCommercialTask(input.taskId);
    if (!task || task.userId !== input.userId) {
      throw new FeedbackServiceError("task_not_found", "Task was not found.");
    }
    const report = await this.repository.getSimulationReport(input.reportId);
    if (!report || report.taskId !== task.id || report.userId !== input.userId) {
      throw new FeedbackServiceError("report_not_found", "Report was not found.");
    }

    const text = sanitizeFeedbackText(input.text, this.textLimit);
    const feedback: UserFeedbackRecord = {
      id: `feedback_${randomUUID()}`,
      userId: input.userId,
      taskId: task.id,
      reportId: report.id,
      rating: input.rating,
      useful: input.useful,
      text,
      createdAt: this.now(),
    };
    await this.repository.appendUserFeedback(feedback);
    return feedback;
  }
}

function sanitizeFeedbackText(text: string | undefined, limit: number): string | undefined {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.slice(0, Math.max(0, limit));
}
