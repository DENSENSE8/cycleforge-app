# Research briefing — industry standard for importable / pinned high-velocity tables in B2B ops SaaS

**For:** Gemini Pro (deep research) — **you do not have the codebase.** Every product constraint and current-state fact below is **embedded**. Do not invent file paths, claim to have inspected source, or assert “we already have X” beyond §2–§3. If you speculate past the embedded facts, label it `my reasoning:`.
**From:** Cycle Forge engineering
**Date:** 2026-08-07
**Subject:** After shipping a **Plus → pin a foreign list tab** pattern on a scan station workbench (Unbox can import the Inbound Pipeline table without navigating away), what is **industry standard in 2024–2026 B2B SaaS** for high-velocity operational data tables that **compose / import / pin related collections** onto one surface — and **what should Cycle Forge keep vs kill** as that pattern grows beyond Unbox?
**Status:** RESEARCH RETURNED (2026-08-07). Implementation already landed for Unbox+Inbound v1 (`docs/todo/unbox-pinned-inbound-tab-PLAN.md`). Execution handoff: [`unbox-pin-pattern-harden-CLAUDE-CODE-PROMPT.md`](./unbox-pin-pattern-harden-CLAUDE-CODE-PROMPT.md) (KEEP pin · freeze catalog · S1–S5 harden).
**Your deliverable (historical):** one markdown **research + keep/kill report**. Follow-up build uses the harden prompt — do not re-open KEEP/KILL unless product asks.

**This brief is NOT “build Airtable,” “clone Google Sheets tabs,” or “let staff create arbitrary schemas.”** Cycle Forge is sellable **reseller / warehouse-operations SaaS**. Spreadsheet chrome exists to raise **operator throughput on live queues** next to barcode scan work. “Import a table” here means **pin a registered system collection** onto a hybrid Station+Workbench strip — not create a new database.

**Related briefs (do not re-litigate; cite and extend):**

| Brief | Job |
|---|---|
| `ops-table-simplification-GEMINI-RESEARCH-BRIEFING.md` | Display consistency / chrome |
| `grid-industry-actions-GEMINI-RESEARCH-BRIEFING.md` | Row / multi-select / attention actions |
| `tenant-table-extensibility-HORIZON-C-GEMINI-RESEARCH-BRIEFING.md` | Custom fields / true custom tables (long-term) |
| `page-consolidation-station-first-GEMINI-RESEARCH-BRIEFING.md` | Surface count / station-first IA |
| `workbench-chrome-band-density-GEMINI-RESEARCH-BRIEFING.md` | Band-1 / Band-3 chrome density |

This brief is specifically about **composition of multiple collections on one operator surface** (pin / import / linked views), not column chrome and not tenant-authored DDL.

---

## 0. Method

### 0.1 Your job

1. **Survey the web** for how B2B ops / dense-queue products let operators see **related tables** without full navigation — pin, import, linked views, workspace tabs, dashboards, multi-table sheets, Interfaces, etc.
2. **Reconcile** every recommendation against the embedded house constraints in §1–§3. Where industry conflicts with a constraint, **pick a side and defend** (or tell us to change the constraint).
3. Produce an explicit **KEEP / KILL / EVOLVE** portfolio against the **recent Unbox pattern** in §3 and the candidate expansions in §4.
4. Treat facts in §2–§3 as **ground truth about our product today.**

### 0.2 Sources to cover (minimum)

Cite **named systems** and **primary sources**. Prefer docs, design systems, changelogs dated **2024–2026**.

