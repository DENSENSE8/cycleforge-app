# Research briefing — Scan-station right rail vs desk-table right rail: separation, sharing, and long-run design principles

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-08-09
**Subject:** For a dense B2B **warehouse / fulfillment ops SaaS**, what is the **2024–2026 industry-standard** way to structure **two different right-edge jobs** — (A) a **scan-station tool column** beside an active carton/work procedure, and (B) a **desk record inspector** beside a spreadsheet triage table — and when (if ever) should those jobs share one host, share only presentational primitives, or be **fully separated**?
**Status:** ANSWERED 2026-08-09 — winner **C2 (Thin Waist)**. Constitution folded into
[`.claude/rules/source-of-truth.md`](../../.claude/rules/source-of-truth.md) → **Scan vs desk
right-edge — C2 thin waist** and [`.claude/rules/display/right-rail-inspector.md`](../../.claude/rules/display/right-rail-inspector.md).
**Primary surfaces (empirical, not law):**
1. Scan station (example: receiving “Unbox”) — center = scan/procedure work; right = tool/reference column.
2. Desk triage (example: outbound “To ship” orders table) — center = dense table; right = selected-row record inspector.

**Hard framing rule for your answer:** Compare and contrast **only against industry standards** (named products, design-system docs, WMS/RF practice, citable UX research). Close gaps against those standards. **Do not** invent, cite, defend, or reconcile against this product’s internal design constitution, region contracts, “source of truth” files, AGENTS rules, Kinetic Ledger slogans, or house naming systems. Treat §2 measured layout facts as **empirical current state** an engineer observed — not as rules you must preserve. Your output will be used **to rewrite those house rules**; treating them as constraints defeats the brief.

---

## 0. Method — read before answering

### 0.1 Your job (four deliverables — keep separate)

1. **Industry pattern survey (2024–2026).** How do mature WMS / 3PL / marketplace seller / pack-station / helpdesk / B2B ops products separate **floor scan / workstation UIs** from **desk queue + inspector UIs**? Name products. Cite primary sources. State the **dominant pattern** and the conditions under which minority patterns win.
2. **Sharing taxonomy.** For right-edge UI specifically, classify what industry treats as safe to share vs dangerous to merge:
   - Design tokens / primitives (button, type, focus)
   - Presentational patterns (index→leaf navigator, fact rows, sticky back)
   - Smart hosts (one component with `mode=` / `plane=` / `context=` flags)
   - Domain services / APIs / status models
   Score each layer: **Share · Fork when divergent · Never share**.
3. **Candidate architectures scored against this product shape.** Score the candidates in §0.3. Pick one default for **sellable warehouse-ops SaaS on ~1080p desk + wedge scanners**, with defended conditions for switching.
4. **Constitution rewrite pack (industry language only).** Exact **design principles** (not house jargon) this product should adopt, each with: principle name · one-sentence rule · who ships it · acceptance criterion an engineer can verify on both a scan station and a desk table. These principles are intended to **replace** prior internal wording — write them so they stand alone.

### 0.2 What this brief is NOT

- Not “merge everything into one right rail for DRY.”
- Not “duplicate every pixel with zero shared primitives.”
- Not a visual skin / brand exercise.
- Not reconciliation against internal house law (that is the *consumer* of your answer).
- Not RF hardware procurement or mobile-app build estimates.
- Not whether tabs vs rows is better inside a single rail (covered elsewhere) — focus on **host separation vs unification**.

### 0.3 Candidate architectures (score all)

| ID | Candidate | One-line |
|---|---|---|
| **C1** | **One unified right-edge host** | Same shell, resize, dismiss, and nav grammar for scan tools and desk inspectors; content varies by route |
| **C2** | **Two hosts, thin shared presentational waist** | Separate scan-tool column vs desk inspector shell; share only dumb pieces (index list layout, leaf back band, tokens) |
| **C3** | **Two hosts, zero UI sharing** | Completely independent right-edge implementations; share only domain APIs / design tokens |
| **C4** | **Role-split apps** | Separate “floor terminal” app and “desk admin” app (different deployables), same backend |
| **C5** | **Desk inspector is a full page; scan tools stay a side column** | Asymmetric: table selection navigates to a detail route; stations keep a persistent tool pane |

