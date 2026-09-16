# Handoff: kill the status overlay, ship a carrier tracking history PAGE

**Product:** CycleForge (B2B warehouse OS). USAV is the first dogfood tenant only — never frame this as an internal USAV tool.

**Worktree:** `~/Projects/cycleforge-lanes/prod` (serves `:3077`). Do not start or stop servers; the operator owns `pnpm lane up/down`. Do not create a git branch.

**Layer:** ONE read-only surface — carrier tracking history — plus the demolition of the overlay that currently pretends to be it. Not carrier integrations. Not the DataTable engine. Not order editing.

**Status (2026-09-13):** Nothing of this feature is built. The overlay named below exists and the operator has ruled it out. A sibling agent has the receiving-grid tree mid-refactor; the lane does not compile until they finish (see Blockers).

---

## 1. The operator ruling

> "This overlay within the design system must be completely removed and destroyed because the exceptions overlay is just a bad UX and UI pattern in general."

`OrderStatusTrailOverlay` is deleted, not restyled. It fails twice over:

1. **Wrong container.** It mounts `DeskStageOverlay fill="inset"` — a floating card that dims the table behind it. A carrier history is a *destination you read and scroll*, not a modal you dismiss. No carrier ships it this way.
2. **Wrong content.** See [`01-current-desktop-status-overlay.png`](./01-current-desktop-status-overlay.png): it opened on `Exception · 01-15109-14476`, tracking `9434608106244492316783`, and painted an **ACTIVITY** heading over three skeleton rows. Forever. That tracking number is USPS, USPS has no live integration, so the event log is empty and the overlay has nothing to say — and says it with a loading state, which reads as "broken app" rather than "we cannot see this carrier yet".

---

## 2. The industry standard (and why inline is not it)

The operator's own instinct is right: **inline is not the long-term answer.** Every carrier and every mature logistics UI converges on the same shape:

> **A URL-addressable tracking detail PAGE: sticky summary header + one-column, reverse-chronological vertical timeline that scrolls.**

UPS, FedEx, USPS, Amazon, Shopify's shop-tracking, AfterShip, Route — all the same. The convergence is not fashion, it is four properties an overlay cannot have:

| Property | Page | Overlay / inline row |
|---|---|---|
| Deep-linkable, pasteable into Slack or a ticket | yes | no |
| Browser Back / history / refresh survives it | yes | no |
| Unbounded scroll length (a 40-event UPS trail) | yes | fights the table's own scroll |
| Readable at 390 px without a second layout | yes | inline in a 12-column grid: no |

**An expanded inline row is the wrong unit** because a tracking history is not a property of a table row — it is a property of a *shipment*, and one shipment can be linked to several orders and to a receiving PO (`shipment_links`, owner types `RECEIVING | ORDER`). Inline forces you to re-render the same history under every owner. A route keyed by shipment renders it once.

### The canonical shape to port

```
┌─────────────────────────────┐
│ ←  1Z999AA10123456784       │  sticky header: back, tracking (tap = copy)
│    UPS · Delivered          │  carrier + resolved status
│    Mon Sep 8, 2:14 PM       │  latest event time, absolute
│    Memphis, TN              │  latest location
│    [ Open on ups.com ↗ ]    │  one escape hatch to the carrier
├─────────────────────────────┤
│ ● Delivered                 │  newest FIRST
│ │ Mon Sep 8 · 2:14 PM       │  one column, one event per block:
│ │ Memphis, TN               │  category · when · where · who
│ │ Signed by M GARISEK       │
│ ○ Out for delivery          │  spine connects the dots; completed
│ │ Mon Sep 8 · 6:02 AM       │  steps filled, current step emphasised
│ │ Memphis, TN               │
│ ○ Arrived at facility       │
│ │ Sun Sep 7 · 11:48 PM      │
└─────────────────────────────┘
```

Rules that make it feel like a carrier page rather than a log dump:

1. **Newest first.** Operators open this to answer "where is it *now*", not "what happened first".
2. **One event per block, four facts max** — category, timestamp, location, actor/exception. Never the raw carrier code as the headline; the code belongs in a collapsed "raw" affordance at most.
3. **Absolute dates, not "3 days ago".** A relative stamp is unusable when an operator is reconciling against a carrier's own page. Relative time may be a *secondary* line.
4. **Day grouping** when the trail spans days — the repo's `EventTimeline` already bands.
5. **The empty state is the feature.** With 8,000+ shipments holding zero events, the page renders empty far more often than full. It must say *why*, not spin. See §4.
6. **No dismiss gesture is required to keep reading.** Back exits; nothing else does.

### Where the bottom sheet belongs

The operator described: mobile row tap → bottom sheet → tap tracking status → full page. Keep that, with one correction — **the sheet is a verb chooser, never the terminal surface.** A history inside a sheet re-creates the overlay's bug at 390 px: a scroll trap inside a drag-to-dismiss container, where a downward swipe ambiguously means "scroll" or "close".

```
row tap ──► BottomSheet (existing CompoundRowDetailSheet)
             ├─ facts (already there)
             └─ "Tracking status  ↗"  ──► push /m/t/<shipmentId>   (full page)
```

That is standard progressive disclosure: **L0 glance** (the row's status pill) → **L1 choose** (sheet of verbs) → **L2 commit** (a page). Each tier is one tap, each tier is escapable, and only L2 scrolls.

### Desktop

Same route, same component, wider measure — not a second implementation. The status pill becomes a real `<a href>`, which buys middle-click, copy-link, and Back for free. If the operator later wants it beside the table rather than over it, the answer is a two-pane *layout* around the same route, never a modal.

---

## 3. Mobile-first mapping (build in this order)

Design the 390 px column first; desktop is the same column with a wider measure and a back-link instead of a back-chevron.

| Tier | Surface | Content | Exit |
|---|---|---|---|
| L0 | Table row status pill | resolved category + carrier, ≤ 2 lines | — |
| L1 | `BottomSheet` (`forceVariant="sheet"`, `compact`) | existing row facts + **Tracking status** row | swipe / backdrop |
| L2 | Route `/m/t/[shipmentId]` | sticky summary + scrolling timeline | Back |

Thumb-zone law for L2: back control top-left (reachable by neither thumb — deliberate, it is not destructive), the carrier escape-hatch button in the bottom third, timeline scrolling between. No floating action button over a scrolling list.

Route precedent in this repo — single-letter record segments under `src/app/m/(shell)/`: `/m/u/[id]`, `/m/r/[id]`, `/m/h/[id]`, `/m/rs/[id]`. Follow it: **`/m/t/[shipmentId]`**. Desktop: `/shipping/tracking/[shipmentId]`. Key by `shipping_tracking_numbers.id`, **not** by order — one shipment, one page, however many owners link to it.

---

## 4. Provenance: the empty state IS the product

Measured on the lane DB today:

| carrier | shipments | zero events | avg events |
|---|---|---|---|
| USPS | 5,888 | **5,886** | 0.0 |
| FEDEX | 2,185 | 1,095 | 5.8 |
| UPS | 1,790 | 413 | 8.2 |
| UNKNOWN | 1,202 | 1,201 | 0.0 |
| AMAZON / DHL / LOCAL / GSO / GOFO | 105 | 104 | ~0 |

A timeline that renders skeletons for 8,600 of 11,170 shipments is worse than no feature. Each empty case has a *different* true sentence, and the page must print the right one:

- `USPS` → **"USPS tracking integration is pending credentials."** Not a spinner.
- carrier with no provider (`AMAZON`, `DHL_EXPRESS`, `GSO`, `LOCAL`, `GOFO`) → **"No tracking integration for AMAZON yet."** Offer the carrier link.
- `UNKNOWN` → **"This barcode does not match a carrier we recognise."**
- named + supported + no events yet → **"No carrier scans yet."** (genuinely early)
- named + supported + events stale → show the trail **and** "last checked Sep 9".

This is the `resolveTrackingFace` provenance resolver from the carrier-trust plan (step 2, not built). **Do not inline a private copy of that logic in this page.** If it is not landed when you start, define the enum and a single `resolveTrackingFace()` in `src/lib/shipping/` and have the page consume only that — one derivation, so the page and the desk pill can never disagree. That law was already violated once here: a delivered package painted "Out for delivery" for a month because a surface read `latest_status_category` raw.

---

## 5. Reuse these — do NOT build a second one

| Need | Use | Path |
|---|---|---|
| Timeline display, day bands, glyphs | `EventTimeline` / `TimelineSection` | `src/components/ui/EventTimeline.tsx`, `src/components/ui/TimelineSection.tsx` |
| Carrier events → timeline items | `carrierEventsToTimeline` | `src/lib/timeline/carrier-events.ts` |
| Timeline fetch | `orderTimelineQuery` | `src/lib/queries/order-timeline-query.ts` (may need a shipment-keyed sibling) |
| Mobile sheet | `BottomSheet` | `src/components/ui/BottomSheet.tsx` |
| Row → sheet on `/m` | `CompoundRowDetailHost` (switches on `pathname.startsWith('/m')`) | `src/components/tables/compound/CompoundRowDetailHost.tsx` |
| Carrier + status face | `resolveStoredCarrier`, `shipmentStatusCategoryFace` | `src/lib/shipping/carrier-resolution.ts`, `src/lib/order-lifecycle.ts` |
| Carrier deep link | `resolveTrackingOpenUrl` | `src/lib/tracking-format.ts` |

Event data — `shipment_tracking_events`, indexed `(shipment_id, event_occurred_at DESC)`: `normalized_status_category`, `external_status_label`, `external_status_description`, `event_occurred_at`, `event_recorded_at`, `event_city/state/postal_code/country_code`, `signed_by`, `exception_code`, `exception_description`, `payload`. Every fact the carrier-page shape needs is already stored. **Never call a carrier API during a render** — the page reads the log; the poller fills it.

---

## 6. Demolition list

Delete `src/components/orders/OrderStatusTrailOverlay.tsx` and every mount. Clean cutover — no alias, no deprecated re-export, no feature flag:

- `src/components/unshipped/UnshippedTable.tsx`
- `src/components/shipped/DashboardShippedTable.tsx`
- `src/components/outbound/scan-out/StagedQueueTable.tsx`
- `src/features/review/ReviewPackingTable.tsx`
- `src/features/review/pairing/ReviewPairingTable.tsx`
- `src/components/dashboard/orders-queue/OrdersQueueTableRow.tsx` — `useOrderStatusTrail()` and the `onStateOpen` wiring
- `src/components/tables/compound/CompoundGridCell.tsx` — `onStateOpen` param
- `src/components/tables/compound/CompoundCells.tsx` — `CompoundState`'s `onOpen`; the pill becomes a link

Note while you are there: that status open control has **no `data-testid`**, so no e2e can target it today. The replacement link must have one.

`OrderStatusTrailStage` also provides the `relative` positioning box that `PaperworkWalkHost` depends on (see the comment block in `UnshippedTable.tsx` ~line 862). **Do not delete the positioned wrapper** — only the overlay and its context. Read that comment before cutting; it encodes Center Lock behaviour.

---

## 7. Laws you must obey

- **Consult the design system before any `src/**/*.{tsx,jsx,css}` write:** `ds_contract` → `ds_tokens` → `ds_critique` (or `node tools/design-mcp/ds.mjs …`). On Claude Code this is a rule, not a gate — follow it anyway. `ds_contract "mobile bottom sheet opened from a table row, then a full page timeline"` currently returns no curated mobile-sheet law; add one to `src/design-system/pinned.json` if you establish the pattern.
- **Code graph before shared edits:** `find_symbol` → `impact_analysis` on `CompoundState`, `CompoundGridCell`, `OrdersQueueTableRow`. Blast radius is cohort-wide.
- **Center Lock (Q5)** governs desk record *editing* (`docs/warehouse-os/PLAN-center-lock.md`): forbidden on desks are `RightRailHost detail:*`, a new `DeskRecordWalkHost`, and Dialog-as-record-plane. A read-only carrier history at its own route is none of those — but state that reconciliation explicitly in your PR body, because Q5 is why the overlay was built. The operator has overruled the overlay; do not re-derive it.
- **One table engine:** the status cell stays a slot the engine paints. No per-family row component, no new `TableId`, no second grid.
- **Every painted DATA header stays click-to-sort.** Do not touch `sortable`.

---

## 8. Acceptance

1. `OrderStatusTrailOverlay.tsx` is gone; `grep -r "OrderStatusTrail" src` returns only the positioned-wrapper rename, if any.
2. `/m/t/<shipmentId>` renders at 390×844: sticky summary, newest-first one-column timeline, Back returns to the queue with scroll position intact.
3. Desktop `/shipping/tracking/<shipmentId>` renders the same component; the status pill is an `<a href>` with a `data-testid`.
4. Mobile row tap → sheet → **Tracking status** → page. Three taps, each escapable.
5. All five empty-state sentences in §4 render from `resolveTrackingFace`, with a fixture per case. **A skeleton must never be the terminal state.**
6. A 40-event UPS trail scrolls without nesting scroll containers.
7. Unit tests: the event→timeline adapter and the provenance resolver, pure, no DB.
8. E2E at `390×844` (`--project=mobile`) covering the three-tap path and two empty states.

**Verification is serverless and fast:** `npx tsc -p tsconfig.json --noEmit`, the specific `node --import tsx --test` files, and `pnpm run eval:cohort slot-table` if you touch any compound cell. You do not declare done — `pnpm lane verify prod` does, and only the operator runs it.

Screenshots are required in the reply, into this folder: mobile queue, sheet, timeline page, and one empty state. Reuse `tests/shots.mjs` (`PW_BASE_URL=http://localhost:3077 node tests/shots.mjs <label> <routes>`).

---

## 9. Blockers and gotchas (read before you start)

1. **The lane does not compile.** `Export RECEIVING_GRID_COLUMNS doesn't exist in target module` — a sibling's in-flight receiving-grid refactor, 5 dirty files. Next paints a full-screen Build Error overlay. Do not fix their work. Strip it for screenshots: `page.evaluate(() => document.querySelectorAll('nextjs-portal').forEach(n => n.remove()))`.
2. **Cookie domain must be `localhost`, not `127.0.0.1`**, or every Playwright nav lands on `/signin`. Mint a session with the helper in `tests/shot.mjs`.
3. **`/m/work` first compile exceeds 90 s** in this lane. Use `timeout: 180_000` on the first `goto` or it fails as a false negative.
4. `pnpm run eval:cohort slot-table` currently returns `ok:false` / `tripwire:false` on the `SLOT_TABLE_KNOWN_DEBT` ratchet for `RECEIVING_/INCOMING_/TASKS_/IMPORT_EXCEPTION_GRID_COLUMNS`. Pre-existing, same sibling refactor. `verify:fast` is green — judge yourself on that plus a clean cohort *delta*.
5. `shipment-links.test.ts` needs `--import ./scripts/register-server-only-shim.cjs`. Bare `tsx --test` throws `server-only`. Not a regression.
6. Lane runs its own Neon branch, so freshness figures (`last_checked_at` max 2026-09-09) may reflect branch age, not production cron health.

## 10. Out of scope — name it, do not do it

Carrier-trust steps 2–5 (provenance resolver beyond what this page needs, the single registration door, detector gaps for short/concatenated `1Z`, replacing the `SYNC_ERROR` catch-all, USPS turn-on). Step 1 landed 2026-09-13: `carrier-resolution.ts`, the case-insensitive sync gate, `2026-09-13_carrier_token_uppercase.sql`, and a 1,002-row carrier backfill. If this page needs provenance and step 2 is absent, build **only** `resolveTrackingFace` and leave the rest.
