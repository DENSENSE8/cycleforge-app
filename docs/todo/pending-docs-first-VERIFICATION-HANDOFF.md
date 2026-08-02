# Verification handoff — Pending docs-first inspector, sort direction, grid-spec repair

**Change under test:** commit `25d91e688` *fix(outbound): pending docs-first inspector, column sort
direction, stale grid specs* (+ the Export CSV module, folded into the same commit during the
history cleanup).

**Lane:** outbound dashboard (`/dashboard?unshipped`) only. No receiving / Unbox files were touched.

**Written:** 2026-07-31. Numbers below are what this change produced on that day; the tree has moved
since (see *Known red — not this change*).

**Verified: 2026-08-01 — all six claims hold.** Details inline below; the short version:

| Check | Result |
|---|---|
| Unit tests (§2) | **19 pass, 0 fail** — as documented |
| `pnpm provision:qa-org` | clean; `pending#2 id=7948`, `pending#3 id=7978`, `packed id=7952` all present |
| Playwright (§2) | **18/18, zero skips** — `to-ship-pending-grid` 8/8, `bulk-actions` 4/4, `selection-handoff` 1/1, `pending-docs-first` 5/5 |
| `npm run verify` | red — **none of it this change's** (see §4b) |

**The one thing a re-verifier must know: this suite is contention-sensitive.** The 18/18 above is the
union of a clean first pass plus targeted reruns on a quiet tree. Mid-verification a second session
was running Playwright against the *same* dev server, the *same* QA org, and the *same* per-staff
column-order preference this spec's own `resetColumnOrder` docblock names as cross-run contaminating
(it also wipes `test-results/` on start, so artifacts vanish mid-investigation). Under that load
three different tests failed across three runs, each time on a **page-load timeout waiting for
`pending-grid-body`** — never on the assertion the test exists for. Timing is the tell: the
bounded-host test runs **8.8s quiet vs 35.2s contended**, a 4× spread.

**Before chasing any red in this file, check for a concurrent run:**

```bash
pgrep -fl "playwright/lib/worker/workerProcessEntry.js|@playwright/test/cli.js test"
```

Non-empty ⇒ wait, don't debug. Do not kill it; it is another session's work.

---

## 0. Preconditions

- **The dev server is already running on `:3050`. Attach, never start it** — hard law in
  `AGENTS.md`. A broken dev server is a thing you report, not repair.
- `pnpm provision:qa-org` — idempotent, and **required**: this change added QA fixtures the specs
  depend on (two extra tracked pending orders + a packed order).
- All Playwright runs use `--project=qa-desktop`. Never assert against the dogfood tenant; its row
  mix changes under the test between runs.

---

## 1. What the change claims

| # | Claim | Where |
|---|---|---|
| 1 | Pending's record inspector **opens on Documents**, and re-seeds there on record change | `resolveOrderInspectorContext` → `useShippedPanelViewState` |
| 2 | That Documents tray is **read-only** (no drop zone / Fetch / delete) and offers **Preview** → the shared `DocumentSlideOver`. Buy/fetch/delete stays on Labels | `OrderDocumentsSection` `showPreview` / `readOnly` |
| 3 | One quiet **Open in Testing** hand-off, seeded with params `/test` actually declares | `station-handoff.ts`, `OrderStationHandoff.tsx` |
| 4 | **Export CSV** on the bulk bar; warehouse-civil-day filename | `order-export-csv.ts` |
| 5 | **Z–A column sort works.** `/dashboard` now declares `?dir=`, so hygiene stops stripping it | `query-mode-routes.ts` |
| 6 | The **bounded host** keeps the KPI put and the grid card's bottom edge on screen — the spec now asserts this instead of the opposite | `to-ship-pending-grid.spec.ts` |

Slice 5 is the one real product bug: before it, the Pending grid could **only** sort ascending. The
header click wrote `?dir=desc`, `useSurfaceParamHygiene` deleted the undeclared key on the next
pass, and `parseQueueDisplaySortDir` resolved the now-missing param back to the column default. The
URL and the header agreed — both said ascending — so nothing looked broken.

