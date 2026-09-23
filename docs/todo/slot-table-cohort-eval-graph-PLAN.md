# Plan — Slot-table cohort: eval + graph (codebase-wide)

**Status:** built · **Written:** 2026-08-31 · **Baseline:** 2026-09-01 (`eval:cohort slot-table --skip-verify` ok)  
**Do not edit the prior overlay plan;** this is a sibling cohort.

---

## Compact context (clean slate)

**Problem:** Listing/title paint was treated as a To-ship (`orders`) tweak. The slot table is **one engine** every product table mounts. Eval and graph must respect that unit—or the next desk forks again.

**SoT (locked):**

| Layer | Authority |
|-------|-----------|
| Offering | `PRODUCT_TABLES` in `src/lib/tables/table-catalog.ts` (~20 `tableId`s) ↔ `REGISTERED_BINDINGS` in `src/components/tables/registered-bindings.ts` (parity already tested) |
| Engine | `useSlotTableLayout`, `materializeTracks`, `DataTable`, compound cells (`CompoundItem` in `CompoundCells.tsx`) |
| Family plug-in | Field catalog + resolve + `use*TableLayout` config per `tableId` — **data only**, not a second Item cell |
| Plan of record | `docs/todo/slot-based-metadata-table-PLAN.md` · kill list `docs/kill-list/07-slot-table-hand-models.md` |

**Reuse (do not rebuild):** overlay cohort spine —

- `src/lib/station/scan-station-overlay-cohort.ts`
- `tools/eval-ledger/run-cohort-eval.mjs` + `eval-core.mjs`
- Garisek `tools/code-graph/cg.mjs`, `tools/eval-engineering/cursor-eval.mjs`

**Immediate product law (engine paint; first consumer = orders):**

1. **Title:** idle `text-text-default`; accent + underline **on hover/focus**; optional `titleHref` opens listing.
2. **Item # subtitle:** fixed-width listing control (stable footprint); click → external URL via `getExternalUrlByItemNumber`; copy payload = raw `item_number` — **not** platform name / growing host+path face.
3. Catalog keeps `orders.item_number` as the id (`field-catalog/orders.ts`); paint stays in compound + util.

**Current code note (as of plan write):** `CompoundItem` title already uses `text-text-default hover:text-text-info` in places — verify chip face still wrong (`listingChipDisplay` host+path) and subtitle chip width; fix whatever still violates the law.

**Out of scope this ship:** new host extract; Garisek cockpit UI; blocking preToolUse on eval stamps; porting `titleHref` to every family in one PR (engine law + tripwire so later ports inherit).

```mermaid
flowchart TB
  engine[Slot engine CompoundItem useSlotTableLayout]
  peers[PRODUCT_TABLES peers]
  law[slot-table-cohort.ts]
  trip[slot-table-cohort.test.ts]
  runner[eval:cohort slot-table]
  ledger[docs/eval/cohorts/slot-table/LEDGER.md]
  graph[cg find impact engine symbols]

  law --> engine
  law --> peers
  law --> trip
  trip --> runner
  graph --> runner
  runner --> ledger
  engine --> peers
```

---

## Design locks (no open options)

1. SoT is **engine + PRODUCT_TABLES**, not orders/To-ship.
2. One cohort LEDGER for slot-table; per-table LEDGERs are optional gap pads only.
3. Listing/title law lives on **CompoundItem** (+ util), not a desk-specific cell.
4. Runner imports cohort TS via `--import tsx` — no hand JSON authority.
5. Overlay is **not** a display sibling. Display SoT is `eval:cohort slot-table`.

---

## Phase 0 — Fix compound listing face (visible win)

**Files:**

- `src/components/tables/compound/CompoundCells.tsx` (`CompoundItem` title link)
- `src/utils/external-item-url.ts` (`listingChipDisplay` / successor)
- `src/components/dashboard/orders-queue/OrdersQueueTableRow.tsx` (subtitleCopies only if needed)
- `src/design-system/pinned.json`

**Steps:**

