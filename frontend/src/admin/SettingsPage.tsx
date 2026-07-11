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
  Trash2,
} from "lucide-react";

import {
  fetchAdminModelProviderModels,
  fetchAdminModelProfiles,
  fetchAdminModelProviders,
  fetchAdminSettings,
  saveAdminModelProfile,
  saveAdminModelProvider,
  testAdminModelProfile,
  testAdminModelProvider,
  updateAdminPlatformModels,
  type AdminDiscoveredModelDto,
  type AdminModelProfileTestInputDto,
  type AdminModelProfileTestResultDto,
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
  initialStatusMessage?: StatusMessage;
  fetchSettings?: () => Promise<AdminSettingsDto>;
  updatePlatformModels?: (enabledModelProfileIds: string[]) => Promise<AdminSettingsDto>;
  fetchModelProviders?: () => Promise<AdminPlatformModelProviderDto[]>;
  saveModelProvider?: (input: AdminSaveModelProviderInputDto) => Promise<AdminPlatformModelProviderDto>;
  testModelProvider?: (providerId: string) => Promise<AdminPlatformModelProviderDto>;
  fetchModelProviderModels?: (providerId: string) => Promise<AdminModelProviderModelCatalogDto>;
  fetchModelProfiles?: () => Promise<AdminPlatformModelProfileDto[]>;
  saveModelProfile?: (input: AdminPlatformModelProfileDto) => Promise<AdminPlatformModelProfileDto>;
  testModelProfile?: (input: AdminModelProfileTestInputDto) => Promise<AdminModelProfileTestResultDto>;
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

type EditorMode = "provider" | "profile";

type StatusMessage = {
  tone: "success" | "warning" | "error";
  text: string;
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
  initialStatusMessage,
  fetchSettings = fetchAdminSettings,
  updatePlatformModels = updateAdminPlatformModels,
  fetchModelProviders = fetchAdminModelProviders,
  saveModelProvider = saveAdminModelProvider,
  testModelProvider = testAdminModelProvider,
  fetchModelProviderModels = fetchAdminModelProviderModels,
  fetchModelProfiles = fetchAdminModelProfiles,
  saveModelProfile = saveAdminModelProfile,
  testModelProfile = testAdminModelProfile,
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
  const [statusMessage, setStatusMessage] = useState<StatusMessage | undefined>(initialStatusMessage);
  const [providerForm, setProviderForm] = useState<ProviderFormState>(DEFAULT_PROVIDER_FORM);
  const [profileForm, setProfileForm] = useState<ProfileFormState>(() => makeDefaultProfileForm(
    (initialModelProviders ?? settings?.platformModelProviders ?? []).filter((provider) => provider.status === "active"),
  ));
  const [editorMode, setEditorMode] = useState<EditorMode>("provider");
  const [selectedProviderIds, setSelectedProviderIds] = useState<string[]>([]);
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [enabledModelProfileIds, setEnabledModelProfileIds] = useState<string[]>(
    resolvedSettings.platformModels?.enabledModelProfileIds ?? [],
  );
  const configured = resolvedSettings.items.filter((item) => item.configured).length;
  const activeModelProviders = modelProviders.filter((provider) => provider.status === "active");
  const activeModelProfiles = modelProfiles.filter((profile) => profile.status === "active");
  const activeVisibleProfiles = activeModelProfiles.filter((profile) => profile.visibleToUser !== false);
  const publishedProfiles = activeVisibleProfiles.filter((profile) => enabledModelProfileIds.includes(profile.id));
  const selectedProviderCatalog = providerCatalogs[profileForm.providerConfigId];
  const providerById = useMemo(
    () => new Map(activeModelProviders.map((provider) => [provider.id, provider])),
    [activeModelProviders],
  );
  const selectedProviders = activeModelProviders.filter((provider) => selectedProviderIds.includes(provider.id));
  const selectedProfiles = activeModelProfiles.filter((profile) => selectedProfileIds.includes(profile.id));
  const allProvidersSelected = activeModelProviders.length > 0 && activeModelProviders.every((provider) => selectedProviderIds.includes(provider.id));
  const allProfilesSelected = activeModelProfiles.length > 0 && activeModelProfiles.every((profile) => selectedProfileIds.includes(profile.id));
  const needsProviderConnection = activeModelProviders.length === 0;
  const effectiveEditorMode: EditorMode = needsProviderConnection ? "provider" : editorMode;

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
      setProfileForm((current) => current.providerConfigId ? current : makeDefaultProfileForm(initialModelProviders.filter((provider) => provider.status === "active")));
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
          setProfileForm((current) => current.providerConfigId ? current : makeDefaultProfileForm(nextProviders.filter((provider) => provider.status === "active")));
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
    setStatusMessage(undefined);
    setEnabledModelProfileIds((current) =>
      current.includes(modelId)
        ? current.filter((item) => item !== modelId)
        : [...current, modelId],
    );
  };

  const handleSelectProvider = (providerId: string) => {
    setSelectedProviderIds((current) =>
      current.includes(providerId)
        ? current.filter((item) => item !== providerId)
        : [...current, providerId],
    );
  };

  const handleSelectProfile = (profileId: string) => {
    setSelectedProfileIds((current) =>
      current.includes(profileId)
        ? current.filter((item) => item !== profileId)
        : [...current, profileId],
    );
  };

  const handleSelectAllProviders = () => {
    setSelectedProviderIds(allProvidersSelected ? [] : activeModelProviders.map((provider) => provider.id));
  };

  const handleSelectAllProfiles = () => {
    setSelectedProfileIds(allProfilesSelected ? [] : activeModelProfiles.map((profile) => profile.id));
  };

  const openProviderEditor = (provider?: AdminPlatformModelProviderDto) => {
    setEditorMode("provider");
    setProviderForm(provider === undefined ? DEFAULT_PROVIDER_FORM : toProviderForm(provider));
  };

  const openProfileEditor = (profile?: AdminPlatformModelProfileDto) => {
    setEditorMode("profile");
    setProfileForm(profile === undefined ? makeDefaultProfileForm(activeModelProviders) : toProfileForm(profile));
  };

  const handleSavePlatformModels = async () => {
    setIsSavingModels(true);
    setLoadError("");
    setStatusMessage(undefined);
    try {
      const nextSettings = await updatePlatformModels(enabledModelProfileIds);
      setResolvedSettings(nextSettings);
      setEnabledModelProfileIds(nextSettings.platformModels?.enabledModelProfileIds ?? []);
      setStatusMessage({ tone: "success", text: `${nextSettings.platformModels?.enabledModelProfileIds.length ?? 0} model profile(s) published to users.` });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to save fallback model configuration");
    } finally {
      setIsSavingModels(false);
    }
  };

  const handleDeleteProvider = async (provider: AdminPlatformModelProviderDto) => {
    setLoadError("");
    setStatusMessage(undefined);
    try {
      const saved = await saveModelProvider({
        provider: provider.provider,
        displayName: provider.displayName,
        baseUrl: provider.baseUrl,
        status: "disabled",
        providerConfigId: provider.id,
      });
      setModelProviders((current) => current.filter((item) => item.id !== saved.id));
      setResolvedSettings((current) => ({
        ...current,
        platformModelProviders: (current.platformModelProviders ?? []).filter((item) => item.id !== saved.id),
      }));
      setSelectedProviderIds((current) => current.filter((id) => id !== provider.id));
      setStatusMessage({ tone: "success", text: "Provider deleted from the active inventory." });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to delete provider");
    }
  };

  const handleBatchDeleteProviders = async () => {
    for (const provider of selectedProviders) {
      await handleDeleteProvider(provider);
    }
    setSelectedProviderIds([]);
  };

  const handleDeleteProfile = async (profile: AdminPlatformModelProfileDto) => {
    setLoadError("");
    setStatusMessage(undefined);
    try {
      const saved = await saveModelProfile({
        ...profile,
        status: "disabled",
      });
      setModelProfiles((current) => current.filter((item) => item.id !== saved.id));
      setSelectedProfileIds((current) => current.filter((id) => id !== profile.id));
      setEnabledModelProfileIds((current) => current.filter((id) => id !== profile.id));
      setStatusMessage({ tone: "success", text: "Model profile deleted from the active inventory." });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to delete model profile");
    }
  };

  const handleBatchDeleteProfiles = async () => {
    for (const profile of selectedProfiles) {
      await handleDeleteProfile(profile);
    }
    setSelectedProfileIds([]);
  };

  const handleBatchProfilePatch = async (
    patch: Partial<Pick<AdminPlatformModelProfileDto, "status" | "visibleToUser">>,
    message: string,
  ) => {
    setLoadError("");
    setStatusMessage(undefined);
    try {
      const savedProfiles = [];
      for (const profile of selectedProfiles) {
        savedProfiles.push(await saveModelProfile({ ...profile, ...patch }));
      }
      setModelProfiles((current) => savedProfiles.reduce((items, profile) => upsertById(items, profile), current));
      setStatusMessage({ tone: "success", text: message });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to update selected model profiles");
    }
  };

  const handleBatchEnableProfiles = () => {
    setEnabledModelProfileIds((current) => unique([...current, ...selectedProfileIds]));
    setStatusMessage({ tone: "warning", text: `${selectedProfileIds.length} model profiles staged. Click Save & Publish to Users to apply.` });
  };

  const handleBatchDisableProfiles = () => {
    setEnabledModelProfileIds((current) => current.filter((id) => !selectedProfileIds.includes(id)));
    setStatusMessage({ tone: "warning", text: `${selectedProfileIds.length} model profiles staged. Click Save & Publish to Users to apply.` });
  };

  const handleSaveProvider = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoadError("");
    setStatusMessage(undefined);
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
      setStatusMessage({ tone: "success", text: "Provider credentials saved. Stored API keys are returned only as masks." });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to save provider credentials");
    }
  };

  const handleTestProvider = async (providerId = providerForm.providerConfigId) => {
    if (!providerId) {
      setLoadError("Save a provider before testing it.");
      return;
    }
    setLoadError("");
    setStatusMessage(undefined);
    try {
      const tested = await testModelProvider(providerId);
      setModelProviders((current) => upsertById(current, tested));
      if (providerForm.providerConfigId === tested.id) {
        setProviderForm(toProviderForm(tested));
      }
      setStatusMessage(
        tested.lastTestStatus === "failed"
          ? { tone: "error", text: "Provider test failed. Check Base URL, API key, and provider type." }
          : { tone: "success", text: "Provider credentials verified. Create or test a Profile before publishing to users." },
      );
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
    setStatusMessage(undefined);
    try {
      const catalog = await fetchModelProviderModels(providerId);
      setProviderCatalogs((current) => ({ ...current, [providerId]: catalog }));
      setProfileForm((current) => ({
        ...current,
        providerConfigId: providerId,
        modelId: current.modelId || catalog.models[0]?.id || "",
      }));
      if (catalog.models.length > 0) {
        setEditorMode("profile");
      }
      setStatusMessage(
        catalog.unsupported || catalog.error !== undefined
          ? { tone: "warning", text: catalog.error ?? "Model discovery is not supported for this provider." }
          : catalog.models.length === 0
            ? { tone: "warning", text: "Provider responded, but no models were returned. Enter a model id manually and test it." }
            : { tone: "success", text: `${catalog.models.length} provider models fetched. Create a Profile from a discovered model, then test and publish it.` },
      );
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to fetch provider models");
    }
  };

  const handleSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoadError("");
    setStatusMessage(undefined);
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
      setStatusMessage({ tone: "warning", text: "Model profile saved. Test Model, enable it, then click Save & Publish to Users." });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to save model profile");
    }
  };

  const handleCreateProfileFromModel = async (
    providerId: string,
    model: AdminDiscoveredModelDto,
  ) => {
    const provider = providerById.get(providerId);
    if (provider === undefined) {
      setLoadError("Select an active provider before creating a model profile.");
      return;
    }
    setLoadError("");
    setStatusMessage(undefined);
    try {
      const saved = await saveModelProfile({
        id: makeProfileId(provider.displayName, model.id),
        providerConfigId: provider.id,
        label: model.label || model.id,
        providerLabel: provider.displayName,
        modelId: model.id,
        quality: profileForm.quality,
        visibleToUser: true,
        status: "active",
      });
      setModelProfiles((current) => upsertById(current, saved));
      setProfileForm(toProfileForm(saved));
      setEditorMode("profile");
      setSelectedProfileIds([saved.id]);
      setEnabledModelProfileIds((current) => unique([...current, saved.id]));
      setStatusMessage({ tone: "warning", text: "Profile created and staged. Test Model, then click Save & Publish to Users." });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to create model profile");
    }
  };

  const handleTestProfile = async (profile?: AdminPlatformModelProfileDto) => {
    const providerConfigId = profile?.providerConfigId ?? profileForm.providerConfigId;
    const modelId = profile?.modelId ?? profileForm.modelId;
    const profileId = profile?.id ?? (profileForm.id.trim() || makeProfileId(
      providerById.get(providerConfigId)?.displayName ?? "profile",
      modelId,
    ));
    if (!providerConfigId || !modelId.trim()) {
      setLoadError("Provider config and model id are required before testing a model.");
      return;
    }
    setLoadError("");
    setStatusMessage(undefined);
    try {
      const result = await testModelProfile({
        profileId,
        providerConfigId,
        modelId: modelId.trim(),
      });
      setStatusMessage(
        result.ok
          ? { tone: "success", text: `Model test passed for ${result.modelId}. Save & Publish to Users applies it to the frontend.` }
          : { tone: "error", text: `Model test failed for ${result.modelId}. ${result.error ?? "Check model id and provider credentials."}` },
      );
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to test model profile");
    }
  };

  return (
    <div className="space-y-4">
      {(isLoading || loadError) && (
        <section className="border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-600">
          {isLoading ? "Loading settings operations" : loadError}
        </section>
      )}

      <section className="border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-black text-slate-950">
              <ServerCog className="h-4 w-4 text-slate-500" aria-hidden="true" />
              <span>Model Configuration Workbench</span>
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Repository-backed providers and profiles are the source of truth once configured. .env remains the bootstrap and fallback source only. Users only see and use active profiles marked visible.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <CompactMetric label="Settings" value={resolvedSettings.items.length} detail={`${configured} configured`} />
            <CompactMetric label="Providers" value={activeModelProviders.length} detail={`${selectedProviderIds.length} selected`} />
            <CompactMetric label="Profiles" value={activeModelProfiles.length} detail={`${selectedProfileIds.length} selected`} />
            <CompactMetric label="User Visible" value={activeVisibleProfiles.length} detail={`${enabledModelProfileIds.length} enabled`} />
          </div>
        </div>
        {statusMessage && (
          <StatusMessageBanner message={statusMessage} />
        )}
        <PublishChecklist
          providerCount={activeModelProviders.length}
          profileCount={activeModelProfiles.length}
          fetchedModelCount={Object.values(providerCatalogs as Record<string, AdminModelProviderModelCatalogDto>).reduce((total, catalog) => total + catalog.models.length, 0)}
          stagedCount={enabledModelProfileIds.length}
          publishedCount={publishedProfiles.length}
        />
      </section>

      <section className="grid gap-4 2xl:grid-cols-[minmax(360px,0.75fr)_minmax(580px,1.25fr)_360px]">
        <section className="border border-slate-200 bg-white">
          <TableHeader
            icon={KeyRound}
            title="Provider Inventory"
            detail={`${activeModelProviders.length} active`}
            action={(
              <button type="button" onClick={() => openProviderEditor()} className="admin-secondary-button">
                New Provider
              </button>
            )}
          />
          <SelectionToolbar selectedCount={selectedProviderIds.length}>
            <button
              type="button"
              onClick={() => void handleBatchDeleteProviders()}
              disabled={selectedProviderIds.length === 0}
              className="admin-danger-button disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Batch Delete Providers
            </button>
          </SelectionToolbar>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-xs">
              <thead className="border-y border-slate-200 bg-slate-50 text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <label className="sr-only" htmlFor="select-all-providers">Select all providers</label>
                    <input id="select-all-providers" type="checkbox" checked={allProvidersSelected} onChange={handleSelectAllProviders} />
                  </th>
                  <th className="px-3 py-2 font-black">Provider</th>
                  <th className="px-3 py-2 font-black">Type</th>
                  <th className="px-3 py-2 font-black">Stored key</th>
                  <th className="px-3 py-2 font-black">Test</th>
                  <th className="px-3 py-2 font-black">Status</th>
                  <th className="px-3 py-2 font-black">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeModelProviders.map((provider) => (
                  <tr key={provider.id} className={selectedProviderIds.includes(provider.id) ? "bg-cyan-50/60" : ""}>
                    <td className="px-3 py-3">
                      <label className="sr-only" htmlFor={`select-provider-${provider.id}`}>Select provider {provider.displayName}</label>
                      <input id={`select-provider-${provider.id}`} type="checkbox" checked={selectedProviderIds.includes(provider.id)} onChange={() => handleSelectProvider(provider.id)} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-black text-slate-950">{provider.displayName}</div>
                      <div className="mt-1 max-w-48 truncate font-mono text-[10px] text-slate-400">{provider.baseUrl ?? provider.id}</div>
                    </td>
                    <td className="px-3 py-3 font-mono text-slate-700">{provider.provider}</td>
                    <td className="px-3 py-3 font-mono font-black text-slate-950">{provider.apiKeyMask}</td>
                    <td className="px-3 py-3 text-slate-600">{provider.lastTestStatus ?? "untested"}</td>
                    <td className="px-3 py-3"><StatusBadge status={provider.status} /></td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" onClick={() => openProviderEditor(provider)} className="inline-flex min-h-8 items-center rounded-md border border-slate-200 bg-slate-50 px-2 text-[10px] font-black text-slate-700">Edit</button>
                        <button type="button" onClick={() => void handleTestProvider(provider.id)} className="inline-flex min-h-8 items-center rounded-md border border-slate-200 bg-slate-50 px-2 text-[10px] font-black text-slate-700">Test</button>
                        <button type="button" onClick={() => void handleFetchProviderModels(provider.id)} className="inline-flex min-h-8 items-center rounded-md border border-cyan-200 bg-cyan-50 px-2 text-[10px] font-black text-cyan-700">Fetch Provider Models</button>
                        <button type="button" onClick={() => void handleDeleteProvider(provider)} className="inline-flex min-h-8 items-center rounded-md border border-rose-200 bg-white px-2 text-[10px] font-black text-rose-700">Delete Provider</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {activeModelProviders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-xs font-bold text-slate-500">
                      No active provider credentials configured.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="border border-slate-200 bg-white">
          <TableHeader
            icon={SlidersHorizontal}
            title="Profile Inventory"
            detail={`${activeVisibleProfiles.length} visible`}
            action={(
              <button
                type="button"
                onClick={() => openProfileEditor()}
                disabled={needsProviderConnection}
                className="admin-secondary-button disabled:cursor-not-allowed disabled:opacity-50"
                title={needsProviderConnection ? "Create a provider before adding model profiles." : undefined}
              >
                New Profile
              </button>
            )}
          />
          <SelectionToolbar selectedCount={selectedProfileIds.length}>
            <button type="button" onClick={handleBatchEnableProfiles} disabled={selectedProfileIds.length === 0} className="admin-secondary-button disabled:cursor-not-allowed disabled:opacity-50">Batch Enable</button>
            <button type="button" onClick={handleBatchDisableProfiles} disabled={selectedProfileIds.length === 0} className="admin-secondary-button disabled:cursor-not-allowed disabled:opacity-50">Batch Disable</button>
            <button type="button" onClick={() => void handleBatchProfilePatch({ visibleToUser: true }, "Selected model profiles are visible to users.")} disabled={selectedProfileIds.length === 0} className="admin-secondary-button disabled:cursor-not-allowed disabled:opacity-50">Batch Show</button>
            <button type="button" onClick={() => void handleBatchProfilePatch({ visibleToUser: false }, "Selected model profiles are hidden from users.")} disabled={selectedProfileIds.length === 0} className="admin-secondary-button disabled:cursor-not-allowed disabled:opacity-50">Batch Hide</button>
            <button type="button" onClick={() => void handleBatchDeleteProfiles()} disabled={selectedProfileIds.length === 0} className="admin-danger-button disabled:cursor-not-allowed disabled:opacity-50">
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Batch Delete Profiles
            </button>
            <button
              type="button"
              onClick={() => void handleSavePlatformModels()}
              disabled={isSavingModels}
              className="inline-flex min-h-9 items-center justify-center rounded-md bg-slate-950 px-3 text-xs font-black text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isSavingModels ? "Saving" : "Save & Publish to Users"}
            </button>
          </SelectionToolbar>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-xs">
              <thead className="border-y border-slate-200 bg-slate-50 text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <label className="sr-only" htmlFor="select-all-profiles">Select all model profiles</label>
                    <input id="select-all-profiles" type="checkbox" checked={allProfilesSelected} onChange={handleSelectAllProfiles} />
                  </th>
                  <th className="px-3 py-2 font-black">Profile</th>
                  <th className="px-3 py-2 font-black">Provider</th>
                  <th className="px-3 py-2 font-black">Model id</th>
                  <th className="px-3 py-2 font-black">Quality</th>
                  <th className="px-3 py-2 font-black">Visible to users</th>
                  <th className="px-3 py-2 font-black">Enabled for users</th>
                  <th className="px-3 py-2 font-black">Status</th>
                  <th className="px-3 py-2 font-black">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeModelProfiles.map((profile) => {
                  const enabled = enabledModelProfileIds.includes(profile.id);
                  return (
                    <tr key={profile.id} className={selectedProfileIds.includes(profile.id) ? "bg-cyan-50/60" : ""}>
                      <td className="px-3 py-3">
                        <label className="sr-only" htmlFor={`select-profile-${profile.id}`}>Select model profile {profile.label}</label>
                        <input id={`select-profile-${profile.id}`} type="checkbox" checked={selectedProfileIds.includes(profile.id)} onChange={() => handleSelectProfile(profile.id)} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-black text-slate-950">{profile.label}</div>
                        <div className="mt-1 font-mono text-[10px] text-slate-400">{profile.id}</div>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{profile.providerLabel ?? providerById.get(profile.providerConfigId ?? "")?.displayName ?? profile.providerConfigId ?? "none"}</td>
                      <td className="px-3 py-3 font-mono text-slate-700">{profile.modelId}</td>
                      <td className="px-3 py-3 font-mono font-black text-slate-950">{profile.quality ?? "balanced"}</td>
                      <td className="px-3 py-3 text-slate-600">{profile.visibleToUser === false ? "hidden" : "visible"}</td>
                      <td className="px-3 py-3">
                        <label className="inline-flex items-center gap-2 font-black text-slate-700">
                          <input type="checkbox" checked={enabled} onChange={() => handlePlatformModelToggle(profile.id)} />
                          <span>{enabled ? "enabled" : "disabled"}</span>
                        </label>
                      </td>
                      <td className="px-3 py-3"><StatusBadge status={profile.status ?? "active"} /></td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <button type="button" onClick={() => openProfileEditor(profile)} className="inline-flex min-h-8 items-center rounded-md border border-slate-200 bg-slate-50 px-2 text-[10px] font-black text-slate-700">Edit</button>
                          <button type="button" onClick={() => void handleDeleteProfile(profile)} className="inline-flex min-h-8 items-center rounded-md border border-rose-200 bg-white px-2 text-[10px] font-black text-rose-700">Delete Profile</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {activeModelProfiles.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-xs font-bold text-slate-500">
                      <div>No active repository-backed model profiles configured.</div>
                      <div className="text-slate-700">Profile Inventory is empty because no model profile has been created from this provider yet.</div>
                      <div className="mt-1 text-slate-500">Fetch Provider Models, then use Create Profile from a discovered model.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="border border-slate-200 bg-white">
            <PanelHeader
              icon={effectiveEditorMode === "provider" ? KeyRound : SlidersHorizontal}
              title="Configuration Editor"
              action={effectiveEditorMode}
            />
            <div className="border-t border-slate-100 p-4">
              {needsProviderConnection && (
                <div className="mb-4 border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                  Provider connection required. Add a provider Base URL and API key before creating model profiles.
                </div>
              )}
              <div className="mb-4 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setEditorMode("provider")} className={effectiveEditorMode === "provider" ? "admin-secondary-button border-slate-950 bg-slate-950 text-white" : "admin-secondary-button"}>Provider</button>
                <button
                  type="button"
                  onClick={() => setEditorMode("profile")}
                  disabled={needsProviderConnection}
                  className={effectiveEditorMode === "profile" ? "admin-secondary-button border-slate-950 bg-slate-950 text-white" : "admin-secondary-button disabled:cursor-not-allowed disabled:opacity-50"}
                >
                  Profile
                </button>
              </div>
              {effectiveEditorMode === "provider" ? (
                <ProviderEditor
                  providerForm={providerForm}
                  setProviderForm={setProviderForm}
                  handleSaveProvider={handleSaveProvider}
                  handleTestProvider={handleTestProvider}
                  handleFetchProviderModels={handleFetchProviderModels}
                />
              ) : (
                <ProfileEditor
                  profileForm={profileForm}
                  providers={activeModelProviders}
                  selectedProviderCatalog={selectedProviderCatalog}
                  setProfileForm={setProfileForm}
                  handleSaveProfile={handleSaveProfile}
                  handleTestProfile={handleTestProfile}
                />
              )}
            </div>
          </section>

          <section className="border border-slate-200 bg-white">
            <PanelHeader icon={Database} title="Discovered Models" action={`${selectedProviderCatalog?.models.length ?? 0} fetched`} />
            <div className="max-h-72 overflow-auto border-t border-slate-100 p-3">
              {selectedProviderCatalog?.models.map((model) => {
                const existingProfile = activeModelProfiles.find(
                  (profile) =>
                    profile.providerConfigId === selectedProviderCatalog.providerId &&
                    profile.modelId === model.id,
                );
                return (
                  <div key={model.id} className="mb-2 border border-slate-200 bg-slate-50 p-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setEditorMode("profile");
                        setProfileForm((current) => ({
                          ...current,
                          providerConfigId: selectedProviderCatalog.providerId,
                          modelId: model.id,
                          label: current.label || model.label || model.id,
                          id: current.id || makeProfileId(providerById.get(selectedProviderCatalog.providerId)?.displayName ?? "profile", model.id),
                        }));
                      }}
                      className="w-full text-left"
                    >
                      <span className="block font-black text-slate-950">{model.label ?? model.id}</span>
                      <span className="mt-1 block truncate font-mono text-[10px] font-bold text-slate-500">{model.id}</span>
                    </button>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleCreateProfileFromModel(selectedProviderCatalog.providerId, model)}
                        disabled={existingProfile !== undefined}
                        className="inline-flex min-h-8 items-center rounded-md bg-slate-950 px-2 text-[10px] font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {existingProfile === undefined ? "Create Profile" : "Profile Exists"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleTestProfile(existingProfile ?? {
                          id: makeProfileId(providerById.get(selectedProviderCatalog.providerId)?.displayName ?? "profile", model.id),
                          providerConfigId: selectedProviderCatalog.providerId,
                          label: model.label ?? model.id,
                          modelId: model.id,
                          quality: profileForm.quality,
                          visibleToUser: true,
                          status: "active",
                        })}
                        className="inline-flex min-h-8 items-center rounded-md border border-slate-200 bg-white px-2 text-[10px] font-black text-slate-700"
                      >
                        Test Model
                      </button>
                    </div>
                  </div>
                );
              }) ?? (
                <div className="border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs font-bold text-slate-500">
                  Fetch Provider Models after saving a provider, then select a discovered model id for a profile.
                </div>
              )}
              {selectedProviderCatalog?.unsupported === true && (
                <p className="text-xs font-bold text-amber-700">{selectedProviderCatalog.error}</p>
              )}
            </div>
          </section>
        </aside>
      </section>

      <details className="border border-slate-200 bg-white">
        <summary className="flex min-h-12 cursor-pointer items-center justify-between px-4 text-sm font-black text-slate-950">
          <span className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-slate-500" aria-hidden="true" />
            Read-only System Settings
          </span>
          <span className="rounded-sm bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-500">read-only</span>
        </summary>
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="w-full min-w-[840px] text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase text-slate-500">
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
                    <span className={`rounded-sm px-2 py-1 text-[10px] font-black uppercase ${item.configured ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
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
      </details>
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

function TableHeader({
  title,
  detail,
  action,
  icon: Icon,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
  icon: typeof Settings;
}) {
  return (
    <div className="flex min-h-12 flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-sm font-black">
        <Icon className="h-4 w-4 text-slate-500" aria-hidden="true" />
        <span>{title}</span>
        <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-black uppercase text-slate-500">{detail}</span>
      </div>
      {action}
    </div>
  );
}

function SelectionToolbar({
  selectedCount,
  children,
}: {
  selectedCount: number;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-600">
      <span>{selectedCount} selected</span>
      {children}
    </div>
  );
}

function CompactMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="min-w-28 border border-slate-200 bg-slate-50 px-3 py-2 text-slate-950">
      <div className="text-[10px] font-black uppercase text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-lg font-black tracking-tight">{value}</div>
      <div className="text-[10px] font-semibold text-slate-500">{detail}</div>
    </div>
  );
}

function StatusMessageBanner({ message }: { message: StatusMessage }) {
  const className =
    message.tone === "error"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : message.tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";
  return (
    <p className={`border-b px-4 py-2 text-xs font-bold ${className}`}>
      {message.text}
    </p>
  );
}

function PublishChecklist({
  providerCount,
  profileCount,
  fetchedModelCount,
  stagedCount,
  publishedCount,
}: {
  providerCount: number;
  profileCount: number;
  fetchedModelCount: number;
  stagedCount: number;
  publishedCount: number;
}) {
  return (
    <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-600">
      <div className="mb-2 font-black text-slate-950">Publish checklist</div>
      <div className="grid gap-2 md:grid-cols-5">
        <ChecklistStep label="1 Save Provider" complete={providerCount > 0} detail={`${providerCount} active`} />
        <ChecklistStep label="2 Fetch Models" complete={fetchedModelCount > 0} detail={`${fetchedModelCount} fetched`} />
        <ChecklistStep label="3 Create Profile" complete={profileCount > 0} detail={`${profileCount} profile(s)`} />
        <ChecklistStep label="4 Test Model" complete={false} detail="Use Test Model before publish" />
        <ChecklistStep label="5 Publish" complete={publishedCount > 0} detail={`Users can see ${publishedCount} published profiles. ${stagedCount} staged.`} />
      </div>
    </div>
  );
}

function ChecklistStep({
  label,
  complete,
  detail,
}: {
  label: string;
  complete: boolean;
  detail: string;
}) {
  return (
    <div className={`border px-3 py-2 ${complete ? "border-emerald-200 bg-white text-emerald-700" : "border-slate-200 bg-white text-slate-600"}`}>
      <div className="font-black text-slate-950">{label}</div>
      <div className="mt-1 text-[10px] font-semibold">{detail}</div>
    </div>
  );
}

function ProviderEditor({
  providerForm,
  setProviderForm,
  handleSaveProvider,
  handleTestProvider,
  handleFetchProviderModels,
}: {
  providerForm: ProviderFormState;
  setProviderForm: (value: ProviderFormState) => void;
  handleSaveProvider: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  handleTestProvider: (providerId?: string) => Promise<void>;
  handleFetchProviderModels: (providerId?: string) => Promise<void>;
}) {
  return (
    <form onSubmit={(event) => void handleSaveProvider(event)} className="space-y-3">
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
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-slate-950 px-3 text-xs font-black text-white">
          <Save className="h-4 w-4" aria-hidden="true" />
          Save Provider
        </button>
        <button type="button" onClick={() => void handleTestProvider()} className="admin-secondary-button">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Test Provider
        </button>
        <button type="button" onClick={() => void handleFetchProviderModels()} className="admin-secondary-button border-cyan-200 bg-cyan-50 text-cyan-700">
          <Database className="h-4 w-4" aria-hidden="true" />
          Fetch Provider Models
        </button>
      </div>
    </form>
  );
}

function ProfileEditor({
  profileForm,
  providers,
  selectedProviderCatalog,
  setProfileForm,
  handleSaveProfile,
  handleTestProfile,
}: {
  profileForm: ProfileFormState;
  providers: AdminPlatformModelProviderDto[];
  selectedProviderCatalog?: AdminModelProviderModelCatalogDto;
  setProfileForm: (value: ProfileFormState | ((current: ProfileFormState) => ProfileFormState)) => void;
  handleSaveProfile: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  handleTestProfile: () => Promise<void>;
}) {
  return (
    <form onSubmit={(event) => void handleSaveProfile(event)} className="space-y-3">
      <Field label="Profile id">
        <input className="admin-input" value={profileForm.id} onChange={(event) => setProfileForm({ ...profileForm, id: event.target.value })} placeholder="openrouter_deep" required />
      </Field>
      <Field label="Provider config">
        <select className="admin-input" value={profileForm.providerConfigId} onChange={(event) => setProfileForm({ ...profileForm, providerConfigId: event.target.value })} required>
          <option value="">Select provider</option>
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>{provider.displayName}</option>
          ))}
        </select>
      </Field>
      <Field label="Display name">
        <input className="admin-input" value={profileForm.label} onChange={(event) => setProfileForm({ ...profileForm, label: event.target.value })} placeholder="OpenRouter Deep" required />
      </Field>
      <Field label="Model id">
        {selectedProviderCatalog !== undefined && selectedProviderCatalog.models.length > 0 ? (
          <select className="admin-input" value={profileForm.modelId} onChange={(event) => setProfileForm({ ...profileForm, modelId: event.target.value })}>
            <option value="">Select discovered model</option>
            {selectedProviderCatalog.models.map((model) => (
              <option key={model.id} value={model.id}>{model.label ?? model.id}</option>
            ))}
          </select>
        ) : (
          <input className="admin-input" value={profileForm.modelId} onChange={(event) => setProfileForm({ ...profileForm, modelId: event.target.value })} placeholder="anthropic/claude-sonnet-4" required />
        )}
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
      <label className="inline-flex min-h-10 w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-700">
        <input
          type="checkbox"
          checked={profileForm.visibleToUser}
          onChange={(event) => setProfileForm({ ...profileForm, visibleToUser: event.target.checked })}
        />
        <span>Visible to users</span>
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="submit" className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-slate-950 px-4 text-xs font-black text-white">
          <Save className="h-4 w-4" aria-hidden="true" />
          Save Model Profile
        </button>
        <button type="button" onClick={() => void handleTestProfile()} className="admin-secondary-button justify-center">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Test Model
        </button>
      </div>
    </form>
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

function unique(items: string[]): string[] {
  return Array.from(new Set(items));
}

function makeProfileId(providerName: string, modelId: string): string {
  const raw = `${providerName}_${modelId}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return raw || "model_profile";
}

function formatValue(value: unknown): string {
  if (value === undefined) return "default";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function formatDateTime(value: string): string {
  return value.replace("T", " ").slice(0, 16);
}
