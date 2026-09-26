# HANDOFF — phone screens flat 0→390, one header, industrial bottom bar (2026-09-25)

Paste this whole file into OMP from `/home/michaelgarisek/Projects/cycleforge-lanes/prod`.
Read first: `AGENTS.md`, `docs/handoff/fnsku-reprint-HANDOFF.md` (the session this continues),
`docs/handoff/mobile-ds-law-exoskeleton-HANDOFF.md`, `src/lib/mobile/detail-hub-law.ts`.
Do not commit; the owner commits. The tree carries other lanes' uncommitted work — touch only the
files named here (plus their tests/guards).

## Status 2026-09-25 (sessions 3 + 4) — BUILT, uncommitted

Phases 1–3 are built with the D1–D3 defaults: no bottom global nav, primary stays blue, and the
selection split is 30/35/35. Session 4 put back the spec where session 3 had drifted:

- **Facts are rows, per this handoff.** `<DetailFacts>` is a `divide-y divide-mode-rule` `<dl>` of
  `<DetailFact label value hint mono copy>` rows: the mono caps label sits left at the inset, the
  value is right-aligned in sans (`mono` for identifiers), and the hint sits under the value. The
  stacked two-column grid and `span="full"` are gone. `null` renders a `text-mode-edge` dash.
  `copy` makes the row tap-to-copy (the label reads COPIED for 1.2s).
- **Section bands** open every further group: fnsku/info (Dates), loc/info (Contents),
  orders/info (Shipping), shipments/info (Carrier milestones · Links), repair-scan/info (Units).
- **Haptics are gated** on the staff toggle `receiving.scanHaptics` (default off) through
  `usePressHaptic()` (`src/lib/scan-feedback/useScanFeedback.ts`), for dock verbs and tap-to-copy.
- **Dock lock.** A verb tap is leading-edge locked for 500ms. The selection ✕ always fires, then
  arms the lock, so a second tap cannot land on the idle verb that swaps in under the thumb.
- **No route animation.** `RedesignedMobileShell` no longer wraps pages in an
  `AnimatePresence` crossfade (150ms exit + 150ms enter on every tap). Pinned in `pinned.json` →
  `MobileShell`.
- **Flattened this session:** the `activity` / `units` doors under orders, cartons and shipments,
  shipments `boxes` / `items`, and `on-hold/[sku]/photos`, whose bar is now `DetailDock`.
- Built in session 3 (still true): all 8 `/info` screens, `r/[id]/lines|qc`,
  `on-hold/[sku]/locations`, `u/[id]` (+ `/history`, `/qc`), `qc/line/[id]`,
  `rs/[id]/record|paperwork|work|photos`, `RepairScanCompanion`. `/m/on-hold/` is in
  `host-top-bar.ts`, so there is one header.
- **Proof at 390px on `:3050`, 22 screens:** 0 layout problems. Every block runs 0→390 with
  radius 0 and no gaps, and exactly one 1px rule between blocks. Each screen has one header.
  Fact labels sit at x=16 with values ending at x=374 on the same line. Dock cells measured
  195×72 / 130×72 / 390×72. Share on the on-hold hub: a double tap 40ms apart shared once, and a
  third tap at 740ms shared again (0 vibrate calls with the toggle off). Tapping a door: across
  214 frames of the navigation the page opacity never dropped below 1.
- **Not seen live:** photo selection with real photos (no repair in org `…0001` has photos), the
  repair-scan companion (needs a tablet link), QC checklist rows (unit 1277 has no published
  checklist), and the vibration itself with the toggle ON.

## Pair flow (session 5, 2026-09-25) — built, uncommitted

- `/m/pair/` owns its bar (`host-top-bar.ts` + test; reverses the 2026-09-15 ruling). The pair
  screen shows two headers: the back bar (location code as the eyebrow) and the search field.
- `MobileTriagePage`: the house `SearchField` (magnifier on the left), a `ModeRegion mode="triage"`
  root, and a `dock` slot for the way out when no row is the answer. The pair screen's idle list
  has no heading.