1. Call design-mcp before UI (`ds_contract` / `ds_tokens` color+typography for link hover).
2. Title `<a>`: idle default ink + hover accent/underline; no standing always-blue title.
3. Listing chip: fixed footprint (last-8 of item # **or** fixed `w-*`/`ch` truncate); `openHref` = full URL; copy = item #.
4. Unit tests on util + optional source tripwire on `CompoundItem` classes.
5. Pin `CompoundItem` / `SlotListingTitle` with the law + “SoT = slot-table cohort”.

---

## Phase 1 — Slot-table cohort module (introspection SoT)

**New files:**

- `src/lib/tables/slot-table-cohort.ts`
- `src/lib/tables/slot-table-cohort.test.ts`

| Export | Role |
|--------|------|
| `SLOT_TABLE_ENGINE` | Paths/symbols: `useSlotTableLayout`, `CompoundItem`, `CompoundCells.tsx`, materialize entry, util listing helpers |
| `SLOT_TABLE_ENGINE_CONTRACT` | Source predicates for engine paint + “families use useSlotTableLayout” |
| `SLOT_TABLE_PEERS` | Derived from `PRODUCT_TABLES` (never hand-duplicate ids) |
| `slotTableEvalManifest()` | critiqueFiles / graphSymbols / tripwires / ledger paths for the **cohort** |
| Paint law constants | Title + listing-chip rules for agents/LEDGER |

**Tripwire asserts:**

1. Peer ids === `PRODUCT_TABLES.map(t => t.tableId)` (and stay aligned with bindings via existing catalog test).
2. Opted-in layout hooks wrap `useSlotTableLayout` (declared map of known `use*TableLayout` files; shrink-only baseline for not-yet-ported desks).
3. Engine files match paint predicates after Phase 0.
4. Optional ratchet: no new hand `*_GRID_COLUMNS` on opted-in families (align with kill-list 07 where practical).

---

## Phase 2 — Eval engineering: `eval:cohort slot-table`

Extend `tools/eval-ledger/run-cohort-eval.mjs` to accept `slot-table` (keep `overlay`):

```bash
pnpm run eval:cohort slot-table
pnpm run eval:cohort slot-table -- --skip-verify
```

**Pipeline:**

1. Run `slot-table-cohort.test.ts`
2. Once: `cursor-eval.mjs --root . --fast` (or `--skip-verify`)
3. `ds_critique` on engine critiqueFiles
4. Graph find/impact on engine graphSymbols
5. Patch `docs/eval/cohorts/slot-table/LEDGER.md` — peer matrix, graph matrix, tripwire, graph_stats, machine-gates
6. Optional later: thin `docs/eval/tables/<tableId>/LEDGER.md` for family-only gaps — **not** a second paint SoT

Update `docs/eval/README.md`: overlay = stations; **slot-table = all product tables**.

---

## Phase 3 — Graph engineering

**Default symbols for cohort run:**

- `CompoundItem`
- `useSlotTableLayout`
- materializeTracks (real export name from codebase)
- `getExternalUrlByItemNumber`
- `listingChipDisplay` (or renamed fixed-face helper)

**Agent law:** before editing compound/slot layout, impact **engine** symbols—not `OrdersQueueTableRow` alone.

Update (agent-agnostic sources only — the Cursor code-graph / eval-engineering
rule and skill folders were deleted 2026-09-19; never re-add a harness copy):

- `AGENTS.md` § Code graph and § Eval engineering (the one map every harness reads)
- `docs/eval/README.md` (cohort/ledger operational detail)
- `.cursor/hooks/session-start-garisek-engineering.sh` (harness mechanics only)

---

## Phase 4 — Acceptance

| Check | Pass |
|-------|------|
| To-ship visual | Title black idle, accent on hover; item # chip fixed width; opens listing; copies id |
| Tripwire | `slot-table-cohort.test.ts` green |
| Eval CLI | `eval:cohort slot-table --skip-verify` exits 0; LEDGER filled |
| Graph | Engine impact rows in cohort LEDGER |
| Scope | Skills say engine + PRODUCT_TABLES, not orders-only |
| Overlay | retired as display eval — shell is `eval:station <id>` |

---

## Implementation order

1. Phase 0 face fix + tests + pin  
2. Phase 1 cohort module + test  
3. Phase 2 runner + LEDGER  
4. Phase 3 graph + agent wiring  
5. Baseline `eval:cohort slot-table --skip-verify` (commit LEDGER auto sections + snapshots)

---

## Todos

- [x] `phase0-face` — Fix CompoundItem title idle/hover + fixed-width listing chip; pin + unit tests
- [x] `phase1-cohort` — Add `slot-table-cohort.ts` / `.test.ts` from PRODUCT_TABLES + engine contract
- [x] `phase2-eval` — Wire `eval:cohort slot-table` + `docs/eval/cohorts/slot-table/LEDGER.md`
- [x] `phase3-graph-agents` — Graph matrix + skills/rules/sessionStart/AGENTS
- [x] `phase4-baseline` — Run skip-verify cohort eval; land snapshots + LEDGER autos
- [x] `phase5-discover` — DELETE vs KEEP scanners + `eval:discover` + known-debt ratchet

**Status:** built · **Baseline:** 2026-09-01 (`eval:cohort slot-table --skip-verify` ok) · Discover: 2026-09-01
