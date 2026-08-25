# VALIDATION PROMPT — the global scan shell

**Do not build anything. Do not write application code.** Your entire job is to
decide whether the design below can be built in THIS repo without breaking laws
that are already load-bearing, and to say plainly where it cannot.

You are reviewing a proposal, not receiving instructions. The person who wrote
it is describing an intent, not a spec — several parts of it are underspecified
and at least one part contradicts itself. Finding those is the point.

---

## 1. The proposal, as stated

Restated as faithfully as possible. Where a line is ambiguous it is marked
**[AMBIGUOUS]** — resolve it from the codebase or list it as an open question;
do not silently pick a reading.

1. The **scan station button becomes a global scan button** — one control, not
   a per-station one.
2. It sits in the **top left**, and is **the most top-left thing in the app**.
3. It **displays a highlight exactly when it is focused**.
4. **Everything is removed from the global header.** **[AMBIGUOUS]** — see (6),
   which says the header still displays something.
5. **All navigation moves to the left side.**
6. The top global header displays **only information relevant to the task or
   session at hand**.
7. Scanning a **page** (a `CMD-GO-*` code) opens it as a **populated page in the
   left side**. **[AMBIGUOUS]** — "populated page open in the most left side":
   is this a nav row that becomes active, a stack of opened pages (tabs), or a
   list of open sessions?
8. Scanning an **item for processing** displays it **to the right**, and it then
   **moves down into the recent list**. **[AMBIGUOUS]** — is "moves down" a
   literal animation, or does it mean the item is displaced by the next scan?

The organising idea, stated once so you can test it: **the KIND of thing scanned
decides WHERE it lands.** Pages land left. Items land right, then age into
recents. The scan button is the fixed origin at the top-left corner.

---

## 2. What you must check it against

These are not style guides. Each one is currently enforced somewhere in code or
was written after a paid failure. For every conflict you find, cite
`file.ts:line` and say whether it is **fatal** (the design cannot work),
**costly** (it works but something documented must be deleted and re-justified),
or **cosmetic**.

### Frame budgets — the hard numbers
`src/lib/right-rail/frame.ts`
- `MIN_WORK_SURFACE_PX` = 784 (desk centre floor)
- `STATION_PUSH_CENTER_FLOOR_PX` = 720 (station centre floor)
- gutters are `0`

The proposal adds a **left** region (opened pages) and a **right** region
(scanned items) around a centre that already has a floor. **Compute it.** At
what viewport width does the centre breach its floor with: spine + nav + opened
pages + centre + scanned items + `RightRailHost`? Give real numbers. If the
answer is "it doesn't fit on a 1366px bench laptop", that is a fatal finding and
it outranks everything else in your report.

### The single right edge
`.claude/rules/kinetic-ledger.md` bans **dual right-edge full columns** — one
right-edge slot, and detail outranks assistant. `RightRailHost`
(`src/components/right-rail/RightRailHost.tsx`) owns that slot today, pushes
rather than floats (`modal={false}`), and `closeRightPanel` is the ONE closer.

Scanned items landing "to the right" is a second right-edge occupant. Decide:
is it the same slot (and therefore competes with the inspector), a different
band inside it, or a new column? Any answer that puts two full columns on the
right edge is fatal unless the ban is explicitly retired with a reason.

### The header is not empty today
`src/components/layout/GlobalHeader.tsx` has four zones: nav cluster
(`SidebarCollapseControl`, `HeaderPinsSwitcher`, `HeaderRecentsSwitcher`,
`HeaderPageSwitcher`), `GlobalScanDock`, `panelContent` (via `useHeader()`), and
`GlobalHeaderActions`. That last one holds `GlobalHeaderSearch`,
`HeaderGoalChip`, `ActivityInboxButton`, `GlobalHeaderAssistantButton`
(`GlobalHeaderActions.tsx:55-59`).

"Remove everything" must answer, per item: **where does search go? the goal
chip? the activity inbox? the assistant?** A design that deletes four live
entry points without naming their new homes is not finished. Note also that
`panelContent` IS "information about the task at hand" — so item (4) and item
(6) of the proposal are in direct contradiction. Resolve it.

### Navigation already lives on the left
`src/components/sidebar/master-nav/MasterNav.tsx` + `SpineTopPins.tsx` +
`SidebarNavList.tsx`, with `SIDEBAR_PAGE_NAV` / `APP_SIDEBAR_NAV` as the data
(`src/lib/sidebar-navigation.ts`). L2 mode lives in `HeaderPageSwitcher`, and
`display/workbench.md` explicitly forbids remounting a full-width mode rail as a
twin of the header control.

So "move all navigation to the left" is mostly **already true** for L1. The real
question is L2/modes: if `HeaderPageSwitcher` is deleted, what renders modes,
and does that recreate the exact twin the rule bans? Answer with the file that
would render it.

### The scan input must not remount
`src/components/layout/GlobalScanDock.tsx` is mounted at `GlobalHeader.tsx:97`
and survives navigation because `ResponsiveLayout` is in the ROOT layout
(`src/app/layout.tsx:148`). It renders `null` until a surface publishes via
`useScanDock` (`src/lib/scan-dock/`), and **no surface publishes today**.

