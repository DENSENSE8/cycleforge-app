# HANDOFF — One record grammar: item row, photo upload, pickup, repair, QC (owner 2026-09-29)

Paste this whole file as the prompt. It is self-contained.

## Working mode (owner, binding for this session)

- **Dogfood speed.** Build, prove on `:3050`, move on. No `ds_critique`, no
  `ds_contract` ritual — this session is changing the design system itself.
- **Design-system MCP stays lean.** Do NOT add `pinned.json` entries. The only
  pinned law this work rests on is the ROOT already recorded under
  `DeskRecordPlane`: every record (desk or search result) is ONE two-column body
  — main = the work, aside = the evidence. Edit an existing entry only if its
  text becomes false.
- **Clean cutover.** When a desk moves onto the shared record, delete its forked
  view pieces in the same step. No aliases, no shims.
- Checks per step: smoke on `http://localhost:3050` (throwaway Playwright,
  storageState `tests/.auth/admin.json`, import from `@playwright/test`, delete
  the script after), screenshots in `/tmp`, `pnpm verify:fast`; `pnpm verify`
  after steps 2–5. If the lane wedges (turbopack "Module not found" loops from a
  concurrent edit), `systemctl --user restart cycleforge-lane@prod`.

## Decisions already taken (owner accepted the plan's recommendations)

1. Product photo precedence: **our catalog / SKU listing cover first**, then the
   Zoho item image, then initials — one rule for the receiving line, the outbound
   line and `src/lib/photos/product-image-url.ts`.
2. Staff notes: **the inline editor stays** (Staff notes group under Serial
   numbers); the header verb "Carton notes" is deleted.
3. Repair customer phone / email render as `tel:` / `mailto:` links for everyone
   who can open the record.

## The shared anatomy (what "the same display" means)

Header: `# <record number> · <platform or channel> · <date>` (+ ticket chip when
one exists) and ONE status pill + next step. Main: the Fulfillment/Receiving band
(`RecordFulfillmentSources`: External rail · Internal `StepRail` in
`LatestEdgeScroller`, pinned so the newest started step sits at the right edge) →
Items (`RecordItem`, step 1) with `RecordPriceBreakdown` footer → `RecordSerials`
→ Staff notes. Aside: Photos door → alerts → `RecordFlowFacts` (party → hairline
→ movement). Verbs: `RecordActionStrip face="header"`; a verb's evidence swaps
the body for its panel with Back.

## Read only these (context budget)

- `src/components/receiving/record/{InboundRecordView.tsx,inbound-record-model.tsx,useInboundRecord.tsx,inbound-record-verbs.tsx}` — the reference record.
- `src/components/outbound/orders/OrderRecordView.tsx` — only the item row (≈ l.820–960) and `OrderLineFulfilment`.
- `src/design-system/components/record-ledger/{RecordItemIdentity,StepRail,LatestEdgeScroller,RecordPriceBreakdown,DeliveryPromise,RecordFulfillmentSources,RecordSerials,CarrierEventsRail}.tsx`, `src/design-system/components/RecordFlowFacts.tsx`.
- Per step, the files named in that step. Do not open other desks.

Already deleted this session (unreachable per knip + zero importers), do not
look for them: the old pickup grid (`receiving/pickup/grid/*`,
`PickupSidebarRail`, `pickup-order-rail-vm`), receiving sidebar leftovers
(`ReceivingBulkActionBar`, `TestingRecentRail`, `UnboxRecentRailFilters`,
`useRailEditMode`, `useReceivingClaimModal`, `useTriageUnfoundExceptions`,
rail-shell `PickupRailFilters` / `ReceivingRecentRailFilters` /
`useReceivingRailFacets`), `OrderIngestPanel`/`OrderIngestRail`,
`DashboardOrdersContextPanel`, `OrderLineStock`, `DeskPickTable`,
`TestingAssignDialog`, `ReceivingPhotosSection`, `ContextualEmptyState`,
`ReceivingTypeMark`, `SelectionActionBar`, `lib/local-pickup/create-order.ts`,
`receiving/unfound/grid/useUnfoundTableLayout`.

## Step 0 — close the last pass's gaps

- Put the per-item price back on the inbound item row (`unitCost × qty` →
  line total, `RECORD_PRICE_CLASS`); keep the `RecordPriceBreakdown` footer.
  Outbound's own contract: "line prices read on the items themselves".
