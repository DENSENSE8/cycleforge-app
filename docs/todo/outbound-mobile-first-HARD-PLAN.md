# Outbound mobile-first consolidation — hard plan

**Status:** active  
**Machine law:** `src/lib/mobile/mobile-first-surface.ts`  
**Human law:** `docs/mobile-first/SURFACE_LAW.md`  
**Canonical mobile orders door:** `/m/orders`  
**Desktop projection:** `/shipping/orders`  
**Reference image:** `/tmp/codex-clipboard-a656b321-d796-4f15-aca4-77de67ce56bb.png`

**Current scope:** Orders, Picks, Packing, Shipping & packing, and their
desktop Outbound projections. FBA is not an active migration cohort in this
increment; do not expand this work into FBA surfaces.

## Definition of done

- `/m/orders` exposes the governed, top-level WMS views **All**, **Must go
  today**, **Urgent**, **Blocked**, **Exceptions**, **Ready to pack**, and
  **Packed**. These are first-level queue tabs derived from shared Outbound
  workflow facts; they are not page-local status aliases or nested filters.
- `/m/orders` is a read, search, filter, and triage surface. It renders no
  execution CTA named **Pick** or **Pack** in a row, selection strip, empty
  state, detail sheet, or responsive variant.
- Every connected order platform is selectable through the URL-controlled
  **Connected platform** filter; it is a shared domain refinement over
  `accountSource`, not a hand-authored page label.
- Scan-critical quantity, SKU/order identity, target location, condition, and
  typed triage controls live on the governed row. The opened order sheet is an
  administrative/documentation drawer only: labels/slips, order details,
  listing administration, and assignment context. It contains no
  quantity/identifier block, hold control, or triage action.
- Non-urgent SLAs never paint a minute-level countdown. A precise remaining
  clock is reserved for a same-day deadline or warning/danger urgency; future
  work paints a muted civil date (for example, `Sep 22`) or an equally calm
  day-level label. Date-only backend fields never become a fabricated clock.
- The row never relies on the administrative sheet for SKU or order identity.
  Its title owns Row 2; the scan-critical `sku: <value>` remains permanently
  visible as muted monospace metadata in the Row 3 trust block, beside the
  governed condition, canonical sale price, and marketplace chain trigger. It
  is tertiary—not hidden and not title-weight.
- Canonical sale price is required on tactical Orders, Pick, and Packing rows
  when the backend projects a valid amount. It occupies the Row 3 trust block
  through the shared price formatter and semantic `price` role; an absent amount
  paints nothing. Price is not an action and never occupies the quantity rail.
- Condition is a governed, square micro-badge (`[USED]`, or a defined grade)
  on Row 3, horizontally paired with the canonical `BIN: <location>`
  breadcrumb when a location is known. It is never a loose, unstyled word.
- The right edge is one continuous quantity/verification pillar: expected
  quantity at its top and server-derived pick ratio beneath it. A marketplace
  verification link is permitted only as `MicroListingTrigger`: a subdued
  24px SKU-adjacent micro-target, never a detached tile or an occupant of the
  quantity rail. It opens a context-preserving Dialog inspection overlay—never
  a route, browser window, or redirect—and closing it returns to the same row.
  Row tap remains the single physical-work selection door, while an active
  target owns its explicit typed workflow controls.
- Account-specific marketplace triage is a closed command vocabulary
  (`OUTBOUND_CHANNEL_TRIAGE_ACTIONS`): `Halt eBay listing` and `Zero Amazon
  inventory`. It may be exposed only after a canonical provider mutation is
  present and verified for the connected account; a client-side status toggle
  or browser redirect is never an acceptable substitute for that mutation.
- Every governed mobile row paints exactly one semantic 4px state spine on its
  left (`ready`, `exception`, or `packed`) and one full-width
  `border-border-hairline` separator at its bottom. No partial underline,
  palette literal, or per-page border construction is allowed.
- Pick/Pack execution belongs to the mobile Picks workflow under `/m/pick` and
  `/m/pick/[orderId]`. A desktop or station Pick/Pack control is not complete
  until the equivalent phone action exists there and consumes the same typed
  workflow action.
- `/m/pack` is the canonical phone door for packing history and required photo
  evidence. A completed pick opens the phone pack-start route, which resumes or
  creates a `CAPTURING` evidence parent, waits for durable uploads, verifies the
  evidence set, and atomically promotes that same record to `COMPLETED` / a
  real `PACKED` fact. It never performs carrier handoff; dock scan-out alone
  owns `SHIPPED`.
