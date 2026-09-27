# HANDOFF — One search field, and one filtering root for Outbound (To ship first)

**Paste everything below the rule into a fresh session pointed at
`/home/michaelgarisek/Projects/cycleforge-lanes/prod`.** Written 2026-09-27.
Related:
- `HANDOFF-sidebar-next-phase.md` §5: what shipped — switchers, `G` keys, NavFilters controls.
- `HANDOFF-shortage-lens.md`: the Out-of-stock lens that retires PO paired. Do it with or after this.
- `AGENTS.md`: probe only `:3050`.

---

Two jobs, one principle. **Every way to narrow Outbound is one filtering root:**
- a declared param,
- one server predicate,
- one count,
- painted by page-agnostic components.

Job A merges the two search fields into one. Job B gives the To ship page more
colour and more triage information on that single root. Nothing here is
Shipping-only: finish by proving a second page (Inbound `incoming`) needs only
declarations.

## 0. The roots (same three as the shortage lens)

It rests on three layers that never mix:
- Filter logic: one server-side query per filter, used by the list and every count.
- Page declarations: each page only lists its views, filters and URL parameters.
- Components: the sidebar and table render whatever is declared and don't know which page they're on.

Where each layer lives in code, and its rule:

| Root | Lives in | Rule |
|---|---|---|
| **Predicate**: which rows are in | `src/lib/orders/desk-view-sql.ts` (`sqlDeskRefinementClauses`, `sqlDeskQueueScope`), `src/lib/neon/packer-logs-week.ts` (`buildPackerLogBaseWhere`) | The list, the facet counts, the desk counts and the chips call the SAME builder. `nav/facets/outbound.test.ts` proves total == list for every param. Extend it for every new param. |
| **Declaration**: what a page offers | `NAV_PAGE_DECLS` (`nav/context/pages.ts`: views, `controls.staff[]` / `dateRanges[]` / `sort`, savedViews), `NAV_FACET_GROUPS` (`nav/facets/contexts.ts`), route specs (`routing/outbound-routes.ts`) | A param a control writes must be declared on its route (hygiene strips the rest). `navControlParams()` is the one list. |
| **Component**: how it looks | `src/components/sidebar/contextual/**`, `FindField`, `OrderCardList`, `DataTable` | Knows no page. Laws in `pinned.json`: `ContextualSidebar`, `NavFind`, `FindField`, `NavSwitcherMenu`, `NavFilters`, `KeyboardKey`. |

## 1. Job A — condense the two search fields into one

**Status (2026-09-27): built on :3050. The in-field chip was dropped on the operator's call.**

Search splits by the ANSWER it gives, not by widget:

| Layer | Question | Where | Answer |
|---|---|---|---|
| Page | "Narrow this list" | Typing in the field (`F`) | The list narrows live (desk store / URL param) |
| Contextual | "Where is this in the section?" | Pills under the field while it has text; a pasted list of 2+ numbers | `GET /api/nav/locate`: per-bucket counts; per-number rows (NavBulkList) |
| Global | "What is this? Take me there." | "Search everywhere" row, ⌘↵ / Ctrl+↵, ⌘K | The palette (`openCommandBar({ query, scope: 'everywhere' })`) |

- **One field:** `NavFind({ search? })`; `NavGlobalSearch` is deleted. It is mounted by the
  `ContextualSidebar` top band, `SpineNavChrome` and `GlobalHeaderSearch`. Without a list
  (identify pages, the page map, the header) it is the palette's face.
- **No scope chip:** the view switcher under the field already names the list.
- **Overflow:** while focused, the page field grows right to max(slot, 28rem) over the
  header's task and pin keys (`FindField overflowRight`). The slot keeps its 32px, and
  `SidebarNavColumn` stops clipping and sits above the header only while the field is grown
  (`has-[[data-find-expanded]]`).
