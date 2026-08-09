# Research briefing — To-ship left rail IA: what is the sidebar’s job when Band 1 tabs already own lifecycle?

**For:** Gemini Pro (deep research) — **you do not have the codebase.** Every path, count,
overlap, and house-law quote below was verified against live source on **2026-08-09**. Do not invent
modules, claim to have inspected source, or assert “we already have X” beyond §1–§4. Label anything
past that as `my reasoning:`.

**From:** Cycle Forge engineering
**Date:** 2026-08-09
**Subject:** On `/shipping/orders` (**To ship** — Fulfillment’s desk triage table), the **left
context rail** currently paints three stacked jobs — **Focus** (smart segments) · **Saved views** ·
**Throughput this week** — while the **middle sheet** already owns lifecycle tabs (Pending · Tested ·
Packed · Shipped), a Band-2 KPI strip, and a Band-3 find field. The product owner’s question is
exact: *if the top-left tabs already fulfill “which queue am I looking at,” what is the sidebar
doing — and what must change to meet 2025–2026 industry desk / WMS / marketplace-ops UX standards?*
**Status:** OPEN research. Adjacent desk recipe and tabs-vs-saved-views law already exist in-repo
(§3); this brief asks you to **pressure-test the live To-ship rail against that law + industry**,
not to re-derive the whole Desk frame.
**Your deliverable:** one markdown research + recommendation report (chat or export). A repo-capable
agent will land it as `docs/todo/to-ship-sidebar-triage-desk-IA-PLAN.md`. **You do not write files.**

**Related documents (context only — do not re-solve their open questions):**

| Doc | Status | What it settled | What this brief still needs |
|---|---|---|---|
| [`.claude/rules/display/workbench-ops-queue.md`](../../.claude/rules/display/workbench-ops-queue.md) | **LIVE house law** | Desk three-pane recipe; **tabs vs saved views** boundary; To-ship three-band flush | Whether live To-ship left rail *obeys* that law (evidence in §2 says it does not) |
| [`desk-contract-unification-CLAUDE-CODE-PROMPT.md`](desk-contract-unification-CLAUDE-CODE-PROMPT.md) | Prompt / partial land | Left = saved views primary; optional thin filter map *below*; never clone a tab as a saved view | To-ship-specific Focus + Throughput conflict not named |
| [`HomeContextPanel` source](../../src/components/sidebar/HomeContextPanel.tsx) | **LIVE golden** | Today’s left rail = **saved views only** — lanes live in table chrome | Whether To-ship should converge on this golden |
| [`contextual-sidebar-ia-GEMINI-RESEARCH-BRIEFING.md`](contextual-sidebar-ia-GEMINI-RESEARCH-BRIEFING.md) | 2026-07-26 | Broader “what belongs in the 360px context panel” survey | Predates To-ship three-band sheet + current Focus map |
| [`ops-table-simplification-GEMINI-RESEARCH-BRIEFING.md`](ops-table-simplification-GEMINI-RESEARCH-BRIEFING.md) | Prior | Ops table density / chrome altitude | Not specifically left-rail vs Band-1 dual control |

---

## 0. How to use this brief

### 0.1 Your job

1. **Survey the web** (prefer 2024–2026 primary sources + named products) for how **desk triage
   queues** place: (a) lifecycle / pipeline stages, (b) personal / urgency / stock facets, (c)
   operator-defined saved views / list views, (d) throughput / KPI rollups — relative to a dense
   middle table. Cite named systems; do not stop at “it depends.”
2. **Reconcile** every recommendation against the embedded Cycle Forge facts in §1–§4. Where
   industry conflicts with a house law, **name the collision and pick a side** — or tell us the
   house law is wrong and defend that with extraordinary evidence.
3. **Score** candidates with §0.3. Cut ruthlessly.
4. Treat §1–§4 as **ground truth about this product today**. If you need a fact not listed, say so
   under Ask-first — do not invent it.
5. Answer §6 decisions **one by one** with a default. Soft hybrids without a default are discarded.

### 0.2 Sources to cover (minimum)