- Route-level browser coverage at `http://localhost:3050` must prove every
  governed Orders tab and the connected-platform refinement is visible, and
  that neither the Orders queue nor its opened detail sheet exposes a Pick/Pack
  CTA. Picks coverage must prove the corresponding execution action remains
  reachable from `/m/pick`.
- These acceptance criteria are part of the outbound-workflow cohort and must
  pass independently of the model, agent, or harness that authored the change.
  Its raw-style check is TypeScript-AST inspection of executable class-bearing
  positions—not a whole-file regex—so comments, documentation, and the
  required swipe `MotionValue` cannot create a false design-system violation.

### Mobile Orders tactical-display addendum

The following three responsibilities are fixed. They extend the Orders
definition above; they do not reopen Pick/Pack execution on `/m/orders` or
create a second phone shell.

#### Authoritative data mapping

| UI fact | Canonical backend source | Required projection and treatment |
|---|---|---|
| SLA countdown | `work_assignments.deadline_at` (the existing `deadline_at` projection; `orders.ship_by_date` is date-only fallback data) | Top-right, tabular/mono countdown. `text-text-warning` below 60 minutes and `text-text-danger` below 15 minutes. Never fabricate an exact time from a date-only value; paint **No SLA assigned** as explicit missing data. |
| Scan identity | `orders.sku`, falling back to `orders.item_number`; `orders.order_id` remains the order reference | Row 2, primary machine identity in the governed mono role above the human product title. |
| Product image | `sku_catalog.image_url` through the canonical SKU-identity join | Default queue: strict 48px square `ItemRecordThumb`; missing image: the shared generic-part placeholder, never blank space. A press reveals a motion-driven inspection surface without navigation. |
| Storage path | allocated `serial_units.current_location` resolved through `locations` (`barcode`, `name`, `room`, `row_label`, `col_label`, parent `zone_letter`) | Mid-left breadcrumb generated by one React-free formatter, e.g. `ZONE-B // AISLE-04 // BIN-S4`. Multiple allocated locations must be represented honestly; no arbitrary first-unit guess. |
| Pick progress | `order_unit_allocations` live allocation/pick states over `orders.quantity` | Right-pinned high-contrast quantity target across Rows 2–3, with `PICKED: n / total` verification underneath. Counts are server-derived facts, never inferred from rendered cards. |
| Handling warnings | A governed Outbound handling-facts field/relationship (to be added; no canonical Hazmat/Oversized/Two-person field exists today) | Full-width bottom banner using semantic warning/danger tokens. Until the schema exists, omit the banner rather than parse free-text notes. |
| State rail | `resolveOutboundWorkflowFacts` stage/exception verdict | Named 4px mobile state-rail role: ready=`accent/info`, exception=`danger/warning`, packed=`success`. No raw blue/orange/green palette classes. |

#### Layer 1 — persistent triage header

- Global Orders search and the governed WMS view tabs remain visible while the
  roster scrolls. Scan is intentionally a separate shared route, not a second
  in-page camera implementation.
- The horizontal control is the existing top-level tab contract (**Must go
  today**, **Exceptions**, **Blocked**, etc.). It performs the requested chip
  function without introducing a rounded-pill fork.
- Realtime is invisible infrastructure: use the shared invalidation adapter,
  but paint no Wi-Fi glyph, connection dot, **Live** label, or status chip.

#### Layer 2 — tactical roster

- The middle is the only scrolling region. Every row uses the authoritative
  mapping above, the flat `ItemCardRow`/item-record anatomy, square edges, no
  card shadow, and a minimum 44px target for every interactive control.
- Swipe-left reveals typed triage actions **Out of stock**, **Damaged**, and
  **Flag discrepancy** inline. Those actions must be discriminated workflow
  commands, not `ReactNode` slots, and must remain operable without swipe for
  keyboard/switch access.
- Palette is expressed only through semantic design tokens. Literal slate,
  red, green, amber, `#eef2f7`, and page-local colors fail the cohort.
- Every outbound row has one fixed three-row anatomy: **Row 1** begins with
  target location, then exact platform/order context, then SLA urgency;
  **Row 2** gives the product title left-side priority and the pinned quantity
  target the right; **Row 3** presents condition, canonical sale price, the
  chain-only listing trigger, tertiary monospace SKU, and governed operational
  flags.
