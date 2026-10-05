# Phase 0 — Parity audit: web `/m` vs native iOS (Arrival + Unbox)

Run: `docs/handoff/PROMPT-ios-arrival-unbox-parity-2026-10-04.md`, Phase 0 (read-only). Date 2026-10-04.
Web reference: worktree `prod` at `http://localhost:3050`. App: `prometheus:~/Projects/cycleforge-ios` (read only; nothing in it was edited).

| Part | How it was produced | Where |
|---|---|---|
| (a) Behaviour diff | 26-step table, web `file:line` vs `ios:file:line` | Appendix A |
| (b) Display diff | 22 states, web (headless Chromium 390×844 @3x, admin cookie, every write `tab.route`-fulfilled) vs app (the app's own SwiftUI views in a throwaway hosted test, same JSON through the app's transport + payload types). AE (`compare -metric AE -fuzz 10%`) + RMSE per pair | Appendix B; images `screens/phase0/*.png` (66 = 22 × web/app/diff), data `screens/phase0/data/*.json` (19) |
| (c) Token inventory | web tokens used by these screens; every app literal mapped to its web token | Appendix C |
| (d) Scan corpus | 1538 real values, SELECT-only from the `.env` DB, classified by the real web `routeScan` / `arrivalScanIntent` / `normalizeTracking*` | Appendix D; `corpus/scan-corpus.json` |

Integrator spot-checks (re-read source, not trusted from subagents): verdict words (Appendix A row 9 corrected — first draft cited the wrong file), lookup-po wire body (row 8 corrected), app route arms, the four defects, screenshot contact sheet (scan-idle, pair-found-urgent, unbox-live: real renders on both sides).

## Headline findings

1. **Defect 1 confirmed, and it is bigger than reported.** The real web functions refuse **207 of 455 carrier-shaped values (45.5%)** at Inbound. Not only 420+ZIP / FedEx 96… / TBA, but also USPS IMpb 21/26, FedEx 34-digit with any prefix, FedEx 2D payloads, regional/3PL and UPU S10 numbers, multiline pack-slip reads, and glued double scans. Separately, 48 eBay order numbers (`04-14902-05990`) are **wrongly accepted** as FedEx tracking. Root: `src/lib/barcode-routing.ts:77-84` (shapes 10/12/15/20/22/1Z only), letter fallback → `bin` (`:296`), digit fallback → `sku` (`:304`), and `src/lib/scan/mobile-arrival-door.ts:82-95` refuses anything not carrier/receiving. The app ports the same bug (`ios:Sources/CycleForgeClient/BarcodeRoute.swift:141`, `:224-248`).
2. **New web defect: a refused scan at Inbound shows nothing.** Typing/wedging `96119123456789012345678` on web `/m/scan` produces no row and no message — `routeScan`→`sku`, `landScanIdentify`→`settle` (`src/lib/scan/identify-land.ts:49-50`). The app at least says "Not received". (Display B, scan-refused-local.)
3. **Defect 2 confirmed (app only).** `ScanStation.swift:216-222` primes the 6 s gate before `DoorIntake` refuses locally, so the retry says "Already scanned — not sent again." The web has no submit gate (camera-only 6 s dedupe, `MobileCaptureWindow.tsx:19`).
4. **Defect 3 confirmed.** App result card and Recent rows are passive views (`ScanView.swift:204-298`); the app has no live tape. A locally refused value never calls `lookup-po`, so no carton exists and Unbox (`UNBOX_QUEUE_SQL`, `arrival-package.ts:601-635`, `status='received'`) can never show it. Fixing defect 1 (send to the server resolver) is what lets those packages reach Unbox.
5. **Defect 4 confirmed on both.** `GET /api/receiving/unbox-next` ignores query params; `readUnboxQueue` has fixed order; neither UI has Sort by or search.
6. **Verdict words differ.** Web tape: "Arrived" / "Already arrived" / "Not an arrival" / "Scan failed". App: "Arrived · Found|Unfound" / "Already logged" / "Not received" / "Not recorded".
7. **Display distance.** Scan ≈ 65% pixels differ (different layout: web = Recent tape + docked bottom capture window; app = top camera box + one card). Pair 20–23% (card, urgency control, scan bar built differently). Unbox lists 2.7–9% (grouped list vs `MobileRecordCard`). Placed/loading/empty/error 0.5–1.6%. The app uses no web tokens: SF Pro/Mono vs Inter/IBM Plex Mono, system `.green/.orange/.red`, `.bold` (700) above the web's 600 ceiling. The existing `packages/design-tokens` generator emits only modes/lifecycles and the app does not consume it.
8. **Already the same:** scan-resolve correlation, preview-scan, lookup-po wire body, urgency contract (Urgent→0, Not urgent→2), place contract, 900 ms return (app pops instead of replace), label-photo upload/gate/compression, Outbound scan-out + Undo, offline sentence, Unbox endpoint + server order + row words.

## Numbered change list for Phases 1–5

Tags: **web** / **app** / **both**. Strike or add items at STOP GATE 0.

### Phase 1 — Scan classification parity (web lib first, then port)
1. **web** — Door rule: refuse locally only *confirmed house* shapes (GS1 `01`/`414`, `U-` serial, `X00` FNSKU, 4–9 digit SKU, location/bin codes, product names); `R-` stays carton; everything else goes to the server's last-8 resolver. `mobile-arrival-door.ts:82-95`.
2. **web** — `routeScan` / `tracking-format`: recognise USPS 420+ZIP5/ZIP9 (incl. `0299` filler, `<GS>`/`]` separator), USPS IMpb 21/26, FedEx 34-digit any prefix (tracking = last 12), Amazon `TBA\d{10,13}`, UPU S10 (`AA#########AA`), regional (UniUni `UUS`/`USC`, YunExpress `YT`, GoFo `GFUS`, `JJD`, `SWX`…). `barcode-routing.ts:77-84,296,304`.
3. **web** — Unwrap FedEx 2D payloads (`[)>01…`, `0102…FDEG`), take line 1 of multiline pack-slip reads, take the first known envelope from a glued double scan. Corpus: 12 + 20 + 46 refused.
4. **web** — Stop routing eBay order numbers `NN-NNNNN-NNNNN` as FedEx tracking (48 false accepts).
5. **web** — Every Inbound scan settles a visible tape row: a refused value shows "Not an arrival" instead of nothing (`identify-land.ts:49-50`, `MobileScanIdentify.tsx:386-426`).
6. **web** — Unit tests built from `corpus/scan-corpus.json`: `class=carrier` never refused, `class=house` keeps its refusal, eBay order numbers not tracking.
7. **both** — VOCABULARY gets **Inbound**, **Outbound**; switcher `In | Out` → `Inbound | Outbound` (`MobileScanHeader.tsx`, app `ScanView`).
8. **app** — Port into `BarcodeRoute.swift` / `ArrivalScanIntent`, driven by a generated `web-route-parity.json` over the whole corpus (extend `Scripts/render-web-parity.mts`).
9. **app** — Repeat gate: never gate a locally refused value; a gated repeat re-shows the previous result (`ScanStation.swift:216-222`).
10. **both** — App adopts the web tape verbs: "Arrived" / "Already arrived" / "Not an arrival" / "Scan failed" (`arrival-station-tape.ts:16-21` vs `ScanView.swift:242-248`), pinned by fixture.

### Phase 2 — Shell chrome and tokens
11. **web** — Generator script emitting `CycleForgeTokens.swift` from `src/design-system/tokens/**`, `themes/light.ts`/`dark.ts`, `typography/presets.ts`: colours (light + dark), CF Type roles (12–24 pt, weight ≤ 600, tracking), spacing scale, radii (0/4/6/8/12/16/9999), borders, elevation, bar metrics (52/56/44/36). Spec in Appendix C §4.
12. **web** — Second generator: vocabulary + destination labels for these screens.
13. **app** — Scan header = `MobileScanHeader`: apps button, title, `Inbound | Outbound` pill, `View | Operate` pill, one row (`ScanView.swift:35-41,75`).
14. **app** — Shell top bar = `MobileV2TopBar` (switcher left, title, scan CTA right; Unbox title "Unbox next"); detail bar = `MobileV2DetailTopBar` (X, subtitle "Pair to a location", mono "Package {id}", scan button) on Pair.
15. **app** — Replace system colours / text styles / `.bold` with generated tokens everywhere on these screens (Appendix C table 2).
16. **app** — Cues per verdict matching `playScanFeedback` (`success` for arrived, `reject` otherwise; `MobileScanIdentify.tsx:166`).

### Phase 3 — Arrival screens identical
17. **app** — Scan: docked bottom capture window with `T · status · ✓` strip and status words "Camera off" / "Offline" / "N pending · M in"; typed entry behind `T`, field labelled "Label"; no-camera copy "No camera found on this device." + "Try again".
18. **app** — Port the Recent arrival tape (server-seeded history + session rows, verb-as-title rows, tone rail, chevron); the latest result and every row open the package. **web** — confirm every tape row opens on web too, including the new refused rows from item 5 (they have no `receivingId` until the server resolves).
19. **app** — Pair: flat package section with rules; tracking one line `break-all`; Found neutral / Unfound amber pill; item lines "`N` × title" (no photo tile, SKU, "Qty"); `IdentifierToggle` urgency pill; "Photo the label" text link; single-line "Scan any location label" bar with camera button (no always-on 160 pt viewfinder, no "Place" button); placed = eyebrow "PLACED" + title on the plain panel; loading = text only.
20. **app** — Label photo: web studio header "Arrival · package" + mono tracking, "Device camera" / "Choose photos", "0/10 new" counter, empty box, ✓ done, amber no-camera notice.

### Phase 4 — Unbox identical + Sort by and search
21. **web** — `arrival-contract.ts`, `readUnboxQueue`, `GET /api/receiving/unbox-next`: `sort` = Urgent first (default) / Oldest first / Newest first / Location / Unfound first; `q` over title (`resolveSkuIdentityTitle` / `SKU_CATALOG_JOIN_ON_SQL`), tracking (+ last 8), order #, seller. Unit tests.
22. **web** — Sort by + search controls in `MobileV2UnboxNext.tsx` at the `ds contract` placement.
23. **both** — Row tap opens Pair: web today opens the record `/m/r/{id}` (`MobileV2UnboxNext.tsx:82`), app opens Pair (`UnboxView.swift:37-39`). See question 1.
24. **app** — Rows as `MobileRecordCard`: urgent left rail, status pill on the identity line, "From" label, sans tracking, "Unfound" in ink, count header in body ink; empty/loading/error top-aligned, no icon/spinner, error copy verbatim with the secondary "Try again".
25. **app** — Sort by + search mirrored at the same placement.

### Phase 5 — Ship and guard
26. **both** — `pnpm parity:ios`: regenerate route-parity json, fixtures and token file into the Mac project, run `swift test` over ssh, fail on drift; includes a corpus guard "refused carrier values = 0" (today 207).
27. **both** — Keep the Phase 0 snapshot rig as the display check: web `tab.route` smoke over `screens/*/data/*.json` + a hosted `ParitySnapshotTests` in the app (needs a `ScanView` injection init), scored with AE.
28. **web** — Deploy: staging copy of `dpl_368FQQpbLnDhUGCDoFssfNYhbaj5` + overlay of this run's changes only; preview → smoke → promote; record id + rollback. **app** — GUI `Scripts/device-run.sh` install on the Air, backup to avion.

## Risks found

