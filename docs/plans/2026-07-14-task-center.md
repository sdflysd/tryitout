# User Task Center Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a signed-in user task center that lists recent commercial simulation tasks and lets users view progress, retry recoverable tasks, cancel active tasks, and open completed reports.

**Architecture:** Add a user-scoped commercial task list API that reuses the existing task progress decoration. Add a typed frontend client helper, then render a dedicated task list component on the home page. Wire row actions into the existing progress, resume, cancel, and report flows rather than creating a second task runner.

**Tech Stack:** Express, React, TypeScript, Node test runner, commercial task repository, existing durable simulation task client helpers.

---

### Task 1: Add User Task List API Contract And Handler

**Files:**
- Modify: `frontend/src/contracts/simulation-task.ts`
- Modify: `frontend/src/server/commercial/commercial-api.ts`
- Test: `frontend/src/server/commercial/commercial-api.test.ts`

**Step 1: Write failing contract/API tests**

Add tests that create tasks for two users and assert the list endpoint only returns the authenticated user's tasks.

```ts
test("commercial task list endpoint returns only the current user's tasks", async () => {
  const deps = createCommercialApiTestDeps();
  const userOne = await createSignedInUser(deps, "one@example.com");
  const userTwo = await createSignedInUser(deps, "two@example.com");

  await deps.repository.saveCommercialTask(makeCommercialTask({
    id: "task_user_1",
    userId: userOne.user.id,
    status: "queued",
    createdAt: "2026-07-14T08:00:00.000Z",
    updatedAt: "2026-07-14T08:00:00.000Z",
  }));
  await deps.repository.saveCommercialTask(makeCommercialTask({
    id: "task_user_2",
    userId: userTwo.user.id,
    status: "queued",
  }));

  const result = await handleListCommercialTasksRequest(
    request({ cookie: userOne.cookie }),
    deps,
  );

  assert.equal(result.status, 200);
  assert.deepEqual(
    "tasks" in result.body ? result.body.tasks.map((task) => task.id) : [],
    ["task_user_1"],
  );
});
```

Add a second test for ordering and progress decoration:

```ts
test("commercial task list endpoint decorates progress and sorts newest first", async () => {
  // Arrange two current-user tasks with different updatedAt values.
  // Add a latest step run to one task.
  // Assert the newest task appears first and exposes progressPercent/currentStepName.
});
```

Run:

```bash
npm --prefix frontend test -- src/server/commercial/commercial-api.test.ts
```

Expected: FAIL because `handleListCommercialTasksRequest` does not exist.

**Step 2: Add the response type**

In `frontend/src/contracts/simulation-task.ts`, add:

```ts
export interface SimulationTaskListResponse {
  tasks: SimulationTaskStatusResponse[];
}
```

**Step 3: Implement the commercial handler**

In `frontend/src/server/commercial/commercial-api.ts`, add:

```ts
export async function handleListCommercialTasksRequest(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<CommercialApiResult<{ tasks: CommercialSimulationTaskStatusDto[] } | CommercialApiErrorBody>> {
  const auth = await requireUser(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }

  try {
    const tasks = await deps.repository.listCommercialTasks(auth.user.id);
    const sorted = [...tasks].sort(compareCommercialTasksForUserList);
    return {
      status: 200,
      body: {
        tasks: await Promise.all(
          sorted.map((task) => decorateTaskProgress(task, deps.repository)),
        ),
      },
    };
  } catch (error) {
    return mapTaskError(error);
  }
}
```

Add a local sorter near the other helper functions:

```ts
function compareCommercialTasksForUserList(
  left: CommercialSimulationTaskRecord,
  right: CommercialSimulationTaskRecord,
): number {
  const leftTime = left.updatedAt || left.createdAt;
  const rightTime = right.updatedAt || right.createdAt;
  if (leftTime !== rightTime) {
    return rightTime.localeCompare(leftTime);
  }
  return right.id.localeCompare(left.id);
}
```