| Class | Named examples (start here; expand) | Use for |
|---|---|---|
| **Marketplace seller order desks** | Amazon Seller Central Manage Orders, eBay Seller Hub Orders, Shopify Admin Orders, Walmart Seller Center | Where stages live (tabs vs left nav vs facets) vs custom views |
| **WMS / 3PL / fulfillment queues** | ShipStation, ShipBob, Extensiv / ShipHero, Linnworks, Fishbowl | Outbound queue IA — stages, exceptions, staff queues |
| **Helpdesk / triage desks** | Zendesk Agent Workspace views, Linear custom views, Jira filters/boards, Front shared inboxes, Attio | Saved views as primary left map vs system statuses in chrome |
| **Spreadsheet-ops / dense tables** | Notion databases (views), Airtable views, Salesforce List Views, HubSpot list views | Operator-authored views vs system pipeline stages |
| **B2B ops chrome discipline** | Linear, Stripe Dashboard, Carbon / Polaris / Atlassian Design guidance, NN/g IA depth & redundant navigation | Dual-control cost, cognitive load, “one job per region” |
| **KPI / Monitor placement** | Stripe Dashboard metrics, ShipStation dashboards, NN/g dashboard vs workspace | Whether throughput belongs beside a working queue or on a Monitor surface |

Where industry splits, give **both** positions, the conditions each wins under, then pick one for
**this** product (dense Kinetic Ledger desk, not a document product).

### 0.3 Scoring model (mandatory)

Score every candidate on all five axes (1–5). Report a table. Do not invent a sixth axis.

| Axis | Meaning |
|---|---|
| **Fit** | Compounds on `ops-queue` Desk recipe + tabs-vs-saved-views law + Home saved-views golden |
| **Operator throughput** | Desk triager finds / clears work faster without hunting dual controls |
| **Cognitive clarity** | One control answers one question; no “Pending” in two places that mean almost-the-same thing |
| **Blast radius** | Surfaces / URL params / guards / Support alias touched (5 = tiny, 1 = company-wide) |
| **Migration cost** | Cost from today’s measured rail (§2) to the candidate |

**Score ≈ (Fit × Operator throughput × Cognitive clarity) / ((6 − Blast) × (6 − Migration cost))**
Blast/Migration convention: **5 = tiny/cheap, 1 = huge.** Rank descending; state your cut line.

### 0.4 Closed forever (do not recommend unless Ask-first with extraordinary evidence)

- Converting To-ship into a **scan station** (wedge bar, Labels-printed MRU, ephemeral selection)
- A second saved-views store outside polymorphic `saved_views` / `useSavedViews`
- Growing Band 1 tabs to hold filters (“Late”, “eBay only”, “My queue” as a fifth lifecycle tab)
- Shipping a **saved view that clones one lifecycle tab** (“all Packed”)
- Dual full-width right columns; floating modal detail as the default inspector
- Foreign grid kits (AG Grid, Handsontable, MUI DataGrid) as the middle collection
- Framing recommendations as “USAV internal tool” — Cycle Forge is sellable multi-tenant SaaS;
  USAV is dogfood only

### 0.5 Vocabulary (use these words)

| Term | Meaning here |
|---|---|
| **Region contract** | Station · Workbench · Monitor · Canvas — one per region |
| **ops-queue Desk** | Workbench branch: saved views left · chrome+KPI · LedgerGrid · pushing right rail |
| **Lifecycle tab** | System-defined mutually exclusive pipeline state (Pending · Tested · Packed · Shipped) |
| **Focus segment** | Current left-rail smart row (All open · My queue · Urgent · Out of stock · Pending · Tested) |
| **Saved view** | Operator-named facet combo applied to URL via `useSavedViews` |
| **Band 1 / 2 / 3** | To-ship pinned chrome: tabs+CTAs · KPI strip · find + inspector park |

---

## 1. Product context (ground truth)

**Cycle Forge** is multi-tenant **reseller-operations SaaS** (used-goods / electronics refurb is the
dogfood tenant only). UI identity = **Kinetic Ledger**: dense, state-colored, scan-aware; bias =
legible throughput over document calm.

**To ship** (`/shipping/orders`) is Fulfillment’s **desk triage table** — Workbench `ops-queue`,
**not** a Scan Station. Support › Inquiries aliases the same desk with `?context=support`.

Region contracts already house law (use them):

| Contract | Driven by | Job on To-ship |
|---|---|---|
| **Workbench** | pointer | Middle sheet: pick order → inspect/edit via right rail |
| **Monitor** | observe | Band-2 KPI + (today) sidebar Throughput card — read-only rollups |
| **Station** | scanner | **Must not** own this page (Labels / Scan-out are sibling Shipping modes) |

---

## 2. Measured live layout (2026-08-09) — the conflict

### 2a. Frame (desktop)

