# TryItOut Frontend

This folder contains the React app, Express server, AI gateway, simulation engine, and tests for TryItOut.

For product context, screenshots, and repository-level setup, see the root [`README.md`](../README.md).

Chinese documentation is available at [`README.zh-CN.md`](../README.zh-CN.md). Current versions of this repository use a non-commercial source license; commercial use requires separate written authorization.

## Local Development

```bash
npm install
cp .env.example .env
npm run dev
```

Set at least one provider key in `.env` before running real simulations:

```bash
AI_PROVIDER="gemini"
GEMINI_API_KEY="your_api_key"
```

Supported provider modes:

- `gemini`
- `anthropic`
- `openai_compatible`

## Scripts

```bash
npm run dev      # Start the local app server
npm run lint     # Type-check
npm test         # Run tests
npm run build    # Build frontend and server
npm start        # Run built server
```

## Agent Runtime

The default runtime uses the faster staged simulation path. To enable deep agent interactions, configure a provider key and set:

```bash
ENABLE_AGENT_INTERACTION_MODE="true"
```

Deep mode makes extra AI calls for world events, agent actions, votes, arbitration, and memory. It can take longer and cost more than the default path.

## Safety

Do not commit `.env`, debug traces, local logs, generated model output, or raw user inputs. See the root `SECURITY.md` for details.
