# Research briefing — History desk inspector DS upgrade + single-row table actions (delete · copy · export · more)

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-08-09
**Subject:** For a dense B2B **warehouse / fulfillment ops SaaS**, what is the **2024–2026 industry-standard** anatomy of a **desk queue side inspector** opened by selecting **exactly one** spreadsheet row — including (A) chrome density / identity / action floor, (B) where **destructive delete** belongs, and (C) the full catalog of **row + table manipulation** verbs (copy · export · delete · print · open-elsewhere · column layout · bulk) and which altitude each verb must live at?
**Status:** OPEN — research to **rewrite the History peek contract** and a **single-row action taxonomy**. Not an implementation plan.
**Primary surface (empirical):** Unbox History workbench — dense receiving-lines grid + right **inspector** (`detail:history`) when one carton/row is selected.
**Operator complaint (verbatim job):** The History right panel feels inconsistent / low-quality vs 2026 DS norms; the tall identity band (icon + large PO number) is redundant with queue context; there must be a **delete control at the bottom of the right panel when exactly one row is selected**; column/table layout editing must have a clear home; copy / export / and related manipulations need an industry-standard placement map.

**Hard framing rule for your answer:** Compare and contrast **only against industry standards** (named products, design-system docs, WMS/ops admin practice, citable UX research). Close gaps against those standards. **Do not** invent, cite, defend, or reconcile against this product’s internal design constitution, region contracts, “source of truth” files, AGENTS rules, Kinetic Ledger slogans, or house naming systems. Treat §2 measured layout facts as **empirical current state** an engineer observed — not as rules you must preserve. Your output will be used **to rewrite those house rules**; treating them as constraints defeats the brief.

---

## 0. Method — read before answering

### 0.1 Your job (five deliverables — keep separate)

1. **Industry pattern survey (2024–2026).** How do mature B2B ops / WMS admin / helpdesk / marketplace-seller products structure a **queue table + single-row side inspector**? Name products. Cite primary sources. State the dominant pattern for: header chrome height, whether a large identity hero is kept once the row is selected, sticky bottom action floors, and destructive delete.
2. **Single-row action taxonomy.** Produce a Share / altitude table for every verb class in §0.3. For each verb: **where it lives** (inspector floor · inspector More · leaf body · Band/toolbar bulk bar · View/column rail · dialog confirm · never) · **when it appears** (0 / 1 / 2+ selection) · **confirm modality** · **permission / audit expectation**.
3. **Candidate inspector anatomies scored.** Score the candidates in §0.4 against this product shape (~1080p desk, hours-long triage, barcode wedge on sibling stations, multi-tenant sellable SaaS). Pick a default. State runner-up win conditions.
4. **Constitution rewrite pack (industry language only).** Exact design principles (portable names) this product should adopt for **History-class desk peeks**, each with: principle name · one-sentence rule · who ships it · acceptance check on History with 0 / 1 / 2+ rows selected.
5. **Gaps vs measured current state (§2).** What to keep · what to cut · what to add (especially bottom delete for n=1) — without citing internal laws.

### 0.2 What this brief is NOT

- Not “merge Station Displays into the desk inspector.”
- Not “build Airtable / Google Sheets as the product.”
- Not a full Workbench table-engine redesign (column types, virtualization, custom fields fan-out).
- Not Station Action-plane chrome (scan tools).
- Not whether push vs float is law (treat push as measured fact in §2; you may still judge industry modality).
- Not a visual brand / marketing exercise.

### 0.3 Verb classes you must place (minimum)

Every row needs an altitude ruling. Add rows only with evidence.

| Verb class | Examples |
|---|---|
| **Inspect / navigate** | Open topic leaf · Back to index · ↑↓ next/prev queue row · park/hide inspector |
| **Identity / copy** | Copy PO# · copy tracking · copy serial · copy last-8 · “copy all identifiers” |
| **Open elsewhere** | Open in Unbox / station · open external PO · open carrier tracking · open ticket |
| **Print / label** | Print product label · print packing slip (if applicable) |
| **Mutate record** | Edit notes · flag / urgent · link/pair PO · change status via lifecycle |
| **Destructive** | Delete carton / line / record (single) · archive / void |
| **Export / share** | Export selected row CSV/JSON · export filtered view · share link / deep link |
| **Sheet layout** | Column visibility (▦) · column order · density · paint/zebra · compare/drill mode · zoom |
| **Bulk (n≥2)** | Bulk flag · bulk assign · bulk export · bulk delete · compare |
| **Empty (n=0)** | View-only sheet controls · empty select-a-row state |

