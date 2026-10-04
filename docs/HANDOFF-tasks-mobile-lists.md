# HANDOFF — Phone task lists, Apple-style (written 2026-10-03)

Paste the **Prompt** block at the bottom into a fresh session. Dev origin `http://localhost:3050`
only (AGENTS.md §1). The `.env` DB is PRODUCTION. Other sessions edit this tree: re-read before
each edit, touch only your lines, never commit, never `git checkout/stash`. Prior state:
`docs/HANDOFF-tasks-mobile-first.md` (M1–M8; the task SHEET is done — this handoff is the LIST
that opens it).

## 0. Owner ruling (verbatim intent → decision)

| # | Owner said | Decision |
|---|---|---|
| L1 | "It should be displayed like Apple … it's displaying everything at once with a scrollable method … high corner radius touch targets with a back button so you can easily tap into certain categories like Support, Daily instead of a [kind] drop-down top left, and then a more specific contextual display over Support — moving the Support status [filters] into only Support." | `/m/home` becomes a **list of lists** (Apple Reminders' "My Lists" / Settings hierarchy): big rounded category tiles → tap → that category's own screen with a **Back** button and **only that category's controls**. The kind drop-down, the All/Open/Done tab and the ticket-status chips leave the top of the home screen. Ticket-status chips live on the **Support** screen only. |

## 1. What is on screen today (evidence)

`src/app/m/(shell)/home/page.tsx` → `MobileDailyChecklist` (`src/components/mobile/daily/MobileDailyChecklist.tsx`, 489 lines) paints ONE scroll:

- `:364-372` top-left `AgendaKindFilterRow` (popover drop-down of kinds, `AgendaKindFilter.tsx`, prefs in localStorage `cf-agenda-kind-prefs`, SHARED with the desk) + `TabSwitch` All · Open · Done.
- `:373-386` `StatusChipRail` of helpdesk ticket statuses — always shown, for every kind (state `ticketFilter` `:112`; counts `ticketStatusCounts`, filter `taskMatchesTicketStatuses` in `src/lib/tasks/ticket-status-filter.ts`).
- `:314-326` the checklist band (recurring, then "Today only"), `:327-356` "Assigned to me" grouped by `TASK_BOARD_ROW_TYPES` = `checklist · ticket · project · task` with labels `TASK_BOARD_VIEW_LABEL` (`Daily checklist · Support · Long-term projects · Standalone tasks`, `src/lib/task-board/task-board-model.ts:51-61`), split by hairlines. Band order follows `kindPrefs.prefs.order`.
- `:418-432` the ONE primary: FAB "New task" (bottom-right).
- `:469` `MobileTaskSheet` opens from `?task=<id>` (deep links depend on this — see §4).
- Rows are `MobileDailyRow` (`src/components/mobile/daily/MobileDailyRow.tsx`; render test `mobile-daily-row.test.tsx`).

## 2. Target — Apple patterns (sources, read 2026-10-03)

- HIG **Lists and tables**: "iOS Settings uses a hierarchy of lists to help people choose options"; grouped style "uses headers, footers, and additional space to separate groups"; to drill into a row "use a disclosure indicator" (chevron), never an info button. <https://developer.apple.com/design/human-interface-guidelines/lists-and-tables>
- HIG **Toolbars**: "Use the standard Back and Close buttons … Prefer the standard symbols … don't use a text label that says Back"; iOS "Use a large title … transitions to a standard title as people begin scrolling"; one prominent action. <https://developer.apple.com/design/human-interface-guidelines/toolbars>
- HIG **Pull-down buttons / Menus**: secondary list commands (Show Completed, Sort) behind a More (⋯) button, ≥3 items. <https://developer.apple.com/design/human-interface-guidelines/pull-down-buttons>
- Reference app: **Reminders** home — a 2×2 grid of rounded "smart list" tiles (coloured circle glyph top-left, count top-right, name bottom-left), then "My Lists" as an inset-grouped list (glyph · name · count · chevron); a list opens full screen with a back chevron, a large title in the list's colour, and completed items hidden behind ⋯ "Show Completed".

### Screens

**Level 0 — `/m/home` (home):** large title (host bar keeps "Daily"); `MobileCurrentSession` stays on top; then a **2×2 tile grid**, one tile per category in `TASK_BOARD_ROW_TYPES` order (Daily checklist · Support · Long-term projects · Standalone tasks): `TASK_BOARD_TYPE_FACE[type]` glyph in a filled circle, OPEN count large top-right, overdue count in the danger ink when > 0, label bottom-left. A category with nothing assigned still shows (count 0) — the grid never reflows. Optionally under it, an inset-grouped "Due Today" / "Overdue" row each (smart lists, Reminders "Today"). FAB "New task" unchanged. Nothing else: no drop-down, no tabs, no chips, no rows.

**Level 1 — `/m/home/<list>` (one category):** a real ROUTE (`checklist | support | projects | tasks`) so Back, refresh and the browser history work. Bar: circular back chevron (leading) · large title in the category ink · ⋯ (trailing: Show Completed, New Task…, plus the category's own sort). Contextual controls ONLY here:
- **Support**: the ticket-status `StatusChipRail` (moved, not copied) under the title; rows show the ticket pill.
- **Daily checklist**: Recurring, then "Today only" (inset-grouped sections); the checklist composer lives in ⋯ for `admin.manage_staff`.
- **Long-term projects**: grouped by `projectName`.
- **Standalone tasks**: by due (overdue → today → later).
Rows: inset-grouped container, high corner radius, ≥56px rows, Reminders check-circle leading (the existing done toggle), title (wraps — mobile no-truncate law), caption (due · status pill · ticket pill), disclosure chevron → `?task=<id>` opens `MobileTaskSheet` over the list. Completed rows hidden until ⋯ Show Completed (replaces the All/Open/Done tab).

**Level 2 — the task sheet** (done; `MobileTaskSheet`).

## 3. Work, in order

1. **Ask `ds_contract` first** (`node tools/design-mcp/ds.mjs contract "<job>"`) for: rounded category tile grid, inset grouped list row with chevron, large title with back. Reuse `IosBar`/`IosBarButton`/`IosMoreMenu` (`src/components/mobile/ios`); extend `IosBar` with a `leading` slot for Back (one prop, not a fork). Pinned law to respect: `MobileV2DetailTopBar` = routed record with Back — read its `doNot` and decide extend-vs-compose; record the decision in the report.
2. **New mobile-first components** in `src/components/mobile/ios/` (owner: new components, Apple patterns): `IosListTile` (the Reminders tile), `IosGroupedList` + `IosRow` (inset grouped, chevron accessory, concentric corners), large-title behaviour in `IosBar`. Corners from tokens only: export `MOBILE_CARD_CORNER` (`rounded-2xl`, `src/design-system/tokens/radius.ts:157`, currently not exported) and use `MOBILE_ROW_CORNER` one rung in; if a higher radius is wanted, add ONE named token there — never a literal (`ds_tokens radius`). Register the files in `tools/design-mcp/design-mcp.profile.json` `primitiveHomes` (the `src/components/mobile/ios` match) and pin them in `src/design-system/pinned.json`.
3. **Split the list model out of the component**: a pure `src/lib/tasks/task-lists.ts` — `taskListOf(row)` (category from `taskBoardRowType`), `taskListCounts(rows, checklist, nowMs)` → `{open, overdue}` per category, `taskListRows(list, rows, {showCompleted, ticketStatuses})`. Unit-test it (counts, overdue, completed hidden, Support-only ticket filter).
4. **Routes**: `/m/home` = tiles; `src/app/m/(shell)/home/[list]/page.tsx` = one list (unknown slug → `notFound`). Both mount the task sheet from `?task=`. Add `'/m/home/'` to `OWN_TOP_BAR_PREFIXES` (`src/lib/mobile/host-top-bar.ts`) so the list screen's own bar (Back + title) is the only bar; keep `getMobileAppTitle` (`src/lib/mobile-context-navigation.ts:18`) and its test truthful.
5. **Delete** from the phone: the `AgendaKindFilterRow` mount, the All/Open/Done `TabSwitch`, the always-on chip rail, the single long scroll and its type bands (`MobileDailyChecklist.tsx:309-392`). Keep `useAgendaKindPrefs` for the DESK (it is shared) — remove only the phone's use; if the phone was its last reader of `order`, say so, do not delete desk code.
6. **Declare and measure** (skill `declutter`): add `task-home` and `task-list` surfaces to `src/lib/disclosure/surfaces.ts` (home: tiles only, one primary FAB; list: `chromeRow ['back','title','more']` — extend the law so a chrome row may start with `back`, and the Support list's chip rail is a declared slot ONLY on `support`). Drive `node tools/design-mcp/ds.mjs disclosure <surface> list=support` to zero findings.
7. **Smoke** at 390×844 with `tests/.auth/admin.json`, light + dark: home tiles; each list; Back returns to the tiles with scroll kept; Support chips filter and do not appear on any other list; `/m/home?task=16127` still opens the sheet (from a reminder); `/m/home/support?task=15994` opens the sheet over Support; Show Completed toggles; tick a row then untick it (append-only data: restore what you touch). Screenshots of every screen.
8. `pnpm verify:fast`; report other sessions' reds by file; update `docs/HANDOFF-tasks-mobile-first.md` §0 with L1.

## 4. Constraints and traps

- **Deep links must keep working**: `/m/home?task=<id>` is produced by reminders (`src/lib/reminders/list-staff-reminders.ts`, test `:145`), Doc reference chips (`src/components/ui/markdown/DocRefChip.tsx:38`), the assistant (`src/lib/assistant/tools/task-tools.ts:200`), and the landing path (`src/lib/auth/landing-path.ts:25`). The sheet must open on the home screen without a list hop.
- **Nav name law** (AGENTS §4): a parent and a child never share a name. The host title is "Daily"; a category named "Daily checklist" under it is close — run `node tools/design-mcp/ds.mjs nav-names` and ask the owner before renaming either.
- **Labels**: tiles and rows lead with glyph + value (M2); the category name is the only word on a tile.
- **One primary**: the FAB on home; on a list, the ⋯ "New Task…" item, not a second filled button.
- **Mobile record text never truncates** (lint `cf-mobile/no-truncated-record-text`): titles wrap.
- **Desktop is out of scope.** `src/features/task-board/*` keeps its sidebar + columns.
- Permissions: rows need `work_orders.claim`; ticket doors need `integrations.zendesk`; checklist edit needs `admin.manage_staff` — same gates as today (`MobileDailyChecklist.tsx:89-101`).

## 5. Acceptance (observable)

- Home at 390×844: tiles + session + FAB only; every tile ≥ 140×96px, glyph + count + name; `ds_disclosure task-home` 0 findings.
- Each list: Back (44px, leading), large title, ⋯; Support alone shows ticket-status chips; `ds_disclosure task-list list=<each>` 0 findings, light and dark.
- No `AgendaKindFilter` / status `TabSwitch` / `StatusChipRail` anywhere on `/m/home` top level (grep + screenshot).
- All deep links in §4 open the sheet; Back from a list restores the home scroll.
- Unit tests for `task-lists.ts` green; `pnpm verify:fast` green except named other-session reds.

---

## Prompt

```
You are building the phone task LISTS, Apple-style. Read docs/HANDOFF-tasks-mobile-lists.md end to end
(owner ruling L1, current-state evidence §1, target §2, order §3, traps §4, acceptance §5), then §0 of
docs/HANDOFF-tasks-mobile-first.md, then skill://declutter and skill://new-ui-surface.

Owner direction: "display it like Apple". /m/home stops being one long scroll with a kind drop-down,
an All/Open/Done tab and ticket-status chips on top. It becomes a list of lists: big rounded category
tiles (Daily checklist · Support · Long-term projects · Standalone tasks, Reminders-style: glyph, open
count, overdue in danger ink, name). Tapping a tile pushes that category's own screen (/m/home/<list>)
with a circular Back chevron, a large title, a ⋯ menu (Show Completed, New Task…), inset-grouped rows
with high corner radius and a disclosure chevron that opens the existing task sheet (?task=<id>).
Controls are contextual: the ticket-status chips exist ONLY on the Support screen.

Build new mobile-first components in src/components/mobile/ios (IosListTile, IosGroupedList/IosRow, a
leading Back on IosBar) from Apple's HIG — Lists and tables, Toolbars, Pull-down buttons — corners from
radius tokens only. Put the list logic in a pure, tested src/lib/tasks/task-lists.ts. Declare the two
screens in src/lib/disclosure/surfaces.ts and drive `node tools/design-mcp/ds.mjs disclosure <surface>`
to zero findings. Keep every /m/home?task=<id> deep link working. Desktop is out of scope.

Rules: dev origin http://localhost:3050 only; the .env DB is production (restore anything you tick);
reuse house primitives (never fork; extend once); mobile may import design-system, src/lib, src/hooks,
src/components/ui|Icons|identity and src/components/mobile; re-read before each edit; never commit.
Smoke headlessly at 390×844 with tests/.auth/admin.json, light and dark, every screen screenshotted;
finish on `pnpm verify:fast` (report other sessions' reds by file). Report URLs, screenshots, the
ds_disclosure output per screen, and what is still open.
```
