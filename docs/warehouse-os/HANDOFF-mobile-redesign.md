# HANDOFF — mobile redesign (execute) · v2 — the Workstation timeline

**Written 2026-09-06, after the operator's pivot. v1 (surface-by-surface
propagation) is preserved in git at `32a57d95c`; this file supersedes its
priority list. The laws and the harness sections survive unchanged.**

Paste everything below the line into a fresh session pointed at the lane
worktree. It is self-contained — the agent starts blank.

---

You are continuing the **mobile redesign** of a warehouse-management app in
`/home/michaelgarisek/Projects/cycleforge-lanes/mobile-arrival` (a git worktree,
detached, its own port and hostname). Do not work in
`~/Projects/cycleforge-app` — that is the operator's desktop checkout and it is
running on `:3050` while you work.

- dev server: already running as `cycleforge-lane@mobile-arrival` on
  **http://localhost:3075** (moved off :3074 on 2026-09-06), public at
  **https://mobile-arrival.michaelgarisek.com**
- logs: `journalctl --user -u cycleforge-lane@mobile-arrival -f`
- restart after an env change only: `systemctl --user restart cycleforge-lane@mobile-arrival`
- an authenticated storage state for Playwright lives at `tests/.auth/admin.json`;
  run specs with `PW_BASE_URL=http://localhost:3075 npx playwright test <spec> --project=desktop`
  (the `mobile` project needs a WebKit download that is not installed — use
  `--project=desktop` plus `test.use({ viewport: { width: 390, height: 844 } })`)


