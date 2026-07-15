import type { ReactNode } from "react";
import {
  useEffect,
  useState,
  type FormEvent,
} from "react";
import {
  Ban,
  CreditCard,
  Edit3,
  History,
  Plus,
  ShieldAlert,
  Trash2,
  UserCog,
  X,
} from "lucide-react";

import { type Language } from "../language.js";
import {
  adjustAdminUserCredits,
  bulkAdminUsers,
  createAdminUser,
  fetchAdminUsers,
  updateAdminUser,
  type AdminBulkUsersInputDto,
  type AdminCommercialFeatureDto,
  type AdminCreateUserInputDto,
  type AdminUpdateUserInputDto,
  type AdminUserRowDto,
  type AdminUserTierDto,
} from "./admin-client.js";
import { getAdminCopy, type AdminCopy } from "./admin-copy.js";

type UserPanel = "create" | "edit" | "bulk" | "credits";

interface UsersPageProps {
  users?: AdminUserRowDto[];
  fetchUsers?: () => Promise<AdminUserRowDto[]>;
  createUser?: (input: AdminCreateUserInputDto) => Promise<AdminUserRowDto>;
  updateUser?: (userId: string, input: AdminUpdateUserInputDto) => Promise<AdminUserRowDto>;
  bulkUsers?: (input: AdminBulkUsersInputDto) => Promise<{ updatedUserIds: string[]; skipped: Array<{ id: string; reason: string }> }>;
  language?: Language;
  initialPanel?: UserPanel;
  initialSelectedUserId?: string;
}

const EMPTY_USERS: AdminUserRowDto[] = [];
const ROLES = ["user", "admin", "owner"] as const;
const TIERS: AdminUserTierDto[] = ["basic", "pro", "business"];
const FEATURES: AdminCommercialFeatureDto[] = [
  "deep_mode",
  "priority_queue",
  "custom_model_provider",
  "admin_ops",
];

