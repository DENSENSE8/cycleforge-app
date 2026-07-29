# `/dashboard` IA rework — validated plan

**Status: Phases 1–3 SHIPPED 2026-07-29** (uncommitted, browser-verified). **The plan is not
finished.**

- **§9 — What shipped**: the as-built delta, including the three places the build deviated and why.
- **§10 — Finishing this plan**: the ordered backlog, the gates, and an explicit definition of done.
  Read this one if you are picking the work up.

The largest remaining piece is **Phase 6 — the `/search` results surface**, which Phase 1 created and
did not finish: evicting Search to its own route made its hand-rolled result list a first-class page
with nowhere to hide. It is gated on
[`search-results-grid-GEMINI-RESEARCH-BRIEFING.md`](search-results-grid-GEMINI-RESEARCH-BRIEFING.md),
deliberately, because the three candidate shapes differ by an order of magnitude in cost.

**Scope:** `/dashboard`, plus `/search` from Phase 1 onward (the route this plan created).
**Inputs:** [`dashboard-modes-research-BRIEF.md`](dashboard-modes-research-BRIEF.md) (the ask) +
the Gemini research response (`dashboard_architecture_brief.md`, external).
**This doc supersedes the research response** where the two disagree; every correction below is
backed by a file path you can check.

---

## 0. Verdict

**The research response is directionally right and structurally wrong in one important way.**

Its diagnosis is accurate and its hypothesis verdicts (H1–H5) hold up. But its headline
recommendation — *"abolish modes as a dropdown, replace with a persistent L2 sidebar rail"* — is
**a reversal of a deliberate, already-completed house migration**, and it is **not
dashboard-scoped**: it changes the nav contract for ~14 route panels at once.

The decisive evidence the research did not have:

> `MasterNavContext.tsx:18` — *"True when the master nav owns mode switching (panels should hide
> their pills)."*
>
> Fourteen sidebar panels (`ProductsSidebarPanel:126`, `SupportSidebarPanel:121`,
> `ReceivingSidebarPanel:251`, `InventorySidebarPanel:85`, `OutboundSidebarPanel:27`,
> `PackerSidebarPanel:51`, `TechSidebarPanel`, …) still contain a persistent in-sidebar mode rail —
> `HorizontalButtonSlider variant="nav" dense` inside `SidebarShell headerAbove` — **gated off**
> behind `!useMasterNavEnabled()`.

So the mechanism the research wants us to build **already exists, fully implemented, and was
deliberately switched off** when mode switching was consolidated into MasterNav. That doesn't make
the recommendation wrong — the arguments for exposed nav are real — but it converts the proposal
from *"a dashboard IA fix"* into *"reverse a house-wide nav decision"*, which is **Ask-first** under
`AGENTS.md` (public API change to a shared primitive used by many call sites; second visual language
without deleting the old one).

**What we should do instead:** take everything in the research that *is* dashboard-scoped and
uncontested — it's most of the value — and ship it in three phases that require no nav reversal.
Then raise the rail-vs-dropdown question separately, as its own decision, with the dormant code as
the cheap experiment.

---

## 1. What survives validation (adopt as-is)

| Claim | Verified against |
|---|---|
| Mode switching is a click-opened dropdown under the nav header trigger | `MasterNav.tsx:159-173`, `MasterNavView.tsx` `ModesPanel` |
| Receiving mode renders an empty sidebar | `DashboardOrdersContextPanel.tsx:32` — `return null` |
| Hand-maintained `param: null` clear lists per mode | `sidebar-navigation.ts:566-575` |
| Mode/domain dual vocabulary is real debt | `dashboard-domains.ts` — mode `receiving` **is** domain `inbound` |
| Search-as-a-mode is over-weighted | `DashboardSearchView.tsx` = recents list + results/detail landing; the query field lives in the global header pill |
| Per-mode permission gating is implementable today | `SidebarModeItem.requires` exists (`sidebar-navigation.ts:474`); Receiving already gates on `receiving.view` |
| Nested tabs (domain above lifecycle) should be avoided — **H2 refuted** | Consistent with house law: `WorkbenchChromeHeader` carries exactly one tab strip |
| Search results deserve their own route — **H4 supported** | Precedent: `?warranty=` already redirects off this page to `/support` (`page.tsx:45-49`) |
| KPI tiles must filter, never select (C6) | Matches `.claude/rules/display/monitor-rollup-blocks.md` verbatim |
| A typed empty/loading contract is missing and should be added (the NEW row) | Correct — no such contract exists today |

---

## 2. Corrections (do not carry these forward)

