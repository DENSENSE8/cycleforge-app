# Research briefing — To-ship saved-views control: placement & trigger treatment

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-08-09
**Subject:** On a **table-first order triage desk** whose **lifecycle stage is already tabbed** and whose **left rail has been removed (rail-less)**, what is the **industry-standard placement _and_ trigger treatment** of the **saved-views control** — and specifically, does a saved-views picker belong **grouped with the find / refine command row** rather than as a **dropdown beside the lifecycle tabs**?
**Status:** PARTIALLY RESOLVED — **placement decided; trigger treatment still open.**

> **UPDATE (2026-08-09, same day):** The §2 anatomy below was captured while the
> control sat in **Band-1 `leading`** (a bare Star). A concurrent session then
> **moved it to Band 3 trailing find** (flush Bookmark icon, via the shared
> `WorkbenchViewsMenu`), which is exactly this brief's own §1 recommendation and
> the codebase's SoT + guards (`band3-views` / `outbound-rail-dedup` /
> `band1-house-chrome`, all green). So the **placement question is settled** —
> treat §2's Band-1 description as historical. What remains genuinely open is the
> **trigger treatment** (Q2 / D3): the shipped control is an **icon-only Bookmark**
> with the active view name in tooltip + aria-label; this brief leaned toward a
> **visible active-view label** (recognition / visibility, P3–P4). Run the
> research on that sub-question only; do not re-litigate Band-3 placement.
**Primary surface:** `/shipping/orders` (“To ship”) — fulfillment desk with Pending · Tested · Packed · Shipped table views.
**Relationship to prior work:** This is the **successor** to `to-ship-triage-rail-vs-lifecycle-tabs-GEMINI-RESEARCH-BRIEFING.md`. That brief asked _what the left rail is for_; the answer was **rail-less** (the table reclaims the width; saved views became a small control in the top chrome). This brief asks the **narrower follow-on**: now that there is no rail, **where does the saved-views control live, and how is its trigger drawn?**

**Hard framing rule for your answer:** Compare and contrast **only against industry standards** (named products + citable UX research). **Do not** invent, cite, or reconcile against this product’s internal design constitution, region contracts, source-of-truth laws, band-numbering, or house naming systems. Treat measured layout facts in §2 as **empirical current state**, not as rules you must preserve. Where you cite a product, say **which surface** and, if possible, the year/version you observed.

---

## 0. Method — read before answering

### 0.1 Your job (three deliverables — keep separate)

1. **Industry pattern survey (2024–2026).** How do mature seller / WMS / helpdesk / CRM / B2B work-tracker products place the **saved-views control** on a **table-first queue** when **stage/status is already tabbed** in the content chrome and there is **no left rail**? Name products + surfaces. Cite sources. State the **dominant placement** and the **dominant trigger treatment**, plus the conditions under which minority patterns win.
2. **Placement diagnosis for THIS shape.** Given the measured anatomy in §2 (rail-less, lifecycle tabs in a top band, a find/command row below KPIs, and a separate record-inspector that already hosts filter/sort/layout), classify each candidate home for the saved-views control (§3, Q1) as **standard / defensible-minority / anti-pattern**, scored against industry practice, not preference.
3. **Gap-close principles + acceptance checklist.** The exact industry-standard UX/UI principles a saved-views control must meet, each with: principle name · one-sentence rule · who ships it · how Cycle Forge currently fails or partially meets it · a concrete acceptance criterion an engineer can verify on `/shipping/orders`.

### 0.2 What this brief is NOT

- Not “should saved views exist” (they do; the parent brief settled that).
- Not “merge saved views into the lifecycle tabs” (the tabs are frozen system states; a view is a filter combination — treat them as different axes).
- Not a request to design a new visual skin, pick a component library, or write code.
- Not reconciliation against internal house design law.
- Not the website-wide **page-pin** control (a separate cross-app “jump to this whole page” affordance that lives in the global header on every route — out of scope, do not conflate).

### 0.3 Scoring axes (mandatory for every candidate placement)

Score 1–5; report a table. No seventh axis.

