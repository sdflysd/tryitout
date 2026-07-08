# TryItOut / 试一下

> Simulate before you decide.

[中文说明](README.zh-CN.md) | [Commercial licensing](COMMERCIAL-LICENSE.md)

TryItOut is a multi-agent decision sandbox for side-hustle ideas, dating conversations, and major life choices. Instead of asking one AI for advice, you drop a real situation into a small simulated world, let a team of role-based AI agents pressure-test it from different incentives and viewpoints, then get a practical report with next steps.

![TryItOut desktop home](docs/assets/desktop-home-lifeform-starmap.png)

## Why It Exists

Most AI advice tools follow the same pattern:

```text
user asks -> AI gives advice
```

TryItOut experiments with a different flow:

```text
user describes a choice -> AI builds a small world -> agents pressure-test it -> report explains what may happen next
```

The goal is not to predict the future. The goal is to make assumptions, risks, hidden costs, and possible next actions easier to see before you act.

## Scenarios

- **Side Hustle Sandbox**: test an idea against target customers, competitors, platform traffic, execution limits, cash flow, and risk review.
- **Dating Conversation Sandbox**: simulate replies, emotional boundaries, timing, possible misunderstandings, and relationship risk.
- **Life Choice Sandbox**: compare options such as exams vs work, big city vs hometown, resigning vs staying, or stable job vs upside.

## Agent Capabilities

TryItOut is built around agent collaboration rather than single-response prompting:

- **Scenario-aware agent teams**: each sandbox activates roles that match the decision, such as customers, competitors, execution coaches, risk auditors, emotional boundary observers, or route evaluators.
- **Structured disagreement**: agents inspect the same situation from different goals and constraints, exposing weak assumptions, hidden costs, second-order risks, and overlooked upside.
- **Deep interaction runtime**: optional deep mode adds world events, agent actions, votes, arbitration, memory, and cross-agent validation for richer simulations.
- **Explainable synthesis**: the final report turns agent debate into route comparisons, risk/opportunity summaries, regret analysis, and a concrete 7-day action plan.
- **Provider-flexible orchestration**: the AI gateway supports Gemini, Anthropic, and OpenAI-compatible providers, so agent workflows are not tied to a single model vendor.

## Highlights

- Multi-agent simulation engine with scenario-specific role cards, activation, composition, and safety checks.
- Fast staged simulation mode for local MVP usage, plus optional deep agent interaction mode.
- Agent collaboration primitives: world events, actions, votes, arbitration, memory, validation, and cost logging.
- Streaming progress UI for long-running simulations.
- Report page with risk, opportunity, route comparison, and 7-day action plan.
- Share-card workflow for result screenshots.
- Provider abstraction for Gemini, Anthropic, and OpenAI-compatible APIs.
- 300+ automated tests covering prompts, UI copy, server flows, task runners, validation, and cost logging.

## Screenshots

| Home | Mobile | Live Collaboration |
| --- | --- | --- |
| ![Home](docs/assets/desktop-home-lifeform-starmap.png) | ![Mobile home](docs/assets/mobile-home-lifeform-starmap.png) | ![Progress](docs/assets/desktop-progress-active-collaboration.png) |

## Tech Stack

- React 19
- Vite
- TypeScript
- Tailwind CSS
- Express
- Motion
- Gemini API, Anthropic API, and OpenAI-compatible provider support
- Node test runner via `tsx --test`

## Repository Layout

