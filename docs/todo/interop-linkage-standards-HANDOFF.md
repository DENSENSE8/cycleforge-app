# Interop linkage standards — HANDOFF

**Date:** 2026-08-01 · `main` · **Lane:** WS-DOGFOOD
**Status:** Not started. This document is the whole brief; there is no separate PLAN.
**Hard constraint:** **ZERO migrations.** Not "few" — zero. If a phase cannot be done
without one, it STOPS and asks (see [Phase 0](#phase-0--the-identifier-survey-do-this-first)).

---

## The job in one sentence

Cycle Forge already has a rich entity graph; **nothing in it names an external standard**,
so a customer's WMS, ERP, 3PL or AI agent cannot traverse it without a bespoke integration
per customer. This lane adds a **vocabulary + projection layer** that maps what already
exists onto named, dated, versioned industry standards — making the product *expandable by
the customer* instead of extensible only by us.

**It adds no tables, no columns, and no facts.** Every phase is a pure mapping module plus
a read-only projection route over rows that are already there. That is what makes "zero
migrations" a real constraint rather than a wish: the deliverable is a *reading* of the
existing graph, not a new one.

---

## Why now, and why this is not speculative

**EU ESPR reached full application on 19 July 2026** — two weeks ago — and the EU Central
DPP Registry is live. Textiles, electronics, construction products and furniture are the
priority sectors, with obligations landing through delegated acts; the first hard deadline
is the battery passport on 18 February 2027. Crucially for a reseller: **a Digital Product
Passport is explicitly updated to reflect repair, refurbishment, resale and recycling** —
which is precisely the event stream this product already records and currently exposes to
nobody.

The EU guidance builds on GS1 rather than a new scheme, because ~2M companies already use
GS1 identifiers. So the standards below are not a taste choice; they are the ones a
customer's compliance team will ask for by name.

---

## The standards — exact names, versions, and URI forms

Do **not** paraphrase these into the code. Where a URI form is given, that literal string is
what goes in the mapping module.

### GS1 EPCIS 2.0 + CBV 2.0 (both ratified June 2022)

The event model. Every EPCIS event answers five dimensions — **what · when · where · why ·
how**. Five event types:

| Type | Means | Cycle Forge analogue |
|---|---|---|
| `ObjectEvent` | presence/absence of objects at a time and place | a serial scanned at a station |
| `AggregationEvent` | children packed into / unpacked from a parent; **reversible** | units into a carton; units into an FBA shipment |
| `TransactionEvent` | objects associated/disassociated with a business transaction | line ↔ PO, unit ↔ sales order |
| `TransformationEvent` | inputs consumed, outputs produced | repair: parts in, unit out |
| `AssociationEvent` | **new in 2.0** — permanent/semi-permanent attachment | handling unit ↔ tote, sensor ↔ asset |

> `TransactionEvent` is *seldom needed*: because business transactions ride in the **why**
> dimension of every other event type, prefer an `ObjectEvent` carrying `bizTransactionList`
> over a bare `TransactionEvent`. Getting this wrong produces a technically-valid feed that
> no partner's system reads the way you meant.

**CBV 2.0** supplies the controlled vocabulary for `bizStep` and `disposition`. EPCIS 2.0
permits **two** URI forms and they are not interchangeable across partner versions:

```
legacy URN (1.2 and 2.0):   urn:epcglobal:cbv:bizstep:receiving
Web URI (2.0 only):         https://ref.gs1.org/cbv/BizStep-receiving
```

A 1.2 partner will reject the Web URI form. **Emit the URN by default and make the Web URI
an opt-in per connection** — do not pick one globally.

`bizStep` values this product plausibly emits: `receiving`, `inspecting`, `repairing`,
`packing`, `shipping`, `storing`, `picking`. `disposition` values include `active`,
`in_progress`, `in_transit`, `expired`, `recalled`, `retail_sold`, `stolen`.

**Do not hand-type the value lists into the mapping module from this document.** Both
sections (CBV §7.1.3 bizStep, §7.2.3 disposition) are normative tables in the GS1 PDF, and
this brief lists only examples. Pull the full lists from the standard and pin them with a
guard, the same shape as `photo-aspect-vocabulary.guard.test.ts` from the guided-procedure
lane.

### GS1 identification keys

| Key | Identifies | Application Identifier |
|---|---|---|
| **GTIN** | a trade item (the product model) | `(01)` |
| **SSCC** | a logistic unit — a specific carton/pallet in a shipment | `(00)` |
| **SGTIN** | GTIN + serial — *this individual unit of this product* | — |
| **GIAI** | an individual asset, any type (fixed/own equipment) | — |
| **GRAI** | a returnable asset type, optionally + serial (totes, crates) | — |

**SGTIN is the interesting one for a reseller** — a serialized used unit is exactly
"GTIN + serial", which is what `serial_units` already is minus the GTIN half.
**GRAI** is the honest key for handling units / totes (`H-####`), not GIAI.

### GS1 Digital Link

The URL-shaped data carrier: a QR encoding a resolvable HTTPS URL built from GS1 keys, so
one code serves consumer info, regulatory compliance, resale verification and recycling
guidance with persona-based access. This is the EU's referenced DPP carrier (QR per
ISO/IEC 18004). The repo already has a GS1 Digital Link parser
(`src/lib/scan-resolver.ts` → the "GS1 DIGITAL LINK + INTERNAL URL PARSER" section) —
**compose it, do not write a second one.**

### X12 EDI 856 — Advance Ship Notice

The inbound/outbound document every 3PL and retail partner speaks. Its whole content is a
**hierarchy declared in the `HL` segment**, where `HL03` is the level code:

```
HL*1**S      Shipment
└─ HL*2*1*O  Order      (PO reference)
   └─ HL*3*2*P  Pack    (carton)
      └─ HL*4*3*I  Item (product detail)
```

Common shapes: **SOPI** (retail, the default), **SOTI** (pallet — `T` = Tare), **SOTPI**
(mixed pallets), **SOI** (drop-ship, no pack level). The HL loop repeats up to 200,000
times.

**This maps onto Cycle Forge almost exactly as-is** — shipment → `shipping_tracking_numbers`,
order → `receiving_line_zoho` / `orders`, pack → `receiving_carton`, item →
`receiving_line`. That correspondence is the single strongest argument that this lane needs
no migrations.

### OpenLineage

Already cited by this repo in `src/lib/stations/data-lineage.guard.test.ts` (which
deliberately chose **table-level** lineage over column-level, matching dbt's native lineage
and OpenLineage keeping column lineage an *optional* facet). Extend that citation into an
actual emission format:

- Metadata attaches as **facets** on three entities: **job**, **run**, **dataset**.
- **Custom facets MUST carry a distinct project prefix** — class `{prefix}{name}{entity}Facet`
  (PascalCase), key `{prefix}_{name}` (snake_case), e.g. `cycleforge_procedure`. A facet
  without a prefix collides with the standard set.
- A facet's `_schemaURL` must be an **immutable** pointer — a git SHA, never a branch.

### EU ESPR / Digital Product Passport

Not a data format you emit yet — a **destination** the above three feed. Dates in
"[Why now](#why-now-and-why-this-is-not-speculative)". Treat DPP as the reason the mapping
must be standards-named rather than internally-shaped, and stop there for this lane.

---

## Phase 0 — the identifier survey (DO THIS FIRST)

**This phase is a decision gate, not a build step. It can end the lane.**

Every standard above is a *vocabulary over identifiers*. Cycle Forge stores plenty of
identifiers; the open question is whether it stores the **GS1** ones. Answer these five, in
the repo, before writing any mapping code:

1. Is there a **GTIN / UPC / EAN** anywhere on `sku_catalog`, `items`, or `sku_platform_ids`?
2. Is there an **SSCC** or any carrier-independent carton id, or is `receiving_carton.id` the
   only handle?
3. Does `handling_units` carry anything GRAI-shaped, or only the internal `H-####`?
4. What does `shipping_tracking_numbers` carry beyond the carrier's own number?
5. Does `organizations.settings` already hold a GS1 Company Prefix for any tenant? (Almost
   certainly not — it is required to *mint* any GS1 key.)

**The rule:** where an identifier home exists, map to it. Where one does not:

- **Do NOT add a column.** That breaks the lane's one hard constraint.
- **Do NOT mint a fake key.** A GS1 key without a real GS1 Company Prefix is not a GS1 key;
  emitting one is a compliance claim the tenant cannot back, and it will be scanned by
  someone else's system as a collision against a real company's prefix. This is worse than
  emitting nothing.
- **Emit the field as absent**, and record the gap in the report. EPCIS, EDI and DPP all
  tolerate an absent optional identifier; none tolerate a wrong one.
- If a phase turns out to need an identifier home that does not exist, **stop and hand back**
  with the specific column and the reason. A migration is a legitimate answer — it is just
  not this lane's answer.

Expected honest outcome: **GTIN probably has a home or a near-home; SSCC and the GS1 Company
Prefix almost certainly do not.** Design for that — the ASN/EPCIS projections must be useful
with internal identifiers and *upgrade* to GS1 keys per tenant when a prefix is configured.

---

## Phases

Each ships alone. None writes to the database.

### P1 — the vocabulary SoT · `src/lib/interop/` (pure, client-safe)

New modules, no DB, no server-only imports — the same shape as
`src/lib/photos/photo-aspects.ts`:

- `epcis-vocabulary.ts` — the CBV `bizStep` / `disposition` unions, both URI forms, and
  `cbvUri(term, form)`. **A parse of an unknown term returns `null`, never a default**
  (`.claude/rules/backend-patterns.md` — a classification that decides what a write may
  claim is never defaulted; this repo has paid for that three times now: `intakeSurface`,
  `scanKind`, and the aspect vocabulary).
- `gs1-keys.ts` — key types + Application Identifiers + a `hasCompanyPrefix(org)` guard that
  makes minting impossible without one.
- `edi-hierarchy.ts` — the `S/O/T/P/I` level codes and the SOPI/SOTI/SOTPI/SOI shapes.

**Map, never re-derive.** Cycle Forge's own status vocabularies already exist
(`workflowStageDot`, the lifecycle registries, `receiving-type-meta`, `conditions.ts`).
This layer is a *translation table between two named vocabularies* and must import both
sides rather than restating either. A `bizStep` map that hardcodes Cycle Forge status
strings is a second status vocabulary and will drift the first time a lifecycle changes.

**Guard:** `interop-vocabulary.guard.test.ts` — every CBV term this repo can emit is in the
CBV list; every Cycle Forge lifecycle state maps to exactly one `bizStep` or is explicitly
declared unmappable. A silently unmapped state is a hole in the feed.

### P2 — the EPCIS event projection (read-only)

`src/lib/interop/epcis-projection.ts` + `GET /api/interop/epcis`.

Project **existing** rows into EPCIS events. The source rows are already there:
`inventory_events` (the lifecycle spine), `receiving_scans`, `serial_unit_provenance`,
`receiving_triage` / `receiving_unbox`, `packing_logs`.

- `Deps`-injected, org-scoped through `withTenantTransaction`, `{ permission: 'receiving.view' }`
  or a new read permission — **register it in `permission-registry.ts` AND
  `route-permission-manifest.test.ts` in the same change** or `npm run verify` fails on drift.
- **`when` is the server instant, never a device clock.** The guided-procedure lane already
  settled this for `photos.client_captured_at`; the same rule holds here and for the same
  reason — a drifted tablet yields a wrong-but-plausible time, and an EPCIS feed is
  precisely the artifact someone will argue a dispute from.
- **`where` needs a GLN and almost certainly has none.** Emit `bizLocation` only when the
  tenant has configured one; omit otherwise. See Phase 0's rule.
- Paginate. This is an event stream over the whole tenant history; an unbounded projection
  is a Neon CU-hour incident, and `neon-cost-reviewer` should see this phase.

### P3 — the ASN (EDI 856) projection

`src/lib/interop/asn-projection.ts` + `GET /api/interop/asn/[shipmentId]`.

Emit the **HL hierarchy as JSON**, not as an X12 envelope. Cycle Forge is not an EDI VAN and
should not grow a segment serializer; every customer already has a translator that takes
structured JSON. Shipping raw X12 would be inventing a second integration surface to
maintain forever.

Pick the shape from the data: `SOI` when there is no carton level, `SOPI` when there is,
`SOTI`/`SOTPI` only if pallets ever appear (they may not — check before building for them).

### P4 — lineage facets on the existing declarations

The station/procedure declarations (`src/lib/stations/procedure.ts`) already carry
`reads`/`writes` table lineage that `data-lineage.guard.test.ts` verifies against real SQL.
Emit those as **OpenLineage-shaped facets** under a `cycleforge_` prefix.

This is the smallest phase and the highest leverage: the lineage is already declared,
already guarded against drift, and currently readable only by this repo's own Studio lens.
**Stay table-level** — the guard's docblock explains at length why column lineage that fails
open recreates the untrusted map it exists to prevent. Do not "upgrade" it here.

### P5 — the AI/agent read (the same projection, one more consumer)

Do **not** build an agent-specific graph. The interop projection *is* the agent-legible
graph; the work is exposing it through the waist that already exists:

- `SearchHit` (`src/lib/search/search-hit.ts`) currently spans
  `order | unit | receiving | sku | repair | fba`. Standard identifiers ride as *fields* on
  the existing hit, never as a sixth engine.
- `hybridSearch` / `POST /api/ai/retrieve` stay the only cross-entity search. The AGENTS.md
  hard law — *never build a second search engine* — is not relaxed by the word "interop".

---

## Do NOT

- **Add a migration.** The constraint is the deliverable. If you need one, hand back.
- **Mint a GS1 key without a configured GS1 Company Prefix.** See Phase 0.
- Emit a `client_captured_at`-style device clock as an EPCIS `eventTime`.
- Build an X12 segment serializer, a second search engine, or a second lineage vocabulary.
- Hardcode CBV term lists from *this document* — it lists examples, not the normative tables.
- Pick one CBV URI form globally; 1.2 partners reject the Web URI form.
- Touch the Unbox guided-procedure lane's files — that work is uncommitted and its two
  migrations are unapplied (`2026-08-01b`, `2026-08-01c`). Rebase around it.
- Start, restart, or kill the dev server. The user's runs on **`:3050`** — attach.

---

## Done when

- `npm run verify` green, **no ratchet baseline raised**.
- Phase 0's five questions answered in writing, with the identifier gaps named.
- The vocabulary guard passes and fails loudly on an unmapped lifecycle state.
- Every new route registered in both the permission registry and the manifest test.
- No new file under `src/lib/migrations/`.

## Report back

1. Phase 0's answers — which GS1 identifiers have a home today, and which do not.
2. The Cycle Forge state → CBV `bizStep` map, and every state you had to declare unmappable.
3. Whether the zero-migration constraint held, and precisely where it strained.
4. Anything above you believe is wrong.

---

## Sources

- [GS1 — EPCIS and CBV Implementation Guideline](https://www.gs1.org/standards/epcis-and-cbv-implementation-guideline/current-standardd)
- [GS1 — Core Business Vocabulary (CBV) standard](https://ref.gs1.org/standards/cbv/)
- [OpenEPCIS — EPCIS 2.0 and EPCIS 1.2 (URN vs Web URI forms)](https://openepcis.io/docs/epcis/)
- [TrackVision — What is GS1 EPCIS 2.0?](https://trackvision.ai/blog/what-is-gs1-epcis-2.0)
- [Kezzler — Understanding EPCIS: benefits, event types, serialization](https://kezzler.com/blog/understanding-epcis-benefits-event-types-and-serialization/)
- [GS1 — Application Identifiers](https://www.gs1.org/gs1-application-identifiers)
- [GS1 — Identification keys used in Transport & Logistics](https://support.gs1.org/support/solutions/articles/43000734443-which-gs1-identification-keys-are-used-in-transport-logistics-processes-)
- [SPS Commerce — The structure of EDI 856 ASNs](https://www.spscommerce.com/community/articles/the-structure-of-edi-856-asns)
- [Orderful — EDI 856 guide](https://www.orderful.com/blog/edi-856-guide-reducing-errors-and-optimizing-packing)
- [OpenLineage — Facets & extensibility](https://openlineage.io/docs/spec/facets/)
- [OpenLineage — spec/OpenLineage.md](https://github.com/OpenLineage/OpenLineage/blob/main/spec/OpenLineage.md)
- [Reconomy — EU Digital Product Passports: a business guide](https://www.reconomy.com/2026/02/23/eu-digital-product-passports/)
- [Investment Recovery — DPP and resale value, 2026 playbook](https://invrecovery.org/digital-product-passport-investment-recovery-2026-playbook/)
- [GS1 — Digital Product Passport provisional standard](https://www.gs1.org/standards/standards-emerging-regulations/DPP)
- [TraceX — DPP data carrier: GS1 Digital Link vs proprietary QR](https://tracextech.com/dpp-data-carrier/)
