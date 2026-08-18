# Backend patterns — domain logic, routes, audit

Conventions that recur across the inventory/workflow/tech modules and their API routes. Reuse them; they encode
atomicity, tenant-safety, and audit guarantees that are easy to break by hand.

## Expand → code → contract (the migration lands FIRST)

**One line: the migration lands first (expand), the code that reads it second, the cleanup
third.** A nullable `ADD COLUMN` is always safe to land ahead of its readers; the reverse never
is, because between the two deploys every query naming that column throws.

Twice on 2026-08-01 code shipped ahead of its column, and nothing caught either:

| Column | Route | Symptom |
|---|---|---|
| `receiving_line_testing.condition_graded_at` (`2026-08-01c`) | `/api/receiving-lines` | loud 500 |
| `staff.avatar_photo_id` (`2026-08-01e`) | `/api/auth/staff-picker` | **silent empty — sign-in down** |

`npm run verify` was green on schema-drift the whole time: that guard compares the Drizzle model
against the DB, not "does the SQL in this repo name a column that exists".

- **Gate:** `src/lib/migrations/column-reference.guard.test.ts` — resolves every qualified
  `alias.column` and every bare column in a single-table `SELECT` against the union of
  `src/lib/migrations/*.sql` + `drizzle/schema.ts`. Precision over recall by design (it stays
  quiet where its own DDL parse is unreliable); both allowlists are frozen and shrink-only.
- **Slot discipline:** one `YYYY-MM-DD<letter>` per migration.
  `src/lib/migrations/migration-slot-uniqueness.guard.test.ts` holds the line. Two files in one
  slot are ordered by their *description*, which is alphabetical and therefore arbitrary — that
  is how `2026-07-29f`'s `_contract` half came to sort **before** its `_expand` half, inverting
  the very sequence the pair was split to guarantee. Applied filenames are immutable (the ledger
  is keyed `(filename, sha256)`), so rename the **unapplied** file.
- **Applying another lane's migration is ask-first.** The runner is all-or-nothing by default;
  `node scripts/run-pending-migrations.mjs --only <file.sql>` applies exactly one, and refuses
  when that would skip an earlier pending file.
- **A CHECK constraint is REDEFINED with the full union, never appended to** — see
  `polymorphic-tables.md` and the `reason_codes_flow_context_chk` regression.

## Status changes route through the state machine

- **Never** `UPDATE serial_units SET current_status = …` directly. Call `transition()`
  (`src/lib/inventory/state-machine.ts`). It owns the allowed-transition graph (`TRANSITIONS`), the `FOR UPDATE`
  lock, the atomic `serial_units` UPDATE + `inventory_events` INSERT, and org scoping.
- `transition()` contract: `TransitionInput { unitId, to, eventType, expectedFrom? }` → `TransitionResult`
  (`ok` + from/to/eventId, or 404/409). `expectedFrom` gives optimistic-concurrency rejection (409).
- Domain verdict→status maps live as constants (e.g. `VERDICT_TO_STATUS` in `src/lib/tech/recordTestVerdict.ts`),
  not inline branching scattered across routes.
- **Emerging (flag-gated, do not assume universal yet):** `applyTransition()` (`src/lib/workflow/applyTransition.ts`)
  composes transition + inventory event + workflow tap as one chokepoint, gated by `isUnifiedEngineApplyTransition`.
  Prefer it when the flag path applies; it is mid-strangler, so it is not yet a hard requirement.

## Receiving lines transition through a dedicated sibling chokepoint

- **Never** `UPDATE receiving_line SET workflow_status = …` directly. Call `transitionReceivingLine()`
  (`src/lib/receiving/state-machine.ts`) — the receiving-line-specific sibling of serial-unit `transition()`
  above, not a call into it. Same shape: an atomic write + one `inventory_events` INSERT, executor-pattern
  `db`/`orgId` args so a caller can either own the transaction or run inside `withTenantTransaction`.
- **An exception is an orthogonal code on the row, never a terminal status.** A missing/short/damaged/
  mismatched package does **not** force `workflow_status` into a dead-end "FAILED" value. It sets
  `receiving_line.exception_code` **in the same write** (`COALESCE($n, exception_code)` — an explicit
  `undefined` leaves it untouched), alongside whatever `workflow_status` the transition already computed.
  Status and exception are two independent facts on the row; corrupting one to encode the other breaks
  every metric that reads `workflow_status` as a lifecycle stage.
