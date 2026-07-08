import { useEffect, useState, type FormEvent } from "react";
import {
  Activity,
  ClipboardList,
  Gauge,
  KeyRound,
  MessageSquareText,
  RefreshCw,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  adjustAdminCredits,
  createAdminAccessCode,
  createAdminAccessCodeBatch,
  disableAdminAccessCode,
  getAdminDashboardSummary,
  updateAdminSystemSetting,
  type AdminDashboardSummary,
  type CreatedAdminAccessCode,
} from "../../commercial-client";

interface AdminDashboardProps {
  adminEmail?: string;
  initialData?: AdminDashboardSummary;
}

type AdminTab = "overview" | "users" | "codes" | "tasks" | "feedback" | "settings" | "audit";

const EMPTY_DASHBOARD: AdminDashboardSummary = {
  overview: {
    activeUsers: 0,
    creditsHeld: 0,
    openTasks: 0,
    feedbackCount: 0,
  },
  users: [],
  accessCodes: [],
  tasks: [],
  feedback: [],
  auditLogs: [],
};

const ADMIN_TABS: Array<{ id: AdminTab; label: string; icon: typeof Gauge }> = [
  { id: "overview", label: "概览", icon: Gauge },
  { id: "users", label: "用户", icon: Users },
  { id: "codes", label: "兑换码", icon: KeyRound },
  { id: "tasks", label: "任务", icon: ClipboardList },
  { id: "feedback", label: "反馈", icon: MessageSquareText },
  { id: "settings", label: "设置", icon: Settings },
  { id: "audit", label: "审计日志", icon: ScrollText },
];

