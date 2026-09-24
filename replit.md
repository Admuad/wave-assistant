# Wave Assistant

Wave Assistant monitors the live Drips Stellar Wave issue board, ranks issues against a contributor profile, tracks deliberate applications, and sends Telegram alerts when a tracked issue is assigned.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/wave-assistant/src/App.tsx` — dashboard, profile, and Telegram settings UI
- `artifacts/api-server/src/routes/wave.ts` — live Drips feed mapping, application tracking, assignment checks, and Telegram delivery
- `lib/api-spec/openapi.yaml` — API contract source of truth
- `lib/db/src/schema/wave.ts` — persisted profile, issue cache, applications, activity, and notification settings

## Architecture decisions

- Applications are never submitted automatically; the UI opens the Drips issue for human review and only tracks the user's intent after explicit confirmation.
- Issue discovery reads the public Wave API and uses the user's saved GitHub username to detect assignments on tracked issues.
- Telegram delivery uses the workspace secret `TELEGRAM_BOT_TOKEN`; the token is never stored in the database or sent to the browser.
- The initial app is single-contributor by design; account authentication and multi-user isolation should be added before sharing publicly.

## Product

- Live Wave 9 overview with application room, issue count, reward budget, and assignment count
- Searchable and sortable open-issue board with profile-based match scores
- Manual-review flow that opens the Drips issue and records tracked applications
- Contributor profile preferences for skills, repositories, reward floor, and organization guardrails
- Telegram assignment alerts with a test-message action

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The Drips live issue feed includes assigned issues in its open-state response, so the API filters assigned issues out of the default open-only view.
- The app must not be turned into blind auto-apply automation; Drips rules require reviewing issue scope and checking assignment state.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
