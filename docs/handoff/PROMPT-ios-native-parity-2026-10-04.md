# PROMPT — iOS native app: fix scanning, port the /m information architecture, Unbox sort + search (2026-10-04)

Paste this whole file as the first message of a fresh session on **avion**, in
`/home/michaelgarisek/Projects/cycleforge-lanes/prod`. You are the
**integrator**. Read this file, then spawn the slices in §6 in ONE `task` batch
with the file ownership given. Run every check once at the end.

## 1. Operator rulings (binding, 2026-10-04)

1. The iOS app is a **native SwiftUI app** against production
   `https://app.cycleforge.ai`. No WKWebView and no dev server. Mac:
   `ssh prometheus`, `~/Projects/cycleforge-ios` (not git; back up with
   `Scripts/backup-to-avion.sh`).
2. **The web `/m/*` app stays fully working as the backup** for devices
   without the app. Every change in this run ships to BOTH: the web and the
   app, through one server contract.
3. **Same as web, natively rendered.** The app copies the `/m` information
   architecture exactly: the same screens, navigation, order of information,
   words, and header anatomy (app switcher top-left, title, scan button
   top-right). It is drawn with native SwiftUI controls, not a pixel copy of
   the HTML. When the web and the app disagree, the web's `src/lib` logic is
   the source of truth and the app is ported to match it, with parity
   fixtures generated from the web code.
4. The Scan switcher says **Inbound | Outbound**, not In | Out, on both the
   web and the app. Register both words in `VOCABULARY`
   (`src/lib/nav/route-tree.ts`); `ds.mjs vocabulary inbound` currently
   reports them as missing.
5. Unbox has a **Sort by** control with an exact list of options, plus a
   **search** that finds a package by product name (and tracking, order #,
   seller) when the list is long.

## 2. Operator bug report (ground truth; do not re-litigate)

On the iPhone Air, scanning a carrier tracking number with **Inbound**
showed "Not received · Nothing arrives under a product label. Scan the
carrier label on the box." Scanning it again showed "Already scanned — not
sent again." The package never reached the Unbox list, and there was no way to
open the tracking number just scanned.

### Root cause (reproduced on avion with the web's own router)
`routeScan` (`src/lib/barcode-routing.ts`) classifies several real
carrier-label barcodes as something else **before the server is asked**, and
`arrivalScanIntent` (`src/lib/scan/mobile-arrival-door.ts:68-95`) refuses
them locally. The app's port (`Sources/CycleForgeClient/BarcodeRoute.swift`)
copies that faithfully, so **the web has the same bug**:

| Scanned bytes | routeScan | Result at the door |
|---|---|---|
| `420900019361289711068322544977` (USPS IMpb: AI 420 + ZIP + tracking, one GS1-128 barcode) | `sku` | refused, "a product label" |
| `96119123456789012345678` (FedEx Ground 96… barcode) | `sku` | refused, "a product label" |
| `0012345678905`-style 13-digit carrier barcodes | `sku` | refused |
| `TBA123456789012` (Amazon Logistics) | `bin` | refused, "a bin label" |
| `9361289711068322544977`, `1Z…`, 12-digit FedEx | `carrier-tracking` | accepted |

Repro: `node_modules/.bin/tsx --tsconfig tsconfig.json` on a script that calls
`routeScan` and `arrivalScanIntent` for those values.

On the native screen, `TrackingLabelPicker` already suppresses a separate 420+ZIP
routing barcode. A USPS label whose one barcode carries `420`+ZIP+tracking still
reaches the router whole. The operator's identity rule already says
**tracking identity = the last 8 digits** (`shipping_tracking_numbers`
`idx_stn_norm_last8` / `idx_stn_raw_last8`; `scan-match-probe.ts` matches on
them). The client refuses before that server match can run.

The second message comes from the app's repeat gate
(`ScanStation.swift:218`, 6 s, mirroring `DEDUP_MS` in
`MobileCaptureWindow.tsx:19`). It also swallows a re-scan of a label that was
refused locally and never sent.

## 3. Same as web, or different? (decided: same)

Copy the web's IA exactly and render it natively. Why:
- **One mental model.** The same operator moves between the app and the web
  backup. Different screens, words or orders cost training and errors on the
  floor.
- **One source of truth.** Routing, vocabulary, verdict words and contracts
  live in `src/lib` and are already under the repo's guards (Routes,
  vocabulary, nav names, SKU identity). If the app ports them with parity
  fixtures generated from the web code, a web change turns the app's parity
  test red instead of drifting silently. That is the pattern T1–T4 already use
  (`Scripts/render-*.mts` writing fixtures from the real web functions).
- **Cheaper features.** Each new verb is designed once, on `/m` first per
  `docs/mobile-first/SURFACE_LAW.md`, then ported.
