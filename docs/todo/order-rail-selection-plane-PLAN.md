# Order rail selection plane — the right rail replaces the bottom capsule

**Status (2026-08-01):** Phases 0–2 LANDED and RE-VERIFIED. The capsule is gone
  from `/dashboard`; the right rail is the selection plane (1 row → inspector +
  action region, 2+ → `OrderRailShell`). The publish bridge is split out of
  `useDashboardBulkSelection` into `useOrderRailSelection` (Pack / Shipping keep
  the plain hook + capsule). Phases 3–5 (compare pane, batch roster `[×]`,
  change band) open.

**Re-verification (2026-08-01, independent session):** `dashboard-bulk-actions`
  + `dashboard-selection-handoff` on `qa-desktop` — **6/6 green on two
  consecutive full runs**, plus the `-g "Set ship-by"` slice green twice on its
  own ("Applies to all 2 selected orders."). No code change was needed; both
  fixes were already in the tree. `npm run verify`: every gate green except
  **Doc catalog drift**, which is NOT this work — it is a new doc another
  session added (`todo/sidebar-master-nav-kinetic-grain-HANDOFF.md`) that the
  generated catalog has not indexed yet. Tenancy-isolation static is advisory,
  not blocking. `dashboard-inspector-non-modal` was not re-run (known-red,
  unscoped `edge-resize-collapse` locator — see §4).

> **Note 2026-08-05:** `isOrderRecord` / `context==="dashboard"` body fork is **demolished**. Desk inspector is always tabbed `ShippedDetailsBody`. See `order-details-page-EXECUTION-PLAN.md` §1.

## OPEN BUG — checkbox multi-select collapses to one row

**Status (2026-08-01):** FIXED. Root cause was the adopt-effect race on the
1→2 transition (`selectOnly` after derive-open nulled `railOpenedIdRef`), not
only the checkbox bubble (`stopPropagation` was already present). Fix: gate
adopt when the set already contains the open id + `data-select-gutter` bail in
`handleRowAction`. Regression: `checkbox multi-select keeps both rows in the
set`. Verified twice via Set ship-by → "Applies to all 2 selected orders."

<details><summary>Original bug notes (kept for history)</summary>

**Symptom:** `dashboard-bulk-actions` → *Set ship-by opens a date picker scoped
to the selection* fails every run. The dialog reads **"Applies to 1 selected
order."** after the spec checks TWO checkboxes.

**Cause:** the checkbox sits inside the row, so its click bubbles to the row's
`onClick` → `handleRowAction` → (Phase 1) `selectOnly(id)`, which REPLACES the
set. Sequence: check A → `{A}`; check B → `toggle` adds B → bubbled row click
`selectOnly(B)` → `{B}`. Pre-Phase-1 the row handler only toggled the inspector,
so the bubble was harmless — that is why this appeared only now, and why every
single-row spec still passes.

**Fix (one of, pick the first that holds):**
1. Stop the bubble at the source — `stopPropagation()` in the select-gutter
   checkbox handler in `OrdersQueueTableRow.tsx` (search `onToggleSelect`).
   Cheapest and most local.
2. Or make `handleRowAction` ignore events whose target is inside the select
   gutter (`event.target.closest('[data-select-gutter]')`), mirroring the
   existing rule that a row-level Enter must bail when the target is inside a
   row control.

**Verify with:** `npx playwright test dashboard-bulk-actions --project=qa-desktop -g "Set ship-by"`
— it must read "Applies to all 2 selected orders."

</details>

## HANDOFF — start here

### FIXED — the wrong-mount-branch bug (2026-08-01)

`RailActionRegion` is mounted in `ShippedDetailsPanel`'s **`isOrderRecord`**
branch, which requires `context === 'dashboard'`. The **Pending lane opens with
the FULFILLMENT context** (that is why *Pending opens on Documents* passes), so
on the lane that matters the region never renders — a selection has ZERO
actions. Invisible while the capsule was up, because the labels came from the
capsule.

