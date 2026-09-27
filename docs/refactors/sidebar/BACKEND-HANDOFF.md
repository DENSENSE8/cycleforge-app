# HANDOFF — Contextual sidebar: backend, API routing & identification contract

**Paste everything below the rule into a fresh session pointed at
`/home/michaelgarisek/Projects/cycleforge-lanes/prod`.** Written 2026-09-26.

---

You are building the **backend and API contract** for CycleForge's new left
sidebar. The sidebar works like Vercel's dashboard sidebar: its content changes
with the page you are on. This session builds **no UI components**. It builds
the data model, the routes, the pure resolvers, and the tests and probe scripts
that prove them. When the contract ships, **this session writes the frontend
handoff** (see Definition of done). That next session builds the visual layer
with motion.dev and ports it to the Tauri desktop app. Anything you build
that only a React tree can consume is a defect: the Tauri shell must get the
same answers over HTTP.

## Read first (in this order)

1. `AGENTS.md` (dev origin `:3050` only, lane unit, `pnpm verify:fast`).
2. `docs/refactors/sidebar/vercel-sidebar-research.md`: the observed Vercel
   behaviour this contract must be able to express. Key facts:
   - The body swaps only when you drill into a section that has sub-pages. The
     back row `‹ <Section>` changes the sidebar's view only, never the URL.
   - Top-level items never appear under a drilled panel.
   - The fixed header holds the switcher and Find; the fixed footer holds the user.
   - Nav items carry no number badges. Counts appear only inside filter groups
     (the Logs panel) and in page content.
   - Deep pages keep the parent panel and use in-page tabs.
   - The sidebar level comes from a route table, not a URL-prefix match.
3. `docs/refactors/sidebar/current-sidebar-inventory.md`: every current
   context panel, in-page tab desk, triage API and nav registry, with file:line
   references. Re-verify each reference before you edit it.
4. `docs/refactors/desk-3pane-ai-first-PLAN.md` §2: the Shipping desk routing
   contract already shipped (`src/lib/outbound/desk-views.ts`, `?pair=po`,
   `?queue=pick`, `GET /api/orders/desk-counts`,
   `src/lib/orders/desk-view-{filters,sql}.ts`).
5. Skills: `skill://db-migration-author` (every migration),
   `skill://new-route` (every route), `skill://org-scope` (every tenant query),
   `skill://domain-unit-test` (resolver and domain tests),
   `skill://request-shape` (any route on a first-paint path).

## Authority and scope

This is **dogfood**, and the port is **incremental**. The old master-nav
sidebar stays mounted and working. The new contextual sidebar replaces it page
by page behind a switch (Phase 4), and each page's old UI is deleted in the
same PR that turns that page on, never before. In this session:
- Delete stale backend code instead of adapting it; leave no shims, aliases or
  "legacy" branches in the contract.
- Delete no UI.
- The hard rule for the whole program: **never remove a surface's scan input or
  its only path to a record before the replacement is live and proven by the
  probe.** On a warehouse floor, a scan bar that disappears is an outage, not a
  cleanup.

Non-goals for this session: visual components, styling, motion, colour, the
Tauri shell, and layout geometry. If you catch yourself writing JSX beyond
what a route needs, stop.

## Phase 0: parallel scouting wave (run before any edit)

Launch these as **parallel** `scout` agents in one batch. Each returns
compressed file:line findings. Write the combined result to
`docs/refactors/sidebar/phase0-findings.md` before any edit.

1. **Schema and query-shape audit (the polymorphic model stays).** Ruling from
   the operator on 2026-09-26: keep the polymorphic orchestration tables
   (`entity_type` / `entity_id` families). The scout's job is to make them fast,
   not to flatten them. For each polymorphic family report the columns, the
   existing indexes, the hot query shapes, and the missing composite or partial
   indexes, then propose an index/read-model plan with the expected win per
   query. Known families (grep of `src/lib/drizzle/schema.ts`): `feed_memberships`,
   `entity_signals`, `entity_notes`, `entity_threads`, `thread_links`,
   `ticket_links`, `photo_entity_links`, `document_entity_links`,
   `entity_search_docs`, `entity_search_outbox`, `work_assignments`,
   `agent_mutation_affects`, `ops_events`, `staff_inbox_items`,
   `staff_rail_exclusions`, `staff_subscriptions`, `pack_verification_events`,
   `station_activity_logs`, `shortage_inbound_links`, `notification_outbox`.
   Also measure these known slow or wrong paths:
   - `/api/orders/queue-counts` with `?staff=` (documented ~15 s).
   - The `/api/orders` Upstash cache key leaves out `limit` and `cursor`
     (bug: `limit=3` returned 30 cached rows).
   - Triage count 38 vs queue-counts total 406 (the label requirement differs).
   - First-paint HTML on `/shipping/orders` contains no queue row.
   Get evidence with `EXPLAIN (ANALYZE, BUFFERS)` against the dev Neon branch
   (DSN from the worktree `.env` only). No guesses.
