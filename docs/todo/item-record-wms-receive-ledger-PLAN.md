# PLAN — Shared item ledger: WMS receive face (one ItemRecord, every host)

**Status:** open · **Written:** 2026-09-04 · **Lane:** `main`  
**Overnight GOAL:** [`docs/warehouse-os/GOAL-item-record-wms-receive-ledger.md`](../warehouse-os/GOAL-item-record-wms-receive-ledger.md)  
**Audit origin:** Unbox Items band (2026-09-04) — operator cannot triage listed vs got vs remaining, cannot mark received / not received, price is not beside qty, condition is not between price and SKU, the well is a flat gray wash.

This file is the **plan of record.** Overnight loops paste the GOAL, not this whole file. Host JSON (`docs/eval/goals/*.goal.json`) is **human-committed from HEAD** — agents never write that tree. Copy the draft in §10 into a new file and commit it yourself before `goal-run.ts`.

---

## 0 · One-face law (non-negotiable)

There is **one item identity ledger** in the app:

| Layer | File | Job |
|---|---|---|
| Shape | `src/design-system/components/item-record/item-record-types.ts` | `ItemRecord` / `ItemRecordQuantity` (+ optional receive state) |
| Qty face | `ItemRecordQtyBadge.tsx` | Listed · got · remaining. Never a second badge. |
| Meta tracks | `ItemRecordMetaGrid.tsx` | Column order + rules. `PoLineMetaGrid.tsx` is a **named door only** — it re-exports this grid. |
| Row | `ItemRecordRow.tsx` | Thumb · title · six-track meta · optional body. |
| List | `ItemRecordCard.tsx` | Search, shipped detail, SKU/repair/FBA previews. |
| Receiving adapter | `PoLineRow.tsx` | Maps `ReceivingLineRow` → `ItemRecord`. **No second meta grid.** |
| Mappers | `src/lib/item-record/*-item-record.ts` | Search / detail / inventory / FBA / repair. Pure. |

**If a surface needs a different qty noun or a receive verb, grow the shared shape and the mapper. Do not fork a row.**

### Hosts that must stay on this face (no twins)

| Surface | Host today | Mapper |
|---|---|---|
| Unbox / Testing / Arrival Items band | `PoLinesAccordion` → `PoLineRow` | inline in `PoLineRow` |
| Unfound / Return stub | `ReturnScanCard` → `PoLineRow` | same |
| `/search?sel=order:` Items | `SearchOrderItems` → `ItemRecordCard` | `shippedOrderToItemRecords` |
| `/search?sel=unit:` | `SearchUnitItems` → `ItemRecordCard` | `serialUnitToItemRecords` |
| `/search?sel=sku:` / repair / FBA | `SearchDetailWorkspace` → `ItemRecordCard` | `skuCatalogToItemRecords` / `repairToItemRecords` / `fbaItemToItemRecords` |
| `/search?sel=receiving:` carton | `PoItemsSection` / inspector | `receivingLinesToItemRecords` |
| Shipped / order detail product | `ProductDetailsSection` → `ItemRecordCard` | `shippedOrderToItemRecords` |
| Pack checklist | `PackChecklistLineRow` → `ItemRecordRow` | inline (`expected` only — honest) |
| Mobile To-ship card | `MobileToShipRow` | `ItemRecordMobileMeta` **only** — never mount `ItemRecordMetaGrid` on the phone card |

### Forks this plan **absorbs** (do not grow)

| Twin | Path | Verdict |
|---|---|---|
| Local `PoLineRow` inside station receiving | `src/components/station/receiving/PoLinesSection.tsx` | Replace with shared `PoLineRow` / `ItemRecordCard`. Delete the inner function. |
| Contents atom that re-assembles chips | `src/components/receiving/contents/ReceivingLineContentsRow.tsx` | Map to `ItemRecord` and mount `ItemRecordRow`. Carton `/carton/[id]` ContentsList must not keep a hand-built five-track. |

Phone: `ItemRecordMobileMeta` stays qty · condition · notes as **one cluster**. Do not port the desk six-track onto the card.

---

## 1 · Operator target (verbatim, mapped)

| Operator said | This plan |
|---|---|
| Cannot triage what's important | Open / Partial / Short / Over recede Received. Items band meter, not `PO items · N`. |
| Cannot verify how many received vs listed | Qty face is `got/listed` + remaining. Never door-scan `counted = expected`. |
| Cannot mark “I received these / I didn't receive this” | L1 on the qty cell: Received / Not received → `SHORT`. Carton Print · Receive stays the mouth GR. |
| Price always to the right of quantity | Track 1 qty, track 2 price. |
| Condition always to the right of price, between price and SKU | Track 3 condition, track 4 SKU, then serial, then location. |
| Flat gray, no depth, overwhelming | Default station depth **mill**; column rules via `outline` (M3). Idle Open rows heat; Received recede. No drop shadows (F3). |
| Industry-standard receiving | Line states in §3. Carton GR blocked until remaining = 0 or every leftover is exception-coded. |
| Exact confirmations | §3 table. Mouth = `WeldedFeedbackPanel` only. |

