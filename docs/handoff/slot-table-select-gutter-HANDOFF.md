# Slot-table select gutter — contextual status, rail, fold band

**Lane:** `cycleforge-lanes/prod` (`prod/worktree-2026-09-11`)
**Cohort:** `slot-table` — SoT is the ENGINE + every `PRODUCT_TABLES` peer, never To-ship alone.
**Gate:** `pnpm run eval:cohort slot-table` · `node ~/Projects/Garisek-OS/tools/eval-engineering/cursor-eval.mjs --root . --fast`

---

## What the gutter is, in words (use this vocabulary)

The leftmost track of the slot data table — `data-select-gutter`, 24px wide
(`COMPOUND_SELECT_TRACK_REM`), 48px tall (`COMPOUND_ROW_PX`) — now carries four
named things. When you talk about it, name the part:

| Name | What it is | Where |
| --- | --- | --- |
| **Select gutter** | the 24×48 leftmost CELL; owns everything below | `CompoundGridCell` (leaf) · `SlotTableGroupParentRow` (band) |
| **Leading edge rail** | the 3px full-height triage bar flush left | `CompoundEdgeRail` |
| **Rail traveler** | the 1px tick that bobs down the rail on a shared clock | `edgeMarkTravelY` |
| **Resting status face** | the 16px glyph the gutter shows when nobody is pointing at the row | `CompoundSelectStatusFace` |
| **Mark rotation** | two marks taking turns in that one box | `edgeMarkFlashOpacity(now, sec, index, count)` |
| **Selection square** | the checklist face hover hands the box back to | `GridSelectSquareFace` |
| **Reach affordance** | any glyph that paints only under hover / focus / no-hover pointer | detail chevron, fold chevron |

"Vertical status pulsating alignment" = **the leading edge rail with its synced
traveler**, and the glyph beside it is **the resting status face**. They share
one rAF clock (`edge-mark-pulse.ts`), which is why every marked row on screen
pulses in phase.

---

## Shipped in this pass (all operator rulings, 2026-09-15)

1. **Contextual gutter.** At rest the box paints the row's triage mark — urgent =
   `Zap` in `text-text-warning`, shortage / exception = `AlertTriangle` in
   `text-text-danger`. Row hover / keyboard focus on the checkbox /
   `(hover: none)` hands the same box back to the selection square. A ticked row
   keeps the accent square at every pointer position. Ordinary rows stay EMPTY.
2. **Multi-status rotation.** A row that is urgent AND short carries two marks
   and the box alternates (one layer per mark, `index`/`count` slots, `0 → 1 → 0`
   per slot so only one is ever visible). Reduced motion stands the hottest mark
   still.
3. **Shortage pulses red.** `ordersEdgeMark` now returns an `attention` rail
   (`bg-rose-500` + `bg-rose-100` tick) for exception / out-of-stock, not just
   the urgent yellow — `kind` on `edgeMark` is what the glyph reads.
4. **Rail is CELL-owned, full height.** `data-edge-mark-host` + `relative` on the
   gutter cell; measured 47px inside a 48px border-box cell (the missing pixel
   is the row seam). It used to live inside `CompoundSelect`, which on a detail
   row is only the top half — that is what clipped it at the chevron.
5. **Chevrons are reach affordances.** Leaf detail chevron: hidden while closed,
   stands when open. Parent fold chevron: hidden in BOTH states — hover only.
   The buttons keep their full hit plane and `aria-expanded` label at every
   opacity; only the glyph waits.