- A row tap selects the active workflow target; it never navigates. The active
  target alone may expand its image from 48px to 80px and reveal the already
  typed inline workflow controls. Thumbnail press is a zero-navigation,
  reduced-motion-safe inspection overlay that dims but does not replace the
  current task context; release, cancel, or outside dismissal closes it.

**Row contract update (2026-09-17):** Row 1 always begins with `BIN: <path>`
(or explicit `BIN: Unassigned`), then platform/order context and SLA. Row 2
gives title priority, while the quantity/pick-status pillar spans Rows 2–3 on
the right. Row 3 carries condition, canonical price, a chain-only marketplace
inspection trigger, and a muted monospace SKU. The chain trigger preserves row
context in the governed overlay; it never redirects or opens a new tab.

#### Layer 3 — one governed scan door

- The only Orders scan action is the permanent shell-level **Scan** door. It
  opens the shared `/m/scan` identification kernel; Orders must not mount an
  in-page camera sheet, a second scanner, or a competing **Scan order** CTA.
- The shared scan surface owns its named reduced-motion-safe press role and
  square scan-window contract. Inline `whileTap`, stiffness, damping, or
  page-local spring physics fail the cohort.
- This intentionally adjudicates the earlier camera-sheet proposal: retaining
  one scanner is safer than preserving visible roster context at the cost of a
  second capture implementation.

#### Tactical-display acceptance evidence

- A fixture and live-data audit prove SKU, quantity, storage path, pick ratio,
  image identity, handling facts (when present), and SLA truthfulness for every
  rendered row; missing data is explicit and never guessed.
- Playwright at `http://localhost:3050` proves search and WMS tabs remain
  visible at 100% roster scroll. Realtime is deliberately invisible
  infrastructure: no connection-status UI is required or permitted.
- Interaction tests prove all interactive targets are at least 44px and every
  manual override / scan commit uses the named press-depth role with a reduced-
  motion fallback.
- Realtime uses the repository-wide adapter and invalidation contract. The
  current authority is Ably—not a direct browser-to-Neon connection. Measure
  **event receipt to painted row under 150ms** and record p95 evidence; adopting
  `uWebSockets.js` requires replacing the shared adapter behind that contract,
  never a page-local socket or an unverified transport claim.
- The outbound-workflow cohort owns these assertions so CI, MCP, tests, and
  agent harnesses receive the same versioned verdict.

This plan continues the existing mobile-first and design-system program. It
does not create a terminal theme, a second table engine, or a mobile component
tree embedded inside the desktop table.

## Architectural boundary

- One React-free Outbound workflow contract owns stages, route ownership,
  state names, action capabilities, and sanctioned gaps.
- Mobile owns the operable job path and renders cards, rows, sheets, and
  thumb-zone actions.
- Desktop consumes the same facts and renders the canonical `DataTable` plus
  governed desk chrome.
- Stations consume the same facts and callbacks through station hosts.
- Presentation components are surface-specific. Behavioral law is shared.

## Phase 0 — remove the route/model fork

- [x] Ratify `/m/orders` as the canonical Outbound orders door.
- [x] Keep `/m/work` as a compatibility alias with no nav row.
- [x] Make both routes mount `RedesignedMobileAssignedOrders` /
  `MobileToShipQueue`.
- [x] Reduce `MobileOrderManagement` to an import-safe compatibility export;
  remove its independent query, filters, due-date rules, and row renderer.
- [x] Bind mobile nav labels and paths to `OUTBOUND_WORKFLOW_SURFACES`.
- [x] Put the stage ledger behind the existing mobile-first CLI/MCP gate.
- [x] Establish one flat industrial item-row shell for Orders, Picks, and
  Shipping: square edges, no elevation, hairline separation.
- [x] Capture `/m/orders` at phone width through `http://localhost:3050`
  (`docs/eval/cohorts/outbound-workflow/screenshots/m-orders-mobile.png`,
  390×844).
- [x] Verify route parity for `/m/orders` and `/m/work` query parameters
  (`tests/e2e/mobile-orders-route-parity.spec.ts`).
- [x] Port the route-backed `/m/orders/[orderId]` documentation face from
  palette/gradient/rounded-shadow chrome onto semantic surfaces and canonical
  Button/IconButton primitives. It remains a documentation exit with no Pick
  or Pack action; `mobile-order-detail.spec.ts` proves the rendered detail.

Exit: one mobile order queue, one navigation door, no second status machine.

## Phase 1 — extract the shared workflow facts

- [x] Inventory every status/facet/action derived in `MobileToShipQueue`,
  `DashboardOrdersView`, and the desktop row adapters.
