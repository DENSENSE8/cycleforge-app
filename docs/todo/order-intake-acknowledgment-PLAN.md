# Order Intake & Acknowledgment — unified bulk + single form

**Status:** plan of record · **Written:** 2026-08-30 · **Branch:** `main`  
**Companion prompt:** [`order-intake-acknowledgment-IMPLEMENTATION-PROMPT.md`](./order-intake-acknowledgment-IMPLEMENTATION-PROMPT.md)  
**Verify:** [`order-intake-acknowledgment-VERIFY.md`](./order-intake-acknowledgment-VERIFY.md)

**Sits on top of (compose, do not rebuild):**

| Prior | Role |
|---|---|
| [`non-scan-desk-chrome-caged-release-PLAN.md`](./non-scan-desk-chrome-caged-release-PLAN.md) | Add CTA, scroll triage, **G1–G3**, caged → released |
| [`desk-page-chrome-fixed-width-PLAN.md`](./desk-page-chrome-fixed-width-PLAN.md) | Desk chrome / Add slot |
| [`import-add-order-right-rail-HANDOFF.md`](./import-add-order-right-rail-HANDOFF.md) | One non-modal intake shell |
| [`slot-based-metadata-table-PLAN.md`](./slot-based-metadata-table-PLAN.md) | To-ship grid after Release |
| JIT pack documents | `documents` + `document_entity_links` (G2) |

---

## THIS SHIP (operator deliverable)

Replace today’s **type-into-empty-boxes** triage with an **Order Intake & Acknowledgment** surface: the warehouse **recognizes** the order, **pairs** it to catalog / manuals / extra information / parcel, **assigns** who fulfills and who packs, then **releases** it into live To-ship work.

**One canonical schema, two densities:**

| Density | Host | Operator job |
|---|---|---|
| **Single** | `OrderTriageForm` in `OrderIngestRail` (Add → triage leaf) | Paste or type one order; watch it acknowledge; Release |
| **Bulk** | `CsvImportStagingHost` + same form as row inspector | Paste/CSV a list; each row is the same record; Ready vs Action-required |

This is WMS fulfillment intake (eBay / Amazon / Ecwid / Walmart / Shopify / ShipStation / handwritten), **not** a storefront checkout and **not** a second create-order product beside `POST /api/orders/add`.

**Must work when done:**

1. Typing or pasting an Amazon `3-7-7` or eBay `2-5-5` order number **identifies the platform** (mark + label) without a separate pick.
2. When the number is **not** a known shape, the operator **must** pick a platform; if that storefront is **not** the import origin, they pick the **connected fulfillment channel** that will buy/print the label (ShipStation when connected).
3. Item number / SKU **pairs** to catalog, manuals, and extra documents (or explicit G2 exempt).
4. Quantity, title, condition, tracking, **parcel weight + dimensions** are on the same record.
5. **Link label** or **Buy label** through the **existing** ShipStation engine (`BuyLabelSection` composed in Shipping) — weight/dims go on the rate request. **No second buy engine.**
6. **Fulfillment/test assignee** and **pack assignee** are set (or explicitly unassigned). Assignment is **operational, not a release gate**.
7. Bulk CSV uses the **same field vocabulary**. A staging row opens the **same form**.
8. G1–G3 still decide Release. UI names every failing gate. Caged stays out of the live queue.
9. UI is Kinetic Ledger / shadcn-on-house-tokens: `@/design-system/primitives` + listed components only.
10. `npm run verify` green; e2e matrix in the VERIFY file green on Chromium desktop (or skipped with a **named** reason).

---

## 0. What you are building

A fulfillment **acknowledgment** loop, not a CRUD form.