- Delete the `carton-notes` verb (both builders in `inbound-record-verbs.tsx`);
  the inline Staff notes editor (`NotesTab label={null}`) is the one editor.
- Prove the Arrival face live: open a visible On-the-way record with tracking,
  run its refresh-tracking verb (the same `sync-one` the cron runs); if the
  carrier returns an estimate, "Arrives …" renders (`inbound-record-promise`).
  Only inbound shipment with an ETA today: carton 53308 (UPS 1ZJ22B100324366661,
  Oct 1) — its PO 21-15188-85823 is not lane-visible.
- Search: `src/components/search/dossier/SearchReceivingDossier.tsx` gets the
  Photos door (`InboundEvidencePhotosButton`) so linked photos open full-res from
  search; confirm its headings read Purchased from / Shipping.
- Warn ink `#9a3412` (`packages/design-tokens/src/modes.ts` `WARN_INK`): check
  contrast on `bg-mode-well` and `bg-surface-warning`, not just white.

Acceptance: inbound item rows show their line price; one notes editor; ETA seen
or its absence explained with the data; search opens photos.

## Step 1 — `RecordItem`: one item row everywhere + product photo upload

Extract `src/design-system/components/record-ledger/RecordItem.tsx` from
`InboundItem` and outbound's item row. Layout, one ruler:

```
[photo 112²] title ................................. qty (received/expected)
             SKU  <value>        [actions] | Item # <value>        [actions]
             Cond <chip>                   | Qty    <value>
             Serial <chips>                | Cost   <unit × n = total>
```

- Every value is plain `CopyableCellValue`; every action (listing ↗, SKU menu,
  documents) lives in `ItemIdentityRow`'s fixed actions slot. Today inbound puts
  `RecordListingLink face="value"` inside the value and wraps it in `h-8` inside
  an `h-9` row — that is the misalignment; the facts line below has no label
  width at all. Facts rows use the same label width as `ItemIdentityRow`.
- Condition: `RECORD_CONDITION_CHIP_CLASS` + `conditionGradeTone(grade).text` +
  `Tag` (already on inbound).
- **Photo upload**: the photo tile (and the empty initials tile) offers "Add
  product photo" (click, drag-drop, paste; camera on `/m/*`). Upload via
  `POST /api/sku/[id]/photos` (entity `SKU`, role `primary`), then set it as the
  SKU listing cover (`PATCH /api/photos/listing-gallery`, `targetKind: 'sku'`,
  `coverPhotoId`). Permission `receiving.upload_photo`. Flip precedence (decision
  1) in `src/lib/receiving/lines/sql-receiving-image.ts`,
  `src/lib/orders/orders-list.ts` (`catalog_image_url`) and
  `src/lib/photos/product-image-url.ts` so the upload shows immediately.
- Inbound and outbound both mount `RecordItem`; delete `InboundItem` and the
  outbound inline item markup.

Acceptance: SKU and Item # values start on the same x in both records, row
heights equal; uploading on an item with no photo shows it on the inbound row
and the outbound line for that SKU after refetch.

## Step 2 — `RecordModel` + `RecordView`

Rename `InboundRecordModel` → `RecordModel` (move the type to
`src/design-system/components/record-ledger/record-model.ts`) and
`InboundRecordView` → `RecordView` (same folder). Generalise only what pickup,
repair and QC need: `title.ticket?`, `internalLabel` ("Receiving", "Repair",
"Quality control"), `externalLabel`, party/movement section titles from
`recordFlowLabels` plus a `movement` title override ("Pickup", "Ticket").
Inbound adapters stay in `receiving/record/`. Step tones come from design-token
registries next to `INBOUND_LIFECYCLE` (`packages/design-tokens/src/`), then
`pnpm tokens:build`.

Acceptance: inbound smoke identical to before (header, rail pin, groups order).

## Step 3 — Local pickup (many items per purchase)

Data: `local_pickup_orders` (header: pickup_date, customer_name, payment_method,
paid_amount_cents, zoho_purchaseorder_number, receiving_id) →
`local_pickup_order_items` (receiving_line_id, sku, quantity, condition_grade,
total_price, parts_status). One carton, many `receiving_line`s. Desk `/pickup`
(`?lcpu=<id>`), today `src/components/receiving/pickup/PickupRecordView.tsx`.

Adapter `pickupRecordModel(order)`:
- Header `# <PO or LCPU-id> · Local pickup · <pickup date>`; pill
  "Awaiting grading 4/12" (count-aware, from the ladder).
