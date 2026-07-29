# Deep Research Briefing — Binding a printed pre-pack SKU label to a serial, an order, a tracking number, an operator, and its photos

**Prepared for:** Gemini Pro / Deep Research
**Domain:** Multi-tenant warehouse & reseller-operations SaaS (serialised used-goods fulfilment)
**Date:** 2026-07-28
**Status:** Research request — architecture not yet decided

---

## 0. How to use this briefing

This is a request for a **researched architectural recommendation**, not a summary. Sections 1–4 give you
the real system: what it does, what it already has, and a documented production failure that motivates the
work. Section 5 is the research question, decomposed. Section 6 defines what a good answer looks like.

Prioritise **published standards, reference architectures, and documented implementations** over general
advice. Where you recommend a pattern, name the systems or standards that use it and state its failure
modes. Where the evidence is genuinely contested, say so rather than picking a side.

---

## 1. The product in one paragraph

**Cycle Forge** is multi-tenant SaaS for reseller operations: a business buys used and refurbished consumer
electronics in bulk, receives them into a warehouse, tests and grades them, lists them on multiple sales
channels (eBay, Amazon, a webstore), then picks, packs and ships individual orders. The distinguishing
constraint versus ordinary e-commerce fulfilment is that **inventory is serialised and non-fungible**: two
units of the same SKU have different condition grades, different repair histories, and different warranty
clocks. Which *specific physical unit* went into which order is a fact the business must be able to prove
months later, for warranty claims, returns disputes, and channel arbitration.

The operational spine is a set of scanner-driven stations: **Receive → Unbox → Test → Pick → Pack → Ship**.
Operators work with barcode wedge scanners and label printers, hands busy, at speed.

---

## 2. The motivating failure (real, reproduced this week)

An end-to-end test was run against the live system, driving a single order through the real UI.

**What was done:** created an order through the manual intake form, scanned its tracking number at the
Testing station, scanned a serial number to attach it, then looked for the order at the Pack station.

**What the system reported:** every step returned HTTP 200. The Testing station displayed a green ACTIVE
card, a full progress bar reading **"1/1 · complete"**, and a chip reading **"1 UNIT PAIRED"**.

**What was actually persisted:** nothing usable. The order had no tracking link, no serial, and never
appeared in the pack queue. The serial was written against an orphaned exception record.

Three root causes were identified, and the third is the one that motivates this research:

1. The order-creation endpoint silently discarded the tracking number the form required — so the order had
   no shipment link and could never be matched by a tracking scan.
2. An unmatched scan returned `200 {success: true, found: true, orderFound: false}`, so the UI rendered it
   as a successful match.
3. **The serial↔order binding does not exist.** Serials are stored with a `shipment_id` and no order
   reference. The read model therefore resolves an order's serials with:

   ```sql
   SELECT array_agg(DISTINCT tsn.serial_number)
   FROM tech_serial_numbers tsn
   WHERE tsn.shipment_id = o.shipment_id
   ```

   One scanned serial was consequently attributed to **two unrelated products** that happened to share a
   shipment — a "Bose Power Supply Amplifier Board" and a "Plastic wall mount bracket". The same
   shipment-grain coupling also caused a fully tested order to disappear from the pack queue, because a
   *different* order on the same shipment had already been packed.

**The lesson driving this brief:** the binding between a physical unit and the order it fulfils is currently
inferred at read time from a coarse shared key. It needs to be an explicit, recorded fact — captured at the
moment it becomes true, and never re-derived.

---

## 3. What already exists (do not propose a greenfield rebuild)

The system has more of this machinery than the failure above suggests. A good answer **extends these
primitives**; it does not replace them. Postgres, with a hand-written SQL migration per change.

### 3.1 Identity of a physical unit

| Concept | Implementation |
|---|---|
| Unit record | `serial_units` — per-tenant unique on `(organization_id, normalized_serial)`. A serial identifies a unit *within one tenant*, never globally. |
| Minted unit identity | `serial_units.unit_uid`, format `{SKU_SHORT}-{YYWW}-{SEQ6}` (short SKU + ISO year/week + 6-digit sequence), **stamped at first label print**. |
| Origin provenance | `serial_unit_provenance` — typed discriminator `origin_type ∈ RECEIVING_LINE \| TECH_SERIAL \| SKU_IMPORT \| RETURN \| FBA \| MANUAL \| LEGACY` + `origin_id`. |
| Lifecycle status | `serial_units.current_status`, mutated only through a state-machine function with an allowed-transition graph, a row lock, and an append-only `inventory_events` row in the same transaction. |
| Idempotency | `inventory_events` carries `UNIQUE(client_event_id)`, so a retried scan is a no-op. |

