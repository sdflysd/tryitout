import { useEffect, useState } from "react";
import { FileClock } from "lucide-react";

import {
  fetchAdminAuditLogs,
  type AdminAuditLogDto,
} from "./admin-client.js";

interface AuditLogsPageProps {
  logs?: AdminAuditLogDto[];
  fetchLogs?: () => Promise<AdminAuditLogDto[]>;
}

export default function AuditLogsPage({
  logs,
  fetchLogs = fetchAdminAuditLogs,
}: AuditLogsPageProps) {
  const [rows, setRows] = useState(logs ?? []);
  const [isLoading, setIsLoading] = useState(logs === undefined);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (logs !== undefined) {
      setRows(logs);
      setIsLoading(false);
      setLoadError("");
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    void fetchLogs()
      .then((nextLogs) => {
        if (!cancelled) {
          setRows(nextLogs);
          setLoadError("");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Unable to load audit logs");
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
  }, [fetchLogs, logs]);

  return (
    <div className="space-y-5">
      {(isLoading || loadError) && (
        <section className="border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-600">
          {isLoading ? "Loading audit logs" : loadError}
        </section>
      )}

      <section className="border border-slate-200 bg-white">
        <div className="flex min-h-12 items-center justify-between px-4">
          <div className="flex items-center gap-2 text-sm font-black">
            <FileClock className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <span>Audit Trail</span>
          </div>
          <span className="rounded-sm bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
            {rows.length} events
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead className="border-y border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.13em] text-slate-500">
              <tr>
                <th className="px-4 py-2 font-black">Time</th>
                <th className="px-4 py-2 font-black">Actor</th>
                <th className="px-4 py-2 font-black">Action</th>
                <th className="px-4 py-2 font-black">Target</th>
                <th className="px-4 py-2 font-black">Metadata</th>
                <th className="px-4 py-2 font-black">User Agent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(log.createdAt)}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">{log.actorUserId ?? "system"}</td>
                  <td className="px-4 py-3 font-mono font-black text-slate-950">{log.action}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">{log.targetType}:{log.targetId ?? "none"}</td>
                  <td className="px-4 py-3 font-mono text-[10px] text-slate-500">{JSON.stringify(log.metadata)}</td>
                  <td className="px-4 py-3 text-slate-500">{log.userAgent ?? "none"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs font-bold text-slate-500">
                    No audit logs loaded.
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

function formatDateTime(value: string): string {
  return value.replace("T", " ").slice(0, 16);
}
