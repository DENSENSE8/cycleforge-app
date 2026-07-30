# Hand-off — URL isolation tier + dashboard IA rows (session of 2026-07-29/30)

**Self-contained entry point.** Paste:

> Read `docs/todo/url-isolation-session-HANDOFF.md` and start at §3.

**This file is an INDEX, not a third plan.** The detail lives in two existing docs and must not be
restated here — a markdown twin drifts the first time one side changes:

| Thread | Detail doc | State |
|---|---|---|
| URL param isolation (construct-don't-copy) | [`nav-routing-refactor-FINISH-PROMPT.md`](nav-routing-refactor-FINISH-PROMPT.md) | §3.1 tier **COMPLETE**; §3.3 is the one actionable item left |
| `/dashboard` IA rework | [`dashboard-ia-rework-HANDOFF.md`](dashboard-ia-rework-HANDOFF.md) (+ `-PLAN.md` for *why*) | Rows H · I · J · K · L closed; **row G** is all that remains |

---

## 0. Read this first — the tree is not quiet

**Everything from this session is UNCOMMITTED**, and ~270 files are modified/untracked by *other*
sessions working the same tree concurrently. Two commits landed mid-session that were not mine.

Consequences you will hit within minutes:

- **`npm run verify` flips between PASSED and FAILED across identical consecutive runs.** Six distinct
  pre-existing failures appeared and cleared during this session (repair/ecwid knip → photo-intent →
  counter/kiosk lint+types → inspector raw-neutrals → StationPacking unused imports → an untracked
  `header-receiving-mode.guard.test.ts` failing on arrival).
- **Check ownership before fixing any red gate.** `git status --porcelain <file>` — if it is ` M` or
  `??` and you did not touch it, it is not yours. Report it; do not fix it and do not raise a baseline.
- **Re-verify any claim in these docs against `HEAD`.** Rows H and K were decided *and implemented* by
  other sessions while this session was working, and an earlier version of the dashboard hand-off
  described row H as still open.

At last measurement: **84/84 of this session's own tests pass**; the red gates were entirely other
sessions' in-flight files.

---

## 1. What shipped (uncommitted)

**Isolation tier — seven surfaces migrated**, each through the seven-step method in
`nav-routing-refactor-FINISH-PROMPT.md` §2: `/sourcing` · `/test` · `/walk-in` · `/inventory` ·
`/review` · `/pack` · `/warehouse`. `/fba` correctly has **no spec** (it is a `redirect()`, not a
surface — same as the `/tech` and `/packer` aliases). Every nav clear-list removal was proven
byte-identical before deletion.

**Four LIVE defects found and fixed** — none was visible to the ownership guard, and all four were
found by running things, not by reading code:

1. **`?pane=`** — `RouteShell`'s mobile pane toggle was stripped on the commit after the operator
   tapped "Actions", snapping the pane back to History.
2. **`?layout=` / `?density=` / `?weekOffset=`** — the station-table contract. Applying a **saved view**
   on `/receiving/history`, `/incoming` or `/test` reverted instantly. Pre-existing.
3. **`/products` never boundary-parsed on mobile** — the hook sat in a sidebar panel that mobile does
   not mount. Same shape on all six receiving routes.
4. **Three undeclared `/dashboard` hand-off keys** (`wstatus`, `wexp`, `fba`) that would each break a
   retired front door the moment §3.3 is done. `wstatus`/`wexp` pre-existing; **`fba` was created by
   closing row L in this session.**

**New enforcement** (all mutation-verified — each was made to fail, then pass):
`param-ownership.guard.test.ts` gained a `*_PARAM`-constant declaration check;
`fba-modes.test.ts` and `dashboard-search-state.test.ts` pin their redirect hand-offs;
`tests/e2e/surface-param-isolation.spec.ts` is new (18 pass / 4 skip on `qa-desktop`).

**`@/components/routing/SurfaceParamHygiene`** is the new placement SoT — its docblock is the rule.

---

## 2. Three traps that each cost real time

Recorded because each was a *wrong conclusion I had to reverse*, not just a bug.

1. **The harness lied twice, and both times it looked like a code bug.** A settle helper that polled
   "until the URL stops changing" returned true *before* the effect fired — so "param survived" tests
   passed vacuously and two real passes reported as failures. Later an ad-hoc probe with a fixed
   `waitForTimeout(2200)` reported three routes as broken that were fine at 20s. **Use the probe
   pattern in the e2e spec** (`__isolation_probe`, whose *removal* proves the parse ran) and **never a
   fixed sleep**.
2. **The same symptom had three different causes.** A surface not parsing meant: the hook was in a
   conditionally-mounted sidebar panel (`/products`, receiving — mobile only), *or* the surface is
   **parked** so nothing mounts (`/sourcing`), *or* the hook was in a root `page.tsx` while the spec
   governs children by prefix (`/inventory/graph`). Diagnose per surface; do not pattern-match.
3. **"The flag is gone" does not tell you which decision was made.** Row H removed
   `useMasterNavEnabled` — and the rails *survived*, so the persistent rail is now **ON** in all 10
   panels. "Deleted the dormant code" and "turned it on permanently" are opposite outcomes reachable
   by deleting the same flag. Look at whether the feature survived the gate.

The generalisation behind all three: **a guard that cannot fail is worse than no guard.** Every guard
added this session was mutation-tested by breaking the thing it protects.

---

## 3. What is left — start here

### 3.1 Decisions owed by the user (blocking, cheap)

1. **Row L deviation — ratify or revert.** The ratified verdict says delete `/dashboard?fba` and let it
   *fall through to Pending*. As built it **client-redirects to `/shipping/fba`**, on the grounds that
   the fall-through silently lands a bookmark on an unrelated tab and this is the third instance of an
   existing mechanism in the same file (`?warranty=` → `/support`, `?mode=search` → `/search`). Flagged
   in `dashboard-ia-rework-HANDOFF.md` §3.4. **Reverting is one effect + one flag.**
2. **Apply migrations `2026-07-29g_saved_views.sql` + `2026-07-29h_drop_legacy_saved_views.sql`.**
   Row K's behaviour depends on the table existing; authored ≠ applied in this repo.
3. **Eight `SHARED_OWNED_KEYS` entries were added** (`tab`, `openRepair`, `state`, `section`, `unit`,
   `sku`, `filter`, `serial`, plus `wstatus`/`wexp`) after the user ratified the pattern. That list's
   own comment says *"never add an entry to land a change"*, so if the ratification should be narrower,
   the alternative is namespacing those keys per route — which breaks live bookmarks.

### 3.2 Actionable code work

**Mount the boundary parse on `/dashboard`** — `nav-routing-refactor-FINISH-PROMPT.md` §3.3. It is the
last surface that does not parse (verified by probe: `/dashboard?triq=BOX-9` keeps `triq`). The original
blocker (presence flags dying at the boundary) is fixed, and the three hand-off keys are now declared
and pinned, so it is **de-risked but deliberately not done**.

> **Do the two sweeps first anyway** (method §1.5 + the constant sweep in §2). The declared hand-offs
> cover only the redirects this session looked at; `components/dashboard` is a large tree and the
> CONSTANT sweep has never been run against it. Three of this session's four defects came from skipping
> exactly that step on smaller surfaces.

### 3.3 Gated — do not start

- **Row G — Phase 6, the `/search` results grid.** The only substantive build left in the dashboard
  plan. Gated on `search-results-grid-GEMINI-RESEARCH-BRIEFING.md`, whose response has **not landed**;
  its three candidate shapes differ by an order of magnitude in cost. **Do not guess the shape.**
  Groundwork is ready (see `dashboard-ia-rework-HANDOFF.md` §3.1).
- **§3.4 D3 — the 307 → 308 sunset.** Evidence-gated: needs a full cycle with no legacy `?mode=` hits
  in logs. A 308 is cached permanently and cannot be withdrawn.
- **§3.5 V9c — server-side permission gating.** Ask-first; a security-model change, not routing.

### 3.4 Follow-ups, not blockers

- **`/dashboard` §9 refresh + move the plan out of `docs/todo/`** — the dashboard plan's last DoD line.
  §9 is stale (it predates the H/K/L implementations) but the line says "one last time", so it waits
  on row G.
- **16 knip findings are cleanup debt from the row-H MasterNav teardown** (`SIDEBAR_MRU_*`,
  `OUTBOUND_MODE_ITEMS`, …) — exports orphaned when the ModesPanel consumers were deleted. Owned by
  whoever did that teardown.

---

## 4. Hard constraints

- **Never raise a `verify` ratchet baseline.** Baselines only shrink. `UNDECLARED_READS` in the
  ownership guard is empty and must stay that way.
- **Never state that route segments strip query params.** Isolation is construct-don't-copy + a schema.
- **`/fba`, `/tech`, `/packer` must NOT get param specs** — they are redirects/aliases. Giving one a
  spec double-owns its keys for a route that only redirects.
- **A param a surface only HANDS OFF still has to be declared**, or the hygiene hook strips it before
  the hand-off runs. This is the single most repeated defect of the whole refactor.
- **The user owns the dev server** (`:3050`, attach-only). Never start, stop, or restart one.
- **The user manages commits.** Stage only your own files; other sessions are editing the same tree.
- Do not re-open the direction-vs-entity axis or the tabs-vs-saved-views boundary — both are house law.
