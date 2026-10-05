# PROMPT — continue iOS parity in the `ios-parity` worktree (Phase 3 →)

Paste this whole file as the first message of a fresh session on **avion**, in
`/home/michaelgarisek/Projects/cycleforge-lanes/ios-parity`.

You are the **integrator** of an in-flight run. Phases 0–2 are done and
shipped. You continue at **Phase 3**. The run's master brief is
`docs/handoff/PROMPT-ios-arrival-unbox-parity-2026-10-04.md` (north star,
phase definitions, working rules, definition of done) — read it in full
first; this file tells you what has changed since it was written and what to
do next. Where the two disagree, this file and the rulings it lists win.

Every phase still ends at a **STOP GATE**: report, then wait for the
operator's "go" or corrections. Inside a phase, use parallel subagents with
explicit file ownership.

---

## 0. First actions (before any code)

1. Read, in order: this file, the master brief,
   `docs/handoff/ios-parity/LANE.md`,
   `docs/handoff/ios-parity/PHASE-0-AUDIT.md` (headline findings, numbered
   change list, "Operator rulings at STOP GATE 1"), `~/.cache/cf-deploy/LAST-DEPLOY.md`.
2. **Ask the operator the two open questions in §4 and wait for answers.**
   Question 1 blocks every web probe in Phase 3.
3. Confirm the lane is up: `systemctl --user is-active cycleforge-lane@ios-parity`
   (start: `pnpm lane up ios-parity`; logs:
   `journalctl --user -u cycleforge-lane@ios-parity -f`).
4. Confirm the lane still equals its baseline plus nothing else
   (recipe in `LANE.md`). Anything unexpected is someone else's — leave it
   alone and adapt.

## 1. Where things are

| What | Where |
|---|---|
| Web worktree (this run) | `~/Projects/cycleforge-lanes/ios-parity`, detached at `0ff1acb44`, no branch |
| Lane dev server | `cycleforge-lane@ios-parity`, `http://localhost:3077` (public tunnel hostname does NOT work: `cycleforge-lane-tunnel@.service` template is missing on this box) |
| Baseline = production after Phase 2 | `dpl_9eqYeJNt6BudBsbkNEddge22Nwcq`; frozen copy `~/.cache/cf-deploy/baseline-dpl_9eqY/` |
| Database | `.env` copied from `prod` → the production Neon DB (dogfood) |
| iOS app | Mac `ssh prometheus`, `~/Projects/cycleforge-ios` (not git). Backup: `Scripts/backup-to-avion.sh` |
| Simulator / device | sim `AB3F9FB7-7421-4C22-BDBF-CB2653CDB044`; Air UDID `00008150-00185D362612401C`, bundle `ai.cycleforge.app` |
| Evidence | `docs/handoff/ios-parity/` — `PHASE-0-AUDIT.md`, `corpus/scan-corpus.json` (1538 real scans), `screens/phase{0,1,2}/` (+ `phase0/data/*.json` shared fixtures) |
| Deploy staging | `~/.cache/cf-deploy/` (`staging/` = current prod tree, `LAST-DEPLOY.md`, `build_base.py` is stale — see §6) |
| The `prod` worktree | `~/Projects/cycleforge-lanes/prod` — other sessions' home. Do not edit it, do not run git there. |

## 2. What is done (Phases 0–2)

- **Phase 0** audit: `PHASE-0-AUDIT.md`. All four reported defects confirmed;
  45.5% of real carrier labels were refused at Inbound.
