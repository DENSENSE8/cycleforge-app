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

### 1. Bin / putaway — audit reality FIRST

Open question flagged in review: **does USAV actually record putaway with a bin today**, or is
`bin_id`-on-`PUTAWAY` net-new lifecycle modeling? First task is an audit of putaway/post-test/post-pack
placement writers. Then, for the paths that exist:

- Ensure `MOVED` / `PUTAWAY` / `PACKED` events carry `bin_id`.
- Extend `inventoryEventsToTimeline` (adapter, per the timeline SoT — never the view) to emit a bin `ref` +
  href → `/inventory/location/[barcode]`.
- If bins are aspirational: cut bin from this plan's acceptance; leave the adapter ready.

### 2. Ship / scan-out consistency

Audit pack→outbound writers so every scan-out emits inventory `SHIPPED` and/or SAL `SHIP_CONFIRM`
consistently (the "ship gap" in staff/04-item-journey). All status changes via `transition()` /
`applyTransition` — no raw writers.

### 3. Ticket spine on SERIAL_UNIT

Generalize primary ticket resolution onto SERIAL_UNIT (+ waterfall) so support hops appear on Trace with
ticket chips. **Blocked on** Entity Threads / `ticket_links` migrations applying; sequence after that lands.

### 4. Return → receive-again provenance

Verify `RETURNED` + subsequent `RECEIVED` merge into one Trace with `countRoundTrips`; fix provenance when a
return creates a new receiving line (second carton link). Round-trip badge already renders on Trace.

## Gap ledger (filled by the handoff plan's acceptance run)

| # | Serial / order tested | Missing hop | Suspected writer | Status |
|---|---|---|---|---|
| — | _(populate during handoff acceptance)_ | | | |

## Acceptance (this lane)

The full staff checklist from `docs/master-connections-and-refactor/staff/04-item-journey.md`, driven from
the header: ⌘K a shipped serial → received → tested → putaway (bin chip) → allocated → picked → packed →
shipped → ticket; RMA return + re-receive shows round-trip badge ≥1/≥1 with the second receive hop; bin chip
→ location page; ticket chip → support. `npm run verify` green.