### 3.2 Label printing — already a ledger

`label_print_jobs` records every label printed:

```
id, organization_id, job_type ('UNIT'|'MANIFEST'|'HANDLING_UNIT'|'REPRINT'),
serial_unit_id, manifest_id, handling_unit_id, unit_uid,
qr_payload, symbology, template_id, printer_profile_id, copies,
is_reprint, reprint_of_id, actor_staff_id, client_event_id, created_at
```

This already answers *"which serial, on which label, printed by whom, when"* — the print-time half of the
question in §5. What it does not carry is any link to an order.

The barcode payload is built by a function that prefers, in order:
1. an explicit `qrPayload` if supplied;
2. **GS1 Digital Link / element string `(01) GTIN + (21) serial`** when a GTIN is known, encoded as
   `gs1datamatrix`;
3. an internal serial handle as plain `datamatrix`;
4. bare SKU as a last resort.

**Note the used-goods problem:** a manufacturer GTIN is frequently unavailable or wrong for refurbished,
kitted, or parted-out goods, so path (2) is often unreachable in practice.

### 3.3 Pre-packed grouping — already modelled

`label_manifests` is an explicit **"one label, many serials"** structure:

```
label_manifests:      id, organization_id, manifest_uid (KIT-{SKU_SHORT}-{YYWW}-{SEQ6}),
                      manifest_type ('PREBOX'|'KIT'|'MASTER_CARTON'),
                      sku, sku_catalog_id, condition_grade,
                      status ('OPEN'|'SEALED'|'DISSOLVED'),
                      created_by, created_at, sealed_at
label_manifest_items: manifest_id, serial_unit_id, ordinal
                      -- unique: one row per (manifest, unit)
                      -- unique: at most ONE LIVE manifest per unit
```

Lifecycle is: create `OPEN` → add items → `SEAL` → print one master barcode. Splitting is `DISSOLVE`, which
deletes the membership rows to free the units. **A unit's `unit_uid` is never re-minted** — membership
changes, identity does not.

`PREBOX` is precisely the "warehouse pre-packed SKU label" in the question below.

There is also `handling_units` (`H-####`), a reusable tote/LPN for moving units between stations — a
*location* aggregation, distinct from `label_manifests`, which is a *packaging* aggregation.

### 3.4 Scan resolution

A single scan-resolution layer already classifies and resolves: GS1 Digital Link URLs (`/01/{gtin}/21/{serial}`),
minted unit ids, `H-` handling-unit handles, internal receiving codes, PO numbers, carrier tracking numbers
(a full carrier regex set), full serials, and last-4 partial serials. When a scan matches more than one
candidate it returns a `multi` result so the UI can mount a picker — **but this disambiguation exists only on
the inbound/receiving path, not the outbound/order path.**

### 3.5 Photos

`photo_entity_links` is a normalised polymorphic hub: `(organization_id, entity_type, entity_id, link_role)`,
with `link_role ∈ primary | claim_evidence | insurance_share`.

```
entity_type ∈ RECEIVING | RECEIVING_LINE | PACKER_LOG | SERIAL_UNIT | SKU |
              SKU_STOCK | BIN_ADJUSTMENT | SHARE_PACK | ZENDESK_TICKET
```

**Gap:** there is no `ORDER` and no `LABEL_MANIFEST` entity type. Pack-station photos link to `SERIAL_UNIT`
and/or `PACKER_LOG`. Reaching them from an order therefore requires traversing the same broken serial↔order
binding described in §2.

### 3.6 Search

A single cross-entity search engine over a denormalised `entity_search_docs` table: exact-identifier bypass →
trigram keyword → pgvector cosine → reciprocal-rank fusion. Freshness is maintained by DB triggers writing to
an outbox drained by a worker. UI entity vocabulary is `order | unit | receiving | sku | repair | fba` —
**no manifest / prebox type**.

### 3.7 Tenancy and audit posture

Every org-scoped write runs inside a transaction that sets a Postgres GUC (`app.current_org`), with
`FORCE ROW LEVEL SECURITY` and a canonical tenant-isolation policy installed at table birth. Actor identity is
always derived server-side from the session, never from the request body. Any new table is expected to be
tenant-from-birth with org-led indexes.

Audit coverage is currently incomplete: 191 of 435 mutation endpoints record an audit row, and **order
creation, serial attachment, and pack completion are not among them.**

---

## 4. Physical process to be supported

Two flows must both work, and they differ in *when the order becomes known*:

**A. Make-to-stock (the common case).** A worker pre-packs a unit into a box before any order exists —
unit tested and graded, sealed in a box, a SKU label printed and applied. The box sits on a shelf, possibly
for weeks. When an order arrives, a picker pulls that box, a technician scans its label to confirm the unit,
and a packer applies a carrier shipping label and dispatches it.

**B. Make-to-order.** An order exists first; the unit is picked, pre-packed and labelled against it.

Additional real-world conditions that any answer must survive:

- **Multi-package orders** — one order, several boxes, several tracking numbers.
- **Multi-order shipments** — several orders consolidated under one tracking number (this already occurs in
  production data and is the direct cause of the §2 failure).
- **Prebox splitting** — a sealed multi-unit prebox is opened and its units allocated to different orders.
- **Substitution at the bench** — the picked unit fails a final check and is swapped for another of the same
  SKU, after the label is printed.
- **Reprints** — labels are damaged, fall off, or are reprinted in bulk from history.
- **Returns / RMA** — a serial comes back and re-enters stock; its previous order binding must remain
  historically true without implying it is currently allocated.
- **Offline / degraded operation** — the floor must keep scanning when the network or a printer is down; work
  queues durably and reconciles on reconnect.

---

## 5. The research question

> **Core question.** At the moment a warehouse pre-packed SKU label is *printed*, how should the system bind
> that label to the specific serial number (or set of serials) inside the box, such that a **single scan** of
> that label at the tech or pack station resolves the entire chain — prebox label → serial(s) → SKU → order
> line → carrier tracking number → operating staff member → date and time → linked photos — and such that
> **searching for the order later returns all of it**, correctly, for the life of the record?

Decompose and answer the following.

### 5.1 Barcode payload design

What should the printed symbol actually encode?

- Compare **(a)** a GS1 Digital Link / element string carrying `(01) GTIN + (21) serial`; **(b)** a GS1 SSCC
  `(00)` for the box as a logistics unit; **(c)** a GS1 GIAI `(8004)` for an individual asset; **(d)** an
  opaque tenant-scoped UID resolved by database lookup; **(e)** a composite payload carrying several of these.
- **Used goods have no reliable manufacturer GTIN.** What do secondary-market and refurbishment operators
  actually do — company-prefix-minted GTINs, GIAI, or purely internal identifiers? What are the consequences
  for channel compliance (Amazon FBA, eBay), for customs, and for carrier integration?
- How should a **multi-serial prebox** be encoded — a master identifier that resolves to a list (aggregation),
  or a concatenation on the label? What does GS1 aggregation practice prescribe?
- Symbology and data-capacity trade-offs (GS1 DataMatrix vs QR vs 1D) for a small label at wedge-scanner speed,
  including damaged-label read reliability.
- Should the payload be **resolvable offline** (self-describing) or is a DB round-trip acceptable? What breaks
  in each case when the network is down?

### 5.2 When does the binding become authoritative?

This is the heart of the question. The label is printed at time T1; the order may not exist until T2; the pack
scan happens at T3.

- Model the distinction between **reservation**, **allocation**, **confirmation**, and **dispatch** for a
  serialised unit. Which of these is the binding created at print time, and which at scan time?
- What is the correct behaviour when a prebox printed make-to-stock is later picked for an order — is the
  print-time record amended, or is a *new* fact recorded that supersedes it? Argue for one.
- How do established systems model this? Investigate the serialised-inventory and license-plate (LPN)
  handling in **SAP EWM**, **Oracle WMS Cloud**, **Manhattan Associates**, **Blue Yonder**, and
  **Microsoft Dynamics 365 SCM**, and the serial-tracking model in **Fishbowl**, **Cin7**, **Katana**, and
  **Odoo**. Where do they place the serial↔order-line binding, and at which event does it become immutable?
- What does **EPCIS 2.0** (GS1) prescribe here — specifically `AggregationEvent` for unit-into-prebox,
  `TransactionEvent` for prebox-to-order, and `ObjectEvent` with `bizStep` / `disposition` / `readPoint` /
  `bizLocation` from the Core Business Vocabulary? Assess honestly whether adopting EPCIS event semantics is
  proportionate for a small multi-tenant SaaS, or whether the right move is to borrow its **event grammar**
  without its serialisation and query interface.

### 5.3 Grain — the specific defect to design out

The production failure was caused by binding at *shipment* grain. Establish the correct grain and prove it
survives the §4 conditions.

- Should the binding key be order-line, order, package, or shipment? Justify against multi-package orders,
  multi-order shipments, and split preboxes.
- Where should the fact live: a column on the existing serial table, a dedicated association table, or an
  append-only event log that a projection reads? Compare on query cost, historical correctness, and the ease
  of answering *"what did this order actually ship?"* versus *"where has this serial been?"*