If the header is gutted, **where does the dock live so it still never
unmounts?** Any new home must be inside the root layout's subtree. Verify the
candidate you propose actually is — do not assume.

Related, and already known: `TechSidebarPanel.tsx` swaps
`TestingSidebarPanel`/`ShippingSidebarPanel` by component identity, which is why
per-surface bars remount across the QC → Ready jump. `TestingSidebarPanel.tsx:366`
reads its own `scanValue` in the mode-toggle handler, which is the specific
entanglement blocking that migration.

### The scan classifier decides "page vs item"
`detectStationScanType` (`src/lib/station-scan-routing.ts`) returns
`NAV | ACTION | TRACKING | SERIAL | FNSKU | SKU | REPAIR | COMMAND | HANDLE`.
The proposal's left/right split maps roughly to NAV vs the rest.

**But not cleanly, and this is the sharpest question in the review.** Where does
`HANDLE` go — a carton, an LPN, a shelf address? A carton is arguably a page
(it opens a surface) AND an item (it is processed). Where does `ACTION` go — it
has no subject of its own; it acts on whatever was scanned last
(`src/lib/stations/scan-subject-store.ts`). Where does a scan that resolves to
nothing go? A spatial grammar that cannot place every scan type is a grammar
with a hole in it, and the operator will find the hole.

### Focus highlight
`focusRing` (`src/design-system/tokens/focus-ring.ts`) is the SoT; the scan
focus target stack + reclaim key live in `src/lib/scan-hotkey/store.ts`
(Insert by default, rebindable). "Highlight exactly when focused" must compose
the token, not invent a glow. Check whether the existing reclaim/arm distinction
(`focus` vs `armNext`) needs two visual states rather than one.

### Everything else that still applies
- Ops chrome is flush-square (`cornerClass('flush')`); `rounded-full` survives
  only for status dots, avatars, Switch tracks.
- `/kiosk/**` is exempt and must not inherit any of this
  (`kiosk-counter-surface.ts`).
- Mobile has its own chrome (`MobileAppHeader`) — say whether this design
  applies there or stops at desktop, and why.
- Motion only through `@/design-system/motion` + `motionRole.*`. "Moves down
  into the recent list" is an animation claim — name the role it would use, and
  check it against `display/motion-crossfade.md`.
- Region contracts are I/O contracts, not layout skins
  (`AGENTS.md` → Region contracts). State plainly whether this proposal changes
  a CONTRACT or only a skin. If it changes contracts, every named host in that
  table is in scope and the change is much larger than it looks.

---

## 3. Questions the proposal has not answered

Answer each from the codebase where you can; mark the rest as blocking.

1. **Two right-edge occupants.** Scanned items vs `RightRailHost`. Same slot or
   two? What happens when an operator scans an item while an inspector is open?
2. **Left region vs the spine.** Is "opened pages" a third left column beside
   spine + context rail, or does it replace `ContextPanelLayout`? Measure it.
3. **What is a "populated page"?** Nav row, tab stack, or session list? Does it
   persist across reload? Is it per-staff or per-station?
4. **Does scanning a page navigate, or only open it in the left list?** These
   are different products. Today `CMD-GO-*` navigates immediately.
5. **Recents already exist** (`HeaderRecentsSwitcher`, the Unbox recent rail).
   Is the new recent list one of those, or a third? A third needs a reason.
6. **What is the session?** Item (6) says the header shows the "session at
   hand". There are at least three session concepts in this repo
   (`station_scan_sessions`, `counter_sessions`, the auth session). Name which.
7. **Does the scan button do anything on click**, or is it purely a focus
   affordance? If it opens something, that is a fourth mechanism beside the
   hotkey, the wedge listener, and the dock.
8. **Multi-monitor / multi-bench.** Is the left "open pages" list per browser
   tab, per device, or per staff? This decides whether it needs a table.

---

## 4. How to work

- **Read before you judge.** Every file named above, plus `AGENTS.md` and the
  `docs/rules/display/*` recipe for any region you touch. Cite `file:line`.
- **Measure, don't estimate.** The frame-budget question is arithmetic. Do it.
- **Prefer the boring conclusion.** If most of this can be done by growing
  existing hosts rather than replacing them, say so — that is a better outcome
  than a rewrite, and the repo's law is compose-then-grow.
- **Do not soften a fatal finding into a caveat.** If the centre floor breaks at
  a common bench width, lead with it.
- You may run `npm run verify`, read the DB, and use `node scripts/sot-lookup.mjs
  "<job>"`. Do not start, stop, or restart a dev server; do not commit; do not
  create a branch.

## 5. Deliverable

A single markdown report, in this order:

1. **Verdict** — one of: *buildable as described* · *buildable with named
   changes* · *not buildable without retiring specific laws* · *contradicts
   itself, needs a decision first*. One paragraph.
2. **Fatal findings** — each with `file:line`, the law it breaks, and what would
   have to be true instead.
3. **Costly findings** — what must be deleted or re-justified, and its blast
   radius in files.
4. **The arithmetic** — the frame-budget table at 1280 / 1366 / 1920 px.
5. **Open questions** — from §3, with the ones that block design work marked.
6. **A smaller version that works** — the largest subset of this vision that
   fits the existing contracts, and what it gives up. Be concrete; this section
   is the one most likely to be built.

Do not include an implementation plan. Do not write code.
