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
   - `NavFind.tsx`: THE search field — page scope (chip, `F`, narrows the list) or everywhere (the ⌘K face).
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
| 1 | Head order and the well is 32px | Bounding box of `[data-nav-search-well]`: height 32, in the top band beside collapse; `[data-nav-back]` sits directly under it |
| 2 | Hotkey first | In the well (either scope), the kbd's x is less than the text's x |
| 3 | `F` focuses Find, and never while typing | Press f → `activeElement` aria-label is the Find placeholder. Type into Find: no view switch, no refocus |
| 4 | Find narrows the list | Type a known order number and read the list count before and after |
| 5 | Back hover and press depth | Hover and mouse-down `[data-nav-back]`: computed box-shadow and ring change, translateY(1px) on press |
| 6 | `‹` keeps Find in place | Find's box is identical before and after clicking `[data-nav-back]`, and the map uses block rows |
| 7 | Mode switcher | The mode icon is in its mode colour (Shipping blue, FBA purple, Label intake teal). Hover `[data-nav-switcher="mode"]`: `[data-nav-key-hint="parent"]` appears at once right of the column (x ≥ its right edge), leads with `[G] then`, rows `[S] Shipping · [F] FBA · [L] Label intake` in colour; no `[data-nav-go-shade]`. Click: `[data-nav-switcher-list="parent"]` hangs as an overlay welded to `[data-nav-mode-card]` (no gap: one shared hairline, square corners at the seam) — the card's box and the view block's y are unchanged — listing the OTHER modes only, no `kbd`, each row's icon at the card icon's x; ↓ focuses the first row; Esc closes it from anywhere (focus back on the card when it was inside); a press outside closes it |
| 7b | Same parent tier on every mode | On EVERY page of a door lane — Shipping, FBA, Labels & docs; Deliveries, Sourcing — `[data-nav-back]` reads the lane (`Outbound` / `Inbound`), never the page, and `[data-nav-switcher="mode"]` is present with that page current, listing the lane's other modes (door first). Pinned by `resolve.test` "every mode of a door lane…"; a page added to the lane inherits it with no declaration |
| 8 | View switcher, glyphs, digits | Hover `[data-nav-switcher="view"]`: `[data-nav-key-hint="child"]` rows read digit → glyph (flush) → label. Click: `[data-nav-switcher-list="child"]` (a different component from the mode card) hangs as an overlay card welded to the block (no gap: one shared hairline, square corners at the seam) — same left/right edges, row icons at the block icon's x, the block's box and everything below unchanged — the OTHER views as text with their counts (never the current one); Esc closes it from anywhere; a press outside closes it; keys 1–5 land on the matching view with nothing open. Hover the header title `[data-nav-view-title]` (`To ship ›`): grey bubble, `[data-nav-key-strip-view]` pills start 12px right of it, ring fully visible; they stay after hover-off and fold on Esc, a press outside, or a pill chosen |
| 9 | Counts equal the API | For each view, the overlay's `[data-nav-view-count]` equals `GET /api/nav/facets?context=outbound.<view>`'s `total` with the view's own params; off Exceptions, the closed block's `[data-nav-view-alert]` shows the Exceptions total |
| 10 | Filters | Open a row, pick an option: the URL param is set, the chip shows the value, the count badge and Reset appear; Reset clears it |
| 11 | Zero options | Zero-count options are dimmed and last; a selected zero option returns to its slot |
| 12 | Saved-view presets | Presets sit at the top of the body, ABOVE the filter hairline; `Save view` appears only while unsaved filters are on. Save with a name, apply, clear, delete; confirm against `/api/saved-views` |
| 13 | Lane door memory | Visit a view, go to another page, click Outbound in the map: it lands on the remembered view |
| 14 | Map order | Scan Stations is the last category; Outbound is a single row |
| 15 | No page errors that come from sidebar files | Collect `pageerror`. Errors from `OrderCardList.tsx` belong to the other session: list them, don't fix them |
| 16 | Reduced motion | With `prefers-reduced-motion: reduce` emulated, the swaps and plates are instant and no blur remains |
| 17 | Keyboard only | Tab through the head (Find, `‹`, mode and view switchers), saved views and filters: visible focus rings, Enter or Space activates (Enter on a switcher opens its menu with focus inside), Esc closes menus |

Pages to run:
- `/shipping/exceptions`
- `/shipping/shortage?pair=po`
- `/shipping/orders?queue=pick`
- `/shipping/orders` (To ship): no sort anywhere in the list — not the select bar
  (`[data-testid=data-table-sort]` absent, cards and floor), not the ship-by
  section headers. The sidebar Sort lists every order the retired ⇅ menu had
  (view + column orders, no platform / carrier pins) and writes `?sort=`/`?dir=`.
  The status chips stay above the list.
- `/shipping/shipped`, which also has the **Date** row and the Carrier, Type,
  Tracking status and Needs attention filters
- `/shipping/fba` (contextual since 2026-09-27): views **Ready · Plan · Combine · Shipped ·
  Catalog** in the view block, each on its `?fbaMode=` (Combine = bare `/shipping/fba`),
  glyphs in the purple family. No tab row in the stage, no mode options in Ready's table
  filter. Bare `1`–`5` land on those URLs in that order; reload and back/forward change
  nothing; the child overlay lists the other four. `G S` / `G L` leave, `G F` stays.
- `/shipping/label-intake` (contextual, ported by the Labels session): views To print ·
  Printed (`?view=record`), header Print all (⌘P) · Upload (⌘O); row 7b holds (`‹ Outbound`,
  mode card on Labels & docs).
