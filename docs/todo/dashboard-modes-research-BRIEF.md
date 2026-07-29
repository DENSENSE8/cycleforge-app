# Deep-research brief — `/dashboard` mode architecture (2026 industry standards)

**Audience:** Gemini Pro (deep research). **Scope: the `/dashboard` page only.** Do not propose
changes to other routes (`/shipping`, `/unbox`, `/triage`, `/operations`, `/support`, `/o/[id]`),
to the global master-nav L1 page list, or to the backend. Recommendations that require touching
other surfaces should be flagged as "out of scope — note only".

---

## 0. What we want out of this research

A **prescriptive, evidence-backed recommendation** for how `/dashboard` should organize its
information, given that today it is three mutually-exclusive *modes* (Search · Receiving ·
Shipping) that each replace the entire page. Specifically:

1. **Where do mode-like axes belong in 2026 ops-SaaS?** Sidebar L2 rail vs. in-page tab strip vs.
   segmented control vs. a single unified surface with facets/filters. What does the current
   evidence (Linear, Stripe Dashboard, Shopify Admin, Ramp, Retool, Height, Notion, ShipBob /
   ShipHero / Fulfil / Cin7 style WMS/OMS consoles, Airtable/Smartsheet grids) actually do, and
   *why* — with the tradeoff literature (NN/g, Material 3, Carbon, Atlassian, Shopify Polaris,
   Apple HIG, WAI-ARIA APG) behind each.
2. **Specifically: should "inbound" and "outbound" be two modes, two tabs, or two views of one
   collection?** They are genuinely different row types (receiving cartons vs. sales orders) that
   never share a table. Is a shared page with a domain switch the right pattern at all, or is the
   2026 answer a single "flow" surface with a direction facet, or two separate pages?
3. **Where does *search history* belong?** Today it is a full page mode (`?mode=search`) whose only
   job is "recently searched orders + a results/detail pane". Almost certainly wrong as a co-equal
   mode. We want a researched recommendation on the modern home for recent-search / recently-viewed
   affordances (command palette recents, a "Recents" rail, a jump-back-in row, a dedicated results
   route, an inbox-style pinned section, …) with accessibility and discoverability evidence.
4. **How to condense three whole-page modes into one dashboard** that still lets an operator read
   inbound status and outbound status without a mode round-trip — while respecting that the two
   domains cannot share a single table.
5. **Deep-linking / URL-state, keyboard, and a11y conventions** for whichever pattern you
   recommend (tab vs. mode vs. facet), including ARIA roles, focus management on switch, and what
   should and should not be in the query string.

Deliverable: a decision document with (a) a ranked recommendation, (b) the runner-up and why it
loses, (c) a concrete IA sketch for `/dashboard` (zones, what's always visible, what's behind a
switch), (d) a migration note describing what changes for existing deep links, and (e) citations.

---

## 1. Product context (needed to judge the tradeoffs)

**Cycle Forge** is multi-tenant reseller-operations SaaS (used-goods reseller: receive inbound
cartons → test/grade → list → pack → ship; plus returns/warranty). The UI identity is internally
named **Kinetic Ledger**: data-first, dense, state-colored, scan-aware. The design philosophy is
"legible throughput over document calm" — closer to Linear's calm chrome + Carbon/Stripe ops
density than to a marketing-style dashboard.

The app is organized around four **region contracts** (this vocabulary matters for your answer):

| Contract | Input model | Job | Selection |
|---|---|---|---|
| **Station** | barcode scanner / keyboard wedge | act-and-clear | ephemeral, never in URL |
| **Workbench** | pointer | pick a record → edit → persist | durable, URL-addressable |
| **Monitor** | filters over a stream/rollup | observe only, no edit | none (filters only) |
| **Canvas** | pan/zoom | reshape a definition | durable focus in URL |

`/dashboard` is a **Workbench** (pick an order → open it → edit) that also hosts a **Monitor**
rollup region (a KPI strip). Any recommendation must keep those two jobs distinguishable —
a Monitor region must not grow durable per-row selection or inline editing.

Densities are named: `floor` (station), `ops` (dense tables/boards), `rollup` (KPI/analytics),
`studio` (canvas). `/dashboard` is `ops` with a `rollup` band.