- **Locate (backend):** `src/lib/nav/locate/` plus `src/app/api/nav/locate/route.ts`.
  - A bucket is a place a record can be: a view (Outbound: Exceptions, PO paired, Pick
    list, To ship, Shipped) or a verdict (Inbound: Received, Not received, Exceptions).
  - Each count runs that bucket's own list predicate. For outbound `q`, that is each view's
    `/api/orders` SQL or `exceptionSearchSql`, plus `sqlPackerLogSearch` for Shipped. For
    `refs`, it is `sqlDeskQueueScope` with the identifier and tracking matchers from search.
  - `everywhere` is the union of every locator the caller may read.
  - A page opts in with `search.locate: { locator, param, statusParam }`. Outbound desk views
    use `refs` / `located`; Inbound uses `ref_in` / `recon`.
- **Paste-a-list is generic:** `NavBulkList` / `NavBulkPopout` render any locate answer.
  - Per page: `useNavBulkList`, URL-backed.
  - Global: `useLocalBulkList('everywhere')` on the everywhere face. A paste of 2+ numbers
    there is located everywhere; a single one opens the palette.
- **Tones:** one map, `NAV_LOCATE_TONE_VAR`, built on the status colour vars.
- **Probe results on :3050 (2026-09-27):**
  - To ship: the well is 195 → 448px while focused, on top of the header.
  - Typing `21-15107` gives the pills Exceptions 1 · To ship 1 (here) · Shipped 1.
  - The Shipped pill goes to `/shipping/shipped?allDates=1` with the Find kept, and the list
    shows that 1 package.
  - Pasting 3 numbers on To ship gives rows To ship / To ship / Not found, with chips
    Exceptions 2 · Pick list 1 · To ship 2 · Shipped 1 · Not found 1.
  - Inbound paste-a-list and `?recon=` still work.
  - Every count checked so far matches its own list.
- **Known:**
  - The Shipped pill counts all dates, so its href carries `allDates=1`. The sidebar's
    Shipped date row still reads "This week" there. That row is a foreign control and
    was not changed.
  - Inbound locate may call Zoho live (about 6s), so text locate waits 400ms after the
    last keystroke.

**Today (verify):**
- `NavGlobalSearch` (`NavFind.tsx:46`) is the ⌘K palette's clickable face. It is
  mounted by `ContextualSidebar`, `SpineNavChrome`, and `GlobalHeaderSearch`
  (layout, when the sidebar is closed). It opens `CommandBar` via
  `COMMAND_BAR_OPEN_EVENT` (`lib/app-events.ts:17`).
- `NavFind` (`NavFind.tsx:106`): bare `F` narrows the list on screen. Its source
  comes from the page decl `search.source`:
  - `desk-store` — `useDeskSearch`, `lib/outbound/desk-search-store.ts:27`, in memory, per path;
  - `url-param`;
  - `identify` — no Find at all.
  - Paste-a-list status (`NavBulkList`, key `B`) rides under it.
- Both use the one well, `FindField` (`design-system/components/FindField.tsx:140`):
  hover-rolled hints, `HoverKeycaps`, paste key.
- **Boundary:** `CommandBar.tsx`, the palette's search behaviour, belongs to the
  search session. Its queries, results, empty states and identify / scan routing
  are theirs. You own the face and the handoff INTO it.

**Options (pick with the operator; recommendation first):**

