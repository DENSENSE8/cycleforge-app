# PROMPT — Deliveries: inbound tracking form, exact triage, Sourcing UI retirement (2026-10-04)

Paste this whole file as the first message of a fresh session in
`/home/michaelgarisek/Projects/cycleforge-lanes/prod`. Do not re-plan the
product. The operator has decided the information architecture and the
actions below. Reuse the readers and writers named here. Do not add a second
inbound-order writer, a second tracking model, or a new page path.

Dev origin `http://localhost:3050` only. Lane unit `cycleforge-lane@prod`.
Another session may be editing the tree — re-read before every edit, never
revert what you did not write, never `git stash`, never commit.

## End goal — definition of done

`Receiving > Deliveries` is the complete inbound operations desk. It has
exactly three child views, in lifecycle order:

1. **Inbound** — purchases expected but not yet dock-scanned. This is a
   selected-order tracking form: orders on the left, the selected order and
   all of its tracking numbers on the right. A user can scan, paste, or type
   tracking numbers and attach them without leaving `/incoming`.
2. **Docked** — physical cartons that have been arrival-scanned but have not
   been opened.
3. **Unboxed** — cartons that have been opened; downstream grading, testing,
   and put-away progress remains visible in the record.

The Inbound form closes the loop in the front end. A tracking number entered
against a selected purchase is registered, linked to that exact inbound
order/PO and carton, shown immediately in the form and the delivery record,
still present after reload, and usable by the Arrival/Unbox scanners. Duplicate
submission is idempotent and says that the tracking is already attached.

**Sourcing is not a product surface yet.** Remove its complete front end and
every discoverable/displayable entry point. Keep its APIs, cron routes,
schemas, server queries, adapters, jobs, database tables, and migrations so
the unfinished backend is not destroyed. Direct `/sourcing` must not render a
page; it should be a normal 404 after the app route is removed. Do not redirect
it to Deliveries and do not leave an empty placeholder.

Done is not a button that opens the old PO popover, a mocked request, or a
route that returns 200. Done is the browser proof below, including a tracking
number attached through the visible Inbound form and found by a later reload.
Done also includes proving that no rendered navigation, command, settings
row, station-builder choice, product action, or direct page can expose
Sourcing while `/api/sourcing/**` still exists.

## Operator rulings (binding)

1. The lane is **Receiving**. Its primary page is **Deliveries** at
   `/incoming`. The page's children are **Inbound · Docked · Unboxed**.
2. `G` chords are parent-level navigation only. Bare `1`, `2`, `3` choose the
   three Deliveries views. After Sourcing is removed there is no `G S`
   destination in Receiving.
3. Keep the icon on every retained parent and child. Do not replace a retained
   icon with an empty spacer or text initial. The three Deliveries child icons
   keep distinct semantic colours through the existing icon/tone registries.
   Sourcing-only icon entries disappear only because their UI disappears.
4. Exceptions live **only** on `/exceptions`. There is no Deliveries
   Exceptions child, status chip, hidden `?lane=exceptions` display, live-feed
   substitute, or fourth saved view. Inbound exception facts may feed
   `/exceptions?mode=receiving`; they must not render an exception view on
   `/incoming`.
5. Sourcing is removed from the Receiving drop-down/contextual mode switcher,
   the page map, command navigation, keyboard teaching, settings, and every
   other front-end display method. Remove all of its front-end children.
6. Keep every `/api/sourcing/**` and `/api/cron/sourcing/**` route. Keep the
   backend code those routes and jobs need. This is a UI retirement, not a
   backend data deletion.
7. Inbound tracking is a visible form attached to the selected inbound order,
   not a detached global search dialog. The user chooses the order from the
   left rail and attaches tracking on the right.
8. Preserve the existing Add/Import doors. `/incoming/new` remains the full
   order-composer for a new PO, return, trade-in, or pickup. The new Inbound
   tracking form is the small correction/attachment loop for an order already
   on the desk.
