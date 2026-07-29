# Probe brief — sidebar / routing / mode architecture

**For:** Gemini Pro (deep research + architecture probe).
**Ask:** scan and understand the current nav spine — pages, routes, modes, stations, and the shared
URL/state substrate — then recommend the 2026-standard target architecture and a tech-debt paydown
path. **This is a context-gathering + architecture brief, not a UI restyle brief.**

Everything in §2–§5 is measured from the codebase, with file paths. Verify anything you doubt;
do not assume a number is approximate unless it says so.

---

## 1. The problem statement, in the owner's words

> "The modes are acknowledged tech debt. Modes need to move into layout and URL routing itself, so
> no data cross-identifies or mix-and-matches accidentally. The layout needs to be extremely simple
> in terms of routing. Currently all the information is a blob in one place — the Triage mode will
> leak into the Unbox mode. This leak needs to be fully and precisely removed."

Restated as the engineering question you are answering:

**The app has ~15 modeful surfaces whose "which sub-surface am I on" axis is expressed six different
ways, over one flat, global, untyped query-string namespace. Isolation between sub-surfaces is
enforced by four independent hand-maintained denylists and a 240-dispatch global event bus. What is
the correct 2026 architecture, and what is the migration path?**

---

## 2. The nav spine as it exists

### 2.1 Two levels, one registry

- **L1 pages** — `APP_SIDEBAR_NAV` in `src/lib/sidebar-navigation.ts:168+`. ~24 entries, each with
  `id`, `href`, `icon`, `kind: 'main' | 'station' | 'bottom'`, `requires: <permission>`.
- **L2 modes** — `SIDEBAR_PAGE_NAV` (`:550+`), same file. Each modeful page declares
  `modes: SidebarModeItem[]` (`{ id, label, icon, to(), requires?, group? }`) plus a
  `resolveMode({ pathname, params })` reader.
- **Writer** — `useSidebarModeNav()` (`src/components/sidebar/master-nav/useSidebarModeNav.ts`):
  `router.replace` for a same-page mode flip, `router.push` for a page change, merging the mode's
  `to().params` over the *current* `URLSearchParams` via `applyModeTarget` (`:978`).
- **Renderer** — `MasterNav.tsx` / `MasterNavView.tsx`: L1 list in a flyout; L2 modes in a
  click-opened dropdown under the page header trigger, plus up to 3 MRU cross-context chips.
- **Per-page context panel** — `SidebarContextPanel.tsx` dispatches on `getSidebarRouteKey(pathname)`
  to one of **21 dynamically-imported panels**.

`getSidebarRouteKey()` (`:289+`) is a ~45-branch `pathname.startsWith` ladder mapping many routes
onto one key (`/unbox`, `/triage`, `/incoming`, `/pickup`, `/repair`, `/receiving/*` → `receiving`).

### 2.2 Route surface

~100 `page.tsx` routes under `src/app` (full list reproducible via
`find src/app -name page.tsx`). Relevant families:

- **Station surfaces** (`kind: 'station'`): `receiving` (`/unbox`, `/triage`, `/incoming`,
  `/pickup`, `/repair`, `/receiving/history`), `outbound` (`/shipping`), `tech` (`/test`, legacy
  `/tech`), `packer` (`/pack`, legacy `/packer`), `review` (`/review`), `support` (`/support`).
- **Workbench/main pages**: `/dashboard`, `/walk-in`, `/products`, `/inventory` (+ 6 sub-routes),
  `/warehouse`, `/sourcing`, `/operations`, `/o/[orderId]`, `/fba`, `/ops/photos`, `/admin` (+8),
  `/manuals`, `/settings`, `/audit-log`, `/studio`.
- **Mobile** `/m/(shell)` + `/m/(immersive)` — a parallel route tree with its own shell.
- **Scan/deep-link** — `/b/[barcode]`, `/l/[ref]`, `/p/[tracking]`, `/q/[payload]`, `/01/[gtin]/…`.

### 2.3 The mode axis — six mechanisms for one concept

**This is the headline finding.** Measured from `SIDEBAR_PAGE_NAV`:

| Page id | Mode axis mechanism | Mode ids |
|---|---|---|
| `dashboard` | `?mode=` (`search`, `inbound`, alias `receiving`) | search · receiving · outbound |
| `operations` | `?mode=` | live · analytics · insights · history · signals |
| **`receiving`** | **pathname** (`params: { mode: null }`) | incoming · triage · receive · pickup · repair (+ history) |
| `sourcing` | `?mode=` | queue · scout · watchlist · searches · suppliers |
| `fba` | `?mode=fba` **+ `?fbaMode=`** | plan · combine · shipped |
| `outbound` | `?mode=` | labels · ready · fba · scan-out |
| **`packer`** | **`?packMode=`** | standard · fragile · multi |
| `review` | `?mode=` | packer · pairing · catalog-link |
| **`inventory`** | **mixed**: pathname (`/inventory/triage\|pulse\|graph`) **+ `?section=`** | ledger · triage · pulse · graph · replenish |
| **`warehouse`** | **`?tab=`** | labels · racks · rooms · bins · map |
| **`products`** | **`?view=`** | catalog · manuals · labels · pairing · qc · kit |
| **`tech`** | **`?view=`** | testing · shipping |
| `walk-in` | `?mode=` (+ legacy `?category=`) | pickup · sales |
| `support` | `?mode=` | tickets · orders · voicemail · calls · warranty · issues |
| **`admin`** | **`?section=`** | ~grouped section list |

Six param names — **`mode`, `packMode`, `fbaMode`, `section`, `tab`, `view`** — plus two
path-based families (receiving fully, inventory partially), plus one page (`dashboard`) whose param
*value* (`inbound`) disagrees with its mode *id* (`receiving`) by design.

### 2.4 Identifier collisions across the axis

The same mode id means different things on different pages, and page ids collide with mode ids:

| Colliding id | Appears as |
|---|---|
| `triage` | receiving mode → `/triage` **and** inventory mode → `/inventory/triage` |
| `labels` | outbound mode · warehouse mode · products mode |
| `pickup` | receiving mode → `/pickup` **and** walk-in mode |
| `pairing` | products mode **and** review mode |
| `shipping` | **page** `outbound` label · **mode** id on `tech` |
| `fba` | **page** id (`href: /shipping`) **and** `outbound` mode id |
| `history` | operations mode · receiving mode |
| `catalog` | products mode **and** page `studio-catalog` |

There is no namespace preventing this, and `resolveMode` is per-page, so nothing detects it.

---

## 3. The leak mechanism — why Triage bleeds into Unbox

This is the concrete defect to design out. It is **not** one bug; it is four independent
hand-maintained isolation mechanisms over one shared namespace.

### 3.1 One flat global query namespace

Every surface reads from the same `URLSearchParams`. Measured occurrence counts of
`searchParams.get('…')` across `src/`:

```
limit 103 · q 85 · mode 47 · search 43 · status 40 · id 34 · view 26 · offset 26
sort 24 · staffId 23 · sku 19 · staff 17 · tracking 12 · page 12 · section 11
ustatus 11 · lineId 11 · tab 10 · serial 10 · type 9 · open 9 · attention 9 …
```

`q`, `search`, `sort`, `status`, `view`, `tab`, `page`, `open`, `id` are read by many unrelated
surfaces with **no scoping prefix**. `sort` is so contended that a *separate* pair
(`?colsort=`/`?coldir=`, `src/lib/tables/grid-column-sort-params.ts`) had to be invented for grid
column sort because `?sort=` was already server ordering on station routes.

### 3.2 Four separate, hand-written isolation denylists

| Mechanism | Location | Shape |
|---|---|---|
| Cross-surface strip (receiving ↔ testing) | `src/lib/surface-isolation.ts` → `stripCrossSurfaceParams()` | deletes ~13 keys by hand: `mode`, `unboxview`, `triview`, `incview`, `triq`, `state`, `sort`, `dir`, `colsort`, `coldir`, `po_from`, `po_to`, `page` |
| Receiving mode switch | `useReceivingMode.ts` → `MODE_SCOPED_PARAMS` | **17-entry** literal array stripped on every mode change |
| Support mode switch | `sidebar-navigation.ts` → `SUPPORT_MODE_CLEAR_PARAMS` | **20-entry** literal object |
| Dashboard mode switch | `sidebar-navigation.ts` dashboard `modes[].to()` | per-mode `params: { …: null }` literals, one per sibling mode |

