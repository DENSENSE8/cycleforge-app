# IMPLEMENTATION PROMPT — Order Intake & Acknowledgment (Fable 5 Ultra Code)

**Paste everything below the horizontal rule into a fresh Fable 5 Ultra Code session.**  
Self-contained. Repo: `cycleforge-app` on **`main`**.  
Plan of record: [`order-intake-acknowledgment-PLAN.md`](./order-intake-acknowledgment-PLAN.md).  
Verify checklist: [`order-intake-acknowledgment-VERIFY.md`](./order-intake-acknowledgment-VERIFY.md).

You are the **executor**. Finish the product outcome end-to-end. Do not invent a narrower success criterion. Do not ship empty boxes where the plan specified acknowledgment.

If this prompt and the plan conflict, **the plan wins** — except where the human overrides in chat.

---

# Cycle Forge — Order Intake & Acknowledgment

You are **Fable 5 Ultra Code** implementing a unified **Order Intake & Acknowledgment** surface on Cycle Forge Warehouse OS.

This is **WMS fulfillment intake** (eBay / Amazon / Ecwid / handwritten / CSV), not a storefront checkout. The job is: **identify**, **pair**, **parcel**, **assign**, **gate**, **release**.

**One canonical schema, two densities.** Single = scroll form in the existing To-ship ingest rail. Bulk = the same fields as a staging grid, with the **same form** as the row inspector.

Write production TypeScript/React: typed, small diffs, no drive-by refactors, no second create-order engine, no second label-buy engine, no layout geometry animations. Work on **`main` only**. Do not create a branch. Do not `git stash`. Do not restart `:3050` or `usav-dev`. Commit only if asked. `orgId` from `ctx.organizationId` only.

## Ultra Code bar (non-negotiable)

- One type: `CanonicalOrderIntake`. Two hosts. Zero parallel field lists.
- One gate function: `evaluateReleaseGates`. The UI **renders** results; it does not re-derive G1–G3.
- One create path: `POST /api/orders/add`.
- One buy path: compose `BuyLabelSection`. A copied rate-shop is a defect.
- One CSV vocabulary: extend `CSV_ORDER_CANONICAL_FIELDS`.
- Platform-from-id lives in `inferMarketplaceFromOrderId`. Do not paste the regex into a component.
- Primitives from `@/design-system/primitives` and `@/design-system/components` (`SearchableSelectField`). This **is** shadcn UI as the house implements it (law F11). No raw `bg-blue-600` on new controls. No new CSS files. No `shell.css` growth.
- Every new write: `withAuth` / tenant transaction / audit where siblings audit. Domain logic in `src/lib/**`, not in the route.
- Tests pin **behavior** (pure functions, mounted DOM, Playwright). Never `readFileSync` a `.tsx` and regex the source.
- `data-testid`s in the VERIFY file are **locked names**. Do not rename.
- Interaction budget: see missing gates ≤2 from form open; Release ≤3 from form open once data is present (open Add, jump Review, Release). Scrolling is free.
- No `height` / `width` / `top` / `left` / margin / padding / framer `layout` tweens **on chrome** (header, KPI, dialog frame). Show it or do not. Opacity/color OK.
- **Out of this prompt:** Google Sheets sync → inline triage board is a **separate scoped plan** — [`docs/todo/sheets-sync-inline-triage-PLAN.md`](./sheets-sync-inline-triage-PLAN.md). Do not implement that ship inside this acknowledgment run.

## Mission (done when every line is true)

1. **Add** on To-ship still opens the triage rail. The form **acknowledges**: Amazon `3-7-7` and eBay `2-5-5` order numbers paint `PlatformMark` without a platform click; unknown shapes require a platform pick.
2. If the row was **not imported** from a connected storefront, the form shows **fulfillment channel** (ShipStation when connected) for buying a label; if ShipStation is disconnected, Buy is disabled with that reason and Link still works.
3. Item number / SKU pair to catalog; quantity (`DeferredQtyInput`, default 1); title; condition from `CONDITION_GRADES`.
4. Documents: pair manuals / extra info **or** `docs_not_required`. G2 unchanged.
5. Shipping: **parcel weight + L×W×H** persist on the order; **Link** or **Buy** via composed `BuyLabelSection`; `POST /api/shipping/order-rates` accepts dimensions; buy is idempotent (`clientEventId`). **No second buy engine.**
6. Assignment: fulfillment/test (`assigned_tech_id`) and pack (`assigned_packer_id`) via existing `saveWorkOrder` / `PATCH /api/work-orders`. **Not a release gate.**
7. Bulk: CSV canonical fields extended; unknown platform → action_required; row inspector is the **same** form (same testids).
8. Release still requires G1–G3 green; blockers named (`Blocked by …`). Caged rows stay out of the live queue.
9. `npm run verify` green. Playwright matrix in VERIFY runs on Chromium desktop (or skip with a **named** reason in the report).

## Non-goals (refuse)

