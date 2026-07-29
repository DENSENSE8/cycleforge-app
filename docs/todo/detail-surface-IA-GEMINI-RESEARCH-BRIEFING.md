# Research briefing — detail-surface IA: slide-over vs. dedicated page, across many entity types

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-07-28
**Deliverable:** (a) the 2026 industry standard for *where* a record's detail lives — overlay panel, dedicated route, or both — with named systems and citations; (b) a per-entity-type ruling for this codebase, plus a decision rule the team can apply to the next entity type without re-litigating.

**Companion brief:** [order-details-page-GEMINI-RESEARCH-BRIEFING.md](order-details-page-GEMINI-RESEARCH-BRIEFING.md) answered *what goes on* an order detail page. This one answers *where detail surfaces live and how you get back to them* — for every entity type, not just orders.

---

## 0. How to use this brief

You do **not** have the codebase. Everything measured is below.

Answer **two separate questions**:

1. **What is industry standard in 2026?** How do comparable products decide between a slide-over/drawer, a dedicated route, a modal, and a split-pane inspector? Named products, cited sources, explicit dominant patterns — not "it depends."
2. **What is right for *this* codebase?** Reconcile against §3–§6. Where the standard conflicts with a constraint here, name the conflict and pick a side.

Then give us the thing we actually lack: **a decision rule**, stated tightly enough that the next entity type is not another debate.

---

## 1. Product context

**Cycle Forge** is multi-tenant reseller-operations SaaS for used-goods resellers. Inventory is **serialized** — individual physical units with serial numbers, condition grades, test verdicts, photo evidence — flowing through receiving → triage → testing → repair → listing → packing → shipping → returns, across multiple sales channels.

UI identity is **Kinetic Ledger**: data-first, dense, state-colored, scan-aware. Bias is **legible throughput over document calm** — Linear/Stripe chrome discipline, not whitespace-heavy document IA.

Every UI region carries one of four **region contracts** (enforced house law — please use this vocabulary):

| Contract | Driven by | Job | Selection | Density |
|---|---|---|---|---|
| **Station** | barcode scanner | act-and-clear | ephemeral, never in URL | `floor` |
| **Workbench** | pointer | pick a record → edit → persist | durable, URL-addressable | `ops` |
| **Monitor** | filters over a stream | observe only | none (filters only) | `rollup` |
| **Canvas** | pan/zoom/focus | reshape a definition | durable focus in URL | `studio` |

---

## 2. The problem, in one paragraph

An operator wants to **look something up** — "what happened to this order," "what was in that carton," "where did this serial go," "why was this repair opened." Today the answer depends entirely on *which entity type* they picked, because seven detail surfaces were each built into whatever page happened to own them. Some open as a right-side slide-over over a queue. One is a dedicated route. All are deep-linkable, but through six different URL shapes. There is no shared answer to "I am looking at a thing; where does its detail appear, and how do I get back to it later?"

---

## 3. Measured current state

### 3.1 There is already a registry — and it is half-honest

`src/lib/detail-stacks/registry.ts` declares seven **detail-stack kinds**, each mapping to a URL param that opens a right-side slide-over on its home surface:

| Kind | Param | Noun |
|---|---|---|
| `shipment` | `openShipmentId` | Shipment |
| `receiving` | `openReceivingId` | Receiving carton |
| `order` | `openOrderId` | Order |
| `claim` | `openClaimId` | Claim |
| `photo` | `openPhotoId` | Photo |
| `plan` | `openPlanId` | Plan |
| `po` | `openPoId` | PO |

The same file carries `DETAIL_STACK_CANONICAL_PATH`, which today has exactly two entries: `order: '/o'` and `shipment: '/fba'`. So the codebase has *already started* splitting "the panel that opens" from "the canonical place this record lives" — but only for two of seven kinds, and only as an escape hatch for the re-open-from-recents flow.

### 3.2 Search sends each entity type somewhere structurally different

`searchHitHref()` in `src/lib/search/search-hit.ts` is the cross-entity search waist. Six entity types, five different URL grammars:

| Entity | Destination |
|---|---|
| ORDER | `/o/[orderId]` — **a dedicated route** (changed this week) |
| SERIAL_UNIT | `/inventory/units?unit=<id>` |
| RECEIVING | `/unbox?openReceivingId=<id>` |
| SKU | `/products?view=qc&skuId=<id>` |
| REPAIR | `/repair?tab=active&openRepair=<id>` |
| FBA_SHIPMENT | `/fba?openShipmentId=<id>` |

Every one except ORDER is "navigate to a workspace page, then pass a param that opens something inside it." Note also the inconsistency *within* the param convention: `openReceivingId` / `openShipmentId` follow the registry, but `unit`, `skuId`, and `openRepair` do not.

### 3.3 Two hosting mechanisms exist and are both live

- **`RightRailHost`** — documented as "the ONE owner of the right-edge slot." Single-slot: one detail stack at a time, app-wide.
- **`DetailStackRailRegistrar`** — what a panel wraps itself in to claim that slot. It was **just changed to non-modal for orders** (`modal={false}`), with this rationale in the code: picking a row and editing it is a pick+edit job, not a blocking decision, so the queue underneath stays scrollable and clickable, and nothing dims — the scrim "used to hide exactly the context the operator needs (sibling rows, KPI strip, lifecycle tabs)." Every other right-rail occupant still defaults to modal.
- **`/o/[orderId]`** — a real route with its own layout, sidebar, and crossfading right pane.

### 3.4 The order case, as a worked example of the tension

The order record now exists in **three** places simultaneously, sharing one body component (`OrderRecordBody`):

1. `/o/[orderId]` — full page, single scroll + right rail, full editing
2. Dashboard Search detail — same body, read-only, inside a search shell with an L2 hit-map rail
3. Dashboard slide-over — same body at `density="compact"`, full editing, non-modal over the queue

Search on an exact identifier now jumps to (1). Fuzzy/multi-result search lands on (2). Clicking a queue row opens (3). All three are legitimate — but nobody decided that; it accreted, and we only recently made them share a body.

### 3.5 Entity types that need a detail surface

Orders · receiving cartons (and receiving lines) · serial units · SKUs · repairs · FBA shipments · support tickets · local-pickup orders · photos · POs · warranty claims. Their detail bodies range from ~4 facts to a dozen sections plus a merged multi-spine timeline.

---

## 4. The lookup/history job specifically

The user's framing, verbatim: *"if I want to go back and look up something."*

This is worth isolating because it may not have the same answer as "act on this record." Characteristics of the lookup job here:

- Read-dominant. The operator is answering a question, not editing.
- Often **cross-entity**: "this serial" leads to its carton, its order, its repair, its photos.
- Frequently arrived at from **search** (identifier paste) or from **recents**, not from a queue row.
- May need to be **shared** (pasted to a colleague or into a support ticket).
- May need **two records side by side** ("did this carton's serial match the order's?").

The current app answers this only partly: there is a global search waist and a recents list, but the destination shape varies per entity, and nothing supports comparing two records.

---

## 5. Constraints your recommendation must respect

- **Region contracts** (§1). A detail surface for a scanner-driven Station is a different animal from a Workbench inspector; do not collapse them.
- **`RightRailHost` is single-slot** — one overlay at a time, app-wide. A recommendation requiring two simultaneous panels must say so explicitly and account for the cost.
- **URL-as-state.** Durable selection belongs in the URL; Workbench selection must survive reload and be shareable. Station selection must *never* be URL-addressable.
- **Density `ops`.** Dense rows, inline actions. Not a whitespace document layout.
- **Compose the named shell/registry; grow it when wrong; never fork a page-local twin** for the same job. A genuinely different job may add a sibling that composes the shared primitive.
- **Degrade-not-fail.** A failing sub-resource renders empty; it never takes down the record.
- **Motion:** opacity + transform only, sub-300ms, reduced-motion honored, never animate layout. Crossfade only the singular focus surface, never the collection map.
- **Mobile/tablet exists** (`/m/*` routes, a kiosk surface). Whatever you propose must degrade to a phone.

---

## 6. Questions

### A. Industry standard (2026), with citations

