# Mode split inventory — routes, looks, and leaks (2026-09-27)

Phase 1 of the triage-vs-industrial split. Read-only census; no UI changed. Source: code read
2026-09-27 (file:line as of that day), re-verified against the working tree the same day.
Owner reviews this before any split work starts.

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
    in-page `SearchOrderLedger.tsx:110`, `LabelIntakeDesk.tsx:151`, `ReceivingLinesTable.tsx:656`,
    `ChatPrintJobCard.tsx:194` (triage inside `/ai-chat` assistant);
  - force industrial — `OutboundOrdersLedger.tsx:829` (note popover), `MobileOrderEvidenceSheet.tsx:139`.

## Route → look today

> **Superseded 2026-09-27 (governance Phase C).** Every route's mode is now declared in
> `src/lib/routing/mode-registry.ts` and applied once by `RouteModeRegion` (mounted in
> `AppShellSwitch`); the page-level regions in the "Declared at" column are gone and the "No
> region" rows below are triage (phones: industrial). `/shipping` stays `runtime` in its layout.
> The table is the 2026-09-27 census the registry was seeded from.

| Area | Routes | Look | Declared at |
|---|---|---|---|
| Shipping | `/shipping/orders`, `/shipped`, `/shortage`, `/exceptions`, `/fba`, `/label-intake`, `/scan-out` | **runtime**: industrial on Floor (⌘/Ctrl+Shift+F), else triage | `src/app/shipping/layout.tsx:47` |
| Home | `/` | triage | `src/app/page.tsx:9` |
| Inbound | `/incoming`, `/triage` | triage | `src/app/incoming/page.tsx:16`, `src/app/triage/page.tsx:12` |
| Inventory | `/inventory/stock`, `/inventory/sku-exceptions`, `/inventory?section=replenish` | triage | `InventoryDeskFrame.tsx:13,26` (`LEDGER_PATHS` + replenish only) |
| Pack | `/pack` | triage | `src/app/pack/page.tsx:10` |
| AI | `/ai-chat` | assistant | `src/app/ai-chat/page.tsx:14` |
| Kiosk | `/kiosk/v2` | counter | `KioskV2Runtime.tsx:51` |
| Mobile | `/m/scan`, `/m/orders`, `/m/work` | industrial | page / `AssignedOrders.tsx:23` |
| Mobile | `/m/pick`, `/m/pick/unassigned`, `/m/exceptions*`, `/m/orders/[id]*`, `/m/r/[id]*`, `/m/rs/[id]*`, `/m/u/[id]*`, `/m/qc/line/[id]`, `/m/pair/*`, `/m/fnsku/*`, `/m/loc/*`, `/m/shipping/shipments/*`, `/m/pack/start/[id]`, `/m/repair-scan*` | asks triage → **renders industrial** (phone collapse) | page, `DetailHubScreen.tsx:57`, or `DetailRecordFrame` (`RepairScanCompanion.tsx:183`, `RepairScanVisitInfo.tsx:14`) |
| **No region** | `/receiving`, `/receiving/history`, `/receiving/lines/[id]`, `/receiving/unfound/*`, `/unbox`, `/carton/[id]` | half-styled | — |
| **No region** | `/repair`, `/pickup`, `/packer`, `/tech`, `/test`, `/wipe`, `/support`, `/dashboard` | half-styled (`RepairRecordView.tsx:155` forces triage around the repair record only) | — |
| **No region** | every other `/inventory/*` (locations, holds, health, events, cycle-counts, bulk-allocate, units, graph, …) | half-styled | — |
| **No region** | `/settings` + all 28 `/settings/*` | half-styled | — |
| **No region** | `/warehouse*`, `/sourcing`, `/operations`, `/ops/photos`, `/products*`, `/search`, `/studio*`, `/walk-in`, `/tracking-exceptions`, `/calendar`, `/reports`, `/review`, `/replenish`, `/signals`, `/open-links`, `/onboarding*`, `/manuals*`, `/forge`, auth + redirect routes | half-styled (`/search` dossier nests triage) | — |
| **No region** | `/m/pick/[orderId]`, `/m/orders/new`, `/m/orders/sync`, `/m/pack`, `/m/home`, `/m/settings`, `/m/receiving/po/*`, `/m/id/*`, `/m/*/photos`, `/m/t/*`, `/m/h/*`, `/m/claim`, sign-in/enroll | half-styled (phone radius 0 + mono labels, no mode colours) | — |

