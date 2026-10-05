# PROMPT — iOS shell + arrival pairing, finish in 2 hours with parallel subagents (2026-10-04)

> **2026-10-05 ruling:** locations (racks, shelves, bins, totes) are urgency-agnostic — a location
> label or record is identification only. The per-shelf arrival tier and the placement suggestion
> this prompt mentions are removed end to end; urgency lives on the package only.

Paste this whole file as the first message of a fresh session on **avion**, in
`/home/michaelgarisek/Projects/cycleforge-lanes/prod`. You are the
**integrator**. Spawn the four slices below in ONE `task` batch in the first 15
minutes, own the shared contract yourself, and run every check once at the end.
Do not re-plan the product; the operator decided it below.

> **Superseded 2026-10-04 (operator):** ruling 1 below is reversed. The iOS app
> is a fully native SwiftUI application against production
> (`https://app.cycleforge.ai`), built tier by tier — sign-in, Scan In | Out,
> Pair, Unbox, Label photo — never a WKWebView over the dev lane. The page↔app
> bridge (`src/lib/native-shell/`) is removed. The web interface (`/m/*` and
> desktop) stays fully working as the backup for devices without the app.
> Rulings 2–6 stand.

## Operator rulings (binding, 2026-10-04)

1. **The iOS app is a native shell that runs the exact `/m/*` web pages.** Same
   routes, same `?filters`; any `/m` or desktop link opens the same page in the
   app that it opens in Safari. Only hardware is native: camera lens, haptics
   (later: label photos, printing). The old native screens (Orders, Scan out,
   Put away, Pick, QA, native sign-in) are deleted — this is done.
2. **Build order:** (10) runs on the iPhone Air → (1) the right barcode from a
   label → (3) In | Out switch → (2) two-scan pairing → (4) label photo.
3. **Tracking identity = the last 8 digits.** A paste and a scan of one label
   disagree on envelopes (USPS `420`+ZIP, FedEx `96…`, a leading `0`/`700`) but
   never on the last 8. `shipping_tracking_numbers` already has
   `idx_stn_norm_last8` / `idx_stn_raw_last8` (0.04 ms lookups); measured
   1,138 of 1,248 last-8 collisions are the same package stored twice.
4. **Urgency:** the phone shows two states, Urgent / Not urgent. The four stored
   tiers stay underneath: Urgent writes `priority_tier = 0`, Not urgent writes
   `2`, a package reads urgent when its tier is 0 or 1. Urgency lives on the
   package, never the shelf.
5. **A package pairs to ANY active location with a barcode** (rack shelf
   `RK1-2`, bin, floor spot). A location never refuses a package and carries no
   urgency (2026-10-05 ruling above).
6. The operator audits and tests the flows himself. Do not build org urgency
   rules (automations) in this run — not in the approved order.

## State at handoff (verified unless marked)

**iOS app — Mac `ssh prometheus`, `~/Projects/cycleforge-ios`** (not a git repo;
pre-shell snapshot at avion `~/backups/cycleforge-ios-native-before-shell-2026-10-04.tar.gz`)
- `Package.swift` → one library `CycleForgeShell` + tests. `swift test`:
  **15 tests green** (bridge codec, tracking-label picker, link resolver).
  - `Sources/CycleForgeShell/BridgeMessage.swift` — page→app messages
    (`haptic`, `lens.start{rect,ground}`, `lens.rect`, `lens.torch`, `lens.stop`),
    app→page events as JS (`lens.decode`, `lens.state`).
  - `TrackingLabelPicker.swift` — picks the tracking code out of a multi-code
    frame; suppresses the `420`+ZIP routing code; retail UPC/EAN never outranks.
  - `ShellLink.swift` — `cycleforge://m/…` and known-host links re-homed onto
    the configured server, path + query + fragment kept.
- `App/Sources/`: `CycleForgeFloorApp.swift` (Debug registers
  `CFServerBaseURL=https://prod.michaelgarisek.com`, Release keeps production),
  `ShellViewController.swift` (transparent WKWebView over the native lens,
  `cfNative` handler, alerts/confirm/prompt panels, getUserMedia permission,
  external links to Safari, failure view + retry, Web Inspector in Debug),
  `NativeLens.swift` (AVFoundation behind the page's scanner box, ROI = visible
  box, near-focus, torch), `ServerConfiguration.swift`.
- `Info.plist`: `cycleforge` URL scheme, camera string, no ATS exception (the
  lane is HTTPS via Cloudflare). Entitlements file and keychain removed.
- `App/project.rb` regenerated for the shell. Hosted app tests on the iPhone
  Air simulator **7/7 green** (after moving the Debug lane URL from a
  registered `UserDefaults` default — process-wide, it leaked into the test
  suites — to `ServerConfiguration.resolve(bundled:)`). The shell is
  **installed and launched on the Air** (`device-run.sh` status 0); the lane
  log showed the phone's `/m` landing on `GET /signin` (the proxy serves
  `/m/signin` to the iPhone UA) seconds after launch.
