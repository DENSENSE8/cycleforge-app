# Deep Research Briefing — Just-in-time pack documents: scan-pair → print-when-needed

**Prepared for:** Gemini Pro / Deep Research  
**From:** Cycle Forge engineering  
**Date:** 2026-07-30  
**Status:** Research request — architecture not yet decided  
**Domain:** Multi-tenant warehouse & reseller-operations SaaS (serialized used-goods fulfilment)

**Companion canvas (human summary):** open beside chat as
`jit-pack-documents-gap.canvas.tsx` in the Cursor canvases folder for this workspace.

---

## 0. How to use this briefing

This is a request for a **researched architectural + operational recommendation**, not a summary.
Sections 1–4 give you the real system: product context, the operator pain, what is already
implemented, and measured gaps. Section 5 is the research question, decomposed. Section 6 defines
what a good answer looks like.

You do **not** have the codebase. Treat §3 as ground truth. Treat §4 as a hypothesis you are
expected to critique, not rubber-stamp.

Prioritise **published 2025–2026 WMS / OMS / 3PL reference architectures, named products, and
measurable KPIs** over generic advice. Where you recommend a pattern, name systems or standards that
use it and state failure modes. Where evidence is contested, say so.

Answer **three separate questions**:

1. **What is the 2026 industry standard data-flow for pack-station documents?**  
   When do shipping labels, packing slips, product manuals, inserts, and compliance papers get
   *generated*, *linked*, *printed*, and *verified* relative to scan events? Named patterns (e.g.
   scan-to-pack → print-on-confirm, wave-batch print, insert-at-pack automation). Cite sources.

2. **What metrics define a healthy document flow?**  
   Give concrete KPI definitions + target ranges used by modern fulfilment ops (order accuracy,
   label-compliance failure rate, pack UPH, document walk-time, reprint rate, first-time-right
   paperwork, exception / rework %). Distinguish *leading* vs *lagging* indicators.

3. **What is right for *this* codebase?**  
   Reconcile the standard against §3’s hard constraints and SoT inventory. Propose a **data model +
   state machine + print trigger policy** that grows existing primitives (`documents` /
   `document_entity_links`, `barcode-routing`, pack station, PrintNode/ZPL paths, `product_manuals`)
   rather than inventing a second document engine. Where the standard conflicts with a constraint,
   name the conflict and pick a side.

---

## 1. Product + operator context

**Cycle Forge** is multi-tenant SaaS for reseller operations: buy used/refurbished electronics in
bulk → receive → unbox → test/grade → list on marketplaces → pack → ship → handle returns.
Inventory is **serialized and non-fungible**: which *specific physical unit* went into which order
must be provable months later (warranty, channel disputes, RMAs).

**Operational spine (scanner stations):**  
Receive → Unbox → Test → (Pick) → **Pack** → Labels / Scan-out → Ship.

**UI identity is Kinetic Ledger:** data-first, dense, scan-aware. Region contracts in use:

| Contract | Driven by | Job | Density |
|---|---|---|---|
| **Station** | barcode scanner | act-and-clear | `floor` |
| **Workbench** | pointer | pick → edit → persist | `ops` |
| **Monitor** | filters | observe | `rollup` |
| **Canvas** | pan/zoom | reshape definitions | `studio` |

Pack is a **Station**. The Labels workspace is closer to a **Workbench** over outbound docs.
Any redesign must keep pack act-and-clear (one active order, scan focus, big pass/fail — not a
browsable document library competing with the scan band).

### Physical reality

- Operators stand at benches with wedge scanners and (often) separate thermal vs laser printers.
- Today many shops **print all papers early** (shipping label + packing slip in a batch), then
  *everyone* (tester, packer, shipper) scans the **shipping label barcode** as the shared handle.
- Desired direction: **information printed only when needed** — especially manuals / inserts /
  remaining papers at the moment the packer confirms the carton — and every printable artifact
  **polymorphically linked** to the right grain (order, shipment/STN, SKU, serial unit).

---

## 2. The problem, in one paragraph

The warehouse currently runs an **eager-print / shared-barcode** process: shipping labels and packing
slips are fetched or bought and printed from the Labels station (or dashboard bulk), then the printed
shipping label becomes the physical token everyone re-scans. That couples *identity* (what order is
this?) to *carrier paperwork* (the label), forces early paper waste when orders change, and never
triggers document fetch/print from the pack bench. Product manuals live in a separate SKU-linked
table and are shown at Testing, not as pack-time inserts. Outbound `document_entity_links` only allow
`ORDER` and `SHIPMENT` — not `SKU` or `SERIAL_UNIT`. The team wants a **scan → pair in system →
print remaining docs when the packer needs them** flow, with polymorphic document linkage down to
SKU/serial where content is unit- or product-specific.

