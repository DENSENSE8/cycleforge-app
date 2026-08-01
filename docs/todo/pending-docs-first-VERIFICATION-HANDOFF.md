# Verification handoff — Pending docs-first inspector, sort direction, grid-spec repair

**Change under test:** commit `25d91e688` *fix(outbound): pending docs-first inspector, column sort
direction, stale grid specs* (+ the Export CSV module, folded into the same commit during the
history cleanup).

**Lane:** outbound dashboard (`/dashboard?unshipped`) only. No receiving / Unbox files were touched.

**Written:** 2026-07-31. Numbers below are what this change produced on that day; the tree has moved
since (see *Known red — not this change*).

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

**b) `npm run verify` fails on knip** — 5 dead-export findings in
`src/components/receiving/workspace/derive-capture-step-states.ts` (untracked) and
`src/hooks/useReceivingPhotoCount.ts`, from the receiving/capture session. Lint, typecheck, unit
tests and the DS guards are green. **The pre-push hook runs `verify`, so pushing is blocked until
that session lands.**

**c)** `to-ship-pending-grid` → *"renders as a gridlined spreadsheet"* flakes under sequential load
and passes in isolation. Not investigated.

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
  rather than chased.

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
