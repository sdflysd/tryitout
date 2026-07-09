import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Database,
  KeyRound,
  RefreshCw,
  Save,
  ServerCog,
  Settings,
  SlidersHorizontal,
} from "lucide-react";

import {
  fetchAdminModelProviderModels,
  fetchAdminModelProfiles,
  fetchAdminModelProviders,
  fetchAdminSettings,
  saveAdminModelProfile,
  saveAdminModelProvider,
  testAdminModelProvider,
  updateAdminPlatformModels,
  type AdminModelProviderModelCatalogDto,
  type AdminPlatformModelProfileDto,
  type AdminPlatformModelProviderDto,
  type AdminSaveModelProviderInputDto,
  type AdminSettingsDto,
} from "./admin-client.js";

interface SettingsPageProps {
  settings?: AdminSettingsDto;
  initialModelProviders?: AdminPlatformModelProviderDto[];
  initialModelProfiles?: AdminPlatformModelProfileDto[];
  initialProviderModelCatalogs?: Record<string, AdminModelProviderModelCatalogDto>;
  fetchSettings?: () => Promise<AdminSettingsDto>;
  updatePlatformModels?: (enabledModelProfileIds: string[]) => Promise<AdminSettingsDto>;
  fetchModelProviders?: () => Promise<AdminPlatformModelProviderDto[]>;
  saveModelProvider?: (input: AdminSaveModelProviderInputDto) => Promise<AdminPlatformModelProviderDto>;
  testModelProvider?: (providerId: string) => Promise<AdminPlatformModelProviderDto>;
  fetchModelProviderModels?: (providerId: string) => Promise<AdminModelProviderModelCatalogDto>;
  fetchModelProfiles?: () => Promise<AdminPlatformModelProfileDto[]>;
  saveModelProfile?: (input: AdminPlatformModelProfileDto) => Promise<AdminPlatformModelProfileDto>;
}

const EMPTY_SETTINGS: AdminSettingsDto = {
  items: [],
  platformModels: {
    available: [],
    enabled: [],
    enabledModelProfileIds: [],
  },
  platformModelProviders: [],
};

type ProviderFormState = {
  providerConfigId: string;
  provider: AdminPlatformModelProviderDto["provider"];
  displayName: string;
  baseUrl: string;
  apiKey: string;
  status: AdminPlatformModelProviderDto["status"];
};

type ProfileFormState = {
  id: string;
  providerConfigId: string;
  label: string;
  modelId: string;
  quality: NonNullable<AdminPlatformModelProfileDto["quality"]>;
  visibleToUser: boolean;
  status: NonNullable<AdminPlatformModelProfileDto["status"]>;
  source?: AdminPlatformModelProfileDto["source"];
};

const DEFAULT_PROVIDER_FORM: ProviderFormState = {
  providerConfigId: "",
  provider: "openai_compatible",
  displayName: "",
  baseUrl: "",
  apiKey: "",
  status: "active",
};