---

## 3. Measured current state (ground truth — do not invent)

### 3.1 Outbound documents that already exist

Durable layer for marketplace packing slips and carrier shipping labels:

| Concept | Implementation |
|---|---|
| Storage | `documents` table + blob URL in `document_data` (GCS/NAS) |
| Polymorphic links | `document_entity_links` with `entity_type ∈ {ORDER, SHIPMENT}` **only** |
| Doc types (outbound module) | `shipping_label` \| `packing_slip` |
| Link-role convention | Label: STN `primary` when known, ORDER `secondary` (or ORDER-only). Slip: ORDER always `primary`, STN `secondary` when per-box |
| Domain SoT | `src/lib/documents/outbound-documents.ts`, `links.ts`, `types.ts` |
| Marketplace fetch | `POST /api/orders/[id]/documents/fetch` (+ Ecwid auto-fetch on Labels open) |
| Buy label | `POST /api/shipping/order-labels/purchase` → stores label + generates packing-slip PDF |
| Print | `printOutboundDocuments()` — **browser hidden iframe + `window.print()`**, sequential pages via `/api/documents/[id]/content` |
| Primary UI | `/shipping/labels` → `LabelsOrderWorkspace` dock CTA “Print” / “Print both” |
| Bulk | Dashboard Packed/Shipped selection → labels print (not pack-station) |

**Explicit non-goal in the outbound-documents plan (still true):**  
> Auto-print workflows (fetch + attach only; print is a follow-on button).

Pack station **never** lists, fetches, or prints outbound documents.

### 3.2 Separate print / document worlds (do not collapse casually)

| World | What | Trigger | Link grain |
|---|---|---|---|
| Outbound PDFs | Carrier label + packing slip | Labels workbench / bulk / buy-label | ORDER + SHIPMENT |
| Thermal product/receiving labels | ZPL/TSPL unit/carton/bin/HU | Unbox Print step, Products Labels, etc. | Serial / receiving line / bin |
| Product manuals | PDFs in `product_manuals` | Testing station slide-over | SKU / item_number columns (**not** `document_entity_links`) |
| Pack evidence photos | `photos` + `photo_entity_links` | Pack phone guided capture | `PACKER_LOG`, `SERIAL_UNIT`; photo_types `pack_slip` / `pack_box` are **photos of papers**, not the printable PDFs |
| PrintNode dispatch | `POST /api/print/dispatch` | Thermal / workstation routing | Separate from outbound iframe print |

### 3.3 Scan classifier (what operators actually scan)

SoT: `src/lib/barcode-routing.ts` → `routeScan()`.

| Scan form | Type | Typical station |
|---|---|---|
| Carrier tracking / last-8 | Order path | Pack, Labels, Scan-out |
| `U-{serial\|id}`, GS1 `(01)(21)` | Serial unit | Test, Pack (unit photos) |
| `R-` / `L-` carton/line | Receiving | Unbox |
| FNSKU | FBA | Pack |
| Digit+`:` SKU | Stock | Inventory / pack |
| Bin / GS1 location | Location | Warehouse |

**Today’s coupling:** the physical shipping label barcode (tracking) is the common handle across
tester and packer. That works as an *identity key* but forces the label to exist (and usually be
printed) before mid-flow stations can share a token.

### 3.4 Pack station behaviour today

- Route: `/pack` → `StationPacking`
- Scan → resolve order → `POST /api/packing-logs`
- Side effects: pack checklist, optional Zendesk, phone push for pack photos, status toward packed
- **No** call to `listDocumentsForOrder`, marketplace fetch, or `printOutboundDocuments`
- Pack verification / review (`/review?mode=packer`) is about **photo evidence of slip/box**, not PDF generation

### 3.5 Polymorphic patterns available to grow (house contract)

New polymorphic hubs must follow `.claude/rules/polymorphic-tables.md`: named CHECK on `entity_type`,
`entity_id` BIGINT, org-led indexes, delete triggers per parent, tenant-from-birth, Drizzle model in
same PR, existence validation in domain writers (not DB existence triggers).

Sibling hubs already in production:

| Hub | Entity types (abbrev.) | Job |
|---|---|---|
| `document_entity_links` | ORDER, SHIPMENT | Outbound papers |
| `photo_entity_links` | RECEIVING, RECEIVING_LINE, PACKER_LOG, SERIAL_UNIT, SKU, … | Evidence photos |
| `shipment_links` | ORDER \| RECEIVING → STN | Multi-box tracking |
| `thread_links` / `ticket_links` | ORDER, SERIAL_UNIT, SKU, … | Support |
| `product_manuals` | SKU columns (legacy, not polymorphic hub) | Manuals at test |

**Gap:** printable manuals/inserts/compliance docs cannot yet share one polymorphic document graph that
reaches SKU and SERIAL_UNIT the way photos already do.

### 3.6 Hard constraints (non-negotiable unless you explicitly argue overturn)

1. **One module per concern** — extend `src/lib/documents/*` and print SoTs; do not invent a second
   outbound document store or a page-local print twin.
2. **`orgId` from auth context**; org-scoped writes via tenant transaction patterns.
3. **Status changes only via `transition()`** — pack/ship status must not be bypassed by a print side
   effect.
4. **Navigators push, inspectors float** — pack remains Station; do not turn pack into a document
   workbench.
5. **LedgerGrid / Station laws** — act-and-clear; print success/failure is a big card state, not a toast.
6. **Auto-print was an explicit non-goal** of the outbound docs v1 plan — overturning it needs a
   researched policy (when silent, when confirm, when reprint-safe, idempotency).
7. **Browser iframe print ≠ thermal ZPL** — carrier labels are often PDF/PNG from ShipStation /
   marketplaces; product labels are ZPL. Any JIT design must say which printer class each doc type
   hits and how workstation print routing works (`printMode`, PrintNode).
8. **Evidence photos ≠ printable documents** — keep `pack_slip` photo capture; do not merge into
   `documents.document_type`.
9. Postgres + hand-written SQL migrations; polymorphic CHECK + delete triggers in the same migration
   that adds a new `entity_type` value.

---

## 4. The change the team wants (hypothesis — critique it)

### 4.1 Operator narrative (requester’s words, cleaned)

1. Early in the flow, print **only the minimum identity token** needed (or use an already-scannable
   handle: packing-slip barcode, phone-order QR, unit label, tracking) — **not** the full paper stack.
2. Tester / mid-flow operators scan that handle → system **pairs** the scan to order / serial /
   shipment in the ledger (updates state; does not require the carrier label to be the only barcode).
3. When the **packer** scans (order, unit, or pack-ready token) and confirms pack readiness, the
   system **fetches missing docs if needed** and **prints the remaining paperwork** (shipping label if
   not yet printed, packing slip if required by channel, **product manuals / inserts / compliance
   sheets** for SKUs/serials in the carton).
4. Every printable artifact is **linked polymorphically**: document ↔ ORDER and/or SHIPMENT and, where
   content is product- or unit-specific, ↔ SKU and/or SERIAL_UNIT.
5. Goal: **print only when needed**, contact the system of record at print time, reduce wasted paper
   and mis-matched stacks, and make “scan something → system knows → print rest” the default data
   flow.

### 4.2 Implied architecture questions (you must answer)

- What is the **canonical scannable handle** before a carrier label exists? (order QR, packing-slip
  QR, unit `U-`, STN, phone deep link `/m/…`) Industry pattern + recommendation for *this* spine.
- Should shipping-label **purchase/generation** stay pre-pack (Labels station) while **physical print**
  moves to pack-confirm, or should buy+print both move to pack-confirm?
- How should **SKU manuals** join the outbound document graph without orphaning `product_manuals`?
  (Promote into `documents` + links? Bridge table? Print-bundle resolver that unions both?)
- What is the **print bundle** state machine? (e.g. `needed → resolved → queued → printed → verified`)
  Idempotency on double-scan? Reprint policy?
- How do **multi-box / multi-serial** orders resolve which manuals print at which scan?
- What KPIs prove the redesign worked within 30 days?

---

## 5. Research questions (decompose and answer all)

### A. Industry data-flow standard (2026)

1. Map the dominant pack-document data flows used by modern WMS/OMS/3PL stacks (ShipStation+,
   Manhattan, Körber, SoftEngine/EPG-class, Shopify Fulfillment, Amazon MCF patterns, mid-market WMS).