```text
.
├── frontend/                 # React app and Express server
│   ├── src/components/        # Product UI and report views
│   ├── src/server/            # Simulation engine, AI gateway, validation APIs
│   ├── src/contracts/         # Shared task contracts
│   └── package.json
├── docs/
│   ├── assets/                # Curated README screenshots
│   └── plans/                 # Design and implementation notes
├── COMMERCIAL-LICENSE.md      # Commercial licensing terms
├── LICENSE                    # Current non-commercial source license
├── README.zh-CN.md
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- At least one AI provider key

### Install

```bash
cd frontend
npm install
cp .env.example .env
```

Edit `frontend/.env` and set one provider:

```bash
AI_PROVIDER="gemini"
GEMINI_API_KEY="your_api_key"
```

For Anthropic:

```bash
AI_PROVIDER="anthropic"
ANTHROPIC_API_KEY="your_api_key"
```

For an OpenAI-compatible endpoint:

```bash
AI_PROVIDER="openai_compatible"
OPENAI_COMPATIBLE_API_KEY="your_api_key"
OPENAI_COMPATIBLE_BASE_URL="https://api.openai.com/v1"
OPENAI_COMPATIBLE_MODEL_FAST="gpt-4o-mini"
OPENAI_COMPATIBLE_MODEL_BALANCED="gpt-4o"
OPENAI_COMPATIBLE_MODEL_DEEP="gpt-4o"
```

### Run Locally

```bash
npm run dev
```

The app starts from `frontend/server.ts` and serves both the API and Vite-powered frontend during development.

### Optional Deep Agent Mode

Deep mode makes extra model calls for world events, agent actions, voting, arbitration, and memory. It is more expensive and slower than the default staged simulation path.

```bash
ENABLE_AGENT_INTERACTION_MODE="true"
```

### Commercial MVP Mode

Commercial mode is the paid path, not the in-memory demo path. Accounts, server sessions, access-code credits, paid tasks, reports, feedback, analytics, settings, and audit logs must use Postgres; queue execution must use Redis/BullMQ.

Enable both server and client flags:

```bash
COMMERCIAL_MODE_ENABLED="true"
VITE_COMMERCIAL_MODE_ENABLED="true"
```

Required external services and secrets:

```bash
DATABASE_URL="postgres://tryitout:tryitout@localhost:5432/tryitout"
REDIS_URL="redis://localhost:6379"
SESSION_SECRET="long-random-secret"
ACCESS_CODE_PEPPER="long-random-pepper"
USER_SECRET_ENCRYPTION_KEY="$(openssl rand -base64 32)"
```

Run migrations from `frontend/db/migrations/` in filename order; see [`frontend/db/README.md`](frontend/db/README.md). Commercial startup fails when required env vars are missing.

Paid task creation requires a server-side session, sufficient credits, and a transactional credit hold. When `COMMERCIAL_MODE_ENABLED=true`, legacy unauthenticated simulation entry points are rejected or routed through commercial task handlers so credits cannot be bypassed.

Queue and pricing controls:

```bash
MAX_WEIGHTED_CONCURRENCY="6"
PLATFORM_LEGACY_CREDIT_COST="1"
PLATFORM_DEEP_CREDIT_COST="3"
BYOK_LEGACY_CREDIT_COST="1"
BYOK_DEEP_CREDIT_COST="2"
```

BYOK custom model providers require the `custom_model_provider` entitlement. User API keys are AES-GCM encrypted with `USER_SECRET_ENCRYPTION_KEY`; provider URLs must be HTTPS, explicitly allowed, and blocked from localhost, private networks, link-local ranges, metadata IPs, and unsafe redirects.

## Scripts

Run from `frontend/`:

```bash
npm run dev      # Start local app server
npm run lint     # Type-check with tsc
npm test         # Run test suite
npm run build    # Build frontend and bundled server
npm start        # Run built server
```

## Verification Snapshot

Current local checks:

- `npm run lint` passes.
- `npm test` passes; the commercial MVP branch expands coverage to 400+ tests.
- `npm run build` passes. Vite currently warns that the main JS chunk is larger than 500 kB; that is a known optimization target, not a release blocker.

## Privacy And Safety

Do not commit:

- `.env` files or API keys.
- Raw user inputs, chat logs, career/finance details, or private relationship context.
- `output/agent-debug/*.jsonl` prompt and model traces.
- Local logs or generated runtime output.

Generated content is for simulation and decision support only. It is not financial, legal, medical, psychological, career, or relationship advice.

## Roadmap

- Cleaner deployment guide.
- Demo mode with deterministic mock data.
- More provider-specific setup notes.
- Report export and better share images.
- More scenario templates.
- Bundle splitting and frontend performance pass.
- Optional persistence backend beyond local JSON/file storage.

## License

Current versions of TryItOut are **not MIT licensed**.

This repository is released under the [TryItOut Non-Commercial Source License](LICENSE). You may use it for personal study, research, evaluation, education, and non-commercial experimentation. Commercial use requires a separate written commercial license from the copyright holder.

Commercial use includes SaaS, paid reports, paid subscriptions, client delivery, agency or consulting work, private business deployment, white-labeling, resale, lead generation, or any revenue-related use. See [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md) for commercial authorization terms.