- [x] Compose pure stage, deadline, blocked, scan-out readiness, and next-step
  facts in `src/lib/shipping/outbound-workflow-facts.ts`; keep lifecycle
  precedence and next-step vocabulary in their existing laws.
- [x] Move remaining exception and capability
  derivation into React-free `src/lib/shipping/**` modules.
- [x] Define stable discriminated action facts for pick, pack, hold, clear
  hold, stage, label, and scan-out. No `ReactNode` escape valves.
- [x] Make the mobile row and desktop status adapter consume the shared facts.
- [x] Add parity fixtures proving the same order receives the same stage,
  deadline band, blocked/readiness state, and next step on both surfaces.
- [x] Allow one queue→task route transition, then keep exception correction,
  quantity, barcode, and retry inside the active task surface.
- [x] Keep page-specific sorting and layout out of the shared domain module.

The former packed/staged compatibility seam is closed: the action matrix reads
the append-only `DOCK_STAGED` station event. `PACKED_STAGED` remains legacy
lifecycle vocabulary only; it is not proof that scan-out is permitted.

Exit: one order produces one workflow verdict regardless of renderer or agent.

## Phase 2 — complete the mobile Outbound lane

- [x] Make `/m/orders` a WMS queue with governed top-level views: All, Must go
  today, Urgent, Blocked, Exceptions, Ready to pack, and Packed. Derive the
  views from the shared deadline/lifecycle facts, not renderer-local labels.
- [x] Keep Pick/Pack execution CTAs off `/m/orders`; those actions live in the
  mobile pick workflow, while Orders remains a read/triage surface.
- [x] Add a mobile exceptions queue and resolution path.
- [x] Add a mobile shortage/unallocated queue linked to pick allocation
  (`PickQueue.ShortfallBand` reads `/api/picking/list`, labels allocation
  blockers, and exposes the governed `/api/allocation/auto` reserve sweep).
- [x] Add shipped-history lookup (`/m/shipping/history`, backed by the
  canonical shipped-search query and linked from Shipping & packing).
- [x] Build rack/staging location scan as a phone-first verb (`/m/shipping/stage`
  queue → `/m/shipping/stage/[shipmentId]`, persisted as DOCK_STAGED metadata).
  **Browser evidence (2026-09-17):** `mobile-dock-staging.spec.ts` runs at a
  390px viewport against the `:3050` switchboard, verifies the controlled
  staging-location write, and confirms immediate handoff to
  `/m/shipping/scan-out`. Cache invalidation is deliberately backgrounded so a
  slow refresh cannot strand a worker after a successful physical rack scan.
- [x] Replace the inferred packed/staged state with the canonical `DOCK_STAGED`
  event in the shared workflow resolver, `/api/orders` projection, and mobile
  work-row adapter. Scan-out stays locked until that physical fact exists.
- [x] Build the staged carrier scan-out queue over the existing per-order
  `/m/id/scan-out/[orderId]` path.
- [x] Classify FBA work into phone-completable verbs before exposing parity
  claims (`OUTBOUND_FBA_VERBS`: plan, scan, verify/ready, bind label, close/send;
  all remain explicit gaps until their `/m` task paths exist).
- [x] Restore `/m/pack` as the governed Packing drawer door over the existing
  mobile history and photo-evidence surface.
  **Browser evidence (2026-09-17):** `mobile-packer-flow.spec.ts` now runs at
  a 390px viewport on the standard desktop Playwright engine. It opens a
  collapsed packing-history row into the governed documentation/evidence sheet
  and verifies the photo handoff without a Pick or Pack execution CTA.
- [x] Convert the shared CaptureStack packing-row face to a flat semantic record
  boundary (square edges, semantic press surface, no raw blue or card shadow)
  and add it to the outbound-workflow cohort.
- [x] Split packing from carrier handoff before exposing mobile pack
  confirmation. `POST /api/pack/ship` and the legacy packing-log mirror
  currently collapse PACKED/LABELED/SHIPPED and mark allocations shipped;
  packing must instead end at `PACKED`, while only the dock scan-out write may
  advance allocations and units to `SHIPPED`. Audit every mirror caller,
  inventory event, order status projection, ledger write, cache invalidation,
  and rollback path in one tenant transaction before changing the mobile stage
  ledger from `partial` to `live`.
  **Implemented and audited (2026-09-17):** `CAPTURING` is a durable,
  idempotently resumed evidence parent with no SAL, status, inventory, or cache
  side effect. The canonical finalizer locks and promotes it only after an
  attached primary photo is durable, then writes `PACKED` inventory/order/SAL
  facts. Completed-only filters protect Orders, packing history, order
  timelines, audit history, reporting, and shipped projections. The only
  `SHIPPED` allocation mirror is `/api/shipped/scan-out`; the mobile stage is
  now correctly `live`.