- **Phase 1** (shipped): one door rule on both surfaces.
  - Web `src/lib/barcode-routing.ts` recognises carrier envelopes (USPS
    420+ZIP, IMpb 20/21/22/26, FedEx 34 any prefix + 2D payloads, Amazon TBA,
    UPU S10, regional/3PL, short/glued 1Z, multiline, glued double scans,
    ≥16 digits except SSCC/01+GTIN14); eBay/Amazon order numbers are not
    tracking. `src/lib/scan/mobile-arrival-door.ts`: refuse locally only
    confirmed house labels and order numbers; everything else → server last-8
    resolver. Refused carrier labels in the corpus: 207/455 → 3/455.
  - Every Inbound scan shows a tape row ("Not an arrival" instead of
    silence). Switcher reads **Inbound | Outbound**.
  - App: `BarcodeRoute.swift`, `CarrierPatterns.swift`, `DoorIntake.swift`
    ported arm for arm; repeat gate never blocks a locally refused value and
    re-shows the previous result; web tape verbs (Arrived / Already arrived /
    Not an arrival / Scan failed).
  - Parity: `Scripts/render-route-parity.mts` (app repo) renders every corpus
    row scanned AND typed from the web code → `Tests/CycleForgeClientTests/Fixtures/web-route-parity.json`;
    `RouteParityTests` = 0 mismatches.
- **Phase 2** (shipped):
  - Web: IBM Plex Mono removed, Inter everywhere (`font-mono` = Inter +
    tabular-nums); typed **last 8 digits** at Inbound+Operate runs the door
    flow (`ScanInputSource = 'scanned' | 'typed'`; scanned 8 digits stay
    refused — they are Goodwill PO numbers); server last-8 counts each
    shipment once as its newest carton (`resolve-shipment-for-scan.ts`,
    `scan-match-probe.ts`); "Photo the label" removed from Pair; View mode never
    scans out (`MobileScanIdentify.tsx` `outbound` requires Operate).
  - App: generated `Sources/CycleForgeDesign/CycleForgeTokens.swift` +
    `CycleForgeVocabulary.swift` (generators in this repo: `scripts/ios/generate-ios-tokens.mts`,
    `scripts/ios/generate-ios-vocabulary.mts`, `--check` fails on drift);
    system font at the web's sizes/weights, no monospaced; web chrome
    (`App/Sources/MobileChrome.swift`: shell top bar, Scan header with
    Inbound|Outbound + View|Operate, Pair detail bar, "Unbox next");
    View mode (read-only); haptics on every cue from the web's `SCAN_BUZZ`;
    label photo deleted entirely; typed last 8 ported.
  - App installed and launched on the Air (final Phase 2 build). Sign-in
    state on the phone not checked.
- **Production now:** `dpl_9eqYeJNt6BudBsbkNEddge22Nwcq`. Rollback:
  `cd /tmp && vercel promote dpl_HvFiVQmBHATVA5WCSVdB4u9wyZQh --yes`.
  Last-reviewed fallback (Phase 1 only):
  `cd /tmp && vercel promote dpl_Dk4qZmN9K9DXNkZPzFJodcSc93LQ --yes`.
- **Last measured checks:** web touched tests 140/140; `swift test` 206;
  hosted 19 + UI 2; `pnpm verify:fast` all gates green except typecheck,
  whose errors were all in other sessions' files (`src/features/support/SupportDesk.tsx`,
  `src/lib/triage/views/card-view-adapters.ts`).

## 3. Operator rulings (binding)

From the master brief, plus at STOP GATE 1 and after:

1. Unconfirmed / junk / test values may go to the server resolver.
2. Web: Inter only. App: iPhone system font at the web's sizes and weights;
   never monospaced.
3. **Label photo is not needed** — strike it from Phase 3 (master brief
   Phase 3 "Label photo" bullet and change-list item 20) and from the
   definition of done ("…and the label photo uploads").
4. The app vibrates on every scan cue.
5. Typing the last 8 digits of an unscannable tracking number at Inbound must
   work on both surfaces (done; keep it working).
6. Shipping to production is allowed whenever a phase is ready (dogfood);
   use the staging overlay (§6), never `vercel` from a worktree.
7. **Unbox row tap opens the purchase-order information display** (Phase 4),
   not Pair. Overrides the master brief's "Tapping a row opens Pair".
8. Dark mode: not ruled. Tokens carry both schemes; the app stays light-only.
9. Phase 3+ runs in this worktree, never in `prod`.