```text
paste / type / CSV cell
        ↓
1. IDENTITY   order # → infer platform (Amazon 3-7-7 / eBay 2-5-5)
              lookup duplicate in-org
              if connector live: offer pull (do not re-key)
              if not imported from a storefront: pick FULFILLMENT CHANNEL
        ↓
2. LINE       item # / SKU / ASIN / eBay item id → sku_catalog
              qty, title, condition defaults
        ↓
3. PAIR       item # → product_manuals + extra document_entity_links
              or explicit "does not require documents" (G2)
        ↓
4. PARCEL     weight oz + L×W×H in (operator, later catalog default)
              persisted on the order; feeds rate-shop
        ↓
5. LABEL      Link existing tracking/label  OR  compose BuyLabelSection
        ↓
6. WHO        assigned_tech_id (TEST) + assigned_packer_id (PACK)
        ↓
7. GATES      evaluateReleaseGates — one pure function, UI only renders
        ↓
Release → live To-ship queue
```

**Acknowledge** = auto-identify + pair + fill. The operator **confirms**, they do not re-type facts the system already knows.

---

## 1. Exact vocabulary (locked)

Agents fail when they invent synonyms. These words are the schema.

| Term | Meaning in Cycle Forge |
|---|---|
| **Order number** | Marketplace / manual id → `orders.order_id`. Shape can name the channel. |
| **Item number** | Listing id / ASIN / eBay item id → `orders.item_number`. **Not** SKU. CSV aliases already include `asin`, `listingid`. |
| **SKU** | Internal catalog key → `sku_catalog.sku` / `orders.sku`. |
| **Platform (inferred)** | Channel from order-number **shape**: Amazon `^\d{3}-\d{7}-\d{7}$`, eBay `^\d{2}-\d{5}-\d{5}$` via `inferMarketplaceFromOrderId` (`src/lib/marketplace-order-id.ts`). |
| **Platform (chosen)** | Operator pick from `usePlatformCatalog` when inferred is null. Stored as `orders.account_source`. |
| **Import origin** | How the row entered: `synced` \| `csv` \| `manual` \| `shipstation`. Set by the entry path, not typed. |
| **Fulfillment channel** | Which **connected** engine buys/prints the label when the row was **not** imported from the selling platform. v1 = ShipStation if connected; else link-only. |
| **Account source** | Stored channel label (`orders.account_source`). **Format wins display** when the id is Amazon/eBay (`resolveMarketplaceChipIdentity`). |
| **Acknowledge** | Identify + pair + fill; operator confirms. |
| **Pair** | Bind item number → SKU → manuals / extra docs / parcel defaults. |
| **Caged** | Exists, **not** in the live To-ship working set (`release_state = 'caged'`). |
| **Released** | G1–G3 green; in the actionable queue. `NULL` release_state is released (legacy rows). |
| **Fulfillment assignee** | Tester / tech → `work_assignments.assigned_tech_id` (work_type TEST). |
| **Pack assignee** | Packer → `work_assignments.assigned_packer_id` (work_type PACK). |
| **Link label** | Attach existing label/tracking (G3 linked). |
| **Buy label** | Rate-shop + purchase through **existing** ShipStation v2 path (G3 purchased). |
| **Parcel** | One physical package: weight (oz) + optional L×W×H (inch default). Type already exists: `Parcel` in `src/lib/shipping/shipstation/types.ts`. |

**Not in vocabulary:** “marketplace” vs “channel” vs “source” as three different fields; “create order” as a second product; “G4 assignment required to release.”

---

## 2. One schema, two densities

### 2.1 Canonical type

Introduce **`CanonicalOrderIntake`** (name locked) in `src/lib/orders/` — the same TypeScript type for the single form **and** the CSV staging projection. Do not grow a parallel field list.

Bulk may **hide** parcel / assignment / buy-label behind the inspector; the schema still contains them. A field that exists only on one density is a fork.

### 2.2 Field table

