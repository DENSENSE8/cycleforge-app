# HANDOFF — Directed mobile pick, tote handoff, and pack (`/m/pick` → `/m/pack`)

Paste this whole file into a fresh session in `~/Projects/cycleforge-lanes/prod`. Read `AGENTS.md`
first. Nothing is committed (the tree also holds the uncommitted C-04 temp-SKU work from
`HANDOFF-sku-temp-intake-c04.md` — do not revert it). Dev origin `http://localhost:3050` only.

## Current operator path (2026-09-25)

1. `/m/pick` shows the next assigned order. Scan an OPEN tote `H-{id}` first:
   `POST /api/picking/tote` pairs it to the active order immediately, even
   before the first item scan. A tote paired to another order is refused.
   **Pair bin** sits beside the location; it moves the line's open serial units
   and sets the SKU home location to the scanned bin.
2. The order card opens the shared paperwork sheet. It shows available order
   documents, manuals, and kit inserts with preview, open, and print actions;
   manual-library search pairs a selected PDF to the order's item number.
   The listing action opens the exact URL resolved from that item number in a
   new tab. Completing the picked order stages the paired tote.
3. `/m/pack` accepts a camera, wedge, or typed tote scan. The tenant-scoped
   `GET /api/packing/resolve-tote?scan=…` opens the paired order's pack job
   `/m/pack/start/{orders.id}` — a `DetailHubScreen` peer (order card → order
   `/info`, Units · Activity doors, dock Paperwork · Take photos, X → `/m/pack`).
   Unpaired, wrong-state, missing-tracking and ambiguous totes are refused. A
   paired tote opened on `/m/h/{id}` offers the same Start packing entry.
4. Next steps expose order papers, manuals, checklist inserts, label
   print/reprint, and an explicit **Take packing photos** action. The mobile
   studio guides slip → box → verification; its paperwork action remains
   available while photographing. Pack history shows photos, allows additional
   captures and deletion, and does not re-finalize a completed pack. Successful
   pack completion releases its staged totes.
5. ⌘K search accepts exact or partial `orders.item_number` and tracking; the
   order dossier includes pack photos linked through the order's primary or
   secondary shipment, including in-progress capture drafts.

Historical implementation notes and QA fixtures below describe the initial
directed picker, not the current post-pick handoff. Do not recreate or delete
the fixture IDs listed in that old cleanup checklist without checking ownership.

QA smoke cleanup: order 19405, tote 354, pack logs 7041/7042, manuals
520–522, and photos 9543/9544 were removed. Serial unit 2796 remains
`STOCKED` without a tote/location: its three `inventory_events` are append-only
evidence, so deleting that test unit would violate the evidence guard. The
stock ledger location on SKU row 2952 was restored to NULL.

**Update (later 2026-09-25):** the queue is gone. `/m/pick` now IS the directed session
(`/m/pick/go` deleted, along with `PickQueue`, `PickQueueRow`, `usePickList`,
`pick-list-payload`, `PickPairToteSheet`, `GET /api/picking/list` + `lib/picking/pick-list*`).
The screen: one-row progress band (✕ · bar · `n / N`), location on top with **Pair bin**
(`POST /api/serial-units/:id/move` per open unit), order card (channel · order, SLA via
`ItemCardShipBy`, tote, packing slip via `MobileOrderDocumentsSheet`, listing = the exact URL
from `orders.item_number` via `useExternalItemUrl().openExternalByItemNumber`, new tab).
`/m/pick/[orderId]` is untouched.

## The owner's ask

A **directed / sequential pick screen**: one task full-screen, the system feeds the next
highest-priority line automatically, no list while picking. Top → bottom: thin status bar
(progress `12 / 47` · order/zone · elapsed), **dominant bin text**, large product photo +
SKU + short title + **× qty** + UOM (+ lot/serial hint, red edge if rush), one instruction
line ("Scan location barcode" / "Scan item"), fixed glove-friendly dock
**Out of Stock · Scan (primary) · Notes**. Scan button opens the camera full-screen (option A,
not auto-open); success sound + haptic; auto-advance. Order management stays a **list**;
picking is a **progress-bar "you are doing it"** screen. (Later ask, not started: port the
mobile left sidebar to an inline selector — scoping notes at the bottom.)

## Decisions taken (defaults — owner did not answer; state them in the report)

1. **Run** = all ALLOCATED/PICKING units in the org (no Mine filter). **Order-at-a-time**:
   finish an order you hold, else next by rush (ship-by ≤ 24h) → earliest ship-by → oldest id.
2. **Tote**: one per order (`pick.confirm` requires `toteScan`; one tote carries one order).
   First line of each order asks for a tote (`H-…` house plate only, via `toteRefFromScan`);
   an OPEN tote already paired to the order is auto-armed.
