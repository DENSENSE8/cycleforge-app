# HANDOFF — manual phone order, end to end, triage form (written 2026-09-27)

Scope: **outbound only.** A customer phones in an order: staff add it by hand, pair it
to a product, take payment, then buy a ShipStation label or record a label bought
elsewhere. This file specifies the **triage-mode form** and everything it must write.
Two prompts at the bottom: (A) build the form, (B) the same intake through AI chat.

Laws to read first: `docs/design-system/MODE-SPLIT-INVENTORY.md` (how triage vs industrial
resolve), `HANDOFF-desk-record-actions.md` (corners, labels, borders in code).
Dev origin `http://localhost:3050` only (AGENTS.md §1).

## What exists today (code read 2026-09-27)

| Piece | Where | State |
|---|---|---|
| Entry | Sidebar action `orders.add` "Add one order (review first)" → `/shipping/orders?triage=new` (`src/lib/nav/context/pages.ts:99`); URL wiring `useDashboardSearchController.ts:79-85,149-165` | works; **no hotkey** |
| Host | `OrderIntakeOverlay.tsx:18` (centred dialog) mounted by `OutboundOrdersDesk.tsx:271-276` | dialog portals to `body` → **escapes the `/shipping` ModeRegion** (only `:root` radius/label fallbacks; `bg-mode-*`/`text-mode-*` unstyled). Wrap `DialogContent` in `ModeRegion mode="triage" className="contents"` like `LinkLabelDialog.tsx:108` |
| Form | `intake/OrderIntakeForm.tsx:85`, sections `:44-51`: Identity · Links (G1) · Documents (G2) · Shipping (G3) · Assignment · Review | works; see gaps |
| Create | `useOrderTriage.ts:160-184` → `POST /api/orders/add` (`src/app/api/orders/add/route.ts`), then `POST /api/orders/set-item-number`, then `POST /api/orders/[id]/cage-release` (`cage`, `set-parcel`) | **no zod schema** (hand validation `:63-125`); **409 when `order_id` exists → one line per order only** |
| Product pairing | Item # input blur → `pairCatalogByItemNumber` (`useOrderTriage.ts:68-87`) → `GET /api/sku-catalog/by-item-number` | **no catalog search**; plain SKU / title inputs; `resolveSkuIdentityTitle` not used at intake |
| Customer | `customers` table (`src/lib/neon/customer-queries.ts:141-152`), `GET /api/customers/search`, `GET/PATCH /api/customers/[id]`; display `OrderCustomerSection` (`order-record-sections.tsx:115-180`) | **absent from intake** — no name/phone/email/address capture |
| Payment | none for orders. Stripe = SaaS billing only; Square = walk-in Terminal (`src/lib/counter/terminal-checkout.ts`) + repair payment links (`/api/repair/square-payment-link`) | **absent** — owner picks the method later |
| Buy label | `BuyLabelSection.tsx:106-579` (in intake `:835`, `OrderShippingPanel.tsx:309`, `OrderDocumentsSection.tsx:439`) → `POST /api/shipping/order-rates`, `POST /api/shipping/order-labels/purchase` (ShipStation V2, stores label PDF in `documents`, writes tracking) | works; **industrial face**: `flush` → `cornerClass('flush')` (`:116-117`), `font-mono` tracking (`:282`), `uppercase tracking-widest` eyebrows (`:253,258,281,285,290,333,364,400,427,436`) |
| Label desk | `LabelIntakeDesk.tsx` + `LabelIntakeRates.tsx` | fully industrial (`RECORD_LABEL_CLASS`, `RECORD_ID_CLASS`, `EVIDENCE_CONTROL_CLASS`, `evidenceVerbClass`) |
| Ship-to | `src/lib/shipping/shipstation/order-ship-to.ts` resolves from `customers` or the ShipStation API | a phone order has neither → **customer address is required before rates** |
| Parcel | `OrderRateDimensionsSchema` (`order-parcel.ts:7-13`): L/W/H > 0 inch\|cm; weight oz > 0 | works |
| External tracking | `LedgerTrackingReplace` (`outbound-orders-ledger-editors.tsx:541`) → assign waist `shippingTrackingNumber` (`useOrderAssignment.ts:188-215`); direct `POST/PATCH /api/orders/[id]/tracking` | works (record view only) |
| External label PDF | `LabelDisplay` upload (`MorphingRowActionMenu.tsx:727-802`) → `POST /api/orders/[id]/documents/upload` (`documentType: 'shipping_label'`, `source='manual_upload'`) | works (row menu only) |
| Admin link | `orders.admin_url` + `OrderAdminLinkAction` (`order-link-editors.tsx`, landed 2026-09-27) | manual orders can store their admin page |

## The form — triage layout