- **Native where it matters.** Camera, haptics, sound, Keychain, navigation
  stack gestures and safe areas stay native. Do not imitate WebKit-isms such
  as hover states or CSS scroll quirks.

## 4. Highest-ROI work, in order

**P0. Scan classifier (web lib + Swift port, one fix).**
- Recognise carrier envelopes before the product, bin or SKU arms of `routeScan`:
  - USPS AI 420 + ZIP5 / ZIP9 + tracking: strip to the tracking.
  - FedEx `96…` 22-digit and 34-digit barcodes: extract the embedded
    tracking the way `tracking-format.ts` / `scan-match-probe.ts` already
    normalise them.
  - Amazon `TBA…`.
  - Leading `0` / `700` envelopes.
- At the arrival door, any long numeric that isn't a confirmed house label
  goes to the server's resolver (preview-scan / lookup-po, which match last 8)
  instead of being refused locally. Refuse locally only for confirmed house
  labels (bin, line, unit, ticket, own carton).
- Regenerate the Swift parity fixture from the web `routeScan` over a corpus of
  REAL scanned values. Pull the corpus read-only from production scan logs
  (`/api/scan/resolve` rows, `shipping_tracking_numbers` raw vs norm pairs).
- Repeat gate: never gate a scan that was refused locally. For a gated
  repeat, re-show the previous result ("Same label · <previous result>")
  rather than a bare "not sent again".

**P0. The scanned package is always reachable.**
- The latest result is a tappable card: a known or arrived package opens Pair /
  the package record.
- A "Recent" list for this session shows tracking, result and time; each row
  is tappable. Port the web's arrival tape
  (`src/components/mobile/receiving/arrival-station-tape*`) to both surfaces.
- A refused row shows the exact bytes scanned, so a misread is visible.

**P1. Port the /m information architecture to the app.**
- **Header anatomy:**
  - Left: the app switcher (`MobileV2AppSwitcher.tsx`).
  - Middle: the title.
  - Top-right: the scan button (`MobileV2ScanCta.tsx`).
  - Detail screens use the detail top bar (`MobileV2DetailTopBar.tsx`).
- **Destinations:** take the destination list and grouping from
  `src/components/mobile/v2/mobile-v2-destinations.tsx` and the route tree
  `src/lib/nav/route-tree.ts`. Port only the destinations whose screens exist
  natively; no placeholder rows.
- **Scan header:** Inbound | Outbound plus View | Operate exactly as
  `MobileScanHeader.tsx`, renamed per ruling 4 on both surfaces.
- **Generate, don't hand-copy:** add a script in this repo that emits the
  app's vocabulary and destination labels as Swift constants, and run it in the
  app's parity tests.

**P1. Unbox: Sort by and search (server contract first, then both UIs).**
- **Route:** extend `GET /api/receiving/unbox-next` with `?sort=` and `?q=`
  in `src/lib/receiving/arrival-contract.ts` and `readUnboxQueue`
  (`src/lib/receiving/arrival-package.ts`; today `UNBOX_QUEUE_LIMIT = 200` and
  unplaced packages show for 14 days).
  - Search is server-side so a long queue still finds the package.
  - `q` matches product title through `resolveSkuIdentityTitle` /
    `SKU_CATALOG_JOIN_ON_SQL`, tracking (last 8 too), order # and seller.
- **Sort options (exact list):**
  - Urgent first (default)
  - Oldest first
  - Newest first
  - Location
  - Unfound first
- **UI:** the web `/m/unbox` (`MobileV2UnboxNext.tsx`) and the native
  `UnboxView` get the same control in the same place. Run
  `ds.mjs contract '<job>'` for placement on the web; the app copies the web
  placement.

**P2. Parity harness.**
Capture web `/m/scan`, `/m/r/[id]/place` and `/m/unbox` at 390×844 at
`http://localhost:3050` beside the native simulator renders of the same data,
side by side in one report. Do this once per change.

## 5. Facts to reuse (verified 2026-10-04)

- **Production:** runs `dpl_368FQQpbLnDhUGCDoFssfNYhbaj5`.
  - Deploy only from a clean staging copy of that deployment's exact files,
    plus the overlay. The mechanism and scripts are in `~/.cache/cf-deploy/`
    (`build_base.py`, which downloads the deployed files via the Vercel API and
    sha1-verifies them).
  - Preview first, then `vercel promote` when the preview is green.
  - Rollback: `vercel promote dpl_368FQQpbLnDhUGCDoFssfNYhbaj5`.
  - Never `vercel` from this worktree.
