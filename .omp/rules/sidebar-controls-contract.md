---
description: Where table filters, sort, dates, staff, facets, views and modes go
globs:
  - 'src/app/**'
  - 'src/components/**'
  - 'src/features/**'
---
Operator ruling (verbatim, 2026-10-04): "sorting data table information and filtering belongs in the left contextual sidebar below the top level navigation." Every control that changes WHICH records show or IN WHAT ORDER is declared in `NAV_PAGE_DECLS` and painted by the left contextual sidebar; the page body shows records only.

## Placement (from `node tools/design-mcp/ds.mjs contract 'filter and sort a data table'`, verbatim)

PLACEMENT (binding — returned by ds_contract; paste verbatim, never restate a different placement):
1. Every control that changes WHICH records show or IN WHAT ORDER — filters, sort, date / day / time-of-day window, staff, carrier / status / reason facets, views, modes, direction (inbound / outbound) — lives in the LEFT contextual sidebar. Declare it; never draw it in the page body.
   - Modes (top tier, e.g. Direction): NAV_PAGE_DECLS[page].modes = { label } (src/lib/nav/context/pages.ts) + one SIDEBAR_PAGE_NAV child per mode (src/lib/sidebar-navigation.ts). No 'all' mode.
   - Views (one list each, unfiltered count chip): sidebar-navigation children with `group: <modeId>`; counts via facet context `<pageId>.<viewId>` (NAV_FACET_CONTEXTS, src/lib/nav/facets/contexts.ts).
   - Controls: NAV_PAGE_DECLS[page].controls or a view's `controls` (NavControlsSchema, src/lib/nav/context/schema.ts:115-227): sort { param, defaultValue, options }, staff[] { id, param, label }, dateRanges[] { id, label, fromParam, toParam, placeholder, fromTimeParam?, toTimeParam? } — one day + a time-of-day window IS one dateRange with fromTimeParam/toTimeParam (schema.ts:155-156; precedent SHIPPED_CONTROLS, pages.ts:397-415).
   - Facets with counts (carrier, status, reason…): NAV_FACET_GROUPS['<pageId>.<viewId>'] = [{ id, label, param, multi }] (src/lib/nav/facets/contexts.ts); counts come from the SAME query builder the list uses — never a second predicate.
   - Find: NAV_PAGE_DECLS[page].search = { source: 'url-param', param: 'q', placeholder } (NavFind). Never an in-page search field.
   ContextualSidebar / NavModeSwitcher / NavViewSwitcher / NavFilters paint all of it from the declaration; the list reads the same URL params.
   Exception (operator 2026-10-03): live/monitor boards keep their date range as page chrome top-right (the house header date control) and always apply it; every other control stays in the sidebar.
2. The page body shows RECORDS ONLY, in the display method chosen PER PAGE by `ds_display_method` from THIS page's facts (column board | card list | triage sections | data table | record ledger | admin table | detail hub) — this block never fixes the display. The placement rule covers CONTROLS only: NO in-page filter bar, chip / pill row, aria-pressed toggle group, segmented control, tab row, date / time picker, staff picker or facet picker in the page body. Selection, `bulk` actions and the chosen display's own density stay with the records.
3. 'The convention can't do X' is only valid with a citation of the missing field in src/lib/nav/context/schema.ts; then extend NavControlsSchema + NavFilters — never build the control in the page.
4. Reference implementation: the Exceptions hub — NAV_PAGE_DECLS.exceptions.modes = { label: 'Domain' } (src/lib/nav/context/pages.ts:990-994); domain + kind children with `group` (src/lib/sidebar-navigation.ts, the `exceptions` entry ~1146-1185); facet contexts + counts (src/lib/nav/facets/contexts.ts, src/lib/nav/facets/exceptions.ts).
5. Gate: run ds_critique on every touched UI file. Rule `filter-controls-outside-sidebar` blocks a page-body write that both writes list filters to the URL and mounts a filter control.