```text
┌─ GlobalHeader ─────────────────────────────────────────────────────────────┐
│  … · page face “To ship” · search · pace · inbox · AI                      │
├─ MasterNav spine ─┬─ LEFT CONTEXT (~360px) ─┬─ MIDDLE SHEET ─┬─ RIGHT RAIL ─┤
│  Fulfillment pin  │  ← THIS BRIEF’S SUBJECT │  three-band    │  order /    │
│                   │                         │  flush chrome  │  View topics│
│                   │  FOCUS                  │  + LedgerGrid │            │
│                   │  SAVED VIEWS            │                │            │
│                   │  THROUGHPUT THIS WEEK   │                │            │
└───────────────────┴─────────────────────────┴────────────────┴────────────┘
```

Mount path (post 2026-08-09 fix): `OutboundSidebarPanel` → on `SHIPPING_ORDERS_PATH` mounts
`UnshippedSidebar` (desk filter map), **not** Labels station scan / “Labels printed.”

### 2b. Middle sheet (already load-bearing) — `DashboardOrdersView` + `OutboundWorkspaceHeader`

House recipe (`.claude/rules/display/workbench-ops-queue.md` → To-ship three-band flush):

| Band | Component | Job | Operator question answered |
|---|---|---|---|
| **1** | `OutboundWorkspaceHeader` → `WorkbenchChromeHeader` | Lifecycle tabs **Pending · Tested · Packed · Shipped** + Import/Add | *Which pipeline stage is this table?* |
| **2** | `OutboundKpiStrip` inside `WorkbenchKpiBand` | Attention / queue KPIs; click-to-filter on several tiles | *How bad is the queue / what deserves a click?* |
| **3** | `OutboundTriageBand` → `WorkbenchTriageBand` | Flex-1 **Filter orders…** + Show/Hide inspector | *Find a row / park the inspector* |

Tab labels and counts (from `OutboundWorkspaceHeader`):

- `unshipped` → label **Pending** (count = PENDING + BLOCKED combos)
- `tested` → label **Tested**
- `packed` → **Packed** (no count chip in header today)
- `shipped` → **Shipped**

URL presence flags: `?unshipped` / `?tested` / `?packed` / `?shipped` via
`normalizeDashboardOrderViewParams` (`src/utils/dashboard-search-state.ts`).

### 2c. Left rail body — `UnshippedSidebar` → `OutboundSidebarFilterMap` + footer cards

**Section A — FOCUS** (`OutboundSidebarFilterMap` → `UnshippedSegments` on pre-pack tabs)

| Row label | Wire / behavior | Overlaps middle? |
|---|---|---|
| **All open** | Clears stage/ustatus/staff/attention → stays on unshipped-ish “all” | Soft overlap with “no refine” default on Pending |
| **My queue** | Sets `?staff=<me>` | **No** Band-1 twin — staff refine also lives on inspector View cluster |
| **Urgent** | Sets `?attention=1` (orders.is_urgent) | **No** Band-1 twin; Band-2 may expose urgent metrics |
| **Out of stock** | Sets `?ustatus=BLOCKED` on Pending tab | Facet, not a lifecycle tab — legitimate *if* not promoted to Band 1 |
| **Pending** | Forces Pending tab (`normalize…('unshipped')`) | **HARD DUPLICATE of Band 1 Pending tab** |
| **Tested** | Toggles Tested ↔ Pending tab | **HARD DUPLICATE of Band 1 Tested tab** |

On Packed tab the Focus list collapses to **My queue** only. On Shipped: **Needs attention** +
**My queue**.

**Section B — SAVED VIEWS** (`OutboundSavedViewsList` → shared `SavedViewsList`)

- Storage keys / param bags: `outbound-sidebar-shared.ts`
  - Unshipped: `stage`, `ustatus`, `staff`, `late`, `attention`
  - Packed: `staff` only
  - Shipped: `shippedFilter`, `shippedSearchField`, `ostatus`, `staff`, `exceptions`
- Empty copy today: *“No saved views yet. Set a filter, then save it here.”* + **+ Save current view**
- House law says this list should be the **primary** left map (`ops-queue` composition). Live UI
  paints it **second**, under Focus, often empty — so the rail *reads* as a second tab strip.

**Section C — THROUGHPUT THIS WEEK** (`ThroughputRoiCard variant="sidebar"`)

- Monitor-archetype rollup via `useOperationsRoi` (`GET /api/operations/roi`), gated on
  `operations.view`
- Paints: hero units this week + Δ% · units/labor-hr · **units stuck**
- **Also:** `GettingStartedChecklist variant="sidebar"` under it (onboarding teach)
- Band 2 `OutboundKpiStrip` already answers queue attention / stuck-style metrics on the same page
  → **Monitor dual-home** (sidebar + Band 2)

