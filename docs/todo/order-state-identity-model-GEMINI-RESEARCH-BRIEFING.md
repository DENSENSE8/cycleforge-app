# Research briefing — Order state identity: modeling and displaying N orthogonal axes in one operational row

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-07-28
**Scope:** The **state identity model** for an outbound order — how many axes it actually has, which are collapsed today, and how a dense Workbench grid should display more than one of them per row. Anchored on `/dashboard` outbound, but the model is the deliverable, not the pixels.
**Predecessor:** `pending-grid-display-language-GEMINI-RESEARCH-BRIEFING.md` (2026-07-28) asked *how the Pending grid should look* — striping, alignment, editability, and whether it should read as a departure board. Its §6 Claim C asked a narrow version of this question ("should Pending gain a Status column?"). **This brief is the layer underneath**: before we can answer "which status column," we have to answer *what a status even is here*, because the codebase currently has at least three answers and they contradict each other.

**Deliverable:** three things, kept separate.

1. **Model answer.** What is the correct information model for an entity whose "state" is genuinely multi-dimensional (a pipeline stage, plus independent exception flags, plus a time commitment, plus ownership)? Name the 2026 dominant pattern with cited sources.
2. **Display answer.** Given that model, how do you render 2–4 simultaneous state axes in ONE row of a dense ops grid without a rainbow, and what does the operator's filter/sort chrome look like when facets stop being mutually exclusive?
3. **Migration verdict.** Which of the concrete defects in §4 are symptoms of the model, which are independent bugs, and in what order do you fix them.

Assume the reader is the engineer implementing this alone, next week.

---

## 1. Product context

**Cycle Forge** is multi-tenant reseller-operations SaaS for used-goods resellers (electronics refurb/resale is the dogfood tenant). Inventory is **serialized**. Operators move goods: inbound carton → triage → unbox → test → repair → list → **pack → ship**, plus returns and warranty loops.

UI identity is **Kinetic Ledger**: data-first, dense, state-colored, scan-aware. Bias: **legible throughput over document calm**.

Every UI region is one of four **region contracts** (enforced house law — please use this vocabulary):

| Contract | Driven by | Job | Selection | Density |
|---|---|---|---|---|
| **Station** | barcode scanner | act-and-clear | ephemeral, never in URL | `floor` |
| **Workbench** | pointer | pick a record → edit → persist | durable, URL-addressable | `ops` |
| **Monitor** | filters over a stream | observe only, no edit | none (filters only) | `rollup` |
| **Canvas** | pan/zoom/focus | reshape a definition | durable focus in URL | `studio` |

`/dashboard` outbound is a **Workbench** (an orders grid) with a **Monitor** sub-region (a KPI strip). Primary reader: a warehouse operator, standing, 2–4 ft from a 1080p monitor, asking *"what has to leave today, and what is stuck."*

---

## 2. The problem, in the product owner's words

> "There's currently an identity problem within this codebase. How would I be able to map the identity under different semantics display — like in the table there's no way to add and display different metrics for status like **urgent**, **out of stock**, and just **regular pending**."

The literal complaint is that the grid's Fields menu cannot add a Status column. That is true, and it is a bug (§4.1). But the reason it is true is structural, and that is what we want adjudicated.

---

## 3. What the code actually models — measured

You do not have the codebase. Everything below is read from source; paths are given so your answer can cite them.

### 3.1 The axes that exist

An outbound order carries **at least seven** independent facts that an operator would call "status":