**Operator ruling (2026-09-06):** the read-only ID preview ("what would this
ID do next?") lives behind **long-press on the SCAN CTA** — no third bar
control; the two-controls bar law stands. Preview renders `dispatchScan`
output in a sheet whose only action navigates; it never commits. Build order:
after the rename, with the Stack's Find band consuming the same model.

## The pivot (2026-09-06, operator) — what changed

The phone is no longer "a set of station pages you navigate between." It is
**one timeline of what you are doing**:

- **Scan-agnostic, ID-based.** Nothing is named "Arrival." A scan is an ID; the
  dispatch table decides what work that ID belongs to; the station that runs it
  is simply **your current workstation**. Arrival-at-the-door is the first
  vocabulary the timeline carries, not a destination.
- **The tape IS the timeline.** Unboxing something = a block on the timeline
  with the items you processed stacked under it, timestamped, newest first,
  resumable.
- **Mobile-first like Brilliant / Duolingo:** the phone surface is the product;
  the desktop hosts the SAME components (in a device frame) with more readable
  options, for triage from the desk.
- **Clear blurred top-bar navigation** — translucent glass bar, sticky over the
  scrolling timeline.

## Laws that survived the pivot — do not re-derive

1. **The primary gesture is a scan, and it lives at the BOTTOM of the screen.**
   A camera sheet anchored to the bottom edge with the running ledger stacking
   upward above it. A text field with a camera toggle is not a scan bar.
2. **Paint small, hit big.** `MOBILE_CONTROL_LADDER` in
   `src/lib/mobile/mobile-display-cohort.ts` is 28 / 36 / 44 px PAINTED, with the
   44px touch region carried by padding or a `before:-inset-*` pseudo-element.
3. **Two type roles per file, floor of 11px.** `text-role-micro` (10px) is banned
   on `/m`. Hierarchy comes from weight and ground, never a third size.

There is a **blocking CI gate** for all of this:
`node scripts/ci/check-mobile-display-law.mjs`, plus a tripwire test
`src/lib/mobile/mobile-display-cohort.test.ts`. **A surface you redesign MUST be
appended to `MOBILE_DISPLAY_COHORT` in the same change, or it is not law-bound
and the next person will undo you.**

## The two surfaces that are already done — read these first

| Surface | Route | Body |
|---|---|---|
| Scan out (dock ship-confirm) | `/m/scan-out` | `src/components/mobile/redesign/MobileScanOut.tsx` |
| Door intake (the surface v1 called Arrival) | `/m/triage` | `src/components/mobile/receiving/MobileArrivalStation.tsx` |

The shared harness they both mount — **reuse it, never fork it**:

- `src/components/mobile/station/MobileStationShell.tsx` — upward tape + a
  bottom-anchored capture surface.
- `src/components/mobile/station/MobileCaptureWindow.tsx` — the lens, the keyed
  fallback behind a small `Type` icon, the three camera states.
- `src/components/mobile/station/MobileStationSheet.tsx` — the non-modal bottom
  sheet, square lip, one 28px top rail.
- `src/components/mobile/station/MobileStationTapeItem.tsx` — one ledger row,
  two lines, disclosure + optional action.
- `src/components/mobile/station/station-tape.ts` — the station-neutral entry
  model, the collapse (`dedupeKey`) and the 40-row cap.

The pure model for the whole-day timeline **already exists on the desk side**:
`src/lib/nav/stack-model.ts` (pure, tested, four fixed bands — Now · Earlier ·
Queues · Find; elapsed is the SUM of intervals). The mobile Stack is a new
RENDER over that model, not a new model.

## Plan of attack — highest ROI first

Each item is one commit. Stop after each and report; do not batch.

1. **Glass top bar.** `MobileTopBar.tsx` gains a translucent
   `backdrop-blur` treatment over the scrolling timeline — sticky, the 40px
   height, 32px paint + 44px pseudo hit ring, and `px-3 py-1` stay exactly as
   they are. Colour/opacity only; no geometry animation. This is the marquee
   visual ask and it touches one file that every `/m` surface already mounts.
2. **Kill the "Arrival" name; the surface becomes the Workstation timeline.**
   `/m/triage` keeps its door vocabulary (`arrival-station-tape.ts`, pure,
   tested) but the user-facing identity becomes the workstation: bar title and
   session title come from the dispatch table's card, not a hardcoded
   "Arrival". Rename the generic pieces scan-agnostically
   (`MobileArrivalStation` internals, `mobile-arrival-door.ts` → the door arm of
   the dispatch table). `'arrival'` is NOT in `SURFACE_REGISTRY` and carries no
   DB rows — the rename is code-local; if you find a stored key or API contract
   that says otherwise, STOP and report it.
   Timeline-ify the tape in the same commit: timestamped entries grouped under
   the armed block, a shift total counted from commits (never from the tape —
   it is capped at 40).
3. **Land the mobile Stack.** Top-left back/menu opens `MobileStackSheet`
   rendering `stack-model.ts`: Now · Earlier today · Queues · Find, resume in
   place, long-press jump. This replaces the drawer's page tree as the only
   thing behind top-left — the timeline of what you did today. Spec:
   `docs/warehouse-os/GOAL-scan-shell-mobile-stack.md` (adjust: consume
   `src/lib/nav/stack-model.ts` instead of writing a mobile twin).
4. **Retire `/m/scan`'s three-mode pager.** Decide with routing evidence
   (v1 item 1, still open): port onto the station harness as a universal-scan
   station, or retire the surface and route the SCAN CTA
   (`mobile-scan-cta.tsx`, `MOBILE_SCAN_PATH`) at the station the dispatch
   table assigns the class. **Report the recommendation BEFORE writing it.**
5. **Desktop triage surface.** One desktop route embedding the mobile
   workstation in a 390px device frame beside a readable desktop list of the
   same timeline (the desk triage view). Same components, mobile-first, not
   mobile-only. If it needs a new API route, stop and report the contract
   first.
6. **Propagate the harness (the v1 long tail).** `/m/pack` + `/m/unbox` onto
   the station harness with their own tape vocabularies; then `/m/home` and
   `/m/work` law-audit; then the mechanical-only law audit of everything else
   under `src/app/m/(shell)/`.

## Rules for the work itself

- **One tape per station, one row per thing.** `dedupeKey` is how a re-read
  collapses onto the row it already made; a station that cannot answer "is this
  the same object?" passes `null`.
- **Never count from the tape.** It is capped at 40. A shift total is counted
  as commits settle, or it silently starts lying at row 41.
- **Every commit is irreversible at a dock.** Feedback is haptic + audio
  (`useScanFeedback`, `vibrateScan`), because the operator's eyes are on the
  label. Reversal, where it exists, rides ON the tape row — not under the thumb.
- **Offline is a per-station decision, not a default.** Scan-out queues (the
  package really left). The door does NOT (nothing was recorded, so the box is
  still un-arrived, and a queue would lie). State which one your station is and
  why, in the file.
- Server-seed a station's tape from a feed that already exists before inventing
  an endpoint.

## Definition of done, per commit

1. `node scripts/ci/check-mobile-display-law.mjs` → ✓, with your surface listed
   in `MOBILE_DISPLAY_COHORT`.
2. `npx tsx --test <your new pure module>.test.ts` green. The pure model gets
   tests; the render does not, unless a plausible bug would fail the test.
3. `node_modules/.bin/eslint <files>` and `node_modules/.bin/tsc --noEmit -p tsconfig.json`
   clean. (If `tsc` reports errors inside `.next/dev/types/routes.d.ts`, the dev
   server was mid-write — `rm` that file and re-run.)
4. **Visual proof on a phone viewport**, not a claim: drive the real surface at
   `http://localhost:3075` at 390×844, exercise the changed path (the capture
   sheet's keyed fallback is the way to fire a scan headlessly), and report the
   measured numbers (bar height, control paint, sheet radius) plus a screenshot
   path.
5. Nothing in `~/Projects/cycleforge-app` touched, and `:3050` still up.

## Stop conditions

- Do not create a branch. The lane is detached; `pnpm lane land mobile-arrival`
  from the main checkout is how work lands.
- Do not restyle the desktop stations. `Button`'s DESKTOP size table, the desk
  scan bar and `ThemedStationScanBar` are out of scope (item 5 mounts mobile
  components on desktop; it does not restyle desk ones).
- Do not touch `/signin`, `/m/signin` or anything under `src/lib/auth` — a
  separate handoff owns that surface.
- Pre-sign-in routes render **bare** via `isClientPublicPath` in
  `MobileShell.tsx` — that is load-bearing against the `/m/signin` rewrite in
  `src/proxy.ts`; do not add chrome rules that miss it.
- If a redesign requires a new API route or touches a stored surface key,
  stop and report the contract first.
