> **Superseded 2026-10-06.** The desk form now lives at **`/purchasing/new`** (`?type=PO|RETURN`,
> `?id=<inbound order id>` to fix a landed order) — `src/app/purchasing/new/page.tsx` →
> `src/components/receiving/purchases/order-form/**`, opened from Add (top right) on Purchasing and
> Deliveries. One model for desk and phone: `src/lib/inbound/use-inbound-order-form.ts` (state,
> dry run, listing photos held per line and uploaded after landing) + `inbound-order-compose.ts`
> (pure edits, `inboundOrderFormHref`, `?type=`/`?id=` parsing). The phone face is
> `/m/receiving/order` (`src/components/mobile/v2/inbound/**`). `/incoming/new`,
> `order-composer/**` and `new-inbound-order-path.ts` are deleted; trade-in / pickup land from the
> kiosk and `/m/receiving/pickup/new`. The sections below describe the 2026-09-28 form.

# HANDOFF: Inbound: add an inbound order / purchase order through ONE form (2026-09-28)

Paste the **Prompt** block at the bottom into a fresh session. The sections above it hold the state
it relies on. This is the inbound mirror of the outbound work in
`docs/HANDOFF-new-sales-order-intake.md` (sales order intake: desk ⇄ phone parity, Test mode + Fill)
and `docs/HANDOFF-to-ship-bulk-delete-swipe.md` (To-ship list motion, deferred Delete + Undo).
Other sessions edit this tree at the same time, so re-read a file before every edit.

## 1. Owner ask (verbatim intent)

"The opposite operation": the outbound lane can now add a sales order end to end (header
"+ Add" → form → release → the order appears live on To ship). Inbound needs the same thing:
**add an inbound order / a purchase order through a form that actually works**, desk and phone.

## 2. What exists (read these first; facts checked 2026-09-28)

**One writer (repo law, AGENTS.md §4).** Every inbound source parses into `InboundOrderDraft` and
lands through `ingestInboundOrder`.
- `src/lib/inbound/inbound-order-draft.ts`: zod `inboundOrderDraftSchema`.
  - Fields: `type` PO·RETURN·TRADE_IN·PICKUP, `platform`, `orderNumber`, `vendor`, `accountName`,
    `priority` (`auto`|0–3), `orderDate`, `expectedDate`, `currency`, `tracking[]` (≤10),
    `lines[]` (1–200), `notes`, `returnReason`, `rmaId`.
  - Line fields: `lineKey`, `skuCatalogId`, `sku`, `title`, `quantity` (null = not said yet),
    `unitCostCents`, `listingUrl`, `itemNumber`.
  - Identity: order = (org, source_type, source_platform, normalized number); line = (order, line_key).
  - `inboundOrderMissing()` returns the "Still needed" checklist; `emptyInboundOrderDraft(type)`.
- `src/lib/inbound/ingest-inbound-order.ts`: `ingestInboundOrderInTx` (:199), `ingestInboundOrder`
  (:422), `previewInboundOrder` (:479, dry run, never writes), `deleteInboundOrder` (:600).
  Refuses a hand-entered Zoho-source order: "Zoho orders arrive by sync, not by hand" (:210).
- `POST /api/receiving/inbound/orders` (`src/app/api/receiving/inbound/orders/route.ts`):
  - `{ draft, dryRun }` with an idempotency key; permission `receiving.view`.
  - A RETURN also needs `receiving.mark_received` and a connected helpdesk: it files a claim ticket.
  - After a write it runs `invalidateReceivingViews` (realtime refresh).
  - `DELETE ?id=` needs `receiving.mark_received`.
- Client: `src/lib/inbound/inbound-order-client.ts` (`postInboundOrderPreview`, `postInboundOrder`,
  `postInboundOrderExtract` → `/api/receiving/inbound/extract-po` screenshot/text → draft,
  `deleteInboundOrderRequest`).

**The desk form: `/incoming/new?type=PO|RETURN|TRADE_IN|PICKUP` (landed 2026-09-28)**
(`src/app/incoming/new/page.tsx` → `order-composer/NewInboundOrderPage.tsx`).
- Route contract: `src/lib/inbound/new-inbound-order-path.ts` (`newInboundOrderHref(type)`,
  `parseInboundOrderTypeParam` — unknown → PO). Switching type in the form `router.replace`s `?type=`.