2. **Brand / manufacturer data audit.** Find every place brand information
   already exists or can be derived:
   - Zoho item fields (brand, manufacturer, custom fields) in the Zoho
     sync/mirror tables and adapters.
   - `sku_catalog.product_title` prefixes and `category`.
   - eBay/Amazon/Ecwid listing payloads.
   - Receiving line titles, and the Bose manuals/models tables
     (`BoseModelsSidebarPanel` data).
   Report coverage: what percentage of active SKUs a deterministic rule can
   brand today. Also report how `resolveSkuIdentityTitle` /
   `SKU_CATALOG_JOIN_ON_SQL` must carry the brand (the SKU identity law says
   the Zoho item governs).
3. **Route and param inventory for the nav contract.** For every
   `SIDEBAR_PAGE_NAV` page, list:
   - its children and their `to()` targets;
   - its `routeParamsFor` spec;
   - which current context panel it mounts (see the inventory);
   - which data each panel needs (recents, facets, saved views, a scan input).
   Flag every client-only store the Tauri app cannot reach, e.g. localStorage
   recents: `cycleforge:detail-stacks:history:v1`,
   `cycleforge:support:recent-tickets:v1`, `audit-log:trace-recents:v1`.
4. **Identification path audit.** Trace `/api/scan/resolve`,
   `/api/global-search` (hybrid search + `entity_search_docs`),
   `/api/orders/lookup/[orderId]`, and the ⌘K command bar source. For each:
   the input grammars it recognises (tracking, order #, serial, SKU, UPC/EAN/GTIN,
   FNSKU, PO, handle, GS1 AIs), p50/p95 on the dev branch, the ranking logic,
   and the gaps (brand, model number, and fuzzy title are expected gaps).
5. **Parity inventory (stage 0).** Write one table per `SIDEBAR_PAGE_NAV`
   page into `docs/refactors/sidebar/PARITY.md`. List every view/tab, filter
   (URL param + allowed values), action button, recents list, scan input,
   saved-views key and count the old UI provides today, each with its source
   file:line.
   - Split the pages across agents by lane: Inbound, Outbound, Inventory,
     Products, Sales, Support, Operations, Scan Stations.
   - For Shipping, also list the controls removed on 2026-09-26. Recover them
     from history (`git log -S 'data-table-toolbar' --
     src/components/outbound/orders/OutboundOrdersLedger.tsx`, and the same for
     `ShippedLedgerToolbar` / `exception-category-tabs`) or from the inventory
     doc, so wave A can restore them.

## Phase 1: product brands (migration + domain + API)

Operator requirement: search for and identify products by brand across the
product tables. Examples: Bose, Rock Band, Guitar Hero, Sony, JBL.

Model it with the design below. Keep it polymorphic-friendly; brand is an
attribute of the catalog, not a new entity family.

- `product_brands`:
  - `id`, `organization_id`, `name`
  - `slug`: unique per org
  - `normalized_name`: lower-cased, punctuation-folded, unique per org
  - `kind` in `brand | franchise | product_line`. Rock Band and Guitar Hero are
    franchises (publishers Harmonix/MadCatz and Activision/RedOctane), so they
    are not the same kind of fact as Sony.
  - `parent_brand_id`: nullable self-FK, so a franchise or line can sit under a
    manufacturer
  - `is_active`, timestamps
  - RLS / tenant scoping per `org-scope`
- `product_brand_aliases`:
  - `brand_id`, `organization_id`, `alias`, `normalized_alias`
  - `source` in `seed | zoho | listing | operator | agent`
  - unique `(organization_id, normalized_alias)`
  - Aliases hold the misspellings, abbreviations and model-prefix tokens
    ("BOSE", "Bose Corp", "QC" → Bose line QuietComfort).
- `sku_catalog.brand_id`: nullable FK plus a partial index
  `WHERE brand_id IS NOT NULL`. Also add `brand_confidence` (0–1) and
  `brand_source` so a guess can never pass as a fact.