---

## 2. How modes work today (mechanics — this is the thing being critiqued)

### 2.1 The sidebar

The left column is a **master nav** with two levels:

- **L1 — pages** (Dashboard, Sales, Products, Inventory, Warehouse, Receiving, Shipping, Testing,
  Packing, Review, Support, …). Registry: `src/lib/sidebar-navigation.ts` → `APP_SIDEBAR_NAV`.
- **L2 — modes**, declared per page on the same registry as `SidebarPageNav.modes[]`
  (`src/lib/sidebar-navigation.ts:483`+). Modes are rendered by
  `src/components/sidebar/master-nav/MasterNav.tsx` / `MasterNavView.tsx` as a click-opened
  dropdown under the page header trigger (plus MRU "recent mode" chips). The page you are on opens
  with its modes already expanded.
- Below the nav sits a **page context panel** — the per-page sidebar body (picker / rail / recents).
  For `/dashboard` that is `src/components/sidebar/DashboardOrdersContextPanel.tsx`.

Mode navigation is a pure URL write: `useSidebarModeNav()`
(`src/components/sidebar/master-nav/useSidebarModeNav.ts`) applies the mode's `to()` target —
`router.replace` for a same-page mode flip, `router.push` for a page change.

### 2.2 The three dashboard modes

Declared in `src/lib/sidebar-navigation.ts` (`SIDEBAR_PAGE_NAV` → `id: 'dashboard'`), resolved in
`src/lib/dashboard/dashboard-domains.ts`:

| Mode (L2 pill) | URL | Right-pane component | Sidebar body |
|---|---|---|---|
| **Search** | `?mode=search` (+ `?q=`, `?openOrderId=`, `?map=recent\|search`) | `DashboardSearchView` | `DashboardSearchSidebar` (Recent \| Search sub-slider) |
| **Receiving** | `?mode=inbound` (alias `receiving`) + `?sort=scanned_newest\|unboxed_newest` | `DashboardReceivingView` | *none* (returns `null`) |
| **Shipping** (default) | bare, or `?unshipped` / `?shipped` | `DashboardOrdersView` | `UnshippedSidebar` (order feed) |

Key structural facts:

- Every mode switch **clears the other modes' scoped params** (a long `params: { … : null }` list
  in each mode's `to()`), so each mode opens clean. This is a maintenance liability — the clear
  lists are hand-maintained and duplicated per mode.
- The page (`src/app/dashboard/page.tsx`, 144 lines) is a **hard three-way branch**: `mode ===
  'search'` returns one subtree, `mode === 'receiving'` returns another, otherwise the outbound
  subtree + the order detail panel. The three modes share almost nothing but the shell.
- There is a **second, deeper concept — DOMAIN** (`outbound` | `inbound`), documented in
  `dashboard-domains.ts`: "The dashboard hosts two domains, and they never share a table."
  Inbound rows are receiving *lines/cartons*; outbound rows are sales *orders*. Mode `receiving`
  IS domain `inbound`. So the page has two overlapping vocabularies (mode vs. domain) for
  nearly the same axis — plus Search, which is neither domain.
- Permissions differ per mode: the page is gated on `dashboard.view`, but Receiving mode
  additionally requires `receiving.view` and renders its own "no access" empty state.
- Legacy `?warranty=` deep links redirect out to `/support?mode=warranty` — precedent that a mode
  can be *removed* from this page and rehomed.

### 2.3 Inside each mode

**Shipping / outbound** (`DashboardOrdersView.tsx` → `OutboundWorkspaceHeader.tsx`):

- A pinned chrome bar (outside the scroll port) with **lifecycle tabs**: Pending · Tested · Packed
  · Shipped (`TabSwitch` via `WorkbenchChromeHeader`), with live counts on Pending/Tested.
- Right side of the chrome: scoped search toggle (icon → expands), exact filters, a display-sort
  dropdown, a per-staff column **Fields** menu, Import + Add buttons, plus a portal slot the table
  fills with its own controls.
- Scroll body: an **`OutboundKpiStrip`** (rollup band, scrolls away) then the lifecycle table
  (`UnshippedTable` / `PackedOrdersTable` / lazy `DashboardShippedTable` / lazy `FbaShipmentsTable`).
