# HANDOFF — Paste a list: the list lives IN the search bar

Rewritten 2026-10-04 (owner ruling: "the bulk list moves into the search bar").
Supersedes the 2026-09-27 plan (identify-based list mode in ⌘K and a popover
under Find) and the interim side chrome (`[›] N` toggle, `[⧉]` paste key +
textarea box, right-side popout), which are deleted.

## The model

One search field per chrome — `NavFind` (the sidebar head; the header's field
while the sidebar is closed). On EVERY face:

- A paste of **2+ identifiers** becomes the HELD list. Ways in:
  - ⌘V / Ctrl+V in the field;
  - the well's paste key (shown while the operator looks at the well);
  - a typed `A, B, C` + ↵;
  - **⌘⇧V / Ctrl+Shift+V** (`PASTE_LIST_HOTKEY`, `src/lib/keyboard/key-registry.ts`)
    from anywhere outside a text field. It reads the clipboard: 2+ ids become the
    list; otherwise (or when the read is blocked) the field takes focus with its
    panel open on the held list, or on a line that says to press ⌘V.
    Clipboard history moved to ⌘⌥V / Ctrl+Alt+V (`CLIPBOARD_HISTORY_HOTKEY`).
    Bare `B` is retired: record verbs own `B`.
- **One identifier** keeps today's behaviour: the page's Find text, or the
  palette's query on the everywhere face.
- Where the list is kept:
  - a page that locates (`NavSearch.locate`: Receiving's `incoming.*`, the
    outbound desk pages via `OUTBOUND_LOCATE`) keeps it in its URL
    (`useNavBulkList` → `?ref_in=` / `?recon=` / `?recon_reason=`; outbound
    `?refs=`), so the page body's `PastedNumbersLedger` / `IncomingStatusChips`
    agree with the bar;
  - every other face holds it in memory, located everywhere
    (`useLocalBulkList('everywhere')`).
- The list shows as **one token inside the well** (`40 numbers ×`,
  `FindToken`). The field's text then finds within the list ("Find in the
  pasted list"). The field's × and ⌘⇧F clear the text and the list together.
- The rows live in the **well's own dropdown** (`FindField` `drop` →
  `FindPanel`, portaled to `<body>` through `AnchoredLayer` at the
  `panelPopover` band — never inside the sidebar column, whose stacking
  context clipped it under the page; at least 28rem wide, flips and clamps to
  the viewport, max-height with internal scroll):
  - a count + sort line;
  - status chips with counts (`AnimatedStat`);
  - one row per number (verdict chip · number · detail · title · link chips),
    with the verbs pinpoint ↵ · edit E · copy ⌘C · remove ⌫ · recheck R · sort O / S.
- The panel opens on focus from outside, ↓, the token, or the chord. ↓ again
  walks into the rows (↑↓ j/k · Home/End · ↵). ↑ past the first row returns to
  the field. Esc or blur closes it.
- **Hover key card.** With the mouse on the well for 180ms
  (`HINT_INTENT_MS`), a `KeyHintPopover enter="drop"` hangs under the well,
  left-aligned, hotkey first:
  - `[F]` + the page's Find (only where `F` is armed);
  - `[mod][K]` Search everywhere;
  - `[mod][Shift][V]` Paste a list — check each number, with the held count.

  It is the field's only hint: the field carries no key tooltips. It hides while
  the field has focus or its panel is open. A taught key pressed while the card
  is up sinks its cap for one beat (`PRESS_BEAT_MS`), then the card leaves.

Every row, chip and count comes from ONE locator answer (`useLocatedList` →
`GET /api/nav/locate`). There is no second lookup, and no per-locator case in
the UI.

Chips filter and STAY pressed for every bucket — the locator's own ids
(Awaiting tracking included) and other sections' `<locator>:<id>` buckets
(found elsewhere, after a hairline): route hygiene for `?recon=` / `?located=`
reads `paramLocateBucket` (`src/lib/routing/locate-bucket-param.ts`, test
pinned). It used to keep only received / not_received / exceptions, so any
other chip snapped back to All.

## Full list page — `/search/list`

The held list's own page (owner 2026-10-04: a full-screen view to go into and
read everything). It is a route, not a layer:

- **Ways in:** the full-screen icon button at the TOP-LEFT of the list's
  header (the bar's panel and the ⌘K palette's list alike; tooltip "Open full
  screen", no key — ⌘⇧L is the browser's address bar, so there is no chord),
  or ↵ on the token. The URL is built by the route tree's
  `pastedListHref({ refs, locator, status, back })` (node `pasted-list`).
- **Way out:** Esc or Back returns to `back`, with that page's list intact.
- **Data:** the bar's own locate answer (same `useBulkList` /
  `useLocatedList` key, so opening the page asks nothing new). Every fact
  rides that answer as `entry.facts` (`NavLocateFacts`, one shape for both
  sections — PastedFacts, 2026-10-04); the page makes no second read.
