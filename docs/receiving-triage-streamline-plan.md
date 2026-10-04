# Receiving Triage Streamline Plan

Status: in progress · Owner: receiving · Last updated: 2026-06-08

Consolidates the receiving-mode / unbox-mode scan-flow cleanup. Two correctness
fixes have shipped; the rest is the streamline backlog. The newest section
(§4 "Incoming → delivered-not-scanned → triage scanned") is the active ask.

---

## 0. Context — the moving parts

| Surface | Component | Backend | Inclusion rule |
|---|---|---|---|
| Incoming mode | `IncomingSidebarPanel` → `ReceivingLinesTable` | `/api/receiving-lines?view=incoming` | `workflow_status='EXPECTED'` AND `qty_received=0` AND `zoho_purchaseorder_id IS NOT NULL` AND not Zoho-terminal |
| Incoming "delivered · not scanned" tile | `IncomingSidebarPanel` count + `delivery_state` badge | `delivered-unscanned.ts` (shipment-anchored) | `stn.is_delivered` + inbound + no `receiving_scans` + 30-day window |
| Triage → Unfound | `TriageUnfoundList` | `/api/receiving/unfound-queue` (`v_unfound_queue`) | unmatched cartons, `checked=false` |
| Triage → Prioritize | `ReceivingScannedRail` → `RecentActivityRailBase` | `/api/receiving-lines?view=scanned&sort=priority` | `received_at IS NOT NULL` AND `unboxed_at IS NULL` AND `qty_received=0` AND status in (EXPECTED/ARRIVED/MATCHED) AND not Zoho-terminal |
| Unbox mode | `ReceivingDashboard` workspace | `lookup-po` + `mark-received-po` | active line under edit |

State machine (`src/lib/receiving/workflow-stages.ts`): `EXPECTED → ARRIVED →
MATCHED → UNBOXED → AWAITING_TEST → … → DONE`. Table-chip collapse
(`receiving-constants.ts:115`): `ARRIVED` + `MATCHED` both render "SCANNED"
(matched/unmatched split carried by the PO column — intentional, keep).

---

## 1. SHIPPED — found scans now appear in Prioritize (Bug 1)

**Root cause:** the matched-scan path only dispatched `receiving-lines-prepended`
(listened to **only** by `ReceivingLinesTable`). The Prioritize rail
(`ReceivingScannedRail` via `SidebarRailShell:196-200`) invalidates on
`receiving-entry-added` / `usav-refresh-data` / `receiving-line-updated` — none
of which the matched path fired. So a found scan never refreshed Prioritize until
a global refresh. Unmatched scans worked because they *do* fire
`receiving-entry-added`.

**Fix (shipped):** `ReceivingSidebarPanel.tsx` now also dispatches
`receiving-entry-added` on both successful scan-in paths (serial short-circuit +
matched `lookup-po`), so the rail's TanStack query invalidates and the carton
appears immediately.

## 2. SHIPPED — no "Opening your PO" takeover for already-known items (Bug 2)

**Root cause:** `ReceivingScanLoader` was shown on every scan, fired before the
fetch, cleared on a 500 ms timer. Already-incoming / deduped / locally-adopted
scans resolve well under that with no Zoho round-trip.

**Fix (shipped):** `ReceivingDashboard.tsx` gates the takeover behind a 300 ms
skeleton-delay. If `receiving-scan-resolved` lands first, the loader never mounts
and the row flips inline (scan-bar spinner still gives feedback); only a genuine
cold Zoho lookup outlives the delay.

---

## Phased roadmap (all phases implemented 2026-06-08)

```
Phase 0 ✅ shipped  Bug1 (found→Prioritize refresh) + Bug2 (loader skeleton-delay)
Phase 1 ✅ shipped  invalidateReceivingFeeds() — central feed refresh (§3.1)
Phase 2 ✅ shipped  decouple physical vs Zoho-financial state (§3.3) — flag RECEIVING_PHYSICAL_STATE_FIRST (default ON, scanned view only)
Phase 3 ✅ shipped  UNIFIED INBOUND — LPN + receiving_lines.shipment_id (§3.2/§4.1B) — flag RECEIVING_UNIFIED_INBOUND (default OFF; needs migration + backfill)
Phase 4a ✅ shipped  delivered-not-scanned → triage band (§4.2) — read-only DeliveredAwaitingScanBand
Phase 4b ✅ shipped  directed putaway SKU-affinity suggestion at mark-received — flag INVENTORY_V2_RECEIVING_PUTAWAY
Phase 5 ✅ shipped  OS&D exception taxonomy — receiving.exception_code + write path
Phase 6 ◑ step 1   STN consolidation + derived-state (§6) — receiving_scans.shipment_id additive + backfill + gated dual-write done; read-cutover + legacy-column drops deferred to post-bake
```