One dialog, `/shipping/orders?triage=new`, wrapped in `ModeRegion mode="triage"`.
Single column, max-w ~640px, sections are `rounded-mode` cards separated by space (no
industrial frames). Labels sentence case via `mode-label` / `RECORD_LABEL_CLASS`; controls
`rounded-mode-control`; chips/segmented pills `rounded-mode-pill`. **No** `cornerClass('flush')`,
`rounded-none`, `font-mono` except on the order number / tracking value, **no** `uppercase`.
Reuse: `TextField`, `SearchableSelectField`, `DateRangePickerField variant="compact"` (ship-by),
`AssigneeCombobox` via `StageStaffAssignPopover` (staff), `Button` radius from mode,
In place/Split segmented face for the two-way choices. Run `ds_contract` before adding any
primitive. Sticky footer: total on the left, primary action on the right.

```
┌ New phone order ────────────────────────────────────────── ✕ ┐
│ 1 Customer                                                    │
│   [ Search name, phone or email… ▾ ]   or  + New customer     │
│   Name · Phone · Email                                        │
│   Ship to: Line 1 · Line 2 · City · State · ZIP · Country     │
│   ☐ Bill to differs  → same six fields                        │
│ 2 Items                                                       │
│   [ Search products — title, SKU, item # ▾ ]                  │
│   ┌ [photo] Title (Zoho)   SKU   Stock 3 · Bin A-14         ┐ │
│   │ Qty [1]  Condition (pills)  Price [$ 89.00]      Remove │ │
│   └──────────────────────────────────────────────────────────┘ │
│   + Add another item                                          │
│ 3 Order                                                       │
│   Order #  [PH-000123] (Generate)   Channel [Phone ▾]         │
│   Ship by  [date]   ☐ Urgent   Buyer note [……]   Admin link   │
│ 4 Payment            (method: owner decides — slot only)      │
│   Subtotal · Shipping · Tax · Total                           │
│   Method [ ▾ ]   Status (Paid · Invoice sent · Unpaid)        │
│ 5 Shipping                                                    │
│   Parcel  Weight oz · L · W · H in   (prefill from SKU)       │
│   (● Buy with ShipStation | ○ Bought elsewhere)               │
│   ShipStation: rate rows (carrier · service · days · $) → Buy │
│   Elsewhere:  Tracking # [……] (carrier detected)              │
│               Label PDF  [ Upload ]  (pdf / image)            │
│ 6 Review — checklist of the gates, Assign pick/pack (opt.)    │
├───────────────────────────────────────────────────────────────┤
│ Total $97.40                          [ Save draft ] [ Release ]│
└───────────────────────────────────────────────────────────────┘
```

### Field contract — what completing the order must write

| Section | Field | Required | Writes |
|---|---|---|---|
| Customer | existing customer **or** name + phone | yes | `customers` row (search → id, else create) → `orders.customer_id` |
| Customer | email | optional (needed for ShipStation notify) | `customers.email` |
| Customer | ship-to address 1, city, state, ZIP, country (+ line 2) | **yes before rates** | `customers.shipping_address_*` — `order-ship-to.ts` reads it |
| Customer | bill-to | optional | `customers.billing_*` (check column names in `customer-queries.ts`) |
| Items | product (catalog search) | yes, ≥1 line | `orders.sku`, `orders.sku_catalog_id`, `orders.product_title` from **`resolveSkuIdentityTitle`** (Zoho item governs — `ds_sku_identity`); join via `SKU_CATALOG_JOIN_ON_SQL` |
| Items | qty (int ≥ 1), condition (`CONDITION_GRADES`), unit price | qty yes | `orders.quantity`, `orders.condition`, `orders.sale_amount`, `orders.currency` |
| Items | item # | optional (phone orders have no listing) | `orders.item_number` via `set-item-number` |
| Order | order # | yes, unique per org | `orders.order_id` — offer **Generate** (`PH-` + sequence) since phone orders have none |
| Order | channel | yes | `orders.account_source` = a manual/phone platform account (`orderPlatformChoices`) |
| Order | ship-by | optional | `deadline_at` via `updateOrder({ shipByDate })` |
| Order | urgent, buyer note, admin link | optional | `is_urgent`, `buyer_note`, `orders.admin_url` |
| Payment | amount summary | derived | totals only; no new column until the method is chosen |
| Payment | method + status | owner decides | **new fields TBD** — see payment note |
| Shipping | weight oz, L/W/H in | yes for Buy | `cage-release set-parcel` |
| Shipping · Buy | rate choice | yes for Buy | `POST /api/shipping/order-labels/purchase` → label PDF in `documents`, tracking on the order, `label_purchases` ledger |
| Shipping · Elsewhere | tracking # | yes for Elsewhere | `POST /api/orders/[id]/tracking` (or assign waist `shippingTrackingNumber`) |
| Shipping · Elsewhere | label PDF / image | recommended | `POST /api/orders/[id]/documents/upload` `documentType=shipping_label` |
| Review | pick / pack staff | optional | `PATCH /api/work-orders` (`saveWorkOrder`) |
| Release | gates pass | yes | `cage-release action=release` |

### Gaps the form forces (decide / build)

