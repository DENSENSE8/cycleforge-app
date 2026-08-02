# Handoff — industry-standard upgrades: honest failure · migration discipline · fixture depth · home-surface budget

**Copy everything below the line into a fresh Claude Code session.**
Repo: `cycleforge-app` · lane: `main` (WS-DOGFOOD).
**Predecessors:** [`daily-triage-today-chrome-parity-HANDOFF.md`](./daily-triage-today-chrome-parity-HANDOFF.md)
(shipped 2026-08-01) → [`daily-triage-today-workbench-HANDOFF.md`](./daily-triage-today-workbench-HANDOFF.md).
**Plan of record for Today:** [`daily-triage-FRONTEND-PLAN-VALIDATION.md`](./daily-triage-FRONTEND-PLAN-VALIDATION.md).

---

You are Claude Code in the Cycle Forge monorepo with **fresh context**.

## Mission

Today (`/`) was brought to industry-standard workbench parity on 2026-08-01 —
saved views, scoped search, a Fields trailing cluster, and a due-horizon KPI band
modelled on Zoho Projects' My Work. Landing it surfaced **four systemic gaps that
are not about Today at all**, each one evidenced by a real failure that day, not
by a style opinion. Close them in this order:

1. **Honest failure at the API layer** — a route that swallows a schema error
   into `{ items: [] }` + HTTP 200 is indistinguishable from "nothing exists".
   One of these took sign-in down for hours with no error anywhere.
2. **Expand/contract migration discipline** — code shipped ahead of its column
   **twice in one day**, and neither was caught by a gate.
3. **QA fixture depth** — the QA org provisions no `work_assignments`, so Today's
   E2E must stub the BFF, and a stub stayed green through a real duplicate-row bug.
4. **A budget for the personal home surface** — `GET /api/my-day` measured
   **~6.9s** on the dogfood tenant. That is the first screen of the day.

Each is independently landable. **1 and 2 are the ones that prevent outages** —
do not reorder them behind the nicer-to-have work.

## Read before writing code

- `.claude/rules/display/workbench.md` → **the four settled states**. Slice 1 is
  that rule applied one layer down: loading / absence / no-match / degraded are
  four different answers at the API too, not one empty array.
- `.claude/rules/polymorphic-tables.md` → idempotent DDL, the
  `reason_codes_flow_context_chk` regression (why a CHECK is *redefined* with the
  full union, never appended to).
