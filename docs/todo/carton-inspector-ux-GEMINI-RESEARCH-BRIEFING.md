# Research briefing — the carton read view: what a warehouse "look it up" surface should actually be

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-07-29
**Subject surface:** `/carton/[id]` — a read-only carton record shipped 2026-07-28 as Phase 4 / decision D4 of the [scan-vs-lookup plan](unbox-station-scan-vs-lookup-GEMINI-RESEARCH-BRIEFING.md).
**Status:** functionally correct, **rejected on UX by the product owner on sight.** This brief exists to decide what it should have been.

**Deliverable:** (a) a benchmark of read-only record surfaces in scanner-driven warehouse operations against named 2026-era systems and standards; (b) a defended verdict on **eight decisions** (§7), including the one that says this surface should not exist; (c) answers to §8 with sources.

---

## 0. How to use this brief

You do **not** have the codebase. Everything below was measured out of the running app today, at stated viewports, against real dogfood data. Numbers are literal browser measurements, not estimates. Where something is inferred it is labeled **(inferred — verify)**.

Three deliverables, kept separate:

1. **What is industry standard (2026)** for the "inspect a past record" surface that sits beside a scanner-driven station. Name real systems (WMS/WES vendors, 3PL platforms, parcel-hub tooling, field-service and asset-tracking apps), standards (GS1, ISO 9241-related guidance, WCAG where it constrains density), and published operator-UX research. State the conditions under which each pattern wins. Do not retreat into "it depends."
2. **Take a side on each decision in §7.** Each states our current behavior, the strongest counter-argument we can build against ourselves, and — where relevant — an admission that we already violated our own written law. Attack both sides.
3. **Answer §8's open questions** with sources.

The reader is the engineer who will rebuild this surface. Prefer a concrete layout specification and named trade-offs over a decision framework.

**One meta-instruction:** the previous brief in this series produced a verdict ("yes to a read-only CartonInspector, defensible as CQRS-shaped UI **provided both shells compose the same dumb primitives**") that we implemented faithfully — and the result is what the product owner called terrible. §5 argues that verdict's condition may itself be the cause. Treat your own prior reasoning as a suspect, not a premise.

---

## 1. Product, region vocabulary, and the house visual identity

**Cycle Forge** is multi-tenant reseller-operations SaaS for used-goods resellers; electronics refurb/resale is the dogfood tenant. One warehouse, a small crew, mixed roles — the same person unboxes inbound cartons in the morning and packs outbound orders in the afternoon. Screens are 1440–1920px desktop at a bench, plus phones on the floor.

Every UI **region** is classified into exactly one of four contracts, enforced in code (`pickArchetype()`):

| Contract | Driven by | Job | Selection | Density |
|---|---|---|---|---|
| **Station** | barcode scanner / wedge | act-and-clear | ephemeral, never URL | `floor` |
| **Workbench** | pointer | pick a record → edit → persist | durable, URL-addressable | `ops` |
| **Monitor** | filters over a stream | observe only, zero edit | none (filters only) | `rollup` |
| **Canvas** | pan/zoom/focus | reshape a definition | durable focus in URL | `studio` |

The house **visual identity** is named and written down — "Kinetic Ledger":

> Data-first reseller ops: dense, state-colored, scan-aware, multi-tenant.
> **Legible throughput** over document calm. Calm chrome (Linear discipline), **not document-IA as the product shape.**
> Always ban: **random card soup**, nested cards-as-rows, a second visual language.

Density modes are explicit: `floor` (station, one focus surface, big pass/fail), `ops` (**dense rows, dividers, inline actions**), `rollup` (**more air, KPI heroes, named zones**), `studio`.

**Hold that distinction.** §4 shows the surface we shipped declares `ops` in its own source comment and renders `rollup`.

---

## 2. The operator task this surface is supposed to serve

The originating complaint, verbatim from the prior brief: *staff scan a tracking number to look up a box that was received and unboxed weeks ago.* On the Unbox bench a scan is a **write**, so inspection was indistinguishable from work — a lookup silently re-attributed the original unboxer's name to whoever last looked.

Phase 2 (shipped, verified) fixed the **data** half: an Unbox scan landing on a carton with `unboxed_at` set is classified `lookup`, writes only an append-only `RECEIVING_LOOKUP_SCAN` ops event, and leaves `scanned_by` alone. The operator gets a big "Already unboxed" receipt card instead of the editor.

