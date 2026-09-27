# HANDOFF — One "Out of stock" lens across Outbound and Inbound (and the pattern for every page)

**Paste everything below the rule into a fresh session pointed at
`/home/michaelgarisek/Projects/cycleforge-lanes/prod`.** Written 2026-09-27.
Related: `HANDOFF-sidebar-next-phase.md` (sidebar host, switchers, go keys),
`PARITY.md` / `parity.ts` (the old-UI gate), `AGENTS.md` (probe only `:3050`).

---

You are building ONE exact triage lens — **Out of stock** — that is the same set
of short order lines whether the operator stands on Shipping, Sourcing or
Inventory, each short line paired with the inbound supply that will cure it. The
Shipping view **PO paired** is retired into it. The lens is also the template:
when you are done, adding a lens to Inbound, AI chat, Products, Sales or
Automations must be *declaration only*.

## 0. The roots (read this before any code)

Three things, never mixed:

| Root | What it is | Where it lives | Who may own it |
|---|---|---|---|
| **Predicate** | The exact SQL that says "this row is in". One builder, called by the list, the facet counts, the desk counts and search/identify. | `src/lib/<domain>/*-sql.ts` (for this lens: a new `src/lib/shortage/shortage-sql.ts`) | the data lane |
| **Declaration** | What a page offers: views, facet groups, controls (staff roles, date ranges, sort), saved views, route params. Data only. | `NAV_PAGE_DECLS` (`src/lib/nav/context/pages.ts`), `NAV_FACET_GROUPS` (`src/lib/nav/facets/contexts.ts`), route specs (`src/lib/routing/*-routes.ts`) | the page |
| **Component** | How it looks: the sidebar host, switchers, filter rows, the data table. It reads the declaration and never knows a page. | `src/components/sidebar/contextual/**`, `src/components/tables/DataTable.tsx` | the sidebar/table lane |

The law that ties them: **a param that narrows a list must narrow its facet
counts through the same builder**, and **a param a control writes must be
declared on its route** (hygiene strips undeclared keys). Precedent you must copy:
`sqlDeskRefinementClauses` (`src/lib/orders/desk-view-sql.ts`) is called by both
`listOrders` (`orders-list.ts`) and `buildQueueFacetSql` (`nav/facets/outbound.ts`);
`outbound.test.ts` proves total == list for every param. Do the same for the lens.

## 1. What exists today (measured 2026-09-27 — re-verify, the tree is busy)

**"Out of stock" has eight competing definitions**, all starting from the
hand-set flag `orders.is_out_of_stock` (schema.ts:1040-1042; written by
`/api/orders/assign` and `/api/orders/missing-parts`). Nothing computes ATP.

| # | Where | Set it selects |
|---|---|---|
| D1 | `sqlOrderBlockedPending` (desk-view-sql.ts:80-87), `/api/orders?blockedOnly` | flag ∧ not ship-confirmed ∧ not AFN, label or not |
| D2 | `sqlDeskQueueScope('po')` = D1 ∧ `sqlOrderHasPoPairedShortage` (desk-view-sql.ts:20-34, 98-100) → desk-counts, `outbound.po` facets, identify, orders-list `poPaired` | "PO paired" |
| D3 | facet `ustatus=BLOCKED` inside triage/pick scope (nav/facets/outbound.ts:101-105, 149-164) | D1 but only labelled + tracked orders |
| D4 | client `resolveFulfillmentLane` / `isOutOfStock` (order-lifecycle.ts:37-77), UnshippedTable browser filter (:185-187, 514-535) | the loaded page only |
| D5 | queue-counts `blocked` (queue-counts.ts:15, 76, 90) → "Out of stock" KPI (outbound-metrics.ts:345-360) | |
| D6 | operations `oos_count` (api/dashboard/operations/route.ts:27-31, 67) | labelled pending |
| D7 | AI context count (lib/ai/context-fetchers.ts:103-105) | |
| D8 | per-line badges (order-fulfillment-badge.ts:80, order-card-model.ts:137) | |

Not order OOS (leave alone): FBA `fba_shipment_items.status='OUT_OF_STOCK'`,
repair `wa.out_of_stock`.

**The per-line truth already exists and almost nobody reads it:**
- `order_line_shortages` (migration 2026-09-11c:56-94): one row per
  (order_id, zoho_item_id) with `qty_short` and
  `status ∈ open | on_po | inbound | received | allocated | cleared`. Kept in
  sync with the flag by `order-line-shortage.ts:40-196`.
