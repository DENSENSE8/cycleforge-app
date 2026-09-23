# PLAN — "Customer & Labels" sidecar for the Outbound order panel

**Status:** plan only, nothing built yet · **Scope:** `OrderShippingPanel` + one new
read-only route · **Surface law:** `docs/mobile-first/SURFACE_LAW.md` (binding)

Design reference is ShipStation's Orders → Order Detail *layout language* (identity
column left, shipments below, actions right) with Shopify-admin card hierarchy (one
fact per card, title-case headers, secondary data as caption rows). Nothing is copied
from their code; every primitive below is one this repo already ships.

---

## 0. What already exists — read this before touching anything

### 0.1 The shipping-labels display button, top right (the thing not to rebuild)

`OrdersDeskLabelsAction` — `src/components/outbound/orders/paperwork/OrdersDeskLabelsAction.tsx:23-92`.

| Fact | Value |
|---|---|
| Mount | `DeskActionSlotRegistrar role="leading"` → the desk header action slot, top-right of `/shipping/orders`, immediately left of Sync Google Sheet / the Export menu |
| Control | `DeskHeaderAction` · `icon={<FileText/>}` · `variant` flips `secondary` → `primarySoft` while open |
| Label | `Labels` / `Labels · N`, N = `queueCounts.paperworkIncomplete` (print-packet incomplete, **not** G3) |
| A11y | `aria-pressed={walkOpen}`, `aria-keyshortcuts="l"`, ariaLabel "Labels display" / "Close Labels display" |
| Hotkey | `L` (guarded by `isEditableKeyTarget` + `hasOpenOverlay`); registered in the shortcut overview as "Labels display" |
| Test id | `orders-desk-labels` |
| Wiring | `src/components/unshipped/UnshippedTable.tsx:867-874` (`onToShipDesk` only) → `toggleLabelsWalk` → `?paperwork=<id>` |
| Lands on | `PaperworkWalkHost` as a `fill="stage"` `DeskStageOverlay` **over the still-mounted DataTable** (`UnshippedTable.tsx:885-928`, Center Lock) → `PaperworkEditor` → `TriageScrollLayout` sections `manuals` \| `shipping` → **`OrderShippingPanel`** |

`src/lib/tables/slot-action-overlay.ts:10-18` is explicit: the walk is the **one** Label
surface, and its three doors (this header CTA, the tracking hover row, the selection-bar
`Labels`/`l`) all land on it. **This plan adds no fourth door, no nav entry, and no
second status/filter implementation.** The sidecar rides inside the panel those doors
already open; the top-right button keeps its exact label, badge, hotkey and test id.

### 0.2 The other two "top right" controls already inside the panel

1. **`Re-check`** — ghost `Button` with `ml-auto` in the panel's own facts header
   (`OrderShippingPanel.tsx:194-202`) → `handleFactsChanged()` = refetch
   `orderReleaseGatesQuery` + `onFactsChanged()`. The sidecar **reuses this one
   re-check**; it must not grow a second refresh button (the `useOrderTriage` law:
   after every write, re-read server facts, never patch a fact locally).
2. **`Preview` + `Open in Media`** — right-aligned header of the document tray
   (`OrderDocumentsSection.tsx:434-455`, test id `order-documents-preview`) opening the
   shared `DocumentSlideOver` (label ⇄ slip switcher). It is gated by `showPreview`,
   and `OrderShippingPanel` does **not** pass it (`OrderShippingPanel.tsx:274-281`), so
   inside the panel that viewer door is currently **off**; `ShippedDetailsBody.tsx:105`
   is the only caller that enables it. Consequence for this plan: the history row's PDF
   affordance links to `outboundDocumentContentSrc(doc)` →
   `/api/documents/<id>/content` (`src/lib/documents/outbound-document-display.ts:29-31`),
   the same bytes `DocumentSlideOver` frames. No new viewer, no second slide-over.

### 0.3 Mount reality — the brief is half right

| Host | State |
|---|---|
| `PaperworkEditor.tsx:14,168-176` | **Live.** Direct import, `key={row.id}`, `testIdPrefix="paperwork"`, `onLabelPurchased={onAdvance}` |
| `OrderIntakeForm.tsx:37` | **Live.** The intake G3 Shipping card (`testIdPrefix="intake"`) |
| `LabelRunBand.tsx:27-41` | **File exists, lazy-loads the panel, ZERO callers.** The in-row band was killed by ruling 2026-09-05 (`slot-action-overlay.ts:12-16`) and `PLAN-to-ship-paperwork-ui.md:126` records it as "Built. Zero callers." Rebuilding it is refused. |

