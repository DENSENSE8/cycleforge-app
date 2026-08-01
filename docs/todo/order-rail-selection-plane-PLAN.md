# Order rail selection plane — the right rail replaces the bottom capsule

**Status (2026-08-01):** Phases 0–1 landed and green. **Phase 2 steps A+B built
  but UNMOUNTED; step C reverted — the capsule is back.** Mounting the rail
  action region inside the inspector makes the record open and immediately close
  itself, which left a 1-row selection with no actions at all. Reverted rather
  than shipped: `dashboard-bulk-actions` (4) and `dashboard-bulk-bar-inset` (3)
  are green again. Phase 2 resumes at the bug below. Phases 3–5 open.

## HANDOFF — start here

**The one open bug.** `RailActionRegion` (`components/dashboard/rail/OrderRailActions.tsx`)
mounted inside `ShippedDetailsPanel` makes the open record close itself: the URL
goes `?openOrderId=N` → back to `?unshipped`. Bisected to exactly that mount —
removing it turns 4 red specs green. Root cause NOT found.

**Prime suspect RULED OUT (checked 2026-08-01).** The theory was that
`selectionActions` churns identity every render, firing the publish effect on
every render. It does not: `loadStaff` is `useCallback(…, [])`, `confirmAssignment`
is `useCallback(…, [onAssigned])` and `useDashboardBulkSelection` calls
`useWorkOrderAssignment()` with no args so `onAssigned` is always `undefined`.
The other seven handlers are `useCallback` with empty/primitive deps and
`laneActionKeys` is `useMemo([orderView])`. **Do not re-run this check.**

**Remaining candidates, in order:**
1. `deleteOrderRow` (`useDeleteOrderRow()`) is a React Query mutation result and
   changes identity when mutation state changes; `handleDelete` depends on it, so
   `selectionActions` CAN churn — just not every render. Verify by logging the
   publish rate before theorising further.
2. Not identity churn at all: instrument what actually strips `openOrderId`.
   `closeRecord` → `onCloseRecord` → `dispatchCloseShippedDetails` is one path;
   `useOrdersQueueSelection`'s seen-in-this-queue guard (lines ~46-70) is the
   other, and it fires when the record leaves `visibleRecords`. A store
   notification that re-renders the grid mid-fetch could empty that list for one
   commit. **Put a breakpoint / console trace on both before changing code** —
   this bug has already survived two plausible-sounding theories.

Unrelated but noticed: `technicianOptions` / `packerOptions` in
`useWorkOrderAssignment` are rebuilt with bare `.filter().map().sort()` on every
render (no `useMemo`). Not this bug — they are not in `selectionActions`' deps —
but they churn for every consumer that does read them.

**Reproduce:**
1. Set `RAIL_ACTION_REGION_IN_INSPECTOR = true` in `ShippedDetailsPanel.tsx`.
2. In `app/dashboard/page.tsx` pass `{ publishToRail: true }` to the hook.
3. `npx playwright test dashboard-inspector-non-modal --project=qa-desktop -g "Enter on a focused row"`
   — red with the mount, green without.

**Then, and only then**, re-do step C (remove the capsule) — the removal is
mechanical and documented in the revert note in `DashboardOrdersView.tsx`.

**Do not trust a single run of `dashboard-inspector-non-modal`.** It oscillates:
across four runs the failing subset moved between the Escape test, the
record→record swap, and the scrim test, with 14–34s timings on a tree another
session is actively editing. Only ONE failure there is A/B-confirmed
pre-existing (*resizable, clamps to the derived cap* — a strict-mode violation
where `getByTestId('edge-resize-collapse')` matches both the context rail's
handle and the inspector's). A/B any other failure with `railSelection` off
before attributing it.
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

### Phase 2 status — code-complete, RE-RUN E2E BEFORE TRUSTING

Built in three additive steps so each stopping point is safe:

- **A.** `src/lib/right-rail/rail-actions-store.ts` — module store bridging the
  grid's selection to the rail. Needed because the 1-row body
  (`ShippedDetailsPanel`) is mounted by `GlobalDetailStackHost` off the **root
  layout**, not under the dashboard page — there is no prop path between them.
  Publishing is **opt-in** (`useDashboardBulkSelection(view, { publishToRail })`)
  because Pack and Shipping call the same hook and still run the capsule.
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

**Verified:** `tsc --noEmit` clean, eslint clean, resolver unit tests 12/12.
**Not verified:** Playwright. The run that mattered went red 5/12 while the dev
server was degrading and then refusing connections, so those failures cannot be
attributed. Re-run once :3050 is back:

```
npx playwright test dashboard-bulk-actions dashboard-inspector-non-modal dashboard-selection-handoff --project=qa-desktop
```

Suspect first if `dashboard-bulk-actions` is genuinely red: it checks a row and
then reads action `aria-label`s off the page. Under Phase 1 that check now also
opens the inspector, so (a) the labels moved into the inspector footer and may
need scrolling into view, and (b) the panel may overlap the row the test then
interacts with — the same grip-occlusion class of problem as §5.

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

- **Occlusion becomes constant.** The rail covered the trailing columns only when
  someone opened a record; now it is up whenever anything is selected. The frozen
  identity pane (`select · order · title`) stays visible and the rail is
  resizable + collapsible, but at 1440px the trailing columns sit behind it most
  of the time. Watch it once live; the collapse strip is the escape hatch.

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
