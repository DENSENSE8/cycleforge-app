# Goal — Fulfilled, one page for everything that left

Pin this. Do not relitigate the shape. Implement against the facts below.

Fulfilled is an L1 row in the Fulfillment lane, the same rank as FBM, FBA, and Labels & docs. One page. Every package that left the building — online orders, FBA cartons, storefront, counter — is a row on that page. Channel, carrier, and carrier state are saved views and pills, not separate desks.

## Wrong today

Fulfilled is a child of FBM.

- `DESK_VIEWS` id `shipped`, `navChild: 'shipped'`, label `Fulfilled`, path `SHIPPING_SHIPPED_PATH` (`/fulfilled`).
- `SIDEBAR_PAGE_NAV` paints it under `id: 'outbound'` (label FBM), next to Allocate and Exceptions.
- `getSidebarNavPageId('/fulfilled')` returns `'outbound'`, so the spine lights FBM, not its own row.
- FBA's own child `id: 'shipped'` (label Shipped, `?fbaMode=shipped`) is a different feature. Do not rename it and do not fold the FBA board into this page.

## Target nav

A new `SIDEBAR_PAGE_NAV` entry, peer of `outbound`, `fba`, and `label-intake`:

| Field | Value |
|---|---|
| id | `fulfilled` |
| label | Fulfilled |
| href | `/fulfilled` |
| kind | `domain` |
| domainGroup | `fulfillment` |
| railless | `true` |
| requires | `packing.view` |
| children | the saved views below, never a child also named Fulfilled |

`getSidebarRouteKey('/fulfilled')` stays `outbound` (same panel chrome as the other fulfillment desks). `getSidebarNavPageId('/fulfilled')` returns `'fulfilled'`, not `'outbound'`. Route permission prefix `/fulfilled` → `packing.view`, longer than `/shipping`.

Remove the `shipped` child from FBM's `DESK_VIEWS` paint. `/shipping/shipped` redirects to `/fulfilled` and carries every query param. FBM opens on Allocate, as it does now.

Nav-name law: a parent and a child never share a name. The lane is Fulfillment. The row is Fulfilled. Children are All, Online, FBA, and the other view names below — never Fulfilled, never Shipped.

### Open operator call — do not decide

The FBA *board* (Ready, Plan, Combine, Shipped, Catalog) stays its own L1 until the operator says otherwise. This page's FBA view is the archive of FBA packages that left, not the prep workflow. Amazon-fulfilled sales (AFN, we did not pack them) are read-only rows on this page if the feed already has them; they are not a reason to delete the FBA board.

## One list, one grain

Grain is the package. One card per carrier tracking number. A pack scan with no tracking keys as `scan-<id>`. A multi-package order is one card per package.

Root is the existing feed: `station_activity_logs` `SHIP_CONFIRM` through `fetchPackerLogRows` (`/api/packerlogs`). Order number, SKU, title, channel, and carrier status are display attributes on that row. Do not plant a second query. Do not read `packer_logs.ship_confirmed_at` — that column does not exist. The dock stamp is `sqlLatestShipConfirmAt()` / `ship_confirmed_at` on the SHIP_CONFIRM event, plus `shipped_out_by`.

Measured 2026-09-30: `GET /api/packerlogs?dateFrom=2026-09-30&dateTo=2026-09-30&limit=2000&shippedFilter=all` returned **1304** rows, all with a real dock stamp. The facet total for that day was **1235**. Those two counts must be reconciled (same predicate) before the page is called done. The old "4" and the old "947" were page caps and filters, not the day.

`shippedFilter` today is `all | orders | sku | fba` (`TYPE_ITEMS`). There is no `pickup` value. Do not paint a Pickup view until a real predicate exists. Pickup packages that already match `orders` or `all` stay in those views.

## Saved views

Each view is a preset of the sidebar params, URL `?view=<id>`, not a new page and not a new query.

