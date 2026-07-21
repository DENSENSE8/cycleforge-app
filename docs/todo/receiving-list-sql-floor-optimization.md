# Hand-off prompt — Receiving list-SQL server floor (deferred join → read-model projection)

> **This is a self-contained hand-off prompt.** Paste it into a fresh agent session (or read it top-to-bottom before starting). It embeds all context, evidence, file locations, constraints, and the measure/verify recipes so you do not need the originating conversation. Author: prior session, 2026-07-20, on `main` (WS-DOGFOOD integration lane).

---

## Mission

Cut the **cold-path server latency** of the receiving/unbox list query (`GET /api/receiving-lines`, `view=activity` and the sibling paged views) by removing the "join-everything-then-LIMIT" shape that forces ~15 display laterals to run over the whole per-org candidate set before the page is clipped. Target surface: the `/unbox` History tab and every receiving/dashboard list that shares this SQL.

**This work is explicitly ASK-FIRST territory** (it rewrites the shared receiving/search **list waist** + its byte-identical fixture, and adds a migration). This prompt **is** that authorization for the two steps described below — but you still must (a) keep the emitted result set identical, (b) regenerate the parity fixture in the same change, and (c) land `npm run verify` green. Do not expand scope beyond these two steps without asking.

---

## What is already done (do NOT redo)

The **client paint path** for `/unbox` is finished and measured (see auto-memory `unbox-paint-optimization.md`):

- **Shared query SoT + dedup:** `receivingLinesTableQuery(mode, ctx, phase)` in `src/lib/queries/receiving-queries.ts` is the one options builder; `useReceivingLinesQuery` (`src/components/station/useReceivingLinesQuery.ts`) is the spine-first hook consumed by both the table (`useReceivingLinesData`) and `UnboxKpiStrip`. The old page-local 200-row KPI fetch is gone.
- **Spine tier:** `?phase=spine` (parsed in `src/lib/receiving/lines/query.ts`) drops `include=serials` (rows still carry `serial_projection` serial chips from the SELECT) and clamps deep windows to `SPINE_PAINT_LIMIT = 150` in `receiving-queries.ts`. The authoritative `full` fetch is sequenced *after* the spine settles.
- **Mobile gate / hover prefetch / structured skeletons:** `MobileReceivingList` is `enabled: isMobile`; `src/lib/nav/nav-data-prefetch.ts` warms `/unbox` on nav hover; `src/app/unbox/loading.tsx` + Suspense skeletons exist.
- **Paint contract test:** `tests/e2e/unbox-paint.spec.ts` pins the single spine→full flow (one `phase=spine` + ≤1 `include=serials`, marks `unbox:chrome ≤ unbox:kpi ≈ unbox:table`).

Those changes already took warm kpi/table from ~4.05s → ~3.15s and cut per-load `/api/receiving-lines` calls 5→4 (serial resolves 3→1). **The remaining floor is server-side and is the subject of THIS hand-off.**

---

## The problem, precisely (evidence)

Profiler: `scripts/explain-activity-list.mts` (kept in-repo). Run it:

```bash
# The react-server condition no-ops the server-only guard on src/lib/db’s
# transitive import so a plain node/tsx script can build the SQL. (Alternatively
# the gate uses scripts/register-server-only-shim.cjs — same effect.)
NODE_OPTIONS='--conditions=react-server' npx tsx scripts/explain-activity-list.mts
EXPLAIN_LIMIT=500 NODE_OPTIONS='--conditions=react-server' npx tsx scripts/explain-activity-list.mts
```

`EXPLAIN (ANALYZE, BUFFERS)` of `view=activity&sort=unboxed_newest&limit=150` (dogfood org) shows:

- Base `receiving_line` + `receiving_line_testing` (`rlt`) + `receiving_line_zoho` (`rz`) scan: **~5ms for 1441 rows** — cheap.
- Then **~15 nested-loop display laterals each iterate the full ~1296-row candidate set** (the carton `r` lateral, `scan_first`, `ops_scan`, `rs_agg`, staff-name joins, the `sku_catalog` similarity join with a correlated `SELECT name FROM items` SubPlan, `sqlReceivingPhotoCount`, etc.), climbing 19ms → 128ms.
- The `ORDER BY unboxed_at` key lives on the **joined** `receiving_unbox ru` table, so the planner **cannot push `LIMIT` below the laterals** — it must Sort the full set, then `Limit 150`.
- **566,870 shared-buffer hits to return 150 rows** (794K @ limit 500 — confirming the earlier 500→150 spine clamp already cut buffer traffic ~29%).
- **Warm query CPU is only ~135–148ms.** The prod cold number (1.2–1.4s) is **cold buffers + Neon serverless round-trip**, not query CPU.

Root cause in one line: **the sort/filter keys the list orders by are on joined tables, so every display lateral runs for the whole org's candidate set before the page is clipped.**

---

## The decision (already made) — what to build

Two steps, in order. Step 1 is the low-risk bridge; step 2 is the durable architecture and makes step 1's first phase an index scan.

### Step 1 — Deferred join (a.k.a. index-then-fetch / pre-limit-then-hydrate)

Restructure the list query so it is two logical phases in one statement (CTE) or a driving subquery:

1. **Rank phase:** select only `rl.id` + the ORDER BY key(s), joining ONLY the tables required to compute the active view's `WHERE` + `ORDER BY` (for `view=activity`: `receiving_line rl`, `receiving_unbox ru`, `receiving_carton r`, `receiving_triage rt` as the current arms require). `ORDER BY … LIMIT/OFFSET` here → the visible page of ids.
2. **Hydrate phase:** the existing wide SELECT with all ~15 display laterals, but constrained to `WHERE rl.id = ANY(<ranked ids>)` and re-applying the same `ORDER BY` for final order.

Net effect: the laterals run for the page size (≤150), not ~1300 → ~8.6× fewer lateral iterations and the bulk of the 566K buffers gone, which is what helps the **cold** path.

**Where:** `buildReceivingLinesListSql` in `src/lib/receiving/lines/build-sql.ts`. This is the shared builder for `receive` / `history` / `incoming` / `unbox_queue` / `unbox_viewed` (see `src/lib/receiving/receiving-modes.ts`). You must preserve the emitted **result set** for every view/sort/filter combination the fixture covers — see Constraints.

Note: even step 1 benefits from an index on the rank-phase sort key (`receiving_unbox(organization_id, unboxed_at)` etc.); without one the rank phase still seq-scans. That index is step 2's first deliverable, so consider doing the index migration first.

### Step 2 — Read-model projection for the sort/filter keys (the long-term standard)

Promote the load-bearing **sort keys** (`unboxed_at`, `scanned_at`/first-scan, `last_activity_at`, `received_done_at`, the unbox-open stamp) — and optionally the cheapest display columns — onto a **denormalized, indexed projection on the base line read-model**, maintained by the write path and reconciled on read. Then the rank phase is a single index-ordered scan on the base table and the laterals leave the cold read path entirely.

**Follow the established house precedent exactly** — this is *growing an existing SoT*, not inventing one:

- **`serial_projection`** — migration `src/lib/migrations/2026-07-13_receiving_line_serial_projection.sql` adds a jsonb column on `receiving_line_testing`, maintained by `src/lib/receiving/serial-projection.ts` (`refreshLineSerialProjectionSafe`, best-effort, called from write `after()` hooks), and the authoritative path reconciles drift on open. Read the migration header — it is the template for shape, tenancy note, and the "projection is the fast default, reconcile self-heals" contract.
- **`entity_search_docs` + `entity_search_outbox` + `src/lib/search/search-outbox-worker.ts`** — the outbox-maintained projection pattern if you prefer trigger→outbox→worker maintenance over inline write-path calls. Use this shape if the sort keys are written from many code paths.

Prefer maintaining the projection from the same write points that already stamp these timestamps (unbox, triage, receive, scan). Keep it best-effort + reconcile-on-read like `serial_projection`, so a projection miss never blocks a scan.

