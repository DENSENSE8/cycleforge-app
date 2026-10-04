# Mobile V2 architecture

V2 is the only live mobile presentation architecture. All `/m/*` routes mount
`MobileV2Shell`; feature chrome and phone-specific presentation live under
`src/components/mobile/v2`. Do not recreate `mobile/redesign`, a V1 shell, or a
second phone-only token system.

## Ownership

| Concern | Source of truth |
| --- | --- |
| App shell and scroll boundary | `MobileV2Shell.tsx` |
| Global application navigation | `MobileV2AppSwitcher.tsx` |
| Host top bar and contextual search | `MobileV2TopBar.tsx` |
| Record top bar | `MobileV2DetailTopBar.tsx` |
| Universal scan seat | `MobileV2ScanCta.tsx` |
| Allocate queue | `fulfillment/MobileV2FulfillmentOrders.tsx` |
| Scan history and detail | `scan/MobileV2ScanRecentList.tsx` + `MobileV2ScanRecentSheet.tsx` |
| Cross-platform scan row DTO | `src/lib/mobile/v2-scan-recent.ts` |
| Multi-photo capture root | `photos/MobileNativePhotoCapture.tsx` + `photos/MobileContinuousPhotoCamera.tsx` |
| Native capture adapter | `docs/mobile-first/swiftui/photos/` |

Shared business logic, queries, and API contracts remain outside the component
tree. V2 owns presentation; it does not fork fulfillment or receiving data.

## Photo capture contract

The PWA and SwiftUI implementations share capture facts and the existing
`POST /api/photos/upload` contract. The PWA offers a persistent `getUserMedia`
viewfinder, a one-shot operating-system camera fallback, and a multi-select
library input. SwiftUI uses one long-lived `AVCaptureSession` plus a fresh
`AVCapturePhotoSettings` for every shutter press. In both architectures each
photo remains an independent asset. Web hands the completed set to the existing
surface-specific upload queue; native writes and queues each shot immediately.
Neither architecture needs a second backend endpoint.

Do not treat `<input capture multiple>` as continuous capture. `capture` hands
control to the operating system and many mobile browsers return one file. Do
not build stage-specific camera components: stages provide `entityType`,
`entityId`, `photoType` and `photoAspect` to the shared capture root.

The capture chrome is one-handed and floats directly on live media: count at
top-left, close at top-right, gallery at bottom-left, an unlabeled visual
shutter with haptic feedback at bottom-center, and a green checkmark at
bottom-right. There is no bottom toolbar fill and no camera glyph inside the
shutter. Stream-capable browsers enter this multi-shot surface directly;
device-camera and library buttons are the high-contrast fallback.

## Bottom-sheet action law

An operational sheet has exactly three vertical owners: a non-sticky identity
header, one scrolling facts body, and a non-sticky `DetailDock
placement="sheet"` action floor. Never place a sticky dock inside a sheet body;
the nested sticky/scroll contexts can pin it to the wrong edge or clip it while
Radix measures the panel. The floor is floating buttons, never a bar (owner
2026-10-03): no ground fill, no `border-t`, `ACTION_DOCK_TOP_GAP` above and
`ACTION_DOCK_LIFT` below — the sheet is the only ground. Enforcement: ESLint
`cf-ui/no-grounded-bottom-bar` (a `sticky`/`fixed` + `bottom-0` class string with
a `bg-*` fill or `border-t` rule fails the lint, repo-wide).

The sheet floor orders hierarchy by consequence, not by DOM convenience:
secondary tools occupy a compact row above one full-width primary next-state
verb at the safe-area edge. Long-tail verbs are an in-sheet `•••` stage with
Back — never a second sheet over the first (D14 in V2_OBJECT_FIRST.md). Facts such as location, ownership,
and listing availability stay non-actionable in the scrolling body so the
operator never hunts vertically for execution. Object-first law, delete list
and Fitts budget: [V2_OBJECT_FIRST.md](./V2_OBJECT_FIRST.md).

## Scroll and stacking law

`MobileV2Shell` owns the only page scroll container. Shell chrome uses
`z-header`. Feature rows and filters must not create competing sticky stacking
contexts unless the job explicitly requires persistent controls.

