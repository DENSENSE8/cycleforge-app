# HANDOFF — Industrial record ledger: tokens first, every tab, every device

Paste this whole file as the first message of a fresh session in the **prod lane**
(`~/Projects/cycleforge-lanes/prod`). It carries the To-ship reference build forward: first
into the token package (so iOS, Android and the desktop build read the same numbers), then
onto the other Outbound tabs, then onto each device. Read [`BRIEF.md`](./BRIEF.md) first — it is
the law, including the 2026-09-24 "Changed" note under §11. Do not commit; the owner commits.

## The owner's rulings this spec encodes (2026-09-24)

> "The current slot data table component is not correct … it will display like a modern
> industrial warehouse display similar to the desktop application and not like a slow software
> as a service."
>
> "The most important thing within warehouse management systems is location. You must display a
> location on the top row between the status and the platform."
>
> "The condition should always display to the right of the selection, between the selection icon
> and the SKU."
>
> "Remove the current right rail for the order … the desktop application would be a better
> implementation method in terms of a full information display."
>
> "Removing Shipping and having Pending · To ship · Shipped · Exceptions as a full-width display,
> just like the desktop application."
>
> "You cannot sweep over the entire codebase … This needs to be done page by page."

## Three layers — fix a bug in the lowest one that owns it

1. **Facts (server).** `/api/orders` rows: `storage_locations` (every live allocation's
   location), `allocated_unit_count`, `is_out_of_stock`, `is_urgent`, `packed_at`, `shipment_id`,
   `deadline_at` / `ship_by_date`, pick / pack actors. A client never derives a fact the server
   did not send.
2. **Meaning (`@cycleforge/design-tokens`).** State → code / word / tone (`LIFECYCLE`), mode
   surfaces, radius, hit, **and the record geometry below**. Generated to CSS, Swift, JSON (and
   Kotlin when that generator lands). A client never restates a hex, a code, a tone or a size.
3. **Presentation (per page, per client).** Layout, native navigation, gestures.

## What exists today (web, uncommitted in `prod`)

| Piece | File |
|---|---|
| Ledger (toolbar · virtual rows · groups · status bar · evidence column) | `src/components/outbound/orders/OutboundOrdersLedger.tsx` |
| Evidence column (open record / queue summary) | `src/components/outbound/orders/OutboundOrderEvidence.tsx` |
| Inline editors (ship-by · pick/pack · condition · qty · note) | `src/components/outbound/orders/outbound-orders-ledger-editors.tsx` |
| Row geometry + label faces (**to be promoted, Step 1**) | `src/components/outbound/orders/outbound-orders-ledger-geometry.ts` |
| Order → `LIFECYCLE` key (one place) | `orderLifecycleState` in `src/lib/order-lifecycle.ts`; row stage `resolveRowWorkflowStage` in `src/components/dashboard/orders-queue/helpers.ts` |
| Location breadcrumb (shared with `/m/work`) | `formatOutboundStoragePath` in `src/lib/shipping/outbound-storage-path.ts` |
| Data/behaviour feed (shared with the slot table) | `src/components/dashboard/orders-queue/useOrdersQueueFeed.ts` |
| Row zoom per staff | `useLedgerRowZoom` → `staff_preferences.tableColumns.orders.rowZoom` |
| Industrial desk bar + flush stage | `DeskPageChrome` `stage="flush"` (`src/design-system/components/DeskPageChrome.tsx`), set per route in `src/app/shipping/(desk)/layout.tsx` |
| SSR stand-in at the same geometry | `OrdersLedgerStandIn` in `src/components/dashboard/OrdersQueueFirstPaint.tsx` |

Mounted on **To ship only**: `DashboardOrdersView` passes `ledger`; `UnshippedTable` renders the
ledger instead of `UnshippedSheet`. Pending, Exceptions and the station embeds still run the slot
`DataTable` (Shipped adopted the shared primitive — see below).

