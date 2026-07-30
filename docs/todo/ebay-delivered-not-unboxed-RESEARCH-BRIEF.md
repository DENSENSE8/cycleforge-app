# Research briefing: reconciling "delivered per eBay/carrier" vs "not yet unboxed" inbound inventory

**Purpose of this document:** hand to Gemini Pro (or any external research agent) as a self-contained brief.
It states the business problem, the current implementation as it actually exists in this codebase, and a
structured set of research questions about industry-standard receiving/reconciliation practice. The goal of
the research is a **gap analysis + concrete upgrade recommendations**, not a rewrite proposal — this surface
already has a working implementation; the ask is "how does this compare to WMS/retail-ops industry practice,
and what should change."

Do not assume this is a greenfield problem. Read the "Current implementation" section fully before answering
the research questions — several things a generic answer would suggest ("build a delivered-not-received
report", "poll tracking numbers") are already built. The valuable research is in the parts marked **GAP**.

---

## 1. The business problem, in plain terms

Cycle Forge is a multi-tenant reseller-ops platform. One tenant (the dogfood tenant, "USAV") sources used
electronics inventory partly by **buying on eBay** (this is *inbound purchasing*, not the tenant's own sales
channel — the tenant is the buyer, not the seller, for this flow). Each eBay purchase becomes an inbound
package with a carrier tracking number. Carrier tracking (via USPS/UPS/FedEx polling, see §2.3) eventually
reports the package as **delivered**. Separately, a warehouse operator must physically **unbox** the package
at a scan station (`/unbox`) — open it, grade condition, serialize the contents, and only then does the item
become sellable inventory.

**The gap the business cares about:** a package can sit "delivered" (carrier says it's on the porch/mail room)
for days without ever being unboxed — lost in a pile, forgotten, misrouted internally, or the delivery scan
was simply never followed up on. Cash is tied up in inventory that exists on paper (as a Zoho PO / eBay order)
but isn't yet available to sell, and if it's actually lost/stolen/misdelivered, the window to file an eBay/
carrier claim shrinks every day nobody notices.

This is a **three-way reconciliation problem**: (1) what the marketplace (eBay) says was purchased and paid
for, (2) what the carrier says was physically delivered, and (3) what the warehouse's own scan/unbox event
log says was actually processed. Today's implementation reconciles (2) and (3) reasonably well. The research
should focus on whether reconciling against (1) — and on the *operational workflow* around an aging exception
(SLA, escalation, claim filing) — is handled to industry standard.

---

## 2. Current implementation (grounded in code, as of 2026-07-29)

### 2.1 Data model

- `receiving_carton` — one row per physical inbound package. `source` discriminates provenance:
  `'zoho_po'` (vendor PO), `'ebay'` (eBay purchase), `'unmatched'` (dock-scanned, no PO match yet), etc.
  For eBay, `source_order_id` holds the eBay order id.
- `receiving_line` — line items on a carton (SKU, qty, workflow_status). `inbound_source_type = 'ebay'`
  marks a line as eBay-sourced even before/without a `receiving_carton` link.
- `shipping_tracking_numbers` (STN) — the carrier tracking spine. `is_delivered`, `delivered_at`, `carrier`,
  `last_error_code`, `source_system` (`'ebay_purchase'` is one of the recognized inbound source systems).
- `receiving_unbox` — a "street table" (Wave-2 read model) where `unboxed_at` is the canonical "this carton
  has been opened and processed" timestamp. A carton with no row here, or `unboxed_at IS NULL`, is unboxed.
- Lifecycle: `receiving_line.workflow_status` walks a state machine (`src/lib/inventory/state-machine.ts`,
  `transition()`) — `ARRIVED → MATCHED → UNBOXED → AWAITING_TEST → ...`. This is the *only* legal way to
  change status (no raw `UPDATE`).

### 2.2 The exact "delivered but not unboxed" surface (already built)

`src/lib/receiving/delivered-not-unboxed.ts` (`listDeliveredNotUnboxed`, consumed by
`GET /api/receiving-lines/incoming/delivered-not-unboxed`, org-scoped, 60s-cached) is the dedicated feed:

- **Delivered** = `stn.is_delivered = true AND stn.delivered_at > NOW() - 30 days` (`DELIVERED_NOT_UNBOXED_WINDOW_DAYS`).
- **Not unboxed** = `NOT_UNBOXED_PREDICATE`: `quantity_received = 0` AND no `receiving_unbox` row with
  `unboxed_at IS NOT NULL` AND `workflow_status` is before `UNBOXED` in the state machine.
- **eBay inclusion**: joined via `r.source='ebay' AND r.source_order_id = rl.source_order_id`, OR simply
  `rl.inbound_source_type = 'ebay'` (this second clause is a deliberate carve-out — eBay lines don't need
  the Zoho-received check the vendor-PO branch requires, since there's no Zoho PO to be "received" against).
- Output includes carrier, tracking#, `delivered_at`, PO/vendor context, and `was_scanned` (whether a dock
  scan already exists — i.e., distinguishes "delivered and dock-scanned but stuck mid-unbox" from "delivered
  and never touched by an operator at all").

A **sibling, narrower** feed exists: `delivered-unscanned.ts` — "delivered AND never scanned at all" (the
dock hunt queue, 14-day window, own tile in the Incoming sidebar with age bands `lt_24h/h24_48/gt_48h` and a
`CARRIER_MISMATCH` bucket for carrier/tracking# resolution failures). `delivered-not-unboxed` is the broader
superset that also catches cartons that WERE scanned at the dock but never finished unboxing.

**Where these surface today:** the Incoming sidebar tiles (`IncomingSidebarPanel.tsx`) show
`DELIVERED_UNOPENED`, `STALLED`, `CARRIER_MISMATCH`, etc. as a `delivery_state` classification per shipment
(one big `CASE` in `src/app/api/receiving-lines/route.ts`). The `delivered-not-unboxed` list is a separate,
newer, dedicated lane (doc comment: "Complements delivered-unscanned").

### 2.3 How "delivered" is known at all (carrier sync)

Per `tracking-live-sync` project memory: tracking is refreshed by **free adaptive cron polling**
(`/api/cron/shipping/sync-due`, every 15 min, cadence scales by status — 30min when out-for-delivery, 2h in
transit) against real carrier APIs (FedEx/UPS/USPS). Carrier **webhooks were evaluated and rejected** — FedEx's
push product is paid/gated, UPS third-party push wasn't available, and the hard constraint is $0 marginal cost
per tracked package. This is a deliberate, already-decided architecture — do not recommend paid
webhook/aggregator services (Shippo, EasyPost, AfterShip) as a fix unless the research finds a genuinely free
tier that beats current polling accuracy/latency; if you do surface one, flag it as an explicit tradeoff for a
human decision, not a default recommendation.

### 2.4 Reconciliation / exception handling that already exists

- **`CARRIER_MISMATCH`** bucket — carrier/tracking# didn't resolve (`carrier='UNKNOWN'` or specific carrier
  error codes). Own tile, own tone (red), own icon.
- **Unfound queue / reconciliation** — a *different* exception type: a carton scanned at the dock that
  couldn't be matched to any known PO/order at all. `reconcileUnmatchedReceiving()` re-attempts a Zoho
  tracking-number search on a schedule (hourly cron, capped at 7-day-old rows) and can promote a match. Per
  memory, a **June 2026 backlog audit found the matched POs were already received in Zoho** — i.e. most of
  that backlog was a *linking* gap, not a *physical* receiving gap. This is a useful precedent: the codebase
  already has one instance of "the marketplace/ERP said something different than the physical dock event,"
  and the fix there was reconciliation/promotion logic, not a new alert.
- **Age-banded SLA presentation** exists for `delivered-unscanned` (`lt_24h/h24_48/gt_48h`) but — **GAP** —
  there is no evidence of the same age-banding, nor any *escalation* action (notify, auto-create a ticket,
  auto-flag for claim), on `delivered-not-unboxed`. It is a list you must go look at.

### 2.5 What does NOT appear to exist (candidate gaps — verify, don't assume)

Grep/read of `src/lib/receiving/**` and `src/app/api/receiving*/**` turned up:

- **No proactive notification/escalation** tied to `delivered-not-unboxed` age (no cron that pages/emails/
  Slacks staff, no auto-created support/ops ticket when a package crosses an SLA threshold, unlike the
  Zendesk-integrated claim flow that exists for *returns/damage* elsewhere in the codebase).
- **No explicit "eBay item-not-as-described / missing / claim" workflow** analogous to the Amazon returns
  lookup (`amazon-return-lookup/route.ts`) or the Zendesk warranty-claim round-trip
  (`warranty-zendesk-roundtrip` memory) — i.e. once a delivered-not-unboxed eBay package ages out, there's no
  built-in path to "file an eBay Money Back Guarantee / INR claim" or "open a carrier claim" before the
  claim window (eBay: typically 30 days from estimated delivery for buyer protection; carriers: 60–90 days
  for loss claims, shorter for damage) closes.
- **No confirmed reconciliation against eBay's own order/shipment status** (as opposed to carrier tracking).
  Everything currently keys off `shipping_tracking_numbers`, which is carrier-truth. eBay's Purchase
  History / Order API also exposes its own delivery estimate and (for the buyer side) a "mark as received"
  concept — it's unclear from this pass whether that's ever pulled in as a *second* signal, or whether the
  eBay MCP/API integration is read-only reference data used only at ingest (`sync-ebay-purchases`) and never
  polled again post-purchase. **Confirm this in code** (`src/lib/inbound/sync-one-inbound.ts`,
  `ingest-purchase.ts`) before assuming a gap.
- **No "3-way match" discrepancy handling** in the industry-standard sense (ordered qty vs received qty vs
  invoiced/paid qty) — the workflow_status machine tracks physical receiving state, but there's no visible
  quantity/condition discrepancy resolution step scoped to eBay purchases specifically (e.g., "eBay says 1
  unit shipped, unboxed only found packaging, no item" as a first-class exception, distinct from a generic
  "unfound" carton).

---

## 3. What "industry standard" means here — research questions for Gemini Pro

Research each of these against real-world warehouse/inventory-management and marketplace-operations practice
(WMS vendors — Fishbowl, ShipBob, Extensiv/SkuVault, NetSuite WMS; 3PL operating procedures; Amazon FBA
receiving SOPs; eBay/Amazon seller-central buyer-side "item not received" workflows; general retail
"receiving discrepancy management" literature). For each question, give (a) the standard practice, (b) 2-3
named real-world examples/sources if available, (c) how it maps onto this codebase's existing structures
(state machine, STN table, receiving_line/carton, cron infra) rather than proposing new architecture.

1. **SLA definition for "delivered but not received/put-away."** What's the industry-standard time
   threshold(s) before an unprocessed-but-delivered package is treated as an operational exception requiring
   escalation (vs. just a queue item)? Is a single threshold correct, or should it be tiered like the existing
   `lt_24h/h24_48/gt_48h` bands, and does the SLA differ for high-value vs low-value inventory?

2. **Escalation mechanics.** What do mature WMS/3PL systems do once an item crosses that SLA — auto-assign to
   a specific operator/role, auto-create a task/ticket, daily digest, dashboard-only, or push notification?
   How is repeat/snoozed escalation typically handled so it doesn't become alert fatigue on a small team
   (this tenant is a small warehouse, not an enterprise DC)?

3. **Three-way reconciliation (marketplace ↔ carrier ↔ physical dock).** Standard practice for reconciling
   an e-commerce/marketplace purchase record, carrier delivery confirmation, and warehouse receiving
   confirmation — this is analogous to AP's classic PO/receipt/invoice 3-way match, but for physical
   inventory receipt. What are the standard discrepancy types (quantity, condition, wrong item, never
   arrived-despite-delivered-scan) and how are they typically categorized/routed?

4. **Claims-window management.** What's the standard operational process for tracking and not missing a
   claims deadline (marketplace buyer protection, carrier loss/damage claim) on a package that's delivered
   per tracking but the contents are missing/wrong/never processed? Is there a common pattern of an
   automatically-computed "claim-by" date fed from `delivered_at` + a per-marketplace/per-carrier policy
   window, surfaced as its own urgency signal distinct from a generic SLA clock?

5. **Marketplace order status as a second data source.** Is it standard practice to poll/reconcile against
   the marketplace's own order/shipment status (eBay Order API `fulfillmentStartInstruction`/delivery
   estimates, or similar) in addition to carrier tracking, or is carrier tracking treated as sufficient
   single-source-of-truth for "delivered" in real systems? When do systems actually need the marketplace
   signal (e.g., detecting an eBay-side "delivered" mark from the buyer/seller vs. carrier data disagreeing)?

6. **"Delivered but never scanned at all" vs "scanned but stuck mid-unbox."** The codebase already
   distinguishes these two states (`delivered-unscanned` vs. `delivered-not-unboxed`, `was_scanned` flag).
   Is this the right split per industry practice, or is there a more standard taxonomy of inbound-exception
   states (e.g., WMS "received not putaway," "putaway discrepancy," "cycle count variance")? Would adopting
   standard WMS state-naming help, or is it not worth a rename given this app already has its own vocabulary
   (`ARRIVED/MATCHED/UNBOXED/...`)?

7. **Root-cause taxonomy for aging exceptions.** In practice, when a package is "delivered per tracking" but
   never gets processed, what are the most common real-world root causes (staff turnover/backlog, physically
   misplaced in the warehouse, delivered to wrong address/mailroom, package damaged and set aside, carrier
   data itself wrong)? Does this suggest the reconciliation surface should collect a root-cause code on
   resolution (closing the loop), and if so what's a reasonable minimal taxonomy?

8. **Auditability.** What's standard practice for the audit trail on this kind of exception — is it enough
   that the underlying `inventory_events`/audit log already records the unbox transition when it eventually
   happens, or do mature systems also log the *exception lifecycle itself* (when it was flagged, who
   acknowledged it, how long it was open, why it closed)?

---

## 4. What "upgrade the codebase" should produce

After the research above, translate findings into a concrete, scoped proposal that:

- **Composes existing primitives** — the state machine (`transition()`), the cron infra
  (`/api/cron/shipping/sync-due` and sibling receiving cron jobs), the org-scoped cache (`getOrSet`/
  `CACHE_TAGS.receivingLines`), the Zendesk-integrated claim/ticket flow already used for returns/warranty
  (do not invent a second ticketing system), and the Incoming sidebar tile pattern
  (`IncomingSidebarPanel.tsx` TILES/TONE maps) — per this repo's hard rule: **compose the named SoT first;
  grow it when it's wrong; never fork a parallel system.**
- **Names the specific new pieces**, if any: e.g. a `claim_by_date` computed column/expression, an SLA-cron
  that promotes aging `delivered-not-unboxed` rows into a Zendesk/internal ticket via the existing
  ticket-link SoT (`src/lib/support/ticket-refs.ts`, `TicketLinkPopover`), a root-cause field captured at
  resolution.
- **Respects existing hard laws**: status changes only via `transition()`; `organization_id` scoping via
  `withTenantTransaction`/tenant GUC; no new search engine/audit API/status machine; Monitor-vs-Workbench
  region-contract discipline if any new UI surface is proposed (this is almost certainly a **Monitor**
  surface — observe/aging list — with an escalation action that hands off to a **Workbench** ticket, not a
  new pick+edit region of its own).
- **Is scoped** — this brief is about eBay-purchased inbound specifically, but the underlying
  `delivered-not-unboxed` feed already spans eBay + Zoho PO. Say explicitly whether the recommended fix
  (SLA/escalation/claims-window) should apply to the whole feed or be eBay-specific (eBay has a real claims
  deadline; a domestic vendor PO usually doesn't), and how the code should tell those apart
  (`rl.inbound_source_type = 'ebay'` is already the discriminator used elsewhere).

Deliverable format: a short decision-table-style plan (industry practice → codebase mapping → concrete change),
not prose essay — this matches how the rest of this repo's planning docs are written
(see `docs/todo/*-PLAN.md` for the house style: predicate tables, phased rollout, explicit "ask first" items
for anything touching the state machine, tenant scoping, or a live-table migration).