| Class | Examples | Use for |
|---|---|---|
| **Spreadsheets** | Google Sheets (bottom tabs), Excel Online | Multi-sheet mental model — when it helps vs when it misleads ops SaaS |
| **DB–spreadsheet hybrids** | Airtable (Interfaces, linked views), Notion databases (linked views), Coda, Smartsheet | “Show another table’s rows here” without schema invent |
| **Ops / SaaS dense queues** | Linear (custom views, project tabs), Stripe Dashboard, Retool, Attio, Front, Zendesk agent workspace, Shopify Polaris IndexTable, Salesforce Lightning list views / related lists | Sellable B2B patterns for pinning / related lists |
| **WMS / fulfillment–adjacent** | At least 1–2 named warehouse / fulfillment / inventory UIs (public docs or demos) | Floor monitor + scan-adjacent reality |
| **Research / IA** | NN/g on tabs vs filters; WCAG 2.2 for tablists | Cognitive load of growing tab strips |

Where industry splits, give **both** positions, the conditions each wins under, then pick one for **this** product.

**Hard fork:** “what Sheets / Airtable does with tabs” ≠ “what a scan-adjacent warehouse-ops Workbench strip should do on a 1080p floor monitor.”

### 0.3 Scoring model (mandatory)

Score every candidate pattern on **all five axes** (1–5). Report a table. Do not invent a sixth axis.

| Axis | Meaning |
|---|---|
| **Floor throughput** | Faster decide/act without leaving the station surface? |
| **Cognitive load** | Strip / chrome stays scannable for a tired floor operator? |
| **Fit** | Compounds on Station+Workbench, LedgerGrid, saved views, staff prefs vs new paradigm? |
| **Blast radius** | Surfaces, APIs, prefs, permissions touched (5 = tiny; 1 = rewrite) |
| **Sellable SaaS** | Tenant-safe, permission-gated, not folklore for one dogfood warehouse? |

**ROI ≈ (Floor throughput × Fit × Sellable) / ((6 − Blast) × (6 − Cognitive load))**  
(so high cognitive load hurts). Rank descending. State your cut line.

### 0.4 Closed forever (do not recommend unless Ask-first with strong evidence)

- Foreign grid shells (AG Grid / Handsontable / MUI DataGrid / embedded Sheets) as the product table
- Tenant-authored table schemas / “create any table” as the near-term answer to “Plus”
- Putting freeform spreadsheet tabs **into the scanner Station column** (scan region stays act-and-clear)
- Dual full-width right columns (AI + detail) or floating table overlays that violate push-rail law
- Replacing lifecycle system tabs (Urgent / Recent / Queue / History) with only personal freeform tabs
- Growing Band-1 with **filters disguised as tabs** (house rule: tabs = collections / lifecycle; facets = saved views)

---

## 1. Product context (embedded)

**Cycle Forge** is multi-tenant B2B SaaS for used-goods **reseller operations**: inbound receiving → triage → unbox → test → repair → list → pack → ship, plus returns / warranty / support. USAV is the first dogfood tenant only — frame as a **sellable product**.

**Operator reality**

- Hybrid pages: **Station** (barcode scan, act-and-clear) beside **Workbench** (dense LedgerGrid, durable URL selection).
- Floor monitors ~1080p, long shifts, mouse on queues, wedge scanner on benches.
- Rows are **work items** (POs, cartons, orders), not freeform cells.
- Status writes go through a state machine + audit — not casual cell overwrite of lifecycle.
- Org isolation (`orgId` from auth context), staff permissions, and RLS are non-negotiable.

**UI identity (Kinetic Ledger):** data-first, dense, state-colored, scan-aware. Bias: **legible throughput over document calm**.

### Region contracts (use this vocabulary)

| Region | Driven by | Job | Selection | Density |
|---|---|---|---|---|
| **Station** | barcode scanner | act-and-clear | ephemeral | floor |
| **Workbench** | pointer | pick → edit → persist | durable / URL | ops |
| **Monitor** | filters | observe | none | rollup |
| **Canvas** | pan/zoom | reshape a definition | durable focus | studio |

**This brief is about Workbench collection maps that sit on hybrid Station+Workbench pages** (and whether Home / other desks should copy the pattern). Do not turn Station scan columns into multi-sheet browsers.

### Tabs vs saved views (ratified house law — load-bearing)