- `TriageRow`: the title sits alone on line 1; meta sits bottom-left and the state code
  bottom-right. The commit is a quiet, secondary-style cell: full row height, a rule on its left,
  and ink on press. The same row is used on on-hold, exceptions, inbox and merge.
- SKU exception: always a `DetailDock` verb on `/m/pair/[code]`, and a "Not in the catalog" door
  on the location hub (`?exception=1` opens it). `ProvisionalCreateSheet` is a rounded
  `BottomSheet` with Identify / Triage / Put-away bands; the barcode field has a camera scan.
  Create hands off to the count keypad.
- `MobilePairQty` is flat. The direction toggle, keypad (a `gap-px` rule grid) and confirm
  (`DetailDock`) are pinned to the bottom.
- Open: `/m/on-hold` (queue) still stacks the host bar over the `MobileTriagePage` back bar. It is
  a drawer destination, so removing the host bar also removes the menu button.

## Role and goal

You are a front-end engineer on a terminal-grade warehouse app (Next.js PWA on phones — **not**
React Native or SwiftUI). Make every phone record screen use one look: blocks run 0→390, square,
flush, separated by one 1px rule, and only text keeps its inset. Then rebuild the bottom verb bar
as a rigid 72px terminal block with instant press feedback and no double-fire. No consumer-app
chrome: no rounded boxes, no page gutters, no layout motion.

## Where it stands (verified 2026-09-25, 390px, QA Mobile Verifier session on `:3050`)

Hubs are already flat (last session): `DetailHubScreen` body is `divide-y divide-mode-rule`,
`DetailSummaryCard` / `DetailNav` / `DetailAck` have no box, `DetailDock` is flush.
The screens one level down are not:

| Screen (record with rows) | Measured | Problem |
|---|---|---|
| `/m/fnsku/X004O69DL9` (hub, reference) | card, rows, dock 0→390, r0 | ✅ target look |
| `/m/r/53050/lines` | nav 16→374, 5 rows | page padding; row text inset twice (~32px) |
| `/m/r/53050/qc` | nav 16→374, 5 rows | same |
| `/m/on-hold/TMP-RPKWJ-9EYZM/locations` | nav 16→374, 2 rows | same **and two headers** |
| `/m/on-hold/TMP-RPKWJ-9EYZM` (hub) | 0→390 | **two headers**: host "Cycle Forge" bar over the record bar |
| `/m/u/1277` | nav 16→374, 7 rows | Information facts in a bordered `Panel`; `space-y-5` gaps |
| `/m/u/1277/qc` | card 16→374 | card inset; checklist in a bordered `Panel`; "Next unit" button with margins |
| `/m/qc/line/32624` | nav 16→374, 4 rows | facts in a bordered `Panel`; "Scan another label" is a bordered button in the flow |
| `/m/fnsku/X004O69DL9/info` (all `/info`) | two bordered `Panel`s, 16px gutter, gap | boxed fact tables |

Why the double header: `/m/on-hold/` is missing from `OWN_TOP_BAR_PREFIXES` in
`src/lib/mobile/host-top-bar.ts`, so `RedesignedMobileShell` paints `MobileTopBar` above the
record's `MobileDetailTopBar`. The bare queue `/m/on-hold` must KEEP the host bar
(`host-top-bar.test.ts:42` asserts it); records are `/m/on-hold/<sku>…`, so the prefix is
`'/m/on-hold/'` with the trailing slash, like `'/m/exceptions/'`. `/m/exceptions/` is already
registered.

## Real tokens — use these, never literals

Screens mount in `ModeRegion mode="triage"` (`DetailRecordFrame`). The warm palette is
`WARM_SURFACES` in `packages/design-tokens/src/modes.ts`:

| Role | Class | Value |
|---|---|---|
| page inset (text only) | `px-mode-page` | triage 12px base / 16px coarse (phones are coarse) |
| row rule | `border-mode-rule`, `divide-mode-rule` | `#cacbc5` |
| section band ground | `bg-mode-well` | `#e6e7e1` |
| ink (active marker, inversion) | `bg-mode-ink` / `text-mode-ink` / `border-mode-ink` | `#10110f` |
| row ground | `bg-mode-panel` | `#ffffff` |
| bar ground | `bg-mode-bar` | `#f8f8f4` |
| muted text | `text-mode-muted` | `#535650` |
| press duration | `--mode-motion-press` | exists; triage falls back to feedback 120ms |
| radius | `rounded-mode` | `0` in triage/industrial — the box comes from `Panel`'s border, not the radius |

`#cacbc5` is the **rule** colour. A divider band filled with it would swallow the 1px rules above and
below. The band is `bg-mode-well` between two `mode-rule` lines.

Dock height today: `min-h-mode-hit-cta` = 48px (triage sets no `hitCta`, so it falls back to `hit`
48px coarse); `size="glove"` = `min-h-14` (56px). 72px is `min-h-18` on the Tailwind 4 spacing
scale. Do **not** raise `hitCta` on the triage mode: it is a density key that every triage CTA
reads, not just the dock.

## Phase 1 — flatten (approved by operator)

The rule: the route's content wrapper is `flex-1 divide-y divide-mode-rule` with no
`px-mode-page`, `py-mode-page` or `space-y-*`. Rows, cards, fact tables and bars run 0→390.
Only text inside a row keeps `px-mode-page`. Empty/loading copy keeps its own inset
(`px-mode-page py-10`).

Files:

1. `src/app/m/(shell)/r/[id]/lines/page.tsx` (l.47), `src/app/m/(shell)/r/[id]/qc/page.tsx`
   (l.55), `src/app/m/(shell)/on-hold/[sku]/locations/page.tsx` (l.57): remove the padded wrapper.
2. `src/app/m/(shell)/u/[id]/page.tsx` (l.146–200): unbox the Information `Panel`, drop
   `space-y-5`/`space-y-2`, let the heading become the section band (below).
   `src/app/m/(shell)/qc/line/[id]/page.tsx` (l.23) + `src/components/mobile/qc/QcLinePicker.tsx`:
   same, plus the unit list.
3. `src/components/mobile/qc/UnitQcRunner.tsx` (l.44–90): card full width, checklist `Panel`
   unboxed. The "Next unit" bar (l.98) and QcLinePicker's "Scan another label" become flush,
   pinned bars (Phase 3, State 3). "Scan another label" leaves the scroll flow.
4. `src/lib/mobile/host-top-bar.ts`: add `'/m/on-hold/'` with a comment in the house style. Add
   `assert.equal(mobileRouteOwnsTopBar('/m/on-hold/TMP-X/locations'), true)` beside the existing
   bare-queue assertion in `host-top-bar.test.ts`. Also check that `MobileDetailTopBar` now paints the
   scan seat once (it keys off the same predicate).
5. Every `/info` screen: `fnsku/[fnsku]`, `loc/[code]`, `on-hold/[sku]`, `orders/[orderId]`,
   `r/[id]`, `rs/[id]`, `shipping/shipments/[shipmentId]`, `repair-scan` — each has
   `flex-1 space-y-4 px-mode-page py-mode-page` plus bordered `Panel`s. Flatten them; where one screen
   has two `Panel`s (identity facts vs timestamps), separate them with a section band. `rs/[id]/info`
   l.76 and `DetailRecordFrame`'s own error face (`DetailHubScreen.tsx` l.75–91) are bordered rose
   boxes: make them full-width rose bands.
6. `RepairScanCompanion.tsx` l.248/262: bordered pick rows inside padding. Flatten the same way.
   The live screen needs a counter-tablet link; verify it by render or unit-level screenshot, and
   say so if it can't be opened live.

Shared components (change once, not per screen). Run `impact_analysis` first; `DetailParts` is
used by ~20 screens:

- **Section band** = `DetailSectionHeading` (`src/components/mobile/detail/DetailParts.tsx` l.37).
  Make it the divider: full width, `min-h-8` (32px), `bg-mode-well`, rules above and below,
  `px-mode-page`, `font-mono uppercase` caption in `text-mode-muted`. Keep the `id` so
  `aria-labelledby` still works.