| Axis | Meaning |
|---|---|
| **Correct-mental-model** | Placement matches whether a saved view reads as an **outer scope** (a queue you are “in”) or an **inner refinement** (a filter applied on top of the current stage) |
| **Single locus** | Operator learns **one** place to switch/apply/save a view; no second competing home |
| **Active-state feedback** | The resting control tells you **which view is active right now** (or that none is) |
| **Discoverability** | A first-time operator finds it without training; it is not hidden behind a chord-only palette |
| **Non-competition** | It does not read as a peer of the lifecycle tabs (does not get parsed as “another tab”) |
| **Density ROI** | It earns its footprint on a dense desk; low-frequency parts progressively disclose |

**Fit ≈ (Correct-mental-model × Single locus × Active-state feedback × Non-competition) / (6 − Density ROI), tie-broken by Discoverability.** Rank candidate placements descending.

### 0.4 Sources to cover (minimum)

| Class | Named examples (start here; expand) | Use for |
|---|---|---|
| **View-picker convention** | Salesforce Lightning list-view selector, Notion database view switcher, Airtable view menu, Google Sheets/Looker filter views | Where the **view PICKER** trigger sits and **what its trigger shows** (name vs icon) |
| **Marketplace seller consoles** | Amazon Seller Central Manage Orders, eBay Seller Hub Orders, Walmart Seller Center, Shopify Admin Orders (saved views tabs + “Edit view” / “Save as”) | View vs stage-tab coexistence; save/apply/manage affordance |
| **WMS / 3PL / shipping** | ShipStation, ShipBob, Extensiv / ShipHero, Linnworks | Where saved filters live on a fulfillment queue with a filter toolbar |
| **Helpdesk / triage inboxes** | Zendesk views, Gorgias, Front, Intercom Inbox, Linear Issues | Views-as-left-rail vs views-in-toolbar; command-palette view switching |
| **CRM / work trackers** | HubSpot saved filters, Attio, Height, Jira board filters/quick filters, Plane | Saved query placement relative to a filter/sort/group toolbar |
| **Research / heuristics** | Nielsen Norman Group (progressive disclosure, recognition-over-recall, visibility of system status); Don Norman mapping; Fitts’s law; WCAG 2.2 landmark / focus expectations; Apple HIG & Material 3 density/toolbar guidance | Principles, not product clones |

Where industry splits, give **both** positions, the conditions each wins under, then pick a default for **this** desk shape (rail-less table + lifecycle tabs already in top chrome + a find/command row + an inspector that already owns filter/sort/layout).

---

## 1. Product context (facts only — not design law)

**Cycle Forge** is multi-tenant **reseller-operations SaaS** (used-goods / electronics refurb is the first dogfood tenant — frame recommendations as sellable B2B warehouse/fulfillment software, not a five-person shop tool).

**To ship** is the fulfillment **order triage desk**: operators browse and act on outbound orders through lifecycle stages (awaiting test → tested/ready → packed/staged → shipped). Primary work is a **dense spreadsheet-like table**. Selection opens a **right-side record inspector**. As of 2026-08-09 the desk is **rail-less** — there is no persistent left column; the table takes the reclaimed width.

Operators work at a desk with pointer + keyboard, on ~1080p–1440p monitors, often for multi-hour shifts. Speed and muscle memory matter more than marketing whitespace.

**A “saved view” here** = a **named bookmark of a URL filter combination** on this surface’s own params (staff / attention / stock-status / stage / late, etc.). It is created by setting filters and saving; it is re-applied by selecting it. It is **not** a lifecycle stage and **not** a second table.

---

## 2. Measured current anatomy (verified from source 2026-08-09)

You may not have the repo open. Treat this section as ground truth. Do not invent additional controls.

### 2a. Frame (desktop, rail-less)

```text
┌─ Global header (page identity “To ship”, global search, utilities) ───────┐
├─ (no left rail) ─── Main work surface ─────────────────────────────────────┤
│  Band 1:  [★ views ▾]  Pending · Tested · Packed · Shipped     Import  Add │
│  Band 2:  KPI strip (clickable queue metrics)                             │
│  Band 3:  [ Filter orders… (find, flex-1) ]                    [▥ inspect] │
│  Body:    order TABLE (primary work)                                       │
│  Right:   record inspector (push column) — hosts filter/sort/layout/paint  │
└────────────────────────────────────────────────────────────────────────────┘
```

### 2b. The saved-views control today (the thing under review)

Source: `src/components/dashboard/OutboundViewsMenu.tsx`, mounted in Band 1’s **leading** slot by `OutboundWorkspaceHeader.tsx`.