**X1 — The IA sketch silently deletes the outbound order feed.**
§5 of the response describes the L2 rail as *VIEWS + RECENTS*, 240px. But on `/dashboard` today the
context panel holds `UnshippedSidebar` (the outbound order picker) or `DashboardManagementPanel`
(`DashboardOrdersContextPanel.tsx:38-53`). A rail of "Outbound / Inbound / Recents" **replaces the
Workbench master–detail picker with a two-item list**. Any rail proposal must say where the picker
goes — the house answer is that the rail sits *above* it (`SidebarShell headerAbove`), which is
exactly the dormant pattern from §0.
Also: the column is **`w-[360px]`**, not 240–300px (`ResponsiveLayout.tsx:36`).

**X2 — "Abolish modes as a dropdown" is out of scope and forks the house.**
Modes are one shared registry (`SIDEBAR_PAGE_NAV`) consumed by every modeful page. Giving
`/dashboard` a persistent rail while the other ~14 pages keep the dropdown creates *two shapes for
the same job* — a named **Never** in `AGENTS.md`. Either it's a house-wide change (Ask-first) or it
isn't done.

**X3 — Sub-routes are feasible but the stated benefit is overstated.**
`ModeLocation` already carries `pathname` (`sidebar-navigation.ts:463`) and `getSidebarRouteKey`
already maps `/dashboard/*` → `dashboard` (`:289`), and receiving modes have already graduated to
real routes (`/unbox`, `/triage`, `/pickup`) — so path-based modes are a supported, precedented
shape. **But** the claim that nested layouts "completely eliminate manual param-clearing" is wrong:
nested layouts isolate *component state*, not the query string. `?q=`, `?sort=`, `?openOrderId=`,
`?map=` still share one `URLSearchParams`. Param scoping (C4) is an **independent** fix and is the
one that actually removes the clear lists.
Concrete blast radius if we do go path-based: `surface-isolation.ts:80` (reads
`searchParams.get('mode')`), `useDashboardViewWarmup` + `warmActiveView(qc, window.location.search)`
(`page.tsx:126` — warms off the *search string*), `sidebar-navigation.test.ts:308`, and
`tests/e2e/dashboard-inbound-mode.spec.ts` (asserts `mode=inbound` in the URL).

**X4 — "301" is the wrong mechanism here.**
Next.js `redirects()` emits 308 for permanent and cannot cleanly *drop* a query param while
preserving `q`. The house precedent for exactly this is a client redirect: `page.tsx:45-49` rewrites
`?warranty=` → `/support?…` with `router.replace`. Match that, or use middleware. Don't specify 301.

**X5 — C9 ("expand-on-hover search is Harmful → always-visible input") contradicts a hard SoT and
is out of scope.**
`ToolbarSearchToggle` is a named source of truth with an explicit rule: *"Never mount an always-open
`SearchField` in a `WorkbenchChromeHeader` `search` slot"* (`.claude/rules/source-of-truth.md`). It's
used across workbench surfaces. Flipping it on the dashboard alone is the same fork as X2. The
underlying concern (hidden primary filter affordance) may well be right — but it is a **house-wide
Ask-first change that needs a real usability test**, not a dashboard-scoped edit. Downgrade C9 from
*Harmful* to *unresolved — needs evidence*.

**X6 — Two load-bearing statistics appear to be fabricated.**
*"Users scan vertical lists 30% faster than horizontal nested tabs"* and *"NN/g (2024):
'Discoverability of Hidden Navigation' — hover/click dropdowns for primary domain switching incur a
40% interaction penalty"* do not correspond to any publication I can identify, and the NN/g title
does not match a known article. The **directional** claims (exposed beats hidden; avoid nested tabs)
are well supported in general design-system guidance — but these two numbers must not be
load-bearing in a decision doc. Strip them, or replace with verifiable sources. The Carbon/M3/WAI-ARIA
citations are substantively plausible but should be linked and dated before this circulates.

**X7 — Runner-up rejection reason #1 is self-contradictory.**
It rejects the in-page toggle for "perpetuating the empty sidebar." But in the *outbound* domain the
sidebar is full (the order feed), and emptiness is a Receiving-mode bug fixable on its own. The
honest reason to reject a top-of-page domain toggle is the one given under H2/C5: it adds a second
hierarchy level and pushes the grid toward the fold.

**X8 — The mermaid diagram won't render as drawn.** `OB --> Sticky` creates a stray node (a subgraph
needs an explicit `subgraph id [title]` to be a link target), and `---` is used where containment is
meant. Cosmetic, but fix before circulating.

