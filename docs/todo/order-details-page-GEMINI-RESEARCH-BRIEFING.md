# Research briefing — order search → order details record page, for a multi-tenant reseller-ops SaaS

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-07-27
**Deliverable:** (a) the 2026 industry standard for an "order details" record page in commerce/ops software, benchmarked against named systems with citations; (b) a reconciled, implementable target design for *this* codebase, given the schema and constraints in §4–§7.

---

> **Superseded in part (2026-08-05).** Search order feedback is now `SearchOrderFeedback` (not `OrderRecordBody` / `ShippedDetailsPanel`). See `order-details-page-EXECUTION-PLAN.md` §1 and `AGENTS.md` → Order surfaces.

## 0. How to use this brief

You do **not** have the codebase. Everything needed is embedded here: the measured current implementation, exact file inventory, the data model that exists (and the parts that don't), and the specific decisions that are blocked.

Answer **two separate questions** — do not merge them:

1. **What is industry standard in 2026?** Survey how comparable products render a single order record. Named examples, cited sources, actual dominant patterns — not "it depends." Include what has *changed* recently (AI summarization of order state, unified timelines, agentic support surfaces), and say what is hype vs. what is now table stakes.
2. **What is right for *this* codebase?** Reconcile the industry answer against §4–§7. Where the standard conflicts with a constraint here, say so and pick a side with reasoning. A defended deviation beats a generic answer.

Assume the reader is the engineer implementing it this week. Prefer concrete section-by-section specs over frameworks-for-thinking.

---

## 1. Product context

**Cycle Forge** is multi-tenant reseller-operations SaaS for used-goods resellers (electronics refurb/resale is the dogfood tenant). Inventory is **serialized** — individual physical units with serial numbers, condition grades, test verdicts, and photo evidence — and is sold across multiple channels (eBay, Amazon/FBA, walk-in/local pickup, others).

The UI identity is **Kinetic Ledger**: data-first, dense, state-colored, scan-aware. Stated bias: **legible throughput over document calm** — closer to Linear / Carbon / Stripe Dashboard chrome discipline than to a whitespace-heavy document product.

Every UI region is classified into one of four **region contracts** (enforced house law, not aspiration). **Please use this vocabulary in your answer:**

| Contract | Driven by | Job | Selection model | Density |
|---|---|---|---|---|
| **Station** | barcode scanner | act-and-clear | ephemeral, never in URL | `floor` |
| **Workbench** | pointer | pick a record → edit → persist | durable, URL-addressable | `ops` |
| **Monitor** | filters over a stream | observe only, no edit | none (filters only) | `rollup` |
| **Canvas** | pan/zoom/focus | reshape a definition (draft→publish) | durable focus in URL | `studio` |

An order details page is unambiguously a **Workbench** region — durable URL-addressable selection, pick-and-edit, CRUD persistence.

**The complaint driving this brief:** an operator types an order number, and what they land on is a fragmented ops-packout panel, not an order record. eBay Seller Hub and Amazon Seller Central both give a single coherent page: item image, buyer, money, address, tracking timeline, returns, documents, activity. Ours gives three different partial pages depending on how you arrived.

---

## 2. Current implementation — search path (measured)

### 2.1 What happens when someone types an order number

Four entry points, two engines:

| Surface | Engine |
|---|---|
| Global header search pill (always mounted) | AI quick-jump → `POST /api/ai/retrieve`, else `GET /api/global-search` |
| ⌘K command bar | races `/api/global-search` + `/api/ai/retrieve` |
| Dashboard Search mode (`/dashboard?mode=search`) | `resolveSearchOrder` + `postAiRetrieve` |
| L2 contextual sidebars | `/api/ai/retrieve` |

**Identifier detection** (`looksLikeIdentifier`) gates the "exact" path: no whitespace, and either pure digits ≥3, or alphanumeric+separators containing ≥2 digits and ≥4 chars.

**Deterministic matcher** (`searchOrders`): one SQL over `orders` LEFT JOIN serials LEFT JOIN tracking numbers, matching `order_id ILIKE`, `product_title ILIKE`, `sku ILIKE`, serial ILIKE, tracking ILIKE, numeric-pk exact, plus a **last-8-digit fallback** on both order_id and normalized tracking.

**Hybrid engine** (`hybridSearch`): three arms in parallel — exact (identifier only), keyword (trigram GIN on `lower(search_text)` over an `entity_search_docs` table), vector (pgvector cosine, skipped for identifier queries to protect keystroke latency), merged by RRF k=60. Query-embed budget 300ms; any failure degrades to keyword-only.

**Navigation target:** `/dashboard?mode=search&openOrderId=<id>&map=search`. Note this is **not** `/o/[orderId]` — the full-page view actively redirects `?mode=search` traffic back to the dashboard search URL.

**Resolution cost:** on the header path, pressing Enter on an order number can chain **three network hops** (`/api/orders?orderId=` → a second shipped-data pass → `/api/orders/:id`), or for non-numeric human order numbers: `/api/orders/lookup/<id>` → re-resolve by numeric pk → shipped fetch. Plus an AI-retrieve "bridge" fallback if the lookup misses. All of that to produce one `ShippedOrder` object.

**Assessment:** the search *matching* is genuinely good (identifier bypass + trigram + vector + RRF, tenant-scoped, degrade-not-fail). The **resolution chain is over-engineered relative to the payload it produces**, and the destination is the weakest of the three detail surfaces.

---

## 3. Current implementation — the three forked detail surfaces

There are **three independent order-detail implementations**. They do not share a body. Which one you get is determined by how you arrived.

### 3.1 `/o/[orderId]` — full-page workbench (the most complete one)

Regions in DOM order:
1. `ShippedDetailsHeader` — package badge, click-to-copy order #, icon action bar (mark-shipped / out-of-stock / notes / urgent), tab strip
2. `PackoutChecklistCard` — always-visible strip
3. Body — tab-dispatched
4. `ShippedPanelEditorDock` footer (mark-shipped form / OOS toggle / notes composer) + delete control

Tabs: **Shipping · Product · Documents · Timeline · Customer · Warranty · Conversation**

Default (Shipping) body stack: order pipeline stepper → SKU integrity photos → packing photos → shipping information → product details → support actions → quick links.

Fields actually rendered:
- **Pipeline:** Tested → Packed → Scanned Out stepper with stamped milestones + staff names + carrier status badge
- **Shipping:** ship-by date + days-late + urgent toggle, order ID + external listing link + account source, N tracking rows with "link ticket," serial rows, prepacked-SKU row, copy-all + edit modal
- **Product:** title + condition chip (locked once shipped), item number + external listing + "reimport from Amazon," platform-SKU list
- **Customer:** name / email / phone / shipping address, click-to-copy (this is the **only** surface that fetches `/api/customers/:id`)
- **Timeline:** merges four spines — order-anchored audit logs, inventory events via unit allocations, station activity logs (TECH + OUTBOUND), thread messages — collapsed, with an Order|Serial grouping toggle

### 3.2 Slide-over panel (dashboard board, packer, tech, labels)

Same header + body components, but `showCustomerTab={false}` and `showWarrantyTab={false}`. Customer and warranty are replaced by a two-row "quick links" card (warranty verdict → open logger; customer name → "Open full order"). No packout checklist. Adds an "open full page" action.

### 3.3 Dashboard **Search** order detail — *what search actually lands on*

A completely separate shell: a single `max-w-6xl` scroll lane with its own context bar and its own tab primitives (`SearchOrderFactRow` / `SearchOrderFactList` / `SearchOrderCard`).

Tabs: Overview · Shipping · Product · Documents · Timeline · Customer · Warranty · Conversation.

- **Overview** — presence-driven cards: packing photos, shipping (tracking/carrier/status/latest event/ship confirmed), product (SKU/item#/serial/qty/sale amount), dates & handling
- **Shipping** — 9 read-only fact rows
- **Product** — 9 read-only fact rows
- **Customer** — **shows only Customer ID, Order #, Account source.** It never calls `/api/customers/:id`. No name, email, phone, or address.
- Documents — read-only wrapper
- Timeline / Warranty / Conversation — shared components

**This entire surface is read-only.** No edit modal, no urgent toggle, no notes, no mark-shipped, no assignment, no delete, no support CTA.

### 3.4 The three-way divergence, stated plainly

| Capability | `/o/[id]` full page | Slide-over panel | Search detail (the search destination) |
|---|---|---|---|
| Buyer name / email / address | ✅ | ❌ tab removed | ❌ prints raw `customer_id` |
| Warranty | ✅ | ❌ link only | ✅ |
| Edit / mark shipped / notes | ✅ | ✅ | ❌ read-only |
| Packout checklist | ✅ | ❌ | ❌ |
| Timeline | ✅ | ✅ | ✅ |

No surface is a superset. The one a searcher lands on is the least capable.

---

## 4. What is missing vs. a consumer/seller order page

Measured against eBay Seller Hub / Amazon Seller Central order detail:

| Expectation | Status here |
|---|---|
| **Item / listing image** | Absent. Only *packing* photos and *SKU integrity* photos exist. The photo-link table's entity-type CHECK constraint does **not** include `'ORDER'`. |
| **Buyer info** | Only on `/o/[id]`. `orders.buyer_note` column exists and has **zero UI consumers**. |
| **Payment / fee / payout breakdown** | Absent **and currently unbuildable.** `orders` has only `sale_amount` + `currency`. No fee, payout, or net-proceeds column exists in any migration. |
| **Shipping address** | Fetched only in the `/o` customer tab. Never on Overview, Shipping tab, or the panel. |
| **Carrier tracking timeline** | Partial. The timeline merges audit + inventory + station + threads, but **carrier scan events are never queried** — only a single latest-status badge. |
| **Returns / RMA / claims** | Warranty exists. RMA authorizations (FK'd to `orders.id`) and return dispositions are surfaced **nowhere**. |
| **Invoice / receipt / documents** | Only shipping label + packing slip on NAS. The general `documents` table supports `entity_type='ORDER'` and is never read here. |
| **Activity / audit diff** | Timeline is the strongest part, but it is a tab, never a summary, and there is no before/after diff view despite audit rows storing `before_data` / `after_data`. |
| **Multi-line orders** | **Structurally impossible today.** One order row = one line (`orders.sku`, `orders.product_title`, `orders.quantity`). No line-items table. |
| **Linked support tickets** | Creatable and linkable per tracking number, but existing links for the order are never listed. |

---

## 5. The data model — what exists, what's wired, what's orphaned

### 5.1 Available and could feed a richer page (currently unused on order detail)

| Table | Anchor | Used? |
|---|---|---|
| `shipment_links` (polymorphic owner↔tracking SoT) | `owner_type='ORDER'` | ❌ panel still reads denormalized `orders.shipment_id` |
| `shipment_tracking_events` (carrier scans) | via shipment | ❌ |
| `rma_authorizations`, `return_dispositions` | `order_id` FK | ❌ |
| `order_unit_allocations` → `serial_units` | `order_id` | only inside the timeline query |
| `inventory_events` | via allocated units | timeline only |
| `audit_logs` (with before/after) | `entity_type='order'` | timeline only |
| `work_assignments` (TEST/PACK, deadline, actor) | `entity_type='ORDER'` | ❌ |
| `customers` (email, phone, `shipping_address` jsonb) | `orders.customer_id` | `/o` customer tab only |
| `documents` (signed docs) | `entity_type='ORDER'` supported | ❌ |
| `photos` / `photo_entity_links` | **no `'ORDER'` in the CHECK constraint** | ❌ blocked by schema |
| `entity_notes` | `entity_id` is **UUID**, `orders.id` is **INTEGER** | ❌ blocked by keyspace mismatch |
| `ticket_links` | polymorphic | write-only |

### 5.2 The orphaned commercial half — **the single most important constraint**

The schema contains a full commercial document set — `sales_orders`, `invoices`, `credit_notes`, `packages`, `shipment_orders` — mirrored from an accounting connector (Zoho). It lives in a **UUID keyspace** with **no FK, no join, and no query** connecting it to `orders(id INTEGER)`.

So: there is a table called `invoices` and a table called `orders`, and they have never met.

**Consequences:**
- No fee / payment / payout / refund surface can be built without first bridging these keyspaces (or adding money columns to `orders`).
- Multi-line orders exist in the mirror (`sales_orders.line_items JSONB`) but not in the operational spine.
- Any "industry standard order page" recommendation that assumes a money section must state **which of these two paths it requires** and what it costs.

---

## 6. Honest diagnosis (our own, for you to challenge)

1. **Three forked implementations, none complete.** Coverage is a function of arrival path, not of the record.
2. **It is an ops packout panel wearing an order page's name.** Everything orients around Tested→Packed→Scanned Out, tracking entry, condition grading, serial capture. Commercially it knows one number.
3. **The commercial schema is orphaned** (§5.2) — the ceiling on any money/invoice work.
4. **One order = one line** — multi-item orders and per-line refunds are unrepresentable.
5. **Data that exists is not wired** — `buyer_note` (0 consumers), RMA (0 reads), carrier events (never in timeline), customer identity one call away from a tab that prints a raw ID.
6. **Resolution is over-engineered relative to the payload** — up to 3 hops to produce an object dominated by tester/packer telemetry with no address, no buyer, no money.

---

## 7. Constraints your recommendation must respect

- **Region contract:** order details is a **Workbench** region. Durable URL-addressable selection; the collection map does not animate; only the focus surface crossfades.
- **Density:** `ops`. Dense rows, dividers, inline actions. **Not** a whitespace document layout. Legible throughput over document calm.
- **Design system:** compose named shells/primitives (Panel / SectionCard / CardShell, `LedgerGrid` for tabular, `EventTimeline` for history, `CopyChip` family for typed identifiers). Page-local forks of a shared primitive are banned. Growing a shared primitive is encouraged.
- **Presentation kinds resolve via single-source-of-truth modules** — dates, condition labels/tones, platform labels, capability nouns, search hits. Views stay dumb.
- **Multi-tenant:** every query org-scoped. Vendor names (Zoho, Amazon, eBay) appear only as runtime provider labels or deep links — never as hardcoded product copy.
- **Degrade-not-fail:** a failing sub-resource renders empty; it never 500s the record.
- **Motion:** opacity + transform only, sub-300ms, reduced-motion honored, never animate layout.

---

## 8. Questions to answer

### A. Industry standard (2026), with citations

1. **Canonical section inventory + order.** For a *seller/operator* order record page in 2026, what sections exist, in what vertical order, and why? Benchmark named systems: eBay Seller Hub, Amazon Seller Central, Shopify admin order page, Stripe payment detail, Linear issue view (for the ops-record shape), ShipStation / ShipBob / Zoho Inventory / NetSuite sales order, Gorgias / Zendesk order sidebar. Note where consumer-facing (buyer) order pages diverge from seller-facing ones — we serve the seller.
2. **Tabs vs. single scroll.** 2026 verdict for a dense record with 8+ information domains: tabbed, single long scroll with a jump rail, master-detail with a right inspector, or progressive disclosure? What determines the winner? What did Shopify/Stripe actually converge on and why?
3. **Summary/hero design.** What belongs "above the fold" on an order record — status, money, buyer, next action? Is there a dominant pattern for a status stepper vs. a status chip + timeline? How do the leaders handle *exception* states (late, disputed, returned) in the hero?
4. **Timeline as first-class.** Stripe and Shopify both made a merged activity timeline central. What is the 2026 standard for merging heterogeneous spines (system audit, carrier scans, human notes, customer messages) into one stream — filtering, collapsing, actor display, and when a timeline should be primary vs. a tab?
5. **Money section.** What is the minimum credible payment/fee/payout breakdown on a seller order page, and what data does it strictly require? What do marketplaces expose via API (eBay Finances, Amazon Finances/Settlement) and what is the standard modeling approach — per-order transaction rows, or settlement-report reconciliation?
6. **Serialized inventory.** How do systems that track *individual units* (asset/ITAD/refurb: ServiceNow ITAM, Snipe-IT, refurb-specific platforms) present serial-level provenance on a sales record? Is unit provenance a section, a drill-down, or a linked entity?
7. **AI in the record page, 2026.** Which of these are now real and shipping vs. speculative: AI-generated order state summaries, anomaly/risk flags in the hero, agentic "next action" suggestions, natural-language query over the order's history? Cite shipping products, not announcements.
8. **Search → record UX.** For an operator typing an identifier: instant-navigate on unique match vs. always show a results list? What is the standard for "one confident hit"? How do leaders handle the identifier-vs-natural-language split at the same input?

### B. Recommendation for this codebase

9. **Converge the three surfaces — how?** One shared body with a capability matrix (read-only vs. edit, full vs. compact)? Or one canonical route with the panel demoted to a preview? Give the concrete architecture and say what the search destination should be.
10. **Target section spec.** Section-by-section, in order, for *this* product, with each section labeled: (a) buildable today from existing tables, (b) needs a small wiring fix, (c) blocked on schema. For (c), state the minimum migration.
11. **The commercial-keyspace decision.** Bridge `orders` ↔ the UUID document mirror, or add money columns directly to `orders`? Pick one, defend it, and estimate the surface area.
12. **Multi-line orders.** Is a line-items table a prerequisite for an industry-standard page, or can a one-line-per-order model reach parity for our use case? If it's a prerequisite, say so plainly.
13. **Phasing.** Order the work so an operator feels the difference in week one. Assume one engineer. Distinguish: high-value/low-cost wiring fixes (buyer info on the search surface, carrier events into the timeline, RMA section, item image) from structural work (keyspace bridge, line items).
14. **What to cut.** Which of the current 8 tabs and the packout-oriented sections do *not* belong on an order record page, and where should they go instead?

---

## 9. Deliverable format

1. **Industry standard findings** — organized by question, named systems, cited sources, explicit "dominant pattern" calls rather than hedged surveys.
2. **A target section spec** — ordered, with data source and build-tier (a/b/c) per section, and an ASCII wireframe of the recommended layout at `ops` density.
3. **Architecture recommendation** — how the three surfaces converge; what the search destination becomes.
4. **Blocked-on-schema list** — each blocker with the minimum migration that unblocks it.
5. **Phased plan** — week-one wins first, structural work sequenced after, with an explicit "do not do this yet" list.
6. **Explicit disagreements** — anywhere the industry standard conflicts with §7, name the conflict and pick a side.