**Inventory › Stock · SKU Exceptions (2026-09-24)** run the ledger through the shared primitive
`src/design-system/components/record-ledger/` — `RecordLedger` (toolbar slot · virtual 97px rows
· the open record placed by `DeskRecordPlane` — in place of the list, or split beside it when the
staffer turns on fullscreen (2026-09-25) · J/K), `IndustrialRecord` (spine · photo · 3 bands · one right lane) and
`RecordEvidence` (triage evidence stack: title · state strip · sections · decision bar keys 1–4 ·
`EvidenceCountStepper`). Frame: `InventoryDeskFrame` mounts `stage="flush"` in a `triage`
`ModeRegion` on those two routes only. Placeholder SKUs read `LIFECYCLE.onHold` (`HLD`, warning).
To ship still runs its own ledger files; it can adopt the primitive in its own page pass.

**Inbound Deliveries · Docked receipts · Inventory Replenish (2026-09-25)** now use the same
shared primitive without replacing their domain services. `/incoming` mounts
`ModeRegion mode="triage"` → `DeskPageLayout stage="flush"` → `RecordLedger`; On the way adapts
the existing `useReceivingLinesData` PO/line feed into `IncomingDeliveryRecord` and opens the
existing consolidated `useIncomingDetails` read model in `IncomingDeliveryEvidence`. Scans still
resolve through `routeScan` and write through `recordReceivingScan`.

Add (either lane) swaps the ledger for the receiving-order composer
(`src/components/receiving/incoming/order-composer/`): `ReceivingOrderSheet` is the foundation —
fixed 720px sheet centred on the stage, head (title · kind switch · close), `<form>`, foot
(status · Cancel · submit) — and `PurchaseOrderComposer` / `ReturnOrderComposer` build on it from
small sections (`OrderDocumentFill`, `PurchaseOrderFields`, `PurchaseOrderLines`,
`ReturnOrderFields`, `CatalogItemPicker`). Its controls live in
`receiving-order-composer-parts.tsx`, not the shared form primitives (owner 2026-09-25). Wire
calls are `lib/inbound/po-intake-client.ts` and `inbound-import-client.ts`, shared with the Unbox
PO band and the legacy add form.

`/incoming?lane=docked` is a separate receiving-lifecycle ledger (`SCANNED` · `UNBOXED` ·
`RECEIVED` · `ON_HOLD` · `EXCEPTION`) backed by the history feed; its record embeds the existing
carton history reader. Both lanes mount inside `ReceivingRightPane`'s table host, which is a flex
column so `RecordLedger`'s `flex-1` bounds the list and it scrolls. Inventory › Replenish adapts
`/api/need-to-order` into
`ReplenishmentPlanRecord` / `ReplenishmentPlanEvidence`; edits and workflow transitions stay in
`src/lib/replenishment.ts`, and draft-PO creation stays in `/api/replenish/bulk-create-po`.
`inventory:replenish` is no longer parked. These are presentation adapters over the established
scan, query, cursor, mutation and PO-creation roots—not parallel data services.