Phase 4 — this brief's subject — was supposed to fix the **display** half: give that operator somewhere to actually *look*.

### What the operator is actually asking

Observed and inferred intents behind "scan a finished box," in rough frequency order **(inferred — verify with your own research on receiving-desk task taxonomies)**:

1. **"Did we already do this one?"** — a yes/no. Often the whole question.
2. **"What was in it / what condition?"** — contents and grade.
3. **"Who handled it and when?"** — attribution, usually for a dispute or a re-training moment.
4. **"What did it look like when it arrived?"** — **photo evidence**, typically for a damage or shortage claim against the carrier or the supplier.
5. **"Where is the unit now?"** — the unit's onward journey (bin, tested, listed, shipped).
6. **"What is this PO / what else came with it?"** — sibling cartons on the same purchase order.

Intent 4 is the one with money attached: a damage claim window is short, and photo evidence is the artifact that wins or loses it.

---

## 3. What shipped — measured anatomy of `/carton/[id]`

Route: `/carton/[id]`. Reached from `searchHitHref('RECEIVING')`, so every global-search hit, ⌘K result, AI answer and ops-timeline glyph lands here. Data: one `GET /api/receiving/[id]` (identity, milestones, lines, serials, totals, events).

Vertical stack, top to bottom:

1. **Header band** (non-scrolling): back chevron · eyebrow `CARTON · READ-ONLY` · title `PO 19-14910-41811` · right-aligned secondary button **Open in Unbox**.
2. **Identity card** — the shared `CartonContextCard` from the Unbox bench, in read-only mode.
3. **Panel: "WHAT HAPPENED TO THIS CARTON"** — 4 rows, each `label · timestamp · actor`.
4. **Panel: "CONTENTS"** — header `1/1 UNITS · 1/1 LINE COMPLETE`, then one line: title, qty, SKU, PO chip, condition, tracking chip, serial chip.
5. **"RECEIVING PHOTOS"** — a launcher row: *View Receiving Photos · 7 PHOTOS ›*.
6. **Timeline** — the shared `WorkspaceTimelineTab` (Units / Tracking spines).

### Hard measurements (real carton 49929, real data)

| Metric | 1440×900 | 1920×1080 |
|---|---|---|
| Content column width | **720px** | **720px** |
| Horizontal viewport used | **50%** | **37.5%** |
| Distinct text nodes above the fold | **25** | 33 |
| Total characters above the fold | **354** | 458 |
| Provenance panel height | **199px** | 199px |
| Contents panel height | **151px** | 151px |
| Photos affordance | 66px launcher row, **content behind a click** | same |
| The string "Kai" | **4×** | 5× |
| The string "07/28/2026" | **4×** | 4× |

Full above-the-fold text content, verbatim, at 1440×900:

> `CARTON · READ-ONLY  PO 19-14910-41811  Open in Unbox  EBAY  TYPE  1811  4243  WHAT HAPPENED TO THIS CARTON  Scanned in 07/28/2026 2:23:54 PM Kai  Opened 07/28/2026 2:23:54 PM Kai  Unboxed 07/28/2026 2:26:58 PM Kai  Received 07/28/2026 2:27:46 PM Kai  CONTENTS 1/1 UNITS · 1/1 LINE COMPLETE  Bose Wave Music System Model AWRCC1 Radio CD Player | For Parts/Repair  1/1  00279-GY 1811 PARTS 4243 00ac  RECEIVING PHOTOS  View Receiving Photos 7 PHOTOS`

**For contrast, in the same product:** the Unbox left rail renders **~24 carton rows** — each with title, quantity, status dot and age — in roughly the same 900px of vertical space this surface spends on ~25 facts about a single carton.

---

## 4. The self-indictment — where this contradicts our own written law

We are not asking you to discover the problem. We are asking you to tell us the correct target. Here is what we already believe is wrong, stated plainly so you can confirm, refute, or reprioritize.

