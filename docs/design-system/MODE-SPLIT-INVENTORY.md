# Mode split inventory — routes, looks, and leaks (2026-09-27)

Started as the Phase 1 read-only census (2026-09-27). Refreshed the same day after governance
Phases A–C and the leak sweep landed: the route table is now read from
`src/lib/routing/mode-registry.ts`, the leak table carries each leak's status, and the
forced-triage sites carry a verdict.

## How the split works

- **One switch per region.** `ModeRegion mode="triage" | "industrial" | "assistant" | "counter"`
  (`src/design-system/providers/ModeRegion.tsx`) stamps `data-mode` and the task-mode CSS
  variables (`packages/design-tokens/src/modes.ts`):
  - radius — industrial `0`; triage `rounded-mode` 10px · `rounded-mode-control` 8px ·
    `rounded-mode-pill` 9999px;
  - surfaces / ink — `bg-mode-canvas|bar|panel|well`, `text-mode-ink|muted`, `border-mode-*`
    (industrial: warm, framed, visible fact rules; triage: neutral, no frame, invisible fact rules);
  - labels — `.mode-label`: industrial mono · 11px · bold; triage sans · 12px · medium. Sentence case in
    every mode (owner 2026-09-28: no all-caps text on any display; `uppercase` classes removed repo-wide).
- **Components that use those utilities switch looks by themselves.** Anything with a literal
  radius, font or colour does not — those are the leaks below.
- **`industrial:` class variant** (`src/app/globals.css`): applies when the element's NEAREST
  `data-mode` (self or ancestor) is industrial, so a triage region nested inside Floor keeps the
  base look (bounded at the one-nested-region law). Base classes are the triage look — triage,
  counter and assistant share one voice — and only the industrial face takes the variant:
  `font-sans … industrial:font-mono`.
- **Phones collapse triage to industrial.** `resolveRegionMode('triage', 'phone')`
  (`src/design-system/providers/resolve-region-mode.ts:18-19`) — every `/m/*` route and any coarse
  pointer renders industrial even when it asks for triage.
- **No ModeRegion = triage (since 2026-09-27, governance Phase B).** `:root` declares every
  `--mode-*` var from the triage spec (`modeRegistryCssText` in `modes.ts`): light scheme pins the
  neutral literals, dark resolves through the theme. Coarse pointers keep square corners + mono
  caps labels and take the 48px hit. Before this, `bg-mode-*` / `text-mode-*` / `border-mode-*`
  painted nothing on those routes ("half-styled" in the table below).