| Field | Persist | Resolve / acknowledge | DS primitive | REQ |
|---|---|---|---|---|
| `orderNumber` | `orders.order_id` | Normalize unicode dashes; infer Amazon/eBay; in-org duplicate lookup; optional connector pull | `TextField` flush, `mono` | REQ-ID-01 |
| `platformInferred` | derived | Read-only mark when format matches | `PlatformMark` | REQ-ID-02 |
| `platformChosen` | `orders.account_source` | Required when inferred is null | `SearchableSelectField` | REQ-ID-03 |
| `importOrigin` | derived / small column if needed | Set by entry path | `StatusText` | REQ-ID-04 |
| `fulfillmentChannel` | see §5 | Shown when origin is not a storefront sync | `SearchableSelectField` | REQ-ID-05 |
| `itemNumber` | `orders.item_number` | Pair via `sku_platform_ids.platform_item_id` | `TextField` mono | REQ-LINE-01 |
| `sku` | `orders.sku` | Catalog lookup; fill title/condition | `SearchableSelectField` | REQ-LINE-02 |
| `quantity` | `orders.quantity` | Default `1`; integer ≥1 | `DeferredQtyInput` | REQ-LINE-03 |
| `productTitle` | `orders.product_title` | From catalog if paired; else required to start triage | `TextField` | REQ-LINE-04 |
| `condition` | `orders.condition` | `CONDITION_GRADES` only — existing condition control, not a free string | existing pills / catalog | REQ-LINE-05 |
| `trackingNumbers` | shipment + `shipping_tracking_numbers` | `parseTrackingPaste`; first is primary (G1) | `TextField` mono + add row | REQ-LINK-01 |
| `manuals[]` | `product_manuals` / links | Pair library manuals to item/SKU; count feeds G2 | compose existing pair UI | REQ-PAIR-01 |
| `extraDocs[]` | `document_entity_links` | Listing, packing notes, “more information” | documents SoT | REQ-PAIR-02 |
| `docsNotRequired` | `orders.docs_not_required` | Explicit G2 exempt (already on form) | `Checkbox` | REQ-PAIR-03 |
| `weightOz` | **new nullable** on `orders` | Operator; later catalog default | `TextField` numeric | REQ-SHIP-01 |
| `dimL`, `dimW`, `dimH` | **new nullable** on `orders` (inch) | Optional; sent on rate shop | three numeric `TextField`s | REQ-SHIP-02 |
| `labelMode` | UI | `link` \| `buy` | segmented / existing pattern | REQ-SHIP-03 |
| `assignedTechId` | `work_assignments` TEST | Staff picker | compose `StaffButtonGrid` / assign popover | REQ-WHO-01 |
| `assignedPackerId` | `work_assignments` PACK | Staff picker | same | REQ-WHO-02 |

**Start-triage minimum (unchanged unless you change the unit test in the same ship):** order number **and** title. Missing item number / tracking leaves G1 red — that is the cage’s job.

### 2.3 CSV vocabulary

`CSV_ORDER_CANONICAL_FIELDS` in `src/lib/orders/csv-order-import.ts` is the bulk SoT. **Extend it** — do not invent a second map.

Already present: `order_number`, `item_title`, `sku`, `item_number`, `quantity`, `condition`, `customer_name`, `ship_by_date`, `tracking_number`, `platform`, `note`.

**Add in this ship** (optional columns; aliases in `autoMapCsvOrderHeaders`):

| key | aliases (examples) | Staging rule |
|---|---|---|
| `weight_oz` | weight, weightoz, oz | Action-required when `labelMode` would be buy and weight blank — **only if** you persist buy-intent on the row; otherwise warn in inspector |
| `dim_l` / `dim_w` / `dim_h` | length, width, height, diml | Optional |
| `assignee_tech` / `assignee_packer` | tester, packer, assignedto | Optional; resolve against org staff by name if cheap, else inspector-only |

Ready vs Action-required **today:** missing order number; SKU missing when mapped **and** no item number/title. **This ship adds:** platform neither inferred nor mapped/chosen (unknown-shaped id with blank platform column).

Selecting a staging row opens **`OrderTriageForm`** (same `data-testid`s). Do not build `CsvImportStagingRail` into a second identity form.

---