export default function UsersPage({
  users,
  fetchUsers = fetchAdminUsers,
  createUser = createAdminUser,
  updateUser = updateAdminUser,
  bulkUsers = bulkAdminUsers,
  language,
  initialPanel,
  initialSelectedUserId: initialSelectedUserIdProp,
}: UsersPageProps) {
  const copy = getAdminCopy(language);
  const initialSelectedUser = users?.find((user) => user.id === initialSelectedUserIdProp) ?? users?.[0];
  const [rows, setRows] = useState<AdminUserRowDto[]>(users ?? EMPTY_USERS);
  const [isLoading, setIsLoading] = useState(users === undefined);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [adjustment, setAdjustment] = useState({
    amount: 0,
    idempotencyKey: "",
    reason: "",
  });
  const [createForm, setCreateForm] = useState({
    email: "",
    password: "",
    role: "user" as NonNullable<AdminUserRowDto["role"]>,
    tier: "basic" as AdminUserTierDto,
    features: [] as AdminCommercialFeatureDto[],
    initialCredits: 0,
    reason: "",
  });
  const [editForm, setEditForm] = useState({
    role: initialSelectedUser?.role ?? "user" as NonNullable<AdminUserRowDto["role"]>,
    tier: initialSelectedUser?.tier ?? "basic" as AdminUserTierDto,
    features: initialSelectedUser?.features ?? [] as AdminCommercialFeatureDto[],
    creditAdjustmentAmount: 0,
    reason: "",
  });
  const [bulkForm, setBulkForm] = useState({
    operation: "disable" as AdminBulkUsersInputDto["operation"],
    role: "user" as NonNullable<AdminUserRowDto["role"]>,
    tier: "pro" as AdminUserTierDto,
    features: [] as AdminCommercialFeatureDto[],
    reason: "",
  });
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedUserId, setSelectedUserId] = useState(initialSelectedUser?.id ?? "");
  const [activePanel, setActivePanel] = useState<UserPanel | undefined>(initialPanel);
  const selectedUser = rows.find((user) => user.id === selectedUserId) ?? rows[0];
  const visibleRows = rows.filter((user) => {
    const haystack = `${user.email} ${user.id}`.toLowerCase();
    const matchesQuery = query.trim() === "" || haystack.includes(query.trim().toLowerCase());
    const matchesStatus = statusFilter === "all" || user.status === statusFilter;
    const matchesRole = roleFilter === "all" || (user.role ?? "user") === roleFilter;
    return matchesQuery && matchesStatus && matchesRole;
  });
  const activeUsers = rows.filter((user) => user.status === "active").length;
  const disabledUsers = rows.filter((user) => user.status === "disabled").length;
  const totalAvailable = rows.reduce((total, user) => total + user.availableCredits, 0);
  const totalFrozen = rows.reduce((total, user) => total + user.frozenCredits, 0);
  const totalRedeemedBatches = rows.reduce(
    (total, user) => total + user.redeemedBatchCount,
    0,
  );
  const totalFailedTasks = rows.reduce(
    (total, user) => total + user.failedTaskCount,
    0,
  );

  useEffect(() => {
    if (users !== undefined) {
      setRows(users);
      setIsLoading(false);
      setLoadError("");
      setSelectedUserId((current) => current || users[0]?.id || "");
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    void fetchUsers()
      .then((nextUsers) => {
        if (!cancelled) {
          setRows(nextUsers);
          setSelectedUserId((current) => current || nextUsers[0]?.id || "");
          setLoadError("");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Unable to load commercial users");
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
  }, [fetchUsers, users]);

  const handleAdjustCredits = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedUser === undefined) {
      setStatusMessage(copy.users.creditAdjustment.selectUser);
      return;
    }
    setStatusMessage(copy.users.creditAdjustment.submitting);
    const idempotencyKey = adjustment.idempotencyKey.trim() ||
      `admin-credit-${selectedUser.id}-${Date.now()}`;
    const result = await adjustAdminUserCredits(selectedUser.id, {
      amount: adjustment.amount,
      reason: adjustment.reason,
      idempotencyKey,
    });
    setRows((currentRows) =>
      currentRows.map((user) =>
        user.id === selectedUser.id
          ? {
              ...user,
              availableCredits: result.account.balance,
              frozenCredits: result.account.frozenCredits,
              recentActivityAt: result.ledger.createdAt,
            }
          : user,
      ),
    );
    setStatusMessage(copy.users.creditAdjustment.recorded(result.ledger.amount));
  };

  const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatusMessage(copy.users.actions.creating);
    const created = await createUser({
      ...createForm,
      features: createForm.features,
      initialCredits: Number(createForm.initialCredits),
    });
    setRows((currentRows) => [created, ...currentRows.filter((user) => user.id !== created.id)]);
    setSelectedUserId(created.id);
    setActivePanel(undefined);
    setStatusMessage(copy.users.actions.created);
  };

  const handleSaveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedUser) {
      return;
    }
    setStatusMessage(copy.users.actions.updating);
    let updated = await updateUser(selectedUser.id, {
      role: editForm.role,
      tier: editForm.tier,
      features: editForm.features,
      reason: editForm.reason,
    });
    if (editForm.creditAdjustmentAmount !== 0) {
      const result = await adjustAdminUserCredits(selectedUser.id, {
        amount: editForm.creditAdjustmentAmount,
        reason: editForm.reason || "admin edit credit adjustment",
        idempotencyKey: `admin-edit-credit-${selectedUser.id}-${Date.now()}`,
      });
      updated = {
        ...updated,
        availableCredits: result.account.balance,
        frozenCredits: result.account.frozenCredits,
        recentActivityAt: result.ledger.createdAt,
      };
      setEditForm((current) => ({
        ...current,
        creditAdjustmentAmount: 0,
      }));
    }
    replaceRow(updated);
    setActivePanel(undefined);
    setStatusMessage(copy.users.actions.updated);
  };

  const handleUserStatus = async (
    user: AdminUserRowDto,
    status: "active" | "disabled" | "deleted",
  ) => {
    const reason = editForm.reason || "admin action";
    const updated = await updateUser(user.id, { status, reason });
    replaceRow(updated);
    setStatusMessage(
      status === "active"
        ? copy.users.actions.restored
        : status === "disabled"
          ? copy.users.actions.disabled
          : copy.users.actions.deleted,
    );
  };

  const handleBulk = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedIds.length === 0) {
      setStatusMessage(copy.users.actions.selectFirst);
      return;
    }
    const result = await bulkUsers({
      userIds: selectedIds,
      operation: bulkForm.operation,
      ...(bulkForm.operation === "update_entitlements"
        ? {
            role: bulkForm.role,
            tier: bulkForm.tier,
            features: bulkForm.features,
          }
        : {}),
      reason: bulkForm.reason || "admin bulk action",
    });
    const refreshed = await fetchUsers();
    setRows(refreshed);
    setSelectedIds([]);
    setActivePanel(undefined);
    setStatusMessage(copy.users.actions.bulkDone(result.updatedUserIds.length));
  };

  const replaceRow = (nextUser: AdminUserRowDto) => {
    setRows((currentRows) =>
      currentRows.map((user) => (user.id === nextUser.id ? nextUser : user)),
    );
    setSelectedUserId(nextUser.id);
  };

  const toggleSelected = (userId: string) => {
    setSelectedIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  };

  const setSelectedFeatures = (
    features: AdminCommercialFeatureDto[],
    value: AdminCommercialFeatureDto,
    checked: boolean,
  ) => checked
    ? [...features.filter((feature) => feature !== value), value]
    : features.filter((feature) => feature !== value);

  return (
    <div className="space-y-5">
      {(isLoading || loadError) && (
        <section className="border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-600">
          {isLoading ? "Loading commercial users" : loadError}
        </section>
      )}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label={copy.users.metricsAriaLabel}>
        <Metric title={copy.users.metrics.activeUsers} value={activeUsers} detail={copy.users.metrics.disabled(disabledUsers)} tone="emerald" />
        <Metric title={copy.users.metrics.availableCredits} value={totalAvailable} detail={copy.users.metrics.frozen(totalFrozen)} tone="cyan" />
        <Metric title={copy.users.metrics.redeemedBatches} value={totalRedeemedBatches} detail={copy.users.metrics.campaignSignal} tone="amber" />
        <Metric title={copy.users.metrics.failedTasks} value={totalFailedTasks} detail={copy.users.metrics.supportReview} tone="rose" />
      </section>

      <section className="border border-slate-200 bg-white">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <UserCog className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-black text-slate-950">{copy.users.title}</h2>
              <p className="text-xs font-semibold text-slate-500">{copy.users.description}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs font-bold text-slate-500">{copy.users.tracked(rows.length)}</div>
            <button
              type="button"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-slate-950 px-3 text-xs font-black text-white"
              onClick={() => setActivePanel("create")}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {copy.users.actions.create}
            </button>
            <button
              type="button"
              className="admin-secondary-button"
              onClick={() => setActivePanel("bulk")}
            >
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
              {copy.users.actions.bulkTitle}
            </button>
            <button
              type="button"
              className="admin-secondary-button"
              onClick={() => setActivePanel("credits")}
            >
              <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
              {copy.users.creditAdjustment.title}
            </button>
          </div>
        </div>
        <div className="grid gap-3 border-b border-slate-200 px-4 py-3 md:grid-cols-[minmax(220px,1fr)_160px_160px_auto]">
          <Field label={copy.users.filters.search}>
            <input
              className="admin-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="alice@example.test"
            />
          </Field>
          <Field label={copy.users.filters.status}>
            <select className="admin-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">{copy.users.filters.allStatuses}</option>
              <option value="active">{copy.status.active}</option>
              <option value="disabled">{copy.status.disabled}</option>
              <option value="deleted">deleted</option>
            </select>
          </Field>
          <Field label={copy.users.filters.role}>
            <select className="admin-input" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
              <option value="all">{copy.users.filters.allRoles}</option>
              {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
          </Field>
          <div className="flex items-end text-xs font-black text-slate-500">
            {copy.users.actions.selected(selectedIds.length)}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1320px] text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.13em] text-slate-500">
              <tr>
                <th className="px-4 py-2 font-black">{copy.users.columns.select}</th>
                <th className="px-4 py-2 font-black">{copy.users.columns.email}</th>
                <th className="px-4 py-2 font-black">{copy.users.columns.status}</th>
                <th className="px-4 py-2 font-black">{copy.users.columns.role}</th>
                <th className="px-4 py-2 font-black">{copy.users.columns.tier}</th>
                <th className="px-4 py-2 font-black">{copy.users.columns.features}</th>
                <th className="px-4 py-2 font-black">{copy.users.columns.available}</th>
                <th className="px-4 py-2 font-black">{copy.users.columns.frozen}</th>
                <th className="px-4 py-2 font-black">{copy.users.columns.redeemedBatches}</th>
                <th className="px-4 py-2 font-black">{copy.users.columns.tasks}</th>
                <th className="px-4 py-2 font-black">{copy.users.columns.completed}</th>
                <th className="px-4 py-2 font-black">{copy.users.columns.failed}</th>
                <th className="px-4 py-2 font-black">{copy.users.columns.recentActivity}</th>
                <th className="px-4 py-2 font-black">{copy.users.columns.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleRows.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${user.email}`}
                      checked={selectedIds.includes(user.id)}
                      onChange={() => toggleSelected(user.id)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-black text-slate-950">{user.email}</div>
                    <div className="mt-1 font-mono text-[10px] text-slate-400">{user.id}</div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={user.status} copy={copy} />
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-700">{user.role ?? "user"}</td>
                  <td className="px-4 py-3 font-mono font-black text-slate-950">{user.tier}</td>
                  <td className="max-w-48 px-4 py-3 text-slate-600">{formatFeatures(user.features)}</td>
                  <td className="px-4 py-3 font-mono font-black text-emerald-700">{user.availableCredits}</td>
                  <td className="px-4 py-3 font-mono text-amber-700">{user.frozenCredits}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">{user.redeemedBatchCount}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">{user.taskCount}</td>
                  <td className="px-4 py-3 font-mono text-emerald-700">{user.completedTaskCount}</td>
                  <td className="px-4 py-3 font-mono text-rose-700">{user.failedTaskCount}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(user.recentActivityAt ?? user.lastLoginAt ?? user.createdAt, copy)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button type="button" className="admin-secondary-button" onClick={() => {
                        setSelectedUserId(user.id);
                        setEditForm({
                          role: user.role ?? "user",
                          tier: user.tier,
                          features: user.features ?? [],
                          creditAdjustmentAmount: 0,
                          reason: "",
                        });
                        setActivePanel("edit");
                      }}>
                        <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                        {copy.users.actions.edit}
                      </button>
                      <button type="button" className="admin-secondary-button" onClick={() => void handleUserStatus(user, user.status === "active" ? "disabled" : "active")}>
                        <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                        {user.status === "active" ? copy.users.actions.disable : copy.users.actions.restore}
                      </button>
                      <button type="button" className="admin-danger-button" onClick={() => void handleUserStatus(user, "deleted")}>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        {copy.users.actions.delete}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={14} className="px-4 py-8 text-center text-xs font-bold text-slate-500">
                    {copy.users.empty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {statusMessage && (
          <div className="border-t border-slate-200 px-4 py-3 text-xs font-bold text-slate-500">
            {statusMessage}
          </div>
        )}
      </section>

      <section className="border border-slate-200 bg-white">
          <div className="flex min-h-12 items-center justify-between border-b border-slate-200 px-4">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-slate-500" aria-hidden="true" />
              <h2 className="text-sm font-black text-slate-950">{copy.users.activity.title}</h2>
            </div>
            <span className="rounded-sm bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
              {copy.users.activity.masked}
            </span>
          </div>
          <div className="grid gap-3 p-4 md:grid-cols-3">
            <ActivityCell label={copy.users.activity.lastActivity} value={formatDateTime(selectedUser?.recentActivityAt, copy)} />
            <ActivityCell label={copy.users.activity.activeTasks} value={selectedUser?.activeTaskCount ?? 0} />
            <ActivityCell label={copy.users.activity.failureRatio} value={formatRatio(selectedUser?.failedTaskCount ?? 0, selectedUser?.taskCount ?? 0)} />
          </div>
          <div className="border-t border-slate-200 p-4">
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{copy.users.activity.notice}</span>
            </div>
          </div>
      </section>

      <UserActionDrawer
        panel={activePanel}
        copy={copy}
        rows={rows}
        selectedUser={selectedUser}
        selectedUserId={selectedUserId}
        selectedIds={selectedIds}
        adjustment={adjustment}
        createForm={createForm}
        editForm={editForm}
        bulkForm={bulkForm}
        statusMessage={statusMessage}
        setAdjustment={setAdjustment}
        setCreateForm={setCreateForm}
        setEditForm={setEditForm}
        setBulkForm={setBulkForm}
        setSelectedUserId={setSelectedUserId}
        setActivePanel={setActivePanel}
        setSelectedFeatures={setSelectedFeatures}
        handleCreateUser={handleCreateUser}
        handleSaveEdit={handleSaveEdit}
        handleBulk={handleBulk}
        handleAdjustCredits={handleAdjustCredits}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-xs font-black text-slate-700">
      <span>{label}</span>
      {children}
    </label>
  );
}

interface UserActionDrawerProps {
  panel: UserPanel | undefined;
  copy: AdminCopy;
  rows: AdminUserRowDto[];
  selectedUser: AdminUserRowDto | undefined;
  selectedUserId: string;
  selectedIds: string[];
  adjustment: {
    amount: number;
    idempotencyKey: string;
    reason: string;
  };
  createForm: {
    email: string;
    password: string;
    role: NonNullable<AdminUserRowDto["role"]>;
    tier: AdminUserTierDto;
    features: AdminCommercialFeatureDto[];
    initialCredits: number;
    reason: string;
  };
  editForm: {
    role: NonNullable<AdminUserRowDto["role"]>;
    tier: AdminUserTierDto;
    features: AdminCommercialFeatureDto[];
    creditAdjustmentAmount: number;
    reason: string;
  };
  bulkForm: {
    operation: AdminBulkUsersInputDto["operation"];
    role: NonNullable<AdminUserRowDto["role"]>;
    tier: AdminUserTierDto;
    features: AdminCommercialFeatureDto[];
    reason: string;
  };
  statusMessage: string;
  setAdjustment: (value: UserActionDrawerProps["adjustment"]) => void;
  setCreateForm: (value: UserActionDrawerProps["createForm"]) => void;
  setEditForm: (value: UserActionDrawerProps["editForm"]) => void;
  setBulkForm: (value: UserActionDrawerProps["bulkForm"]) => void;
  setSelectedUserId: (userId: string) => void;
  setActivePanel: (panel: UserPanel | undefined) => void;
  setSelectedFeatures: (
    features: AdminCommercialFeatureDto[],
    value: AdminCommercialFeatureDto,
    checked: boolean,
  ) => AdminCommercialFeatureDto[];
  handleCreateUser: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  handleSaveEdit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  handleBulk: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  handleAdjustCredits: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

function UserActionDrawer({
  panel,
  copy,
  rows,
  selectedUser,
  selectedUserId,
  selectedIds,
  adjustment,
  createForm,
  editForm,
  bulkForm,
  statusMessage,
  setAdjustment,
  setCreateForm,
  setEditForm,
  setBulkForm,
  setSelectedUserId,
  setActivePanel,
  setSelectedFeatures,
  handleCreateUser,
  handleSaveEdit,
  handleBulk,
  handleAdjustCredits,
}: UserActionDrawerProps) {
  if (panel === undefined) {
    return null;
  }

  const title = {
    create: copy.users.actions.create,
    edit: copy.users.actions.edit,
    bulk: copy.users.actions.bulkTitle,
    credits: copy.users.creditAdjustment.title,
  }[panel];

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/30">
      <aside className="flex h-full w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl">
        <div className="flex min-h-14 items-center justify-between border-b border-slate-200 px-5">
          <div>
            <div className="text-sm font-black text-slate-950">{title}</div>
            {panel === "bulk" && (
              <div className="mt-1 text-xs font-bold text-slate-500">
                {copy.users.actions.selected(selectedIds.length)}
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label="Close user action panel"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            onClick={() => setActivePanel(undefined)}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {panel === "create" && (
            <form onSubmit={(event) => void handleCreateUser(event)} className="grid gap-4">
              <Field label={copy.users.form.email}>
                <input name="create-email" className="admin-input" value={createForm.email} onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })} />
              </Field>
              <Field label={copy.users.form.password}>
                <input name="create-password" className="admin-input" type="password" value={createForm.password} onChange={(event) => setCreateForm({ ...createForm, password: event.target.value })} />
              </Field>
              <RoleTierFields
                copy={copy}
                role={createForm.role}
                tier={createForm.tier}
                onRole={(role) => setCreateForm({ ...createForm, role })}
                onTier={(tier) => setCreateForm({ ...createForm, tier })}
              />
              <FeatureCheckboxes
                copy={copy}
                selected={createForm.features}
                onChange={(feature, checked) => setCreateForm({
                  ...createForm,
                  features: setSelectedFeatures(createForm.features, feature, checked),
                })}
              />
              <Field label={copy.users.form.initialCredits}>
                <input className="admin-input" type="number" value={createForm.initialCredits} onChange={(event) => setCreateForm({ ...createForm, initialCredits: Number(event.target.value) })} />
              </Field>
              <Field label={copy.users.form.reason}>
                <textarea className="admin-input min-h-20" value={createForm.reason} onChange={(event) => setCreateForm({ ...createForm, reason: event.target.value })} />
              </Field>
              <DrawerSubmitButton>{copy.users.actions.create}</DrawerSubmitButton>
            </form>
          )}

          {panel === "edit" && (
            <form onSubmit={(event) => void handleSaveEdit(event)} className="grid gap-4">
              <Field label={copy.users.creditAdjustment.targetUser}>
                <select
                  className="admin-input"
                  value={selectedUser?.id ?? selectedUserId}
                  onChange={(event) => {
                    const nextUser = rows.find((user) => user.id === event.target.value);
                    setSelectedUserId(event.target.value);
                    if (nextUser) {
                      setEditForm({
                        role: nextUser.role ?? "user",
                        tier: nextUser.tier,
                        features: nextUser.features ?? [],
                        creditAdjustmentAmount: 0,
                        reason: editForm.reason,
                      });
                    }
                  }}
                >
                  {rows.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}
                </select>
              </Field>
              <RoleTierFields
                copy={copy}
                role={editForm.role}
                tier={editForm.tier}
                onRole={(role) => setEditForm({ ...editForm, role })}
                onTier={(tier) => setEditForm({ ...editForm, tier })}
              />
              <FeatureCheckboxes
                copy={copy}
                selected={editForm.features}
                onChange={(feature, checked) => setEditForm({
                  ...editForm,
                  features: setSelectedFeatures(editForm.features, feature, checked),
                })}
              />
              <div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                <div>
                  <div className="text-xs font-black text-slate-950">{copy.users.creditAdjustment.title}</div>
                  <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{copy.users.creditAdjustment.positiveNegative}</p>
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  <ActivityCell label={copy.users.creditAdjustment.currentAvailable} value={selectedUser?.availableCredits ?? 0} />
                  <ActivityCell label={copy.users.creditAdjustment.frozenContext} value={selectedUser?.frozenCredits ?? 0} />
                  <ActivityCell label={copy.users.creditAdjustment.projectedAvailable} value={(selectedUser?.availableCredits ?? 0) + editForm.creditAdjustmentAmount} />
                </div>
                <Field label={copy.users.creditAdjustment.amount}>
                  <input
                    name="edit-credit-adjustment"
                    className="admin-input"
                    type="number"
                    value={editForm.creditAdjustmentAmount}
                    onChange={(event) => setEditForm({ ...editForm, creditAdjustmentAmount: Number(event.target.value) })}
                  />
                </Field>
              </div>
              <Field label={copy.users.form.reason}>
                <textarea className="admin-input min-h-20" value={editForm.reason} onChange={(event) => setEditForm({ ...editForm, reason: event.target.value })} />
              </Field>
              <DrawerSubmitButton>{copy.users.actions.saveEdit}</DrawerSubmitButton>
            </form>
          )}

          {panel === "bulk" && (
            <form onSubmit={(event) => void handleBulk(event)} className="grid gap-4">
              <Field label={copy.users.actions.bulkOperation}>
                <select name="bulk-operation" className="admin-input" value={bulkForm.operation} onChange={(event) => setBulkForm({ ...bulkForm, operation: event.target.value as AdminBulkUsersInputDto["operation"] })}>
                  <option value="disable">{copy.users.actions.disable}</option>
                  <option value="restore">{copy.users.actions.restore}</option>
                  <option value="delete">{copy.users.actions.delete}</option>
                  <option value="update_entitlements">{copy.users.actions.saveEdit}</option>
                </select>
              </Field>
              {bulkForm.operation === "update_entitlements" && (
                <>
                  <RoleTierFields
                    copy={copy}
                    role={bulkForm.role}
                    tier={bulkForm.tier}
                    onRole={(role) => setBulkForm({ ...bulkForm, role })}
                    onTier={(tier) => setBulkForm({ ...bulkForm, tier })}
                  />
                  <FeatureCheckboxes
                    copy={copy}
                    selected={bulkForm.features}
                    onChange={(feature, checked) => setBulkForm({
                      ...bulkForm,
                      features: setSelectedFeatures(bulkForm.features, feature, checked),
                    })}
                  />
                </>
              )}
              <Field label={copy.users.actions.bulkReason}>
                <textarea className="admin-input min-h-20" value={bulkForm.reason} onChange={(event) => setBulkForm({ ...bulkForm, reason: event.target.value })} />
              </Field>
              <DrawerSubmitButton>{copy.users.actions.applyBulk}</DrawerSubmitButton>
            </form>
          )}

          {panel === "credits" && (
            <form onSubmit={(event) => void handleAdjustCredits(event)} className="grid gap-4">
              <div className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold leading-5 text-slate-600">{copy.users.creditAdjustment.explanation}</p>
                <p className="text-xs font-semibold leading-5 text-slate-600">{copy.users.creditAdjustment.positiveNegative}</p>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                <ActivityCell label={copy.users.creditAdjustment.currentAvailable} value={selectedUser?.availableCredits ?? 0} />
                <ActivityCell label={copy.users.creditAdjustment.frozenContext} value={selectedUser?.frozenCredits ?? 0} />
                <ActivityCell label={copy.users.creditAdjustment.projectedAvailable} value={(selectedUser?.availableCredits ?? 0) + adjustment.amount} />
              </div>
              <Field label={copy.users.creditAdjustment.targetUser}>
                <select
                  className="admin-input"
                  value={selectedUser?.id ?? selectedUserId}
                  onChange={(event) => setSelectedUserId(event.target.value)}
                >
                  {rows.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.email}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label={copy.users.creditAdjustment.amount}>
                  <input
                    className="admin-input"
                    type="number"
                    value={adjustment.amount}
                    onChange={(event) => setAdjustment({ ...adjustment, amount: Number(event.target.value) })}
                  />
                </Field>
                <Field label={copy.users.creditAdjustment.idempotencyKey}>
                  <input
                    className="admin-input"
                    value={adjustment.idempotencyKey}
                    onChange={(event) => setAdjustment({ ...adjustment, idempotencyKey: event.target.value })}
                    placeholder={copy.users.creditAdjustment.autoGenerated}
                  />
                </Field>
              </div>
              <Field label={copy.users.creditAdjustment.reason}>
                <textarea
                  className="admin-input min-h-24"
                  value={adjustment.reason}
                  onChange={(event) => setAdjustment({ ...adjustment, reason: event.target.value })}
                  placeholder="Paid support grant, refund, migration correction..."
                />
              </Field>
              <DrawerSubmitButton>{copy.users.creditAdjustment.submit}</DrawerSubmitButton>
              {statusMessage && <p className="text-xs font-bold text-slate-500">{statusMessage}</p>}
            </form>
          )}
        </div>
      </aside>
    </div>
  );
}

function DrawerSubmitButton({ children }: { children: ReactNode }) {
  return (
    <button type="submit" className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-slate-950 px-4 text-xs font-black text-white">
      {children}
    </button>
  );
}

function Metric({
  title,
  value,
  detail,
  tone,
}: {
  title: string;
  value: string | number;
  detail: string;
  tone: "emerald" | "cyan" | "amber" | "rose";
}) {
  const toneClass = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-950",
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-950",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    rose: "border-rose-200 bg-rose-50 text-rose-950",
  }[tone];
  return (
    <div className={`min-h-24 border p-4 ${toneClass}`}>
      <div className="text-[10px] font-black uppercase tracking-[0.14em] opacity-60">{title}</div>
      <div className="mt-3 font-mono text-2xl font-black tracking-tight">{value}</div>
      <div className="mt-2 text-xs font-semibold opacity-70">{detail}</div>
    </div>
  );
}

function RoleTierFields({
  copy,
  role,
  tier,
  onRole,
  onTier,
}: {
  copy: AdminCopy;
  role: NonNullable<AdminUserRowDto["role"]>;
  tier: AdminUserTierDto;
  onRole: (role: NonNullable<AdminUserRowDto["role"]>) => void;
  onTier: (tier: AdminUserTierDto) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label={copy.users.form.role}>
        <select name="edit-role" className="admin-input" value={role} onChange={(event) => onRole(event.target.value as NonNullable<AdminUserRowDto["role"]>)}>
          {ROLES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </Field>
      <Field label={copy.users.form.tier}>
        <select name="edit-tier" className="admin-input" value={tier} onChange={(event) => onTier(event.target.value as AdminUserTierDto)}>
          {TIERS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </Field>
    </div>
  );
}

function FeatureCheckboxes({
  copy,
  selected,
  onChange,
}: {
  copy: AdminCopy;
  selected: AdminCommercialFeatureDto[];
  onChange: (feature: AdminCommercialFeatureDto, checked: boolean) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-xs font-black text-slate-700">{copy.users.form.features}</legend>
      <div className="grid gap-2 md:grid-cols-2">
        {FEATURES.map((feature) => (
          <label key={feature} className="flex min-h-8 items-center gap-2 text-xs font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={selected.includes(feature)}
              onChange={(event) => onChange(feature, event.target.checked)}
            />
            <span>{feature}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function StatusBadge({ status, copy }: { status: AdminUserRowDto["status"]; copy: AdminCopy }) {
  const className =
    status === "active"
      ? "bg-emerald-50 text-emerald-700"
      : status === "deleted"
        ? "bg-slate-100 text-slate-500"
        : "bg-rose-50 text-rose-700";
  return (
    <span className={`rounded-sm px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${className}`}>
      {copy.status[status]}
    </span>
  );
}

function ActivityCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-slate-200 bg-slate-50 p-3">
      <div className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">{label}</div>
      <div className="mt-2 font-mono text-sm font-black text-slate-950">{value}</div>
    </div>
  );
}

function formatDateTime(value: string | undefined, copy: AdminCopy): string {
  return value === undefined ? copy.common.none : value.replace("T", " ").slice(0, 16);
}

function formatRatio(numerator: number, denominator: number): string {
  if (denominator === 0) {
    return "0.00%";
  }
  return `${((numerator / denominator) * 100).toFixed(2)}%`;
}

function formatFeatures(features: AdminCommercialFeatureDto[] | undefined): string {
  return features && features.length > 0 ? features.join(", ") : "-";
}
