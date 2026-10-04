---
description: No hard-coded Warehouse /m/ path literals — build URLs from the route tree
condition:
  - '["''\x60]/m/(?:stock|loc/|labels|racks|h/)'
scope:
  - 'tool:write(**/src/**/*.{ts,tsx})'
  - 'tool:edit(**/src/**/*.{ts,tsx})'
globs:
  - '!{**/src/lib/nav/route-tree.ts,*}'
---
Warehouse URLs (`/m/stock…`, `/m/loc/…`, `/m/labels…`, `/m/racks…`, `/m/h/…`) have one source: `src/lib/nav/route-tree.ts`. Import from `@/lib/nav/route-tree` instead of typing the string:

- static paths → `WAREHOUSE_PATHS.stock`, `.stockDetail`, `.locationCleanup`, `.locationLabels`, `.rackLabels`, `.racks`, `.newRack`
- records/params → `locationPath(code)`, `locationInfoPath(code)`, `containerPath(id)`, `stockPhotosHref(stockId, { sku, back })`, `locationLabelsHref({ code, kind, back })`, `rackLabelsHref({ rack, back })`
- reverse lookup → `routeForPath(pathname)`

Missing builder: add it to the route tree (check `node tools/design-mcp/ds.mjs route '{"path":"/m/…"}'`), not a literal at the call site.