| # | Axis | Vocabulary | Where it lives | Cardinality |
|---|---|---|---|---|
| 1 | Pre-dock pipeline stage | `OrderLifecycleStage` | `src/lib/order-lifecycle.ts:25` | 5 — `AWAITING_LABEL · PENDING · TESTED · PACKED_STAGED · BLOCKED` |
| 2 | Fulfillment lane (a narrowing of 1) | `FulfillmentLane` | `resolveFulfillmentLane`, same file | 3 — `PENDING · TESTED · BLOCKED` |
| 3 | Post-dock outbound stage | `OutboundStage` | `src/lib/order-lifecycle.ts` (re-exported by `outbound-state.ts`) | 7 — `PACKED_STAGED · SCANNED_OUT · IN_CUSTODY · DELIVERED · EXCEPTION · PROCESS_GAP · ORPHAN` |
| 4 | **Urgency** | `orders.is_urgent` | a raw boolean column | 2 — **in no vocabulary at all** |
| 5 | **Lateness** | `isUnshippedLate(deadline, now)` | `src/lib/unshipped-state.ts` | 2 — documented as "a deadline **overlay**, not a pipeline stage" |
| 6 | Ownership / assignment | `work_assignments.assigned_tech_id / assigned_packer_id` | staff-scoped queries | N staff |
| 7 | Carrier status category | `SHIPMENT_STATUS_CATEGORIES` | `order-lifecycle.ts` | 8 |

### 3.2 The asymmetry that we believe is the root cause

Two of these are *exception conditions* that can co-occur with any pipeline position: **out of stock** and **urgent**. The codebase models them in two incompatible ways:

- **Out of stock is folded INTO the stage enum** as `BLOCKED`, so it is mutually exclusive with `PENDING` and `TESTED`.
- **Urgent is a boolean OUTSIDE the enum**, so it is invisible anywhere the enum is rendered.

The consequence is provable from the rule order. `UNSHIPPED_LIFECYCLE_RULES` (`order-lifecycle.ts:79`) is first-match-wins:

```ts
{ id: 'packed_staged', stage: 'PACKED_STAGED', test: (s) => Boolean(s.packedAt) },
{ id: 'out_of_stock',  stage: 'BLOCKED',       test: isOutOfStock },
{ id: 'tech_passed',   stage: 'TESTED',        test: (s) => Boolean(s.hasTechScan) },
{ id: 'labeled',       stage: 'PENDING',       test: hasLabel },
```

and the lane narrowing is the same shape:

```ts
if (isOutOfStock(signals)) return 'BLOCKED';
if (signals.hasTechScan)   return 'TESTED';
return 'PENDING';
```

**So an order that has passed its tech scan AND is out of stock resolves to `BLOCKED`, and its tested-ness is destroyed by the projection.** The operator cannot see, filter, or count "tested but blocked" — a real and operationally meaningful set (it is ready to pack the moment stock lands). Precedence is collapsing a two-dimensional truth into a one-dimensional token.

Meanwhile urgency, which is *equally* an overlay, never enters the token at all — so it survives as a filter but cannot be displayed.

Note the module authors were explicit that lateness is an overlay ("a deadline overlay, not a pipeline stage"). The question this brief exists to answer is why out-of-stock was not given the same treatment, and what the right general rule is.

### 3.3 Where this identity is rendered or filtered — seven surfaces

| Surface | Vocabulary it uses | Path |
|---|---|---|
| Lifecycle tab bar | `DashboardOrderView` = `unshipped · tested · packed · shipped · fba` | `src/utils/dashboard-search-state.ts:15` |
| Sidebar "Focus" list | flat radio: `all · mine · attention · BLOCKED · PENDING · TESTED` | `src/components/unshipped/OutboundSidebarFilterMap.tsx:58` |
| Header filter popover | `All on tab · Urgent · Out of stock` | `src/components/dashboard/OutboundFilterStrip.tsx:241` |
| Zap toggle | urgent only | same file, :229 |
| KPI strip tiles (click-to-filter) | `filterUstatus` \| `filterAttention` \| `filterState` | `src/components/dashboard/OutboundKpiStrip.tsx` |
| **The grid itself** | **none** — see §4.2 | `src/lib/dashboard-order-row-layout.ts:93` |
| Persisted read-model | `feed_memberships.state` — the 3-value lane only | `src/lib/orders/feed-membership-projection.ts` |