- **The exception vocabulary is a closed, seeded taxonomy — never free text.** SoT: `src/lib/receiving/
  exception-codes.ts` — three sub-vocabularies under one `flow_context = 'receiving_exception'`: OS&D
  codes (`NO_PO` · `CARRIER_MISMATCH` · `SHORT` · `OVER` · `DAMAGED` · `WRONG_ITEM` · `RETURN_NO_ORDER`),
  photo-policy override codes (`PHOTO_WAIVED_*`, narrowed by `PHOTO_POLICY_OVERRIDE_CODES` so an operator
  can't waive the photo gate with `NO_PO`), and loss codes (`LOST_IN_TRANSIT` … `STOLEN`, narrowed by
  `LOSS_EXCEPTION_CODES`). A QA-fail reason is the same family via `QA_FAIL_EXCEPTION_STATUS` — see
  `source-of-truth.md` → Note vs label grain. **Array position is the `sort_order` contract** — a new code
  goes at the end of the composed array, never spliced in (pinned by `exception-codes.test.ts`).
- Station-facing behavior for an exception session (continue-scanning, amber card, never silent success)
  is documented in `display/station.md` §6.

## API route handler skeleton

Every operator/mutation route follows this shape:

```ts
export const POST = withAuth(async (request, ctx) => {
  // 1. validate path params (Number.isFinite / Zod) and body (enum/string/number)
  // 2. call a domain helper (recordTestVerdict, recoverItem, …) — no business logic inline
  // 3. map the domain result to HTTP: 404 / 409 / 200 / 500
  // 4. fire-and-forget side-effects via after() (Zoho sync, Ably emit) — never block the response
  // 5. await recordAudit(pool, ctx, request, { … })
  // 6. return JSON
}, { permission: 'x.y.z' });
```

- Auth + permission via `withAuth(handler, { permission })`. Get `orgId` from `ctx.organizationId`, never the body.
- Keep handlers thin — they validate, delegate, map status, audit. Business logic lives in `src/lib/**`.

## Audit logging

- Use `recordAudit(db, ctx, request, args)` (`src/lib/audit-logs.ts`) — **not** `createAuditLog()` directly.
  It extracts actor/role/ip/request-id server-side and never throws (failures are logged and dropped).
- Use the `AUDIT_ACTION` / `AUDIT_ENTITY` constants. Never rename existing action/entity values — dashboards key off them.

## Idempotency

- Thread `clientEventId` through mutations into `inventory_events` (which has `UNIQUE(client_event_id)`), so a client
  retry (flaky mobile network) is a no-op instead of a double-effect. Re-entering the same state returns `idempotent: true`.
- HTTP request replay for barcode lifecycle writes uses [`api-idempotency.ts`](../../src/lib/api-idempotency.ts)
  (`readIdempotencyKey` + `withIdempotencyClaim` / claim-or-replay). Covered routes include receiving
  `mark-received-po`, `tech.serial`, `orders.add`, `packing-logs` (+ `/update`), and `packerlogs` POST.

## A safety classification is a REQUIRED parameter, never a defaulted one

When a new argument decides *whether a write is allowed to claim something*
(who did the work, whether a milestone fires, which surface a row belongs to),
give it **no default**. A default is not a convenience here — it is a silent
opt-out that every call site you did not visit takes automatically, and the
compiler stays quiet about exactly the sites you missed.

- **Don't:** `scanKind: UnboxScanKind = 'work'`. That shape shipped with 2 of 6
  `stampUnboxOpened` call sites passing a value, so the 4 that reach a
  pre-existing carton kept re-attributing an inspection as work — the precise
  defect the parameter was added to fix. Same trap as `intakeSurface` defaulting
  to `'triage'` in `recordReceivingScan`: a caller that drops it records every
  Unbox scan as a door scan and the Unboxed rail silently stops being written.
- **Do:** make it required, then let each site answer one narrow question
  (`preexisting ? await classify(id) : 'work'`). Turning the miss into a compile
  error is the enforcement; a comment asking callers to remember is not.
- **Classify at the EARLIEST write, not the most obvious one.** Gating the
  branch you were looking at is worthless if a shared resolver already wrote
  first — `findScanByTracking` → `memoizeLookupHit` overwrote attribution before
  any gated branch ran. Trace every write on the path, not just the one the
  ticket names.
- Pair it with a guard that walks the call sites (`lookup-scan-wiring.guard.test.ts`
  parses the argument lists), so the next site added is caught by a test rather
  than by an operator noticing their name on someone else's work.

## Tenant scoping via GUC

