# Mobile V2 reference handoff — 2026-09-30

## Objective

Build and validate the mobile web application as the interaction reference.
Do not begin the SwiftUI, Android, or desktop ports until the mobile-web shell,
design grammar, fulfillment list, fulfillment detail, and one execution workflow
have passed validation rounds.

## Landed in this worktree

- `/m/*` now mounts `src/components/mobile/v2/MobileV2Shell.tsx`.
- The top-left four-squares control opens a solid compact popover anchored
  directly beneath the control, not a bottom sheet. It has no redundant
  heading, keeps Settings persistent, remembers three recent destinations,
  and morphs into Back without changing its 44px geometry.
- Root navigation has one Fulfillment tile. Its anchored drill-down exposes
  Allocate, Pick, Pack, Exceptions, and Scan out with live operational counts;
  the remaining top-level destinations stay in the root grid.
- The application switcher exposes Stock, Products, Allocate, Pick, Pack,
  Receiving, Stock adjustment, Print station, and Exceptions subject to permissions.
- `/m/orders` now renders a V2 fulfillment list using the existing order query
  boundary.
- Fulfillment uses one roughly 75px high-volume responsive row: full-bleed on mobile
  and a fixed 36rem queue at the desktop breakpoint. Its four compressed lines
  are status/platform/order/SLA, title, continued title, then unlabeled
  `quantity · condition · price · location` beside any assigned Picked/Packed
  staff-colour marks and the next workflow action. Missing locations remain the
  actionable literal `No location`; they are never replaced with `Online`.
  Prices always use success green, and multi-quantity orders use the shared
  warning tone plus the compact `×N` form.
  Ten live orders fit in a 390×844 viewport.
- Mobile route language is task-specific: the queue is `Allocate`; opening a
  record is `Fulfill`. The generic `Order management` label has been removed.
- Row status color is supplied by the same `UNSHIPPED_STATE_META` registry as
  the desktop queue. Picked/Packed identity comes from the shared
  `ItemRecordMobileStage`, including its staff `color_hex` contract. Unassigned
  Picked/Packed placeholders render nothing so they consume no row width.
- Marketplace item numbers are absent from the scanning surface. Tapping the
  platform opens a bottom sheet with the identifier and preferred external
  listing link.
- Mobile selection is long-press then tap; it has no persistent checkbox.
  Swiping left reveals View and Pick; swiping right reveals More. The same row
  gains an explicit selection rail at the desktop breakpoint.
- The queue displays 50 records per high-volume page and mounts 44px left/right
  pagination controls only when the filtered result needs more than one page.
- SLA, newest, location, platform, and quantity sorts are deterministic; the
  active ordering freezes while long-press selection is active. High-volume
  and comfortable density, active filter, sort, page, and scroll position are
  session-restored.
- Exact SLAs count down in minutes/hours near the threshold and compact to days
  beyond 48 hours. A left status/SLA rail plus semantic row rings distinguish
  new arrivals, remote changes, deadline escalation, and scan matches without
  adding another visible row.
- Realtime controls include Live/Updating/Offline state, per-filter changed
  counts, a `N new orders` return-to-top checkpoint, a `New since you last
  checked` divider, and a floating `Filter · row of total` scroll marker.
- `No location` is a compact repair action that enters the existing fulfillment
  workflow; no unsupported location mutation was invented in the queue.
- Scan is a permanent rounded 44px control at the top-right. New order moved
  into the existing filter strip so it consumes no separate toolbar row.
- Scan opened from Allocate now returns to `/m/orders?scan=…`, uses the existing
  backend search contract, highlights and centers the matching row, and exposes
  a clear one-tap exit. Unknown values produce an explicit no-match banner.
- Order search is contextual chrome rather than a permanent inline field. A
  visible 44px Search action beside the application launcher—or `⌘/Ctrl+K`—
  replaces the whole header with an autofocus search surface. Back clears the
  query and restores the launcher/title/scanner composition.
- At 390×844 the page has no document-level horizontal overflow. The scan and
  four-square controls have symmetrical four-pixel edge seats.
- Opening `/m/orders/13527` was validated against the existing order-detail API
  and route.

## Deleted

- `mobile/redesign/MobileShell.tsx`
- `mobile/redesign/MobileSidebarDrawer.tsx`
- `mobile/redesign/MobileAccountFooter.tsx` and its test
- `mobile/redesign/MobileTopBar.tsx`
- `mobile/redesign/MobileToShipQueue.tsx`
- `mobile/redesign/MobileToShipRow.tsx`
- `mobile/redesign/MobileToShipSheet.tsx`
- `mobile/redesign/MobileToShipPickerSheet.tsx`
- `mobile/redesign/to-ship-faces.tsx`
- Their stale boundary exemptions and pinned drawer/footer contracts

