# Station scan stance — Phase 1

Three independent controls on the station scan strip:

| Control | Where | States | What it does |
|---|---|---|---|
| **Stance** | Left icon | `scan` (default) / `preview` | Scan commits on Enter. Preview decodes only — no write. |
| **Type** | Right rail chips | Ticket / Tracking / PO / … | Forces the next Enter/scan to that lookup. Click the armed chip to release. |
| **Auto** | First right-rail chip | Selected when `armedMode === null` | Visible selected state (not “nothing armed”). Neutral/faint hue. |

Type no longer lives in the left icon. Packing has no type rail; it still gets the Preview/Scan left icon via `ThemedStationScanBar`.

## Esc

When the station scan input is focused (`data-station-scan-input`) **and** no overlay owns Esc **and** the hotkey-rebind popover is not capturing:

- Type armed → release to Auto. Typed value is kept.
- Already Auto → Esc bubbles (overlay / nav-leader).

Insert (reclaim, keep text) and ⌘. / Ctrl+. (clear + focus) are unchanged. HID wedge bursts are not intercepted via React `onKeyDown` for alphanumeric keys — Esc is handled in one window capture listener (`useScanModeRelease`) after the overlay-stack check.

## Preview write-block (phase 1)

`StationScanBar` drops `onSubmit` when stance is `preview` and shows a short `aria-live` / title (`Preview: would search {value}`). Hosts that submit outside the form (Testing/Shipping “arm with text”, Testing scan sink) also consult `isScanPreview()` and skip the live path.

No preview result card yet.

## Phase 2 (not this pass)

- Preview result card under the bar
- Display-edit of the decoded value
- `1` / `2` / `3` type keybinds
- Packing type rail (none today)
- Optional `staff_preferences.stationScanStance` (phase 1 is session + localStorage)