**X9 — Three unaddressed gaps.** The response doesn't touch: (a) **three different shells for
"look at an order"** — `DashboardOrderDetails` (slide-in), `SearchOrderDetailShell` (search mode),
and the full page `/o/[orderId]`; that is the single largest condensation win on this page and it
is exactly H5's intent. (b) **KPI unification** — "context-aware KPI strip" as written is today's
behavior with a different switch; it does not answer whether inbound + outbound merge into one
cross-domain attention read. (c) **Selection scope across a domain switch**
(`DASHBOARD_ORDERS_SELECTION_SCOPE`) — what happens to a live multi-select.

---

## 3. Corrected recommendation

**Keep MasterNav as the mode switch. Fix the page underneath it. Raise the rail question separately.**

Four moves, in dependency order:

1. **Collapse the vocabulary.** One axis, one name: **domain** (`outbound` | `inbound`). "Mode"
   stops being a second word for the same thing on this page. Search leaves the axis entirely, so
   the axis becomes exactly two values — which is *why* it can move to a rail later without a
   nested-tab problem.
2. **Evict Search.** Recents → the dashboard context panel (visible in **both** domains, which also
   fills the empty Receiving sidebar) **and** the ⌘K palette. Results → its own route. Order detail
   → one shell.
3. **Namespace the params** so switching domains no longer needs a hand-written null list, and a
   domain keeps its own filter/sort state across a round trip.
4. **Unify the rollup** into one attention band that reads *across* both domains, with the
   domain-specific tiles below it. This is the actual answer to "condense into one dashboard": the
   glance is cross-domain; the work surface is domain-scoped.

Everything above is dashboard-scoped, reversible, and does not fork a shared primitive.

### IA (corrected)

```
┌ L1 MasterNav ─┬ L2 context panel (360px) ────┬ main scroll port ─────────────────┐
│ Dashboard  ◂  │  [domain rail — Phase 4 only]│ Zone A  cross-domain attention    │
│ Sales         │  ── outbound: order feed ──  │         band (scrolls away)       │
│ Products      │  ── inbound: carton feed ──  │ ─────────────────────────────────  │
│ …             │                              │ Zone B  PINNED chrome (one layer) │
│               │  RECENTS  (both domains)     │   lifecycle tabs · search ·       │
│               │   Order #88291               │   filters · sort · fields · CTAs  │
│               │   Carton #992                │ ─────────────────────────────────  │
│               │                              │ Zone C  LedgerGrid (own Y-scroll) │
└───────────────┴──────────────────────────────┴───────────────────────────────────┘
```

Zone B stays exactly one sticky layer (C5 upheld). The domain switch stays in MasterNav for
Phases 1–3; the rail in the context panel is Phase 4 **if and only if** the house-wide decision
goes that way.

---

## 4. Phased build-out

### Phase 1 — Evict Search (highest value, lowest risk)

Removes a whole page mode, fills the empty sidebar, and touches no shared nav primitive.

| Step | Change | Files |
|---|---|---|
| 1.1 | Move recents into the context panel, rendered in **both** domains — this is what fills the Receiving-mode void | `DashboardOrdersContextPanel.tsx`, `DashboardSearchSidebar.tsx` (harvest the `Recent` half; the `Recent\|Search` sub-slider dies with the mode) |
| 1.2 | New route `/search?q=` for the non-exact-match cross-entity surface | new `src/app/search/page.tsx` mounting `SearchResultsSurface`; note memory `search-consolidation-s0` — `/search` was deleted once, so this is a **deliberate re-introduction** and needs a line in that memory |
| 1.3 | Exact-identifier hits route to the existing order surface instead of a mode-local shell | `useDashboardSearchOrder.ts`, `search-hit.ts` (`orderSearchHref`) |
| 1.4 | Retire `?mode=search`; client-redirect per the `?warranty=` precedent | `page.tsx`, `sidebar-navigation.ts` (drop the `search` mode entry) |
| 1.5 | Delete `DashboardSearchView` + `SearchOrderDetailShell` once 1.3 lands | `src/components/dashboard/search/*` |

**Redirects:** `?mode=search&q=X` → `/search?q=X` · `?mode=search&openOrderId=N` → the order surface
· bare `?mode=search` → `/dashboard`.
**Decides X9(a)** on the way: 1.3 forces the "one shell for an order" answer.

### Phase 2 — Collapse the vocabulary + namespace params

