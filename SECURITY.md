# Security

TryItOut uses AI provider API keys and can process sensitive user scenarios. Please treat local inputs, prompts, and generated traces as private.

## Do Not Commit

- `.env` or provider API keys.
- Raw chat logs, relationship details, career/finance details, or user-identifying inputs.
- `output/agent-debug/*.jsonl` or other prompt/response traces.
- Runtime logs that may include request payloads.
- Commercial `passwordHash`, `codeHash`, session token hashes, provider API keys, encrypted secret payloads, or access-code raw values.
- Access-code creation/export payloads after the handoff window has ended.

## Commercial Mode Boundaries

Commercial deployments must use Postgres and Redis, keep `ENABLE_AGENT_DEBUG_LOGS=false`, and follow [`docs/operations/commercial-platform-runbook.md`](docs/operations/commercial-platform-runbook.md).

Access-code raw values may appear only in creation-time responses or explicit safe exports. Stored records must use hashes and masks. BYOK provider keys must be encrypted at rest and returned only as masked DTOs. Admin-sensitive actions must be auditable and must not expose raw prompts, passwords, hashes, provider secrets, or raw access codes.

## Reporting Issues

If you find a security issue, please open a private report through GitHub Security Advisories if available, or contact the repository owner directly. Avoid posting secrets, raw user inputs, or exploit details in public issues.

## Responsible Use

Simulation results are only decision-support content. They are not financial, legal, medical, psychological, career, or relationship advice.
