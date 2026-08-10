# Hand-off — port "scan a location, place the thing in front of me" across the scan stations

**For:** the next implementing agent (Claude Code / Codex / Cursor / Grok)
**From:** the 2026-08-09 Arrival WMS-standards pass
**Date:** 2026-08-09
**Status:** READY TO BUILD. Phase 1 is unblocked and is the dogfood test. Nothing here is implemented.
**Lane:** `main` checkout, no ad-hoc branch. Attach to **`:3050`** — never start, restart, or kill the dev server. **User owns commits.**

**Paste for a new session:**

```
Read docs/todo/station-location-scan-placement-PORT-HANDOFF.md.

Build Phase 1 only (§3.1) — make a location-barcode scan place the OPEN carton at
Arrival. Then stop and hand back for a dogfood bench test before Phase 2.

Read §4 (traps) FIRST. There are THREE placement storages on purpose — do not merge
them — and the location DECODER is already one shared module. Do not build the
placement suggester; it is out to research (§6).
```

---

## 0. What the user asked for, and the correction that produced it

> "There is no real way to access and use the staging in dogfood — that's why it's not working and not used correctly in the scan stations like Ready to Pack and Arrival and Unbox. This is the main task: first porting and testing via the UI and UX in dogfood, then porting it and growing it more."

This **corrects a wrong conclusion** reached earlier the same day. A 2026-08-02 investigation ([`triage-complete-never-true-HANDOFF.md`](./triage-complete-never-true-HANDOFF.md) §0.5) found Arrival's staging fields at **zero human writes across 2474 cartons**, and that was read as "operators don't stage." It is not. Operators stage constantly — **the UI has no scan-driven way to record it**, so the record is empty while the physical work happens.

That distinction is the whole brief. **Do not treat the empty data as evidence the feature is unwanted.**

---

## 1. Why it does not work today — the actual mechanism

Arrival's scan bar **can** already accept a location barcode, but only inside a **`batch_sort` session armed by a physical `CMD-*` sticker**, and a location scan there commits a **batch** of queued cartons, not the carton on screen.

So on the open carton — the state an operator is in for essentially the whole shift — **scanning a shelf barcode does nothing at all.** The only way to record placement is a mouse-driven `<select>` grouped by room ([`StagingSection.tsx`](../../src/components/receiving/triage/StagingSection.tsx)), on a bench where the operator's hands are on the box and a wedge scanner.

That is a complete explanation of zero writes. Nobody refused to stage; the product asked for a mouse at a scan station.

---

## 2. What already exists (verified in source 2026-08-09)

### 2a. The decoder is ALREADY one shared module — do not write a second

[`arrival-command-routing.ts`](../../src/lib/receiving/arrival-command-routing.ts) →
**`extractArrivalLocationBarcode(raw)`**: strips an optional `LOC-` prefix, runs `routeScan`, and accepts **only** a confidently decoded bin (flat / dashed / GS1 — a `bin` route **with** a redirect).

It deliberately **rejects the letter-fallback bin guess**, so an Amazon `TBA…` tracking number can never be mistaken for a shelf. That rejection is load-bearing — keep it.

Already consumed by four call sites: the Unbox stage route, `UnboxDockScanEntry`, `ReceivingSidebarPanel` (via `classifyArrivalScan`), and `useArrivalBatchSortSession`.

### 2b. Unbox is the GOLDEN — port its shape, not a new one

The `stage` commit step (after Print, before Receive):

| Piece | File |
|---|---|
| Dock CTA + confirm/reopen face | [`LocationScanDockControl.tsx`](../../src/components/receiving/workspace/line-edit/steps/dock/LocationScanDockControl.tsx) |
| Where the scan lands | `UnboxDockScanEntry.tsx` → `stageLocation(raw)` when `activeKey === 'stage'` |
| Write | `POST /api/receiving/lines/[id]/stage` — `{ barcode }` to set, `{ confirmed: false }` to clear |
| Storage | `receiving_line_putaway.staged_location_id` / `staged_at` |
| Confirmation | middle scrolls to `UnboxPlacementSection` |

Its interaction contract, which is the thing to port:

1. Wedge scan lands while the step is armed → optimistic `dispatchLineUpdated` → toast **`Staged → {location name}`**.
2. A confirm face shows the current location with a **Reopen** that clears it.
3. Every path hands focus back to the wedge (`emitReceiving('receiving-focus-scan')`, 60ms defer).

### 2c. There are THREE placement storages, and they are separate ON PURPOSE

| Station | Thing being placed | Storage | Route |
|---|---|---|---|
| **Arrival** | the carton, at the door | `receiving_triage.staging_location_id` (+ `priority_lane`) | `PATCH /api/receiving/[id]` |
| **Unbox** | the line's intended putaway bin, post-print | `receiving_line_putaway.staged_*` | `POST /api/receiving/lines/[id]/stage` |
| **Ready to Pack** | the labeled order, at a packing desk | `order_pack_placements` | [`pack-placement.ts`](../../src/lib/packing/pack-placement.ts) |

`LocationScanDockControl`'s own docblock says it outright: *"Never Arrival carton `staging_location_id`."* The stage route repeats it. `source-of-truth.md` separately bans a parallel packing-stations table.

**Three jobs, three lifetimes, three storages. What ports is the INTERACTION, never the storage.**

### 2d. Arrival's existing pieces

- `useTriageStaging` — holds shelf + lane state, PATCHes, and **auto-routes the lane** from the shelf via `resolveTriageLane` (manual lane always wins).
- `useArrivalBatchSortSession.commitBatchToLocation(barcode)` — already does barcode → `GET /api/locations/{barcode}` → PATCH N cartons. **The resolve half of Phase 1 already exists here.**