---

## 2. Automated checks

```bash
npx tsx --test \
  src/lib/selection-context/order-inspector-context.test.ts \
  src/lib/dashboard/order-export-csv.test.ts \
  src/lib/routing/param-ownership.guard.test.ts
```
Expected: **19 pass, 0 fail.**

```bash
npx playwright test \
  tests/e2e/pending-docs-first.spec.ts \
  tests/e2e/dashboard-selection-handoff.spec.ts \
  tests/e2e/dashboard-bulk-actions.spec.ts \
  tests/e2e/to-ship-pending-grid.spec.ts \
  --project=qa-desktop
```
Expected at commit time: `to-ship-pending-grid` **8/8**, `dashboard-bulk-actions` **4/4**,
`dashboard-selection-handoff` **1/1**, `pending-docs-first` **5/5** — and **zero skips**. If you see
`test.skip('needs at least two pending rows')`, the QA org was not provisioned.

```bash
npm run verify
```

---

## 3. Manual spot-checks (attach to `:3050`)

Two of these are worth doing by hand — a green spec proves the assertion, not the feel.

1. **Docs-first** — open `/dashboard?unshipped`, click a row's **Product** cell (the editable
   tracks stopPropagation into their own in-cell editor). Inspector opens on **Documents**, both
   document types listed even when nothing is attached. Press `j` → next record, still Documents.
2. **Preview** — click **Preview**. Slide-over opens with a Shipping Label / Packing Slip switcher.
   Confirm there is no Fetch button, no drop zone, no delete anywhere in the tray.
3. **Z–A sort** (the regression) — click the **Product** header twice. URL must reach
   `?sort=title&dir=desc` and the header must read `aria-sort="descending"`. Reload: it must
   **survive**. Before the fix, `dir` vanished within a tick and the header snapped back to
   ascending.
4. **Bounded host** — the KPI strip should NOT scroll away, and the grid card's **bottom edge**
   should stay on screen. That is the intended contract (`WORKBENCH_TABLE_VIEWPORT`), not a bug;
   the old spec asserted the reverse and had been red since that cutover.

---

## 4. Known red — **not** this change

Do not chase these; they are other sessions' in-flight work in the shared tree. Both claims are
cheap to re-check.

**a) `railSelection` selection-plane rework** — uncommitted, and the dev server serves the working
tree, so specs execute against it:

```bash
printf "worktree: "; grep -rl railSelection src | wc -l
printf "HEAD:     "; git grep -l railSelection HEAD -- src | wc -l
```
At handoff: **6 vs 0**. It rewires selection so one checked row opens the inspector
(`docs/todo/order-rail-selection-plane-PLAN.md`, also untracked). It turns
`dashboard-inspector-non-modal` 4/7 red and drops `pending-docs-first` to 3/5 — every failure is a
selection↔inspector interaction test. The docs-first assertion itself still passes.

> **2026-08-01:** still **6 vs 0**, still uncommitted — but the predicted damage did **not**
> materialize: `pending-docs-first` ran **5/5**, not 3/5. Either the rework moved since, or the
> 3/5 was itself contention (see the header note). Re-measure before trusting the 3/5 figure.

**b) `npm run verify` fails on knip** — 5 dead-export findings in
`src/components/receiving/workspace/derive-capture-step-states.ts` (untracked) and
`src/hooks/useReceivingPhotoCount.ts`, from the receiving/capture session. Lint, typecheck, unit
tests and the DS guards are green. **The pre-push hook runs `verify`, so pushing is blocked until
that session lands.**