- `/sourcing` (contextual since 2026-09-28): views Queue · Scout · Watchlist · Searches ·
  Suppliers · Models · Compatibility on `?mode=` (Queue bare), keys `1`–`7`, no tab row, no
  old context panel. Filters: Queue **Status** (Resolved · Dismissed; unset = Open),
  Watchlist **Status** (Watching · Ordered · Imported), Suppliers **Type**, Scout **Look up by**
  (Model · Serial). Find: Scout / Suppliers `?q=`, Models / Compatibility `?search=`; Queue ·
  Watchlist · Searches read no text, so they show the ⌘K face. Models: header **Add model**
  (`?model=new`); the model picker is in the stage, left of the record (`BoseModelPickerPane`).
  `G D` / `G S` from Sourcing. Phones never reach `/sourcing` (not in `isMobileAllowedPath`).
- `/incoming` (On the way): the ledger toolbar has no Filter funnel and no Sort; the
  status chips stay above the list. The body has **Save view**, **Sort**
  (`?colsort=`/`?coldir=`) and **Source** (`?inbound=`; picking one drops `?page=`).
- Both Inbound views: bare `1` lands on On the way and `2` on History (`viewKeys`); the header
  title carries `›` and its pills.
- `/incoming?lane=docked` (Inbound History): the toolbar has no State menu, Sort or
  week pill. The body has **Save view**, **Sort** (`?colsort=`/`?coldir=`),
  **Handled by** (`?staff=`), **Activity date** (`?dateFrom=`/`?dateTo=`, clears
  `?weekOffset=`), **Activity** (`?sort=` Unboxed / Scanned at the door) and **State**
  (`?dstate=`); each survives a reload and a saved view
  (`receiving_history_saved_views`). The Unbox History tab keeps its own toolbar
  (it has no contextual sidebar).
- Both Inbound views, **Find**: typing writes `?find=` (not `rh_q`, the server search);
  reload, a fresh tab on the URL and a saved view keep it. Find naming exactly one card
  (PO / order number, carton, full tracking) opens it at once (`?openLine=`) — the card
  faces' `exactFind`; a partial only narrows.
- **Inbound door memory:** visit History, go to Sourcing, `G D` lands on History; from a
  Shipping page the map's Inbound row points at `/incoming?lane=docked`.
- `/inventory/*` (contextual since 2026-09-28; lane door `inventory`, `G I` / `G Q`): the
  landing mode is named **Warehouse** (the lane is Inventory — nav-name law), tone emerald.
  Views Stock · SKU Exceptions (`/inventory/stock?status=on-hold`, where the old redirect
  lands) · Ledger · Replenish · Locations bind `1`–`5`; the parked views (Tracking
  Exceptions, Pulse, Graph, Reason Codes, Quick Picks, Health) stay off the block. No tab
  row. Filters: Stock / SKU Exceptions **State** (`?status=` Catalog paired · On hold) and
  Find `?q=`; Replenish **List** (`?rtab=`) · **Status** (`?rstatus=`) and Find `?rsku=`
  (all three were stripped by hygiene since the rail left on 2026-09-15); Locations
  **Tool** (`?tab=`, bare = Bin Tags) replaces the stage dropdown. Stock's Rooms stay in the
  toolbar (per-tenant facet with counts). Ledger shows the ⌘K face.
- `/inventory/qc-labels` (**QC labels** mode, amber): views All labels · In stock
  (`?view=stock`) · On orders (`?view=order`), Find `?q=` (serial, unit id, SKU, title,
  order), header **Print QC label** (scan a serial or old label → prints + writes
  `label_print_jobs`, `UNIT` or `REPRINT`). A record (`?open=<serial_unit_id>`) shows the
  label, QC tester, the order it is held for and **Serial on order** — the pick closes it.

## Known gaps (do not "fix" silently; report)

- **Recents:** no Shipping recents surface exists in
  `src/lib/nav/recents/surfaces.ts`. Closing it needs two things: a surface
  (`nav_recents`-backed), and a `POST /api/nav/recents` writer where a record
  opens. The writer lives in the data table, which is off-limits for this session.
- **Label intake** has no contextual panel yet (its rebuild is in flight in another
  session). Choosing it in the mode switcher drops you onto the old sidebar. It needs
  its `NAV_PAGE_DECLS` entry, parity rows, then `rollout`.
- **FBA's FNSKU scan field:** `NAV_PAGE_DECLS.fba.scanInput` is declared (the parity
  row passes) but no contextual component paints `scanInput` yet, so the FNSKU bar of
  the legacy panel (`FbaWorkspaceScanField`, mounted only by the `/fba` redirect's route
  key) is still not on the live page.
- **Shipping Find** stays desk-local (operator ruling in `outbound-routes.ts`): no URL
  param. Only Inbound carries `?find=`.
- **Paste a list** (multi-line identify in ⌘K and Find) is specified in
  `HANDOFF-paste-a-list.md`.
- **Find hydration (foreign, 2026-09-28):** on a second load of any page whose view
  declares a url-param Find (`/sourcing?mode=scout`, `/incoming`, `/inventory/stock`,
  `/inventory/qc-labels`), `GlobalHeaderSearch` → `NavFind` renders the page face on the
  client and the "everywhere" face on the server → `Hydration failed`. Pages whose view
  has no Find (`/inventory`, `/shipping/fba`, `/sourcing`) are clean. `NavFind.tsx` /
  `GlobalHeaderSearch.tsx` are another session's live edits.
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
