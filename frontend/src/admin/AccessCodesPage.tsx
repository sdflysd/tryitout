import { useEffect, useMemo, useState } from "react";
import type {
  FormEvent,
  ReactNode,
} from "react";
import {
  ClipboardCopy,
  KeyRound,
  PackagePlus,
  ShieldOff,
} from "lucide-react";

import { type Language } from "../language.js";
import {
  AdminClientError,
  bulkAdminAccessCodes,
  createAdminAccessCodeBatch,
  deleteAdminAccessCode,
  disableAdminAccessCode,
  disableAdminAccessCodeBatch,
  fetchAdminAccessCodes,
  fetchAdminAccessCodeBatches,
  type AdminAccessCodeRowDto,
  type AdminBulkAccessCodesInputDto,
  type AdminAccessCodeBatchDto,
  type AdminCommercialFeatureDto,
  type AdminCreateAccessCodeBatchInputDto,
  type AdminCreateAccessCodeBatchResultDto,
  type AdminUserTierDto,
} from "./admin-client.js";
import { getAdminCopy } from "./admin-copy.js";

interface AccessCodesPageProps {
  initialBatches?: AdminAccessCodeBatchDto[];
  initialAccessCodes?: AdminAccessCodeRowDto[];
  initialCreationResult?: AdminCreateAccessCodeBatchResultDto;
  copyText?: (value: string) => Promise<void> | void;
  fetchBatches?: () => Promise<AdminAccessCodeBatchDto[]>;
  fetchAccessCodes?: () => Promise<{ total: number; items: AdminAccessCodeRowDto[] }>;
  disableAccessCode?: (accessCodeId: string, reason: string) => Promise<AdminAccessCodeRowDto>;
  deleteAccessCode?: (accessCodeId: string, reason: string) => Promise<AdminAccessCodeRowDto>;
  bulkAccessCodes?: (input: AdminBulkAccessCodesInputDto) => Promise<{ updatedCodeIds: string[]; skipped: Array<{ id: string; reason: string }> }>;
  language?: Language;
}

const FEATURE_OPTIONS: Array<{ value: AdminCommercialFeatureDto; label: string }> = [
  { value: "deep_mode", label: "deep_mode" },
  { value: "priority_queue", label: "priority_queue" },
  { value: "custom_model_provider", label: "custom_model_provider" },
];

