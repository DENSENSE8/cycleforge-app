# Backend patterns — domain logic, routes, audit

Conventions that recur across the inventory/workflow/tech modules and their API routes. Reuse them; they encode
atomicity, tenant-safety, and audit guarantees that are easy to break by hand.

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

- Sync, env-only flag: `readBoolEnv(name, default)`. Per-tenant, staged rollout: `resolveForOrg(orgId, flag, envVar)`
  (async, ~30s cache, DB → env fallback). Use the per-org form to roll out without an env redeploy.

## New polymorphic / typed-fact tables

- Detail: see `.claude/rules/polymorphic-tables.md`. Discriminator via named CHECK (enum only for small stable
  sets), BIGINT id by default, `entity_type`/`entity_id` naming, org-led unique indexes, parent-delete integrity
  via a real FK or a shared dispatch-on-`TG_ARGV[0]` trigger family, tenant-from-birth via
  `enforce_tenant_isolation()` in the same migration, and modeled in Drizzle in the same PR.
