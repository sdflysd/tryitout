import { useEffect, useState } from "react";
import {
  MessageSquareText,
  Star,
} from "lucide-react";

import {
  fetchAdminFeedback,
  type AdminFeedbackDto,
} from "./admin-client.js";

interface FeedbackPageProps {
  feedback?: AdminFeedbackDto;
  fetchFeedback?: () => Promise<AdminFeedbackDto>;
}

const EMPTY_FEEDBACK: AdminFeedbackDto = {
  summary: {
    total: 0,
    averageRating: 0,
    withComments: 0,
  },
  items: [],
};

export default function FeedbackPage({
  feedback,
  fetchFeedback = fetchAdminFeedback,
}: FeedbackPageProps) {
  const [resolvedFeedback, setResolvedFeedback] = useState(feedback ?? EMPTY_FEEDBACK);
  const [isLoading, setIsLoading] = useState(feedback === undefined);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (feedback !== undefined) {
      setResolvedFeedback(feedback);
      setIsLoading(false);
      setLoadError("");
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    void fetchFeedback()
      .then((nextFeedback) => {
        if (!cancelled) {
          setResolvedFeedback(nextFeedback);
          setLoadError("");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Unable to load feedback operations");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [feedback, fetchFeedback]);

  return (
    <div className="space-y-5">
      {(isLoading || loadError) && (
        <section className="border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-600">
          {isLoading ? "Loading feedback operations" : loadError}
        </section>
      )}

      <section className="grid gap-3 md:grid-cols-3">
        <Metric title="Feedback" value={resolvedFeedback.summary.total} detail="Total responses" />
        <Metric title="Average Rating" value={resolvedFeedback.summary.averageRating.toFixed(2)} detail="Rated responses" />
        <Metric title="Comments" value={resolvedFeedback.summary.withComments} detail="Written operator context" />
      </section>

      <section className="border border-slate-200 bg-white">
        <div className="flex min-h-12 items-center justify-between px-4">
          <div className="flex items-center gap-2 text-sm font-black">
            <MessageSquareText className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <span>Feedback Operations</span>
          </div>
          <span className="rounded-sm bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
            read-only
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-xs">
            <thead className="border-y border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.13em] text-slate-500">
              <tr>
                <th className="px-4 py-2 font-black">User</th>
                <th className="px-4 py-2 font-black">Rating</th>
                <th className="px-4 py-2 font-black">Type</th>
                <th className="px-4 py-2 font-black">Task</th>
                <th className="px-4 py-2 font-black">Comment</th>
                <th className="px-4 py-2 font-black">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {resolvedFeedback.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-semibold text-slate-700">{item.userEmail ?? item.userId ?? "anonymous"}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 font-mono font-black text-slate-950">
                      <Star className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                      {item.rating ?? "none"}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-700">{item.feedbackType ?? "general"}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">{item.taskId ?? "none"}</td>
                  <td className="px-4 py-3 text-slate-500">{item.comment ?? "none"}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(item.createdAt)}</td>
                </tr>
              ))}
              {resolvedFeedback.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs font-bold text-slate-500">
                    No feedback loaded.
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

function Metric({
  title,
  value,
  detail,
}: {
  title: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="min-h-24 border border-slate-200 bg-white p-4 text-slate-950">
      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{title}</div>
      <div className="mt-3 font-mono text-2xl font-black tracking-tight">{value}</div>
      <div className="mt-2 text-xs font-semibold text-slate-500">{detail}</div>
    </div>
  );
}

function formatDateTime(value: string): string {
  return value.replace("T", " ").slice(0, 16);
}