## 3. Platform identification (the 15-year ops rule)

### 3.1 Infer from the number (already exists — **wire it**)

`src/lib/marketplace-order-id.ts`:

- Amazon SP-API: `111-1234567-1234567` (3-7-7)
- eBay Seller Hub: `03-15100-78272` (2-5-5)
- Unicode dashes normalized
- `null` for Walmart / Ecwid / internal / `CFLOOP-…`

On **order-number blur / paste / CSV project**: set `platformInferred`, paint `PlatformMark` + tooltip label. Do **not** require `platformChosen` when inferred is set. Stored `account_source` should be written to the inferred slug (`amazon` / `ebay`) unless the operator has explicitly overridden.

Format **wins display** over a stale `account_source` (already the chip SoT). The form must not fight that.

### 3.2 Chosen platform when shape is unknown

`SearchableSelectField` over `usePlatformCatalog`, same ranking as `ShippedIntakeForm` (`ORDER_PLATFORM_PRIORITY`: amazon, ebay, walmart, shopify, ecwid).

### 3.3 Import origin vs fulfillment channel

Two different questions. Do not collapse them into one dropdown.

| Situation | Show |
|---|---|
| Connector sync landed the row | Origin = `synced`. Platform = connector. Fulfillment channel hidden (or “via {platform}”). |
| CSV with platform column or inferred id | Origin = `csv`. |
| Typed at this form | Origin = `manual`. |
| ShipStation order pull | Origin = `shipstation`. |
| Manual/CSV **and** selling platform is **not** connected | **Fulfillment channel** required to **buy**. Default = ShipStation if `getShipStationV2` would succeed; else disable Buy and copy: connect ShipStation in Settings, or **link** an existing label. |
| Manual/CSV **and** selling platform **is** connected | Offer **Pull from {platform}** (prefills line). Operator can still skip and type. |

v1 pull may be “lookup existing ingested order / listing” rather than a live SP-API/eBay call if the connector token is absent. **Never** fake a successful pull. E2E may mock the connector.

### 3.4 Duplicate acknowledgment

On blur of order number, lookup `GET /api/orders?q=` (or existing lookup). If an in-org row exists: show it, **do not** insert a second order. Offer “open that order in triage” (caged or released). `POST /api/orders/add` already 409s on duplicate `order_id` for a different idempotency key — the UI must acknowledge **before** submit.

---

## 4. Pairing (item number → the rest of the warehouse)

### 4.1 Catalog

Item number / ASIN / eBay item id resolves through `sku_platform_ids.platform_item_id` (CSV comments already document this). SKU resolves `sku_catalog`. Title may resolve catalog when the other two are blank (CSV writer already does this).

On a successful pair: fill SKU, title (if empty), condition (if empty), quantity default 1. Do not overwrite a title the operator already typed.

### 4.2 Manuals (G2)

Compose the **existing** manuals pairing path (`product_manuals`, `/api/sku-catalog/pair`, receiving-line manuals route pattern). Count of linked documents → `linkedDocumentCount` in `evaluateReleaseGates`.

Do **not** create an `attachments` table.

### 4.3 Extra information

Same documents SoT, different `link_role` (or existing roles). “More information” is listing PDFs, packing notes, vendor sheets — still `document_entity_links`. G2 cares about **count ≥ 1 or exempt**, not the role taxonomy.

### 4.4 Exempt

`docs_not_required` checkbox already on the form. Keep the copy: *an explicit decision, not an absence.*

---

## 5. Shipping — link or buy, with parcel (no second engine)

### 5.1 Law (unchanged, stronger)

> Labels are bought through the existing engine. A label bought in two places is a label bought twice.

**Compose** `BuyLabelSection` (`src/components/outbound/labels/BuyLabelSection.tsx`) **into** the triage Shipping section. Keep “open order documents / Re-check” as an escape hatch, not the only path.

### 5.2 Parcel persistence (expand → code)

`sku_catalog` has **no** weight/dim columns today. Store parcel on **`orders`** (nullable):