So: composing into `OrderShippingPanel` gives the sidecar to **both live hosts** for
free. Do not wire `LabelRunBand`, do not create a page (R-FLOW-6: shipping is a
component).

### 0.4 The buy engine already exists — extend it, never fork it

`BuyLabelSection.tsx` already owns the whole purchase mouth:

- rates arrive **cheapest-first**; index 0 gets a green **`Best`** chip (`:361-365`);
- one `clientEventId` per rate-shop session, minted in `ratesMutation.onSuccess`
  (`:118,148`) and reused by retries → a replayed purchase returns `idempotent: true`
  (`purchase/route.ts:143-152`);
- an inline confirm pane that already states cost + carrier + service and carries the
  `notifyCustomer` checkbox (`:380-434`);
- void with a required reason (`:176-202`), `onChange` after both verbs, `onPurchased`
  fired on buy only.

`OrderDocumentsSection.tsx:337-342` states the law in the margin: **two mounted buy
sections on one surface would be two mouths for one purchase.** Therefore
`★ RECOMMENDED`, the reason line and the "misses ship-by" flag are **edits inside
`BuyLabelSection`'s existing rate list**, and `CustomerShipToCard` never fetches rates
or calls `purchase`. It consumes `onPurchased` and re-reads.

---

## 1. Corrections to the brief (verified; the build must follow these, not the brief)

| # | Brief said | Ground truth |
|---|---|---|
| 1 | identity chip from `channel_refs.shipstation_customer_id` | **`customers.shipstation_customer_id`** — a dedicated column with a per-org partial unique index (`src/lib/migrations/2026-09-23_customers_shipstation_identity_search.sql:31-34`, `src/lib/drizzle/schema.ts:656`). `GET /api/customers/[id]` does **not** select it yet (`src/app/api/customers/[id]/route.ts:20-24`) → add it. |
| 2 | `purchased_at = stn.label_created_at` | The column exists (`0000_baseline…sql:1595`) but is **NULL at purchase** — only the carrier poller sets it on status `LABEL_CREATED` (`src/lib/shipping/repository.ts:406,447`). Use `COALESCE(d.created_at, stn.created_at)`. |
| 3 | void state readable from the documents⋈stn join | A void **hard-deletes** the label document (`outbound-documents.ts:391 DELETE FROM documents …`, `document_entity_links` cascades) **and unlinks the shipment** (`DELETE FROM shipment_links`, `orders.shipment_id = NULL`). The stn row survives orphaned with its metadata intact. The only surviving order→voided-label link is `audit_logs` (`action='orders.label.voided'`, `entity_type='order'`, `entity_id=orderId::text`, `metadata->>'shipmentId'`, `before_data->>'labelId'`, `metadata->>'reason_code'`). There is **no void column** anywhere. |
| 4 | "the order's ship-by deadline" | `orders` has **no** ship-by column — dropped 2026-03 (`0000_baseline…sql:1378-1383`); deadlines live in `work_assignments.deadline_at` (`entity_type='ORDER'`, `work_type='TEST'`). Every marketplace connector writes `shipByDate: null` (shipstation.ts:105, ecwid-orders.ts:120-123, shopify.ts:167, square.ts:90; eBay/Amazon never write one). Only Google-Sheets/CSV ingest and manual `updateOrder` populate it. **The recommendation rule must degrade when it is null**, and on this data it usually will be. |
| 5 | "buy → confirm → history row" provable today | Rate-shop currently returns **400 `SHIP_FROM_NOT_CONFIGURED`** — the placeholder `settings.shipFrom` was removed from org 1 this session. Acceptance step 3 (recommendation + buy) is **blocked** until a real warehouse address is entered under Settings → Shipping. Steps 1, 2 and 4 are provable now. |
| 6 | "mobile-first is law" (implicitly satisfied) | `OrderShippingPanel` is mounted on **zero** `/m` surfaces. Phone label work today is only *view/upload an existing label* (`MobileToShipSheet.tsx:265-296` → `MobileOrderDocumentsSheet`). Making these verbs completable on `/m` is therefore **real work in this plan**, not a byproduct (§6). |

---

## 2. Data layer