| | Hardcoded / system tabs | Saved views |
|---|---|---|
| Defined by | the **system** (or a closed pin catalog of system collections) | the **operator** |
| Represents | mutually exclusive **collection / lifecycle** | named **facet combination** |
| Cardinality | small, shared vocabulary | open-ended per staff |
| Lives in | Band-1 strip | left rail / ⋮ menu |

**Never** grow the tab strip to hold a filter (“Late”, “eBay only”). That is a saved view wearing tab chrome.

**New tension this brief must resolve:** pinning a **foreign collection** (Inbound Pipeline) onto Unbox’s Band-1 is **not** a filter of Unbox rows — it is a second collection. Industry may call that “linked view,” “related list,” “workspace tab,” or “sheet.” Name the pattern correctly and say whether Band-1 is the right host long-term.

---

## 2. Architecture already in place (ground truth)

Facts an engineer measured 2026-08-07. Do not invent beyond this.

### 2.1 One display kernel

- Workbench queues render through a shared **LedgerGrid** family + per-surface `GridSurfaceDescriptor` / capabilities.
- Column show/hide / widths / display washes live in `staff_preferences.tableColumns[tableId]` (delta against descriptor defaults).
- Record detail opens in a **non-modal pushing right rail** (`RightRailHost`), not a modal as the default.
- Column display control: **▦** portals into Band-3 triage controls → `GridColumnDetailsPanel` (right rail). Not a chrome Fields menu.

### 2.2 Hybrid Unbox page (Station + Workbench)

- Route `/unbox`: scan column + workbench strip.
- System Band-1 tabs (always present): **Urgent · Recent · Queue · All · History** (URL `?unboxview=`).
- Trailing solid **Unbox** CTA = **resume scan** (MRU carton + focus scan bar) — not “go to Unbox page.”
- **All** tab already swaps body to a different table host (Tech All triage) — precedent for foreign collection mount.

### 2.3 Inbound desk (separate Workbench)

- Route `/incoming`: pure Workbench ops-queue — Pipeline | Docked.
- Own header CTAs: Check / Import / Add.
- Same Incoming grid descriptor; `tableId: "incoming"`.

### 2.4 Saved views (orthogonal)

- Polymorphic `saved_views` table, discriminator `surface`, staff-owned (+ share flags).
- Used for facet combos (Home Today, outbound modes, history surfaces).
- **Explicitly not** used for Unbox strip membership in the new pattern (tabs ≠ facet views).

### 2.5 Home

- `/` Home modes include Today (My Day) and Inbox (subscriptions / SLA) — Inbox is **not** inbound PO lists.
- Do not conflate Home Inbox with Inbound desk.

---

## 3. Recent change under review (ground truth — shipped 2026-08-07)

### 3.1 Product move

On `/unbox` Band-1:

1. Leading **Plus** opens a **small popover** (caption density).
2. Closed catalog currently has **one** entry: **Inbound** (“Pipeline purchase orders on the way”).
3. Pin writes `staff_preferences.unboxPinnedExtraTabs: ['incoming']`.
4. Strip shows **Inbound** after system tabs (divider); unpin via trailing control while on that tab.
5. Active tab `?unboxview=incoming` mounts **Incoming Pipeline grid** embedded under Unbox chrome (no full Incoming header / Check·Import·Add in v1).
6. Column prefs: **shared** `tableId: "incoming"` with `/incoming`.
7. Row open / 1-check → existing Incoming details **right rail**.
8. Deep link works without pin; strip membership requires pin.
9. Unbox KPI Band 2 + Unbox-specific Band-3 refine are **honestly absent** on the Inbound tab.
10. **Unbox** resume CTA remains on every tab including Inbound.

### 3.2 Explicit non-goals of that slice (still open for your ruling)

- Home Inbox as host
- True custom / tenant-authored tables
- Docked lane inside Unbox embed
- Check / Import / Add on the embed
- Arrival / Pack / Testing rollouts
- Org-default pin templates

### 3.3 Motivating operator story

> “I am on Unbox. I need to see inbound receiving orders without going to the Inbound page. Scan stations already have list tabs + a return-to-scan button — Plus should let me add another list.”