1. **It is document calm, which the house identity explicitly bans.** "Legible throughput over document calm… not document-IA as the product shape." What shipped is a stack of three same-weight rounded panels with generous padding — a document. The source header of the component declares density `ops`; the render is `rollup`.
2. **It is card soup.** Three stacked panels of identical visual weight, no hierarchy, no answer-first element. Nothing on the screen says "yes, this is done" faster than reading four rows.
3. **Half the screen is empty, and the constraint was inherited without its reason.** The 720px column comes from `STATION_WORKBENCH_COLUMN` — a token whose purpose is to keep a *scan bench* readable **beside a rail**. The inspector has no rail. We imported the number and left the justification behind.
4. **The lead panel is mostly repetition.** 199px to say: Kai did all four steps, on one day, inside four minutes. Four timestamps to the second, four identical actor names. No collapsing, no relative time, no "one person, one session" summarization.
5. **The highest-value evidence is hidden.** 7 photos — the artifact that settles a damage claim (intent 4, §2) — sit behind a click, below two panels of lower-value text. **(Our strong prior: for a visual-inspection task this is the single worst call in the layout.)**
6. **The identity header is content-poor by construction.** Because it composes the *work* header with editing props omitted, it renders a nearly-empty band: two pills, two chips. It is correct and it is nearly useless. See §5 — we think this is the interesting failure.
7. **It answers question 6 badly and question 1 not at all.** No sibling cartons on the PO. No single glanceable "DONE" state.
8. **We deviated from what D4 actually proposed** without noticing. D4's text: *"Make the search result **itself** the detail display: a receiving hit **expands** to a rich, read-only carton record."* We built a separate route instead. Nobody re-litigated that; it just happened.

---

## 5. The constraint that produced this, and whether it is the root cause

The prior brief's verdict allowed a read view **on one condition**:

> *defensible as CQRS-shaped UI **provided both shells compose the same dumb primitives***

We implemented that condition literally and enforced it with a guard test that fails the build if the inspector imports an editor, writes anything, or hand-rolls a timeline. Identity composes `CartonContextCard`; history composes `WorkspaceTimelineTab`; photos compose `ReceivingPhotosSection`.

**The result is a read view assembled from work-view parts with the working bits removed.** The identity card is the clearest case: in the Unbox bench it is dense and useful because its pills are *live controls* carrying state; stripped of interactivity it degrades to a thin decorative band. We satisfied the anti-fork rule and produced a lobotomized surface.

So the question this brief most wants answered:

> **Is "compose the same primitives" the right anti-drift mechanism for a read/work split, or is it a category error?** The alternative framing: the shared thing should be the **read model and the presentation vocabulary** (chips, tone registries, date formatting, timeline adapters), while the **composition** — what is lead, what is dense, what is collapsed — is legitimately different because the *jobs* are different. Under that framing our guard test is enforcing the wrong invariant at the wrong layer.

Name systems that maintain a read view beside an editor over the same record. State what they actually share. If the answer is "share the data layer and the atoms, never the assembly," say so and say how they stop the two assemblies from drifting.

---

## 6. Surface shapes we did not take

All five are implementable here; four already exist as house patterns.

| Shape | In-house precedent | Argument for | Argument against |
|---|---|---|---|
| **A. Full route** (shipped) | `/o/[orderId]`, `/serial/[id]` | deep-linkable, shareable, room to grow | full context switch away from the bench; the operator loses their place |
| **B. Non-modal right-rail inspector** | `RightRailHost` with `modal={false}` — already used for the dashboard order inspector; no scrim, no scroll lock, resizable | operator keeps the rail/queue in view; pick-a-row-and-look is exactly its contract | not deep-linkable today; competes with the Unbox rail for the same edge |
| **C. Search result expands in place** | **what D4 actually proposed** | zero navigation; the hit *is* the answer | a search list of one is arguably a failure to recognize intent |
| **D. Two-column record page** | `OrderFullPageView` (`layout="workbench"`) | uses the whole screen; evidence beside facts | more layout to maintain; can still be low-density |
| **E. No read surface at all** | — | if opening the editor were provably safe, the whole problem dissolves | the editor is a mutation surface by construction; "safe to open" is a promise about every future edit |

Shape **E** deserves real consideration and is stated as D8. The prior brief already deferred a related decision (**D7 — the Station↔Workbench coupling is the disease, but defer**), on the grounds that Phases 2 and 4 would solve the operator complaint without it. Phase 2 did. Phase 4 is what we are now rejecting. That is evidence for reopening D7.

---

## 7. The eight decisions — take a side on each

