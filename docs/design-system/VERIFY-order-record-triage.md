# VERIFY — order record, triage progressive-disclosure pass (2026-09-27)

Verifier's report for the owner's order-record prompt (To-ship record, In place / Split, triage).
Part 1 checks every claim in the prompt against the working tree (code read; `/shipping/orders`
could not be screenshotted — another session's `orders-list.ts` import of `sqlOrderHasTechScan`
breaks the build at the time of writing). Part 2 is the acceptance checklist the implementation
must pass; the verifier signs off against it.

Files: `src/components/outbound/orders/OrderRecordView.tsx` (record), `order-record-sections.tsx`
(customer / shipment), `outbound-orders-ledger-editors.tsx` (shared field editors), `OrderPriceEvidence.tsx`,
`src/components/shipped/OrderTimelineSection.tsx` → `src/components/ui/TimelineSection.tsx` /
`EventTimeline.tsx`, `src/lib/timeline/audit-diff.ts`.

## Part 1 — claims

| # | Owner's claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Order note renders industrial in triage | **TRUE** | `LedgerNoteField` textarea = `bg-mode-well` + `RECORD_RECESS_CLASS` (`border-mode-edge` + darker `border-t/l-mode-control` = bevelled well) (`outbound-orders-ledger-editors.tsx:756-760`, `industrial-record.ts:46`) |
| 2 | Bin / "Unassigned" renders industrial | **TRUE** | `RECORD_ID_CLASS` = `font-mono … font-bold` on the bin value (`OrderRecordView.tsx:530`); home-bin row same (`:549`) |
| 2b | (not named) Condition chip "USED" is industrial | **TRUE** | `RECORD_CONDITION_CHIP_CLASS` = mono · micro · bold · uppercase · tracking (`industrial-record.ts:89-90`, used by `LedgerCondition`) |
| 3 | Solid "→ Pack" badge, "1 item", "→ Scan out" sit above the photo / title | **TRUE** | state row `OrderRecordView.tsx:155-175`: `LifecycleCode` + `{n} item(s)` + next-step solid `stateBadgeClass` badge whose label is the next stage ("→ Pack", "→ Scan out") |
| 4 | QC by / Picked by always shown | **TRUE** | `:560-584` render unconditionally when `chain`; plus Pre-boxed `:610`, Pack bench `:631` |
| 5 | Timeline is always open (no disclosure) | **TRUE** | `:205-209` mounts `OrderTimelineSection initialLimit={5}` inline in the item column |
| 6 | No way to view packing photos from the packing record | **PARTIAL** | an unlabelled photo fan (`OrderPhotoPeek` → `PhotoPeekFan`) rides the record edge (`:374`), all sources mixed; no control next to "Packed by". Data exists: `unitPhotos[].source === 'packing'` (`unit-photos-events.ts:11-16`), viewer `PhotoViewerPortal` + `usePhotoGallery` |
| 7 | Bin is not beside Qty / Condition | **TRUE** | Qty + Condition row `:501-515`; Bin is a separate disclosure row below (`:525-556`) |
| 8 | Customer lacks a clear header with name / email / phone | **PARTIAL** | `OrderCustomerSection` is a collapsed `EvidenceDisclosure` whose summary is the name; email (mailto) and phone (plain mono, no tel/copy) are hidden until opened (`order-record-sections.tsx:130-200`) |
| 9 | Shipping is not its own section | **TRUE** | shipping facts are split three ways: ship-to address inside Customer (`:163-193`), tracking # + ship-by in the details facts (`OrderRecordView.tsx:258-292`), carrier + carrier status in `OrderShipmentSection` in the item column (`:195`) |
| 10 | Platform sits in the details panel | **TRUE** | `EvidenceFactRow label="Platform"` (`:218-227`) |
| 11 | Order number shows twice | **TRUE** | record header title `Order ${ref}` (`OrderCardList.tsx:736`, `OutboundOrdersLedger.tsx:389`) + details row "Order #" (`OrderRecordView.tsx:230-242`) |
| 12 | No external-link button beside the order number in the header | **TRUE** | header title is a plain string; the ↗ lives only on the details row (`OrderAdminLinkAction`, `:232`) |
| 13 | Listing sits in details, not with the item | **TRUE** | `EvidenceFactRow label="Listing"` (`:245-257`); the item title links to it only on hover-underline (`:456-469`) |
| 14 | Ship by in details is fine; belongs under Shipping | **TRUE (position)** | `:282-292` |
| 15 | Price should be its own category | **PARTIAL** | a Price block already exists (`OrderPriceEvidence`, `:299`) but the item also repeats "Price $x" (`:516-521`) |
| 16 | Order note is on the right | **TRUE** | details column `:300-307` |
| 17 | Timeline is not triage (radius, hierarchy, staff / date / time) | **TRUE** | uppercase micro labels with letter-spacing (`EventTimeline.tsx:351,357,580-581`); header "Activity" (`TimelineSection.tsx:72`); audit diffs print raw JSON (`audit-diff.ts:8` `JSON.stringify` for object values → `pairing: {"sku":null,…} → {…}`) |
| 18 | Timeline is labelled "Activity" | **TRUE** | `TimelineSection` default `title = 'Activity'` (`:72`); the order timeline does not override it |
| 19 | Timeline is attached inside the item column | **TRUE** | rendered inside `main`'s `COLUMN_CLASS` card after items / shipment / documents (`OrderRecordView.tsx:205-209`) |