- **Trigger:** a **bare `Star` icon button** (no text label), tooltip “Saved views”, `aria-haspopup="menu"`. It sits **immediately left of the lifecycle tabs** (`Pending · Tested · Packed · Shipped`), with **no divider** between it and the first tab.
- **Panel:** a `bottom-start` popover (`min-w ≈ 15rem`) containing the saved-views list: apply / rename / delete existing views + “Save current view”.
- **Trigger shows no active-view name** — whether a view is applied or not, the resting control is the same Star icon.
- Config is per lifecycle mode (unshipped / packed / shipped) — each mode has its own saved-view bucket + param set.

### 2c. Lifecycle tabs (Band 1)

Source: `OutboundWorkspaceHeader.tsx`

| Tab (URL) | Label | Selects |
|---|---|---|
| `unshipped` | **Pending** | Pre-pack queue (badge counts awaiting-test + out-of-stock) |
| `tested` | **Tested** | Tested / ready-to-pack (badge count) |
| `packed` | **Packed** | Staged for dock scan-out |
| `shipped` | **Shipped** | Shipped history / week board |

These are **frozen system states** (adding one requires a schema/status-machine change). They are the desk’s “which board am I on?” switch.

### 2d. Find / command row (Band 3) + inspector refine cluster

Source: `OutboundTriageBand` in `OutboundWorkspaceHeader.tsx`; inspector chrome via the orders view-topics cluster.

- Band 3 today is **find-only**: a `flex-1` free-text “Filter orders…” field on the left, and a **Show/Hide inspector** toggle on the right. It has **no** saved-views control and **no** filter/sort/layout controls.
- **Structured refinement** (filter facets, sort, column display, row paint, compare, zoom) currently lives on the **record inspector’s “View” cluster** (the pushing right column), not on Band 3.
- A free-text find writes the same `?…` param vocabulary a saved view captures.

### 2e. The product owner’s tension (why this brief exists)

> With the rail gone, the saved-views control landed as a **bare Star dropdown pinned to the left of the lifecycle tabs**. Two worries:
> 1. **It reads as another tab.** An icon flush against `Pending` with no divider invites the eye to parse it as part of the tab strip — two navigation systems sharing one edge.
> 2. **It has no active-view feedback.** A lone Star never tells the operator _which view they are in_, unlike the labeled view selectors in Salesforce / Notion / Airtable.
>
> **Working hypothesis to validate (do NOT rubber-stamp):** because a saved view here is a **saved filter combination** — i.e. an _inner refinement_ applied on top of the current lifecycle stage, not an outer scope that re-scopes the tabs — it may belong **grouped with the find / refine command row (Band 3)**, alongside the controls that answer “how am I slicing this stage?”, rather than as a **dropdown beside the tabs** (which is the conventional home for a view **selector** that _is_ the primary scope).

### 2f. Preliminary signal (unverified — confirm or refute; do not treat as an answer)

A shallow first-pass scan suggested two things the deep research must **independently verify**:

- The conventional home for a saved-**view PICKER** (a selector that _is_ the scope) is a **left-aligned dropdown whose trigger shows the active view’s name** (Salesforce list-view selector; Notion / Airtable view-name + caret).
- The **right/trailing** end of a table toolbar is conventionally **filter / sort / display** real estate — i.e. **inner-refinement** controls, not the view-picker’s home.

If both hold, the crux (§3, Q3) is decisive: **is a Cycle Forge “saved view” a scope-picker or a refinement?** The measured facts (it’s a saved _filter combination_, and lifecycle tabs — not views — are the frozen primary axis) lean **refinement**, which would favor **grouping with find/refine**. State whether the evidence supports that, and under what conditions the scope-picker reading would win instead.

---

## 3. Industry question stack (answer every item)

### Q1 — Candidate placements: which is standard for THIS shape?

Score each candidate home for the saved-views control on a **rail-less, lifecycle-tabbed** table desk:

| Candidate | Sketch | Classic homes to check |
|---|---|---|
| **A. Beside the tabs (leading)** | Dropdown left of the stage tabs | Salesforce list-view selector; Notion/Airtable view name |
| **B. Beside the tabs (trailing)** | Dropdown right of the tabs, before page CTAs | Uncommon for a view picker — verify |
| **C. In the find / refine command row** | Grouped with search + filter/sort as a refinement | Jira quick filters; Height/Linear filter bars; Shopify “Edit view / Save as” |
| **D. In the record inspector’s refine cluster** | With filter/sort/layout/paint in the push column | Airtable-style side config; verify vs discoverability cost |
| **E. Command palette / overflow only** | ⌘K or “⋯” menu; no always-visible control | Linear views via palette; power-user tools |