### 3.4 Tension with house IA

| Tension | Detail |
|---|---|
| **Station vs Workbench** | Foreign list is Workbench-on-Workbench sibling — OK by multi-region law — but risks teaching “Unbox = home for every inbound table.” |
| **Tabs vs views** | Pin is strip membership of a **system collection**, not a saved facet — aligns with “distinct collection earns a tab,” but Band-1 can bloat. |
| **Sheets analogy** | Operators asked for “Sheets tabs.” Industry may say that analogy is wrong for ops SaaS. |
| **Duplicate surface** | `/incoming` still exists with richer chrome. Embed is a **read/triage slice**. Is that good progressive disclosure or harmful dual front door? |
| **Plus meaning** | Plus = pin from closed catalog. Easy to misread as “create table” (Airtable). Naming / UI may need industry-backed correction. |

---

## 4. Candidate futures you must rule on

For each: **KEEP as-is / EVOLVE / KILL**, with ROI score and one-paragraph defense.

| ID | Candidate |
|---|---|
| **C1** | Unbox Plus → pin Inbound (what shipped) |
| **C2** | Grow catalog on Unbox (Unfound, Arrival queue, Pickup, …) |
| **C3** | Same Plus/pin composer on Arrival / Pack / Testing / Shipping |
| **C4** | Move personal pin strip to **Home / My Day** instead of (or in addition to) stations |
| **C5** | Replace pin-tabs with **left-rail related lists** / secondary nav (Salesforce-style) |
| **C6** | Replace pin-tabs with **saved views only** (no foreign collections on Band-1) |
| **C7** | Sheets-like **bottom** tab bar for collections (operator request analogy) |
| **C8** | Airtable **Interfaces / linked views** model (read-only projections of system tables) |
| **C9** | True **custom tables** (Horizon C) as the answer to Plus |
| **C10** | Embed full Inbound chrome (Check / Import / Add) inside Unbox |
| **C11** | Org / role **default pin templates** (leads set floor defaults) |
| **C12** | Cap Band-1 extras (e.g. max 2 pins) + overflow “More lists” |
| **C13** | Deep-link only (no pin UI) — kill Plus; keep `?unboxview=incoming` for power users |
| **C14** | Rename Plus / catalog copy so it cannot mean “create schema” |

Also answer: **Should `/incoming` remain a first-class L1 route** if Unbox (and later others) can pin it?

---

## 5. Industry survey questions (answer explicitly)

### Q1 — Multi-collection workspaces

How do Linear, Stripe, Salesforce, Zendesk, Front, Shopify admin, Retool, and Airtable Interfaces let an operator keep **two related collections** in one workspace without full page navigation? Which pattern wins for **high-velocity floor ops**?

### Q2 — Sheets tabs analogy

When is the Google Sheets multi-sheet tab model appropriate in B2B SaaS, and when is it a **harmful metaphor** (especially next to a scanner Station)? Cite products that tried and retreated.

### Q3 — Related list vs pin tab vs linked view

Compare Salesforce related lists, Airtable linked views / Interfaces, Notion linked databases, and Linear custom views. Map each to Cycle Forge’s Band-1 / left rail / saved views. Which mapping is correct for **foreign system collections**?

### Q4 — Personalization vs shared vocabulary

For a 5–50 person warehouse tenant: should strip membership be **per-staff**, **per-role**, **org-default with override**, or **fixed system**? What do mature ops products do for list personalization without fragmenting training?

### Q5 — Dual front doors

When a collection has a full desk (`/incoming`) and an embedded pin on a station (`/unbox`), what is industry guidance for **chrome parity** (full CTAs vs read-only slice) and **avoiding zombie routes**?

### Q6 — Plus affordance meaning

In B2B products, what does a leading **+** next to a tab strip usually mean (new record / new view / new sheet / add widget)? What labeling prevents the Airtable “create table” misread?

### Q7 — WMS / floor reality

