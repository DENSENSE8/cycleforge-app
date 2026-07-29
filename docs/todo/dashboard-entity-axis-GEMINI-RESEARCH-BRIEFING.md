# Research briefing — the dashboard's top axis: direction vs entity, and where filters live

**For:** Gemini Pro (deep research) — **you have read access to this repository.** Paths below are pointers, not excerpts; read the real files.
**From:** Cycle Forge engineering
**Date:** 2026-07-29
**Scope:** the **axis `/dashboard` carries internally**, its tab layers, and the **filter / facet / saved-view architecture** underneath.
**Not in scope:** anything owned by a neighbouring brief — read §0.4 first, it is the shortest section and it is what stops you re-answering a question that is already out for research.

**Deliverable:** four separate answers, listed in §9.

**This brief is about an AXIS, not a feature.** Recommendations that add a surface without saying which existing surface it replaces or deletes will be rejected. The dashboard's axis was just *collapsed* from three values to two (§4.1); re-expanding it needs a stronger argument than "these are all things operators look at."

---

## 0. Method — read this before answering

### 0.1 Verify in the repo before you assert. Not optional.

A previous run of a sibling brief produced a plan whose two central phases targeted **files that do not exist**. You have repo access.

- **Every file path you name must be one you opened.** Infer nothing from naming conventions; if you must, mark it `[UNVERIFIED]`.
- **Every claim about what a module does must come from reading it.** `/fba/page.tsx` is not an FBA board — it is a redirect (§5.2).
- **Quote evidence** for load-bearing claims: a line number, a type, a schema column.
- **Never attribute a rationale to this brief that is not written in it.** If you supply your own, write "my reasoning:".

### 0.2 Search the web for the industry half. Also not optional.

- Cite **named systems** with 2024–2026 sources: ops/WMS and commerce consoles (Shopify admin, Linear, Retool, Airtable interfaces, ShipStation, Skubana/Extensiv, Sellercloud, Katana, Odoo Inventory), plus IA literature on faceted navigation vs. tabbed IA.
- Where practice genuinely splits — **saved views vs. hardcoded tabs** is the live one — give both positions, the conditions each wins under, and then pick one for *this* repo.
- Distinguish "what a large multi-team SaaS does" from "what a small multi-tenant reseller SaaS with 1–15 warehouse staff per tenant should do." This repo is the latter.

### 0.3 Established facts — do not re-derive or contradict these

These were decided with evidence. Treat them as constraints; if you want to overturn one, you must cite the file that makes it wrong.

| Fact | Where it was settled |
|---|---|
| **Nested tabs (a domain strip above a lifecycle strip) are refuted.** House law: `WorkbenchChromeHeader` carries exactly one tab strip. | `dashboard-ia-rework-PLAN.md` §1 (H2), `.claude/rules/display/workbench.md` |
| **"Replace the mode dropdown with a persistent L2 sidebar rail" is Ask-first and house-wide**, not a dashboard fix. The rail exists, fully implemented, in ~14 panels — deliberately switched OFF behind `!useMasterNavEnabled()`. | `dashboard-ia-rework-PLAN.md` §0; `MasterNavContext.tsx:18` |
| **Route segments do NOT isolate query params.** Isolation is construct-don't-copy plus a declared schema. Never argue for segments on isolation grounds. | `nav-routing-refactor-FINISH-PROMPT.md` §0; `src/lib/routing/route-params.ts` |
| **Search is no longer a dashboard mode.** It was evicted to `/search` precisely because it consumed an L2 slot while not being a domain. | `dashboard-ia-rework-PLAN.md` Phase 1 |
| **KPI tiles filter, they never select.** | `.claude/rules/display/monitor-rollup-blocks.md` |
| Region contracts are I/O contracts, not layout skins. Station = scanner-driven; Workbench = pointer-driven pick+edit. **Mixing two contracts in one region is the single most common way surfaces feel wrong.** | `.claude/rules/contextual-display.md` |

### 0.4 Neighbouring briefs — what is NOT yours

Four briefs already cover adjacent ground. **Do not re-answer their questions**; where your recommendation depends on one, name the dependency and answer conditionally ("if `page-consolidation` rules X, then …").