9. Do not redesign record cards. Preserve the existing Deliveries triage card,
   record plane, selection, keyboard cursor, and lifecycle facts. This task
   changes the Inbound record's action area and removes Sourcing UI.

## What already exists — do not rebuild

### Deliveries navigation and views

- Page declaration: `src/lib/sidebar-navigation.ts`, page id `incoming`, label
  `Deliveries`, `/incoming`, children `pipeline` = Inbound, `docked`,
  `unboxed`.
- Context controls: `NAV_PAGE_DECLS.incoming` in
  `src/lib/nav/context/pages.ts`.
- View parser/hygiene: `src/lib/receiving/inbound-lane.ts`.
- Host: `src/components/receiving/ReceivingLedgers.tsx`.
- Inbound purchase list:
  `src/components/receiving/incoming/IncomingDeliveriesLedger.tsx`.
- Selected purchase record:
  `src/components/receiving/record/useInboundRecord.tsx`,
  `src/components/receiving/record/InboundRecordView.tsx`, and
  `src/components/receiving/record/inbound-record-verbs.tsx`.
- Triage contracts:
  `src/lib/triage/views/incoming-pipeline.ts`,
  `src/lib/triage/views/incoming-docked.ts`, and the existing Unboxed view.
- State/next-action contract:
  `src/components/receiving/incoming/incoming-delivery-state.ts`.
- Status chips:
  `src/components/receiving/incoming/IncomingStatusChips.tsx` — Delivered,
  Arriving today, In transit, Awaiting tracking. These are status cuts, not
  alternate pages.

### Existing inbound-order form and one writer

- Contract: `InboundOrderDraft` in
  `src/lib/inbound/inbound-order-draft.ts`. It already accepts up to ten
  `{ number, carrier }` tracking entries, rejects scientific-notation damage,
  canonicalizes numbers, and detects a carrier when blank.
- One writer: `ingestInboundOrder` / `ingestInboundOrderInTx` in
  `src/lib/inbound/ingest-inbound-order.ts`. Every manually authored,
  marketplace, CSV, and chat inbound order lands through it.
- Browser client: `fetchInboundOrderEdit`, `postInboundOrderPreview`, and
  `postInboundOrder` in `src/lib/inbound/inbound-order-client.ts`.
- Read a landed order back into the same draft:
  `loadInboundOrderEdit` in
  `src/lib/inbound/load-inbound-order-edit.ts` and
  `inboundOrderEditRecordFrom` in
  `src/lib/inbound/inbound-order-edit.ts`.
- API: `GET /api/receiving/inbound/orders/:id` and
  `POST /api/receiving/inbound/orders`. The POST runs the one writer; do not
  create an `inbound-tracking` write route beside it.
- Full create/edit form:
  `src/components/receiving/incoming/order-composer/**`. Its Shipment section
  is the reference for adding/removing draft tracking fields. Extract a small
  shared tracking-field component if that prevents drift; do not mount the
  entire order composer inside the record.

### Existing tracking-to-carton writer

- `attachBoxToReceiving` and `listBoxesForReceiving` in
  `src/lib/receiving/attach-box.ts` register a canonical shipment, link it to
  a receiving carton through `shipment_links`, choose the first primary,
  number extra boxes, and make re-attachment idempotent.
- `GET|POST /api/receiving/po/:poId/attach-box` resolves a Zoho PO, creates
  its pre-arrival carton when needed, and lists/attaches its boxes.
- `POST /api/receiving/:id/attach-box` attaches another box to a known carton.
- `IncomingAttachTrackingPopover` currently wraps the PO route. It is useful
  evidence and may remain only if another non-Sourcing workflow still needs
  it. The selected Inbound record must no longer depend on this global-search
  popover.

There are two valid attachment paths because the sources have different
ownership:

1. **Zoho purchase order:** use the existing PO attach route. Zoho is sync
   owned and `inboundOrderEditRefusal` correctly refuses hand-editing it.