- `.claude/rules/verify.md` → gates, **baselines only shrink**, and the QA-org rule.
- `.claude/rules/backend-patterns.md` → route skeleton, `Deps` injection.
- `.claude/rules/workflow-safety.md` → **never start/restart/kill a dev server**
  (`:3050` is the operator's); attribute a red gate to your own files first.

---

## 1 — Honest failure at the API layer

**The evidence.** `src/app/api/auth/staff-picker/route.ts` selects
`avatar_photo_id`. The column did not exist, the query threw, and the route's
`catch` returned `{ staff: [], pinless: true }` with **HTTP 200**. Result: the
sign-in screen showed an empty staff picker on every tenant, with nothing in the
response to explain it — while the staff rows were all present and healthy.

Contrast `2026-08-01c`'s missing `rlt.condition_graded_at`, which 500'd loudly on
`/api/receiving-lines` and was diagnosed in one request. **The loud failure was
strictly better.** A silent empty list is the worst outcome available: it renders
as a legitimate state, so nobody files a bug and every layer above it — the UI's
"teaching empty", a test's `toHaveCount(0)` — cheerfully agrees.

**Do:**

- Sweep `src/app/api/**/route.ts` for `catch` blocks that return an EMPTY
  COLLECTION with a 2xx. Distinguish two shapes and treat them differently:
  - **a genuinely absent resource** → empty + 200 is correct, keep it;
  - **an unexpected throw** (schema, connection, bug) → this must NOT read as
    absence. Return the error, or return 200 with an explicit
    `degraded: true` + `error` field the UI can render as the *degraded* state.
- Start with auth/session/identity routes — a silent empty there locks people
  out. `staff-picker` is the reference case; fix it first and use its shape.
- **Do not blanket-convert every catch to a 500.** `display/workbench.md`'s
  degrade-not-fail rule still holds: a failing SUB-resource renders empty rather
  than 500-ing the whole record. The distinction is *primary vs sub-resource*,
  not *error vs no error*. Say which each route is in its docblock.
- Add a guard test in the spirit of the existing DS ratchets (shrink-only,
  documented escape) so the count of "catch → empty 200" sites can only go down.

**Ask first** before changing the status code of any route a station polls — a
bench that starts 500-ing is worse than one that degrades.

## 2 — Expand/contract migration discipline

**The evidence — twice in one day, both caught by accident:**

| Column | Route | Symptom |
|---|---|---|
| `receiving_line_testing.condition_graded_at` (`2026-08-01c`) | `/api/receiving-lines` | loud 500 |
| `staff.avatar_photo_id` (`2026-08-01e`) | `/api/auth/staff-picker` | **silent empty — sign-in down** |

In both cases the *code* was in the tree while the *migration* was pending. No
gate failed. `npm run verify` was green on schema-drift throughout, because that
guard watches a different thing.

**Do:**

- **A CI gate that fails when code references a column no migration creates.**
  Cheapest honest version: parse the SQL string literals in `src/app/api/**` and
  `src/lib/**` for `table.column` / bare column identifiers, resolve against the
  union of `src/lib/migrations/*.sql` + `src/lib/drizzle/schema.ts`, and fail on
  a reference with no creating statement. Expect false positives — ship it
  shrink-only with a documented escape rather than blocking on perfection.
- **Write the expand/contract rule down** in `.claude/rules/backend-patterns.md`
  as a one-liner + detail: *migration lands first (expand), code second, cleanup
  third.* A nullable ADD COLUMN is always safe to land ahead of its readers; the
  reverse never is.
- **Two migrations, one letter slot.** `2026-08-01a` is claimed by BOTH
  `_reason_codes_qa_fail_seed` and `_saved_views_home_today`, and `2026-08-01e`
  was briefly claimed twice on the same afternoon (two sessions independently
  wrote a `staff.avatar_photo_id` migration; the duplicate was deleted before
  apply — had both run, you'd have two identical FKs and two indexes, because the
  `EXCEPTION WHEN duplicate_object` guards match on constraint NAME). Add a guard
  asserting the `YYYY-MM-DD<letter>` prefix is unique across
  `src/lib/migrations/`. It is ~10 lines and it prevents a real collision class.
- The runner (`scripts/run-pending-migrations.mjs`) is **all-or-nothing** — there
  is no `--only`. When one lane needs its migration but concurrent lanes have
  pending ones, applying "all" lands someone else's schema change. Either add
  `--only <file>` (the ledger is just `schema_migrations (filename, sha256)`, so
  a scoped apply + its ledger row is exactly equivalent), or document that
  landing another lane's migration is an ask-first action.

## 3 — QA fixture depth (so E2E stops needing a stub)

**The evidence.** `tests/e2e/my-day-today.spec.ts` runs on `qa-desktop` but
**stubs the `GET /api/my-day` body**, because the QA org provisions no
`work_assignments` and Today's four lanes cannot otherwise be populated. That
stub stayed green through a real bug: `myDayTasksFromFeed` emitted the top work
order **twice** on any real feed, because `aggregateMyDayFeed` derives `doNext`
(`topWorkOrderForStaff`) and `assigned` (`isMineRow`) from the *same* predicate —
`doNext` is a POINTER into `assigned`, never a disjoint bucket. Every fixture
gave `doNext` a unique id, so nothing caught it until a dogfood run threw a React
duplicate-key error.

**Do:**

- Extend `scripts/provision-qa-org.ts` + `src/lib/tenancy/qa-org.ts` with
  deterministic `work_assignments` that flow through `fetchAllWorkOrderQueues`,
  covering: one `doNext` that IS in `assigned` (the regression above), one
  overdue, one due-today, one upcoming, one undated interrupt.
- Then drop the stub from `my-day-today.spec.ts` and assert on `QA_FIXTURE_*`
  constants. Keep the spec's header note honest about what it now does cover.
- **The general lesson is worth a rule line:** a stubbed BFF response proves the
  chrome, never the read model. Any surface whose bug class lives in
  feed-shaping needs one dogfood-shaped pass before it is called verified.

## 4 — A budget for the personal home surface

**The evidence.** `GET /api/my-day` returned 200 in **6,916 ms** on the dogfood
tenant (measured 2026-08-01, cold load). Today renders skeletons for ~7s on the
first screen an operator sees each morning. `aggregateMyDayFeed` fans out over
`fetchAllWorkOrderQueues({ unified: true })` — Orders 107 / Arrival 500 /
Packing 107 / Testing 493 / FBA prep 52 — then filters in JS to the handful of
rows that are actually this staffer's.

**Do:**

- Push the "mine" predicate into SQL. `isMineRow` / `topWorkOrderForStaff` filter
  on `techId === staffId || packerId === staffId` **after** fetching every queue;
  that is a whole-warehouse read to answer a per-staffer question.
- Keep `queueCards` counts as counts — they need `COUNT(*)`, not rows.
- Measure before and after with the same method (`page.on('response')` timing on
  a cold load), and record both numbers in the plan doc. Do not claim an
  improvement from a warm cache.
- Perf axis + tooling: `.claude/rules/build-gotchas.md` → bundle altitude,
  `pnpm lighthouse:audit`, [`docs/performance/LIGHTHOUSE.md`](../performance/LIGHTHOUSE.md).

**Ask first** before changing `MyDayFeed`'s SHAPE — `myDayTasksFromFeed` is the
one client and the plan's F1 `TriageRow` work lands there too.

---

## Carry-forward (unchanged, still open)

- **Inspector occlusion at 1440px** — the floating Today inspector covers the
  Due/Status tracks. House contract (navigators push, inspectors float) and push
  was already declined on the merits for the dashboard order inspector. Fields
  now lets staff shed tracks, which is mitigation, not a decision.
- **OQ1 — Dashboard / Unbox mounts** — `// TODO(daily-triage F0→F1)` markers in
  `DashboardOrdersContextPanel.tsx` and `LineEditPanel.tsx`. Blocked on an
  operator answer; Unbox has no free slot at all.
- **F1 categorized board + `Closed today` KPI** — blocked on backend B0–B3.
  There is no completion signal in `MyDayFeed`; do not invent placeholder
  categories. `myDayTasksFromFeed` is the single place that changes.
- **The spine `domainGroup` refactor** was mid-flight on 2026-08-01
  (`stationGroup` → `domainGroup`; Inbound → Catalog → Inventory → Fulfillment →
  Sales → Support, and `label: 'Incoming'` → `'Inbound'`). Home's context-panel
  registration (`'home'` in `CONTEXT_PANEL_ROUTE_KEYS`) survived it, but
  **re-check that registration** once the refactor lands.

## Verification

```bash
npm run verify
```

Green before done; run `node scripts/portfolio-sot-sync.mjs` after any docs
change. **The tree routinely holds several sessions' in-flight work** — on
2026-08-01 it went from 1 knip finding to four failing gates in ten minutes, none
of them the working session's. Attribute every red to a file you touched before
acting on it, and report pre-existing failures rather than inheriting or masking
them. `git status --porcelain <path>` is the fastest attribution check.

E2E: `pnpm provision:qa-org` then
`npx playwright test <spec> --project=qa-desktop`. Two traps worth knowing:

- `/api/auth/signin` is rate-limited to **20 req / 10 min per IP**, and
  `global-setup` re-mints whenever its probe route (`/api/receiving-lines`) is
  unhealthy. **Polling the endpoint to see whether the limit cleared is what
  keeps it starved** — back off without touching it.
- The tenant header is **`x-tenant-slug`**, not `x-cf-tenant`. The wrong header
  resolves to the nil org and returns an empty payload that looks exactly like a
  broken route — this cost a wrong diagnosis on 2026-08-01.

## Non-goals

A second saved-views store, search engine, or table shell · mobile `/m/home` ·
rewriting `aggregateMyDayFeed`'s response shape · fixing another session's
in-flight work to make a gate green · raising any ratchet baseline.

## Definition of done

- Auth/identity routes no longer answer an unexpected throw with an empty 2xx
  collection, and a shrink-only guard holds the line.
- A gate fails when code references a column no migration creates; the
  expand/contract rule is one line in `backend-patterns.md` plus detail; the
  migration-prefix uniqueness guard exists.
- `my-day-today.spec.ts` runs against real QA fixtures with no BFF stub.
- `GET /api/my-day` cold-load time recorded before and after, both in the plan
  doc's Validation log.
- `npm run verify` green on your own files; work-log appended (`pnpm worklog`).
