# Gemini Deep Research brief — what premium SaaS navigation does that ours does not

**Paste everything below the line into Gemini Pro deep research.** It is self-contained; the
researcher has no access to this repo.

**Deliverable:** a decision brief we can execute, not an essay. Format is specified at the end.

---

## Who is asking

I own the navigation of **Cycle Forge**, a multi-tenant SaaS for used-goods reseller operations
(receiving → testing → listing → fulfillment → returns). It is a **dense operations tool**, not a
document or issue tracker. Operators use it standing at a warehouse bench with a barcode scanner, and
managers use it at a desk. There is one persistent left navigation column ("the spine", 240px, push —
opening it reflows the page rather than floating over it).

## The problem, stated plainly

**The spine reads as generated rather than designed.** Someone described it as "AI slop," and I think
that is a fair diagnosis, but I cannot name the mechanism. My working hypothesis is that it fails on
three axes at once:

1. **Colour** — eight saturated hues in one 240px column, one per section, because colour was
   available and the taxonomy had eight slots.
2. **Icons** — every single row carries a leading glyph, because icons were available.
3. **Naming** — labels read like taxonomy headings generated to cover a category space, not like
   words an operator says out loud.

I want that hypothesis **confirmed or refuted with evidence from real products**, and then I want to
know exactly what to change.

---

## Current state — the complete inventory

This is accurate as of 2026-08-02. Nothing here is aspirational; it is what ships.

### Structure

```
┌─ ORG BAND ────────────────────────┐
│ ◐ Acme Resale        ▾            │   circular org mark + workspace switcher
├─ TOP PINS ────────────────────────┤
│ ⌂ Home                            │
│ ⌕ Search                          │
│ ▤ Media                           │
│ ✉ Chat                            │
├─ SECTION DRILLS (the root map) ───┤
│ ◔ Analytics Monitor            ›  │   1 page
│ ⊞ Scan Stations                ›  │   7 pages (one subgroup)
│ ⊡ Inbound                      ›  │   1 page
│ ⌗ Catalog                      ›  │   1 page (7 modes)
│ ▥ Inventory                    ›  │   3 pages
│ ➤ Fulfillment                  ›  │   1 page (5 modes)
│ $ Sales                        ›  │   1 page
│ ! Support                      ›  │   1 page (6 modes)
├─ FILTER BAND ─────────────────────┤
│ ⌕ Go to…                          │
├─ FOOTER PINS ─────────────────────┤
│ ⚙ Workflow Studio                 │
│ ⛨ Admin                           │
│ ⚙ Settings                        │
├─ ACCOUNT ─────────────────────────┤
│ ● Dana Reyes · Lead tech    ⋯  ⏻  │
└───────────────────────────────────┘
```

**Clicking a section replaces the whole body** with a back-title and that section's pages (a
Vercel-style drill-in, not an in-place expand). Pages with more than one mode render their modes
always-expanded beneath them — there is no accordion. Typing in the filter band replaces the tree
with a flat ranked destination list.

### What is inside each section

| Section | Pages | Modes on those pages |
|---|---|---|
| Analytics Monitor | Operations | Live · TV · Analytics · History |
| Scan Stations | *Receiving:* Arrival · Unbox · Local Pickup · Repair Service; then Testing · Packing · Scan out | — |
| Inbound | Inbound | — |
| Catalog | Catalog | Reference · Manuals · Labels · Pairing · Catalog link · QC · Kit Parts |
| Inventory | Inventory · Sourcing · Locations | Locations: Labels · Racks · Rooms · Bins · Map |
| Fulfillment | Shipping | Orders · Labels · Ready · FBA · Packing Review |
| Sales | Sales | — |
| Support | Support | Tickets · Orders · Voicemail · Calls · Warranty · Issues |

### Colour system (the thing I most suspect)

Every section owns a hue. An **active page row is a solid fill with white 12px text plus an inset
hairline ring**; a mode row is a 15%-opacity wash of the same hue; an idle row's icon tints to the
section hue on hover; and the ⌘K command palette highlights each row in its section's hue.

| Section | Hue |
|---|---|
| Analytics Monitor | sky-600 |
| Scan Stations | amber-700 |
| Inbound | teal-700 |
| Catalog | emerald-600 |
| Inventory | cyan-700 |
| Fulfillment | indigo-600 |
| Sales | green-700 |
| Support | orange-700 |
| Top pins + footer pins | blue-600 (neutral) |