Score 1–5 on each axis; report a table. No sixth axis.

| Axis | Meaning |
|---|---|
| **Job clarity** | Operator can tell “I’m mutating the active carton” vs “I’m inspecting a queue row” without reading docs |
| **Evolution independence** | Scan UX can change without regressing desk triage (and reverse) |
| **Coordination cost** | Cost of keeping shared layers coherent across callers (flags, meetings, breakages) |
| **Cognitive consistency** | Enough sameness that muscle memory transfers where jobs are actually similar |
| **Sellable density** | Survives wedge scanning, ~720px locked middle, multi-hour desk triage — not marketing whitespace |

**ROI ≈ (Job clarity × Evolution independence × Sellable density × Cognitive consistency) / (6 − Coordination cost).** Rank C1–C5 descending. State the winner and the runner-up’s “win conditions.”

### 0.4 Sources to cover (minimum)

| Class | Named examples (start here; expand with 2024–2026) | Use for |
|---|---|---|
| **WMS floor vs office** | Custom WMS “worker scan app + manager dashboard” case studies; ShipStation / ShipBob / Extensiv / ShipHero admin vs packing workflows; Blue Yonder / Manhattan / Körber operator UX notes where public | Role-split shells |
| **SAP-class RF vs desktop** | SAP EWM RF Framework vs warehouse monitor / Fiori desktop; presentation device profiles | Intentional presentation split, shared business logic |
| **Pack / scan stations** | Public pack-station redesign case studies (NetSuite pack, parcel fulfillment UX writeups) | Tool column beside work surface |
| **Desk master–detail / inspectors** | Shopify Polaris Sheet/IndexTable; IBM Carbon SidePanel/Tearsheet; Fluent Panel; Linear issue panel; Notion side peek; Stripe Dashboard drawers; Salesforce record panels | Desk inspector grammar |
| **Frontend reuse theory** | “DRY is not for UI”; Feature-Sliced Design shared vs feature UI; critiques of over-shared component libraries (coordination cost > duplication cost) | When sharing becomes debt |
| **Research heuristics** | Nielsen Norman (side panels, progressive disclosure, modes); Don Norman mapping / mode errors; WCAG 2.2 landmarks & focus for panels vs dialogs | Principles, not product clones |

Where industry splits, give **both** positions, the conditions each wins under, then pick a default for **this** shape (§1).

### 0.5 Related briefs in this repo (cite, do not redo)

These exist in `docs/todo/`. Use them only to avoid re-answering settled *adjacent* questions. **Ignore any house-law sections inside them.**

| Brief | Already owns (industry angle) |
|---|---|
| `right-rail-ds-principles-2026-GEMINI-RESEARCH-BRIEFING.md` | Broad DS principle catalog for right edges — you may narrow, not restart |
| `to-ship-triage-rail-vs-lifecycle-tabs-GEMINI-RESEARCH-BRIEFING.md` | **Left** rail vs lifecycle tabs on desk (different edge) |
| `detail-surface-IA-GEMINI-RESEARCH-BRIEFING.md` | Slide-over vs dedicated page (asymmetric C5 territory) |
| `dashboard-inline-detail-editing-GEMINI-RESEARCH-BRIEFING.md` | Desk order inspector modality fights |
| `carton-inspector-ux-GEMINI-RESEARCH-BRIEFING.md` | Read-only carton dossier job (not scan tool column) |
| `unbox-station-scan-vs-lookup-GEMINI-RESEARCH-BRIEFING.md` | Scan vs lookup modes in station centre |

Your unique job: **two right-edge jobs — separate or unify — under industry principles**, with a constitution-ready principle pack.

---

## 1. Product context (facts only — not design law)

**Cycle Forge** is multi-tenant **reseller-operations SaaS** (used-goods / electronics refurb is the first dogfood tenant). Frame recommendations as **sellable B2B warehouse/fulfillment software**, not a five-person shop tool.