Suggested names (pick one set and stick):

- `parcel_weight_oz numeric`
- `parcel_length_in numeric`
- `parcel_width_in numeric`
- `parcel_height_in numeric`

All nullable. Migration **before** readers. No backfill. Unit tests on the rate-body builder, not on CSS.

Optional later: catalog defaults copied onto the order at pair time — **out of v1** unless a column already exists (it does not).

### 5.3 Rate request

`ParcelSchema` already includes `dimensions` (`src/lib/shipping/shipstation/rate-request.ts`).

`POST /api/shipping/order-rates` today: `{ orderId, carrierIds?, weightOz? }` — **weight only**.

This ship: accept optional `dimensions: { length, width, height, unit }` (same Zod as `ParcelSchema.dimensions`). Prefer order-stored parcel, then body override. `BuyLabelSection` must send the form’s weight **and** dims.

Buy remains `POST /api/shipping/order-labels/purchase` with `clientEventId` (idempotent). G3 purchased when that path succeeds.

Link path: existing tracking / label document on the order (G3 linked). Tracking still closes G1.

**Buy without weight:** refuse in UI and API (carrier would rate 0 oz). Dims optional but recommended (dimensional weight).

**ShipStation not connected:** 409 `NOT_CONNECTED` already. Form: disable Buy, keep Link, point to Settings.

### 5.4 Ship-to

Buy still needs a ship-to address (order-rates already errors if missing). Identity/Links may need a compact ship-to block **or** a named “add address” that reuses customer fields — do not invent a third address form. If no address, G3 buy is blocked with that reason; Link still works.

---

## 6. Assignment (who)

| Slot | Column | Work type | Floor meaning |
|---|---|---|---|
| Fulfillment / test | `assigned_tech_id` | `TEST` | Who owns testing / fulfillment prep |
| Pack | `assigned_packer_id` | `PACK` | Who packs |

**Write path:** existing `saveWorkOrder` → `PATCH /api/work-orders` (see `WorkOrderAssignPopover`). Compose `StaffButtonGrid` / that popover. **Do not** PATCH `orders.packer_id` as if it were a column — queue `packer_id` is a projection from `work_assignments`.

**Not a release gate.** Unassigned work is valid. Do **not** add G4 in v1.

After Release, To-ship row must show the names the queue already knows how to paint.

---

## 7. Form chrome (single density)

### 7.1 Host

- Trigger: desk tab-band **Add** (`OrdersDeskAddAction` → `?triage=new`).
- Shell: `OrderIngestRail` / `DeskInspectorIndexShell`. One intake shell. Not a centered modal.
- Same component for create and reopen-caged (`?triage=<id>`).

Hand-entry leaf (`ShippedIntakeForm`) **stays** as the “straight into the queue” path (uncaged). This ship does **not** delete it. Triage is the Add CTA’s primary target (already). Do not merge the two into one confusing mode switch unless you can do it without a fourth click.

### 7.2 Sections (scroll, not wizard)

Keep jump rail + `scrollIntoView` (no geometry tween). Suggested section set:

1. **Identity** — order number, inferred/chosen platform, origin, fulfillment channel, title, condition, qty, SKU, item number  
2. **Links** — G1 triangle: item #, order #, tracking (paste-aware)  
3. **Documents** — manuals + extra info + exempt (G2)  
4. **Shipping** — parcel + link **or** composed `BuyLabelSection` (G3)  
5. **Assignment** — tech + packer (new; before Review)  
6. **Review** — gate list + Release  

Identity-to-start-triage still creates + cages via `POST /api/orders/add` then cage-release `action: 'cage'` (today’s `useOrderTriage`). Extend the add payload with sku, quantity, accountSource from inferred/chosen — **do not** add a second create route.

Interaction budget (AGENTS.md):

- See what is missing: **≤2** (open Add, scan section rail / scroll).
- Release once facts exist: **≤3** (open Add, jump Review, Release). Typing is the work.
- Distinguish caged vs released: **≤2** (existing Caged facet).