- [x] Keep the active Outbound ledger truthful: Orders, Picks, Packing,
  staging, and carrier scan-out are phone-completable before their desk or
  station projections claim completion. Never weaken the ledger to make a
  desktop feature appear complete.
  **Scope boundary (2026-09-17):** FBA remains explicitly excluded from this
  migration increment. Its entries stay in the repository-wide mobile-first
  ledger, but cannot block Orders, Shipping, or Packing completion here.
- [ ] Project canonical SLA, machine identity, SKU image, allocated storage
  path, pick-progress, handling, and state-rail facts into the flat Orders row.
  **Implemented:** SLA, machine identity, image, storage path, pick ratio, and
  a resolver-owned `ready` / `exception` / `packed` 4px semantic state rail.
  **Handling foundation authored (2026-09-17):** `sku_catalog.handling_flags`
  is a closed `hazmat | oversized | two_person_lift` product fact, validated by
  `outbound-handling-facts.ts`, catalog writes, the database constraint, and
  the outbound cohort. Orders projects it through the shared row face into
  full-width semantic warning strips. The migration must be applied and a
  populated fixture/live row audited before this checkbox is complete; never
  synthesize a banner from free-text notes.
- [x] Make search and WMS tabs the persistent Layer 1 while the tactical roster
  is the only scrolling region. Realtime continues through the shared adapter
  with no connection-health glyph, dot, label, or chip. Browser proof:
  `mobile-orders-route-parity.spec.ts` scrolls the roster to its end and
  asserts that both controls retain their viewport position.
- [x] Add accessible typed swipe-to-triage commands for Out of stock, Damaged,
  and Flag discrepancy without restoring a Pick/Pack execution action. The
  same closed command registry drives the 44px left-swipe rail and the
  accessible selected-order sheet; Damaged/Discrepancy persist as named flags.
- [x] Complete the row-first execution migration: the opened sheet is now
  documentation/administration only, and Out of stock, Place/Clear hold,
  Damaged, and Flag discrepancy are in the typed row swipe rail. **Pass pick**
  is a selected-row action using the dedicated picker-lane staff surface; it
  writes the canonical assignment API and does not re-enter the
  administrative sheet.
- [x] Keep the connected-platform URL filter in the Orders completion audit:
  it must derive options from canonical `accountSource`, preserve the platform
  query through tabs/search/sort, and have browser coverage for every source
  represented in the fixture. The fixture is deliberately source-agnostic:
  each asserted option comes from `accountSource`, not a hard-coded platform
  registry.
- [x] Preserve the one governed shell-level Scan door to `/m/scan`; do not add a
  roster-local camera host or **Scan order** CTA. The v25 outbound-workflow
  law checks the host-owned control and rejects local scanner/camera imports
  and competing CTA copy from the Orders queue.
- [x] Prove the tactical-display fixture, sticky Layer 1 and one-scan-door
  behavior (the earlier page-local camera sheet is rejected), 44px targets,
  semantic-token purity, and realtime event-to-paint p95 under 150ms in the
  outbound-workflow cohort.
  **Evidence (2026-09-17):** the browser fixture proves the
  location-first breadcrumb, distinct SKU, right-pinned quantity target, no
  marketplace row link, and 44px selected-row actions. The cohort rejects raw
  palette/radius/shadow utilities in executable AST class positions across its
  governed sources. `style={{ x }}` in `ItemCardRow` is the one documented
  MotionValue transform required for the typed swipe rail, not a paint-token
  escape. A live `:3050` audit also confirmed the seven WMS tabs, the connected
  platform filter, storage-first rows, SKU/quantity anchors, and calm future
  SLA dates on real Orders data. `outbound-realtime-paint-slo.spec.ts` now
  defines the 20-sample real-Ably receipt-to-mobile-row-paint harness behind
  its shared cache patch and an invisible versioned browser event—never a live
  status glyph or second transport. It passed at `http://localhost:3050` on
  the provisioned QA session (20 serial scan/cleanup samples; p95 ≤150ms;
  4.4-minute bounded run). The camera-sheet is intentionally rejected by the
  one-scan-door law. Do not claim the 150ms target from mocked or unrelated
  WebSocket tests.