Operators do two recurring jobs that both use a **right-edge plane**:

| Job | Typical user posture | Main surface | Right-edge intent |
|---|---|---|---|
| **A. Scan station** | Standing/sitting at a bench with a wedge barcode scanner; hands alternate between carton and keyboard | Active procedure: lines, capture steps, print/receive | Open tools & reference for the **active entity** (ticket, photos, linkage, inventory dossier) without leaving the procedure |
| **B. Desk triage** | Seated at a monitor with mouse + keyboard; multi-hour queue work | Dense virtualized table of many records | Inspect / lightly edit the **selected row** while keeping the queue visible; walk ↑↓ through rows |

Same company, same domain data (orders, cartons, tickets, inventory). Different interaction planes, density budgets, and failure modes (a missed Esc on the floor can close work; a shared flag can regress the other job).

---

## 2. Measured current anatomy (verified from source 2026-08-09)

You may not have the repo open. Treat this as ground truth. Do not invent additional chrome.

### 2a. Scan station (Job A) — empirical

```text
┌─ Global header ──────────────────────────────────────────────────────────┐
├─ Optional left context ─┬─ Center (~locked ~720px work) ─┬─ Right column ┤
│                         │ Identity / lines / procedure     │ Tool column   │
│                         │ Dock / scan capture              │ (push in-flow)│
│                         │                                  │ Index OR leaf │
│                         │                                  │ Filter footer │
│                         │                                  │ Edge open/close│
└─────────────────────────┴──────────────────────────────────┴──────────────┘
```

Observed behaviors (names are descriptive, not law):

- Right column is an **in-flow push** invader (center stays; width trades).
- Navigation inside the column is **index of topics → one leaf** (not a permanent horizontal topic plate).
- Open/close is an **edge toggle** with station-specific keyboard chord.
- Esc tends to **pop navigation** (leaf → index → close column), not “park a desk inspector.”
- Content is **tools for the active carton/line** (photos, linkage, ticket, etc.), not a general queue dossier.

Implementation pointers (for agents with a repo — Gemini may treat as labels): shared stage body for index/leaf; station-specific push column + filter footer + edge toggle.

### 2b. Desk triage (Job B) — empirical

```text
┌─ Global header ──────────────────────────────────────────────────────────┐
├─ Left context rail ─┬─ Main: table + stage chrome ─┬─ Right inspector ───┤
│                     │ Dense grid / queue             │ Record peek        │
│                     │ Band: find / filters / KPI     │ Chrome: close · ↑↓ │
│                     │                                │ Index OR leaf      │
│                     │                                │ Update / delete floor│
└─────────────────────┴────────────────────────────────┴────────────────────┘
```

Observed behaviors:

- Right panel is also an **in-flow push** occupant of a **desk right-rail host** (shared slot with AI assistant — detail outranks).
- Chrome includes **queue prev/next** and a close that **parks** the inspector; Band 3 can Show/Hide inspector.
- Keyboard chords for park/reopen **differ** from the station edge toggle.
- Navigation recently moved toward the **same index→leaf visual pattern** as the station, via a **desk adapter shell** over a **shared presentational stage** (index list + leaf body layout).
- Esc from a leaf returns to the topic index; it does **not** necessarily park the rail.
- Content is **record inspection / light edit** for the selected table row (shipping + product stacked, documents, timeline, conversation, etc.).

### 2c. Sharing that already exists (empirical coupling)

Today the two jobs **do not** share one host. They **do** share:

- Design-system tokens / flush host padding tokens
- A presentational **index→leaf stage** component (list + stage flex)
- Index row model types
- Domain APIs / status machines (same warehouse facts)

They **do not** share:

- Push-column resize storage keys / edge toggle / filter footer
- Desk chrome row / inspector action floor / rail occupancy store
- Operator copy and keyboard chords

**Question for you:** Is this “two hosts + thin waist” the industry default for long-run health, or should the waist also be forked (C3), or should hosts merge (C1)?

