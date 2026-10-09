# Handoff — Location → Park tote: one simple flow

Owner ask (2026-10-08): "There is so much bloat. A scan identification kernel
that's very simple. All that's needed: scan location → park tote → toggle to move
all products into the parked tote, or select only a few."

This is a **UX simplification** of work that already ships. The server is done
and proven; the job is to cut the phone surface down to the flow below.

## The flow (the whole thing)

```
Scan location  →  Location record  →  [Park tote]
                                         │
                                         ├─ Scan tote   (camera / scanner; "Type number" → pad fallback)
                                         │
                                         ├─ Move all items into tote   [toggle, ON by default]
                                         │     OFF → tick the items to move (photo-first rows)
                                         │
                                         └─ [Park H-381 · move 26 units]  → toast, back to scan
```

1. **Scan location.** One input (camera + hardware wedge + typed). Any spelling
   resolves (`c02094`, `C-02-09-4`, `c 2 9 4`). Nothing else on this screen.
2. **Location record.** Items at the location. Bottom verb: **Park tote**.
3. **Park tote sheet — ONE sheet, top to bottom:**
   - **Tote** — scan field (camera on). Below it, the last tote as one tap
     ("H-381 · last tote"). A small **Type number** link opens the number pad
     *in place of* the scan field (the pad is never on screen by default).
   - **Move all items into tote** — switch, ON by default, remembered.
     OFF reveals the item list (photo-first, checkbox, count coloured by the
     stock-qty token); nothing is ticked until the operator ticks.
   - **One primary verb**, its label says exactly what happens:
     `Park H-381` (toggle off, nothing ticked) ·
     `Park H-381 · move 26 units` (all) · `Park H-381 · move 3 units` (some).
4. **Done.** Toast + haptic, sheet closes, the scanner is ready for the next
   location label. No done screen, no Next/Scan-location choice screen.

Parking is always part of the action (the tote is parked at the scanned
location). Moving items is the toggle. That is the whole model.

## Cut (bloat to remove)

From `src/components/mobile/v2/stock/LocationToteSheet.tsx`:
- The 2-step wizard (Step 1 "Select items" → Step 2 "Scan the tote") and the
  separate number-pad step → one sheet as above.
- **Only park tote** verb and the Move/Park mode split → parking is always on.
- **Also park tote here** switch (`parkOnLoad` pref) → gone; park is the action.
- The done screen (`location-tote-done`, Next · face / Scan location verbs) →
  toast + close.
- "Auto-add all items" naming/semantics → becomes "Move all items into tote".
- Item list on screen when moving all → list only renders when the toggle is OFF.

From the location record (`MobileV2LocationRecord.tsx`):
- Dock label switching between "Load tote" / "Park tote" → always **Park tote**.

From the scan screen (`src/components/mobile/scan/MobileScanIdentify.tsx`):
the location path must stay one input → one record. Keep the "Did you mean"
chips (they are the typo recovery), drop anything else the location-only
intent does not need. Do NOT restructure the inbound/outbound/QC kernels — out
of scope.

## Keep (contracts — do not change)

- **Server: `POST /api/handling-units/[id]/load`**
  (`src/app/api/handling-units/[id]/load/route.ts`, domain
  `src/lib/inventory/load-tote.ts`). Body
  `{ locationCode, lines: [{ sku, qty }], park: boolean, idempotencyKey }`.
  All-or-nothing; `409` + `short[]` when the shelf changed. Use it with
  `park: true` for both "all" and "some".
- **Park only** (toggle OFF, nothing ticked): existing
  `PATCH /api/handling-units/[id]` `{ action: 'move', locationCode, ... }`.
- **Typed location resolution**: `unwrapScannedLocation` /
  `locationCodeCandidates` / `printedLocationCode` (`src/lib/barcode-routing.ts`),
  server `resolveLocationBarcode` / `suggestLocations`
  (`src/lib/locations/location-lookup.ts`). Typed codes never register a
  location; only printed labels do.
- **Stock count colour**: `stockQtyToneClass` (`src/design-system/tokens/stock-qty.ts`)
  — red 0, yellow ≤10, surface ink otherwise.
- **Number pad**: `MobileDigitPad` (`src/components/mobile/keypad/`), shared with
  `MobilePairQty`.
- **Remembered tote**: localStorage `cf.mobile.location-tote.v1` — keep `toteId`
  and the move-all toggle; drop `parkOnLoad`.
- `MobileV2ActionSheet` (`pinned` slot; dock keyed by `dockLabel` so a new
  floor never inherits the double-tap lock).

## Lane rules (AGENTS.md)

Test only on `http://localhost:3050` when it is this worktree (pin
`lane-prod`; the prod lane runs `next-server` directly on 127.0.0.1:3050 from
`cycleforge-lanes/prod`, so there is no `x-switch-lane` header — confirm with
`readlink /proc/<next-server pid>/cwd`). Never start/stop lanes.

## Acceptance

Update `scripts/e2e-location-tote.mjs` (`pnpm test:e2e:location-tote`) to the
new flow and make it pass; keep its restore-in-`finally`:

- Typed spellings land on the real location (already covered — keep).
- **Park tote** opens ONE sheet: scan field visible, number pad NOT visible,
  item list NOT visible while "Move all" is ON.
- **Type number** swaps the scan field for the pad; `999999` → "No open tote",
  primary disabled; `381` → label `Park H-381 · move N units`.
- Toggle OFF → item list appears, nothing ticked, label `Park H-381`; tick one →
  `Park H-381 · move <qty> units`.
- `E2E_MUTATE=1`: Move all parks + moves everything, sheet closes with a toast,
  shelf counts 0, tote counts up; then the script restores the stock.
- No page errors. `pnpm verify:fast` green except files you did not touch.

## Files

| Role | Path |
|---|---|
| Sheet to rewrite | `src/components/mobile/v2/stock/LocationToteSheet.tsx` |
| Location record (dock verb) | `src/components/mobile/v2/stock/MobileV2LocationRecord.tsx` |
| Scan kernel (location path) | `src/components/mobile/scan/MobileScanIdentify.tsx` |
| Load API / domain | `src/app/api/handling-units/[id]/load/route.ts`, `src/lib/inventory/load-tote.ts` |
| Location lookup | `src/lib/barcode-routing.ts`, `src/lib/locations/location-lookup.ts`, `src/lib/locations/location-miss.ts` |
| Pad / sheet frame | `src/components/mobile/keypad/MobileDigitPad.tsx`, `src/components/mobile/v2/MobileV2ActionSheet.tsx` |
| Stock colour | `src/design-system/tokens/stock-qty.ts` |
| E2E | `scripts/e2e-location-tote.mjs` |