- `shortage_inbound_links` (migration:96-136):
  - `source_kind ∈ replenishment | po_line | receiving_line | serial_unit`;
  - `link_status ∈ reserved | in_transit | received | unboxed | allocated | released`;
  - `zoho_po_id`, `zoho_po_line_id`, `receiving_line_id`, `serial_unit_id`, `qty`.
- Writers (the supply state machine is already live):
  - `earmarkPoForReplenishmentRequest` (replenishment.ts:802 → shortage-inbound.ts:9-40) sets `on_po`;
  - `advanceShortageForReceivingLines` (api/receiving/match → shortage-inbound.ts:42-115) sets `inbound` / `received`;
  - `allocateShortageUnits` (shortage-inbound.ts:117-173, via inventory/allocate.ts:192) sets `allocated` / `cleared`.
- A parallel older pairing, `replenishment_order_lines`, feeds orders-list
  `replenishment_status` (:178-190, 285) and replenish `orders_waiting`
  (replenishment.ts:601-608).
- Inbound surfaces show **no** shortage information. Nothing under
  `/api/receiving`, `/api/sourcing` or `/api/inventory` reads it.

**"PO paired" today** is D2: a non-cleared shortage with a non-released
`po_line`/`receiving_line` link. Its plumbing:
- `DESK_VIEWS.po` and `DESK_PAIR_PARAM` (lib/outbound/desk-views.ts:36-129);
- `/shipping/shortage` (page seeds `{blockedOnly, pair:'po'}`), `ShortageDesk.tsx:38-39`;
- `SHORTAGE_ROUTE_PARAMS` (routing/outbound-routes.ts), `NAV_FACET_GROUPS['outbound.po']`;
- the `outbound.items.po` decl, parity rows `view po` / `param pair`.

## 2. Decisions to take with the operator FIRST (ask; do not guess)

1. **Source of truth:** open `order_line_shortages` rows (recommended — per
   line, has qty and the supply state), or the order flag (D1)? If lines, the
   flag becomes a derived denorm only.