### 2d. Overlap matrix (the evidence for the product question)

| Operator question | Band 1 tabs | Focus sidebar | Saved views | Band 2 KPI | Band 3 find |
|---|---|---|---|---|---|
| Which lifecycle stage? | **PRIMARY** | Pending/Tested rows **duplicate** | Must not clone | — | — |
| My work only? | — | My queue | Can encode `staff` | — | Staff also on View topics |
| Urgent only? | — | Urgent | Can encode `attention` | May click-filter | — |
| Out of stock / blocked? | — | Out of stock | Can encode `ustatus` | May click-filter | — |
| Named personal combo? | — | — | **PRIMARY (by law)** | — | — |
| Org throughput / stuck? | — | Throughput card | — | **PRIMARY strip** | — |
| Find an order? | — | — | — | — | **PRIMARY** |

**Verdict from measurement alone (not yet industry):** the left rail is currently a **mixed-altitude
control strip** — half second tab strip, half filter map, half Monitor dashboard — while house law
and the Home golden say the left rail’s *unique* job is **operator-authored saved views**, with
optional *thin* facets that do **not** restate lifecycle tabs.

### 2e. Contrasting golden — Home → Today (`HomeContextPanel`)

Documented rationale (source comment, 2026-08-01 era, still live):

> Lanes belong in table chrome. Queue links belong in chrome. Search belongs in chrome. What is left
> is the one thing a *system* cannot own: named combinations the operator defines.

Today’s left rail = **SavedViewsList only**. That is the closest in-product proof that Cycle Forge
already believes the product owner’s instinct for To-ship.

---

## 3. House law already on the books (do not ignore)

### 3a. Desk composition (`workbench-ops-queue.md`)

```text
LEFT:  SAVED VIEWS list (primary) + optional thin filter map BELOW views
MIDDLE: WorkbenchChromeHeader + KPI + LedgerGridSurface
RIGHT:  non-modal RightRailHost inspector
```

**Must not** on left: Recent/MRU rails, room pickers, library trees as the **primary** left map.

### 3b. Tabs vs saved views (verbatim boundary)

| | Hardcoded tabs | Saved views |
|---|---|---|
| Defined by | the **system** | the **operator** |
| Represents | mutually-exclusive lifecycle **state** | named **facet combination** |
| Example | Pending → Tested → Packed → Shipped | “late eBay units, oldest first” |
| Lives in | `WorkbenchChromeHeader` | sidebar / table ⋮ |

- Never ship a saved view that reproduces one lifecycle tab.
- Never grow the tab strip to hold a filter (“Late”, “eBay only”).
- **Test:** if adding one more requires a migration / status-machine change → tab; else → saved view.

### 3c. To-ship chrome altitude (already ratified)

Band 1 = tabs + Import/Add only. Band 2 = `OutboundKpiStrip`. Band 3 = find + inspector park.
Sheet layout / refine / staff / Priority / ▦ / KPI collapse live on the **right inspector View
cluster** — not on the left rail.

### 3d. Pattern evolution

Compose from named SoT first; grow SoT when wrong; never freeze on a conservative reskin that leaves
two controls answering one question.

---

## 4. Candidate futures (you may add more; score all)

Propose and score at least these four. You may refine shapes, but do not skip scoring.

| ID | Candidate | One-line shape |
|---|---|---|
| **C0** | Status quo | Keep Focus (incl. Pending/Tested) + Saved views + Throughput |
| **C1** | Home golden | Left = Saved views **only**; delete Focus + Throughput from To-ship rail; facets stay on Band 2 / View topics / find |
| **C2** | Lawful ops-queue | Left = Saved views **primary** on top; **thin** Focus facets *below* that **exclude** Pending/Tested (keep My queue · Urgent · Out of stock); Throughput leaves the rail (Band 2 or Operations Monitor only) |
| **C3** | Filter-map primary | Left = Focus facets (no lifecycle duplicates) as primary; Saved views demoted or moved to ⋮ / View topics; Throughput off-rail |
| **C4** | Collapse left on To-ship | No context panel by default on `/shipping/orders` (full sheet width); saved views only via inspector View / command; optional reopen |

For each candidate, also state:

1. What happens to **Support › Inquiries** alias (`?context=support`) — same rail or different?
2. What happens to **Packed / Shipped** Focus variants (already thinner)?
3. Whether **Units stuck** stays only on Band 2, only on Operations, or both with a defended reason.
4. Migration: URL param compatibility (`ustatus`, `attention`, `staff`) — must remain deep-linkable
   even if the Focus rows move or die.

