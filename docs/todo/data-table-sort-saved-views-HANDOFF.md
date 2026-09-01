# HANDOFF — To-ship sort dropdown + saved views

**Written:** 2026-09-01 · **Branch:** current working tree · **State:** implemented (sort dropdown + saved views on DataTable toolbar)  
**Route:** `/shipping/orders` (To-ship). **Scope:** the DataTable **sort dropdown** and the **saved-views control immediately to its right**. Nothing else.

**Paste everything below the horizontal rule into a fresh agent session.**

---

You are finishing the To-ship **sort dropdown** and restoring **saved views** that vanished when the desk went rail-less.

Call design-mcp before UI (`ds_contract` / `ds_tokens` / `ds_critique`, or `node tools/design-mcp/ds.mjs …`). Code-graph `find_symbol` → `impact_analysis` on `DataTable`, `DataTableSortMenu`, `WorkbenchViewsMenu`, `useSavedViews`, `QUEUE_DISPLAY_SORT_OPTIONS` before edits. Eval: `node "$GARISEK_OS_ROOT/tools/eval-engineering/cursor-eval.mjs" --root . --fast`.

## Operator sentence

> Sort is **View · Platform · Carriers**. Click a column header to sort a column — that list does not belong in this menu. **Priority (due soon)** is the same job as **ship-by date**; keep ship-by, drop Priority. The tab is **Platform**, not Channel. Saved views that already exist in `saved_views` must **reappear and apply** via a Views control **immediately to the right of Sort**. Keep color **dots**, not SVG logos or MapPins.

## Why saved views disappeared (do not rediscover)

1. `DataTable` teardown (`docs/todo/one-table-sot-teardown-HANDOFF.md`) banned `ReactNode` chrome slots (`views`, `extraControls`, …). `WorkbenchViewsMenu` was never remounted on the new toolbar.
2. `/shipping/orders` is **rail-less** (`isRaillessSurface` — `src/lib/railless-surface.test.ts`). The left-rail `OutboundSavedViewsList` is therefore **not on screen**. Rows still exist in the DB (`dashboard_unshipped` / storage key `unshipped_saved_views`).
3. Restore by **importing the existing store**, not a second localStorage.

**Acknowledge + import:** mount `WorkbenchViewsMenu` with `outboundSavedViewsConfig('unshipped')` (`storageKey` + `paramKeys` from `src/lib/outbound/unshipped-sidebar-shared.ts` / `src/components/unshipped/outbound-sidebar-shared.ts`). `useSavedViews` already GET/POSTs `/api/saved-views`. Existing named views must list and apply. Do not invent a new surface discriminator.

Add `sort` (and `dir` if column-header sorts still write it) to To-ship `paramKeys` so a Platform/Carrier pin can be part of a named view. Old views without those keys still apply (subset). Keep `OutboundSavedViewsList` on the rail for desks that still have a rail — same config, two faces, one store.

## Toolbar order (locked)

```
search · filter · sort · views · date     ml-auto     export · fields · zoom · fullscreen
```

Views sits **immediately right of Sort**, still in the left cluster (what am I looking at), not in the `ml-auto` draw-chrome cluster.

Do **not** reopen a `views?: ReactNode` slot. Add **data**:

```ts
views?: { storageKey: string; paramKeys: readonly string[]; emptyHint?: string };
```

`DataTable` renders `WorkbenchViewsMenu` from that. Wire it from `OrdersGridHost` / `useOrdersSpreadsheet` using `outboundSavedViewsConfig` for the current outbound mode (To-ship = `unshipped`).

Face already exists: `src/components/saved-views/WorkbenchViewsMenu.tsx` (Bookmark + name, `SavedViewsList`, `useSavedViews`). Do not fork a second Views trigger.

## Sort dropdown — locked contents

Three groups only. `QUEUE_CHANNEL_SORT_GROUP` display string becomes **`Platform`**. URL pin stays `?sort=channel:Amazon` (bookmarks + tests). Rename the **tab and group label**, not the param scheme. `carrier:Amazon` still aliases to `channel:Amazon`.

| Tab | Rows | Notes |
|-----|------|--------|
| **View** | `newest` (Newest first), `deadline` (By ship-by date) | Default = **deadline**. Treat legacy `?sort=priority` / omitted-sort-as-priority as **deadline**. Drop `priority` from the menu. |
| **Platform** | `queueChannelSortOptions()` (Amazon, eBay, …) | Filled identity **dots** + full name. Pin to top; do not hide others. |
| **Carriers** | `queueCarrierSortOptions()` | Ring identity **dots** + full name. |