2. **Editable CycleForge inbound order** (manual, eBay, Amazon, other manual
   platform): fetch its current draft, append the canonical tracking entry,
   preview it, then resubmit the complete draft through `postInboundOrder` →
   `ingestInboundOrder`. That updates the existing `inbound_order` and
   `receiving_line` identities and creates/links the shipment through the one
   writer.

Do not route a Zoho PO through the manual inbound-order writer. Do not bypass
`ingestInboundOrder` for an editable inbound order merely because a carton id
already exists. Do not write directly to `shipping_tracking_numbers`,
`shipment_links`, `receiving_carton`, or `receiving_line` from a React
component or a new API.

## Exact Inbound form

Keep the existing TriageCardList master/detail surface.

### Left — purchase rail

One card per purchase, exactly as today. The identity remains marketplace /
source order number, else PO number. Keep quantity, tracking, SKU, expected
date, vendor, delivery state, pagination, find, pasted-number reconcile, J/K,
selection, and card/row density. Do not turn tracking numbers into separate
cards; the grain is the purchase.

Default triage order remains urgency-first. Within the existing server order,
the user can cut by:

- Delivered unopened — receive it now.
- Arriving today — prepare the dock.
- In transit — monitor.
- Awaiting tracking — attach tracking.

Carrier mismatch, unavailable tracking, stalled delivery, wrong destination,
and delivered overdue are exception facts. They appear and are worked on the
Receiving mode of `/exceptions`, not as `/incoming?lane=exceptions`.

### Right — selected inbound order

The record keeps its existing identity, lines, external/internal lifecycle,
photos, notes, and verbs. Add one first-class **Tracking** group/action area:

1. Header names the selected order/PO and source. Never ask the user to search
   for the PO again after a card is selected.
2. List every tracking number already attached to the order, not just the
   primary `receiving_carton.shipment_id`. Read the complete link set. For a
   carton that uses `shipment_links`, include primary and extra boxes in
   `box_seq` order. If the existing edit loader only returns the primary
   shipment, fix its read by joining the canonical links; do not alter the
   writer or invent a JSON tracking field.
3. Each existing row shows the full tracking number, carrier, box number,
   carrier status, and Delivered when known. Do not truncate the only copy of
   the number; a visual tail may be secondary.
4. The form has a scan/type/paste field labelled **Tracking number**, an
   optional carrier field that says **Detected** while blank, and an
   **Attach tracking** submit. Enter submits. A hardware scanner therefore
   works without a separate scan mode.
5. Support up to ten unique tracking numbers per order, matching
   `InboundOrderDraft`. Attaching one number is one atomic submit. After
   success, clear the field, announce success, refresh the selected record,
   left card, status counts, and receiving feeds, and keep the same order open.
6. The same canonical number cannot create two shipments or two links. An
   idempotent repeat reports **Tracking already attached to this order** and
   leaves the count unchanged.
7. If the canonical number is already attached to another inbound order, do
   not silently steal it or imply success. Show the conflicting order identity
   supplied by preview/writer evidence and leave both orders unchanged.
8. Preserve the full tracking digits as text. Reject scientific notation with
   the existing schema's plain-language error. Trim harmless whitespace and
   use the existing canonicalizer/carrier detector.
9. While no card is selected, the right side is the existing Deliveries
   summary. Do not render a global PO search or an unattached tracking form.
10. Attaching is in scope. A new detach/delete writer is not. Do not paint a
    Remove button unless an existing audited writer can safely distinguish a
    mistaken pre-arrival link from a physically scanned carton. Wrong-link
    repair belongs in a later explicit contract.

### Permissions and accessibility

- Read continues to require `receiving.view`.
- Attach continues to require `receiving.mark_received`, matching the current
  attach routes. Users without it see the tracking list but no active submit.
- The form has a real label, inline error associated with the field, pending
  state, disabled duplicate submit, success announcement, keyboard submit,
  and focus returned to Tracking number after success.