3. **Location scan required**, then one item scan per unit (serial / `/m/u/<id>` QR picks that
   unit; SKU / marketplace id picks the next open unit). Each item scan auto-confirms that unit.
4. **Notes** → NOTE `inventory_events` per unit (payload `source: 'picking.note'`), no migration.
5. **Claim** = open `picking_sessions` row by another picker < 60 min old (`HOLD_MINUTES`);
   candidate choice + session insert under `pg_advisory_xact_lock`. No schema change.
6. **Progress** = units this picker picked/shorted since `runStartedAt` (sessionStorage
   `cf.pick.directed.runStartedAt`) / that + all open units in claimable orders.
7. Finished orders' sessions are closed by the NEXT feed call (`completeSession` → totes STAGED),
   so the phone always sends `completeSession: false`.

## What is built (all uncommitted)

| File | What |
|---|---|
| `src/lib/picking/directed-pick.ts` (new, pure, client-safe) | types (`DirectedPickLine/Order/Next/UnitRow`), `groupDirectedPickLines`, `normalizeScanCode`, `locationFace`, `matchesLocationScan`, `matchItemScan`, `directedPickStep`, `directedPickInstruction` |
| `src/lib/picking/directed-pick.test.ts` (new) | 8 passing tests (`node --import tsx --test …`) |
| `src/lib/picking/directed-feed.ts` (new, server) | `nextDirectedPick` — close finished sessions, lock, candidates SQL, open session, units SQL (Zoho title via `resolveSkuIdentityTitle`, photo via `productImageUrl`), paired tote, progress |
| `src/app/api/picking/next/route.ts` (new) | `POST` `{ run_started_at?, device_id? }` → `{ ok, sessionId, order, line, progress, stagedTotes }` |
| `src/app/api/picking/session/[id]/note/route.ts` (new) | `POST { allocation_ids, text }` |
| `src/lib/picking/sessions.ts` | extracted `openPickingSessionOn(client,…)` (startSession uses it); `recordPickNote`; `loadPickTasks` now walk-ordered (`l.sort_order`, bin, sku) + Zoho-first title; **`recordShortPick` fix**: allocated units are still `STOCKED` (allocator never flips status), so the old STOCKED→STOCKED transition failed EVERY short with "identity transition" — now STOCKED units get a NOTE event + release only (org branch; the non-org branch is unreachable, left alone) |
| `src/lib/picking/tote-ref.ts` (+ moved test `tote-ref.test.ts`) | `toteRefFromScan` moved out of `app/m/(shell)/pick/[orderId]/_picker/picker-shared.ts` (removed there; `useMobilePicker.ts` import updated) |
| `src/components/mobile/picker/directed/useDirectedPick.ts` | controller (named `DirectedPickController` interface): feed, step machine, wedge claim (`wedge-scan` + `preventDefault`), `pick.confirm`/`pick.short` via `useWmsRealtime().execute`, notes, sound+haptic (`playScanTone`/`vibrateScan` directly), elapsed clock |
| `.../directed/DirectedPickScreen.tsx` | layout per spec; `DetailDock size="glove"`; ShortPickSheet reuse |
| `.../directed/DirectedPickStatusBar.tsx`, `DirectedPickCamera.tsx` (full-screen `ScanSurface`, stays open across bin→item), `DirectedPickNotesSheet.tsx` (quick codes + free text) | |
| `src/app/m/(shell)/pick/go/page.tsx` (new) | wraps screen in `ModeRegion mode="triage"` (industrial has 0 page gutter) |
| `src/design-system/components/DetailDock.tsx` | new optional `size?: 'default' \| 'glove'` (glove = `min-h-14`, 56px) |
| `src/components/mobile/redesign/PickQueue.tsx` | sticky bottom **Start picking · N units** → `/m/pick/go` (`data-testid="pick-queue-start"`) |

Typecheck + eslint were clean before the last three edits (glove dock, triage mode,
short-pick fix) — re-run.

## Verified live (QA sandbox, 390×844, screenshots in `/tmp/pick-*.png`)

- `/m/pick` shows Start picking · 5 units; `/m/pick/go` loads the rush order first
  (`#DIRECTED-QA-2`), progress `0 / 5`, red rush edge, bin text dominant.
- Wrong tote refused; `H-352` armed; wrong bin refused with "go to …"; right bin → "Bin
  confirmed"; `DQA-004` scan confirmed through the WMS socket; auto-advanced to
  `#DIRECTED-QA-1`, progress `1 / 5`, message "Tote DQA-TOTE-A staged for pack" (session
  closed + tote staged by the feed).