### D1 — Density: what is the correct information density for a warehouse read surface?
**Current:** ~25 facts / 354 chars on a 1440×900 screen, 50% horizontal utilization, three same-weight panels.
**Proposed:** dense-by-default (`ops`): full-width, multi-column, ~3–5× the facts, collapsing redundancy.
**Counter-argument against ourselves:** this record is read *occasionally*, under mild stress, often to settle a dispute — arguably a case where legibility and calm beat density, and the dense-ops instinct is over-applied from the queue surfaces. Is there a published density distinction between *throughput* surfaces and *adjudication* surfaces?

### D2 — What is the answer-first element?
**Current:** none. The operator reads four rows to learn "yes, it's done."
**Proposed:** a single glanceable state hero (DONE · unboxed by Kai · 8h ago) answering §2 intent 1 before anything else.
**Counter:** a status hero on a record page is dashboard thinking; the facts *are* the answer and a hero is one more thing to keep truthful.

### D3 — Should photo evidence be the lead content?
**Current:** 7 photos behind a click, below two text panels.
**Proposed:** photos are the primary surface — a visible strip or grid at the top, full-bleed, with facts beside them.
**Counter:** photos are heavy, sometimes absent, and dominate a layout that must also work for a carton with none. What do parcel-damage and 3PL claims tools actually lead with?

### D4 — Collapse or preserve the provenance rows?
**Current:** four rows, absolute timestamps to the second, actor repeated four times.
**Proposed:** collapse a single-actor single-session lifecycle to one line ("Kai · Jul 28, 2:23–2:27 PM · scanned → received"), expandable.
**Counter:** attribution disputes are exactly when second-precision and explicit per-step actors matter; collapsing hides the thing the surface exists to prove. Is there a standard for audit-trail display that reconciles glanceability with evidentiary completeness?

### D5 — Column width: is a fixed 720px ever right for a record read view?
**Current:** 720px at every viewport (37.5% of a 1920 screen), inherited from a station-bench token whose rationale does not apply.
**Proposed:** full-width responsive, multi-column at ≥1280px.
**Counter:** measure-based line-length limits (~50–75 characters) are real typographic guidance; a full-width record page can read worse. Where is the boundary between *prose* and *data* for that rule?

### D6 — Is the shared-primitive rule (§5) enforcing the wrong invariant?
**Current:** a build-failing guard requires the read view to compose the work view's components.
**Proposed:** share the read model, presentation SoTs and atoms; let assembly diverge; move the guard down a layer.
**Counter:** this is precisely how two renderings of one entity drift apart, which is the failure mode the rule was written to prevent. If assembly may diverge, what mechanically stops the drift?

> **LAW (2026-07-29).** D6 is locked. Share `carton-inspector-model` + atoms only. Never require Unbox
> layout panels / identity cards. Guard asserts intent (no writes, evidence at zero clicks, disposition
> truth), not frozen component names. See [`pattern-evolution.md`](../../.claude/rules/pattern-evolution.md)
> (read/work pairs) and [`carton-inspector-D4-ROOT-FIX-HANDOFF.md`](carton-inspector-D4-ROOT-FIX-HANDOFF.md).

### D7 — Which surface shape (§6 A–E)?
**Current:** A (full route), chosen without re-reading D4's actual proposal.
**Proposed:** B or C — keep the operator in place.
**Counter:** deep-linkability is a real requirement (search, ⌘K, AI answers, scanned short-links all produce hrefs). A rail inspector that cannot be linked to breaks those. Can B be made deep-linkable without becoming A?

> **RESOLVED by product decision 2a (2026-07-29).** Canonical route stays `/carton/[id]`. Editable
> `ReceivingDetailsStack` is retired as the carton-detail answer — openers navigate to the read
> inspector. Not a second rail twin; one assembly owns “look up this carton.”

### D8 — Should this surface exist at all?
**Current:** it exists because the editor is unsafe to open casually.
**Proposed:** make the work view safe to *open* (no write on mount, no attribution on view, explicit edit intent) and delete the read view.
**Counter:** "safe to open" is a promise every future contributor must keep on a surface whose entire purpose is mutation; a separate read view makes the guarantee structural. Which do real systems choose, and what happens over a 3-year maintenance horizon?

---

## 8. Open research questions

