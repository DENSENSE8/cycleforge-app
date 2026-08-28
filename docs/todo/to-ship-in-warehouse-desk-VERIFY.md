# VERIFY — To-ship as in-warehouse identity desk

**Status:** verify claims · **Opened:** 2026-08-28 · **Lane:** main worktree only  
**Scope:** Product/IA analysis from chat — not a code change. Warehouse-OS tiling canvas is out of scope.

**Paste into the next agent (or run yourself):**

> Read `docs/todo/to-ship-in-warehouse-desk-VERIFY.md` and execute §3 end-to-end. Report a pass/fail table. Do not implement the redesign unless asked — this file only verifies whether the analysis is true against `main`.

---

## 1. Claim under test

Operator intent (paraphrased):

1. **To ship** = packages still in the warehouse (labeled, not yet scanned out). One desk that can identify each order fully: stage, tester when, packer when, current pack location/rack.
2. **Urgent** = overlay / default sort on that same list — not a sibling lifecycle world.
3. **Labels** and **Amazon Prep (FBA)** = different environments that happen *before* the labeled customer-order To-ship set (or are a different object entirely for FBA).
4. **Scan-out** = leave-the-building event; history after that is not a To-ship tab.
5. Main worktree only — do **not** require tiling canvas / Warehouse OS worktree.

The analysis claimed: the **domain model already matches** (lifecycle ownership + routes + row fields), but the **To-ship page chrome fights it** (Pending/Tested/Packed/Shipped tabs hide identity facts; sidebar L2 mixes jobs).

---

## 2. What must still be true

### A. Surface ownership (domain SoT)

| Stage | Owner surface (claimed) | SoT |
|---|---|---|
| `AWAITING_LABEL` | Labels (`/shipping/labels`) | `src/lib/unshipped-state.ts` header · `src/lib/order-lifecycle.ts` |
| `PENDING` / `TESTED` / `BLOCKED` | To ship / Unshipped board | same |
| `PACKED_STAGED` | Seam → Scan-out | same + `outbound-state.ts` |
| Post-dock (`SCANNED_OUT` …) | Shipped / carrier | `order-lifecycle.ts` outbound half |

### B. `PENDING` ≠ “still in warehouse”

| Term | Meaning in code |
|---|---|
| Lifecycle `PENDING` | Labeled, **no tech scan** (`resolveFulfillmentLane`) |
| Pending **tab** (`?unshipped`) | Shows `PENDING` + `BLOCKED`; **hides `TESTED`** |
| Operator “still here” | Labeled, not yet `SHIP_CONFIRM` — includes `TESTED` + `PACKED_STAGED` |

If this fails, the “build Pending fully” reading collapses into the wrong filter.

### C. Identity facts already on the wire

| Fact | Fields / source | UI today |
|---|---|---|
| Order / product / tracking | queue columns | every To-ship lane |
| Late / urgency | `age` / ship-by | frozen Late column |
| Tester · when | `tested_by_name`, `test_date_time` / `test_activity_at` | **Tested tab columns only** |
| Packer · when | `packed_by_name`, `packed_at` / `pack_activity_at` | Packed/shipped feeds, not Pending grid |
| Pack desk / staging | `pack_location_*` via `order_pack_placements` | optional on Pending; on for Tested |
| Left building | `ship_confirmed_at` | Shipped tab + Scan-out |

Honest gap (must remain marked gap): unit `serial_units.current_location` is free text, not a warehouse-map FK — not a reliable To-ship “rack” cell.

### D. Nav split already partial

| Item | Kind / path | Claim |
|---|---|---|
| To ship | domain · `/shipping/orders` | desk |
| Labels | domain · `/shipping/labels` | separate route |
| Amazon Prep | domain · `/shipping/fba` | separate object/route |
| Packing Review | `/review` under Shipping L2 | QA job, not identity list |
| Scan out | **station** · `/shipping/scan-out` | not Shipping L2 child |

---

## 3. Checklist (execute in order)

### 3.1 Code — lifecycle vocabulary

```bash
# PENDING = labeled, no tech scan; TESTED = hasTechScan
rg -n "resolveFulfillmentLane|UNSHIPPED_LIFECYCLE_RULES|AWAITING_LABEL" src/lib/order-lifecycle.ts

# Surface ownership comment still names Labels / Unshipped / Scan-out / Shipped
rg -n "AWAITING_LABEL|PACKED_STAGED|Scan-out|Labels" src/lib/unshipped-state.ts
```

| # | Check | Pass? |
|---|---|---|
| C1 | `PENDING` rule is `hasLabel` without tech scan; `TESTED` is `hasTechScan` | |
| C2 | Default stage when unlabeled is `AWAITING_LABEL` | |
| C3 | Header comment assigns Labels / To-ship lanes / Scan-out / Shipped | |

### 3.2 Code — To-ship tabs hide identity

```bash
rg -n "DashboardOrderView|isPrePackOrderView|DASHBOARD_ORDER_VIEW_LABEL" src/utils/dashboard-search-state.ts
rg -n "ORDERS_QUEUE_TESTED_COLUMNS|packStation|testedAt|tester" src/lib/dashboard-order-row-layout.ts
rg -n "pack_location_name|pack_location_id" src/app/api/orders/route.ts src/types/orders.ts
```