---

## 2 · Track order (locked)

`ItemRecordMetaGrid` today: `qty \| SKU \| condition \| serial \| price \| location`.

**Ship this order** (six tracks, none dropped):

```
qty | price | condition | sku | serial | location
```

Update the file comment, the CSS `grid-cols-[…]`, `data-col` spans, and every test that asserts column order (`item-record-disclosure.test.ts`, mapper tests, packing layout test). `PoLineMetaGrid` stays a pass-through — if it omits `location`, add the slot so the door cannot drop a track.

---

## 3 · Line states and confirmations (locked)

Exclusive state per **receiving** line. Other domains omit `receiveState`; the face must not invent receive chrome when the field is absent.

| State | When | L0 face (0 clicks) | Confirm | Mouth |
|---|---|---|---|---|
| **Open** | got = 0, no exception | Mute `0/listed` or `listed · 0 got`. No emerald. | Scan serial **or** tap Received (non-serial / waived) | Optional one-liner |
| **Partial** | 0 < got < listed | Warning `got/listed` + `N left` | Scan / stepper Apply got | — |
| **Received** | got ≥ listed, no exception | Emerald qty **and** a Received mark (not color-only) | Undo → Open (inventory already posted → Unreceive on mouth) | — |
| **Short** | Operator writes off remaining | Rose + `SHORT` | Confirm: “Mark N not received — write SHORT?” | `WeldedFeedbackPanel`: “Line · short N” |
| **Over** | got > listed | Amber + `OVER` | Confirm overage qty | Mouth names over |
| **Wrong item** | Physical ≠ PO line | Exception chip | Confirm `WRONG_ITEM` | — |
| **Damaged** | In carton, not acceptable | Exception chip | Confirm `DAMAGED` | — |

**Rules**

1. Scan ≠ goods receipt. Serial check increments **got**. Carton **Print · Receive** posts inventory (`zoho_receive` / `local_receive`). Keep both. Line Received is the missing middle.
2. Emerald `1/1` is not Received. `ItemRecordQtyBadge` must not go emerald on Open. `PoLineRow` must never set `counted = quantity_expected` on a live Unbox row (today: `readOnly` 212–214).
3. Green check on SERIAL is “commit this serial,” not “I received this line.”
4. Default `USED_A` on capture mount is not a receive confirmation.
5. Carton Receive **blocked** until `remaining = 0` or every leftover line has SHORT / OVER / WRONG_ITEM / DAMAGED. `deriveCartonReadiness.linesComplete` already exists — wire the Items meter and the mouth gate; do not invent a second counter.
6. Unreceive stays on the mouth split, not a row checkbox.
7. OS&D codes already live in `src/lib/receiving/exception-codes.ts` (`SHORT`, `OVER`, `DAMAGED`, `WRONG_ITEM`) and `exception_why` on `RECEIVING_LINE`. **Wire them. Do not invent codes.**
8. Search / shipped / pack / SKU catalog **do not** grow receive verbs. They inherit qty face + track order + depth only.

**Qty stepper (rollup / non-serial):** `got` 0…listed, **Apply got**, **Short remaining** (`listed − got` → `SHORT`). `BulkQuantityPanel` today applies grade+count; it cannot say “I did not get 2 of 5.”

---

## 4 · Overnight hops (one command per hop)

Execute **the first hop whose DONE WHEN is not met.** Do not start hop N+1 in the same session. After each hop: `ds_critique` on every edited UI file, then `cursor-eval --fast`. Unbox / overlay workspaces → `pnpm run eval:station unbox`. Pack row → `pnpm run eval:station pack`. Do **not** run `eval:cohort slot-table` unless you touched `CompoundItem` / `useSlotTableLayout` / `DataTableFilterMenu` (this plan must not).

Impeccable commands are the **named skill** for that hop (`/clarify`, `/harden`, …). Follow the skill reference, then implement **only** that hop’s files.

