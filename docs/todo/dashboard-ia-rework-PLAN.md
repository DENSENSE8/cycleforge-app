# `/dashboard` IA rework — validated plan

**Status:** plan only, no code changed. **Scope:** `/dashboard` only.
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

## 6. Decisions needed before Phases 4–5

1. **Do we reverse the MasterNav consolidation?** The dormant in-sidebar rails make this cheap to
   *try* but it is a house-wide contract change (X2). Needs an explicit yes/no with rationale,
   because it was already decided once in the other direction.
2. **C9 — always-visible scoped search?** Contradicts a named SoT (X5). Needs a usability test or a
   deliberate SoT amendment; not a dashboard-scoped call.
3. **Saved views vs. hardcoded lifecycle tabs** (their open question #1, and C8). Real, but it
   supersedes Phase 3 rather than fitting inside it — decide after Phase 3 ships.
4. **Recents scope** — per-staff or per-tenant. Recommend per-staff (matches
   `useStaffSearchRecents` today); their recommendation agrees.

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
