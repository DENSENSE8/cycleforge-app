# VERIFY — To-ship dense Sheets UX (not flat columns)

**Status:** acceptance · **Opened:** 2026-08-28 · **Lane:** main worktree only  
**Decision:** Keep `ORDERS_COMPOUND_COLUMNS` / dense compound grid. Do **not** mount `ORDERS_QUEUE_COLUMNS`. Sheets feel = highlight · select · facet filter · dense identity.

**Paste into the next agent (or run yourself):**

> Read `docs/todo/to-ship-in-warehouse-desk-VERIFY.md` and execute §3. Report a pass/fail table.

---

## 1. Claim under test

1. Open `/shipping/orders` → see every still-in-warehouse order in **one dense compound list** (0 extra clicks for primary info).
2. Filter → **1 click** Band-1 facet or KPI tile (`?late=1`, `?attention=1`, `?ustatus=BLOCKED`, `?rowFlag=awaiting_customer`).
3. Act → click/dbl-click open or select (≤3 interactions total).
4. Row highlighting: **selection wash → org triage flag tint → optional personal paint hex**.
5. Identity (stage · late · tester · station · packer) lives in **compound tracks**, not flat columns.

Out of scope: `ORDERS_QUEUE_COLUMNS`, Labels/FBA/Scan-out route changes, Warehouse OS tiling, full Sheets feature parity.

---

## 2. Audit gap list (Wave 1 — what already worked)

| Piece | Status |
|---|---|
| In-warehouse single list (no Pending-hides-TESTED) | Done — desk normalizes to `unshipped` |
| Band-1 triage facets | Done — All · Must ship · Urgent · OOS · Awaiting customer |
| Dense compound grid | Done — `useOrdersSpreadsheet` → `ORDERS_COMPOUND_COLUMNS` |
| Sheets click-select / gutter | Done — `clickSelect`, `selectGutterChrome` |
| Row flag tint | Done — `order-row-flags` + `ledgerRowFillClass` |
| Must-ship KPI | Done — `outbound-metrics` `filterLate` + KPI strip |
| Custom row paint | Done — `OrdersRowPaintChrome` / `useGridRowFills('orders')` |
| Flag mark on compound title | **Shipped this wave** — `flagMark` on `CompoundRowView` |
| Paint vs flag | **Shipped this wave** — flag suppresses personal paint hex |
| Dense identity (tester/station/packer) | **Shipped this wave** — `ordersIdentityLine` on item secondary |
| Stage includes PACKED_STAGED on To-ship | **Shipped this wave** — `resolveRowStatus` → `resolveOrderLifecycleStage` |
| Band-1 Must-ship count badge | **Shipped this wave** — `queueCounts.mustShip` |

**Precedence (locked):** selection always wins fill class; org flag wash beats personal `rowFillHex`; hover/focus stay outline/colour only (no geometry animation).

**Paint reachability:** paint chrome is on the outbound orders surface (≤3 with selection + paint control). Flag bulk via selection bar + `BulkFlagDialog`.

---

## 3. Checklist

### 3.1 Dense grid (not flat)

```bash
rg -n "ORDERS_COMPOUND_COLUMNS|isCompoundColumnModel" src/components/dashboard/orders-queue/useOrdersSpreadsheet.tsx
rg -n "ordersCompoundView|ordersIdentityLine" src/lib/orders/orders-compound-view.ts src/components/dashboard/orders-queue/OrdersQueueTableRow.tsx
# Must NOT be the To-ship mount:
rg -n "ORDERS_QUEUE_COLUMNS" src/components/dashboard/orders-queue/useOrdersSpreadsheet.tsx
```

| # | Check | Pass? |
|---|---|---|
| C1 | To-ship mounts compound columns, not flat `ORDERS_QUEUE_COLUMNS` | |
| C2 | Compound adapter passes tester / packer / flagMark into the view | |
| C3 | `resolveRowStatus(fulfillment)` uses full lifecycle (incl. PACKED_STAGED) | |

### 3.2 Highlight + filter budget

```bash
rg -n "ledgerRowFillClass|rowFillHex|rowFlag" src/components/dashboard/orders-queue/OrdersQueueTableRow.tsx
rg -n "mustShip|filterLate|applyToShipTriageFacet" src/lib/dashboard/outbound-metrics.ts src/components/dashboard/OutboundKpiStrip.tsx src/components/dashboard/OutboundWorkspaceHeader.tsx
rg -n "TO_SHIP_TRIAGE_FACET_LABEL|getToShipTriageFacetFromSearch" src/utils/dashboard-search-state.ts
```

| # | Check | Pass? |
|---|---|---|
| C4 | Selection wash outranks flag; flag outranks personal paint hex | |
| C5 | Band-1 includes Must ship with `mustShip` count; KPI Must-ship toggles `?late=1` | |
| C6 | Facet params stay deep-linkable (`late` / `attention` / `ustatus` / `rowFlag`) | |

### 3.3 Manual — `/shipping/orders`

| # | Check | Pass? |
|---|---|---|
| M1 | Open desk → dense compound rows for in-warehouse orders (tested + pending visible together on All) | |
| M2 | Band-1: All · Must ship · Urgent · Out of stock · Awaiting customer | |
| M3 | One click Must ship → URL has `late=1`; list filters | |
| M4 | Flagged row shows tint + title-adjacent flag dot without opening the row | |
| M5 | Selected row wash beats flag/paint | |
| M6 | State pill shows stage; item secondary shows tester/station/packer when present (else note or empty) | |
| M7 | No Pending · Tested · Packed · Shipped lifecycle tab strip | |

### 3.4 Automated

```bash
npm run verify:fast
# unit:
node --import tsx --test src/lib/orders/orders-compound-view.test.ts
# e2e (desktop, when auth/env ready):
npx playwright test tests/e2e/to-ship-pending-grid.spec.ts -g "triage facets"
```

| # | Check | Pass? |
|---|---|---|
| A1 | `verify:fast` green | |
| A2 | Compound identity unit tests pass | |
| A3 | E2E asserts triage facets + `?late=1`, not lifecycle tabs | |

---

## 4. Verdict

| Result | Meaning |
|---|---|
| **PASS** | C1–C6 and M1–M7 hold; interaction budget ≤2 see / ≤3 act |
| **FAIL** | Flat columns remounted, lifecycle tabs return, or filter needs a nested UI for the same job |

---

## 5. Report template

```
VERIFY to-ship dense Sheets UX
Date:
Branch: main

Code:   C1 _ C2 _ C3 _ C4 _ C5 _ C6 _
Manual: M1 _ M2 _ M3 _ M4 _ M5 _ M6 _ M7 _
Auto:   A1 _ A2 _ A3 _

Verdict: PASS | FAIL
Notes:
```