| Option | Model | Keeps live list narrowing | Removes | Risk |
|---|---|---|---|---|
| **A1. One field, two scopes** (Slack "in #channel", GitHub "this repository") | A scope chip at the left ("Shipping ×"). Typing narrows the list live (today's Find). The first row under the field is "Search everywhere for '…' ⏎"; ⌘⏎ goes straight there. `F` focuses with the page scope, ⌘K with everywhere. Backspace on an empty field drops the scope; the scope comes back when you leave the page. | yes | `NavGlobalSearch` in the sidebar and the header twin | medium: needs `COMMAND_BAR_OPEN_EVENT` to carry `{ query, scope }` |
| A2. Global only; the page is the palette's first group | ⌘K / `F` both open the palette, with an "In this list" group on top | **no**, the table stops narrowing as you type | most code | high for triage |
| A3. Keep both, draw them as one split well | Visual only | yes | nothing | low, no simplification |

**Recommended start (A1):**
1. `FindField` gains `scope?: { label; onClear }` (a chip) and an optional
   `escalate?: (query) => void` row. It stays page-agnostic.
2. `NavFind` becomes the only sidebar field. With `search.source === 'identify'`
   (no page list) it opens in "everywhere" scope instead of rendering nothing.
3. Agree with the search session on one change: `COMMAND_BAR_OPEN_EVENT` carries
   `detail: { query, scope }`. Their palette reads it. Do not edit `CommandBar.tsx`.
4. Delete `NavGlobalSearch`, its mounts, and `GlobalHeaderSearch`'s use of it. The
   header shows the same single field when the sidebar is closed.
5. Laws, same change:
   - `ContextualSidebar` head order becomes collapse · the ONE field · `‹` · modes · views;
   - `NavFind` and `FindField` entries: scope chip, escalate row, `F` / ⌘K meaning;
   - the `KeyboardKey` hotkey-first rule still holds (keycap before the words).
6. **Do not merge:**
   - the identify / scan routing (wedge scanners type into a focused field — it
     stays the palette's job);
   - the paste-list path (`B`, `NavBulkList`), which stays under the field;
   - the desk store (Find stays in memory for the desk and never writes a URL param).

**Probe (`:3050`):**
- `F` then typing narrows the list with no palette;
- ⌘⏎ / "Search everywhere" opens the palette with the same text;
- ⌘K from a field-less page opens in "everywhere" scope;
- a scanned barcode still routes through identify;
- paste list still works;
- the head never reflows while switching scope.

## 2. Job B — To ship: colour and more triage information, one filtering root

**Today there are three competing filter surfaces on To ship (verify each):**
1. **Card status chips** over the list: Out of stock · Urgent · Ready · Packed ·
   Late · No bin. URL `?cardStatus=` (`cards/order-card-list-state.ts:25-32`,
   `OrderCardList.tsx:15`). They filter the loaded page in the browser.
2. **Sidebar facets** `stage · aging · late · attention · ustatus`
   (`NAV_FACET_GROUPS['outbound.triage']`), counted server-side
   (`buildQueueFacetSql`). But `aging` / `late` / `attention` / `ustatus` are
   applied to the list only in the browser (`UnshippedTable.tsx:186-209, 521-536`),
   so on a limited page they judge only the loaded rows.
3. **The right-rail legend** with counts (OOS · URG · RDY · PKD · Late · No bin)
   when no order is open.

The same facts appear three ways with three alphabets ("Out of stock" / `BLOCKED`
/ OOS). That is the information-architecture debt.

**Target: one filtering root.**
- **One alphabet.** Each triage fact is ONE param with one server predicate:
  - `stock`: out / short-on-PO / ok (from the shortage lens);
  - `urgency`: urgent;
  - `stage`: pending / tested / packed;
  - `due`: late / today / tomorrow / later / none, from the ship-by bands;
  - `bin`: none;
  - `attention`: needs attention.

  Put them in `sqlDeskRefinementClauses` (server). Retire `cardStatus` and the
  browser-only filters: the chips, the sidebar facets and the legend then write
  and read the SAME params.
- **One count.** The chip strip, the facet rows and the rail legend show the same
  number, from `/api/nav/facets?context=outbound.triage` (it already exists;
  extend its groups). The table total equals it (the `outbound.test.ts` rule).
- **The chip strip becomes the facet's face over the table**: the same
  declaration, painted as chips where the table is and as rows in the sidebar. A
  new `NAV_FACET_GROUPS` flag `surface: 'chips' | 'rows' | 'both'` decides where
  each shows, and the component reads the flag.
- **Colour carries meaning, once.**
  - One token per fact, shared by the chip, the facet option, the card's left rule
    and the rail legend. Declare it next to `nav-view-icons.ts` (glyph + tone) as
    `NAV_FACT_TONES`.
  - Suggested tones, confirmed against `ds_tokens colour` before use:
    - out of stock = red,
    - late = red text,
    - urgent = orange,
    - ready = blue,
    - packed = violet,
    - no bin = amber.
  - Remove per-component hardcoded hues (e.g. the dead `text-hue-orange-ink` noted
    in `HANDOFF-sidebar-next-phase.md` §6).
- **More triage information per card, no new clicks.** Surface what the server
  already projects:
  - `picked_by_name` / `picked_at`, and pack / test assignees (`orders-list.ts`
    projections);
  - ship-by band (it already groups the list);
  - shortage supply state (lens);
  - carrier, channel, amount.

  Every visible fact must also be a filter (one click on the fact applies its
  param) and a sort (`queue-display-sort.ts` ids). Triage becomes "see it → click
  it → the list is exactly that".
- **Sort stays one alphabet.** `NavControls.sort` in `pages.ts` declares its own
  option list today. Before extending it, move the sidebar Sort row to render from
  `QUEUE_DISPLAY_SORT_OPTIONS` + `applyQueueDisplaySortParam`
  (`utils/queue-display-sort.ts:173, 344`), and shrink the schema field to
  `{ param, dirParam }`. Otherwise the sidebar and the desk menu drift, and
  `parseQueueDisplaySort` silently falls back to `deadline` for an id it doesn't
  know.

**Order of work (each step ships green):**
1. Inventory the three surfaces. For each: its param, whether it filters in the
   browser or on the server, where its count comes from, and its colour. Fill the
   table above with the real data.
2. Move the browser-only filters (`aging`, `late`, `attention`, `ustatus`,
   `cardStatus`) to server predicates in `sqlDeskRefinementClauses`, bound in
   `buildQueueFacetSql`. Extend `outbound.test.ts`.
3. One alphabet: rename / alias the params with redirects for saved views
   (`outbound-sidebar-shared.ts` paramKeys) and bookmarks.
4. `NAV_FACET_GROUPS` gets `surface`. The chip strip reads the facet declaration.
   Delete `order-card-list-state.ts` status handling and the rail legend's own
   counting.
5. `NAV_FACT_TONES`, then apply it across chip, facet option, card rule and legend.
6. Card facts become click-to-filter; the sort row reads the queue sort alphabet.
7. Prove it is page-agnostic: declare Inbound (`incoming`) facts the same way
   with no component edits.

## 3. Guards and proof

- **Tests:**
  - `nav/facets/outbound.test.ts`: total == list for every fact param and combination;
  - `resolve.test.ts`: every control / facet param declared on its route (it uses
    `navControlParams`);
  - `queue-display-sort.test.ts` for the sort;
  - a saved-view migration test for renamed params.
- **Probe on `:3050`, To ship:**
  - clicking "Out of stock" in the chip strip, in the sidebar row, or on a card's
    OOS fact gives the same URL, the same list and the same count in all three places;
  - with `limit` smaller than the queue, the counts still equal the server total
    (no browser-only filtering left);
  - screenshots: sidebar clipped x 0–420, the chip strip, the rail legend.
- `pnpm verify:fast`; report foreign failures separately with `git status` proof.

## 4. Coordinate (uncommitted foreign edits, 2026-09-27)

Another session is mid-flight in:
- `orders-list.ts`, `desk-view-sql.ts`, `desk-view-filters.ts`;
- `nav/context/pages.ts`, `routing/outbound-routes.ts`, `UnshippedTable.tsx`;
- `OutboundOrdersLedger.tsx`, `OrderCardList.tsx`, `dashboard-table-data.ts`;
- the PICK work-type migration (`pickerId`, `PICK_FACTS_LATERALS`).

Keep edits additive and surgical, never reformat or revert foreign hunks, and
list every hunk you built around in the report. `CommandBar.tsx` belongs to the
search session: agree on the open-event contract and never edit it.