6. **Pin, not centring.** Gutter content reserves
   `COMPOUND_GUTTER_RAIL_INSET_CLASS` (`pl-[3px]`) so the 3px rail never crowds
   the mark — that is what *"displayed centered in the middle"* bought, and it
   is HORIZONTAL. The mark itself (checklist square + resting status glyph) is
   pinned to the TOP: `COMPOUND_GUTTER_MARK_TOP_PIN_CLASS` (`items-start pt-1`,
   the 2026-09-04 ruling, which STANDS). A pass on 2026-09-15 read the words as
   the middle of the 48px row and floated the mark there; the operator reverted
   it — *"the checklist icon should be pinned to the top and the drop-down icon
   should be below the checklist icon"*. The chevron lives in
   `COMPOUND_GUTTER_CHEVRON_BAND_CLASS` (`absolute inset-x-0 bottom-0 h-6`), so
   the `COMPOUND_TWO_LINE_CLASS` stack is GONE from both select gutters and the
   mark plane is the whole cell again (the checkbox's hit plane with it).
   Measured from the gutter cell's top edge, rest and hover, leaf · group child
   · fold band: square 4–20 (cy 12) and status box 4–20 (cy 12) — one line;
   chevron band 23–47, glyph 27–43 (cy 35), svg 29–41; rail 0–47 × 3px. The
   group CHILD rows carry the same chevron (`data-row-detail`, opacity 0 → 1 on
   row hover) — that is where child-level detail will grow.
7. **Band selection feedback.** The fold parent washes through
   `ledgerRowFillClass({ selected: checked === true })` — the same cascade the
   leaves use. `'mixed'` deliberately does not wash.
8. **Band status rollup.** The band's pill rolls up
   `resolveRowStatus(row, queueMode)` — the resolver its leaves paint — instead
   of the raw `shipment_status` column, which is blank on a shortage and left the
   band silent under five OUT OF STOCK children. `queueMode` is now a required
   `QueueGroupRow` prop.
9. **`group/row` on the shared shell.** `LedgerGridLeafRow` and
   `SlotTableGroupParentRow` declare it, so the hover swap fires on every peer
   (only `OrdersQueueTableRow` declared it before — the docblocks claiming
   otherwise were stale).

10. **A fold speaks with TWO soft marks; neither is black.** MEMBERSHIP is
    `SLOT_TABLE_GROUP_CHILD_RAIL_CLASS` — `w-0.5 bg-border-default`, absolute on
    each child's IDENTITY track, mounted ONCE in `renderCompoundGridCell` and
    gated on `view.quietIdentity`, so To-ship, Unbox and Incoming inherit it
    (Incoming/Unbox reach the same mount through `ReceivingCompoundCells`).
    CLOSE is `SLOT_TABLE_GROUP_FOLD_INNER_CLASS` on `SlotTableGroupFold`, now
    `bg-border-default` — operator 2026-09-15, *"instead of a black line
    displaying below the line"*, superseding the 2026-09-14 *"black and more
    visible"* ruling (that ink was only load-bearing while the close was the
    group's ONLY evidence). Measured on To-ship: 5/5 children railed, rail ink
    `rgb(203,213,225)`, 2px × 47px at x 272–274 with the triage bar at 224–227 —
    45px of clear air, `pointer-events: none`; fold close 1px, same ink. The
    rail may NEVER move into the select gutter: its first 3px are the triage
    rail, which is per-row and conditional, so one slot would mean "urgent" on
    one row and "child" on the next down a mixed group.
11. **The action strip speaks in verbs** (operator 2026-09-15). A button label
    is the verb it performs from the current state: the urgent pill reads
    `Clear urgent` when the selection is all-urgent and `Mark urgent` otherwise
    (`aria-pressed` + yellow carry the state); `Out of stock` became `Report
    out of stock`; order is state-changers → utility verbs → the one success
    terminal verb (`Mark scanned out`); `Create rule` moved into the `⋮`
    overflow (hotkey `R` unchanged). Two staleness bugs found through the
    relabel and fixed: `assignmentPatchFromEvent`/its guard dropped `isUrgent`
    (the clear 200'd, toasted, and never reached the unshipped cache — pinned
    by `assignment-patch.test.ts`), and the strip derived urgency from the rail
    store's click-time snapshots (`liveRecords` on `MorphingRowActionMenu` now
    wins by id, so the label AND the toggle direction answer current data).
    Verified live: mark → POST 200 → rail paints → pill flips to `Clear urgent`
    → row pins to top; clear reverses all of it; zero page errors.

### Files

```
src/components/tables/compound/
  compound-select-status.ts            (new) resolver — heat-ordered marks
  compound-select-status.test.ts       (new)
  CompoundSelectStatusFace.tsx         (new) the resting face + rotation
  compound-select-gutter-context.test.ts (new) mounted paint regressions
  edge-mark-pulse.ts                   flash/rotation on the shared clock
  compound-row-chrome.ts               rail width/inset + …MARK_TOP_PIN_CLASS + …CHEVRON_BAND_CLASS
  CompoundEdgeRail.tsx                 width from the SoT
  CompoundSelectStatusFace.tsx         mark box = the square's 16px box (one line under the pin)
  CompoundCells.tsx                    CompoundSelect: statuses + top pin, both faces
  CompoundGridCell.tsx                 cell-owned rail, chevron BAND (no two-line stack)
  SlotTableGroupParentRow.tsx          band: one contextual check, hover chevron band, wash
  compound-gutter-flush.test.ts        top pin + detail-row band, mounted
  compound-row-model.ts                edgeMark.kind
src/lib/orders/orders-compound-view.ts ordersEdgeMark: red attention rail
src/components/dashboard/orders-queue/QueueGroupRow.tsx  queueMode + rollup
src/design-system/components/grid/LedgerGridLeafRow.tsx  group/row
src/lib/tables/slot-table-cohort.ts    law + 11 new contract predicates
src/design-system/pinned.json          4 new/rekeyed pins
tools/design-mcp/server.mjs            compound home (faces + chrome SoT)
.cursor/mcp.json · tools/design-mcp/cursor-plugin/mcp.json  server → this lane
```