**Shipping › Shipped (2026-09-25)** is the whole `/shipping/shipped` page on the shared primitive,
one record per PACKAGE (carrier tracking number), not per order line:
`ShippedWorkspace` → `ShippedLedger` (`src/components/shipped/ledger/`). The feed is unchanged —
`useShippedTableFilters` → `useShippedTableRecords` (`/api/packerlogs`, week buckets, load-more);
period (`DateRangePickerField variant="compact"`), type, carrier, status and exceptions-only are
toolbar facets over the same URL params, free text is the server `?q=`. Rows
(`ShippedPackageRecord`) key on the feed's `package_shipment_id`; the open key is
`?shipment=<shipping_tracking_numbers.id>` (`SHIPMENT_RECORD_PARAM`, `replaceState`), may name a
package outside the loaded window (a sibling box, or a tracking # the find box resolves through
`/api/shipments/lookup`), and legacy `?openOrderId=` bookmarks map to that line's package. The
record, `ShipmentRecordView` (`GET /api/shipments/[id]/record`), is `DeskRecordLayout`: main =
Items · Actions (newest first) · Other boxes on this order; aside = tracking · carrier · packer ·
packed · shipped + by (`Backfilled` marker) · carrier milestones · box k of N · orders ·
exception · sync error. The strip under the toolbar is the package's verbs (Resolve exception
while an unmatched pack scan is open → `ResolveShipmentExceptionDialog`: link to an order line or
close with a reason; Copy tracking; Track) followed by the primary order line's
`OrderRecordActionStrip` (Shipped mode, via `shipped-order-line.tsx`). State faces
(`shipped-package-state.ts`) read `LIFECYCLE.packed` / `LIFECYCLE.shipped`; an open unmatched
scan is the hatched `UNM` face. `DashboardOrderDetails`, `ShippedOrderRecord` and
`DashboardShippedTable` were deleted in this cutover; `ShippedDetailsPanel` stays for the station
embeds. The phone twin is the package hub at `/m/shipping/shipments/[shipmentId]`.

## The record — one anatomy on every device

```
desk   spine │ photo │ context    ☐ · CODE · [NOTE] · ● PLATFORM · order # ·········│ SEP 11 · 13D
             │       │ identity   title (one line, ellipsis) ······················│ QTY [n]
             │       │ execution  CONDITION · BIN <loc> · SKU · ■Pick · ■Pack · LISTING ↗ │ → next

phone  spine │ context    CODE · [NOTE] · PLATFORM · order # ·│ SEP 11 · 13D
             │ identity   ▣ title ·························│ QTY [n]      ▣ = 32px micro-thumbnail
             │ execution  CONDITION · BIN <loc> · SKU ·····│ → next
```

`[NOTE]` = the buyer-note slot (2026-09-24): rigid width on every record, amber badge when
`orders.buyer_note` is set, empty otherwise; a noted record also wears a 2px amber inset on its
spine. The note's text leads the evidence column / sheet; pack and label routes hold until it is
acknowledged (`src/lib/orders/buyer-note-interlock.ts`). PLATFORM is the org short label.
BIN falls back to the SKU's home bin (`BIN HOME …`) when nothing is allocated.

Laws, in the order an operator's eye travels (F-pattern, owner 2026-09-24: Context → Identity →
Execution, one rigid right column):

1. **Context & selection first.** Band 1: select (absolute top-left) → state code → platform →
   order #; the timeline constraint (ship-by) is the only thing at the right end.
2. **Identity.** Band 2: title, and the quantity anchored at the far right as a boxed badge
   (`RECORD_QTY_BADGE_CLASS`) — the labour multiplier is the row's visual stop. QTY never moves
   under the title.
3. **Execution.** Band 3: condition → **BIN beside SKU** (the physical lookup pair; `BIN
   ZONE-F // AISLE-04 // BIN-S4`, every allocation `|`-joined via `formatOutboundStoragePath`,
   no allocation = `BIN UNASSIGNED` in warn ink) → pick → pack → note → listing → next action.
   **No price on the row** — it is noise on the floor; the evidence column / sheet shows it.
   At S zoom the one line is: select → condition → code → location → order # → title → qty →
   ship-by → pick → pack.
   The right lane is one column down all three bands (date · QTY · next): its hairline is the
   same pixel on every band. Ship-by is the date itself (no `SHIP BY` text); late adds the day
   count (`SEP 11 · 13D`, danger ink) — `formatShipByFace`, shared by desk and phone.