- **Status words:** one per number — "Received", never "Receiving ·
  Received". Bucket ids keep the section (`inbound:received`); labels are
  bare (service.ts `mergeLocated`). A section heading appears in the chip
  row only when two sections share a status word. Not found is a chip and a
  filter (`NAV_LOCATE_NOWHERE`). A number in two buckets is painted with ONE
  — `primaryBucketId` (`src/lib/nav/locate/bucket-precedence.ts`: inbound
  exceptions › awaiting tracking › not received › received; outbound
  exceptions, then the desk's view order) — on every surface and in the CSV;
  chips keep membership, so it still counts under both.
- **Layout (Google-Sheets feel):** Back is the first element of the title
  line (`titleLead`). The status chips open the page body top-left; sort
  chips · Copy shown · Export (CSV of exactly the columns and rows on screen)
  · Recheck all · zoom − / % / + on the right. No find field in the page —
  its Find is the sidebar field (`NAV_PAGE_DECLS.search`, desk store).
- **Table (canonical DataTable, display method HIGH):** # · Number (frozen,
  ×N when the paste carried it N times, hover icon opens the record) · Status
  · Product title · PO · Vendor · Delivered (date + time) · Unboxed (date +
  time + `StaffCell`) · Units (received/expected, green once unboxed, muted
  otherwise, 2px fill underline) · Detail ("Nd since delivered" leads a
  delivered-not-unboxed row: amber ≥2, red ≥5); SKU · Tracking · Ship by ·
  Shipped · Packer mount when a number in the list carries them. Every row
  shows (`unpaged`, virtualized). Sheet density (4px side pad scaled by zoom,
  hairline column rules via `[data-grid-col-rules]`, one line + full text on
  hover); both-ways scroll under a sticky header; drag a header edge to
  resize, double-click it to fit, pin a header to freeze through it, zoom
  80–150% — all persisted by `useSheetColumns` (`localStorage`).
- **Pressing a cell copies it** (toast "Copied <value>", a fading wash). The
  record opens from the Number cell's hover icon, or Enter / O.
- **Opening a record = its triage card's open**, on every surface (bar panel,
  ⌘K palette list, this page): `recordHref` comes from `recordDetailsHref`
  (`src/lib/records/record-details.ts`) — an order opens on
  `/shipping/orders?openOrderId=` (Fulfilled when it left), a receiving number
  on `/incoming?ref_in=<number>&openLine=<line>`. On that desk with its list on
  screen it opens in place; from anywhere else it navigates with
  `recordBack`, and closing the record (Esc) returns to the sheet — same URL,
  same scroll. The cards write through the same `setRecordDetailsParam`.

## Recent lists

Every paste through `useBulkList.paste` is recorded
(`src/lib/nav/locate/recent-lists.ts`: the last 10 per staff key, deduped,
newest first, `localStorage`). The bar's dropdown lists them when the field
is focused holding no list (they step aside once text is typed), and as a
3-row section under a held list's header (`NavRecentLists`). A press restores
the list through the same paste path and opens its panel; each row also opens
full screen or is removed; "Clear recent" empties them.

## Search bar hover + ⌘K palette

- **Hover grow:** the page field and the everywhere face grow to max(slot,
  28rem) on 180ms mouse intent, focus or an open list (`useHoverIntent` +
  `findWellGrowClass`, ease-in-out 300ms in / 200ms out). The well carries
  `[data-find-expanded]`.
- **Header recede:** GlobalHeader's children (except the one holding the
  field) fade to 60%, scale .985, blur 5px while any well is expanded — a DOM
  attribute, no import. It stays while the field is focused or its panel is
  open (no flicker under a typing operator).
- **Palette list:** a 2+ paste into the ⌘K input holds ONE list
  (`useLocalBulkList('everywhere')`) and swaps the results for the same
  `NavBulkPanel` — the two faces crossfade while their heights fold/unfold
  through `CollapseItem` on the `findListPanel*` timing. The full-screen
  button closes the palette and opens `/search/list` with `back` = the page
  underneath.

## Files