### 0.4 Candidate inspector anatomies (score all)

| ID | Candidate | One-line |
|---|---|---|
| **H1** | **Hero identity + More + no floor** | Tall icon/status/ID/primary CTA band; destructive buried in More; no sticky bottom |
| **H2** | **Chrome-only + index→leaf + sticky Macro floor** | Park/↑↓ chrome; no hero ID; topics index; sticky bottom with primary + flush Delete (n=1 only) |
| **H3** | **Chrome + slim key row + floor** | One caption-density key (no icon hero) + sticky floor |
| **H4** | **Full detail route on row click** | Table selection navigates away; no side inspector |
| **H5** | **Table-only actions (no inspector floor)** | All mutate/delete/export live on a Sheets-like selection toolbar above the grid; inspector is read-only |

Score 1–5 on: **Job clarity** · **Triage speed** · **Destructive safety** · **Cognitive consistency with sibling peeks** · **Sellable density** · **Coordination cost**.  
**ROI ≈ (Job clarity × Triage speed × Destructive safety × Sellable density × Cognitive consistency) / (6 − Coordination cost).** Rank H1–H5.

### 0.5 Sources to cover (minimum)

| Class | Named examples (start here; expand 2024–2026) | Use for |
|---|---|---|
| Design systems — panels / selection | Shopify Polaris IndexTable + Sheet · IBM Carbon DataTable / SidePanel / Tearsheet · Fluent 2 Panel · Material 3 side sheets · Atlassian drawers | Selection→panel, bulk bars, delete confirm |
| Ops / productivity | Linear issue panel · Notion side peek · Stripe Dashboard drawers · Salesforce record panels · Retool Table | Inspector floors, copy, export |
| Spreadsheet / hybrid | Google Sheets / Excel Online selection bars · Airtable record detail + bulk | Export / copy altitudes — when NOT to clone |
| WMS / fulfillment admin | ShipStation / ShipBob / Extensiv / ShipHero admin peeks (public docs/demos) | Warehouse desk delete / print / open-station |
| Research | NN/g side panels · progressive disclosure · destructive actions · mode errors · WCAG 2.2 target size / focus | Safety of bottom Delete · Esc meanings |

Where industry splits, give **both** positions, win conditions, then pick for §1’s History-class desk.

### 0.6 Related briefs in this repo (cite, do not redo)

| Brief | Already owns |
|---|---|
| `right-rail-ds-principles-2026-GEMINI-RESEARCH-BRIEFING.md` | Broad right-edge DS principle catalog — **narrow** to History + action taxonomy; do not restart |
| `scan-vs-desk-right-rail-separation-GEMINI-RESEARCH-BRIEFING.md` | Host separation C2 (Station Displays ≠ desk inspector) — **closed winner**; do not re-litigate hosts |
| `grid-industry-actions-GEMINI-RESEARCH-BRIEFING.md` | In-grid spreadsheet actions portfolio — cite for bulk/highlight; **this brief owns inspector-floor + altitude map** |
| `table-action-bar-fields-GEMINI-RESEARCH-BRIEFING.md` | Fields/column altitude vs Band chrome — cite; do not reopen Fields home fight except as it touches ▦ in History View |
| `detail-surface-IA-GEMINI-RESEARCH-BRIEFING.md` | Side inspector vs full page (H4 territory) |
| `dashboard-inline-detail-editing-GEMINI-RESEARCH-BRIEFING.md` | Desk order inspector modality |
| `carton-inspector-ux-GEMINI-RESEARCH-BRIEFING.md` | Read-only carton dossier job (not History triage peek) |
| `ops-table-simplification-GEMINI-RESEARCH-BRIEFING.md` | Table skin / selection models |

Your unique job: **History-class single-row inspector anatomy + the full verb altitude map (delete/copy/export/…)** under industry principles.

---

## 1. Product context (facts only — not design law)

**Cycle Forge** is multi-tenant **reseller-operations SaaS** (used-goods / electronics refurb is the first dogfood tenant). Frame recommendations as **sellable B2B warehouse/fulfillment software**.

Operators on **Unbox History** do desk triage:

| Job | Posture | Centre | Right edge |
|---|---|---|---|
| Browse / filter cartons | Seated, mouse + keyboard, hours | Dense virtualized receiving-lines table | Parked or View-only sheet chrome |
| Inspect one carton | Same | Table keeps selection | Side inspector: topics + light actions |
| Act destructively / print / open station | Same | Selection stays | Need obvious, safe controls without hunting More menus |

Same domain carton as the Unbox **scan station**, but this surface is **Context plane triage**, not floor capture. Physical wedge scanners are less central here than on Unbox, but operators still bounce Station ↔ History in one shift — copy and open-elsewhere must not invent a second identity system.

---

## 2. Measured current anatomy (verified from source 2026-08-09)

Treat as ground truth. Do not invent chrome.

### 2a. History inspector stack (Job: single-row peek)

Implementation pointer: `src/components/receiving/history/HistoryCartonTriagePanel.tsx` (`detail:history` on `RightRailHost`).

```text
┌─ DeskRailChromeRow ─────────────────────────────────────────┐
│ [→|] park ………………………………… [↑] [↓] queue walk              │
├─────────────────────────────────────────────────────────────┤
│ [sliders] View toggle …………………………………                  │
│ (optional) View cluster: paint · drill · compare · zoom · ▦ │
├─────────────────────────────────────────────────────────────┤
│ TALL IDENTITY (observed pain)                               │
│ [box icon] [RECEIVED]  PURCHASE ORDER #                     │
│            large last-8 ……………… [Print] [⋮]                 │
├─────────────────────────────────────────────────────────────┤
│ DeskInspectorIndexShell — topic index                       │
│   VERIFICATION → Details                                    │
│   ASSETS → Evidence                                         │
│   CONTEXT → Logistics · History                             │
│ Leaf bodies: fact rows / photos / audit …                   │
├─────────────────────────────────────────────────────────────┤
│ (no sticky InspectorActionFloor / no bottom Delete today)   │
└─────────────────────────────────────────────────────────────┘
```

Observed behaviors:

- Right panel is an **in-flow push** desk inspector (shares AI slot; detail outranks).
- Navigation inside is **index → leaf** (shared presentational stage with Station Displays).
- **Primary CTA (Print) + More** live on the tall identity band — not on a sticky floor.
- **No bottom delete** on History today.
- View / column display (▦) lives under the **View** cluster when toggled — not on the park/↑↓ chrome row.
- View-only shell (no row): identity + Display/Edit omitted; View strip can force-open for sheet layout.

### 2b. Sibling peeks that already have a bottom floor (empirical asymmetry)

These mount a sticky Macro-style floor with flush trailing Delete when a single record is open:

| Peek | Pointer |
|---|---|
| Desk order (`detail:order`) | `OrderUpdateDock` → `InspectorActionFloor` + `InspectorFlushDelete` |
| Incoming | `IncomingDetailsPanel` → same floor primitives |
| Bin / SKU | `BinDetailFlyout` / `SkuDetailView` → same |

History is the **outlier**: triage topics without the floor pattern Orders/Incoming already use.

### 2c. Selection cardinality (Orders family — empirical pattern to judge)

Orders desk resolves 0 / 1 / 2 / 3+ into different right occupants (inspect · compare · batch). History today is primarily **0 (view-only / parked) vs 1 (peek)**; multi-select batch for receiving may exist separately — verify before assuming History has a batch body.

### 2d. Operator-stated upgrades (product intent — not yet law)

1. Remove redundant **icon + large PO number** identity (queue already shows context).
2. Fix **inconsistent header row heights** vs rest of desk inspectors.
3. Add **Delete at bottom of right panel when exactly one table row is selected**.
4. Clarify **column display** home (View strip vs own row vs top chrome).
5. Define industry-complete **copy / export / delete / …** placement so the panel stops feeling like an ad-hoc dump.

**Question for you:** What is the industry-default anatomy (H1–H5) and the verb altitude map that makes this peek feel like a 2026 sellable ops product?

---

## 3. Research questions (answer all)

### Q1 — Dominant single-row inspector anatomy

In 2024–2026 B2B ops SaaS, once a queue row is selected, do side inspectors keep a **hero identity** (icon + large ID), a **slim key**, or **no identity** (facts only in body)? Cite ≥5 systems. When does a sticky **bottom action floor** win over header CTAs?

