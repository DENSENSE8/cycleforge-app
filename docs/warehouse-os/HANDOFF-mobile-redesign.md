# HANDOFF — mobile redesign (execute)

**Written 2026-09-06 from the `mobile-arrival` lane. Two surfaces are done and
they are the pattern; the rest of `/m/*` has not been touched.**

Paste everything below the line into a fresh session pointed at the lane
worktree. It is self-contained — the agent starts blank.

---

You are continuing the **mobile redesign** of a warehouse-management app in
`/home/michaelgarisek/Projects/cycleforge-lanes/mobile-arrival` (a git worktree,
detached, its own port and hostname). Do not work in
`~/Projects/cycleforge-app` — that is the operator's desktop checkout and it is
running on `:3050` while you work.

- dev server: already running as `cycleforge-lane@mobile-arrival` on
  **http://localhost:3074**, public at **https://mobile-arrival.michaelgarisek.com**
- logs: `journalctl --user -u cycleforge-lane@mobile-arrival -f`
- restart after an env change only: `systemctl --user restart cycleforge-lane@mobile-arrival`
- an authenticated storage state for Playwright lives at `tests/.auth/admin.json`;
  run specs with `PW_BASE_URL=http://localhost:3074 npx playwright test <spec> --project=desktop`
  (the `mobile` project needs a WebKit download that is not installed — use
  `--project=desktop` plus `test.use({ viewport: { width: 390, height: 844 } })`)

## What "mobile redesign" means here, and what it does not

This is a **warehouse floor phone**, held in one hand, often gloved, with a box
in the other hand. It is not a consumer app. Three things follow, and every one
of them was learned the hard way — do not re-derive them:

1. **The primary gesture is a scan, and it lives at the BOTTOM of the screen.**
   A camera sheet anchored to the bottom edge with the running ledger stacking
   upward above it. A text field with a camera toggle is not a scan bar.
2. **Paint small, hit big.** `MOBILE_CONTROL_LADDER` in
   `src/lib/mobile/mobile-display-cohort.ts` is 28 / 36 / 44 px PAINTED, with the
   44px touch region carried by padding or a `before:-inset-*` pseudo-element.
   Apple's 44×44 is the hit region, not the size of the control. A blanket
   `min-h-11` on every control is the bug this law exists to prevent.
3. **Two type roles per file, floor of 11px.** `text-role-micro` (10px) is banned
   on `/m`. Hierarchy comes from weight and ground, never a third size.

There is a **blocking CI gate** for all of this:
`node scripts/ci/check-mobile-display-law.mjs`, plus a tripwire test
`src/lib/mobile/mobile-display-cohort.test.ts`. Both read the cohort array in
`mobile-display-cohort.ts`. **A surface you redesign MUST be appended to
`MOBILE_DISPLAY_COHORT` in the same change, or it is not law-bound and the next
person will undo you.**

## The two surfaces that are already done — read these first

Read them before writing anything. They are the pattern you are propagating, and
their file comments carry the reasoning you would otherwise have to rediscover.

| Surface | Route | Body |
|---|---|---|
| Scan out (dock ship-confirm) | `/m/scan-out` | `src/components/mobile/redesign/MobileScanOut.tsx` |
| Arrival (door intake) | `/m/triage` | `src/components/mobile/receiving/MobileArrivalStation.tsx` |

The shared harness they both mount — **reuse it, never fork it**:

- `src/components/mobile/station/MobileStationShell.tsx` — upward tape + a
  bottom-anchored capture surface. Owns the `min-h-0` / `justify-end` /
  bottom-anchor chain that a clone always gets wrong.
- `src/components/mobile/station/MobileCaptureWindow.tsx` — the lens, the keyed
  fallback behind a small `Type` icon, the three camera states.
- `src/components/mobile/station/MobileStationSheet.tsx` — the non-modal bottom
  sheet, square lip, one 28px top rail (grab bar centred, keyed entry left,
  status pill right).
- `src/components/mobile/station/MobileStationTapeItem.tsx` — one ledger row,
  two lines, disclosure + optional action.
- `src/components/mobile/station/station-tape.ts` — the station-neutral entry
  model, the collapse (`dedupeKey`) and the 40-row cap.

Each station supplies only its own vocabulary. Arrival's is
`src/components/mobile/receiving/arrival-station-tape.ts` (pure, tested); its
scan loop is `useArrivalStation.ts`; its server seed is `useArrivalHistory.ts`.
Copy that SHAPE — a pure tape module + a hook that commits + a hook that seeds —
not the file.

## Host chrome (already compacted — do not grow it back)

`MobileTopBar` is **40px** tall: 32px painted controls with a 44px pseudo hit
ring, a 13px `role-data` page title, `px-3 py-1`. `Button`'s mobile size table
(`src/design-system/primitives/Button.tsx`) is `h-8 / h-9 / h-11`. If a screen
you build needs a taller bar, you are building the wrong screen.