Five of those sit at the 700 shade **for a stated reason**: at 600 they fall under WCAG AA 4.5:1
against white text at 12px. Three of the eight are green-family (emerald / teal / green), two rows
apart from each other.

### Icons

Every row has a 14px leading glyph from a lucide-style set at stroke-width 2. Section glyphs:
`chart-pie`, `scan-barcode`, `inbox`, `tags`, `shelving-unit`, `send`, `circle-dollar-sign`,
`alert-circle`, `workflow`. Page and mode glyphs are individually chosen per row. Icons animate 2px
straight up on hover.

### Type

Destinations (sections, pages, drill title, search results) are 14px semibold. Modes are 12px medium.
Counts are 10px. This was bumped last week from an all-12px spine where pages and modes differed only
by weight.

### Naming collisions I have already noticed

- **"Labels" is three different things** — product barcode labels (Catalog), bin/rack labels
  (Inventory › Locations), and carrier postage (Fulfillment › Shipping).
- **"Orders" is two things** — the outbound fulfillment queue, and the Support order view.
- **"Catalog" is three things** — a section, the page inside it, and a mode called "Catalog link."
- **Six of eight sections contain exactly one page, and that page has the section's own name**
  (Inbound › Inbound, Sales › Sales, Support › Support, Catalog › Catalog, Fulfillment › Shipping,
  Analytics Monitor › Operations). The code contains an explicit workaround that suppresses the
  parent label in search results when it duplicates the child's — a code fix for a naming problem.
- The section axis is deliberately **mixed**: "Analytics Monitor" is an altitude (observe),
  "Scan Stations" is an input model (things you scan at), and the other six are business domains.
  This was a considered decision — a uniform axis previously produced a grab-bag section called
  "Triage Desk" meaning "everything that isn't a scanner," which nobody could predict.

---

## What I want researched

### Q1 — Diagnose "AI slop" mechanically

Do not accept my framing. **Establish what actually distinguishes a navigation column that reads as
crafted from one that reads as generated**, and then test my spine against it.

Candidate mechanisms to confirm or refute:

- **Colour applied by taxonomy rather than by meaning** — one hue per category because the categories
  existed, versus colour reserved for state that changes.
- **Uniform icon coverage** — every row gets a glyph, so no glyph carries information.
- **Labels that name a category rather than a destination** — compound noun phrases
  ("Analytics Monitor," "Workflow Studio," "Scan Stations") versus single words an operator says.
- **Hierarchy without content** — a drill level that mostly wraps one item.
- Anything else you find that is more predictive than these.

I want the diagnostic to be **falsifiable and specific enough to apply to a screenshot**, not
"it lacks polish."

### Q2 — Colour: what do the premium products actually do?

Get **real, observed values**, not impressions. For each product, report: is there chromatic colour
in the persistent nav at all; what exactly is the selected-row treatment (fill? wash? left rail?
weight? nothing but background?); what opacity/shade; is hover distinguishable from selected; where
does brand colour appear if not in the nav.

Then answer the question that matters to me: **eight section hues — is that ever done well, and by
whom?** If the answer is "essentially nobody," say so plainly and identify what carries the wayfinding
job that colour is currently doing for us (see the counter-hypothesis below).

### Q3 — Icons: coverage, style, and where they stop