None share an abstraction. None have a test asserting completeness. Each has visible scar tissue in
its comments — e.g. `surface-isolation.ts`: *"`dir` pairs with `sort` — stripping one and not the
other left a dangling direction that re-applied itself to whatever sort Testing resolved next."*
That is a leak that shipped, was found, and was patched by adding one more key to a list.

**Every new param is a new leak until someone remembers to add it to up to four lists.** That is
the mechanism behind "Triage leaks into Unbox".

### 3.3 A global event bus carrying what the URL can't

`240` `new CustomEvent(...)` dispatches in `src/`. Top channels:

```
app-refresh-data 38 · dashboard-refresh 11 · receiving-scan-resolved 9
receiving-package-updated 7 · receiving-navigate-table 6 · receiving-clear-line 6
receiving-focus-scan 4 · sku-pairing-updated 4 · …
```

`receiving-clear-line` is fired *by the mode switcher* (`useReceivingMode.ts:200,250,261`) to clear
cross-pane state the URL cannot express. `app-refresh-data` is an untyped global broadcast with 38
emit sites and no schema. This is a second, parallel, untyped state channel running beside the URL.

### 3.4 Shared components branch on mode instead of being routed to

`ReceivingSidebarPanel.tsx` (378 lines) renders every receiving mode from one component via
`mode === 'incoming' ? … : mode === 'repair' ? … : mode === 'pickup' ? … : mode === 'history' ? …`
(`:253-361`). One component instance, one mount, one state tree, switched by a string — so
anything not explicitly reset carries over. Same pattern in `DashboardOrdersContextPanel`,
`OperationsWorkspace`, `ProductsWorkspace`.

### 3.5 A dormant duplicate of the whole mode UI