- G4 / assignment-required-to-release
- Second ShipStation client, Labels workbench rewrite, or buy UI fork
- Deleting `ShippedIntakeForm` (uncaged manual add stays)
- Catalog-level default weight table (no `sku_catalog` weight column exists — store parcel on `orders`)
- Scan-station chrome / `DeskPageChrome` on Unbox/Pack
- Org-authored gates
- Wizard with Next clicks hiding Review
- Live marketplace pull when tokens are dead — mock in e2e; report if dogfood creds are down
- Reconstructing deleted house-law regex tests
- Branches off `main`; `--no-verify`; restarting `:3050` / `usav-dev`

## Read first (in this order, before writing)

1. `docs/todo/order-intake-acknowledgment-PLAN.md` — **SoT**  
2. `docs/todo/order-intake-acknowledgment-VERIFY.md` — REQ / e2e / testids  
3. `AGENTS.md`  
4. `src/components/outbound/orders/triage/OrderTriageForm.tsx`  
5. `src/components/outbound/orders/triage/useOrderTriage.ts`  
6. `src/lib/orders/release-gates.ts`  
7. `src/lib/marketplace-order-id.ts`  
8. `src/lib/orders/csv-order-import.ts` + `order-import-descriptor.ts`  
9. `src/components/outbound/labels/BuyLabelSection.tsx`  
10. `src/lib/shipping/shipstation/types.ts` + `rate-request.ts` + `src/app/api/shipping/order-rates/route.ts`  
11. `src/app/api/orders/add/route.ts`  
12. `src/lib/work-orders/saveWorkOrder.ts` + `src/components/work-orders/WorkOrderAssignPopover.tsx`  
13. `src/components/ui/PlatformMark.tsx`  
14. `src/design-system/primitives/index.ts`  
15. `tests/e2e/add-order-to-ship-pending.spec.ts`

## Architecture (locked)

```text
CanonicalOrderIntake  ──►  OrderTriageForm (single, ingest rail)
                      ──►  CSV staging row + same form as inspector

Identity  → inferMarketplaceFromOrderId + PlatformMark + catalog pair
Links     → G1 (item # · order # · tracking)
Documents → manuals / extra / exempt → G2
Shipping  → parcel on orders + BuyLabelSection | link → G3
Assignment→ saveWorkOrder TEST + PACK  (not a gate)
Review    → evaluateReleaseGates → Release
```

| Own this | Do not rebuild |
|---|---|
| Host | `OrderIngestRail`, `OrdersDeskAddAction`, `DeskPageChrome` Add slot |
| Form | Extend `OrderTriageForm` + `useOrderTriage` |
| Create | `POST /api/orders/add` + `POST /api/orders/set-item-number` |
| Cage | `POST /api/orders/[id]/cage-release` |
| Gates | `evaluateReleaseGates` |
| Infer | `inferMarketplaceFromOrderId` / `resolveMarketplaceChipIdentity` |
| CSV | `CSV_ORDER_CANONICAL_FIELDS` |
| Buy | `BuyLabelSection` + `/api/shipping/order-rates` + `/api/shipping/order-labels/purchase` |
| Parcel type | `Parcel` / `ParcelSchema` |
| Assign | `saveWorkOrder` |
| Marks | `PlatformMark` |

## Canonical schema (implement this type)

```ts
// src/lib/orders/canonical-order-intake.ts  (path flexible; name locked)
export type IntakeImportOrigin = 'synced' | 'csv' | 'manual' | 'shipstation';
export type IntakeLabelMode = 'link' | 'buy';
export type IntakeFulfillmentChannel = 'shipstation' | 'link_only';

export interface CanonicalOrderIntake {
  orderNumber: string;
  platformInferred: 'amazon' | 'ebay' | null;
  platformChosen: string;          // account_source when inferred is null
  importOrigin: IntakeImportOrigin;
  fulfillmentChannel: IntakeFulfillmentChannel | null;
  itemNumber: string;
  sku: string;
  quantity: string;                // orders.quantity is text-ish today; default '1'
  productTitle: string;
  condition: string;               // CONDITION_GRADES
  trackingNumbers: string[];
  docsNotRequired: boolean;
  weightOz: number | null;
  dimL: number | null;
  dimW: number | null;
  dimH: number | null;
  dimUnit: 'inch' | 'centimeter';
  labelMode: IntakeLabelMode;
  assignedTechId: number | null;
  assignedPackerId: number | null;
}
```

CSV projection **maps onto this type**. Single form **state is this type** (plus live `CagedOrderRecord` / gates after create).

Start-triage still requires order number + title. Extend `/api/orders/add` body to accept `sku`, `quantity` if not already applied; `accountSource` from inferred slug or chosen. Item number remains set-item-number if add still ignores it.

## Sections (scroll, not wizard)

Keep the jump rail. Add **Assignment** before Review. Identity must include qty, SKU, platform acknowledge, fulfillment channel.

`scrollIntoView({ block: 'start' })` only — no animated layout.

## Parcel + rates (expand first)

1. Migration on `orders` (nullable, additive, rollback in header):  
   `parcel_weight_oz`, `parcel_length_in`, `parcel_width_in`, `parcel_height_in`  
   (numeric; all nullable). Apply **before** any SELECT of those columns.
