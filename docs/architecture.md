# Sim2Skill architecture (platform v2)

## Runtime

- **Client:** React 18 + Vite, three.js r128 for the 3D lab rooms, a 2D SVG bench for chemistry.
- **Server:** one Node HTTP handler, `createPlatformHandler(directory)` in `server/platform.mjs`, mounted as Vite middleware in development and preview, and by `server/start.mjs` for the built app. A small router (`server/router.mjs`) dispatches to modules in `server/routes/`.
- **Storage:** SQLite through Node's built-in `node:sqlite` (`server/db.mjs`).
  - *Why not better-sqlite3:* it needs a native build or a prebuilt download, which fails on Windows machines without build tools or behind TLS-inspecting networks. `node:sqlite` ships with Node 22.13+ and includes FTS5, which the RAG retriever needs. It is still marked experimental, so the server hides that one warning.
- **LLM:** Google Gemini through LangChain.js, server-side only (`server/llm/`). The browser never sees the key.

## Request pipeline

1. Same-origin check for every non-GET request.
2. Route match, then body read with a per-route size limit: 24 KB by default, 200 KB for builder routes, raw body for webhooks.
3. Session lookup by SHA-256 of the cookie token.
4. Handler. Errors become `{ error }` with the right status; 402 responses carry `upgrade: true`.

## Access control

One rule decides who sees a lab, written once as SQL (`VISIBLE_SQL`) and once as code (`labAccess`):

- A lab is visible if it is published, not taken down, and any of these is true: it is public, the viewer is the author, or the viewer has a `lab_grants` row.
- Owners and admins always see their labs.
- A private lab without a grant returns 403 with `locked: true` and no title.

Lists, search, profiles, notifications, practice, Nour and the RAG retriever all use this rule.

## Schema

| Table | Purpose |
| --- | --- |
| `users` | Account, scrypt `salt`/`hash`, `is_admin` (moderation only), `created_at` (trial start) |
| `sessions` | `token_hash` (SHA-256), `user_id`, `expires_at` |
| `labs` | `engine`, `template`, teaching text, `config` (JSON), `status` draft/published, `visibility` public/private, `builtin`, `taken_down`, `version`, `first_published_at` |
| `lab_versions` | Frozen JSON snapshot per published version |
| `progress` | Per user and lab: attempts, last bench and diagnosis, `solved_at`, `lab_version` |
| `reports` | User reports for moderation |
| `lab_access` | scrypt hash of a private lab's access code |
| `lab_grants` | Who unlocked a private lab (`source`: code, later classroom) |
| `follows`, `blocks`, `mutes` | Social graph. No self-follow; blocks remove follows both ways |
| `notifications` | `type` (`new_lab`, `lab_taken_down`, …), JSON `payload`, `read_at` |
| `subscriptions` | Plan, period, status, provider, `ends_at` |
| `orgs`, `org_members`, `org_invites` | Organizations, seats (members plus pending invites ≤ `seat_limit`), roles |
| `entitlement_usage` | Daily counters per subject (`u:<id>` or `ip:<address>`), for example Nour questions |
| `redeem_codes` | Activation codes (SHA-256 of a 12-character random code) |
| `invoice_requests` | Organization invoice requests |
| `checkouts`, `webhook_events` | Payment attempts and processed provider events (idempotency) |
| `rag_chunks`, `rag_fts`, `embed_cache` | RAG index (Phase 8) |

## Entitlements

`getPlan(db, user)` resolves the plan in this order:

1. `DEMO_MODE`: everything unlocked.
2. Organization membership.
3. Active or canceled-but-unexpired subscription.
4. 14-day trial from sign-up.
5. Free.

`requireEntitlement` gates creating public and private labs and the chemistry engines. Nour's daily quota uses `consumeDaily`. Limits come from `shared/plans.js`.

## Payments

`server/billing/providers.mjs` defines the provider contract: `checkout`, `createCheckout`, `verifyWebhook`.

- `manual`: admin grants and activation codes.
- `mock`: test checkout. It signs its event with HMAC-SHA256 and sends it through the same `applyEvent` path as `POST /api/billing/webhook/mock`, which verifies the signature and applies each event id once.
- `paymob` and `merchantOfRecord`: documented, disabled stubs.