**Step 4: Run targeted tests**

Run:

```bash
npm --prefix frontend test -- src/server/commercial/commercial-api.test.ts
```

Expected: PASS for the new task-list tests.

**Step 5: Commit**

```bash
git add frontend/src/contracts/simulation-task.ts frontend/src/server/commercial/commercial-api.ts frontend/src/server/commercial/commercial-api.test.ts
git commit -m "feat: add commercial task list api"
```

### Task 2: Register The GET Route

**Files:**
- Modify: `frontend/server.ts`
- Test: `frontend/src/server/server-api-routing.test.ts`

**Step 1: Write failing route coverage**

Update the routing test to assert the server source includes `GET /api/simulation-tasks` and still includes the existing `POST /api/simulation-tasks`.

```ts
assert.match(serverSource, /app\.get\("\/api\/simulation-tasks"/);
assert.match(serverSource, /app\.post\("\/api\/simulation-tasks"/);
```

Run:

```bash
npm --prefix frontend test -- src/server/server-api-routing.test.ts
```

Expected: FAIL because the GET route is missing.

**Step 2: Register the route**

In `frontend/server.ts`, import `handleListCommercialTasksRequest` from `commercial-api.ts`.

Add this route before or near the existing POST route:

```ts
app.get("/api/simulation-tasks", async (req, res) => {
  if (resolveSimulationTaskRouteMode(process.env) !== "commercial_task") {
    return res.status(404).json({
      error: "Commercial task listing is unavailable",
      code: "commercial_task_listing_unavailable",
    });
  }
  if (!commercialServices.enabled) {
    return res.status(503).json({
      error: "Commercial services are unavailable",
      code: "commercial_services_unavailable",
    });
  }
  const result = await handleListCommercialTasksRequest(
    toCommercialRequest(req),
    commercialServices,
  );
  sendCommercialApiResult(res, result);
});
```

**Step 3: Run targeted routing test**

Run:

```bash
npm --prefix frontend test -- src/server/server-api-routing.test.ts
```

Expected: PASS.

**Step 4: Commit**

```bash
git add frontend/server.ts frontend/src/server/server-api-routing.test.ts
git commit -m "feat: expose user simulation task list route"
```

### Task 3: Add Frontend Task List Client

**Files:**
- Modify: `frontend/src/simulation-tasks.ts`
- Test: `frontend/src/simulation-tasks.test.ts`

**Step 1: Write failing client tests**

Add a test for the request:

```ts
test("fetchSimulationTasks reads the current user's task list", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return jsonResponse({
      tasks: [
        {
          id: "task_1",
          scenarioType: "side_hustle",
          interactionMode: "enabled",
          status: "recoverable_failed",
          progressPercent: 42,
          recoverable: true,
          updatedAt: "2026-07-14T08:00:00.000Z",
        },
      ],
    });
  };

  const result = await fetchSimulationTasks(fetchImpl as typeof fetch);

  assert.equal(calls[0]?.url, "/api/simulation-tasks");
  assert.equal(calls[0]?.init?.credentials, "include");
  assert.equal(result[0]?.simulationId, "task_1");
  assert.equal(result[0]?.status, "recoverable_failed");
});
```

Run:

```bash
npm --prefix frontend test -- src/simulation-tasks.test.ts
```

Expected: FAIL because `fetchSimulationTasks` does not exist.

**Step 2: Implement the client helper**

In `frontend/src/simulation-tasks.ts`, import `SimulationTaskListResponse` and add:

```ts
export async function fetchSimulationTasks(
  fetchImpl: typeof fetch = fetch,
): Promise<SimulationTaskStatusResponse[]> {
  const body = await readJsonResponse<unknown>(
    await fetchImpl("/api/simulation-tasks", {
      credentials: "include",
    }),
  );

  return normalizeSimulationTaskListResponse(body).tasks;
}
```

Add a normalizer near the existing task normalizers:

```ts
function normalizeSimulationTaskListResponse(
  body: unknown,
): SimulationTaskListResponse {
  if (!isObject(body) || !Array.isArray(body.tasks)) {
    return { tasks: [] };
  }
  return {
    tasks: body.tasks
      .filter((task) => isObject(task))
      .map((task) => normalizeSimulationTaskStatusResponse({ task })),
  };
}
```

**Step 3: Run targeted tests**

Run:

```bash
npm --prefix frontend test -- src/simulation-tasks.test.ts
```

Expected: PASS.

**Step 4: Commit**

```bash
git add frontend/src/simulation-tasks.ts frontend/src/simulation-tasks.test.ts
git commit -m "feat: add simulation task list client"
```

### Task 4: Build Task Center Component

**Files:**
- Create: `frontend/src/components/TaskCenter.tsx`
- Create or modify: `frontend/src/components/TaskCenter.test.tsx`

**Step 1: Write failing component tests**

Add static render tests for row visibility and actions:

```tsx
test("TaskCenter renders retry actions for queued and recoverable tasks", () => {
  const html = renderToStaticMarkup(
    <TaskCenter
      tasks={[
        makeTask({ simulationId: "queued_1", status: "queued" }),
        makeTask({ simulationId: "recoverable_1", status: "recoverable_failed", recoverable: true }),
      ]}
      language="zh-CN"
      onViewProgress={() => undefined}
      onRetry={() => undefined}
      onCancel={() => undefined}
      onViewReport={() => undefined}
    />,
  );

  assert.match(html, /我的任务/);
  assert.match(html, /task-center-row-queued_1/);
  assert.match(html, /btn-task-retry-queued_1/);
  assert.match(html, /btn-task-retry-recoverable_1/);
});
```

Add a test that completed tasks expose view-report and running tasks expose cancel.

Run:

```bash
npm --prefix frontend test -- src/components/TaskCenter.test.tsx
```

Expected: FAIL because the component does not exist.

**Step 2: Implement the component**

Create `frontend/src/components/TaskCenter.tsx`.

Use this prop shape:

```ts
interface TaskCenterProps {
  tasks: SimulationTaskStatusResponse[];
  language?: Language;
  isLoading?: boolean;
  error?: string;
  onRefresh?: () => void;
  onViewProgress: (task: SimulationTaskStatusResponse) => void;
  onRetry: (task: SimulationTaskStatusResponse) => void;
  onCancel: (task: SimulationTaskStatusResponse) => void;
  onViewReport: (task: SimulationTaskStatusResponse) => void;
}
```

Implementation rules:

- Return `null` when there are no tasks, no error, and not loading.
- Use stable row ids: `task-center-row-${task.simulationId}`.
- Use button ids:
  - `btn-task-progress-${task.simulationId}`
  - `btn-task-retry-${task.simulationId}`
  - `btn-task-cancel-${task.simulationId}`
  - `btn-task-report-${task.simulationId}`
- Use compact status copy, not long instructions.
- Use lucide icons for buttons.
- Keep controls stable in size with fixed icon button dimensions or compact text buttons.

**Step 3: Run targeted component tests**

Run:

```bash
npm --prefix frontend test -- src/components/TaskCenter.test.tsx
```

Expected: PASS.

**Step 4: Commit**

```bash
git add frontend/src/components/TaskCenter.tsx frontend/src/components/TaskCenter.test.tsx
git commit -m "feat: add user task center component"
```

### Task 5: Wire Task Center Into App And Home

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/HomeView.tsx`
- Test: `frontend/src/App.test.tsx`
- Test: `frontend/src/components/HomeView.test.tsx`

**Step 1: Write failing HomeView test**

Update `HomeView` tests to pass a small task list and assert the task center is rendered.

```tsx
const html = renderToStaticMarkup(
  <HomeView
    onStart={() => undefined}
    onSelectHistory={() => undefined}
    historyList={[]}
    onSelectTemplate={() => undefined}
    commercialTasks={[makeTask({ simulationId: "task_1", status: "queued" })]}
    onTaskViewProgress={() => undefined}
    onTaskRetry={() => undefined}
    onTaskCancel={() => undefined}
    onTaskViewReport={() => undefined}
  />,
);