- **Portals and nested pieces re-declare their mode** (they escape the page's region):
  - force triage — `RightRailHost.tsx:65`, `command.tsx:150`; 11 phone sheets (`FnskuStationSheet`,
    `MobileArrivalClassifyFlow`, `RepairCustomerPickerSheet`, `RepairInfoEditSheet`,
    `RepairPickupSheet`, `RepairStatusSheet`, `ScanValueField`, `ProvisionalCreateSheet`,
    `ShipmentResolveSheet`, `UnitLineSheets`, `UnitSheetParts`); 3 desk dialogs
    (`LinkLabelDialog.tsx:108`, `OrderLabelEntries.tsx:275`, `ResolveShipmentExceptionDialog.tsx:107`);
    in-page `LabelIntakeDesk.tsx:151`, `ReceivingLinesTable.tsx:656`,
    `ChatPrintJobCard.tsx:194` (triage inside `/ai-chat` assistant);
  - force industrial — `OutboundOrdersLedger.tsx:829` (note popover), `MobileOrderEvidenceSheet.tsx:139`.

## Route → mode (from `mode-registry.ts`)

`DECLARED_ROUTES`, longest prefix first; applied once by `RouteModeRegion` in the app frame.
`mode-registry.test.ts` asserts every `page.tsx` resolves. Phones collapse triage → industrial.

| Mode | Routes |
|---|---|
| **runtime** | `/shipping/*` — `src/app/shipping/layout.tsx`: industrial while Floor is active (`useDeskFloorActive`), else triage |
| triage | `/` (exact); outbound + sales `/counter`, `/fba`, `/pack`, `/packer`, `/pickup`, `/walk-in`, `/tracking-exceptions`; inbound `/incoming`, `/triage`, `/receiving`, `/unbox`, `/carton`; inventory + warehouse `/inventory`, `/warehouse`, `/replenish`, `/bin`; repair + test `/repair`, `/tech`, `/test`, `/wipe`; records + catalog `/dashboard`, `/products`, `/search`, `/serial`, `/photos`, `/ops`, `/review`, `/signals`, `/sourcing`, `/studio`, `/manuals`, `/forge`, `/operations`, `/reports`, `/calendar`, `/open-links`, `/support`, `/onboarding`, `/settings`, `/admin`; identifier doors `/01`, `/414`, `/l`, `/o`, `/p`, `/q`, `/qr`, `/s`; auth + public `/signin`, `/signup`, `/account`, `/invite`, `/share`, `/offline`, `/not-authorized`, `/pay` |
| triage → **industrial on a phone** | `/m/*` |
| industrial | `/m/scan/*`, `/m/orders` (exact), `/m/work/*` |
| assistant | `/ai-chat/*` |
| counter | `/kiosk/*` (its own shell; nothing else may resolve to `counter`) |

Only `/shipping` switches at runtime. Unwrapped `:root` fallbacks are triage (Phase B), so a
portal that forgets its region still paints triage.

## Leaks — pieces that ignore the look

| Leak | Where | Hard-codes | Shows on |
|---|---|---|---|
| State badges (RDY · Ready, → Pick, alerts) | `.state-badge-*` (`packages/design-tokens/src/state.ts:68-71`) via `stateBadgeClass` (`src/design-system/tokens/industrial-record.ts:63`); `LifecycleCode.tsx:33` (rendered by `OrderRecordView.tsx:151`, `OutboundOrdersLedger.tsx:665,936`, `OrdersQueueFirstPaint.tsx:170`); direct callers `OrderRecordView.tsx:162`, `carton-record-sections.tsx:134`, `ReceivingStatusStrip.tsx:61`, `RepairRecordStatus.tsx:170` | solid fill, **no radius** → square in triage | `/shipping/*` records, `/incoming`, `/receiving`, `/repair`, `/dashboard?mode=repairs` |
| Square staff avatars | `StaffAvatar shape="square"`: `outbound-orders-ledger-editors.tsx:181`, `OrderAutoAssignSlot.tsx:66`, `AgendaRecord.tsx:159`, `SkuExceptionsLedger.tsx:281`; `IdentityMark.tsx:82` turns `square` into radius 0 + mono uppercase | square + mono initials | To-ship record + Floor, `/` agenda |
| Dashed square "unassigned" boxes | `outbound-orders-ledger-editors.tsx:183`, `OrderAutoAssignSlot.tsx:68` — `border-dashed` + `cornerClass('flush')` | radius 0 | To-ship record (Picked / Packed / QC / Scanned out rows) |
| Square search fields | `rounded-none` on `SearchField`: `StockLedger`, `DockedReceiptsLedger`, `IncomingDeliveriesLedger`, `SkuExceptionsLedger`, `DailyAgenda`; the primitive's clear button `SearchField.tsx:287` | **fixed 2026-09-27** → `rounded-mode-control` | — |
| Mono uppercase labels outside `.mode-label` | note badge / add-note / condition chip (`industrial-record.ts`); `ReplenishmentNeedTable.tsx:193`; `RepairRecordStatus.tsx:137`; `DeskActionSlot.tsx:55` (+ flush corner); `CompoundCells.tsx:1264`; `outbound/ready/grid/cells/index.tsx:72,79` | **fixed 2026-09-27**: micro codes read the label voice (`--mode-label-font` + `mode-label-case`, "Note" written sentence case); the rest `font-sans … industrial:font-mono industrial:uppercase`; segment corner `rounded-mode-control` | — |
| Industrial record tokens on triage | `RECORD_ID_CLASS`, `RECORD_PRICE_CLASS`, `RECORD_RECESS_CLASS`, `RECORD_QTY_BADGE_CLASS` (every caller) | **fixed 2026-09-27 at the token**: ID / qty sans semibold in triage, mono bold on industrial; recess a flat `border-mode-edge` field with `rounded-mode-control` in triage, bevelled top/left on industrial | — |
| Whole-surface industrial look | `src/features/label-intake/LabelIntakeLedger.tsx` (`MONO_MICRO`), status labels in `src/lib/label-ingestions/ledger-view.ts` | **fixed 2026-09-27**: `mode-label` voice, labels sentence case in source, mono kept on tracking / SHA only. `LabelIntakeDesk` / `LabelIntakeRates` were already on mode tokens; `BuyLabelSection` converted by the phone-order session | — |
| Caps presets + timeline face | `sectionLabel`, `fieldLabel`, `microBadge` (`src/design-system/tokens/typography/presets.ts`, ~75 files); `EventTimeline.tsx` group + day labels | **fixed 2026-09-27 at the preset**: sentence case in triage (`text-role-caption` section / field labels), tracked caps micro on industrial via `industrial:`. The order record's timeline is titled **Timeline** (`OrderTimelineSection`; the shared default stays "Activity") | — |
| Labels queue + label intake wearing the Floor ledger | `PaperworkRecentRail` (the Labels walk's queue: spine, flush bands, 2px ink rules — the To-ship ledger's industrial record); `LabelIntakeDesk` right rail (`LEDGER_EVIDENCE_CLASS`: `max(18rem,24vw)`, ink seam) + `LEDGER_TOOLBAR_CLASS` header; `LabelIntakeLabels` (ink code block, flush rows) — all inside forced-triage regions | **fixed 2026-09-27**: both rails are `DESK_TRIAGE_RAIL_CLASS` (`desk-stage.ts`, fixed `w-[22rem]`, one `border-mode-divide` seam); queue rows are rounded triage rows (order # · platform / title / state dot + label · Tracked \| No label), the open one `RECORD_OPEN_CLASS`; label rows are `rounded-mode-control` cards with a purpose pill. Neither file imports `outbound-orders-ledger-geometry` any more; `LEDGER_EVIDENCE_CLASS` deleted | — |
| Forced triage inside Floor | see verdicts below | classified 2026-09-27 | — |

### Forced triage inside Floor — verdicts (2026-09-27)

| Site | Kind | Verdict |
|---|---|---|
| `LinkLabelDialog.tsx:108` | portalled dialog | **intentional** — a portal escapes the page region and must declare one; it is a form (search, purpose, confirm), read in sentence case. Keep triage |
| `OrderLabelEntries.tsx:275` (Link a support ticket) | portalled dialog | **intentional** — same reason |
| `ResolveShipmentExceptionDialog.tsx:107` | portalled dialog | **intentional** — same reason |
| `PaperworkWalkHost.tsx:58,65` | in-page plane replacing the list | **intentional** — the Labels walk is form work (parcel, rates, buy label, `BuyLabelSection` triage face); the one nested region is allowed |
| `LabelIntakeDesk.tsx:151` | in-page desk | **intentional** — not redundant: `useDeskFloorActive` is shell-wide, so a Floor left on elsewhere in `/shipping` would otherwise paint the manual label form industrial |
| `OutboundOrdersLedger.tsx:828` (note popover) | portalled popover, forces **industrial** | **intentional** — the inline note editor is part of the Floor row; the ledger is industrial wherever it renders it |

The `industrial:` variant honours every nested verdict above (nearest region wins).

## Record header — reach of a header change

`DeskStageRecordHeader` (`src/design-system/components/DeskStageOverlay.tsx:196-264`): title +
subtitle (left) · actions · `n of N` · In place / Split switch · ‹ › · **✕ Close (top-right)**.
Rendered by `DeskRecordPlane` (split) and `DeskStageOverlay` (in place + every overlay plane).

Every caller passing a title/subtitle (all would get Back-top-left / no-✕):

- Records via `DeskRecordPlane`: To-ship cards (`OrderCardList.tsx:735`), Floor / exceptions /
  search order ledger (`OutboundOrdersLedger.tsx:389`), Repair (`RepairTable.tsx:197`), Inbound
  cards (`IncomingDeliveryCardList.tsx:170-174` — other session's WIP), and every `RecordLedger`
  (`RecordLedger.tsx:242`):
  Inbound ledger, Docked receipts, Stock, SKU exceptions (orphaned), Replenishment, Shipped,
  Daily agenda.
- Overlay planes via `DeskStageOverlay`: part-compatibility unlink, cycle-count line, hold release,
  order status trail, auto-assign rule, kiosk-device revoke, session revoke, sign-in policy,
  deactivate teammate, record tasks.
- Subtitles that repeat the product title (the owner's "redundant"): To-ship cards, Floor ledger,
  Repair, Inbound (cards + ledger), Docked receipts.

## Keybinds today

- Floor: ⌘/Ctrl+Shift+F (`DeskStageContext.tsx:83-92`, bound in `DeskPageChrome.tsx:127-137`,
  listed in the cheat sheet).
- Esc ladder: split/floor record close (`DeskRecordPlane.tsx:134-150`) → overlay close
  (`DeskStageOverlay.tsx:91-106`) → leave Floor / Split (`DeskPageChrome.tsx:114-123`).
- In place ⇄ Split: ⌘/Ctrl+Shift+S (`isDeskSplitChord` in `DeskStageContext.tsx`, bound in
  `DeskPageChrome.tsx`, cheat-sheet group `desk-split`; inert on Floor, whose records open in the right rail).
  Hints on the ONE view switch (`DeskRecordViewSwitch`: In place · Split · Floor, icon-first radiogroup, arrows move; Floor offered where a list paints a floor face and stays checked while on it). `DataTableFullscreenToggle` (Floor / Exit floor / ⤢) is deleted (2026-09-27).
- Left nav column: `\` or `/` alone, ⌘/Ctrl + `\` or `/` (`src/lib/nav/sidebar-toggle-hotkey.ts`).
- Open order record (`useOrderRecordKeys`, `?` sheet group "This record"): **T** replace tracking · **N** write a note · **E** edit shipping · **M** print packing slip (P is the strip's product-label print). With a record open, bare `?` shows the strip's inline letters; ⌘/Ctrl+Shift+? opens the full sheet, which now also lists the strip's letters ("Record actions"). `findDuplicateVerbHotkeys` warns in development when two strip verbs share a letter.

## Floor right rail

**Withdrawn 2026-09-28** (BRIEF §14): the desktop has no Floor view; this section is history.

**Owner 2026-09-27 (reverses the 2026-09-26 "no right rail" ruling):** Floor keeps a right rail
that shows the selected record's details, edge to edge. `DeskRecordPlane` places the record per
view: In place covers the list; Split = list 2/3 + pane 1/3; **Floor = list `flex-1` from the
viewport's left edge + a fixed `w-[30rem]` rail to the right edge** (`DESK_FLOOR_LIST_CLASS` /
`DESK_FLOOR_RAIL_CLASS`, `desk-stage.ts`). The rail is always mounted (empty: the queue summary
by state), so the list never changes width; the record inside takes the rail's width — no fixed
`DESK_RECORD_MEASURE_CLASS` (`DeskRecordLayout`, one stacked column). ✕ top-right closes; Esc
closes the record, a second Esc leaves Floor. Measured at 1440×900: stage `0–1440`, list
`0–960`, rail `960–1440`, both `40–900` (app bar to bottom edge). The app-level `RightRailHost`
stays empty on Floor. Still inset: the record body's own `p-4` + lifted column cards
(`OrderRecordView.tsx`, owned by the order-record session).

Floor group row (a multi-line order folded to one band): the state badge is the single-record
code only (no `n/N` — the count rides the screen-reader label), followed by the note slot, then
the buyer name + place like every record; bin / box / line counts are gone from the band.

## Order record groups (2026-09-27)

Foundations: `RecordGroup` (`src/design-system/components/record-ledger/RecordGroup.tsx`) — title
top-left in the label voice (sentence case in source), at most ONE action top-right, a lifted card in
triage, a flush full-width band closed by one hairline on industrial. `StepRail` (same folder) — icon
nodes on one vertical hairline, state by colour only (filled done · ringed now · dashed not yet);
the Fulfilment ladder draws it at `lg`, `EventTimeline` at `md`, so progress and history read as one
system. Header: `OrderRecordTitle` (the order number once, copy / edit-link menu + ↗) and
`OrderRecordStatus` (the order's one state — worst across lines — plus the next step), used by the
To-ship ledger, the cards and search.

| Column | Group | Holds |
|---|---|---|
| Left | Item (title hidden for one line; "Items · n" for several) | photo · title · **platform picker (open line only — the platform is the order's) · SKU · Item # with ↗ listing · ✎ edit link · copy** (owner 2026-09-27: for eBay the listing IS the item number, so there is no separate Platform / Listing row; no item # ⇒ an "add listing" control) · **Qty · Condition · Bin … price** — the line total right-aligned in the line, `unit × qty` beside it when qty > 1 (`orders.sale_amount` is the line total); off the Floor unless the desk has no Payment group (Exceptions). **On hand · Allocated a/qty** (`OrderLineStock`, warn when short; an Allocate icon posts `/api/orders/[id]/allocate` for the missing units). Receiving photos (arrival · unbox) inline. A **duplicate-order banner** heads the column when the same customer ordered the same SKU within 30 days (`DuplicateOrderBanner` → `GET /api/orders/[id]/possible-duplicates`). PO links under the items. No state badge — the header carries it |
| Left | Payment (triage only — `industrial:hidden`, owner 2026-09-24: price is noise on the floor) | `OrderPriceEvidence`, one disclosure under the items: the paid amount collapsed; items · adjustments · sale · shipping · tax · total · paid · label costs · net on open (owner 2026-09-27: price reads in the line, detail in its own group) |
| Left | Fulfilment | `StepRail`: Picked → QC → Packed → Scanned out; who · when per step; assign on open Pick / Pack steps; bins, allocation and SKU home bin under Picked; testing photos under QC; pre-box, bench and packing photos under Packed. "Now" is the step after the furthest done one |
| Left | Notes · Documents · Timeline | `OrderNotesPanel`: the buyer's note pinned first (channel dot + pin), then the note composer — no caption, idle says nothing, autosave on blur / Enter, **@mention** staff (stored as `@[Name](staff:ID)`, `order_notes.mentioned_staff_ids`; each mentioned teammate gets a `staff_inbox_items` row, reason 'mentioned') — then earlier notes folded ("n earlier"). The header's `OrderNoteChip` appears when the order carries a note and focuses the composer. Documents disclosure; Timeline card (order notes now render under its 'notes' lens; the note's own ORDER_UPDATE audit is dropped so it is not listed twice). **No loading state**: `OrderTimelineSection` paints nothing until the events land, and the card is `empty:hidden` |
| Right | Customer · **Edit** | a storefront customer card, no Name / Email / Phone captions (owner 2026-09-27: self-explanatory): name (semibold) · email (mailto + copy) · **"4 orders · $812"** under the name (`CustomerOrderStats` → `GET /api/customers/[id]/stats`, the count links to the orders list searched by this buyer; "First order" for one) · phone (`formatPhoneNumber`, `tel:` + copy) · "Billing address" (the one caption kept — it is not the ship-to) · "From ShipStation" when the buyer is the ShipStation ship-to. Edit = name / email / phone via `PATCH /api/orders/[id]/buyer` (`orders.create`) |
| Right | Shipping · **Edit** | one row **Ordered** (left) · **Ship by** (right); the recipient + address as a postal block (copy + map, no caption; an **Unverified** warn mark when ShipStation v2 `/addresses/validate` cannot verify it — `AddressCheckBadge`); `OrderTrackingLine`: truck · carrier · tracking # then **✎ (replace; + when none) left of ↗** — icon-first. Replace (`TrackingReplaceField`) is an empty field, "Replaces ~~old~~", and — when the old number is a live label bought here — "Void the ShipStation label too" (checked; PIN step-up; a failed void commits nothing). Every tracking / ship-by save raises an **Undo** toast (`toast.undo`). Under the line: **delivery promise** (`DeliveryPromise`: "Arrives Thu, Sep 30" / late / "Delivered Sep 29" from `shipping_tracking_numbers.estimated_delivery_at` + `delivered_at`) and **"n earlier" tracking numbers** (`TrackingHistory` ← `GET /api/orders/[id]/tracking-history`: `orders.tracking.replaced` audits + voided / unlinked labels). The carrier-status sub-line (`withStatus`) is dormant: only the Shipped section list paints it and that list is unreachable today. Edit: ship-by picker on the row's right, the ship-to form — Save checks the address first and offers **Use suggested / Save as typed** — and the tracking # field. Labels bought here carry a Void icon in `OrderLabelEntries` |
| Right | Conversation · More actions | thread disclosure; the ⋮ verb list — now with **Print packing slip** (M), **Return label** and **Replacement label** (open the label desk on `/search?entry=label&q=<ref>&purpose=…`). Urgent / clear out-of-stock raise an Undo toast |
| Header | top-right | `OrderRecordHeaderActions`: Note chip (when a note exists) · the ONE status · a Printer icon (print the slip on file, else open Paperwork on the slip tab). A sticky **summary bar** (`OrderRecordSummaryBar`: order # · status · total · ship by) slides in once the record scrolls; hidden on industrial |

**Photos, inline** (`OrderPhotoStrip`): one strip per evidence stage over the order-timeline payload the
record already fetches, on the shared gallery SoT (`usePhotoGallery` thumbnails → `PhotoLauncher` →
`PhotoViewerPortal`); `OrderPhotoPeek` (the `PhotoPeekFan` fan) stays on the record edge for every photo.
The shared thumbnail tile now wears mode tokens (`rounded-mode-control`, `border-mode-edge`).

**Buyer correction** (`PATCH /api/orders/[id]/buyer`, `src/lib/orders/order-buyer.ts`): writes the
order's customer (creates + links one from the ShipStation ship-to when there is none), stamps
`customers.shipping_edited_at` on an address write, audit-logs `order.buyer_update`, publishes
`order.changed`. `pickOrderShipTo` buys labels to a staff correction made at/after the order's creation
over ShipStation's copy; the channel buyer sync no longer overwrites a newer correction.

Verified on :3050 2026-09-27: To-ship In place (triage) and Floor rail; Exceptions earlier. Ship-to
save and Customer save exercised on seed order `CF-ML-5LINE-SEED` (customer created + linked, address
and phone read back), then the seed was restored. No order in the live queue has unit photos, so the
strips were exercised with injected payloads only (layout + gallery wiring; image loading unproven).
Open: the `shipped` section list is unreachable in the UI (the Shipped desk opens its own package record).

## Layer census (2026-09-27)

Read-only run of the five detectors in `HANDOFF-view-spec-layers.md` §5.1 over
`src/components/outbound`, `src/components/receiving`, `src/features`, `src/design-system/components`
(698 non-test files) plus the inbound-history host chain. Every row was confirmed by reading the line;
over-matches are listed as excluded. Laws 3 · 4 · 5 are now the `Layer laws` gate
(`scripts/layer-law-guard.ts`, rule module `src/lib/views/layer-law.ts`); its allowlist is this census
and only shrinks — an entry whose file stops violating fails the gate until it is deleted.

### D1 — paint in components (Law 1)

535 hits in 200 files: uppercase 257 · font-mono 94 · rounded-none 75 · hex 54 · border-mode-ink 28 ·
text-[Npx] 27 (receiving 225 · design-system/components 155 · features 85 · outbound 70). Not gated
(too broad for a burn-down today). Largest:

| file | hits | kind |
|---|---|---|
| `src/design-system/components/monitor/charts/chart-theme.ts` | 29 | chart palette as raw hex |
| `src/components/receiving/workspace/line-edit/CatalogManagerList.tsx` | 19 | hex swatch data (12) + mono / caps classes |
| `src/components/receiving/workspace/line-edit/UnfoundMatchStrip.tsx` | 18 | rounded-none 14, caps, mono |
| `src/design-system/components/record-card/RecordCard.tsx` | 15 | text-[Npx] instead of role tokens |
| `src/features/review/packer/PackerReviewMode.tsx` | 14 | rounded-none, caps, mono |
| `src/features/operations/workspace/OperationsTvBoard.tsx` | 12 | caps |
| `src/design-system/components/sidebar-intake/intakeFormClasses.ts` | 11 | caps |
| `src/design-system/components/grid/grid-column-display.ts` | 10 | hex column-tint palette |
| `src/components/outbound/labels/AddTrackingPopover.tsx` | 9 | caps, mono |
| `src/components/outbound/orders/paperwork/PaperworkPairingControls.tsx` | 8 | mono |

Hex in `CatalogManagerList.tsx:47-58` and `grid-column-display.ts:8-29` are user-pickable stored values
— token-palette candidates, not the same kind as `chart-theme.ts`.

### D2 — job as paint (Law 4, gated)

| file | line | hidden content |
|---|---|---|
| `src/components/outbound/orders/OrderRecordView.tsx` | 325 | Payment group (`OrderPriceEvidence`) |
| `src/components/outbound/orders/OrderRecordView.tsx` | 721 | line price (`!priceOnFloor && 'industrial:hidden'`) |
| `src/components/outbound/orders/record-keys/OrderRecordSummaryBar.tsx` | 77 | the whole summary bar (order total, ship-by) |

### D3 — page branching in shared parts (Law 3, gated)

| file | line | finding | verdict |
|---|---|---|---|
| `to-ship/MorphingRowActionMenu.tsx` | was 1146 | desk inferred from the route (`pathname === SHIPPING_EXCEPTIONS_PATH`) | **fixed** — `viewKey` prop, `OrdersRowPlane` is To ship's |
| `to-ship/MorphingRowActionMenu.tsx` | was 272, 460, 568 | `mode === 'shipped' / 'exceptions'` picks verbs | **fixed** — `viewOffersVerb(viewKey, …)` reads `VIEW_SPECS[key].verbs` |
| `to-ship/MorphingRowActionMenu.tsx` | 1031 | `viewKey === 'shipping.shipped'` keeps the full strip | open (allowlisted) |
| `to-ship/MorphingRowActionMenu.tsx` | 1132-1214 | `isMorphingMobileUrl(pathname)` — phone gets the full list + Notes sheet | surface cap (allowed: Surface limits presentation) |
| `src/components/station/ReceivingLinesTable.tsx` | 210 | `/incoming` host hides Find, week pill and Sort by route | open (allowlisted) |
| `src/components/station/useReceivingModeContext.ts` | 54, 154 | route → receiving mode inside the shared station context | open (allowlisted) |
| `label-intake/LabelIntakeDesk.tsx`, `triage-card-list/triage-list-state.ts` | — | `pathname` only rebuilds hrefs / scroll keys | routing verb (fine) |

Excluded: `mode` that is not a page (grid scrollbar, triage page size, select-all, `shippingMode` order
fact, paperwork row edit, `OutboundOrdersDesk` redirect shell).

### D4 — second fact readers (Law 5, gated)

| file | line | fact |
|---|---|---|
| `outbound/label-intake/label-intake-client.ts` | 243 | label money — a third `Intl.NumberFormat` copy |
| `outbound/label-intake/LabelIntakeLabels.tsx` | 19-21 | label created time via `toLocaleString` (not gated: count-safe pattern) |
| `outbound/label-intake/LabelIntakeRates.tsx` | 18 | delivery ETA via `toLocaleDateString` |
| `outbound/labels/BuyLabelSection.tsx` | 52, 62 | local `money()` + `eta()` copies |
| `outbound/orders/OrderLabelEntries.tsx` | 47 | non-USD label cost via `toFixed(2)` |
| `outbound/orders/facts/CustomerOrderStats.tsx` | 25 | first-order month via `toLocaleDateString` |
| `outbound/orders/intake/OrderIntakeForm.tsx` | 493 | `orders.ship_by` key built by hand |
| `outbound/orders/OrderRecordView.tsx` | 461 | tracking-href ladder repeating `resolveTrackingOpenUrl` (not gated: call pattern) |
| `receiving/inventory/InventoryPoLineList.tsx` | 158, 162 | PO rate / total via `` `$${…toFixed(2)}` `` |
| `receiving/pickup/pickup-lines.ts` | 74 | pickup money |
| `receiving/workspace/note-composer-helpers.ts` | 38 | PO unit cost |
| `receiving/incoming/order-composer/InboundOrderLines.tsx` | 37 | unconfirmed — input serialization |
| `receiving/history/cards/carton-card-model.ts` | 73-83 | unconfirmed — day bucketing, not formatting |

### D5 — layout picks the component

| file | line | swap |
|---|---|---|
| `src/components/unshipped/UnshippedTable.tsx` | 819-840 | `floor ? OutboundOrdersLedger : OrderCardList` |
| `src/components/receiving/history/DockedReceiptsLedger.tsx` | 141 | `cardsFace` → `HistoryCards` vs `RecordLedger` |
| `src/components/receiving/incoming/IncomingDeliveriesLedger.tsx` | 242 | same `cardsFace` swap |

`DeskRecordPlane`, `IncomingStatusChips`, `DeskPageChrome`, `DeskRecordViewSwitch` read `floor` for classes
or control availability only (fine).

### Inbound history (`/incoming?lane=docked`) — "two systems" confirmed

`src/app/incoming/page.tsx` → `ReceivingSurfacePage` → `ReceivingLinesTable.tsx:737` →
`receiving/history/DockedReceiptsLedger.tsx`. One host mounts two whole list systems (triage
`TriageCardList` + `CartonCard` on In place / Split; industrial `RecordLedger` + `IndustrialRecord` on
Floor) and shares industrial parts into the triage face: `RecordLedgerSummaryPane` (`font-mono …
text-mode-ink`, `RecordLedgerSummary.tsx:47,78`) and `CartonRecordView` (`border-mode-ink` rules,
`carton-record-facts.tsx:53-119`; ALL-CAPS copy `SKU` / `QTY` / `COND` / `PRICE` written into the text,
`carton-record-sections.tsx:140-159`) with no `industrial:` prefix, beside triage paint on the card
(`CartonCard.tsx:34` `text-[13px]`). Next: a `receiving.history` view spec, then one presenter.

### Pilot — To ship vs Exceptions (`src/lib/views/view-specs.ts`)

`VIEW_SPECS` replaces `ORDER_RECORD_SECTIONS` and `OrderRecordMode` (keys `shipping.to-ship` ·
`shipping.pending` · `shipping.exceptions` · `shipping.shipped` · `search.orders`). The ONE ledger
(`OutboundOrdersLedger`) now paints each row from its spec: lead cell (ship-by vs hold reason), row facts
by density (`rowFactsAt`), primary cell (next step vs `→ Resolve`), sort (`VIEW_SORT_ARRANGE`), empty
state. Held facts are catalog facts (`ORDERS_HOLD_FIELD_CATALOG`: `orders.hold_reason` · `hold_fix` ·
`hold_releases`, resolver `resolveOrdersHoldValue`) over the row's `hold` projection
(`exceptionRowToQueueRow`). Row density is per view, bounded by `spec.density.allowed`, stored at
`desk.<viewKey>.density` (Exceptions offers S · M). Verified on :3050: `/shipping/exceptions` rows lead
with the hold reason, paint "Unpaired SKU · No item number — the action", "Releases N", `→ Resolve`
(opens the record on the pairing form); `/shipping/orders` Floor unchanged (ship-by, bin, Pick · Pack,
next step).

## Finding → phase

| Phase | Fixes | Blast radius |
|---|---|---|
| A. Badges + avatars follow the look | **done 2026-09-27** (`HANDOFF-mode-governance.md` Phase A) | token-level |
| B. Unwrapped routes degrade to triage | **done 2026-09-27**: `:root` declares every `--mode-*` from the triage spec | every route |
| C. Route → mode registry applied by the shell | **done 2026-09-27**: `mode-registry.ts` + `RouteModeRegion`; page-level regions removed | every route |
| Record header (Back / ✕) | **done 2026-09-27** (`DeskStageRecordHeader dismiss`) | every record plane |
| In place / Split keys | **done 2026-09-27** (⌘/Ctrl+Shift+S) | every desk with a record plane |
| Leak sweep | **done 2026-09-27**: `industrial:` variant, `RECORD_*` tokens, search fields, mono-caps labels, label intake (table above) | token-level + listed files |
| Floor right rail | **done 2026-09-27** (owner reversal, above) | every `DeskRecordPlane` desk on Floor |
| D. ESLint gates + burn-down | in progress (another session) — allowlists in `eslint.config.mjs` | lint |
| E. Scan-feedback consolidation | **landed 2026-09-28**: `RepairScanCompanion` and `useDataWipeController` fire through `useScanFeedback` (`success` / `warn` / `reject`; `vibrateRead` + `playVerdictCue` deleted). Settings moved to the station-wide registry page `scan` (`scan.soundsEnabled` org · `scan.sound` / `scan.haptics` staff, legacy `receiving.*` values read until first write; haptics default on), shown on Settings › Your setup › Hardware. Still ungated (call `play.ts` directly): `usePickOrder` (`/m/pick`), `LocationStockList` | lint + two stations |
| F. design-mcp law | open | — |

## Owner decisions needed

1. ~~Phase 3 reach~~ — answered 2026-09-27: the way out follows where the record sits — inline → Back
   top-left; right rail / side pane / centred card → ✕ top-right.
2. ~~Phase 6~~ — superseded 2026-09-27: Floor HAS a right rail (details of the selection).
   ~~Order facts under the items vs the aside~~ — decided 2026-09-27: split by meaning — Platform +
   Listing on the Item group, shipping facts in the Shipping group (right).
3. ~~Phones: keep triage → industrial collapse on `/m/*`~~ — decided 2026-09-27: keep. A phone is used
   on the floor, and the collapse is the one rule every `/m` page already follows.
4. ~~Price on the Floor rail~~ — decided 2026-09-27: hidden (upholds 2026-09-24 "price is noise on the
   floor"); triage leads with it.
5. ~~Customer edit scope~~ — decided 2026-09-27 (owner: must be able to change the address): contact
   AND ship-to, order-scoped route, desks' `orders.create` permission.
6. ~~`/incoming` on Floor stays triage~~ — decided 2026-09-27: keep. Only `/shipping` is runtime; a
   second runtime route would be a new registry entry for a desk nobody has asked to Floor.
7. **Open — the look follows density × surface, not route or layout** (proposed 2026-09-27,
   `HANDOFF-view-spec-layers.md` §2 Law 6). It would retire the `runtime` entry for `/shipping` in
   `mode-registry.ts` and make Floor = Rail layout + Dense. Until you decide, the registry stands.
8. **Open — "price is noise on the floor" as a disclosure rule** (proposed 2026-09-27): move it from
   paint (`industrial:hidden` on the Payment group and line price) to the view spec's Dense tier, so
   price folds away because of density, not because the region is industrial.
9. **Open — Exceptions sort by hold age.** The pilot asks "hold age, then orders one fix would
   release"; `OrderExceptionRow` carries no hold-start time, so `shipping.exceptions` sorts by
   `sortExceptionQueueRows` (missing item number → widest release → newest). Hold age needs the cage
   timestamp on the exceptions API.
10. **Open — bulk "apply this fix to every order with the same cause".** No such verb exists; pairing
    one item number already releases its unpaired siblings (`hold_releases`). Decide whether a separate
    bulk verb is wanted.
11. **Open — routing text in `notes`.** `exceptionRowToQueueRow` still packs category · owner · action
    into `notes`, so every held row paints the Note badge. The same facts are now `orders.hold_*`;
    dropping the packed string changes what the record's note slot shows.
12. **Open — one layer-4 home.** Two declarations now coexist: `ViewSpec` / `VIEW_SPECS`
    (`src/lib/views/view-specs.ts`, the order record + the outbound ledger) and `TriageViewDecl`
    (`src/lib/triage/views/`, the triage card lists). `HANDOFF-triage-views.md` → "One view-spec system,
    not two" carries the field-by-field merge table. Pick the home; the merge into ONE type follows.
13. ~~Industrial caps labels~~ — reversed 2026-09-28 (owner): no all-caps text on any display, the Floor
    included. `labelVoice` is `mono | sentence` (`modes.ts`; `--mode-label-case: none` in every mode),
    every Tailwind `uppercase` utility was removed from `src`, and painted caps copy / display
    `.toUpperCase()` were converted at their source (`sentenceCaseLabel` keeps acronyms: SKU, PO, FBA …).
    Census D1's `uppercase` hits are resolved by this ruling. Kept on purpose: acronyms and state codes
    (OOS · RDY · PKD), operator-set platform short labels, stored data (titles, names, cities), printed
    labels (`src/lib/print/**`, `bin-label-printer`). Not yet enforced by a gate — see
    `HANDOFF-inbound-record.md` §6.
14. ~~Triage status treatment~~ — decided 2026-09-28: one sentence-case soft
    pill with a distinct per-state icon; the industrial mode keeps the solid
    state code. Cards carry state through their rail and icon only, one-row
    density carries the pill, and a record header carries one `LifecycleCode`.