| Hop | Command | Target | Deliverable |
|---|---|---|---|
| **1** | `/clarify` | `ItemRecordQtyBadge`, `item-record-types`, `PoLineRow` quantity map, `receiving-line-item-record.ts`, `serial-unit-item-record.ts` (keep unit `1/1` as “one physical unit,” not receive), `PoLineBadges` | Dual readout `got/listed` + remaining. Copy may say **got** / **listed** on receiving; orders stay **expected-only** (`shippedOrderToItemRecords`). Kill door-scan `counted = expected` on live Unbox. Never emerald on Open. WCAG 1.4.1: not color-only done. |
| **2** | `/harden` | `PoLineRow` qtyAction, `ItemRecordRow` optional `receiveState` paint, `BulkQuantityPanel`, mark-received / exception write, carton GR gate, `WeldedFeedbackPanel` copy | Line Received / Not received / Short remaining. Confirm dialogs in §3. Search/pack/shipped omit `receiveState`. |
| **3** | `/normalize` | `ItemRecordMetaGrid` (+ `PoLineMetaGrid` door), `ItemRecordRow` slot order, tests | Track order §2. Tokens only. `ds_tokens` radius / color / station-skin / station-depth / elevation before paint. |
| **4** | `/bolder` | `ItemRecordRow` idle vs active vs receiveState, `station-depths.ts` default **mill**, meta `outline` rules | Open/Partial/exception heat; Received recede. `applyStationDepth('mill')` as default (all scan wells — not Unbox-only hex). No `box-shadow` (F3). Grain only at Deep. |
| **5** | `/distill` | `PoLinesAccordion` header, Unbox carton chrome that repeats line price | Items meter: `2 lines · 1 received · 1 open` (from shared qty + `receiveState`). Quiet Claim / Low / GW / PO vs remaining. Do not delete Claim. |
| **6** | `/critique` | Edited item-record files + Unbox Items + `/search?sel=order:` + `/search?sel=unit:` + Pack checklist + shipped product detail | Heuristic pass. Fix only critique defects that violate this plan. Then `eval:station unbox` and `eval:station pack`. |

Optional later (not overnight unless hop 6 is green and hours remain): `/colorize` only if mill still reads as one gray wash; `/adapt` if meta chips fail 44px on a touch host; `/polish` last. **Forbidden overnight:** `/delight`, `/animate` geometry (M1), `/onboard`, new `*GridRow` / `*_GRID_COLUMNS` / `*_SHEET_COLUMNS`.

---

## 5 · HOW IT MUST NOT FUNCTION

- Do **not** fork `UnboxItemRow`, `SearchItemRow`, `StationItemRow`, or a new `*MetaGrid`.
- Do **not** remount `ItemRecordMetaGrid` on `ItemRecordMobileMeta`.
- Do **not** fold Queue / Viewed / History into a funnel. Do **not** add `FilterRefinementBar` or hunt tiles.
- Do **not** delete overlay `visibility` / `zIndex.panel`.
- Do **not** invent Operator verdict or LEDGER Open gaps.
- Do **not** change CompoundItem / slot-table paint / header-sort / standing keycaps / cheat-sheet-from-`?`.
- Do **not** move carton GR off `WeldedFeedbackPanel` / `StationComposerHost` `reaction`.
- Do **not** toast “line received.”
- Do **not** lower `lighthouse-baseline.json` floors.
- Do **not** set `DEFAULT_STATION_DEPTH` to `flat` to silence bevel bugs.
- Do **not** paint receive verbs on search preview or shipped detail.

---

## 6 · Allowed files (shrink toward this list)

**Shared face**

- `src/design-system/components/item-record/**`
- `src/lib/item-record/**` (+ colocated tests)

**Receiving hosts (adapters only)**

- `src/components/receiving/workspace/PoLineRow.tsx`
- `src/components/receiving/workspace/PoLineMetaGrid.tsx` (door)
- `src/components/receiving/workspace/PoLineBadges.tsx`
- `src/components/receiving/workspace/PoLinesAccordion.tsx` (meter copy only)
- `src/components/receiving/workspace/BulkQuantityPanel.tsx`
- `src/components/receiving/workspace/line-edit/terminal/unbox-terminal.tsx` (GR gate only)
- `src/lib/receiving/carton-readiness.ts` (already has line counts)
- `src/lib/receiving/exception-codes.ts` (read; do not splice new codes mid-array)

**Absorb forks**

- `src/components/station/receiving/PoLinesSection.tsx`
- `src/components/receiving/contents/ReceivingLineContentsRow.tsx` (+ ContentsList caller)

**Depth (all stations)**

- `src/design-system/themes/station-depths.ts`
- `src/lib/schemas/staff-preferences-constants.ts` (default mill if that is the SoT)

**This PLAN + the GOAL file**

Pack / search / shipped hosts should **not** need edits if mappers + `ItemRecordRow` are honest. If a host still assembles chips by hand, that is a fork — absorb it in hop 3 or 6, do not leave it.

---

## 7 · Design + graph + eval (every hop)