| Brief | Owns | Your boundary |
|---|---|---|
| `page-consolidation-station-first-GEMINI-RESEARCH-BRIEFING.md` | **L1 page count**, the 12-row duplication register, the merge/keep/delete verdict per page, and the literal target nav row list (its Q4 + Q6) | It decides **whether** Sales / FBA / Repair stay separate L1 pages. You decide what happens **inside** `/dashboard` under either outcome. |
| `contextual-sidebar-ia-GEMINI-RESEARCH-BRIEFING.md` | What belongs in the 360px left sidebar; selection-detail-left vs right-detail-panel | It decides what the sidebar **holds**. You decide whether a **filter/entity navigator** is one of the things it may hold, and why. |
| `table-display-sot-GEMINI-RESEARCH-BRIEFING.md` | Column alignment, row separation, header rendering, cell editability. It **explicitly excludes** "sorting/filtering semantics" | That exclusion is your subject. Do not restyle anything. |
| `ops-table-simplification-GEMINI-RESEARCH-BRIEFING.md` | Table/grid design benchmarking | Same — display, not facets. |

**The gap those four leave, and the reason this brief exists:** nobody owns *how an operator narrows a collection* — tabs vs facets vs saved views, which layer holds them, and what the top axis of `/dashboard` should be cut by. That is the whole of your remit.

---

## 1. Product context

**Cycle Forge** is multi-tenant reseller-operations SaaS for used-goods resellers; USAV is the dogfood tenant. Inventory is **serialized** — individual physical units with serials, condition grades, test verdicts, photo evidence. Orders arrive from eBay, Amazon/FBA, Walmart, an Ecwid storefront, walk-in/local pickup, and a human-maintained Google Sheet.

Operators are warehouse staff at benches, not analysts. A tenant has single-digit-to-teens staff. The same person may receive a carton at 9am and pack an order at 2pm.

Two house laws govern everything below:

- **Vendor integrations are tenant connectors behind capability facades.** Product copy uses capability nouns or a runtime provider label — never a hardcoded vendor sentence. (`AGENTS.md` → Product)
- **One module per concern; compose the named SoT, grow it when wrong, never fork a page-local twin.** (`.claude/rules/pattern-evolution.md`)

---

## 2. The question

The dashboard's top-level axis is currently **direction of travel**: things coming *in* (receiving cartons) vs things going *out* (sales orders).

The proposal on the table is to re-cut it by **entity/domain**: `Orders · FBA · Repair · Sales`, with receiving folded in or left as a station, and with the sidebar driving *which table* is shown and *how it is filtered*.

**The question is whether the top axis should be direction or entity — and, whichever it is, where the filter layer belongs.** Those two are coupled: a wider top axis makes each surface's own filter set smaller and more divergent, which changes whether hardcoded tabs or saved views is the right filter mechanism.

Answer it for this codebase, with a migration path, not in the abstract.

---

## 3. What the dashboard is today — measured, not summarized

### 3.1 The declared axis has two values

`src/lib/dashboard/dashboard-domains.ts`:

```ts
export type DashboardDomain = 'outbound' | 'inbound';
```

`outbound` = sales orders leaving. `inbound` = receiving cartons arriving. The module states plainly that **"they never share a table"** — inbound rows are receiving lines, outbound rows are orders. The axis rides `?mode=` (absent = outbound).

### 3.2 …but there is a THIRD, half-modeled axis already in the code

`src/utils/dashboard-search-state.ts:15,20`:

```ts
export type DashboardOrderView  = 'unshipped' | 'tested' | 'packed' | 'shipped' | 'fba';
export type DashboardViewGroup  = 'orders' | 'fba';
```

`getDashboardViewGroup()` (line 79) collapses that five-value list into **two groups: `orders` and `fba`**. And `OutboundWorkspaceHeader.tsx:30` renders only four of the five as the tab strip:

```ts
const LIFECYCLE_VIEWS = ['unshipped', 'tested', 'packed', 'shipped'] as const;
```

**So FBA is already not a peer lifecycle tab — it is a sibling group that happens to be reachable through the same param family.** This is the most important fact in the brief: the entity axis the proposal wants is *already emergent in the code*, unmodeled and unnamed at the navigation layer. Read these two files before answering anything else.

That gives the dashboard three stacked axes today, two of them half-built:

```
?mode=              domain      inbound | outbound          (declared, 2 values)
(derived)           viewGroup   orders  | fba               (derived, never navigated)
?unshipped|?tested… lifecycle   4 bare presence flags       (the visible tab strip)
```