2. For each flow, state: trigger event, docs generated vs docs printed, scan verification gates,
   printer routing model, and failure/retry behaviour.
3. Specifically evaluate **print-on-pack-confirm** vs **batch pre-print** vs **insert automation**
   (e.g. in-line slip printers) for *serialized* electronics / returns-heavy resellers (not pure DTC
   apparel).
4. What barcode/QR payload standards are used as **work tokens** independent of carrier labels
   (LPN, license plate, pack-slip ID, GS1)?

### B. Metrics & targets

Provide a KPI table with: metric name, formula, industry target (cite), leading/lagging, and how it
maps to Cycle Forge events we could already emit (pack log create, label purchase, document attach,
print dispatch, scan-out, reprint).

Minimum metrics to cover:

- Order accuracy / right-first-time shipment  
- Pack station UPH (orders or units / labour hour)  
- Label / paperwork compliance failure rate  
- Document walk-time or “printer away from bench” minutes (layout metric)  
- Eager-print waste / reprint rate  
- Scan-verification coverage (% packs with item or unit scan before label print)  
- Exception / rework rate attributable to wrong or missing papers  
- Time-from-pack-confirm-to-carrier-ready  

### C. Codebase-reconciled design

Deliver:

1. **Target data model** — exact extensions to `documents` / `document_entity_links` (new
   `document_type` values? new `entity_type` values SKU / SERIAL_UNIT?) vs keep `product_manuals` and
   resolve a **print bundle** at runtime. Follow polymorphic-tables contract.
2. **State machine** — from “order packable” → “docs resolved” → “print job issued” → “print
   confirmed / failed” → “scan-out eligible”. Include idempotency keys (`client_event_id` pattern
   already used elsewhere).
3. **Station UX contract** — what the pack Station shows on scan (one card): missing docs, print
   CTA vs auto-print, pass/fail. What stays on Labels workbench.
4. **Phased rollout** that reuses existing APIs (`documents/fetch`, `printOutboundDocuments` or
   PrintNode, packing-logs) with minimal blast radius. Call out what overturns the outbound plan’s
   “no auto-print” non-goal and under what guardrails.
5. **Anti-patterns** — what *not* to do given this codebase (second search engine for docs, packing
   slip photo as substitute for PDF, shipping label as only identity, etc.).

---

## 6. What a good answer looks like

A strong response:

- Opens with a **one-paragraph verdict** (recommended industry pattern + whether Cycle Forge should
  adopt print-on-pack-confirm).
- Gives a **comparison table**: Current Cycle Forge vs 2026 standard vs Proposed, row-per concern
  (identity token, doc generation, doc print, SKU manuals, polymorphic links, metrics).
- Specifies a **print-bundle resolver** algorithm in pseudocode (inputs: orderId, shipmentIds,
  serialUnitIds, channel rules → ordered list of printable artifacts + printer class).
- Names **failure modes**: marketplace fetch miss, printer offline, partial multi-box, double-scan,
  label void after print, manual missing for SKU.
- Ends with a **30-day measurement plan** using the KPI table from §5B.
- Does **not** propose replacing Postgres, inventing a new DAM, or merging photos into documents.
- Does **not** ignore serialization — pure fungible e-comm pack advice is insufficient.

### Out of scope

- Redesigning Unbox receiving-grid cells (separate initiative).  
- Replacing ShipStation / marketplace label purchase APIs.  
- Full DAM / media library Phase 4.  
- Pick-path optimization / wave planning.

---

## 7. Key file index (for implementers after research — not required for Gemini)

```
src/lib/documents/outbound-documents.ts
src/lib/documents/links.ts
src/lib/documents/types.ts
src/lib/documents/generate-packing-slip-pdf.ts
src/lib/print/printOutboundDocuments.ts
src/lib/print/printMode.ts
src/lib/barcode-routing.ts
src/components/station/StationPacking.tsx
src/components/outbound/labels/LabelsOrderWorkspace.tsx
src/app/api/packing-logs/route.ts
src/app/api/orders/[id]/documents/*
src/app/api/print/dispatch/route.ts
docs/outbound-documents-plan.md
.claude/rules/polymorphic-tables.md
```

---

## 8. One-line ask

**Research the 2026 standard for scan-gated, just-in-time pack documentation (metrics + data flow),
then prescribe how Cycle Forge should evolve its existing `documents` + station scan spine so packers
print papers only when needed while polymorphically linking those papers to order, shipment, SKU, and
serial.**
