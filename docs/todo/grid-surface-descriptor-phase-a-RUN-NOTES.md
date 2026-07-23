# RUN NOTES — Grid Surface Descriptor, Fable 5 full-plan run (2026-07-22)

Handoff record for the execution prompt
([`grid-surface-descriptor-EXECUTION-PROMPT.md`](./grid-surface-descriptor-EXECUTION-PROMPT.md))
run against plan SoT [`grid-surface-descriptor-plan.md`](./grid-surface-descriptor-plan.md).
The human overrode the prompt's "stop after Phase A" in chat and directed the
**complete plan**; Phases A–D landed, Phase E held at its ask-first gate.
All work **uncommitted on `main`** (HEAD unchanged: `eb56e9748`).

## Prompt commands — all green

| Command (prompt §4) | Result |
|---|---|
| `npm run verify` | **PASSED** (lint · typecheck · unit+DS guards · knip · route-auth · schema drift; tenancy-static advisory only) |
| `npx playwright test tests/e2e/to-ship-pending-grid.spec.ts --project=desktop` | 9 passed |
| `npx playwright test tests/e2e/orders-queue-skin-scoping.spec.ts --project=desktop` | 3 passed |
| `npx playwright test tests/e2e/pending-grid-tanstack-tested.spec.ts --project=desktop` | 11 passed |
| (bonus) `tests/e2e/unshipped-virtual-list.spec.ts` (rewritten grid-era) | 1 passed |
| Consolidated single run of all four files | **24 passed** |

Screenshots under `test-results/`: `pending-grid-tested-lane.png`,
`pending-grid-default-lane.png`, `pending-grid-kpi-toggle.png`,
`pending-grid-tested-sort.png`, `pending-grid-fold-expanded.png`,
`pending-grid-windowed-tested.png`, `pending-grid-packed-isolation.png`,
plus the `to-ship-pending-grid-*.png` set (frozen h-scroll = `…-view.png`,
reorder, typed headers, gridlines).

## Feature matrix (prompt §4) — per-row verdicts

Covering test: `TS` = `to-ship-pending-grid.spec.ts` · `NEW` =
`pending-grid-tanstack-tested.spec.ts` · `SKIN` = `orders-queue-skin-scoping.spec.ts`
· `VL` = `unshipped-virtual-list.spec.ts` · `UNIT` = `orders-queue-column-defs.test.ts`.

| Row | Verdict | Evidence |
|---|---|---|
| A1 grid mounts | **PASS** | TS + every NEW test (`pending-grid-body` visible) |
| A2 scroll surface | **PASS** | TS frozen-pane (h-scrolls `pending-grid-scroll`) |
| A3 airtable skin | **PASS** | SKIN (white full-bleed `data-grid-skin` shell) |
| A4 no day bands | **PASS** | TS + NEW (0 `[data-grid-day-band]`, re-checked post-sort) |
| A5 no retired columns | **PASS** | TS (`notes`/`stock` count 0) |
| A6 sticky header | **PASS** | TS KPI-scrolls-away + SKIN sticky (fixed via LedgerGrid split-x) |
| A7 queue sort chrome | **PASS** | TS (`[data-queue-sort-switch]` visible) |
| A8 packed skin isolation | **PASS** | NEW J1/J3+A8 (no TESTED leak with `?ustatus=TESTED` in URL) + SKIN Packed |
| B1 canonical headers | **PASS** | TS (label or sr-only per track; never `A…`) |
| B2 header↔body lock | **PASS** | TS (±4px platform/order/tracking) + NEW (tester/testedAt) |
| B3 column rules | **PASS** | TS gridlines + SKIN cell border-right |
| B4 status column | **PASS** | TS (PENDING/TESTED/OUT OF STOCK vocabulary) |
| B5 empty-tracking filter | **PASS** | TS (no `[data-add-label]`) |
| B6 platform marks | **PASS** | TS (fixed <64px icon track, sr-only name) |
| C1 frozen identity | **PASS** | TS (sticky title pinned; fact cols scroll under) |
| C2 select gutter | **PASS** | NEW C2/C3/D3 (row checkbox + select-all arm/clear) |
| C3 row open | **PASS** | NEW (row-body click dispatches `open-shipped-details`) |
| C4 no row drag grips | **PASS** | TS + NEW (0 `.cursor-grab` on rows) |
| D1 composite sorts | **PASS** | NEW G10/D1 (QueueSortSwitch → `?sort=newest`) |
| D2 column header sort | **PASS** | TS (`?sort=title` asc → `dir=desc`, aria-sort) |
| D3 reload durability | **PASS** | NEW (deep-linked `sort=title&dir=desc` survives reload) |
| D4 flat column-sort band | **PASS** | NEW (0 day bands under column sort) |
| E1 singleton rows | **PASS** | NEW (unique order renders plain row) |
| E2 multi-line fold | **PASS** | NEW (one `data-grid-summary-row` per shared order) |
| E3 expand / collapse | **PASS** | NEW (children reveal, then hide) |
| E4 columns track fold | **PASS** | NEW (summary cells lock to header tracks ±4px) |
| F1 qty edit commits | **PASS** | TS (live `/api/orders/assign` roundtrip + restore) |
| F2 F2/Enter starts edit | **PASS** | NEW (F2 on focused qty cell opens focused editor) |
| F3 Esc revert | **PASS** | TS + NEW (no request; value restored) |
| F4 blur/Tab commit | **PASS** | NEW (Tab commits; payload `{orderId, quantity}` captured) |
| F5 condition pill listbox | **PASS** | NEW (grade select persists via assign payload) |
| F6 corner indicators | **PASS** | NEW (note opens editor; OOS present on BLOCKED row) |
| G1 filter PENDING | **PASS** | NEW (only pending rows; default columns) |
| G2 filter TESTED | **PASS** | NEW (`data-col="tester"`/`"testedAt"` headers + cells) |
| G3 filter BLOCKED | **PASS** | NEW (Out of stock vocabulary; no crash) |
| G4 clear filter | **PASS** | NEW (default fulfillment set restored) |
| G5 KPI / strip sync | **PASS** | NEW ("Ready to pack"/"Awaiting test" tiles drive URL + columns) |
| G6 TESTED tester cell | **PASS** | NEW (scan-actor > assignee precedence; em dash when missing) |
| G7 TESTED tested-at cell | **PASS** | NEW (`formatDateTimePST` shape; `test_date_time` preferred; `'1'` → em dash) |
| G8 status demotion | **PASS** | NEW (absent on TESTED view; present on default) |
| G9 mode switch no freeze | **PASS** | NEW (TESTED→PENDING→TESTED client-side repaints) |
| G10 sort under TESTED | **PASS** | NEW (title asc/desc; tester/testedAt outside `?sort` vocab) |
| H1 viewport force-hide | **PASS** | NEW (tight port hides By; Age/Cond/Order/Tracking/Product stay) |
| H2 widen restore | **PASS** | NEW (columns return without reload) |
| H3 staff hide | **N/A (documented)** | Pending exposes no Fields/TableOptions menu (retired by minimal-simplify); prompt's own "if Phase A still exposes it" condition is false |
| H4 column reorder | **PASS** | TS (drag persists across reload; `select·title` locked; dbl-click reset) |
| I1 virtual window | **PASS** | NEW (400 rows → <150 DOM) + VL (500 rows, page-scroll recycle) |
| I2 scroll + toggle usable | **PASS** | NEW (deep scroll → TESTED toggle → header + windowed rows) |
| I3 ancestor page scroll | **PASS** | TS (KPI scrolls away; header docks under chrome) |
| J1 no AG Grid / MUI DOM | **PASS** | NEW (`.ag-root` / `MuiDataGrid` count 0) |
| J2 no day-band revival | **PASS** | NEW + TS |
| J3 no drag-resize revival | **PASS** | NEW (no `Resize` handles on headers) |
| J4 `"use no memo"` present | **PASS** | UNIT (static prologue assert on `useGridSurface.ts`) |

