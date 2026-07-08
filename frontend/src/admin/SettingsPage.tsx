import { useEffect, useState } from "react";
import { Settings } from "lucide-react";

import {
  fetchAdminSettings,
  type AdminSettingsDto,
} from "./admin-client.js";

interface SettingsPageProps {
  settings?: AdminSettingsDto;
  fetchSettings?: () => Promise<AdminSettingsDto>;
}

const EMPTY_SETTINGS: AdminSettingsDto = {
  items: [],
};

export default function SettingsPage({
  settings,
  fetchSettings = fetchAdminSettings,
}: SettingsPageProps) {
  const [resolvedSettings, setResolvedSettings] = useState(settings ?? EMPTY_SETTINGS);
  const [isLoading, setIsLoading] = useState(settings === undefined);
  const [loadError, setLoadError] = useState("");
  const configured = resolvedSettings.items.filter((item) => item.configured).length;

  useEffect(() => {
    if (settings !== undefined) {
      setResolvedSettings(settings);
      setIsLoading(false);
      setLoadError("");
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    void fetchSettings()
      .then((nextSettings) => {
        if (!cancelled) {
          setResolvedSettings(nextSettings);
          setLoadError("");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Unable to load settings operations");
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
  }, [fetchSettings, settings]);

  return (
    <div className="space-y-5">
      {(isLoading || loadError) && (
        <section className="border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-600">
          {isLoading ? "Loading settings operations" : loadError}
        </section>
      )}

      <section className="grid gap-3 md:grid-cols-3">
        <Metric title="Known Settings" value={resolvedSettings.items.length} detail="Tracked operator keys" />
        <Metric title="Configured" value={configured} detail="Stored in repository" />
        <Metric title="Unconfigured" value={Math.max(0, resolvedSettings.items.length - configured)} detail="Using application defaults" />
      </section>

      <section className="border border-slate-200 bg-white">
        <div className="flex min-h-12 items-center justify-between px-4">
          <div className="flex items-center gap-2 text-sm font-black">
            <Settings className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <span>Settings Operations</span>
          </div>
          <span className="rounded-sm bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
            read-only
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-left text-xs">
            <thead className="border-y border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.13em] text-slate-500">
              <tr>
                <th className="px-4 py-2 font-black">Key</th>
                <th className="px-4 py-2 font-black">Value</th>
                <th className="px-4 py-2 font-black">Status</th>
                <th className="px-4 py-2 font-black">Updated By</th>
                <th className="px-4 py-2 font-black">Updated</th>
                <th className="px-4 py-2 font-black">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {resolvedSettings.items.map((item) => (
                <tr key={item.key}>
                  <td className="px-4 py-3 font-mono font-black text-slate-950">{item.key}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">{formatValue(item.value)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-sm px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${item.configured ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                      {item.configured ? "configured" : "default"}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-700">{item.updatedByUserId ?? "system"}</td>
                  <td className="px-4 py-3 text-slate-500">{item.updatedAt === undefined ? "none" : formatDateTime(item.updatedAt)}</td>
                  <td className="px-4 py-3 text-slate-500">{item.description ?? "none"}</td>
                </tr>
              ))}
              {resolvedSettings.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs font-bold text-slate-500">
                    No settings loaded.
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

function formatValue(value: unknown): string {
  if (value === undefined) return "default";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function formatDateTime(value: string): string {
  return value.replace("T", " ").slice(0, 16);
}