- What database constraints make the §2 bug **structurally impossible** rather than merely fixed — partial
  unique indexes, exclusion constraints, generated columns, or triggers? Give concrete Postgres DDL.
- How is "this serial is currently allocated to exactly one open order line" enforced, while still permitting a
  full historical record of prior allocations (returns, cancellations, substitutions)?

### 5.4 Joining the carrier tracking number

- At what point does the carrier tracking number bind to the serial — at label purchase, at pack confirm, or
  at dock scan-out? What is the reconciliation story when a label is voided and re-purchased?
- How should **one order → many tracking numbers** and **one tracking number → many orders** both be
  represented without recreating the shipment-grain collapse? Is a package/parcel entity between order and
  shipment the standard answer?
- What do carrier and EDI standards assume — specifically **ASN / EDI 856** hierarchical levels
  (Shipment → Order → Pack → Item) and the GS1 SSCC-on-carton model? Does adopting that hierarchy resolve the
  ambiguity cleanly?

### 5.5 Operator, time, and the chain of custody

- What is the minimum event record that makes the chain legally and commercially defensible: actor, timestamp,
  station, device, scan payload, prior state, new state, reason code?
- Compare **event-sourced custody** (append-only events, state as a projection) against **state columns plus a
  separate audit log**. Given the system already has an append-only `inventory_events` table with idempotency
  keys but incomplete audit coverage, what is the pragmatic migration path?
- How should **timezone** be handled for "day" attribution when the warehouse operates in one civil timezone
  but the database stores instants? (The system already separates instants, civil dates, and zoned wall-clock
  times, and treats collapsing them as a defect.)
- What is standard practice for **operator attribution on shared station terminals** — session-based, badge
  scan per action, or scan-time attribution? What do warehouse operators actually accept without throughput
  loss?

### 5.6 Photos as evidence

- Which node of the chain should a photo attach to — unit, prebox manifest, package, packer log, or order?
  Argue for a rule that avoids both duplication and unreachability.
- Given the existing polymorphic photo hub lacks `ORDER` and `LABEL_MANIFEST` entity types, is the right move
  to add those types, or to make photos reachable **through** the custody chain by traversal? What are the
  query-cost and integrity consequences of each?
- What is defensible practice for photo evidence in shipping disputes and marketplace claims — what metadata
  must be captured at the moment of capture (hash, capture time, device, operator, geolocation?) for the
  photo to hold up in an Amazon/eBay A-to-Z style claim or a carrier insurance claim? Are there retention or
  chain-of-custody requirements worth designing to now?

### 5.7 The retrieval surface

- What is the reference pattern for an **"order 360"** view that returns the full chain in one read: a
  denormalised read model / materialised view, a projection maintained by an outbox, or a join at read time?
  Given the system already runs a trigger→outbox→worker pipeline feeding a denormalised search document, what
  should and should not be pushed into that document?
- Should the prebox manifest become a **first-class searchable entity**? What is the retrieval story for
  scanning a prebox label found on a shelf with no context — what should the operator see?
- How should the search layer disambiguate when a scanned identifier legitimately resolves to multiple
  entities (the `multi` case that exists inbound but not outbound)?

### 5.8 Failure, reversal, and edge cases

For each of the following, state the correct system behaviour and the record it should leave:
reprint of a lost label; prebox opened and split across two orders; wrong unit packed and discovered at
dock scan-out; unit substituted after label print; order cancelled after pre-pack; serial returned via RMA and
restocked; **two tenants using the same manufacturer serial string**; a scan arriving while the station is
offline.

---

## 6. What a good answer contains

1. **A recommended target model**, expressed as concrete Postgres DDL — tables, columns, constraints, indexes —
   that extends the primitives in §3 rather than replacing them, and that makes the §2 bug structurally
   impossible.
2. **A decision table** for §5.2: which event writes which fact, at which grain, and what supersedes what.
3. **An explicit position on EPCIS 2.0** — adopt, borrow the event grammar, or decline — with the reasoning
   and the cost of each.
4. **A barcode payload recommendation** that survives the missing-GTIN reality of used goods, with the
   standards citation behind it.
5. **A staged migration path** from the current shipment-grain model, with backfill strategy and the
   reconciliation needed for existing multi-order shipments where the correct binding is genuinely unknown.
6. **A named list of what this design still cannot do**, and what it would cost to add later.
7. **Citations throughout** — standards documents, vendor architecture documentation, and real
   implementations. Where practice diverges, present the divergence rather than a synthesis.

Prefer specificity over completeness. A precise, defended recommendation on §5.2 and §5.3 is worth more than
broad coverage of all eight sub-questions.