Exit: every Shipping desk verb has a real `/m` completion path.

## Phase 3 — lift the desktop projection

- [x] Keep `OutboundOrdersDesk` and canonical `DataTable`; do not render phone
  cards in table cells.
- [x] Replace desktop-local status/facet derivation with Phase 1 selectors
  (`orders-queue/helpers.ts` consumes `resolveOutboundWorkflowFacts`).
- [x] Map the reference image’s Pending / To ship / Shipped / Exceptions views
  to governed workflow states, not page-local labels.
- [x] Preserve the shared sidebar and desk shell; do not copy the reference
  image’s standalone masthead.
- [x] Treat search, filters, fields, density, zoom, and fullscreen as DataTable
  chrome owned by the engine.
- [x] Implement batch actions through the governed action-bar contract only
  after the equivalent mobile verbs exist. The previously desk-only Urgent
  mutation is now a closed active-row command on `/m/orders`; the existing
  phone documentation, shortage, staging, and scan-out paths cover the other
  desk action categories without inventing a phone batch strip.
- [x] Keep FBA outside this migration increment. Its existing desk and mobile
  ledger entries are preserved, but no FBA surface, row, controller, or guard
  is changed while Orders, Shipping, Picks, and Packing are consolidated.

Exit: desktop is a dense view of the phone-owned workflow, not a parallel app.

## Phase 4 — station projection

- [x] Project the applicable workflow facts into existing station hosts: Pack
  consumes the canonical pack checklist and evidence policy; Scan-out consumes
  the canonical scan-out result/callback and invalidates the same outbound
  caches as phone. Pick and dock staging remain intentionally phone-first
  tasks; no duplicate station has been invented.
- [x] Use `StationComposerHost` and station-skin tokens for Scan-out; Pack keeps
  its existing `StationScanPaneHost` / Displays host. Do not create another
  scan bar or notes composer.
- [x] Keep wedge/hotkey affordances as station enhancements over the same
  actions available on mobile. Scan-out registers the shared wedge sink and
  restores focus to `StationComposerHost`; it does not introduce a station-only
  command.
- [x] Run the Pack and Scan-out station cohorts and compare workflow parity
  fixtures. Phone and desk staging share `/api/shipping/mark-staged`; phone and
  station packing share `OrderPackChecklist`; phone and station scan-out share
  canonical scan-out identity facts and the dock writer.

Exit: phone, desk, and station disagree only in density and input hardware.

## Phase 5 — harness and ratchet

- [x] Extend `ds_mobile_first` output with every new Outbound stage and gap
  (contract v1.3.0 includes staging, scan-out, and the classified FBA verbs).
- [x] Add an `outbound-workflow` eval cohort once Phase 1 fixtures exist
  (`pnpm run eval:cohort outbound-workflow` consumes the same versioned pure
  verdict as the CLI guard and Design MCP; ledger snapshots are committed under
  `docs/eval/cohorts/outbound-workflow/`).
- [x] Add screenshots for `/m/orders`, `/m/pick`, `/shipping/orders`, and the
  selected station at `http://localhost:3050` only. Evidence lives at
  `docs/eval/cohorts/outbound-workflow/screenshots/`; the desktop Orders and
  Scan-out station capture tests rewrite their evidence on successful runs.
- [x] Run the slot-table cohort after desktop table changes (`pnpm run
  eval:cohort slot-table` passed on 2026-09-17).
- [x] Run station evals after station changes (`pack` and `scan-out` passed on
  2026-09-17).
- [x] Run `pnpm verify:fast` and the fast eval command before every phase exit
  (both passed after the Phase 2 mobile-order/staging increment).
- [x] Tighten the active Orders / Shipping / Packing cohort guard only after
  every scoped face is migrated. **Evidence (2026-09-17):** v42's deterministic
  AST guard covers the mobile Orders shell/detail/rows, Pick session, Packing
  history and station feedback, Shipping filters/status and staff selection,
  plus the one sanctioned Scan verdict. The scoped raw utility audit is empty;
  its sole remaining hit is `PackFbaScanCard.tsx`, explicitly excluded from
  this increment.

## Reference-image adjudication

Adopt the image’s information architecture: queue states, searchable dense
orders, explicit pick/pack progress, exception visibility, and a batch-action
summary. Do not copy its standalone navigation shell, raw colors, or desktop-
only batch verbs. The bottom batch dock is allowed only after selection and
each batch action have mobile-completable equivalents and pass the action-bar
law.