- Keep all retained action and view icons. Icon-only buttons keep accessible
  names. Do not use colour as the only carrier/status signal.

## Exact triage contract for all three views

| View | URL | Grain | Membership | Primary next action |
| --- | --- | --- | --- | --- |
| Inbound | `/incoming` (no `lane`) | purchase | Ordered/imported and not dock-scanned | Attach tracking, Monitor, or Receive |
| Docked | `/incoming?lane=docked` | carton | Arrival-scanned, still sealed | Pair/claim if needed, then Unbox |
| Unboxed | `/incoming?lane=unboxed` | carton | Opened carton/history | Grade, Test when required, Put away |

The transition is factual, not a manual tab move:

- Adding tracking leaves the purchase in Inbound and changes Awaiting tracking
  to carrier pending/in transit when the sync has evidence.
- Arrival scan makes the physical carton eligible for Docked.
- Opening it at Unbox makes it eligible for Unboxed.
- Exceptions never become a Deliveries view. Their facts feed only the global
  Exceptions page.

Do not add tabs inside the page body. The contextual sidebar declares the
three views and bare keys `1`, `2`, `3`. Filters, sort, dates, source, saved
views, and view switching remain in `NAV_PAGE_DECLS` / the left contextual
sidebar. The page body remains records.

## Sourcing front-end retirement boundary

Delete the Sourcing UI, do not merely hide it with CSS or a permission check.
Start from the following known roots and follow imports/usages until no
rendered path remains:

### Delete UI roots and children

- `src/app/sourcing/page.tsx`
- `src/app/sourcing/layout.tsx`
- all of `src/components/sourcing/**`, including Queue, Scout, Watchlist,
  Searches, Suppliers, Analytics, research, `SourceThisButton`, and
  `WatchSearchButton`
- Sourcing-only admin stage children under `src/components/admin/sourcing/**`
  when they have no remaining non-Sourcing consumer
- Remove `SourceThisButton` from
  `src/components/products/QcChecklistWorkspace.tsx`; do not replace it with
  a dead or differently named Sourcing button.

### Remove every discovery/display route

- `APP_SIDEBAR_NAV` / `SIDEBAR_PAGE_NAV` Sourcing rows and the
  `SidebarRouteKey` member in `src/lib/sidebar-navigation.ts`
- pathname resolution and UI permission-route entries for `/sourcing`
- `NAV_PAGE_DECLS.sourcing` and its imports from
  `src/lib/nav/context/pages.ts`
- Sourcing modes from contextual resolver/parity data and tests
- `NAV_GO_KEYS.inbound.s`, its keyboard teaching, and tests
- command-bar navigation groups and tests
- Sourcing view/action icons in
  `src/components/sidebar/contextual/nav-view-icons.ts`
- `/sourcing` route-param/mode specs, parked-slot redirects, and mode-registry
  entries that exist only for the removed page
- admin redirects for `suppliers`, `bose_models`, and `compatibility`; retired
  sections should fall through to the existing safe `/operations` default,
  not another hidden Sourcing alias
- search-scope, settings, recent-item, or permission-display registries that
  paint Sourcing as a selectable UI destination. Keep backend permission
  constants/checks required by the APIs.
- station-builder data source `sourcing.open_demand` and action
  `sourcing.start_sourcing`, because they are alternate front ends for the
  Sourcing queue

Search the full `src/` tree after removal. A source comment, migration, schema,
audit label, receiving provenance value `sourcing_import`, or server module may
still say “sourcing”; a React-rendered Sourcing surface, client navigation
href, front-end command, or station option may not.

The receiving carton-add **Web** lookup currently calls
`/api/sourcing/search` as a generic eBay/web search. Preserve it only if it
continues to present itself solely as a receiving line lookup and does not
expose the Sourcing queue, candidate/watch workflow, or `/sourcing` link. The
API is explicitly retained. Do not delete a useful Deliveries/Unbox lookup
just because its implementation uses the retained server search adapter.

### Must remain

