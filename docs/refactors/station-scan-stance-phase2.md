# Station scan stance — Phase 2 (preview card + display-edit)

Builds on [phase 1](./station-scan-stance-phase1.md). Preview stance now
*shows* what a scan would do. After a value lands, the operator can click it
to edit (display-edit).

## Preview result card

When `getScanStance() === 'preview'` and the operator submits (Enter / wedge
into the focused field):

- Live submit is **not** called (`submitTrackingScan`, testing/shipping
  submit, pack ship). Phase 1 gates stay.
- The value is classified with existing pure helpers (no new parser, no new
  API routes):
  - Unbox: `classifyUnboxScan` in `ReceivingUnboxScanBar.tsx` + armed mode
  - Testing: `classifyTestingScan`
  - Shipping: `getStationInputMode` / `detectStationScanType`
- A compact strip renders **under** the scan band (not a modal):
  - Eyebrow: `Preview`
  - Line: `Would search {Ticket|Tracking|PO|Serial|…}: {value}`
  - `Forced {type}` when a rail type is armed; `Auto → {type}` otherwise
  - Actions: **Scan it** (sets stance to `scan` and calls the real `onSubmit`
    once) and **Dismiss**
- `aria-live="polite"` on the card
- Classification is local/heuristic only

### Esc vs the card

1. Card open → Esc dismisses the card (does not un-arm)
2. Next Esc → Phase 1 release (armed type → Auto)
3. Already Auto, no card → Esc bubbles

`scan-esc-block` coordinates this with `useScanModeRelease` so a second
listener does not fight the first.

### Scan it → write

`StationScanBar.promoteToScan`:

1. Dismiss the card
2. `setScanStance('scan')` (sync module store)
3. Call the host `onSubmit` once — the preview gate sees `scan` and lets
   the live path run (`submitTrackingScan` / `runScan` / shipping submit)

## Display-edit

Shared `StationScanBar` prop `displayEdit?: boolean`.

- Default **on** for station bars (`hotkey && !showModeButtons`)
- Off when `hotkey={false}` or FBA Plan/Select mode buttons are showing
- After a successful preview decode **or** a committed scan value still in
  the field: show a read-only face (same `STATION_SCAN_BAR_INPUT_CLASS`
  typography) with a “click to edit” affordance
- Click face → focus the real input, select all
- Enter commits (preview → update card; scan → live submit)
- Esc in edit, value unchanged → back to the display face, **no** un-arm
- Esc from the display face (not editing) → Phase 1 type release
- HID wedge: focused input still receives keys. When the display face is
  showing, a `wedge-scan` event is claimed (`preventDefault`) and fills +
  focuses the input so scans are not dropped

## Gear vs stance (small leftover)

`ScanHotkeyControl` gear used `absolute inset-0` and stole hover clicks
from the Preview/Scan toggle. The full-slot gear is now visual-only
(`pointer-events-none`); a small corner chip is the hover hit target so
click-at-rest still toggles stance.

## Phone bridge

`usePhoneScanBridge` (Unbox) is gated with `isScanPreview()` — incoming
`phone_scan` messages do not call `submitTrackingScan` while Preview is
on. The phone UI will not get a `phone_scan_result` in that stance
(noted as a remaining gap if we want a preview echo later).

## Type keybinds (phase 3)

When the station scan input is focused (`data-station-scan-input`) **and**
the field is empty:

| Key | Action |
|---|---|
| `1` / `2` / `3` / `4` | Arm the nth type **after** Auto |
| `0` or `` ` `` | Release to Auto |
| `P` | Toggle Preview / Scan |

Unbox: 1 Ticket, 2 Tracking, 3 PO. Testing: 1 Tracking, 2 PO, 3 Serial, 4 SKU.
Shipping: 1 Tracking, 2 Amz Prep, 3 Repair, 4 Serial.

If the field has text, digits type normally (ticket numbers). Empty-field `P`
only — no Alt chord.

### HID wedge yield

`useScanTypeKeybinds` uses the same inter-key window as `wedgeReduce`
(`WEDGE_MAX_INTER_KEY_MS` = 50ms). A lone `1` after 50ms of silence arms
type 1. A fast `1`+more-chars burst is treated as a scanner: the swallowed
digit is flushed into the field and nothing is armed. Enter during the
pending window also flushes (scan, not arm).

Rail Auto tooltip + group aria: `1–3 type · Esc Auto · P preview` (or 1–4).
The `?` cheat sheet has a **Station scan bar** group.

## Remaining gaps

- Packing still has no type rail
- Optional `staff_preferences.stationScanStance`
- Phone preview echo (`phone_scan_result` is skipped in preview — gated, no substitute payload)