3. **State code + tone from `LIFECYCLE` only.** `RDY` info · `URG` warning (text in
   `mode-warn`) · `PKD` fulfillment/purple · `OOS` danger · `SHP` success. Precedence: out of stock
   > urgent > packed > ready (the desktop terminal's `workState`). Awaiting-label / pending /
   tested all read `RDY`; the next action (`→ Label` / `→ Pick` / `→ Pack`) carries the
   difference. Colour is never the only signal; screen readers get the word.
4. **Geometry** (desk; touch in brackets): spine 5 · photo S 32 / M 96 / L 108 [108] · bands S one
   32 line / M 3 × 32 / L 3 × 36 [3 × 36] · row incl. 1px rule S 33 / M 97 / L 109 · desk hit 32
   [touch 48]. Rules: 1px `rule` between bands, 1px `ink` between records, radius 0, no shadow.
   Out of stock: the one tinted fill (`LIFECYCLE` danger tint) + hatched spine. Open / checked:
   2px ink outline. Hover wash only. **No motion.**
5. **Faces** (`src/design-system/tokens/industrial-record.ts`, shared desk + phone): labels mono
   10 heavy uppercase 0.08em; IDs / SKUs mono bold 13; title sans bold (brief says 15 — no token
   yet, web uses 14); QTY badge; **price in the success ink** where it is shown (evidence only).
6. **Seed groups:** one-band parent (fold · group select · `OOS 3/3` · **BIN (every line's
   paths, `· n unassigned` in warn when some lines have none)** · platform · order # ·
   `N boxes · N lines` · **Pick · Pack** (assigns every unstamped line) · QTY total · **→ next**
   (the worst line's)). Children wear **one** vertical line — their own state spine; no second
   group spine or indent lane (owner 2026-09-24).
7. **Listing is first-class.** `LISTING ↗` sits on the facts band immediately left of the next
   step; the evidence column links the title and carries a Listing fact (`<item #> ↗`). Source:
   `ordersCompoundView(...).titleHref`. No listing → a quiet dash, never a dead link.
8. **Boxy staff marks.** Pick / pack assignees wear the square `StaffAvatar shape="square"`
   (and a square dashed empty slot) — no circles on a radius-0 surface.
9. **Photos.** Desk: the photo lane opens Unbox's viewer (`usePhotoGallery` +
   `PhotoViewerPortal`). Phone: a 32px micro-thumbnail; tapping it (or the record) opens the
   evidence sheet with the high-resolution image, specs, price and exception controls, and "All
   photos" opens Unbox's phone viewer (`MobileSwipePhotoViewer`). Both read one fetcher
   (`src/lib/photos/line-photos.ts`): catalog hero + listing gallery + SKU-linked photos, fetched
   on press, never on paint.
10. **Whole record opens; controls never do.** Every inline control stops propagation.

Bin pairing (scan a bin to an order / parent) is a **mobile** verb — it needs the scanner in
hand at the shelf. The desk shows the location; it does not edit it (owner 2026-09-24).

The desk bar's page actions (Past imports · Labels · Sync) are bar segments like the modes: no
gap, no padding between them, full bar height, pressed = ink fill (`DeskHeaderFaceProvider`).

## The evidence column — replaces the right rail for records

The desktop terminal's `.evidence-panel`, always mounted (selecting never reflows the rows):
`max(288px, 24vw)` desk; bottom sheet on touch. Top bar: `SELECTED ORDER` · `k / n` · prev /
next · close. Then the order number large, the state strip (code · word · next action), photo +
title + SKU + item #, then a fact list: **Location** (all paths + units allocated) · Platform ·
Order # (copy / open) · Tracking + carrier · Ship by · Ordered · Condition · Quantity · Price ·
Pick · Pack · Pack bench · Note (latest, read-only; shown only when one exists — writing a note
is the **Add note** verb, never a second inline editor, owner 2026-09-24). **Order actions (owner, 2026-09-24):** the
orders verb catalog resolved for THIS order — grouped as the bulk bar groups them, direction-aware
(Mark urgent / Clear urgent, Mark scanned out / Undo), disabled verbs say why, **Delete** set apart
last. It is the same catalog at n=1 (read from the rail-actions store), never a second
implementation; dialog verbs confirm against the rows they were opened for. Foot: **Labels**
(paperwork walk on this order) and **Select** (adds the record to the bulk check-set for
many-order work). Nothing open ⇒ the queue read as the floor reads it: counts per
state, late, unassigned location. Keys: J / K step, Esc closes. The in-stage order overlay and
the right-rail `detail:order` inspector are **not** mounted on an industrial desk.

## The desk frame — one industrial bar

No page title row (`sr-only` heading only). One full-width bar, 44px, `bar` surface, 2px ink
rule under it: the desk's modes (**Pending · To ship · Shipped · Exceptions**) as flush mono
segments, active = ink fill, counts inline; page actions at the right end, square. The body runs
edge to edge on the mode canvas (`#fafafa`), rows white.

## Step 1 — promote the record into the token package (do first)

1. Add `packages/design-tokens/src/record.ts` exporting `INDUSTRIAL_RECORD`:
   spine, photo / band / row per zoom (desk + touch), hit (desk / touch), evidence column min +
   share, label face (family, size, weight, tracking, case), ID face, title face (**15**).
   Export it from `src/index.ts`.
2. Extend `scripts/generate.ts` so it emits: CSS custom properties (`--record-*`) into
   `tokens.css`, a `DesignTokens.Record` enum into `DesignTokens.swift`, and the same object into
   `tokens.json`. `pnpm tokens:build` then `pnpm tokens:check` (the drift gate in `verify:fast`).
3. Point `outbound-orders-ledger-geometry.ts` at the generated values (Tailwind arbitrary values
   over `var(--record-*)` or a Tailwind theme extension — follow how `--mode-*` is wired in
   `tailwind.config.mjs`). No number may remain in the page file. Row heights stay fixed per
   zoom (the virtualizer never measures).
4. Add a guard test beside `src/design-system/tokens/lifecycle.guard.test.ts` that fails when a
   ledger file contains a literal px / hex outside the generated tokens.

## Step 2 — the other Outbound tabs, one page each

Order: **Pending** (`/shipping/shortage`) → **Exceptions** → **Shipped**. Per page:

- Mount the same ledger with the page's feed (Pending = `lockedFulfillmentState="BLOCKED"`;
  Shipped = `queueMode="shipped"`, codes from `LIFECYCLE.shipped`; Exceptions = its caged feed).
  If a page needs a different band fact, add it to the ledger's band model — never fork a row.
- Switch that route to `stage="flush"` in `src/app/shipping/(desk)/layout.tsx`; when all four are
  flush, set it for the whole desk and delete the `'card'` branch for Shipping.
- Give it the record plane (`DeskRecordPlane`, through `RecordLedger`). `DashboardOrderDetails`
  and its `DeskStageOverlay` path were deleted with the Shipped cutover (2026-09-25).
- Update that page's first-paint stand-in to the ledger geometry.
- Station embeds (`PackerTable`, `TechAllTriageTable`, `ShortageDesk` inside `/pack` / `/tech`)
  stay on the slot table until their own page adopts.

## Step 3 — devices (tokens are the contract)

- **iOS (SwiftUI, `apps/mobile-ios` once promoted into `prod`).** `ToShipRowView` reads
  `DesignTokens.Record` + `DesignTokens.Lifecycle` + `DesignTokens.Mode.industrial`; same band
  order (location second, condition beside select); 48pt targets; evidence column = native sheet.
  No `Color(red:…)`, no literal sizes. Owner builds on the MacBook / iPhone Air and returns a
  screenshot. No `scp`, no SSH Xcode builds.
- **Android / phone web.** `/m/*` stays the surface. **In test (2026-09-24):**
  `/m/orders?display=ledger` (the **Ledger** toggle beside sort) paints `MobileOrderRecord`
  (`src/components/mobile/orders/`) instead of the `ItemCardRow` cards; cards stay the default.
  Tap the record or its micro-thumbnail → `MobileOrderEvidenceSheet`: hero image → All photos,
  title (listing link), SKU · item #, floor verbs **Pick** (`/m/pick/[id]`) · **Pack**
  (`/m/pack/start/[id]`) with the next step's verb ink-filled, Pass pick, urgent, **Exceptions**
  (out of stock / clear hold · damaged · discrepancy), listing, labels · slip, details, and the
  fact list (location + picked/allocated, platform, order #, ship-by, condition, qty, price, pick,
  pack). Bin pairing stays on the one Scan door. Open decision before cards retire: the
  outbound-workflow cohort (`src/lib/shipping/outbound-workflow-cohort.ts`) still governs the
  card row (pick progress, swipe triage, "no Pick/Pack execution on Orders"); the ledger
  display deliberately puts Pick/Pack in the sheet, so those rules must be re-ratified or the
  ledger stays a test mode. Kotlin/Compose later reads a generated `Tokens.kt` — add that
  generator when the Kotlin app exists, not before.
- **Desktop (Tauri).** Bundles the shared React ledger (pinned build), never the live site; its
  old `styles.css` literals retire. Test on Linux WebKitGTK.

## Rules you work under

- Dev origin `http://localhost:3050` only; lane `systemctl --user status cycleforge-lane@prod`.
  Never start `next dev` or bind a port.
- The tree carries many uncommitted changes from other lanes; touch only files your page needs.
- Keep every data hook (`useOrdersQueueFeed`, selection plane, `useOrderAssignment`, notes
  `POST /api/orders/[id]/notes`, URL sort, search/filters/page size, record cursor, RSC seed,
  virtualization). No new network requests; same query keys.
- Keep `useOrdersTableLayout` / `ORDERS_DEFAULT_TABLE_BINDING` untouched until the last slot
  consumer adopts (`slot-table-cohort.test.ts` stays green).
- Anything that does not map (a state with no `LIFECYCLE` key, a fact the server does not send):
  stop and list it as a numbered decision with a recommended default. Don't work around it.

## Open decisions carried from the To-ship slice

1. Title 15 — add to the package in Step 1 (web uses 14 today).
2. SSR stand-in paints Medium; a staffer on S / L sees one swap. Recommend seeding `rowZoom` in
   the RSC seed.
3. `--cf-density` (the slot table's 100% zoom) is pinned to 1 inside the ledger; BRIEF's per-staff
   app zoom is not built. Recommend a root font scale that also scales the record geometry.
4. Toolbar menus (filter · sort · views · page size) are the slot table's, lifted to 32px on the
   page; their active face is `bg-blue-600`. Recommend an industrial face in the design system
   when the second page adopts.
5. `isFbaOrder` matches the substring `FBA` anywhere in an order id — a disposable test order whose
   random token contained `FBA` vanished from the queue. Fact-layer fix (server/lib), not a page
   fix.
6. Record-cursor steps call `scrollIntoView({ behavior: 'smooth' })` — motion on an industrial
   floor. Recommend `'auto'` when the region's mode is industrial.

## Acceptance (per page, per client)

1. `pnpm tokens:check` and `pnpm verify:fast` green (except reds listed as unrelated).
2. Before / after screenshots at `http://localhost:3050` — desk 1440×900 (S, M, L; evidence
   open; seed group; OOS; LATE; empty; loading), phone 390×844 for `/m/*`.
3. Behaviour checklist on the live page: search, filters, URL sort, page size, select + bulk bar,
   ship-by, pick / pack assign, condition, qty, notes, record → evidence column, J / K / Esc,
   group totals + fold, row zoom persisted per staff, empty and loading states.
4. Floor check (BRIEF §8): desk 32 / touch 48 hit, 4.5:1 text, 200% zoom usable, reduced motion.
5. Report: files changed, what was dropped, screenshots, open decisions.