No layout `height`/`width`/`top`/`left` tweens. Instant show/hide. Opacity OK.

### 7.3 Design system (shadcn UI as this repo implements it)

Law **F11**: Tailwind utilities + house primitives. The primitives **are** the shadcn layer (`src/design-system/primitives`).

**Allow:** `Button`, `TextField`, `Checkbox`, `Switch`, `SearchField`, `DropdownMenu`, `Panel`, `Row`, `Stack`, `DeferredQtyInput`, `FlushTerminalFooter`, `StatusText`, `EmptyState`, `Spinner`, `IconButton`, `SearchableSelectField`, `PlatformMark`, `ConditionPills` / existing condition control, `StaffButtonGrid`.

**Forbid on new controls:** raw `bg-blue-600`, new CSS files, `shell.css` growth, nested `Card` stacks, a second modal buy UI, forking `TextField` into a page-local input.

Flush dividing stack (current triage). Gate marks: **glyph + text**, not color alone (`GateMark`). Release disabled **and** `Blocked by G2, G3` (already).

Locked `data-testid`s — see VERIFY. Do not rename them in the implementation.

---

## 8. Domain locks (do not re-litigate)

| Rule | Lock |
|---|---|
| Create | `POST /api/orders/add` only + existing set-item-number / tracking helpers |
| Cage / release / docs flag | `POST /api/orders/[id]/cage-release` |
| Gates | `evaluateReleaseGates` — never re-derive in JSX |
| Label buy | `BuyLabelSection` + order-rates + order-labels/purchase |
| Parcel type | `Parcel` / `ParcelSchema` — do not invent a second dim shape |
| Platform from id | `inferMarketplaceFromOrderId` — do not copy the regex into the form |
| Docs | `documents` + `document_entity_links` |
| Assignment | `PATCH /api/work-orders` / `saveWorkOrder` |
| CSV | `CSV_ORDER_CANONICAL_FIELDS` + `order-import-descriptor.ts` |
| orgId | `ctx.organizationId` on every write |
| Branch | **`main` only** |
| Motion | No geometry tweens |
| G4 | **Out.** Assignment is not a cage |

CSV / connector ingest **remain uncaged** (today’s `useOrderTriage` comment: only this form cages). Bulk staging **confirm** may land released if G1–G3 already hold from the file (tracking + docs exempt or docs exist + label). If a bulk row cannot pass gates, **cage it** or leave it action-required — pick one, document it in the report, do not silent-drop.

**Recommendation (locked unless you argue in the report):** bulk confirm uses the same rule as today for rows that already have tracking (live queue); rows missing G1 stay out of `fulfillmentScope` until complete; optional “cage incomplete bulk rows” is a follow-up, not a silent change to all CSV imports.

---

## 9. Architecture

```text
Add CTA (DeskActionSlot)
    ↓
OrderIngestRail  ── leaf: triage ── OrderTriageForm  ←── CanonicalOrderIntake
                 ── leaf: file   ── CsvImportStagingHost
                                      ↓ row click
                                   OrderTriageForm (same)

OrderTriageForm
    Identity  → inferMarketplaceFromOrderId + catalog pair
    Links     → G1 facts
    Documents → manuals / extra / exempt → G2
    Shipping  → parcel persist + BuyLabelSection | link → G3
    Assignment→ saveWorkOrder
    Review    → evaluateReleaseGates → Release

POST /api/orders/add  →  cage-release  →  work-orders PATCH
                      →  order-rates (weight+dims) → purchase
```

**Polymorphism:** the form never branches `if (csv)` for field meaning. Density is host chrome (grid vs scroll), not schema.

---

## 10. Phased delivery

### Phase 0 — Types + migration (expand)