| View | What it is | Param today |
|---|---|---|
| All | Every package that left | `shippedFilter=all` (absence is the same) |
| Online | Marketplace + storefront orders: eBay, Amazon (merchant), Shopify, Ecwid, Walmart, Mercari, AliExpress, Zoho, Square | `shippedFilter=orders` until a channel facet exists |
| FBA | Amazon prep cartons (`account_source = fba` or an FNSKU on the scan) | `shippedFilter=fba` |
| SKU | Shipments that are not an order and not FBA | `shippedFilter=sku` |
| Delivered | Carrier `latest_status_category = DELIVERED` | `statusCategory=DELIVERED` |
| On the way | Accepted, in transit, or out for delivery | `statusCategory` is single-value today — this view needs a multi or a dedicated preset once the pill exists |
| Late | `ship_confirmed_at` after `ship_by_date` | not a param yet; see timestamps |
| Exception | Count only. Click opens Exceptions, it does not filter this list into a work queue | existing `exceptions=1` may narrow; the pill's job is the deep link |

Channel marks already exist in `SOURCE_PLATFORMS`: eBay, Amazon, FBA, Shopify, Ecwid, Walmart, Mercari, Square, Zoho, AliExpress, Goodwill, Other. A channel facet reads `account_source` through that table. Do not invent a parallel label map.

## Contextual sidebar — reuse, do not fork

The desk already mounts the contextual sidebar (`outbound.shipped` in `src/lib/nav/facets/contexts.ts`). Keep that contract. Filters are URL params answered in `fetchPackerLogRows`' WHERE, the same predicate the facet counts use. A filter that only runs in the browser will disagree with the pill count. That disagreement is a bug.

Already advertised and answered in SQL:

| Control | Param | Notes |
|---|---|---|
| Find | desk search | order number, tracking, SKU, title |
| Period | `dateFrom` / `dateTo` | exact day or range. Default is the current week only when the URL names no day. A picked day must be the SQL window, not a week bucket that the client then clips |
| Time of day | `timeFrom` / `timeTo` | warehouse wall clock, on top of the day |
| Staff | `staff` | packed or tested by |
| Picked by | `pickedBy` | the order's picker |
| Packed by | `packedBy` | |
| Type | `shippedFilter` | All / Orders / SKU / Amazon Prep — relabel Orders → Online, Amazon Prep → FBA |
| Carrier | `carrier` | UPS, USPS, FedEx (`CARRIERS`) |
| Tracking status | `statusCategory` | Label created, Accepted, In transit, Out for delivery, Delivered, Exception, Returned |
| Needs attention | `exceptions` | stalls. Not a work queue. See Exceptions below |

Add, in this order, only when the column is on the list query:

1. Channel (`account_source`, multi). This is how eBay vs Amazon vs Shopify is triaged without leaving the page.
2. Scanned out by (`shipped_out_by`).
3. Late vs on time, once `ship_by_date` is on the spine (it is NULL in `phase=spine` today).
4. Service level (Next day / 2-day / Expedited). **Not on the packer-log select today.** Do not paint the control until the column is selected. ShipStation has `service_code` / `estimated_delivery_date`; the list does not.

Sort lives in the sidebar, not a private menu on the cards. Keys, default first:

| Sort | Key | Where the fact lives |
|---|---|---|
| Scanned out, newest | `ship_confirmed_at` | on the list row. Default |
| Scanned out, oldest | same, ascending | |
| Delivered, newest | `shipping_tracking_numbers.delivered_at` | **not selected by `fetchPackerLogRows` today.** Promoting it into the list SELECT is the intended sort. Client-sorting the loaded window is not acceptable for a day of 1,300 rows |
| Ship-by | `ship_by_date` | hydrate-only today (`deadline_at`). Promote into the spine before this sort is offered |
| Carrier state | `latest_status_category` severity: Exception, Returned, Out for delivery, In transit, Accepted, Label created, Delivered | category is on the row; severity is a fixed order, not alphabetical |
| Order total | `sale_amount` | on the row when the order joined |

A sort that is not in this table does not get a control.

## Status pills — the ecommerce strip