| Step | Change | Files |
|---|---|---|
| 2.1 | `DashboardMode` → `DashboardDomain` everywhere; keep `?mode=inbound` as the wire value (bookmarks + e2e) but stop calling it a mode | `dashboard-domains.ts`, `page.tsx`, `sidebar-navigation.ts` docblock |
| 2.2 | Declare a **param owner** per domain (`OUTBOUND_SCOPED_PARAMS` / `INBOUND_SCOPED_PARAMS`) and have the switch clear by scope, not by hand-listed key | `dashboard-domains.ts` + `applyModeTarget` caller; mirrors the existing `SUPPORT_MODE_CLEAR_PARAMS` shape but derived, not literal |
| 2.3 | Resolve the `?sort=` collision explicitly — inbound tabs ride `?sort=`, outbound display sort is separate, grid column sort is `?colsort=`/`?coldir=`. Namespacing must make this unambiguous | `dashboard-receiving-tabs.ts`, `useQueueDisplaySort.ts` |
| 2.4 | Define selection behavior across a domain switch (X9c) — recommend: clear, since rows are different entities | `useDashboardBulkSelection.ts`, `dashboard-scopes.ts` |

### Phase 3 — Unify the rollup + typed states

| Step | Change | Files |
|---|---|---|
| 3.1 | One cross-domain **attention band** above the domain-specific tiles; compose `KpiStrip`/`KpiTile`, no new shell | new `src/components/dashboard/DashboardAttentionStrip.tsx`; `OutboundKpiStrip.tsx`, `receiving/DashboardReceivingKpiStrip.tsx` become its domain sections |
| 3.2 | KPI tiles apply an **ephemeral URL facet** to the grid below — never selection (C6) | same |
| 3.3 | Adopt the NEW contract: skeleton loaders preserving column widths + typed empties (zero-data vs. filtered-to-zero) | grid family; add to `.claude/rules/display/workbench.md` |
| 3.4 | Permission (C10): a domain the user can't see is **absent**, not disabled | `sidebar-navigation.ts` mode `requires: 'receiving.view'`; delete the in-mode denial state in `DashboardReceivingView.tsx:44-56` |

### Phase 4 — Domain rail (BLOCKED — needs a decision, see §6)

Only after §6 Q1 is answered. If yes: re-enable the dormant `headerAbove` pill row **house-wide**,
not dashboard-only. The code already exists in ~14 panels; the work is the decision plus deleting
the `!masterNavEnabled` gate, not new UI.

### Phase 5 — Sub-routes (optional, deferred)

`/dashboard/outbound` · `/dashboard/inbound`. Feasible (X3) but buys little once Phase 2 lands, and
carries the X3 blast radius. Revisit only if Phase 2 proves insufficient.

### Phase 6 — `/search` results surface (NEW — created by Phase 1, gated on research)

**Phase 1 moved Search to its own route; it did not upgrade it.** `/search` today mounts the same
hand-rolled `SearchResultRow` list it had as a dashboard mode — a stack of per-entity cards whose
rows are two-line prose blocks with a ragged right-hand chip run. Operator verdict: *"this list
display looks terrible."*

**This phase is the plan's own unfinished business, not a new initiative.** Evicting Search to a
route is what made the results surface a first-class page with nowhere to hide, and §9's deviation
list is silent on it because Phase 1 was scoped to *where* search lives, not *how it renders*.

**Gate:** [`search-results-grid-GEMINI-RESEARCH-BRIEFING.md`](search-results-grid-GEMINI-RESEARCH-BRIEFING.md)
(**Rev 2** — every claim re-verified against source; Rev 1 got two central facts wrong in the
direction of making the job look easy, and both are recorded in its §12).

**The four measured facts that decide this phase.** Each was confirmed by opening the file:

1. **The facet bag is absent exactly where operators search most.** The doc arm emits a 7-key facet
   bag (`hybrid-retrieval.ts:260-269`), but `exactResultToHit` (`:273-280`) spreads a parent-table
   row with **no `facets` and `chips: []`**, and scores it `1000 - rank` — so it ranks **first**. An
   identifier query therefore yields a **mixed** set: rows whose Status/Tracking/Condition/Date cells
   are *structurally absent* sitting directly above rows where they are populated. **This is a
   retrieval-layer prerequisite, not a UI problem** — hydrating facets on exact hits may have to land
   before, or instead of, any grid work.
2. **Per-entity column sets inside ONE `LedgerGrid` are not expressible.** It takes exactly one
   `columnHeader: ReactNode` (`LedgerGrid.tsx:64`) in one sticky band, and its only banding axis is a
   hard-coded date header (`FlatItem` header variant is `{ kind:'header'; date: string; count }`,
   `VirtualGroupedSections.tsx:39`). "Per-entity sections" therefore means **N grid instances
   stacked**, not one grid.
