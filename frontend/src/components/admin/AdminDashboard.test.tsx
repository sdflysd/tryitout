import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import AdminDashboard from "./AdminDashboard.js";

test("admin dashboard renders Chinese operations sections", () => {
  const html = renderToStaticMarkup(
    <AdminDashboard
      adminEmail="admin@tryitout.ai"
      initialData={{
        overview: {
          activeUsers: 2,
          creditsHeld: 3,
          openTasks: 1,
          feedbackCount: 4,
        },
        users: [
          { id: "user_1", email: "user@tryitout.ai", status: "正常", balance: 10, tier: "基础版" },
        ],
        accessCodes: [
          { id: "code_1", maskedCode: "TIO-ABCD-****-WXYZ", status: "可用", credits: 10, tier: "基础版" },
        ],
        tasks: [
          { id: "task_1", userEmail: "user@tryitout.ai", status: "排队中", scenario: "副业", creditCost: 1 },
        ],
        feedback: [
          { id: "feedback_1", userEmail: "user@tryitout.ai", rating: 5, useful: true, text: "有帮助" },
        ],
        auditLogs: [
          { id: "audit_1", action: "积分调整", target: "user_1", actor: "admin@tryitout.ai" },
        ],
      }}
    />,
  );

  assert.match(html, /商用后台/);
  assert.match(html, /admin@tryitout.ai/);
  assert.match(html, /概览/);
  assert.match(html, /用户/);
  assert.match(html, /兑换码/);
  assert.match(html, /任务/);
  assert.match(html, /反馈/);
  assert.match(html, /设置/);
  assert.match(html, /审计日志/);
  assert.match(html, /活跃用户/);
  assert.match(html, /TIO-ABCD-\*\*\*\*-WXYZ/);
  assert.match(html, /有帮助/);
  assert.match(html, /admin-dashboard-root/);
  assert.doesNotMatch(html, /Commercial Admin/);
  assert.doesNotMatch(html, /Operations data placeholder/);
  assert.doesNotMatch(html, /Live controls connect/);
});

test("admin dashboard exposes clickable live operation controls", () => {
  const html = renderToStaticMarkup(<AdminDashboard />);

  assert.match(html, /role="tablist"/);
  assert.match(html, /aria-controls="admin-panel-users"/);
  assert.match(html, /生成兑换码/);
  assert.match(html, /批量生成/);
  assert.match(html, /禁用兑换码/);
  assert.match(html, /调整积分/);
  assert.match(html, /刷新数据/);
  assert.match(html, /用户邮箱/);
  assert.match(html, /状态/);
  assert.match(html, /余额/);
  assert.match(html, /操作/);
  assert.match(html, /设置键/);
  assert.match(html, /JSON 值/);
  assert.match(html, /保存设置/);
});