Pre-sign-in routes render **bare** (no bar, no drawer, no scan CTA) via
`isClientPublicPath` in `MobileShell.tsx`. That is load-bearing: a phone asking
for `/signin` is REWRITTEN to `/m/signin` by `src/proxy.ts`
(`MOBILE_UA_REWRITES`), and a rewrite keeps the browser path — so any chrome
rule matched against `/m/signin` alone misses on every phone.

## Your work, in priority order

Each item is one commit. Stop after each and report; do not batch.

1. **`/m/scan` (`src/components/mobile/redesign/UniversalScan.tsx`, 465 lines).**
   The last surface still using `ScanInput` — a `ThemedStationScanBar` (desk
   chrome) with a camera toggle, mounted at the TOP, plus a three-mode
   `HorizontalButtonSlider` (Arrival / Testing Orders / Prepacked) and a
   swipeable pager. Decide with evidence whether this surface should survive at
   all now that Arrival is its own station: `/m/triage` already owns the door
   scan, and `PrepackedProductSheet` / `ScanTestingPanel` are the other two
   modes. Two defensible outcomes — (a) port it onto the station harness as a
   universal-scan station whose tape rows deep-link per class, or (b) retire the
   surface and route the top-bar SCAN CTA (`mobile-scan-cta.tsx`,
   `MOBILE_SCAN_PATH`) at the station the class belongs to. **Report your
   recommendation with the routing evidence BEFORE you write it.**
2. **`/m/pack` (`redesign/Pack.tsx`) and `/m/unbox`.** Both are pack/unbox
   stations with a scan at their centre and no bottom capture surface. Port to
   the harness; each gets its own tape vocabulary (pack: box + weight + label;
   unbox: PO + line + serial). `station-tape.ts` already carries the generic
   fields — extend the ENTRY only if a station genuinely needs a field no other
   station has, and say why in the comment.
3. **`/m/home` and `/m/work`.** Not stations — these are queues. They do not get
   a capture sheet; they get the compact chrome, the ladder and the two-role type
   cap. Audit them against the law gate and fix what it reports.
4. **Everything else under `src/app/m/(shell)/`** (`/m/pick`, `/m/orders`,
   `/m/receiving`, `/m/identify`, `/m/checklist`, `/m/companion`, `/m/b`,
   `/m/h`, `/m/r`, `/m/rs`, `/m/u`): law-audit only. Report a table of
   violations; fix only the mechanical ones (banned type role, `size="lg"`,
   `h-14`, a control painted at its touch floor).

## Rules for the work itself

- **One tape per station, one row per thing.** `dedupeKey` is how a re-read
  collapses onto the row it already made; a station that cannot answer "is this
  the same object?" passes `null` and every entry stands alone.
- **Never count from the tape.** It is capped at 40. A shift total is counted as
  commits settle, or it silently starts lying at row 41.
- **Every commit is irreversible at a dock.** Feedback is haptic + audio
  (`useScanFeedback`, `vibrateScan`), because the operator's eyes are on the
  label. Reversal, where it exists, rides ON the tape row — not under the thumb.
- **Offline is a per-station decision, not a default.** Scan-out queues (the
  package really left). Arrival does NOT (nothing was recorded, so the box is
  still un-arrived, and a queue would lie). State which one your station is and
  why, in the file.
- Server-seed a station's tape from a feed that already exists before inventing
  an endpoint. Arrival reuses `mobileFeedQueryKey('triage')` so the existing
  `seedMobileReceivingFeed` paint seed still fills the first screen.

## Definition of done, per commit

1. `node scripts/ci/check-mobile-display-law.mjs` → ✓, with your surface listed
   in `MOBILE_DISPLAY_COHORT`.
2. `npx tsx --test <your new pure module>.test.ts` green. The pure model gets
   tests; the render does not, unless a plausible bug would fail the test.
3. `node_modules/.bin/eslint <files>` and `node_modules/.bin/tsc --noEmit -p tsconfig.json`
   clean. (If `tsc` reports errors inside `.next/dev/types/routes.d.ts`, the dev
   server was mid-write — `rm` that file and re-run.)
4. **Visual proof on a phone viewport**, not a claim: drive the real surface at
   `http://localhost:3074` at 390×844, exercise the changed path (the capture
   sheet's keyed fallback is the way to fire a scan headlessly — the camera does
   not exist in headless Chromium), and report the measured numbers (bar height,
   control paint, sheet radius) plus a screenshot path.
5. Nothing in `~/Projects/cycleforge-app` touched, and `:3050` still up.

## Stop conditions

- Do not create a branch. The lane is detached; `pnpm lane land mobile-arrival`
  from the main checkout is how work lands.
- Do not restyle the desktop stations. `Button`'s DESKTOP size table, the desk
  scan bar and `ThemedStationScanBar` are out of scope.
- Do not touch `/signin`, `/m/signin` or anything under `src/lib/auth` — a
  separate handoff owns that surface.
- If a redesign requires a new API route, stop and report the contract first.