- Signing over SSH fails (`errSecInternalComponent`, login keychain locked).
  Use `Scripts/device-run.sh` through the GUI session — it builds, installs,
  launches and writes `build/device-run.status`:
  ```sh
  ssh prometheus 'cd ~/Projects/cycleforge-ios && rm -f build/device-run.status && osascript -e "tell application \"Terminal\" to do script \"$HOME/Projects/cycleforge-ios/Scripts/device-run.sh; exit\"" && while [ ! -f build/device-run.status ]; do sleep 5; done; cat build/device-run.status; tail -5 build/device-run.log'
  ```

**Web (this repo, uncommitted, mine)**
- `src/lib/native-shell/bridge.ts` — `inNativeShell`, `postNative`,
  `onNativeEvent` (Zod-validated), `startNativeLens(video, …)`: makes the
  scanner box's ancestors transparent while the native lens runs (restored on
  stop), sends the box rect every frame it moves, ground colour = first opaque
  ancestor larger than the box.
- `src/hooks/useBarcodeScanner.ts` — inside the app every scan surface uses the
  native lens through the same cooldown/dedup gate (`acceptDecoded`); ZXing
  stays the browser path.
- `src/lib/scan-feedback/play.ts` — `vibrateScan` / `vibratePress` go to native
  haptics inside the app.
- `src/lib/receiving/scan-match-probe.ts` (+ test) — last-8 identity: an exact
  STN row with no carton no longer hides the box its last 8 digits name; the
  inbound pre-advice tier also matches by last 8; every lossy tier counts
  DISTINCT cartons. Unit tests 8/8 green; smoke against real data: both
  spellings of 6 duplicated labels resolve to the same carton.
- eslint + typecheck clean on these files. `pnpm verify:fast` NOT yet run.

**Lane:** `cycleforge-lane@prod` on `:3050`, also `https://prod.michaelgarisek.com`
(what the phone uses). The iPhone Air (UDID `00008150-00185D362612401C`) is on
Tailscale. Signing in on the phone needs the operator (no stored password).

## Contract (integrator owns; slices consume)

- Bridge: exactly the message/event names above; page side
  `src/lib/native-shell/bridge.ts`, app side `BridgeMessage.swift`. Changing
  one means changing both in the same slice.
- Arrival routes: `docs/handoff/data/arrival-contract-2026-10-04.md`. Copy it
  to `src/lib/receiving/arrival-contract.ts` FIRST (before spawning), dropping
  the org-rules section. Routes this run needs:
  - `GET /api/receiving/[id]/arrival` → `{ success, package: ArrivalPackage }`
  - `POST /api/receiving/[id]/arrival` `{ action: 'urgency', urgent: true|false|null, clientEventId }`
    and `{ action: 'place', scanned, clientEventId, surface? }` → `{ success, package }`
  - `GET /api/receiving/unbox-next` → `{ success, items: UnboxQueueItem[] }` (urgent first, oldest first)
  - Door intake stays `POST /api/receiving/lookup-po` behind the web's existing
    preview → intake sequence (`useArrivalStation.ts`); do NOT extract the
    1,650-line route this run.

## Slices — spawn all four in one batch

### A. `ShellDevice` — iOS shell on the Air (Mac only)
Files: everything under `~/Projects/cycleforge-ios` (edit with `write` to
`ssh://prometheus/…`; whole files). Steps: re-run `swift test` and the hosted
simulator tests; install via `Scripts/device-run.sh`; confirm the lane log
(`journalctl --user -u cycleforge-lane@prod`) shows requests with
`CycleForgeApp/1` in the user agent; deep link check with
`xcrun devicectl device process launch … --payload-url 'cycleforge://m/scan'`
(or equivalent); then rewrite `docs/handoff/HANDOFF-swiftui-app.md` "What the
app is today" + `App/README.md` for the shell; run `Scripts/backup-to-avion.sh`
last. Acceptance: app on the Air opens `/m/signin` (or `/m` when signed in),
links land on the same route + query, no native screens remain. If the phone
is locked (error 4016) or needs sign-in, report it and finish the rest.