- **Fact row** = `DetailFactRow` (l.16): the label becomes `font-mono uppercase`, left, at the inset.
  The value stays `text-right`, sans, at the right inset. Identifiers (SKU, serial, FNSKU,
  location) keep their own `font-mono` span.
- Delete the now-empty `Panel` wrappers. Don't leave a `Panel padding="none"` just to hold rows.

## Phase 2 — press feedback on full-bleed rows

- `DetailNavRow` (l.83) is already a whole-row `<Link>`/`<button>`. Its press is
  `active:bg-mode-hover` (`#f4f4ef` on white, which is invisible). Invert instead: add `group` on the
  row with `active:bg-mode-ink`, and flip the children with `group-active:text-mode-panel` (title,
  meta, chevron) and `group-active:bg-mode-panel` (icon tile). The children set their own colours, so
  the row's `text-*` alone won't reach them.
- `DetailSummaryCard` (`src/design-system/components/DetailSummaryCard.tsx` l.38): same inversion.
- **Instant, not delayed.** The flash is the CSS `:active` state, with no `transition-*`. The
  navigation/verb fires on the tap as normal. Do NOT hold the action for 100ms to show a flash: that
  adds latency to every tap and fights the zero-latency rule.

## Phase 3 — the bottom bar (`DetailDock`, `src/design-system/components/DetailDock.tsx`)

Grow the existing ONE verb bar. Don't add a second bottom-bar component; `pinned.json`
(`src/design-system/pinned.json` → `DetailDock`) and `detail-hub-law.ts` hand it out.

Footprint (all states): `sticky bottom-0` at the end of the flex column (keep it; it already stays
under the thumb and never hides the last row), flush 0→390, `min-h-18` cells, `border-t
border-mode-rule`, `divide-x divide-mode-rule` between cells, `pb-safe`. The `glove` size folds into
this, since 72 > 56; keep its one-row caption layout for three-word verbs.

- **State 3 — focused job (build now).** One verb, full width, bold, centred: "Next unit"
  (`UnitQcRunner`), "Scan another label" (`QcLinePicker`), and any one-verb dock. These two
  hand-rolled bars move onto `DetailDock`.
- **State 2 — selection (build on the real selection).** Split 30/70: left = dismiss cell
  (`[X] 3 SEL`, mono caps, dark: `bg-mode-ink text-mode-panel`), right = the primary verb. The only
  multi-select on the phone today is `/m/rs/[id]/photos` (`selecting` / `selectedIds`,
  l.62–300: a hand-rolled "N photos selected · Cancel" bar with Internal note / Public reply).
  Port that bar onto the dock's selection state. It has two verbs, so settle the 30/70 split with
  two execute cells (see decision D3). Don't invent batch-print or route-to-triage flows; no queue
  has row checkboxes.
- **State 1 — global nav on the bottom (DO NOT BUILD without a ruling; see D1).**

Misclick engineering (inside `DetailDock`, once):

- **Leading-edge lock, not a trailing debounce.** Fire on the first tap; ignore further taps on that
  bar for 500ms, or until the verb's promise settles if `onVerb` returns one. A trailing debounce
  would delay every action by 500ms.
- Press inversion: CSS `:active`, with no transition. `Button`'s `PRESS_FEEDBACK` is
  `enabled:active:scale-[0.96]` (`src/design-system/primitives/Button.tsx` l.126). That is a
  transform, so a flush cell visibly shrinks off its rules. Turn it off for dock cells
  (`active:scale-100` via className, or a `press="invert"` prop if other flush bars need it too).
- Haptics: reuse `vibrateScan` / `useScanFeedback` (`src/lib/scan-feedback/`), gated on the staff
  toggle `receiving.scanHaptics` (registry l.416, default **off**). `navigator.vibrate` does **not
  exist on iOS Safari**, so iPhones get the visual inversion only. Don't claim a haptic on iPhone.