**Only `/shipping` ever switches at runtime.** Every other desk is fixed. No layout above a
"No region" row mounts a region (`src/app/layout.tsx` only injects the mode registry style).

## Leaks — pieces that ignore the look

| Leak | Where | Hard-codes | Shows on |
|---|---|---|---|
| State badges (RDY · Ready, → Pick, alerts) | `.state-badge-*` (`packages/design-tokens/src/state.ts:68-71`) via `stateBadgeClass` (`src/design-system/tokens/industrial-record.ts:63`); `LifecycleCode.tsx:33` (rendered by `OrderRecordView.tsx:151`, `OutboundOrdersLedger.tsx:665,936`, `OrdersQueueFirstPaint.tsx:170`); direct callers `OrderRecordView.tsx:162`, `carton-record-sections.tsx:134`, `ReceivingStatusStrip.tsx:61`, `RepairRecordStatus.tsx:170` | solid fill, **no radius** → square in triage | `/shipping/*` records, `/incoming`, `/receiving`, `/repair`, `/dashboard?mode=repairs` |
| Square staff avatars | `StaffAvatar shape="square"`: `outbound-orders-ledger-editors.tsx:181`, `OrderAutoAssignSlot.tsx:66`, `AgendaRecord.tsx:159`, `SkuExceptionsLedger.tsx:281`; `IdentityMark.tsx:82` turns `square` into radius 0 + mono uppercase | square + mono initials | To-ship record + Floor, `/` agenda |
| Dashed square "unassigned" boxes | `outbound-orders-ledger-editors.tsx:183`, `OrderAutoAssignSlot.tsx:68` — `border-dashed` + `cornerClass('flush')` | radius 0 | To-ship record (Picked / Packed / QC / Scanned out rows) |
| Square search fields | `rounded-none` on `SearchField`: `StockLedger.tsx:257`, `DockedReceiptsLedger.tsx:144`, `IncomingDeliveriesLedger.tsx:352`, `SkuExceptionsLedger.tsx:151`, `DailyAgenda.tsx:350`; the primitive's own clear button `SearchField.tsx:289`; note `PopoverContent` `OutboundOrdersLedger.tsx:821` | radius 0 | `/inventory/stock`, `/inventory/sku-exceptions`, `/incoming`, `/incoming?lane=docked`, `/` |
| Mono uppercase labels outside `.mode-label` | `industrial-record.ts:79,88,93` (note badge, add-note, condition chip); `ReplenishmentNeedTable.tsx:193`; `RepairRecordStatus.tsx:137`; `DeskActionSlot.tsx:55` (+ flush corner `:57`); `CompoundCells.tsx:1264`; `outbound/ready/grid/cells/index.tsx:79` | mono · uppercase · tracking | Floor ledger, replenish, repair, inventory primary actions, compound table cells |
| Industrial record tokens on triage | `RECORD_ID_CLASS` + `RECORD_PRICE_CLASS`: `OrderRecordView.tsx:53-56`, `carton-record-sections.tsx:16-19`, `RepairRecordStatus.tsx:8-12`, `OrderPriceEvidence.tsx:9,11`, `OrderLabelEntries.tsx:20`. `RECORD_ID_CLASS` only: `order-record-sections.tsx:20`, `OrderAutoAssignRule.tsx:17`, `LinkLabelDialog.tsx:17`, `ResolveShipmentExceptionDialog.tsx:18`, `SkuExceptionCreateForm.tsx:18`, `SkuExceptionEvidenceSections.tsx:15`, `SkuExceptionPairSection.tsx:14`. `RECORD_RECESS_CLASS`: `outbound-orders-ledger-editors.tsx:56`, `receiving-order-composer-parts.tsx:12`. `RECORD_QTY_BADGE_CLASS`: `outbound-orders-ledger-editors.tsx:55`, `IndustrialRecord.tsx:11` | mono + recessed industrial borders | To-ship record + Floor, `/incoming`, `/repair`, `/shipped` resolve, SKU exceptions |
| Whole-surface industrial look | `src/features/label-intake/LabelIntakeLedger.tsx:57-58` (`CELL`, `MONO_MICRO`, square cells, inset strong border) | industrial regardless of mode | `/shipping/label-intake` |
| Forced triage inside Floor | `PaperworkWalkHost.tsx:58,65`; `RepairRecordView.tsx:155`; dialogs `LinkLabelDialog.tsx:108`, `OrderLabelEntries.tsx:275`, `ResolveShipmentExceptionDialog.tsx:107` | `ModeRegion mode="triage"` | Paperwork walk / label + ticket dialogs opened from Floor drop to triage |

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
- **In place / Split: no key.** `DeskRecordViewSwitch` and `DataTableFullscreenToggle.tsx:69` are
  click-only.