### 2.1 NEW `GET /api/orders/[id]/shipments` (the one new endpoint; read-only)

Skeleton per `skill://new-route`, `[id]` form → `requireRoutePerm` (because `withAuth`
ignores Next route `params`), copying `src/app/api/orders/[id]/documents/route.ts:30-41`
verbatim in shape:

```ts
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRoutePerm(req, 'orders.view');
  if (gate.denied) return gate.denied;
  const { id: rawId } = await params;
  const orderId = parseId(rawId);
  if (orderId === null) return NextResponse.json({ ok: false, error: 'Invalid order id' }, { status: 400 });
  const shipments = await listOrderShipments(gate.ctx.organizationId as OrgId, orderId);
  return NextResponse.json({ ok: true, shipments });
}
```

- `orders.view` already exists in `permission-registry.ts` → **no new permission**, no
  new audit verb (a GET audits nothing).
- Domain helper `listOrderShipments(orgId, orderId, deps?)` in
  **`src/lib/orders/order-shipments.ts`** — injectable `Deps { query }` so it unit-tests
  DB-free (`skill://domain-unit-test`). Handler stays validate → delegate → map.
- Regression row in `src/lib/auth/route-permission-manifest.test.ts`:
  `routesGatedBy('orders.view')` includes `/api/orders/[id]/shipments/route.ts`.

**SQL** (two CTEs; `tenantQuery(orgId, …)` so RLS GUC scoping holds):

```sql
WITH active AS (
  SELECT d.id                                   AS document_id,
         d.document_data->>'tracking'           AS tracking,
         COALESCE(stn.carrier, d.document_data->>'carrier') AS carrier,
         stn.id                                 AS shipment_id,
         stn.metadata->>'service'               AS service,
         stn.metadata->>'cost'                  AS cost,
         stn.metadata->>'currency'              AS currency,
         stn.metadata->'ship_to'                AS as_shipped,
         stn.metadata->>'label_id'              AS label_id,
         stn.latest_status_category             AS status_category,
         COALESCE(d.created_at, stn.created_at) AS purchased_at,
         false AS voided, NULL::timestamptz AS voided_at, NULL::text AS void_reason
    FROM documents d
    LEFT JOIN shipping_tracking_numbers stn
           ON stn.organization_id = d.organization_id
          AND stn.tracking_number_normalized =
              REGEXP_REPLACE(UPPER(COALESCE(d.document_data->>'tracking','')), '[^A-Z0-9]', '', 'g')
   WHERE d.organization_id = $1
     AND d.entity_type = 'ORDER' AND d.entity_id = $2
     AND d.document_type = 'shipping_label'
), voided AS (
  SELECT (al.metadata->>'documentId')::int      AS document_id,
         stn.tracking_number_raw                AS tracking,
         stn.carrier,
         stn.id                                 AS shipment_id,
         stn.metadata->>'service'               AS service,
         stn.metadata->>'cost'                  AS cost,
         stn.metadata->>'currency'              AS currency,
         stn.metadata->'ship_to'                AS as_shipped,
         COALESCE(al.before_data->>'labelId', stn.metadata->>'label_id') AS label_id,
         stn.latest_status_category             AS status_category,
         stn.created_at                         AS purchased_at,
         true AS voided, al.created_at AS voided_at, al.metadata->>'reason_code' AS void_reason
    FROM audit_logs al
    JOIN shipping_tracking_numbers stn
      ON stn.id = (al.metadata->>'shipmentId')::bigint
     AND stn.organization_id = al.organization_id
   WHERE al.organization_id = $1
     AND al.entity_type = 'order' AND al.entity_id = $2::text
     AND al.action = 'orders.label.voided'
)
SELECT * FROM active
UNION ALL
SELECT * FROM voided
ORDER BY voided ASC, purchased_at DESC NULLS LAST;
```

Notes the implementer must keep: `UPPER` **before** `REGEXP_REPLACE` (the baseline
backfill at `0000_baseline…sql:1415` has the stale inner-class bug — do not copy it);
a hand-attached label with no stn yields null service/cost/as_shipped, which is a fact
to render as `—`, not a row to hide; `cost` arrives as jsonb text → `Number()` client-side.

Response row (the client contract):