2. Persist from the form (extend cage-release or the existing order patch used by the desk — **one** path; do not add `/api/orders/parcel` unless you must).
3. `POST /api/shipping/order-rates`: optional `dimensions` matching `ParcelSchema.dimensions`; prefer stored parcel, then body override. Refuse buy/rate at weight ≤ 0.
4. `BuyLabelSection` sends `weightOz` **and** dimensions from the bound order/form.
5. Unit tests: dims round-trip into `ShipmentSpec.parcels[0].dimensions`.

## Fulfillment channel

- If `importOrigin === 'manual' | 'csv'` and the operator wants **buy**: require ShipStation connected; else `fulfillmentChannel = 'link_only'`, Buy disabled, copy points at Settings → ShipStation.
- Do not invent EasyPost/PirateShip in v1.

## Assignment

Compose `StaffButtonGrid` or `WorkOrderAssignPopover` patterns. `saveWorkOrder` with TEST + PACK for `entityType: 'ORDER'`. Unassigned is valid. After release, queue `tester_id` / `packer_id` projections must match.

## Bulk

Extend `autoMapCsvOrderHeaders` aliases. `classifyCsvOrderStagingRow`: if order number present but platform neither inferred (`inferMarketplaceFromOrderId`) nor mapped/non-blank `platform` column → `action_required` + missing `platform`.

Row click → `OrderTriageForm` (create caged or bind existing). Do not fork `CsvImportStagingRail` into a second identity editor for fields that belong on the canonical type.

**Do not cage all CSV imports.** Unchanged ingest stays live-queue when tracking exists. Report if you cage incomplete bulk rows.

## data-testid (locked)

`order-intake-form` (root; keep `order-triage-form` as alias or dual-attr so old tests pass — **do not break** `data-testid="order-triage-form"` / `triage-start` / `triage-release` / `triage-docs-not-required` / `triage-open-labels`).

Add: `intake-order-number`, `intake-platform-inferred`, `intake-platform-chosen`, `intake-fulfillment-channel`, `intake-item-number`, `intake-sku`, `intake-qty`, `intake-weight`, `intake-dim-l`, `intake-dim-w`, `intake-dim-h`, `intake-label-link`, `intake-label-buy`, `intake-assign-tech`, `intake-assign-packer`, `intake-bulk-grid`.

## Implementation order (locked)

### Phase 0 — expand

Migration + `CanonicalOrderIntake` + CSV keys + order-rates dims. `npm run verify:fast`.

### Phase 1 — acknowledge (single)

Infer/mark/chosen/duplicate; qty/SKU/condition on Identity; catalog pair fill; fulfillment channel. Pure unit tests for id → platform and CSV project.

### Phase 2 — parcel + compose BuyLabelSection

Persist parcel. Compose buy in Shipping. Link + Re-check remain.

### Phase 3 — assignment

Staff pickers → `saveWorkOrder`.

### Phase 4 — bulk

Staging classify + inspector = same form.

### Phase 5 — e2e + verify

`tests/e2e/order-intake-acknowledgment.spec.ts` per VERIFY. Keep `add-order-to-ship-pending.spec.ts` green (hand-entry path). `npm run verify`.

Do not skip Phase 0. Do not open a PR unless asked.

## E2E (Chromium desktop, QA storage like add-order-to-ship-pending)

File: `tests/e2e/order-intake-acknowledgment.spec.ts`. Skip webkit/mobile. If Add is visible, **do not** skip the UI path.

Mock ShipStation at the route/network layer — **no live token required for CI**. Live connector tests `test.skip` with a named reason.

Implement every row in VERIFY § E2E matrix. Minimum that must exist in the file:

| id | Then |
|---|---|
| E2E-ID-AMZ | Paste `111-1234567-1234567` → inferred Amazon (`intake-platform-inferred`) |
| E2E-ID-EBAY | Paste `03-15100-78272` → inferred eBay |
| E2E-ID-UNK | Paste `CFLOOP-…` → platform select required |
| E2E-DUP | Existing order # → no second insert |
| E2E-LINE | Pair fills sku/title/qty default |
| E2E-EXEMPT | Exempt → G2 green |
| E2E-BUY | Mocked purchase → G3; **one** purchase request |
| E2E-WHO | Assign tech+packer persists |
| E2E-CAGE | Missing G3 → not on default pending grid |
| E2E-REL | All green → Release → pending row `data-marketplace-order-id` |
| E2E-BULK | 3-row CSV: 2 inferred, 1 action-required; inspector shares testids |
| E2E-BUDGET | Gates green → jump Review → Release ≤3 from form open |

## Report back when done

1. Files created/changed (paths only)  
2. Migration name + parcel column names  
3. How weight/dims reach `/api/shipping/order-rates`  
4. Write path for parcel persist  
5. Whether bulk incomplete rows are caged (yes/no + why)  
6. Assignment: exact `saveWorkOrder` payload shape  
7. E2E table: each test id pass / skip+reason  
8. `npm run verify` result  
9. Proof scan stations and `ShippedIntakeForm` uncaged path untouched  

Start Phase 0. Do not stop at a mock UI. Ultra Code means the schema, the resolvers, the composed buy path, and the tests all land.