Pills sit beside the count, on the list, the way Allocate's summary row does (`StatusChipRail` in `ShippedLedger`). They count packages in the loaded window that match, and they narrow the list in place. They are not a second navigation.

Vocabulary, in paint order. A package may light more than one pill. Tapping a pill shows that many.

| Pill | Membership | Tone |
|---|---|---|
| Fulfilled | every package on this page (the parent count) | success |
| Scanned out | real dock handoff: `ship_confirmed_at` set, not the sentinel `"1"`, and `shipped_out_by > 0` | the existing scanned-out face |
| Label only | `latest_status_category = LABEL_CREATED` and not yet accepted | neutral |
| On the way | `ACCEPTED`, `IN_TRANSIT`, or `OUT_FOR_DELIVERY` | the in-custody / in-transit face |
| Delivered | `latest_status_category = DELIVERED` or `shipping_tracking_numbers.is_delivered` | success |
| Late | scanned out after `ship_by_date`, or delivered after an expedited promise | warning |
| Exception | carrier exception or return. **Count only.** Click opens Exceptions › Delivery, it does not become the work queue | danger |
| Unmatched | open scan with no order line | danger |
| Never packed | `packed_by` is null | warning |

A dock scan stays under Scanned out after the carrier marks it Delivered. Carrier status is a column and a pill, not a reason to drop the row from Scanned out. That rule is already in `shippedStatusKeys`. Keep it.

USPS has no live feed. The card already says "Integration pending". The Delivered pill must not pretend a USPS box is delivered because the label was printed.

Existing chips `IN_CUSTODY`, `PROCESS_GAP`, `ORPHAN` fold into the words above (On the way, Exception, Unmatched). Do not paint both the old word and the new word for the same fact.

## What a row must show

The closed row matches Allocate (owner 2026-09-30). It communicates only:

```
[status|☐] # order · platform                         Sep 30, 7:37 PM
           [photo] title
                   ×qty · condition · $price                         → ● Delivered
```

1. Status indicator (left slot) and the order number, with the platform beside the order.
2. Top right is the dock stamp (`ship_confirmed_at`), warehouse time. Missing stamp reads "Not scanned out", never a blank and never the sentinel `"1"`. Ship-by stays in Details.
3. Product image, one-line title, and the compact value line (×qty · condition · price).
4. Next action at the lower right: the carrier's live word, or "Resolve" when unmatched.

The select-all checkbox shares the row checks' column. The list is `px-1` and the card is `pl-4`, so the bar's check column is `pl-4`, not `pl-3`.

- Details (the existing toggle) carries the rest, each as a labeled fact, empty as an em dash not a hidden row:
  - Channel, via `PlatformMark` (`account_source`)
  - Tracking number (copy)
  - Carrier + service, when service is on the row
  - Scanned out by (`shipped_out_by_name`) and the dock instant (`ship_confirmed_at`). Missing stamp reads "Not scanned out", never a blank and never the sentinel `"1"`.
  - Delivered at (`delivered_at`), exact, or "Not delivered"
  - Promised by (`estimated_delivery_at`) when the carrier has one
  - Ship-by (`ship_by_date`) and late/on-time against the scan-out
  - Packed by + pack time (`created_at` of the represented PACK row — this is not the dock time)
  - Picked by, tested by
  - SKU, item number, serial, condition, qty, price
  - Buyer note, internal note
  - Never pack-scanned, when `packed_by` is null

Copy on the tracking number and the order number. Open is `?shipment=` (`SHIPMENT_RECORD_PARAM`). The record plane is the existing shipment record, not a new page.

### Ecommerce facts this page is for

A seller scanning this list the way Amazon Shipping, eBay sold, or Shopify orders is scanned must be able to answer, without opening the record:

- Did it leave the building, and when, and who scanned it.
- Did the carrier accept it, and when.
- Is it on the way, out for delivery, or delivered, and the exact delivered instant.
- Which marketplace (eBay, Amazon, Shopify, Ecwid, Walmart, the rest of `SOURCE_PLATFORMS`).
- Which carrier, which tracking number, whether the tracking is valid.
- Whether it left after ship-by (late shipment).
- Whether the buyer got it by the promised day (on-time delivery). USPS cannot answer this until its feed exists; the row says so.
- What was in the box: title, SKU, qty, condition, price.
- Whether the scan is unmatched, never packed, or a carrier exception.