What do public WMS / fulfillment UIs do when a packer or receiver needs a **secondary queue** without leaving the station? Name systems.

---

## 6. Forced decisions (D1–D14)

Answer each with: **Keep / Evolve / Kill** (or Yes / No / Conditional), **one sentence ruling**, **evidence**.

| ID | Decision |
|---|---|
| **D1** | Keep Unbox Plus → pin Inbound as the golden pattern for foreign collections? |
| **D2** | Cap how many extra Band-1 tabs a staffer may pin? Number? |
| **D3** | Expand Unbox catalog beyond Inbound in the next 90 days? Which 0–2 entries? |
| **D4** | Port the composer to other scan stations in the next 90 days? Which? |
| **D5** | Host personal multi-collection triage on Home instead of stations? |
| **D6** | Kill Plus and use only deep links / nav to `/incoming`? |
| **D7** | Keep `/incoming` as L1 if pin exists? |
| **D8** | Embed Check/Import/Add on Unbox Inbound tab? |
| **D9** | Org/role default pin templates — ship or defer? |
| **D10** | Bottom Sheets-style tab bar — ever? |
| **D11** | True custom tables via Plus — never / Studio-only / enterprise-only / later Horizon C? |
| **D12** | Rename Plus / popover copy — required before catalog growth? |
| **D13** | Column prefs: keep shared `tableId` across embed + full desk, or split buckets? |
| **D14** | Maximum Band-1 vocabulary for a floor-trained tenant (system + pinned)? |

---

## 7. Required report shape

Return markdown with these sections **in order**:

1. **Executive ruling** (≤12 lines): keep Unbox pin pattern? grow / freeze / kill? one sentence on Sheets analogy.
2. **Industry survey** — named systems + citations; patterns for multi-collection workspaces.
3. **Pattern taxonomy** — map industry names → Cycle Forge hosts (Band-1 / left rail / saved views / Home / full desk).
4. **KEEP / KILL / EVOLVE table** for C1–C14 with ROI scores.
5. **Forced decisions D1–D14**.
6. **90-day plan** — at most 5 engineering slices, ordered, each ≤1 week of focused work; say what **not** to build.
7. **Anti-roadmap** — features that look “Sheets/Airtable complete” but fail floor ROI for this product.
8. **Open risks** — training fragmentation, dual front doors, Band-1 overflow, Plus misread.

Tone: decisive. Prefer “do X; do not do Y” over balanced essays. Prefer 2024–2026 primary sources. Prefer sellable multi-tenant ops SaaS over internal-tool folklore.

---

## 8. Paste-ready handoff (for the human)

Copy everything **below this line** into Gemini Deep Research (or Gemini Pro with browsing). Do not attach the repo.

---

You are advising Cycle Forge, a multi-tenant B2B reseller/warehouse-ops SaaS (not an internal tool; USAV is only dogfood). We just shipped: on the Unbox scan station’s workbench tab strip, a leading Plus opens a small popover to **pin the Inbound Pipeline data table** onto Unbox so operators need not navigate to `/incoming`. Pins are per-staff prefs; the embed reuses the same grid engine and column prefs as the full Inbound desk; row detail stays a pushing right rail; resume-to-scan Unbox CTA stays. System tabs Urgent/Recent/Queue/All/History remain; Inbound is catalog-only until pinned. We explicitly did **not** build custom tables, Home hosting, or Docked-in-Unbox.

Read the full research briefing titled “industry standard for importable / pinned high-velocity tables in B2B ops SaaS” (provided in the same prompt / document). Follow its method, scoring, closed-forever list, Q1–Q7, C1–C14, and D1–D14. Return the required report shape. Cite named systems (Linear, Stripe, Salesforce, Airtable Interfaces, Notion linked views, Sheets, at least one WMS/fulfillment UI, etc.) with 2024–2026 sources where possible. Decide what we should **keep, evolve, or kill** as this “import list onto station” pattern grows. Do not recommend becoming Airtable or putting spreadsheet tabs into the scanner column.