### 3.3 The lifecycle tabs are bare presence flags

`?unshipped`, `?tested`, `?packed`, `?shipped`, `?fba` are **valueless** keys read with `.has()`, not `.get()` (`dashboard-search-state.ts:58-78`). They are declared in `DASHBOARD_ROUTE_PARAMS` (`src/lib/routing/query-mode-routes.ts`) with the `paramPresence` schema.

*(Historical note, since it shapes any proposal that adds params: they were declared as `paramText` until 2026-07-29, which rejects the empty value, so every one of them was dropped by the boundary parse. It had not bitten only because `/dashboard` does not yet mount `useSurfaceParamHygiene()`. Any new axis you propose must say what schema its params take.)*

### 3.4 Filters today

- `src/components/dashboard/OutboundFilterStrip.tsx` — reads `?attention=` and `?ustatus=`, writes them back by mutating a copied `URLSearchParams`.
- `src/components/dashboard/DashboardAttentionStrip.tsx` — a cross-domain KPI band; tiles are links applying an ephemeral URL facet (never selection).
- Column sort is URL-durable via `useUrlColumnSort` → `?colsort=` / `?coldir=` (deliberately **not** `?sort=`, which is server ordering).
- Column visibility resolves in exactly one place: `useGridColumnVisibility` (descriptor `tier` + per-staff delta + viewport force-hide), surfaced by `GridFieldsMenu`, persisted per staff in `staff_preferences.tableColumns[tableId]`.

---

## 4. What just changed — the axis was deliberately narrowed

### 4.1 Three values → two

The dashboard previously carried `DashboardMode = 'search' | 'receiving' | 'shipping'` — three values mapping onto two domains plus a surface that was not a domain at all, so `receiving` mode *was* `inbound` domain and every reader had to know which vocabulary it was in.

Phases 1–2 of `dashboard-ia-rework-PLAN.md` evicted Search to `/search` and deleted `DashboardMode`. **The collapse to two values is four days old and was the point of the exercise.**

A proposal to go to `Orders · FBA · Repair · Sales` re-expands that axis to four or five. That may still be right — but it must engage with *why* the narrowing happened, not step around it. The narrowing argument was: **a value on this axis must own a table.** Search did not. State explicitly, for each entity you propose promoting, whether it owns a table and what its rows are.

### 4.2 What remains open in that plan

`dashboard-ia-rework-PLAN.md` §10.2 lists the gated work. Two gates are yours:

- **Q1 / Phase 4 — the domain rail.** House-wide, Ask-first.
- **Q3 — saved views vs. hardcoded lifecycle tabs.** Explicitly "now decidable, Phase 3 has shipped." **Nobody has decided it. This brief is asking you to.**

---

## 5. The surfaces proposed for promotion — where they actually live

Read each before proposing to move it.

### 5.1 Orders

`/dashboard` outbound domain (grid: `src/components/dashboard/orders-queue/OrdersGridView.tsx`), plus a dedicated full-page record at `/o/[orderId]`. `searchHitHref('ORDER')` resolves to `/o/[id]`; there is exactly one order shell (IA plan Phase 1.3 deleted the second).

### 5.2 FBA — currently has three homes

| Path | What it actually is |
|---|---|
| `/dashboard?fba` | a `DashboardOrderView` value, grouped as `viewGroup: 'fba'` |
| `/shipping/fba` | the real FBA board (plan / combine / shipped rails), spec `FBA_ROUTE_PARAMS` in `src/lib/routing/outbound-routes.ts` |
| `/fba` | **a redirect** into `/shipping/fba`, preserving `?mode=plan\|combine\|shipped` as `fbaMode` (`src/app/fba/page.tsx`) |

`src/app/fba/` also still holds board hooks (`useFbaBoard.ts`, `useFbaCombine.ts`, `useFbaDetailPanel.ts`). Determine whether those are live or orphaned before recommending anything — this is the clearest duplication in scope.

### 5.3 Repair

`/repair` is a **Receiving mode**, not a top-level page: `SIDEBAR_PAGE_NAV`'s `receiving` entry lists modes `incoming · triage · receive · pickup · repair`. It has its own route param spec in `src/lib/routing/receiving-routes.ts` and its own grid descriptor (`src/components/repair/repair-grid/repair-grid-descriptor.ts`).

### 5.4 Sales

