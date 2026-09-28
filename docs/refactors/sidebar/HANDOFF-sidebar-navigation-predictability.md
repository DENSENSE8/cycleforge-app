# HANDOFF — Contextual left sidebar: display, and navigation that is predictable to a T

**Paste everything below the rule into a fresh session pointed at
`/home/michaelgarisek/Projects/cycleforge-lanes/prod`.** Written 2026-09-27.
Related:
- `HANDOFF-sidebar-foundations.md`: roots table (which file owns what).
- `HANDOFF-sidebar-next-phase.md`: switchers, `G` keys, NavFilters.
- `HANDOFF-search-and-triage.md` §1: the one search field (page, contextual, global).
- `HANDOFF-outbound-sidebar-verify.md`: the per-page check matrix. Extend it; don't fork it.
- `HANDOFF-contextual-page-port.md`: porting any other page onto this sidebar (declarations only).
- `AGENTS.md`: probe only `:3050`.

---

Scope: **display and navigation only** in `src/components/sidebar/contextual/**` and its
server contract (`src/lib/nav/context/**`).
- Not search behaviour (`NavFind`, `FindField`, `/api/nav/locate`).
- Not filters' SQL.
- Not `CommandBar.tsx`, which belongs to the search session.

Goal: an operator can predict, **before clicking**, where every sidebar control takes them,
what stays lit, and where focus lands. Every action should give the same result from
every page, every time, whether done with the mouse or the keyboard.

## 0. Read first (laws win over code)

Run `node tools/design-mcp/ds.mjs contract "<intent>"` for each of these:
- `ContextualSidebar` (head order, one host, lane doors, account footer);
- `NavSwitcherMenu` (two tiers; hover teaches keys, click opens inline; pressed-in choice);
- `NavModeSwitcher`, `NavSectionList`, `NavFilters`, `NavGoKeys`, `NavFind`, `KeyboardKey`.

The source is `src/design-system/pinned.json`. When code and law disagree, fix the code, or
ask the operator before changing the law.

## 1. The predictability contract (write it as tests, then make it true)

Each rule needs one pure test and one `:3050` probe row.

| # | Rule | Where it lives |
|---|---|---|
| P1 | **The URL is the state.** A reload, back/forward or a pasted link rebuilds exactly the same sidebar: the same lit mode, view, saved view and filter values. No sidebar state is only in memory, except `‹` peek (local) and the desk Find text (desk store). | `useNavContext`, `resolveNavContext`, route hygiene (`routing/*-routes.ts`) |
| P2 | **A control goes where its label says.** Every mode, view, saved-view and page-map row's `href` is built by one function per kind (`deskViewHref`, lane door `useLaneDoorHref`, `NAV_PAGE_DECLS`). No component builds a URL by hand. | `lib/nav/context/build.ts`, `lib/outbound/desk-views.ts`, `useLaneDoorHref.ts` |
| P3 | **Switching views starts clean.** Only the view's defining params travel. Filters, open record and paste list stay with the view being left. The one exception is the desk Find text: the locate pills carry it on purpose. | `deskViewHref`, `NavViewSwitcher` |
| P4 | **Exactly one lit item per tier.** Mode: one. View: one (the most specific href match wins; `/shipping/orders` must not light on `?queue=pick`). Page map: one. Never zero while a page is showing. | `NavSwitcherMenu currentId`, `NavSectionList`, resolver `active` |
| P5 | **The head never moves on its own.** The field, `‹`, mode and view stay at fixed y whatever loads: skeletons hold height, a missing slot collapses without reordering, and nothing reflows on hover or focus. Only a CLICK-opened inline list may push what is below it down. | `ContextualSidebar` head, `NAV_BLOCK_CLASS`, `NavSwitcherMenu` |
| P6 | **`‹` peek is reversible and local.** `‹` shows the page map with this page lit and focus on the lit row. Pressing Esc or activating the lit row returns to the panel with focus on `‹`. It never changes the URL. A URL change always closes it. | `ContextualSidebar` `peekTop`, `returnFocusToBack` |
| P7 | **Keyboard = mouse.** `G`+letter, digits 1–9 (views), `B`, `F`, `?` land on the same URL as the click, and are refused inside text fields, on key repeat, and for scanner bursts. | `NavGoKeys`, `useViewHotkeys`, `go-keys.ts` |
| P8 | **Lane doors remember, predictably.** A lane row opens the last view you used in that lane, else its landing view. The memory is per staff and per lane. It is shown in the row's tooltip or title, so it is never a surprise. | `useLaneDoorHref`, `useRememberLaneView` |
| P9 | **Permissions shape, never break.** A mode, view or letter the staffer lacks is absent, not dimmed and not a 403 click. The resolver gate and the client agree. | `resolve.ts` gate, `NAV_GO_KEYS` |
| P10 | **Focus lands somewhere named.** After every navigation the focus target is declared: the list for view changes, the lit row for `‹`, `‹` for return. No focus left on a removed node or on `body`. | host effects in `ContextualSidebar` |