## Current compatibility seams

- `MobileActionSlot` remains temporarily because existing routes register their
  single contextual action through it. Its V2 face is now rounded.
- `MobileScanProvider` remains because the scan route registers its reset
  handler through that context. V2 renders its permanent scan seat top-right.
- `mobileRouteOwnsTopBar` remains until record pages migrate to the V2 record
  shell.
- `useToShipOrders` remains as the existing fulfillment data adapter. Move it
  into a platform-neutral feature/controller module after the list behavior is
  stable.

## Next deletion target

1. Replace the legacy `/m/orders/[orderId]` `DetailHubScreen` presentation with
   a V2 order record screen while preserving its API, documents, and actions.
2. Replace `DetailDock` on that route with the V2 square `WorkflowDock`.
3. Put non-workflow record actions in rounded buttons or sheets.
4. Validate list → detail → documents → back at 375, 390, 768, and 1024 widths.
5. Delete the superseded order-detail visual components only after parity.

Stock is now present in the mobile launcher and `/m/stock` has searchable
room pills, compact records, record-detail navigation, 44px previous/next
pagination, and a sticky thumb-reachable Add photo action. Continue with
Products, Scan/Adjust, Print, Receiving, Pick, and Pack in that order.

## Design rules

- Normal buttons, fields, sheets, cards, and navigation controls are rounded.
- Only bottom execution actions such as Pick, Pack, Unbox, Receive, Adjust,
  Print, and Confirm are square and mounted edge-to-edge.
- Touch targets are at least 44px; the visible control does not have to be
  visually oversized.
- Horizontal scrolling is reserved for contextual pills and deliberate media
  strips. A short row swipe may reveal contextual actions, but records and
  page-width tables never require horizontal scrolling to read their facts.
- Mobile routes do not import desktop tables, sidebars, right rails, or split
  panes.
- Existing pages specify behavior, permissions, data, and error cases—not the
  V2 visual implementation.

## Verification

- Targeted V2 ESLint: pass.
- Repository-wide TypeScript passes on the current snapshot.
- `mobile-action-slot.test.ts`: 7/7 pass, including search-mode replacement
  and restoration.
- Latest `pnpm verify:fast`: all 11 gates pass.
- Full `pnpm verify` is still red because the concurrent desktop `DataTable`
  deletion is actively changing the worktree. During successive gate runs it
  removed the `fields` / saved-layout contract, then deleted more than thirty
  table-layout hook files while TypeScript had already indexed them. Do not
  treat that moving snapshot as a mobile regression or deploy it. The generated
  route-permission inventory was refreshed successfully with
  `pnpm audit-route-auth:emit`.
- Runtime checked through `http://localhost:3050` with the saved authenticated
  Playwright session at 390×844 and 900×844. The phone renders 50 of 70 rows on
  page one and 20 on page two, has zero document overflow, and shows a scanner.
  Listing sheet, long-press selection, swipe-revealed actions, and both page
  controls were exercised successfully. At 900px the same queue is 576px wide
  and its explicit selection rail is visible.
- The latest live 390×844 pass confirms `Allocate`, 50 rendered rows, ten
  visible rows, a roughly 75px first row, zero horizontal overflow, and no
  browser errors in the Allocate surface.
- Live stock verification confirms room-scoped results, detail navigation,
  quantity controls, and the sticky Add photo action. A shared `StopSlider`
  destructuring regression was repaired so the detail route no longer crashes.
- Contextual search was exercised against the live order feed: there is no
  search textbox in the default queue, the opened field autofocuses, an exact
  order reference narrows 70 records to one, Back restores the default bar,
  `Ctrl+K` reopens it, and the 390px viewport retains zero horizontal overflow.

## Non-goals for the next session

- Do not deploy while the desktop `DataTable` refactor is still deleting and
  migrating files. Once that refactor settles, rerun `pnpm verify`, deploy with
  the linked Vercel project, then smoke-test `/m/orders`, scan match, and
  `/m/stock/detail` against the production URL.
- Do not start SwiftUI or Android implementation.
- Do not delete business logic, API routes, permissions, query contracts,
  audit events, photo storage, scan parsing, or printer protocols.
- Do not modify unrelated dirty-worktree files.
