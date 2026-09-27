# HANDOFF — Verify the Outbound contextual sidebar, page by page

**Paste everything below the rule into a fresh session pointed at
`/home/michaelgarisek/Projects/cycleforge-lanes/prod`.** Written 2026-09-27, after
the sidebar QoL round. Companion build prompt: `HANDOFF-paste-a-list.md`.

---

You are verifying, and fixing only where it fails, the **contextual left sidebar
for Outbound**. Check every Outbound page and view against one design system.
Scope is the sidebar only. The data table and page header belong to another
session. Do not edit `src/components/outbound/**`, `src/components/unshipped/**`,
`src/components/tables/**`, `src/components/desk/**` or `src/app/shipping/**`;
report problems there instead.

## Read first

1. `AGENTS.md`: probe only `http://localhost:3050`; `pnpm verify:fast` before done.
2. Laws: `node tools/design-mcp/ds.mjs contract "<intent>"` for `ContextualSidebar`,
   `NavFind`, `NavSectionList`, `NavModeSwitcher`, `KeyboardKey`. The source is
   `src/design-system/pinned.json`. When code and law disagree, the law wins. Fix
   the code, or ask the operator before changing the law.
3. Code, all under `src/components/sidebar/contextual/`:
   - `ContextualSidebar.tsx`: the host.
   - `NavFind.tsx`: `NavGlobalSearch` (⌘K face) and Find (`F`).
   - `NavModeSwitcher.tsx`, `NavSectionList.tsx` (views, counts, hotkeys,
     hairlines), `NavFilters.tsx` (filter rows, zero options, saved-view presets).
   - `nav-block.ts`, `nav-view-icons.ts`, `useLaneDoorHref.ts`.
   - Server contract: `src/lib/nav/context/{build,pages,resolve,schema}.ts`.
   - Lane doors: `LANE_DOORS` in `src/lib/nav/lanes.ts`.
4. Sign-in for probes: mint a staff session, then drive Playwright from a
   throwaway script **inside** the repo (e.g. `scripts/.tmp-probe.mjs`,
   `import { chromium } from '@playwright/test'`). Scripts under `/tmp` cannot
   resolve `node_modules`. Delete it when done.
   ```sh
   cd /tmp && rm -f cj && id=$(curl -s -H 'x-tenant-slug: usav' http://localhost:3050/api/auth/staff-picker | python3 -c "import json,sys;d=json.load(sys.stdin);print(next(s['id'] for s in d['staff'] if s['name'].lower().startswith('michael')))") && curl -s -c cj -H 'x-tenant-slug: usav' -H 'content-type: application/json' -d "{\"staffId\":$id,\"deviceKind\":\"personal\"}" http://localhost:3050/api/auth/signin
   ```
   Michael has Shipping on the contextual sidebar through the staff setting
   `nav.contextual.outbound`. Everyone else is still `legacy` until
   `NAV_CONTEXT_ROLLOUT.outbound` flips in `src/lib/nav/context/rollout.ts`.

## The design system (what "correct" means)

**Pinned head** (does not scroll, is always present):
1. Collapse icon, then **global search**: a sunken 32px well with a 6px corner,
   reading `🔍 [Ctrl][K] Search` (⌘ on Mac). It opens the ⌘K palette.
