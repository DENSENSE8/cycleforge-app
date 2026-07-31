# Receiving Serial journey — batch put-away chip HANDOFF

**Self-contained.** A new session needs only this file. Paste:

> Read `docs/todo/receiving-serial-journey-batch-chip-HANDOFF.md` and start at §3.

**Lane:** stay on the checkout’s branch. User owns commits — do not commit unless
asked. Attach to the user’s dev server on `:3050`; never start / restart / kill it.

**Status as of 2026-07-30 evening:** Serial journey is a top-level Receiving
Details tab; carton photos hoist once; batch put-aways fold to **one row** with
`· 2 units` in the subtitle. **Bug left:** that batch row’s CopyChip shows the
**bin** last-4 (`ARTS` from `PARTS` / Tech Room — Parts), not the **serial**.
Operator ask: show serial number(s) as the chip, not tech-parts / bin.

---

## 0. What already shipped (do not redo)

| Concern | Where | Behavior |
|---|---|---|
| Tabs | [`ReceivingDetailsStack.tsx`](../../src/components/station/ReceivingDetailsStack.tsx) | `Progress \| Items \| Serial journey` (`ReceivingTab` includes `'journeys'`) |
| Items tab | [`ReceivingItemsTab.tsx`](../../src/components/station/receiving/ReceivingItemsTab.tsx) | PO lines only — Unit journeys disclosure removed |
| Tab body | [`ReceivingSerialJourneys.tsx`](../../src/components/station/receiving/ReceivingSerialJourneys.tsx) | `useCartonSerials` → [`StationUnitJourneys`](../../src/components/station/workbench/StationUnitJourneys.tsx) |
| Merge SoT | [`merge-station-unit-journeys.ts`](../../src/components/station/workbench/merge-station-unit-journeys.ts) | Carton photo hoist (`arrival` / `unbox_carton`); `collapseCrossSerialBatchHops` folds same-minute sibling inventory hops into one `batch:…` row with `· N units` |
| Tests | [`merge-station-unit-journeys.test.ts`](../../src/components/station/workbench/merge-station-unit-journeys.test.ts) | Photo hoist + batch put-away with colliding last-4 (`…90882AE` / `…00582AE`) |

**Out of scope for this handoff:** Progress tab, single-unit Trace /
`SerialJourneySection`, Station Timeline section title copy (“Unit journeys”).

---

## 1. Current bug (reproduce)

1. Open Receiving Details on a carton with **≥2 serials** put away together
   (dogfood example: Bose Wave — serials ending `…90882AE` and `…00582AE`).
2. Open **Serial journey**.
3. See one **Put away** row (good) with subtitle
   `RECEIVED → STOCKED · Tech Room — Parts · 2 units` (good).
4. **Wrong:** secondary meta CopyChip is Tags + **`ARTS`** (bin barcode
   `PARTS` last-4) — looks like “tech parts,” not a unit id.
5. **Wanted:** Serial CopyChip(s) — unit identity via `SerialChip` / last-4 SoT,
   not `BinChip`.

Location already lives in the subtitle (`Tech Room — Parts`). The chip must not
duplicate bin as identity.

---

## 2. Root cause

In `collapseCrossSerialBatchHops`, when `count > 1`, the folded row **prefers a
shared bin ref**:

```ts
const sharedBin =
  refs.every((r) => r?.kind === 'bin' && r.value === refs[0]?.value)
    ? refs[0]
    : undefined;
// …
ref: sharedBin,
```

And when flattening buckets, **bin refs are preserved** over stamping the
serial:

```ts
item.ref?.kind === 'bin' && item.ref.value.trim()
  ? item.ref
  : { kind: 'serial', value: serial },
```

PUTAWAY from [`inventory-events.ts`](../../src/lib/timeline/inventory-events.ts)
sets `ref.kind === 'bin'` when `bin_barcode` is present — so batch put-aways
always land on the bin chip path. Station anatomy (`metaTrail` + `refInline`)
renders that as `BinChip` → last-4 `ARTS`.

---

## 3. Fix (do this)

**Goal:** batch (and single) put-away rows on the carton Serial journey feed
show **serial** CopyChips, never bin as the identity chip. Bin/location stays
in the **subtitle** only.

### Preferred approach (compose SoT, small blast)

In [`merge-station-unit-journeys.ts`](../../src/components/station/workbench/merge-station-unit-journeys.ts):

1. **Flatten stamp:** always attach `ref: { kind: 'serial', value: serial }` for
   per-serial inventory rows on this feed (drop the “preserve bin” branch). Bin
   label already comes from the inventory adapter subtitle.
2. **`collapseCrossSerialBatchHops`:** when folding `count > 1`:
   - Collect the distinct serial strings from the grouped rows (from each
     row’s serial `ref.value`, or from the `serial:…` id prefix).
   - **Do not** set `ref` to a bin.
   - Chip UX for N serials (pick one and test against the Bose carton):
     - **A (simplest):** `ref: undefined` and keep `· N units` in subtitle —
       already readable; no misleading chip. *Operator explicitly asked for
       serial CopyChip though — prefer B or C.*
     - **B (recommended):** set `ref` to the **first** serial only is wrong
       (colliding last-4). Instead extend the row so the secondary meta can
       show **multiple** `SerialChip`s, **or** one chip whose value is
       unambiguous when last-4s collide (e.g. show more than last-4 — only if
       CopyChip SoT already supports a longer preview; do not fork a page-local
       chip).
     - **C (pragmatic):** `ref: undefined` + subtitle
       `… · 2 units · 82AE · 582AE` using last-4 (or longer on collision) —
       only if multi-chip is too large for this pass. Still better than `ARTS`.
3. Update tests in `merge-station-unit-journeys.test.ts`:
   - Batch put-away with `bin_barcode: 'PARTS'` → folded row must **not** have
     `ref.kind === 'bin'`.
   - Assert serial identity is present (ref serial, multi-ref, or subtitle
     last-4s — match the chosen UX).
   - Keep: one row, `· 2 units`, colliding last-4 case
     (`070315F60590882AE` / `070214960600582AE`).
4. If TimelineItem only supports a single `ref` today and multi-chip needs a
   type/renderer change, **grow the SoT** in
   [`types.ts`](../../src/lib/timeline/types.ts) +
   [`EventTimeline.tsx`](../../src/components/ui/EventTimeline.tsx) (e.g.
   optional `refs?: TimelineRef[]` rendered as a chip cluster on
   `refInline` station anatomy) — do not invent a receiving-only chip row.

### Never

- Do not put bin / `PARTS` / `ARTS` back on the identity chip for this feed.
- Do not reintroduce N× `SerialJourneySection` embeds under Items.
- Do not raise knip / DS ratchet baselines.
- Do not start the dev server.

---

## 4. Verify

```bash
npx tsx --test src/components/station/workbench/merge-station-unit-journeys.test.ts
npm run verify
```

Manual: Receiving Details → **Serial journey** on the multi-serial Bose carton —
one Put away row; chip(s) are **serial**, not `ARTS`; subtitle still has
Tech Room — Parts · 2 units; Arrival package photos once under it.

---

## 5. Paste-ready start prompt

```
Read docs/todo/receiving-serial-journey-batch-chip-HANDOFF.md and implement §3.

Context: Receiving Details → Serial journey already folds batch put-aways into
one row with "· 2 units". That row wrongly shows BinChip last-4 "ARTS" (PARTS).
Show serial CopyChip identity instead; keep location in the subtitle only.

Stay on this branch. Do not commit unless asked. Attach to :3050 — never start
the dev server. Run merge-station-unit-journeys tests + npm run verify before done.
```