```ts
export interface OrderShipmentRow {
  documentId: number | null; shipmentId: number | null;
  tracking: string | null; carrier: string | null;
  service: string | null; cost: number | null; currency: string | null;
  asShipped: ShipAddress | null; labelId: string | null;
  statusCategory: string | null; purchasedAt: string | null;
  voided: boolean; voidedAt: string | null; voidReason: string | null;
  pdfHref: string | null; // `/api/documents/${documentId}/content` when documentId != null && !voided
}
```

### 2.2 Extend the panel's existing order-facts query (no new order read)

`GET /api/orders/[id]/cage-release` already backs `orderReleaseGatesQuery`
(`caged-orders-queries.ts:63-77`, `staleTime: 0`). Four edit sites in
`src/lib/orders/caged-orders.ts`:

1. `GATE_SELECT` (173-199): add `o.customer_id,` and a lateral for the deadline —
   ```sql
   LEFT JOIN LATERAL (
     SELECT wa.deadline_at FROM work_assignments wa
      WHERE wa.entity_type = 'ORDER' AND wa.entity_id = o.id AND wa.work_type = 'TEST'
      ORDER BY wa.updated_at DESC NULLS LAST, wa.id DESC LIMIT 1
   ) wa_deadline ON true
   ```
   selecting `wa_deadline.deadline_at::text AS deadline_at`.
2. `RawGateRow` (106-130): `customer_id: number | string | null; deadline_at: string | null;`
3. `CagedOrderRecord` (132-168): `customerId: number | null; deadlineAt: string | null;`
4. `mapRow` (219-247): `customerId: row.customer_id == null ? null : Number(row.customer_id)`,
   `deadlineAt: row.deadline_at ?? null`.

`orders.customer_id` is confirmed real (`order-rates/route.ts:44,54`).

### 2.3 `GET /api/customers/[id]` — add the identity column

`src/app/api/customers/[id]/route.ts:20-24`: append `shipstation_customer_id` to the
SELECT list. Nothing else changes (already `withAuth` + `orders.view` + `tenantQuery`,
orgId from ctx).

### 2.4 Query factories — one file, shared keys (no ad-hoc `fetch` in components)

New `src/lib/queries/customer-ship-to-queries.ts`, same `queryOptions` shape as
`caged-orders-queries.ts`:

| Factory | Key | staleTime | Notes |
|---|---|---|---|
| `orderShipmentsQuery(orderId)` | `['order-shipments', orderId]` | `0` | label history; invalidated on buy/void |
| `customerQuery(customerId \| null)` | `['customer', customerId]` | `60_000` | `enabled` only when id != null |
| `customerSearchQuery(q)` | `['customer-search', q]` | `30_000` | `enabled: q.trim().length >= 2` (route 400s below 2) |

`/api/customers/search` has **zero** front-end callers today — this card is its first
consumer; its response already carries `shippingAddress`, `shipstationCustomerId` and
`lastOrder { orderRef, status, orderDate, lastShipTo }` (`customer-queries.ts:442-466`).

---

## 3. Components — files, budgets, primitives

`ds_critique` on `OrderShippingPanel.tsx` reports one problem: **317 lines, past the
point reviewers read**. So the sidecar is authored as its own files and the panel gains
~8 lines (a lazy mount), not 300.

| File | Responsibility | Budget |
|---|---|---|
| `src/components/outbound/labels/CustomerShipToCard.tsx` | **Exported `<CustomerShipToCard orderId orderRef customerId deadlineAt onFactsChanged />`.** Orchestrates the four sections; owns the three queries; owns the responsive grid | ≤ 180 |
| `…/customer-ship-to/CustomerIdentitySection.tsx` | CUSTOMER + SHIP-TO + AS SHIPPED cards | ≤ 150 |
| `…/customer-ship-to/CustomerSearchPopover.tsx` | "Customer called back" lookup | ≤ 120 |
| `…/customer-ship-to/LabelHistoryList.tsx` | compact purchase rows | ≤ 110 |
| `…/customer-ship-to/ship-to.ts` | `addressLines()`, `sameAddress()`, `asShippedLines()` — pure | ≤ 60 |
| `src/lib/shipping/label-recommendation.ts` | pure recommendation rule (§4) | ≤ 70 |
| `src/lib/shipping/label-recommendation.test.ts` | `node:test` over the rule | ≤ 120 |

### 3.1 Mount inside the panel (lazy, like the panel's other heavy sections)

In `OrderShippingPanel.tsx`, mirroring `LabelRunBand.tsx:27-41`:

```ts
const CustomerShipToCard = dynamic(
  () => import('@/components/outbound/labels/CustomerShipToCard').then((m) => m.CustomerShipToCard),
  { ssr: false, loading: () => <p className="px-1 py-2 text-role-caption text-text-soft">Reading customer…</p> },
);
```

Rendered **between** the facts header and the parcel grid (identity before parcel, as in
ShipStation's detail page), fed `customerId={record?.customerId ?? null}`,
`deadlineAt={record?.deadlineAt ?? null}`, `onFactsChanged={handleFactsChanged}`.
`next/dynamic` + `ssr:false` keeps the To-ship first paint lean (payload law V8).

### 3.2 Primitive contract (from `ds_contract` / `ds_tokens` — nothing hand-rolled)

| Element | Mount |
|---|---|
| Card shell + title-case header + caption rows | `OrderRecordCard` / `OrderFactList` / `OrderFactRow` — `@/components/order-record/order-record-card` (`OrderFactRow … preserveLines span` for addresses) |
| Buttons | `Button` from `@/design-system/primitives` (`primary \| secondary \| ghost \| danger`, `sm \| md \| lg`) |
| Icon-only | `IconButton` / `CopyIconButton` from `@/design-system/primitives` |
| Email / phone / SS-id chips | `CopyChip` from `@/components/ui/CopyChip` with `tone="id"` + `icon={<Mail/>} \| {<Phone/>}`; **no** `EmailChip`/`PhoneChip` exists, and inventing a second copy-chip family is prohibited |
| Tracking | `TrackingChip` (`carrierHint` = row carrier) |
| Status / flag badges | `badge` from `@/components/ui/badge` — `warning` (address changed), `destructive` (misses ship-by), `secondary` (voided) |
| Search field | `Input` + `Label` from `@/components/ui/input` \| `/label`; results list follows the `AssigneeCombobox` / `IntakeCombobox` precedent (`Command` inside `Popover`) |
| Buy confirm | `requestConfirm` from `@/design-system/components/confirm` (`tone:'primary'`, `confirmLabel:'Confirm & buy'`) |
| Toasts | `toast` from `@/lib/toast` |
| Colors / radius / type | only `text-text-*`, `bg-surface-*`, `border-border-*`, `cornerClass(role)`, `text-role-*`. Zero hex, zero `rounded-*` literal, zero `text-[Npx]` |
| PDF link | `<a href={row.pdfHref}>` (= `/api/documents/<id>/content`) — the bytes `DocumentSlideOver` frames |

### 3.3 Section content (top → bottom)

**CUSTOMER** — display name (`display_name` → `customer_name` fallback); identity chip
`SS •<id>` from `customers.shipstation_customer_id` (omitted entirely when null — an
absent channel id is not a chip that says "none"); `email` + `phone` as copy chips;
right-aligned `Find customer…` ghost button opening the search popover.

**SHIP-TO** — the book address (`customers.shipping_*`) through `addressLines()`
(the canonical formatter, `CustomerDetailsTab.tsx:45-49`). Caption row under it, verbatim
intent: *"Rates and labels resolve this address server-side."* — display-only, no
"use for rate" control (`resolveOrderShipTo` already decides precedence:
ShipStation-sourced order → live v1 ship-to, else the local customer row,
`order-ship-to.ts:1-12`).

**AS SHIPPED** — latest non-voided history row's `asShipped`. When
`sameAddress(book, asShipped)` is false: both blocks side by side + `badge variant="warning"`
**"Address changed since last label"**. When there is no label yet the section is absent
(not an empty card).

**LABEL HISTORY** — one row per purchase: `service` · `money(cost, currency)` ·
`TrackingChip` · as-shipped street line (`text-role-micro text-text-faint`) · voided
badge with reason tooltip · `PDF` link. Voided rows sort last and carry no PDF (bytes
deleted). Empty state: *"No label bought for this order yet."*

**BUY LABEL** — unchanged mount: the existing `BuyLabelSection`, with §4's badge added
inside its rate list.

---

## 4. The recommendation rule

`src/lib/shipping/label-recommendation.ts` — pure, no React, no fetch:

```ts
export function recommendRate(
  rates: readonly ShippingRateOption[],
  opts: { deadlineAt: string | null; now?: number },
): { rateId: string | null; reason: string; missesShipBy: boolean; daysOver: number | null };
```

Rates already arrive cheapest-first (`BuyLabelSection.tsx:146` selects `rates[0]`).
`transitDays(rate)` = `rate.deliveryDays` ?? parsed leading integer of
`carrierDeliveryDays` ?? days between `now` and `estimatedDeliveryDate` ?? `null`.

| Case | Marked | Reason line (rendered under the badge) |
|---|---|---|
| deadline set, ≥1 rate meets it | **cheapest** meeting rate | `Cheapest service that still makes the Mar 4 ship-by (2 days).` |
| deadline set, none meets it | **fastest** rate (min transit; ties → cheaper) | `badge destructive` + `Fastest available still misses the ship-by by 2 days.` |
| deadline set, **no rate exposes transit days** | cheapest | `No carrier transit estimate — cheapest shown; ship-by not verifiable.` |
| **deadline null** (the common case on connector orders) | cheapest | `No ship-by on file for this order — cheapest service.` |
| zero rates | none | `—` (the existing "No rates returned for this parcel." pane stands) |

Render: `★ RECOMMENDED` (`badge`, star glyph + text — never color alone) **replaces the
existing green `Best` chip on the recommended row** so one row never wears two crowns;
`Best` stays only when it *is* the recommendation (same row). The reason line is always
one line, below the rate list, tied to the marked row.

`BuyLabelSection` gains one prop: `deadlineAt?: string | null` (threaded from
`record.deadlineAt` by `OrderShippingPanel`), and preselects `recommendRate(...).rateId`
instead of `rates[0].rateId` in `ratesMutation.onSuccess`.

**Confirm dialog:** the existing inline pane already states cost + carrier + service and
holds `notifyCustomer`. Per brief, the commit becomes an explicit `requestConfirm`
(`title: 'Buy shipping label?'`, description naming `money(amount)` + carrier + service +
order ref, `confirmLabel: 'Confirm & buy'`, `tone: 'primary'`) — the notify checkbox stays
in the pane (a dialog cannot carry it), so the pane keeps its role as the pre-commit
editor and the dialog is the last gate. `clientEventId` stays minted per rate-shop session
and reused across retries; a replay returns `idempotent: true` and must render as
"Label already purchased", which the success card already does (`:233`).

**Unit test** (`node:test` + `tsx`, the one test this plan adds — a genuinely uncertain
rule with real branch precedence): meets-deadline picks cheapest not fastest; none-meets
picks fastest and reports `daysOver`; null deadline degrades to cheapest with the
no-ship-by reason; missing transit data degrades without claiming a miss; empty input.

---

## 5. Write paths, optimism and cache discipline

- **Buy** — `BuyLabelSection.onPurchased(info)` already fires on success only. The card's
  handler (a) `queryClient.setQueryData(['order-shipments', orderId], prepend row built
  from the purchase response: tracking, carrier, service, cost, currency, labelId,
  documentId → `pdfHref`, `purchasedAt: new Date().toISOString()`, `voided: false`),
  (b) invalidates `['order-shipments', orderId]` and `['customer', customerId]`,
  (c) lets the panel's existing `handleFactsChanged` re-read the gate facts. No full page
  reload, no router refresh. The optimistic row is replaced by the server row on settle —
  the as-shipped card therefore reads server truth within one tick.
- **Void** — `BuyLabelSection.onChange` fires for both verbs; the card invalidates
  `['order-shipments', orderId]`. Because the void hard-deletes the document and unlinks
  the shipment, the refetched row arrives from the **audit CTE** with `voided: true`,
  a reason and no PDF — the badge appears without any client-side guessing.
- **Search → selection** is read-only. Selecting a result does **not** repoint
  `orders.customer_id` (that is a write this brief did not ask for and no route exposes);
  it shows that customer's book address + `lastShipTo` ("as shipped") so the operator can
  read the address back to a caller and copy it. The card states that plainly.
- Every read is org-scoped by `tenantQuery`/`withAuth` with `ctx.organizationId`; no orgId
  in any body; the one new route is read-only; no new table, column or convention.

---

## 6. Mobile-first (`/m`) — the real work, not a byproduct

Law: every operator verb must be completable on `/m/*` first
(`SURFACE_LAW.md` §1, R1–R10). Today `/m` can only *view or upload* an existing label
(`MobileToShipSheet.tsx:265-296`); `OrderShippingPanel` has no `/m` mount at all.

1. **Mount** `OrderShippingPanel` (which now carries the sidecar) in
   `src/components/mobile/redesign/OrderDetail.tsx` (`/m/orders/[orderId]`, the existing
   single-order task surface) via `next/dynamic` + `ssr:false` — that host imports
   everything statically today, so this is its first lazy section.
2. **Entry** from the existing `MobileToShipSheet` "Documentation" group: relabel/extend
   the current label action to open `/m/orders/[orderId]` (one door, no second nav entry,
   no `/m/pack`-style new queue).
3. **Layout** — the card is one column below `768px` (`grid grid-cols-1 md:grid-cols-2`),
   sections stacked in the prescribed order, and the **primary commit is sticky**: reuse
   `ConfirmDock` (`src/components/mobile/ConfirmDock.tsx:25-57`,
   `{ label, onConfirm, disabled, loading, tone, secondary }`) on the phone surface
   rather than a bespoke fixed bar. R2: exactly one primary CTA; R8: secondary actions
   (search, void) collapse into `BottomSheet` (`@/components/ui/BottomSheet`), not a
   second corner action.
4. **No dual trees** (R5/§4.3): the same `CustomerShipToCard` renders on desk and phone —
   responsive layout variants only, one step machine.
5. Update `SURFACE_LAW.md` §8's route table row for label work once the `/m` mount lands.

---

## 7. Verification (in this order; nothing claimed done before all of it)

All probes at **`http://localhost:3050`** (the switchboard; a lane port has a different
cookie namespace). Lane lifecycle: `systemctl --user restart cycleforge-lane@prod`.

1. **Backend, before any UI** — pick a real order with a linked customer and a label:
   `curl -s :3050/api/orders/<id>/shipments` → rows with service/cost/tracking/as_shipped;
   `curl -s :3050/api/customers/<cid>` → `shipstation_customer_id` present;
   `curl -s ':3050/api/customers/search?q=<partial>'` and again with a **formatted phone**
   (`(555) 123-4567` → the last-10-digit index path).
2. **Card renders real data** — open the To-ship desk, press the top-right **`Labels`**
   button (or `L`) → walk → Shipping section: identity, SS chip, copy chips, ship-to,
   as-shipped + history rows. Screenshot.
3. **Search** — from the card, partial name and formatted phone; assert `lastShipTo`
   renders as the "as shipped" chip.
4. **Recommendation + buy + void** — blocked until a real `settings.shipFrom` exists for
   the org (§1.5). Once entered: rates → `★ RECOMMENDED` + reason; confirm → history row
   prepends and as-shipped updates with no page reload; void → badge + reason appear on
   refetch. If ship-from is still absent at build time, the rate pane must show the
   existing `SHIP_FROM_NOT_CONFIGURED` message (already handled at
   `OrderShippingPanel.tsx:165-170`) and this step is reported as blocked, not skipped.
5. **Mobile** — `/m/orders/<id>` at 390px: stacked sections, sticky dock, every verb
   reachable by thumb. Screenshot.
6. `npx tsx --test src/lib/shipping/label-recommendation.test.ts` and
   `npx tsx --test src/lib/auth/route-permission-manifest.test.ts`.
7. **`pnpm verify:fast`** green (lint + typecheck + source-law gates).

---

## 8. Risks / decisions already taken

| Risk | Decision |
|---|---|
| Two buy mouths on one surface | Refused. `BuyLabelSection` stays the only purchase path; the card consumes `onPurchased`/`onChange`. |
| A fourth Labels door | Refused (`slot-action-overlay.ts:10-18`). The top-right `Labels` CTA, its badge, `L` hotkey and `orders-desk-labels` test id are untouched. |
| Ship-by mostly null | Rule degrades explicitly with a stated reason; no invented deadline, no hidden badge. |
| Voided history invisible | Solved by the audit CTE; no schema change, no soft-delete column added. |
| Panel file bloat (317 lines, `ds_critique`) | Sidecar lives in its own files; the panel gains a lazy mount only. |
| `LabelRunBand` temptation | Not wired. It has zero callers by ruling. |

## 9. Order of work

1. §2.3 + §2.2 (two tiny read extensions) → verify with curl.
2. §2.1 route + domain helper + manifest test → verify with curl.
3. §2.4 query factories.
4. §3 card files (search last).
5. §4 rule + unit test + `BuyLabelSection` badge/reason/`deadlineAt`/`requestConfirm`.
6. §5 optimistic wiring.
7. §6 `/m` mount + entry + `SURFACE_LAW` route row.
8. §7 verification, then `pnpm verify:fast`.