**Do NOT** build a full flattened read *table* or a `MATERIALIZED VIEW`: over-built at ~1.4K lines/org, and a matview is wrong for a scan floor (can't reflect a scan instantly). Column-on-the-read-model + deferred join is the right dose.

---

## File map (what to touch, what each is)

| File | Role |
|---|---|
| `src/lib/receiving/lines/build-sql.ts` | **The query builder to restructure** (`buildReceivingLinesListSql`, plus the single/by-receiving builders that share the SELECT). ORDER BY variants live ~L900–970. |
| `src/lib/receiving/lines/legacy-route-sql.fixture.ts` | **Byte-identical parity fixture** (`FROZEN LEGACY FIXTURE`). Must be regenerated in the same change (see Constraints). |
| `src/lib/receiving/lines/build-sql.test.ts` | Parity guard — asserts `build().list.sql === legacy.list.sql` (+ params, count). Run: `npx tsx --test src/lib/receiving/lines/build-sql.test.ts`. |
| `src/lib/receiving/lines/query.ts` + `query.test.ts` | Query-string parser (has the `phase` tier). |
| `src/lib/receiving/receiving-modes.ts` | Mode registry (`buildParams`/`queryKey` per view). |
| `src/app/api/receiving-lines/route.ts` | The route (`handleReceivingLinesGet`) — tenant GUC via `withTenantConnection`, `include=serials` reconcile. |
| `src/lib/receiving/serial-projection.ts` + its migration | **Read-model precedent** to mirror for step 2. |
| `src/lib/search/search-outbox-worker.ts` + `build-search-text.ts` | Outbox-maintained-projection precedent (alt. maintenance shape). |
| `scripts/explain-activity-list.mts` | The EXPLAIN profiler (before/after evidence). |
| `tests/e2e/unbox-paint.spec.ts` | Paint contract (must stay green). |
| `src/lib/queries/receiving-queries.ts` (`receivingLinesTableQuery`, `SPINE_PAINT_LIMIT`) + `useReceivingLinesQuery.ts` | Client spine-first layer (should need no change; the win is server-side). |

---

## Hard constraints (house rules that bind this work)

1. **Result-set identity.** The rewrite must return the **same rows in the same order** for every view/sort/filter the fixture exercises. The parity guard is byte-exact SQL text, so a *deliberate* shape change means: update `build-sql.ts` AND mechanically regenerate `legacy-route-sql.fixture.ts` in the same PR, and **document the regeneration in the fixture header** (it already carries a 2026-07-09 / 2026-07-11 changelog — append yours). A drift you did not intend is a regression. Independently verify identity by diffing row-id sets old-vs-new for several views (activity/scanned/viewed/history-search) against the real DB, not just that the test passes.
2. **Tenant scoping is non-negotiable.** All reads run under `withTenantConnection(orgId, …)` (`SET LOCAL app.current_org`). Every projection index/unique key leads with `organization_id`. A migration adds columns tenant-safe: `receiving_line_testing`/base tables already carry `organization_id NOT NULL` + the `tenant_isolation` policy, so a plain column add needs no `enforce_tenant_isolation()` (see the serial_projection migration header) — but a NEW table would.
3. **Status/state stays in the SoT.** No raw `UPDATE … current_status`; status changes go through `transition()`. The projection stores *timestamps already written elsewhere*, maintained best-effort — it is a read model, never a second source of truth.
4. **Migrations:** hand-written, dated, idempotent (`IF NOT EXISTS` / guarded `DO` blocks), tenant-from-birth. Use the **`db-migration-author`** skill to scaffold and **`db-migrate`** / `pnpm db:migrate:dry` to apply. Do not `db:push`. See `.claude/rules/polymorphic-tables.md` if you add any table.
5. **Backend route shape** unchanged: `withAuth` → validate → domain helper → map status → `recordAudit` → `after()`. Detail: `.claude/rules/backend-patterns.md`.
6. **Concurrency:** `main` is a shared lane with other agents committing. Stage only your files; never `git stash`; commit only when the user asks. If `npm run verify` shows a red gate in a file you did not touch (e.g. a `tests/e2e/*.spec.ts` from another lane), confirm it is foreign and proceed — do not fix other lanes' work.

---

## How to measure (before / after)

1. **Query-level (authoritative for this work):** `scripts/explain-activity-list.mts` (invocation above). Capture, before and after, at `EXPLAIN_LIMIT` 150 and 500: **total `shared hit` buffers**, top-node `actual time`, and the row count flowing through the laterals (should drop from ~1296 to ≤ limit). Success = laterals iterate the page size, buffers fall from ~566K toward tens of thousands.
2. **Prod paint (end-to-end):** build isolated clones and serve them, so the live dev server's `.next` is untouched:
   ```bash
   # Clone the tree (APFS copy-on-write), neutralize the uncommitted db.ts
   # server-only guard if the perf lane's guard is still in the working tree,
   # then: NEXT_PUBLIC_PAINT_TIMING_HUD=true pnpm build && PORT=3100 pnpm start
   ```
   Drive `/unbox` authenticated (mint via `tests/e2e/global-setup.ts` → `tests/.auth/admin.json`), read `performance.getEntriesByType('mark')` filtered to `cf-paint:` for `unbox:chrome|kpi|table|sidebar-rail`, 3 cold passes (fresh browser context each). The prior session's harness scripts are under the session scratchpad if still present; otherwise a ~30-line Playwright script reproduces it.
3. **Warm vs cold:** remember warm query CPU is ~135ms — the win you are chasing shows up **cold** (first request after start, cold PG buffers). Report both.

---

## How to verify (must pass before "done")

- `npx tsx --test src/lib/receiving/lines/build-sql.test.ts` — parity guard green (against the regenerated fixture).
- `npx tsx --test src/lib/receiving/lines/query.test.ts` and `src/lib/queries/receiving-queries.test.ts` — green.
- **Row-set identity spot-check** against the DB for `view=activity` (unboxed_newest & scanned_newest), `view=scanned` (priority), `view=viewed`, and a `history` text search: same ids, same order, old vs new builder.
- `npx playwright test tests/e2e/unbox-paint.spec.ts --project=desktop` — green.
- If step 2: `pnpm db:migrate:dry` clean; projection backfill verified; `serial-projection`-style unit test for the maintainer (DB-free, `Deps`-injected).
- **`npm run verify`** — the full local CI mirror (lint, typecheck, unit + DS-ratchet guards, knip, route-auth, schema, tenancy-static). Green ⇒ green in CI. Never raise a DS baseline or `--no-verify`.
- Append a `pnpm worklog "<what> --result <r>"` entry when a unit of work lands.

---

## Suggested sequencing + rollback

1. **Index first** (step-2 prerequisite, low risk): migration adding `receiving_unbox(organization_id, unboxed_at)` and the other rank-phase sort-key indexes. Measure the rank-phase alone with the profiler.
2. **Deferred join** (step 1): restructure `buildReceivingLinesListSql`, regenerate the fixture, verify row-set identity, re-run the profiler. This alone should deliver most of the cold-path win. Rollback = revert the builder + fixture (pure query-shape change, no data).
3. **Projection** (step 2): add the sort-key projection column(s) + maintainer (mirror `serial-projection.ts`) + backfill; switch the rank phase to read the projection. Rollback = the rank phase falls back to the joined columns; the projection is additive and reconcile-on-read, so a bad projection never corrupts truth.
4. Optional, independent, **not** SQL: cold-connection lever — Neon pooler (transaction mode) + Fluid Compute instance reuse attack the round-trip that dominates cold. Worth a separate proposal; do not bundle.

## Deliverables

- Restructured `buildReceivingLinesListSql` + regenerated, header-documented `legacy-route-sql.fixture.ts`, parity green.
- (Step 2) migration(s) + read-model maintainer mirroring `serial-projection.ts` + backfill + DB-free unit test.
- Before/after profiler numbers (buffers, lateral row count, warm ms) and a prod cold-pass paint table, in the worklog / a short note.
- `npm run verify` green; `unbox-paint` e2e green; row-set identity confirmed.
- Auto-memory `unbox-paint-optimization.md` updated (flip the server-floor line from "diagnosed, ask-first" to what landed).