- **App layout:**
  - Packages: `Sources/CycleForgeClient` (API, payloads, ScanStation,
    DoorIntake, DockScanOut, PairStation, UnboxQueue, LabelPhotoUpload,
    BarcodeRoute) and `Sources/CycleForgeFloor` (CameraScanSession,
    TrackingLabelPicker, WedgeScanBuffer, OperatorFeedback, ScanTone,
    LabelPhoto*).
  - Screens: `App/Sources` (SignInView, HomeView, ScanView, PairView,
    UnboxView, LabelPhotoCapture).
  - Fixture renderers: `Scripts/render-*.mts`.
- **App checks:**
  - `swift test` (48 + 166 at handoff).
  - Simulator: `ruby App/project.rb && xcodebuild ... -destination
    'platform=iOS Simulator,id=AB3F9FB7-7421-4C22-BDBF-CB2653CDB044' test`.
  - Install on the Air through the GUI: `Scripts/device-run.sh` via
    `osascript` / Terminal. Signing over SSH fails.
  - Air UDID `00008150-00185D362612401C`, bundle `ai.cycleforge.app`.
- **Concurrency:** for parallel Swift work, use
  `swift test --scratch-path .build-<slice>` and `-derivedDataPath
  build/DD-<slice>`. Exactly one integration owner edits `HomeView`,
  `ScanView`, `project.rb`, `Package.swift`, `Info.plist`, README and HANDOFF,
  and installs on the Air.
- **Repo:**
  - Git is READ-ONLY.
  - Other sessions own `src/components/sidebar/**`, `src/lib/keyboard/**`,
    `src/lib/nav/**` (except adding the two VOCABULARY words; coordinate),
    and the typography tokens.
  - Dev origin is `http://localhost:3050` only.
  - Use `node_modules/.bin/eslint`, `node scripts/typecheck.mjs` and
    `node --import tsx --import ./scripts/register-server-only-shim.cjs --test`.
  - `pnpm verify:fast` currently has two typecheck errors from other sessions:
    `lookup-po/route.ts:824` and `mobile-v2-destinations.tsx:298`.

## 6. Slices (spawn in one batch)

| Slice | Owns | Delivers |
|---|---|---|
| **ScanClassifierWeb** | `src/lib/barcode-routing.ts`, `src/lib/scan/mobile-arrival-door.ts`, `src/lib/tracking-format.ts` (+tests) | P0 classifier fix. Tests built from a real-value corpus. Emits `web-route-parity.json` for the app. |
| **ScanClassifierApp** | `BarcodeRoute.swift`, `ScanStation.swift` repeat gate, `ScanView` latest-result card + Recent list (integration owner applies the `ScanView` edits) | P0 port, consuming ScanClassifierWeb's fixture. Tappable result and Recent list. |
| **WebScanTape** | `src/components/mobile/scan/*`, the arrival tape | Recent list, tappable rows, Inbound \| Outbound words on the web. |
| **UnboxServer** | `arrival-contract.ts`, `arrival-package.ts`, `unbox-next/route.ts` (+tests) | `sort` / `q` contract and SQL, last-8 match, unit tests. |
| **UnboxUI** | `MobileV2UnboxNext.tsx` + native `UnboxView` / `UnboxQueue` | Sort by + search on both surfaces, same placement. |
| **IAPort** (integration owner) | App header/navigation, `HomeView`, destinations, vocabulary codegen script | Header anatomy, Inbound \| Outbound, generated constants. Installs on the Air, writes docs, runs backup. |
| **DeployRunner** (after all web slices) | `~/.cache/cf-deploy` staging only | Overlay the web changes onto the `dpl_368F…` base. Preview, smoke, then promote. |

## 7. Acceptance (observable)

1. **Inbound scanning:** on the Air (operator signed in), scanning a USPS label
   (one 420+ZIP+tracking barcode), a FedEx Ground 96… label, a UPS 1Z label
   and an Amazon TBA label all log the package. Each one opens Pair and then
   appears in Unbox. The same four values give the same results on the web
   `/m/scan` (web proven at `localhost:3050`, app on the Air).
2. **Repeat scans:** a re-scan within 6 s re-shows the previous result. A
   locally refused value can be re-scanned.
3. **Reachability:** the latest result card and every Recent row open the
   package.
4. **Header and switcher:** Scan reads "Inbound | Outbound" on both surfaces.
   The app header matches `/m`: switcher left, title, scan button top-right.
5. **Unbox:** Sort by offers exactly Urgent first / Oldest first / Newest
   first / Location / Unfound first. Searching a product word finds the
   package on both surfaces, including in a queue longer than one screen.
6. **Checks:** `swift test` and simulator tests are green with counts. Web
   unit tests are green. `pnpm verify:fast` is green apart from the known
   errors in other sessions' files.
7. **Production:** the production deployment id is recorded with its rollback
   id. Side-by-side web/native screenshots are listed with paths that exist.