Motion: nothing on the floor moves. Industrial mode says "150ms is the scan-status spot only";
triage's only motion token is its 120ms `feedback`. No `motion` / `transition-*` on rows, lists,
docks or state swaps; a dock changing state swaps instantly. Springs stay in the `assistant` mode
surfaces only.

## Decisions the operator must make (ask before building these)

- **D1 — bottom global nav.** The phone had one and it was removed: `MobileSidebarDrawer.tsx`
  l.33–37 says it "replaces the fixed bottom nav (RedesignedBottomNav) … Moving navigation off the
  bottom edge stops the accidental taps that plagued the bar and frees the very bottom of each page
  for the page's own contextual content/actions." State 1 would bring it back. Default until ruled:
  not built; hubs keep the verb dock, queues keep the drawer.
- **D2 — State 3 fill.** Today the primary cell is `variant="primary"` (blue). The triage brief says
  "neutral decisions, primary = ink fill" (`button-variants.ts` `ink`). The operator's prompt says
  solid green / amber by outcome. Default until ruled: keep `primary`; use `success` / `warning` only
  where the verb's outcome is itself that state (pass / hold), with their `shadow-*` stripped.
- **D3 — two-verb selection.** Photos has Internal note + Public reply. Options: 30 dismiss / 35 / 35,
  or 30 dismiss / 70 primary with the second verb in a sheet. Default: 30/35/35.

## Test records (org `…0001`, live on 2026-09-25)

| Screen | Record |
|---|---|
| carton lines / QC | `/m/r/53050/lines`, `/m/r/53050/qc` (5 lines) |
| SKU exception + locations | `/m/on-hold/TMP-RPKWJ-9EYZM` (2 locations; also `TMP-SWGS8-SAXFW`) |
| unit hub / unit QC | `/m/u/1277` (serial `033975C61185796AC`), `/m/u/1277/qc` |
| QC line pick | `/m/qc/line/32624` (4 units), `/m/qc/line/4078` |
| FNSKU hub / info | `/m/fnsku/X004O69DL9` (has condition), `X002LXYGWN` (long title), `X0036X1R51` (tail `36X1R51`) |

## Proof (at `:3050` only)

1. Session: `LH_STAFF_NAME="QA Mobile Verifier" node scripts/lighthouse-mint-session.mjs` → prints
   `cf_sid=…`. Pass it as a cookie on `localhost`.
2. Screenshot + measure at 390×844 (`devices['iPhone 13']`, import from `@playwright/test`; plain
   `playwright` is not installed). Set `sessionStorage['cf-install-dismissed']='1'` via
   `addInitScript`, or the "Add to Home Screen" banner (`InstallPrompt.tsx`) covers the dock.
   For each `nav[aria-label]` and summary card, log `getBoundingClientRect()` left→right, row
   heights, `borderRadius` and `borderBottomWidth`. Put the script in a `.tmp-*.mjs` at repo root
   (so it resolves `node_modules`) and delete it at the end.
3. Accept when every screen in the table above measures card/rows/fact rows/section band/dock at
   0→390, radius 0, with no vertical gap between blocks (each block's top = previous block's bottom
   + 1px rule). Dock cells are ≥72px, and there is exactly one header on `/m/on-hold/<sku>` and its
   doors. Also check a hub still passes (`/m/fnsku/X004O69DL9`).
4. Press/lock: in Playwright, `dispatchEvent('click')` twice within 100ms on a dock verb whose
   handler you count (intercept the network call it makes). It must fire once.
5. `node tools/design-mcp/ds.mjs critique <file>` on each changed UI file;
   `pnpm verify:fast`. Known reds that are not this work: `GlobalDetailStackHost.tsx`
   (`disableMoveUp`), the `Desk surface` guard baselines, `nav-registry.test.ts` (`/m/label-intake`).
   Re-check them before blaming this work.

## Leave alone

- `/m/scan` nested-`<button>` hydration error (`MobileStationTapeItem`) — another lane.
- The FNSKU label layout and print count — done last session (`fnsku-reprint-HANDOFF.md`).