`/walk-in` (label **"Sales"**, id kept as `walk-in` for bookmark/test stability) is an L1 page with modes `pickup | sales`. Its rationale is recorded in `sidebar-navigation.ts`: the FOH/BOH split moved the *work* (Local Pickup, Repair) into Receiving modes, leaving this page the **commerce/history** side. Read that comment — it is a prior decision that the "fold Sales into the dashboard" proposal directly reverses.

### 5.5 Receiving

An L1 **station** (`kind: 'station'`, href `/unbox`) with five modes. Its rows are receiving lines. It is scanner-driven — Q1 of `pickArchetype` short-circuits to Station.

**This is the sharpest constraint on the proposal.** Dropping a browsable, filterable table into a Station region is the canonical anti-pattern in `.claude/rules/display/station.md` §11. Conversely the dashboard's *inbound domain* is already the pointer-driven Workbench view of that same data — which is arguably the resolution, and worth saying so explicitly if you agree.

---

## 6. The machinery that already exists — compose it, don't propose a rebuild

Any recommendation that reinvents one of these will be rejected. Read them.

| Capability | Module | State |
|---|---|---|
| Grid column defs / sort / visibility / order (headless, TanStack v8 state-only) | `useGridSurface` + `GridSurfaceDescriptor` (`src/design-system/components/grid/`) | Live; **5 descriptors** exist (catalog, receiving, incoming, pickup, repair) |
| Per-staff column visibility + tier | `useGridColumnVisibility`, `GridFieldsMenu` | Live; persisted as a delta in `staff_preferences.tableColumns[tableId]` |
| URL-durable column sort | `useUrlColumnSort` → `?colsort=`/`?coldir=` | Live |
| **Saved filter views** | `SavedViewsControl` + `useSavedViews` | **Live and generic** — parent passes `paramKeys` + `storageKey`, so the same control serves multiple surfaces |
| Server-side saved views | `src/lib/operations/saved-views-queries.ts`, `src/lib/photos/saved-views-queries.ts` | Live, per-surface — **two implementations; determine whether they should be one** |
| Per-route param ownership + boundary parse | `src/lib/routing/` (`route-params.ts`, `registry.ts`) | Live; `/dashboard`, `/products`, `/support`, `/operations`, `/search`, receiving + shipping families all declare specs |
| Context panel by route key | `CONTEXT_PANEL_ROUTE_KEYS` (`sidebar-navigation.ts:312`) | Live; **already includes `dashboard`, `fba`, `walk-in`, `inventory`, `products`** |
| Dormant per-panel mode rail | `HorizontalButtonSlider variant="nav" dense` in ~14 panels, gated `!useMasterNavEnabled()` | Implemented, switched off |

**Note the second and fourth rows together.** `SavedViewsControl` is generic and already shipped; `useGridColumnVisibility` already persists per-staff column sets. A large part of "let the sidebar drive which table and how it is filtered" may be a *wiring* job over existing parts rather than new architecture. Say so if that is what you find.

---

## 7. Candidate shapes to evaluate

Evaluate all four. Score each on: operator cost (clicks/keystrokes to the common task), IA coherence, region-contract compliance, migration cost, and what it deletes.

**A — Status quo plus saved views.** Keep `inbound | outbound`. Promote the emergent `viewGroup` to nothing. Answer Q3 by making the lifecycle strip the default *and* letting `SavedViewsControl` name arbitrary facet combinations. Cheapest; deletes the least.

**B — Entity axis, single tab strip.** Top axis becomes `Orders · FBA · Repair · Sales · Receiving`. Each value owns exactly one table. The lifecycle strip becomes **per-entity** and is the *only* tab strip (satisfying the one-strip law) — Orders shows unshipped/tested/packed/shipped; FBA shows plan/combine/shipped; Repair shows its own. Note this shape only makes sense if `page-consolidation` also rules those pages should merge; treat that as a stated precondition rather than arguing it here.

**C — Entity axis in the sidebar, facets in the chrome.** The sidebar context panel becomes the entity+saved-view navigator (the thing the proposal describes); the workbench chrome header keeps one strip for the active entity's lifecycle. This is closest to what was asked for, and it collides most directly with the Ask-first rail decision (§0.3) — say whether it *is* that decision or is separable.

**D — Do nothing to the axis; fix the duplication instead.** Argue that the real defect is FBA's three homes (§5.2) and the orders/fba group being derived-but-unnavigable (§3.2), not the direction-vs-entity cut. Deletes the most; changes no IA.