- **Backfill** in a script, never in the migration:
  1. Zoho brand/manufacturer field when present.
  2. Alias match on the title's leading tokens.
  3. Listing payload brand.
  Anything below the confidence threshold goes to an **approval-first review
  queue**, per the AI-first rule in `docs/warehouse-os/LAWS.md` T28: an AI or
  deterministic proposal is applied by a human or by the org's auto-approve
  setting.
- **Search integration**:
  - Brand name and aliases are written into `entity_search_docs` for SKUs, and
    therefore for orders, units and receiving lines that carry the SKU.
  - `/api/global-search` gets an `axis=brand` and a brand facet.
  - `/api/scan/resolve` and the new identify endpoint (Phase 3) return `brand`
    on every product-bearing match.
- **Routes** (under `withAuth` + permission):
  - `GET /api/brands?q=&kind=&limit=`: typeahead ordered by alias hit, then by
    active SKU count.
  - `GET /api/brands/[id]`: detail with aliases, parent/children, and SKU,
    open-order and on-hand counts.
  - `GET /api/brands/[id]/products?cursor=&limit=&status=`
  - `POST /api/brands` and `PATCH /api/brands/[id]`, with alias add/remove.
    Brand mutations go through the agent mutation trust class when the
    assistant proposes them.
- **Seed**: Bose, Sony, JBL (brands); Rock Band, Guitar Hero (franchises).
  Seed as org data for the dogfood org through a seed script, not hard-coded.

## Phase 2: nav context contract (the sidebar's single source of truth)

Build it as a **pure, framework-free resolver**, plus a thin API route so
Tauri gets identical answers.

