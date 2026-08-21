# Deep-research brief — displaying a serialized UNIT (and a SKU) as a preview surface

**Paste the "Brief for the researcher" section below into Gemini Pro Deep Research.**
Everything above it is internal context for whoever runs it.

---

## Why this exists (internal)

We just ported `/search?sel=order:` off a hand-rolled twin onto the real scan-station
composition (`OrderStationPane`, `stance: 'preview'`): station identity bar on top,
ops-flow centre, right-edge Displays column of reference leaves. `unit` and `sku` are
next, and they are **not** the same problem as `order`.

The forcing fact: **a serialized unit is the most connected entity in our schema — 24
tables carry a `serial_unit_id` FK**, spanning receiving, orders, repair, warranty,
testing, labels, FBA, placement, provenance, condition history, stock ledger and
workflow. It also moves through a **22-state lifecycle** with an explicit transition
allow-list. Scanning one serial number legitimately answers a dozen different questions.

A SKU is a different animal wearing similar clothes: a *type*, not an instance. It has
no lifecycle and no single location — it has aggregate stock across bins and a catalog
identity. The open risk is that "one display page for both" is a category error we only
discover after building it.

### The specific proposal on the table

> One display page. Middle = the item's exact status display + a photos component with a
> popover viewer. Right rail = the exact context for each connection.

We think that is close to right, with one correction (below), but we want outside
evidence before committing, because getting the *primary surface* wrong on the most
connected entity in the system is expensive to unwind.

### Our current recommendation (the thing to attack)

- **One HOST, two CENTRES.** Reuse the station host for both, but do not force one
  centre. Unit centre = **lifecycle spine** (where it is in the 22-state graph) + photos.
  SKU centre = **aggregate stock by location** + units roll-up. Same chrome, different
  ops-flow.
- **Status is the spine; connections are the leaves.** The centre answers "what is this
  and where is it now"; each relationship family (Carton · Order · Repairs · Warranty ·
  Tests · Locations · Labels) is a right-edge leaf, gated by presence, with an index that
  states absence honestly ("No repair on file") rather than hiding it.
- **Connections are temporal, not a flat list.** A unit passed *through* a carton, was
  allocated to *an* order, went to repair *twice*. A flat equal-weight list of related
  records throws that away.

We are least confident about the third point, and about whether the lifecycle spine or a
relationship hub should be the primary surface.

---

## Brief for the researcher

### Role and goal

You are researching **interface design for high-fan-out, serialized physical assets** in
operational software. Produce an evidence-based recommendation for how to display a
single serialized unit (identified by serial number) on a read-only "preview" surface
used by warehouse and repair-shop operators.

### The concrete situation

A multi-tenant reseller-operations web app (used-goods resale: intake, testing, grading,
repair, listing, fulfillment, returns). An operator scans or searches a serial number and
lands on a preview surface. Constraints that are fixed and not up for research:

- Desktop, dense, keyboard- and scanner-driven. Not mobile-first, not a consumer app.
- The layout frame is fixed: a left rail of recent items, a centre work surface with a
  ~720px minimum, and a single right-edge column that *pushes* the centre (never floats
  over it). There is exactly one right edge; a second one is prohibited.
- The surface is **read-only in the centre**. Editing happens in the right column.
- Operators are trained and repeat this task hundreds of times a day. Optimizing for
  first-time legibility at the cost of expert speed is the wrong trade.

The entity being displayed:

- **22 lifecycle states** with an explicit allowed-transition graph (e.g. RECEIVED →
  TRIAGED → IN_TEST → GRADED → STOCKED → ALLOCATED → PICKED → PACKED → SHIPPED, plus
  RETURNED / RMA / IN_REPAIR / ON_HOLD / SCRAPPED branches, with legal rewinds).
- **24 distinct relationship families**, of which any given unit will have some subset:
  intake carton, purchase order, sales order allocation, repair jobs (0..n), warranty
  claims, test results and failure tags, quality scores, condition history, physical
  placements/locations over time, printed labels, FBA shipment membership, provenance,
  stock ledger entries, workflow runs.