**Fixed:** the region is now mounted ABOVE the branch split in
`ShippedDetailsPanel`, so it renders for every panel context. It self-gates on
the rail-actions store, so mounting it everywhere is safe — only a surface
calling `useOrderRailSelection` lights it up.

**Two failures survive and neither is caused by step C** (both reproduce with the
capsule restored): `dashboard-bulk-actions` → *Set ship-by opens a date picker
scoped to the selection* (`toContainText`), and `dashboard-inspector-non-modal` →
*resizable, clamps to the derived cap* (the A/B-confirmed strict-mode locator).
Two others flaked one run each (*Export CSV*, *Pending → Testing hand-off*) and
passed in the other.
Proof it is reproducible: two identical runs, `dashboard-bulk-actions` 1/2/3 red
with `Received array: []` for the action labels.

### The earlier "openOrderId gets stripped" theory was WRONG (disproved 2026-08-01)

It was a **misattribution**. Every path that can strip the param was
instrumented (`replaceOpenOrderId(null)`, `closeRecord`, the seen-in-queue
guard, the occupancy effect's close/clear branches) and both repro paths were
driven with a console-capturing spec. Result: the record opens, `?openOrderId=`
sticks, the aside mounts, **nothing closes it**. The specs were then re-run with
the action region MOUNTED: `dashboard-bulk-actions` 4/4 green and *Enter on a
focused row* green.

The original "bisect" was coincidence. Those runs happened while another session
was mid-edit in this tree — the same window where a rename broke the dev build
and `customerName` type errors appeared and vanished between two typechecks.

**These dashboard specs are FLAKY on a busy tree.** `dashboard-bulk-actions`
alone has gone 4/4 -> 0/4 -> 4/4 -> 3/4 across runs, with no code change between
some of them. `dashboard-inspector-non-modal`'s failing subset moves run to run.
Never attribute a failure here from a single run; A/B it with `railSelection`
off, or run it twice.

**Consequence: Phase 2 steps A+B are believed GOOD and step C's revert was
unnecessary.** The capsule is currently restored (as asked) with the Phase 2
mounts off. Re-applying step C is now a decision, not a bug fix:

1. `RAIL_ACTION_REGION_IN_INSPECTOR = true` in `ShippedDetailsPanel.tsx`
2. `useOrderRailSelection(orderView)` in `app/dashboard/page.tsx`
3. swap the capsule block for `<OrderRailShell />` in `DashboardOrdersView.tsx`
   (its revert note says exactly what to undo) and drop `bulkBarInset`
4. delete `tests/e2e/dashboard-bulk-bar-inset.spec.ts` — a capsule-only guarantee
5. run the dashboard specs **twice** before believing either result

Still genuinely pre-existing and unrelated: *the inspector is resizable, clamps
to the derived cap* — `getByTestId('edge-resize-collapse')` matches both the
context rail's handle and the inspector's (strict-mode violation). A/B-confirmed.

**Lane:** current checkout (`main`) — no ad-hoc branch.
**Surface:** `/dashboard` outbound orders grid (Pending · Tested · Packed · Shipped).
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS. USAV is dogfood only.

**Paste for a new session:**

> Read `docs/todo/order-rail-selection-plane-PLAN.md` and start at the first open
> phase. Do not re-open §1 decisions — D1 in particular was an explicit product
> call, not an oversight. Verify claims by **call sites**, not docblocks.

---

## 0. Verdict

On the dashboard orders grid, `ContextualSelectionBar` (the bottom glass capsule)
is **removed** and the right rail becomes the one selection plane. Selecting rows
opens the rail; **selection cardinality decides what the rail shows**:

| Selected | Rail shows |
|---|---|
| 0 | nothing |
| 1 | the full record inspector (existing `detail:order`) |
| 2 | a divergence-first compare pane |
| 3+ | a staged roster + batch actions ("bring to staff's attention") |

The eight actions the capsule carried are **rehomed into the rail**, not dropped.
Flag and ship-by become inline rail forms; assign stays modal (it is a per-record
walk); the rest are fire-and-toast.

> **One selection, one slot, cardinality decides the body.** Never re-introduce a
> bottom action bar on this surface, and never let the rail and the grid disagree
> about what is selected.

---

## 1. Decisions locked — do not re-open

| ID | Ruling | Why |
|---|---|---|
| **D1** | **Selection opens the rail.** Checking a row is what mounts the rail — there is no separate "arm" gesture and no capsule trigger. | Explicit product call (2026-07-31). The earlier proposal kept the capsule as the trigger to protect set-building; that was overruled. The set-building cost is accepted and paid for by the rail's per-row `[×]` roster (Phase 4). |
| **D2** | `ContextualSelectionBar` is removed **from this display only**. The shared component stays for its other consumers. | 8 other surfaces still mount it (receiving, unbox, photos, repair, packer, shipping, tech ×2). Deleting the component is a later wave, not this one. |
| **D3** | **The check-set is the only selection.** Row-body click replaces the set with that one row; the checkbox adds/removes; shift-click extends. `?openOrderId=` survives as a deep-link **entry point** that seeds the set on mount. | The grid has two independent selection channels today (`?openOrderId=` vs. the bus). One rail cannot serve both. Merging is the feature. |
| **D4** | **Closing the rail clears the selection.** | The capsule's `X` was the only clear affordance. Without this, rows stay checked with no visible way to un-check them and the next action fires over a forgotten set. |
| **D5** | Occupant ids are **stable per mode, never per record** — `detail:order`, `detail:order-compare`, `detail:order-batch`. | `RightRailHost` keys `AnimatePresence mode="wait"` on the id. A per-record id makes every row→row step a 0.4s exit → empty slot → 0.4s enter. See `.claude/rules/display/motion-crossfade.md` → queue-processing exception. |
| **D6** | Compare is a **read** plane. No merge, no bulk edit, no inline correction. | The moment it edits it is a second record plane, and the two drift. Editing stays on the record plane (1-row inspector / `/o/[orderId]`). |
| **D7** | `orderBulkActionKeys(view)` stays the lane SoT for which actions exist. | One edit site keeps the rail, the inspector, and the specs in agreement. Already load-bearing — do not inline `isPostPack` arithmetic into the rail. |
| **D8** | Mobile renders the same three bodies in a **bottom sheet**, not the rail. | A ~420px non-modal float is a takeover at 375px. This is a responsive container swap — the capsule and its icon-only row are still deleted. |

**What not to build**

- A second bottom bar, a "selection toolbar", or a morphing top chrome band.
- A per-record occupant id (`detail:order:4821`) — see D5.
- A second timeline component for the change band — adapt into `TimelineItem[]`
  and render through `TimelineSection` (`.claude/rules/display/reference-timeline.md`).
- A second photo/compare grid — the compare pane is a fact stack, not a `LedgerGrid`.
- A focus trap on the rail. It is non-modal by contract
  (`.claude/rules/source-of-truth.md` → Right-rail modality).

---

## 2. Anatomy

All three modes register at `RIGHT_RAIL_PRIORITY.detail`, `modal={false}`,
`closeOnOutsideClick` off (the grid stays live underneath).

```
┌─ 1. SELECTION BAND   (shared — rehomes the capsule's chrome) ─┐
│  6 of 142 selected          [Select all] [Clear] [collapse ‹] │
├─ 2. CHANGE BAND      (shared — honest absence: hidden at 0)   ┤
│  ● 3 of these changed since you selected them        [review] │
├─ 3. BODY             (mode-specific) ─────────────────────────┤
│  1 → record fact stack (editable)                             │
│  2 → compare pane (read-only, divergence-first)               │
│  N → staged roster, each row removable                        │
├─ 4. ACTION REGION    (shared — the ex-capsule actions) ────────┤
│  primary CTA + lane-scoped secondaries + separated danger     │
└───────────────────────────────────────────────────────────────┘
```

Geometry from `DETAIL_STACK_RESIZE` / `DETAIL_STACK_COLLAPSE` +
`HorizontalEdgeResizeHandle` (`edge: 'leading'`, `placement: 'outset'`) — same as
the inspector today. All three modes are resizable + collapsible.

### Action region

| Action | 1 | 2 | N | Form |
|---|---|---|---|---|
| `flag` | ✓ | ✓ | ✓ | **inline** — five named ids from `ORDER_ROW_FLAG_IDS`. `BulkFlagDialog` deleted. |
| `ship-by` | ✓ | ✓ | ✓ | **inline** — one date field. `BulkShipByDialog` deleted. |
| `assign` | ✓ | ✓ | ✓ | **stays modal** — `WorkOrderAssignmentCard` is a per-record prev/next walk. |
| `copy` · `export` | ✓ | ✓ | ✓ | fire-and-toast |
| `print` · `print-shipping` | ✓ | ✓ | ✓ | fire-and-toast, lane-scoped |
| `delete` | ✓ | ✓ | ✓ | `requestConfirm`, danger tone, visually separated |

The inline forms are the actual win: the operator sees the rows **while** choosing
the flag. The scrimmed dialog hid exactly the evidence the decision needed.

---

## 3. Phases

### Phase 0 — the resolver ✅ **DONE**

- `src/lib/right-rail/selection-occupancy.ts` — pure, dependency-free.
  `resolveRailOccupancy(ids)` → `none | inspect | compare | attention`, plus the
  stable occupant-id registry and `normalizeRailSelection`.
- `src/lib/right-rail/selection-occupancy.test.ts` — count boundaries, ordering
  stability, id hygiene, D5 (id never carries a record).

Run: `npx tsx --test src/lib/right-rail/selection-occupancy.test.ts`

### Phase 1 — merge the selection channels (D3) ✅ **DONE**

Behind `railSelection` (opt-in prop, on only from `DashboardOrdersView`). The
grid has **seven** mount sites and six of them pass
`DASHBOARD_ORDERS_SELECTION_SCOPE` — including Labels, Staged, and both Review
tables — so the scope could not gate this and an explicit prop was required.

- `useTableSelectMode` gained `selectOnly(id)` (replace) + `clear()`.
- `useOrdersQueueSelection` split `handleRowClick` into `openRecord` /
  `closeRecord`; the toggle is now composed from them. The `seenSelectedIdRef`
  deep-link-on-boot guard is untouched.
- `OrdersGridView` derives the open record from the check-set via
  `resolveRailOccupancy` — **the resolver's first consumer**. Plain click
  replaces the set, shift-click extends, checkbox adds/removes, re-click of the
  sole selection clears.

**`railOpenedIdRef` is load-bearing — do not simplify it away.** It separates
three states that look identical from a single render:

| set | record | ref | meaning |
|---|---|---|---|
| `{4821}` | `null` | `4821` | operator CLOSED it → clear the set |
| `{4821}` | `null` | `null` | checked, rows not landed → wait |
| `{}` | `4821` | `null` | external open (deep link / search / Recents) → adopt |

Both wrong versions were built and caught by E2E first: without the close
branch the inspector re-opened itself and could not be dismissed; with the close
branch ungated, `?openOrderId=` on reload was closed during the one commit
before the set adopts it.

**Interim state:** the capsule still renders (removal is Phase 2), so selecting
one row now opens the inspector *and* shows the capsule. Multi-select keeps its
capsule actions until the rail's action region lands — deliberately, so no
sequencing gap strands multi-select without actions.

### Phase 2 — the shell + the 1-row path, capsule removed

- New `src/components/dashboard/rail/OrderRailShell.tsx` (regions 1, 2, 4).
- `useDashboardBulkSelection` → `useOrderRailSelection`. **Keep all eight
  handlers verbatim** — each encodes a real defect fix:
  - `handleConfirmFlag` reports off server `updatedIds` (stale-selection honesty)
  - `handlePrintShippingLabels` uses `Promise.allSettled` (one bad doc ≠ dead run)
  - `handleCopyDetails` falls back to `execCommand` (plain-HTTP LAN has no
    `navigator.clipboard` — the button silently did nothing before)
  - `handlePrintLabels` catches the lazy `bwip-js` chunk fetch
- Delete from this surface: the `ContextualSelectionBar` block in
  `DashboardOrdersView` (lines ~136–146), `selectionActions` / `bulkBarVisible`
  props, and `bulkBarInset` threading through `UnshippedTable`,
  `PackedOrdersTable`, `DashboardShippedTable`, `UnshippedShelfBoard`.
  The grid reclaims `SELECTION_BAR_SCROLL_INSET` permanently.
- Wire `onClose → emitToggleAll(scope, 'none')` (D4) and `useRegisterOverlay`
  for Escape ownership (the grid's capture-phase listener beats bubble).

### Phase 2 status — ✅ DONE, E2E verified twice (2026-08-01)

Built in three additive steps so each stopping point is safe:

- **A.** `src/lib/right-rail/rail-actions-store.ts` — module store bridging the
  grid's selection to the rail. Needed because the 1-row body
  (`ShippedDetailsPanel`) is mounted by `GlobalDetailStackHost` off the **root
  layout**, not under the dashboard page — there is no prop path between them.
  Publishing is a **separate hook**, `useOrderRailSelection` — a thin wrapper
  that calls `useDashboardBulkSelection` and owns the publish + unmount-clear
  effects. It is a wrapper rather than an option flag because Pack and Shipping
  call the same base hook and still run the capsule: a surface opts in by
  importing the wrapper, so there is no boolean to pass wrongly and no dead
  publish branch inside the shared hook. `publishRailActions` keeps its
  element-wise `rows` identity guard — `selectedRows` can retain identity across
  publishes while scope/total/actions stay equal, so without it the rail's
  footer churns on unrelated grid renders.
- **B.** `rail/OrderRailActions.tsx` (selection band + action region, self-gating
  on an empty store) and `rail/OrderRailShell.tsx` (occupant
  `detail:order-batch`, 2+ rows, roster body). The action region mounts in BOTH
  the inspector footer and the shell, so the action set does not move when the
  count crosses a boundary.
- **C.** Capsule deleted from `DashboardOrdersView`; `bulkBarInset` no longer
  passed by this display (the prop **stays** on the tables — Pack, Support, and
  Shipping still need it). `tests/e2e/dashboard-bulk-bar-inset.spec.ts`
  **deleted**: it existed only to prove the capsule's reserve on this display,
  and that guarantee no longer exists here.

**Verified:** `tsc --noEmit` clean, eslint clean, resolver unit tests 12/12,
and `dashboard-bulk-actions` + `dashboard-selection-handoff` **6/6 green on two
consecutive `qa-desktop` runs** (2026-08-01). `npm run verify` green except the
pre-existing doc-catalog drift noted at the top of this file.

```
npx playwright test dashboard-bulk-actions dashboard-selection-handoff --project=qa-desktop
```

Suspect first if `dashboard-bulk-actions` ever goes red again: it checks a row
and then reads action `aria-label`s off the page. Under Phase 1 that check now
also opens the inspector, so (a) the labels moved into the inspector footer and
may need scrolling into view, and (b) the panel may overlap the row the test
then interacts with — the same grip-occlusion class of problem as §5.

### Phase 3 — compare (2 rows)

- `OrderRailCompare.tsx`, occupant `detail:order-compare`.
- Fact-per-row, two columns. **Divergent rows carry the ink; equal rows recede**
  (`text-text-soft`) + a "differences only" toggle in the selection band.
- Values through the presentation SoTs: `CopyChip` family, `conditionLabel` +
  `condition-tone`, `source-platform`, `formatDateKeyShort`.
- Missing on one side is `—` (`GridCellDash` / `LedgerValue` fallback) and
  **counts as a divergence** — "we have no serial for this one" is the finding.
- URL-durable: `?compare=<a>,<b>`. Two ids are shareable and reload-safe; an
  N-row batch is not and stays on the ephemeral bus.

### Phase 4 — attention (3+ rows)

- `OrderRailBatch.tsx`, occupant `detail:order-batch`.
- Roster with per-row `[×]`. This is what pays for D1: the set is refined against
  the rows the operator can see, instead of close → re-check → reopen.
- Flags from `ORDER_ROW_FLAG_IDS` only — no free-color swatch, no sixth flag.
- One write: `POST /api/orders/bulk-flag` already takes `orderIds[]` and returns
  `updatedIds[]`. Confirm-then-commit, never optimistic.
- Growth edge (later): assign (`assignOrder` already takes `orderIds[]`) then a
  batch note (needs a column or an `entity_notes` write).

### Phase 5 — the change band

- `RailChangeBand.tsx`. Merge the existing adapters (`orderAuditToTimeline` +
  `inventoryEventsToTimeline` + `stationActivityToTimeline`), sort desc, filter
  to `at > lastSeenAt`. Collapsed to one line; expands into `TimelineSection`.
- `lastSeenAt` per staffer per record. `localStorage` (`rail:seen:order:<id>`)
  first; promote to `staff_preferences` once proven.
- Hidden entirely at zero delta — do not print "No changes".
- Highest value in **attention** mode: "3 of 6 changed since you selected them"
  is exactly the stale-set hazard `bulk-flag` already guards server-side.

---

## 4. Guards

- `selection-occupancy.test.ts` — count→kind boundaries (0/1/2/3), ordering
  stability, id hygiene, and that no occupant id carries a record id (D5).
- New guard: `DashboardOrdersView` imports no `ContextualSelectionBar` and no
  `bulkBarInset`, so the capsule cannot creep back in.
- Playwright on `qa-desktop` against `QA_FIXTURE_*` (never the dogfood tenant):
  check 1 → inspect; check a 2nd → compare; check a 3rd → batch; **close the rail
  → zero rows checked**; flag over a deliberately stale id → honest count.
- `npm run verify` before done. Baselines only shrink.

**Known-red on `qa-desktop`, both PRE-EXISTING (verified by A/B with
`railSelection` off — they fail identically either way). Do not "fix" them as
part of this plan without confirming they are still red on a clean tree:**

1. `dashboard-inspector-non-modal` → *resizable, clamps to the derived cap* —
   strict-mode violation: `getByTestId('edge-resize-collapse')` resolves to **2**
   elements. The testid lives on the shared `HorizontalEdgeResizeHandle`, which
   the left context rail and the right inspector both mount. The spec's locator
   needs scoping to the inspector.
2. `dashboard-inspector-non-modal` → *the innermost open overlay owns Escape* —
   the resize grip intercepts the row info-menu click (see §5).

---

## 5. Accepted risks (named, not solved)

- **Occlusion becomes constant.** ✅ **RESOLVED 2026-08-01 — this risk landed, and
  it is why the panel now PUSHES.** The rail covered the trailing columns only
  when someone opened a record; under D1 it is up whenever anything is selected,
  so the occlusion this bullet accepted as a watch-item became the operator's
  first complaint. Ruling: the right edge pushes and takes its width from the
  LEFT (spine → context rail) before it overlaps the grid. Laws amended in
  `AGENTS.md` + `.claude/rules/source-of-truth.md` → Right-rail modality;
  implementation is §3.3 of `docs/todo/right-panel-display-HANDOFF.md`.
  The frozen identity pane (`select · order · title`) stays visible either way.

  **Already observed, and it is not hypothetical.** `dashboard-inspector-non-modal`
  → *the innermost open overlay owns Escape* times out because the inspector's
  32px resize grip (`detail-inspector-resize`, `-left-1.5`) sits over the row's
  info-menu button and eats the click. That failure **reproduces with
  `railSelection` off**, so it predates this work — but Phase 1 makes the
  inspector open far more often, which turns an occasional collision into a
  routine one. Candidate fixes: shrink the grip's hit-box to the panel edge, or
  give it `pointer-events` only on hover of the panel.
- **"Open A while B…F are checked" is gone** (D3). No current flow uses it. That
  is what the merge spends.

---

## 6. Open questions

- Does the batch roster need its own sort, or does it inherit the grid's order?
  (Inherit first; add only if the roster grows past ~20.)
- Should `?compare=` survive a lane flip, or clear with the selection like
  everything else? (Lean clear — a compare of two rows not in the lane is a
  ghost.)
- Server-backed `lastSeenAt` is a migration — Ask-first per
  `.claude/rules/pattern-evolution.md`.