---

## 3. The work

### 3.1 Phase 1 — Arrival, open carton (BUILD THIS, THEN STOP)

**Goal:** with a carton open at Arrival, scanning a shelf barcode places *that carton* — no mode, no sticker, no mouse.

1. **Classify in the open-carton scan path.** Where Arrival handles a scan with a record open, call `extractArrivalLocationBarcode` first. A hit is a placement commit; a miss falls through to today's tracking behaviour unchanged.
2. **Resolve + write.** `GET /api/locations/{barcode}` → `PATCH /api/receiving/[id]` with `staging_location_id`, reusing `useTriageStaging.selectShelf` so the **lane auto-route and its manual-wins rule are inherited, not re-implemented**.
3. **Feedback = Unbox's.** Optimistic update, toast `Staged → {name}`, then `receiving-focus-scan`.
4. **A second scan moves it.** Re-scanning a different shelf re-places the carton. No confirm dialog — the operator is holding the box.
5. **Keep the `<select>`.** It is the fallback for a damaged shelf label and the only path on a machine with no scanner. Scan-first, mouse-still-works.
6. **Do not touch `batch_sort`.** The open-carton path is additive; the batch path stays exactly as it is.

**Then hand back.** Phase 1 *is* the dogfood test — the user watches it at the bench before anything is generalized.

### 3.2 Phase 2 — extract the shared interaction (only after Phase 1 is bench-verified)

Two consumers is the promote bar. Extract from Unbox's golden + Arrival's Phase 1:

- a hook owning **classify → resolve → optimistic write → toast → refocus**, taking a per-station commit function; and
- a dock face (idle "Scan location barcode" / placed "{name} · Reopen") for stations with a dock band.

Arrival and Unbox both migrate onto it in the same change. **Storage stays per station** (§2c).

### 3.3 Phase 3 — Ready to Pack

Third consumer: place a labeled order at a packing desk by scanning the desk barcode, writing `order_pack_placements` through the existing `pack-placement.ts` waist. Note it already places at the tech TRACKING scan — Phase 3 is the **explicit re-place / move**, not a second automatic writer.

### 3.4 Phase 4 — grow (NOT NOW)

Occupancy display, suggested shelves, directed placement. **Gated on research** — see §6.

---

## 4. Traps — read before writing code

1. **Never hand-roll a location parse.** `extractArrivalLocationBarcode` only. A local regex will re-admit the `TBA…` false positive its rejection rule exists to prevent.
2. **Never merge the three storages** (§2c). Two files already carry a comment forbidding exactly the merge that will look tempting.
3. **The wedge owns focus.** Every commit path ends in `receiving-focus-scan` on a ~60ms defer. A control that eats focus drops the next scan **silently** — the most expensive bug class on these benches.
4. **Two scan loci at Arrival.** The left sidebar bar is *ingest* (new tracking / PO); the open-carton path is *procedure*. Phase 1 must not make the sidebar bar start placing cartons, and must not steal its registered scan target. See `src/lib/station-scan-sink/` and the Unbox dual-loci precedent.
5. **Manual lane wins.** `resolveTriageLane` is COALESCE-once. Route through `selectShelf`; never write `priority_lane` directly.
6. **Unfound cartons have no lines.** Arrival staging is carton-level (`receiving_triage`), so it works on lineless cartons — do not accidentally reroute it through a line-scoped write.
7. **`triage_complete` is a different bug.** It has never been true; that is [its own handoff](./triage-complete-never-true-HANDOFF.md). Do not try to fix it here, and do not gate placement on it.
8. **`npm run verify` may be red from a concurrent session.** Run the failing gate against *your* files before assuming the red is yours, and report pre-existing failures rather than silently fixing them.

---

## 5. Verification

- **Dogfood, by hand, at the bench — this is the acceptance test.** Open a carton at Arrival on `:3050`, scan a shelf barcode, confirm the placement lands, the toast names the shelf, the lane auto-fills, and **the next tracking scan still works**. That last one is the regression that matters.
- **Automated specs assert against the QA org** (`--project=qa-desktop`), never the dogfood tenant. Note the QA org's Unbox rail is empty; Arrival is the station with rows.
- **Unit-test the classification split** DB-free: location barcode → commit, tracking → fall through, `TBA…` → tracking (never a shelf), `LOC-` prefix → same unwrap.
- Then: does `staging_location_id` stop being zero? That number is the whole point of the exercise.

---

## 6. Out of scope — say no to these

- **The placement suggester / directed putaway.** Scoped in [`arrival-directed-staging-and-dock-osd-PLAN.md`](./arrival-directed-staging-and-dock-osd-PLAN.md) §1 and gated on [`arrival-door-decisions-staging-and-osd-GEMINI-RESEARCH-BRIEFING.md`](./arrival-door-decisions-staging-and-osd-GEMINI-RESEARCH-BRIEFING.md) Q1, which asks whether directed dock staging is a real industry practice at all. **Making placement recordable comes first and is worth doing regardless of that answer** — a suggester for a control nobody can use is worthless, and this handoff is what makes the suggester's question answerable with real data.
- Merging the three placement storages.
- Shelf capacity as a constraint — `locations.capacity` counts stocked SKU units, not staged cartons ([plan §1.2](./arrival-directed-staging-and-dock-osd-PLAN.md)).
- OS&D capture at the door (same plan, §2).
- Fixing `triage_complete`.
- Any change to the Unbox `stage` step's behaviour in Phase 1 — it is the reference, and it works.