- Layout: a 72rem page, two thirds `TriageSections` entry (`InboundOrderFields.tsx`
  `useInboundOrderSections`, `InboundOrderLines.tsx`), one third `InboundOrderOutcome.tsx`
  (identity, "At unbox" for a return / "Cost" total for a PO, Still needed, the 350 ms dry run,
  submit, delete). Done screen: "Next <type>" / "Back to Incoming". Esc on a pristine form leaves.
- Per type: a PO reads Vendor · PO / order number · Expected arrival, per-line cost, line totals
  and a subtotal (missing cost stays `$—`). A RETURN gets its own Return section first: reason
  (`INBOUND_RETURN_REASONS` picker + detail, stored as `"<reason> — <detail>"` in `returnReason`),
  Original order #, RMA #, one catalog item with a **required listing link**.
  `inboundOrderMissing` requires reason + listing link for a claim-filing return (not CSV imports).
- `OrderDocumentFill.tsx` fills the draft from a screenshot or document (≤6 images).
- Doors: global header Add (`C` then `P` New purchase order, `R` New return — grouped under
  Inbound, sales rows under Outbound), `IncomingDeskAddAction` Add / Add return, Unbox Add PO.
  The old module store and the in-stage mount in `ReceivingLinesTable` are gone.
- Unbox: a return line shows `UnboxReturnCallout` ("check for: <reason>", RMA, original order,
  listing link) above the line record (`LineEditPanel`); rows carry `return_reason`,
  `return_rma_ref`, `return_source_order_id` from `receiving_line_return` (carton fallback).

**Gaps against the outbound twin (verify each before building; do not assume):**
1. **No phone form.** `src/lib/nav/lanes.ts:76` has `inbound: 'desk-only'`, and there is no
   `/m/…/inbound/new` route. Mobile-first law (`docs/mobile-first/SURFACE_LAW.md`) says every
   operator verb must be completable on `/m/*`. The only inbound `/m` pages are
   `/m/receiving/po/[poId]` (+ item, photos).
2. ~~No header "+ Add" entry.~~ Landed: `P` / `R` under the Inbound group.
3. **No Test mode / Fill.** Nothing under `src/lib/inbound` or `src/components/receiving` matches
   test mode / `CF-TEST` / Fill. The sales intake has it (`testOrderFill` in
   `src/lib/orders/intake/intake-model.ts`; saves as `CF-TEST-<n>`).
4. **Arrival on the list is unproven.** After submit the composer calls `invalidateReceivingFeeds`
   and the route runs `invalidateReceivingViews`. Nobody has shown that a second tab on
   `/incoming` gets the new order live (the outbound twin shows it ~5 s after the tap).
5. **"Fixed"**: the owner says the PO form needs fixing. Find out what is broken by driving it
   (§4 step 1); no complaint list exists yet.

**Where the order appears.** `/incoming` (`src/app/incoming/page.tsx`, lane door
`LANE_DOORS.inbound = 'incoming'`). The list is `IncomingDeliveriesLedger.tsx` with
cards (`receiving/incoming/cards/IncomingDeliveryCard*.tsx`, a `TriageCardList` host, so it gets
`SwipeListItem` arrival motion for free) and a Floor `RecordLedger`. Its sidebar and status
chips are described in `docs/refactors/sidebar/HANDOFF-inbound-triage.md`.

**The outbound twin to mirror (shell, not data):**
- Routes: `src/app/orders/new/page.tsx`, `src/app/m/(shell)/orders/new/page.tsx`.
- Components: `src/components/outbound/orders/intake/*` (`OrderIntakeForm`, `OrderIntakeEntry`,
  `IntakeSection`, `IntakeProductSearch`, `IntakeLineCard`, `IntakeCombobox`, …).
- Model: `src/lib/orders/intake/*` (`intake-model.ts`, `checkout-model.ts`, `catalog-shelf.ts`,
  `intake-product-client.ts`).
- Phone chrome: `DetailDock` (Back · Continue).
- Rule: reuse product search (catalog identity via `resolveSkuIdentityTitle`,
  `SKU_CATALOG_JOIN_ON_SQL`), date fields `DateRangePickerField variant="compact"`, and staff via
  `AssigneeCombobox`. Never hand-roll any of them.

