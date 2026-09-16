# PLAN — the mobile scan kernel

One lens, one chrome, one law. Written 2026-09-11 in lane `prod` after the
camera stopped being a bottom sheet.

## Phase 0 — the camera is a PANEL, not a sheet · SHIPPED

`src/components/mobile/station/MobileCameraPanel.tsx` (new) is the SoT chrome
for "a lens is open on this phone". `MobileCaptureWindow` — the SoT lens every
identification kernel mounts — composes it. `MobileStationSheet` keeps only the
location-BIND surface, which is genuinely a sheet.

What changed, and why each piece was wrong:

| Was | Now | Why |
| --- | --- | --- |
| drag-to-dismiss + grab bar (`MobileStationSheet`) | fixed panel, no drag | the only outcome of that gesture was losing the lens, one-handed, holding a box |
| type-a-label pinned `absolute left-2 top-1.5`, alone in a corner | bar slot 1 | three controls scattered in three corners with no relationship to each other |
| status pill `absolute right-2 top-1.5`, alone in another | bar slot 2 (centre) | same, and it moved whenever the lip radius changed |
| dismiss = a 4px pill that was secretly a button | header slot 3: **Done** | the labelled way out; `Escape` is its keyboard twin |
| status hidden while typing | status always painted | a settling commit is exactly what you need while keying the next label |

Measured on iPhone 14 (390×664) against the lane at `:3077`:

```
panel 305px (= 46svh) · bar 36px ABSOLUTE at the panel top · stage 305px
video top == panel top, height == panel height  (the feed runs under the bar)
bar  position absolute · backdrop-filter blur(12px) · bg scrim @ 0.55
slots  [type 28×28 paint]  [status centred, flex-1 truncate]  [Done 32 paint / 44 hit]
```

The bar FLOATS, so the stage is the whole panel and the picture runs edge to
edge under it — the tape's focus item keeps the pixel it has always held
(`STATION_CAMERA_PANEL_HEIGHT_CLASS`).

Done stops the lens and collapses to the 44px emerald re-arm CTA
(`Button variant="success"`, no longer hand-rolled emerald literals). The top
bar's `New` still re-arms through `armRequest`.

## Phase 0b — the bar IS the instrument, the slot is a count · SHIPPED

Two corrections, one idea: everything that row says is *about the camera*, so
it belongs ON the camera.

**(a) The row is glass on the feed, not a band beside it.** The first pass gave
it its own opaque ground above the picture plus a 2px lane above that. An
operator's eye had to leave the viewfinder to collect information about the
viewfinder, and the two strips ate 38px of a fixed-height panel — 38px of lens.
Now: one `bg-scrim/55 backdrop-blur-md` bar, `absolute inset-x-0 top-0` inside
the stage. Controls are INK only (`Button variant="glass"`,
`IconButton tone="glass"`) — the bar owns the scrim exactly once, because a
control with its own `bg-scrim` paints a box inside a box, three alphas on one
36px row (caught in the screenshot, fixed in the map).

**(b) `"2 in flight"` was the wrong channel.** 11px caps read by someone whose
eyes are on the BOX; its length changes with the number, so the controls beside
it twitch; and peripheral vision — the only attention spare mid-scan — cannot
read text at all. It can detect a 390px bar changing luminance instantly.

So the glass carries it (`cf-scan-pending` in `globals.css`, `pending` prop on
`MobileCameraPanel`):

| state | the bar | slot |
| --- | --- | --- |
| clear | plain glass | `14 in` |
| pending ≥ 1 | breathing `fill-info/35` wash, 1.2s ease-in-out alternate | `2 pending · 14 in` |
| offline / dead lens | static `fill-danger/30`, **no motion** | `Offline` |
| typing | opaque `surface-card`, neutral ink — no picture to float on | unchanged |

Four laws it had to satisfy, and how:

1. **Motion is bounded by a real event.** It starts on a commit and stops when
   the queue empties — the information is the *stopping*. A loop that runs
   whether or not anything is happening is the `ScanSurface` sweep line, which
   Phase 1 deletes.
2. **Band law (LAWS §M).** Duration is `--cf-motion-status`, which is `0s`
   everywhere except a Band 2 region. The wash stamps `data-motion="2"` on
   ITSELF, so the heartbeat is licensed without licensing status motion for the
   rest of the station, and reduced motion collapses it to a static tint.
3. **Motion is never the sole channel.** The count still reaches AT through the
   `role="status"` slot; the wash is `aria-hidden` and sits under the ink.
4. **Opacity, never `background-color`.** Paint properties are not
   compositor-safe, and animating the bar's own fill would fight the scrim the
   white ink depends on. The wash is a separate absolutely-positioned layer.

