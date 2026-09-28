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
  - labels — `.mode-label`: industrial mono · uppercase · 10px · bold; triage sans · 12px · medium.
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
  Hint shown on `DeskRecordViewSwitch` and `DataTableFullscreenToggle` tooltips.
- Left nav column: `\` or `/` alone, ⌘/Ctrl + `\` or `/` (`src/lib/nav/sidebar-toggle-hotkey.ts`).

## Floor right rail

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

Foundation: `RecordGroup` (`src/design-system/components/record-ledger/RecordGroup.tsx`) — title
top-left in the label voice (sentence case in source), at most one action top-right; a lifted
rounded card in triage, a flush full-width band closed by one hairline on industrial (the Floor
rail). `OrderRecordView` composes it; the order number reads once, in the header
(`OrderRecordTitle`: number with copy / edit-link menu + ↗), used by To-ship ledger, cards and search.

| Column | Group | Holds |
|---|---|---|
| Left | Item(s) · state badge top-right | photo · title · SKU + item # · **Qty · Condition · Bin** on one line; Platform; Listing |
| Left | Fulfilment | Packed by · Scanned out by; **More details** (closed): Picked by, QC by, Pre-boxed, Pack bench, every bin, allocated, SKU home bin + set |
| Left | Notes | buyer note (read-only) + order note (autosaves) |
| Left | Documents | disclosure (Shipped / Search) |
| Left | Timeline | its own card, titled "Timeline" |
| Right | Customer | Name · Email (mailto + copy) · Phone (`tel:` + copy) · Bill to · Source — always open |
| Right | Shipping | Ship to (copy + map) · Carrier + status (Shipped) · Tracking # · Ship by · Ordered · label history (Shipped) |
| Right | Price | its own card: the `OrderPriceEvidence` disclosure (To-ship: "Price $132.52"). A desk with no `price` section (Exceptions) keeps the line's sale price on the item instead |
| Right | Conversation · More actions | thread disclosure; the ⋮ verb list |

Verified on :3050 2026-09-27: To-ship (triage + Floor rail) and Exceptions. The `shipped` section list (Carrier/Status, label history, Documents, Conversation) is not reachable from the Shipped desk, which opens its own package record — unverified in a browser.

Open against `VERIFY-order-record-triage.md`: Shipping's single **Edit** (rows still carry their own
✎), Fulfilment **Photos** CTA, the timeline's staff · date · time line and the raw-JSON diff fix.

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
| E. Scan-feedback consolidation | **partial 2026-09-27**: `RepairScanCompanion` (`vibrateRead`) and `useDataWipeController` (`playVerdictCue`, shared AudioContext) route through `src/lib/scan-feedback/play.ts`; their lint burn-down entries removed. Open (owner): `useScanFeedback` still reads the `receiving` settings bucket, and those two surfaces fire without the staff toggles — gating them changes behaviour (haptics default off) and moving the keys needs a settings migration | lint + two stations |
| F. design-mcp law | open | — |

## Owner decisions needed

1. ~~Phase 3 reach~~ — answered 2026-09-27: the way out follows where the record sits — inline → Back
   top-left; right rail / side pane / centred card → ✕ top-right.
2. ~~Phase 6~~ — superseded 2026-09-27: Floor HAS a right rail (details of the selection).
   Still open: should the triage full-width order facts (Platform, Tracking, Ship by, note) move
   under the items instead of the aside?
3. Phones: keep triage → industrial collapse on `/m/*`, or should `/m` triage pages stay triage?