3. **The house already has a sanctioned answer for divergent column shapes** —
   `grid-surface-descriptor.ts:133`: *"Modes swap descriptors, not markup."* `OrdersGridView.tsx:151-155`
   already swaps its whole canonical column set on a URL-derived facet. A **type facet that narrows
   to one entity, with the descriptor swapped per type**, is house-legal by existing precedent rather
   than by argument — and `/api/ai/retrieve` already accepts `entityTypes` server-side
   (`schemas/ai-search.ts:19`), which `/search` simply never sends.
4. **There is no filter model in the grid stack to "import."** `getFilteredRowModel` /
   `columnFilters` / `globalFilter` / `getSortedRowModel` / `getGroupedRowModel` return **zero
   matches across all of `src`**; `useGridSurface` wires only `getCoreRowModel()` with
   `manualSorting: true`. Every consumer sorts client-side. So half the original ask ("properly
   import filters and sorting logic") has nothing to import and is really "decide whether to build
   one, and where."

**Cost is much lower than the golden reference suggests.** There are 8 `LedgerGrid` consumers
spanning an order of magnitude; the floor is `FbaBoardTable` / `StationListTable` at **~490 lines**
(no descriptor, no `TableId`, no visibility hook), not the `orders-queue` golden at ~3,986. Price
against the floor.

**Also blocking, and cheap:** `/search` has no route-param spec at all
(`routeParamsFor('/search')` returns `null`) and `TableId` is a closed 9-member union with no search
entry — so a Fields menu means widening it. Both are §10.1 items.

**Do not start Phase 6 before the briefing is answered.** The four shapes differ by an order of
magnitude in cost and one of them (fix the retrieval hole first) may not be a UI task at all.

---

## 5. URL contract, before → after (through Phase 3)

| Today | After | Mechanism |
|---|---|---|
| `?mode=search&q=X` | `/search?q=X` | client redirect (`?warranty=` precedent) |
| `?mode=search&openOrderId=N&map=…` | order surface for `N` | client redirect |
| `?mode=search` (bare) | `/dashboard` | client redirect |
| `?mode=inbound` / `?mode=receiving` | **unchanged** | — |
| bare / `?unshipped` / `?shipped` | **unchanged** | — |
| `?warranty=…` | `/support?mode=warranty` | unchanged (already live) |
| per-domain filter/sort | namespaced, preserved across a domain round-trip | Phase 2.2 |

Nothing that works today stops working. Only `?mode=search` changes shape, and it redirects.

---

## 6. Decisions needed before Phases 4–6

1. **Do we reverse the MasterNav consolidation?** The dormant in-sidebar rails make this cheap to
   *try* but it is a house-wide contract change (X2). Needs an explicit yes/no with rationale,
   because it was already decided once in the other direction. **Gates Phase 4.** *Status: open.*
2. **C9 — always-visible scoped search?** Contradicts a named SoT (X5). **Status: new evidence.**
   The SoT's one sanctioned exception is `/ops/photos`, justified because there *"search **is** the
   entry path, not a refinement."* That sentence describes `/search` at least as well. The rule's own
   text says a second exception is Ask-first and *"if a third appears, the rule itself is wrong and
   should be re-cut around 'is search the entry path or a refinement?'"* — so this is no longer a
   yes/no about the dashboard, it is a question about whether the rule should be re-cut. Folded into
   the Phase 6 briefing (§8 Q4/Q5) rather than decided here.
3. **Saved views vs. hardcoded lifecycle tabs** (their open question #1, and C8). Real, but it
   supersedes Phase 3 rather than fitting inside it — decide after Phase 3 ships. *Status: open;
   Phase 3 has now shipped, so this is decidable.*
4. **Recents scope** — per-staff or per-tenant. **Status: RESOLVED — per-staff.** Shipped that way:
   `useStaffSearchRecents` for query recents, and the `detailStackHref` history store (per-browser)
   for opened-record recents.
5. **Which shape does `/search` take?** — A (flat universal grid) · B (per-entity sections reusing
   the existing families) · C (adapter into one row model). **Gates Phase 6.** *Status: out for
   research.*
6. **Is `/search` a Monitor or a Workbench?** Decides whether the results surface may grow selection
   and bulk actions at all. *Status: out for research (Phase 6 briefing §6).*

---

## 7. Test & verification plan

- `tests/e2e/dashboard-inbound-mode.spec.ts` — must stay green untouched through Phases 1–3
  (it is the domain-isolation guarantee).
- New e2e for Phase 1: `?mode=search` redirects; recents render in **both** domains; `/search?q=`
  returns the cross-entity surface.
- `sidebar-navigation.test.ts:308` — update when the `search` mode entry is dropped.
- `npm run verify` before each phase lands (lint · typecheck · unit incl. DS-ratchet guards · knip ·
  route-auth drift · schema drift). Deleting `src/components/dashboard/search/*` will move knip
  counts — expect that, and never raise a ratchet baseline to land a phase.

---

## 8. Compound opportunities

- **Do now (in scope):** Phase 1 and Phase 2 — both are net deletions.
- **Promote to DS next (2+ call sites):** the typed empty/loading contract (3.3) belongs in the grid
  family and `.claude/rules/display/workbench.md`, not in a dashboard-local component. The
  param-scoping helper (2.2) generalizes to Support, which has the same hand-written clear list
  (`SUPPORT_MODE_CLEAR_PARAMS`).
- **Deferred (ask first):** Phase 4 rail reversal, C9 search chrome, saved views.

*(§8 was written before Phases 1–3 shipped. The live, ordered backlog is §10.)*

---

## 9. What shipped (2026-07-29)

Phases 1–3 landed. Every step below is uncommitted working-tree work on `main`.

### Phase 1 — Search evicted

| Step | As built |
|---|---|
| 1.1 | `DashboardRecentsPanel` (new) renders in **both** domains — full panel for inbound (which used to `return null`), capped footer under the outbound order feed. This also let `useHasSidebarContext` lose its one param-aware exception and shrink to a route-key read. |
| 1.2 | `/search` is now a real route (it was a redirect *into* the mode — the S0 consolidation is hereby reversed for the results surface, deliberately; see the note in memory `search-consolidation-s0`). Recents scope moved to `src/lib/search/search-page-recents.ts`, keeping the stored bucket value `'dashboard'` so no operator's history is orphaned. |
| 1.3 | **`orderSearchHref` is deleted.** `searchHitHref('ORDER')` now returns `orderRecordHref` → `/o/[id]`, which `detailStackHref` and ⌘K already used. That is X9(a) answered: one order shell. |
| 1.4 | `?mode=search` client-redirects (the `?warranty=` mechanism, per X4). Contract is pure + unit-tested in `dashboard-domains.test.ts`. |
| 1.5 | `src/components/dashboard/search/*` and `DashboardSearchSidebar` deleted. `search-order-overview-presence` was **rescued**, not deleted — `order-record-card` / `OrderRecordBody` still consume it; it moved to `src/components/order-record/order-fact-presence.ts`. |

### Phase 2 — vocabulary + params

- 2.1 `DashboardMode` is gone; `DashboardDomain` is the only axis. `?mode=inbound` stays the wire value.
- **2.2 and 2.3 needed no work** — commit `3e42e8462` ("delete the last URL denylists") already landed
  the mechanism: `applyModeTarget` CONSTRUCTS from the target's delta and `DASHBOARD_ROUTE_PARAMS`
  declares the ownership. The plan predated that commit. The `?sort=` distinction is now documented in
  `dashboard-domains.ts` rather than re-implemented.
- 2.4 A domain switch clears the multi-select (`useDashboardBulkSelection`) — rows change entity, so
  carrying it would aim outbound actions at cartons.

### Phase 3 — rollup + typed states

- 3.1/3.2 `DashboardAttentionStrip` (new): one band reading **across** both domains, above each
  domain's own tiles. Tiles are links applying an ephemeral URL facet — never selection — and a unit
  test asserts every href stays on a param `/dashboard` owns.
- 3.3 Typed loading (reserved-geometry skeleton) + typed empty (all-clear) on that band. **Not yet
  promoted to the grid family / `display/workbench.md`** — see deviations.
- 3.4 The Receiving pill now carries `requires: 'receiving.view'`, so the domain is **absent**. The
  in-view denial state became a redirect to `/dashboard` rather than a deletion: the pill being hidden
  is navigation, not authorization, and a hand-typed `?mode=inbound` still has to go somewhere.

### Follow-up landed 2026-07-29 — the dashboard param spec was incomplete

Phase 2.2/2.3 recorded "needed no work" because commit `3e42e8462` had already landed
`applyModeTarget` + `DASHBOARD_ROUTE_PARAMS`. That was right about the *mechanism* and wrong about
the *contents* — the spec had never been checked against what the dashboard's own components read,
because `components/dashboard` was not in the ownership guard's `OWNED_TREES`. Two defects followed:

1. **Every lifecycle tab was dropped at the boundary.** `unshipped` / `pending` / `packed` / `tested`
   / `shipped` / `fba` / `warranty` are **bare presence flags** written valueless and read with
   `.has()` (`utils/dashboard-search-state.ts:58-78`), but were declared `paramText`, which rejects
   the empty value. `?shipped` parsed to `""` and the tab silently reverted to Unshipped. They now
   use a new `paramPresence` schema.
2. **`?search=` and two filter facets were undeclared.** `searchScopeHref('ORDER')` hands off to
   `/dashboard?search=`, which `PackedOrdersTable.tsx:42` reads; `OutboundFilterStrip` reads
   `?attention=` and `?ustatus=`. None were in the spec.

Neither had bitten yet **only** because `/dashboard` does not mount `useSurfaceParamHygiene()` —
which is step 6 of the migration method, so the trap was armed for whoever graduated this surface
next. `components/dashboard`, `app/dashboard`, `app/search` and `components/search` are now governed
trees, and `route-params.test.ts` pins both fixes.

**Method note for the rest of this plan:** the ownership guard reports only params that **no** spec
declares. It will not tell you your route is missing `q` / `sort` / `search`, because another route
owns them. Enumerate a surface's full read set separately before writing its spec.

### Deviations from this plan (deliberate)

1. **Recents in the outbound domain are a capped footer, not a co-equal panel.** Outbound already has
   a full picker (the order feed); replacing or splitting it was out of scope and would have regressed
   the Workbench master–detail recipe. The footer hides itself when there is nothing to re-open.
2. **The inbound attention band rides in the chrome slot, not the scroll body.** That shell's body is
   `overflow-y-hidden` because the lines table self-scrolls, so Zone A has no scroll port to scroll
   away in there. Still exactly one *sticky* layer — chrome is a non-scrolling sibling (C5 upheld).
3. **3.3's typed states are not yet promoted to the DS grid family.** They exist on the new band only.
   Promoting them is the 2-call-site move named in §8 and is the right next task, not a Phase-3 fix.

### Verification

`tsc --noEmit` clean, `eslint` clean on every touched file, knip introduces no new unused exports,
and the unit suites pass (`dashboard-domains`, `dashboard-attention`, `search-hit`, `search-recents`,
`sidebar-navigation`, `param-ownership.guard`, `order-fact-presence`, plus the typography / spacing /
focus-ring DS ratchets). No baseline was raised.

Two e2e specs that asserted the deleted mode-local order shell
(`dashboard-search-order-detail`, `dashboard-search-exact-open`) were deleted and replaced by
`tests/e2e/dashboard-search-eviction.spec.ts`, which is fixture-free and shape-based so it runs on the
QA project. **It has not been executed yet** — it needs a running app.

**Pre-existing, not caused by this work:** `src/app/dashboard/../signin/page.tsx` is in a `UU` merge
conflict from another session, so a whole-repo `npm run verify` cannot go green until that is resolved.
`src/lib/assistant/tools/domain-read-tools.test.ts` also fails at `HEAD` (a `server-only` import
reaching `src/lib/db.ts` — the bundle-altitude trap in `build-gotchas.md`); verified against a clean
`HEAD` worktree.

---

## 10. Finishing this plan — the ordered backlog

§9 records what shipped. This section is what is **left**, in dependency order, so the plan can be
driven to done rather than left in a permanent "Phases 1–3 landed" state. Each row names its gate:
work with no gate can start today.

### 10.1 Unblocked — close these first (no decision needed)

| # | Work | Why it is unfinished | Files |
|---|---|---|---|
| A | ~~**Declare a `/search` route-params spec.**~~ **DONE 2026-07-29** — `SEARCH_ROUTE_PARAMS` declares `?q=` and carries `staff`/`colsort`/`coldir`. Phase 6's sort/scope keys now fail the ownership guard on collision instead of silently doing nothing. | `src/lib/routing/query-mode-routes.ts` |
| B | ~~**Decide `/search`'s `SidebarRouteKey`.**~~ **DONE 2026-07-29** — `/search` now declares its own `search` key and is deliberately absent from `CONTEXT_PANEL_ROUTE_KEYS`, so full-width is a decision rather than the `unknown` fallback leaking through. Pinned by a test; Phase 6 flips it by adding one set member. | `src/lib/sidebar-navigation.ts` |
| C | ~~**Promote the typed empty/loading contract (3.3)**~~ **DONE 2026-07-29, but not as written.** The grid family already had typed loading + an `emptyState`/`searchEmptyState` split, so this was a reconciliation, not a port — see the follow-up note in §9. The **four settled states** are now house law in `display/workbench.md`; `LedgerGridSurface` passes the no-match answer through (it collapsed both to one message); Pickup is the first consumer. | `@/design-system/components/grid`, `display/workbench.md` |
| D | ~~**Run `tests/e2e/dashboard-search-eviction.spec.ts`.**~~ **DONE 2026-07-29 — 6/6 green on `qa-desktop`.** The flagged assertion was worse than suspected: it was vacuous *three* ways (a mode entry is a button not a link; it is not in the DOM until the click-opened dropdown opens; the trigger is not mounted until the sidebar is shown), so it would have passed with Search fully restored. Rewritten to open the menu and assert a sibling mode is present before asserting Search is absent; mutation-tested. | `tests/e2e/` |
| E | ~~**Fix the stale `useUrlColumnSort` docblock**~~ — **NOT A BUG (checked 2026-07-29).** The docblock already reads "**`?colsort=` + `?coldir=`** … deliberately NOT `?sort=`/`?dir=`". Nothing to fix; row closed. | `src/hooks/useUrlColumnSort.ts` |
| F | ~~**Generalize the param-scoping win to `/support`**~~ **DONE 2026-07-29.** No hand-written clear list survives on any spec-backed route: `/operations` still carried 55 dead null entries across five modes (deleted, behaviour proven byte-identical). The rest — `/sourcing`, `/review`, `/inventory`, `/walk-in` — are **load-bearing**, because those routes have no spec yet and still copy-forward. A new invariant in `route-mode-registry.guard.test.ts` fails the moment a surface graduates while keeping its list. | `src/lib/sidebar-navigation.ts` |

### 10.2 Gated on a decision

| # | Work | Gate |
|---|---|---|
| G | **Phase 6 — the `/search` results surface** | §6 Q5 + Q6, via the Gemini briefing. **The largest remaining piece of this plan.** |
| H | **Phase 4 — domain rail** | §6 Q1 (house-wide, Ask-first) — now also covered by [`dashboard-entity-axis-GEMINI-RESEARCH-BRIEFING.md`](dashboard-entity-axis-GEMINI-RESEARCH-BRIEFING.md) shape C, which asks whether the rail question is separable from the axis question at all |
| I | **Saved views vs. hardcoded lifecycle tabs** | §6 Q3 — **out for research**: [`dashboard-entity-axis-GEMINI-RESEARCH-BRIEFING.md`](dashboard-entity-axis-GEMINI-RESEARCH-BRIEFING.md) §8 Q3–Q4. That brief also raises the prior question this plan did not: whether the top axis should stay `inbound\|outbound` (direction) or be re-cut by entity (`Orders · FBA · Repair · Sales`), since the answer changes how divergent each surface's facet set becomes |
| J | **Phase 5 — sub-routes** | Only if Phase 2 proves insufficient. It has not; treat as closed unless evidence appears. |

### 10.3 Deviations from §9 — confirm or fix

Three deliberate deviations shipped. Each is defensible but none was ratified; decide whether they
are the final shape or follow-ups:

1. **Outbound recents are a capped footer**, not a co-equal panel (the order feed is already the
   picker). Confirm, or give outbound a real two-zone panel.
2. **The inbound attention band rides the chrome slot**, not the scroll body, because that shell's
   body is `overflow-y-hidden`. Confirm, or restructure that shell so Zone A can scroll away in both
   domains symmetrically.
3. **`DashboardReceivingView` redirects on permission denial** rather than deleting the gate as 3.4
   literally specified. The pill is absent (navigation) and the gate remains (authorization) — this
   is the safer reading of C10 and should probably just be ratified in the plan text.

### 10.4 Definition of done

This plan is finished when **all** of the following hold:

- [x] Phases 1–3 shipped and browser-verified (done 2026-07-29 — see §9)
- [x] **§10.1 A–F closed** (2026-07-29). A/B/C/D/F done; E was not a bug. Two of the six
      turned out to be defects rather than follow-through: C's contract was **missing a state**
      (`LedgerGridSurface` collapsed no-data and no-match into one message) and D's spec was
      **vacuous** (it would have passed with the retired mode fully restored).
- [ ] §6 Q5 + Q6 answered → **Phase 6 shipped**, so `/search` is a first-class surface rather than a
      relocated one
- [ ] §6 Q1 answered yes-or-no **in writing** — if no, Phase 4 is deleted from this plan, not left
      hanging
- [ ] §6 Q3 answered → saved views scheduled or explicitly declined
- [ ] §10.3 deviations ratified or fixed
- [ ] `npm run verify` green on a tree where `src/app/signin/page.tsx` is no longer conflicted
- [ ] This document's §9 updated one last time, then the whole plan moved out of `docs/todo/`

**The plan is NOT done today.** Phases 1–3 are the load-bearing two-thirds; §10.1 is a half-day of
follow-through; Phase 6 is the real remaining build and it is correctly blocked on research rather
than guessed at.