1. `CanonicalOrderIntake` type + CSV key extensions + aliases.  
2. Nullable parcel columns on `orders`. Migration header: safety, rollback, verify SELECT.  
3. Extend `order-rates` body + `BuyLabelSection` payload (dims). Unit tests on `ParcelSchema` / route mapping.  
4. `npm run verify:fast`.

### Phase 1 — Acknowledge (single)

1. Wire infer + PlatformMark + chosen platform + duplicate lookup on Identity.  
2. Qty, SKU, item number, condition catalog on create payload.  
3. Pairing: item/SKU → catalog fill; compose manuals + exempt (already).  
4. Fulfillment channel when origin is manual and Buy is the intent.  
5. Unit tests for resolvers (pure): id → platform; project CSV row → intake.

### Phase 2 — Parcel + composed buy

1. Persist parcel on the order (PATCH via cage-release extra action **or** a small existing orders patch — **one** write path, no third). Prefer extending cage-release **or** orders add/update already used by the desk — do not add `/api/orders/parcel` unless nothing else can carry it.  
2. Compose `BuyLabelSection` in Shipping; pass weight+dims.  
3. Link path unchanged. Re-check gates.

### Phase 3 — Assignment

1. Compose staff pickers; `saveWorkOrder` TEST + PACK.  
2. Prove To-ship row names after release (e2e or DOM).

### Phase 4 — Bulk density

1. Staging grid columns / searchValues for new keys.  
2. Unknown platform → action_required.  
3. Row inspector = `OrderTriageForm`.  
4. E2E-BULK.

### Phase 5 — E2E + verify

1. `tests/e2e/order-intake-acknowledgment.spec.ts` per VERIFY.  
2. `npm run verify`.  
3. Report-back list in the prompt.

Skip-ahead is allowed only if a phase’s compose target is already done; do not skip Phase 0.

---

## 11. Success criteria

1. Amazon-shaped paste → Amazon mark, no extra platform click.  
2. eBay-shaped paste → eBay mark.  
3. Unknown-shaped id → platform select required.  
4. Duplicate order number acknowledged; no double insert.  
5. Item/SKU pair fills line defaults; manuals pair or exempt closes G2.  
6. Weight+dims on buy; one purchase call; G3 green.  
7. Tech + packer persist on `work_assignments`.  
8. Release only when G1–G3 pass; blockers named.  
9. CSV uses the same vocabulary; inspector shares testids.  
10. Scan stations untouched. Hand-entry leaf still works.  
11. `npm run verify` green.

---

## 12. Out of this ship

- Org-authored extra gates / G4  
- A second ShipStation client or Labels workbench rewrite  
- Catalog-level default weight table (no column exists)  
- Deleting `ShippedIntakeForm` / uncaged manual add  
- Live eBay/Amazon pull when tokens are dead (report; mock in e2e)  
- Porting intake to FBA / Incoming (Incoming already has its own add overlay)  
- Reconstructing deleted house-law regex tests  
- Branches off `main`; committing unless asked; restarting `:3050` / `usav-dev`

---

## 13. Read first (executor)

1. This plan  
2. `AGENTS.md` — verify, interaction budget, no layout animation, orgId, main-only  
3. `src/components/outbound/orders/triage/OrderTriageForm.tsx` + `useOrderTriage.ts`  
4. `src/lib/orders/release-gates.ts` + `caged-orders.ts`  
5. `src/lib/marketplace-order-id.ts` + `src/lib/source-platform.ts` + `PlatformMark`  
6. `src/lib/orders/csv-order-import.ts` + `order-import-descriptor.ts`  
7. `src/components/outbound/labels/BuyLabelSection.tsx`  
8. `src/lib/shipping/shipstation/types.ts` + `rate-request.ts` + `order-rates/route.ts`  
9. `src/app/api/orders/add/route.ts`  
10. `src/lib/work-orders/saveWorkOrder.ts` + `WorkOrderAssignPopover.tsx`  
11. `src/design-system/primitives/index.ts`  
12. `tests/e2e/add-order-to-ship-pending.spec.ts` (QA storage, pending grid assertions)