Allocate's status pills use `MOBILE_V2_ALLOCATE_FILTER_BAR_CLASS`:
`sticky top-0 z-sticky isolate`. The old `z-content` was incorrect because it
created a peer stacking context with the transformed `z-content` row internals,
so rows could paint over the sticky band and make it appear to leave with the
table. `z-sticky` is above row content and below `z-header`; `isolate` contains
the filter band's children as one stacking unit.

## Record display law

Owner 2026-10-03, after the inbound screens shipped as flat, truncated,
column-by-column rows. Binding for every phone list of records.

- **Grouped cards, not rows.** A record (order, purchase order, carton, line)
  is a `MobileRecordCard` inside a `MobileRecordCardList`
  (`src/design-system/components/MobileRecordCard.tsx`). `MobileDataListRow`
  is for navigation and settings rows only.
- **Fixed hierarchy.** Identity (for example the order number) top-left, date
  top-right, the product title below the identity, count bottom-left, money
  bottom-right. Optional detail and label/value facts sit under the title; a
  short status word and the left rail carry the tone.
- **Nothing is truncated.** Text that identifies or describes a record wraps;
  it is never truncated, line-clamped, ellipsized or abbreviated ("Goodwill",
  not "GW"). Top-bar and app-switcher chrome titles (`MobileV2TopBar`,
  `MobileV2DetailTopBar`, `MobileV2AppSwitcher`) are the only exemption.
- **Drill in for lines.** Lines and details are not shown inline. The whole
  card is the tap target: a linked quick look opens a `MobileV2ActionSheet`,
  a primary record opens a route with `MobileV2DetailTopBar`, and either one is
  a scrollable detail for exact pinpointing.
- **Step progress for multi-step flows.** A flow such as importing orders
  shows `MobileStepProgress`
  (`src/design-system/components/MobileStepProgress.tsx`) at the top: one
  segment per step plus `Step N of M · <label>`; only completed steps are
  pressable, to jump back. Show only what the current step needs; what is
  already fine collapses into one summary line that can be opened
  (`Collapse`). The step's one primary verb is full-width in `DetailDock`, in
  the thumb zone, with 44px+ targets.
- **Stacking.** `MobileStepProgress` is in flow: it heads the step's content
  and scrolls with it inside the shell's scroll container, with no sticky band
  or z-index of its own. The verb that acts on the step persists in
  `DetailDock`, so nothing needed to act scrolls away.

Enforcement: ESLint `cf-mobile/no-truncated-record-text` in `eslint.config.mjs`
(the core `no-restricted-syntax` rule registered under its own name so it does
not override the shared declaration) errors on a `className` literal containing
`truncate`, `line-clamp-*` or `text-ellipsis` in `src/components/mobile` and
`src/app/m`. Files that already truncated are listed in
`MOBILE_RECORD_TRUNCATION_FROZEN_DEBT`; that list only shrinks. The design-MCP
preflight rule `mobile-v2-inbound` and the `mobile-surface` /
`mobile-v2-receiving` intents state the same law before any write.

## Scan recent-history contract

The V2 scan station is newest-first and top-down. The capture window stays at
the bottom; history does not reverse itself or force-scroll to a focus row.
Each recent row answers: what, identifier, outcome, and when. A tap opens the
remaining facts and actions in a sheet.

`MobileV2ScanRecent` is intentionally a flat `Identifiable` contract:

- `id`, `title`, `identifier`
- `outcome`, `tone`
- `imageUrl`, `occurredAt`
- `isLive`, `isLatest`

The SwiftUI reference in `docs/mobile-first/swiftui/MobileV2ScanRecentList.swift`
uses the same names and ordering. API adapters should decode into this contract;
they must not expose React ordering, animation, or scroll mechanics.

## Deleted compatibility architecture

- `src/components/mobile/redesign/`
- `MobileOrderManagement` and `AssignedOrders` pass-through roots
- the reversing `MobileStationShell`, `MobileStationTapeItem`, and V1 station
  entry sheet
- the orphaned `ItemCardRow` / `MicroListingTrigger` fork
- mobile-local `TOKENS`, `MobileCard`, `BentoItem`, and `GlassButton`

Routes import V2 roots directly. A missing V2 primitive is implemented and
proved under V2; it is not bridged through a compatibility directory.