- **Overlay drift in `barcode-routing.ts`.** Production (`be57ca188`, per `BarcodeRoute.swift:3-11`) lacks the worktree's movable-rack arm (`RK12-3`, `canonicalRackCode`) and `bin-paired-order`. Overlaying the worktree file in Phase 5 ships those too. The app intentionally mirrors production today.
- **Another session is editing `src/lib/barcode-routing.ts` right now** (uncommitted: support-ticket redirect → `supportTasksHref`). Phase 1 edits the same file; changes must merge, not overwrite.
- **Lane outage 12:20–12:50:** every `/api/*` on `:3050` returned 500 (`src/lib/support/conversation/mirror-bridge.ts:28` → missing `./ingest`, another session's untracked work). Recovered; early web captures used routed fixture JSON (labelled in Appendix B).

## Open questions for the operator

1. **Unbox row tap.** The Definition of done says "Tapping a row opens Pair" on both surfaces; the web opens the package record today. Change the web to Pair (`/m/r/{id}/place`)?
2. **Typeface.** The web serves Inter + IBM Plex Mono. Bundle both in the app (OFL), or accept SF Pro/Mono with the web's sizes and weights?
3. **Dark mode.** Web `/m` follows the operator's theme (dark palette exists); the app is locked light (`CycleForgeFloorApp.swift:27`). Generate both palettes and follow the same setting, or stay light-only?
4. **Label photo.** The web studio is multi-photo with a library picker ("0/10 new"); the app is a single gated shutter shot. Port the full studio, keeping the app's frame gate?
5. **Haptics.** iOS Safari drops `navigator.vibrate`, so the web is silent-to-touch on iPhone; the app vibrates. Keep app haptics (mapped to the web's cue kinds)?
6. **Malformed 1Z (67 values, mostly hand-typed fakes).** Under item 1 they go to the server resolver instead of refusing locally. OK?
7. **Production base.** Phase 1 changes the door rule. Ship it on the production `routeScan` (no rack arm), or include the worktree's rack arm in the deploy?

## Operator rulings at STOP GATE 1 (2026-10-04, binding for Phases 2–5)

- **Q1 Unbox row tap:** opens the purchase-order information display (Phase 4), not Pair.
- **Q2 Typeface:** IBM Plex Mono removed from the web; Inter everywhere (`font-mono` now resolves to Inter with tabular figures). The iOS app uses the iPhone system font at the web's sizes and weights, never monospaced.
- **Q3 Dark mode:** not ruled. Tokens carry both schemes; the app stays light-only.
- **Q4 Label photo:** not needed. Removed from the app entirely and from web Pair (the "Photo the label" link). Phase 3 item 20 is struck.
- **Q5 Haptics:** yes, the app vibrates on every scan cue.
- **Q6 Junk / unconfirmed values:** sending them to the server resolver is OK.
- **Q7 Production:** ship now (dogfood). Production already had the rack arm.
- **New:** when a carrier barcode won't scan, typing the **last 8 digits** at Inbound runs the full door flow on both surfaces (typed input only; a scanned 8-digit value is a PO number and stays refused).

---

# Appendix A — Behaviour diff (0a)

### Phase 0(a) Behaviour Parity Audit: Web (`/m`) vs Native iOS

Date: 2026-10-04  
Status: Read-only parity audit complete  
Web reference: `https://app.cycleforge.ai` / `/home/michaelgarisek/Projects/cycleforge-lanes/prod` (`:3050`)  
iOS app: Mac host `prometheus`, `~/Projects/cycleforge-ios` (`Sources/CycleForgeClient`, `Sources/CycleForgeFloor`, `App/Sources`)

---

#### 1. Executive Summary

This audit compares the end-to-end behavioural mechanics of the mobile web application (`/m`) against the native SwiftUI iOS application across **Arrival** (door scan → classify → resolve → intake → verdict → repeat gate → handoff → Pair → urgency → place → 900 ms return → label photo → back) and **Unbox** (queue fetch, ordering, row rendering, row tap, refresh).

All four known operator-reported defects are **CONFIRMED** with precise code citations on both sides.

---

#### 2. Four Known Defects: Confirmation & Evidence

##### Defect 1: Carrier Barcodes Refused at Inbound
- **Reported issue:** Scanning carrier barcodes at Inbound results in *"Not received · Nothing arrives under a product label"* or *"Nothing arrives under a bin label"*. Specifically:
  - USPS `420` + ZIP + tracking (`420900019361289711068322544977` → 30 digits)
  - FedEx Ground `96…` (`96119123456789012345678` → 23 digits / 34 digits)
  - Amazon `TBA…` (e.g. `TBA318274650012`)
- **Status:** **CONFIRMED (Web & iOS App)**
- **Evidence & Root Cause:**
  1. **Web (`src/lib/barcode-routing.ts:77-84, 296, 304`):**
     - `CARRIER_TRACKING_SHAPES` only accepts lengths 10, 12, 15, 20, 22, and `1Z...`. 30-digit USPS (`420` + 5-digit ZIP + 22-digit IMpb) and 23/34-digit FedEx `96` barcodes do not match any shape.
     - They fall through all classification branches to line 304: `return { type: 'sku', value }`.
     - Amazon `TBA...` begins with the letter `T`. Step 6 (`src/lib/barcode-routing.ts:296`) triggers: `if (/^[A-Za-z]/.test(value)) return { type: 'bin', value }`, immediately classifying it as `bin` before `scannedCarrierTracking` is ever called.
     - In `src/lib/scan/mobile-arrival-door.ts:89-94`, `arrivalScanIntent` passes the route type to `REFUSED_NOUN`: `.sku` becomes *"Nothing arrives under a product label. Scan the carrier label on the box."*; `.bin` becomes *"Nothing arrives under a bin label. Scan the carrier label on the box."*.
  2. **iOS App (`ios:Sources/CycleForgeClient/BarcodeRoute.swift:101, 109, 114, 186-187`):**
     - `BarcodeRoute.route` replicates the exact web logic: `trackingShapes` only checks 10, 12, 15, 20, 22 digits (`:109`). 30-digit USPS and 23/34-digit FedEx fall through to `.sku` (`:114`).
     - `TBA...` matches `matches(value, "^[A-Za-z]")` at line 101, returning `.bin`.
     - `ArrivalScanIntent.classify` (`:186-187`) returns `.refused` with the exact same refusal messages.
     - Note: While `TrackingLabelPicker.swift:80-92` in `CycleForgeFloor` detects `420...`, `96...`, and `TBA...` as `.tracking`, the string passed to `ScanStation.submit` is classified via `ArrivalScanIntent` / `BarcodeRoute`, discarding the picker's identification.

---

##### Defect 2: App Repeat Gate Gates Locally Refused Values
- **Reported issue:** Scanning a carrier label that is refused locally causes a re-scan within the repeat window to output *"Already scanned — not sent again."*, even though the first scan was refused locally on the client and never sent to the server.
- **Status:** **CONFIRMED (iOS App)**
- **Evidence & Root Cause:**
  1. **iOS App (`ios:Sources/CycleForgeClient/ScanStation.swift:218-222`, `ScanStation.swift:42-77`, `DoorIntake.swift:94-96`):**
     - In `ScanStation.submit(_:)`, line 218 executes:
       ```swift
       guard gate.admit(value, direction: direction, at: now()) else {
           publish(ScanEntry(id: id, direction: direction, outcome: .notSent(value: value, reason: "Already scanned — not sent again."), cue: .repeatIgnored))
           return
       }
       ```
     - `gate.admit` records `sentAt[key] = now` with a 6-second window (`defaultWindow = 6`).
     - Line 229 then invokes `await intake.submit(value, ...)`.
     - In `DoorIntake.submit`, line 94 runs `ArrivalScanIntent.classify(value)`. When `.refused`, it immediately returns `ArrivalSettlement(status: .refused, scanned: value, message: reason)` without any network call.
     - Because `gate` was already primed before intake ran, scanning the same value within 6 seconds hits `gate.admit(...) == false`, emitting `.notSent` (*"Already scanned — not sent again."*).
  2. **Web Comparison (`src/components/mobile/receiving/useArrivalStation.ts:75-90`):**
     - The web has camera-frame deduplication in `MobileCaptureWindow.tsx:19` (`DEDUP_MS = 6000`), but `submitRaw` itself does not maintain a client-side gate refusing re-submissions. It settles `refused` each time without claiming it was "already scanned".

---

##### Defect 3: Scanned Package Unreachable & Refused Package Never Reaches Unbox
- **Reported issue:** There is no way to open the tracking number just scanned, and a refused package never reaches Unbox.
- **Status:** **CONFIRMED (Web & iOS App)**
- **Evidence & Root Cause:**
  1. **Latest / Recent Card Tap in iOS App (`ios:App/Sources/ScanView.swift:51-68, 204-298`):**
     - In `ScanView.swift`, `ScanResultCard` is displayed for `station.latest` and inside `List(station.recent.dropFirst())`.
     - `ScanResultCard` (`:204-298`) is a passive `VStack`. It has no `NavigationLink`, no `.onTapGesture`, and no action handler (other than the "Undo scan-out" button for outbound scans).
     - Tapping the banner or recent rows does nothing. An operator who scanned an arrived package and dismissed Pair, or whose package was marked `known` or `refused`, cannot tap the card to inspect or re-open it.
  2. **Refused Scans Never Reach Server / Unbox (`src/lib/scan/mobile-arrival-door.ts:89-94`, `DoorIntake.swift:94-96`, `src/lib/receiving/arrival-package.ts:601-635`):**
     - When a scan is refused locally by `ArrivalScanIntent`, neither web nor iOS invokes `lookup-po`.
     - Therefore, no row is written to `receiving_cartons`.
     - `UNBOX_QUEUE_SQL` (`arrival-package.ts:601-635`) selects only from `receiving_cartons rc WHERE rc.status = 'received'`.
     - A carton never created at the door can never appear in Unbox. Without a mechanism on the scan card to intake/triage or open manual lookup, the package is unreachable.

---

##### Defect 4: Unbox Has No Sort by and No Search
- **Reported issue:** The Unbox queue cannot be sorted or searched; long queues are unusable.
- **Status:** **CONFIRMED (Web & iOS App)**
- **Evidence & Root Cause:**
  1. **Web (`src/components/mobile/v2/receiving/MobileV2UnboxNext.tsx:43-85`, `src/app/api/receiving/unbox-next/route.ts:1-20`, `src/lib/receiving/arrival-package.ts:655-689`):**
     - `MobileV2UnboxNext.tsx` renders `MobileRecordCardList` directly over `query.data`. It provides zero UI controls for search input (`q`) or sort selection (`sort`).
     - `GET /api/receiving/unbox-next/route.ts` ignores URL query parameters completely.
     - `readUnboxQueue` (`arrival-package.ts:655-689`) does not accept sort or filter parameters; it runs fixed SQL and sorts strictly by `orderUnboxQueue` (urgent first, oldest door time first).
  2. **iOS App (`ios:App/Sources/UnboxView.swift:20-64`, `ios:Sources/CycleForgeClient/UnboxQueue.swift:40-65`):**
     - `UnboxView.swift` renders a plain `List` with `ForEach(queue.items)`. There is no `.searchable`, no toolbar sort menu, and no filter state.
     - `UnboxQueue.refresh()` sends a bare `GET /api/receiving/unbox-next` without query parameters.

---

#### 3. Coverage Analysis of Existing `Scripts/render-*.mts` Fixtures

| Script | Fixtures Generated | Parity Aspects Pinned | What It Does NOT Cover (Gaps) |
|---|---|---|---|
| `render-web-parity.mts` | `web-parity.json` | - `arrivalScanIntent` on 31 synthetic values<br>- `planDoorScan` (openArrival boolean)<br>- `lookup-po` request payload & correlation<br>- `/api/scan/resolve` body structure<br>- `/api/receiving/preview-scan` URL template<br>- `scanOutBody` and `undoBody`<br>- Verdict wording for 6 canned lookup-po responses | - Does **not** test carrier envelope formats: USPS 420+ZIP (30-digit), FedEx 96 (23/34-digit), Amazon TBA.<br>- Does **not** test keyboard wedge buffer timing, prefix stripping, or newline flushing.<br>- Does **not** test camera VisionKit/AVFoundation vs ZXing/BarcodeDetector symbologies.<br>- Does **not** test repeat gate debounce window on local refusals vs network settlements.<br>- Does **not** test handoff navigation transition to Pair. |
| `render-arrival-fixtures.mts` | `arrival-package-found.json`<br>`arrival-package-unfound.json`<br>`arrival-package-derived.json`<br>`arrival-package-urgent-by-hand.json`<br>`arrival-package-not-urgent-by-hand.json`<br>`arrival-package-placed.json`<br>`arrival-place-unknown-location.json`<br>`arrival-place-inactive-location.json`<br>`arrival-package-not-found.json`<br>`arrival-parity.json` | - Contract envelope for `GET|POST /api/receiving/[id]/arrival`<br>- Urgency precedence (tier 0 vs 2, order tier, derived stock-out)<br>- Shelf suggestions (`suggestArrivalShelf`)<br>- Placement outcomes (`placed`, `unknown_location`, `inactive_location`)<br>- Request serialization and error handling (404, 422, 500, 502) | - Does **not** cover Pair UI layout, card anatomy, or responsive wrapping.<br>- Does **not** cover the 900 ms auto-dismiss timer on placement.<br>- Does **not** cover location scanner input focus, wedge interception, or camera handoff.<br>- Does **not** test the "Photo the label" button link transition. |
| `render-label-photo-fixtures.mts` | `label-photo-uploaded.json`<br>`label-photo-uploaded-claim.json`<br>`label-photo-file-required.json`<br>`label-photo-aspect-refused.json`<br>`label-photo-forbidden.json`<br>`label-photo-internal.json`<br>`label-photo-parity.json`<br>`LabelPhotoWebParity.swift` | - `POST /api/photos/upload` multipart envelope & status codes<br>- `compressPhotoForUpload` (quality 0.85) + `downscaleImageTo720`<br>- Frame quality gate `gateStillFrame` metrics across 8 synthetic frames<br>- Coaching text `PACK_SLIP_GATE_COACHING`<br>- `PhotoUploadQueue` retry logic | - Does **not** cover live viewfinder UI layout, framing reticle overlay, or torch button.<br>- Does **not** cover dismissal and outcome callback to Pair upon completion.<br>- Does **not** cover gallery display or thumbnail loading state. |
| `render-unbox-fixtures.mts` | `unbox-queue.json`<br>`unbox-queue-empty.json`<br>`unbox-parity.json` | - Envelope for `GET /api/receiving/unbox-next`<br>- Projection of `readUnboxQueue` rows (urgency, platform labels, SKU identity titles)<br>- Queue sort order (urgent first, oldest door time first)<br>- Compact age formatting `formatLaneAgeCompact` across 15 timestamps | - Does **not** cover sorting options (`sort`: urgent, oldest, newest, location, unfound).<br>- Does **not** cover search filtering (`q` query string).<br>- Does **not** cover row tap navigation behaviour (`/m/r/[id]` vs `PairView`).<br>- Does **not** cover pull-to-refresh mechanics or empty/error view layouts. |

---

#### 4. End-to-End Behaviour Diff Table

| Step | Web Implementation (`file:line` + behaviour) | iOS App Implementation (`file:line` + behaviour) | Same / Different | Note |
|---|---|---|---|---|
| **1. Scan Input: Camera** | `MobileCaptureWindow.tsx:1-120`<br>`MobileCameraPanel.tsx:1-90`<br>Continuous video stream via ZXing / BarcodeDetector. Collapsible to bottom bar with "Done" / "Scan". Includes torch toggle, status header, and 6000 ms dedup window (`DEDUP_MS = 6000`). | `App/Sources/ScanView.swift:34, 108-112`<br>`CameraBox.swift:1-60`<br>`CameraScanSession.swift`<br>Fixed-height (220 pt) continuous AVFoundation camera box. No collapse/expand bar. No torch button on ScanView. Camera pauses when user is typing. | **Different** | Proportions, collapse/expand bar, torch control, and camera frame lifecycle differ. |
| **2. Scan Input: Hardware Wedge** | `MobileScanIdentify.tsx:437-444`<br>Listens to `window.addEventListener('wedge-scan')`. Dispatches string directly to `onDecode` without pre-filtering. | `App/Sources/ScanView.swift:69-74, 153-162`<br>`WedgeCaptureView.swift`<br>`WedgeScanBuffer.swift`<br>Hidden 1×1 text field buffers keystrokes (50 ms timeout). Submits on newline. Passes raw string through `TrackingLabelPicker.pick` first; calls `refuseRoutingCode` if rejected. | **Different** | iOS filters wedge input through `TrackingLabelPicker.pick`, while web dispatches directly to scan resolver. |
| **3. Scan Input: Typed Entry** | `MobileCaptureWindow.tsx:70, 143-160`<br>Modal toggle via `Type` icon. Replaces camera view with text field, Submit button (`Check`), and Escape listener. Dispatches to `onDecode`. | `App/Sources/ScanView.swift:36, 145-152`<br>Inline `HStack` with `TextField("Scan or enter barcode…")` and `Button("Submit")` always visible below camera. Passes input through `TrackingLabelPicker.pick`. | **Different** | Web uses mode-swapped modal input; iOS provides persistent inline field and pre-filters with `TrackingLabelPicker`. |
| **4. Barcode Classification** | `src/lib/barcode-routing.ts:176-305` (`routeScan`)<br>`src/lib/scan/mobile-arrival-door.ts:68-95` (`arrivalScanIntent`)<br>Matches URLs, bare handles (`R-`, `L-`, `U-`, `H-`), GS1 AI, locations, carrier shapes. Falls back to bin if starting with letter; else sku. | `Sources/CycleForgeClient/BarcodeRoute.swift:35-115` (`BarcodeRoute.route`)<br>`BarcodeRoute.swift:168-185` (`ArrivalScanIntent.classify`)<br>Port of `routeScan`. Emits `.sku`, `.bin`, `.receiving`, etc. Does not handle movable-rack arm `RK12-3` or `bin-paired-order`. | **Different** | iOS lacks several route arms (e.g. `canonicalRackCode`, `bin-paired-order`). Both share Defect 1. |
| **5. Door Intent Decision** | `src/lib/scan/mobile-arrival-door.ts:68-95`<br>Classifies to `{ kind: 'tracking', value, carrier }`, `{ kind: 'carton', value, receivingId }`, or `{ kind: 'refused', value, reason }`. | `Sources/CycleForgeClient/BarcodeRoute.swift:168-185`<br>Classifies to `.tracking(value:)`, `.carton(value:receivingId:)`, or `.refused(value:reason:)`. | **Different** | Web `.tracking` preserves detected carrier string; iOS `.tracking` omits carrier. Refusal copy is identical. |
| **6. Scan Resolve Correlation** | `src/lib/scan/phone-scan-intent.ts:16-24`<br>`POST /api/scan/resolve`<br>Sends `{ input: scanValue, clientEventId }`. Best-effort fetch returns `{ mobileScanEventId?: number }`. | `Sources/CycleForgeClient/CycleForgeAPI.swift:150-165`<br>`POST /api/scan/resolve`<br>Identical payload and endpoint. Returns `Int?` correlation ID. | **Same** | Wire format, endpoint, and best-effort behavior match. |
| **7. Door Preview Check** | `src/components/mobile/receiving/useArrivalStation.ts:34-43`<br>`GET /api/receiving/preview-scan?value=...&mode=tracking`<br>Returns `{ matched: boolean, hit: ... }`. Matched = package already seen. | `Sources/CycleForgeClient/DoorIntake.swift:110-115`<br>`CycleForgeAPI.swift:170-180`<br>`GET /api/receiving/preview-scan?value=...&mode=tracking`<br>Identical request and response decoding. | **Same** | Request URL, query params, and hit payload parsing are identical. |
| **8. Door Intake (`lookup-po`)** | `useArrivalStation.ts:144-153` → `src/lib/receiving/scan/resolvers/lookup-po.ts:9-13`<br>`POST /api/receiving/lookup-po`; hook input `{ callValue, callMode, originalMode, staffId, intakeSurface: 'triage', mobileScanEventId, clientEventId }`, mapped on the wire to `trackingNumber: callValue`. | `Sources/CycleForgeClient/ScanRoutes.swift:40-58` (`lookupPoBody`)<br>`{ trackingNumber, staffId, intakeSurface: "triage", mobileScanEventId, clientEventId }`. | **Same (wire)** | Wire body pinned by `Scripts/render-web-parity.mts` → `web-parity.json`. Integrator-verified. |
| **9. Verdict Headlines & Words** | `src/components/mobile/receiving/arrival-station-tape.ts:16-21` (`ARRIVAL_TAPE_LABEL`)<br>Tape row title = verb only: **"Arrived"** (ok), **"Already arrived"** (warn), **"Not an arrival"** (bad), **"Scan failed"** (bad). No detail sentence on the row. | `App/Sources/ScanView.swift:242-248` (`ScanResultCard.headline`)<br>**"Arrived · Found"** / **"Arrived · Unfound"**, **"Already logged"**, **"Not received"**, **"Not recorded"**, plus a detail sentence from `DoorIntake.swift`. | **Different** | Integrator-verified correction: the scout first cited `src/lib/mobile/scan-verdict.ts` ("Matched"/"Rush"); that is not the Arrival door. The door words are the tape vocabulary above. |
| **10. Repeat / Dedupe Window** | `MobileCaptureWindow.tsx:19`<br>`DEDUP_MS = 6000` (camera only).<br>`useArrivalStation.ts:75-90` has no gate: typing or wedging the same code repeatedly invokes `submitRaw` without client block. | `Sources/CycleForgeClient/ScanStation.swift:42-77, 218`<br>`ScanSubmitGate` enforces 6.0s window (`defaultWindow = 6`) across camera, wedge, and typed input. Gating occurs **before** intake; locally refused values are blocked on repeat (Defect 2). | **Different** | App gates all inputs for 6s before intake, wrongly blocking repeat attempts of locally refused values. |
| **11. Handoff from Scan to Pair** | `MobileScanIdentify.tsx:149-168`<br>`useArrivalPlacementHandoff.ts:15-30`<br>When scan settles `arrived` or `known` with `receivingId`: prefetches query `qk.cartons.arrival(id)` and calls `router.push('/m/r/[id]/place')`. | `ScanStation.swift:234-237`<br>`App/Sources/ScanView.swift:97-105`<br>Sets `station.handoff = PairHandoff(...)`. `onChange` triggers `openPair`, prefetches `PairStation.load()`, and sets `$pair` route to push `PairView` in NavigationStack. | **Different** | Web performs full route transition (`/m/r/[id]/place`); iOS pushes `PairView` over `ScanView` while sharing the active camera session. |
| **12. Recent Tape / History** | `MobileScanIdentify.tsx:128, 452-466, 544`<br>`arrival-station-tape.ts`<br>Maintains session tape, persisted via `recordMobileSessionEntry`. Tape rows display item details and can be clicked to open `/m/r/[id]` or location hubs. | `ScanStation.swift:150-185`<br>`App/Sources/ScanView.swift:51-68`<br>`station.recent: [ScanEntry]` (in-memory only). Dropped first item renders in a `List`. Rows use passive `ScanResultCard` and cannot be tapped to navigate (Defect 3). | **Different** | Web tape persists to mobile session feed and enables opening records; iOS `recent` is ephemeral and rows are completely unclickable. |
| **13. Pair Screen Anatomy & Package Card** | `MobileV2ArrivalPlacement.tsx:35-60`<br>Header: `MobileV2DetailTopBar` ("Package [id]", subtitle "Pair to a location", back `X`). Card: monospace tracking, Found/Unfound pill, platform/order/vendor line, wrapping item rows with quantity. | `App/Sources/PairView.swift:180-260`<br>`content` & `packageFacts`<br>Standard navigation title "Pair". Tracking code, Found/Unfound capsule, platform/order/vendor line, wrapping item rows with quantity. | **Different** | Overall hierarchy matches, but header chrome (web detail top bar vs iOS navigation bar) and typography tokens differ. |
| **14. Urgency Tiers & Setting Urgency** | `src/lib/receiving/arrival-contract.ts:30-45`<br>`MobileV2ArrivalPlacement.tsx:85-102`<br>Displays `IdentifierToggle` with options "Urgent" / "Not urgent" and server reason line. Tapping sends `POST /api/receiving/[id]/arrival` with `{ action: 'urgency', urgent: boolean }`. Tier 0 or 1 reads urgent; Urgent writes 0, Not urgent writes 2. | `Sources/CycleForgeClient/PairStation.swift:105-125`<br>`App/Sources/PairView.swift:220-245`<br>Segmented control / buttons for Urgent / Not urgent. Tapping calls `station.setUrgent(bool)`, sending identical `POST` action with `urgent: Bool`. | **Same** | Logic, API contract, stored tier mapping (0 vs 2), and reason line display match. |
| **15. Location Placement Action** | `MobileV2ArrivalPlacement.tsx:104-125`<br>`POST /api/receiving/[id]/arrival`<br>Sends `{ action: 'place', scanned: raw, clientEventId, surface: '/m/r/[id]/place' }`. Accepts any active location code. Shows "Placed on <code> · Urgent". | `PairStation.swift:130-165`<br>`POST /api/receiving/[id]/arrival`<br>Sends `{ action: 'place', scanned: raw, clientEventId, surface: 'ios:/pair' }`. Pre-validates `isOwnLabel`. Shows "Placed on <code> · Urgent". | **Same** | Wire contract and placement logic match. App adds client-side `isOwnLabel` check to prevent scanning package's own tracking code. |
| **16. 900 ms Auto-Return** | `MobileV2ArrivalPlacement.tsx:30, 69-73`<br>`PLACED_RETURN_MS = 900`.<br>`setTimeout(() => router.replace(back), 900)`. Navigates back to `/m/scan`. | `PairStation.swift:31, 153`<br>`placedReturnDelay = .milliseconds(900)`.<br>`await pause(Self.placedReturnDelay)` sets `isFinished = true`. `PairView.swift:115-117` calls `dismiss()`. | **Same** | Delay is exactly 900 ms on both surfaces. |
| **17. Label Photo Trigger & Studio** | `MobileV2ArrivalPlacement.tsx:181-186`<br>Renders `<Link href={mobileArrivalGuidedPhotosHref(...)}>Photo the label</Link>`. Navigates to immersive route `/m/r/[id]/photos?stage=arrival_package`. | `App/Sources/PairView.swift:93, 230-238`<br>Renders "Photo the label" button. Tapping sets `@State private var photographing = true`, presenting `LabelPhotoCapture` sheet full-screen. | **Different** | Web navigates to standalone Next.js page; iOS presents `LabelPhotoCapture` modal overlay. |
| **18. Label Photo Processing & Upload** | `PhotoUploadQueue.ts:1-280`<br>`photo-scope.ts`<br>`/api/photos/upload`<br>Encodes JPEG quality 0.85, downscales to 720p, runs `gateStillFrame`, uploads via `uploadPhotoClient` (`POST /api/photos/upload`, multipart). | `Sources/CycleForgeFloor/LabelPhotoImage.swift`<br>`LabelPhotoGate.swift`<br>`Sources/CycleForgeClient/LabelPhotoUpload.swift`<br>Compresses image, evaluates gate metrics, and posts multipart body to `/api/photos/upload`. Covered by `LabelPhotoWebParity.swift`. | **Same** | Upload endpoint, multipart framing, image compression specs, and gate rules match. |
| **19. Outbound Scan-Out & Undo** | `MobileScanIdentify.tsx:288-335, 471-490`<br>`POST /api/shipped/scan-out` on tracking.<br>Sets `outUndo = { entryId, shipmentId }`. Button "Undo scan-out" calls `DELETE /api/shipped/scan-out`. Success plays `success`, sets "Scan-out undone", removes row. | `ScanStation.swift:239-275`<br>`ScanView.swift:221-229`<br>`POST /api/shipped/scan-out`. Stores `undoable = (shipmentId, id)`. "Undo scan-out" button calls `DELETE /api/shipped/scan-out`. Clears undoable, removes from recent, calls `gate.forget`. | **Same** | Endpoint contracts, single-step undo availability, and deletion flow match. |
| **20. Cues: Sound & Haptics** | `useScanFeedback.ts:1-85`<br>`MobileScanIdentify.tsx:166`<br>Tones: Web Audio API synthesized tones (`success`, `warn`, `reject`).<br>Haptics: `navigator.vibrate` (unsupported on iOS Safari). `known` settles with `reject` feedback. | `ScanStation.swift:80-101`<br>`ScanTone.swift`<br>`OperatorFeedback.swift`<br>Tones: `ScanTonePlayer` via native audio.<br>Haptics: `UIKitHapticEngine` using `UINotificationFeedbackGenerator` / `UIImpactFeedbackGenerator`. `known` settles with `reject` tone. | **Different** | Native app produces tactile haptics on physical iPhones where mobile Safari silently drops `navigator.vibrate`. |
| **21. Offline & Error Recovery** | `MobileScanIdentify.tsx:507`<br>`useArrivalStation.ts:187-200`<br>`useNetworkOnline()`. Displays "Offline" status. Network error in `lookup-po` catches and outputs "Could not reach the server. Scan again once you have signal." | `NetworkStatus.swift`<br>`ScanView.swift:130-140`<br>`DoorIntake.swift:125-135`<br>`NWPathMonitor`. Displays "Offline" status. Catches `CycleForgeClientError.offline` with identical sentence. | **Same** | Offline detection and fallback error copy match. |
| **22. Unbox: Queue Loading** | `MobileV2UnboxNext.tsx:43-50`<br>`useQuery({ queryKey: qk.cartons.unboxNext(), queryFn: fetchUnboxQueue, staleTime: 15_000, refetchInterval: 60_000 })`. `GET /api/receiving/unbox-next`. | `UnboxView.swift:20, 50-57`<br>`UnboxQueue.swift:40-65`<br>`api.unboxQueue()` (`GET /api/receiving/unbox-next`). Refreshes on appear, every 60 s, and via pull-to-refresh. | **Same** | Backing endpoint, 60s background refresh, and data payload match. |
| **23. Unbox: Queue Ordering** | `arrival-shelf-plan.ts:96-105` (`orderUnboxQueue`)<br>Urgent packages first (`urgency.urgent ? -1 : 1`), then oldest door time first (`at < bt ? -1 : 1`), then ID ascending. | `arrival-shelf-plan.ts` (server)<br>`UnboxPayloads.swift`<br>Server handles ordering; iOS preserves received sequence. Tested by `render-unbox-fixtures.mts`. | **Same** | Server orders packages before returning to both surfaces. |
| **24. Unbox: Row Content & Anatomy** | `MobileV2UnboxNext.tsx:26-41`<br>`MobileRecordCard`<br>Identity: location code or "Not placed"<br>Timestamp: "Waiting [age]" (`formatLaneAgeCompact`)<br>Title: SKU identity or "Unfound"<br>Detail: "Tracking [tracking]"<br>Facts: "From [platform · order · vendor]"<br>Count: "[N] line(s)"<br>Status: "Urgent" / "Not urgent" pill | `App/Sources/UnboxView.swift:105-155`<br>`UnboxRowView`<br>Matches all elements: location / "Not placed", "Waiting [age]", title / "Unfound", "Tracking [tracking]", "From [facts]", "Urgent" / "Not urgent" capsule, and line count. | **Same** | Information hierarchy and text contents are identical. |
| **25. Unbox: Row Tap Action** | `MobileV2UnboxNext.tsx:81`<br>`onOpen={() => router.push(withJobReturn('/m/r/${item.receivingId}', UNBOX_PATH))}`<br>Navigates to carton record (`/m/r/[id]`). | `App/Sources/UnboxView.swift:34-40`<br>`NavigationLink { PairView(receivingId: item.receivingId, staff: staff) }`<br>Navigates to `PairView` (Urgency + Location pairing). | **Different** | Web opens carton record `/m/r/[id]`; iOS opens the Pair screen. (Note: Phase 4 target calls for tapping row to open Pair on both surfaces). |
| **26. Unbox: Sort & Search** | `MobileV2UnboxNext.tsx:43-85`<br>`GET /api/receiving/unbox-next`<br>No search bar, no sort dropdown. Neither UI nor API supports sorting or filtering (Defect 4). | `App/Sources/UnboxView.swift:20-64`<br>`UnboxQueue.swift:40-65`<br>No search bar, no sort picker. Only static section list (Defect 4). | **Same (Bug)** | Neither platform supports sort or search. |

---

#### 5. Change Candidates by Phase

##### Phase 1 — Classification Parity & Carrier Envelopes
- [both] Accept USPS AI 420+ZIP5/ZIP9 (30-digit `420900019361289711068322544977`), FedEx Ground 96 (23/34-digit `96119123456789012345678`), and Amazon TBA (`TBA318274650012`) in `routeScan` and `BarcodeRoute.route` rather than misclassifying as sku/bin — evidence `src/lib/barcode-routing.ts:77-84, 296, 304` and `ios:Sources/CycleForgeClient/BarcodeRoute.swift:101, 109, 114` (Phase 1)
- [both] Ensure `arrivalScanIntent` / `ArrivalScanIntent.classify` forwards unrecognized carrier labels to the server resolver (last-8 match) instead of immediately refusing them locally — evidence `src/lib/scan/mobile-arrival-door.ts:89-94` and `ios:Sources/CycleForgeClient/BarcodeRoute.swift:186-187` (Phase 1)
- [app] Fix `ScanSubmitGate` in `ScanStation.swift`: do not register or gate values that were refused locally without being transmitted to the server — evidence `ios:Sources/CycleForgeClient/ScanStation.swift:218-222` and `ios:Sources/CycleForgeClient/DoorIntake.swift:94-96` (Phase 1)
- [app] In `ScanStation.swift`, when a gated repeat does occur, re-present the previous result rather than emitting an uninformative `.notSent` message — evidence `ios:Sources/CycleForgeClient/ScanStation.swift:219` (Phase 1)
- [both] Rename Scan switcher direction labels to **Inbound | Outbound** (and add both words to `VOCABULARY`) — evidence `src/components/mobile/scan/MobileScanHeader.tsx:12` and `ios:Sources/CycleForgeClient/ScanStation.swift:10` (Phase 1)

##### Phase 2 — Chrome, Design Tokens & Cues
- [app] Generate `CycleForgeTokens.swift` from `src/design-system/tokens/**` and typography presets rather than relying on hardcoded SwiftUI colors and font styles — evidence `ios:App/Sources/ScanView.swift:215-220` and `ios:App/Sources/PairView.swift:180-200` (Phase 2)
- [app] Align top shell bar and header anatomy with `MobileV2TopBar` and `MobileV2DetailTopBar` (app switcher left, title, scan CTA right; detail back button) — evidence `src/components/mobile/v2/MobileV2TopBar.tsx:1-50` and `ios:App/Sources/ScanView.swift:75-80` (Phase 2)
- [both] One set of Arrival verdict words, taken from the web tape: "Arrived" / "Already arrived" / "Not an arrival" / "Scan failed" (app today: "Arrived · Found|Unfound" / "Already logged" / "Not received" / "Not recorded") — evidence `src/components/mobile/receiving/arrival-station-tape.ts:16-21` and `ios:App/Sources/ScanView.swift:242-248` (Phase 1)
- [app] Port camera capture window controls to match `MobileCaptureWindow.tsx`: include collapse/expand bar with "Scan" / "Done" and torch toggle button — evidence `src/components/mobile/station/MobileCaptureWindow.tsx:40-80` and `ios:App/Sources/ScanView.swift:34` (Phase 2)

##### Phase 3 — Arrival Screens (Scan → Pair → Label Photo)
- [app] Make `ScanResultCard` banner and recent rows tappable to open the package record or navigate to Pair (resolves Defect 3) — evidence `ios:App/Sources/ScanView.swift:51-68, 204-298` (Phase 3)
- [app] Replace passive `recent` list with an interactive Arrival Tape matching `arrival-station-tape.ts`, supporting row navigation — evidence `src/components/mobile/receiving/arrival-station-tape.ts:1-80` and `ios:App/Sources/ScanView.swift:62-67` (Phase 3)
- [web] Provide a prominent tappable card and direct triage path on `/m/scan` for unrecognised/unmatched scans so refused packages can be intaked — evidence `src/components/mobile/scan/MobileScanIdentify.tsx:540-560` (Phase 3)
- [app] Match `PairView` card anatomy, spacing, and responsive badge styles with `MobileV2ArrivalPlacement.tsx` — evidence `src/components/mobile/v2/receiving/MobileV2ArrivalPlacement.tsx:35-65` and `ios:App/Sources/PairView.swift:180-260` (Phase 3)
- [app] Harmonize "Photo the label" presentation between web full-screen studio and native modal overlay — evidence `src/app/m/(immersive)/r/[id]/photos/page.tsx:1-100` and `ios:App/Sources/LabelPhotoCapture.swift:1-80` (Phase 3)

##### Phase 4 — Unbox Identical, Plus Sort by and Search
- [both] Implement server-side sorting for `GET /api/receiving/unbox-next` (`sort`: `urgent` [default], `oldest`, `newest`, `location`, `unfound`) — evidence `src/lib/receiving/arrival-package.ts:655-689` and `src/app/api/receiving/unbox-next/route.ts:1-20` (Phase 4)
- [both] Implement server-side search `q` in `readUnboxQueue` matching title, tracking (including last-8), order number, and seller — evidence `src/lib/receiving/arrival-package.ts:601-635` (Phase 4)
- [web] Add Sort by dropdown and search input to `MobileV2UnboxNext.tsx` according to design system contract — evidence `src/components/mobile/v2/receiving/MobileV2UnboxNext.tsx:75-85` (Phase 4)
- [app] Add Sort by picker and `.searchable` search bar to `UnboxView.swift` — evidence `ios:App/Sources/UnboxView.swift:20-64` (Phase 4)
- [web] Change row tap action in `MobileV2UnboxNext.tsx` to navigate to Pair (`/m/r/[id]/place`) matching operator ruling and iOS behaviour — evidence `src/components/mobile/v2/receiving/MobileV2UnboxNext.tsx:81` and `ios:App/Sources/UnboxView.swift:34-40` (Phase 4)

##### Phase 5 — Ship, Guard & CI Parity Automation
- [both] Add end-to-end parity test suite validating identical classification outcomes across production scan corpus — evidence `Scripts/render-web-parity.mts:1-80` and `Tests/CycleForgeClientTests/` (Phase 5)
- [both] Add script `pnpm parity:ios` to regenerate all fixtures and Swift token/parity files and run `swift test` over SSH — evidence `docs/handoff/PROMPT-ios-arrival-unbox-parity-2026-10-04.md` Section "Phase 5" (Phase 5)


---

# Appendix B — Display diff (0b)

### Phase 0(b) — Display diff: web `/m` vs native iOS (Arrival + Unbox)

Captured 2026-10-04. Web is the reference. 22 screen/state pairs. Every pair has a web image, an app image and a diff image under
`docs/handoff/ios-parity/screens/phase0/` (paths checked with `ls -la` at the end of this file).

#### How the captures were made

| Surface | Method |
|---|---|
| Web | Managed headless Chromium (`app: {relay:false, tern:false}`), 390×844 CSS px, DPR 3, `isMobile`. Cookie `cf_sid` from `tests/.auth/admin.json` set with `page.setCookie` inside `tab.run`. Origin `http://localhost:3050`. Saved as 1170×2532 PNG with `page.screenshot`. The Next dev overlay (`nextjs-portal`) was hidden with an init-script style. |
| App | A throwaway hosted XCTest (`ParitySnapshotTests`) in a scratch copy at `prometheus:/tmp/cf-ios-snap`; the real project was not touched and the scratch copy is now deleted. It ran on the iPhone Air simulator `AB3F9FB7…` with `-derivedDataPath build/DD-displaydiff`. Each screen is the app's own SwiftUI view, created the same way the app creates it: `ScanView`, `PairView(station:…)`, `PairView(receivingId:)`, `LabelPhotoCapture`, `UnboxView`. They talk to `CycleForgeAPI` through an injected `HTTPTransport`. That transport answers each `METHOD path` with the JSON files in `data/`, decoded by the app's own payload types. Each view is rendered into a `UIWindow(windowScene:)` of 390×844 pt at @3x via `drawHierarchy` (1170×2532 PNG), in light mode (the app root sets `.preferredColorScheme(.light)`, `ios:App/Sources/CycleForgeFloorApp.swift:31`). The host app was started with `TEST_RUNNER_CF_SERVER_BASE_URL=none://offline`, so `ServerConfiguration` resolves to `.invalid` and the app made no production call. One change exists only in the scratch copy: `ScanView` got an `init(staff:station:)` so the harness could hold the `ScanStation`. The body is unchanged. |
| Inputs | Web Scan inputs went in two ways. Some were typed through "Type the label instead". Others, after a camera-stall flake, were sent as `window` `wedge-scan` CustomEvents, which is the same `onDecode` path (`src/components/mobile/scan/MobileScanIdentify.tsx:436-445`). App Scan inputs went through `ScanStation.submit(_:)`, 700 ms after mount. This matches what the wedge and camera callbacks do (`ios:App/Sources/ScanView.swift:70,116-118`). |
| Camera | Neither side has a camera. Headless Chromium shows "No camera found on this device.". The simulator shows "No camera is available on this device. Use the hardware scanner or type the code.". This difference is real copy, but both images show the no-camera state, not a live lens. |
| Chrome not captured | The iOS status bar is not in the app render: there is a blank top safe-area band of about 59 pt. Chromium has no status bar either. |

##### Production-write safety

- **Write routes.** Every write endpoint these screens can reach was fulfilled by `tab.route` with canned JSON:
  - `**/api/scan/resolve`
  - `**/api/receiving/lookup-po`
  - `**/api/receiving/*/arrival`
  - `**/api/photos/upload`
  - `**/api/receiving/unbox-next` (per state)
  - `**/api/receiving/preview-scan?*` (per state)
  - `**/api/receiving-lines?*`

  `tab.route` cannot filter by HTTP method, so a GET to the same URL was fulfilled too, from the same `data/` JSON.
- **Client guard.** An init script wraps `fetch`, XHR and `sendBeacon`:
  - It records every non-GET as `{method,url,body}`.
  - It refuses (503, local) any non-GET whose path is not one of the routed write endpoints.
- **Writes intercepted and fulfilled locally.** 13 were recorded, with bodies:
  - 9× `POST /api/scan/resolve`
  - 2× `POST /api/receiving/lookup-po`
  - 2× `POST /api/receiving/48213/arrival` (urgency `{"action":"urgency","urgent":false,…}` and place `{"action":"place","scanned":"RK1-3",…,"surface":"/m/r/48213/place"}`)
  - [INFERENCE] `scan-accepted` sent +1 resolve and +1 lookup-po; that cell's summary was not printed.
- **Blocked client-side.** `POST https://main.realtime.ably.net/keys/…/requestToken`: the Ably realtime token request, one per page load. It is not the CycleForge DB.
- **Reached the server.** Two `POST /api/zz-test-a` probes, used while learning the `tab.route` option shape. They got a 404 (no such route) and wrote nothing. No other non-GET reached `localhost:3050`, and none reached production.
- **App.** All traffic stayed in the in-process stub transport. Unknown requests threw `URLError(.notConnectedToInternet)`.
- **Ambient.** From about 12:20 to 12:50, every `/api/*` route on the lane returned 500. Turbopack could not resolve `./ingest` at `src/lib/support/conversation/mirror-bridge.ts:28`, another session's in-flight work. Pages still rendered. The web captures before recovery used routed fixture JSON only. The lane recovered before the live-data captures.

##### Data used (shared fixtures in `docs/handoff/ios-parity/screens/phase0/data/`)

| File | Source |
|---|---|
| `scan-resolve`, `preview-scan-hit`, `preview-scan-miss`, `lookup-po-matched`, `lookup-po-not-found`, `lookup-po-failed`, `arrival-package-found`, `arrival-package-unfound`, `arrival-package-placed`, `arrival-package-not-urgent-by-hand`, `label-photo-uploaded`, `session-signed-in` | **fixture**: copied verbatim from `ios:Tests/CycleForgeClientTests/Fixtures/` (the app's contract fixtures, shaped like the web routes) |
| `unbox-0` | **fixture** (`unbox-queue-empty.json`) |
| `unbox-next-live` | **live**: `GET /api/receiving/unbox-next` on :3050, 7 items |
| `unbox-1` | **live**: item `53388` from that response |
| `arrival-live-53388-found`, `arrival-live-53165-unfound` | **live**: `GET /api/receiving/{id}/arrival` |
| `unbox-many` | **derived**: the 7 live items + the 6 fixture items cycled to 32 rows. Repeated ids are offset by +100000. Sorted urgent → tier → door time. |
| `receiving-lines-empty` | **fixture**. The web's client refetch was routed to it, but the server-side seed (`src/app/m/(shell)/scan/page.tsx:15`) hydrated the **live** arrival history, so the web Scan captures show the live Recent tape (20 rows). The app has no tape. |

#### Diff scores

- **Images.** Web and app images are the same size (1170×2532), so no resize was needed.
- **AE.** `compare -metric AE -fuzz 10% web app <state>-diff.png`. The column shows the share of pixels that differ beyond 10% colour distance; lower is closer.
- **RMSE.** `compare -metric RMSE`, normalised to 0..1.
- **How to read them.** Both scores are rough. Large white areas pull AE down: `pair-loading` looks "close" mostly because both screens are empty.

| Pair | Data | AE (differing px) | RMSE | Similarity (1−AE) |
|---|---|---:|---:|---:|
| scan-idle | live tape / none | 65.8% | 0.796 | 34.2% |
| scan-refused-local (`96119123456789012345678`) | — | 64.8% | 0.787 | 35.2% |
| scan-refused-notfound | fixture + live tape | 64.8% | 0.787 | 35.2% |
| scan-error (lookup-po 500) | fixture + live tape | 65.0% | 0.789 | 35.0% |
| scan-offline | web: emulated offline + aborted preview · app: transport offline | 64.8% | 0.787 | 35.2% |
| scan-repeat (same product label twice) | — | 64.7% | 0.786 | 35.3% |
| scan-known (preview hit → Pair) | fixture | 22.6% | 0.463 | 77.4% |
| scan-accepted (matched → Pair handoff) | fixture | 22.6% | 0.463 | 77.4% |
| pair-found-urgent | fixture | 22.6% | 0.463 | 77.4% |
| pair-found-noturgent (tap Not urgent) | fixture | 22.4% | 0.461 | 77.6% |
| pair-unfound-noturgent | fixture | 20.0% | 0.439 | 80.0% |
| pair-live-found-noturgent (53388) | live | 20.9% | 0.447 | 79.1% |
| pair-live-unfound (53165) | live | 20.0% | 0.438 | 80.0% |
| pair-placed ("Placed on RK1-3 · Urgent") | fixture | 1.0% | 0.098 | 99.0% |
| pair-loading | delayed / hung | 0.5% | 0.059 | 99.5% |
| photo-arrival (`?stage=arrival_package`) | fixture id 48213 (web also GET `/api/receiving-photos` live → empty) | 4.1% | 0.185 | 95.9% |
| unbox-0 | fixture | 1.6% | 0.118 | 98.4% |
| unbox-1 | live | 2.7% | 0.155 | 97.3% |
| unbox-live (7 rows) | live | 5.0% | 0.200 | 95.0% |
| unbox-many (32 rows) | derived | 9.0% | 0.276 | 91.0% |
| unbox-loading | delayed / hung | 0.7% | 0.076 | 99.3% |
| unbox-error | web: aborted · app: transport offline | 1.0% | 0.091 | 99.0% |

The web known and accepted captures, and the web pair-found-urgent capture, are byte-identical: both scan cases hand off to `/m/r/48213/place`. On the app side, scan-known and scan-accepted are byte-identical to each other: both push `Pair`.

#### Visual differences per screen

Kinds used in the tables: layout · token · copy · icon · motion. Image paths are relative to `docs/handoff/ios-parity/screens/phase0/`.

##### Shell chrome (applies to every screen)

| Area | Web | App | Kind | Evidence |
|---|---|---|---|---|
| Scan header | One row: apps-grid button, title "Scan", pill `In \| Out`, pill `View \| Operate` | Centred inline nav title "Scan". Full-width segmented `In \| Out` on its own row. No `View \| Operate`. No apps button. | layout | scan-idle-*.png; `src/components/mobile/scan/MobileScanHeader.tsx:68-87`; `ios:App/Sources/ScanView.swift:35-41,75-76` |
| Detail top bar (Pair) | X (Close) + two-line block: subtitle "Pair to a location", mono title "Package 48213"; scan button on the right | Back chevron + centred "Pair" | layout / copy / icon | pair-*-*.png; `src/components/mobile/v2/receiving/MobileV2ArrivalPlacement.tsx:142`; `src/components/mobile/v2/MobileV2DetailTopBar.tsx:87,107`; `ios:App/Sources/PairView.swift:97` |
| Unbox top bar | Apps-grid button + "Unbox next" + scan button | Back chevron + large title "Unbox" | copy / layout | unbox-*-*.png; `src/lib/mobile-context-navigation.ts:42`; `ios:App/Sources/UnboxView.swift:53` |
| Typeface | Inter (UI) and IBM Plex Mono (identifiers): `<html class="inter_… ibm_plex_mono_…">` observed in the served page | SF Pro and SF Mono (`.monospaced()`) | token | all pairs; `ios:App/Sources/PairView.swift:352` |
| Page background | White canvas / `bg-mode-panel` | White (Scan, Pair). Grouped gray `insetGrouped` (Unbox). | token | unbox-1-*.png; `ios:App/Sources/UnboxView.swift:50` |
| Status bar | none (Chromium) | blank safe-area band (status bar not drawn by `drawHierarchy`) | capture artifact | all app images |

##### Scan (Inbound) — idle and verdicts

| Area | Web | App | Kind | Evidence |
|---|---|---|---|---|
| Body, idle | "RECENT 20" header + live arrival tape (thumbnail, title, mono tracking + age, green "Arrived ›") fills the top half | No tape. Prompt "Scan the carrier label on the box." | layout | scan-idle-*.png; `src/components/mobile/v2/scan/MobileV2ScanRecentList.tsx:101-104`; `ios:App/Sources/ScanView.swift:50` |
| Empty-tape prompt | "Scan a tracking number or location code" | "Scan the carrier label on the box." | copy | `src/components/mobile/scan/MobileScanIdentify.tsx:576`; `ios:App/Sources/ScanView.swift:50` |
| Camera window | Docked at the bottom, full-bleed, dark stage. Strip above it: `T` (type) · centre status · `✓` (Done scanning). | Black rounded-12 box, 220 pt tall, at the top under the switcher | layout / token | `src/components/mobile/station/MobileCaptureWindow.tsx:196,213`; `ios:App/Sources/ScanView.swift:43`, `ios:App/Sources/CameraBox.swift:46-49` |
| No-camera copy | "No camera found on this device." + white "Try again" button | "No camera is available on this device. Use the hardware scanner or type the code." (no button) | copy | `src/hooks/useBarcodeScanner.ts:201`; `ios:Sources/CycleForgeFloor/CameraScanSession.swift:167` |
| Status words | Centre of the strip: "Camera off" / "Offline" / "`N` pending · `M` in" / "0 in" | Footnote row above the card, only when offline ("Offline", wifi.slash, red) or in flight ("`N` pending") | layout / copy | `src/components/mobile/scan/MobileScanIdentify.tsx:506-514`; `ios:App/Sources/ScanView.swift:123-137` |
| Typed entry | Hidden behind `T` ("Type the label instead"). The field is labelled "Label" with a ✓ submit. | Always visible: "Type a tracking number" field + "Send" button | layout / copy | `src/components/mobile/station/MobileCaptureWindow.tsx:213`; `ios:App/Sources/ScanView.swift:139-151` |
| Verdict presentation | A new top row in the tape: coloured left rail, empty thumbnail, **title = verb**, mono value + "just now", coloured status word + chevron. No detail sentence. | Prominent tinted card (tone colour at 0.1 opacity, radius 12): headline, detail sentence, mono value, small "In" tag top-right. Older entries go in a plain `List` **below** the typed field. | layout | scan-refused-notfound-*.png; `src/components/mobile/receiving/arrival-station-tape.ts:16-21,77-81`; `ios:App/Sources/ScanView.swift:58-62,207,226-229` |
| Refused (lookup-po not_found) | "Not an arrival" (red) | "Not received" + "\"R-48213\" is a Cycle Forge label, not a carrier tracking number." | copy | scan-refused-notfound-*.png; `arrival-station-tape.ts:19`; `ios:App/Sources/ScanView.swift:246,260` |
| Error (lookup-po 500) | "Scan failed" (red) | "Not recorded" + "The server failed (trackingNumber is required)" | copy | scan-error-*.png; `arrival-station-tape.ts:20`; `ios:App/Sources/ScanView.swift:247` |
| Offline | "Scan failed" row + strip reads "Offline" | "Not recorded" + "Could not reach the server. Scan again once you have signal." The app's own "Offline" label did not show: the simulator's `NWPathMonitor` was online and only the transport failed. | copy | scan-offline-*.png; `MobileScanIdentify.tsx:507`; `ios:Sources/CycleForgeClient/DoorIntake.swift:236`; `ios:App/Sources/ScanView.swift:125-127` |
| Product label `96119123456789012345678` | **Nothing shown.** No tape row, no message. Only `POST /api/scan/resolve` is sent: `routeScan`→`sku`, `landScanIdentify`→`settle`, no branch renders. | "Not received" + "Nothing arrives under a product label. Scan the carrier label on the box." | layout / copy | scan-refused-local-*.png; `src/lib/scan/identify-land.ts:49-50`; `MobileScanIdentify.tsx:386-426`; `src/lib/scan/mobile-arrival-door.ts:89-93`; `ios:App/Sources/ScanView.swift:246` |
| Repeat (same product label twice) | Nothing shown (2× resolve POST, no row) | Top card "Not sent" + "Already scanned — not sent again."; the first "Not received" goes to the list below | copy / layout | scan-repeat-*.png; `ios:App/Sources/ScanView.swift:252`, `ios:Sources/CycleForgeClient/ScanStation.swift:216-218` |
| Known (preview hit) | Hands off to `/m/r/48213/place` (Pair) | Pushes `Pair`. Same handoff. | — (same) | scan-known-*.png; `MobileScanIdentify.tsx:384-388`; `ios:Sources/CycleForgeClient/DoorIntake.swift:81-83` |
| Accepted (matched) | Hands off to Pair. The tape verb would be "Arrived". | Pushes `Pair`. The card behind it reads "Arrived · Found" | copy | scan-accepted-*.png; `arrival-station-tape.ts:17`; `ios:App/Sources/ScanView.swift:244` |
| Known verb | "Already arrived" | "Already logged" | copy | `arrival-station-tape.ts:18`; `ios:App/Sources/ScanView.swift:245` |
| Tone colours | Tape rail and status word use design-system tone tokens (ok green / warn / bad red) | `.green` / `.orange` / `.red` system colours | token | `ios:App/Sources/ScanView.swift:231-238` |

##### Pair (`/m/r/[id]/place`)

| Area | Web | App | Kind | Evidence |
|---|---|---|---|---|
| Package block | Flat section on white. Sections divided by full-width rules (`divide-y divide-mode-rule`). | Gray `secondarySystemBackground` card, radius 12 | layout / token | pair-found-urgent-*.png; `MobileV2ArrivalPlacement.tsx:144,38`; `ios:App/Sources/PairView.swift:377` |
| Tracking | `text-role-title` mono, one line, `break-all` | `.title3.monospaced().semibold`. The USPS tracking wraps to a 2nd line ("…428490" → "…42849" / "0") at 390 pt. | token / layout | pair-unfound-noturgent-*.png, pair-live-unfound-*.png; `MobileV2ArrivalPlacement.tsx:40`; `ios:App/Sources/PairView.swift:352` |
| Found / Unfound pill | Found: neutral `bg-surface-sunken`. Unfound: amber `bg-amber-100 text-amber-800`. | Found: green 0.2 capsule. Unfound: red 0.2 capsule. | token | `MobileV2ArrivalPlacement.tsx:41-47`; `ios:App/Sources/PairView.swift:361` |
| Item lines | Text only: "2 × Apple MacBook Air…", then "Line L-88122". No photo, no SKU. | 52 pt photo tile (shippingbox placeholder) + title + mono SKU + "Qty 2" | layout / copy / icon | `MobileV2ArrivalPlacement.tsx:51-59`; `ios:App/Sources/PairView.swift:381-419` (`394`: `"Qty \(quantity)"`) |
| Quantity copy | "2 × " prefix | "Qty 2" suffix | copy | same as above |
| Urgency control | Compact `IdentifierToggle` pill. The selected option is a raised white chip; same neutral colour for both choices. | Full-width 44 pt two-button bar. Selected Urgent = solid red with white text; selected Not urgent = solid accent blue. | token / layout | pair-found-urgent-*.png, pair-found-noturgent-*.png; `MobileV2ArrivalPlacement.tsx:167-176`; `ios:App/Sources/PairView.swift:203-244` (`237`) |
| Urgency reason | `text-sm text-mode-muted` | `.subheadline` secondary | token | `MobileV2ArrivalPlacement.tsx:176`; `ios:App/Sources/PairView.swift:213-216` |
| Suggested / On | "Suggested: **RK1-3** · any location works": same words | same words | — (copy same) | `MobileV2ArrivalPlacement.tsx:181,186`; `ios:App/Sources/PairView.swift:250-255` |
| Photo the label | Underlined bold text link | Bordered button with a `camera` SF Symbol | icon / token | `MobileV2ArrivalPlacement.tsx:189-194`; `ios:App/Sources/PairView.swift:139-146` |
| Scan bar | Bottom single-line `MobileV2ScanInput`: stance icon · "Scan any location label" · camera button · green bottom rule. No live viewfinder. | 160 pt black `CameraBox` + "Type a location label" field + "Place" button on a `.bar` background | layout / copy | pair-found-urgent-*.png; `MobileV2ArrivalPlacement.tsx:205-214`; `ios:App/Sources/PairView.swift:266-290` |
| Placed | Eyebrow "PLACED", then "Placed on RK1-3 · Urgent" (`text-role-title`) on white; top bar kept | Same words in a green 0.12 rounded card, `.title2.semibold`; nav bar "Pair" | token | pair-placed-*.png; `MobileV2ArrivalPlacement.tsx:157-162`; `ios:App/Sources/PairView.swift:158-171` |
| Placed → back | `router.replace(back)` after 900 ms | `pause(placedReturnDelay)` = 900 ms, then `dismiss()` (pop animation, not replace) | — (timing same; transition differs: motion) | `MobileV2ArrivalPlacement.tsx:31,83-87`; `ios:Sources/CycleForgeClient/PairStation.swift:34,149-150` |
| Loading | "Loading the package…" semibold muted text, top of the body | Spinner (`ProgressView`) + the same words, lower | icon / layout | pair-loading-*.png; `MobileV2ArrivalPlacement.tsx:146`; `ios:App/Sources/PairView.swift:201` |

##### Label photo (`/m/r/[id]/photos?stage=arrival_package`)

| Area | Web | App | Kind | Evidence |
|---|---|---|---|---|
| Header | Eyebrow "Arrival · package", mono tracking, round X | Caption "Shipping label", bold "Capture the shipping label flat", mono tracking, round X | copy | photo-arrival-*.png; `src/lib/photos/stages.ts:33`; `ios:App/Sources/LabelPhotoCapture.swift:73-94` |
| Capture choices | Two buttons: "Device camera" (white) and "Choose photos" (dark); "Continuous, device or library" + "0/10 new" counter | One lens area + large round shutter. No library, no counter. | layout / copy | `src/components/mobile/photos/MobileNativePhotoCapture.tsx:361,374,385-386`; `ios:App/Sources/LabelPhotoCapture.swift:182,232-235` |
| No-camera notice | Amber notice "No camera was found. Use photos from this device instead." | Centred "No camera is available on this device." | copy / token | `src/components/mobile/photos/MobileContinuousPhotoCamera.tsx:26`; `ios:Sources/CycleForgeFloor/LabelPhotoCamera.swift:126` |
| Empty state | Dashed box: camera icon, "No photos yet", "Capture repeatedly or choose several existing photos." | none | layout / copy / icon | `MobileNativePhotoCapture.tsx:412-416` |
| Done | Green ✓ bottom-right | none (closes on upload) | icon / layout | photo-arrival-web.png |

##### Unbox (`/m/unbox`)

| Area | Web | App | Kind | Evidence |
|---|---|---|---|---|
| List container | `MobileRecordCard` cards on white: hairline ring, `rounded-mode`, 1-unit red left rail when urgent | `insetGrouped` List rows on gray, disclosure chevron, no rail | layout / token | unbox-live-*.png, unbox-many-*.png; `src/design-system/components/MobileRecordCard.tsx:74,94`; `ios:App/Sources/UnboxView.swift:35-50` |
| Row anatomy | Line 1: identity ("B-09-07" / "Not placed") + **status pill** ("Urgent" red / "Not urgent" neutral) + "Waiting 6d" on the right. Then title, "Tracking …", "**From** eBay · Order … · vendor", "3 lines". | Line 1: place + "Waiting 6d". Then title, "Tracking " + mono value, "From …". **Urgency capsule + "3 lines" on the last line.** | layout | `src/components/mobile/v2/receiving/MobileV2UnboxNext.tsx:27-44`; `ios:App/Sources/UnboxView.swift:110-147` |
| Unfound title | "Unfound" in default ink | "Unfound" in **red** | token | unbox-live-*.png; `MobileV2UnboxNext.tsx:34`; `ios:App/Sources/UnboxView.swift:124` |
| Tracking value | Sans (detail line) | `.subheadline.monospaced()` | token | `MobileV2UnboxNext.tsx:35`; `ios:App/Sources/UnboxView.swift:127` |
| Identity | Placed: mono code; "Not placed": ink | Placed: `.headline.monospaced()`; "Not placed": secondary gray | token | `ios:App/Sources/UnboxView.swift:112-114` |
| Urgent pill colour | Tone `bad` pill (red text, light red) | `Color.red.opacity(0.2)` capsule, primary text | token | `MobileRecordCard.tsx:101`; `ios:App/Sources/UnboxView.swift:142` |
| Count header | "7 to unbox · urgent first" in body ink | Same words as a grouped-section header (small, gray) | token | `MobileV2UnboxNext.tsx:80`; `ios:App/Sources/UnboxView.swift:45` |
| Empty | "Nothing waiting to unbox" / "Every arrived package has been opened.", top-aligned, no icon | Same words, vertically centred, with a `shippingbox` icon (`ContentUnavailableView`) | icon / layout | unbox-0-*.png; `MobileV2UnboxNext.tsx:73`; `ios:App/Sources/UnboxView.swift:92-96` |
| Loading | "Loading the unbox queue…" text at the top | Spinner + the same words, centred | icon / layout | unbox-loading-*.png; `MobileV2UnboxNext.tsx:56`; `ios:App/Sources/UnboxView.swift:71` |
| Error | "Could not load the unbox queue" (red) + white secondary "Try again" | Same headline + extra sentence "Cannot reach app.cycleforge.ai. Check the network and try again." + blue bordered "Try again", centred | copy / token | unbox-error-*.png; `MobileV2UnboxNext.tsx:58-66`; `ios:Sources/CycleForgeClient/UnboxQueue.swift:163`; `ios:App/Sources/UnboxView.swift:73-90` |
| Error timing | The web shows the error only after react-query's retries | Shows on the first failed read | motion | [INFERENCE: react-query default `retry: 3`; `MobileV2UnboxNext.tsx:48-53` sets none] |
| Tap target | Opens `/m/r/{id}` (record) with job return | Opens `PairView(receivingId:)` | behaviour (flag for 0a) | `MobileV2UnboxNext.tsx:82`; `ios:App/Sources/UnboxView.swift:37-39` |

#### Gaps (states not rendered on one side, with reason)

- **"Offline" indicator on the app.** The real indicator is `NetworkStatus` (NWPathMonitor). The harness could not make the simulator's path monitor go offline without taking the Mac host offline, so the app image shows a transport failure only.
- **Live camera.** Neither side had a camera; both images show the no-camera state.
- **Bare Arrived card on the app.** The app's own "Arrived · Found" card is only visible behind the pushed Pair screen. No separate state was captured: the web has no equivalent screen, because both hand off immediately.

#### Change candidates

- [web] Show a verdict for a product / bin label scanned at Inbound instead of silently `settle`. Today `96119…` produces no row (the known defect 1 envelope also lands here). — evidence `src/lib/scan/identify-land.ts:49-50`, `src/components/mobile/scan/MobileScanIdentify.tsx:386-426` — Phase 1
- [both] One set of verdict words for both surfaces, taken from the web: "Not an arrival" / "Scan failed" / "Already arrived" / "Arrived". The app says "Not received" / "Not recorded" / "Already logged" / "Arrived · Found". — evidence `src/components/mobile/receiving/arrival-station-tape.ts:16-21`, `ios:App/Sources/ScanView.swift:240-256` — Phase 1
- [app] The repeat gate's "Not sent · Already scanned — not sent again." has no web counterpart on screen; align it with web behaviour once 0(a) rules on it. — evidence `ios:App/Sources/ScanView.swift:252`, `ios:Sources/CycleForgeClient/ScanStation.swift:216-218` — Phase 1
- [app] Build the Scan header like `MobileScanHeader`: apps button + title + `In | Out` pill (+ `View | Operate` if kept) on one row. Drop the centred nav title and the full-width segmented control. — evidence `src/components/mobile/scan/MobileScanHeader.tsx:68-87`, `ios:App/Sources/ScanView.swift:35-41,75` — Phase 2
- [app] Build the detail top bar like `MobileV2DetailTopBar` (X Close, subtitle "Pair to a location", mono "Package {id}", scan button) for Pair, and the shell top bar ("Unbox next", apps + scan buttons) for Unbox. — evidence `MobileV2ArrivalPlacement.tsx:142`, `src/lib/mobile-context-navigation.ts:42`, `ios:App/Sources/PairView.swift:97`, `ios:App/Sources/UnboxView.swift:53` — Phase 2
- [app] Use generated Inter and IBM Plex Mono equivalents (or the token type scale) instead of SF Pro / SF Mono text styles. — evidence `ios:App/Sources/PairView.swift:352` (`.title3.monospaced()`) vs web `text-role-title font-mono` `MobileV2ArrivalPlacement.tsx:40` — Phase 2
- [app] Replace system `.green` / `.orange` / `.red` / `accentColor` / `secondarySystemBackground` with generated tone tokens: tape rails, pills, Unfound amber, urgency toggle. — evidence `ios:App/Sources/ScanView.swift:231-238`, `ios:App/Sources/PairView.swift:237,361,377`, `ios:App/Sources/UnboxView.swift:142` — Phase 2
- [app] Scan screen: a docked bottom capture window with a `T | status | ✓` strip and the "Camera off" / "Offline" / "N pending · M in" status words, instead of a top camera box + status line. Typed entry goes behind `T` with the field labelled "Label". — evidence `src/components/mobile/station/MobileCaptureWindow.tsx:196,213`, `MobileScanIdentify.tsx:506-514`, `ios:App/Sources/ScanView.swift:43,123-151` — Phase 3
- [app] Add the web's Recent arrival tape (live history seed + session rows, verb-as-title rows with rail and chevron), replacing the prominent card + lower list. — evidence `src/components/mobile/v2/scan/MobileV2ScanRecentList.tsx:101-104`, `arrival-station-tape.ts:77-81`, `ios:App/Sources/ScanView.swift:46-65` — Phase 3 (pairs with known defect 3)
- [app] Camera-unavailable copy "No camera found on this device." + "Try again", copied verbatim. — evidence `src/hooks/useBarcodeScanner.ts:201`, `ios:Sources/CycleForgeFloor/CameraScanSession.swift:167` — Phase 3
- [app] Pair: a flat package section with rules, item lines as "`N` × title" with no photo tile and no SKU/Qty, a Found (neutral) / Unfound (amber) pill, and tracking on one line. — evidence `MobileV2ArrivalPlacement.tsx:35-63`, `ios:App/Sources/PairView.swift:344-419` — Phase 3
- [app] Pair: a compact `IdentifierToggle`-style urgency pill (neutral selected chip), not red / blue filled bars. — evidence `MobileV2ArrivalPlacement.tsx:167-176`, `ios:App/Sources/PairView.swift:203-244` — Phase 3
- [app] Pair: "Photo the label" as an underlined text link; the scan bar as a single-line "Scan any location label" input with a camera button (no always-on 160 pt viewfinder, no "Place" button). — evidence `MobileV2ArrivalPlacement.tsx:189-214`, `ios:App/Sources/PairView.swift:139-146,266-290` — Phase 3
- [app] Pair placed state: eyebrow "PLACED" + title on the plain panel (no green card). The 900 ms return already matches. — evidence `MobileV2ArrivalPlacement.tsx:157-162`, `ios:App/Sources/PairView.swift:158-171` — Phase 3
- [app] Pair loading: plain "Loading the package…" text at the top, no spinner. — evidence `MobileV2ArrivalPlacement.tsx:146`, `ios:App/Sources/PairView.swift:201` — Phase 3
- [app] Label photo: the web studio header ("Arrival · package" + mono tracking) and the "Device camera" / "Choose photos" choice, notice, counter, empty box and ✓. — evidence `src/components/mobile/photos/MobileNativePhotoCapture.tsx:361-416`, `src/lib/photos/stages.ts:33`, `ios:App/Sources/LabelPhotoCapture.swift:73-94,232` — Phase 3
- [app] Unbox rows as `MobileRecordCard` cards on white: urgent left rail, status pill on the identity line, "From" label, sans tracking, Unfound in ink, count header in body ink. — evidence `src/components/mobile/v2/receiving/MobileV2UnboxNext.tsx:27-44,80`, `src/design-system/components/MobileRecordCard.tsx:74,94,101`, `ios:App/Sources/UnboxView.swift:35-50,106-150` — Phase 4
- [app] Unbox empty, loading and error states top-aligned with no icon or spinner. The error drops the extra "Cannot reach …" sentence and uses the secondary button. — evidence `MobileV2UnboxNext.tsx:55-75`, `ios:App/Sources/UnboxView.swift:68-101`, `ios:Sources/CycleForgeClient/UnboxQueue.swift:163` — Phase 4
- [both] Decide what an Unbox row opens: web `/m/r/{id}` (record), app `PairView` (Pair). Hand to 0(a). — evidence `MobileV2UnboxNext.tsx:82`, `ios:App/Sources/UnboxView.swift:37-39` — Phase 4
- [both] Keep this capture rig as the Phase 5 parity check. The web side is a `tab.route`-fulfilled smoke over `data/*.json`. The app side is a hosted `ParitySnapshotTests` at 390×844 @3x over the same JSON, decoded by the app's types. Score with `compare -metric AE -fuzz 10%`. The scratch harness was deleted; it needs a real home in the app's `App/Tests` plus a `ScanView` injection init. — evidence this report §How the captures were made — Phase 5

#### `ls -la` of the screens directory (final)

```
docs/handoff/ios-parity/screens/phase0/:
total 11052
drwxr-xr-x 1 michaelgarisek michaelgarisek   2902 Oct  4 13:01 .
drwxr-xr-x 1 michaelgarisek michaelgarisek     12 Oct  4 12:47 ..
drwxr-xr-x 1 michaelgarisek michaelgarisek    878 Oct  4 12:54 data
-rw-r--r-- 1 michaelgarisek michaelgarisek 554553 Oct  4 13:00 pair-found-noturgent-app.png
-rw-r--r-- 1 michaelgarisek michaelgarisek  93363 Oct  4 13:00 pair-found-noturgent-diff.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 150827 Oct  4 12:53 pair-found-noturgent-web.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 554133 Oct  4 13:00 pair-found-urgent-app.png
-rw-r--r-- 1 michaelgarisek michaelgarisek  92695 Oct  4 13:00 pair-found-urgent-diff.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 149361 Oct  4 12:52 pair-found-urgent-web.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 470206 Oct  4 13:00 pair-live-found-noturgent-app.png
-rw-r--r-- 1 michaelgarisek michaelgarisek  64290 Oct  4 13:00 pair-live-found-noturgent-diff.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 103436 Oct  4 12:55 pair-live-found-noturgent-web.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 413343 Oct  4 13:00 pair-live-unfound-app.png
-rw-r--r-- 1 michaelgarisek michaelgarisek  44580 Oct  4 13:00 pair-live-unfound-diff.png
-rw-r--r-- 1 michaelgarisek michaelgarisek  74052 Oct  4 12:55 pair-live-unfound-web.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 125532 Oct  4 13:00 pair-loading-app.png
-rw-r--r-- 1 michaelgarisek michaelgarisek  14371 Oct  4 13:00 pair-loading-diff.png
-rw-r--r-- 1 michaelgarisek michaelgarisek  36509 Oct  4 12:53 pair-loading-web.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 142498 Oct  4 13:00 pair-placed-app.png
-rw-r--r-- 1 michaelgarisek michaelgarisek  18255 Oct  4 13:00 pair-placed-diff.png
-rw-r--r-- 1 michaelgarisek michaelgarisek  41699 Oct  4 12:53 pair-placed-web.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 413915 Oct  4 13:00 pair-unfound-noturgent-app.png
-rw-r--r-- 1 michaelgarisek michaelgarisek  44371 Oct  4 13:00 pair-unfound-noturgent-diff.png
-rw-r--r-- 1 michaelgarisek michaelgarisek  73086 Oct  4 12:52 pair-unfound-noturgent-web.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 192552 Oct  4 13:00 photo-arrival-app.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 108904 Oct  4 13:00 photo-arrival-diff.png
-rw-r--r-- 1 michaelgarisek michaelgarisek  94490 Oct  4 12:53 photo-arrival-web.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 582539 Oct  4 13:00 scan-accepted-app.png
-rw-r--r-- 1 michaelgarisek michaelgarisek  92874 Oct  4 13:00 scan-accepted-diff.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 149361 Oct  4 12:57 scan-accepted-web.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 216875 Oct  4 13:00 scan-error-app.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 149554 Oct  4 13:00 scan-error-diff.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 144558 Oct  4 12:56 scan-error-web.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 183495 Oct  4 13:00 scan-idle-app.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 143514 Oct  4 13:00 scan-idle-diff.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 138908 Oct  4 12:59 scan-idle-web.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 582539 Oct  4 13:00 scan-known-app.png
-rw-r--r-- 1 michaelgarisek michaelgarisek  92874 Oct  4 13:01 scan-known-diff.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 149361 Oct  4 12:59 scan-known-web.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 223769 Oct  4 13:00 scan-offline-app.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 148455 Oct  4 13:01 scan-offline-diff.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 142922 Oct  4 12:56 scan-offline-web.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 227537 Oct  4 13:00 scan-refused-local-app.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 144548 Oct  4 13:01 scan-refused-local-diff.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 138908 Oct  4 12:58 scan-refused-local-web.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 228697 Oct  4 13:00 scan-refused-notfound-app.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 149589 Oct  4 13:01 scan-refused-notfound-diff.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 143776 Oct  4 12:56 scan-refused-notfound-web.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 246124 Oct  4 13:00 scan-repeat-app.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 148416 Oct  4 13:01 scan-repeat-diff.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 138908 Oct  4 12:58 scan-repeat-web.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 153535 Oct  4 13:00 unbox-0-app.png
-rw-r--r-- 1 michaelgarisek michaelgarisek  22907 Oct  4 13:01 unbox-0-diff.png
-rw-r--r-- 1 michaelgarisek michaelgarisek  43461 Oct  4 12:54 unbox-0-web.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 231864 Oct  4 13:00 unbox-1-app.png
-rw-r--r-- 1 michaelgarisek michaelgarisek  48268 Oct  4 13:01 unbox-1-diff.png
-rw-r--r-- 1 michaelgarisek michaelgarisek  84043 Oct  4 12:54 unbox-1-web.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 164116 Oct  4 13:00 unbox-error-app.png
-rw-r--r-- 1 michaelgarisek michaelgarisek  19624 Oct  4 13:01 unbox-error-diff.png
-rw-r--r-- 1 michaelgarisek michaelgarisek  37547 Oct  4 12:54 unbox-error-web.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 303243 Oct  4 13:00 unbox-live-app.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 110356 Oct  4 13:01 unbox-live-diff.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 211640 Oct  4 12:54 unbox-live-web.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 132945 Oct  4 13:00 unbox-loading-app.png
-rw-r--r-- 1 michaelgarisek michaelgarisek  12723 Oct  4 13:01 unbox-loading-diff.png
-rw-r--r-- 1 michaelgarisek michaelgarisek  30624 Oct  4 12:54 unbox-loading-web.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 373565 Oct  4 13:00 unbox-many-app.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 152771 Oct  4 13:01 unbox-many-diff.png
-rw-r--r-- 1 michaelgarisek michaelgarisek 271327 Oct  4 12:54 unbox-many-web.png

docs/handoff/ios-parity/screens/phase0/data/:
total 88
-rw-r--r-- 1 michaelgarisek michaelgarisek   367 Oct  4 12:54 arrival-live-53165-unfound.json
-rw-r--r-- 1 michaelgarisek michaelgarisek   589 Oct  4 12:54 arrival-live-53388-found.json
-rw-r--r-- 1 michaelgarisek michaelgarisek  1108 Oct  4 12:47 arrival-package-found.json
-rw-r--r-- 1 michaelgarisek michaelgarisek  1108 Oct  4 12:47 arrival-package-not-urgent-by-hand.json
-rw-r--r-- 1 michaelgarisek michaelgarisek  1177 Oct  4 12:47 arrival-package-placed.json
-rw-r--r-- 1 michaelgarisek michaelgarisek   499 Oct  4 12:47 arrival-package-unfound.json
-rw-r--r-- 1 michaelgarisek michaelgarisek   302 Oct  4 12:47 label-photo-uploaded.json
-rw-r--r-- 1 michaelgarisek michaelgarisek    64 Oct  4 12:47 lookup-po-failed.json
-rw-r--r-- 1 michaelgarisek michaelgarisek  1372 Oct  4 12:47 lookup-po-matched.json
-rw-r--r-- 1 michaelgarisek michaelgarisek   183 Oct  4 12:47 lookup-po-not-found.json
-rw-r--r-- 1 michaelgarisek michaelgarisek   422 Oct  4 12:47 preview-scan-hit.json
-rw-r--r-- 1 michaelgarisek michaelgarisek   120 Oct  4 12:47 preview-scan-miss.json
-rw-r--r-- 1 michaelgarisek michaelgarisek    38 Oct  4 12:47 receiving-lines-empty.json
-rw-r--r-- 1 michaelgarisek michaelgarisek   188 Oct  4 12:47 scan-resolve.json
-rw-r--r-- 1 michaelgarisek michaelgarisek   869 Oct  4 12:47 session-signed-in.json
-rw-r--r-- 1 michaelgarisek michaelgarisek    36 Oct  4 12:47 unbox-0.json
-rw-r--r-- 1 michaelgarisek michaelgarisek   588 Oct  4 12:54 unbox-1.json
-rw-r--r-- 1 michaelgarisek michaelgarisek 16100 Oct  4 12:54 unbox-many.json
-rw-r--r-- 1 michaelgarisek michaelgarisek  2260 Oct  4 12:54 unbox-next-live.json
```

Cleanup:
- `prometheus:/tmp/cf-ios-snap` (scratch copy, harness, its `build/DD-displaydiff` and `out/`) is deleted; `ls /tmp | grep -c cf-ios-snap` → `0`.
- avion `/tmp/pd` (fixture copies, `rt*.mts` classifier scripts, contact sheets) is deleted.
- The managed browser tab is closed.
- `~/Projects/cycleforge-ios` was only read.


---

# Appendix C — Token inventory (0c)

### Phase 0(c) Token Inventory — Web `/m` vs iOS Native

**Date**: 2026-10-04  
**Audit Target**: Web `/m` Arrival + Unbox reference components vs SwiftUI native implementation (`App/Sources/*.swift` and `Sources/CycleForgeFloor/*.swift`) on `prometheus` (`~/Projects/cycleforge-ios`).

---

#### 1. Theming & Generator Architecture Analysis

##### 1.1 Does the Web Have a Dark Theme for `/m`?
- **Root Inheritance & Theme Palettes**: The web application uses a unified root layout (`src/app/layout.tsx`) that injects `THEME_BOOT_SCRIPT` and `<style id="app-theme-palettes">` generated from `src/design-system/themes/registry.ts`. The theme registry defines both `light` (`LIGHT_THEME` in `@cycleforge/design-tokens`) and `dark` (`darkPalette` in `src/design-system/themes/dark.ts`, plus `mono`, `slate`, `paper`, `ember`, `cyberpunk`, `forest`).
- **CSS Variable Cascade**: All semantic surfaces (`bg-surface-canvas`, `bg-surface-card`, `bg-surface-sunken`, `text-text-default`, `text-text-muted`, `border-border-soft`, etc.) map to CSS variables (`--ds-color-*`). When `data-color-scheme="dark"` is set on `<html>`, these CSS variables switch to dark palette values (e.g., `--ds-color-background-canvas`: `#020617`, `--ds-color-background-surface`: `#0f172a`, `--ds-color-text-primary`: `#f8fafc`).
- **Tailwind `@custom-variant dark`**: In `src/app/globals.css:29`, Tailwind's `dark:` variant is customized to follow the app's theme (`&:where([data-color-scheme='dark'], [data-color-scheme='dark'] *)`), explicitly ignoring the operating system's `prefers-color-scheme`.
- **Mobile `/m` Navigation & Switcher**: Mobile routes (`/m/*`) do **not** paint an Appearance/Theme picker in their compact chrome (`MobileV2TopBar` or `MobileV2Shell`). However, if an operator's profile or browser session has a dark theme active, `/m` components automatically render in dark mode through the CSS custom properties.
- **Media Stage Hardcoding**: Viewfinders, camera viewports, and photo studios (`MobileCaptureWindow`, `MobileCameraPanel`, `MobileReceivingPhotoStudio`, `MobileContinuousPhotoCamera`) intentionally hardcode dark backdrop tokens (`bg-stage`: `#000000`, `bg-scrim`: `#020617`, text white). Per `tailwind.config.mjs:132-140`: *"stage serves the media, not the palette."*
- **Native iOS Parity Mismatch**: The native iOS app in `CycleForgeFloorApp.swift:27` hardcodes `.preferredColorScheme(.light)` across the entire app, while `LabelPhotoCapture.swift:50` hardcodes `.preferredColorScheme(.dark)`. The app currently has zero awareness of web theme variables.

##### 1.2 Does Any Token Generator Exist Already?
- **Existing Generator**: A generator script exists at `packages/design-tokens/scripts/generate.ts` (`pnpm tokens:build`). It reads from `packages/design-tokens/src` and generates `packages/design-tokens/generated/DesignTokens.swift`, `tokens.css`, and `tokens.json`.
- **Current Scope of `DesignTokens.swift`**:
  - Only generates task modes (`DesignTokens.Mode`: canvas, bar, panel, well, etc.), lifecycle states (`LIFECYCLE`), carrier inbound delivery states (`INBOUND_DELIVERY`), inbound ladder (`INBOUND_LIFECYCLE`), pickup ladder (`PICKUP_LIFECYCLE`), service levels (`SERVICE_LEVEL`), and intake classes (`INTAKE`).
  - Explicitly states: `// Light scheme only (the floor apps are light-only).`
- **What is Missing**:
  1. It does **not** export the web's design system tokens from `src/design-system/tokens/**` (colors from `semantic.ts` and `themes/registry.ts`, radius scale from `radius.ts`, spacing scale from `spacing.mjs`/`spacing.ts`, elevation/shadows from `shadows.ts` and `globals.css`, border widths from `borders.ts`).
  2. It does **not** export the CF Type typography scale (`role-display`, `role-title`, `role-body`, `role-data`, `role-nav`, `role-caption`, `role-eyebrow`, `role-micro`, `role-field`) or typography presets from `src/design-system/tokens/typography/presets.ts`.
  3. The iOS project (`cycleforge-ios`) does **not** link or consume `packages/design-tokens` or `DesignTokens.swift` at all; `Package.swift` has zero dependency on it.
- **Phase 2 Requirement**: A dedicated generator must emit `CycleForgeTokens.swift` directly into the iOS repository, exposing colors (both Light and Dark palettes), role typography, spacing, corner radii, borders, and elevation.

---

#### 2. Table 1: Web Design Tokens Used by Reference Components

Reference components surveyed:
- `src/components/mobile/v2/MobileV2Shell.tsx`
- `src/components/mobile/v2/MobileV2TopBar.tsx`
- `src/components/mobile/v2/MobileV2AppSwitcher.tsx`
- `src/components/mobile/v2/MobileV2ScanCta.tsx`
- `src/components/mobile/v2/MobileV2DetailTopBar.tsx`
- `src/components/mobile/v2/mobile-v2-destinations.tsx`
- `src/components/mobile/scan/MobileScanIdentify.tsx`
- `src/components/mobile/scan/MobileScanHeader.tsx`
- `src/components/mobile/station/MobileCaptureWindow.tsx`
- `src/components/mobile/station/MobileCameraPanel.tsx`
- `src/components/mobile/receiving/*` (`ScanAgainBar.tsx`, `MobileArrivalClassifyFlow.tsx`, `arrival-station-tape.ts`)
- `src/components/mobile/v2/scan/MobileV2ScanStation.tsx`, `MobileV2ScanRecentList.tsx`
- `src/components/mobile/v2/receiving/MobileV2ArrivalPlacement.tsx`
- `src/components/mobile/v2/receiving/MobileV2UnboxNext.tsx`
- `src/design-system/components/MobileRecordCard.tsx`
- `src/components/mobile/photos/MobileReceivingPhotoStudio.tsx` & `MobileNativePhotoCapture.tsx` / `MobileContinuousPhotoCamera.tsx`

| Axis | Token / Utility Class | Source Definition | Resolved Value (Light) | Resolved Value (Dark) | Where Used (Web File:Line) |
|---|---|---|---|---|---|
| **Color: Surface** | `bg-surface-canvas` | `src/design-system/themes/light.ts:11`, `dark.ts:15` via `--ds-color-background-canvas` | `#fafafa` | `#020617` | `MobileScanIdentify.tsx:534,606`, `MobileV2ScanStation.tsx:24` |
| **Color: Surface** | `bg-surface-card` | `light.ts:11`, `dark.ts:16` via `--ds-color-background-surface` | `#ffffff` | `#0f172a` | `app-surface.ts:80` (`appMobilePageGroundClass`), `MobileV2Shell.tsx:32,45`, `MobileV2TopBar.tsx:180`, `MobileV2ScanCta.tsx:63`, `MobileV2AppSwitcher.tsx:188,198`, `MobileV2ScanRecentList.tsx:43`, `MobileRecordCard.tsx:69` |
| **Color: Surface** | `bg-surface-card/95` | `src/design-system/tokens/app-surface.ts:63` via `--ds-color-background-surface` + alpha 0.95 | `rgba(255, 255, 255, 0.95)` | `rgba(15, 23, 42, 0.95)` | `mobile-viewport.ts:40` (`mobileTopBarClass`), `MobileV2TopBar.tsx:94`, `MobileScanHeader.tsx:46`, `MobileV2DetailTopBar.tsx:67` |
| **Color: Surface** | `bg-surface-sunken` | `light.ts:11`, `dark.ts:17` via `--ds-color-surface-sunken` | `#f1f5f9` (slate-100) | `#1e293b` (slate-800) | `ScanAgainBar.tsx:19`, `MobileScanHeader.tsx:68`, `IdentifierToggle.tsx:37,50`, `MobileV2ScanRecentList.tsx:43,47`, `MobileV2ArrivalPlacement.tsx:44`, `MobileV2ActionSlot.tsx:17` |
| **Color: Surface** | `bg-surface-hover` | `light.ts:11`, `dark.ts:18` via `--ds-color-surface-hover` | `#f8fafc` (slate-50) | `#1e293b` (slate-800) | `MobileV2DetailTopBar.tsx:75,85`, `MobileV2ActionSlot.tsx:17,23` |
| **Color: Surface** | `bg-surface-strong` | `light.ts:11`, `dark.ts:19` via `--ds-color-surface-strong` | `#e2e8f0` (slate-200) | `#334155` (slate-700) | `ScanAgainBar.tsx:19` |
| **Color: Surface** | `bg-surface-accent/40` | `light.ts:11`, `dark.ts:38` via `--ds-color-surface-accent` | `rgba(238, 242, 255, 0.40)` | `rgba(58, 96, 181, 0.07)` | `MobileV2ScanRecentList.tsx:44` (latest scan row wash) |
| **Color: Surface** | `bg-mode-panel` | `src/design-system/modes/registry.ts:40` via `--mode-panel` | `#ffffff` | `#0f172a` | `MobileV2ArrivalPlacement.tsx:171`, `MobileV2UnboxNext.tsx:78` |
| **Color: Surface** | `bg-stage` | `tailwind.config.mjs:137` | `#000000` (fixed) | `#000000` (fixed) | `MobileCameraPanel.tsx:67`, `MobileNativePhotoCapture.tsx:288`, `r/[id]/photos/page.tsx:112` |
| **Color: Surface** | `bg-scrim/55` | `tailwind.config.mjs:135` via `#020617` + alpha 0.55 | `rgba(2, 6, 23, 0.55)` (fixed) | `rgba(2, 6, 23, 0.55)` (fixed) | `MobileCameraPanel.tsx:142` |
| **Color: Surface** | `bg-black/55`, `bg-black/70` | Tailwind raw black + alpha | `rgba(0, 0, 0, 0.55)`, `rgba(0, 0, 0, 0.70)` | Same | `MobileContinuousPhotoCamera.tsx:162,168,181` |
| **Color: Ink** | `text-text-default` | `light.ts:11`, `dark.ts:11` via `--ds-color-text-primary` | `#0f172a` (slate-900) | `#f8fafc` (slate-50) | `MobileV2TopBar.tsx:81,141,162`, `MobileV2DetailTopBar.tsx:73,99`, `MobileScanHeader.tsx:54,58`, `MobileV2ScanRecentList.tsx:49`, `MobileRecordCard.tsx:69` |
| **Color: Ink** | `text-text-muted` | `light.ts:11`, `dark.ts:12` via `--ds-color-text-secondary` | `#475569` (slate-600) | `#cbd5e1` (slate-300) | `MobileV2DetailTopBar.tsx:88,103`, `MobileScanHeader.tsx:68`, `MobileCameraPanel.tsx:162`, `MobileV2ScanRecentList.tsx:50`, `MobileRecordCard.tsx:113,124,131`, `MobileV2ActionSlot.tsx:17` |
| **Color: Ink** | `text-text-soft` | `light.ts:11`, `dark.ts:13` via `--ds-color-text-soft` | `#64748b` (slate-500) | `#9aa8bc` | `ScanAgainBar.tsx:19`, `MobileScanIdentify.tsx:563,565,570`, `MobileV2DetailTopBar.tsx:94` |
| **Color: Ink** | `text-text-faint` | `light.ts:11`, `dark.ts:14` via `--ds-color-text-faint` | `#94a3b8` (slate-400) | `#8693a5` | `MobileV2NavigationRows.tsx:57`, `IdentifierToggle.tsx:55`, `MobileV2ScanRecentList.tsx:55` |
| **Color: Ink** | `text-text-danger` | `light.ts:11`, `dark.ts:33` via `--ds-color-text-danger` | `#dc2626` (red-600) | `#f87171` (red-400) | `MobileV2Shell.tsx:21,22`, `MobileScanIdentify.tsx:551`, `MobileCameraPanel.tsx:160`, `MobileV2ArrivalPlacement.tsx:185,210`, `MobileV2UnboxNext.tsx:62` |
| **Color: Ink** | `text-text-inverse` | `light.ts:11`, `dark.ts:25` via `--ds-color-text-inverse` | `#ffffff` | `#f1f5f9` | `MobileRecordCard.tsx:119` |
| **Color: Ink** | `text-mode-ink` | `modes/registry.ts:40` via `--mode-ink` | `#0f172a` | `#f8fafc` | `MobileV2ArrivalPlacement.tsx:40,46,50,193`, `MobileV2UnboxNext.tsx:80` |
| **Color: Ink** | `text-mode-muted` | `modes/registry.ts:40` via `--mode-muted` | `#64748b` | `#9aa8bc` | `MobileV2ArrivalPlacement.tsx:48,174,191,199,203`, `MobileV2UnboxNext.tsx:56` |
| **Color: Border** | `border-border-soft` | `light.ts:11`, `dark.ts:27` via `--ds-color-border-subtle` | `#e2e8f0` (slate-200) | `#1e293b` (slate-800) | `mobile-viewport.ts:40`, `MobileV2TopBar.tsx:180`, `MobileV2ScanCta.tsx:63`, `MobileScanHeader.tsx:46`, `MobileV2ScanRecentList.tsx:43`, `MobileV2ActionSlot.tsx:17` |
| **Color: Border** | `border-border-hairline`| `light.ts:11`, `dark.ts:29` via `--ds-color-border-hairline` | `#f1f5f9` (slate-100) | `#1e293b` (slate-800) | `MobileV2DetailTopBar.tsx:67`, `MobileRecordCard.tsx:69` |
| **Color: Border** | `border-border-default` | `light.ts:11`, `dark.ts:28` via `--ds-color-border-default` | `#cbd5e1` (slate-300) | `#334155` (slate-700) | `src/styles/globals.css:140`, `app-surface.ts:74` |
| **Color: Border** | `border-border-danger` | `light.ts:11`, `dark.ts:41` via `--ds-color-border-danger` | `#f87171` (red-400) | `rgba(248, 113, 113, 0.30)`| `MobileV2Shell.tsx:20` |
| **Color: Border** | `border-border-accent` | `light.ts:11`, `dark.ts:42` via `--ds-color-border-accent` | `#6366f1` (indigo-500) | `rgba(140, 167, 219, 0.30)`| `MobileV2DetailTopBar.tsx:86`, `MobileRecordCard.tsx:180`, `MobileV2NavigationRows.tsx:20` |
| **Color: Border** | `divide-mode-rule` / `border-mode-rule` | `modes/registry.ts:40` via `--mode-rule` | `#e2e8f0` | `#1e293b` | `MobileV2ArrivalPlacement.tsx:173,217` |
| **Color: Fill** | `bg-fill-info/35` | `light.ts:11`, `dark.ts:45` via `--ds-color-fill-info` | `rgba(37, 99, 235, 0.35)` | `rgba(59, 130, 246, 0.35)` | `MobileCameraPanel.tsx:151` |
| **Color: Fill** | `bg-fill-danger/30` | `light.ts:11`, `dark.ts:48` via `--ds-color-fill-danger` | `rgba(220, 38, 38, 0.30)` | `rgba(248, 113, 113, 0.30)`| `MobileCameraPanel.tsx:154` |
| **Color: Fill** | `bg-fill-info` | `light.ts:11`, `dark.ts:45` via `--ds-color-fill-info` | `#2563eb` (blue-600) | `#3b82f6` (blue-500) | `MobileRecordCard.tsx:120` |
| **Type: Role** | `text-role-display` | `tailwind.config.mjs:247` | 24px (`1.5rem`), line-height 1.2, tracking -0.02em, weight 600 | Same | Rare on handheld |
| **Type: Role** | `text-role-title` | `tailwind.config.mjs:248` | 18px (`1.125rem`), line-height 1.3, tracking -0.01em, weight 600 | Same | `MobileV2ArrivalPlacement.tsx:40,193` |
| **Type: Role** | `text-role-body` | `tailwind.config.mjs:249` | 14px (`0.875rem`), line-height 1.45, tracking 0, weight 400 | Same | `MobileV2TopBar.tsx:81`, `MobileV2DetailTopBar.tsx:99`, `MobileRecordCard.tsx:123`, `MobileV2UnboxNext.tsx:56,62,80` |
| **Type: Role** | `text-role-data` | `tailwind.config.mjs:250` | 13px (`0.8125rem`), line-height 1.4, tracking 0.01em, weight 500, tabular-nums | Same | `MobileRecordCard.tsx:109,134`, `chipText` (`presets.ts:25`) |
| **Type: Role** | `text-role-caption` | `tailwind.config.mjs:267` | 12px (`0.75rem`), line-height 1.35, tracking 0.01em, weight 500 | Same | `MobileCameraPanel.tsx:132`, `MobileV2ArrivalPlacement.tsx:43`, `MobileRecordCard.tsx:112,115,126,128,131`, `IdentifierToggle.tsx:50` |
| **Type: Role** | `text-role-eyebrow` | `tailwind.config.mjs:271` | 12px (`0.75rem`), line-height 1.35, tracking 0.06em, weight 600 | Same | `MobileScanIdentify.tsx:551,563,565,570`, `MobileCameraPanel.tsx:158`, `IdentifierToggle.tsx:54`, `MobileV2ArrivalPlacement.tsx:191` |
| **Type: Role** | `text-role-micro` | `tailwind.config.mjs:272` | 12px (`0.75rem`), line-height 1.4, tracking 0.02em, weight 500 | Same | `MobileV2DetailTopBar.tsx:94`, `MobileReceivingPhotoStudio.tsx:288`, `MobileNativePhotoCapture.tsx:313` |
| **Type: Role** | `text-role-field` | `tailwind.config.mjs:287` | 16px (`1rem`), line-height 1.4, tracking 0, weight 450 (exempt from zoom) | Same | `TextField`, `SearchField` |
| **Type: Utility** | `text-sm font-semibold` | Tailwind stock `text-sm` (14px) | 14px, weight 600, line-height 1.25rem | Same | `MobileV2ScanRecentList.tsx:49`, `MobileV2Shell.tsx:21`, `MobileReceivingPhotoStudio.tsx:289` |
| **Type: Utility** | `text-xs font-semibold` | Tailwind stock `text-xs` (12px) | 12px, weight 600, line-height 1rem | Same | `MobileV2ScanRecentList.tsx:54`, `MobileContinuousPhotoCamera.tsx:168` |
| **Radius** | `rounded-none` (`flush`) | `src/design-system/tokens/radius.ts:6` (`radius.none`) | `0px` | `0px` | `MOBILE_SCAN_WINDOW_CORNER` (`radius.ts:167`), `MobileV2ScanCta.tsx:64`, `MobileV2DetailTopBar.tsx:78` |
| **Radius** | `rounded` (`chip`) | `radius.ts:10` (`radius.DEFAULT`) | `4px` (`0.25rem`) | `4px` | `IdentifierToggle.tsx:54` |
| **Radius** | `rounded-md` (`row`) | `radius.ts:12` (`radius.md`) | `6px` (`0.375rem`) | `6px` | `IdentifierToggle.tsx:37`, `MobileRecordCard.tsx:112` |
| **Radius** | `rounded-lg` (`control`)| `radius.ts:14` (`radius.lg`) | `8px` (`0.5rem`) | `8px` | `MobileCameraPanel.tsx:125,173`, `MobileV2ScanRecentList.tsx:47`, `MOBILE_CONTROL_CORNER` (`radius.ts:164`) |
| **Radius** | `rounded-xl` (`field`) | `radius.ts:16` (`radius.xl`) | `12px` (`0.75rem`) | `12px` | `MOBILE_ROW_CORNER` (`radius.ts:163`) |
| **Radius** | `rounded-2xl` (`card`) | `radius.ts:18` (`radius.2xl`) | `16px` (`1rem`) | `16px` | `MobileV2Shell.tsx:20` |
| **Radius** | `rounded-mode` (`surface`) | `src/design-system/modes/registry.ts:40` via `--mode-radius` | `12px` | `12px` | `MobileV2TopBar.tsx:135`, `MobileV2NavigationRows.tsx:18`, `MobileRecordCard.tsx:69` |
| **Radius** | `rounded-mode-pill` | `modes/registry.ts:40` via `--mode-radius-pill` | `9999px` | `9999px` | `MobileScanHeader.tsx:68`, `IdentifierToggle.tsx:50`, `MobileV2ArrivalPlacement.tsx:42` |
| **Radius** | `rounded-full` (`pill`)| `radius.ts:22` (`radius.full`) | `9999px` | `9999px` | `ScanAgainBar.tsx:19`, `MobileRecordCard.tsx:118`, `MobileNativePhotoCapture.tsx:320`, `MobileContinuousPhotoCamera.tsx:162,176,183` |
| **Spacing** | `h-[3.25rem]` (52px) | `src/design-system/tokens/mobile-viewport.ts:40` | `52px` | `52px` | Top bar height (`mobileTopBarClass`) |
| **Spacing** | `h-14` (56px) | `spacing.mjs:14` (`spacingScale[14]`) | `56px` (`3.5rem`) | `56px` | `MobileScanHeader.tsx:46`, `MobileV2DetailTopBar.tsx:67` |
| **Spacing** | `h-9` (36px) | `station-metrics.ts:14` (`STATION_CAMERA_HEADER_HEIGHT_CLASS`) | `36px` (`2.25rem`) | `36px` | Camera glass header row |
| **Spacing** | `px-mode-page` (16px) | `modes/registry.ts:40` via `--mode-page-pad` | `16px` (`1rem`) | `16px` | `MobileV2ArrivalPlacement.tsx:38,174,180,188,202`, `MobileV2UnboxNext.tsx:56,62,68,72` |
| **Spacing** | `p-mode-gap` (8px) | `modes/registry.ts:40` via `--mode-spacing-gap` | `8px` (`0.5rem`) | `8px` | `MobileRecordCardList` (`MobileRecordCard.tsx:194`) |
| **Spacing: Touch**| `size="touch"` (44px) | `src/design-system/tokens/interaction.ts:21` (`TOUCH_TARGET_MIN_PX`) | `44px` minimum hit target | `44px` | `MobileV2TopBar.tsx:133,160,178`, `MobileV2ScanCta.tsx:59`, `MobileV2DetailTopBar.tsx:72` |
| **Shadow** | `shadow-sm` | Tailwind stock `shadow-sm` | `0 1px 2px 0 rgba(0, 0, 0, 0.05)` | Same | `MobileV2TopBar.tsx:156,180`, `MobileV2ScanCta.tsx:63`, `IdentifierToggle.tsx:55` |
| **Shadow** | `shadow-elev-soft` | `src/styles/globals.css:135`, `dark.ts:166` | 3-layer rgba(2, 6, 23, 0.04/0.06) | 3-layer rgba(0, 0, 0, 0.28/0.36) | Elevation role `raised.soft` |
| **Shadow** | `shadow-elev-raised` | `globals.css:139`, `dark.ts:170` | 3-layer rgba(2, 6, 23, 0.05/0.07/0.13) | 3-layer rgba(0, 0, 0, 0.34/0.42/0.55) | Elevation role `raised.default` |
| **Z-Index** | `z-header` (30) | `src/design-system/tokens/z-index.mjs:16` | `30` | `30` | `mobileTopBarClass`, `MobileScanHeader.tsx:46`, `MobileV2DetailTopBar.tsx:67` |
| **Z-Index** | `z-panel` (40) | `z-index.mjs:19` | `40` | `40` | App switcher open state override |
| **Motion** | `cf-scan-pending-wash` | `src/app/globals.css:460` | 1.4s ease-out loop wash | Same | `MobileCameraPanel.tsx:151` |

---

#### 3. Table 2: iOS App Literals → Web Token Mapping

Every hand-typed literal in `App/Sources/*.swift` and `Sources/CycleForgeFloor/*.swift` surveyed against its web token counterpart:

| iOS File:Line | iOS Hardcoded Literal / Modifier | Axis | Web Token Equivalent | Target Resolved Value | Notes / Parity Assessment |
|---|---|---|---|---|---|
| `HomeView.swift:14` | `spacing: 4` | Spacing | `gap-1` (`spacingScale[1]`) | `4px` | Maps directly to web spacing step 1 |
| `HomeView.swift:16` | `.font(.title2.weight(.bold))` | Typography | `text-role-display` or `role-title` | 18px or 24px, weight 600 | **Defect**: `.bold` (700) violates the web 600 weight ceiling (`weights.ts:24`) |
| `HomeView.swift:19` | `.font(.subheadline)` | Typography | `text-role-body` or `role-caption` | 14px (400) or 12px (500) | Apple system subheadline (15px) drifts from CF Type scale |
| `HomeView.swift:20` | `.foregroundStyle(.secondary)` | Color: Ink | `text-text-muted` | `#475569` (light) / `#cbd5e1` (dark) | Native `.secondary` uses dynamic Apple system gray |
| `HomeView.swift:23` | `.padding(.vertical, 4)` | Spacing | `py-1` (`spacingScale[1]`) | `4px` | Directly maps to spacing step 1 |
| `HomeView.swift:32` | `.font(.footnote)` | Typography | `text-role-caption` | 12px, weight 500 | Apple system footnote is 13px; web caption is 12px |
| `HomeView.swift:33` | `.foregroundStyle(.orange)` | Color: Ink | `text-text-warning` | `#d97706` (light) / `#fb923c` (dark) | System orange is `#FF9500`, not CF warning token |
| `HomeView.swift:40,52` | `.font(.headline)` | Typography | `text-role-body font-semibold` | 14px, weight 600 | Native headline is 17px/600; web nav/list row title is 14px/600 |
| `ScanView.swift:37` | `VStack(spacing: 12)` | Spacing | `gap-3` (`spacingScale[3]`) | `12px` | Matches web step 3 (0.75rem) |
| `ScanView.swift:45` | `height: 220` (CameraBox) | Sizing | `STATION_CAMERA_PANEL_HEIGHT_CLASS` | `h-[46svh] min-h-[19rem]` (304px) | **Defect**: Hardcoded 220pt box instead of bottom panel |
| `ScanView.swift:53` | `.font(.subheadline)` | Typography | `text-role-eyebrow` | 12px, weight 600, tracking 0.06em | Empty prompt on web uses `text-role-eyebrow text-text-soft` |
| `ScanView.swift:54` | `.foregroundStyle(.secondary)` | Color: Ink | `text-text-soft` | `#64748b` (light) / `#9aa8bc` (dark) | Web uses `text-text-soft`, not muted secondary |
| `ScanView.swift:69` | `.padding(.horizontal, 16)` | Spacing | `px-mode-page` (`spacingScale[4]`) | `16px` | Matches `px-mode-page` |
| `ScanView.swift:70` | `.padding(.top, 8)` | Spacing | `pt-2` (`spacingScale[2]`) | `8px` | Matches step 2 |
| `ScanView.swift:124,139`| `HStack(spacing: 8)` | Spacing | `gap-2` (`spacingScale[2]`) | `8px` | Matches step 2 |
| `ScanView.swift:127` | `.foregroundStyle(.red)` | Color: Ink | `text-text-danger` | `#dc2626` (light) / `#f87171` (dark) | Apple `.red` is `#FF3B30`; web is `#dc2626` |
| `ScanView.swift:134` | `.font(.footnote.weight(.semibold))` | Typography | `text-role-eyebrow` or `chipText` | 12px, weight 600 | Footnote semibold is 13px; web is 12px |
| `ScanView.swift:144` | `.font(.body.monospaced())` | Typography | `text-role-field font-mono` | 16px, weight 450, monospace | Web field role is 16px to prevent iOS auto-zoom |
| `ScanView.swift:194` | `VStack(spacing: 6)` | Spacing | `gap-1.5` (`spacingScale[1.5]`) | `6px` | Matches step 1.5 |
| `ScanView.swift:196` | `.font(prominent ? .headline : .subheadline.weight(.semibold))` | Typography | `text-sm font-semibold` | 14px, weight 600 | Matches web `RecentRow` title (`text-sm font-semibold`) |
| `ScanView.swift:197` | `.foregroundStyle(tint)` | Color: Ink | `STATE_TONE_CLASSES[state].text` | success: `#059669` / warn: `#d97706` / danger: `#dc2626` | Native uses raw SwiftUI `.green` / `.orange` / `.red` |
| `ScanView.swift:200` | `.font(.caption2.weight(.bold))` | Typography | `text-xs font-semibold` | 12px, weight 600 | **Defect**: `.bold` (700) exceeds ceiling |
| `ScanView.swift:217` | `.padding(prominent ? 12 : 4)` | Spacing | `p-3` (12px) / `p-1` (4px) | `12px` / `4px` | Step 3 / Step 1 |
| `ScanView.swift:219` | `RoundedRectangle(cornerRadius: 12)` | Radius | `cornerClass('card')` (16px) or `field` (12px) | `12px` (`radius.xl`) or `16px` (`radius['2xl']`) | Matches `radius.xl` |
| `ScanView.swift:224-227`| `Color.green`, `Color.orange`, `Color.red` | Color | `STATE_TONES` (`packages/design-tokens`) | success: `#10b981`, warn: `#f59e0b`, danger: `#ef4444` | SwiftUI built-in colors deviate from design system |
| `ScanView.swift:262` | `.font(.caption.weight(.bold))` | Typography | `text-role-caption font-semibold` | 12px, weight 600 | **Defect**: `.bold` (700) exceeds ceiling |
| `ScanView.swift:265` | `Color.green.opacity(0.2)` / `Color.red.opacity(0.2)` | Color: Surface | `bg-surface-success` / `bg-surface-danger` | `rgba(22, 163, 74, 0.15)` / `rgba(239, 68, 68, 0.15)` | Status pill background tokens |
| `PairView.swift:86` | `VStack(spacing: 16)` | Spacing | `gap-4` (`spacingScale[4]`) | `16px` | Matches step 4 (`1rem`) |
| `PairView.swift:89` | `.padding(16)` | Spacing | `px-mode-page py-4` | `16px` | Matches `px-mode-page` |
| `PairView.swift:152` | `.foregroundStyle(.green)` | Color: Ink | `text-text-success` | `#059669` (light) / `#4ade80` (dark) | Raw `.green` vs semantic success token |
| `PairView.swift:163` | `.font(.caption.weight(.bold))` | Typography | `text-role-eyebrow uppercase font-semibold` | 12px, weight 600, tracking 0.06em | Placed tag on web: `text-role-eyebrow uppercase font-semibold text-mode-muted` |
| `PairView.swift:167` | `.font(.title2.weight(.semibold))` | Typography | `text-role-title` | 18px, weight 600, line-height 1.3 | Apple `title2` is 22px; web uses `text-role-title` (18px) |
| `PairView.swift:172` | `Color.green.opacity(0.12), RoundedRectangle(cornerRadius: 12)` | Color / Radius | `bg-surface-success`, `rounded-mode` | `rgba(34,197,94,0.15)`, radius 12px | Status wash + mode corner |
| `PairView.swift:214` | `Color(.secondarySystemFill), RoundedRectangle(cornerRadius: 12)` | Color / Radius | `bg-surface-sunken`, `rounded-md` (rail) | `#f1f5f9` (light) / `#1e293b` (dark), radius 6px | IdentifierToggle uses `rounded-md bg-surface-sunken p-0.5` |
| `PairView.swift:234` | `minHeight: 44` | Spacing: Touch | `min-h-mode-hit` (`TOUCH_TARGET_MIN_PX`) | `44px` | Matches touch minimum |
| `PairView.swift:236` | `RoundedRectangle(cornerRadius: 9)` | Radius | `rounded` (4px) or `rounded-mode-pill` (9999px) | `4px` or `9999px` | **Defect**: 9px is an arbitrary non-token radius |
| `PairView.swift:236` | `Color.red` / `Color.accentColor` | Color: Surface | Urgent: `bg-red-600` / Active: `bg-surface-card text-text-muted shadow-sm` | `#dc2626` / `#ffffff` | Web uses `IdentifierToggle` with rail/bare variant |
| `PairView.swift:248,252`| `.font(.body.monospaced().weight(.semibold))` | Typography | `font-mono font-semibold text-mode-ink` | 14px, weight 600, monospace | Matches web `PackageCard` location emphasis |
| `PairView.swift:265` | `CameraBox(..., height: 160)` | Sizing | `MobileV2ScanInput` compact / bar | Height 48px or expanded viewfinder | Web Pair screen uses input bar with camera modal |
| `PairView.swift:283` | `.background(.bar)` | Color: Surface | `border-t border-mode-rule pb-safe` | Border `#e2e8f0`, background `#ffffff` | Native uses UIKit `.bar` material |
| `PairView.swift:351` | `.font(.title3.monospaced().weight(.semibold))` | Typography | `text-role-title font-mono text-mode-ink` | 18px, weight 600, line-height 1.3 | Apple `title3` is 20px; web is 18px |
| `PairView.swift:359` | `Color.green.opacity(0.2)` / `Color.red.opacity(0.2)` | Color: Surface | `bg-surface-sunken` (found) / `bg-amber-100` (unfound) | `#f1f5f9` / `#fef3c7` (amber-100) | **Defect**: Web uses amber for unfound package pill! |
| `PairView.swift:374` | `Color(.secondarySystemBackground), RoundedRectangle(cornerRadius: 12)` | Color / Radius | `bg-mode-panel`, `divide-mode-rule` | `#ffffff` / rule `#e2e8f0` | Web does not card-wrap the package in Pair |
| `PairView.swift:405,413`| `RoundedRectangle(cornerRadius: 8)` | Radius | `cornerClass('control')` (`radius.lg`) | `8px` | Matches `radius.lg` |
| `PairView.swift:412` | `.frame(width: 52, height: 52)` | Sizing | `size-11` (44px) or `w-12 h-12` (48px) | `48px` or `44px` | Web item thumbs are 44–48px |
| `UnboxView.swift:54` | `.listStyle(.insetGrouped)` | Layout Chrome | `MobileRecordCardList` (`bg-mode-panel`) | Plain panel, cards separated by `gap-2` | **Defect**: iOS uses iOS Settings grouped table; web uses `MobileRecordCardList` |
| `UnboxView.swift:73` | `.foregroundStyle(.red)` | Color: Ink | `text-text-danger` | `#dc2626` (light) / `#f87171` (dark) | Raw `.red` vs token |
| `UnboxView.swift:105` | `.font(row.isPlaced ? .headline.monospaced() : .headline)` | Typography | `text-role-data font-semibold tabular-nums` | 13px, weight 600 | Web card identity uses `role-data font-semibold` |
| `UnboxView.swift:110` | `.font(.caption.weight(.semibold))` | Typography | `text-role-caption tabular-nums text-text-muted` | 12px, weight 500 | Web card timestamp slot |
| `UnboxView.swift:114` | `.font(.body.weight(.semibold))` | Typography | `text-role-body font-medium` | 14px, weight 500 | Web card title slot uses `font-medium` (500), not semibold |
| `UnboxView.swift:115` | `.foregroundStyle(row.isUnfound ? .red : .primary)` | Color: Ink | `text-text-default` | Title is always `text-text-default` | Unfound state is conveyed by title text, not entire title colored red |
| `UnboxView.swift:118` | `.font(.subheadline.monospaced())` | Typography | `text-role-caption text-text-muted` | 12px, weight 500 | Web detail slot is `role-caption text-text-muted` |
| `UnboxView.swift:128` | `.font(.caption.weight(.bold))` | Typography | `text-role-caption toneClasses.pill` | 12px, weight 500 | Web status pill uses `text-role-caption` + tone pill |
| `UnboxView.swift:131` | `row.isUrgent ? Color.red.opacity(0.2) : Color.secondary.opacity(0.15)` | Color: Surface | Urgent: `bg-surface-danger` / Not urgent: neutral pill | `#fee2e2` / `#f1f5f9` | Tone pills match `STATE_TONE_CLASSES` |
| `CameraBox.swift:35` | `.background(.black.opacity(0.45), in: Circle())` | Color / Radius | `bg-scrim/55`, `rounded-full` | `rgba(2, 6, 23, 0.55)`, radius 9999px | Camera glass control background |
| `CameraBox.swift:44,45`| `Color.black`, `RoundedRectangle(cornerRadius: 12)` | Color / Radius | `bg-stage`, `rounded-none` (`MOBILE_SCAN_WINDOW_CORNER`) | `#000000`, radius `0px` | **Defect**: Web camera panel has square corners (`rounded-none`), not 12px |
| `LabelPhotoCapture.swift:48` | `Color.black.ignoresSafeArea()` | Color: Surface | `bg-stage` | `#000000` (fixed) | Matches web `bg-stage` |
| `LabelPhotoCapture.swift:50` | `.preferredColorScheme(.dark)` | Appearance | Immersive media stage (always dark) | Dark appearance | Correct for photo studio |
| `LabelPhotoCapture.swift:69` | `.font(.caption.weight(.semibold)), .foregroundStyle(.white.opacity(0.6))` | Typography / Color | `text-role-micro text-white/60` | 12px, weight 500, white 60% | Matches `StudioHeader` eyebrow (`MobileReceivingPhotoStudio.tsx:288`) |
| `LabelPhotoCapture.swift:71` | `.font(.subheadline.weight(.semibold))` | Typography | `text-sm font-semibold text-white` | 14px, weight 600, white 100% | Matches `StudioHeader` label (`MobileReceivingPhotoStudio.tsx:289`) |
| `LabelPhotoCapture.swift:86` | `.background(.white.opacity(0.15), in: Circle())` | Color / Radius | `rounded-full bg-white/10 active:bg-white/20` | `rgba(255, 255, 255, 0.10)`, radius 9999px | Close button in photo header |
| `LabelPhotoCapture.swift:159`| `.font(.footnote.weight(.semibold)), .foregroundStyle(.yellow)` | Typography / Color | `text-role-caption text-amber-100`, `border-amber-400/30 bg-amber-400/10` | Amber tone warning | System yellow deviates from design system amber tone |
| `LabelPhotoCapture.swift:219,220`| Shutter circles: stroke 4px (72x72), fill (58x58) | Geometry / Color | `h-20 w-20 border-[3px] border-white/95`, inner `h-16 w-16 bg-white` | Outer 80px, border 3px; inner 64px white | Very close (72 vs 80px); Phase 2 can standardize on web shutter spec |
| `SignInView.swift:49` | `.font(.largeTitle.weight(.bold))` | Typography | `text-role-display` | 24px, weight 600 | **Defect**: `.bold` (700) exceeds ceiling; LargeTitle is 34px |
| `SignInView.swift:68,76`| `.padding(12), .background(.quaternary.opacity(0.5), RoundedRectangle(cornerRadius: 10))` | Surface / Radius | `TextField` primitive (`rounded-xl` 12px, `bg-surface-sunken`) | 12px radius, `#f1f5f9` (light) / `#1e293b` (dark) | Form fields should use standard `field` radius (12px) |
| `CycleForgeFloorApp.swift:27` | `.preferredColorScheme(.light)` | Appearance | System-wide theme locking | Follows app theme | Prevents dark mode even when web is dark |

---

#### 4. Phase 2 Generator Emission Specification (`CycleForgeTokens.swift`)

The generator script to be built in Phase 2 (`tools/generate-ios-tokens.mts` or `packages/design-tokens/scripts/generate-ios.ts`) must emit a single, self-contained Swift file `Sources/CycleForgeFloor/CycleForgeTokens.swift` (or `App/Sources/CycleForgeTokens.swift`).

##### 4.1 Required Token Structures to Emit

```swift
// Swift token structure required for Phase 2:

import SwiftUI

public enum CycleForgeTokens {
    // ── 1. Color Palettes (Theme & Scheme Adaptive) ──────────────────────────
    public enum Colors {
        // Semantic Chrome
        public static func surfaceCanvas(scheme: ColorScheme = .light) -> Color
        public static func surfaceCard(scheme: ColorScheme = .light) -> Color
        public static func surfaceSunken(scheme: ColorScheme = .light) -> Color
        public static func surfaceHover(scheme: ColorScheme = .light) -> Color
        public static func surfaceStrong(scheme: ColorScheme = .light) -> Color
        public static func surfaceInverse(scheme: ColorScheme = .light) -> Color
        
        // Semantic Inks
        public static func textDefault(scheme: ColorScheme = .light) -> Color
        public static func textMuted(scheme: ColorScheme = .light) -> Color
        public static func textSoft(scheme: ColorScheme = .light) -> Color
        public static func textFaint(scheme: ColorScheme = .light) -> Color
        public static func textInverse(scheme: ColorScheme = .light) -> Color
        
        // Borders
        public static func borderSoft(scheme: ColorScheme = .light) -> Color
        public static func borderDefault(scheme: ColorScheme = .light) -> Color
        public static func borderHairline(scheme: ColorScheme = .light) -> Color
        public static func borderAccent(scheme: ColorScheme = .light) -> Color
        public static func borderDanger(scheme: ColorScheme = .light) -> Color
        
        // Functional Status Tones (Pills, Wash, Indicator Dots)
        public enum Status {
            public static func successText(scheme: ColorScheme = .light) -> Color
            public static func successSurface(scheme: ColorScheme = .light) -> Color
            public static func successBorder(scheme: ColorScheme = .light) -> Color
            public static func warningText(scheme: ColorScheme = .light) -> Color
            public static func warningSurface(scheme: ColorScheme = .light) -> Color
            public static func warningBorder(scheme: ColorScheme = .light) -> Color
            public static func dangerText(scheme: ColorScheme = .light) -> Color
            public static func dangerSurface(scheme: ColorScheme = .light) -> Color
            public static func dangerBorder(scheme: ColorScheme = .light) -> Color
            public static func infoText(scheme: ColorScheme = .light) -> Color
            public static func infoFill(scheme: ColorScheme = .light) -> Color
        }
        
        // Media Stage / Overlay (Scheme-Independent Fixed Hex)
        public enum Stage {
            public static let background = Color(red: 0, green: 0, blue: 0) // #000000
            public static let scrim = Color(red: 2/255, green: 6/255, blue: 23/255) // #020617
            public static let glassWhite = Color.white
            public static let pillBackground = Color(red: 0, green: 0, blue: 0, opacity: 0.55)
            public static let shutterBorder = Color(white: 1.0, opacity: 0.95)
        }
    }

    // ── 2. CF Type Typography Ladder ─────────────────────────────────────────
    // Capped at weight 600 (.semibold); font size, line-height, letter-spacing
    public enum Typography {
        public static let roleDisplay = Font.system(size: 24, weight: .semibold)
        public static let roleTitle   = Font.system(size: 18, weight: .semibold)
        public static let roleBody    = Font.system(size: 14, weight: .regular)
        public static let roleBodyBold= Font.system(size: 14, weight: .semibold)
        public static let roleData    = Font.system(size: 13, weight: .medium).monospacedDigit()
        public static let roleDataBold= Font.system(size: 13, weight: .semibold).monospacedDigit()
        public static let roleNav     = Font.system(size: 13, weight: .regular)
        public static let roleCaption = Font.system(size: 12, weight: .medium)
        public static let roleCaptionBold = Font.system(size: 12, weight: .semibold)
        public static let roleEyebrow = Font.system(size: 12, weight: .semibold) // tracking +0.06em
        public static let roleMicro   = Font.system(size: 12, weight: .medium)   // tracking +0.02em
        public static let roleField   = Font.system(size: 16, weight: .regular)  // touch field 16pt
        public static let roleFieldMono = Font.system(size: 16, weight: .regular).monospaced()
    }

    // ── 3. Spacing Ladder (from spacingScale) ────────────────────────────────
    public enum Spacing {
        public static let s0: CGFloat = 0
        public static let s0_5: CGFloat = 2   // 0.125rem
        public static let s1: CGFloat = 4     // 0.25rem
        public static let s1_5: CGFloat = 6   // 0.375rem
        public static let s2: CGFloat = 8     // 0.5rem
        public static let s2_5: CGFloat = 10  // 0.625rem
        public static let s3: CGFloat = 12    // 0.75rem
        public static let s3_5: CGFloat = 14  // 0.875rem
        public static let s4: CGFloat = 16    // 1.0rem (pagePad)
        public static let s5: CGFloat = 20    // 1.25rem
        public static let s6: CGFloat = 24    // 1.5rem
        public static let s8: CGFloat = 32    // 2.0rem
        public static let s10: CGFloat = 40   // 2.5rem
        public static let s12: CGFloat = 48   // 3.0rem
        public static let s14: CGFloat = 56   // 3.5rem (bar height)
        
        // Semantic Metrics
        public static let topBarHeight: CGFloat = 52
        public static let detailTopBarHeight: CGFloat = 56
        public static let touchTargetMin: CGFloat = 44
        public static let cameraHeaderHeight: CGFloat = 36
    }

    // ── 4. Corner Radius (from radius.ts) ────────────────────────────────────
    public enum Radii {
        public static let flush: CGFloat = 0      // none
        public static let chip: CGFloat = 4       // DEFAULT
        public static let row: CGFloat = 6        // md
        public static let control: CGFloat = 8    // lg
        public static let field: CGFloat = 12     // xl
        public static let card: CGFloat = 16      // 2xl
        public static let canvas: CGFloat = 24    // 3xl
        public static let pill: CGFloat = 9999    // full
    }

    // ── 5. Border Widths ─────────────────────────────────────────────────────
    public enum BorderWidths {
        public static let hairline: CGFloat = 0.5 // or 1/UIScreen.main.scale
        public static let standard: CGFloat = 1.0
        public static let emphasis: CGFloat = 2.0
        public static let shutterRing: CGFloat = 3.0
    }

    // ── 6. Shadows / Elevation ───────────────────────────────────────────────
    public enum Elevation {
        // Elevation roles mapping to ambient + key + cast layers
        public static func apply(role: ElevationRole, to view: some View) -> some View
    }
}
```

---

#### 5. Change Candidates List

- [app] Replace all font weights of `.bold` (700) in `HomeView.swift:16`, `ScanView.swift:200,262`, `PairView.swift:163,356`, `UnboxView.swift:128`, `SignInView.swift:49` with weight 600 (`.semibold`) to respect the CF Type weight ceiling — evidence `src/design-system/tokens/typography/weights.ts:24` (Phase 2 chrome/tokens).
- [app] Generate `CycleForgeTokens.swift` and eliminate all hand-typed colors (`Color.green`, `Color.red`, `Color.orange`, `Color.yellow`, `.secondarySystemFill`, etc.) in `App/Sources/*.swift` — evidence `src/design-system/themes/light.ts:11` and `dark.ts:11` (Phase 2 chrome/tokens).
- [app] Implement `MobileV2TopBar` and `MobileV2DetailTopBar` native SwiftUI chrome with the standard 52pt/56pt height, app switcher, page title, and scan CTA — evidence `src/components/mobile/v2/MobileV2TopBar.tsx:94` and `MobileV2DetailTopBar.tsx:67` (Phase 2 chrome/tokens).
- [app] Replace `CameraBox` static 220pt rectangle with the web's bottom `MobileCameraPanel` architecture (`STATION_CAMERA_PANEL_HEIGHT_CLASS` `h-[46svh] min-h-[19rem]` with square corners and glass header) — evidence `src/components/mobile/station/MobileCameraPanel.tsx:185` (Phase 2 chrome/tokens).
- [app] Replace SwiftUI `.listStyle(.insetGrouped)` in `UnboxView.swift:54` with `MobileRecordCardList` + `MobileRecordCard` anatomy (gap 8pt, card surface, left tone rail, title wrap, metadata slots) — evidence `src/design-system/components/MobileRecordCard.tsx:69` (Phase 4 unbox).
- [app] Change Pair urgency control from arbitrary 9pt rounded rectangle buttons (`PairView.swift:236`) to the web's `IdentifierToggle` anatomy (`rounded-md bg-surface-sunken p-0.5` with active pill shadow) — evidence `src/components/ui/IdentifierToggle.tsx:37,55` (Phase 3 arrival screens).
- [app] Change unfound package badge color in `PairView.swift:359` from green/red to amber (`bg-amber-100 text-amber-800`), matching web `PackageCard` — evidence `src/components/mobile/v2/receiving/MobileV2ArrivalPlacement.tsx:44` (Phase 3 arrival screens).
- [app] Support dark theme dynamically or align `.preferredColorScheme` handling with web theme registry — evidence `CycleForgeFloorApp.swift:27` vs `src/styles/globals.css:29` (Phase 2 chrome/tokens).
- [web] Unify `MobileScanHeader.tsx:58` title font size literal (`text-[15px] font-semibold`) to standard CF Type role `text-role-body font-semibold` (14px) or `text-role-title` (18px) — evidence `src/components/mobile/scan/MobileScanHeader.tsx:58` (Phase 2 chrome/tokens).
- [web] Create the token generator script `tools/generate-ios-tokens.mts` that extracts tokens from `src/design-system/tokens/**` and `typography/presets.ts` and outputs `CycleForgeTokens.swift` — evidence `packages/design-tokens/scripts/generate.ts:1` (Phase 2 chrome/tokens).


---

# Appendix D — Scan corpus (0d)

### Phase 0(d) — Real scan corpus

Raw corpus: `docs/handoff/ios-parity/corpus/scan-corpus.json` (1538 rows; `ls -l` → 622761 bytes; `rows.length` = 1538). 4 rows dropped for PII (a FedEx 2D payload with a consignee's name/address, free-text notes).

#### Method
- Source: worktree `.env` DB, session `default_transaction_read_only=on`, SELECT only. Columns found via `information_schema.columns`:
  `mobile_scan_events.raw_value` (18467 rows / 370 distinct — the phone door's raw bytes), `scan_triage_records.raw_value` (510/417), `receiving_scans.tracking_number` (4102/4019), `station_scan_sessions.tracking_raw` (3822/3298), `shipping_tracking_numbers.tracking_number_raw` (12678/12326), `label_ingestions.tracking_number_raw` (99/98), `tracking_exceptions.tracking_number` (1125/1125).
- Sample: every distinct value from `mobile_scan_events` and `scan_triage_records`; for the other tables, 1 value per (source, first-3-chars, length) bucket, so every envelope shape is represented. A value that shows up in several tables is credited to one source (`min(source)`).
- Classified by the real web functions: `routeScan` (src/lib/barcode-routing.ts:176), `arrivalScanIntent` (src/lib/scan/mobile-arrival-door.ts:68), `normalizeTrackingNumber` (src/lib/tracking-format.ts:102), `normalizeTrackingLast8` (src/lib/tracking-format.ts:127), `detectCarrier` (src/lib/tracking-format.ts:170). `refused` = `arrivalScanIntent(...).kind === 'refused'`.
- Command (throwaway script, deleted afterwards):
  `node --import tsx --import ./scripts/register-server-only-shim.cjs /tmp/classify-corpus.mts`
  Output excerpt (routeScan kinds over the 1542 sampled rows, before PII drop / regrouping):
  ```
  carrier-tracking:UPS 52 | ref 0     sku 508 | ref 508      bin 636 | ref 636
  carrier-tracking:USPS 44 | ref 0    carrier-tracking:FedEx 172 | ref 0
  receiving 43 | ref 0    serial-unit 30 | ref 30    fnsku 27 | ref 27
  carrier-tracking:DHL 28 | ref 0    carrier-tracking:Unknown 2 | ref 0
  ```
- The carrier guess / `pattern` column is my own regex grouping (in the json as `pattern` + `class` carrier|house|noise). It is a label for review, not web logic. `routeScan` returns only these kinds for the corpus: carrier-tracking / sku / bin / receiving / serial-unit / fnsku. **Every value it does not see as carrier-tracking or receiving is refused** (mobile-arrival-door.ts:82-95).


#### Findings — patterns the Phase 1 fix must cover

Beyond the known 420+ZIP / 96… / TBA / leading 0/700 cases, the corpus shows these refused shapes (all → `sku` or `bin` → refused):
1. **FedEx 34-digit, any prefix** (15/15 refused): `96…` (9) and others such as `1001901772440009264700522300969633`, `1311308824370001956700875052173201` (6). The tracking number is the last 12 digits; last-8 already matches.
2. **USPS 420+ZIP, every variant** (25/28 refused): ZIP5 (`420926479214490407314819163965`), ZIP9 (`420119379334610990370278033454`), ZIP9 with a `0299` filler (`4209264736030299434608106244194257131`), a GS separator kept as `\u001d` or shown as `]` (`42001464<GS>9434…`, `420926473603]9434…`), and ZIP+IMpb 20-digit / 26-digit inner numbers (`42033259300110990513556425161`). The normaliser strips 420+ZIP only for the GS/`]` forms, but last-8 is the trailing tracking digits in every case, so the server's last-8 match would succeed.
3. **USPS IMpb of 21 and 26 digits** (9/13 refused): `930011099051354526615`, `940010810624568470478`, `92346902673388000095297453`. 20- and 22-digit forms are accepted.
4. **Concatenated / truncated digit runs** (46/48 refused): double scans glued together (`94001081062442393259159400108106244239325915`, a chain of 305 digits), and 420/96 heads cut short by a missed first character (`2092647…`, `22001900…`, 32/33-digit FedEx). These need a "contains a known envelope" rule or the server resolver; refusing them locally hides real packages.
5. **FedEx PDF417/2D payloads** (12/12 refused): `[)>01…` and `0102…FDEG…` strings carrying `96…` 34-digit tracking inside. Wedge scanners that read the 2D code send these bytes.
6. **Regional / 3PL carriers** (22/22 refused → `bin`): UniUni `UUS…`/`USC…`, YunExpress `YT…`, GoFo `GFUS…`, `JJD…` (3), `SWX…`, `ALS…`, `EM…/ES…/EX…N`, `BBY01…`, UPU S10 intl (`LM221449617CA`, `LX088692799IL`).
7. **UPS 1Z with the wrong length** (67/67 refused): almost all are hand-typed fakes (`1Z346237348`), but real truncated or concatenated reads exist too (`1ZJ22B10030635441` 17 chars, `1Z06K75J03265312361ZR096K99014528578` two 1Z glued, `11ZJ22B100333113256` with a doubled lead char).
8. **Multiline pack-slip scans** (20/20 refused): `tracking⏎order⏎sku` in one read (`1ZJ22B100302248437⏎113-7796771-5871435⏎00179`). The first line is a valid tracking number.
9. **False accept (house → tracking)**: 48 eBay order numbers `NN-NNNNN-NNNNN` (`04-14902-05990`) route as `carrier-tracking:FedEx` and would be sent as tracking. Short `420…` 12-digit values (`420926470000`) are accepted as FedEx 12.
10. The real door feed (`mobile_scan_events`) mostly holds house/test values. Only 3 of its 32 carrier rows were refused (`420926479261299998825436746874`, `9621091390008524261900383932059740`, `9622001900001802153700877998505403`). The large refused volume comes from `receiving_scans` / `shipping_tracking_numbers` raws, i.e. what desk scanners actually captured.

House labels are refused correctly: GS1 `(01)`/`/01/` URLs, 4–9 digit SKUs, serial `U-…`, FNSKU `X00…`, bins, product names. Receiving `R-…` → `carton` (accepted).

#### Change candidates
- [both] Treat every FedEx 34-digit value (any prefix) as carrier-tracking (tracking = last 12) — evidence `9622001900001802153700877998505403` → sku; src/lib/scan/mobile-arrival-door.ts:93 (phase 1)
- [both] Unwrap USPS AI 420 + ZIP5/ZIP9 (with optional `0299` filler, `<GS>` or `]` separator) before routing — evidence 25/28 refused, src/lib/barcode-routing.ts:176 (phase 1)
- [both] Accept USPS IMpb 21- and 26-digit (`9[1-5]…`) — evidence `930011099051354526615` → sku (phase 1)
- [both] Accept Amazon `TBA\d{10,13}` — evidence `TBA5317991003` → bin (phase 1)
- [both] Accept regional/3PL shapes (UniUni UUS/USC, YT, GFUS, JJD, UPU S10 `AA#########AA`) or send any non-house value to the server's last-8 resolver instead of refusing — evidence 22/22 refused (phase 1)
- [both] Extract the embedded `96…` tracking from FedEx 2D payloads (`[)>01…`, `0102…FDEG`) — evidence 12/12 refused (phase 1)
- [both] Take the first line of a multiline scan / the first known envelope in a concatenated digit run — evidence 20 multiline + 46 concatenated refused (phase 1)
- [both] Default rule: refuse locally only for *confirmed* house shapes (GS1 01/414, U-, X00 FNSKU, R- carton, 4–9 digit SKU, product-name bins); everything else goes to the server resolver — evidence mobile-arrival-door.ts:74-95 refuses anything not carrier/receiving (phase 1)
- [web] Stop routing eBay order numbers `NN-NNNNN-NNNNN` as FedEx tracking — evidence 48 rows → `carrier-tracking:FedEx` (phase 1)
- [app] Port the same rule to `BarcodeRoute.swift` and drive its tests from `corpus/scan-corpus.json` (`class=carrier` must not be refused; `class=house` keeps its current refusal) — evidence corpus json (phase 1)
- [both] Add a corpus regression guard: refused-carrier count must stay 0 (today 207/455) — evidence this report (phase 5)

#### Summary counts

Total rows: 1538 (carrier 455, house 522, noise 561). Refused at door overall: 1197. **Carrier-shaped refused: 207/455 (45.5%)**.

##### By class

| bucket | n | refused | % refused |
|---|---|---|---|
| noise | 561 | 558 | 99% |
| house | 522 | 432 | 83% |
| carrier | 455 | 207 | 45% |

##### Carrier rows by envelope pattern

| bucket | n | refused | % refused |
|---|---|---|---|
| FedEx 12 | 111 | 0 | 0% |
| UPS 1Z malformed/typed | 67 | 67 | 100% |
| UPS 1Z (18) | 52 | 0 | 0% |
| concatenated/truncated digits | 48 | 46 | 96% |
| USPS IMpb 22 | 35 | 0 | 0% |
| DHL 10 / J&T JJD | 31 | 3 | 10% |
| regional/3PL (UniUni/Yun/GoFo/etc) | 22 | 22 | 100% |
| USPS 420+ZIP (other) | 16 | 13 | 81% |
| USPS IMpb 20/21/26/30 | 13 | 9 | 69% |
| fedex-2d-payload | 12 | 12 | 100% |
| FedEx 34 (96 prefix) | 9 | 9 | 100% |
| USPS 420+ZIP5+IMpb | 7 | 7 | 100% |
| FedEx 15 | 7 | 0 | 0% |
| 20-digit | 6 | 0 | 0% |
| FedEx 34 (other prefix) | 6 | 6 | 100% |
| Amazon TBA | 6 | 6 | 100% |
| USPS 420+ZIP9+IMpb | 5 | 5 | 100% |
| UPU S10 intl | 2 | 2 | 100% |

##### Carrier rows by source

| bucket | n | refused | % refused |
|---|---|---|---|
| receiving_scans.tracking_number | 215 | 106 | 49% |
| shipping_tracking_numbers.tracking_number_raw | 164 | 77 | 47% |
| mobile_scan_events.raw_value | 32 | 3 | 9% |
| station_scan_sessions.tracking_raw | 26 | 16 | 62% |
| tracking_exceptions.tracking_number | 12 | 5 | 42% |
| label_ingestions.tracking_number_raw | 6 | 0 | 0% |

##### House rows by pattern / routeKind

| bucket | n | refused | % refused |
|---|---|---|---|
| house-sku/bin/serial → sku → refused | 218 | 218 | 100% |
| house-sku/bin/serial → bin → refused | 107 | 107 | 100% |
| house-gs1 → sku → refused | 50 | 50 | 100% |
| eBay order no. (NN-NNNNN-NNNNN) → carrier-tracking:FedEx → tracking | 48 | 0 | 0% |
| house-sku/bin/serial → receiving → carton | 40 | 0 | 0% |
| house-sku/bin/serial → serial-unit → refused | 27 | 27 | 100% |
| house-sku/bin/serial → fnsku → refused | 27 | 27 | 100% |
| house-gs1 → bin → refused | 3 | 3 | 100% |
| house-sku/bin/serial → carrier-tracking:FedEx → tracking | 1 | 0 | 0% |
| house-sku/bin/serial → carrier-tracking:USPS → tracking | 1 | 0 | 0% |

##### Noise rows

| bucket | n | refused | % refused |
|---|---|---|---|
| test-fixture | 485 | 485 | 100% |
| multi-value-text | 47 | 44 | 94% |
| multiline-packslip | 20 | 20 | 100% |
| junk-sci-notation | 9 | 9 | 100% |

#### Every refused carrier-shaped value (complete)

| value | carrier guess | source | routeScan kind | arrivalScanIntent | normalised | last-8 | refused? |
|---|---|---|---|---|---|---|---|
| `TBA32558704939` | Amazon TBA | receiving_scans.tracking_number | bin | refused | `TBA32558704939` | 58704939 | **YES** |
| `TBA333313894804` | Amazon TBA | receiving_scans.tracking_number | bin | refused | `TBA333313894804` | 13894804 | **YES** |
| `TBA334518688254` | Amazon TBA | shipping_tracking_numbers.tracking_number_raw | bin | refused | `TBA334518688254` | 18688254 | **YES** |
| `TBA5317991003` | Amazon TBA | shipping_tracking_numbers.tracking_number_raw | bin | refused | `TBA5317991003` | 17991003 | **YES** |
| `TBA334819342243` | Amazon TBA | station_scan_sessions.tracking_raw | bin | refused | `TBA334819342243` | 19342243 | **YES** |
| `TBA331813952254` | Amazon TBA | tracking_exceptions.tracking_number | bin | refused | `TBA331813952254` | 13952254 | **YES** |
| `000852261900399810616491` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `000852261900399810616491` | 10616491 | **YES** |
| `185942675710009264700888681987235` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `185942675710009264700888681987235` | 81987235 | **YES** |
| `2092479261299998825433899931` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `2092479261299998825433899931` | 33899931 | **YES** |
| `209264736039434608106244012152402` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `209264736039434608106244012152402` | 12152402 | **YES** |
| `2092647360394346081062450325843034209264736039434608106245027205282` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `2092647360394346081062450325843034209264` | 27205282 | **YES** |
| `209264736039434608106245032584303420926473603943460810624502720528242092647360395055115933…` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `2092647360394346081062450325843034209264` | 98751538 | **YES** |
| `209264736039434608106245032584303420926473603943460810624502720528242092647360395055115933…` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `2092647360394346081062450325843034209264` | 35528885 | **YES** |
| `20926479434636106196304474927` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `20926479434636106196304474927` | 04474927 | **YES** |
| `22001900008524261900398909327379` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `22001900008524261900398909327379` | 09327379 | **YES** |
| `3100399913214158` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `3100399913214158` | 13214158 | **YES** |
| `322943771008196432871932294377306920317456` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `3229437710081964328719322943773069203174` | 20317456 | **YES** |
| `402479434608106245867015669` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `402479434608106245867015669` | 67015669 | **YES** |
| `40926473603943460810624416807224` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `40926473603943460810624416807224` | 16807224 | **YES** |
| `473603943460106244931490449` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `473603943460106244931490449` | 31490449 | **YES** |
| `622001900003062139400889931601963` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `622001900003062139400889931601963` | 31601963 | **YES** |
| `6220804300018021537008705342675009622080430002078179200520331511482` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `6220804300018021537008705342675009622080` | 31511482 | **YES** |
| `622080430001802153700870534267500962208043000207817920052033151148296220019000098376973003…` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `6220804300018021537008705342675009622080` | 35738078 | **YES** |
| `622080430001802153700870534267500962208043000207817920052033151148296220019000098376973003…` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `6220804300018021537008705342675009622080` | 98290881 | **YES** |
| `622080430001802153700870534267500962208043000207817920052033151148296220019000098376973003…` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `6220804300018021537008705342675009622080` | 45777864 | **YES** |
| `622080430001802153700870534267500962208043000207817920052033151148296220019000098376973003…` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `6220804300018021537008705342675009622080` | 51179901 | **YES** |
| `622080430001802153700870534267500962208043000207817920052033151148296220019000098376973003…` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `6220804300018021537008705342675009622080` | 31511482 | **YES** |
| `622080430001802153700870534267500962208043000207817920052033151148296220019000098376973003…` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `6220804300018021537008705342675009622080` | 12624159 | **YES** |
| `622080430001802153700870534267500962208043000207817920052033151148296220019000098376973003…` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `6220804300018021537008705342675009622080` | 25545205 | **YES** |
| `622080430001802153700870538036279420926479261299998825439405518` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `6220804300018021537008705380362794209264` | 39405518 | **YES** |
| `632001960200488084300399437746220` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `632001960200488084300399437746220` | 37746220 | **YES** |
| `7092357902570925709` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `7092357902570925709` | 70925709 | **YES** |
| `8213479499048384209264736039434608106245420532497` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `8213479499048384209264736039434608106245` | 20532497 | **YES** |
| `8213546342868387` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `8213546342868387` | 42868387 | **YES** |
| `92200190000181302200889399856829` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `92200190000181302200889399856829` | 99856829 | **YES** |
| `9264700873591471570` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `9264700873591471570` | 91471570 | **YES** |
| `9434608106245106245183907693` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `9434608106245106245183907693` | 83907693 | **YES** |
| `962201370000988138030077973600616` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `962201370000988138030077973600616` | 73600616 | **YES** |
| `96220190000183132200889488894321` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `96220190000183132200889488894321` | 88894321 | **YES** |
| `96300196091040869060889426196739` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `96300196091040869060889426196739` | 26196739 | **YES** |
| `96320019606805312004003803021559119622001900002104799000380379062040` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `9632001960680531200400380302155911962200` | 79062040 | **YES** |
| `963200196081368068200889783012418` | concatenated/truncated digits | receiving_scans.tracking_number | sku | refused | `963200196081368068200889783012418` | 83012418 | **YES** |
| `1225494102990187` | concatenated/truncated digits | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1225494102990187` | 02990187 | **YES** |
| `334610990370294478710` | concatenated/truncated digits | shipping_tracking_numbers.tracking_number_raw | sku | refused | `334610990370294478710` | 94478710 | **YES** |
| `7087051570170150715` | concatenated/truncated digits | shipping_tracking_numbers.tracking_number_raw | sku | refused | `7087051570170150715` | 70150715 | **YES** |
| `900110990513319879484` | concatenated/truncated digits | shipping_tracking_numbers.tracking_number_raw | sku | refused | `900110990513319879484` | 19879484 | **YES** |
| `94001081062442393259159400108106244239325915` | concatenated/truncated digits | shipping_tracking_numbers.tracking_number_raw | sku | refused | `9400108106244239325915` | 39325915 | **YES** |
| `94346081062445152375909434608106244515237590` | concatenated/truncated digits | shipping_tracking_numbers.tracking_number_raw | sku | refused | `9434608106244515237590` | 15237590 | **YES** |
| `9621091390001834` | concatenated/truncated digits | shipping_tracking_numbers.tracking_number_raw | sku | refused | `9621091390001834` | 90001834 | **YES** |
| `962109139000609437790038021489728` | concatenated/truncated digits | shipping_tracking_numbers.tracking_number_raw | sku | refused | `962109139000609437790038021489728` | 21489728 | **YES** |
| `96210913900085242619003811158052739621091390008524261900381115805273` | concatenated/truncated digits | shipping_tracking_numbers.tracking_number_raw | sku | refused | `9621091390008524261900381115805273` | 15805273 | **YES** |
| `20926839334610990150173710076` | concatenated/truncated digits | station_scan_sessions.tracking_raw | sku | refused | `20926839334610990150173710076` | 73710076 | **YES** |
| `JJD014600012662687192` | DHL 10 / J&T JJD | receiving_scans.tracking_number | bin | refused | `JJD014600012662687192` | 62687192 | **YES** |
| `JJD014600012700891944` | DHL 10 / J&T JJD | shipping_tracking_numbers.tracking_number_raw | bin | refused | `JJD014600012700891944` | 00891944 | **YES** |
| `JJD014600012672884533` | DHL 10 / J&T JJD | station_scan_sessions.tracking_raw | bin | refused | `JJD014600012672884533` | 72884533 | **YES** |
| `9621091390008524261900383932059740` | FedEx 34 (96 prefix) | mobile_scan_events.raw_value | sku | refused | `9621091390008524261900383932059740` | 32059740 | **YES** |
| `9622001900001802153700877998505403` | FedEx 34 (96 prefix) | mobile_scan_events.raw_value | sku | refused | `9622001900001802153700877998505403` | 98505403 | **YES** |
| `9622013700009852768300797969414912` | FedEx 34 (96 prefix) | receiving_scans.tracking_number | sku | refused | `9622013700009852768300797969414912` | 69414912 | **YES** |
| `9632001960203305182000381759816184` | FedEx 34 (96 prefix) | receiving_scans.tracking_number | sku | refused | `9632001960203305182000381759816184` | 59816184 | **YES** |
| `9641001960534711766300874749067508` | FedEx 34 (96 prefix) | receiving_scans.tracking_number | sku | refused | `9641001960534711766300874749067508` | 49067508 | **YES** |
| `9621091390006094377900399419001878` | FedEx 34 (96 prefix) | shipping_tracking_numbers.tracking_number_raw | sku | refused | `9621091390006094377900399419001878` | 19001878 | **YES** |
| `9632001960813668068200872473682324` | FedEx 34 (96 prefix) | shipping_tracking_numbers.tracking_number_raw | sku | refused | `9632001960813668068200872473682324` | 73682324 | **YES** |
| `9621091390006094377900383130594637` | FedEx 34 (96 prefix) | station_scan_sessions.tracking_raw | sku | refused | `9621091390006094377900383130594637` | 30594637 | **YES** |
| `9622001900004476226800872738060650` | FedEx 34 (96 prefix) | tracking_exceptions.tracking_number | sku | refused | `9622001900004476226800872738060650` | 38060650 | **YES** |
| `1001901772440009264700522300969633` | FedEx 34 (other prefix) | receiving_scans.tracking_number | sku | refused | `1001901772440009264700522300969633` | 00969633 | **YES** |
| `1072277311220009264700381880166063` | FedEx 34 (other prefix) | receiving_scans.tracking_number | sku | refused | `1072277311220009264700381880166063` | 80166063 | **YES** |
| `1225049814090009264700873651711560` | FedEx 34 (other prefix) | receiving_scans.tracking_number | sku | refused | `1225049814090009264700873651711560` | 51711560 | **YES** |
| `1859426751710009264700888681987224` | FedEx 34 (other prefix) | receiving_scans.tracking_number | sku | refused | `1859426751710009264700888681987224` | 81987224 | **YES** |
| `1027597410170006004600872497245440` | FedEx 34 (other prefix) | station_scan_sessions.tracking_raw | sku | refused | `1027597410170006004600872497245440` | 97245440 | **YES** |
| `1311308824370001956700875052173201` | FedEx 34 (other prefix) | station_scan_sessions.tracking_raw | sku | refused | `1311308824370001956700875052173201` | 52173201 | **YES** |
| `010292647360373840019873660110790FDEG183130218155LBN16161GOTHARDSTHUNTINGTONBEACHCALONGTRA…` | fedex-2d-payload | receiving_scans.tracking_number | sku | refused | `010292647360373840019873660110790FDEG183` | 60110790 | **YES** |
| `010292647360373840019874388531540FDEG8524261199300LBN16161GOTHARDSTHUNTINGTONBEACHCALONGTR…` | fedex-2d-payload | receiving_scans.tracking_number | sku | refused | `010292647360373840019874388531540FDEG852` | 88531540 | **YES** |
| `010292647840019383424971640FDEG198084924011400BN16161GOTHARDSTSTEAHUNTINGTONBEACHCALONGTRA…` | fedex-2d-payload | receiving_scans.tracking_number | sku | refused | `010292647840019383424971640FDEG198084924` | 23679024 | **YES** |
| `010292647840019873883694201FDEG1669812183113025LBN16161GOTHARDSTSTEAHUNTINGTONBEACHCACHILE…` | fedex-2d-payload | receiving_scans.tracking_number | sku | refused | `010292647840019873883694201FDEG166981218` | 22671822 | **YES** |
| `010292647840019873920576470FDEG327300490184113354LBN16161GOTHARDSTSTEAHUNTINGTONBEACHCALON…` | fedex-2d-payload | receiving_scans.tracking_number | sku | refused | `010292647840019873920576470FDEG327300490` | 64703401 | **YES** |
| `010292647840019875108027066FDEG263075221111509LBN16161GOTHARDSTSTEAHUNTINGTONBEACHCALONGTR…` | fedex-2d-payload | receiving_scans.tracking_number | sku | refused | `010292647840019875108027066FDEG263075221` | 70663401 | **YES** |
| `010292647840019876438824890FDEG6617517382401170LBN16161GOTHARDSTSTEAHUNTINGTONBEACHCACHILE…` | fedex-2d-payload | receiving_scans.tracking_number | sku | refused | `010292647840019876438824890FDEG661751738` | 32023401 | **YES** |
| `010292647840019877355693939FDEG73058349426011705BN16161GOTHARDSTSTEAHUNTINGTONBEACHCACHILE…` | fedex-2d-payload | receiving_scans.tracking_number | sku | refused | `010292647840019877355693939FDEG730583494` | 93023401 | **YES** |
| `010292647840019877732128459FDEG8524261267111200LBN16161GOTHARDSTSTEAHUNTINGTACHCALONGTRAN0…` | fedex-2d-payload | receiving_scans.tracking_number | sku | refused | `010292647840019877732128459FDEG852426126` | 53972464 | **YES** |
| `010292647840137528858590278FDEG985276825011050LN16161GOTHARDSTHUNTINGTONBEACHCAUSAVSOLUTIO…` | fedex-2d-payload | receiving_scans.tracking_number | sku | refused | `010292647840137528858590278FDEG985276825` | 02573401 | **YES** |
| `[)>010290292647029840029019029381764210785029FDEG02985242610291530290291/102912.00LB029N02…` | fedex-2d-payload | shipping_tracking_numbers.tracking_number_raw | sku | refused | `0102902926470298400290190293817642107850` | 01234029 | **YES** |
| `[)>010292647840019873089853512fdeg18021531661/12.00lbn16161 gOTHARD sT sTE ahUNTINGTON bEA…` | fedex-2d-payload | shipping_tracking_numbers.tracking_number_raw | sku | refused | `010292647840019873089853512FDEG180215316` | 35123401 | **YES** |
| `ALS01435887784` | regional/3PL (UniUni/Yun/GoFo/etc) | receiving_scans.tracking_number | bin | refused | `ALS01435887784` | 35887784 | **YES** |
| `AP00818347027872` | regional/3PL (UniUni/Yun/GoFo/etc) | receiving_scans.tracking_number | bin | refused | `AP00818347027872` | 47027872 | **YES** |
| `BBY01-807197148090` | regional/3PL (UniUni/Yun/GoFo/etc) | receiving_scans.tracking_number | bin | refused | `BBY01807197148090` | 97148090 | **YES** |
| `BBY01807207567530` | regional/3PL (UniUni/Yun/GoFo/etc) | receiving_scans.tracking_number | bin | refused | `BBY01807207567530` | 07567530 | **YES** |
| `D10017167784892` | regional/3PL (UniUni/Yun/GoFo/etc) | receiving_scans.tracking_number | bin | refused | `D10017167784892` | 67784892 | **YES** |
| `EM1013096206592FE06020059B0N` | regional/3PL (UniUni/Yun/GoFo/etc) | receiving_scans.tracking_number | bin | refused | `EM1013096206592FE06020059B0N` | 60200590 | **YES** |
| `ES1003257834802UN0101240400N` | regional/3PL (UniUni/Yun/GoFo/etc) | receiving_scans.tracking_number | bin | refused | `ES1003257834802UN0101240400N` | 01240400 | **YES** |
| `FBA178G5LJCPU000186` | regional/3PL (UniUni/Yun/GoFo/etc) | receiving_scans.tracking_number | bin | refused | `FBA178G5LJCPU000186` | 85000186 | **YES** |
| `GFUS01069501215169` | regional/3PL (UniUni/Yun/GoFo/etc) | receiving_scans.tracking_number | bin | refused | `GFUS01069501215169` | 01215169 | **YES** |
| `SWX651500000135095953` | regional/3PL (UniUni/Yun/GoFo/etc) | receiving_scans.tracking_number | bin | refused | `SWX651500000135095953` | 35095953 | **YES** |
| `USC000017869399` | regional/3PL (UniUni/Yun/GoFo/etc) | receiving_scans.tracking_number | bin | refused | `USC000017869399` | 17869399 | **YES** |
| `UUS69E1260971998596` | regional/3PL (UniUni/Yun/GoFo/etc) | receiving_scans.tracking_number | bin | refused | `UUS69E1260971998596` | 71998596 | **YES** |
| `UUSC000017974905` | regional/3PL (UniUni/Yun/GoFo/etc) | receiving_scans.tracking_number | bin | refused | `UUSC000017974905` | 17974905 | **YES** |
| `WN66279747` | regional/3PL (UniUni/Yun/GoFo/etc) | receiving_scans.tracking_number | bin | refused | `WN66279747` | 66279747 | **YES** |
| `YWLAX010169903877` | regional/3PL (UniUni/Yun/GoFo/etc) | receiving_scans.tracking_number | bin | refused | `YWLAX010169903877` | 69903877 | **YES** |
| `ALS01879416495` | regional/3PL (UniUni/Yun/GoFo/etc) | shipping_tracking_numbers.tracking_number_raw | bin | refused | `ALS01879416495` | 79416495 | **YES** |
| `EM1013096877920FE06020097E0N` | regional/3PL (UniUni/Yun/GoFo/etc) | shipping_tracking_numbers.tracking_number_raw | bin | refused | `EM1013096877920FE06020097E0N` | 60200970 | **YES** |
| `ES1003220259821UN0101240400N` | regional/3PL (UniUni/Yun/GoFo/etc) | shipping_tracking_numbers.tracking_number_raw | bin | refused | `ES1003220259821UN0101240400N` | 01240400 | **YES** |
| `EX1013096139559DL06020002A0N` | regional/3PL (UniUni/Yun/GoFo/etc) | shipping_tracking_numbers.tracking_number_raw | bin | refused | `EX1013096139559DL06020002A0N` | 60200020 | **YES** |
| `GFUS01065883968066` | regional/3PL (UniUni/Yun/GoFo/etc) | shipping_tracking_numbers.tracking_number_raw | bin | refused | `GFUS01065883968066` | 83968066 | **YES** |
| `UUS67W1500754440851` | regional/3PL (UniUni/Yun/GoFo/etc) | shipping_tracking_numbers.tracking_number_raw | bin | refused | `UUS67W1500754440851` | 54440851 | **YES** |
| `YT2638921437379714` | regional/3PL (UniUni/Yun/GoFo/etc) | shipping_tracking_numbers.tracking_number_raw | bin | refused | `YT2638921437379714` | 37379714 | **YES** |
| `1Z06K75J03265312361ZR096K99014528578` | UPS 1Z malformed/typed | receiving_scans.tracking_number | sku | refused | `1Z06K75J03265312361ZR096K99014528578` | 14528578 | **YES** |
| `1Z070745654653643465` | UPS 1Z malformed/typed | receiving_scans.tracking_number | sku | refused | `1Z070745654653643465` | 53643465 | **YES** |
| `1Z123E89041605868` | UPS 1Z malformed/typed | receiving_scans.tracking_number | sku | refused | `1Z123E89041605868` | 41605868 | **YES** |
| `1Z1Y01W039282033` | UPS 1Z malformed/typed | receiving_scans.tracking_number | sku | refused | `1Z1Y01W039282033` | 39282033 | **YES** |
| `1Z23452314636` | UPS 1Z malformed/typed | receiving_scans.tracking_number | sku | refused | `1Z23452314636` | 52314636 | **YES** |
| `1Z2346345738495695843` | UPS 1Z malformed/typed | receiving_scans.tracking_number | sku | refused | `1Z2346345738495695843` | 95695843 | **YES** |
| `1Z2573434939` | UPS 1Z malformed/typed | receiving_scans.tracking_number | sku | refused | `1Z2573434939` | 73434939 | **YES** |
| `1Z34572340786` | UPS 1Z malformed/typed | receiving_scans.tracking_number | sku | refused | `1Z34572340786` | 72340786 | **YES** |
| `1Z346237348` | UPS 1Z malformed/typed | receiving_scans.tracking_number | sku | refused | `1Z346237348` | 46237348 | **YES** |
| `1Z3523623626` | UPS 1Z malformed/typed | receiving_scans.tracking_number | sku | refused | `1Z3523623626` | 23623626 | **YES** |
| `1Z4357348348348` | UPS 1Z malformed/typed | receiving_scans.tracking_number | sku | refused | `1Z4357348348348` | 48348348 | **YES** |
| `1Z456345348` | UPS 1Z malformed/typed | receiving_scans.tracking_number | sku | refused | `1Z456345348` | 56345348 | **YES** |
| `1Z73062730206` | UPS 1Z malformed/typed | receiving_scans.tracking_number | sku | refused | `1Z73062730206` | 62730206 | **YES** |
| `1Z7307605765076` | UPS 1Z malformed/typed | receiving_scans.tracking_number | sku | refused | `1Z7307605765076` | 05765076 | **YES** |
| `1Z785843335773` | UPS 1Z malformed/typed | receiving_scans.tracking_number | sku | refused | `1Z785843335773` | 43335773 | **YES** |
| `1Z795723962379846` | UPS 1Z malformed/typed | receiving_scans.tracking_number | sku | refused | `1Z795723962379846` | 62379846 | **YES** |
| `1Z97659574638386` | UPS 1Z malformed/typed | receiving_scans.tracking_number | sku | refused | `1Z97659574638386` | 74638386 | **YES** |
| `1ZA8335G03142314731ZC1C7900306624434` | UPS 1Z malformed/typed | receiving_scans.tracking_number | sku | refused | `1ZA8335G03142314731ZC1C7900306624434` | 06624434 | **YES** |
| `1ZA8339B01982823` | UPS 1Z malformed/typed | receiving_scans.tracking_number | sku | refused | `1ZA8339B01982823` | 01982823 | **YES** |
| `1ZA8G924031308958` | UPS 1Z malformed/typed | receiving_scans.tracking_number | sku | refused | `1ZA8G924031308958` | 31308958 | **YES** |
| `1ZC17980312638895` | UPS 1Z malformed/typed | receiving_scans.tracking_number | sku | refused | `1ZC17980312638895` | 12638895 | **YES** |
| `1ZE3K050332886011` | UPS 1Z malformed/typed | receiving_scans.tracking_number | sku | refused | `1ZE3K050332886011` | 32886011 | **YES** |
| `1ZE4330035006675` | UPS 1Z malformed/typed | receiving_scans.tracking_number | sku | refused | `1ZE4330035006675` | 35006675 | **YES** |
| `1ZJ22B10906092101` | UPS 1Z malformed/typed | receiving_scans.tracking_number | sku | refused | `1ZJ22B10906092101` | 06092101 | **YES** |
| `1ZR096K9909758368` | UPS 1Z malformed/typed | receiving_scans.tracking_number | sku | refused | `1ZR096K9909758368` | 09758368 | **YES** |
| `1Z0376230673260` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z0376230673260` | 30673260 | **YES** |
| `1Z103723406723046` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z103723406723046` | 06723046 | **YES** |
| `1Z234523466` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z234523466` | 34523466 | **YES** |
| `1Z2345247647982` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z2345247647982` | 47647982 | **YES** |
| `1Z234623488439` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z234623488439` | 23488439 | **YES** |
| `1Z2363473458` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z2363473458` | 63473458 | **YES** |
| `1Z237457230940793264` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z237457230940793264` | 40793264 | **YES** |
| `1Z243263462457348` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z243263462457348` | 62457348 | **YES** |
| `1Z25262611516` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z25262611516` | 62611516 | **YES** |
| `1Z26457345783823` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z26457345783823` | 45783823 | **YES** |
| `1Z302376027304766` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z302376027304766` | 27304766 | **YES** |
| `1Z30468230468230648` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z30468230468230648` | 68230648 | **YES** |
| `1Z32362453849` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z32362453849` | 62453849 | **YES** |
| `1Z326347458` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z326347458` | 26347458 | **YES** |
| `1Z345236237348` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z345236237348` | 36237348 | **YES** |
| `1Z34523738` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z34523738` | 34523738 | **YES** |
| `1Z3463445892` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z3463445892` | 63445892 | **YES** |
| `1Z3702637602736` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z3702637602736` | 37602736 | **YES** |
| `1Z423673478` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z423673478` | 23673478 | **YES** |
| `1Z4253452346236` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z4253452346236` | 52346236 | **YES** |
| `1Z4563366` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z4563366` | 14563366 | **YES** |
| `1Z45634738` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z45634738` | 45634738 | **YES** |
| `1Z47478433783378` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z47478433783378` | 33783378 | **YES** |
| `1Z563478459` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z563478459` | 63478459 | **YES** |
| `1Z57245738348` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z57245738348` | 45738348 | **YES** |
| `1Z696758467579860` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z696758467579860` | 67579860 | **YES** |
| `1Z72306720376` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z72306720376` | 06720376 | **YES** |
| `1Z723406283067203` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z723406283067203` | 83067203 | **YES** |
| `1Z730376306` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z730376306` | 30376306 | **YES** |
| `1Z7320683208307` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z7320683208307` | 83208307 | **YES** |
| `1Z74052734509723405723045` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z74052734509723405723045` | 05723045 | **YES** |
| `1Z930362347237` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z930362347237` | 62347237 | **YES** |
| `1ZJ22B10030635441` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1ZJ22B10030635441` | 30635441 | **YES** |
| `1ZJ22B104228952938251` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1ZJ22B104228952938251` | 52938251 | **YES** |
| `1z3463636` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z3463636` | 13463636 | **YES** |
| `1z78014578095780` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z78014578095780` | 78095780 | **YES** |
| `1z85868546443863` | UPS 1Z malformed/typed | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z85868546443863` | 46443863 | **YES** |
| `1Z345734834838` | UPS 1Z malformed/typed | station_scan_sessions.tracking_raw | sku | refused | `1Z345734834838` | 34834838 | **YES** |
| `1Z72304672306723076` | UPS 1Z malformed/typed | station_scan_sessions.tracking_raw | sku | refused | `1Z72304672306723076` | 06723076 | **YES** |
| `1Z740072346026` | UPS 1Z malformed/typed | station_scan_sessions.tracking_raw | sku | refused | `1Z740072346026` | 72346026 | **YES** |
| `1ZJ22100307185791` | UPS 1Z malformed/typed | station_scan_sessions.tracking_raw | sku | refused | `1ZJ22100307185791` | 07185791 | **YES** |
| `1Z` | UPS 1Z malformed/typed | tracking_exceptions.tracking_number | sku | refused | `1Z` | 1Z | **YES** |
| `LM221449617CA` | UPU S10 intl | receiving_scans.tracking_number | bin | refused | `LM221449617CA` | 21449617 | **YES** |
| `LX088692799IL` | UPU S10 intl | receiving_scans.tracking_number | bin | refused | `LX088692799IL` | 88692799 | **YES** |
| `42092647` | USPS 420+ZIP (other) | receiving_scans.tracking_number | sku | refused | `42092647` | 42092647 | **YES** |
| `420926470299434636106196338333054` | USPS 420+ZIP (other) | receiving_scans.tracking_number | sku | refused | `420926470299434636106196338333054` | 38333054 | **YES** |
| `4209264736030299434608106244194257131` | USPS 420+ZIP (other) | receiving_scans.tracking_number | sku | refused | `4209264736030299434608106244194257131` | 94257131 | **YES** |
| `420926473603]9434608106244898410160` | USPS 420+ZIP (other) | receiving_scans.tracking_number | sku | refused | `9434608106244898410160` | 98410160 | **YES** |
| `42001464<GS>9434650106151038378107` | USPS 420+ZIP (other) | shipping_tracking_numbers.tracking_number_raw | sku | refused | `9434650106151038378107` | 38378107 | **YES** |
| `42033259300110990513556425161` | USPS 420+ZIP (other) | shipping_tracking_numbers.tracking_number_raw | sku | refused | `42033259300110990513556425161` | 56425161 | **YES** |
| `42060137` | USPS 420+ZIP (other) | shipping_tracking_numbers.tracking_number_raw | sku | refused | `42060137` | 42060137 | **YES** |
| `42075081209400108106244030383398` | USPS 420+ZIP (other) | shipping_tracking_numbers.tracking_number_raw | sku | refused | `42075081209400108106244030383398` | 30383398 | **YES** |
| `420926470299261299998825469149758` | USPS 420+ZIP (other) | shipping_tracking_numbers.tracking_number_raw | sku | refused | `420926470299261299998825469149758` | 69149758 | **YES** |
| `4209264736030299505510052546153793128` | USPS 420+ZIP (other) | shipping_tracking_numbers.tracking_number_raw | sku | refused | `4209264736030299505510052546153793128` | 53793128 | **YES** |
| `4200736930011099051331987473` | USPS 420+ZIP (other) | station_scan_sessions.tracking_raw | sku | refused | `4200736930011099051331987473` | 31987473 | **YES** |
| `420601320809400108106245016623217` | USPS 420+ZIP (other) | station_scan_sessions.tracking_raw | serial-unit | refused | `420601320809400108106245016623217` | 16623217 | **YES** |
| `42096799400150106151162241887` | USPS 420+ZIP (other) | station_scan_sessions.tracking_raw | sku | refused | `42096799400150106151162241887` | 62241887 | **YES** |
| `420926479261299998825436746874` | USPS 420+ZIP5+IMpb | mobile_scan_events.raw_value | sku | refused | `9261299998825436746874` | 36746874 | **YES** |
| `420926479214490407314819163965` | USPS 420+ZIP5+IMpb | receiving_scans.tracking_number | sku | refused | `9214490407314819163965` | 19163965 | **YES** |
| `42092647943465206217184272023` | USPS 420+ZIP5+IMpb | receiving_scans.tracking_number | sku | refused | `943465206217184272023` | 84272023 | **YES** |
| `420908059400150206217528518884` | USPS 420+ZIP5+IMpb | shipping_tracking_numbers.tracking_number_raw | sku | refused | `9400150206217528518884` | 28518884 | **YES** |
| `4209521094012345678901234567` | USPS 420+ZIP5+IMpb | shipping_tracking_numbers.tracking_number_raw | sku | refused | `94012345678901234567` | 01234567 | **YES** |
| `420119379334610990370278033454` | USPS 420+ZIP5+IMpb | station_scan_sessions.tracking_raw | sku | refused | `9334610990370278033454` | 78033454 | **YES** |
| `420926479302010623390248068934` | USPS 420+ZIP5+IMpb | tracking_exceptions.tracking_number | sku | refused | `9302010623390248068934` | 48068934 | **YES** |
| `4209264736039434608106245263389937` | USPS 420+ZIP9+IMpb | receiving_scans.tracking_number | sku | refused | `9434608106245263389937` | 63389937 | **YES** |
| `42092647360394360816245945184812` | USPS 420+ZIP9+IMpb | receiving_scans.tracking_number | sku | refused | `94360816245945184812` | 45184812 | **YES** |
| `4204542438039400108106244770571499` | USPS 420+ZIP9+IMpb | shipping_tracking_numbers.tracking_number_raw | sku | refused | `9400108106244770571499` | 70571499 | **YES** |
| `4200688059309400108106245985024343` | USPS 420+ZIP9+IMpb | station_scan_sessions.tracking_raw | sku | refused | `9400108106245985024343` | 85024343 | **YES** |
| `4201896620419400108106245260536202` | USPS 420+ZIP9+IMpb | tracking_exceptions.tracking_number | sku | refused | `9400108106245260536202` | 60536202 | **YES** |
| `92346902673388000095297453` | USPS IMpb 20/21/26/30 | shipping_tracking_numbers.tracking_number_raw | sku | refused | `92346902673388000095297453` | 95297453 | **YES** |
| `930011099051354526615` | USPS IMpb 20/21/26/30 | shipping_tracking_numbers.tracking_number_raw | sku | refused | `930011099051354526615` | 54526615 | **YES** |
| `931081098991123028999` | USPS IMpb 20/21/26/30 | shipping_tracking_numbers.tracking_number_raw | sku | refused | `931081098991123028999` | 23028999 | **YES** |
| `933610990370287309014` | USPS IMpb 20/21/26/30 | shipping_tracking_numbers.tracking_number_raw | sku | refused | `933610990370287309014` | 87309014 | **YES** |
| `934610990370287313837` | USPS IMpb 20/21/26/30 | shipping_tracking_numbers.tracking_number_raw | sku | refused | `934610990370287313837` | 87313837 | **YES** |
| `940010810624568470478` | USPS IMpb 20/21/26/30 | shipping_tracking_numbers.tracking_number_raw | sku | refused | `940010810624568470478` | 68470478 | **YES** |
| `943465020621722469686` | USPS IMpb 20/21/26/30 | shipping_tracking_numbers.tracking_number_raw | sku | refused | `943465020621722469686` | 22469686 | **YES** |
| `944650106151057177941` | USPS IMpb 20/21/26/30 | shipping_tracking_numbers.tracking_number_raw | sku | refused | `944650106151057177941` | 57177941 | **YES** |
| `943608106245144250868` | USPS IMpb 20/21/26/30 | station_scan_sessions.tracking_raw | sku | refused | `943608106245144250868` | 44250868 | **YES** |

#### Accepted carrier values (complete)

| value | carrier guess | source | routeScan kind | arrivalScanIntent | normalised | last-8 | refused? |
|---|---|---|---|---|---|---|---|
| `00000178172525030166` | 20-digit | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `00000178172525030166` | 25030166 | no |
| `00108106244960785477` | 20-digit | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `00108106244960785477` | 60785477 | no |
| `34608106244942155573` | 20-digit | receiving_scans.tracking_number | carrier-tracking:USPS | tracking:USPS | `34608106244942155573` | 42155573 | no |
| `70834790234790254709` | 20-digit | receiving_scans.tracking_number | carrier-tracking:USPS | tracking:USPS | `70834790234790254709` | 90254709 | no |
| `00004000000089719563` | 20-digit | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `00004000000089719563` | 89719563 | no |
| `61299998825427281186` | 20-digit | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `61299998825427281186` | 27281186 | no |
| `9940150106151365085271` | concatenated/truncated digits | receiving_scans.tracking_number | carrier-tracking:USPS | tracking:USPS | `9940150106151365085271` | 65085271 | no |
| `9999999999999999999999` | concatenated/truncated digits | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:USPS | tracking:USPS | `9999999999999999999999` | 99999999 | no |
| `1000260197` | DHL 10 / J&T JJD | receiving_scans.tracking_number | carrier-tracking:DHL | tracking:DHL | `1000260197` | 00260197 | no |
| `1021376564` | DHL 10 / J&T JJD | receiving_scans.tracking_number | carrier-tracking:DHL | tracking:DHL | `1021376564` | 21376564 | no |
| `2066441241` | DHL 10 / J&T JJD | receiving_scans.tracking_number | carrier-tracking:DHL | tracking:DHL | `2066441241` | 66441241 | no |
| `3813441985` | DHL 10 / J&T JJD | receiving_scans.tracking_number | carrier-tracking:DHL | tracking:DHL | `3813441985` | 13441985 | no |
| `7004009001` | DHL 10 / J&T JJD | receiving_scans.tracking_number | carrier-tracking:DHL | tracking:DHL | `7004009001` | 04009001 | no |
| `7973581678` | DHL 10 / J&T JJD | receiving_scans.tracking_number | carrier-tracking:DHL | tracking:DHL | `7973581678` | 73581678 | no |
| `7998089041` | DHL 10 / J&T JJD | receiving_scans.tracking_number | carrier-tracking:DHL | tracking:DHL | `7998089041` | 98089041 | no |
| `8055286482` | DHL 10 / J&T JJD | receiving_scans.tracking_number | carrier-tracking:DHL | tracking:DHL | `8055286482` | 55286482 | no |
| `8074850446` | DHL 10 / J&T JJD | receiving_scans.tracking_number | carrier-tracking:DHL | tracking:DHL | `8074850446` | 74850446 | no |
| `8094704321` | DHL 10 / J&T JJD | receiving_scans.tracking_number | carrier-tracking:DHL | tracking:DHL | `8094704321` | 94704321 | no |
| `8113608340` | DHL 10 / J&T JJD | receiving_scans.tracking_number | carrier-tracking:DHL | tracking:DHL | `8113608340` | 13608340 | no |
| `8122210712` | DHL 10 / J&T JJD | receiving_scans.tracking_number | carrier-tracking:DHL | tracking:DHL | `8122210712` | 22210712 | no |
| `8140418264` | DHL 10 / J&T JJD | receiving_scans.tracking_number | carrier-tracking:DHL | tracking:DHL | `8140418264` | 40418264 | no |
| `1341072154` | DHL 10 / J&T JJD | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:DHL | tracking:DHL | `1341072154` | 41072154 | no |
| `2512361236` | DHL 10 / J&T JJD | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:DHL | tracking:DHL | `2512361236` | 12361236 | no |
| `7999177089` | DHL 10 / J&T JJD | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:DHL | tracking:DHL | `7999177089` | 99177089 | no |
| `8002721475` | DHL 10 / J&T JJD | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:DHL | tracking:DHL | `8002721475` | 02721475 | no |
| `8092350586` | DHL 10 / J&T JJD | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:DHL | tracking:DHL | `8092350586` | 92350586 | no |
| `8409653464` | DHL 10 / J&T JJD | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:DHL | tracking:DHL | `8409653464` | 09653464 | no |
| `0170318182` | DHL 10 / J&T JJD | station_scan_sessions.tracking_raw | carrier-tracking:DHL | tracking:DHL | `0170318182` | 70318182 | no |
| `2568061319` | DHL 10 / J&T JJD | station_scan_sessions.tracking_raw | carrier-tracking:DHL | tracking:DHL | `2568061319` | 68061319 | no |
| `3446660020` | DHL 10 / J&T JJD | station_scan_sessions.tracking_raw | carrier-tracking:DHL | tracking:DHL | `3446660020` | 46660020 | no |
| `4667633788` | DHL 10 / J&T JJD | station_scan_sessions.tracking_raw | carrier-tracking:DHL | tracking:DHL | `4667633788` | 67633788 | no |
| `6382840010` | DHL 10 / J&T JJD | station_scan_sessions.tracking_raw | carrier-tracking:DHL | tracking:DHL | `6382840010` | 82840010 | no |
| `7576050010` | DHL 10 / J&T JJD | station_scan_sessions.tracking_raw | carrier-tracking:DHL | tracking:DHL | `7576050010` | 76050010 | no |
| `8032609393` | DHL 10 / J&T JJD | station_scan_sessions.tracking_raw | carrier-tracking:DHL | tracking:DHL | `8032609393` | 32609393 | no |
| `8045867783` | DHL 10 / J&T JJD | station_scan_sessions.tracking_raw | carrier-tracking:DHL | tracking:DHL | `8045867783` | 45867783 | no |
| `7997892989` | DHL 10 / J&T JJD | tracking_exceptions.tracking_number | carrier-tracking:DHL | tracking:DHL | `7997892989` | 97892989 | no |
| `001463319159` | FedEx 12 | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `001463319159` | 63319159 | no |
| `001910072859` | FedEx 12 | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `001910072859` | 10072859 | no |
| `001910073214` | FedEx 12 | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `001910073214` | 10073214 | no |
| `012300782456` | FedEx 12 | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `012300782456` | 00782456 | no |
| `012303982723` | FedEx 12 | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `012303982723` | 03982723 | no |
| `012505525650` | FedEx 12 | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `012505525650` | 05525650 | no |
| `012541223312` | FedEx 12 | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `012541223312` | 41223312 | no |
| `012588132219` | FedEx 12 | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `012588132219` | 88132219 | no |
| `013964585438` | FedEx 12 | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `013964585438` | 64585438 | no |
| `014633159110` | FedEx 12 | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `014633159110` | 33159110 | no |
| `014633167795` | FedEx 12 | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `014633167795` | 33167795 | no |
| `014633168495` | FedEx 12 | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `014633168495` | 33168495 | no |
| `014633168501` | FedEx 12 | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `014633168501` | 33168501 | no |
| `014633168518` | FedEx 12 | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `014633168518` | 33168518 | no |
| `014633168761` | FedEx 12 | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `014633168761` | 33168761 | no |
| `014633190915` | FedEx 12 | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `014633190915` | 33190915 | no |
| `014633190922` | FedEx 12 | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `014633190922` | 33190922 | no |
| `014633191561` | FedEx 12 | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `014633191561` | 33191561 | no |
| `014633191578` | FedEx 12 | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `014633191578` | 33191578 | no |
| `014633191592` | FedEx 12 | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `014633191592` | 33191592 | no |
| `014633191639` | FedEx 12 | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `014633191639` | 33191639 | no |
| `014633191653` | FedEx 12 | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `014633191653` | 33191653 | no |
| `014633193725` | FedEx 12 | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `014633193725` | 33193725 | no |
| `015213221319` | FedEx 12 | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `015213221319` | 13221319 | no |
| `017817171762` | FedEx 12 | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `017817171762` | 17171762 | no |
| `878107486070` | FedEx 12 | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `878107486070` | 07486070 | no |
| `011481702948` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `011481702948` | 81702948 | no |
| `021516537690` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `021516537690` | 16537690 | no |
| `031476679150` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `031476679150` | 76679150 | no |
| `041493856761` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `041493856761` | 93856761 | no |
| `061498030824` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `061498030824` | 98030824 | no |
| `071502096759` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `071502096759` | 02096759 | no |
| `091471293041` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `091471293041` | 71293041 | no |
| `101515301528` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `101515301528` | 15301528 | no |
| `111476747698` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `111476747698` | 76747698 | no |
| `121496764306` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `121496764306` | 96764306 | no |
| `131464831790` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `131464831790` | 64831790 | no |
| `151469223516` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `151469223516` | 69223516 | no |
| `161489161958` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `161489161958` | 89161958 | no |
| `171478026062` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `171478026062` | 78026062 | no |
| `181500513532` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `181500513532` | 00513532 | no |
| `201474538111` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `201474538111` | 74538111 | no |
| `211455408973` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `211455408973` | 55408973 | no |
| `221503145292` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `221503145292` | 03145292 | no |
| `227390105895` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `227390105895` | 90105895 | no |
| `231490489272` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `231490489272` | 90489272 | no |
| `241484516796` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `241484516796` | 84516796 | no |
| `261463435598` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `261463435598` | 63435598 | no |
| `271485165016` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `271485165016` | 85165016 | no |
| `380485143938` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `380485143938` | 85143938 | no |
| `381502422173` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `381502422173` | 02422173 | no |
| `382992221166` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `382992221166` | 92221166 | no |
| `383248992261` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `383248992261` | 48992261 | no |
| `517272546801` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `517272546801` | 72546801 | no |
| `523856731898` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `523856731898` | 56731898 | no |
| `528691980570` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `528691980570` | 91980570 | no |
| `529738558976` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `529738558976` | 38558976 | no |
| `534684527207` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `534684527207` | 84527207 | no |
| `537042620040` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `537042620040` | 42620040 | no |
| `538577414536` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `538577414536` | 77414536 | no |
| `541843853357` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `541843853357` | 43853357 | no |
| `700066491344` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `700066491344` | 66491344 | no |
| `704756275939` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `704756275939` | 56275939 | no |
| `870485896350` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `870485896350` | 85896350 | no |
| `871533116962` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `871533116962` | 33116962 | no |
| `872431224964` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `872431224964` | 31224964 | no |
| `873454060335` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `873454060335` | 54060335 | no |
| `874928625284` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `874928625284` | 28625284 | no |
| `875811286055` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `875811286055` | 11286055 | no |
| `876836862113` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `876836862113` | 36862113 | no |
| `877753094915` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `877753094915` | 53094915 | no |
| `889338134043` | FedEx 12 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `889338134043` | 38134043 | no |
| `017817598033` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `017817598033` | 17598033 | no |
| `161461077031` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `161461077031` | 61077031 | no |
| `197989463269` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `197989463269` | 89463269 | no |
| `217190241002` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `217190241002` | 90241002 | no |
| `241421902899` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `241421902899` | 21902899 | no |
| `267564293342` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `267564293342` | 64293342 | no |
| `275027502752` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `275027502752` | 27502752 | no |
| `375603967036` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `375603967036` | 03967036 | no |
| `380312624159` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `380312624159` | 12624159 | no |
| `381692689456` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `381692689456` | 92689456 | no |
| `382970454066` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `382970454066` | 70454066 | no |
| `383277445486` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `383277445486` | 77445486 | no |
| `396568599507` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `396568599507` | 68599507 | no |
| `398650113012` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `398650113012` | 50113012 | no |
| `399390849264` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `399390849264` | 90849264 | no |
| `407001569669` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `407001569669` | 01569669 | no |
| `490020400881` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `490020400881` | 20400881 | no |
| `500006609245` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `500006609245` | 06609245 | no |
| `512273470109` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `512273470109` | 73470109 | no |
| `513430815311` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `513430815311` | 30815311 | no |
| `517399626352` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `517399626352` | 99626352 | no |
| `520331511482` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `520331511482` | 31511482 | no |
| `524952708080` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `524952708080` | 52708080 | no |
| `525981368993` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `525981368993` | 81368993 | no |
| `529738504233` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `529738504233` | 38504233 | no |
| `531622750604` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `531622750604` | 22750604 | no |
| `534179824225` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `534179824225` | 79824225 | no |
| `794644123456` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `794644123456` | 44123456 | no |
| `870451179901` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `870451179901` | 51179901 | no |
| `871492585282` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `871492585282` | 92585282 | no |
| `872055977507` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `872055977507` | 55977507 | no |
| `873720600737` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `873720600737` | 20600737 | no |
| `874013697323` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `874013697323` | 13697323 | no |
| `875436788889` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `875436788889` | 36788889 | no |
| `876259340999` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `876259340999` | 59340999 | no |
| `877922622025` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `877922622025` | 22622025 | no |
| `878067366700` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `878067366700` | 67366700 | no |
| `889488894321` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `889488894321` | 88894321 | no |
| `991779990470` | FedEx 12 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `991779990470` | 79990470 | no |
| `000382266276865` | FedEx 15 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `000382266276865` | 66276865 | no |
| `051121901650626` | FedEx 15 | receiving_scans.tracking_number | carrier-tracking:Unknown | tracking:Unknown | `051121901650626` | 01650626 | no |
| `300399795542404` | FedEx 15 | receiving_scans.tracking_number | carrier-tracking:Unknown | tracking:Unknown | `300399795542404` | 95542404 | no |
| `700874566988130` | FedEx 15 | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `700874566988130` | 66988130 | no |
| `000873468596108` | FedEx 15 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `000873468596108` | 68596108 | no |
| `700873454060335` | FedEx 15 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `700873454060335` | 54060335 | no |
| `720572057202076` | FedEx 15 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `720572057202076` | 57202076 | no |
| `1Z1789958595615058` | UPS 1Z (18) | label_ingestions.tracking_number_raw | carrier-tracking:UPS | tracking:UPS | `1Z1789958595615058` | 95615058 | no |
| `1Z999AA10123456784` | UPS 1Z (18) | label_ingestions.tracking_number_raw | carrier-tracking:UPS | tracking:UPS | `1Z999AA10123456784` | 23456784 | no |
| `1ZJ22B100308753951` | UPS 1Z (18) | label_ingestions.tracking_number_raw | carrier-tracking:UPS | tracking:UPS | `1ZJ22B100308753951` | 08753951 | no |
| `1Z999AA10123456785` | UPS 1Z (18) | mobile_scan_events.raw_value | carrier-tracking:UPS | tracking:UPS | `1Z999AA10123456785` | 23456785 | no |
| `1Z999AA10123456786` | UPS 1Z (18) | mobile_scan_events.raw_value | carrier-tracking:UPS | tracking:UPS | `1Z999AA10123456786` | 23456786 | no |
| `1Z0R98790340724561` | UPS 1Z (18) | receiving_scans.tracking_number | carrier-tracking:UPS | tracking:UPS | `1Z0R98790340724561` | 40724561 | no |
| `1Z1A375J0311562432` | UPS 1Z (18) | receiving_scans.tracking_number | carrier-tracking:UPS | tracking:UPS | `1Z1A375J0311562432` | 11562432 | no |
| `1Z2X1G940327360187` | UPS 1Z (18) | receiving_scans.tracking_number | carrier-tracking:UPS | tracking:UPS | `1Z2X1G940327360187` | 27360187 | no |
| `1Z3XF6020314087444` | UPS 1Z (18) | receiving_scans.tracking_number | carrier-tracking:UPS | tracking:UPS | `1Z3XF6020314087444` | 14087444 | no |
| `1Z4E2W090305123673` | UPS 1Z (18) | receiving_scans.tracking_number | carrier-tracking:UPS | tracking:UPS | `1Z4E2W090305123673` | 05123673 | no |
| `1Z5W0W460335570390` | UPS 1Z (18) | receiving_scans.tracking_number | carrier-tracking:UPS | tracking:UPS | `1Z5W0W460335570390` | 35570390 | no |
| `1Z6AT9810394187424` | UPS 1Z (18) | receiving_scans.tracking_number | carrier-tracking:UPS | tracking:UPS | `1Z6AT9810394187424` | 94187424 | no |
| `1Z78Y5W70398912492` | UPS 1Z (18) | receiving_scans.tracking_number | carrier-tracking:UPS | tracking:UPS | `1Z78Y5W70398912492` | 98912492 | no |
| `1Z81F1Y00351635854` | UPS 1Z (18) | receiving_scans.tracking_number | carrier-tracking:UPS | tracking:UPS | `1Z81F1Y00351635854` | 51635854 | no |
| `1Z965EW40327647525` | UPS 1Z (18) | receiving_scans.tracking_number | carrier-tracking:UPS | tracking:UPS | `1Z965EW40327647525` | 27647525 | no |
| `1ZA8G9240313449084` | UPS 1Z (18) | receiving_scans.tracking_number | carrier-tracking:UPS | tracking:UPS | `1ZA8G9240313449084` | 13449084 | no |
| `1ZB7933K0311955973` | UPS 1Z (18) | receiving_scans.tracking_number | carrier-tracking:UPS | tracking:UPS | `1ZB7933K0311955973` | 11955973 | no |
| `1ZC80H580422152568` | UPS 1Z (18) | receiving_scans.tracking_number | carrier-tracking:UPS | tracking:UPS | `1ZC80H580422152568` | 22152568 | no |
| `1ZE4889EDK87718021` | UPS 1Z (18) | receiving_scans.tracking_number | carrier-tracking:UPS | tracking:UPS | `1ZE4889EDK87718021` | 87718021 | no |
| `1ZF7748R0369047889` | UPS 1Z (18) | receiving_scans.tracking_number | carrier-tracking:UPS | tracking:UPS | `1ZF7748R0369047889` | 69047889 | no |
| `1ZGA54210302147390` | UPS 1Z (18) | receiving_scans.tracking_number | carrier-tracking:UPS | tracking:UPS | `1ZGA54210302147390` | 02147390 | no |
| `1ZJ22B109023086623` | UPS 1Z (18) | receiving_scans.tracking_number | carrier-tracking:UPS | tracking:UPS | `1ZJ22B109023086623` | 23086623 | no |
| `1ZK11711YW62257489` | UPS 1Z (18) | receiving_scans.tracking_number | carrier-tracking:UPS | tracking:UPS | `1ZK11711YW62257489` | 62257489 | no |
| `1ZRF16800398314159` | UPS 1Z (18) | receiving_scans.tracking_number | carrier-tracking:UPS | tracking:UPS | `1ZRF16800398314159` | 98314159 | no |
| `1ZT1H99L0304899051` | UPS 1Z (18) | receiving_scans.tracking_number | carrier-tracking:UPS | tracking:UPS | `1ZT1H99L0304899051` | 04899051 | no |
| `1ZW258310391561663` | UPS 1Z (18) | receiving_scans.tracking_number | carrier-tracking:UPS | tracking:UPS | `1ZW258310391561663` | 91561663 | no |
| `1ZXH04570368170883` | UPS 1Z (18) | receiving_scans.tracking_number | carrier-tracking:UPS | tracking:UPS | `1ZXH04570368170883` | 68170883 | no |
| `1ZY228K59070616386` | UPS 1Z (18) | receiving_scans.tracking_number | carrier-tracking:UPS | tracking:UPS | `1ZY228K59070616386` | 70616386 | no |
| `1Z035CX1YN45385420` | UPS 1Z (18) | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:UPS | tracking:UPS | `1Z035CX1YN45385420` | 45385420 | no |
| `1Z1A375J4232406800` | UPS 1Z (18) | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:UPS | tracking:UPS | `1Z1A375J4232406800` | 32406800 | no |
| `1Z23A1E90340392449` | UPS 1Z (18) | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:UPS | tracking:UPS | `1Z23A1E90340392449` | 40392449 | no |
| `1Z3457230496720376` | UPS 1Z (18) | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:UPS | tracking:UPS | `1Z3457230496720376` | 96720376 | no |
| `1Z4019RY9095699872` | UPS 1Z (18) | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:UPS | tracking:UPS | `1Z4019RY9095699872` | 95699872 | no |
| `1Z78Y5W70393167744` | UPS 1Z (18) | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:UPS | tracking:UPS | `1Z78Y5W70393167744` | 93167744 | no |
| `1Z8Y41459087870221` | UPS 1Z (18) | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:UPS | tracking:UPS | `1Z8Y41459087870221` | 87870221 | no |
| `1Z9X5R659007065833` | UPS 1Z (18) | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:UPS | tracking:UPS | `1Z9X5R659007065833` | 07065833 | no |
| `1ZA481850308104578` | UPS 1Z (18) | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:UPS | tracking:UPS | `1ZA481850308104578` | 08104578 | no |
| `1ZC1D3190341848544` | UPS 1Z (18) | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:UPS | tracking:UPS | `1ZC1D3190341848544` | 41848544 | no |
| `1ZE424A00326714056` | UPS 1Z (18) | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:UPS | tracking:UPS | `1ZE424A00326714056` | 26714056 | no |
| `1ZGG77540303046444` | UPS 1Z (18) | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:UPS | tracking:UPS | `1ZGG77540303046444` | 03046444 | no |
| `1ZJ22B104217874892` | UPS 1Z (18) | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:UPS | tracking:UPS | `1ZJ22B104217874892` | 17874892 | no |
| `1ZR096K99062743923` | UPS 1Z (18) | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:UPS | tracking:UPS | `1ZR096K99062743923` | 62743923 | no |
| `1ZSMK1790553264322` | UPS 1Z (18) | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:UPS | tracking:UPS | `1ZSMK1790553264322` | 53264322 | no |
| `1ZTEST0000MPPTUASX` | UPS 1Z (18) | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:UPS | tracking:UPS | `1ZTEST0000MPPTUASX` | 1ZTEST0000MPPTUASX | no |
| `1ZW7823A9022370323` | UPS 1Z (18) | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:UPS | tracking:UPS | `1ZW7823A9022370323` | 22370323 | no |
| `1ZXG9979YW25585541` | UPS 1Z (18) | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:UPS | tracking:UPS | `1ZXG9979YW25585541` | 25585541 | no |
| `1ZY228K59067063702` | UPS 1Z (18) | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:UPS | tracking:UPS | `1ZY228K59067063702` | 67063702 | no |
| `1Z0K153W0313640178` | UPS 1Z (18) | tracking_exceptions.tracking_number | carrier-tracking:UPS | tracking:UPS | `1Z0K153W0313640178` | 13640178 | no |
| `1Z965EW40326631034` | UPS 1Z (18) | tracking_exceptions.tracking_number | carrier-tracking:UPS | tracking:UPS | `1Z965EW40326631034` | 26631034 | no |
| `1ZB775040305853029` | UPS 1Z (18) | tracking_exceptions.tracking_number | carrier-tracking:UPS | tracking:UPS | `1ZB775040305853029` | 05853029 | no |
| `1ZJ22B100337805564` | UPS 1Z (18) | tracking_exceptions.tracking_number | carrier-tracking:UPS | tracking:UPS | `1ZJ22B100337805564` | 37805564 | no |
| `1ZR096K99059063656` | UPS 1Z (18) | tracking_exceptions.tracking_number | carrier-tracking:UPS | tracking:UPS | `1ZR096K99059063656` | 59063656 | no |
| `420926470000` | USPS 420+ZIP (other) | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `420926470000` | 26470000 | no |
| `420119674141` | USPS 420+ZIP (other) | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `420119674141` | 19674141 | no |
| `420924082805` | USPS 420+ZIP (other) | station_scan_sessions.tracking_raw | carrier-tracking:FedEx | tracking:FedEx | `420924082805` | 24082805 | no |
| `93020818308342005039` | USPS IMpb 20/21/26/30 | receiving_scans.tracking_number | carrier-tracking:USPS | tracking:USPS | `93020818308342005039` | 42005039 | no |
| `94346081062451705830` | USPS IMpb 20/21/26/30 | receiving_scans.tracking_number | carrier-tracking:USPS | tracking:USPS | `94346081062451705830` | 51705830 | no |
| `93001109905153409121` | USPS IMpb 20/21/26/30 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:USPS | tracking:USPS | `93001109905153409121` | 53409121 | no |
| `94001118992233445501` | USPS IMpb 20/21/26/30 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:USPS | tracking:USPS | `94001118992233445501` | 33445501 | no |
| `9400150106151402340943` | USPS IMpb 22 | label_ingestions.tracking_number_raw | carrier-tracking:USPS | tracking:USPS | `9400150106151402340943` | 02340943 | no |
| `9434650206217291098004` | USPS IMpb 22 | label_ingestions.tracking_number_raw | carrier-tracking:USPS | tracking:USPS | `9434650206217291098004` | 91098004 | no |
| `9449050206217046491111` | USPS IMpb 22 | label_ingestions.tracking_number_raw | carrier-tracking:USPS | tracking:USPS | `9449050206217046491111` | 46491111 | no |
| `9361289711068322544977` | USPS IMpb 22 | mobile_scan_events.raw_value | carrier-tracking:USPS | tracking:USPS | `9361289711068322544977` | 22544977 | no |
| `9200190105244354616880` | USPS IMpb 22 | receiving_scans.tracking_number | carrier-tracking:USPS | tracking:USPS | `9200190105244354616880` | 54616880 | no |
| `9218490105244354634334` | USPS IMpb 22 | receiving_scans.tracking_number | carrier-tracking:USPS | tracking:USPS | `9218490105244354634334` | 54634334 | no |
| `9234690324992839453639` | USPS IMpb 22 | receiving_scans.tracking_number | carrier-tracking:USPS | tracking:USPS | `9234690324992839453639` | 39453639 | no |
| `9261299998825457375947` | USPS IMpb 22 | receiving_scans.tracking_number | carrier-tracking:USPS | tracking:USPS | `9261299998825457375947` | 57375947 | no |
| `9302011047800002788853` | USPS IMpb 22 | receiving_scans.tracking_number | carrier-tracking:USPS | tracking:USPS | `9302011047800002788853` | 02788853 | no |
| `9334610990370309634346` | USPS IMpb 22 | receiving_scans.tracking_number | carrier-tracking:USPS | tracking:USPS | `9334610990370309634346` | 09634346 | no |
| `9361289711066376682645` | USPS IMpb 22 | receiving_scans.tracking_number | carrier-tracking:USPS | tracking:USPS | `9361289711066376682645` | 76682645 | no |
| `9400108106244228451373` | USPS IMpb 22 | receiving_scans.tracking_number | carrier-tracking:USPS | tracking:USPS | `9400108106244228451373` | 28451373 | no |
| `9434650106151117061784` | USPS IMpb 22 | receiving_scans.tracking_number | carrier-tracking:USPS | tracking:USPS | `9434650106151117061784` | 17061784 | no |
| `9449050106151019530456` | USPS IMpb 22 | receiving_scans.tracking_number | carrier-tracking:USPS | tracking:USPS | `9449050106151019530456` | 19530456 | no |
| `9488809000276360103450` | USPS IMpb 22 | receiving_scans.tracking_number | carrier-tracking:USPS | tracking:USPS | `9488809000276360103450` | 60103450 | no |
| `9500113244516271040296` | USPS IMpb 22 | receiving_scans.tracking_number | carrier-tracking:USPS | tracking:USPS | `9500113244516271040296` | 71040296 | no |
| `9534613368786267350871` | USPS IMpb 22 | receiving_scans.tracking_number | carrier-tracking:USPS | tracking:USPS | `9534613368786267350871` | 67350871 | no |
| `9549015461676204390049` | USPS IMpb 22 | receiving_scans.tracking_number | carrier-tracking:USPS | tracking:USPS | `9549015461676204390049` | 04390049 | no |
| `9588871095280030123485` | USPS IMpb 22 | receiving_scans.tracking_number | carrier-tracking:USPS | tracking:USPS | `9588871095280030123485` | 30123485 | no |
| `9200190284940757926101` | USPS IMpb 22 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:USPS | tracking:USPS | `9200190284940757926101` | 57926101 | no |
| `9212490416420900004366` | USPS IMpb 22 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:USPS | tracking:USPS | `9212490416420900004366` | 00004366 | no |
| `9234690324992817287881` | USPS IMpb 22 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:USPS | tracking:USPS | `9234690324992817287881` | 17287881 | no |
| `9261290983197848129541` | USPS IMpb 22 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:USPS | tracking:USPS | `9261290983197848129541` | 48129541 | no |
| `9300110990513579646383` | USPS IMpb 22 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:USPS | tracking:USPS | `9300110990513579646383` | 79646383 | no |
| `9310810989911217649084` | USPS IMpb 22 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:USPS | tracking:USPS | `9310810989911217649084` | 17649084 | no |
| `9334610990150195591783` | USPS IMpb 22 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:USPS | tracking:USPS | `9334610990150195591783` | 95591783 | no |
| `9361289711063771875955` | USPS IMpb 22 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:USPS | tracking:USPS | `9361289711063771875955` | 71875955 | no |
| `9400136106196316861720` | USPS IMpb 22 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:USPS | tracking:USPS | `9400136106196316861720` | 16861720 | no |
| `9418408106245203243600` | USPS IMpb 22 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:USPS | tracking:USPS | `9418408106245203243600` | 03243600 | no |
| `9434650106151079244669` | USPS IMpb 22 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:USPS | tracking:USPS | `9434650106151079244669` | 79244669 | no |
| `9449036106196281212765` | USPS IMpb 22 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:USPS | tracking:USPS | `9449036106196281212765` | 81212765 | no |
| `9500113007326171056126` | USPS IMpb 22 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:USPS | tracking:USPS | `9500113007326171056126` | 71056126 | no |
| `9534615203006159009471` | USPS IMpb 22 | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:USPS | tracking:USPS | `9534615203006159009471` | 59009471 | no |
| `9434608106244379563491` | USPS IMpb 22 | station_scan_sessions.tracking_raw | carrier-tracking:USPS | tracking:USPS | `9434608106244379563491` | 79563491 | no |
| `9300110990513446884382` | USPS IMpb 22 | tracking_exceptions.tracking_number | carrier-tracking:USPS | tracking:USPS | `9300110990513446884382` | 46884382 | no |

#### House rows (complete — door contrast)

| value | carrier guess | source | routeScan kind | arrivalScanIntent | normalised | last-8 | refused? |
|---|---|---|---|---|---|---|---|
| `04-14902-05990` | eBay order no. (NN-NNNNN-NNNNN) | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `041490205990` | 90205990 | no |
| `06-14730-92535` | eBay order no. (NN-NNNNN-NNNNN) | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `061473092535` | 73092535 | no |
| `07-14606-66972` | eBay order no. (NN-NNNNN-NNNNN) | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `071460666972` | 60666972 | no |
| `08-14669-82072` | eBay order no. (NN-NNNNN-NNNNN) | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `081466982072` | 66982072 | no |
| `08-14681-85770` | eBay order no. (NN-NNNNN-NNNNN) | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `081468185770` | 68185770 | no |
| `09-14693-39484` | eBay order no. (NN-NNNNN-NNNNN) | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `091469339484` | 69339484 | no |
| `09-14887-27802` | eBay order no. (NN-NNNNN-NNNNN) | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `091488727802` | 88727802 | no |
| `11-14702-73308` | eBay order no. (NN-NNNNN-NNNNN) | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `111470273308` | 70273308 | no |
| `11-15073-02440` | eBay order no. (NN-NNNNN-NNNNN) | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `111507302440` | 07302440 | no |
| `15-14728-87921` | eBay order no. (NN-NNNNN-NNNNN) | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `151472887921` | 72887921 | no |
| `17-15201-54064` | eBay order no. (NN-NNNNN-NNNNN) | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `171520154064` | 20154064 | no |
| `18-15096-09184` | eBay order no. (NN-NNNNN-NNNNN) | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `181509609184` | 09609184 | no |
| `20-14704-14993` | eBay order no. (NN-NNNNN-NNNNN) | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `201470414993` | 70414993 | no |
| `21-14648-20153` | eBay order no. (NN-NNNNN-NNNNN) | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `211464820153` | 64820153 | no |
| `21-14777-85596` | eBay order no. (NN-NNNNN-NNNNN) | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `211477785596` | 77785596 | no |
| `21-14967-81557` | eBay order no. (NN-NNNNN-NNNNN) | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `211496781557` | 96781557 | no |
| `21-15028-43176` | eBay order no. (NN-NNNNN-NNNNN) | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `211502843176` | 02843176 | no |
| `24-14771-36459` | eBay order no. (NN-NNNNN-NNNNN) | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `241477136459` | 77136459 | no |
| `24-14836-95131` | eBay order no. (NN-NNNNN-NNNNN) | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `241483695131` | 83695131 | no |
| `24-14912-51506` | eBay order no. (NN-NNNNN-NNNNN) | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `241491251506` | 91251506 | no |
| `27-14665-32524` | eBay order no. (NN-NNNNN-NNNNN) | mobile_scan_events.raw_value | carrier-tracking:FedEx | tracking:FedEx | `271466532524` | 66532524 | no |
| `01-14850-38260` | eBay order no. (NN-NNNNN-NNNNN) | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `011485038260` | 85038260 | no |
| `02-14876-13796` | eBay order no. (NN-NNNNN-NNNNN) | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `021487613796` | 87613796 | no |
| `03-14777-17761` | eBay order no. (NN-NNNNN-NNNNN) | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `031477717761` | 77717761 | no |
| `05-14818-44324` | eBay order no. (NN-NNNNN-NNNNN) | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `051481844324` | 81844324 | no |
| `06-14860-93474` | eBay order no. (NN-NNNNN-NNNNN) | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `061486093474` | 86093474 | no |
| `07-14896-92337` | eBay order no. (NN-NNNNN-NNNNN) | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `071489692337` | 89692337 | no |
| `08-14875-45300` | eBay order no. (NN-NNNNN-NNNNN) | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `081487545300` | 87545300 | no |
| `09-14755-97745` | eBay order no. (NN-NNNNN-NNNNN) | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `091475597745` | 75597745 | no |
| `10-14813-20590` | eBay order no. (NN-NNNNN-NNNNN) | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `101481320590` | 81320590 | no |
| `11-14589-86748` | eBay order no. (NN-NNNNN-NNNNN) | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `111458986748` | 58986748 | no |
| `12-14721-26664` | eBay order no. (NN-NNNNN-NNNNN) | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `121472126664` | 72126664 | no |
| `13-14598-69995` | eBay order no. (NN-NNNNN-NNNNN) | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `131459869995` | 59869995 | no |
| `14-14923-97837` | eBay order no. (NN-NNNNN-NNNNN) | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `141492397837` | 92397837 | no |
| `15-14987-12879` | eBay order no. (NN-NNNNN-NNNNN) | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `151498712879` | 98712879 | no |
| `16-14633-84979` | eBay order no. (NN-NNNNN-NNNNN) | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `161463384979` | 63384979 | no |
| `17-14782-56662` | eBay order no. (NN-NNNNN-NNNNN) | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `171478256662` | 78256662 | no |
| `19-14930-08546` | eBay order no. (NN-NNNNN-NNNNN) | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `191493008546` | 93008546 | no |
| `20-14836-87263` | eBay order no. (NN-NNNNN-NNNNN) | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `201483687263` | 83687263 | no |
| `21-14785-52870` | eBay order no. (NN-NNNNN-NNNNN) | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `211478552870` | 78552870 | no |
| `22-14971-82917` | eBay order no. (NN-NNNNN-NNNNN) | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `221497182917` | 97182917 | no |
| `23-14831-91958` | eBay order no. (NN-NNNNN-NNNNN) | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `231483191958` | 83191958 | no |
| `25-14704-23351` | eBay order no. (NN-NNNNN-NNNNN) | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `251470423351` | 70423351 | no |
| `26-14713-28309` | eBay order no. (NN-NNNNN-NNNNN) | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `261471328309` | 71328309 | no |
| `27-14843-46373` | eBay order no. (NN-NNNNN-NNNNN) | receiving_scans.tracking_number | carrier-tracking:FedEx | tracking:FedEx | `271484346373` | 84346373 | no |
| `05-14843-41472` | eBay order no. (NN-NNNNN-NNNNN) | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `051484341472` | 84341472 | no |
| `07-14839-65130` | eBay order no. (NN-NNNNN-NNNNN) | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `071483965130` | 83965130 | no |
| `22-14564-85805` | eBay order no. (NN-NNNNN-NNNNN) | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `221456485805` | 56485805 | no |
| `(01)02000000000275` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `0102000000000275` | 00000275 | **YES** |
| `(01)02000000000633` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `0102000000000633` | 00000633 | **YES** |
| `(01)02000000001340` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `0102000000001340` | 00001340 | **YES** |
| `(01)02000000001388` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `0102000000001388` | 00001388 | **YES** |
| `(01)02000000001685` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `0102000000001685` | 00001685 | **YES** |
| `(01)02000000001951` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `0102000000001951` | 00001951 | **YES** |
| `(01)02000000002361` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `0102000000002361` | 00002361 | **YES** |
| `(01)02000000002453` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `0102000000002453` | 00002453 | **YES** |
| `(01)02000000002521` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `0102000000002521` | 00002521 | **YES** |
| `(01)02000000003399` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `0102000000003399` | 00003399 | **YES** |
| `(01)02000000003481` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `0102000000003481` | 00003481 | **YES** |
| `(01)02000000003634` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `0102000000003634` | 00003634 | **YES** |
| `(01)02000000003818` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `0102000000003818` | 00003818 | **YES** |
| `(01)02000000004334` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `0102000000004334` | 00004334 | **YES** |
| `(01)02000000004617` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `0102000000004617` | 00004617 | **YES** |
| `(01)02000000005508` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `0102000000005508` | 00005508 | **YES** |
| `(01)02000000006109` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `0102000000006109` | 00006109 | **YES** |
| `(01)02000000008332` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `0102000000008332` | 00008332 | **YES** |
| `(01)02000000008417` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `0102000000008417` | 00008417 | **YES** |
| `(01)02000000008905` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `0102000000008905` | 00008905 | **YES** |
| `(01)02000000008998` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `0102000000008998` | 00008998 | **YES** |
| `(01)02000000009339` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `0102000000009339` | 00009339 | **YES** |
| `(01)02000000010199` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `0102000000010199` | 00010199 | **YES** |
| `(01)02000000010243` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `0102000000010243` | 00010243 | **YES** |
| `(01)02000000010892` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `0102000000010892` | 00010892 | **YES** |
| `(414)0614141000005(254)A0101101` | house-gs1 | mobile_scan_events.raw_value | bin | refused | `4140614141000005254A0101101` | 40101101 | **YES** |
| `/414/0614141000005/254/A0101100` | house-gs1 | mobile_scan_events.raw_value | bin | refused | `4140614141000005254A0101100` | 40101100 | **YES** |
| `02000000000275` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `02000000000275` | 00000275 | **YES** |
| `02000000000633` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `02000000000633` | 00000633 | **YES** |
| `02000000001340` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `02000000001340` | 00001340 | **YES** |
| `02000000001388` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `02000000001388` | 00001388 | **YES** |
| `02000000001685` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `02000000001685` | 00001685 | **YES** |
| `02000000001951` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `02000000001951` | 00001951 | **YES** |
| `02000000002361` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `02000000002361` | 00002361 | **YES** |
| `02000000002453` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `02000000002453` | 00002453 | **YES** |
| `02000000002521` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `02000000002521` | 00002521 | **YES** |
| `02000000003399` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `02000000003399` | 00003399 | **YES** |
| `02000000003481` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `02000000003481` | 00003481 | **YES** |
| `02000000003634` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `02000000003634` | 00003634 | **YES** |
| `02000000003818` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `02000000003818` | 00003818 | **YES** |
| `02000000004334` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `02000000004334` | 00004334 | **YES** |
| `02000000004617` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `02000000004617` | 00004617 | **YES** |
| `02000000005508` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `02000000005508` | 00005508 | **YES** |
| `02000000006109` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `02000000006109` | 00006109 | **YES** |
| `02000000008332` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `02000000008332` | 00008332 | **YES** |
| `02000000008417` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `02000000008417` | 00008417 | **YES** |
| `02000000008905` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `02000000008905` | 00008905 | **YES** |
| `02000000008998` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `02000000008998` | 00008998 | **YES** |
| `02000000009339` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `02000000009339` | 00009339 | **YES** |
| `02000000010199` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `02000000010199` | 00010199 | **YES** |
| `02000000010243` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `02000000010243` | 00010243 | **YES** |
| `02000000010892` | house-gs1 | mobile_scan_events.raw_value | sku | refused | `02000000010892` | 00010892 | **YES** |
| `4140614141000005<GS>254A0101100` | house-gs1 | mobile_scan_events.raw_value | bin | refused | `4140614141000005254A0101100` | 40101100 | **YES** |
| `00016-GR` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `00016GR` | 00016-GR | **YES** |
| `00042` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `00042` | 00042 | **YES** |
| `00045` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `00045` | 00045 | **YES** |
| `00047` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `00047` | 00047 | **YES** |
| `00060` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `00060` | 00060 | **YES** |
| `00065` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `00065` | 00065 | **YES** |
| `00071` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `00071` | 00071 | **YES** |
| `00090` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `00090` | 00090 | **YES** |
| `00096` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `00096` | 00096 | **YES** |
| `00115-BL` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `00115BL` | 00115-BL | **YES** |
| `00140` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `00140` | 00140 | **YES** |
| `00161` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `00161` | 00161 | **YES** |
| `00176` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `00176` | 00176 | **YES** |
| `00178` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `00178` | 00178 | **YES** |
| `00179` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `00179` | 00179 | **YES** |
| `00220-P-2-BK` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `00220P2BK` | 00220-P-2-BK | **YES** |
| `00280` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `00280` | 00280 | **YES** |
| `00282` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `00282` | 00282 | **YES** |
| `00325-PS` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `00325PS` | 00325-PS | **YES** |
| `00364-WY` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `00364WY` | 00364-WY | **YES** |
| `00606-P-1-WY` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `00606P1WY` | 00606-P-1-WY | **YES** |
| `00925` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `00925` | 00925 | **YES** |
| `00980` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `00980` | 00980 | **YES** |
| `01181-1` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `011811` | 01181-1 | **YES** |
| `019158952630107AC` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `019158952630107AC` | 52630107 | **YES** |
| `022373C20145620AC` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `022373C20145620AC` | 20145620 | **YES** |
| `024644981880410AC` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `024644981880410AC` | 81880410 | **YES** |
| `025336C23250101AC` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `025336C23250101AC` | 23250101 | **YES** |
| `033976c60555172ac` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `033976C60555172AC` | 60555172 | **YES** |
| `034036C70685650AC` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `034036C70685650AC` | 70685650 | **YES** |
| `034103910250412AC` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `034103910250412AC` | 10250412 | **YES** |
| `037755953391517AC` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `037755953391517AC` | 53391517 | **YES** |
| `043085980281610AE` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `043085980281610AE` | 80281610 | **YES** |
| `044417c02385144ac` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `044417C02385144AC` | 02385144 | **YES** |
| `05014290112111AE` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `05014290112111AE` | 90112111 | **YES** |
| `051116F02840389AE` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `051116F02840389AE` | 02840389 | **YES** |
| `051353921430379as` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `051353921430379AS` | 21430379 | **YES** |
| `059565930312019AE` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `059565930312019AE` | 30312019 | **YES** |
| `061090942740111AE` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `061090942740111AE` | 42740111 | **YES** |
| `061102952170046AE` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `061102952170046AE` | 52170046 | **YES** |
| `064710952560631a5` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `064710952560631A5` | 25606315 | **YES** |
| `064710953312000A3` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `064710953312000A3` | 33120003 | **YES** |
| `070213993320641AE` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `070213993320641AE` | 93320641 | **YES** |
| `070214960600582AE` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `070214960600582AE` | 60600582 | **YES** |
| `071494F90290152AE` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `071494F90290152AE` | 90290152 | **YES** |
| `080813z40505853ae` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `080813Z40505853AE` | 40505853 | **YES** |
| `083424j32000020ae` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `083424J32000020AE` | 32000020 | **YES** |
| `113-1528397-8163447` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `11315283978163447` | 78163447 | **YES** |
| `13964` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `13964` | 13964 | **YES** |
| `141` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `141` | 141 | **YES** |
| `151 SE` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `151SE` | 151 SE | **YES** |
| `321 GS` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `321GS` | 321 GS | **YES** |
| `353811-0010 1506EB008406` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `35381100101506EB008406` | 06008406 | **YES** |
| `421088` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `421088` | 421088 | **YES** |
| `4993` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `4993` | 4993 | **YES** |
| `62326295` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `62326295` | 62326295 | **YES** |
| `62775661` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `62775661` | 62775661 | **YES** |
| `62948263` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `62948263` | 62948263 | **YES** |
| `64726761` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `64726761` | 64726761 | **YES** |
| `64793692` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `64793692` | 64793692 | **YES** |
| `64937590` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `64937590` | 64937590 | **YES** |
| `65152655` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `65152655` | 65152655 | **YES** |
| `822571` | house-sku/bin/serial | mobile_scan_events.raw_value | sku | refused | `822571` | 822571 | **YES** |
| `A0101100` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `A0101100` | A0101100 | **YES** |
| `A0101101` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `A0101101` | A0101101 | **YES** |
| `A12` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `A12` | A12 | **YES** |
| `AV3-2-1` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `AV321` | AV3-2-1 | **YES** |
| `AWRC1G` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `AWRC1G` | AWRC1G | **YES** |
| `AWRCC1` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `AWRCC1` | AWRCC1 | **YES** |
| `AWRCC2` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `AWRCC2` | AWRCC2 | **YES** |
| `Acoustimass 6` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `ACOUSTIMASS6` | Acoustimass 6 | **YES** |
| `B2A` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `B2A` | B2A | **YES** |
| `BOSE` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `BOSE` | BOSE | **YES** |
| `Bose` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `BOSE` | Bose | **YES** |
| `CineMate 120` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `CINEMATE120` | CineMate 120 | **YES** |
| `PS48` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `PS48` | PS48 | **YES** |
| `R-1024` | house-sku/bin/serial | mobile_scan_events.raw_value | receiving | carton | `R1024` | R-1024 | no |
| `R-1234` | house-sku/bin/serial | mobile_scan_events.raw_value | receiving | carton | `R1234` | R-1234 | no |
| `R-1970` | house-sku/bin/serial | mobile_scan_events.raw_value | receiving | carton | `R1970` | R-1970 | no |
| `R-1994` | house-sku/bin/serial | mobile_scan_events.raw_value | receiving | carton | `R1994` | R-1994 | no |
| `R-2045` | house-sku/bin/serial | mobile_scan_events.raw_value | receiving | carton | `R2045` | R-2045 | no |
| `R-2081` | house-sku/bin/serial | mobile_scan_events.raw_value | receiving | carton | `R2081` | R-2081 | no |
| `R-2113` | house-sku/bin/serial | mobile_scan_events.raw_value | receiving | carton | `R2113` | R-2113 | no |
| `R-2176` | house-sku/bin/serial | mobile_scan_events.raw_value | receiving | carton | `R2176` | R-2176 | no |
| `R-2184` | house-sku/bin/serial | mobile_scan_events.raw_value | receiving | carton | `R2184` | R-2184 | no |
| `R-2213` | house-sku/bin/serial | mobile_scan_events.raw_value | receiving | carton | `R2213` | R-2213 | no |
| `R-2226` | house-sku/bin/serial | mobile_scan_events.raw_value | receiving | carton | `R2226` | R-2226 | no |
| `R-2262` | house-sku/bin/serial | mobile_scan_events.raw_value | receiving | carton | `R2262` | R-2262 | no |
| `R-2419` | house-sku/bin/serial | mobile_scan_events.raw_value | receiving | carton | `R2419` | R-2419 | no |
| `R-3550` | house-sku/bin/serial | mobile_scan_events.raw_value | receiving | carton | `R3550` | R-3550 | no |
| `R-3810` | house-sku/bin/serial | mobile_scan_events.raw_value | receiving | carton | `R3810` | R-3810 | no |
| `R-4029` | house-sku/bin/serial | mobile_scan_events.raw_value | receiving | carton | `R4029` | R-4029 | no |
| `R-4792` | house-sku/bin/serial | mobile_scan_events.raw_value | receiving | carton | `R4792` | R-4792 | no |
| `R-4949` | house-sku/bin/serial | mobile_scan_events.raw_value | receiving | carton | `R4949` | R-4949 | no |
| `R-4961` | house-sku/bin/serial | mobile_scan_events.raw_value | receiving | carton | `R4961` | R-4961 | no |
| `R-4964` | house-sku/bin/serial | mobile_scan_events.raw_value | receiving | carton | `R4964` | R-4964 | no |
| `R-5026` | house-sku/bin/serial | mobile_scan_events.raw_value | receiving | carton | `R5026` | R-5026 | no |
| `R-50956` | house-sku/bin/serial | mobile_scan_events.raw_value | receiving | carton | `R50956` | R-50956 | no |
| `R-51981` | house-sku/bin/serial | mobile_scan_events.raw_value | receiving | carton | `R51981` | R-51981 | no |
| `R-5226` | house-sku/bin/serial | mobile_scan_events.raw_value | receiving | carton | `R5226` | R-5226 | no |
| `R-52312` | house-sku/bin/serial | mobile_scan_events.raw_value | receiving | carton | `R52312` | R-52312 | no |
| `R-5242` | house-sku/bin/serial | mobile_scan_events.raw_value | receiving | carton | `R5242` | R-5242 | no |
| `R-53276` | house-sku/bin/serial | mobile_scan_events.raw_value | receiving | carton | `R53276` | R-53276 | no |
| `R-53297` | house-sku/bin/serial | mobile_scan_events.raw_value | receiving | carton | `R53297` | R-53297 | no |
| `R-5397` | house-sku/bin/serial | mobile_scan_events.raw_value | receiving | carton | `R5397` | R-5397 | no |
| `R-5404` | house-sku/bin/serial | mobile_scan_events.raw_value | receiving | carton | `R5404` | R-5404 | no |
| `R-6627` | house-sku/bin/serial | mobile_scan_events.raw_value | receiving | carton | `R6627` | R-6627 | no |
| `R-9491` | house-sku/bin/serial | mobile_scan_events.raw_value | receiving | carton | `R9491` | R-9491 | no |
| `R-9975` | house-sku/bin/serial | mobile_scan_events.raw_value | receiving | carton | `R9975` | R-9975 | no |
| `RK001` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `RK001` | RK001 | **YES** |
| `Series III` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `SERIESIII` | Series III | **YES** |
| `SoundDock 10` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `SOUNDDOCK10` | SoundDock 10 | **YES** |
| `SoundLink Color` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `SOUNDLINKCOLOR` | SoundLink Color | **YES** |
| `Surround Speakers 700` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `SURROUNDSPEAKERS700` | Surround Speakers 700 | **YES** |
| `U-1024` | house-sku/bin/serial | mobile_scan_events.raw_value | serial-unit | refused | `U1024` | U-1024 | **YES** |
| `U-1164` | house-sku/bin/serial | mobile_scan_events.raw_value | serial-unit | refused | `U1164` | U-1164 | **YES** |
| `U-1195` | house-sku/bin/serial | mobile_scan_events.raw_value | serial-unit | refused | `U1195` | U-1195 | **YES** |
| `U-1283` | house-sku/bin/serial | mobile_scan_events.raw_value | serial-unit | refused | `U1283` | U-1283 | **YES** |
| `U-1329` | house-sku/bin/serial | mobile_scan_events.raw_value | serial-unit | refused | `U1329` | U-1329 | **YES** |
| `U-1457` | house-sku/bin/serial | mobile_scan_events.raw_value | serial-unit | refused | `U1457` | U-1457 | **YES** |
| `U-1467` | house-sku/bin/serial | mobile_scan_events.raw_value | serial-unit | refused | `U1467` | U-1467 | **YES** |
| `U-1559` | house-sku/bin/serial | mobile_scan_events.raw_value | serial-unit | refused | `U1559` | U-1559 | **YES** |
| `U-1700` | house-sku/bin/serial | mobile_scan_events.raw_value | serial-unit | refused | `U1700` | U-1700 | **YES** |
| `U-1970` | house-sku/bin/serial | mobile_scan_events.raw_value | serial-unit | refused | `U1970` | U-1970 | **YES** |
| `U-1994` | house-sku/bin/serial | mobile_scan_events.raw_value | serial-unit | refused | `U1994` | U-1994 | **YES** |
| `U-2045` | house-sku/bin/serial | mobile_scan_events.raw_value | serial-unit | refused | `U2045` | U-2045 | **YES** |
| `U-2081` | house-sku/bin/serial | mobile_scan_events.raw_value | serial-unit | refused | `U2081` | U-2081 | **YES** |
| `U-2113` | house-sku/bin/serial | mobile_scan_events.raw_value | serial-unit | refused | `U2113` | U-2113 | **YES** |
| `U-2176` | house-sku/bin/serial | mobile_scan_events.raw_value | serial-unit | refused | `U2176` | U-2176 | **YES** |
| `U-2184` | house-sku/bin/serial | mobile_scan_events.raw_value | serial-unit | refused | `U2184` | U-2184 | **YES** |
| `U-2213` | house-sku/bin/serial | mobile_scan_events.raw_value | serial-unit | refused | `U2213` | U-2213 | **YES** |
| `U-2226` | house-sku/bin/serial | mobile_scan_events.raw_value | serial-unit | refused | `U2226` | U-2226 | **YES** |
| `U-2262` | house-sku/bin/serial | mobile_scan_events.raw_value | serial-unit | refused | `U2262` | U-2262 | **YES** |
| `U-2419` | house-sku/bin/serial | mobile_scan_events.raw_value | serial-unit | refused | `U2419` | U-2419 | **YES** |
| `U-2491` | house-sku/bin/serial | mobile_scan_events.raw_value | serial-unit | refused | `U2491` | U-2491 | **YES** |
| `U-2593` | house-sku/bin/serial | mobile_scan_events.raw_value | serial-unit | refused | `U2593` | U-2593 | **YES** |
| `U-833` | house-sku/bin/serial | mobile_scan_events.raw_value | serial-unit | refused | `U833` | U-833 | **YES** |
| `U-890` | house-sku/bin/serial | mobile_scan_events.raw_value | serial-unit | refused | `U890` | U-890 | **YES** |
| `U-899` | house-sku/bin/serial | mobile_scan_events.raw_value | serial-unit | refused | `U899` | U-899 | **YES** |
| `V9` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `V9` | V9 | **YES** |
| `WB-120` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `WB120` | WB-120 | **YES** |
| `X-Plorer` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `XPLORER` | X-Plorer | **YES** |
| `X001PBX2XL` | house-sku/bin/serial | mobile_scan_events.raw_value | fnsku | refused | `X001PBX2XL` | X001PBX2XL | **YES** |
| `X0028BQDHJ` | house-sku/bin/serial | mobile_scan_events.raw_value | fnsku | refused | `X0028BQDHJ` | X0028BQDHJ | **YES** |
| `X002MLY7R3` | house-sku/bin/serial | mobile_scan_events.raw_value | fnsku | refused | `X002MLY7R3` | X002MLY7R3 | **YES** |
| `X002N6TT4N` | house-sku/bin/serial | mobile_scan_events.raw_value | fnsku | refused | `X002N6TT4N` | X002N6TT4N | **YES** |
| `X002NZ0IXZ` | house-sku/bin/serial | mobile_scan_events.raw_value | fnsku | refused | `X002NZ0IXZ` | X002NZ0IXZ | **YES** |
| `X002YKEMDL` | house-sku/bin/serial | mobile_scan_events.raw_value | fnsku | refused | `X002YKEMDL` | X002YKEMDL | **YES** |
| `X002ZA0T19` | house-sku/bin/serial | mobile_scan_events.raw_value | fnsku | refused | `X002ZA0T19` | X002ZA0T19 | **YES** |
| `X0031R9ZPB` | house-sku/bin/serial | mobile_scan_events.raw_value | fnsku | refused | `X0031R9ZPB` | X0031R9ZPB | **YES** |
| `X003E9YWVD` | house-sku/bin/serial | mobile_scan_events.raw_value | fnsku | refused | `X003E9YWVD` | X003E9YWVD | **YES** |
| `X003TNTYUD` | house-sku/bin/serial | mobile_scan_events.raw_value | fnsku | refused | `X003TNTYUD` | X003TNTYUD | **YES** |
| `X003TXX9X1` | house-sku/bin/serial | mobile_scan_events.raw_value | fnsku | refused | `X003TXX9X1` | X003TXX9X1 | **YES** |
| `X003U1S0DL` | house-sku/bin/serial | mobile_scan_events.raw_value | fnsku | refused | `X003U1S0DL` | X003U1S0DL | **YES** |
| `X004A46MEV` | house-sku/bin/serial | mobile_scan_events.raw_value | fnsku | refused | `X004A46MEV` | X004A46MEV | **YES** |
| `X004E2Y2F5` | house-sku/bin/serial | mobile_scan_events.raw_value | fnsku | refused | `X004E2Y2F5` | X004E2Y2F5 | **YES** |
| `X004L97MA3` | house-sku/bin/serial | mobile_scan_events.raw_value | fnsku | refused | `X004L97MA3` | X004L97MA3 | **YES** |
| `X004LZW4MX` | house-sku/bin/serial | mobile_scan_events.raw_value | fnsku | refused | `X004LZW4MX` | X004LZW4MX | **YES** |
| `X004MSG6FF` | house-sku/bin/serial | mobile_scan_events.raw_value | fnsku | refused | `X004MSG6FF` | X004MSG6FF | **YES** |
| `X004MUB6ZN` | house-sku/bin/serial | mobile_scan_events.raw_value | fnsku | refused | `X004MUB6ZN` | X004MUB6ZN | **YES** |
| `X004N2YG9N` | house-sku/bin/serial | mobile_scan_events.raw_value | fnsku | refused | `X004N2YG9N` | X004N2YG9N | **YES** |
| `X004N72NTX` | house-sku/bin/serial | mobile_scan_events.raw_value | fnsku | refused | `X004N72NTX` | X004N72NTX | **YES** |
| `X004W9BC4T` | house-sku/bin/serial | mobile_scan_events.raw_value | fnsku | refused | `X004W9BC4T` | X004W9BC4T | **YES** |
| `X004ZRDHMN` | house-sku/bin/serial | mobile_scan_events.raw_value | fnsku | refused | `X004ZRDHMN` | X004ZRDHMN | **YES** |
| `X0057LB6BZ` | house-sku/bin/serial | mobile_scan_events.raw_value | fnsku | refused | `X0057LB6BZ` | X0057LB6BZ | **YES** |
| `X005BHURXX` | house-sku/bin/serial | mobile_scan_events.raw_value | fnsku | refused | `X005BHURXX` | X005BHURXX | **YES** |
| `X00TEST000` | house-sku/bin/serial | mobile_scan_events.raw_value | fnsku | refused | `X00TEST000` | X00TEST000 | **YES** |
| `a0101101` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `A0101101` | a0101101 | **YES** |
| `accoustimass` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `ACCOUSTIMASS` | accoustimass | **YES** |
| `acoustimas` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `ACOUSTIMAS` | acoustimas | **YES** |
| `acoustimass` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `ACOUSTIMASS` | acoustimass | **YES** |
| `bass module 700` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `BASSMODULE700` | bass module 700 | **YES** |
| `beatles` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `BEATLES` | beatles | **YES** |
| `bookshelf speakers grey` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `BOOKSHELFSPEAKERSGREY` | bookshelf speakers grey | **YES** |
| `bose` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `BOSE` | bose | **YES** |
| `bose 700` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `BOSE700` | bose 700 | **YES** |
| `bose 700 used` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `BOSE700USED` | bose 700 used | **YES** |
| `bose sondlink` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `BOSESONDLINK` | bose sondlink | **YES** |
| `bose speaker blue` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `BOSESPEAKERBLUE` | bose speaker blue | **YES** |
| `bose wave music sytem` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `BOSEWAVEMUSICSYTEM` | bose wave music sytem | **YES** |
| `bsoe` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `BSOE` | bsoe | **YES** |
| `cinemat` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `CINEMAT` | cinemat | **YES** |
| `cinemate` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `CINEMATE` | cinemate | **YES** |
| `cinemate home theatre` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `CINEMATEHOMETHEATRE` | cinemate home theatre | **YES** |
| `definitive` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `DEFINITIVE` | definitive | **YES** |
| `guitar` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `GUITAR` | guitar | **YES** |
| `guitar hero` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `GUITARHERO` | guitar hero | **YES** |
| `guitar hero drums` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `GUITARHERODRUMS` | guitar hero drums | **YES** |
| `guitr hero` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `GUITRHERO` | guitr hero | **YES** |
| `hqrp` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `HQRP` | hqrp | **YES** |
| `jbl` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `JBL` | jbl | **YES** |
| `jbl flip` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `JBLFLIP` | jbl flip | **YES** |
| `motorola` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `MOTOROLA` | motorola | **YES** |
| `pedestal platinum` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `PEDESTALPLATINUM` | pedestal platinum | **YES** |
| `plantronics` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `PLANTRONICS` | plantronics | **YES** |
| `rk1-1` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `RK11` | rk1-1 | **YES** |
| `rock band` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `ROCKBAND` | rock band | **YES** |
| `rockband` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `ROCKBAND` | rockband | **YES** |
| `sony` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `SONY` | sony | **YES** |
| `sound touch` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `SOUNDTOUCH` | sound touch | **YES** |
| `sounddock` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `SOUNDDOCK` | sounddock | **YES** |
| `sounddok` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `SOUNDDOK` | sounddok | **YES** |
| `soundlink` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `SOUNDLINK` | soundlink | **YES** |
| `soundlink mini` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `SOUNDLINKMINI` | soundlink mini | **YES** |
| `soundlnik` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `SOUNDLNIK` | soundlnik | **YES** |
| `soundtouch` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `SOUNDTOUCH` | soundtouch | **YES** |
| `wave radio` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `WAVERADIO` | wave radio | **YES** |
| `wave radoi` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `WAVERADOI` | wave radoi | **YES** |
| `xbox` | house-sku/bin/serial | mobile_scan_events.raw_value | bin | refused | `XBOX` | xbox | **YES** |
| `000277001` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `000277001` | 00277001 | **YES** |
| `0053` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `0053` | 0053 | **YES** |
| `007` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `007` | 007 | **YES** |
| `0075` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `0075` | 0075 | **YES** |
| `010200000000395521070207992620729AE` | house-sku/bin/serial | receiving_scans.tracking_number | serial-unit | refused | `010200000000395521070207992620729AE` | 92620729 | **YES** |
| `0102000000018942210576A` | house-sku/bin/serial | receiving_scans.tracking_number | serial-unit | refused | `0102000000018942210576A` | 42210576 | **YES** |
| `0145` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `0145` | 0145 | **YES** |
| `0180` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `0180` | 0180 | **YES** |
| `019158932950473AC` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `019158932950473AC` | 32950473 | **YES** |
| `024644961230166AC` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `024644961230166AC` | 61230166 | **YES** |
| `0320` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `0320` | 0320 | **YES** |
| `033975C43360444AC` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `033975C43360444AC` | 43360444 | **YES** |
| `038736z62581805ac` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `038736Z62581805AC` | 62581805 | **YES** |
| `039523F10590020AE` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `039523F10590020AE` | 10590020 | **YES** |
| `041793993070155ac` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `041793993070155AC` | 93070155 | **YES** |
| `044417C82965434AC` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `044417C82965434AC` | 82965434 | **YES** |
| `0474` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `0474` | 0474 | **YES** |
| `055419932811567AE` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `055419932811567AE` | 32811567 | **YES** |
| `056608F12080013AE` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `056608F12080013AE` | 12080013 | **YES** |
| `0670` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `0670` | 0670 | **YES** |
| `070214963070261AE` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `070214963070261AE` | 63070261 | **YES** |
| `0725181870133` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `0725181870133` | 81870133 | **YES** |
| `1025489131001` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `1025489131001` | 89131001 | **YES** |
| `1083` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `1083` | 1083 | **YES** |
| `111-0949986-0104234` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `11109499860104234` | 60104234 | **YES** |
| `11124560724717854` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `11124560724717854` | 24717854 | **YES** |
| `112-7607612-2281846` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `11276076122281846` | 22281846 | **YES** |
| `11250861310872236` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `11250861310872236` | 10872236 | **YES** |
| `11347254119783457` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `11347254119783457` | 19783457 | **YES** |
| `11497960854117836` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `11497960854117836` | 54117836 | **YES** |
| `1178` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `1178` | 1178 | **YES** |
| `11ZJ22B100333113256` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `11ZJ22B100333113256` | 33113256 | **YES** |
| `1496` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `1496` | 1496 | **YES** |
| `1544` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `1544` | 1544 | **YES** |
| `1788` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `1788` | 1788 | **YES** |
| `1897` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `1897` | 1897 | **YES** |
| `1999` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `1999` | 1999 | **YES** |
| `1R096K99010885092` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `1R096K99010885092` | 10885092 | **YES** |
| `2012` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `2012` | 2012 | **YES** |
| `212121` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `212121` | 212121 | **YES** |
| `21330258` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `21330258` | 21330258 | **YES** |
| `21899814` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `21899814` | 21899814 | **YES** |
| `24493395412` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `24493395412` | 93395412 | **YES** |
| `260075437` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `260075437` | 60075437 | **YES** |
| `2685` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `2685` | 2685 | **YES** |
| `2704` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `2704` | 2704 | **YES** |
| `2850` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `2850` | 2850 | **YES** |
| `2LUS92647+61000001` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `2LUS9264761000001` | 61000001 | **YES** |
| `30BOSEWAVEIIIIVCDPLAYERASSEMBLIES` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `30BOSEWAVEIIIIVCDPLAYERASSEMBLIES` | 30BOSEWAVEIIIIVCDPLAYERASSEMBLIES | **YES** |
| `3136` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `3136` | 3136 | **YES** |
| `32` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `32` | 32 | **YES** |
| `3248` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `3248` | 3248 | **YES** |
| `337B0324092095` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `337B0324092095` | 24092095 | **YES** |
| `3739` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `3739` | 3739 | **YES** |
| `3768` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `3768` | 3768 | **YES** |
| `42` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `42` | 42 | **YES** |
| `4324` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `4324` | 4324 | **YES** |
| `46236` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `46236` | 46236 | **YES** |
| `4910` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `4910` | 4910 | **YES** |
| `5270` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `5270` | 5270 | **YES** |
| `5287` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `5287` | 5287 | **YES** |
| `54881352` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `54881352` | 54881352 | **YES** |
| `5597` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `5597` | 5597 | **YES** |
| `579` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `579` | 579 | **YES** |
| `5846` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `5846` | 5846 | **YES** |
| `5909` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `5909` | 5909 | **YES** |
| `61792494` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `61792494` | 61792494 | **YES** |
| `62175801` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `62175801` | 62175801 | **YES** |
| `62326226` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `62326226` | 62326226 | **YES** |
| `62453197` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `62453197` | 62453197 | **YES** |
| `6276` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `6276` | 6276 | **YES** |
| `63257466` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `63257466` | 63257466 | **YES** |
| `63325832` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `63325832` | 63325832 | **YES** |
| `63536065` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `63536065` | 63536065 | **YES** |
| `63681149` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `63681149` | 63681149 | **YES** |
| `63738368` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `63738368` | 63738368 | **YES** |
| `63839862` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `63839862` | 63839862 | **YES** |
| `63932057` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `63932057` | 63932057 | **YES** |
| `64254627` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `64254627` | 64254627 | **YES** |
| `64498155` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `64498155` | 64498155 | **YES** |
| `6451` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `6451` | 6451 | **YES** |
| `64956173` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `64956173` | 64956173 | **YES** |
| `6524` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `6524` | 6524 | **YES** |
| `6610` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `6610` | 6610 | **YES** |
| `6693` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `6693` | 6693 | **YES** |
| `6744` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `6744` | 6744 | **YES** |
| `6814` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `6814` | 6814 | **YES** |
| `6913` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `6913` | 6913 | **YES** |
| `6992` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `6992` | 6992 | **YES** |
| `7124` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `7124` | 7124 | **YES** |
| `7198` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `7198` | 7198 | **YES** |
| `7209702243242` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `7209702243242` | 02243242 | **YES** |
| `7233` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `7233` | 7233 | **YES** |
| `7250` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `7250` | 7250 | **YES** |
| `7250757027025` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `7250757027025` | 57027025 | **YES** |
| `737EC27D2883250D0` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `737EC27D2883250D0` | 28832500 | **YES** |
| `7404` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `7404` | 7404 | **YES** |
| `7494` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `7494` | 7494 | **YES** |
| `7820` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `7820` | 7820 | **YES** |
| `7924` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `7924` | 7924 | **YES** |
| `7933` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `7933` | 7933 | **YES** |
| `8143` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `8143` | 8143 | **YES** |
| `827357863` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `827357863` | 27357863 | **YES** |
| `8367` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `8367` | 8367 | **YES** |
| `8557` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `8557` | 8557 | **YES** |
| `8687` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `8687` | 8687 | **YES** |
| `876465654538AND87665632739` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `876465654538AND87665632739` | 65632739 | **YES** |
| `8831` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `8831` | 8831 | **YES** |
| `8871` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `8871` | 8871 | **YES** |
| `8884` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `8884` | 8884 | **YES** |
| `8942` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `8942` | 8942 | **YES** |
| `8M579577CN275753Y` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `8M579577CN275753Y` | 77275753 | **YES** |
| `9009` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `9009` | 9009 | **YES** |
| `9414` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `9414` | 9414 | **YES** |
| `9450` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `9450` | 9450 | **YES** |
| `9503` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `9503` | 9503 | **YES** |
| `9513` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `9513` | 9513 | **YES** |
| `9566` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `9566` | 9566 | **YES** |
| `9604` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `9604` | 9604 | **YES** |
| `963200196068053120040038030215591196220019000021047990003803790620401ZR096K99027766715` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `9632001960680531200400380302155911962200` | 27766715 | **YES** |
| `9703` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `9703` | 9703 | **YES** |
| `980` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `980` | 980 | **YES** |
| `9811951` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `9811951` | 9811951 | **YES** |
| `9847` | house-sku/bin/serial | receiving_scans.tracking_number | sku | refused | `9847` | 9847 | **YES** |
| `AG` | house-sku/bin/serial | receiving_scans.tracking_number | bin | refused | `AG` | AG | **YES** |
| `D23xFVY0RRMA` | house-sku/bin/serial | receiving_scans.tracking_number | bin | refused | `D23XFVY0RRMA` | D23xFVY0RRMA | **YES** |
| `DTc0tfYrRRMA` | house-sku/bin/serial | receiving_scans.tracking_number | bin | refused | `DTC0TFYRRRMA` | DTc0tfYrRRMA | **YES** |
| `DXXC0BLVRRMA` | house-sku/bin/serial | receiving_scans.tracking_number | bin | refused | `DXXC0BLVRRMA` | DXXC0BLVRRMA | **YES** |
| `DpYtF1YNRRMA` | house-sku/bin/serial | receiving_scans.tracking_number | bin | refused | `DPYTF1YNRRMA` | DpYtF1YNRRMA | **YES** |
| `Dvbzv8YzRRMA` | house-sku/bin/serial | receiving_scans.tracking_number | bin | refused | `DVBZV8YZRRMA` | Dvbzv8YzRRMA | **YES** |
| `GO` | house-sku/bin/serial | receiving_scans.tracking_number | bin | refused | `GO` | GO | **YES** |
| `LCPUVU321` | house-sku/bin/serial | receiving_scans.tracking_number | bin | refused | `LCPUVU321` | LCPUVU321 | **YES** |
| `M420926479212490416420900004366` | house-sku/bin/serial | receiving_scans.tracking_number | bin | refused | `M420926479212490416420900004366` | 00004366 | **YES** |
| `R-50127` | house-sku/bin/serial | receiving_scans.tracking_number | receiving | carton | `R50127` | R-50127 | no |
| `R-6666` | house-sku/bin/serial | receiving_scans.tracking_number | receiving | carton | `R6666` | R-6666 | no |
| `R-7278` | house-sku/bin/serial | receiving_scans.tracking_number | receiving | carton | `R7278` | R-7278 | no |
| `R-9496` | house-sku/bin/serial | receiving_scans.tracking_number | receiving | carton | `R9496` | R-9496 | no |
| `SD0RJTTCWR001V` | house-sku/bin/serial | receiving_scans.tracking_number | bin | refused | `SD0RJTTCWR001V` | SD0RJTTCWR001V | **YES** |
| `SDD6YZDTTR001V` | house-sku/bin/serial | receiving_scans.tracking_number | bin | refused | `SDD6YZDTTR001V` | SDD6YZDTTR001V | **YES** |
| `SDMRGW1V4R001V` | house-sku/bin/serial | receiving_scans.tracking_number | bin | refused | `SDMRGW1V4R001V` | SDMRGW1V4R001V | **YES** |
| `SDSNL9JW2R001V` | house-sku/bin/serial | receiving_scans.tracking_number | bin | refused | `SDSNL9JW2R001V` | SDSNL9JW2R001V | **YES** |
| `SOUNDLINKMINIII` | house-sku/bin/serial | receiving_scans.tracking_number | bin | refused | `SOUNDLINKMINIII` | SOUNDLINKMINIII | **YES** |
| `SP4RBJSR00001V` | house-sku/bin/serial | receiving_scans.tracking_number | bin | refused | `SP4RBJSR00001V` | SP4RBJSR00001V | **YES** |
| `SP7V1FHZV8001V` | house-sku/bin/serial | receiving_scans.tracking_number | bin | refused | `SP7V1FHZV8001V` | SP7V1FHZV8001V | **YES** |
| `SPNK5ZQJR5J` | house-sku/bin/serial | receiving_scans.tracking_number | bin | refused | `SPNK5ZQJR5J` | SPNK5ZQJR5J | **YES** |
| `SPQL69P8GW001V` | house-sku/bin/serial | receiving_scans.tracking_number | bin | refused | `SPQL69P8GW001V` | SPQL69P8GW001V | **YES** |
| `SPV2MZGXWG001V` | house-sku/bin/serial | receiving_scans.tracking_number | bin | refused | `SPV2MZGXWG001V` | SPV2MZGXWG001V | **YES** |
| `SPXQGDJSS8001V` | house-sku/bin/serial | receiving_scans.tracking_number | bin | refused | `SPXQGDJSS8001V` | SPXQGDJSS8001V | **YES** |
| `SPXSNA039708475305` | house-sku/bin/serial | receiving_scans.tracking_number | bin | refused | `SPXSNA039708475305` | 08475305 | **YES** |
| `YES` | house-sku/bin/serial | receiving_scans.tracking_number | bin | refused | `YES` | YES | **YES** |
| `ZA8335G0316469375` | house-sku/bin/serial | receiving_scans.tracking_number | bin | refused | `ZA8335G0316469375` | 16469375 | **YES** |
| `r-12902` | house-sku/bin/serial | receiving_scans.tracking_number | receiving | carton | `R12902` | r-12902 | no |
| `r-45624` | house-sku/bin/serial | receiving_scans.tracking_number | receiving | carton | `R45624` | r-45624 | no |
| `321SERIESII` | house-sku/bin/serial | scan_triage_records.raw_value | sku | refused | `321SERIESII` | 321SERIESII | **YES** |
| `069234P81564761AE` | house-sku/bin/serial | shipping_tracking_numbers.tracking_number_raw | sku | refused | `069234P81564761AE` | 81564761 | **YES** |
| `078182t41342181a2` | house-sku/bin/serial | shipping_tracking_numbers.tracking_number_raw | sku | refused | `078182T41342181A2` | 13421812 | **YES** |
| `1071-B:A05` | house-sku/bin/serial | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1071BA05` | 1071-B:A05 | **YES** |
| `1103-N:A08` | house-sku/bin/serial | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1103NA08` | 1103-N:A08 | **YES** |
| `111-4295219-6532202` | house-sku/bin/serial | shipping_tracking_numbers.tracking_number_raw | sku | refused | `11142952196532202` | 96532202 | **YES** |
| `11148353115454640` | house-sku/bin/serial | shipping_tracking_numbers.tracking_number_raw | sku | refused | `11148353115454640` | 15454640 | **YES** |
| `11212108907058601` | house-sku/bin/serial | shipping_tracking_numbers.tracking_number_raw | sku | refused | `11212108907058601` | 07058601 | **YES** |
| `113-3289934-8205045` | house-sku/bin/serial | shipping_tracking_numbers.tracking_number_raw | sku | refused | `11332899348205045` | 48205045 | **YES** |
| `11472329637419433` | house-sku/bin/serial | shipping_tracking_numbers.tracking_number_raw | sku | refused | `11472329637419433` | 37419433 | **YES** |
| `1279-B:A34` | house-sku/bin/serial | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1279BA34` | 1279-B:A34 | **YES** |
| `1894-B:A22` | house-sku/bin/serial | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1894BA22` | 1894-B:A22 | **YES** |
| `21Z40X3340300653447` | house-sku/bin/serial | shipping_tracking_numbers.tracking_number_raw | sku | refused | `21Z40X3340300653447` | 00653447 | **YES** |
| `2lus926473603+48000001` | house-sku/bin/serial | shipping_tracking_numbers.tracking_number_raw | sku | refused | `2LUS92647360348000001` | 48000001 | **YES** |
| `500` | house-sku/bin/serial | shipping_tracking_numbers.tracking_number_raw | sku | refused | `500` | 500 | **YES** |
| `65152631` | house-sku/bin/serial | shipping_tracking_numbers.tracking_number_raw | sku | refused | `65152631` | 65152631 | **YES** |
| `8768 8563 5720` | house-sku/bin/serial | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:FedEx | tracking:FedEx | `876885635720` | 85635720 | no |
| `921849028494 0701565684` | house-sku/bin/serial | shipping_tracking_numbers.tracking_number_raw | carrier-tracking:USPS | tracking:USPS | `9218490284940701565684` | 01565684 | no |
| `92350586` | house-sku/bin/serial | shipping_tracking_numbers.tracking_number_raw | sku | refused | `92350586` | 92350586 | **YES** |
| `DK8ZYWLMRRMA` | house-sku/bin/serial | shipping_tracking_numbers.tracking_number_raw | bin | refused | `DK8ZYWLMRRMA` | DK8ZYWLMRRMA | **YES** |
| `LX08869279IL` | house-sku/bin/serial | shipping_tracking_numbers.tracking_number_raw | bin | refused | `LX08869279IL` | 08869279 | **YES** |
| `PICKUPORDER` | house-sku/bin/serial | shipping_tracking_numbers.tracking_number_raw | bin | refused | `PICKUPORDER` | PICKUPORDER | **YES** |
| `SD9wnKyG9R_001_v` | house-sku/bin/serial | shipping_tracking_numbers.tracking_number_raw | bin | refused | `SD9WNKYG9R001V` | SD9wnKyG9R_001_v | **YES** |
| `SDPdWGbC5R_001_v` | house-sku/bin/serial | shipping_tracking_numbers.tracking_number_raw | bin | refused | `SDPDWGBC5R001V` | SDPdWGbC5R_001_v | **YES** |
| `SDS8Pt6fvR_001_v` | house-sku/bin/serial | shipping_tracking_numbers.tracking_number_raw | bin | refused | `SDS8PT6FVR001V` | SDS8Pt6fvR_001_v | **YES** |
| `SDSD6GMFYR001V` | house-sku/bin/serial | shipping_tracking_numbers.tracking_number_raw | bin | refused | `SDSD6GMFYR001V` | SDSD6GMFYR001V | **YES** |
| `SDdZkm1CRR_001_v` | house-sku/bin/serial | shipping_tracking_numbers.tracking_number_raw | bin | refused | `SDDZKM1CRR001V` | SDdZkm1CRR_001_v | **YES** |
| `SPBD67DGXP001V` | house-sku/bin/serial | shipping_tracking_numbers.tracking_number_raw | bin | refused | `SPBD67DGXP001V` | SPBD67DGXP001V | **YES** |
| `T3T74N4T28` | house-sku/bin/serial | shipping_tracking_numbers.tracking_number_raw | bin | refused | `T3T74N4T28` | T3T74N4T28 | **YES** |
| `X004ZURCO9` | house-sku/bin/serial | shipping_tracking_numbers.tracking_number_raw | fnsku | refused | `X004ZURCO9` | X004ZURCO9 | **YES** |
| `spV4F0PmXX_001_V` | house-sku/bin/serial | shipping_tracking_numbers.tracking_number_raw | bin | refused | `SPV4F0PMXX001V` | spV4F0PmXX_001_V | **YES** |
| `024644911080086AC` | house-sku/bin/serial | station_scan_sessions.tracking_raw | sku | refused | `024644911080086AC` | 11080086 | **YES** |
| `057270C23460048AE` | house-sku/bin/serial | station_scan_sessions.tracking_raw | sku | refused | `057270C23460048AE` | 23460048 | **YES** |
| `070210993460329AE` | house-sku/bin/serial | station_scan_sessions.tracking_raw | sku | refused | `070210993460329AE` | 93460329 | **YES** |
| `084602J51140095AE` | house-sku/bin/serial | station_scan_sessions.tracking_raw | sku | refused | `084602J51140095AE` | 51140095 | **YES** |
| `1012A` | house-sku/bin/serial | station_scan_sessions.tracking_raw | sku | refused | `1012A` | 1012A | **YES** |
| `151` | house-sku/bin/serial | station_scan_sessions.tracking_raw | sku | refused | `151` | 151 | **YES** |
| `2590` | house-sku/bin/serial | station_scan_sessions.tracking_raw | sku | refused | `2590` | 2590 | **YES** |
| `5314` | house-sku/bin/serial | station_scan_sessions.tracking_raw | sku | refused | `5314` | 5314 | **YES** |
| `580206BCAC` | house-sku/bin/serial | station_scan_sessions.tracking_raw | sku | refused | `580206BCAC` | 580206BCAC | **YES** |
| `70009BC` | house-sku/bin/serial | station_scan_sessions.tracking_raw | sku | refused | `70009BC` | 70009BC | **YES** |
| `8379` | house-sku/bin/serial | station_scan_sessions.tracking_raw | sku | refused | `8379` | 8379 | **YES** |
| `B001BNFOYW` | house-sku/bin/serial | station_scan_sessions.tracking_raw | bin | refused | `B001BNFOYW` | B001BNFOYW | **YES** |
| `BNM` | house-sku/bin/serial | station_scan_sessions.tracking_raw | bin | refused | `BNM` | BNM | **YES** |
| `C4206013920809434608106244376360727` | house-sku/bin/serial | station_scan_sessions.tracking_raw | bin | refused | `C4206013920809434608106244376360727` | 76360727 | **YES** |
| `SOUNDLINKMINI` | house-sku/bin/serial | station_scan_sessions.tracking_raw | bin | refused | `SOUNDLINKMINI` | SOUNDLINKMINI | **YES** |
| `X004DBJMZH` | house-sku/bin/serial | station_scan_sessions.tracking_raw | fnsku | refused | `X004DBJMZH` | X004DBJMZH | **YES** |
| `X0090UUMR` | house-sku/bin/serial | station_scan_sessions.tracking_raw | bin | refused | `X0090UUMR` | X0090UUMR | **YES** |
| `0259233` | house-sku/bin/serial | tracking_exceptions.tracking_number | sku | refused | `0259233` | 0259233 | **YES** |
| `2LUS926473603+48000001` | house-sku/bin/serial | tracking_exceptions.tracking_number | sku | refused | `2LUS92647360348000001` | 48000001 | **YES** |
| `4041` | house-sku/bin/serial | tracking_exceptions.tracking_number | sku | refused | `4041` | 4041 | **YES** |
| `6284` | house-sku/bin/serial | tracking_exceptions.tracking_number | sku | refused | `6284` | 6284 | **YES** |
| `9395` | house-sku/bin/serial | tracking_exceptions.tracking_number | sku | refused | `9395` | 9395 | **YES** |
| `MB` | house-sku/bin/serial | tracking_exceptions.tracking_number | bin | refused | `MB` | MB | **YES** |
| `R-4163` | house-sku/bin/serial | tracking_exceptions.tracking_number | receiving | carton | `R4163` | R-4163 | no |
| `R6936` | house-sku/bin/serial | tracking_exceptions.tracking_number | bin | refused | `R6936` | R6936 | **YES** |
| `RC` | house-sku/bin/serial | tracking_exceptions.tracking_number | bin | refused | `RC` | RC | **YES** |
| `RC18T27` | house-sku/bin/serial | tracking_exceptions.tracking_number | bin | refused | `RC18T27` | RC18T27 | **YES** |
| `v` | house-sku/bin/serial | tracking_exceptions.tracking_number | bin | refused | `V` | v | **YES** |

#### Noise rows refused (complete; test fixtures listed in corpus json only, 485 rows)

| value | carrier guess | source | routeScan kind | arrivalScanIntent | normalised | last-8 | refused? |
|---|---|---|---|---|---|---|---|
| `1Z035CX1YW02917197⏎113-1528397-8163447⏎00016-GR` | multiline-packslip | mobile_scan_events.raw_value | sku | refused | `1Z035CX1YW029171971131528397816344700016` | 44700016 | **YES** |
| `1ZJ22B100302248437⏎113-7796771-5871435⏎00179` | multiline-packslip | mobile_scan_events.raw_value | sku | refused | `1ZJ22B1003022484371137796771587143500179` | 43500179 | **YES** |
| `1ZJ22B100332986379⏎111-6425553-1385804⏎00220-P-2-BK` | multiline-packslip | mobile_scan_events.raw_value | sku | refused | `1ZJ22B1003329863791116425553138580400220` | 04002202 | **YES** |
| `1ZJ22B104222265576⏎113-4638555-9983448⏎00096` | multiline-packslip | mobile_scan_events.raw_value | sku | refused | `1ZJ22B1042222655761134638555998344800096` | 44800096 | **YES** |
| `1ZJ22B104223246022⏎113-5992337-9193006⏎00090` | multiline-packslip | mobile_scan_events.raw_value | sku | refused | `1ZJ22B1042232460221135992337919300600090` | 00600090 | **YES** |
| `381986437846⏎114-7973638-0676240⏎CF-PACK-PRINT-E2E` | multiline-packslip | mobile_scan_events.raw_value | sku | refused | `38198643784611479736380676240CFPACKPRINT` | 06762402 | **YES** |
| `382449352440⏎111-0704153-8443448⏎01181-1` | multiline-packslip | mobile_scan_events.raw_value | sku | refused | `38244935244011107041538443448011811` | 48011811 | **YES** |
| `382895359158⏎113-5297422-4082609⏎00045` | multiline-packslip | mobile_scan_events.raw_value | sku | refused | `3828953591581135297422408260900045` | 60900045 | **YES** |
| `383277445486⏎112-6215202-3266635⏎00325-PS` | multiline-packslip | mobile_scan_events.raw_value | sku | refused | `3832774454861126215202326663500325PS` | 63500325 | **YES** |
| `9300110990513422004124⏎111-5433948-4837052⏎00060` | multiline-packslip | mobile_scan_events.raw_value | sku | refused | `9300110990513422004124111543394848370520` | 05200060 | **YES** |
| `9300110990513511427599⏎112-1855306-5969038⏎00925` | multiline-packslip | mobile_scan_events.raw_value | sku | refused | `9300110990513511427599112185530659690380` | 03800925 | **YES** |
| `9300110990513556425161⏎113-3286985-3292220⏎00042` | multiline-packslip | mobile_scan_events.raw_value | sku | refused | `9300110990513556425161113328698532922200` | 22000042 | **YES** |
| `9302110990150180656509⏎111-6049232-0683453⏎00282` | multiline-packslip | mobile_scan_events.raw_value | sku | refused | `9302110990150180656509111604923206834530` | 45300282 | **YES** |
| `9334610990150164540910⏎113-8112002-2640258⏎00140` | multiline-packslip | mobile_scan_events.raw_value | sku | refused | `9334610990150164540910113811200226402580` | 25800140 | **YES** |
| `9334610990370285103904⏎112-4419700-2061006⏎00364-WY` | multiline-packslip | mobile_scan_events.raw_value | sku | refused | `9334610990370285103904112441970020610060` | 00600364 | **YES** |
| `9400108106244113263098⏎112-9931702-0789002⏎00115-BL` | multiline-packslip | mobile_scan_events.raw_value | sku | refused | `9400108106244113263098112993170207890020` | 00200115 | **YES** |
| `9400108106244475001697⏎112-6078118-4117021⏎00031` | multiline-packslip | mobile_scan_events.raw_value | sku | refused | `9400108106244475001697112607811841170210` | 02100031 | **YES** |
| `9400150106151123179938⏎112-0973917-9105001⏎00065` | multiline-packslip | mobile_scan_events.raw_value | sku | refused | `9400150106151123179938112097391791050010` | 00100065 | **YES** |
| `9434650106151066170858⏎113-5210964-2549007⏎00178` | multiline-packslip | mobile_scan_events.raw_value | sku | refused | `9434650106151066170858113521096425490070` | 00700178 | **YES** |
| `9434650206217243922777⏎114-9686344-3151424⏎00176` | multiline-packslip | mobile_scan_events.raw_value | sku | refused | `9434650206217243922777114968634431514240` | 42400176 | **YES** |
| `https://id.gs1.org/01/02000000000275` | multi-value-text | mobile_scan_events.raw_value | sku | refused | `HTTPSIDGS1ORG0102000000000275` | 00000275 | **YES** |
| `https://id.gs1.org/01/02000000000633` | multi-value-text | mobile_scan_events.raw_value | sku | refused | `HTTPSIDGS1ORG0102000000000633` | 00000633 | **YES** |
| `https://id.gs1.org/01/02000000001340` | multi-value-text | mobile_scan_events.raw_value | sku | refused | `HTTPSIDGS1ORG0102000000001340` | 00001340 | **YES** |
| `https://id.gs1.org/01/02000000001388` | multi-value-text | mobile_scan_events.raw_value | sku | refused | `HTTPSIDGS1ORG0102000000001388` | 00001388 | **YES** |
| `https://id.gs1.org/01/02000000001685` | multi-value-text | mobile_scan_events.raw_value | sku | refused | `HTTPSIDGS1ORG0102000000001685` | 00001685 | **YES** |
| `https://id.gs1.org/01/02000000001951` | multi-value-text | mobile_scan_events.raw_value | sku | refused | `HTTPSIDGS1ORG0102000000001951` | 00001951 | **YES** |
| `https://id.gs1.org/01/02000000002361` | multi-value-text | mobile_scan_events.raw_value | sku | refused | `HTTPSIDGS1ORG0102000000002361` | 00002361 | **YES** |
| `https://id.gs1.org/01/02000000002453` | multi-value-text | mobile_scan_events.raw_value | sku | refused | `HTTPSIDGS1ORG0102000000002453` | 00002453 | **YES** |
| `https://id.gs1.org/01/02000000002521` | multi-value-text | mobile_scan_events.raw_value | sku | refused | `HTTPSIDGS1ORG0102000000002521` | 00002521 | **YES** |
| `https://id.gs1.org/01/02000000003399` | multi-value-text | mobile_scan_events.raw_value | sku | refused | `HTTPSIDGS1ORG0102000000003399` | 00003399 | **YES** |
| `https://id.gs1.org/01/02000000003481` | multi-value-text | mobile_scan_events.raw_value | sku | refused | `HTTPSIDGS1ORG0102000000003481` | 00003481 | **YES** |
| `https://id.gs1.org/01/02000000003634` | multi-value-text | mobile_scan_events.raw_value | sku | refused | `HTTPSIDGS1ORG0102000000003634` | 00003634 | **YES** |
| `https://id.gs1.org/01/02000000003818` | multi-value-text | mobile_scan_events.raw_value | sku | refused | `HTTPSIDGS1ORG0102000000003818` | 00003818 | **YES** |
| `https://id.gs1.org/01/02000000004334` | multi-value-text | mobile_scan_events.raw_value | sku | refused | `HTTPSIDGS1ORG0102000000004334` | 00004334 | **YES** |
| `https://id.gs1.org/01/02000000004617` | multi-value-text | mobile_scan_events.raw_value | sku | refused | `HTTPSIDGS1ORG0102000000004617` | 00004617 | **YES** |
| `https://id.gs1.org/01/02000000005508` | multi-value-text | mobile_scan_events.raw_value | sku | refused | `HTTPSIDGS1ORG0102000000005508` | 00005508 | **YES** |
| `https://id.gs1.org/01/02000000006109` | multi-value-text | mobile_scan_events.raw_value | sku | refused | `HTTPSIDGS1ORG0102000000006109` | 00006109 | **YES** |
| `https://id.gs1.org/01/02000000008332` | multi-value-text | mobile_scan_events.raw_value | sku | refused | `HTTPSIDGS1ORG0102000000008332` | 00008332 | **YES** |
| `https://id.gs1.org/01/02000000008417` | multi-value-text | mobile_scan_events.raw_value | sku | refused | `HTTPSIDGS1ORG0102000000008417` | 00008417 | **YES** |
| `https://id.gs1.org/01/02000000008905` | multi-value-text | mobile_scan_events.raw_value | sku | refused | `HTTPSIDGS1ORG0102000000008905` | 00008905 | **YES** |
| `https://id.gs1.org/01/02000000008998` | multi-value-text | mobile_scan_events.raw_value | sku | refused | `HTTPSIDGS1ORG0102000000008998` | 00008998 | **YES** |
| `https://id.gs1.org/01/02000000009339` | multi-value-text | mobile_scan_events.raw_value | sku | refused | `HTTPSIDGS1ORG0102000000009339` | 00009339 | **YES** |
| `https://id.gs1.org/01/02000000010199` | multi-value-text | mobile_scan_events.raw_value | sku | refused | `HTTPSIDGS1ORG0102000000010199` | 00010199 | **YES** |
| `https://id.gs1.org/01/02000000010243` | multi-value-text | mobile_scan_events.raw_value | sku | refused | `HTTPSIDGS1ORG0102000000010243` | 00010243 | **YES** |
| `https://id.gs1.org/01/02000000010892` | multi-value-text | mobile_scan_events.raw_value | sku | refused | `HTTPSIDGS1ORG0102000000010892` | 00010892 | **YES** |
| `https://usav-orders-backend.vercel.app/m/signin` | multi-value-text | mobile_scan_events.raw_value | bin | refused | `HTTPSUSAVORDERSBACKENDVERCELAPPMSIGNIN` | https://usav-orders-backend.vercel.app/m/signin | **YES** |
| `https://usav.app.cycleforge.ai/m/r/1234` | multi-value-text | mobile_scan_events.raw_value | receiving | carton | `HTTPSUSAVAPPCYCLEFORGEAIMR1234` | https://usav.app.cycleforge.ai/m/r/1234 | no |
| `https://usavshop.com/01/02000000003788/21/00102-BK-2623-000212` | multi-value-text | mobile_scan_events.raw_value | serial-unit | refused | `HTTPSUSAVSHOPCOM01020000000037882100102B` | 23000212 | **YES** |
| `https://usavshop.com/01/02000000006376/21/00194-P-1-BK-2623-000002` | multi-value-text | mobile_scan_events.raw_value | serial-unit | refused | `HTTPSUSAVSHOPCOM01020000000063762100194P` | 23000002 | **YES** |
| `#9573` | multi-value-text | receiving_scans.tracking_number | sku | refused | `9573` | #9573 | **YES** |
| `1ZJ22B100320809798 + 1ZJ22B100328653807` | multi-value-text | receiving_scans.tracking_number | sku | refused | `1ZJ22B1003208097981ZJ22B100328653807` | 28653807 | **YES** |
| `HTTPSUSAVAPPCYCLEFORGEAIMR51096` | multi-value-text | receiving_scans.tracking_number | receiving | carton | `HTTPSUSAVAPPCYCLEFORGEAIMR51096` | HTTPSUSAVAPPCYCLEFORGEAIMR51096 | no |
| `https://www.ebay.com/itm/336547369490` | multi-value-text | receiving_scans.tracking_number | bin | refused | `HTTPSWWWEBAYCOMITM336547369490` | 47369490 | **YES** |
| `#TBA329431546276` | multi-value-text | shipping_tracking_numbers.tracking_number_raw | sku | refused | `TBA329431546276` | 31546276 | **YES** |
| `1Z68R0R00395212287 + 1Z68R0R00395212287` | multi-value-text | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1Z68R0R00395212287` | 95212287 | **YES** |
| `1ZJ22В100304470059 + 1ZJ22B100314713063` | multi-value-text | shipping_tracking_numbers.tracking_number_raw | sku | refused | `1ZJ221003044700591ZJ22B100314713063` | 14713063 | **YES** |
| `268569217 + 268180270 + 268488440` | multi-value-text | shipping_tracking_numbers.tracking_number_raw | sku | refused | `268569217268180270268488440` | 68488440 | **YES** |
| `381543907660 + 381543919549` | multi-value-text | shipping_tracking_numbers.tracking_number_raw | sku | refused | `381543907660381543919549` | 43919549 | **YES** |
| `399805552010 + 399805552822 + 399805551344` | multi-value-text | shipping_tracking_numbers.tracking_number_raw | sku | refused | `399805552010399805552822399805551344` | 05551344 | **YES** |
| `518451246200 + 522300969633` | multi-value-text | shipping_tracking_numbers.tracking_number_raw | sku | refused | `518451246200522300969633` | 00969633 | **YES** |
| `876465654538 and 87665632739` | multi-value-text | shipping_tracking_numbers.tracking_number_raw | sku | refused | `876465654538AND87665632739` | 65632739 | **YES** |
| `9.2346902673388e+25` | junk-sci-notation | shipping_tracking_numbers.tracking_number_raw | sku | refused | `92346902673388E25` | 67338825 | **YES** |
| `9.23469032499284e+21` | junk-sci-notation | shipping_tracking_numbers.tracking_number_raw | sku | refused | `923469032499284E21` | 49928421 | **YES** |
| `9.235990401713201e+21` | junk-sci-notation | shipping_tracking_numbers.tracking_number_raw | sku | refused | `9235990401713201E21` | 71320121 | **YES** |
| `9.334611043900001e+21` | junk-sci-notation | shipping_tracking_numbers.tracking_number_raw | sku | refused | `9334611043900001E21` | 90000121 | **YES** |
| `9.43460810624457e+21` | junk-sci-notation | shipping_tracking_numbers.tracking_number_raw | sku | refused | `943460810624457E21` | 62445721 | **YES** |
| `9.4346081062445e+21` | junk-sci-notation | shipping_tracking_numbers.tracking_number_raw | sku | refused | `94346081062445E21` | 06244521 | **YES** |
| `9.434608106245503e+21` | junk-sci-notation | shipping_tracking_numbers.tracking_number_raw | sku | refused | `9434608106245503E21` | 24550321 | **YES** |
| `9.534615430936238e+21` | junk-sci-notation | shipping_tracking_numbers.tracking_number_raw | sku | refused | `9534615430936238E21` | 93623821 | **YES** |
| `9.53611479296623e+21` | junk-sci-notation | shipping_tracking_numbers.tracking_number_raw | sku | refused | `953611479296623E21` | 29662321 | **YES** |
| `Clean Medium` | multi-value-text | shipping_tracking_numbers.tracking_number_raw | bin | refused | `CLEANMEDIUM` | Clean Medium | **YES** |
| `HTTPSUSAVAPPCYCLEFORGEAIMR50948` | multi-value-text | shipping_tracking_numbers.tracking_number_raw | receiving | carton | `HTTPSUSAVAPPCYCLEFORGEAIMR50948` | HTTPSUSAVAPPCYCLEFORGEAIMR50948 | no |
| `HTTPSWWWEBAYCOMITM306393912649` | multi-value-text | shipping_tracking_numbers.tracking_number_raw | bin | refused | `HTTPSWWWEBAYCOMITM306393912649` | 93912649 | **YES** |
| `Refunded` | multi-value-text | shipping_tracking_numbers.tracking_number_raw | bin | refused | `REFUNDED` | Refunded | **YES** |
| `Shipping` | multi-value-text | shipping_tracking_numbers.tracking_number_raw | bin | refused | `SHIPPING` | Shipping | **YES** |
| `JAMIE` | multi-value-text | tracking_exceptions.tracking_number | bin | refused | `JAMIE` | JAMIE | **YES** |