---

## 5. Industry principles you must apply explicitly

Do not cite vague “best practices.” For each principle below, (a) name the source class, (b) say
whether live To-ship violates it, (c) say which candidate restores it.

1. **One control, one question** (NN/g redundant navigation; Carbon / Polaris “one primary way”)
2. **System states vs user views** (Salesforce List Views / Jira filters / Zendesk views /
   Linear custom views — stages ≠ views)
3. **Primary navigation vs filtering** (pipeline stages as chrome; facets as filters; saved views as
   bookmarks of filter state)
4. **Progressive disclosure** — empty Saved views under a busy Focus list teaches the wrong primary
5. **Monitor vs Workbench altitude** — throughput ROI is observe-only; parking it on a triage rail
   competes with act-and-clear (region contracts)
6. **Spatial muscle memory** — To-ship is the Desk golden for flush sheets; left rail churn must not
   break Band 1–3 spatial predictability
7. **Sellable multi-tenant IA** — recommendations must work for a new tenant with zero saved views
   (empty state is a first-run face, not a failure)

---

## 6. Decisions you must answer (D1–D12)

Answer each with a **default**, blast radius, and one-line reason.

| ID | Decision |
|---|---|
| **D1** | What is the **single primary job** of the To-ship left rail? (saved views / filter map / Monitor / none) |
| **D2** | Do Focus rows **Pending** and **Tested** stay, move, or delete? |
| **D3** | Do Focus rows **My queue · Urgent · Out of stock** stay on the left, move to Band 2/View topics, or become suggested saved views? |
| **D4** | Should Saved views move **above** Focus (lawful ops-queue), become the **only** left content (Home golden), or leave the left rail? |
| **D5** | Where does **Throughput this week** live: Band 2 only · Operations Monitor · both · delete from product? |
| **D6** | Does `GettingStartedChecklist` belong on a production triage rail? |
| **D7** | Is collapsing the context panel on To-ship (C4) acceptable for Kinetic Ledger desk density, or does Desk law require a left map? |
| **D8** | Support alias: same left rail contract or Support-specific? |
| **D9** | Packed / Shipped: keep thin Focus, unify with Pending recipe, or saved-views-only? |
| **D10** | If Focus dies, what is the **discoverability path** for `attention` / `ustatus=BLOCKED` / `staff=me` for new hires? |
| **D11** | Any house-law amendment required to `workbench-ops-queue.md` (tabs vs views / left composition), or is this an implementation drift fix only? |
| **D12** | Phased land order (≤4 phases) with acceptance checks an engineer can run on `:3050` `/shipping/orders` |

---

## 7. Implementation touchpoints (for the eventual PLAN — not for you to edit)

When research closes, an implementer will likely touch:

| Area | Paths |
|---|---|
| Left rail body | `src/components/unshipped/UnshippedSidebar.tsx`, `OutboundSidebarFilterMap.tsx`, `OutboundSavedViewsList.tsx` |
| Desk mount | `src/components/sidebar/OutboundSidebarPanel.tsx` |
| Scope / URL | `src/components/unshipped/useOutboundSidebarScope.ts`, `outbound-sidebar-shared.ts` |
| Middle chrome | `OutboundWorkspaceHeader.tsx`, `OutboundKpiStrip.tsx`, `DashboardOrdersView.tsx` |
| Saved views SoT | `src/components/saved-views/SavedViewsList.tsx`, `src/hooks/useSavedViews.ts`, `src/lib/saved-views/surfaces.ts` |
| Golden twin | `src/components/sidebar/HomeContextPanel.tsx` |
| Law | `.claude/rules/display/workbench-ops-queue.md` |
| Guards | `header-mode.guard.test.ts` (To-ship ≠ Labels station), desk/sheet guards as needed |

---

## 8. What “done” looks like for your report

1. Industry survey with named products + citations (or dated URLs).
2. Scored candidate table (§0.3) with a cut line and a **recommended default**.
3. D1–D12 answered with defaults.
4. Explicit list of **UX/UI principles violated today** and which updates restore industry standard
   *inside* Kinetic Ledger (not a redesign to Notion/Airtable aesthetics).
5. A short “do not do” list (dual Pending controls, Monitor vanity on triage rail, etc.).
6. Ask-first section only for facts missing from this brief.

**Remember:** the product owner is not asking “make the sidebar prettier.” They are asking whether
the sidebar still has a **job** next to a three-band triage desk — and if so, which job is uniquely
its own.