- Photos attached at several stages (arrival, carton, item, testing, packing).

### The decision to inform

**What should the PRIMARY surface be for this entity, and how should its many
connections be organized around it?**

Candidate shapes we have identified (evaluate these, and propose better ones if the
evidence supports them):

1. **Lifecycle spine primary** — the centre is the unit's position in the state graph
   rendered as a stepper/pipeline, with history. Connections live in a secondary column.
2. **Relationship hub primary** — the centre is a map of related records grouped by
   family; lifecycle is one card among many.
3. **Chronological journey primary** — the centre is a single merged timeline of
   everything that ever happened, filterable by axis (order / serial / tracking / unit).
   (We already have a timeline engine with exactly these four grouping dimensions.)
4. **Hybrid**: spine + photos in the centre, connections as gated leaves on the right.

### Research questions

Answer these specifically, with sources and concrete product examples where possible.

1. **Prior art.** How do mature systems display a single serialized asset with many
   relationships? Look at WMS/IMS (Manhattan, Blue Yonder, Fishbowl, Katana), field
   service and asset management (ServiceNow CMDB/ITAM, Maximo, UpKeep, Limble),
   device/repair (Apple GSX-style repair lookups, Salesforce Field Service asset
   records), and logistics track-and-trace. For each: what is the primary surface, what
   is demoted, and what do practitioners complain about?
2. **Spine vs hub.** Is there research or strong practitioner consensus on whether
   *state* or *relationships* should lead for an operator answering "what is this and
   what do I do with it"? Under what task conditions does each win?
3. **High fan-out disclosure.** What are the established patterns for an entity with
   ~20 possible related-record types where a typical instance has only 4–8? Specifically:
   presence-gating (hide empty), honest-absence (show empty with "none"), or lazy
   grouping. What is the evidence on operator trust when sections are hidden vs shown
   empty? We currently believe honest-absence beats hiding, and want that challenged.
4. **Temporal relationships.** How do systems represent that a relationship *was* true
   (unit was in carton X, was allocated to order Y that got cancelled) versus *is* true?
   Is there a pattern better than a timeline for "this unit's relationships over time"?
5. **Type vs instance.** For catalog systems that have both a product/SKU record and a
   serialized-instance record: do they share one detail layout or diverge? What breaks
   when they are forced to share? This is the specific risk we are trying to price.
6. **Photos in an ops context.** For evidence photos attached at multiple lifecycle
   stages, what is the established pattern — inline strip with a lightbox popover,
   dedicated tab, or stage-grouped gallery? Does stage grouping earn its complexity?
7. **Scan-driven entry.** Does the surface change when the operator arrives by *scanning*
   a barcode rather than clicking a search result — i.e. they already know what the item
   is and want one specific fact fast? Any evidence on what that fact usually is?

### What would change our mind

Be explicit about disconfirming evidence. Specifically call out if you find that:

- Relationship-hub-primary reliably beats lifecycle-primary for serialized assets.
- Presence-gating (hiding empty sections) measurably outperforms honest-absence.
- Type and instance records successfully share one layout in mature systems.

### Deliverable format

1. **Recommendation** — one paragraph, committing to a primary surface and a
   connection-organization strategy. No hedging.
2. **Evidence table** — candidate shape × system that uses it × observed outcome ×
   source.
3. **The unit answer** — a described layout (regions, what is in each, what is gated),
   specific enough to implement.
4. **The SKU answer** — same, and an explicit verdict on whether it shares the unit
   layout.
5. **Risks and disconfirming evidence** — what the research argues *against* our current
   recommendation.
6. **Open questions** research could not settle, and what experiment would settle them.

Prefer primary sources, product documentation, and practitioner writing over listicles
and vendor marketing. Where you find no evidence, say so plainly rather than inferring.