export default function AdminDashboard({ adminEmail, initialData }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [dashboard, setDashboard] = useState<AdminDashboardSummary>(initialData ?? EMPTY_DASHBOARD);
  const [message, setMessage] = useState("");
  const [createdCodes, setCreatedCodes] = useState<CreatedAdminAccessCode[]>([]);
  const [codeCredits, setCodeCredits] = useState(10);
  const [batchCount, setBatchCount] = useState(3);
  const [disableCodeId, setDisableCodeId] = useState("");
  const [disableReason, setDisableReason] = useState("本机测试禁用");
  const [adjustUserId, setAdjustUserId] = useState("");
  const [adjustAmount, setAdjustAmount] = useState(10);
  const [adjustReason, setAdjustReason] = useState("本机测试赠送");
  const [settingKey, setSettingKey] = useState("max_weighted_concurrency");
  const [settingJsonValue, setSettingJsonValue] = useState('{"value":6}');

  useEffect(() => {
    let cancelled = false;
    void refreshDashboard({ silent: true });

    async function refreshDashboard({ silent }: { silent: boolean }) {
      try {
        const result = await getAdminDashboardSummary();
        if (cancelled) return;
        setDashboard(result);
        if (!silent) {
          setMessage("后台数据已刷新。");
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "后台数据加载失败");
        }
      }
    }

    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = async () => {
    try {
      setDashboard(await getAdminDashboardSummary());
      setMessage("后台数据已刷新。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "后台数据加载失败");
    }
  };

  const handleCreateCode = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const result = await createAdminAccessCode({ creditAmount: codeCredits, tier: "basic", features: [] });
      setCreatedCodes([result.accessCode]);
      setMessage("兑换码已生成，原始码只显示这一次。");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "生成兑换码失败");
    }
  };

  const handleBatchCreate = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const result = await createAdminAccessCodeBatch({
        count: batchCount,
        creditAmount: codeCredits,
        tier: "basic",
        features: [],
      });
      setCreatedCodes(result.accessCodes);
      setMessage("批量兑换码已生成，原始码只显示这一次。");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "批量生成失败");
    }
  };

  const handleDisableCode = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await disableAdminAccessCode(disableCodeId, disableReason);
      setMessage("兑换码已禁用。");
      setDisableCodeId("");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "禁用兑换码失败");
    }
  };

  const handleAdjustCredits = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const result = await adjustAdminCredits({
        userId: adjustUserId,
        amount: adjustAmount,
        reason: adjustReason,
      });
      setMessage(`积分已调整，当前余额 ${result.balance}。`);
      setAdjustUserId("");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "调整积分失败");
    }
  };

  const handleSaveSetting = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const parsedValue = JSON.parse(settingJsonValue) as unknown;
      if (!isJsonObject(parsedValue)) {
        setMessage("设置值必须是 JSON 对象。");
        return;
      }
      await updateAdminSystemSetting({ key: settingKey, value: parsedValue });
      setMessage("设置已保存，并已写入审计日志。");
      await refresh();
    } catch (error) {
      setMessage(error instanceof SyntaxError ? "JSON 格式不正确。" : error instanceof Error ? error.message : "保存设置失败");
    }
  };

  return (
    <section
      id="admin-dashboard-root"
      className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 text-slate-100"
      aria-label="商用后台"
    >
      <div className="flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-black uppercase text-emerald-200">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <span>管理员操作台</span>
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-normal text-white">商用后台</h1>
          <p className="mt-1 text-sm font-semibold text-white/60">
            {adminEmail ?? "需要管理员会话"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="inline-flex min-h-10 w-fit items-center gap-2 rounded-md border border-emerald-300/30 bg-emerald-300/10 px-3 text-xs font-black text-emerald-100 transition-colors hover:bg-emerald-300/16"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          <span>刷新数据</span>
        </button>
      </div>

      <nav className="flex gap-2 overflow-x-auto border-b border-white/10 pb-2" role="tablist" aria-label="后台分区">
        {ADMIN_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            aria-controls={`admin-panel-${id}`}
            onClick={() => setActiveTab(id)}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border px-3 text-xs font-black transition-colors ${
              activeTab === id
                ? "border-emerald-300/40 bg-emerald-300/12 text-emerald-100"
                : "border-white/10 bg-white/6 text-white/64 hover:bg-white/10"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {message && (
        <div className="rounded-md border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs font-bold text-amber-100" aria-live="polite">
          {message}
        </div>
      )}

      <section className="grid gap-3 rounded-md border border-white/10 bg-white/5 p-3 lg:grid-cols-4" aria-label="快捷操作">
        <form onSubmit={handleCreateCode} className="min-w-0">
          <h2 className="text-sm font-black text-white">生成兑换码</h2>
          <LabeledInput
            label="积分"
            type="number"
            value={String(codeCredits)}
            onChange={(value) => setCodeCredits(Number(value))}
            placeholder="10"
          />
          <button type="submit" className="mt-3 min-h-10 rounded-md bg-emerald-400 px-3 text-xs font-black text-emerald-950">
            生成兑换码
          </button>
        </form>
        <form onSubmit={handleBatchCreate} className="min-w-0">
          <h2 className="text-sm font-black text-white">批量生成</h2>
          <LabeledInput
            label="数量"
            type="number"
            value={String(batchCount)}
            onChange={(value) => setBatchCount(Number(value))}
            placeholder="3"
          />
          <button type="submit" className="mt-3 min-h-10 rounded-md bg-cyan-300 px-3 text-xs font-black text-slate-950">
            批量生成
          </button>
        </form>
        <form onSubmit={handleDisableCode} className="min-w-0">
          <h2 className="text-sm font-black text-white">禁用兑换码</h2>
          <LabeledInput label="兑换码 ID" value={disableCodeId} onChange={setDisableCodeId} placeholder="code_xxx" />
          <button type="submit" className="mt-3 min-h-10 rounded-md bg-rose-300 px-3 text-xs font-black text-rose-950">
            禁用兑换码
          </button>
        </form>
        <form onSubmit={handleAdjustCredits} className="min-w-0">
          <h2 className="text-sm font-black text-white">调整积分</h2>
          <LabeledInput label="用户 ID" value={adjustUserId} onChange={setAdjustUserId} placeholder="user_xxx" />
          <button type="submit" className="mt-3 min-h-10 rounded-md bg-amber-300 px-3 text-xs font-black text-slate-950">
            调整积分
          </button>
        </form>
      </section>

      <div id="admin-panel-overview" role="tabpanel" hidden={activeTab !== "overview"}>
        <OverviewPanel dashboard={dashboard} />
      </div>
      <div id="admin-panel-users" role="tabpanel" hidden={activeTab !== "users"}>
          <UsersPanel
            dashboard={dashboard}
            adjustUserId={adjustUserId}
            adjustAmount={adjustAmount}
            adjustReason={adjustReason}
            onAdjustUserIdChange={setAdjustUserId}
            onAdjustAmountChange={setAdjustAmount}
            onAdjustReasonChange={setAdjustReason}
            onSubmit={handleAdjustCredits}
          />
      </div>
      <div id="admin-panel-codes" role="tabpanel" hidden={activeTab !== "codes"}>
          <AccessCodesPanel
            dashboard={dashboard}
            createdCodes={createdCodes}
            codeCredits={codeCredits}
            batchCount={batchCount}
            disableCodeId={disableCodeId}
            disableReason={disableReason}
            onCodeCreditsChange={setCodeCredits}
            onBatchCountChange={setBatchCount}
            onDisableCodeIdChange={setDisableCodeId}
            onDisableReasonChange={setDisableReason}
            onCreateCode={handleCreateCode}
            onBatchCreate={handleBatchCreate}
            onDisableCode={handleDisableCode}
          />
      </div>
      <div id="admin-panel-tasks" role="tabpanel" hidden={activeTab !== "tasks"}>
        <TasksPanel dashboard={dashboard} />
      </div>
      <div id="admin-panel-feedback" role="tabpanel" hidden={activeTab !== "feedback"}>
        <FeedbackPanel dashboard={dashboard} />
      </div>
      <div id="admin-panel-settings" role="tabpanel" hidden={activeTab !== "settings"}>
          <SettingsPanel
            settingKey={settingKey}
            settingJsonValue={settingJsonValue}
            onSettingKeyChange={setSettingKey}
            onSettingJsonValueChange={setSettingJsonValue}
            onSubmit={handleSaveSetting}
          />
      </div>
      <div id="admin-panel-audit" role="tabpanel" hidden={activeTab !== "audit"}>
        <AuditPanel dashboard={dashboard} />
      </div>
    </section>
  );
}

function OverviewPanel({ dashboard }: { dashboard: AdminDashboardSummary }) {
  const metrics = [
    { label: "活跃用户", value: dashboard.overview.activeUsers, hint: "未禁用账号" },
    { label: "冻结积分", value: dashboard.overview.creditsHeld, hint: "排队/运行任务占用" },
    { label: "进行中任务", value: dashboard.overview.openTasks, hint: "队列实时状态" },
    { label: "反馈数量", value: dashboard.overview.feedbackCount, hint: "报告反馈" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4" aria-label="后台概览指标">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-md border border-white/10 bg-white/7 p-3">
            <div className="text-xs font-bold text-white/56">{metric.label}</div>
            <div className="mt-1 text-2xl font-black text-white">{metric.value}</div>
            <div className="mt-1 text-xs font-semibold text-emerald-200/80">{metric.hint}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <DataTable
          title="用户"
          columns={["用户邮箱", "状态", "余额", "版本"]}
          rows={dashboard.users.slice(0, 5).map((user) => [user.email, user.status, String(user.balance), user.tier])}
          emptyText="暂无用户数据"
        />
        <DataTable
          title="兑换码"
          columns={["兑换码", "状态", "积分", "版本"]}
          rows={dashboard.accessCodes.slice(0, 5).map((code) => [
            code.maskedCode,
            code.status,
            String(code.credits),
            code.tier,
          ])}
          emptyText="暂无兑换码"
        />
        <DataTable
          title="任务"
          columns={["任务 ID", "用户", "状态", "场景"]}
          rows={dashboard.tasks.slice(0, 5).map((task) => [task.id, task.userEmail, task.status, task.scenario])}
          emptyText="暂无任务"
        />
        <DataTable
          title="反馈"
          columns={["用户", "评分", "是否有用", "内容"]}
          rows={dashboard.feedback.slice(0, 5).map((feedback) => [
            feedback.userEmail,
            String(feedback.rating),
            feedback.useful ? "有帮助" : "无帮助",
            feedback.text || "--",
          ])}
          emptyText="暂无反馈"
        />
        <DataTable
          title="审计日志"
          columns={["动作", "目标", "操作人"]}
          rows={dashboard.auditLogs.slice(0, 5).map((entry) => [entry.action, entry.target, entry.actor])}
          emptyText="暂无审计日志"
        />
      </div>
    </div>
  );
}

function UsersPanel(props: {
  dashboard: AdminDashboardSummary;
  adjustUserId: string;
  adjustAmount: number;
  adjustReason: string;
  onAdjustUserIdChange: (value: string) => void;
  onAdjustAmountChange: (value: number) => void;
  onAdjustReasonChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <DataTable
        title="用户"
        columns={["用户邮箱", "状态", "余额", "版本"]}
        rows={props.dashboard.users.map((user) => [user.email, user.status, String(user.balance), user.tier])}
        emptyText="暂无用户数据"
      />
      <form onSubmit={props.onSubmit} className="rounded-md border border-white/10 bg-white/6 p-3">
        <h2 className="text-sm font-black text-white">调整积分</h2>
        <LabeledInput label="用户 ID" value={props.adjustUserId} onChange={props.onAdjustUserIdChange} placeholder="user_xxx" />
        <LabeledInput
          label="调整数量"
          type="number"
          value={String(props.adjustAmount)}
          onChange={(value) => props.onAdjustAmountChange(Number(value))}
          placeholder="10"
        />
        <LabeledInput label="原因" value={props.adjustReason} onChange={props.onAdjustReasonChange} placeholder="本机测试赠送" />
        <button type="submit" className="mt-3 min-h-10 rounded-md bg-emerald-400 px-3 text-xs font-black text-emerald-950">
          调整积分
        </button>
      </form>
    </div>
  );
}

function AccessCodesPanel(props: {
  dashboard: AdminDashboardSummary;
  createdCodes: CreatedAdminAccessCode[];
  codeCredits: number;
  batchCount: number;
  disableCodeId: string;
  disableReason: string;
  onCodeCreditsChange: (value: number) => void;
  onBatchCountChange: (value: number) => void;
  onDisableCodeIdChange: (value: string) => void;
  onDisableReasonChange: (value: string) => void;
  onCreateCode: (event: FormEvent) => void;
  onBatchCreate: (event: FormEvent) => void;
  onDisableCode: (event: FormEvent) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-4">
        <DataTable
          title="兑换码"
          columns={["兑换码", "状态", "积分", "版本", "操作"]}
          rows={props.dashboard.accessCodes.map((code) => [
            code.maskedCode,
            code.status,
            String(code.credits),
            code.tier,
            "禁用兑换码",
          ])}
          emptyText="暂无兑换码"
        />
        {props.createdCodes.length > 0 && (
          <div className="rounded-md border border-amber-300/30 bg-amber-300/10 p-3">
            <h3 className="text-sm font-black text-amber-100">新生成原始码，只显示一次</h3>
            <ul className="mt-2 space-y-1 text-xs font-mono text-amber-50">
              {props.createdCodes.map((code) => (
                <li key={code.accessCodeId}>{code.rawCode}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="grid gap-3">
        <form onSubmit={props.onCreateCode} className="rounded-md border border-white/10 bg-white/6 p-3">
          <h2 className="text-sm font-black text-white">生成兑换码</h2>
          <LabeledInput
            label="积分"
            type="number"
            value={String(props.codeCredits)}
            onChange={(value) => props.onCodeCreditsChange(Number(value))}
            placeholder="10"
          />
          <button type="submit" className="mt-3 min-h-10 rounded-md bg-emerald-400 px-3 text-xs font-black text-emerald-950">
            生成兑换码
          </button>
        </form>
        <form onSubmit={props.onBatchCreate} className="rounded-md border border-white/10 bg-white/6 p-3">
          <h2 className="text-sm font-black text-white">批量生成</h2>
          <LabeledInput
            label="数量"
            type="number"
            value={String(props.batchCount)}
            onChange={(value) => props.onBatchCountChange(Number(value))}
            placeholder="3"
          />
          <button type="submit" className="mt-3 min-h-10 rounded-md bg-cyan-300 px-3 text-xs font-black text-slate-950">
            批量生成
          </button>
        </form>
        <form onSubmit={props.onDisableCode} className="rounded-md border border-white/10 bg-white/6 p-3">
          <h2 className="text-sm font-black text-white">禁用兑换码</h2>
          <LabeledInput label="兑换码 ID" value={props.disableCodeId} onChange={props.onDisableCodeIdChange} placeholder="code_xxx" />
          <LabeledInput label="原因" value={props.disableReason} onChange={props.onDisableReasonChange} placeholder="泄露或作废" />
          <button type="submit" className="mt-3 min-h-10 rounded-md bg-rose-300 px-3 text-xs font-black text-rose-950">
            禁用兑换码
          </button>
        </form>
      </div>
    </div>
  );
}

function TasksPanel({ dashboard }: { dashboard: AdminDashboardSummary }) {
  return (
    <DataTable
      title="任务"
      columns={["任务 ID", "用户", "状态", "场景", "积分消耗"]}
      rows={dashboard.tasks.map((task) => [task.id, task.userEmail, task.status, task.scenario, String(task.creditCost)])}
      emptyText="暂无任务"
    />
  );
}

function FeedbackPanel({ dashboard }: { dashboard: AdminDashboardSummary }) {
  return (
    <DataTable
      title="反馈"
      columns={["用户", "评分", "是否有用", "内容"]}
      rows={dashboard.feedback.map((feedback) => [
        feedback.userEmail,
        String(feedback.rating),
        feedback.useful ? "有帮助" : "无帮助",
        feedback.text || "--",
      ])}
      emptyText="暂无反馈"
    />
  );
}

function SettingsPanel({
  settingKey,
  settingJsonValue,
  onSettingKeyChange,
  onSettingJsonValueChange,
  onSubmit,
}: {
  settingKey: string;
  settingJsonValue: string;
  onSettingKeyChange: (value: string) => void;
  onSettingJsonValueChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="grid gap-4 rounded-md border border-white/10 bg-white/6 p-3 lg:grid-cols-[0.8fr_1.2fr]">
      <div>
        <h2 className="text-sm font-black text-white">设置</h2>
        <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-white/64">
          <Activity className="h-4 w-4 text-emerald-200" aria-hidden="true" />
          <span>保存后由服务端写入 system_settings，并记录管理员审计日志。</span>
        </div>
        <LabeledInput
          label="设置键"
          value={settingKey}
          onChange={onSettingKeyChange}
          placeholder="max_weighted_concurrency"
        />
      </div>
      <label className="block text-xs font-bold text-white/70">
        <span>JSON 值</span>
        <textarea
          value={settingJsonValue}
          onChange={(event) => onSettingJsonValueChange(event.target.value)}
          placeholder='{"value":6}'
          className="mt-1 min-h-28 w-full rounded-md border border-white/12 bg-white px-3 py-2 font-mono text-xs font-semibold text-slate-950 placeholder:text-slate-400"
        />
        <button type="submit" className="mt-3 min-h-10 rounded-md bg-emerald-400 px-3 text-xs font-black text-emerald-950">
          保存设置
        </button>
      </label>
    </form>
  );
}

function AuditPanel({ dashboard }: { dashboard: AdminDashboardSummary }) {
  return (
    <DataTable
      title="审计日志"
      columns={["动作", "目标", "操作人"]}
      rows={dashboard.auditLogs.map((entry) => [entry.action, entry.target, entry.actor])}
      emptyText="暂无审计日志"
    />
  );
}

function DataTable({
  title,
  columns,
  rows,
  emptyText,
}: {
  title: string;
  columns: string[];
  rows: string[][];
  emptyText: string;
}) {
  return (
    <section className="min-w-0">
      <h2 className="mb-2 text-sm font-black text-white">{title}</h2>
      <div className="overflow-x-auto rounded-md border border-white/10">
        <table className="min-w-full border-collapse text-left text-xs">
          <thead className="bg-white/10 text-white/70">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-3 py-2 font-black">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/8 bg-white/5 text-white/62">
            {rows.length > 0 ? rows.map((row, rowIndex) => (
              <tr key={`${title}-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`${title}-${rowIndex}-${cellIndex}`} className="px-3 py-3">{cell}</td>
                ))}
              </tr>
            )) : (
              <tr>
                <td className="px-3 py-3" colSpan={columns.length}>{emptyText}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <label className="mt-3 block text-xs font-bold text-white/70">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 h-10 w-full rounded-md border border-white/12 bg-white px-3 text-xs font-semibold text-slate-950 placeholder:text-slate-400"
      />
    </label>
  );
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