- A slide-in **order detail panel** (`DashboardOrderDetails`) opens on row selection. Only this
  mode mounts it.
- Multi-select is always on, with a `ContextualSelectionBar` of lifecycle-scoped bulk actions.

So: **the outbound mode already uses in-page tabs for its own sub-axis.** The page therefore has
mode (sidebar) + lifecycle tab (in-page) + filters + sort + fields — four stacked axes.

**Receiving / inbound** (`DashboardReceivingView.tsx` → `DashboardReceivingHeader.tsx`):

- Its own pinned chrome with **two table tabs: Triage · Unbox** (which map onto `?sort=`
  `scanned_newest` / `unboxed_newest`), its own scoped search + per-tab filter popover.
- Its own KPI band (`DashboardReceivingKpiStrip`) with tiles like *To scan in · Claims clock ·
  Awaiting tracking · Carrier mismatch · Arriving today · To unbox · Incoming POs · In transit*.
- Body is the shared `ReceivingLinesTable` (which reads its own mode from the URL).
- **No sidebar body at all** in this mode — the sidebar column goes empty.

**Search** (`DashboardSearchView.tsx` + `DashboardSearchSidebar.tsx`):

- The sidebar shows a `Recent | Search` sub-slider: recently-opened detail stacks and per-staff
  saved search recents (`useStaffSearchRecents`, scope `dashboard-search`), plus AI quick-jump hits.