**The sidebar Focus list is the clearest artifact of the problem.** It presents six mutually-exclusive radio options that are actually drawn from **three orthogonal axes** — ownership (`all`/`mine`), urgency (`attention`), and lane (`BLOCKED`/`PENDING`/`TESTED`). Because they share one selection slot, "my urgent orders" and "urgent and out of stock" are unaskable questions.

### 3.4 Mutual exclusion is enforced in code, not merely implied

`useToShipFilterActions` (`OutboundFilterStrip.tsx:71–147`) writes the URL such that every facet deletes the others:

```ts
toggleUrgent()  → p.set('attention','1'); p.delete('ustatus'); p.delete('stage'); p.delete('late');
toggleBlocked() → p.set('ustatus','BLOCKED'); p.delete('stage'); p.delete('attention');
selectAll()     → p.delete('ustatus'); p.delete('stage'); p.delete('late'); p.delete('attention');
```

Five URL params (`?ustatus= ?attention= ?stage= ?late= ?ostatus=`) encode fragments of one identity, and no two may be set at once. **This is the display limitation expressed as a routing rule**: the filter model forbids intersections because the display model cannot represent them.

### 3.5 The counts API cannot answer an intersection either

`/api/orders/queue-counts` (`src/app/api/orders/queue-counts/route.ts:66`) does:

```sql
SELECT has_tech_scan, o.is_out_of_stock AS blocked,
       COUNT(*)::int AS n,
       COUNT(*) FILTER (WHERE o.is_urgent)::int AS urgent_n
FROM orders o … GROUP BY 1, 2
```

and the handler then **sums `urgent_n` across all combos into one flat scalar**, commented as "orthogonal to the PENDING/TESTED/BLOCKED lane mapping." The cross-product is computed in SQL and then discarded in Node. "How many urgent orders are also out of stock" is not derivable from the payload the UI receives, even though the query that produced it knew.

---

## 4. The four concrete defects

Please rule on which are symptoms of §3.2 and which are independent.

### 4.1 The Fields menu advertises a Status field that cannot exist

The per-staff column picker (`GridFieldsMenu`) is generated **entirely from the grid descriptor** — a column is offered iff it carries a `hideKey`. The `orders` entry in the shared column registry (`src/lib/tables/table-columns.ts:110`) lists:

```ts
orders: [META_STATUS, META_QTY, META_CONDITION, META_REST, CHIP_PLATFORM, CHIP_ORDERID, CHIP_TRACKING]
```

but `ORDERS_QUEUE_COLUMNS` (`src/lib/dashboard-order-row-layout.ts:93`) contains **no column with `hideKey: 'status'`**, `'platform'`, or `'rest'`. The menu therefore renders exactly four rows — Qty, Cond, Order, Tracking — and there is no code path by which Status could ever appear. Two registries disagree and neither is wrong on its own terms; they are just not the same registry.

There is also a **dead accessor**: `orders-queue-column-defs.ts:46` defines sort math for `case 'status':` returning `{ hasTechScan, isOutOfStock }` — an **object**, which no comparator can order — and `OrdersQueueColumnKey` (`dashboard-order-row-layout.ts:27`) still declares `'status'` and `'platform'` as valid keys. Both are vestigial: the column model's docblock records the decision, *"Status + Platform columns retired — lifecycle tabs (Pending · Tested) own the lane."*

**So the deliberate design decision was: the tab bar IS the status column.** That decision is what the owner is now pushing back on. Please evaluate it on the merits.

### 4.2 An urgent order is completely invisible in the grid

Grepping the entire orders-queue component tree for `urgent` / `is_urgent` returns **zero hits**. `is_urgent` is selected by the API (`src/app/api/orders/route.ts:425`), counted for the KPI strip and the sidebar, and filterable — but never rendered on a row. An operator looking at the Pending table cannot tell an expedited order from a normal one. The only way to see urgency is to *filter the other orders away*, which destroys the comparison.