- every file under `src/app/api/sourcing/**`
- every file under `src/app/api/cron/sourcing/**`
- server-side `src/lib/sourcing/**`, sourcing schemas, query modules, jobs,
  migrations, and database tables used by those routes/jobs
- inbound provenance such as `source = 'sourcing_import'`
- generic API consumers that are part of a non-Sourcing workflow and expose
  no Sourcing UI, such as the receiving Web lookup described above

Do not drop a table, remove a migration, rename an API, or weaken an API's
permission gate.

## Exceptions consolidation

`src/lib/receiving/inbound-lane.ts` still admits `exceptions`, and some code
can render Pipeline with `lane='exceptions'`. Retire that Deliveries display
path in this change:

1. Remove `exceptions` from the valid `InboundLane` wire values and cross-lane
   UI handling.
2. Strip an old `?lane=exceptions` through route hygiene to bare `/incoming`
   rather than rendering it.
3. Remove tests or branches that treat inbound exceptions as a Deliveries
   lane.
4. Preserve the queries/classifiers that supply the Receiving mode on the
   global `/exceptions` page.
5. Verify `/exceptions?mode=receiving` still renders its Receiving exception
   records and `/incoming?lane=exceptions` does not.

## Implementation order

1. Run `ds_contract 'selected inbound order tracking attachment form in a
   master-detail Deliveries ledger'` and read
   `docs/design-system/CONSOLIDATION_LEDGER.md` before adding a local wrapper.
2. Prove the current read/write roots with focused tests. In particular,
   determine which selected rows have `inbound_order_id`, Zoho PO id, and/or
   `receiving_id`; do not guess from the visible order number.
3. Make the tracking reader complete over primary and extra package links.
4. Build the selected-order Tracking group and its source-aware controller:
   Zoho PO attach route vs editable inbound draft resubmission.
5. Wire invalidation so the form, record, card, chips, and feeds agree without
   a reload; then prove reload persistence.
6. Remove the hidden Deliveries exceptions lane and prove the global
   Exceptions Receiving mode.
7. Remove Sourcing UI from leaf components upward, then remove navigation,
   route-mode, key, icon, station, and admin discovery entries. Keep APIs and
   their backend dependency graph.
8. Update focused tests and run design critique on touched UI files.
9. Complete browser proof at `http://localhost:3050`.

## Focused tests required

Add or update tests for at least:

- A non-Zoho selected inbound order loads all existing tracking, appends one
  through the complete `InboundOrderDraft`, and the same
  `inbound_order.id`/line identities remain.
- A Zoho selected PO uses the PO attach route, including a PO with no existing
  pre-arrival carton.
- Multi-tracking reads primary plus extras in box order.
- Canonical duplicate attachment is idempotent.
- Scientific-notation tracking is refused and the damaged value is not stored.
- Cross-order collision does not silently reassign a tracking number.
- Success invalidates the record/list/summary receiving query families.
- `parseInboundLane('exceptions')` resolves to Pipeline/default and route
  hygiene removes the wire value.
- Deliveries contextual views are exactly Inbound, Docked, Unboxed with digits
  1, 2, 3; icons are present.
- Receiving `G` destinations contain Deliveries, Local Pickup, and Repair
  service as currently contracted, but not Sourcing.
- Command navigation, context modes, and page maps contain no Sourcing row.
- Direct `/sourcing` has no app page and returns 404.
- `/api/sourcing/search` and one stateful Sourcing API route still reach their
  unchanged auth/validation boundary (do not mutate production-like data just
  to prove this).

## Browser proof — required before done

Use a throwaway Playwright script with
`storageState: tests/.auth/admin.json` and base URL
`http://localhost:3050`. Delete the script afterward. Use records from the
active org; do not write fixture rows directly with SQL.

### A. Editable CycleForge inbound order

1. Open `/incoming`. If no safe editable test purchase exists, create a test
   PO through `/incoming/new` so it lands through `ingestInboundOrder`.