- The main pane is a **resolution pipeline**: an exact identifier (order # / tracking / serial)
  goes spinner → single order detail shell; a natural-language query renders a cross-entity results
  surface; a sole-order result auto-opens. Also has FBA-shipment and not-found teaching empties.
- **The query field itself is NOT here** — typing lives in the always-global header search pill
  (⌘K style), which navigates to `/dashboard?mode=search&q=`. So this mode is essentially a
  *landing surface for the global search*, plus a recents list.
- Its user-stated purpose (from the product owner): *"just to display the recently searched
  orders."* That is a small job occupying a full page mode.

### 2.4 Shared shell primitives (constraints on any redesign)

- `DashboardScrollShell` — two-zone shell: a non-scrolling `chrome` slot + one `overflow-y-auto`
  body. House law: **exactly one sticky layer per scroll port** (day-band headers dock at `top-0`
  of the body under the chrome; no offset math, never two stacked `sticky top-*` bands).
- `workbench-shell.tsx` — `WORKBENCH_GUTTERS` (centered `max-w-[1440px]`), `WORKBENCH_CHROME_COLUMN`,
  `WORKBENCH_BODY_COLUMN`, `WorkbenchChromeHeader` (tabs + search + right filters + trailing CTAs),
  `WorkbenchTablePane`, and a bounded table viewport (`h-[calc(100dvh-13rem)]`) so the framed grid
  owns its own Y scroll and all four edges of the card stay visible.
- Tables are converging on a headless grid waist (`LedgerGrid` / `useGridSurface`, TanStack Table v8
  for state only) with per-staff column visibility persisted as a delta, and URL-durable column sort
  (`?colsort=` / `?coldir=` — note `?sort=` is already taken by server ordering on these routes).
- Monitor rollup blocks (`KpiStrip`, `KpiTile`, `SectionCard`, `DeltaChip`, `MonitorListBlock`)
  exist as a registry and are the sanctioned way to build a rollup zone.
- Motion law: crossfade **only** the singular focus surface (the detail pane), never the collection
  table/map; `prefers-reduced-motion` collapses to opacity.

---

## 3. The problems we believe exist (validate, refute, or reframe these)

1. **Mode is doing too many different jobs.** Search is a *lens over everything*; Receiving and
   Shipping are *domains*; but all three are peers in one L2 rail. A user switching "modes" gets
   three unrelated experiences.
2. **The switch is expensive and hidden.** Modes live in a sidebar dropdown, not on the page. An
   operator who wants "did that carton arrive?" while working the ship queue must open a nav
   dropdown, lose their table state (the mode's `to()` nulls the other mode's params), and come back.
3. **Three separate KPI stories.** Outbound has one KPI strip, inbound has another, search has
   none. There is no single "how is the operation doing right now" read.
4. **Search-as-a-mode is over-weighted** for what it does (recents + a results/detail landing).
5. **An empty sidebar in Receiving mode** — the sidebar column renders nothing, which reads as a
   bug and wastes ~360px.
6. **Two vocabularies (mode / domain)** for one axis, with hand-maintained param-clear lists.
7. **Axis stacking:** sidebar mode → in-page lifecycle tabs → filters → sort → fields → column
   visibility. Where is the ceiling for how many nested switches an ops surface can carry before
   users lose the plot? We want the research-backed number and the ordering principle.

---

## 4. Owner's redesign hypotheses — evaluate each, don't rubber-stamp

These are the product owner's own proposals. Treat each as a **hypothesis to be confirmed,
refined, or refuted with evidence** — not as a spec. For each one: say whether the industry
evidence supports it, name the strongest counter-pattern, and if you disagree, propose the nearest
alternative that satisfies the same underlying intent.

**H1 — Collapse the three modes into ONE dashboard page.**
Intent: an operator should not have to leave the page (via a sidebar dropdown) to change what
they're looking at. *Question for you:* is a single page with in-page switching genuinely better
here, or does the evidence favor keeping a domain-level route split? What is the switching-cost
threshold at which a nav-level split beats an in-page one?

**H2 — Inbound and outbound become TABS (in-page), not sidebar modes.**
Intent: put the domain switch on the page where it's visible, next to the data it controls. This
would mean the page carries a domain tab strip *and* each domain's existing lifecycle/stage tabs
(Pending·Tested·Packed·Shipped for outbound; Triage·Unbox for inbound). *Question for you:* is a
two-level in-page tab structure defensible in 2026, or must the second level become something else
(segmented control, filter chips, a dropdown, a merged single strip)? Give the evidence on nested
tab strips specifically.

**H3 — "Different buttons for displaying different information."**
Intent: quick toggles/segments that change what the surface shows without a full mode change —
e.g. attention-only vs. everything, today vs. week, counts vs. detail. *Question for you:* what is
the right vocabulary for these (toggles, chips, saved views, facets, segmented controls)? Where
does the line sit between a *tab* (a different collection) and a *filter* (the same collection,
narrowed)? Cite the systems that draw this line explicitly.

**H4 — Search history stops being a mode and gets integrated somewhere better.**
Intent: recently-searched orders are a small, useful affordance that does not deserve a full page
mode. Candidate homes to evaluate (add your own): inside the global ⌘K palette as recents; a
persistent "Recents" rail in the dashboard sidebar visible in every domain; a jump-back-in row on
the dashboard landing; a dedicated `/search` results route for the non-exact-match case; a pinned
section above the working table. *Question for you:* rank these, and separately answer where the
**search results surface** (a natural-language query that isn't an exact match) should live once
the recents list moves — those are two different jobs currently bundled into one mode.

**H5 — The dashboard should be simplified and condensed overall.**
Intent: less chrome, fewer stacked axes, one coherent read of the operation. *Question for you:*
what specifically should be cut? Give a concrete "keep / merge / move / delete" list against the
inventory in §2.3 (two KPI strips, two chrome headers, four stacked control axes, the empty
sidebar in Receiving mode, the mode/domain vocabulary duplication).

> **Owner: add any further ideas below before sending this brief.** Keep them phrased as
> intent + proposed mechanism, so the research can evaluate the intent even if it rejects the
> mechanism.
>
> - *(add here)*

---

## 5. Contract audit — grade our current contracts against industry standard

Cycle Forge encodes its UI law as explicit **contracts** (see §1 and §2.4). Part of this research
is an outside-in audit: **where are our contracts genuinely house-strong, where are they merely
idiosyncratic, and where are they behind the 2026 standard?** For each contract below, deliver:
(a) the closest industry equivalent and who does it best, (b) a verdict — *ahead / at parity /
behind / idiosyncratic-but-fine / actively harmful*, (c) if it should change, the **specific
amended contract text** we could adopt, scoped to `/dashboard`.

| # | Our contract (as written today) | What to compare against |
|---|---|---|
| C1 | **Four region contracts** — Station (scanner) / Workbench (pick+edit, durable URL selection) / Monitor (observe-only, no durable selection) / Canvas (graph). A region obeys exactly one; a page with N jobs is N regions. | Industry equivalents for "this region's interaction model is fixed" — Polaris page/section semantics, Material 3 layout regions, Linear's view-vs-detail split, IBM Carbon's page patterns. Is a formal contract vocabulary an asset or over-engineering at page scale? |
| C2 | **Mode (sidebar L2) vs. Domain (`outbound`/`inbound`)** — two names for a near-identical axis; mode `receiving` IS domain `inbound`. | How do mature apps name and model a page's primary axis? Is a dual vocabulary ever justified (e.g. nav-label vs. data-scope), or is this pure debt? Propose the single vocabulary we should adopt. |
| C3 | **"Inbound and outbound never share a table."** | Is a hard no-shared-collection rule the right contract, or do modern ops apps unify heterogeneous rows behind a typed/polymorphic grid with per-type columns? What are the real costs of each? |
| C4 | **Mode switches clear the other modes' scoped params** (hand-maintained null lists per mode). | State-preservation norms on axis switch: clear-all, preserve-all, or preserve-per-scope. What do users expect, and what's the maintainable mechanism (scoped param namespaces, a declared param owner per axis, view objects)? |
| C5 | **One sticky layer per scroll port** — pinned chrome outside the scroll body; anything that scrolls away lives inside it; no stacked `sticky top-*` bands. | Modern sticky/pinned-header practice for dense data surfaces (sticky column headers + toolbars + group bands). Is a one-layer rule too strict for a page that wants a pinned domain switch *and* pinned lifecycle tabs *and* a sticky grid header? If so, what's the disciplined multi-layer contract (measured offsets, CSS anchor positioning, `position: sticky` stacking) that replaces it? |
| C6 | **Monitor rollup regions may not grow durable selection or inline edit** — clickable KPI must filter (ephemeral), never select. | Industry practice on clickable/drill-down KPI tiles and metric-as-filter. Is our restriction the norm, and where exactly is the boundary drawn elsewhere? |
| C7 | **URL is the state source of truth** for selection, mode, and (partially) filters/sort; `replace` on same-page switches, `push` on page change. Filters/sort/search are only *partially* in the URL today — a known gap. | 2026 norms for URL-as-state in app-shell SPAs: what belongs in the query string, what belongs in per-user persisted prefs, what belongs in ephemeral memory. Back-button expectations for tab switches. Named/saved views as the escape hatch. |
| C8 | **Per-staff column visibility persisted as a delta; columns declared `core`/`optional` so grids open lean.** URL-durable column sort on a separate param pair (`?colsort=`/`?coldir=`). | Grid-personalization norms (Airtable/Smartsheet/Retool/AG Grid): per-user vs. per-view vs. shared saved views. Is per-staff-delta the right unit, or should the unit be a **saved view** that can be shared across a team? This matters directly to H3. |
| C9 | **Chrome anatomy** — one header band carrying: tabs · scoped search (icon → expands) · filter cluster · display sort · fields menu · primary CTAs, plus a portal slot the table fills. | Toolbar composition and ordering conventions for dense tables. Is our left-to-right ordering standard? Is an expand-on-hover search field a good idea at this density, or a discoverability cost? |
| C10 | **Permission-gated modes** — the page is `dashboard.view`, but Receiving mode additionally requires `receiving.view` and renders its own denial state inside the mode. | Norms for permission-varying sub-surfaces: hide the tab, disable with explanation, or show a locked teaching state. Include the a11y guidance on hiding vs. disabling nav affordances. |

**Also flag any contract we're missing** that the industry treats as table stakes for a surface
like this — e.g. saved/shared views, a declared empty/loading/error contract per region, a
density-mode contract, an undo contract for bulk actions, a "what happens to selection when
filters change" contract.

---

## 6. Research questions (ordered)

### A. Mode placement and the sidebar-vs-page question
1. In 2026, when a page has an axis with 2–4 mutually-exclusive states, what determines whether it
   belongs in the **global nav** (as sub-nav), in a **page-level tab strip**, or in an **in-content
   segmented control**? Give the decision criteria used by the major systems (Polaris tabs vs.
   navigation, Material 3 primary/secondary tabs, Carbon tabs vs. side-nav, Atlassian
   horizontal-nav guidance, Fluent 2 pivot), and reconcile the conflicts between them.
2. What is the current evidence on **sub-navigation hidden behind a hover/click dropdown** vs.
   always-visible? Discoverability, findability, and error-rate data if it exists.
3. Is there a defensible pattern for **mixing** — i.e. a domain switch in the sidebar *and* a
   lifecycle tab strip on the page — or is that the thing to eliminate? What do the ops consoles
   that clearly work (Linear's views, Stripe's Payments/Balance/Customers, Shopify Orders, Height)
   actually stack, and how many levels deep do they go?

### B. Inbound vs. outbound as an information architecture problem
4. In modern WMS/OMS/3PL and commerce-ops dashboards, how is **inbound (receiving) vs. outbound
   (fulfillment)** typically presented? Same page with a switch, two pages, or one "flow" surface?
   Look at ShipBob, ShipHero, Fulfil, Cin7, Katana, Linnworks, NetSuite WMS, Shopify Fulfillment,
   Amazon Seller Central's inbound vs. orders split — and note which of them the industry considers
   good vs. legacy.
5. Given a hard constraint that the two row types **cannot share one table**, what patterns let a
   user read both at a glance without a full-page mode change? (Split view, dual rollup zones over
   a single switchable table, an "attention" digest that spans both, a two-column board, a summary
   page that drills into two tables, …) Rank them for a dense ops audience.
6. Is **direction (in/out)** better modeled as a *tab*, a *filter facet*, or a *section on one
   scrolling page*? Cite evidence about switching cost vs. scroll cost for operators who monitor
   both continuously.

### C. Search history / recents
7. What is the 2026 standard home for **recent searches and recently-viewed records** in an ops
   app that already has a global ⌘K-style search pill? (Palette recents, a persistent recents rail,
   a "jump back in" row on the landing surface, a dedicated `/search` results route, a pinned
   section, per-entity recents…) Evidence on which placements actually get used.
8. If recents move out of a full page mode, where do they go **without** creating a new hidden
   surface — and how does the *results* view (a query that isn't an exact match) get a home? Does a
   search results surface deserve its own route rather than a dashboard mode?
9. Accessibility + privacy considerations for surfacing other-users'-vs-own recents in a
   multi-tenant, multi-staff workspace.

### D. Condensing into one dashboard
10. What is the modern anatomy of an **operations landing/dashboard page** that must serve both
    "glance at status" and "work the queue"? Specifically: how much rollup (KPI) is justified above
    a working table before it becomes decoration; whether KPI tiles should be *filters* (clickable
    → apply a facet) or pure display; and what belongs above the fold at 1080p on a warehouse
    monitor.
11. Guidance on **attention/exception-first dashboards** (surface only what needs action) vs.
    **status dashboards** (show all counts) for this audience. Which converts better to actual
    operator behavior, and what's the evidence?
12. How should the page behave when a user has permission for only one domain (e.g. no
    `receiving.view`)? Hide the tab, disable it, or show a locked teaching state? Cite the
    accessibility guidance on hiding vs. disabling navigation.

### E. Mechanics of whichever pattern wins
13. **URL state:** what belongs in the query string for a tabbed ops page (active tab, filters,
    sort, selection, search query, column config) and what should not? Guidance on `replace` vs.
    `push` for tab switches and back-button expectations.
14. **State preservation across switches:** should switching axes clear the other axis's filters
    (today's behavior) or preserve them? What do users expect, and what's the evidence?
15. **A11y:** correct ARIA for the recommended pattern (`role="tablist"` + `aria-controls` vs.
    plain links vs. `aria-current="page"`), focus management on switch, and how tab strips should
    behave with a virtualized grid below them. Cite WAI-ARIA APG and note where "tabs that change
    the URL" should be links rather than tabs.
16. **Responsive/overflow:** how a 2–4 item domain switch plus a 4-item lifecycle strip plus filter
    chrome should collapse on narrower viewports.

---

## 7. Constraints any recommendation must respect

- **Scope is `/dashboard` only.** `/unbox`, `/triage`, `/shipping`, `/pack`, `/test` are separate
  *station* surfaces (scanner-driven, act-and-clear) and are not being redesigned. The dashboard's
  inbound view is a **read/monitor + pick view of receiving history**, not the receiving station.
- **Inbound and outbound rows never share a table.** They are different entities with different
  columns, permissions, and actions.
- **One sticky layer per scroll port.** Pinned chrome lives outside the scroll body; anything that
  should scroll away (KPI strips) lives inside it. A proposal that needs two stacked sticky bands
  is a non-starter unless it justifies the measured-offset complexity.
- **A Monitor (rollup) region must not grow durable row selection or inline editing** — that would
  turn it into a Workbench region and is a house anti-pattern. If you propose clickable KPI tiles,
  say explicitly whether they *filter* (allowed, ephemeral URL param) or *select* (not allowed).
- **Existing deep links must keep resolving** or be redirected: `?mode=search&q=&openOrderId=&map=`,
  `?mode=inbound|receiving&sort=`, bare / `?unshipped` / `?shipped`, and legacy `?warranty=`
  (already redirects to `/support`). Any renaming needs a redirect plan.
- **Density:** the audience is warehouse staff on 1080p monitors reading 10–14px dense rows.
  Recommendations calibrated for consumer/marketing dashboards will be rejected — say so if a
  cited source is from that context.
- **No second visual language.** We compose from an existing token system; the ask is IA and
  interaction pattern guidance, not a visual restyle.

---

## 8. Output format requested

1. **Executive recommendation** (≤1 page): the pattern, in one diagram + one paragraph.
2. **Verdict on each owner hypothesis H1–H5** (§4): supported / refine / refute, with the evidence
   and — where refuted — the nearest alternative that serves the same intent.
3. **Contract audit table** (§5): one row per contract C1–C10 with equivalent · verdict · amended
   contract text where it should change. Plus any missing contract you'd add.
4. **Evidence table:** pattern → who uses it → what the research says → why it fits/doesn't fit a
   dense multi-domain ops workbench. Mark each source as *empirical study*, *design-system
   guidance*, or *observed product behavior* — do not blend those.
5. **The IA sketch for `/dashboard`:** named zones, what is always visible, what is behind a switch,
   where recents/search live, where each KPI story goes, what happens on permission denial.
6. **Runner-up + rejection rationale**, including an honest case for "leave modes as they are."
7. **Migration notes:** URL contract before/after, redirect list, what breaks.
8. **Open questions** you could not resolve from evidence, flagged for a product decision.
9. **Citations** with dates; prefer 2024–2026 sources and flag anything older than 2022 as legacy.

---

## 9. Appendix — file map (for anyone verifying claims in this brief)

| Concern | File |
|---|---|
| Mode/domain resolver + docblock | `src/lib/dashboard/dashboard-domains.ts` |
| L1 pages + L2 mode registry (`SIDEBAR_PAGE_NAV`) | `src/lib/sidebar-navigation.ts` |
| Mode navigation writer | `src/components/sidebar/master-nav/useSidebarModeNav.ts` |
| Mode rendering (dropdown + MRU chips) | `src/components/sidebar/master-nav/MasterNav*.tsx` |
| Page three-way branch | `src/app/dashboard/page.tsx` |
| Dashboard sidebar body router | `src/components/sidebar/DashboardOrdersContextPanel.tsx` |
| Outbound view + chrome | `src/components/dashboard/DashboardOrdersView.tsx`, `OutboundWorkspaceHeader.tsx` |
| Outbound rollup | `src/components/dashboard/OutboundKpiStrip.tsx` |
| Inbound view + chrome + rollup | `src/components/dashboard/receiving/*` |
| Search view + sidebar + recents | `src/components/dashboard/search/*`, `src/components/sidebar/dashboard/DashboardSearchSidebar.tsx` |
| Two-zone scroll shell (one sticky layer) | `src/components/dashboard/DashboardScrollShell.tsx` |
| Workbench chrome/body/table tokens | `src/components/dashboard/workbench-shell.tsx` |
| House region-contract law | `.claude/rules/contextual-display.md`, `.claude/rules/display/workbench.md` |
| House rollup-block registry | `.claude/rules/display/monitor-rollup-blocks.md` |