**Migrations — APPLIED 2026-06-08** (via `node scripts/run-pending-migrations.mjs`,
recorded in `schema_migrations`; columns verified live):
- ✅ `2026-06-08_inbound_handling_unit.sql` — `receiving.lpn`, `receiving_lines.shipment_id`
- ✅ `2026-06-08_receiving_exception_code.sql` — `receiving.exception_code`
- ✅ `2026-06-08_stn_consolidation.sql` — `receiving_scans.shipment_id`

**Backfills — RUN 2026-06-08** (idempotent; flag still off, no behavior change):
- ✅ `backfill-inbound-handling-unit.sql` — 734 lines linked, 1696 cartons plated.
- ✅ `backfill-receiving-scans-shipment-id.sql` — 1310+80 scans linked.
- Coverage verified: receiving_scans 1390/1602 linked, **0 "unlinked-but-STN-exists" misses** (the S4 Q2 gate); receiving_lines 734/734 on shipment-bearing cartons. The 212 unlinked scans are the genuine non-carrier residual.

**Endpoint audit — DONE 2026-06-08:** all receiving/STN CRUD routes point to the
correct tables/columns; writes correct; reads use valid carton-FK fallbacks. No
bugs. Deferred-cutover reads (prefer `rl.shipment_id`/`rs.shipment_id` over the
carton FK + last-8 matching) are intentional S5 items, listed below.

**Remaining operational steps (NOT yet done):**
1. Flip `RECEIVING_UNIFIED_INBOUND=true` → activates get-or-create STN link +
   line/scan `shipment_id` stamping + delivered-unscanned enrichment.
2. Bake + `scripts/verify-stn-consolidation.sql` (full S4 gate).
3. Deferred S5 read cutover — upgrade reads to `COALESCE(rl.shipment_id, r.shipment_id)`
   and STN-id dedup in: `lookup-po` findScanByTracking, `receiving/[id]`,
   `receiving-lines`, delivered-unscanned.
4. Deferred S6 legacy-column drops (irreversible).

Note: Phase 5 `exception_code` write path is NOT flag-gated, so now that the
column exists, unmatched scans stamp NO_PO / CARRIER_MISMATCH immediately.

**Deferred follow-ups (noted, not built):**
- P2: interactive "Hide Zoho-received" toggle control (server `?zohoStatus=open` exists; badge done).
- P3: speculative shipment registration in incoming-po-sync (skipped — issued POs usually lack tracking); LPN-label printing + LPN-primary scan in lookup-po (no LPN input source until labels print). shipment_id is stamped at match time + by backfill, which is what powers the SKU/order# enrichment.
- P4b: scan-to-confirm bin UI in the unbox workspace + /m/scan (response now returns `putaway.{bin_id,source}`).
- P5: per-code chip + filter in the Unfound list (needs v_unfound_queue + receiving-lines SELECT to surface `exception_code`, gated on the migration; NO_PO already shows via the "No PO" badge).

Phases 1–2 are independent/safe. Phase 3 is the structural keystone (dissolves
the two-representation split, retires last-8-digit matching); 4–5 sit on top.

## 3. BACKLOG — architectural root causes behind the bug class

3.1 **Replace the CustomEvent refresh bus with TanStack query invalidation.**
*SHIPPED (Phase 1, 2026-06-08).* `src/lib/queries/receiving-queries.ts` exposes
`invalidateReceivingFeeds(queryClient)`, which invalidates the four feed roots
(`receiving-lines-table`, `receiving`, `incoming-delivered-unscanned`,
`receiving-lines-incoming-summary` — prefix-matched, so all rails/tiles beneath
them refetch). Wired into the scan path (`ReceivingSidebarPanel.submitTrackingScan`,
replacing the Phase 0 single-event dispatch), the receive mutation
(`useReceiveAction`), and `IncomingSidebarPanel.invalidateIncoming`. The legacy
`refreshEvents` DOM listeners remain as a redundant secondary trigger; removing
them + migrating rail keys onto a key factory is a later cleanup.