2. Select its card. Confirm the right record names the exact order and shows
   the Tracking form without another PO search.
3. Attach a unique clearly-test tracking number through the form.
4. Assert success, the same card remains open, the full number is listed, and
   the left card/status updates.
5. Reload. Reopen if needed and assert the number is still attached.
6. Submit the same canonical number again. Assert “already attached” and an
   unchanged tracking count.

### B. Zoho purchase order

1. Select a safe existing Zoho PO that is awaiting tracking.
2. Attach a unique test tracking number through the same visible form.
3. Prove the PO route created/reused the pre-arrival carton, the number is on
   the record after reload, and no duplicate link appears on resubmit.

If no safe Zoho record is available, report that exact missing fixture after
proving the route/controller with integration tests. Do not invent a Zoho row
with SQL and do not claim the browser case passed.

### C. Triage and exceptions

- Capture `/incoming`, `/incoming?lane=docked`, and
  `/incoming?lane=unboxed`. The title/view and list grain match the table
  above; each view retains its icon.
- Open `/incoming?lane=exceptions`; assert it canonicalizes to the default
  Inbound view and renders no Exceptions child.
- Open `/exceptions?mode=receiving`; assert Receiving exceptions still work.

### D. Sourcing retirement

- Hover/click the Receiving parent and inspect the contextual mode switcher:
  no Sourcing row and no `G S` teaching.
- Search the command bar for “Sourcing”: no navigable Sourcing result.
- Open `/sourcing` and `/sourcing?mode=scout`: both 404, no placeholder and no
  redirect.
- Inspect settings and station-builder catalogs: no Sourcing destination,
  queue, or Start sourcing action.
- Confirm a retained `/api/sourcing/search` request does not 404. Its normal
  permission/validation response is acceptable; do not weaken auth for proof.

Save screenshots in `/tmp` and list their paths in the final report.

## Verification

Run:

```bash
pnpm verify:fast
pnpm verify
```

Also run focused tests for inbound draft/edit/ingest, attach-box,
`inbound-lane`, nav context/resolve, go keys, command navigation, route params,
and parked surfaces. Run `ds_critique` on every touched UI file.

Before reporting done, search for UI residue with a command equivalent to:

```bash
rg -n "(/sourcing|SourcingWorkspace|SourceThisButton|WatchSearchButton|sourcing\.open_demand|sourcing\.start_sourcing|id: 'sourcing'|pageId: 'sourcing')" src
```

Classify every remaining hit. Backend API/job/schema/migration/provenance hits
are expected. Any rendered link, app page, React Sourcing component,
navigation destination, settings choice, station source/action, or command
entry is a failure.

## Final report

Report:

- the exact selected-order tracking form and which source uses which existing
  writer;
- how complete multi-tracking is read and displayed;
- the exact Inbound/Docked/Unboxed triage membership and transitions;
- every Sourcing UI/discovery root removed and the backend roots preserved;
- confirmation that exceptions exist only on `/exceptions`;
- focused test results, `pnpm verify:fast`, `pnpm verify`, browser cases, and
  screenshot paths;
- any browser case that could not run because a safe fixture truly did not
  exist. Do not convert an unrun case into a pass.

## Adjacent patterns this establishes

Once this contract is complete, the same master/detail close-the-loop pattern
can be reused without inventing another page:

- attach an ASN/BOL or vendor invoice to a selected inbound order;
- pair an unknown dock scan to the selected purchase after showing the
  conflict evidence;
- attach several cartons to one purchase while preserving package identity;
- reconcile a pasted vendor manifest against selected Inbound purchases;
- capture a delivery appointment or expected-date correction on the selected
  order through its existing writer;
- turn a read-only lifecycle warning into one exact, audited next-action form
  while keeping true exceptions on `/exceptions`.

Each reuse must still follow its domain's existing writer and identity. The
pattern is **select exact record → show current linked facts → perform one
audited/idempotent attachment → refresh the same record → prove after reload**,
not “add another modal and another table.”