1. **The core decision rule.** What determines slide-over vs. dedicated route vs. modal vs. split-pane inspector in 2026? Give the actual heuristics shipped products use — record complexity, edit vs. read, need for deep-linking, session length, whether the list context matters. Benchmark named systems: Linear (issue panel vs. full page), Shopify admin, Stripe Dashboard, Notion (peek vs. full page), Jira, Height, Airtable expanded record, Salesforce console, ServiceNow, Zendesk/Gorgias ticket views, Retool.
2. **The "both" pattern.** Several products offer a peek/preview panel *and* a full page for the same record (Notion's peek, Linear's panel, Airtable's expand). What is the standard for when each appears, how the user escalates from one to the other, and how the URL behaves in each? Is "same body, two containers" (what we just built for orders) the shipping norm or an anti-pattern?
3. **Modal vs. non-modal overlays.** We just made the order panel non-modal so the queue stays live underneath. What is the 2026 standard — when must a detail overlay trap focus and dim, and when should it not? Cite accessibility guidance (focus management, escape, screen-reader semantics) for both.
4. **Heterogeneous entity types.** For products with many record types of differing weight, is the standard one uniform detail mechanism, or a per-type ruling? If per-type, what is the published rationale? How do those products keep it from feeling arbitrary?
5. **The lookup/history job.** Is there a distinct 2026 pattern for read-oriented record lookup, separate from the edit surface — a command-palette peek, a hover card, a dedicated "record viewer," a history/audit route? What do research/ops-heavy tools do?
6. **Comparison and multi-record.** How do leaders handle "show me two records side by side"? Tabs, split view, pinning, a stack of overlays? Is it worth building, or a niche request that tooling rarely justifies?
7. **URL grammar.** For deep-linkable detail across many types, what is the standard URL shape — `/entity/[id]` routes per type, a single `?open<Type>Id=` param convention, or a hybrid? What are the SEO-irrelevant-but-UX-relevant tradeoffs (back-button behavior, history pollution, share-ability, browser tab titles)?
8. **Return paths.** After looking something up, how do users get back? Browser back, an explicit close, breadcrumbs, a recents rail? What is standard for preserving the underlying list's scroll and filter state across a detail visit?

### B. Recommendation for this codebase

9. **The decision rule.** Give us one, stated as a short procedure we can apply to a new entity type — the same way `pickArchetype()` (§1) resolves region contracts. Inputs should be observable facts about the entity (record weight, edit-vs-read, arrival path, need for cross-entity navigation), not taste.
10. **Per-entity ruling.** Apply your rule to each type in §3.5. Say which get a dedicated route, which get an overlay only, which get both, and which should change from what they have today.
11. **URL grammar convergence.** §3.2 has five grammars for six types, plus a param convention that three types already violate. Propose the target and the migration cost. Is a `/o/[id]`-style route per entity worth it, or should everything converge on the registry's `open<Kind>Id` param?
12. **The registry's role.** `DETAIL_STACK_DEFS` + `DETAIL_STACK_CANONICAL_PATH` already exist but cover 7 kinds and 2 canonical paths. Should the registry become the single declaration of *how each entity type presents its detail* (container, URL, editability)? Sketch the shape if so.
13. **The lookup surface.** Does the "go back and look something up" job deserve its own surface — a cross-entity history/record viewer — or is it satisfied by search → the record's canonical page? If a new surface, what is it and what does it own that the per-entity pages don't?
14. **Modal policy.** Should non-modal become the default for pick+edit overlays (matching the order change), with modal reserved for genuinely blocking decisions? State the rule and the accessibility obligations either way.
15. **Sequencing.** What is worth doing first, given one engineer and an existing shared `OrderRecordBody` to build on? Explicitly name what *not* to do yet.

---

## 7. Deliverable format

1. **Industry findings** — by question, named systems, cited sources, explicit dominant-pattern calls.
2. **The decision rule** — a short procedure, pseudocode welcome, in the style of `pickArchetype()`.
3. **Per-entity ruling table** — entity → container → URL shape → editable? → change from today (yes/no).
4. **URL grammar target** + migration cost estimate.
5. **Sequenced plan** — one engineer, week-one first, with an explicit "not yet" list.
6. **Explicit disagreements** — anywhere the industry standard conflicts with §5, name it and choose.