## Prompt terms — compliance

- **Read-first (§1–7):** plan SoT read in full before writing; `AGENTS.md`/rules
  auto-loaded; `DESIGN_SYSTEM.md` grid section read (and updated); prior Pending
  art honored (no drag-resize/day-band/notes-stock revival); all listed specs +
  key code files read; `pnpm worklog:tail` run before starting.
- **Locked decisions 1–10:** all honored — hybrid B- (v8; v9 not verified
  stable → `"use no memo"` shipped); Pending-only Phase A scope; TanStack =
  defs + sort + visibility (+ order) only; house kept template/`--cf-orders-grid-w`/
  frozen offsets/force-hide/order-folds/F2 editors/`useOrderAssignment`/URL SoT;
  TESTED columns authored as TanStack defs day one; §9 field contract implemented
  (`queueRowTesterNameRaw` / `queueRowTestedAtRaw` / `formatDateTimePST`); closed
  options untouched; proof = Playwright.
- **Hard rules:** presentation via SoTs only (no page-local hex/status maps);
  **no commit, no stash, branch `main` unchanged** (HEAD still `eb56e9748`);
  verify green with **no ratchet-baseline raises** (knip finished 2 UNDER
  baseline); worklog entries appended per unit; stable selectors
  `data-col="tester"` / `data-col="testedAt"` emitted on header + cells.
- **Approval gate:** no public `LedgerGrid` prop-API change was required (the
  split-x sticky fix is internal; `LedgerGridSurface` is additive); no
  staff-prefs schema migration; TanStack **grouping** not started — held at the
  gate and surfaced to the human (plan Phase E status).
- **§5 close-out:** verify green · Playwright green · plan status updated ·
  worklog written. The "stop before Phase B–E" line was overridden by the human
  in chat ("execute the complete plan"), which the prompt's plan-wins clause
  permits; B–D executed, E remains gated.

## Beyond-prompt fixes shipped in the same run

- **LedgerGrid split-x mode** — Pending's sticky column header was broken on
  main (`overflow-x:auto` captured sticky on both axes; baseline suite was red);
  header band now sits outside an inner h-scroll box, translated via
  `--cf-grid-sx` with counter-translated frozen cells.
- Stale specs repaired: `orders-queue-skin-scoping` (full-bleed shell contract),
  `unshipped-virtual-list` (rewritten for the grid-only queue).
- Pre-existing red e2e NOT from this run (chrome drift from earlier WIP):
  `dashboard-inbound-mode.spec.ts` (2) · `receiving-tech-modes.spec.ts:241`.