- External half = the pickup, not a carrier: pickup date, collected by, payment.
  Internal: Ordered → Collected → Unboxed → Graded → Tested → Put away with k/N.
- Items: `RecordItem` compact; filter chips in the Items header (All · To grade ·
  To test · Failed); unit QC state and label state as chips on the serial row.
  Header batch verbs: grade selected, print labels for passed, assign tester.
- Price: Items · Paid (`paid_amount_cents`, payment method).
- Aside: Purchased from (seller, reference #, Zoho PO) → Pickup (date, collector).

Delete `PickupRecordView` and its `EvidenceStateStrip` / `PickupItem` /
`PickupUnit` forks; `/pickup` renders `RecordView`. Mobile `/m/receiving/pickup`
reads the same model.

Acceptance: a 12-item pickup triaged end to end (grade, test, label) on desktop
and `/m/receiving/pickup`; card identifiers equal the header.

## Step 4 — Repair service (ticket-first)

Data: `repair_service` (id → `RS-{id}`, sticker `REP-{id}`, `ticket_number`
Zendesk, `source_system` ecwid|counter|walk-in, `source_order_id`,
`source_tracking_number`, `status`, `status_history` jsonb, `customer_id`,
`issue`, `price`, `serial_number`, `source_sku`, `received_at`,
`label_printed_at`, pickup signature). Today
`RepairRecordView` + `RepairRecordStatus` (`repairPipeline`, hand-rolled 8-step
grid) with `REPAIR_RECORD_COLUMN_CLASS` panels.

Adapter `repairRecordModel(repair)`:
- Header `# RS-1042 · Ecwid|Walk-in · <created>` + ticket chip `#48120 ↗`
  (`zendeskTicketUrl`); pill = status + next step.
- External: carrier rail for `source_tracking_number` (inbound), or "Counter
  drop-off" (intake agreement); after repair, the return shipment.
  Internal `REPAIR_LIFECYCLE`: Checked in → Received → Label → In repair →
  Repaired → Ready → Picked up / Shipped, who/when from `status_history`.
- Items: the device in `RecordItem` (serial, source SKU); issue + quote as facts;
  price breakdown Quote · Parts · Paid.
- Aside: Photos (entity `REPAIR_SERVICE`) → Customer (name, `tel:`, `mailto:`) →
  hairline → Ticket (Zendesk link, issue template, intake / pickup documents).
- Verbs in the header strip: status change, pickup + sign (`RepairPickupFlow`
  as a panel), print REP label; status history = Timeline panel.

Delete `RepairRecordStatus`/`repairPipeline` and the column-class panels.
Mobile `/m/rs/[id]` reads the same model.

Acceptance: one Ecwid shipped repair and one walk-in run intake → pickup on the
shared record, desktop and mobile.

## Step 5 — Quality control

Desktop: `src/components/inventory/qc-labels/QcLabelRecord.tsx` and the `/test`
bench open `RecordView` for a unit via `qcUnitRecordModel(unit)`: header
`# SN … · SKU · <tested>`; internal `QC_UNIT_LIFECYCLE` (move
`src/design-system/tokens/qc-unit-lifecycle.ts` into the token package):
Received → Graded → Testing → Verdict → Labeled → Put away | Ticket. Verdicts
(Pass / Test again / Failed → `POST /api/serial-units/{id}/test`) are header
verbs; `QcFailTicketPanel` + `suggestQcFailRemedy` is the Failed verb's panel;
tester via `InlineStageAssign`. Mobile `/m/u/[id]/qc` keeps `QcUnitRecord`'s
F-pattern but reads the same model + tokens (codes, colours, next step match).

Acceptance: Pass, Fail (ticket filed), Test again on one unit, desktop and phone.

## Shipping service level → urgent (LANDED 2026-09-29, owner)

Rule: an order imported from ShipStation as Next day / 2-day / Expedited (buyer
`requestedShippingService`), or carrying an air service code such as
`fedex_2day_one_rate`, is urgent automatically.

- Tokens: `SERVICE_LEVEL` (`packages/design-tokens/src/service-level.ts`, word ·
  code · tone · `urgent` · `rank`), emitted to JSON + Swift by `pnpm tokens:build`.
- Classifier: `serviceLevelOf` / `serviceDowngrade` (`src/lib/shipping/service-level.ts`,
  tested on the real ref spellings).
- Fact: `orders.service_level` (migration `2026-09-29_orders_service_level.sql`).
  Writer: `applyOrderServiceLevels` (`src/lib/shipping/order-service-level.ts`),
  called by the ShipStation connector right after `upsertOrderRefs`. It sets
  `is_urgent` only when the level CHANGES to an urgent one — an operator who
  clears urgent is never re-flagged; `is_urgent` is never cleared by the import.
- Backfill run 2026-09-29: 620 rows classified, 13 marked urgent (9 secondDay,
  3 expedited, 1 nextDay).
- Paint: `ordersUrgentLabel` names the reason everywhere urgent paints — compound
  rail (`ordersEdgeMark` / `ordersGroupEdgeMark`), Allocate card chip
  (`OrderCard`), phone context line (`MobileToShipRow`). A paid-for fast order on
  a Ground label reads "2-day → Ground". Heat order is unchanged (urgent rail
  first).

## Highest-ROI additions (owner 2026-09-29)

1. `GridRowCheckbox` takes `statuses` so every flat grid gets the 2026-09-15
   gutter law (status at rest, checkbox on hover, `(hover: none)` → checkbox);
   delete the wrappers in `CompoundSelect` and `TaskTable`. Touch never shows
   the resting mark, so `/m/*` carries the word in the card line instead.
   `RecordItem` (Step 1) mounts it for Step 3's batch verbs. Lifecycle status on
   EVERY row would reverse the 2026-09-04 ruling — operator call, not assumed.
2. One lifecycle registry feeds pill + `StepRail` + filter chips + gutter mark
   (Step 2).
3. Scan/Enter open, J/K walk, prefetch next — built once in `RecordView` (Step 2).
4. Throughput baseline captured before Step 0.
5. QC verdict keys P / F / T (Step 5).

## Fulfillment spine (proposal, NOT built — owner call pending)

Renaming `orders` is rejected on evidence: 211 files `FROM orders`, 52 `JOIN`,
41 `UPDATE`, 28 FKs, 17 triggers, and an `orders` row is an order LINE, not a
package. Proposed: additive `fulfillments` header (`fulfillment_type`
FBM | FBA | PICKUP, FKs to `orders` anchor line / `fba_shipments` /
`shipping_tracking_numbers`, deadline + milestones), kept by one refresh helper
like `order_stage_facts`, backfilled, then desks cut over one at a time.

## Fulfilled — one top-level record of everything that left (proposal, owner 2026-09-29)

Rename the destination "Fulfilled", not "Shipped": it covers every channel and
route that left the building — FBM parcels, FBA cartons, local pickups, and
(read-only) Amazon-fulfilled sales. Saved views, not separate desks, split it.

Routes (warehouse-floor order: the work queue per mode, the record once):

| Route | What | Replaces |
|---|---|---|
| `/fulfillment/fbm` (Allocate · Exceptions) | FBM work in flight | `/shipping/orders`, `/shipping/exceptions` |
| `/fulfillment/fba` | FBA prep work in flight | `/fba`, `/shipping/fba` |
| `/fulfilled?view=<id>` | everything that left, one list | `/shipping/shipped` + FBM›Shipped |
| `/m/fulfilled` | the same list, phone | — |

Saved views on `/fulfilled` (each = a preset of the filters below):
All · Online orders (every marketplace + storefront) · FBM · FBA · Pickup ·
Late (shipped after ship-by) · Upgraded service (Next day / 2-day /
Expedited) · Delivered.

Needs attention is NOT a Fulfilled view (owner 2026-09-29): a package that
needs a person is an exception, so it lands in the Exceptions hub under the
Fulfillment domain as a new kind next to FBM · Labels & docs · Paperwork —
`delivery` ("Delivery": carrier exception, return to sender, no carrier scan
48h after label, delivered late against an urgent service), added to
`EXCEPTION_KIND_SPEC` in `src/lib/exceptions/types.ts`. Fulfilled keeps an
Exception pill that deep-links into that list; it never becomes the work queue.

Card anatomy (built 2026-09-29, `ShippedPackageCard` over `RecordCard`, the
Allocate face):

```
[status|☐] # order · tracking (copy)                                  Shipped Sep 29, 12:31 PM
           [photo] title (+N more lines)
                   ×qty · condition · $total                      Details ⌄   → ● In transit
```

- Header = order number + tracking number, nothing else (owner 2026-09-29).
- Top right = when it left; bottom right = the carrier's live word (USPS reads
  "Integration pending" until its feed exists).