(Line numbers inside the verbatim block are the contract tool's; current lines are below.)

## The sidebar path — touch these, in this order

1. `src/lib/sidebar-navigation.ts` — `SIDEBAR_PAGE_NAV`: one child per mode / view (`group: <modeId>`).
2. `src/lib/nav/context/pages.ts` — `NAV_PAGE_DECLS[page]`: `modes`, `search`, `controls` (or a view's `items[viewId].controls`).
3. `src/lib/nav/context/schema.ts` — ONLY for a new control kind (see the escape clause).
4. `src/lib/nav/facets/contexts.ts` — `NAV_FACET_CONTEXTS` + `NAV_FACET_GROUPS['<pageId>.<viewId>']` for facets with counts (status, carrier, reason…), counted by the list's own query builder.
5. `src/components/sidebar/contextual/nav-view-icons.ts` — the view's icon.
6. `src/lib/nav/context/parity.ts` — parity entry for the new declaration.
7. `src/lib/nav/lanes.ts` — only when the page is a lane door.

The page body then reads the same params from the URL with `useSearchParams` and writes them with `useReplaceSearchParams` (`src/components/sidebar/contextual/useReplaceSearchParams.ts`). It mounts no control.

## Reference shape (current lines, re-checked 2026-10-04)

- `QUEUE_CONTROLS` — `src/lib/nav/context/pages.ts:333-371` (staff roles, ship-by + order dateRanges, exclude-status, sort with `dirParam`).
- Registered at `NAV_PAGE_DECLS.outbound.items.orders` — `src/lib/nav/context/pages.ts:573-576`.
- Facets `'outbound.orders'` — `src/lib/nav/facets/contexts.ts:48` (context id), `:132` (`[STAGE, AGING, LATE, URGENT, OUT_OF_STOCK]`), `:189` (permission).
- Hub reference: `NAV_PAGE_DECLS.exceptions` (`modes: { label: 'Domain' }`) — `src/lib/nav/context/pages.ts:1306-1310`.

## Control kinds the sidebar already has (check before claiming a gap)

- **Defaulted choice** — `choices[].defaultValue` (`NavControlsSchema`, `src/lib/nav/context/schema.ts:232-246`; painted by `ChoiceRow`, `src/components/sidebar/contextual/NavFilters.tsx:753`). Unset reads as that option, lit; picking it clears the param (Tasks' Open · Waiting · Done · All, unset = Open). A "status tab row with a default" in the body is this.
- **Pasted-list bucket facet** — `controls.pastedListBuckets: { param, facetParam? }` (`schema.ts:260`; painted by `PastedListBucketsRow`, `NavFilters.tsx:683`). Its options are data-driven: the live locate answer for the URL's list, with counts. `param` / `facetParam` are the page's own status / facet params. Precedents: `PIPELINE_CONTROLS` (`pages.ts:320`, `?recon=` + `?recon_reason=`) and `NAV_PAGE_DECLS.search` (`/search/list`, `pages.ts:1123`, `?status=`). A body `BulkStatusChips` / `IncomingStatusChips` over a pasted list is this.
- **Inline scan stations get the same filters** — for `CONTEXTUAL_SCAN_STATION_PAGE_IDS` (`src/lib/sidebar-navigation.ts:1609`: stations-live, triage, receive = `/unbox`, testing, ready-to-pack, packer, scan-out), `ContextualSidebar` renders `NavFilters` (that page's `filters` + `controls`) ABOVE `SidebarContextPanel` (`src/components/sidebar/contextual/ContextualSidebar.tsx:232-241`). A station page declares its facets and Sort in `NAV_PAGE_DECLS` like any desk; it never needs body chips.

## Operator rulings (2026-10-04, binding)

- **A1 — DataTable's record-selection controls are retired.** `sheetFind` (SearchField), `filter` (`DataTableFilterMenu`), `sortMenu` (`DataTableSortMenu`), `views` (`WorkbenchViewsMenu`, incl. the `sheetSavedViewConfigForTable` default) and `dateMenu` (`DataTableDateMenuControl`) leave `DataTable`; every consumer declares them in `NAV_PAGE_DECLS`. Non-selection chrome stays on the table: toolbar actions, page size, export, zoom, record-view switch. "To-ship is the gold" is void.
- **Layout / density / display toggles are NOT selection controls** (operator 2026-10-04) — they stay in the body with the records: list | columns, grid-sm | grid-lg | list, zoom, `DeskRecordViewSwitch` (record-view switch), a `Segmented` that changes HOW records render rather than WHICH show or in what order.
- **A4 — status chips that filter are controls.** `StatusChipRail`, `QueueStatusChips`, `IncomingStatusChips`, `BulkStatusChips`, `BulkSortChips` in a body or a list's `summary` / `banner` slot move to THAT page's sidebar: `NAV_PAGE_DECLS[page]` + its own facet context (`NAV_FACET_GROUPS['<pageId>.<viewId>']`). Never a shared cross-codebase chip rail in a body.

## Escape clause

"The sidebar can't do X" is valid only with a citation of the missing field in `src/lib/nav/context/schema.ts` (`NavControlsSchema`). Then extend `NavControlsSchema` + `NavFilters` (`src/components/sidebar/contextual/NavFilters.tsx`) — never the page. Never build a second filter primitive or a second sidebar.

## Exemptions (the only ones)

- **Mobile — pending mobile ruling** (A2 deferred): `src/app/m/**`, `src/components/mobile/**`. No left sidebar on a phone; the mobile home for filters is ruled later.
- **CSV staging hosts — deferred** (A3): `src/components/outbound/orders/CsvImportStagingHost.tsx`, `src/components/sidebar/receiving/incoming/IncomingPoImportStagingHost.tsx`, `src/components/sidebar/receiving/incoming/IncomingReturnsImportStagingHost.tsx`, `src/components/products/catalog/CatalogImportReview.tsx` (the Products › Import products CSV staging surface). The resolver flyout (`EcwidOrderScopeFilters`), `LabelsProductsWorkspace` and `GoalsAnalyticsTab` are NOT exempt — they are baseline debt.
- **Live / monitor board date range** (operator 2026-10-03): page chrome top-right, always applied — the Live feed's `src/features/live-feed/WindowSwitch.tsx`.
- **`src/components/layout/GlobalHeaderSearch.tsx`** — the global header's find well when the sidebar is closed.
- The control and sidebar homes themselves: `src/components/sidebar/**` (incl. `NavFilters.tsx`), `src/components/layout/SidebarShell.tsx` (the master sidebar shell), `src/design-system/**`, `src/components/tables/**`, `src/components/ui/FilterMenu.tsx`, `src/components/saved-views/WorkbenchViewsMenu.tsx`, `src/components/receiving/incoming/IncomingStatusChips.tsx`.