State the **industry default** for this shape and the conditions under which each minority option wins. Explicitly compare **A vs C** (the live fork).

### Q2 — Trigger treatment: labeled active-view name vs bare icon

- Do standard view controls show the **active view’s name** on the resting trigger (recognition-over-recall, visibility of system status), or is a bare icon acceptable?
- When the applied state is usually **“no saved view”** (the common case here, since most operators just use tabs + free-text), does a name-bearing trigger over-emphasize views? What do products do when “no view” is the default resting state?
- If grouped with find/refine (C), what does the standard trigger look like (a “Views ▾” button? a “Saved” chip? an item inside a filter menu?)?

### Q3 — Scope-picker vs inner-refinement (the crux)

- Industry definition test: when is a saved view an **outer scope** (selecting it re-scopes the whole surface; other controls sub-navigate within it) vs an **inner refinement** (it applies a filter set on top of an independently-chosen stage/board)?
- Given To ship’s tabs are **frozen lifecycle states unaffected by the active view**, and a view stores **filter params**, is a Cycle Forge saved view a scope or a refinement? 
- **Does that classification decide placement** — refinement → group with find/refine (C); scope → beside/replacing the primary switch (A)? Defend with named products where the classification and the placement match.

### Q4 — Grouping with find, filter, and sort

- Industry practice for **co-locating the view picker with free-text search and filter/sort/group**: one “refine” cluster vs scattered controls. When does grouping reduce cognitive load, and when does it bury a high-value control?
- If Band 3 already owns free-text find and Band 3’s right end owns the inspector toggle, where in that row does a view control sit — leading the row, trailing before the inspector toggle, or inside a unified “Filter ▾ / Views ▾” menu?
- Is there a standard **relationship between “apply a saved view” and “the current ad-hoc filters”** (does applying a view replace, merge, or seed the live filters; how is a dirty/unsaved state shown)?

### Q5 — Discoverability vs prominence vs progressive disclosure

- For a control used **occasionally but with high value** (power users save/reuse; casual users never touch it), what is the standard prominence tier — always-visible button, item inside a filter menu, or palette-only?
- What must stay **always visible**, and what may **progressively disclose** (e.g. “Save current view” hidden until filters are set; the list hidden until ≥1 view exists)?
- Is a **bare-icon, no-label, no-divider** control beside primary tabs a recognized discoverability/affordance problem? Cite.

### Q6 — Rail-less desks specifically

Now that there is no left rail (the classic home for a views list — Zendesk, Linear, Airtable sidebars), **where do rail-less table desks put saved views?** Survey Shopify Admin (density variants), Linear (list view + palette), Height, HubSpot index pages. What is the 2026 default when the sidebar is gone but the table stays?

### Q7 — Gap close: principle → change class

For each failing principle, classify the fix as one of:

| Change class | Meaning |
|---|---|
| **Relocate** | Move the control to a different band/cluster (e.g. tabs-adjacent → find row) |
| **Relabel** | Give the trigger an active-view name / “Views ▾” text |
| **Separate** | Add a divider / grouping so it stops reading as a tab peer |
| **Merge** | Fold into a unified filter/refine menu |
| **Disclose** | Hide sub-affordances until a precondition (first save; ≥1 view) |
| **Keep** | Current placement is already standard; change only treatment |

Prescribe **IA + interaction only** — no libraries, no house tokens.

---

## 4. Industry principles you must cover (minimum catalog)

Produce a principle for each row. Add rows only with strong citations. For each: **industry rule · citations · Cycle Forge verdict (`PASS` / `PARTIAL` / `FAIL`) · gap-close change class from Q7.**