> **2026-08-01 — this red has changed shape entirely.** Pushing is still blocked, but by different
> sessions for different reasons. HEAD moved *during* verification (`d11507264` → `5c0ef6f91`).
> Current state, all attributed **away** from this change:
>
> | Gate | Now | Attribution |
> |---|---|---|
> | Typecheck | ✗ 5 errors | all in generated `.next/types/validator.ts`, stale against another session's uncommitted `D src/app/operations/layout.tsx` + `D src/app/studio/layout.tsx`. **No source errors.** |
> | Lint | ✗ 1 warning | `src/lib/documents/ensure-outbound-docs.ts:122` (`no-console`) — clean in tree, absent from `25d91e688`, introduced by `baa2243e0` (kiosk v2) |
> | Knip | ✗ 84 unused files, 1156 unused exports | the doc's original 5 findings are **gone**. None of this commit's 22 files is flagged as an unused *file*; hits are exported types inside a repo-wide sweep. Scale + knip's own "add entry / refine project files" advice points at broken entry resolution from those deleted layouts |
> | Route-permission drift | ✓ **passes** (`exit=0`) | only failed *inside* `verify` because the concurrent session was mid-edit |
>
> Unit tests + DS guards, route-auth enforce, and schema drift stay green.

**c)** `to-ship-pending-grid` → *"renders as a gridlined spreadsheet"* flakes under sequential load
and passes in isolation. Not investigated.

> **2026-08-01 — investigated, and it is not one test.** The whole file is contention-sensitive:
> across three contended runs the sort test, the dnd-kit reorder test, and the bounded-host test
> each failed once and each passed on a quiet tree (bounded-host **3/3**). All failures were
> page-load timeouts, not assertion failures. Cause and the pre-flight check are in the header note.
> Treat a red in this file as "check for a concurrent run" before "debug the app".

---

## 5. Open / deliberately not done

- **`qty` is missing from the record plane.** It is in-cell editable on the grid but rendered
  nowhere in the inspector, so on any surface that cannot mount the in-cell editor (mobile,
  non-airtable skin) the field is unreachable. That violates the plane-redundancy rule in
  `display/workbench.md`. Spun off as its own task; the spec asserts the weaker facts (Ship By Date
  / Tracking Number / Order ID) because qty simply is not there.
- **`/dashboard` fuses display sort and column sort onto `?sort=`/`?dir=`**, while
  `source-of-truth.md` names `useUrlColumnSort` → `?colsort=`/`?coldir=` as the grid column-sort
  SoT. The dashboard is not a station route so the documented collision does not apply, but the two
  mechanisms are worth reconciling deliberately rather than by accident.
- **The `sort`/`dir` pairing guard turned up seven more routes** owning `sort` without `dir`. All
  are legitimate — their vocabularies bake direction into the value (`zoho_newest`/`zoho_oldest`,
  `priority`/`newest`) — and are recorded in the shrink-only `SORT_WITHOUT_DIRECTION` allowlist in
  `param-ownership.guard.test.ts`. A route earns removal by growing a column sort and declaring
  `dir`; never add an entry to land a change.
- **First header click occasionally no-ops** right after page load (dnd-kit's 6px drag activation
  swallowing it during hydration is the hypothesis). Did not reproduce in the committed spec; noted
  rather than chased. **2026-08-01:** reproduced once under a concurrent Playwright run and never on
  a quiet tree, so slow hydration under contention is the better hypothesis than dnd-kit — the
  6px-activation theory should not be treated as settled.

---

## 6. Fixture changes to be aware of

`src/lib/tenancy/qa-org.ts` + `scripts/provision-qa-org.ts` gained:

- `QA_FIXTURE_ORDERS.pendingSecond` / `.pendingThird` — tracked, so they reach the Pending lane
  (untracked orders are filtered out, which is why `awaiting` never appeared and every
  record→record spec skipped itself).
- `QA_FIXTURE_ORDERS.packed` — plus a `PACK_COMPLETED` station-activity row and a `SHIP_CONFIRM`
  cleanup, which is exactly the `?stagedOnly=true` predicate the Packed lane queries. Without it
  `/dashboard?packed` was empty and every post-pack assertion passed vacuously.

Re-running `pnpm provision:qa-org` is safe and idempotent.
