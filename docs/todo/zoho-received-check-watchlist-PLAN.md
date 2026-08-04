# PLAN — Unify the manual Zoho received check with the unreceived watch list

**Status:** Phase 0 + Phase 1 **LANDED** (2026-08-02, uncommitted). Phases 2–4 open.
**Predecessor:** [`zoho-received-check-watchlist-HANDOFF.md`](./zoho-received-check-watchlist-HANDOFF.md)
**Related:** [`ebay-delivered-not-unboxed-PLAN.md`](./ebay-delivered-not-unboxed-PLAN.md) (phases 1–5 landed)

---

## The decision: **A + C**, explicitly **not B**

The handoff offered three shapes. The chosen answer is a hybrid of **A (promote)** and
**C (chrome continuity)**, and **B (durable watch rows) is refused for now** — not deferred
on effort, refused on grounds.

**Why not B.** A durable "reconciliation check" exception row would be a *third* home for a
fact `receiving_exceptions` and the delivered-* feeds already own between them, and the
paste list is not itself evidence — it is a question an operator asked once. The house rule
is explicit that a new table is Ask-first, and nothing yet proves paste lists must survive a
session. **The moment a `not received in Zoho` finding needs to survive, it already has a
home:** `LOSS_EXCEPTION_CODES` (`LOST_IN_TRANSIT` · `EMPTY_BOX` · `MISDELIVERED` · `STOLEN`)
on the existing exception table. Reach for that before minting a vocabulary.

**Why A + C together.** A alone (deep-link into an existing lane) cannot express the finding
that matters most, because that finding is *invisible on every lane* (see below). C alone
leaves the check a report. Together: the check **answers in place** with the warehouse's own
state beside the vendor's, and each row can **jump into the list** the operator already works.

---

## The gap this closes (the reason the work is worth doing)

A PO that is **received in Zoho but never dock-scanned** appears on **no continuous feed**:

| Surface | Why it misses the row |
|---|---|
| Incoming list | `NOT_ZOHO_RECEIVED_PREDICATE` drops Zoho-terminal POs |
| Delivered · not unboxed | same predicate, in its `WHERE` |
| `reconcileZohoReceivedLines` | requires `rt.door_received_at IS NOT NULL` — correctly refuses to auto-close a carton nobody touched |
| Delivered · not scanned | **catches it** — but only if the carrier reported delivery, and only for 14 days |

So the hole is precisely: *ERP says received · no dock scan · (no carrier delivery signal **or** older than 14 days)*.
That is the row a paste list from a vendor statement or a carrier portal export finds, and it
is why the manual check earns its place rather than being an automation stopgap.

**Do not "fix" this by relaxing `NOT_ZOHO_RECEIVED_PREDICATE`.** It is load-bearing: without
it, every received PO floods Incoming. And do not extend `reconcileZohoReceivedLines` to
close un-scanned cartons — the door-scan requirement is the guard that keeps ERP status from
silently completing physical work.

---

## Phase 0 — audit fixes ✅ LANDED

1. **`zoho-received-status.ts`** — new dependency-free leaf SoT for
   `ZOHO_RECEIVED_LIKE_STATUSES` / `isZohoReceivedLikeStatus`. Collapses three hand-typed
   copies (`check-zoho-received.ts`, `rail/status.ts`, `zoho-received-reconcile.ts`), each of
   which carried its own "keep in sync" comment. The heavy reconciler re-exports it, so
   server import paths are unchanged.
   **Not merged with `ZOHO_TERMINAL_STATUSES`** — that list adds `cancelled`/`rejected` and
   answers "still incoming?", a different question.
2. **Three buckets, not two.** `error` / `zoho_cap` / `no_match` / `ambiguous` moved out of
   `not_received_in_zoho` into a new `undetermined`. During a Zoho outage the old shape
   reported *every* pasted tracking as not-received.
3. **Mirror staleness disclosed** — `synced_at` per row, rendered as "as of …", so a cached
   answer is legible as cached.
4. **Local half degrades honestly** — a failed local lookup yields `local: null` →
   `verdict: 'unknown'`, never "no warehouse record".

## Phase 1 — the local join ✅ LANDED

`lookupLocalByTrackings` returns, per tracking: `known` · `delivered` · `scanned` ·
`unboxed` · `watch`. Two pure functions derive the rest:

- **`resolveWatchState`** → which lane owns it (`delivered_unscanned` · `delivered_not_unboxed`
  · `in_flight` · `done` · `unknown`) — the single membership answer the rail and the tiles share.
- **`resolveVerdict`** → the ERP × warehouse cross-product (`settled` · **`erp_ahead`** ·
  `warehouse_ahead` · `open` · `unknown`).

Composes `SHIPMENT_SCAN_MATCH_CONDITION` and `INBOUND_SOURCE_SYSTEMS` from the
delivered-unscanned SoT rather than restating them. Runs in `Promise.all` with the mirror
lookup so it adds no serial round-trip. Rail shows a watch chip per row, callout counts for
`erp_ahead` / `warehouse_ahead`, and a per-row **Show in Incoming**.

**Perf note, measured:** the first draft joined `shipping_tracking_numbers` on
`normalized = canon OR right(normalized,8) = last8`. The `OR` blocked the index — EXPLAIN put
it at ~357k cost for a *single* key. Dropping the last-8 arm (the operator pastes the
canonical stored form; the last-8 tolerance is a *scan-side* concern already inside
`SHIPMENT_SCAN_MATCH_CONDITION`) made it an index scan: **~4.3k for 100 keys**.

**Schema correction found in passing:** `delivered-unscanned.ts` documents
`shipping_tracking_numbers` as "NEEDS-COL (no organization_id)". It **has** `organization_id`
with `relrowsecurity` **and** `relforcerowsecurity` true (verified against the live schema
2026-08-02). The comment is stale; the extra org pins built around it are harmless but are
belt-and-braces, not the only scoping. **222 rows carry a NULL `organization_id`** and are
therefore invisible to every `tenantQuery` — pre-existing, worth its own ticket.

---

## Phase 2 — multi-tracking list filter (open)

**Problem.** `Show in Incoming` filters **one** tracking at a time. The list's search is a
single `ILIKE '%term%'` (`build-sql.ts`), so "show me all 12 of these" is not expressible.

**Do:** add a multi-value param — `?tracking_in=a,b,c` — to `parseReceivingLinesQuery` +
`build-sql.ts`, matching on `stn.tracking_number_normalized = ANY($n)`. Precedent exists
(`receiving_ids`, `ids`). Then the rail gets one "Show all N in Incoming" per bucket.

**Don't:** widen the free-text `search` to accept a delimited list — it is one question
("narrow this list") asked by every route, and overloading it makes the ILIKE quadratic.

**Ask first:** whether `tracking_in` should bypass the active `?state=` filter. A tracking
that is Zoho-received is *excluded from Incoming by predicate*, so a naive filter shows an
empty table and reads as a bug. Likely needs an explicit "include Zoho-received" escape on
that param only — which is a real change to Incoming's contract, hence Ask-first.

## Phase 3 — promote `erp_ahead` to a continuous feed (open)

The check finds these on demand; nothing finds them on a schedule. Candidate: extend the
`delivered-not-unboxed` feed with a sibling lane keyed on *Zoho-received AND never
door-scanned*, deliberately **without** the delivery-window bound (the whole point is the rows
the carrier never confirmed).

**Ask first** — it changes what an existing tile counts, and the window omission is a real
cost decision. Prove the volume with Phase 1's `stats.erp_ahead` over a few weeks first; if
it is consistently zero, this phase is correctly never built.

## Phase 4 — partial results on timeout (open)

`maxDuration = 60` with up to 50 live lookups at concurrency 3 is ~17 sequential rounds. A
slow Zoho means the route times out and the operator loses **everything**, including the
mirror hits that already resolved. Options: stream, or return mirror results immediately and
fetch live ones in a second request. Low priority while mirror hit-rate stays high — but
`stats.zoho_lookups` is the number to watch.

---

## Never (carried from the handoff, still binding)

- Paid webhook aggregators as the fix for carrier polling.
- Auto `mark-received`, or writing Zoho receives from the check. It stays read-only.
- Renaming `ARRIVED`/`MATCHED`/`UNBOXED` to WMS vocabulary.
- Relaxing `NOT_ZOHO_RECEIVED_PREDICATE`, or dropping the `door_received_at` guard in
  `reconcileZohoReceivedLines`.
- A second search engine, a page-local twin of any delivered-* feed, or a floating/modal
  inspector for this flow.