2. **Find**: the same well, reading `🔍 [F] Find <view noun>` (e.g. "Find orders
   to ship", "Find shipments"). It narrows only the list on screen. Bare `F`
   focuses it from anywhere that is not a text field.
3. **`‹ Outbound`**: a pressable block. It lifts on hover (ring and shadow) and
   sinks 1px on press. Clicking it shows the page map in the SAME block style,
   and Find does not move.
4. **Mode switcher** `Shipping ▾`, which lists Shipping ✓ · FBA · Label intake.

**Hotkey first:** in every search and every button that shows a shortcut, the
keycap sits between the glyph and the text, never at the far right.

**Body** (scrolls):
- **Views** as blocks, each reading `[glyph] [digit] Label … [count]`.
  - Keys `1`–`5` switch views.
  - One lit plate slides between views.
  - Categories are separated by hairlines; there are no text headings.
  - Counts are the unfiltered totals from `/api/nav/facets?context=outbound.<view>`.
    Exceptions shows amber when its count is above 0.
- **Filters**:
  - A hairline opens the section. The active count and a Reset button ride the
    line only while a filter is on.
  - Each filter is a closed row showing its current value as a chip. Clicking
    opens the options with counts.
  - Zero-count options are dimmed and sorted last, unless selected.
  - Saved views are one-click preset blocks. Save view appears only while filters
    are on; hover × deletes a view you own.

**Page map** (after `‹`, and on every non-contextual page in the old sidebar):
- The top rows, then the lanes, then Automations, then **Scan Stations at the
  very bottom**.
- **Outbound is ONE row**, with no Shipping / FBA / Label intake children. It
  opens your last Outbound view, or Exceptions on a first visit.

**Switching** between the page map and a contextual page is a short blur-and-slide.

## Page-by-page checklist

Run every row on every page. Record pass or fail with evidence: a screenshot of
the sidebar clipped to x 0–420, and an API number where the row has one.

| # | Check | How |
|---|---|---|
| 1 | Head order and wells are 32px | Bounding boxes of `[data-nav-global-search]` and `[data-nav-find]`: height 32; Find sits directly under global search |
| 2 | Hotkey first | In both wells, the kbd's x is less than the text's x |
| 3 | `F` focuses Find, and never while typing | Press f → `activeElement` aria-label is the Find placeholder. Type into Find: no view switch, no refocus |
| 4 | Find narrows the list | Type a known order number and read the list count before and after |
| 5 | Back hover and press depth | Hover and mouse-down `[data-nav-back]`: computed box-shadow and ring change, translateY(1px) on press |
| 6 | `‹` keeps Find in place | Find's box is identical before and after clicking `[data-nav-back]`, and the map uses block rows |
| 7 | Mode switcher | `[data-nav-mode]` lists Shipping ✓ · FBA · Label intake; each goes to its page |
| 8 | Views, glyphs, digits | Each view row reads glyph → digit keycap → label; keys 1–5 land on the matching view |
| 9 | Counts equal the API | For each view, the painted count equals `GET /api/nav/facets?context=outbound.<view>`'s `total` with the view's own params |
| 10 | Filters | Open a row, pick an option: the URL param is set, the chip shows the value, the count badge and Reset appear; Reset clears it |
| 11 | Zero options | Zero-count options are dimmed and last; a selected zero option returns to its slot |
| 12 | Saved-view presets | Save with a name, apply, clear, delete; confirm against `/api/saved-views` |
| 13 | Lane door memory | Visit a view, go to another page, click Outbound in the map: it lands on the remembered view |
| 14 | Map order | Scan Stations is the last category; Outbound is a single row |
| 15 | No page errors that come from sidebar files | Collect `pageerror`. Errors from `OrderCardList.tsx` belong to the other session: list them, don't fix them |
| 16 | Reduced motion | With `prefers-reduced-motion: reduce` emulated, the swaps and plates are instant and no blur remains |
| 17 | Keyboard only | Tab through the head, views and filters: visible focus rings, Enter or Space activates, Esc closes menus |

Pages to run:
- `/shipping/exceptions`
- `/shipping/shortage?pair=po`
- `/shipping/orders?queue=pick`
- `/shipping/orders` (To ship)
- `/shipping/shipped`, which also has the **Date** row and the Carrier, Type,
  Tracking status and Needs attention filters
- `/shipping/fba` and `/shipping/label-intake`: these are still on the OLD sidebar
  (see known gaps). There, check only that the page map shows Outbound as one lit
  row, that global search is the same well, and that Scan Stations is last.

## Known gaps (do not "fix" silently; report)

- **Recents:** no Shipping recents surface exists in
  `src/lib/nav/recents/surfaces.ts`. Closing it needs two things: a surface
  (`nav_recents`-backed), and a `POST /api/nav/recents` writer where a record
  opens. The writer lives in the data table, which is off-limits for this session.
- **FBA and Label intake** have no contextual panels yet. Choosing them in the
  mode switcher drops you onto the old sidebar. Each needs a port: its
  `NAV_PAGE_DECLS` entry, parity rows in `PARITY.md` (the parity checklist in
  `docs/refactors/sidebar/`), then `rollout`. Do that as separate PRs.
- **Paste a list** (multi-line identify in ⌘K and Find) is specified in
  `HANDOFF-paste-a-list.md`.
- **Hard reload onto a contextual page:** the sidebar resolves its rollout after
  the first paint, so the map-to-contextual morph can play once. Confirm whether it
  reads as a flash. If it does, gate the first mount (`initial={false}` already
  applies to in-app swaps).

## Done means

- Every checklist row passes on every Shipping view, with evidence.
- These tests are green:
  `node --test --import tsx src/lib/nav/context/resolve.test.ts src/lib/nav/spine-slots.test.ts src/lib/sidebar-navigation.test.ts`
- `npx tsc --noEmit -p . ; echo exit=$?` reports exit 0.
- `pnpm verify:fast` passes.
- Any law you changed is back in `pinned.json` as valid JSON, and
  `ds.mjs contract` returns it.
- Then report: the table of results, the fixes you made (with files), and the
  gaps you reported.