- Details (Space / toggle) carries the rest: channel (+FBA), carrier status,
  scanned out by, packed by, tested by, serial, SKU, note, "Never pack-scanned".
- Status and selection share the top-left slot on every card (status at rest,
  checkbox on hover / focus / touch).

Filters/sort (ShipStation shipments tab and Amazon's shipping metrics are the
references: Late shipment rate, Valid tracking rate, On-time delivery rate):
ship date range (default this week) · channel/store · mode (FBM/FBA/Pickup) ·
carrier · label service · tracking state · service level · packed by · scanned
by · late vs on time · SKU/title search. Sort: shipped newest
(default), ship-by, delivered, carrier state severity, order total.

Status pills right of the count (bucketed from carrier state): Label only ·
In transit · Out for delivery · Delivered · Late · Exception (count only —
clicking it opens Exceptions › Delivery, not a filter on this list).

Known defect to fix in the port: the Shipped desk shows about 10 packages. The
fetch pages at 1000 (`SHIPPED_WEEK_PAGE_SIZE`), so the cap is downstream of the
fetch — find it before porting, not after.

Sequence: (1) fix the count on today's `/shipping/shipped`; (2) mount it at
`/fulfilled` with saved views, redirect the old path; (2b) add the Fulfillment
`delivery` kind to Exceptions and wire the Exception pill to it — reconcile with
the existing Inventory `tracking` kind (`tracking_exceptions`) so one carrier
problem is one exception, not two; (3) add FBA cartons (reads `fba_shipments` +
`fba_shipment_tracking`); (4) move FBM/FBA work desks under `/fulfillment/*`
with redirects; (5) the `fulfillments` spine above lets step 3 stop unioning
two sources.

