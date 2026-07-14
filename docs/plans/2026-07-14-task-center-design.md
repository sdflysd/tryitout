# User Task Center Design

## Goal

Give signed-in commercial users a durable place to find their recent simulation tasks, recover from worker or model failures, and return to completed reports. The first release focuses on visibility and recovery, not unrestricted parallel execution.

## Background

The app currently has two separate task surfaces:

- `fetchActiveSimulationTask()` returns one queued, running, or recoverable task.
- Local history stores completed reports in `money_simulator_history`.

That leaves a bad gap for users who start more than one task, refresh the page, or hit a recoverable failure. The backend already stores commercial tasks durably, but the user-facing app does not expose a task list.

## User Experience

- Add a `My tasks` section near the home history area.
- Load recent user tasks from the backend after sign-in.
- Show each task with scenario type, status, progress percent, queued or updated time, and a short status message.
- Keep local report history for now, but visually separate it from backend tasks.
- Use actions by status:
  - `queued`: view progress, retry, cancel.
  - `running`: view progress, cancel.
  - `recoverable_failed`: retry, cancel.
  - `completed`: view report.
  - `failed` and `cancelled`: show final status without automatic retry in this first pass.
- After retrying or cancelling, refresh the task list and attach the selected task to the existing progress view.

## Product Boundary

This release should not encourage unlimited concurrent task creation. Users may see multiple recent tasks and recover old ones, but the primary workflow still guides them to one active task at a time. True multi-task launching, queue priority controls, batch actions, and quota policy changes should be handled as a later design.

## API And Data

- Add a user-scoped commercial task list endpoint.
- The endpoint must require the same user auth as task status and report endpoints.
- It returns only tasks owned by the current user.
- Response items should reuse the decorated task status DTO shape where practical, including progress fields.
- Default sort should be newest updated or created task first.
- The frontend client adds `fetchSimulationTasks()`.
- The existing active task endpoint remains available for attach-on-load behavior.

## Frontend Shape

- Add a small task list component rather than expanding `SimulationProgress`.
- Keep row actions icon or short-label based and stable in width.
- Reuse existing resume, cancel, watch, and report client helpers where possible.
- When a user chooses `View progress`, set the current attached commercial task id and enter the generating view.
- When a user chooses `View report`, fetch the report and open the current report view.

## Error Handling

- If the list request fails, show a compact recoverable message in the task section and leave the rest of the homepage usable.
- If retry fails because workers are unavailable, keep the row visible and show the returned error message.
- If a report is not ready for a completed task, show a transient message and keep the task in the list.
- Do not freeze additional credits when retrying an existing queued or recoverable task.

## Testing

- Add commercial API tests for the user task list endpoint:
  - requires auth,
  - returns only the current user's tasks,
  - includes progress decoration,
  - preserves useful ordering.
- Add client tests for `fetchSimulationTasks()`.
- Add static render tests for the task list rows and status actions.
- Add App-level tests for retry or view-progress wiring if existing test utilities make that practical.
- Run `npm --prefix frontend run lint` and `npm --prefix frontend test`.