CSS, not the motion engine: this file is on the phone's critical graph and the
engine is ~48KB gz (same argument as `Button`'s `PRESS_FEEDBACK`). Opacity
only — compositor-safe.

Verified against `:3077`, iPhone 14:

```
live     bar absolute · blur(12px) · scrim 0.55 · video top == panel top
clear    wash absent                                   "0 in"
pending  cf-scan-pending 1.2s ease-in-out, inset 0     "1 pending · 0 in"
         getAnimations() -> running, alternate, iterations Infinity
typing   bar static, opaque #fff, no video, stage 68px  slots unmoved
offline  static danger tint, no animation               "Offline"
reduced  animationName none                            count still painted
```

Rejected: a spinner in the slot (spins while idle = lies), a progress ring
around Done (couples "leaving" to "working"), animated numerals (still text,
still unreadable peripherally), and an outcome flash on the bar — the outcome
already has a home in the tape's focus row (`STATION_TONE_GROUND`), and two
places saying the same thing is how one of them goes stale.

New DS surface this needed: `BUTTON_VARIANTS.glass` +
`IconButton tone="glass"`, pinned by `button-variants.test.ts` (7 pass). Chrome
on live media had no intent, so two call sites had hand-rolled
`bg-scrim/55 text-white backdrop-blur` — grow the map, never override the fill.

## Phase 1 — one lens, one chrome (next)

Every camera on the phone should be this panel or a deliberate exception.

- `src/components/mobile/ScanSurface.tsx` paints corner brackets and a
  2.4s sweep line. ZXing decodes the WHOLE frame — the brackets describe an aim
  box that does not exist, and the sweep implies a scanline that is not how
  `decodeFromConstraints` works. Delete both; mount the panel. Callers:
  `app/m/(shell)/pick/[orderId]/_picker/PickerTaskCard.tsx:119`,
  `components/auth/SignInQrScanDialog.tsx:208`.
- `components/mobile/receiving/MobilePoQrScanSheet.tsx` is a third camera
  chrome with its own `useBarcodeScanner({ dedupMs: 1500 })`. Fold into the panel.
- **Torch is missing on the SoT camera.** `useBarcodeScanner` exposes
  `toggleTorch`/`torchOn` (`src/hooks/useBarcodeScanner.ts:270`) and only
  `ScanSurface` ever wired it. A dock at night is the case the panel cannot
  currently serve. Add it as a second leading control, mounted ONLY when
  `track.getCapabilities().torch` is true — never a dead button.
- `components/mobile/redesign/Receive.tsx:93` and `ScanInput.tsx:65` each own
  another scanner instance. Two `getUserMedia` owners contend; audit that no
  route can mount two at once.

## Phase 2 — the decode engine

`src/hooks/useBarcodeScanner.ts` asks for 1920×1080 (`:154`) with
`TRY_HARDER` (`:136`) and decodes full frames on the main thread. That is the
hot, slow path on a warehouse Android.

1. Native `BarcodeDetector` fast path where it exists (Chrome/Android), ZXing
   as the fallback — same `UseBarcodeScanner` surface, no caller changes.
2. Crop to a centre ROI before decode; full-frame `TRY_HARDER` is why a small
   DataMatrix needs a long hold.
3. Keep the continuous-autofocus `applyConstraints` block (`:190`) — it is why
   close labels sharpen at all.

## Phase 3 — offline truth, per station

`useArrivalStation` deliberately has **no** outbox: an arrival that never
reached the server is not a fact, and queueing it would tell the operator a
carton is logged when it is not. Scan-out queues, because the box genuinely
left. Keep that asymmetry; the work is to make the status line act on it —
today it reads `Offline — nothing is recorded`
(`components/mobile/scan/MobileScanIdentify.tsx:264`) and nothing else happens.
The panel's middle slot is the place to say "re-scan these 3 when you are back".

## Phase 4 — a tripwire, because there is none

No test covers the mobile capture surface. Add
`src/components/mobile/station/camera-panel-law.ts` + a `.test.ts` asserting:

- no `drag` / `PanInfo` on the camera path (the sheet may not come back);
- the header has exactly three slots, in order, and the leading slot is never
  simultaneous with the typed field;
- the stage carries the `<video>` and nothing else (`chromeOnFeed === 0`) apart
  from the two states that REPLACE the picture (warm-up, dead lens);
- exactly one `useBarcodeScanner` owner per mounted station.

## Phase 5 — defect found while shooting this

`MobileStationTapeItem.tsx:290` is a `<button>` row disclosure that contains the
Undo `Button` at `:317` — React logs *"In HTML, `<button>` cannot be a
descendant of `<button>`. This will cause a hydration error."* on every
`/m/scan` load. Pre-existing, untouched by Phase 0, real.