| # | Principle class | Prompt |
|---|---|---|
| P1 | **View ≠ stage tab** | A saved view is a filter combination, not a lifecycle board; it must not read as a peer of the stage tabs |
| P2 | **Placement follows classification** | Scope-pickers sit at the primary-switch position; inner-refinements sit with filter/sort/find |
| P3 | **Visibility of system status** | The resting control communicates the active view (or explicit “none”) |
| P4 | **Recognition over recall** | Operators recognize the current slice without opening the menu |
| P5 | **Single locus for views** | One place to switch/apply/save a view; no duplicate homes across bands + inspector |
| P6 | **Refine cluster cohesion** | Search, filter, sort, and saved views belong to one legible “adjust what I see” group |
| P7 | **Affordance & separation** | A control adjacent to a different control family needs a divider/label so its boundary is legible |
| P8 | **Progressive disclosure** | Rare power affordances (save; the list) hide until a precondition is met |
| P9 | **Density ROI on a rail-less desk** | The control earns its top-chrome footprint; it does not re-inflate the width the rail-less move reclaimed |
| P10 | **Keyboard & pointer parity** | If views have a shortcut/palette entry, it agrees with the visible control |

---

## 5. Decision table (pick one default per row — no soft hybrids without a default)

| ID | Decision | Options |
|---|---|---|
| D1 | Primary placement of the saved-views control | Beside tabs (leading) · Beside tabs (trailing) · **Find/refine row** · Inspector refine cluster · Palette-only |
| D2 | Is a saved view classified as | Outer scope · **Inner refinement** · Depends (state the test) |
| D3 | Trigger treatment | Bare icon · Icon + “Views” label · Active-view name ▾ · Item inside a “Filter” menu |
| D4 | Relationship to free-text find | Same cluster · Separate control · Unified refine menu |
| D5 | Apply semantics | Replace live filters · Merge · Seed-then-editable (show dirty state?) |
| D6 | Empty / no-views-yet treatment | Hide list until first save · Persistent CTA · Teach via save toast |
| D7 | “Save current view” affordance | Always visible · Disclosed only when filters set · Inside the views menu |
| D8 | Separation from lifecycle tabs (if kept adjacent) | Divider · Distinct control style · Relocate so adjacency is moot |
| D9 | Prominence tier | Always-visible button · Menu item · Palette-only |
| D10 | Success metric for the change | Mis-parse rate (view read as a tab) · Time-to-apply-a-saved-view · % operators reusing a view weekly · Recognition of active view without opening menu |

---

## 6. Required report shape

1. **Executive answer (≤12 lines):** For a rail-less, lifecycle-tabbed order table desk, where should the saved-views control live, how should its trigger read, and is the “group it with find/refine” hypothesis correct?
2. **Pattern survey table** (§0.4 products × candidate placements A–E, plus trigger treatment).
3. **Placement scorecard:** each candidate A–E scored on §0.3 axes, ranked by the fit formula.
4. **Crux ruling (Q3):** scope vs refinement, and what it implies for placement — with named products where classification and placement agree.
5. **Principles catalog** P1–P10 with PASS/PARTIAL/FAIL + citations.
6. **Decision table** D1–D10 with one default each and a one-line defense.
7. **Gap-close backlog** ordered by fit, each item: change class · principle IDs · acceptance check on `/shipping/orders`.
8. **Explicit non-goals** (what industry would _not_ do — e.g. merge views into stage tabs; a bare unlabeled icon beside primary tabs; two homes for views).

---

## 7. Code pointers (optional verification)

If you have repo access, open these — do not invent siblings:

| Path | Why |
|---|---|
| `src/components/dashboard/OutboundViewsMenu.tsx` | The current saved-views control (bare Star dropdown) |
| `src/components/dashboard/OutboundWorkspaceHeader.tsx` | Band 1 (tabs + Views leading) and Band 3 (find + inspector toggle) |
| `src/components/unshipped/OutboundSavedViewsList.tsx` | Saved-views list body + `outboundSavedViewsConfig` |
| `src/components/unshipped/outbound-sidebar-shared.ts` | Saved-view param keys per lifecycle mode |
| `src/components/saved-views/SavedViewsList.tsx` | Shared apply/save/rename/delete list |
| `src/hooks/useSavedViews.ts` | Store + URL-apply logic |

---

## 8. Closing reminder

Your north star is **industry-standard placement and treatment of a saved-views control on a rail-less, table-first triage desk where lifecycle stage is already tabbed.** The stage tabs answer “which board?”; free-text find and (today) the inspector answer “how am I slicing it?”. The research must say **where the saved-views control belongs in that map**, **what its trigger should show**, and whether the product owner’s instinct — **group it with the find/refine row rather than pin it beside the tabs** — is what mature products actually do. Confirm or refute with named surfaces and citable UX research.