export default function SettingsPage({
  settings,
  initialModelProviders,
  initialModelProfiles,
  initialProviderModelCatalogs,
  fetchSettings = fetchAdminSettings,
  updatePlatformModels = updateAdminPlatformModels,
  fetchModelProviders = fetchAdminModelProviders,
  saveModelProvider = saveAdminModelProvider,
  testModelProvider = testAdminModelProvider,
  fetchModelProviderModels = fetchAdminModelProviderModels,
  fetchModelProfiles = fetchAdminModelProfiles,
  saveModelProfile = saveAdminModelProfile,
}: SettingsPageProps) {
  const [resolvedSettings, setResolvedSettings] = useState(settings ?? EMPTY_SETTINGS);
  const [modelProviders, setModelProviders] = useState<AdminPlatformModelProviderDto[]>(
    initialModelProviders ?? settings?.platformModelProviders ?? [],
  );
  const [modelProfiles, setModelProfiles] = useState<AdminPlatformModelProfileDto[]>(
    initialModelProfiles ?? [],
  );
  const [providerCatalogs, setProviderCatalogs] = useState<Record<string, AdminModelProviderModelCatalogDto>>(
    initialProviderModelCatalogs ?? {},
  );
  const [isLoading, setIsLoading] = useState(
    settings === undefined || initialModelProviders === undefined || initialModelProfiles === undefined,
  );
  const [isSavingModels, setIsSavingModels] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [providerForm, setProviderForm] = useState<ProviderFormState>(DEFAULT_PROVIDER_FORM);
  const [profileForm, setProfileForm] = useState<ProfileFormState>(() => makeDefaultProfileForm(initialModelProviders ?? settings?.platformModelProviders ?? []));
  const [enabledModelProfileIds, setEnabledModelProfileIds] = useState<string[]>(
    resolvedSettings.platformModels?.enabledModelProfileIds ?? [],
  );
  const configured = resolvedSettings.items.filter((item) => item.configured).length;
  const platformModels = resolvedSettings.platformModels ?? EMPTY_SETTINGS.platformModels!;
  const activeVisibleProfiles = modelProfiles.filter((profile) => profile.status === "active" && profile.visibleToUser !== false);
  const selectedProviderCatalog = providerCatalogs[profileForm.providerConfigId];
  const providerById = useMemo(
    () => new Map(modelProviders.map((provider) => [provider.id, provider])),
    [modelProviders],
  );

  useEffect(() => {
    if (
      settings !== undefined &&
      initialModelProviders !== undefined &&
      initialModelProfiles !== undefined
    ) {
      setResolvedSettings(settings);
      setModelProviders(initialModelProviders);
      setModelProfiles(initialModelProfiles);
      setEnabledModelProfileIds(settings.platformModels?.enabledModelProfileIds ?? []);
      setProviderForm((current) => current.providerConfigId ? current : DEFAULT_PROVIDER_FORM);
      setProfileForm((current) => current.providerConfigId ? current : makeDefaultProfileForm(initialModelProviders));
      setIsLoading(false);
      setLoadError("");
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    void Promise.all([
      settings === undefined ? fetchSettings() : Promise.resolve(settings),
      initialModelProviders === undefined ? fetchModelProviders() : Promise.resolve(initialModelProviders),
      initialModelProfiles === undefined ? fetchModelProfiles() : Promise.resolve(initialModelProfiles),
    ])
      .then(([nextSettings, nextProviders, nextProfiles]) => {
        if (!cancelled) {
          setResolvedSettings(nextSettings);
          setModelProviders(nextProviders);
          setModelProfiles(nextProfiles);
          setEnabledModelProfileIds(nextSettings.platformModels?.enabledModelProfileIds ?? []);
          setProfileForm((current) => current.providerConfigId ? current : makeDefaultProfileForm(nextProviders));
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
  }, [
    fetchModelProfiles,
    fetchModelProviders,
    fetchSettings,
    initialModelProfiles,
    initialModelProviders,
    settings,
  ]);

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
      setSaveMessage("Fallback platform model toggles saved.");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to save fallback model configuration");
    } finally {
      setIsSavingModels(false);
    }
  };

  const handleSaveProvider = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoadError("");
    setSaveMessage("");
    try {
      const saved = await saveModelProvider({
        provider: providerForm.provider,
        displayName: providerForm.displayName.trim(),
        baseUrl: providerForm.baseUrl.trim() || undefined,
        apiKey: providerForm.apiKey.trim() || undefined,
        status: providerForm.status,
        providerConfigId: providerForm.providerConfigId || undefined,
      });
      setModelProviders((current) => upsertById(current, saved));
      setResolvedSettings((current) => ({
        ...current,
        platformModelProviders: upsertById(current.platformModelProviders ?? [], saved),
      }));
      setProviderForm(toProviderForm(saved));
      setSaveMessage("Provider credentials saved. Stored API keys are returned only as masks.");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to save provider credentials");
    }
  };

  const handleTestProvider = async () => {
    if (!providerForm.providerConfigId) {
      setLoadError("Save a provider before testing it.");
      return;
    }
    setLoadError("");
    setSaveMessage("");
    try {
      const tested = await testModelProvider(providerForm.providerConfigId);
      setModelProviders((current) => upsertById(current, tested));
      setProviderForm(toProviderForm(tested));
      setSaveMessage(`Provider test ${tested.lastTestStatus ?? "completed"}.`);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to test provider credentials");
    }
  };

  const handleFetchProviderModels = async (providerId = providerForm.providerConfigId) => {
    if (!providerId) {
      setLoadError("Save or select a provider before fetching models.");
      return;
    }
    setLoadError("");
    setSaveMessage("");
    try {
      const catalog = await fetchModelProviderModels(providerId);
      setProviderCatalogs((current) => ({ ...current, [providerId]: catalog }));
      setProfileForm((current) => ({
        ...current,
        providerConfigId: providerId,
        modelId: current.modelId || catalog.models[0]?.id || "",
      }));
      setSaveMessage(catalog.unsupported ? (catalog.error ?? "Model discovery is not supported for this provider.") : `${catalog.models.length} provider models fetched.`);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to fetch provider models");
    }
  };

  const handleSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoadError("");
    setSaveMessage("");
    if (!profileForm.providerConfigId) {
      setLoadError("Provider config is required before saving a model profile.");
      return;
    }
    try {
      const saved = await saveModelProfile({
        id: profileForm.id.trim(),
        providerConfigId: profileForm.providerConfigId,
        label: profileForm.label.trim(),
        providerLabel: providerById.get(profileForm.providerConfigId)?.displayName,
        modelId: profileForm.modelId.trim(),
        quality: profileForm.quality,
        visibleToUser: profileForm.visibleToUser,
        status: profileForm.status,
        source: profileForm.source,
      });
      setModelProfiles((current) => upsertById(current, saved));
      setSaveMessage("Model profile saved. Active visible profiles are immediately eligible for user-facing platform models.");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to save model profile");
    }
  };

  return (
    <div className="space-y-5">
      {(isLoading || loadError) && (
        <section className="border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-600">
          {isLoading ? "Loading settings operations" : loadError}
        </section>
      )}

      <section className="grid gap-3 md:grid-cols-4">
        <Metric title="Known Settings" value={resolvedSettings.items.length} detail="Tracked operator keys" />
        <Metric title="Configured" value={configured} detail="Stored in repository" />
        <Metric title="Providers" value={modelProviders.length} detail="Credential records" />
        <Metric title="User Visible" value={activeVisibleProfiles.length} detail="Active profile records" />
      </section>

      <section className="border border-slate-200 bg-white">
        <PanelHeader
          icon={ServerCog}
          title="Model Runtime Source"
          action="repository first"
        />
        <div className="grid gap-3 border-t border-slate-100 p-4 text-xs font-semibold text-slate-600 md:grid-cols-3">
          <p>Repository-backed providers and profiles are the source of truth once configured.</p>
          <p>.env remains the bootstrap and fallback source only.</p>
          <p>Users only see and use active profiles marked visible.</p>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(360px,0.85fr)_minmax(0,1.15fr)]">
        <form onSubmit={(event) => void handleSaveProvider(event)} className="border border-slate-200 bg-white p-4">
          <div className="mb-4 flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <h2 className="text-sm font-black text-slate-950">Provider Credentials</h2>
          </div>
          <div className="grid gap-3">
            <Field label="Provider type">
              <select
                className="admin-input"
                value={providerForm.provider}
                onChange={(event) => setProviderForm({ ...providerForm, provider: event.target.value as ProviderFormState["provider"] })}
              >
                <option value="openai_compatible">openai_compatible</option>
                <option value="gemini">gemini</option>
                <option value="anthropic">anthropic</option>
              </select>
            </Field>
            <Field label="Display name">
              <input
                className="admin-input"
                value={providerForm.displayName}
                onChange={(event) => setProviderForm({ ...providerForm, displayName: event.target.value })}
                placeholder="OpenRouter"
                required
              />
            </Field>
            <Field label="Base URL">
              <input
                className="admin-input"
                value={providerForm.baseUrl}
                onChange={(event) => setProviderForm({ ...providerForm, baseUrl: event.target.value })}
                placeholder="https://openrouter.ai/api/v1"
              />
            </Field>
            <Field label="API key">
              <input
                className="admin-input"
                type="password"
                value={providerForm.apiKey}
                onChange={(event) => setProviderForm({ ...providerForm, apiKey: event.target.value })}
                placeholder={providerForm.providerConfigId ? "Leave blank to keep Stored key" : "Required for new provider"}
              />
            </Field>
            <Field label="Status">
              <select
                className="admin-input"
                value={providerForm.status}
                onChange={(event) => setProviderForm({ ...providerForm, status: event.target.value as ProviderFormState["status"] })}
              >
                <option value="active">active</option>
                <option value="disabled">disabled</option>
              </select>
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="submit" className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-slate-950 px-3 text-xs font-black text-white">
              <Save className="h-4 w-4" aria-hidden="true" />
              Save Provider
            </button>
            <button type="button" onClick={() => void handleTestProvider()} className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-700">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Test Provider
            </button>
            <button type="button" onClick={() => void handleFetchProviderModels()} className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-cyan-200 bg-cyan-50 px-3 text-xs font-black text-cyan-700">
              <Database className="h-4 w-4" aria-hidden="true" />
              Fetch Provider Models
            </button>
          </div>
        </form>

        <section className="border border-slate-200 bg-white">
          <PanelHeader icon={KeyRound} title="Saved Providers" action={`${modelProviders.length} configured`} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead className="border-y border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.13em] text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-black">Display name</th>
                  <th className="px-4 py-2 font-black">Provider type</th>
                  <th className="px-4 py-2 font-black">Base URL</th>
                  <th className="px-4 py-2 font-black">Stored key</th>
                  <th className="px-4 py-2 font-black">Test</th>
                  <th className="px-4 py-2 font-black">Status</th>
                  <th className="px-4 py-2 font-black">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {modelProviders.map((provider) => (
                  <tr key={provider.id}>
                    <td className="px-4 py-3">
                      <div className="font-black text-slate-950">{provider.displayName}</div>
                      <div className="mt-1 font-mono text-[10px] text-slate-400">{provider.id}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-700">{provider.provider}</td>
                    <td className="px-4 py-3 font-mono text-slate-700">{provider.baseUrl ?? "default"}</td>
                    <td className="px-4 py-3 font-mono font-black text-slate-950">{provider.apiKeyMask}</td>
                    <td className="px-4 py-3 text-slate-600">{provider.lastTestStatus ?? "untested"}</td>
                    <td className="px-4 py-3"><StatusBadge status={provider.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setProviderForm(toProviderForm(provider))} className="inline-flex min-h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 text-[10px] font-black text-slate-700">
                          Edit
                        </button>
                        <button type="button" onClick={() => void handleFetchProviderModels(provider.id)} className="inline-flex min-h-9 items-center rounded-md border border-cyan-200 bg-cyan-50 px-2.5 text-[10px] font-black text-cyan-700">
                          Fetch Provider Models
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {modelProviders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-xs font-bold text-slate-500">
                      No provider credentials configured.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <section className="border border-slate-200 bg-white">
        <PanelHeader icon={Database} title="Discovered Models" action={`${selectedProviderCatalog?.models.length ?? 0} fetched`} />
        <div className="grid gap-3 border-t border-slate-100 p-4 md:grid-cols-2 xl:grid-cols-3">
          {selectedProviderCatalog?.models.map((model) => (
            <button
              key={model.id}
              type="button"
              onClick={() => setProfileForm((current) => ({
                ...current,
                modelId: model.id,
                label: current.label || model.label || model.id,
              }))}
              className="min-h-20 border border-slate-200 bg-slate-50 p-3 text-left text-xs transition-colors hover:border-cyan-200 hover:bg-cyan-50"
            >
              <span className="block font-black text-slate-950">{model.label ?? model.id}</span>
              <span className="mt-2 block font-mono text-[10px] font-bold text-slate-500">{model.id}</span>
            </button>
          )) ?? (
            <div className="col-span-full border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs font-bold text-slate-500">
              Fetch Provider Models after saving a provider, then select a discovered model id for a profile.
            </div>
          )}
          {selectedProviderCatalog?.unsupported === true && (
            <p className="col-span-full text-xs font-bold text-amber-700">{selectedProviderCatalog.error}</p>
          )}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(360px,0.85fr)_minmax(0,1.15fr)]">
        <form onSubmit={(event) => void handleSaveProfile(event)} className="border border-slate-200 bg-white p-4">
          <div className="mb-4 flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <h2 className="text-sm font-black text-slate-950">Model Profiles</h2>
          </div>
          <div className="grid gap-3">
            <Field label="Profile id">
              <input className="admin-input" value={profileForm.id} onChange={(event) => setProfileForm({ ...profileForm, id: event.target.value })} placeholder="openrouter_deep" required />
            </Field>
            <Field label="Provider config">
              <select className="admin-input" value={profileForm.providerConfigId} onChange={(event) => setProfileForm({ ...profileForm, providerConfigId: event.target.value })} required>
                <option value="">Select provider</option>
                {modelProviders.map((provider) => (
                  <option key={provider.id} value={provider.id}>{provider.displayName}</option>
                ))}
              </select>
            </Field>
            <Field label="Display name">
              <input className="admin-input" value={profileForm.label} onChange={(event) => setProfileForm({ ...profileForm, label: event.target.value })} placeholder="OpenRouter Deep" required />
            </Field>
            <Field label="Model id">
              <input className="admin-input" value={profileForm.modelId} onChange={(event) => setProfileForm({ ...profileForm, modelId: event.target.value })} placeholder="anthropic/claude-sonnet-4" required />
            </Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Quality">
                <select className="admin-input" value={profileForm.quality} onChange={(event) => setProfileForm({ ...profileForm, quality: event.target.value as ProfileFormState["quality"] })}>
                  <option value="fast">fast</option>
                  <option value="balanced">balanced</option>
                  <option value="deep">deep</option>
                </select>
              </Field>
              <Field label="Status">
                <select className="admin-input" value={profileForm.status} onChange={(event) => setProfileForm({ ...profileForm, status: event.target.value as ProfileFormState["status"] })}>
                  <option value="active">active</option>
                  <option value="disabled">disabled</option>
                  <option value="deprecated">deprecated</option>
                </select>
              </Field>
            </div>
            <label className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-700">
              <input
                type="checkbox"
                checked={profileForm.visibleToUser}
                onChange={(event) => setProfileForm({ ...profileForm, visibleToUser: event.target.checked })}
              />
              <span>Visible to users</span>
            </label>
          </div>
          <button type="submit" className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-md bg-slate-950 px-4 text-xs font-black text-white">
            <Save className="h-4 w-4" aria-hidden="true" />
            Save Model Profile
          </button>
        </form>

        <section className="border border-slate-200 bg-white">
          <PanelHeader icon={SlidersHorizontal} title="Profile Inventory" action={`${activeVisibleProfiles.length} visible`} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] text-left text-xs">
              <thead className="border-y border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.13em] text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-black">Profile</th>
                  <th className="px-4 py-2 font-black">Provider config</th>
                  <th className="px-4 py-2 font-black">Model id</th>
                  <th className="px-4 py-2 font-black">Quality</th>
                  <th className="px-4 py-2 font-black">Visible to users</th>
                  <th className="px-4 py-2 font-black">Status</th>
                  <th className="px-4 py-2 font-black">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {modelProfiles.map((profile) => (
                  <tr key={profile.id}>
                    <td className="px-4 py-3">
                      <div className="font-black text-slate-950">{profile.label}</div>
                      <div className="mt-1 font-mono text-[10px] text-slate-400">{profile.id}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{profile.providerLabel ?? providerById.get(profile.providerConfigId ?? "")?.displayName ?? profile.providerConfigId ?? "none"}</td>
                    <td className="px-4 py-3 font-mono text-slate-700">{profile.modelId}</td>
                    <td className="px-4 py-3 font-mono font-black text-slate-950">{profile.quality ?? "balanced"}</td>
                    <td className="px-4 py-3 text-slate-600">{profile.visibleToUser === false ? "hidden" : "visible"}</td>
                    <td className="px-4 py-3"><StatusBadge status={profile.status ?? "active"} /></td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => setProfileForm(toProfileForm(profile))} className="inline-flex min-h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 text-[10px] font-black text-slate-700">
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {modelProfiles.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-xs font-bold text-slate-500">
                      No repository-backed model profiles configured.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <section className="border border-slate-200 bg-white">
        <div className="flex min-h-12 flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 text-sm font-black">
            <Settings className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <span>Fallback Model Toggles</span>
          </div>
          <button
            type="button"
            onClick={() => void handleSavePlatformModels()}
            disabled={isSavingModels}
            className="inline-flex min-h-9 items-center justify-center rounded-md bg-slate-950 px-3 text-[10px] font-black text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSavingModels ? "Saving" : "Save Fallback Toggles"}
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
              No fallback platform models are available.
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

function PanelHeader({
  title,
  action,
  icon: Icon,
}: {
  title: string;
  action: string;
  icon: typeof Settings;
}) {
  return (
    <div className="flex min-h-12 items-center justify-between px-4">
      <div className="flex items-center gap-2 text-sm font-black">
        <Icon className="h-4 w-4 text-slate-500" aria-hidden="true" />
        <span>{title}</span>
      </div>
      <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{action}</span>
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

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-black text-slate-700">
      <span>{label}</span>
      {children}
    </label>
  );
}

function StatusBadge({ status }: { status: string }) {
  const className = status === "active" || status === "passed"
    ? "bg-emerald-50 text-emerald-700"
    : status === "deprecated"
      ? "bg-amber-100 text-amber-800"
      : "bg-slate-100 text-slate-600";
  return (
    <span className={`rounded-sm px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${className}`}>
      {status}
    </span>
  );
}

function toProviderForm(provider: AdminPlatformModelProviderDto): ProviderFormState {
  return {
    providerConfigId: provider.id,
    provider: provider.provider,
    displayName: provider.displayName,
    baseUrl: provider.baseUrl ?? "",
    apiKey: "",
    status: provider.status,
  };
}

function makeDefaultProfileForm(
  providers: AdminPlatformModelProviderDto[],
): ProfileFormState {
  return {
    id: "",
    providerConfigId: providers[0]?.id ?? "",
    label: "",
    modelId: "",
    quality: "balanced",
    visibleToUser: true,
    status: "active",
  };
}

function toProfileForm(profile: AdminPlatformModelProfileDto): ProfileFormState {
  return {
    id: profile.id,
    providerConfigId: profile.providerConfigId ?? "",
    label: profile.label,
    modelId: profile.modelId,
    quality: profile.quality ?? "balanced",
    visibleToUser: profile.visibleToUser !== false,
    status: profile.status ?? "active",
    source: profile.source,
  };
}

function upsertById<T extends { id: string }>(items: T[], next: T): T[] {
  const exists = items.some((item) => item.id === next.id);
  return exists
    ? items.map((item) => (item.id === next.id ? next : item))
    : [next, ...items];
}

function formatValue(value: unknown): string {
  if (value === undefined) return "default";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function formatDateTime(value: string): string {
  return value.replace("T", " ").slice(0, 16);
}