- Notes sheet opened (quick code) — **save result not yet confirmed**.
- Out of Stock sheet rendered; confirm FAILED with "identity transition" → root-caused and
  fixed in `recordShortPick` (above); `garisek-wms-gateway.service` restarted after the fix.
  **Not yet re-verified.**

## What's left (in order)

1. Re-run typecheck/eslint on changed files; `node --import tsx --test src/lib/picking/*.test.ts`.
2. Finish the live run in the QA sandbox (sign-in: `POST /api/auth/signin`, header
   `x-tenant-slug: cycleforge-qa`, body `{"staffId":67,"deviceKind":"personal"}`). State now:
   order `#DIRECTED-QA-1` (id 19402) is held by staff 67, tote `H-353` armed client-side only
   (re-scan it after reload), current line `QA-SNY-WH1000` ×1 at `QA-PICK-AC009CA4` (serial
   DQA-003). Verify: Notes save → "Note saved"; **Out of Stock → Not in bin → confirm** now
   releases and advances; next line `QA-BOSE-SLM2-BK` **×2** at `QA-PICK-F1125D3F`: tap Scan →
   camera overlay (headless has no camera → use the manual-entry field in the dialog) → bin →
   two SKU scans (`1 of 2 picked`, then advance). Drive scans with
   `window.dispatchEvent(new CustomEvent('wedge-scan',{detail:{value},cancelable:true}))`.
   Hide dev overlays before screenshots (`nextjs-portal`, the fixed "behind main" lane badge —
   clicking near it opens the worktree switcher).
   **Stop before picking order 13404** (shared QA fixture `QA-TOTE-0001` at `QA-BIN-1`, no
   location row) — it is next in the feed. The "Nothing left to pick" state can't be reached
   without touching it; verify that state some other way or say so.
3. Screenshots desk-free: phone 390×844 of launcher, tote step, item step, qty-2 line, camera,
   notes, out-of-stock, next-order advance → `/tmp`.
4. `node tools/design-mcp/ds.mjs critique <file>` + `boundary <file>` on every new/changed UI
   file (directed/*, PickQueue.tsx, DetailDock.tsx); fix what you introduced.
5. `pnpm verify:fast` — known unrelated red: stale `.next-perf/types` / `.next/types`
   validators referencing removed google-sheets routes (not this job).
6. **Clean up QA fixtures** (all created by this job): orders `DIRECTED-QA-1/2` (ids 19402,
   19403), serial units `DQA-001..004` (allocations 54–57), their `work_assignments`,
   `inventory_events`, `picking_sessions` (incl. any session staff 67 opened on order 13404
   during the test — delete only ones started today by staff 67), handling units
   `DQA-TOTE-A` (id 352) and `DQA-TOTE-B` (id 353). Use psql with the `.env` DSN, QA org
   `00000000-0000-0000-0000-000000000002` only. Never touch USAV
   (`…0001`).
7. Report to owner: decisions 1–7 above as defaults they can overrule; what was verified; the
   bugs below.

## Bugs / risks found (report them)

- **Short pick was broken for every live allocation** (identity transition) in BOTH pickers —
  fixed in `recordShortPick` (org branch). The old order picker `/m/pick/[orderId]` benefits too.
- Short-picked units go back to STOCKED in the same bin, so the allocator can hand the "not in
  bin" unit out again (pre-existing semantics; reason is audit-only). Worth an owner decision
  (e.g. ON_HOLD / count task on NOT_FOUND_IN_BIN).
- `/m/pick` scope tabs render only counts, no labels (`ScopeTabs` never prints `tab.label`) —
  pre-existing.
- Spec asks 56–64dp dock buttons: glove dock is 56px; triage mode's own CTA hit is 48px on touch.
- Browser tool quirk: named tabs opened with the same `app.path` alias one page; drive extra
  pages with `page.browser().newPage()` inside `tab.run`.

## Not started: sidebar → inline selector (scoped earlier)

Data: `MOBILE_NAV_DESTINATIONS` in `src/lib/mobile/nav-registry.ts` (`isLeafActive`,
`isGroupActive`/`matchPrefixes`). Reuse `TabSwitch` (`scrollable`, `fit="hug"`, `size="sm"`).
Mount once in `src/components/mobile/redesign/MobileShell.tsx` under `MobileTopBar`, hidden on
`mobileRouteOwnsTopBar` routes; row 1 = groups + leaves, row 2 = active group's children.
Filter children by `requires` too (drawer filters leaves only — check). Nav-name law already
covers the registry (`src/lib/nav/nav-name-collisions.ts`). Open question for owner: keep the
hamburger for leaves, or retire it (tablet rail keeps `MobileSidebarDrawer`).