## 4. Open questions — ask first

1. **Which origin may Phase 3 probe?** A user rule (`.omp/rules/dev-origin.md`,
   enforced by a hook) allows browser/curl probes only at
   `http://localhost:3050`, which is the `prod` lane, not this one. Options:
   (a) allow probes to `http://localhost:3077` for this run (recommended);
   (b) point the switchboard (`~/.config/cycleforge/switch`, `:3051` /
   `usav-dev.michaelgarisek.com`, `POST /__switch`) at `ios-parity` and allow
   probes there — phones/iPad then see the lane, and the switchboard stops
   other warm dev servers; (c) keep `:3050` only — then web changes made here
   cannot be smoked until deployed. Do not probe `:3077` until answered; do
   not edit the rule yourself.
2. **"Purchase-order information display" for Unbox rows.** The web's package
   record `/m/r/{id}` already shows the PO lines. Confirm that this is the
   page, and that the app should get a native equivalent in Phase 4.

## 5. What to do next

### Phase 3 — Arrival screens identical (Scan → Pair)

Source of truth: master brief Phase 3 + `PHASE-0-AUDIT.md` change-list items
17–19 and Appendix B (display diff). Label photo is struck.

- **Scan (app):** docked bottom capture window like `MobileCaptureWindow` /
  `MobileCameraPanel` (strip `T · status · ✓`, status words "Camera off" /
  "Offline" / "N pending · M in", typed entry behind `T`, field label from the
  web — "Tracking or last 8 digits" at the Inbound door, otherwise "Label");
  camera height per the web panel (today the app uses the 304 pt floor, not
  46% of the screen); no-camera copy "No camera found on this device." +
  "Try again" verbatim.
- **Recent tape (both):** port `arrival-station-tape.ts` +
  `MobileV2ScanRecentList.tsx` (server-seeded history + session rows,
  verb-as-title rows, tone rail, chevron). The latest result and every row
  open the package on both surfaces, including refused rows once the server
  has resolved them. App rows drop the detail sentence (web shows it only in
  the opened row sheet, `MobileV2ScanRecentSheet.tsx`).
- **Pair (app):** flat package section with rules; tracking on one line;
  Found neutral / Unfound amber pill; item lines "`N` × title" (no photo
  tile, SKU or "Qty"); single-line "Scan any location label" bar with a camera
  button (no always-on viewfinder, no "Place" button); placed = eyebrow
  "PLACED" + title; 900 ms return. Phase 2 left "Send", "Place", "Not sent"
  and the Pair photo tile for this phase.
- **View mode (app):** where the web opens a record (seen tracking, carton,
  location, unit), the app shows nothing today — decide with the operator
  whether Phase 3 adds those screens or Phase 4's record display covers it.
- **Proof:** screenshot pairs with AE scores (`compare -metric AE -fuzz 10%`,
  390×844 @3x, same `screens/phase0/data/*.json`) for every Phase 0(b) state
  minus label photo; save to `screens/phase3/`. Web captures from the origin
  the operator allows (§4.1). Known gap: on the `prod` lane the web Pair and
  Unbox pages never got past their loading text — re-check on the allowed
  origin. App captures via a throwaway hosted snapshot test in a scratch copy
  (`/tmp/cf-ios-snap`, deleted afterwards). The operator's real end-to-end
  run on the Air (scan → Pair → Urgent → bin) after the deploy.

### Phase 4 — Unbox identical + Sort by + search