- Wrap org-scoped writes in `withTenantTransaction(orgId, cb)` — it does `BEGIN; SET LOCAL app.current_org = $1; …`.
  Columns like `inventory_events.organization_id` default to `current_setting('app.current_org')`, so they auto-stamp.
- Prefer this over manual `WHERE organization_id = …`; it also makes RLS-enforced tables work automatically.
  Omitting `orgId` keeps legacy/global queries running unchanged.

## Locks are race-narrowing, not correctness

- `redisAdvanceLock` (`src/lib/workflow/lock.ts`) is best-effort (`SET NX PX` ~15s, token-checked release) and
  **fail-open**: when Redis is unconfigured (dev/CI) or down, acquire returns true. Correctness comes from
  event-gated idempotency, not the lock — never block a fire-and-forget tap on lock/infra failure.

## Recovery is non-destructive

- Reset stuck (`blocked`/`error`) items via `recoverItem()` (`src/lib/workflow/recover.ts`): it resets only the
  engine position, writes an `inventory_events` NOTE (`action: 'workflow_recovery'`) + an append-only `workflow_runs`
  row, and emits a best-effort Ably nudge. It never mutates `serial_units.current_status`.

## Dependency injection for testability

- Public domain functions accept an injectable `Deps` object defaulting to real impls
  (`applyTransition(args, deps = defaultDeps)`, `advanceItem(deps, args)`). Unit tests pass fakes that capture calls,
  so they run with zero DB. Follow this for new engine/domain helpers.

## Feature flags

- **The call-site surface is the exported `isXxx()` predicates** in `src/lib/feature-flags.ts` — one
  per flag. `readBoolEnv(name, default)` (sync, env-only) and `resolveForOrg(orgId, flag, envVar)`
  (async, ~30s cache, DB → env fallback) are the **private** helpers behind them; reach for the
  per-org form when a new flag needs to roll out without an env redeploy. *(This row used to name
  the two helpers as the API, which is not what anything imports.)*
- **Every flag declares an owner and an ending.** Add a `FLAG_LIFECYCLE` entry
  (`src/lib/feature-flags-lifecycle.ts` — a dependency-free sibling; import it directly, not
  through `feature-flags.ts`, which carries `server-only` via `@/lib/db`)
  with `env`, `bornAt` (civil date), `area`, and a disposition: `permanent` (a real kill-switch,
  with a reason), `rollout` (with a `plannedRemoval` date), or `undecided`.
  `feature-flags.guard.test.ts` fails when a flag sits `undecided` past `FLAG_AGE_LIMIT_DAYS` (90),
  when a `plannedRemoval` lapses, or when the registry and the exports disagree in either
  direction.
- **A flag keeps BOTH branches reachable**, so a permanent strangler is a fork that dead-code
  tooling can never see. That is why "mid-strangler, not yet a hard requirement" needs a date
  attached rather than an open end — the losing branch is zombie code the moment nobody is
  scheduled to delete it.

## AI generation routes

Generation is **not a mutation**: no audit row, but always a per-org rate limit
(`checkRateLimitForOrg`) and a capability-connected gate — `/api/support/suggest`
is the reference. Provider and persona resolution are pure functions over
`(org settings, env)` with a local-first default, split so the pure half is
unit-testable with zero network (`reply-persona.ts` + `reply-persona-deps.ts`,
the same shape as `analyze-core.ts` / `analyze.ts`).

**A shared prompt must not name a vendor.** `SUPPORT_SYSTEM_PROMPT` opened with
one vendor's brand until 2026-08-02 — shared multi-tenant code, so a second
tenant got a model claiming to work for a company they have no relationship
with. That is the operator-copy vendor rule (`AGENTS.md` → capability nouns or
runtime provider labels) pointed at a **customer**, which makes it worse, not a
different rule. Framing resolves per org and falls back to a generic noun,
never to the dogfood tenant's vertical.

**Anything that decides what a customer SEES is a required parameter with no
default** — which lane ran, whether a photo leaves the tenant's hardware (see
*A safety classification is a REQUIRED parameter*).

## New polymorphic / typed-fact tables

- Detail: see `.claude/rules/polymorphic-tables.md`. Discriminator via named CHECK (enum only for small stable
  sets), BIGINT id by default, `entity_type`/`entity_id` naming, org-led unique indexes, parent-delete integrity
  via a real FK or a shared dispatch-on-`TG_ARGV[0]` trigger family, tenant-from-birth via
  `enforce_tenant_isolation()` in the same migration, and modeled in Drizzle in the same PR.