assert.match(html, /task-center-row-task_1/);
```

Run:

```bash
npm --prefix frontend test -- src/components/HomeView.test.tsx
```

Expected: FAIL because `HomeView` does not accept task props.

**Step 2: Add App task state and refresh helper**

In `frontend/src/App.tsx`, import:

```ts
fetchSimulationTasks,
getSimulationTaskReport,
type SimulationTaskStatusResponse,
```

Add state:

```ts
const [commercialTasks, setCommercialTasks] = useState<SimulationTaskStatusResponse[]>([]);
const [commercialTasksLoading, setCommercialTasksLoading] = useState(false);
const [commercialTasksError, setCommercialTasksError] = useState("");
```

Add:

```ts
const refreshCommercialTasks = async () => {
  if (!commercialUser) {
    setCommercialTasks([]);
    return;
  }
  setCommercialTasksLoading(true);
  setCommercialTasksError("");
  try {
    setCommercialTasks(await fetchSimulationTasks());
  } catch (error) {
    setCommercialTasksError(error instanceof Error ? error.message : String(error));
  } finally {
    setCommercialTasksLoading(false);
  }
};
```

Call it from a `useEffect` when `commercialUser?.id` changes.

**Step 3: Add action handlers**

Add handlers:

- `handleViewTaskProgress(task)`: set selected type, attached id, progress event, elapsed start, generating view, then call `watchSimulationTaskUntilComplete`.
- `handleRetryTask(task)`: set `recoverableSimulationId`, then reuse `handleResumeSimulation`; refresh list after the promise settles.
- `handleCancelTaskFromList(task)`: call `cancelSimulationTask(task.simulationId)`, refresh list, and clear progress if it was attached.
- `handleViewTaskReport(task)`: call `getSimulationTaskReport(task.simulationId)`, set `currentSimulation` from the returned report, save to history, and show report view.

When reusing `watchSimulationTaskUntilComplete`, preserve the existing completion and failure handlers so progress behavior stays consistent.

**Step 4: Pass props through HomeView**

In `frontend/src/components/HomeView.tsx`, add task props and render:

```tsx
<TaskCenter
  tasks={commercialTasks}
  language={language}
  isLoading={commercialTasksLoading}
  error={commercialTasksError}
  onRefresh={onRefreshCommercialTasks}
  onViewProgress={onTaskViewProgress}
  onRetry={onTaskRetry}
  onCancel={onTaskCancel}
  onViewReport={onTaskViewReport}
/>
```

Place it before local history so backend task recovery is easier to find.

**Step 5: Run targeted tests**

Run:

```bash
npm --prefix frontend test -- src/components/HomeView.test.tsx src/App.test.tsx
```

Expected: PASS.

**Step 6: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/HomeView.tsx frontend/src/App.test.tsx frontend/src/components/HomeView.test.tsx
git commit -m "feat: wire task center into home"
```

### Task 6: Final Verification

**Files:**
- All touched files

**Step 1: Run lint**

Run:

```bash
npm --prefix frontend run lint
```

Expected: PASS with `tsc --noEmit`.

**Step 2: Run full test suite**

Run:

```bash
npm --prefix frontend test
```

Expected: PASS with zero failures.

**Step 3: Optional local smoke check**

If the dev server and worker are already running, use command-line health checks only unless the user explicitly approves browser automation:

```bash
Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/health
```

Expected: response body includes `{"status":"ok"}`.

**Step 4: Commit any final fixes**

If verification required fixes:

```bash
git add <fixed-files>
git commit -m "fix: stabilize task center"
```

If no fixes were required, do not create an empty commit.