- Left nav column: `\` or `/` alone, ⌘/Ctrl + `\` or `/` (`src/lib/nav/sidebar-toggle-hotkey.ts`).

## Floor right rail today

Floor (`OutboundOrdersLedger` under `useDeskFloorActive`) mounts **no** right-rail occupant —
records open in `DeskRecordPlane`, verbs in the header (`OrdersMorphingHost`). Floor also parks the
left column and the context rail. `RightRailHost` stays mounted but empty
(`DesktopRouteShell.tsx`). The triage record's right-hand column (`DeskRecordLayout` aside:
Platform · Order # · Tracking · Ship by · note · More actions) is the "status on the right" the
owner sees in the non-industrial full view. Since 2026-09-26 that aside ends with **More actions**
(`OrderRecordView.tsx:288-320`, `order-record-more-actions`) below the details.

## Finding → phase

| Phase | Fixes | Blast radius |
|---|---|---|
| 2. Badges + avatars follow the look | **done 2026-09-27** (`HANDOFF-mode-governance.md` Phase A): `.state-badge-*` carries `border-radius: var(--mode-radius-control)` (`state.ts`); `IdentityMark` / `StaffAvatar` `shape` removed → `face="round" \| "record"`, record face = `rounded-mode-control` + label-voice font/case; empty slots share `UNASSIGNED_MARK_CLASS` (`outbound-orders-ledger-editors.tsx`) | token-level; every triage record at once, Floor unchanged |
| 3. Record header | Back top-left, no ✕, drop repeated product subtitle | all `DeskStageRecordHeader` callers above — confirm overlays too |
| ~~4. Actions row under the order number~~ | **superseded** — owner 2026-09-26 (`HANDOFF-desk-record-actions.md:19-24`): top strip stays above the list as quick triage only (Report out of stock · Mark urgent · Mark scanned out · Select · ⋮); other verbs landed as More actions below the details | done |
| 5. In place / Split keys | bind in `DeskPageChrome` next to the Floor chord; show on `DeskRecordViewSwitch` tooltips | every desk with a record plane |
| ~~6. Floor right rail~~ | **cancelled** — owner 2026-09-26: "no right rail, no split actions bar, no duplicates" (`HANDOFF-desk-record-actions.md:21`) | — |
| later | give every "No region" row above a region (settings, receiving, repair, inventory tools, /m tools); search-field / mono-label / label-intake leaks | per area |

## Owner decisions needed

1. Phase 3 reach: Back / no-✕ on every record AND every overlay plane (revoke, deactivate, …), or
   records only?
2. ~~Phase 6~~ cancelled by the owner (no right rail). Still open only if the triage full-width
   order facts (Platform, Tracking, Ship by, note) should move under the items instead of the aside.
3. Phones: keep triage → industrial collapse on `/m/*`, or should `/m` triage pages stay triage?