1. **Multi-line orders**: `/api/orders/add` 409s on an existing `order_id`. A phone order with 2 products needs
   either a batch create (one call, N lines, same `order_id`) or an "add line to caged order" path.
2. **Gate G1** requires item # + order # + tracking. Phone orders have no item #: let a catalog-paired SKU
   satisfy the product half of G1 (`cage-release` gate evaluation).
3. **Customer create**: search exists; confirm a create route (`POST /api/customers`) — add one if absent,
   org-scoped (`org-scope` skill).
4. **Zod** for `/api/orders/add` (`src/lib/schemas/orders.ts` is where `OrderUpdateBody` lives).
5. **Payment — owner decides the method.** Never type, store or log a card number in CycleForge
   (PCI). Candidate paths already in the repo: Square payment link (like `/api/repair/square-payment-link`)
   texted/emailed to the caller, or Square Terminal / virtual terminal. The form only needs: method,
   status, amount, and an external reference (payment link id / receipt).
6. **BuyLabelSection → triage face**: drop `flush` in the intake mount, replace `cornerClass('flush')` with
   mode corners, eyebrows to `mode-label` sentence case, rate rows as `rounded-mode-control` selectable rows,
   keep `font-mono` only on the tracking value. `LabelIntakeDesk`/`LabelIntakeRates` get the same pass
   (the whole `/shipping/label-intake` leak in MODE-SPLIT-INVENTORY).
7. External tracking + label upload exist only on the record / row menu — mount them in section 5.

## Prompt A — build the triage phone-order form

> Build the manual phone-order intake at `/shipping/orders?triage=new` per
> `docs/design-system/HANDOFF-manual-phone-order.md` (read it fully, then `MODE-SPLIT-INVENTORY.md`).
> Keep `OrderIntakeForm` / `useOrderTriage` as the one intake (no second form); restructure its sections to
> Customer · Items · Order · Payment (slot) · Shipping · Review, in `ModeRegion mode="triage"` inside the
> dialog. Add: customer search/create with ship-to, catalog product search (title via
> `resolveSkuIdentityTitle`), multi-line items, order-number Generate, the Buy-with-ShipStation vs
> Bought-elsewhere switch (tracking # + label upload reuse the existing routes). Convert
> `BuyLabelSection` to the triage face. Payment is a visible slot with method/status only — do NOT build
> card capture. Add zod to `/api/orders/add`; fix the one-line-per-order 409 and the G1 item-# gate for
> phone orders. Verify on :3050: create a 2-line phone order for a new customer, buy a label (or use a
> ShipStation sandbox if configured), then a second order with external tracking + uploaded PDF; both reach
> To ship with the label in Paperwork. `pnpm verify:fast` green; screenshot each section.

> **Contract (landed 2026-09-27, Prompt B):** the form MUST keep accepting a chat-drafted phone order at
> `/shipping/orders?triage=new&prefill=<base64url JSON>` validated by `manualOrderDraftSchema`
> (`src/lib/orders/manual-order-draft.ts` — customer + ship-to, lines with `skuCatalogId`/qty/condition/
> `unitPriceCents`, order #, channel, ship-by, parcel). The desk drops unknown URL params on mount, so the
> overlay captures it once (URL, else the same-tab `stashOrderPrefill` stash). Create goes through
> `POST /api/orders/add` → `createOrder` (`src/lib/orders/create-order.ts`), which already takes `lines[]`,
> `customer`, `shipBy`, `buyerNote`; `POST /api/customers` creates a customer; `nextPhoneOrderNumber` generates `PH-`.

## Prompt B — add a manual order through AI chat

> Give the assistant (`/ai-chat`) a write path for manual outbound orders. Today there is none: the tool
> registry `src/lib/assistant/tools/index.ts:25-70` has only order reads (`getOrderLookup`,
> `getOrderDocuments`), and `MUTATION_KINDS` (`src/lib/surfaces/registry.ts:406`) has no order create.
> `/api/orders/import/extract-capture` is called by `useOrderPasteIntake.ts:68` but has **no route**.
> Build: (1) a `draftManualOrder` tool that turns the conversation ("Jane Doe, 555-…, ship to …, two Bose
> 151 brackets, black, $39 each, ship by Friday") into the SAME field contract as the form in this
> handoff — customer, items resolved through catalog search + `resolveSkuIdentityTitle`, order #,
> channel, ship-by, parcel; (2) render the draft in chat as a triage card with an **Open in form** action
> that deep-links `/shipping/orders?triage=new` prefilled, and a **Create** action that requires explicit
> user confirmation before any write; (3) creation calls the same server code as `/api/orders/add`
> (import the lib, don't HTTP-hop), org-scoped. Label buying stays in the form (money moves need the
> human). Payment: the assistant must refuse card numbers and offer the payment-link path once the owner
> picks it — never echo, store or log a PAN. Find the repo's existing confirm-before-write assistant
> pattern and reuse it. Verify: a chat turn produces the draft, Create makes a caged order visible in the
> intake overlay, Open in form shows the same values.