3.2 **One read model, two facets — not two backends.** A door scan is one
physical event but lands in either `v_unfound_queue` or `view=scanned` with
hand-synced inclusion rules; a found scan can fall into the gap. Make
"received-but-not-unboxed" a single query/DB view with a `matched | unmatched`
facet; Unfound and Prioritize become two filters over the same source.

3.3 **Decouple physical lifecycle from Zoho accounting state.** `view=scanned`
and `view=incoming` are both gated by `NOT_ZOHO_RECEIVED_PREDICATE`
(`mirror.status NOT IN (billed,closed,cancelled,received,rejected)`). Since the
`po-sync` mirror cron landed, a PO Zoho marks **received** (which happens once a
purchase-receive exists — and `lookup-po` prefers matching via
`searchPurchaseReceivesByTracking`) is silently dropped from Prioritize even
though the box is physically on the dock. The operator queue should key on the
physical lifecycle (`received_at`/`unboxed_at`); show Zoho "received" as a
badge/optional filter, never a hard row exclusion.

3.4 **Idempotent + monotonic scan mutation.** Use `workflow-stages.ts` as the
real state machine (explicit allowed transitions, never regress).
`upsertMatchedReceiving` ON CONFLICT should
`received_at = COALESCE(receiving.received_at, EXCLUDED.received_at)` so a re-scan
can't leave a matched carton without a `received_at` stamp.

---

## 4. ACTIVE — Incoming "delivered · needs scanned" must pull full Zoho data + wire to triage scanned state

### 4.1 Why SKU + order number don't display

There are **two parallel representations of one incoming PO**, and the
delivered-not-scanned surface reads the one *without* line data:

1. **`receiving_lines` (EXPECTED)** — created by `incoming-po-sync`
   (`src/lib/zoho-receiving-sync.ts:189-419`, `getPurchaseOrderById` → `line_items`).
   Carries `sku`, `item_name`, `quantity_expected`, `zoho_purchaseorder_number`.
   But `receiving_id IS NULL` and there is **no shipment link** — no delivery
   signal.
2. **`shipping_tracking_numbers` (STN)** — created by Zoho webhooks /
   tracking-live-sync. Carries carrier + tracking# + `is_delivered`. **No
   line-level SKU/item_name**; PO# only via `tracking# → reference#` match.