Nothing in the prompt verified FALSE.

## Part 2 — acceptance checklist (sign-off requires every box)

### Layout (F-pattern)
- [ ] Every group is a titled section: title top-left (sentence case, `mode-label`), **at most one** CTA top-right (e.g. Shipping → one "Edit"). No per-row pencils inside a group that has the header Edit.
- [ ] Left column, top → bottom: **Item(s)** → **Fulfilment** → **Notes**. Right column: **Customer** → **Shipping** → **Price** → Conversation / More actions.
- [ ] **Timeline detached**: its own card, not nested in the item column; titled **"Timeline"** (not "Activity") for this use case — override via `OrderTimelineSection` / `TimelineSection title`, don't change the shared default other surfaces use. Collapsed or limited by default (progressive disclosure).

### Item group (left)
- [ ] No "{n} item(s)" text and no solid next-step badge ("→ Pack" / "→ Scan out") above the photo / title.
- [ ] Facts row: **Qty · Condition · Bin** on one line; Bin moved there (unassigned reads in the warn tone, sans, not mono).
- [ ] **Platform** and **Listing** (open ↗ + add/edit link) sit on the item, not in the details column.
- [ ] Item does not repeat the price (it lives in Price).
- [ ] Condition chip and Bin use triage faces (no mono / uppercase / micro-tracking outside `mode-label`); Floor still square + label-voice.

### Fulfilment group (left)
- [ ] Visible: **Packed by** and **Scanned out by** only.
- [ ] **Picked by, QC by, Pre-boxed, Pack bench, bin detail (SKU home bin, allocated, set bin)** behind one "More details" disclosure, closed by default.
- [ ] **Photos** CTA top-right of the group opens the packing photos (`source === 'packing'`, falling back to all order photos when none) in `PhotoViewerPortal`; shows a count; disabled with a reason when zero.

### Notes group (left, below items)
- [ ] Order note field lives here (not the right column), triage face: `rounded-mode-control`, uniform `border-mode-edge`, panel background — no bevel / well. Buyer note shown in the same group, read-only.

### Customer (right)
- [ ] Header "Customer" top-left; body always visible (not a collapsed disclosure): **name**, **email** (mailto + copy), **phone** (`tel:` + copy).

### Shipping (right)
- [ ] One section holding **ship-to address** (copy + map), **carrier + tracking #** (open ↗ + copy, carrier status line), **Ship by**, **Ordered**; one **Edit** top-right (tracking #, ship by).
- [ ] No shipping fact is duplicated in another group.

### Header
- [ ] Order number appears **once** (header title); the details "Order #" row is gone.
- [ ] External-link button immediately right of the order number in the header (stored `admin_url` wins; add-link state when none — reuse `OrderAdminLinkAction`).

### Timeline (component upgrade)
- [ ] Mode tokens only: `rounded-mode*` corners, `border-mode-*` lines, filters on the `DeskRecordViewSwitch` segmented face; no hard-coded uppercase / tracking outside `mode-label`.
- [ ] Hierarchy per event: human sentence first line; second line **staff full name · date · time** in one format (`3:25 PM`; non-today includes the date via `@/utils/date` PST helpers); day headers sentence case ("Thu, Sep 24").
- [ ] No raw JSON: object diffs rendered as `Field: before → after` with humanized keys, `—` for null, unchanged keys skipped (fix in `src/lib/timeline/audit-diff.ts` so every consumer benefits) + a unit test.

### Regression / law
- [ ] Floor (⌘/Ctrl+Shift+F) still renders industrial: radius 0, label voice caps, same data.
- [ ] Split pane (~⅓ width) and In place both render without horizontal overflow at 1100 and 1600 px windows.
- [ ] `tsc` clean on touched files; eslint clean; `pnpm verify:fast` red only on pre-existing files owned by other sessions.
- [ ] Screenshots on :3050 of In place, Split, Floor attached to the hand-back.