1. **Density benchmarks.** For desktop warehouse-ops record views: facts-per-screen, column utilization, and line-length practice in named 2026 systems. Numbers, not adjectives.
2. **Adjudication vs throughput surfaces.** Is the distinction in D1 recognized in the literature, and does it change density guidance?
3. **Evidence-led layouts.** In parcel/freight damage-claim and 3PL exception tooling, does photographic evidence lead the record? What resolution/affordance (strip, grid, lightbox, side-by-side)?
4. **Audit-trail display standards.** How do systems that must survive a dispute present per-step attribution *and* stay glanceable? Is progressive disclosure acceptable when the collapsed form is the legally relevant one?
5. **Read/write surface pairs.** Named systems maintaining an inspector beside an editor over one record: what layer do they share, what governs drift, and where has it decayed? (Direct challenge to the prior brief's verdict.)
6. **Deep-linkable non-modal inspectors.** Prior art for a right-edge inspector that is URL-addressable without becoming a page.
7. **Mixed-role, low-frequency operators.** Our crew is small and cross-trained; this surface is used occasionally, not all shift. Does infrequent use argue for *more* explicitness (labels, absolute times) against the density instinct?
8. **The "one row is not a choice" rule.** We auto-open a sole search result. Is that standard in operator tooling, or does it break the operator's mental model of "search shows results"?

---

## 9. Constraints — treat these as fixed

- **No new endpoint.** `GET /api/receiving/[id]` already returns identity, milestones, lines, serials, totals and events in one call.
- **No migration.** Phase 2's classification is done and shipped; the read model exists.
- **Presentation SoTs are non-negotiable:** dates via `src/utils/date.ts`, condition labels/tones, typed identifier chips (`CopyChip` family), status dots from the lifecycle registry, semantic color tokens only, one type family (IBM Plex) with a hard **600 weight ceiling**, density-aware spacing scale. A proposal that needs a new visual language is out of scope.
- **The carton milestone fields are warehouse wall-clock strings, not instants** (`to_char` with the DB session on `America/Los_Angeles`). Any layout that re-derives or re-zones them is wrong.
- **Deep-linkability is a hard requirement somewhere in the answer** — global search, ⌘K, AI answers and ops-timeline glyphs all emit an href for a carton today.
- **The Unbox bench itself is out of scope.** This brief is the read surface; changing the bench is D7-of-the-prior-brief territory.

---

## 10. What a good answer looks like

- A **named layout specification** for the winning shape: what is above the fold at 1440×900, what is dense, what collapses, what leads, and what the operator sees in the first 300ms.
- A **defended position on D6** — the sharing boundary — since it determines whether the rebuild is a re-layout or a re-architecture.
- A **kill-or-keep call on D8**, taken seriously rather than deflected.
- **Named systems and standards**, with the conditions under which each pattern wins.
- A **migration order** an engineer can execute, given §9.

An answer that says "the current surface is fine, here is why the criticism is aesthetic rather than functional" is acceptable **if defended with evidence** — but note that the product owner rejected it on sight, which is itself data about a surface intended for daily operator use.

---

## Appendix A — file map (for follow-up questions)

| Concern | Path |
|---|---|
| Route | `src/app/carton/[id]/page.tsx` |
| Surface | `src/components/receiving/inspector/CartonInspector.tsx` |
| Read-only identity adapter | `src/components/receiving/inspector/CartonInspectorIdentity.tsx` |
| Pure read model | `src/components/receiving/inspector/carton-inspector-model.ts` |
| Anti-fork guard | `src/components/receiving/inspector/carton-inspector.guard.test.ts` |
| Search destination SoT | `src/lib/search/search-hit.ts` (`searchHitHref`) |
| Prior brief + verdicts | `docs/todo/unbox-station-scan-vs-lookup-GEMINI-RESEARCH-BRIEFING.md` |
| Phase log | `docs/todo/unbox-scan-vs-lookup-EXECUTION-PROMPT.md` §2e |

## Appendix B — raw measurements

Captured 2026-07-29 against carton 49929 (real dogfood data: FedEx, PO 19-14910-41811, one line, one serial, 7 photos, unboxed by staff "Kai" 2026-07-28 14:26:58 PDT), authenticated desktop Chromium.

```
1440×900   column 720px (50.0% of viewport)   above-fold: 25 distinct nodes / 354 chars
1920×1080  column 720px (37.5% of viewport)   above-fold: 33 distinct nodes / 458 chars
panels: provenance 199px · contents 151px · photo launcher 66px  (all 672px wide)
repetition above fold: "Kai" ×4 · "07/28/2026" ×4
photos: 7, behind one click
```