Master brief Phase 4, with ruling 7 (row tap → PO information display, native
in the app). Server `sort` (Urgent first default / Oldest first / Newest first
/ Location / Unfound first) and `q` (title via `resolveSkuIdentityTitle` /
`SKU_CATALOG_JOIN_ON_SQL`, tracking incl. last 8, order #, seller) on
`readUnboxQueue` + `GET /api/receiving/unbox-next`; controls placed where
`node tools/design-mcp/ds.mjs contract '<job>'` says; rows as
`MobileRecordCard`; empty/loading/error states top-aligned like the web.

### Phase 5 — Ship and guard

Master brief Phase 5. The guard command must cover: `scripts/ios/generate-ios-tokens.mts --check`,
`scripts/ios/generate-ios-vocabulary.mts --check`, re-render of
`web-route-parity.json` (and the other `Scripts/render-*.mts` fixtures) with a
diff, `swift test` over ssh, and a corpus guard "refused carrier values ≤ 3
documented exceptions". Promote the snapshot rig into the app's `App/Tests`
(needs a `ScanView` injection init).

## 6. Rules that bit this run (do not repeat)

- **Database:** reads are transaction-scoped only — `BEGIN READ ONLY; …;
  COMMIT;`. Never `SET` anything at session level (no `-c 'SET …'`, no
  `PGOPTIONS`) through the pooled DSN: it leaked `default_transaction_read_only=on`
  onto shared production backends on 2026-10-04, failed ~half of production
  writes and two promote builds. Before any promote, read
  `current_setting('default_transaction_read_only')` on 60 fresh pooled
  connections (read-only) — expect 0 `on`.
- **Git:** read-only everywhere (status / diff / log). No stash, restore,
  `add -A`, commits or resets — a hook enforces it. Phase checkpoint = diff
  against `~/.cache/cf-deploy/baseline-dpl_9eqY` + copy of changed files to
  `~/.cache/cf-deploy/phase-<n>-lane/` (recipe in `LANE.md`).
- **Deploy:** production can move under you — on 2026-10-04 another session
  ran `vercel --prod` from the dirty `prod` worktree. Always: `vercel inspect`
  what `app.cycleforge.ai` serves → rebuild `staging/` as an exact,
  sha1-verified copy of THAT deployment (update `build_base.py`'s hardcoded
  `DPL`/`BASE` first, or reuse `dpl*-files.json` + `blobs/`) → overlay only
  this run's changed files (3-way where production differs) → typecheck +
  touched tests + route-parity diff (0) in staging → `vercel` preview → smoke
  with every non-GET intercepted → `vercel promote` → record ids + rollback in
  `LAST-DEPLOY.md`.
- **Mac:** concurrent Swift work uses `swift test --scratch-path .build-<slice>`
  and `-derivedDataPath build/DD-<slice>`. One app integration owner per
  phase edits `HomeView`, `ScanView`, `MobileChrome.swift`, `project.rb`,
  `Package.swift`, `Info.plist`, README, HANDOFF, installs on the Air and runs
  the backup. Install only via the GUI: `Scripts/device-run.sh` launched with
  `osascript` / Terminal (signing over SSH fails; 4016 = phone locked).
- **Generators / renderers run from this repo's root** (the lane), not
  `prod`: `node --import tsx --import ./scripts/register-server-only-shim.cjs
  <script> …`. The two `scripts/ios/*` headers still say "cycleforge-lanes/prod"
  — fix that comment when you next touch them.
- **Browser smokes:** managed Chromium with `app: { relay: false, tern: false }`,
  390×844 @3x, cookie `cf_sid` from `tests/.auth/admin.json` via
  `page.setCookie` in `tab.run`, every non-GET intercepted (init-script
  wrapper over fetch/XHR/sendBeacon is the reliable way). `tab.text()` needs a
  selector (`tab.text('body')`).
- **Words:** new words must be in VOCABULARY (`src/lib/nav/route-tree.ts`;
  `node tools/design-mcp/ds.mjs vocabulary <word>`). "package", never
  "carton". Copy from the web verbatim. The Inbound/Outbound VOCABULARY terms
  are in production and in this lane (`src/lib/nav/route-tree.ts:88`).
- **Tests:** no source-text or wording tests unless an existing convention
  already does it; no placeholders or stubs in either UI.

## 7. Phase report (every STOP GATE)

Changed files per surface (diff vs baseline), commands with observed output,
screenshot pairs with AE scores (paths checked with `ls`), production
deployment id + rollback if shipped, open questions, and exactly what the next
phase will change.