| # | Check | Pass? |
|---|---|---|
| C4 | Views are `unshipped` \| `tested` \| `packed` \| `shipped` (UI: Pending · Tested · Packed · Shipped) | |
| C5 | Tester + Tested-at columns exist only on `ORDERS_QUEUE_TESTED_COLUMNS` (or equivalent mode), not default Pending columns | |
| C6 | `packStation` is `tier: 'optional'` on default Pending columns | |
| C7 | `/api/orders` still projects `pack_location_id` / `pack_location_name` / `pack_location_kind` | |

### 3.3 Code — Labels / FBA / Scan-out are not To-ship modes

```bash
rg -n "orders'|labels'|fba'|review'|scan-out" src/lib/sidebar-navigation.ts | head -40
rg -n "OUTBOUND_MODE_PATHS|SHIPPING_ORDERS_PATH" src/components/outbound/outbound-sidebar-shared.ts src/lib/shipping/orders-desk.ts
```

| # | Check | Pass? |
|---|---|---|
| C8 | Shipping L2 children: To ship · Labels · Amazon Prep · Packing Review | |
| C9 | Scan out is `kind: 'station'`, own path `/shipping/scan-out` | |
| C10 | Labels and FBA are path modes under `/shipping/*`, not `?view=` of `/shipping/orders` | |

### 3.4 Code — pack location kinds

```bash
rg -n "PACK_PLACEABLE_KINDS|DESK|STAGING" src/lib/packing/pack-placement-constants.ts
```

| # | Check | Pass? |
|---|---|---|
| C11 | Placeable kinds are only `DESK` \| `STAGING` (no generic “rack” kind) | |

### 3.5 Manual — `/shipping/orders` (desk)

Prereq: signed-in org with a mix of labeled-untested, tested, packed-staged, and scanned-out orders.

| # | Check | Pass? |
|---|---|---|
| M1 | Band-1 shows **Pending · Tested · Packed · Shipped** (or equivalent) | |
| M2 | Pending tab: rows awaiting test present; **tested-ready rows absent** (or filtered out) | |
| M3 | Tested tab: **Tester** and **Tested at** columns visible | |
| M4 | Pending tab: those tester columns **not** in the default column set (unless opted in via Fields) | |
| M5 | A tested order with pack placement shows a **Station** / location name on Tested (or after enabling Station) | |
| M6 | Urgent / Late is a filter or Late column — not a fifth lifecycle world that replaces Pending | |
| M7 | Opening Labels from Shipping nav leaves `/shipping/orders` for `/shipping/labels` | |
| M8 | Opening Amazon Prep goes to `/shipping/fba` (not a To-ship tab) | |
| M9 | Scan out is reachable as floor station `/shipping/scan-out`, not under Shipping L2 | |

### 3.6 Manual — identity completeness gap

Pick one order that has been tested and pack-placed but not scanned out:

| # | Question | Expected if analysis is right |
|---|---|---|
| M10 | Can you answer “who tested / when” **without** leaving Pending? | **No** (must switch to Tested tab) — proves tabs fight identity |
| M11 | Can you answer “desk vs staging name”? | Yes on Tested / with Station column; only if `order_pack_placements` row exists |
| M12 | Can you answer unit bin/rack from serial `current_location` on this desk? | **No / unreliable** — gap stays |

### 3.7 Automated smoke (optional)

```bash
npm run verify:fast
# focused if present:
npx vitest run src/lib/order-lifecycle.test.ts src/lib/unshipped-state.counts.test.ts src/lib/shipping/orders-desk.test.ts
```

| # | Check | Pass? |
|---|---|---|
| A1 | `verify:fast` green (or note pre-existing red unrelated to this doc) | |
| A2 | Lifecycle / fulfillment lane unit tests still pass | |

---

## 4. Verdict rubric

| Result | Meaning |
|---|---|
| **PASS** | C1–C11 and M1–M9 hold. Analysis stands: model matches operator cut; page chrome is the blocker. |
| **PASS WITH GAPS** | Pass, and M10–M12 confirm the identity/rack gaps as stated. Ready to design an in-warehouse desk (no tiling required). |
| **FAIL** | Any of C1–C3 / C8–C10 wrong → re-read SoT before redesign. |
| **OUT OF SCOPE FAIL** | Do not fail this verify because Warehouse OS tiling is absent — that is a different worktree. |

---

## 5. If PASS — design implication (do not implement here)

Build toward:

1. One **in-warehouse** To-ship workbench (labeled → not yet `ship_confirmed`).
2. Stage + tester + packer + pack location as **row facts**, not tab-owned column sets.
3. Urgent as Late / attention overlay on that list.
4. Labels + FBA stay separate routes/environments.
5. Scan-out stays station; post-scan history is not a To-ship lifecycle tab.

Out of scope for that follow-up: Warehouse OS tile canvas, document-scroll “website” shell for scan stations.

---

## 6. Report template

```
VERIFY to-ship-in-warehouse-desk
Date:
Branch: (must be main)

Code:  C1 _ C2 _ C3 _ C4 _ C5 _ C6 _ C7 _ C8 _ C9 _ C10 _ C11 _
Manual: M1 _ M2 _ M3 _ M4 _ M5 _ M6 _ M7 _ M8 _ M9 _ M10 _ M11 _ M12 _
Auto:   A1 _ A2 _

Verdict: PASS | PASS WITH GAPS | FAIL
Notes:
```
