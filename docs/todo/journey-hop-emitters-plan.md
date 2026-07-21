# Journey hop emitters — close the physical loop (WS-JOURNEY, own lane)

> **Status:** Parked · 2026-07-17 · **own worktree lane when picked up** (`topic/journey-hops` — register in
> `docs/portfolio/WORKTREE-LANES.md` + `dev-worktrees.json` at start; NOT main-lane work)
> **Split from:** [`search-journey-handoff-plan.md`](search-journey-handoff-plan.md) — that plan ships the
> search → Trace display path; this one makes the hops it displays complete.
> **Feed:** the handoff plan's acceptance run writes its missing-hop findings into the gap ledger below.

## Why split

This is backend lifecycle work — state-machine writers across stations, `ticket_links`, return provenance —
not display work. The ticket spine additionally depends on Entity Threads (migrations UNAPPLIED as of
2026-07-17). Per the worktree-lane law a distinct initiative gets its own lane; coupling it to the display
handoff would have blocked a 4-file UI win on a multi-domain backend audit.

## Scope (from the original plan's Phase 3)

### 1. Bin / putaway — audit reality FIRST → **ANSWERED: data present, display missing**

Open question flagged in review: **does USAV actually record putaway with a bin today**, or is
`bin_id`-on-`PUTAWAY` net-new lifecycle modeling? **Audited 2026-07-20** (`scripts/probe-journey-coverage.mjs`,
read-only): `PUTAWAY` = 93 rows org-wide, **93/93 carry `bin_id`**. Putaway-with-bin is real and consistent —
**not** net-new modeling. So this task collapses to a **display-only** change:

- ~~Ensure `PUTAWAY` events carry `bin_id`~~ — already true (93/93). No writer work.
- Extend `inventoryEventsToTimeline` (adapter, per the timeline SoT — never the view) to emit a bin `ref` +
  href → `/inventory/location/[barcode]` from the existing `bin_id` column.
- `MOVED`/`PACKED` don't exist as event types yet (see §2) — bin display is `PUTAWAY`-anchored for now.

### 2. Ship / scan-out consistency → **CONFIRMED GAP (org-wide, high confidence)**

**Audited 2026-07-20:** zero `SHIPPED` inventory_events exist org-wide, and zero `PACKED` — despite **7,856**
`shipping_tracking_numbers` rows. Ship/pack state is tracked on the shipment/order, **not** serial-anchored in
`inventory_events`, so a shipped serial's Trace shows receive/test/label/putaway but **stops before pack and
ship**. This is the "ship gap" from staff/04-item-journey, now confirmed at the data layer.

- Emit a serial-anchored `SHIPPED` (and/or SAL `SHIP_CONFIRM`) at scan-out, and `PACKED` at pack-confirm.
- All status changes via `transition()` / `applyTransition` — no raw writers.

### 3. Ticket spine on SERIAL_UNIT

Generalize primary ticket resolution onto SERIAL_UNIT (+ waterfall) so support hops appear on Trace with
ticket chips. **Blocked on** Entity Threads / `ticket_links` migrations applying; sequence after that lands.

### 4. Return → receive-again provenance

Verify `RETURNED` + subsequent `RECEIVED` merge into one Trace with `countRoundTrips`; fix provenance when a
return creates a new receiving line (second carton link). Round-trip badge already renders on Trace.

## Gap ledger — filled by acceptance run 2026-07-20

**Method.** Handoff chain verified end-to-end as a deterministic contract check (helper URL → URL-state →
`operations-journey-queries` → `/api/operations/journey` → `resolveEntity`): param names match across all four
dims (`dim`/`order`/`serial`/`unit`/`tracking`). Live hop-completeness gathered read-only via
`scripts/probe-journey-coverage.mjs` against the dev dogfood DB (org-wide `inventory_events` census; **1** fully
shipped+allocated serial exists in dev, so per-unit sampling is thin — org-wide type counts are the real signal).

**Org-wide `inventory_events` census (serial-anchored lifecycle hops):**

| Hop / event_type | Rows | Distinct units | bin_id set | Emitter verdict |
|---|---|---|---|---|
| `RECEIVED` | 3920 | 921 | 0 | ✅ emits (bin N/A at receive) |
| `TEST_START` / `TEST_PASS` / `TEST_FAIL` | 5 / 171 / 25 | ~168 | 0 | ✅ emits |
| `GRADED` | 33 | 30 | 0 | ✅ emits |
| `LABELED` | 235 | 232 | 0 | ✅ emits |
| `PUTAWAY` | 93 | 91 | **93 (100%)** | ✅ emits **with bin** → display adapter is all that's missing |
| `ALLOCATED` | 1 | 1 | 0 | ✅ emits (barely exercised in dev) |
| **`PACKED`** | **0** | **0** | — | ❌ **GAP** — no serial-anchored pack hop |
| **`SHIPPED`** | **0** | **0** | — | ❌ **GAP** — no serial-anchored ship hop (7,856 tracking rows exist on shipment side) |

**Ledger items for this lane:**

| # | Finding | Evidence | Fix owner (this lane) | Status |
|---|---|---|---|---|
| 1 | Pack hop absent from serial Trace | 0 `PACKED` events org-wide | §2 — emit `PACKED` at pack-confirm | open |
| 2 | Ship hop absent from serial Trace | 0 `SHIPPED` events; 7,856 tracking rows | §2 — emit `SHIPPED`/`SHIP_CONFIRM` at scan-out | open |
| 3 | Bin never shown though data exists | `PUTAWAY` 93/93 with `bin_id` | §1 — bin `ref`/href in `inventoryEventsToTimeline` (display only) | open |
| 4 | Ticket spine unverifiable in dev | 0 `ticket_links(SERIAL_UNIT)` | §3 — blocked on Entity Threads migrations | blocked |
| 5 | SAL / RMA round-trip unverifiable in dev | SAL census empty; 1 allocated unit | §4 — re-audit once dev has a returned+re-received unit | deferred |

**Not gaps (verified emitting):** receive, test (start/pass/fail), grade, label, putaway, allocate.

## Acceptance (this lane)

The full staff checklist from `docs/master-connections-and-refactor/staff/04-item-journey.md`, driven from
the header: ⌘K a shipped serial → received → tested → putaway (bin chip) → allocated → picked → packed →
shipped → ticket; RMA return + re-receive shows round-trip badge ≥1/≥1 with the second receive hop; bin chip
→ location page; ticket chip → support. `npm run verify` green.