### Q2 — Destructive delete altitude

Where does industry put **Delete** for a single selected record: bottom floor · header · More menu · table bulk bar · separate settings page? What confirm pattern is standard (inline · dialog · type-to-confirm)? When must Delete **disappear** (n=0, n≥2, insufficient permission, terminal status)?

### Q3 — Copy vs export vs share

Separate **copy identifier** (clipboard, last-8 / full), **export** (file download of row or view), and **share/deep-link**. Which belong in the inspector vs the table toolbar? Cite systems that get this wrong (overloaded “Share”).

### Q4 — Print / open-elsewhere

Print label and “Open in station / Unbox” are warehouse-specific. What is the closest industry analogue (pack station handoff, RF terminal open, “open in app”)? Should they be primary floor CTAs, header, or More?

### Q5 — Sheet layout (columns · paint · compare)

Should column visibility / export-view / density live **inside the selected-row inspector**, on a **View-only right occupant**, or on a **table-proximal bar**? Reconcile with modern IndexTable / Carbon / Sheets practice without redoing the Fields-altitude brief — give the History-specific ruling only.

### Q6 — Multi-select interaction with the inspector

When selection goes from 1 → 2+, does industry **replace** the inspector with a bulk panel, **keep** the last row’s peek, or **close** the peek? How does that interact with bottom Delete (single vs bulk delete)?

### Q7 — Constitution-ready principles

List **8–15** principles in industry vocabulary for History-class peeks + single-row actions. Each must be falsifiable with 0 / 1 / 2+ rows selected on History. Portable names (no house jargon as principle titles unless you also give a synonym).

---

## 4. Constraints that are product facts (not house taste)

1. Operators work on **~1080p–1440p** monitors; History sessions are **hours long**; queue context must remain visible while inspecting.
2. Product is **multi-tenant sellable SaaS** — delete/export must be permission-gated and auditable; no folklore shortcuts for one warehouse.
3. Status / lifecycle changes are **ledger transitions**, not casual cell overwrites of a “status” string.
4. Same carton exists on a **scan station** (Unbox) — “Open in Unbox” is a real handoff, not a vanity link.
5. AI assistant and record detail **compete for one right-edge slot** in measured UI — recommendations must not require a permanent dual-right layout.
6. Physical wedge scanners dominate Station; History is mouse/keyboard-first — still avoid bare-digit hotkeys that would train bad muscle memory across the shift.

---

## 5. Deliverable format (mandatory)

```markdown
# History desk inspector + single-row table actions — industry research

## Executive verdict
Winner among H1–H5 · one paragraph · when to switch

## Score table
| Candidate | Job clarity | Triage speed | Destructive safety | Cognitive consistency | Sellable density | Coordination cost | ROI |

## Industry survey
### Single-row side inspector anatomy
### Destructive delete patterns
### Copy · export · share altitudes
### Sheet layout vs record peek

## Verb altitude map (mandatory table)
| Verb class | Altitude | Visible when | Confirm | Notes | Citations |

## Answers to Q1–Q7
…

## Constitution rewrite pack (industry principles only)
| # | Principle | Rule (1 sentence) | Who ships it | Acceptance (n=0) | Acceptance (n=1) | Acceptance (n≥2) |

## Gaps vs measured current state (§2)
What to keep · what to cut (hero identity?) · what to add (bottom Delete?) · column display home

## Ask-first
Only if a recommendation needs a product decision not decidable from industry + §2–§4
```

---

## 6. Closed forever for *this research* (do not recommend)

- Mounting Station Displays push stack inside the History `RightRailHost` card
- Dual permanent right columns (AI + History) without addressing occupancy
- Adopting a foreign grid shell (AG Grid / MUI DataGrid / Handsontable) as the History table
- Tenant-authored arbitrary schemas / “Airtable as product” in this cycle
- Soft pill / marketing chrome as the ops default
- Making History a full-page detail route as the *only* path without scoring H4 honestly (you may still pick H4 with conditions)

You **may** recommend a phased move from H1 → H2/H3 and a separate View-only occupant for ▦ — label horizon vs next sprint.

---

**End of briefing.** Prefer primary sources dated 2024–2026. Prefer named products over anonymous “best practice.” When industry splits, show both sides, then pick for §1’s History-class desk. Your principles will **replace** prior internal wording for this peek — write them to stand alone.