---

## Design-system MCP — what changed and how to check it

The live `design-mcp` server was pointed at `~/Projects/cycleforge-app` (same
repo, `main`, behind this lane), which is why it answered *"no such file:
CompoundSelectStatusFace.tsx"*. Both configs now point at this lane
(`DESIGN_MCP_REPO` + script path). **The running process keeps the old target
until the client restarts it** — until then the CLI is authoritative:

```bash
node tools/design-mcp/ds.mjs contract "row status icon on non-hover"   # → CompoundSelectStatusFace
node tools/design-mcp/ds.mjs contract "pulsating left bar"             # → CompoundEdgeRail
node tools/design-mcp/ds.mjs contract "fold parent band selection feedback"  # → SlotTableGroupParentRow
node tools/design-mcp/ds.mjs contract "centre the check in the gutter" # → compound-row-chrome
node tools/design-mcp/smoke.mjs                                        # → smoke: all good
```

Catalog ids are **filenames**. A pin keyed by an exported symbol
(`"CompoundItem"`) merges onto nothing — that one was rekeyed to
`CompoundCells`. `src/components/tables/compound` is a home now; the walk does
NOT recurse, so a new face there must be added to its `match` regex or its pin
is law no agent can find.

Do NOT hand-port these edits into `cycleforge-app`: same git remote, so the
duplicate hunk conflicts on merge. The registration travels with the branch.

---

## Verification recipe

```bash
npx tsx --test src/components/tables/compound/*.test.ts \
  src/lib/tables/slot-table-cohort.test.ts \
  src/lib/orders/orders-compound-view.test.ts \
  src/components/dashboard/orders-queue/*.test.ts
pnpm run eval:cohort slot-table
node ~/Projects/Garisek-OS/tools/eval-engineering/cursor-eval.mjs --root . --fast
```

Browser proof (dev server on **:3077** in this lane, storage state
`tests/.auth/admin.json`) — a throwaway Playwright script against
`/shipping/orders` is enough; assert `[data-select-status-face]`,
`[data-select-status-marks]`, `data-edge-mark-host`, and computed opacity of
`[data-row-detail] span` / `[data-group-fold] span` at rest vs hover. Do not
flip real `is_urgent` data to see the rotation unless you revert it through the
same operator verb (`[data-testid="morphing-urgent"]`) — that is how the
urgent+short case was verified and restored on 2026-09-15.

---

## Known red, NOT from this work

Both fail at HEAD or come from other agents' uncommitted trees — do not "fix"
them here:

1. `src/lib/tables/field-catalog/unit-tsn-links.test.ts:230` — expects
   `view.orderId === '55123'` while the untracked
   `src/components/inventory/tsn-links-grid/unit-tsn-links-row-view.ts`
   deliberately sets `orderId: null` (identity moved to `identityFace`).
2. `src/components/tables/compound/compound-row-model.test.ts` — 3 failures:
   the **Daily** family declares an extra materialized `status:1` track. Source
   is the locally-modified `src/lib/daily-checks/daily-grid-layout.ts` (daily
   checklist WIP). Clean at HEAD.
3. `src/lib/kiosk/cart-compound-view.test.ts` — 6/8 fail at HEAD too (kiosk cart
   money/chrome WIP).

---

## Next iterations (pick up here)

1. **Track width.** The gutter is 24px and the mark is centred in the 21px after
   the rail. If the operator still reads it as left-crowded, the lever is
   `COMPOUND_SELECT_TRACK_REM` (1.5rem), not more padding — but that widens the
   frozen prefix on every peer, so measure before moving it.
2. **`useCompoundSpreadsheet` hardcodes `selected={false}`** and passes no
   `select` capability. Every generic compound peer is therefore a display
   surface. The moment one wires multi-select it must thread the selection
   model, or it will tick boxes with no wash — the same class of gap the fold
   band had.
3. **Unbox / Pickup fold bands.** `ReceivingGridGroupRow` and
   `PickupGridGroupRow` mount their own shells; confirm the band wash + hover
   chevron read identically there (the engine band is shared, the Pickup group
   row is not).
4. **Touch surfaces.** `(hover: none)` stands the square permanently, so the
   resting status face never paints on a tablet. If the floor wants the mark on
   touch, the answer is a wider track with both faces, not a media-query fork.
5. **Rail colour on a two-mark row.** The rail paints the hottest fact only
   (urgent yellow) while the glyphs alternate. If the operator wants the bar to
   alternate too, extend `CompoundEdgeRail` off `compoundSelectStatusMarks`
   rather than adding a second bar.