You may propose **E**, but only if it deletes at least as much as it adds.

---

## 8. Specific questions to answer

1. **Direction or entity?** Which axis should `/dashboard` carry at L1, given §3.1's "they never share a table" and §4.1's deliberate narrowing? Does the answer change for a tenant with 3 staff vs 15?
2. **What is the rule for what earns a top-axis slot?** Write it as a testable predicate (the current implicit one is "owns a table"). Apply it to Orders, FBA, Repair, Sales, Receiving and show the verdict for each.
3. **Q3, decided: saved views or hardcoded lifecycle tabs — or both?** If both, what is the boundary rule that stops them becoming two ways to do one thing? Note that `SavedViewsControl` already ships and `staff_preferences.tableColumns` already persists per-staff grid state.
4. **Should saved views be per-staff local, per-staff server-side, or org-shared?** There are already two server-side implementations (`operations/saved-views-queries.ts`, `photos/saved-views-queries.ts`) plus a `storageKey`-based client control. Should these become one module? What is the tenancy contract (`organization_id` per `.claude/rules/polymorphic-tables.md`)?
5. **Where does the filter layer live** — sidebar context panel, workbench chrome header, or both — given that `WorkbenchChromeHeader` carries exactly one tab strip and the collapsed-at-rest `ToolbarSearchToggle` is the scoped-search SoT?
6. **FBA's split personality (§5.2)** — `page-consolidation` rules on whether `/shipping/fba` survives as a page. **Your half:** should `/dashboard?fba` continue to exist *at all* given `viewGroup` already treats it as a non-peer, and are the hooks under `src/app/fba/` live or orphaned? Answer conditionally on both possible page verdicts.
7. **Sales (§5.4)** — `page-consolidation` Q4 owns "does `/walk-in` merge." **Your half:** *if* it merges, does Sales become a value on the dashboard's top axis, a lifecycle tab, or a saved view — and what does that choice imply for the other three? If your §7 answer is that the axis should not widen, say that folding Sales in is then incoherent and why.
8. **Receiving (§5.5)** — is the dashboard's inbound domain already the correct Workbench counterpart to the Receiving station, making "promote Receiving into the dashboard" a no-op that is already done? This one *is* yours: it is about the dashboard's internal axis, not about whether `/unbox` survives.
9. **Migration + params.** For your recommended shape: what param does the axis ride, what schema does it take (`paramPresence`? `paramEnum`?), does it collide with any key in `SHARED_OWNED_KEYS`, and what is the redirect/back-compat story for existing bookmarks? Note the house 307-not-308 discipline in `next.config.ts`.

---

## 9. Deliverable

1. **Industry answer.** How do comparable 2026 ops consoles cut their top navigation axis, and where do they put filters — tabs, facets, saved views, or a filter rail? Named systems, cited, 2024–2026. Cover the saved-views-vs-tabs split explicitly and say which conditions favour each.
2. **Codebase answer.** A scored comparison of shapes A–D (plus E if you propose one) against §7's criteria, then **one recommendation** with a deletion-ordered migration path. Every phase names real files.
3. **Q3, answered.** Saved views vs hardcoded tabs, with the boundary rule and the tenancy contract (question 4).
4. **A deletion list.** What this recommendation removes — files, routes, params, concepts. If it is empty, justify that.

**Format:** answer §8's nine questions individually and explicitly; a narrative that implies answers is not a deliverable. Mark every unverified inference `[UNVERIFIED]`. Where you overturn something in §0.3, cite the file that makes it wrong.

---

## 10. Hard constraints

- **Do not propose route segments as a param-isolation mechanism.** They are not one (§0.3).
- **Do not propose a second visual language, a foreign grid (AG Grid / MUI / Glide), or a new search engine.** Compose `LedgerGrid` / `useGridSurface` / `hybridSearch`.
- **Do not propose nested tab strips.** One strip per workbench chrome header.
- **Do not mix region contracts in one region.** A browsable filtered table does not belong inside a scanner-driven Station.
- **Anything touching tenant scoping, the status machine, audit, or the search waist is Ask-first.** Flag it; do not design it.
- **`npm run verify` is the gate.** Ratchet baselines only shrink.
- Mobile (`/m/*`) is a parallel tree and out of scope.