Valid-tracking rate, late-shipment rate, and on-time delivery rate are the three seller metrics (ShipStation shipments tab, Amazon shipping metrics). They are counts on this page's pills and the period, not a separate analytics desk. A rate with no row behind it is not done.

## Period and paging

A named day (`dateFrom` = `dateTo`) is the SQL window (`shippedTimeWindow` of that civil day, warehouse zone), intersected with the week bucket the client still sends. The client clip uses `shippedRecordTimestamp` (`ship_confirmed_at`, then pack time). Both sides must use the dock stamp. A row packed on the 18th and scanned out on the 30th belongs to the 30th.

Page size stays `SHIPPED_FEED_PAGE_SIZE` (100) so the first paint is fast. The named day auto-loads until the server returns fewer rows than the limit, cap 20 pages (2,000). A week view auto-loads 3 pages, then Load more. The `{ dateFrom, dateTo }` object passed into `dashboardShippedWeekQuery` must be memoized. A fresh object every render changes the react-query key, the settled data disappears, `truncated` reads false, and auto-load stops on page 1. That bug is in scope.

Pills count the loaded window. The pager's "of N" is the facet total for the same params. When the day has finished loading, the Fulfilled pill and the pager total are the same number. Until they are, the pager may say "94 of 1235" and that is honest — it must not say the day is complete.

## Exceptions

Needs attention is not a Fulfilled view. A package that needs a person is an exception. The Exception pill deep-links to the Exceptions hub, Fulfillment domain, kind `delivery` (carrier exception, return to sender, no carrier scan 48h after label, delivered late against an urgent service). That kind is proposed in `docs/handoff/HANDOFF-record-grammar-port-2026-09-29.md` and is not built. Reconcile it with the existing Inventory `tracking` kind so one carrier problem is one exception. Until that kind exists, the pill still counts and opens the existing exceptions list filtered to fulfillment; it does not grow a private queue on this page.

## Phone

`/m/fulfilled` is the same list, same params, same pills, on the mobile shell. Not a separate data model. Not in the first cut if the desktop page is not done. Law: `docs/mobile-first/SURFACE_LAW.md`.

## Out of scope

- A `fulfillments` header table. Proposed, not this goal.
- Moving FBM or the FBA board under `/fulfillment/*`.
- Renaming `orders`.
- A second archive for FBA prep.
- USPS live tracking. The row already says the integration is pending.
- Replacing `TriageCardList` / `RecordCard` with a new table.
- Analytics dashboards. The three rates are pill counts on this page.

## Done when

1. The Fulfillment lane paints Fulfilled beside FBM, FBA, and Labels & docs. FBM no longer has a Fulfilled child. No parent/child name collision.
2. `/fulfilled?dateFrom=2026-09-30&dateTo=2026-09-30` lists every dock scan for that day. The Fulfilled pill equals the pager total. Scanned out includes every row with a real `ship_confirmed_at` and `shipped_out_by`, including ones the carrier has since marked Delivered.
3. The sidebar filters above that already exist narrow the list and the facet count together. Channel, once added, narrows the same way.
4. Sort by scanned-out time changes row order. Sort by delivered time changes row order, and the delivered instant on the card is `delivered_at`, not the scan-out time.
5. Opening a card shows channel, both times, who scanned it, what was in the box, and the carrier's word.
6. `/shipping/shipped` redirects to `/fulfilled` with the query string intact.
7. `pnpm verify:fast` is green for the files this change touches. A pre-existing error in an untouched file is reported, not fixed here.
8. A closed row matches Allocate: status, order, platform beside the order, SLA at the upper right, photo, one-line title, ×qty · condition · price, next action at the lower right. The select-all checkbox shares the row checks' left edge.