Out-of-stock does slightly better: it renders as a **rose corner triangle** on the frozen Product cell (`OrdersQueueTableRow.tsx:437`, an Excel/Sheets corner-note vocabulary, deliberately chosen for "sparse facts that never earn a column"). It is not sortable, not in the Fields menu, and shares its only affordance with the note indicator on the opposite corner.

### 4.3 Semantic tone has already drifted

`src/lib/unshipped-state.ts` declares an invariant in its own header: *"no two status dots across BOTH models share a hue."* The label registry (`src/lib/labels/registry.ts:70`) seeds `BLOCKED → tone: 'red'`.

The sidebar Focus list paints **`BLOCKED` as `text-amber-700`** when its count is non-zero (`OutboundSidebarFilterMap.tsx:92`) — and paints **Urgent `text-amber-700`** too (:76). So on that surface the two exception conditions are the same color as each other, and neither matches the registry. This is what happens when a fact has no single presenter: each surface picks its own emphasis.

### 4.4 Precedence silently discards information

Per §3.2 — `TESTED ∧ BLOCKED` renders and counts as `BLOCKED`. Same for the persisted `feed_memberships.state`, which stores the collapsed lane, so the loss is now materialized in a read-model that other features will build on.

---

## 5. House laws you must not break (or must explicitly argue against)

These are enforced by CI guards, not prose. Baselines only shrink.

1. **Compose the SoT, or grow the SoT — never fork it page-locally.** A "just for this table" tone map or second state enum is banned. *Improving* the shared primitive so every caller inherits is the sanctioned path and is encouraged.
2. **Color only from semantic tokens** (`text-text-{success,warning,danger,info,…}`, `bg-surface-*`, `border-border-*`). No page-local hex. **8 themes ship, including dark — every color proposal must survive a theme swap.**
3. **Font weight capped at 600.** The 700 cut is not loaded. Emphasis must come from **contrast, hue, and tracking — never ink weight.**
4. **One family (IBM Plex), three cuts.** Condensed is intrinsic to `text-role-eyebrow` / `-micro`; mono for identifiers. Pick a role, not a family.
5. **Selection is background + ring only — never a height shift.** Row height identical across default/hover/focus/selected.
6. **Action planes.** Every action belongs to exactly one primary plane: in-cell · row-scoped · multi-select · record. The record inspector must stay a **complete superset** of editable fields.
7. **Actions diverge by lifecycle stage; column layout diverges only by data domain.** All four outbound tabs share one grid and one persisted column layout. **A Pending-only column model is a house-law violation unless argued explicitly.** This is a hard constraint on any "add a Status column to Pending" answer — and note the `?tested` lane deliberately *dropped* a status pill as redundant ("every row here is TESTED, so show *who* and *when* instead").
8. **Views are dumb; presentation kinds resolve via a SoT.** A component may never invent a state→label or state→hue map. Labels/tones/descriptions come from `src/lib/labels` and are **tenant-overridable at runtime** — any vocabulary you propose must survive a tenant renaming "Out of stock" to something else.
9. **URL is the state SoT for a Workbench.** Durable selection and filters belong in `searchParams` so a reload or a shared link reproduces the view.

---

## 6. Questions we want answered

### 6.1 The model