### B. `ArrivalServer` — pairing routes (repo, server only)
Files: `src/app/api/receiving/[id]/arrival/route.ts` (new), `src/app/api/receiving/[id]/placement/route.ts`
(delete after C cuts over), `src/app/api/receiving/unbox-next/route.ts`,
`src/lib/receiving/arrival-package.ts`, its tests.
Change: package read (items via `resolveSkuIdentityTitle` / `SKU_CATALOG_JOIN_ON_SQL`,
platform label, order #, seller, door time, found = has lines or linked order,
current location from `receiving_triage.staging_location_id`); urgency action writes
`priority_tier` 0 / 2 / NULL + `recordAudit`; place action accepts any active
org location by barcode (`normalizeShelfCode` / rack-code parse), writes
`upsertReceivingTriage`, keeps the `RECEIVING_ARRIVAL_PLACED` ops event; delete
`checkShelfConfirm`'s refusal path; unbox-next adds `urgency`, `location` (any
location), `title`, `found`, and removes the shelf-tier override
(`readUnboxNext` `tier: shelfTier ?? resolved.tier`). Skills:
`.claude/skills/new-route`, `org-scope`, `domain-unit-test`. Acceptance:
unit tests for any-location placement + urgency precedence (operator > order >
derived) + unbox order; throwaway tsx smoke on 2–3 real receiving ids (read
only) printed in the report, then deleted. Message `agent://ArrivalWeb` when
routes are live on the lane.

### C. `ArrivalWeb` — /m screens (repo, UI only)
Files: `src/components/mobile/v2/receiving/*`, `src/app/m/(shell)/r/[id]/place/*`,
`src/app/m/(shell)/unbox/*`, `src/components/mobile/scan/MobileScanIdentify.tsx`,
`src/components/mobile/receiving/useArrivalStation.ts`,
`src/lib/receiving/arrival-placement-client.ts` (replace with a typed
`arrival-client.ts`), `src/queries/keys.ts`. First run
`node tools/design-mcp/ds.mjs contract '<job>'` per surface and obey its
placement; route/vocabulary words via `ds.mjs route` / `vocabulary` — never
invent a path or word ("package", not "carton", in copy).
- (3) **In | Out switch on `/m/scan`**: In = the arrival door loop, Out = the
  existing scan-out route the web already has (find it; do not build a second);
  remembered per device (localStorage). Placement per `ds_contract`.
- (2) **Pair screen `/m/r/[id]/place`**: every arrived/known package hands off
  here (drop the old shelf-configured gate in
  `useArrivalPlacementHandoff`); package card (tracking mono, Found/Unfound,
  platform, order #, seller, items wrap never truncate), two-state Urgent / Not
  urgent pre-filled with its reason (one tap), scan any location → "Placed on
  <code> · Urgent" → back to the scan loop. Uses B's routes.
- `/m/unbox` rows: urgency, location code, tracking, title or Unfound.
- (4) **Label photo**: at arrival, capture the shipping label through the
  existing photo scope `arrival_package` (`src/lib/receiving/photo-scope.ts`);
  zero extra taps if the existing capture path allows, else one.
Acceptance: browser at `http://localhost:3050` (never another port), 390×844:
type a real recent tracking → pair screen → flip urgency → type a real BIN
barcode → placed → visible in `/m/unbox`; undo test writes (urgency back to
null). Screenshots listed in the report.

### D. `ScanBridgeQA` — bridge hardening (repo + Mac, small)
Files: `src/lib/native-shell/bridge.ts`, `src/hooks/useBarcodeScanner.ts`,
`App/Sources/NativeLens.swift`, `ShellViewController.swift` (coordinate with A
via `write agent://ShellDevice` before touching Mac files). Check every
`useBarcodeScanner` consumer (`MobileV2ScanInput`, `ScanSurface`,
`MobileCaptureWindow`, `MobilePoQrScanSheet`, `ScanValueField`,
`useMobilePicker`, `SignInQrScanDialog`) renders its `<video>` inside a box the
lens can occupy (parent element = the box); fix any where it is not. Confirm
`MobileContinuousPhotoCamera` (getUserMedia photos) still works in WKWebView
while the native lens is stopped. Acceptance: eslint/typecheck clean; a
written list of each consumer and its verdict.

## Shared-tree rules (binding for every slice)
- Another session is editing `src/components/sidebar/**`, `src/lib/keyboard/**`
  and typography tokens right now. Never touch them. Git is READ-ONLY (no
  stash/checkout/restore/reset/add/commit); undo only your own edits, file by
  file.
- Use repo binaries, never npx: `node_modules/.bin/eslint`, `node_modules/.bin/tsx --test`,
  `node scripts/typecheck.mjs`. No `pnpm verify` mid-flight.
- Never bind another port or start `next dev`; `systemctl --user restart cycleforge-lane@prod` if needed.
- No migrations are needed this run. If one becomes necessary, author it only;
  applying needs the operator's typed "apply" (`.claude/skills/db-migrate`).
- `ds_critique` is not production-ready — do not treat it as a gate.

## Integrator timeline
- 0:00–0:15 copy the contract into `src/lib/receiving/arrival-contract.ts`,
  spawn A–D in one batch.
- 0:15–1:30 answer slice messages; keep the contract single-sourced.
- 1:30–1:50 `pnpm verify:fast`; fix or report; re-install the app via
  `device-run.sh` so the Air runs the final web + shell.
- 1:50–2:00 report: per build-order step, what runs on the Air, how it was
  verified (commands + observed output), and what the operator must do
  (sign in on the phone, scan real labels).