| Piece | File |
|---|---|
| List hooks (lib-level, shared with mobile) | `src/lib/nav/locate/use-bulk-list.ts` (`useLocatedList`, `useBulkList`, `useLocalBulkList`, `BulkList`, `BulkEntry`) |
| Staff query key | `src/lib/nav/context/use-nav-staff-key.ts` |
| URL list, chords, token, panel content | `src/components/sidebar/contextual/NavBulkList.tsx` |
| Shared filter / sort / row buckets / verbs | `src/components/sidebar/contextual/bulk-list-view.ts` |
| Status + sort chips (bar and page) | `src/components/sidebar/contextual/NavBulkChips.tsx` |
| Panel body (full-screen button top-left, count line, keys) | `src/components/sidebar/contextual/NavBulkPanel.tsx` |
| One row (verdict cell, verbs) | `src/components/sidebar/contextual/NavBulkRow.tsx` |
| Faces, focus rules | `src/components/sidebar/contextual/NavFind.tsx` (`useSearchFace`) |
| Full list page | `src/app/search/list/page.tsx`, `src/components/search/pasted-list/*` |
| Sheet column layout (resize · fit · freeze, persisted) | `src/components/tables/useSheetColumns.ts` + `LedgerGridColumnHeader` (`onFreezeColumn`, double-click fit) |
| ⌘K palette list | `src/components/CommandBar.tsx` |
| Header recede | `src/components/layout/GlobalHeader.tsx` (`RECEDE_WHILE_FINDING`) |
| Bucket filter URL hygiene | `src/lib/routing/locate-bucket-param.ts` |
| Hover key card rows + intent/beat | `src/components/sidebar/contextual/find-key-card.ts` (`useFindKeyCard`, `findKeyRows`) |
| Well, token, panel shell | `src/design-system/components/FindField.tsx` (`FindToken`, `FindLead`, `FindPanel`, `HINT_INTENT_MS`) |
| Key card | `src/components/sidebar/contextual/NavGoKeys.tsx` (`KeyHintPopover enter="drop"`, `KeyHintRow.count`) |
| Motion presets | `src/design-system/foundations/motion-presets.ts` (`findKey*`, `findList*`, `motionBezier.easeInOutCubic`) |

## Motion

All motion uses ease-in-out tweens (`easeInOutCubic` `[0.65, 0, 0.35, 1]`),
with no spring and no overshoot. Only transform, opacity and filter animate,
plus `height: auto` on the one panel. Blur stays ≤ 8px. Reduced motion keeps
plain fades through `useMotionPresence` / `useMotionTransition`.

| Moment | Preset | Timing |
|---|---|---|
| Key card in / out | `findKeyCard` + `findKeyCardIn` / `findKeyCardOut` | blur 8px→0, y −8→0, scale .985→1 · 0.30s in / 0.18s out |
| Key card rows | `findKeyRow` | blur 3px, y 4→0 · 0.26s, 40ms stagger, each row one unit |
| Token in the well | `findListToken` | blur 6px, scale .96→1 · 0.24s |
| Panel height | `CollapseItem timing` = `findListPanelOpen` / `findListPanelClose` | 0.32s open / 0.20s close |
| Palette results ⇄ list | `CollapseItem timing` = `findListPanelOpen` / `findListPanelClose` | crossfade + height fold/unfold, same timing |
| Well hover grow | `findWellGrowClass` (CSS, `ease-[cubic-bezier(0.65,0,0.35,1)]`) | width · 300ms in / 200ms out |
| Header recede | `RECEDE_WHILE_FINDING` (CSS) | opacity .6, scale .985, blur 5px · 300ms in / 200ms out |
| Rows cascade | `findListRow` | blur 2px, y 4→0 · 0.24s, 30ms stagger, capped at 14 rows |
| Pending row breath | `findListPending` | opacity 1 ↔ .45 mirror loop, 0.9s half-cycle |
| Pending → verdict | `findListVerdict` | 0.22s crossfade in one grid cell |
| Chip pill glide · filter reflow | `findListGlide` | 0.28s `layoutId` pill · `popLayout` + `layout` |

## Do not

- Do not hang anything right of the field. That means no toggle, no paste key
  and no popout.
- Do not teach F / ⌘K / ⌘⇧V anywhere but the key card. The `?` sheet lists them
  too.
- Do not fire the chord inside a text field. Do not fire it from a field that is
  not on screen: two NavFinds can mount, so it is hit-tested.
- Do not use Motion+ `AnimateText`. Hints read in one fixation.

## Acceptance (2026-10-04, `:3050`)

1. Hover the search on `/incoming`, `/shipping/orders` and `/settings` (no
   list): the card drops and its rows cascade. There is no `[F]` row on the
   everywhere face.
2. Paste 3 PO / tracking numbers into Find. The token appears in the well and
   the list in the dropdown, with chips and counts. Nothing renders right of the
   field.
3. Press ⌘⇧V outside a field with a list on the clipboard: the result is the
   same as 2. ⌘⌥V opens Clipboard history.
4. With the sidebar collapsed, the header field behaves the same, and only one
   panel appears.
5. On `/incoming`, the page-body PastedNumbersLedger still follows `?ref_in=`.