export default function AccessCodesPage({
  initialBatches,
  initialAccessCodes,
  initialCreationResult,
  copyText = defaultCopyText,
  fetchBatches = fetchAdminAccessCodeBatches,
  fetchAccessCodes = fetchAdminAccessCodes,
  disableAccessCode = disableAdminAccessCode,
  deleteAccessCode = deleteAdminAccessCode,
  bulkAccessCodes = bulkAdminAccessCodes,
  language,
}: AccessCodesPageProps) {
  const copy = getAdminCopy(language);
  const [batches, setBatches] = useState<AdminAccessCodeBatchDto[]>(initialBatches ?? []);
  const [accessCodes, setAccessCodes] = useState<AdminAccessCodeRowDto[]>(initialAccessCodes ?? []);
  const [selectedCodeIds, setSelectedCodeIds] = useState<string[]>([]);
  const [bulkForm, setBulkForm] = useState({
    operation: "disable" as AdminBulkAccessCodesInputDto["operation"],
    reason: "",
  });
  const [creationResult, setCreationResult] = useState(initialCreationResult);
  const [isLoading, setIsLoading] = useState(initialBatches === undefined);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState<AdminCreateAccessCodeBatchInputDto>({
    name: "",
    source: "sales-led",
    codeCount: 10,
    credits: 25,
    tier: "pro",
    features: ["priority_queue"],
    expiresAt: "",
    notes: "",
  });
  const [statusMessage, setStatusMessage] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const rawCodeText = useMemo(
    () => creationResult?.codes.map((code) => code.rawCode).join("\n") ?? "",
    [creationResult],
  );

  useEffect(() => {
    if (initialBatches !== undefined && initialAccessCodes !== undefined) {
      setBatches(initialBatches);
      setAccessCodes(initialAccessCodes);
      setIsLoading(false);
      setLoadError("");
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    void Promise.all([
      initialBatches === undefined ? fetchBatches() : Promise.resolve(initialBatches),
      initialAccessCodes === undefined ? fetchAccessCodes() : Promise.resolve({ total: initialAccessCodes.length, items: initialAccessCodes }),
    ])
      .then(([nextBatches, nextAccessCodes]) => {
        if (!cancelled) {
          setBatches(nextBatches);
          setAccessCodes(nextAccessCodes.items);
          setLoadError("");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Unable to load access-code batches");
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
  }, [fetchAccessCodes, fetchBatches, initialAccessCodes, initialBatches]);

  const handleFeatureToggle = (feature: AdminCommercialFeatureDto) => {
    setForm((current) => ({
      ...current,
      features: current.features.includes(feature)
        ? current.features.filter((item) => item !== feature)
        : [...current.features, feature],
    }));
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatusMessage(copy.accessCodes.status.creating);
    setIsCreating(true);
    try {
      const result = await createAdminAccessCodeBatch({
        ...form,
        name: form.name.trim(),
        expiresAt: form.expiresAt?.trim() || undefined,
        notes: form.notes?.trim() || undefined,
        source: form.source?.trim() || undefined,
      });
      setCreationResult(result);
      setBatches((current) => [toBatchDto(result), ...current]);
      setAccessCodes((current) => [
        ...result.codes.map((code) => ({
          id: code.id,
          batchId: result.batch.id,
          batchName: result.batch.name,
          codeMask: code.codeMask,
          status: code.status,
          credits: code.credits,
          tier: code.tier,
          features: code.features,
          expiresAt: code.expiresAt,
          createdAt: code.createdAt,
        })),
        ...current,
      ]);
      setStatusMessage(copy.accessCodes.status.created(result.codes.length));
    } catch (error) {
      setStatusMessage(getAccessCodeCreateFailureMessage(language, error));
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopyAll = async () => {
    await copyText(rawCodeText);
    setStatusMessage(copy.accessCodes.status.copied);
  };

  const handleDisable = async (batchId: string) => {
    const result = await disableAdminAccessCodeBatch(batchId, "disabled from admin console");
    setBatches((current) =>
      current.map((batch) =>
        batch.id === batchId
          ? {
              ...batch,
              status: "disabled",
              disabledAt: result.batch.disabledAt,
              disabledCount: batch.activeCount + batch.disabledCount,
              activeCount: 0,
            }
          : batch,
      ),
    );
    setStatusMessage(copy.accessCodes.status.disabled(result.disabledCodeCount));
  };

  const handleDisableCode = async (codeId: string) => {
    const updated = await disableAccessCode(codeId, "disabled from admin console");
    replaceCode(updated);
  };

  const handleDeleteCode = async (codeId: string) => {
    const updated = await deleteAccessCode(codeId, "deleted from admin console");
    replaceCode(updated);
  };

  const handleBulkCodes = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedCodeIds.length === 0) {
      setStatusMessage(copy.accessCodes.actions.selectFirst);
      return;
    }
    const result = await bulkAccessCodes({
      accessCodeIds: selectedCodeIds,
      operation: bulkForm.operation,
      reason: bulkForm.reason || "admin bulk action",
    });
    const refreshed = await fetchAccessCodes();
    setAccessCodes(refreshed.items);
    setSelectedCodeIds([]);
    setStatusMessage(copy.accessCodes.actions.bulkUpdated(result.updatedCodeIds.length));
  };

  const replaceCode = (updated: AdminAccessCodeRowDto) => {
    setAccessCodes((current) =>
      current.map((code) => (code.id === updated.id ? updated : code)),
    );
  };

  const toggleCodeSelected = (codeId: string) => {
    setSelectedCodeIds((current) =>
      current.includes(codeId)
        ? current.filter((id) => id !== codeId)
        : [...current, codeId],
    );
  };

  return (
    <div className="space-y-5">
      <header className="border border-slate-200 bg-white px-4 py-3">
        <h1 className="text-sm font-black text-slate-950">{copy.accessCodes.title}</h1>
        <p className="mt-1 text-xs font-semibold text-slate-500">{copy.accessCodes.description}</p>
      </header>

      {(isLoading || loadError) && (
        <section className="border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-600">
          {isLoading ? "Loading access-code batches" : loadError}
        </section>
      )}

      <section className="grid gap-5 xl:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.2fr)]">
        <form onSubmit={(event) => void handleCreate(event)} className="border border-slate-200 bg-white p-4">
          <div className="mb-4 flex items-center gap-2">
            <PackagePlus className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <h2 className="text-sm font-black text-slate-950">{copy.accessCodes.form.title}</h2>
          </div>

          <div className="grid gap-3">
            <Field label={copy.accessCodes.form.campaignName}>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="admin-input" placeholder="Founding Customers" required />
            </Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label={copy.accessCodes.form.codeCount}>
                <input type="number" value={form.codeCount} onChange={(event) => setForm({ ...form, codeCount: Number(event.target.value) })} className="admin-input" min={1} />
              </Field>
              <Field label={copy.accessCodes.form.creditsPerCode}>
                <input type="number" value={form.credits} onChange={(event) => setForm({ ...form, credits: Number(event.target.value) })} className="admin-input" min={1} />
              </Field>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label={copy.accessCodes.form.tierGrant}>
                <select value={form.tier ?? ""} onChange={(event) => setForm({ ...form, tier: event.target.value as AdminUserTierDto })} className="admin-input">
                  <option value="">none</option>
                  <option value="basic">basic</option>
                  <option value="pro">pro</option>
                  <option value="business">business</option>
                </select>
              </Field>
              <Field label={copy.accessCodes.form.source}>
                <input value={form.source ?? ""} onChange={(event) => setForm({ ...form, source: event.target.value })} className="admin-input" placeholder="sales-led" />
              </Field>
            </div>
            <Field label={copy.accessCodes.form.features}>
              <div className="flex flex-wrap gap-2">
                {FEATURE_OPTIONS.map((feature) => (
                  <label key={feature.value} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.features.includes(feature.value)}
                      onChange={() => handleFeatureToggle(feature.value)}
                    />
                    <span>{feature.label}</span>
                  </label>
                ))}
              </div>
            </Field>
            <Field label={copy.accessCodes.form.expiration}>
              <input value={form.expiresAt ?? ""} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} className="admin-input" placeholder="2026-08-01T00:00:00.000Z" />
            </Field>
            <Field label={copy.accessCodes.form.operatorNotes}>
              <textarea value={form.notes ?? ""} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="admin-input min-h-20" placeholder="CRM campaign, contract id, support ticket..." />
            </Field>
          </div>

          <button type="submit" disabled={isCreating} className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-md bg-slate-950 px-4 text-xs font-black text-white disabled:opacity-50">
            {copy.accessCodes.form.submit}
          </button>
          {statusMessage && <p className="mt-3 text-xs font-bold text-slate-500">{statusMessage}</p>}
        </form>

        <section className="border border-slate-200 bg-white">
          <div className="flex min-h-12 items-center justify-between border-b border-slate-200 px-4">
            <h2 className="text-sm font-black text-slate-950">{copy.accessCodes.result.title}</h2>
            <button
              type="button"
              onClick={() => void handleCopyAll()}
              disabled={!rawCodeText}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-700 disabled:opacity-40"
            >
              <ClipboardCopy className="h-4 w-4" aria-hidden="true" />
              {copy.accessCodes.actions.copyAll}
            </button>
          </div>
          <div className="grid gap-3 p-4 md:grid-cols-2">
            {creationResult?.codes.map((code) => (
              <div key={code.id} className="border border-slate-200 bg-slate-50 p-3">
                <div className="font-mono text-sm font-black text-slate-950">{code.rawCode}</div>
                <div className="mt-2 flex items-center justify-between text-[10px] font-bold text-slate-500">
                  <span>{code.codeMask}</span>
                  <span>{copy.accessCodes.result.credits(code.credits)}</span>
                </div>
              </div>
            )) ?? (
              <div className="col-span-full border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs font-bold text-slate-500">
                {copy.accessCodes.result.empty}
              </div>
            )}
          </div>
        </section>
      </section>

      <section className="border border-slate-200 bg-white">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-black text-slate-950">{copy.accessCodes.inventory.title}</h2>
              <p className="text-xs font-semibold text-slate-500">{copy.accessCodes.inventory.description}</p>
            </div>
          </div>
          <div className="text-xs font-bold text-slate-500">{copy.accessCodes.actions.selected(selectedCodeIds.length)}</div>
        </div>

        <form onSubmit={(event) => void handleBulkCodes(event)} className="grid gap-3 border-b border-slate-200 px-4 py-3 md:grid-cols-[180px_minmax(220px,1fr)_auto]">
          <Field label={copy.accessCodes.actions.bulkAction}>
            <select
              name="access-code-bulk-operation"
              className="admin-input"
              value={bulkForm.operation}
              onChange={(event) => setBulkForm({ ...bulkForm, operation: event.target.value as AdminBulkAccessCodesInputDto["operation"] })}
            >
              <option value="disable">{copy.accessCodes.actions.disable}</option>
              <option value="delete">{copy.accessCodes.actions.delete}</option>
            </select>
          </Field>
          <Field label={copy.accessCodes.actions.bulkReason}>
            <input
              className="admin-input"
              value={bulkForm.reason}
              onChange={(event) => setBulkForm({ ...bulkForm, reason: event.target.value })}
              placeholder="campaign cleanup"
            />
          </Field>
          <div className="flex items-end">
            <button type="submit" className="inline-flex min-h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-xs font-black text-white">
              {copy.accessCodes.actions.applyBulk}
            </button>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1220px] text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.13em] text-slate-500">
              <tr>
                <th className="px-4 py-2 font-black">{copy.accessCodes.columns.select}</th>
                <th className="px-4 py-2 font-black">{copy.accessCodes.columns.codeMask}</th>
                <th className="px-4 py-2 font-black">{copy.accessCodes.columns.batch}</th>
                <th className="px-4 py-2 font-black">{copy.accessCodes.columns.credits}</th>
                <th className="px-4 py-2 font-black">{copy.accessCodes.columns.features}</th>
                <th className="px-4 py-2 font-black">{copy.accessCodes.columns.redeemedUser}</th>
                <th className="px-4 py-2 font-black">{copy.accessCodes.columns.expires}</th>
                <th className="px-4 py-2 font-black">{copy.accessCodes.columns.created}</th>
                <th className="px-4 py-2 font-black">{copy.accessCodes.columns.status}</th>
                <th className="px-4 py-2 font-black">{copy.accessCodes.columns.action}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {accessCodes.map((code) => (
                <tr key={code.id}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${code.codeMask}`}
                      checked={selectedCodeIds.includes(code.id)}
                      onChange={() => toggleCodeSelected(code.id)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-mono font-black text-slate-950">{code.codeMask}</div>
                    <div className="mt-1 font-mono text-[10px] text-slate-400">{code.id}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-700">{code.batchName ?? code.batchId}</div>
                    <div className="mt-1 font-mono text-[10px] text-slate-400">{code.batchId}</div>
                  </td>
                  <td className="px-4 py-3 font-mono font-black text-slate-950">{code.credits}</td>
                  <td className="px-4 py-3 text-slate-600">{code.features.length ? code.features.join(", ") : copy.common.standard}</td>
                  <td className="px-4 py-3 text-slate-600">{code.redeemedByUserEmail ?? code.redeemedByUserId ?? copy.common.none}</td>
                  <td className="px-4 py-3 text-slate-500">{code.expiresAt ? formatDate(code.expiresAt) : copy.common.none}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(code.createdAt)}</td>
                  <td className="px-4 py-3">
                    <AccessCodeStatusBadge status={code.status} copy={copy} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleDisableCode(code.id)}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2.5 text-[10px] font-black text-rose-700"
                      >
                        <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
                        {copy.accessCodes.actions.disable}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteCode(code.id)}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 text-[10px] font-black text-slate-700"
                      >
                        {copy.accessCodes.actions.delete}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {accessCodes.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-xs font-bold text-slate-500">
                    {copy.accessCodes.inventory.empty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border border-slate-200 bg-white">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-black text-slate-950">{copy.accessCodes.batchSummary}</h2>
              <p className="text-xs font-semibold text-slate-500">{copy.accessCodes.description}</p>
            </div>
          </div>
          <div className="text-xs font-bold text-slate-500">{copy.accessCodes.tracked(batches.length)}</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.13em] text-slate-500">
              <tr>
                <th className="px-4 py-2 font-black">{copy.accessCodes.columns.batchName}</th>
                <th className="px-4 py-2 font-black">{copy.accessCodes.columns.source}</th>
                <th className="px-4 py-2 font-black">{copy.accessCodes.columns.credits}</th>
                <th className="px-4 py-2 font-black">{copy.accessCodes.columns.features}</th>
                <th className="px-4 py-2 font-black">{copy.accessCodes.columns.created}</th>
                <th className="px-4 py-2 font-black">{copy.accessCodes.columns.redeemed}</th>
                <th className="px-4 py-2 font-black">{copy.accessCodes.columns.redemptionRate}</th>
                <th className="px-4 py-2 font-black">{copy.accessCodes.columns.status}</th>
                <th className="px-4 py-2 font-black">{copy.accessCodes.columns.action}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {batches.map((batch) => (
                <tr key={batch.id}>
                  <td className="px-4 py-3">
                    <div className="font-black text-slate-950">{batch.name}</div>
                    <div className="mt-1 font-mono text-[10px] text-slate-400">{batch.id}</div>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-700">{batch.source ?? copy.common.manual}</td>
                  <td className="px-4 py-3 font-mono font-black text-slate-950">{batch.credits}</td>
                  <td className="px-4 py-3">
                    <div className="flex max-w-64 flex-wrap gap-1">
                      {batch.features.length === 0 ? (
                        <span className="text-slate-400">{copy.common.standard}</span>
                      ) : (
                        batch.features.map((feature) => (
                          <span key={feature} className="rounded-sm bg-cyan-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-700">
                            {feature}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(batch.createdAt)}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">{batch.redeemedCount}/{batch.codeCount}</td>
                  <td className="px-4 py-3 font-mono font-black text-slate-950">{formatPercent(batch.redemptionRate)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-sm px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${batch.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                      {copy.status[batch.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => void handleDisable(batch.id)}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2.5 text-[10px] font-black text-rose-700"
                    >
                      <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
                      {copy.accessCodes.actions.disable}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function getAccessCodeCreateFailureMessage(
  language: Language | undefined,
  error: unknown,
): string {
  const message =
    error instanceof AdminClientError || error instanceof Error
      ? error.message
      : "Unknown error";
  return getAdminCopy(language).accessCodes.status.createFailed(message);
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

function toBatchDto(
  result: AdminCreateAccessCodeBatchResultDto,
): AdminAccessCodeBatchDto {
  return {
    id: result.batch.id,
    name: result.batch.name,
    source: result.batch.source,
    codeCount: result.batch.codeCount,
    credits: result.batch.credits,
    tier: result.batch.tier,
    features: result.batch.features,
    expiresAt: result.batch.expiresAt,
    disabledAt: result.batch.disabledAt,
    notes: result.batch.notes,
    createdAt: result.batch.createdAt,
    status: result.batch.disabledAt === undefined ? "active" : "disabled",
    redeemedCount: 0,
    activeCount: result.batch.codeCount,
    disabledCount: 0,
    expiredCount: 0,
    redemptionRate: 0,
  };
}

function AccessCodeStatusBadge({
  status,
  copy,
}: {
  status: AdminAccessCodeRowDto["status"];
  copy: ReturnType<typeof getAdminCopy>;
}) {
  const className = status === "active"
    ? "bg-emerald-50 text-emerald-700"
    : status === "redeemed"
      ? "bg-cyan-50 text-cyan-700"
      : "bg-slate-100 text-slate-600";
  const label = status in copy.status
    ? copy.status[status as keyof typeof copy.status]
    : status;
  return (
    <span className={`rounded-sm px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${className}`}>
      {label}
    </span>
  );
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatDate(value: string): string {
  return value.slice(0, 10);
}

function defaultCopyText(value: string): Promise<void> | void {
  return navigator.clipboard?.writeText(value);
}