**Zoho.** CycleForge's catalog is the SKU source of truth; Zoho is an external fact
(`catalog_external_ids`). Hand-entered orders never go to Zoho: Zoho POs arrive only by sync
(`/api/zoho/purchase-orders/sync`, permission `receiving.scan_po`). Do not add a Zoho push
without asking.

## 3. Rules

- Dev origin `http://localhost:3050` only; lane unit `cycleforge-lane@prod`.
  - Browser: MANAGED tab `browser.open({ app: { relay: false } })`.
  - Sign in: `/api/auth/staff-picker` + `/api/auth/signin`, header `x-tenant-slug: usav`, staff "Michael".
  - A dev rebuild can 404 a stale chunk. Reload, then wait for hydration: check
    `Object.keys(el).some(k => k.startsWith('__react'))`.
  - Animations in the hidden browser: `page.bringToFront()` + CDP
    `Emulation.setFocusEmulationEnabled` (otherwise rAF runs ~2 fps).
- If the lane 500s on another session's work in progress (e.g. a missing module in
  `src/components/sidebar/*`), wait and re-probe. Do not patch their files.
- One writer: every new entry point (phone form, header Add, test Fill) builds an
  `InboundOrderDraft` and posts it through `postInboundOrder`. No second insert path, no new table.
- `pnpm verify:fast` before calling it done; attribute other sessions' reds to their files.

## 4. Prompt

> You own "add an inbound order / purchase order through ONE form" in CycleForge. Read
> `docs/HANDOFF-inbound-po-intake-form.md` first, then the §2 files. Work on :3050 only, in
> managed browser tabs. Other sessions edit this tree: re-read before each edit and touch only
> your lines.
>
> Do, in order, landing and verifying each step before the next:
> 1. **Drive what exists.** At 1440×900 on `/incoming`: open Add (PO), fill a PO by keyboard
>    (platform, order #, vendor, 2 lines from the catalog picker, qty, unit cost, tracking,
>    expected date), watch the right-column dry run, submit. Record every defect with evidence:
>    dead control, wrong or missing "Still needed", preview error, a submit that 4xx/5xxs, the
>    toast, whether the order appears on `/incoming`. Do the same for a RETURN. Report the list,
>    then fix the defects. The defects ARE "fixed with form".
> 2. **A URL for the form.** Give the composer a route (e.g. `/incoming/new?type=PO`) that
>    drives the existing store, so it deep-links, survives reload and can sit in the header Add.
>    Keep the in-page doors working.
> 3. **Header "+ Add".** Add inbound rows to `GlobalHeaderAdd` `NEXT_KEYS`: "New purchase order"
>    and, if the owner wants it, "New return". Before choosing keys, check `S`/`I` and the `C`
>    leader grammar. Update the header comment.
> 4. **Phone parity.** An `/m/…` inbound form over the SAME draft and the same client calls:
>    steps like the sales intake (Order → Items → Shipment → Review), `DetailDock` Back ·
>    Continue · Add. Flip `lanes.ts` `inbound` off `desk-only` only if the whole verb works on
>    the phone. Verify at 390×844 (no horizontal overflow).
> 5. **Test mode + Fill.** Mirror the sales intake: `?test=1` / a Test switch. The order number is
>    prefixed `CF-TEST-`, and Fill picks a real catalog product (qty 1, cost $5) and a fake
>    tracking number. Nothing external: no helpdesk ticket for a test RETURN, no Zoho.
> 6. **Live arrival.** Two tabs: `/incoming` scrolled to top, and the form (desk, then phone) with
>    Fill → Add. The new order must appear on `/incoming` without a reload, sliding in
>    (`SwipeListItem`). Report the ms from the tap. If it does not arrive, trace
>    `invalidateReceivingViews` → the Ably channel → the `/incoming` query key.
> 7. **Clean up.** Delete every `CF-TEST-…` inbound order this work created, through
>    `DELETE /api/receiving/inbound/orders?id=`, and print the counts.
>
> Ask the owner (batch them, one message, before step 3) only these:
> - Which header keys?
> - Should RETURN/TRADE_IN/PICKUP ride the same URL as a type switch, or only PO?
> - Should the phone form ship now or after desk fixes?
>
> Everything else: decide conservatively and say what you chose.