The delivered-not-scanned set is **shipment-anchored** by design
(`delivered-unscanned.ts:9-14`: "the unit is the shipment, not the PO line …
PO-line anchoring reads ~0 because most inbound shipments are registered from a
PO reference# and never get their own receiving row"). So the tile/list renders
tracking + delivered status but has **no join to the EXPECTED `receiving_lines`
that hold SKU/item_name** — they only connect at the header level through the
`zoho_po_mirror` PO# match. Result: SKU and order# render blank/placeholder for
delivered-not-scanned rows.

`incoming-po-sync` *does* persist line items (verified: `sku`, `item_name`,
`quantity_expected`, `zoho_purchaseorder_number` written at
`zoho-receiving-sync.ts:322-395`). The gap is **linkage**, not ingestion — the
delivered shipment and the EXPECTED lines are never joined at the line level.

**Fix options (4.1):**
- **(A) Enrich at read time (smaller).** In the delivered-unscanned list +
  `delivery_state` rows, resolve the shipment → PO (`tracking# → reference# →
  zoho_purchaseorder_id`, already done header-level for the Zoho-received guard)
  and LEFT JOIN `receiving_lines` on that `zoho_purchaseorder_id` to surface
  `sku`, `item_name`, `quantity_expected`, `zoho_purchaseorder_number`. Multi-line
  POs show as a grouped carton (reuse `CollapsibleGroupRow`).
- **(B) Link at sync time (cleaner, preferred long-term).** Have
  `incoming-po-sync` register a shipment (STN) for every incoming PO that carries
  a tracking/reference and stamp `receiving_lines.shipment_id` (or a lightweight
  `receiving` row) so line data + delivery signal live on one entity from
  ingestion. Removes the two-representation split that 3.2 also targets.

Recommended: ship **(A)** now for the display fix; fold **(B)** into the §3.2
unified read model.

### 4.2 Wire delivered-not-scanned into the triage scanned state

Today: delivered-not-scanned is an **Incoming-mode** count/badge only. Triage's
Prioritize rail requires `received_at IS NOT NULL`, which a not-yet-scanned box
lacks — so a physically-delivered box awaiting a dock scan is invisible in
Triage. The transition *mechanism* already exists (scanning writes
`receiving_scans` + creates the `receiving` row → drops out of
DELIVERED_UNOPENED → `received_at` set → enters `view=scanned`), but the pre-scan
queue isn't surfaced where the operator works.

**Target flow:**
1. **Surface "Delivered · needs scan" in the Triage sidebar** as a state ahead of
   Prioritize (its own pill or the top band of the scanned rail), backed by the
   enriched delivered-unscanned set from 4.1 so each row shows SKU + order# +
   tracking. Sorted by `delivered_at` (oldest-delivered first) so aging boxes
   surface.
2. **On scan, flip to the triage "Scanned" state.** The existing
   `lookup-po` path stamps `received_at`, writes `receiving_scans`, sets
   `workflow_status EXPECTED → MATCHED` ("SCANNED" chip). Add the §1 refresh
   dispatch so the row leaves "Delivered · needs scan" and lands in Prioritize in
   the same tick — no manual refresh.
3. **Coherent labels.** `delivery_state=DELIVERED_UNOPENED` (pre-scan) and
   `workflow_status` SCANNED (post-scan) must read as one progression in the UI:
   "Delivered → Scanned → Unboxed". Drive both from the
   `workflow-stages.ts` registry so the chip/dot tones match across Incoming and
   Triage.

**Acceptance:**
- A delivered-not-scanned row in Triage shows real SKU + order# (not blank).
- Scanning that row moves it from "Delivered · needs scan" to "Scanned"
  immediately, with the SCANNED chip, no refresh.
- Tile count (`delivered-unscanned`), the triage "needs scan" list length, and
  the rendered rows agree by construction (single predicate, per
  `delivered-unscanned.ts` SoT contract).

---

## 6. Phase 6 — STN consolidation + derived-state (completes "Phase 9")

**Goal.** Finish the inbound-tracking unification that `2026-04-15_receiving_attach_shipment_id.sql`
named as its end-state. After this there is exactly ONE place a tracking string
lives (`shipping_tracking_numbers`), every receiving table references it by
`shipment_id`, and the operator-facing "state/mode" is *derived on read* from the
three sources of truth — never stored.

### 6.0 Target model — three SoTs, each owning one fact

| Table | Owns | Key |
|---|---|---|
| `shipping_tracking_numbers` (STN) | carrier tracking: the number, carrier, delivery events, `is_delivered`, `delivered_at` | one row per normalized tracking# |
| `zoho_po_mirror` (+ `receiving_lines`) | procurement: ordered SKU/qty/vendor, PO status | PO id |
| `receiving_scans` | the **dock event** — "operator X scanned carton Y at time T" | one row per scan |

`receiving` (the carton) is the join hub: `receiving.shipment_id → STN`,
`receiving.zoho_purchaseorder_id → PO`, and now (Phase 3) `receiving_lines.shipment_id`.

### 6.1 `receiving_scans` stays a FACT, not a display

The dock-scan event is a source-of-truth fact nothing else records — STN only has
carrier events, the PO only has procurement. The whole "delivered · needs scan"
state is defined by the *absence* of a `receiving_scans` row, so the table must
remain **append-only event data**. What changes: it stops carrying its own copy
of the tracking string and instead references STN via `shipment_id`.

Target `receiving_scans` shape after the drop step:
`(id, receiving_id, shipment_id → STN, scanned_at, scanned_by, source)` — the
`tracking_number` / `carrier` TEXT columns are gone.

`shipment_id` is **nullable**: a scan-before-STN (webhook hasn't landed) or a
non-carrier code (SKU-format scan) must still record the dock event. lookup-po
already registers the STN permissively at scan time, so the link fills in for
real tracking immediately.

### 6.2 State/mode is DERIVED, never stored

Keep the existing CQRS pattern (the `delivery_state` CASE is computed on read).
Generalize it to the one contract:

```
state/mode = f( STN.is_delivered, STN.latest_status_category,
                EXISTS(receiving_scans for this carton),
                zoho_po_mirror.status,
                receiving_lines.workflow_status, quantity_received )
```

No stored mutable state column — a stored projection is exactly what drifts and
caused the Bug-1 class. The reads (`view=incoming`, `view=scanned`, the
delivered-unscanned predicate) all join `… ON shipment_id` instead of last-8
matching once the link is populated everywhere.

### 6.3 Migration sequence (strict order; never skip the bake)

```
S1  ADD nullable FK  receiving_scans.shipment_id            ← additive, DONE
S2  BACKFILL          from receiving.shipment_id, then       ← DONE (script)
                      from scan tracking# → STN (normalized)
S3  DUAL-WRITE        recordScan stamps shipment_id          ← DONE (flag-gated)
      (every new scan now linked; legacy tracking_number still written too)
S4  BAKE + VERIFY     in prod with RECEIVING_UNIFIED_INBOUND on. Run
                      scripts/verify-stn-consolidation.sql (read-only): Q2 misses
                      ≈ 0, Q3 regressions/conflicts = 0, Q5/Q5b ≈ the explained
                      residual. Advance criteria at the foot of that script.
                                                               ← REQUIRED gate
S5  READ CUTOVER      switch lookup-po dedup (findScanByTracking) + the incoming
                      LATERAL receiving join + delivered-unscanned from last-8
                      tracking matching to shipment_id joins. Dual-read first
                      (compare), then primary.                ← deferred
S6  DROP LEGACY       in a SEPARATE migration, only after S4/S5 hold for a full
                      sync cycle:
                        receiving_scans.tracking_number, .carrier
                        receiving.receiving_tracking_number, receiving.carrier
                        receiving_lines.zoho_reference_number (if still present)
                      Each drop is irreversible — gated on a green S4 metric.
                                                               ← deferred, destructive
```

### 6.4 Executed now vs deferred

- **Executed (additive, reversible):** S1 migration (`2026-06-08_stn_consolidation.sql`),
  S2 backfill (`scripts/backfill-receiving-scans-shipment-id.sql`), S3 gated
  dual-write (`recordScan` → `stampScanShipmentLink`, behind `RECEIVING_UNIFIED_INBOUND`).
- **Deferred (need prod bake / are destructive):** S4 verification metrics, S5
  read-path cutover off last-8 matching, S6 legacy-column drops. These are
  specified above but intentionally NOT coded blind — the read cutover changes
  the core scan path and the drops are irreversible, so both wait on S4 data.

### 6.5 Risks / rollback

- **Scan-before-STN:** handled by nullable `shipment_id` + permissive STN
  registration at scan time. Never block a scan on the link.
- **Rollback before S6:** flip `RECEIVING_UNIFIED_INBOUND` off — dual-write
  stops, legacy columns still authoritative, zero data loss (the new column is
  purely additive until S5 cutover).
- **No rollback after S6:** column drops are one-way. S6 must follow a green S4
  metric held across ≥1 full incoming-sync + carrier-poll cycle.

---

## File index

- `src/components/sidebar/ReceivingSidebarPanel.tsx` — scan submit + event dispatch (§1)
- `src/components/ReceivingDashboard.tsx` — scan loader gating (§2)
- `src/components/sidebar/receiving/{TriageSidebarBody,TriageUnfoundList,ReceivingScannedRail}.tsx` — triage tabs (§3.2, §4.2)
- `src/components/sidebar/receiving/RecentActivityRailBase.tsx` + `SidebarRailShell.tsx` — rail refresh wiring (§1, §3.1)
- `src/app/api/receiving-lines/route.ts` — `view=incoming` / `view=scanned` SELECT + `delivery_state` CASE (§3.3, §4)
- `src/lib/receiving/delivered-unscanned.ts` — delivered-unscanned SoT predicate (§4)
- `src/lib/zoho-receiving-sync.ts` + `src/app/api/cron/zoho/incoming-po-sync/route.ts` — line-item ingestion (§4.1)
- `src/lib/receiving/workflow-stages.ts` + `src/components/station/receiving-constants.ts` — state machine + labels (§3.4, §4.2)
- `src/app/api/receiving/lookup-po/route.ts` — `recordScan` → `stampScanShipmentLink` STN dual-write (§6 S3)
- `src/lib/migrations/2026-06-08_stn_consolidation.sql` + `scripts/backfill-receiving-scans-shipment-id.sql` — receiving_scans.shipment_id (§6 S1/S2)
- `scripts/verify-stn-consolidation.sql` — read-only S4 gate proving S5 cutover + S6 drops are safe (§6.3)