2. **Labelless orders:** in or out? D1 says in, D3 says out. The lens must pick one.
3. **What counts as "paired":** only `po_line`/`receiving_line` (today's D2), or
   also `replenishment` and `serial_unit` links?
4. **Home of the inbound view:** Sourcing (`?mode=`), Inventory
   (`?section=replenish`), or a view on Deliveries (`incoming`)?

## 3. The build (data lane)

**3a. One predicate module** — `src/lib/shortage/shortage-sql.ts` (new):
- `sqlOrderShortScope(orderAlias)`: the lens membership (decision 1 + 2).
- `sqlShortageSupplyState(shortageAlias)`: a CASE giving the line's supply
  bucket, `unpaired | on_po | inbound | received | allocated`, from
  `order_line_shortages.status` ⋈ the latest non-released link (decision 3).
- `readShortageRefinements(params)` + `sqlShortageRefinementClauses(r, bind, …)`,
  in the `sqlDeskRefinementClauses` shape: `supply` (multi), `po` (zoho PO id),
  `sku` (zoho item id), `eta` window. Invalid values are ignored.
- Replace D1–D8 with it. Every consumer listed in §1 calls this module or is
  deleted. D4's browser filter moves to the server. "Out of stock" means one set
  everywhere.

**3b. One reader with a shape param** — `GET /api/shortages?by=order|line|sku|po`:
- `order`: order rows plus aggregated short lines, for the Shipping ledger.
- `line`: one row per order × short SKU × supply, for the exact triage table.
- `sku` / `po`: grouped, with `orders_waiting` and `qty_short`, for Inbound.
  This supersedes `replenishment_order_lines`' `orders_waiting`.

All four shapes go through §3a's builders; `by` changes grouping and projection,
never membership. Permissions follow the facet permission of the calling page.

**3c. Facets** — new contexts, all dispatched by `getNavFacets`
(nav/facets/service.ts) to ONE `shortageFacets(context, params)`:
- `outbound.short` (groups: `supply`, `aging`, `late`);
- `<inbound page>.short` (groups: `supply`, `vendor`, `eta`).
- Add `NAV_FACET_PERMISSION` entries.
- The test must prove total == list for every group and every refinement, the
  way `outbound.test.ts` does.

**3d. Retire PO paired:**
- `DESK_VIEWS.po` becomes `short` ("Out of stock").
- `resolveDeskView` redirects `/shipping/shortage?pair=po` to
  `/shipping/orders?short=1&supply=on_po,inbound` (one release, then delete the
  redirect with the route).
- Delete `DESK_PAIR_PARAM`, `SHORTAGE_ROUTE_PARAMS`, `NAV_FACET_GROUPS['outbound.po']`,
  `ShortageDesk.tsx` and the `/shipping/shortage` page.
- Rewrite parity rows 184/188 to the new view/param. Parity is closed in the
  contract, never by deleting a row without its replacement.

## 4. The declaration (per page — this is all a page ever writes)

- **Shipping** (`NAV_PAGE_DECLS.outbound.items.short`): the view, its facet
  context `outbound.short`, and `controls: QUEUE_CONTROLS`. Those controls are
  staff roles, Ship by / Ordered ranges and sort, shipped 2026-09-27 in
  pages.ts; reuse them, don't redeclare.
  - Route spec: add `short` and `supply` to `ORDERS_ROUTE_PARAMS`.
- **Inbound page** (decision 4): a `short` view ("Needed for orders"), facet
  context `<page>.short`, `controls` for vendor / ETA range, and a route spec for
  its params.
- **The same lens on any other page** (Products "short SKUs", Sales "orders
  waiting on stock", Automations "shortage rules", AI chat "what is short and
  why"): a view id, a facet context and a route param. No new component.
- **AI chat** consumes the reader (§3b) as a tool, not the UI. Replace
  `context-fetchers.ts:103-105` with `by=sku` totals.

## 5. The component (table lane)

- The exact triage table is `DataTable` (components/tables/DataTable.tsx:255;
  generic `binding` + `columns` + `fields`, already used by the receiving ledger,
  ReadyQueueTable, PickupWorkspace).
- Rows are `/api/shortages?by=line`: Order · SKU · Qty short · Supply (chip:
  unpaired / on PO / inbound / received / allocated) · PO · Receiving line · ETA
  · Ship by.
- Row links: Order goes to the Shipping record, PO to the receiving/incoming
  record, SKU to Inventory. Same row, same ids, from every page.
- `OutboundOrdersLedger` / `OrderCardList` stay the ORDER views (one row per
  order). On `short` they gain one Supply column fed by `by=order`. They do not
  learn shortage logic.

## 6. Sidebar display rules this lens inherits (already shipped — keep)

These live in `src/components/sidebar/contextual/**` and `pinned.json`
(`NavSwitcherMenu`, `NavGoKeys`, `ContextualSidebar`). They are page-agnostic:
- Views sit behind the VIEW switcher (child tier). Modes sit behind the MODE
  switcher (parent tier: raised card, plain lane icon, ⇅, `G` then letter).
- In an open menu the current choice sits **pressed into the surface** (the Find
  well: sunken fill, soft inset shade, hairline). There is no check (a check reads
  as multi-select) and no dark outline. Every choice row sinks 1px while pressed.
- Row keys (`1`–`9`, `G S`) sit at the far right like a Linear menu shortcut.
  Their column width is always held; they fade in only while the row is hovered
  or keyboard-highlighted, so the label never moves.
- The body is buttons, never behind a menu:
  - saved views;
  - Sort (the chosen order pressed in);
  - one row per staff role, one per date range (with time where declared);
  - then the facet rows.
  - Facet options are checkboxes because they ARE multi-select.
- `?` and ⌘⇧? / Ctrl+Shift+? open the cheat sheet, which lists the page's view
  digits and go keys while they are mounted.

## 7. Guards and proof

- Tests: `shortage-sql` membership cases, one per decision in §2. Facet total ==
  list for every context × refinement. `resolve.test.ts`: every control/facet
  param declared on its route. A parity row for the retired `po`/`pair`.
- Probe on `:3050`:
  - the same short line appears on Shipping `short` and on the inbound `short`
    view with the same supply state;
  - moving a link (earmark a PO, receive the line) moves it across `supply`
    buckets on both pages;
  - the counts on the view switcher, the facet rows and the table total agree.
- `pnpm verify:fast` green.

## 8. Uncommitted foreign edits (coordinate; never revert)

As of 2026-09-27 these carry other sessions' work:
- `desk-view-sql.ts`, `orders-list.ts`, `order-line-shortage.ts`, `queue-counts.ts`;
- `order-lifecycle.ts`, `order-card-model.ts`, `order-fulfillment-badge.ts`;
- `nav/facets/{outbound,shipped}.ts`, `nav/context/pages.ts`, `routing/outbound-routes.ts`;
- `dashboard-table-data.ts`, `UnshippedTable.tsx`, `ShortageDesk.tsx`;
- `OutboundOrdersLedger.tsx`, `OrderCardList.tsx`, `api/orders/assign/route.ts`.

Note: an in-flight PICK work_type / station migration (another session) changes
`PICK_FACTS_LATERALS`. Run `git status` before touching any of these; make
surgical edits on top.