## 2. Display pass (after P1–P10 hold)

- **Tier look.** Parent (mode: raised card, bold, ⇅, plain icon) and child (view: lighter, view
  glyph, count, `⌄`) must be distinguishable in a 1-second glance. Check against the
  `NavSwitcherMenu` TWO TIERS law and screenshot both tiers side by side.
- **Counts.** A view count is the unfiltered total from `/api/nav/facets`, and nothing else.
  The count on the view block equals the count in its inline list for the same view.
- **Hover teaches, click chooses** (operator 2026-09-27). Hovering a switcher shows its keys
  in a card beside the column (`KeyHintPopover`, instant, no page shade); sweeping up and down
  the head moves the card between parent and child. Clicking either tier welds an overlay
  card to its block (one shared hairline, no gap; the block keeps its height; Esc always closes it): the parent its own
  coloured card with the other modes, the child a separate card with the other views (neither lists the current one) — two
  different dropdowns. The Shipping header title (`To ship ›`, grey bubble on hover) unfolds
  the views as pills right beside it; they stick after hover-off until Esc, a press outside,
  or a choice.
  `G` swaps the header strip to the next keys with a light shade over the list.
- **Page map order** is Chat, top rows, lanes, Automations, then Scan Stations last. Hairlines
  separate the groups; there are no text headings.
- **Account footer** appears only at the parent level (the page map and the `‹` peek).
- **Width and overflow.** The search well grows right over the header while focused
  (`SidebarNavColumn` has `has-[[data-find-expanded]]`). No other sidebar element may escape
  the column.

## 3. Known rough edges (start here)

- **Shipped date row:** on `/shipping/shipped?allDates=1` the Shipped date row still reads
  "This week" (reached from the Shipped locate pill). The label must show all dates when
  `allDates=1` (P1).
- **Hydration mismatch** on `/shipping/orders`: the server renders the desk title "Shipping"
  and the client renders "To ship" (`DeskPageChrome` h1). The head title must be the same on
  both (P5).
- **Pick list and To ship share `/shipping/orders`.** Prove P4 with `?queue=pick` and with it
  absent. Locate pills and `NavBulkPopout` resolve the lit bucket the same way (most-specific
  match); keep all three on one helper.
- **Wait for hydration in probes.** The `‹` / map swap and the search field render from the
  persisted `NavContext` snapshot before hydration. Wait before interacting, or events are lost.
- **Closed sidebar overlap (open question).** With the sidebar closed, a probe hovering the header's
  search well was intercepted by the "Show navigation" toggle's container. Settle whether that is
  the inert collapsed-column stub (expected) or a real overlap in the header cluster (fix it).
- **Already landed, don't redo:** the paste key no longer takes focus on pointerdown (the grown
  well used to slide it out from under the click). The field rolls `F` Find … / `⌘ K` Search
  everywhere. Keycaps are raised square caps everywhere (`KeyboardKey`). The well is white with
  a shaded rim and a soft-to-firm corner (`SEARCH_WELL_CORNER`). The operator is verifying these by hand.
- **Foreign churn.** Another session is mid-flight in: `orders-list.ts`, `desk-view-sql.ts`,
  `pages.ts`, `outbound-routes.ts`, `OutboundOrdersLedger.tsx`, `OrderCardList.tsx`,
  `OrderRecordView.tsx`, and the search dossier. Keep edits additive and list every foreign
  hunk.

## 4. Proof

- **Tests:**
  - pure resolver tests for P1–P4 and P9 (`src/lib/nav/context/resolve.test.ts`);
  - go-keys and view-digit machines for P7.
  - No component-source-text tests.
- **Probe on `:3050`** (storage state from `POST /api/auth/signin` with
  `x-tenant-slug: usav`, `{staffId, deviceKind:'personal'}`):
  - for To ship, Pick list, PO paired, Exceptions, Shipped, FBA, Label intake, Inbound
    Deliveries and Chat, record for every row in §1: URL before and after, which item is lit,
    focus target, and the head y-positions;
  - screenshot the sidebar clipped to x 0–420 for each page;
  - reload and back/forward, and assert nothing changed (P1).
- `pnpm verify:fast`. Report foreign failures separately, with `git status` proof.