**Delete from this menu (Column group):** Product title, Days late, Qty, Order, Tracking, Pick, Packer. Operators sort those by **clicking the column header**. `LedgerGridColumnHeader` already does that. Do not remove header sort.

Keep identity as `MenuBrandIdentity` dots (filled = platform, ring = carrier). **No** platform SVG file, **no** MapPin / `CarrierMark`. Do not build a color-tile **palette** (see below).

With three tabs, `bands.length > 3` 2×2 keypad must **not** fire. Use a single tab row (`flex`), not `grid-cols-2`.

## “Palette vs list” — REJECTED (do not implement)

A prior critique asked: *what if Platform were a palette of color chips and View stayed a vertical list?*

That meant: Pin tabs as a **swatch grid** (tiles, names as captions), View as **rows of sentences**.

**Operator rejected the split.** Both View and Platform/Carriers stay **lists of named rows** with the same identity dots the Order column uses. Do not invent a second Platform face. The only naming change is Channel → **Platform**.

## Files (start here)

| Job | File |
|-----|------|
| Sort option data | `src/utils/queue-display-sort.ts` (`QUEUE_DISPLAY_SORT_OPTIONS`, groups, default, `writeQueueDisplaySort` omit-`?sort=` for the new default) |
| Sort UI | `src/components/tables/DataTable.tsx` (`DataTableSortMenu`, toolbar, new `views` data prop) |
| To-ship options + views wire | `src/components/dashboard/orders-queue/useOrdersSpreadsheet.tsx`, `OrdersGridHost.tsx` |
| Saved views face | `src/components/saved-views/WorkbenchViewsMenu.tsx` (compose, do not rewrite) |
| Store | `src/hooks/useSavedViews.ts`, `outboundSavedViewsConfig` paramKeys |
| Tests | `src/utils/queue-display-sort.test.ts`, `tests/e2e/data-table-to-ship.spec.ts` |

## Tests to rewrite

`tests/e2e/data-table-to-ship.spec.ts` today asserts tabs `View | Column | Channel | Carriers` and Column rows (picked/packed). Change to:

- Tabs: `View`, `Platform`, `Carriers`. **No** `Column`, **no** `Channel`.
- View: Newest + ship-by present; **no** “Priority (due soon)”.
- Platform Amazon still `[data-brand-identity="platform"]`, no `svg`/`img` on that row.
- Carriers USPS still ring identity, no `svg`/`img`.
- Toolbar: Views control is **right of** `[data-testid=data-table-sort]` (x greater). Applying a saved view from the API list must change the URL (pick a real `unshipped_saved_views` row if fixtures exist; otherwise save-current then re-apply).

Unit: default parse with empty `?sort=` is `deadline`, not `priority`; `priority` still parses as deadline (or maps on write). Channel options still emit `channel:Amazon`. Group string is `Platform`.

## Hard rules

1. **Scope** = sort dropdown + Views to its right. Do not restyle Filter, Fields, or the grid.
2. **No ReactNode chrome slots** on `DataTable`. Views is `{ storageKey, paramKeys }`.
3. **No second saved-views store.** Import `dashboard_unshipped` rows.
4. **No SVG platform icons, no MapPin** on tracking/platform faces.
5. **No Platform palette / chip grid.** Lists only.
6. **Do not disable column-header sort** while removing Column from the dropdown.
7. design-mcp before UI; impact shared symbols; eval `--fast` before claiming done.
8. Verify `/shipping/orders` in the browser: sort tabs, Platform Amazon pin, Views opens and lists/applies stored views, header click still sorts a column.

## Explicit non-goals

- Do not restore `src/lib/platform-brand-icons.ts` or `CarrierMark.tsx`.
- Do not put saved views inside the sort popover.
- Do not un-railless To-ship to “find” the old rail list.
- Do not fold sort into the filter menu.
- Do not keep Priority as a synonym row “for power users.”

## Related

- Sort/pin URL: `src/utils/queue-display-sort.ts`, `?sort=channel:Amazon` / `?sort=carrier:USPS`.
- Identity paint: `MenuBrandIdentity` / `BrandIdentityDot` in `src/components/ui/grid-cells.tsx`.
- Rail-less: `src/lib/railless-surface.test.ts`.
- Saved views SoT: `src/lib/saved-views/surfaces.ts`, `src/hooks/useSavedViews.ts`.