- `src/lib/nav/context/` exports
  `resolveNavContext({ pathname, params, permissions, orgNav }) → NavContext`.
  `NavContext` is a zod-validated shape:
  - `scope`: `top | section`
  - `page`: `{ id, label }`
  - `back`: `{ label, mode: 'local' }` or `null`. Vercel semantics: the back row
    only moves the sidebar up one level and never navigates. Browser
    back/forward always rebuilds the context from the URL.
  - `search`: `{ scope, placeholder, source: 'desk-store' | 'url-param' | 'identify', param? }`
  - `sections: Array<{ id, label?, items: Array<NavItem> }>`
  - `NavItem`:
    - `id`, `label`, `href` (fully built from the child's `to()`), `active`
    - `kind: 'link' | 'drill' | 'filter' | 'toggle'`
    - `badge?: 'beta'`. There is no numeric count field on nav items.
  - `filters?`: facet groups (the Logs-panel pattern). Only here do counts
    exist, and they are fetched separately.
  - `recents?`: `{ endpoint }` for scan stations and pickers.
  - `savedViews?`: `{ storageKey, paramKeys }`, reusing
    `outboundSavedViewsConfig` and `src/lib/saved-views/surfaces.ts`.
  - `scanInput?`: `{ grammar, endpoint }` for stations.
- **Source of truth:** `SIDEBAR_PAGE_NAV` children become the section items
  (these are today's in-page tabs, `DeskPageChrome` / `useDeskPageChromeTabs`).
  Shipping's section comes from `DESK_VIEWS`: Exceptions · Picking (PO paired,
  Pick list) · To ship · Shipped. Note: the tab formerly labelled "Pending" is
  **"Picking"** (operator ruling 2026-09-26).
- `GET /api/nav/context?path=<url>` returns the same `NavContext`,
  permission-filtered for the session.
- **Server-side recents.** Replace every localStorage-only recents store with a
  polymorphic `nav_recents` table:
  - columns `organization_id, staff_id, surface, entity_type, entity_id, label_snapshot, opened_at`
  - an upsert-on-open with a per-surface cap
  - index `(organization_id, staff_id, surface, opened_at DESC)`
  - `GET /api/nav/recents?surface=&limit=` and `POST /api/nav/recents`
  Stations whose recents already come from server feeds (`/api/receiving-lines`,
  `/api/tech-logs`, `/api/packerlogs`, `/api/labels/recent`) get
  `recents.endpoint` pointed at a **normalised adapter**, so every recents list
  returns one row shape: `{ id, entityType, entityId, title, subtitle, status, at, href }`.
- **Facets**: `GET /api/nav/facets?context=<pageId.sectionId>&…current params`
  returns groups `{ id, label, param, options: [{ value, label, count }] }` for
  the active view. Counts come from the same predicates the list uses. Prove
  it with a test in which facet count = list total.

## Phase 3: triage and identification quality-of-life (the product's edge)

The operator's speed comes from finding any record instantly. Build
`POST /api/identify` (and `GET ?q=` for probes) on top of `scan/resolve`,
hybrid search and brands.

- **Input:** anything pasted or scanned. Tracking, order #, marketplace order
  id, serial, SKU, UPC/EAN/GTIN, FNSKU, PO, GS1 Digital Link, handle, brand,
  model number, free text ("bose 700 used", "guitar hero drums"), and
  **multi-line batches**: one identifier per line, each resolved separately.
- **Output:** ranked candidates. Each candidate has:
  - `kind`, `entityId`, `title`, `brand`
  - `confidence`
  - `matchedOn` (the field and token that matched, for the "why" line)
  - `href`: the page, sidebar context and record param that open it
  - `actions[]`: the next verbs, e.g. open, print label, assign, resolve exception
  - `stage` (where the record is in the workflow: exception / picking / to ship /
    shipped / receiving)
- **Behaviour:**
  - An exact match on a unique identifier short-circuits to `single`.
  - Typo tolerance on titles and brands (trigram or the existing hybrid
    semantic lane).
  - Token classification runs before search: brand alias hit → brand filter,
    grade words → condition filter.
  - Results are scoped to the caller's current context first, then global
    (Vercel's Find orders suggestions by the current scope).
  - Every identify call is logged through `src/lib/search/query-log.ts`
    (`search_query_log`, including the `opened_entity_*` follow-up), so the
    last-identified list is a server recents surface too.
- **Latency budget:** exact identifiers p95 < 150 ms and free text p95 < 400 ms
  on the dev branch. Measure and record the numbers in the probe output.
  Cache per org with tags invalidated by the existing `orders` / `sku` tags.

## Phase 4: the per-page switch (data only; this session deletes no UI)

The old sidebar stays mounted and stays the default on every page until that
page is ported. This session provides the switch as **data**. The frontend
session wires it.

- `src/lib/nav/context/rollout.ts`: `NAV_CONTEXT_ROLLOUT: Record<pageId, 'legacy' | 'contextual'>`.
  Every page starts `legacy`. Add an org/staff override through the settings
  registry (`nav.contextual.<pageId>`) so the operator can dogfood one page
  before it flips for everyone.
- `NavContext` carries `rollout: 'legacy' | 'contextual'`, so the web shell and
  Tauri read the same answer.
- Test: a page may be `contextual` only when its `PARITY.md` rows are all
  covered by its `NavContext` (views, filter params, actions, recents, scan
  input, saved views). Enforce this in the resolver test, not by review.

**State of the tree when you start (2026-09-26):**
- **The old master-nav sidebar is back and mounted.** Removing it was reverted
  on operator instruction. Do not delete it. It goes page by page in the
  frontend waves and disappears entirely only in the final cleanup.
- **The Shipping desk tables currently have no controls above them.**
  Already removed: view tabs, header actions, the toolbar (search, select-all,
  filter, sort, views, page size, Edit platforms, zoom, density, fullscreen),
  the exception category bar, and `ShippedLedgerToolbar`.
  - The URL parameters those controls wrote still drive the lists: `category`,
    `stage`, `aging`, `staff`, `sort`/`dir`, `pair`, `queue`, `search`,
    `shipped*`, and others.
  - The Shipping page is therefore wave A's first port. Its `NavContext` must
    expose every one of those parameters.
  - Until wave A lands, the operator navigates the Shipping views through the
    old sidebar's Outbound children and through ⌘K.
  - ⌘K now lists page destinations under "Go to".

**Deletion map, executed by the frontend session and not here.** Record it in
the frontend handoff. For each page, the old panel, its tab row and its
localStorage recents go in the same PR that turns the page on. The last
cleanup, only once every page is `contextual`, deletes:
- the old master nav (`MasterNav`, `SidebarNavList`, `DashboardSidebar`,
  `SidebarNavColumn`);
- `ContextPanelLayout`, the `context-panel-*` helpers and `left-dock-toggle`;
- `useDeskPageChromeTabs`, the `DeskPageChrome` tab row and `HeaderPageSwitcher`;
- `isRaillessSurface` / `railless`;
- the rollout switch itself.

## Program staging (this session owns Phases 0–4; the frontend handoff carries the rest)

| Stage | Owner | What |
|---|---|---|
| 0 · Parity inventory | this session | `docs/refactors/sidebar/PARITY.md`: one table per `SIDEBAR_PAGE_NAV` page listing every view/tab, filter (URL param), action, recents list, scan input, saved-views key and count the old UI provides, with the source file:line. This table is each page's definition of done. |
| 1–3 · Contract | this session | Brands, nav context, facets, recents, identify (the phases above). |
| 4 · Switch data | this session | Rollout map + settings override + parity-enforcing test. |
| 5 · New sidebar host | frontend | One host beside the old nav. It renders `NavContext` (top-level map ↔ section panel, local `‹ Back`, fixed header/footer) for pages set to `contextual`. |
| 6 · Port waves | frontend | **A** Shipping desk (restores its removed controls into the sidebar first) → **B** tab-only desks (Reports, Sourcing, Inventory, Operations, Products views, Support modes) → **C** picker/recents pages (Products catalog, Support tickets, Audit log, Settings roles/access) → **D** scan stations (Unbox, Triage, Pickup, Testing, Pack, Ready-to-pack, FBA), one station at a time with a floor trial day each. Each page PR flips the page to `contextual` and deletes its old panel and tabs. |
| 7 · Cleanup | frontend | Deletion map above, once every page is `contextual`. |
| 8 · Visual layer | frontend | motion.dev (fade + blur swap, dropdowns, popovers), colour, the desktop design base, and the Tauri port. |

## Testing contract (nothing counts as done without this)

- **Pure resolver tests** (`node:test` via `tsx`, following neighbours):
  - every `SIDEBAR_PAGE_NAV` page resolves;
  - every item `href` round-trips (resolving that href marks that item active);
  - a `section` context never contains top-level items;
  - `back` is `null` exactly at top level;
  - no nav item carries a count;
  - permission filtering removes items the role cannot reach;
  - `Picking` replaces `Pending` everywhere.
- **Domain tests with injected deps** (`domain-unit-test` skill):
  - brand normalisation and alias collisions;
  - backfill confidence thresholds;
  - identify token classification;
  - batch splitting;
  - ranking ties.
- **Route tests:** auth/permission refusal, org isolation (an org-B brand never
  resolves for org A), zod shape validation.
- **Authed probe script** `scripts/probe-sidebar-contract.mjs`, run against
  `http://localhost:3050` (mint a session the way
  `scripts/lighthouse-mint-session.mjs` does). For every page, section, view and
  facet value it asserts:
  - response shapes;
  - `list total == facet count == desk-counts value`;
  - identify results for a fixture set (one of each identifier kind, plus
    "bose", "guitar hero", "jbl flip");
  - latency percentiles.
  The script prints a table and exits non-zero on any mismatch.
- `tsx scripts/audit-route-auth.ts --check`, `pnpm verify:fast`, and
  `pnpm verify` before you call it done.

## Definition of done

- Phases 0–3 merged, the switch data from Phase 4 in place, all probes green,
  and these numbers recorded in `docs/refactors/sidebar/BACKEND-RESULTS.md`:
  - p50/p95 per endpoint;
  - index wins, with before/after `EXPLAIN`;
  - brand coverage % after backfill;
  - per-page parity status: which pages the contract fully covers.
- `docs/refactors/sidebar/API-CONTRACT.md` documents every route: method,
  params, zod schema, example response, and permission.
- **This session writes the frontend handoff.** Last step: write
  `docs/refactors/sidebar/FRONTEND-HANDOFF.md`, a self-contained paste-ready
  prompt built only from what this session discovered and shipped. It must
  include:
  - the contract, with the exact endpoints and shapes;
  - every page's `NavContext` and the scan-station recents/scan inputs;
  - the program staging (the "Program staging" table above): the switch, the
    port waves A–D, the per-page
    parity checklists (`PARITY.md`), and the rule that deletion happens per page
    in the same PR that turns the page on;
  - the Vercel behaviours from the research spec it must reproduce: the
    header / body / footer anatomy, `‹ Section` back as local state, the
    ~100–150 ms fade (+ blur) swap, click-open dropdowns and popovers, and no
    nav counts;
  - motion.dev only, via `@/design-system/motion` and `…/motion/plus`
    (Motion+ is licensed and installed);
  - the desktop sidebar design base, which the Tauri app will reuse;
  - how to wire the new UI to this backend;
  - measured numbers from `BACKEND-RESULTS.md`.
  Nobody writes that prompt before this session finishes.
- No UI components were added and no UI was deleted. The old sidebar still
  mounts and works on every page. The switch data exists, and every page is set
  to `legacy`.