~14 sidebar panels still contain a **fully implemented persistent in-sidebar mode rail**
(`SidebarShell headerAbove` + `HorizontalButtonSlider variant="nav" dense`), gated off behind
`!useMasterNavEnabled()` (`MasterNavContext.tsx:18` — *"True when the master nav owns mode
switching (panels should hide their pills)"*). Dead-but-live code in:
`ProductsSidebarPanel:126`, `SupportSidebarPanel:121`, `ReceivingSidebarPanel:251`,
`InventorySidebarPanel:85`, `OutboundSidebarPanel:27,51`, `PackerSidebarPanel:51`,
`TechSidebarPanel`, `WarehouseSidebarPanel`, `ReplenishSidebarPanel`, `RepairSidebarPanel`,
`GoalsSidebarPanel`, `AuditLogSidebarPanel`, `OperationsSidebarPanel:147,392,486`,
`DashboardManagementPanel:42`.

### 3.6 Panel size

`src/components/sidebar/*.tsx` totals 6,303 lines. Largest: `OperationsSidebarPanel` 539 ·
`OrderSyncDialog` 516 · `TestingSidebarPanel` 463 · `ProductsSidebarPanel` 455 ·
`GoalsSidebarPanel` 412 · `ReceivingSidebarPanel` 378.

---

## 4. What already works (do not propose replacing these)

Any recommendation that discards these is wrong for this codebase — they are load-bearing and good.

- **`SidebarShell`** (`src/components/layout/SidebarShell.tsx`) — the layout shell: `headerAbove` →
  search → `headerRows[]` → one `flex-1 overflow-y-auto` body. Panels supply slots, not layout.
- **`SidebarRailShell` / `useSidebarRail`** — the recent-activity rail engine: fetch + `queryKey`,
  optimistic patch listeners, pinning, keyboard nav, stagger. Domain wrappers supply only
  renderers (`RecentActivityRailBase` is the reference; 5 receiving rails wrap it).
- **Code-splitting by route key** — `SidebarContextPanel` dispatches on `next/dynamic`, which is
  what keeps every feature's graph out of the shared shell chunk.
- **Permission model** — `requires` on both pages and modes; route-prefix permission table
  (`:388+`); `withAuth(handler, { permission })` on APIs; a route-auth drift check in `npm run verify`.
- **Receiving's path-first migration** — `/unbox`, `/triage`, `/incoming`, `/pickup`, `/repair`,
  `/receiving/history` are already real routes. `ModeLocation` carries `pathname`
  (`sidebar-navigation.ts:463`), so the registry *already supports* path-based modes. **The target
  architecture is partially built; the question is how to finish it, not whether it's possible.**
- **Region contracts** (Station / Workbench / Monitor / Canvas) and the density model — see
  `.claude/rules/contextual-display.md`. Keep the vocabulary.
- Stack: **Next.js App Router**, React Query, TypeScript, Tailwind. Server components available;
  most of these surfaces are `'use client'` today.

---

## 5. Research questions

### A. The target routing architecture
1. In 2026, **when does a sub-surface earn a URL segment vs. a query param?** Give the decision
   rule, not a preference. Consider: different row entity, different data source, different
   permission, different columns, different actions, bookmark value, back-button semantics.
   Apply the rule to each of the 15 axes in §2.3 and say which should become segments.
2. **Next.js App Router specifically**: what do route groups, nested layouts, parallel routes
   (`@slot`), and intercepting routes buy here — and what do they *not* solve (see the known
   trap: nested layouts isolate component state, **not** the query string)? Where do parallel
   routes genuinely fit a sidebar + main-pane shell, and where are they overkill?
3. **What is the correct home for the nav registry** once modes are routes? Today one 1000-line
   `sidebar-navigation.ts` holds pages, modes, route-key resolution, permission prefixes, and
   param-clear lists. Options: colocated per-route config, a generated manifest, a typed registry
   module, filesystem convention. What do comparable large App Router codebases do?

### B. Killing the leak structurally
4. **How do you make cross-surface state leakage structurally impossible rather than denylisted?**
   Evaluate: per-route typed search-param schemas (TanStack Router's validated search params, `nuqs`
   with parsers, Zod-validated `searchParams`), namespaced params (`?unbox.view=`), state-in-segment,
   per-route state stores, and "unknown params are dropped at the route boundary" as a default.
   Which of these is realistic to retrofit into Next.js App Router *today*?
5. **What is the right default:** should navigating between sibling sub-surfaces **preserve** or
   **discard** unrecognized params? Is there a standard "param ownership" model (each param declared
   by exactly one route, everything else stripped at the boundary)?
6. **Component identity:** the leak also comes from one mounted component branching on a mode
   string (§3.4). What is the modern guidance on **remount-on-route vs. branch-in-place** for
   sub-surfaces with different data shapes? Where does `key=`, route segmentation, or Suspense
   boundary placement belong, and what's the cost (lost scroll, refetch, lost cache)?
7. **The event bus (§3.3):** what replaces 240 untyped `CustomEvent` dispatches in a React Query
   codebase in 2026? Query invalidation, a typed pub/sub, server-driven revalidation, or
   `router.refresh()`? Give the migration order and what legitimately stays an event (scan focus,
   hotkeys).

### C. Nav IA and stations
8. Given §2.3, **what is the right conceptual model** — is "page + mode" even the correct
   two-level abstraction, or should it be pages/views/filters (Linear), sections/tabs (Stripe),
   or workspaces/apps? Name the model and map our 15 surfaces onto it.
9. **Stations vs. workbenches in the nav.** Six surfaces are `kind: 'station'` (scanner-driven,
   act-and-clear, ephemeral selection) and the rest are pointer-driven pick+edit. Should these be
   *visually and structurally* separated in the nav (separate group, separate shell, separate
   route namespace like `/station/*`), or is one flat list correct? What do industry ops products
   do when one app serves both a warehouse bench and a desk?
10. **Mode discoverability:** modes currently live in a click-opened dropdown; a dormant persistent
    rail exists (§3.5). Give the 2026 recommendation **with the caveat that whichever wins must be
    applied uniformly** — we will not ship two shapes for the same job. Include the cost of the
    360px sidebar column on a 1080p warehouse monitor.

### D. Tech-debt paydown
11. **Sequencing a refactor this size without a freeze.** What is the correct strangler pattern for
    a nav/routing migration — per-page, per-param, or per-mechanism? What is the smallest first
    slice that removes real risk?
12. **What guardrails make the new contract stick?** We already ratchet DS violations with tests
    that only shrink (`npm run verify`). Propose the equivalent for routing: a param-ownership
    manifest test, a route/mode registry drift test, a lint rule banning raw `searchParams.get` for
    unowned keys, a collision test for mode ids. Be specific enough to implement.
13. **God-component paydown** (§3.6): guidance for splitting a 400–550 line mode-branching panel
    into route-owned panels without duplicating the rail/shell infrastructure that correctly
    deserves sharing (§4).
14. **Deep-link and bookmark compatibility.** ~15 surfaces' URLs change. What is the standard for
    a migration of this size — permanent redirects, a compatibility middleware layer with a sunset
    date, dual-read resolvers? Note that `?mode=` values appear in e2e specs
    (`tests/e2e/dashboard-inbound-mode.spec.ts`), unit tests (`sidebar-navigation.test.ts:308`),
    and user bookmarks.

---

## 6. Constraints

- **Next.js App Router is fixed.** Do not propose a router swap (TanStack Router, React Router).
  Recommend its *ideas* where they apply, but the migration target must be implementable here.
- **Preserve §4.** Shell, rail engine, route-key code-splitting, permission model, region contracts.
- **Permissions are route- and mode-level** and enforced server-side too — any route restructure
  must keep the route-prefix permission table and its drift check coherent.
- **`main` is the integration lane; big surfaces get their own worktree lane.** A refactor this size
  is expected to be phased and land behind flags, not as one commit.
- **The house forbids shipping two shapes for the same job.** A recommendation that applies to only
  some of the 15 surfaces must say explicitly how the others converge, or it is not accepted.
- **Do not restyle.** No new visual language, no new component kit. This is routing, state
  ownership, and IA.
- Mobile (`/m/*`) is a parallel tree — say whether it converges or stays separate, don't ignore it.

---

## 7. Deliverables

1. **Target architecture** — one diagram + one page. The routing model, where mode lives, where
   state lives, what owns a param.
2. **Per-surface disposition table** — all 15 axes from §2.3: `→ route segment` / `→ typed param` /
   `→ merge into sibling` / `→ delete`, with the reason from your §5-A1 rule.
3. **The isolation contract** — the precise mechanism that makes §3's leak class impossible, written
   as adoptable rules plus the guardrail tests from §5-D12.
4. **Naming/collision fix** for §2.4.
5. **Event-bus migration table** — the top channels in §3.3 → their replacement.
6. **Phased migration plan** — ordered slices, each independently shippable, each with what it
   deletes. Flag the first slice that removes real risk.
7. **URL compatibility plan** — before/after per surface + the redirect mechanism.
8. **Explicit non-goals** — what you would *not* change, and why.
9. **Citations**, dated, marked as *empirical study* / *framework docs* / *observed product
   behavior*. **Do not invent statistics.** If a claim has no verifiable source, state it as
   engineering judgment instead of attributing a number to a study.

---

## 8. Appendix — file map for verification

| Concern | File |
|---|---|
| Pages + modes + route-key + permission prefixes | `src/lib/sidebar-navigation.ts` |
| Mode navigation writer | `src/components/sidebar/master-nav/useSidebarModeNav.ts` |
| Mode UI (flyout + dropdown + MRU) | `src/components/sidebar/master-nav/MasterNav*.tsx` |
| MasterNav-owns-modes flag | `src/components/sidebar/master-nav/MasterNavContext.tsx` |
| Route-key → panel dispatcher (21 panels) | `src/components/sidebar/SidebarContextPanel.tsx` |
| Sidebar layout shell | `src/components/layout/SidebarShell.tsx` |
| Rail engine | `src/components/sidebar/SidebarRailShell.tsx`, `receiving/RecentActivityRailBase.tsx` |
| **Cross-surface param strip** | `src/lib/surface-isolation.ts` |
| **Receiving mode state + 17-key strip** | `src/components/sidebar/receiving/useReceivingMode.ts` |
| Receiving route paths | `src/lib/receiving/surface-path.ts` |
| Mode-branching panel (reference case) | `src/components/sidebar/ReceivingSidebarPanel.tsx` |
| Grid column-sort params (the `?sort=` workaround) | `src/lib/tables/grid-column-sort-params.ts` |
| Dashboard domain/mode resolver | `src/lib/dashboard/dashboard-domains.ts` |
| Shell mount + 360px column | `src/components/layout/ResponsiveLayout.tsx` |
| Region-contract law | `.claude/rules/contextual-display.md`, `.claude/rules/display/*.md` |
| Related in-flight plan (dashboard-scoped) | `docs/todo/dashboard-ia-rework-PLAN.md` |