```bash
node tools/design-mcp/ds.mjs contract "item record qty listed vs got receive state"
node tools/design-mcp/ds.mjs tokens station-depth
node tools/design-mcp/ds.mjs tokens station-skin --filter industrial
node tools/design-mcp/ds.mjs tokens elevation
node tools/design-mcp/ds.mjs critique src/design-system/components/item-record/ItemRecordRow.tsx
node tools/design-mcp/ds.mjs critique src/design-system/components/item-record/ItemRecordMetaGrid.tsx
node tools/design-mcp/ds.mjs critique src/design-system/components/item-record/ItemRecordQtyBadge.tsx
```

Graph before `ItemRecordRow` / `PoLineRow` signature changes:

```bash
node "$GARISEK_OS_ROOT/tools/code-graph/cg.mjs" find ItemRecordRow
node "$GARISEK_OS_ROOT/tools/code-graph/cg.mjs" find ItemRecordMetaGrid
node "$GARISEK_OS_ROOT/tools/code-graph/cg.mjs" find ItemRecordQtyBadge
node "$GARISEK_OS_ROOT/tools/code-graph/cg.mjs" impact '<node_key>'
```

Gate:

```bash
node "$GARISEK_OS_ROOT/tools/eval-engineering/cursor-eval.mjs" --root . --fast
pnpm run eval:station unbox          # after hops that touch Unbox workspace / overlay
pnpm run eval:station pack           # after PackChecklistLineRow / ItemRecordRow
```

Stamp `.cursor/eval-session.json` via cursor-eval. Snapshot machine-gate copies under `docs/eval/cohorts/machine-gate/snapshots/` only when verify:fast was the red contract.

---

## 8 · DONE WHEN (whole plan)

1. Unbox two-line carton: L0 shows listed vs got vs remaining; Open is not emerald `1/1`.
2. Operator can mark a line Received and another Not received (SHORT) without carton GR.
3. Meta scan path is qty → price → condition → SKU on **Unbox, Testing, Search order/unit/SKU, shipped product, Pack**.
4. Mill bevel + column rules; Received rows quieter than Open.
5. Items band is a receive meter, not a census.
6. `ReceivingLineContentsRow` and station `PoLinesSection` local `PoLineRow` are gone or are one-line adapters.
7. `verify:fast` green. `eval:station unbox` and `eval:station pack` green when those workspaces were touched.
8. No new grid family. No overlay visibility deleted.

---

## 9 · How to loop overnight

**Cursor (this repo, local):** paste the GOAL file’s `## GOAL` through `## STOP` as the task. Use `/loop` with a 20–30m interval; each tick runs **one hop**. Do not arm a second loop.

**Hermes Host:** same GOAL text as the coder task. Caps: `maxHops: 8`, `maxHours: 12`, `maxNoProgressHops: 3`. `onRed: repair`.

**Garisek `goal-run.ts`:** human commits `docs/eval/goals/item-record-wms-receive-ledger.goal.json` (§10) to HEAD first. Agents cannot make the Host see a dirty goal file.

---

## 10 · Host JSON draft (human commits; agents do not write `docs/eval/goals/**`)

```json
{
  "id": "item-record-wms-receive-ledger",
  "statement": "One ItemRecord face: got/listed qty, qty-price-condition-SKU tracks, line Received/SHORT on Unbox only; search/stations/detail inherit the face; no forked rows.",
  "createdBy": "human",
  "createdAt": "2026-09-05T00:00:00Z",
  "successPredicates": [
    { "kind": "eval", "command": "verify:fast", "expect": "exit0" },
    { "kind": "eval", "command": "eval:station unbox", "expect": "exit0" },
    { "kind": "eval", "command": "eval:station pack", "expect": "exit0" },
    { "kind": "test", "file": "src/design-system/components/item-record/item-record-disclosure.test.ts" },
    { "kind": "test", "file": "src/lib/item-record/receiving-line-item-record.test.ts" },
    { "kind": "router", "refuse": ["slot-table.new-grid-columns-array", "composer.notes-composer"] }
  ],
  "stopConditions": {
    "maxHops": 8,
    "maxHours": 12,
    "maxNoProgressHops": 3,
    "onUnmeasured": "block",
    "onRed": "repair",
    "maxRepairs": 2
  },
  "budget": { "maxCostUsd": 20 }
}
```

---

## 11 · Out of scope (later ships)

- Seller Claim button redesign (keep; distill only).
- Changing last-8 identifier law.
- Slot-table To-ship cells (different face: `CompoundItem`).
- Serial-unit `1/1` meaning “this is one unit” — do not recast as PO receive.
- Photo-policy waivers, label print, Zoho sync retries.