- Which rows get glyphs and which do not, in each product. Is coverage total or selective?
- Stroke weight, size, and **optical density** at 14–16px. Outline vs filled for selected state.
- Do section/group headers get glyphs, or only leaf destinations?
- Where do products use a **user- or data-chosen** mark (Notion's page emoji, Linear's project icons,
  Slack's channel glyph) instead of a designer-chosen one, and does that change the read?
- Specific to us: does a 14px stroke-2 lucide glyph on every row of a dense ops column help or hurt?

### Q4 — Naming: the actual craft rule

This is the axis I understand least. I want the **rules**, with examples:

- Single word vs compound phrase. Noun vs verb. When is a verb correct in nav?
- How do products handle the same word meaning different things in different contexts (my "Labels"
  problem three times over)? Do they disambiguate, rename, or restructure?
- How do they name a group whose only child is itself?
- Sentence case vs Title case vs ALL CAPS eyebrow, and what each signals.
- **Domain-specific:** how do warehouse/ops products (not issue trackers) name the physical-work
  surfaces — the bench where you scan a box? Is there an established vocabulary in WMS/3PL software I
  should be borrowing instead of inventing?
- Give me a **rename table** for my specific labels above where you think they are wrong.

### Q5 — Structure: is the drill-in right for eight sections of mostly one page?

Compare the models: Linear's persistent collapsible tree, Notion's nested tree, Vercel's drill,
Slack's sections, Shopify Admin's flat-with-subnav, Stripe's flat-with-subnav. Which model fits
**8 groups where 6 hold a single page**? Is the honest answer that we should flatten and delete a
level? What would we lose (the mixed-axis grouping exists to keep a scan bench from being reachable
only through the domain of the records it touches — that is a real constraint).

### Q6 — What transfers to a dense ops tool, and what does not

Linear and Notion are **knowledge-work tools for people at desks**. We have a real constraint they do
not: a 12px row read across a warehouse aisle on a 1080p monitor by someone holding a scanner.
Separate the findings into:

- **Transferable** — craft rules that are about restraint and legibility, which get *better* under our
  constraints.
- **Not transferable** — conventions that depend on a calm document surface, low information density,
  or a mouse-and-focus workflow.

Include at least a few **operations** comparators for this reason: Shopify Admin, ShipStation, Ramp,
Mercury, Flexport, Attio, Retool. And name one or two **negative** examples (NetSuite, SAP, older
WMS) to sharpen what specifically we are avoiding.

---

## Counter-hypotheses — please genuinely try to break these

I am not looking for a rubber stamp. Three things in the current design were decided deliberately, and
if you tell me to reverse them I need you to answer what replaces them:

1. **The section hues are load-bearing.** They carry section identity into three surfaces at once: the
   spine's active fill, the icon hover tint, and the ⌘K palette's row highlight. Remove them and the
   palette loses its only grouping signal. **If colour goes, what does that job?**
2. **The 700 shades are a contrast decision, not a taste one.** They clear WCAG AA at 12px on white
   text. A recommendation to lighten them has to survive that.
3. **The mixed axis is deliberate.** A uniform axis previously produced an unpredictable grab-bag
   section. If you recommend a uniform axis, show how it avoids re-creating that.

Also worth testing against me: is it possible the colour is **fine** and the actual failure is naming
and icon coverage, with colour merely the most visible symptom? I would rather be told that than get a
palette change that fixes nothing.

---

## Hard constraints on any recommendation

- **One neutral-vs-brand decision is available to us; a second design language is not.** Every colour,
  space, radius and type value comes from one token set. A recommendation that needs a foreign kit is
  out of scope.
- **Density stays.** This is 12–14px UI by design; "add whitespace" is not a fix here.
- **The column is 240px and pushes the page.** No floating/overlay nav.
- Rows must remain **keyboard reachable** and the whole spine must degrade correctly under
  `prefers-reduced-motion`.
- Recommendations must survive a **colour-blind operator** and a **glare-heavy warehouse monitor**.
- We are multi-tenant: nav labels are product vocabulary, not one customer's jargon.

---

## Evidence bar

- **Cite what you observed and when.** "Linear's sidebar as of <date>, selected row is
  `background: rgba(...)` with no chromatic fill" beats "Linear is minimal."
- Prefer **primary sources**: the running product, published design-system docs, design-team writing,
  changelogs. Secondary blog roundups are weak evidence — mark them as such.
- Where products disagree, **say so** and explain the difference by product type rather than
  averaging them into mush.
- Where you cannot verify something, **say you could not**. A stated gap is more useful than a
  confident guess.
- Screenshots/described-observations of the actual selected/hover/idle states are the most valuable
  thing you can bring back.

---

## Required output format

A decision brief. For each recommendation, one numbered ruling:

```
### D<n> — <one-line ruling in the imperative>

**Verdict:** <what to do, specifically enough to implement>
**Evidence:** <which products, what was observed, when, and how>
**Why it fixes the "generated" read:** <the mechanism from Q1 this addresses>
**What it costs / what replaces the old job:** <honest trade>
**Rejected alternatives:** <what you considered and why not>
**Confidence:** high / medium / low, and what would change your mind
```

Cover, at minimum: colour system, icon policy, the naming table, type/weight, selected-state
treatment, and the drill-vs-tree structure question.

Close with:

- **A ranked "do this first" list** — the three changes with the highest read-quality-per-unit-of-risk.
- **A "do not bother" list** — things that look like upgrades but would not change the diagnosis.
- **Open questions** you could not settle, and what evidence would settle them.
