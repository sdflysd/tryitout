import { useEffect, useState } from "react";
import { Settings } from "lucide-react";

import {
  fetchAdminSettings,
  updateAdminPlatformModels,
  type AdminSettingsDto,
} from "./admin-client.js";

interface SettingsPageProps {
  settings?: AdminSettingsDto;
  fetchSettings?: () => Promise<AdminSettingsDto>;
  updatePlatformModels?: (enabledModelProfileIds: string[]) => Promise<AdminSettingsDto>;
}

const EMPTY_SETTINGS: AdminSettingsDto = {
  items: [],
  platformModels: {
    available: [],
    enabled: [],
    enabledModelProfileIds: [],
  },
};

export default function SettingsPage({
  settings,
  fetchSettings = fetchAdminSettings,
  updatePlatformModels = updateAdminPlatformModels,
}: SettingsPageProps) {
  const [resolvedSettings, setResolvedSettings] = useState(settings ?? EMPTY_SETTINGS);
  const [isLoading, setIsLoading] = useState(settings === undefined);
  const [isSavingModels, setIsSavingModels] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [enabledModelProfileIds, setEnabledModelProfileIds] = useState<string[]>(
    resolvedSettings.platformModels?.enabledModelProfileIds ?? [],
  );
  const configured = resolvedSettings.items.filter((item) => item.configured).length;
  const platformModels = resolvedSettings.platformModels ?? EMPTY_SETTINGS.platformModels!;

  useEffect(() => {
    if (settings !== undefined) {
      setResolvedSettings(settings);
      setEnabledModelProfileIds(settings.platformModels?.enabledModelProfileIds ?? []);
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
          setEnabledModelProfileIds(nextSettings.platformModels?.enabledModelProfileIds ?? []);
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

  const handlePlatformModelToggle = (modelId: string) => {
    setSaveMessage("");
    setEnabledModelProfileIds((current) =>
      current.includes(modelId)
        ? current.filter((item) => item !== modelId)
        : [...current, modelId],
    );
  };

  const handleSavePlatformModels = async () => {
    setIsSavingModels(true);
    setLoadError("");
    setSaveMessage("");
    try {
      const nextSettings = await updatePlatformModels(enabledModelProfileIds);
      setResolvedSettings(nextSettings);
      setEnabledModelProfileIds(nextSettings.platformModels?.enabledModelProfileIds ?? []);
      setSaveMessage("Platform model configuration saved.");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to save platform model configuration");
    } finally {
      setIsSavingModels(false);
    }
  };

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
        <div className="flex min-h-12 flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 text-sm font-black">
            <Settings className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <span>Platform Models</span>
          </div>
          <button
            type="button"
            onClick={() => void handleSavePlatformModels()}
            disabled={isSavingModels}
            className="inline-flex min-h-9 items-center justify-center rounded-md bg-slate-950 px-3 text-[10px] font-black text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSavingModels ? "Saving" : "Save Platform Models"}
          </button>
        </div>
        <div className="border-t border-slate-100 p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {platformModels.available.map((model) => {
              const enabled = enabledModelProfileIds.includes(model.id);
              return (
                <label
                  key={model.id}
                  className={`flex min-h-28 cursor-pointer flex-col gap-2 border p-3 text-xs transition-colors ${
                    enabled
                      ? "border-cyan-300 bg-cyan-50 text-cyan-950"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <span className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => handlePlatformModelToggle(model.id)}
                      className="mt-0.5 accent-cyan-600"
                    />
                    <span>
                      <span className="block font-black text-slate-950">{model.label}</span>
                      <span className="mt-1 block font-mono text-[10px] text-slate-500">{model.id}</span>
                    </span>
                  </span>
                  <span className="mt-auto flex flex-wrap gap-1.5">
                    <span className="rounded-sm bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-600">
                      {model.modelId}
                    </span>
                    {model.providerLabel && (
                      <span className="rounded-sm bg-slate-950 px-1.5 py-0.5 text-[10px] font-black text-white">
                        {model.providerLabel}
                      </span>
                    )}
                    {model.quality && (
                      <span className="rounded-sm bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-800">
                        {model.quality}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
          {platformModels.available.length === 0 && (
            <div className="py-8 text-center text-xs font-bold text-slate-500">
              No platform models are available in the model catalog.
            </div>
          )}
          {saveMessage && (
            <p className="mt-3 text-xs font-bold text-emerald-700">{saveMessage}</p>
          )}
        </div>
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