- **What is the 2026 dominant pattern for multi-axis entity state?** Candidates we can see: (a) one enum with precedence (today); (b) a **primary stage + a set of orthogonal flags/tags**; (c) fully **faceted** state where nothing is primary; (d) a **status + reason-code** pair; (e) state machine position + independent "conditions" in the Kubernetes sense. Name the dominant pattern in comparable systems — issue trackers (Linear/Jira status vs labels), fulfillment/WMS (ShipStation, Shopify's separate `financial_status` / `fulfillment_status`, NetSuite), CI (GitHub checks: conclusion vs annotations), and Kubernetes conditions. Which generalizes to a warehouse dispatch queue, and why?
- **Is `BLOCKED`-in-the-enum simply wrong?** Should out-of-stock be demoted from a stage to a flag alongside urgent and late — making the stage axis purely *progress* (`AWAITING_LABEL → PENDING → TESTED → PACKED_STAGED`) and everything else an overlay? What breaks if we do (counts, the persisted `feed_memberships.state`, the sidebar, three months of saved bookmarks)? Is there a defensible reading in which out-of-stock genuinely *is* a pipeline position and urgency genuinely is not?
- **How many axes can an operator hold?** If the answer is "primary stage + flags," what is the evidence-based ceiling on simultaneously-displayed flags per row before scan performance collapses?
- **Derived vs stored.** Every state here is derived at read time from raw signals; nothing is stored except the projected lane in `feed_memberships`. What are the failure modes of presenting a derived state as authoritative, and does a flags model make that better or worse?

### 6.2 The display

- **How do you render a stage + 2–3 flags in one dense row?** Candidate encodings, please rank with evidence: a status pill; a dot; a **left row rail** (edge bar); a **row tint**; a dedicated flags column of small glyphs; corner indicators (today's choice for OOS); trailing chips. Which of these compose — i.e. which can carry *two* facts at once without becoming a checkerboard — given the grid already runs a full cell-rule system **and** zebra striping (the predecessor brief's §5.1)?
- **Should stage and exception share an encoding or use different ones?** There is an argument that progress (ordinal, always present, low information) and exception (boolean, rare, high information) deserve *categorically different* visual channels — e.g. position/dot for stage, color/glyph for exception — so that a rare thing never has to compete with a ubiquitous one. Is that the right split?
- **Color budget.** House law 3 removes weight as an emphasis tool, so hue and contrast are all we have. What is the ceiling on chromatic elements per row? If `TESTED ∧ BLOCKED ∧ urgent` is real, what does that row look like without being a rainbow — and what is the **precedence rule for which flag wins the loudest channel** when several are set?
- **WCAG.** At `ops` density with 10–12px type, what contrast floors apply, and does state-as-color require a redundant non-color encoding (glyph, position, text) to satisfy 1.4.1? Note the tone vocabulary is tenant-overridable, so a tenant can pick a failing pair — is that a validation problem we must solve at the registry?
- **House law 7 collision.** All four outbound tabs share one column layout. A Status column is redundant on `?tested` (every row is TESTED) but load-bearing on Pending. Options: one shared column that renders differently per lane; per-lane column divergence (a law change); or a non-column encoding (rail/tint) that is free on every lane. **Pick one and defend it** — this is the single most consequential ruling in the brief.

### 6.3 The filter and count chrome

- **What does faceted filtering look like once facets stop being exclusive?** Today: one lifecycle tab + one mutually-exclusive refine. If flags become independent, the operator can express `Pending ∧ urgent ∧ ¬blocked`. What is the 2026 standard chrome for that in an ops table — additive filter chips with an AND rail, a faceted sidebar with checkboxes and live counts, a query-language input, or a saved-view model? What does it cost the "glance and act" operator who never wanted a query builder?
- **Counts.** Faceted UIs conventionally show a live count beside every facet. Our counts endpoint already computes the cross-product and throws it away (§3.5). If facets become independent, do counts become **conditional** (recomputed against the current selection, Airbnb/e-commerce style) or **absolute**? What is the standard, and what does it cost in query complexity?
- **The sidebar Focus list** currently flattens three axes into one radio. Should it become three grouped sections (Scope / Stage / Flags), collapse into the header chrome entirely, or something else? Note the sidebar and the header filter popover and the KPI tiles are **three chrome surfaces writing the same URL params** — is that redundancy itself a defect?

### 6.4 Sort

Sortable columns today are `title · date · age · qty · condition · order · tracking`. **You cannot sort by state or urgency.** If a Status axis lands, is it sortable, and by what order — enum ordinal, operational priority, or is sorting by a low-cardinality categorical simply the wrong affordance (should it group instead)? The grid already supports collapsible group rows and day bands.

---

## 7. Tensions to adjudicate — pick a side, do not split the difference

1. **"The tab bar is the status column" vs. a per-row status encoding.** The retirement of the Status column was deliberate and reasoned. Is it right? A tab bar shows the *filter*, not the *row* — but if every visible row shares a state, per-row repetition is pure noise. Where is the line?
2. **Precedence vs. multiplicity.** One token per row is scannable but lossy; N flags per row is complete but noisy. Which does a warehouse operator at 3 ft actually need?
3. **Corner indicators vs. a real column.** The corner-triangle vocabulary was chosen so sparse facts "never earn a column." Is that principle sound, or is it how urgency ended up invisible? What *is* the density threshold at which a fact earns a track?
4. **Model purity vs. migration cost.** Demoting `BLOCKED` to a flag is the clean model, but it is a projected value already materialized in `feed_memberships.state`, encoded in `?ustatus=BLOCKED` bookmarks, and seeded in a tenant-overridable label registry. Is the clean model worth it, or is there a compatible layering (keep the collapsed lane as a *derived convenience*, add the flags beside it)?
5. **Urgency as flag vs. urgency as priority score.** `is_urgent` is a boolean, but the queue's default sort is already called **"Priority (due soon)"** and is computed from the deadline. Two notions of priority coexist. Should they be unified into one score (which would make urgency sortable and rankable), or kept as an explicit operator override distinct from a computed one?

---

## 8. Deliverable format

Please return, in this order:

1. **Executive verdict** — ≤10 lines. Is the root problem (a) one enum doing the job of three axes, (b) seven chrome surfaces with no shared presenter, (c) a display gap only (the model is fine, the grid just renders none of it), or (d) something we have not named? One primary diagnosis, ranked.
2. **Industry survey** — the 2026 pattern for multi-axis entity state and its display, with named products and citations. Flag anything that changed since ~2022. Be specific about which of those systems are *dispatch queues* rather than issue trackers, since the reader is standing in a warehouse.
3. **Target state model** — the axis inventory you recommend: for each axis, its vocabulary, whether it is primary or overlay, derived or stored, and its display channel. Include what happens to `AWAITING_LABEL`, `PACKED_STAGED`, and the 7-value `OutboundStage`, which this brief has mostly left alone.
4. **Display spec** — concretely: what a Pending row looks like for `PENDING`, `TESTED`, `BLOCKED`, `urgent`, `late`, and the combinations `TESTED ∧ BLOCKED` and `PENDING ∧ urgent ∧ late`. State the channel (rail / dot / pill / glyph / tint), the token, and the precedence when channels compete.
5. **Chrome spec** — the filter, count, and sort model that follows, including what happens to the sidebar Focus list, the header popover, and the five URL params.
6. **Token / SoT deltas** — every new or retuned semantic token, registry entry, or shared presenter, named against the modules in §3. Flag each as a **promotion** (improves the shared SoT, all callers inherit) or **scoped**. The house strongly prefers promotions.
7. **Sequenced plan** — phased, each phase independently shippable and revertible, cheapest-high-value first. Call out explicitly anything requiring a **data-model or migration change** (e.g. `feed_memberships.state`) or a **URL-compat shim** for existing bookmarks.
8. **What you would NOT do** — the plausible-sounding moves you reject and why. We have a standing bias against conservative reskins that leave the root cause untouched, and an equal bias against rewrites that trade a working lossy model for an unshipped pure one.

**Three standing instructions.** (1) Where a recommendation conflicts with a house law in §5, say so **by number** and argue the case — the laws are evolvable, but only against a stated argument. (2) Do not import a foreign design system wholesale; naming what Linear/ShipStation/Airtable do is exactly right, telling us to look like them is not. (3) If you conclude the owner's literal request (a Status column in the Fields menu) is the wrong fix, say what he is **actually right about underneath it** — the underlying complaint (an urgent order is invisible, and you cannot ask for two conditions at once) is real regardless of the remedy.