Product photos (2026-09-29): the marketplace backfill now reads Amazon ASIN,
eBay item id, Shopify variant SKU and Ecwid product id
(`pnpm marketplace:images:backfill --apply`). Shipped package lines read
`orderLineImageSql` (`src/lib/photos/order-line-image-sql.ts`), tier for tier
the Allocate COALESCE. Open: cut `orders-list.ts` over to the same fragment
behind an EXPLAIN/timing benchmark (it keeps its laterals until then), and
flip `productImageUrl` to catalog → cover → Zoho (decision 1, Step 1).

Display fork (industrial vs triage): the triage family (TriageCardList ·
RecordCard · TriageRow) is the one list. 18 desks already use it; 18 still use
compound `DataTable` (FBA ready, receiving lines, tech, review ×3, inventory
units/bins/holds/returns/cycle counts/bulk-allocate/drift, warranty, sales,
search). The right rail forks too: 8 triage desks import the industrial
`RecordLedgerSummaryPane`. Port order: (1) one triage summary pane
(Allocate's `OrderQueueSummaryPane` promoted) and delete the ledger pane;
(2) the fulfillment desks (FBA ready → `fba.ready` view); (3) receiving/tech;
(4) review; (5) inventory; keep-sheet desks (reports, settings, events) stay
tables.

## Throughput (measure before/after each step)

Scan→record open, open→first verb, verbs per record — from existing ops events
(`src/lib/observability/tier1-paint-order.ts`, station activity logs); run
`pnpm run eval:station <id>` per ported desk. The levers: fixed eye position
(header + one ruler), "now" pinned in view, filter-by-exception on many-item
records, header batch verbs, scan/Enter open + J/K walk + prefetch next record,
`/m/*` parity.

## Dead-code candidates for their owning sessions (NOT this handoff)

knip reports ~125 more unreachable files outside these domains (fba sidebar and
station-input, manuals library, home/daily agenda, `features/tasks/*` — the
task-board session's migration source — audit-log panel, header switchers,
catalog grid hooks). `RecordLedger.tsx` is now importer-free too but is being
edited by another session and is named in pinned law text — leave it to them.
Run `npx knip --include files` in those sessions.

Deleted 2026-09-29 (owner): `OutboundOrdersLedger`, `OutboundOrdersLedgerToolbar`,
`useViewDensity`, `view-sort`, `OrdersLedgerStandIn`, `AwaitingEbayPanel`,
`shipped-order-to-pack-pane`, and the old Shipped UI (`components/shipping/
shipped-filter/*`, `ShippedFilterToolbar`, `ShipmentStatusBadge`,
`lib/shipped-dashboard-params`). The live Shipped filters are
`src/lib/shipping/shipped-filter/*`.
