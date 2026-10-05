---
description: Record-selection controls (filter, sort, date, views, status chips, find) go in the left contextual sidebar via NAV_PAGE_DECLS, never the page body
condition:
  - '\bimport\s+(?:(?:DataTableFilterMenu|DataTableSortMenu|DataTableDateMenuControl|WorkbenchViewsMenu|FilterMenu|FilterDropdownSelect|FilterRefinementBar|StatusChipRail|QueueStatusChips|IncomingStatusChips|BulkStatusChips|BulkSortChips)\b|\{[^}]*\b(?:DataTableFilterMenu|DataTableSortMenu|DataTableDateMenuControl|WorkbenchViewsMenu|FilterMenu|FilterDropdownSelect|FilterRefinementBar|StatusChipRail|QueueStatusChips|IncomingStatusChips|BulkStatusChips|BulkSortChips)\b)'
  - '<(?:DataTableFilterMenu|DataTableSortMenu|DataTableDateMenuControl|WorkbenchViewsMenu|FilterMenu|FilterDropdownSelect|FilterRefinementBar|StatusChipRail|QueueStatusChips|IncomingStatusChips|BulkStatusChips|BulkSortChips)\b'
  - '\b(?:summary|banner|chips)=\{\s*<(?:Chip\w*|StatusChipRail|QueueStatusChips|IncomingStatusChips|BulkStatusChips|BulkSortChips|select)\b'
  - '<select\b[^>]*?(?:\b(?:aria-label|name|id|title)=\{?["''`][^"''`]*(?:[Rr]oom|[Ss]tatus|[Ff]ilter|[Ss]tation|[Ss]ort)|\bvalue=\{[\w.]*(?:[Ff]ilter|[Ss]ort)[\w.]*\})'
  - '\b(?:sheetFind|sortMenu|dateMenu)=\{'
  - '<DataTable\s(?:(?!<[A-Za-z/])[\s\S]){0,4000}?\b(?:filter|views)=\{'
scope:
  - 'tool:write(**/src/**/*.tsx)'
  - 'tool:edit(**/src/**/*.tsx)'
globs:
  - '!{**/src/components/sidebar/**/*,**/src/components/layout/SidebarShell.tsx,**/src/design-system/**/*,**/src/components/tables/**/*,**/src/components/ui/FilterMenu.tsx,**/src/components/saved-views/WorkbenchViewsMenu.tsx,**/src/components/receiving/incoming/IncomingStatusChips.tsx,**/src/features/live-feed/WindowSwitch.tsx,**/src/components/layout/GlobalHeaderSearch.tsx,**/src/app/m/**/*,**/src/components/mobile/**/*,**/src/components/outbound/orders/CsvImportStagingHost.tsx,**/src/components/sidebar/receiving/incoming/IncomingPoImportStagingHost.tsx,**/src/components/sidebar/receiving/incoming/IncomingReturnsImportStagingHost.tsx,**/src/components/products/catalog/CatalogImportReview.tsx,**/*.test.*,*}'
interruptMode: always
---
STOP — this puts a record-selection control (filter, sort, date window, views, status chips, find) in the page body. Operator law 2026-10-04: every control that changes WHICH records show or IN WHAT ORDER lives in the LEFT contextual sidebar. Read `rule://sidebar-controls-contract`, then do this instead:

1. Declare it in `NAV_PAGE_DECLS[page].controls` (or `items[viewId].controls`) in `src/lib/nav/context/pages.ts` — `sort { param, dirParam?, defaultValue, options }`, `staff[]`, `dateRanges[]`, `exclude`, `choices` (with `defaultValue` for a tab row that has a default), `pastedListBuckets` (a pasted list's bucket chips) (shape: `NavControlsSchema`, `src/lib/nav/context/schema.ts`). Find = `NAV_PAGE_DECLS[page].search = { source: 'url-param', param: 'q', placeholder }`.
2. Status / carrier / reason chips with counts = THIS page's facet context: `NAV_FACET_GROUPS['<pageId>.<viewId>']` in `src/lib/nav/facets/contexts.ts`, counted by the list's own query builder. Never a chip rail in the body or in a list's `summary` / `banner` slot. Scan stations (`/unbox`, `/stations/live` …) are no exception: their `NavFilters` render above the scan panel.
3. Modes / views = `SIDEBAR_PAGE_NAV` children in `src/lib/sidebar-navigation.ts` (+ `nav-view-icons.ts`, `parity.ts`).
4. The body reads the params with `useSearchParams` and writes them with `useReplaceSearchParams` (`src/components/sidebar/contextual/useReplaceSearchParams.ts`); it renders records only.

Reference: `QUEUE_CONTROLS` (`src/lib/nav/context/pages.ts:333-371`) registered at `NAV_PAGE_DECLS.outbound.items.orders` (`pages.ts:576`); facets `'outbound.orders'` (`src/lib/nav/facets/contexts.ts:132`).

`DataTable`'s `sheetFind`, `filter`, `sortMenu`, `views`, `dateMenu` are retired (operator A1, 2026-10-04) — do not pass them; toolbar actions, page size, export, zoom and the record-view switch stay.

Not a selection control (stays in the body): layout / density / display toggles — list | columns, grid-sm | grid-lg | list, zoom, `DeskRecordViewSwitch`, a `Segmented` that changes HOW records render. If that is what you wrote, this rule misfired; continue.

Escape clause: "the sidebar can't do X" only with a citation of the missing field in `src/lib/nav/context/schema.ts`; then extend `NavControlsSchema` + `NavFilters`, never the page.

Exempt (not this file): mobile `src/app/m/**` + `src/components/mobile/**` (pending mobile ruling); the four CSV staging surfaces (deferred: the three staging hosts + `src/components/products/catalog/CatalogImportReview.tsx`); the live board's date window (`src/features/live-feed/WindowSwitch.tsx`); `src/components/layout/GlobalHeaderSearch.tsx`; the control and sidebar homes (`src/components/sidebar/**`, `src/components/layout/SidebarShell.tsx`, `src/design-system/**`, `src/components/tables/**`, `src/components/ui/FilterMenu.tsx`).