---

## 3. Research questions (answer all)

### Q1 — Dominant industry pattern

In 2024–2026 WMS / fulfillment / ops SaaS, what is the dominant way to split **floor workstation UI** from **desk queue UI**?

- Same SPA, different page shells?
- Separate apps?
- Same shell, different panels?
Cite ≥5 named systems or case studies.

### Q2 — Mode-error risk

When one UI component serves both “mutate active work” and “inspect selected queue row,” what documented UX failure modes appear (mode errors, Esc meaning, focus traps, density mismatch)? Cite NN/g or equivalent.

### Q3 — What is safe to share

Produce the Share / Fork / Never-share table for: tokens · presentational index list · visit-history stacks · dismiss chords · occupancy with AI · domain status transitions · leaf content modules.

### Q4 — Flag smell

At what point does a shared “right rail” with `mode` / `plane` / `context` props become architectural debt by industry frontend standards? What public postmortems or essays describe this?

### Q5 — Desk asymmetry

When is industry standard for desk triage a **side inspector** vs a **full detail route** (C5)? Under what queue density / edit depth does each win?

### Q6 — Propagation expectation

Product owners sometimes expect “upgrade the golden station rail once → every desk inspector updates.” Under industry reuse principles, when is that expectation **correct**, and when is it a **misapplication of DRY to use-case UI**?

### Q7 — Constitution-ready principles

List **8–15 principles** in industry vocabulary (e.g. “separate interaction planes for scan work vs queue inspection”) that a product constitution should adopt. Each must be falsifiable on the two surfaces in §2. **Do not** use this product’s internal nouns as principle names unless you also give a portable synonym.

---

## 4. Constraints that are product facts (not house taste)

These are physical / market constraints. Recommendations must survive them; they are not “our design system said so.”

1. **Wedge barcode scanners** type into the focused field / page as keyboard bursts — bare digit hotkeys and focus theft are dangerous on stations.
2. Operators work on **~1080p–1440p** monitors; scan stations often keep a **narrow fixed middle** work column.
3. Desk triage sessions are **hours long**; queue context must remain visible while inspecting.
4. Product is **multi-tenant sellable SaaS**, not a single-warehouse custom build — patterns must not assume one site’s RF fleet.
5. Same **domain ledger** (inventory, status, tickets) backs both jobs — duplicating business rules is worse than duplicating chrome.

---

## 5. Deliverable format (mandatory)

```markdown
# Scan vs desk right-edge — industry research

## Executive verdict
Winner among C1–C5 · one paragraph · when to switch

## Score table
| Candidate | Job clarity | Evolution independence | Coordination cost | Cognitive consistency | Sellable density | ROI |

## Industry survey
### Floor / workstation vs desk
### Desk inspector vs detail page
### Reuse / DRY lessons for UI

## Sharing taxonomy
| Layer | Share / Fork / Never | Why | Citations |

## Answers to Q1–Q7
…

## Constitution rewrite pack (industry principles only)
| # | Principle | Rule (1 sentence) | Who ships it | Acceptance check (station) | Acceptance check (desk) |

## Gaps vs measured current state (§2)
What to keep · what to fork · what to stop sharing — without citing internal laws

## Ask-first
Only if a recommendation needs a product decision not decidable from industry + §2–§4
```

---

## 6. Closed forever for *this research* (do not recommend)

These are out of scope for the briefing’s *deliverable*, not eternal product bans:

- Rewriting the entire app as two native mobile apps in this research cycle
- Replacing the domain status machine
- Visual rebrand / marketing site work
- Inventing a third permanent right column for AI beside both jobs without addressing occupancy

You **may** recommend C4 (role-split apps) as a long-horizon industry pattern with phased conditions — label it horizon, not next sprint.

---

**End of briefing.** Prefer primary sources dated 2024–2026. Prefer named products over anonymous “best practice.” When industry splits, show both sides, then pick for §1’s two-job shape. Your principles will **replace** prior internal wording — write them to stand alone.
