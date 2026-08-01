# Order details page — execution plan

**Date:** 2026-07-27
**Lane:** WS-DOGFOOD (`main`) for wiring weeks; a `topic/order-record` worktree if the line-items build starts
**Source:** decisions from the Gemini deep-research response B; cadence restructured week-by-week
**Brief:** [order-details-page-GEMINI-RESEARCH-BRIEFING.md](order-details-page-GEMINI-RESEARCH-BRIEFING.md)

---

## 0. Status of the inputs

The **decisions** below are locked.

**Citations — pending transfer.** A revised research artifact
(`order_details_research_briefing.md`, citing Shopify Polaris, Stripe, Snipe-IT, and Zendesk/Intercom
AI features) closes the evidence gap, but it lives outside this repo and has not been reviewed here.
Land it in `docs/todo/` and fold the sources into the brief before quoting any 2026 claim as fact.
Until then §1 is reasoning we endorse, not sourced fact — with the caveat that only one claim is
load-bearing: **tabs-are-dead for ops record pages**. If that fails to hold up, Week 1's layout call
is the one to revisit; nothing else in the plan depends on it.

---

## 1. Locked decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **One canonical route: `/o/[orderId]`.** All search hits, board clicks, and deep links resolve there. | Kills the three-way divergence where coverage depends on arrival path. |
| D2 | **One `OrderRecordBody` component**, mounted by the full page, the dashboard-search shell, and `DashboardOrderDetails` only. Panel passes `density="compact"` (right rail collapses under the main column; jump rail hidden). | Superset by construction — a capability can no longer exist on one *order* surface and not another. |
| D2a | **Hard scope boundary at `context="dashboard"`.** The other seven `ShippedDetailsBody` contexts (`station`, `packer`, `fulfillment`, `labels`, `staged`, `shipped`, `queue`) stay on the legacy tabbed body. | `ShippedDetailsPanel` has ten consumers, several of them Station-contract at `floor` density. Forcing a Workbench master-detail layout into a scan bench violates the region contract. They need a Station-density variant designed on their own terms, not a retrofit. |
| D2b | **`PackoutChecklistCard` stays on `/o/[orderId]` for now — demotion deferred.** | ⚠️ Corrected 2026-07-27 against the code: the card is mounted in **exactly one place**, `OrderFullPageView.tsx:268`. It has *no* existing home in the `station` / `packer` panels, so "keep it where it already is" has nothing to keep. Removing it now would delete a live feature into dead code (and trip knip). Demotion needs a real Station host built first — and that build is exactly what D2a defers. Revisit when the Station-density variant is designed. |
| D4a | **The search hijack is exact-identifier-only.** `looksLikeIdentifier` + a resolved single order on Enter → `/o/[id]`. Fuzzy / natural-language / multi-result queries keep `/dashboard?mode=search` **and its L2 hit-map rail**. | Protects 25 `orderSearchHref` call sites and 20+ `openOrderId` readers; the rail is the right surface when there is genuinely more than one candidate. |
| D3 | **Kill the 8-tab strip.** Single vertical scroll (main column) + right rail (dimensional metadata). | `ops` density + operator scan behavior; tabs hide exception state behind a click. |
| D4 | **Instant-navigate on one confident hit.** `looksLikeIdentifier` + exactly one exact-matcher result → straight to `/o/[id]`. `/dashboard?mode=search` survives only for fuzzy/multi-result queries. | Typing a full order number is unambiguous intent. |
| D5 | **Bridge the keyspace — do not add money columns to `orders`.** Nullable `sales_order_id UUID` on `orders`. | Flat money columns would fork a second source of truth for facts the mirror already holds, and require per-channel finance ingest. |
| D6 | **`order_line_items` is a prerequisite, and it is scheduled** (Week 4–5), not declared and deferred. | Combined shipping and split fulfillment are real in reseller ops; one-order-one-line cannot represent them. |
| D7 | **Demote `PackoutChecklistCard`** off the durable record page to a Station surface. | Packout is act-and-clear, scanner-driven — a Station contract, not a Workbench one. |
| D8 | **No freeform order editing.** A serialized refurb order is a binding contract for a specific tested unit; item/qty changes go through cancel-and-reallocate. | Diverges from Shopify deliberately. Editing shipping/notes/urgency stays. |
| D9 | **`order_line_items` is the bridge between physical units and commercial lines.** `order_unit_allocations` repoints to `order_line_items.id`, not `orders.id`. Schema in §6. | Serialized inventory: you must know *which serial fulfilled which paid line*. |
| D10 | **Order notes get a dedicated `order_notes` table** (`id UUID, order_id INTEGER, note_text TEXT`) rather than widening `entity_notes` or migrating `orders.id` to UUID. | Polymorphic across mixed PK types is the friction; a purpose-built table sidesteps it without touching the operational spine. See the scoping note in Week 3. |
| D11 | **Financials degrades in two steps, never blank.** Section shell always renders; when `sales_order_id` is NULL it falls back to `orders.sale_amount` + `currency` and marks the rich fields unavailable. | Operator is never blind; the gap is labeled, not silent. |

### Architecture principle (governs D5, D9, D11)

**Loose but reliable coupling between the operational spine and the commercial ledger.** `orders`
(INTEGER) stays lean and fast for picking / testing / scanning, uncluttered by accounting columns.
`sales_orders` (UUID) keeps carrying money, multi-line pricing, fees, and taxes. `/o/[orderId]` is the
single pane of glass that stitches them: physical ops data on first paint, commercial data hydrated
asynchronously after.

---

## 2. Target layout

Main column carries the transaction payload and its history; the right rail carries dimensional
metadata. Compose `Panel`/`SectionCard`, `LedgerGrid` for tabular, `EventTimeline` via `TimelineSection`
for history, the `CopyChip` family for typed identifiers.

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Order #12345   [SHIPPED]  [eBay]                        [⋯ actions]      │  (a)
├──────────────────────────────────────────────────────────────────────────┤
│ ⚠ Ship-by was 2 days ago                                                 │  (a)
├───────────────────────────────────────────┬──────────────────────────────┤
│ MAIN COLUMN                               │ RIGHT RAIL                   │
│                                           │                              │
│ [ Item ]                                  │ [ Customer ]            (a)  │
│  ▣ image   iPhone 13 Pro   [Grade A]      │  Alice Smith                 │
│            SKU IP13-P · 1 × $899.00       │  alice@example.com           │
│            S/N [ 8XYZ123 ]  verdict PASS  │                              │
│                                     (a/c) │ [ Ship to ]             (a)  │
│                                           │  123 Main St, NY 10001       │
│ [ Fulfillment ]                      (b)  │                              │
│  USPS  [Delivered]                        │ [ Buyer note ]          (b)  │
│  Trk [ 9400123… ]  Ship by Jul 28         │                              │
│                                           │ [ Links ]               (b)  │
│ [ Financials ]                       (c)  │  RMA · tickets · docs        │
│  Sale $899.00 · fees — · net —            │                              │
│                                           │                              │
│ [ Timeline ]                         (b)  │                              │
│  [All] [Carrier] [Ops] [Notes] [System]   │                              │
│  • Carrier — Delivered, front porch       │                              │
│  • Jane packed unit [ 8XYZ123 ]           │                              │
│  • Order created via eBay                 │                              │
└───────────────────────────────────────────┴──────────────────────────────┘
```

**Tier legend** — (a) buildable today · (b) small wiring fix · (c) blocked on schema.

| Section | Tier | Source / blocker |
|---|---|---|
| Hero + exception banner | (a) | `orders` |
| Item — title, SKU, condition, serial, verdict | (a) | `orders` + `order_unit_allocations` → `serial_units` |
| Item **image** | (c) | `photo_entity_links` CHECK has no `'ORDER'` (verified: `2026-06-18_photos_platform_side_tables.sql:29-33`) |
| Customer + ship-to (right rail) | (a) | `/api/customers/:id` — one fetch away; today only `/o` reaches it |
| Buyer note | (b) | `orders.buyer_note` — mirrored raw, projected into `entity_signals`; **not rendered on any order surface** |
| Fulfillment | (b) | `shipment_links` (the polymorphic SoT) instead of denormalized `orders.shipment_id` |
| Timeline + carrier events | (b) | merge `shipment_tracking_events` into the existing 4-spine query |
| RMA / returns | (b) | `rma_authorizations.order_id` — FK exists, read by nothing |
| Financials — full breakdown | (c) | keyspace bridge (D5); Week 6 |
| Financials — `sale_amount` fallback | (a) | renders now, unlinked-order path per D11 |
| Multi-line items | (c) | `order_line_items` (D6, D9, §6) |

---

## 3. Week-by-week

### Week 1 — consolidation

The week the operator feels it. No migrations.

1. Extract `OrderRecordBody` from the three forked bodies; full page and slide-over both mount it.
   `density="compact"` collapses the rail.
2. Flatten tabs → single scroll + right rail.
3. Wire search: exact matcher returns 1 → `/o/[id]`. Collapse the 3-hop resolution chain to a single
   fetch. Remove the `?mode=search` redirect-away in `OrderFullPageView`.
4. Hydrate the rail: `/api/customers/:id` (name, email, phone, ship-to) + `buyer_note`.
5. Move `PackoutChecklistCard` to its Station host.

**Done when:** every arrival path shows the same fields, and the search Customer section shows a name
instead of a raw `customer_id`.

### Week 2 — the timeline becomes the spine

1. Merge `shipment_tracking_events` into `/api/orders/:id/timeline` as a fifth spine, actor-typed.
2. Add the segmented filter (All | Carrier | Ops | Notes | System).
3. Surface `rma_authorizations` + `return_dispositions` — rail link, timeline entries.
4. Render audit `before_data`/`after_data` as inline diffs.

**Sub-resource failure is per-spine.** A carrier-events timeout renders that spine empty with a quiet
retry line; the timeline and the record still paint. Never 500 the record — house law.

### Week 3 — unblock the visual + note gaps

Two migrations, both small, both independent.

1. Add `'ORDER'` to `chk_photo_entity_links_entity_type` → item images and order-scoped photos.
2. Create `order_notes` (`id UUID PK`, `order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE`,
   `note_text TEXT`, `author_id`, `created_at`) — plus `organization_id UUID NOT NULL` and
   `enforce_tenant_isolation('order_notes')` in the same migration, and the Drizzle model in the same
   PR. `entity_notes` is left alone.

   **Scoping note — this is the third note home** (`entity_notes`, Entity Threads, now `order_notes`),
   and `ThreadPanel entityType="ORDER"` is already mounted on this page. Two homes are only legitimate
   if they do genuinely different jobs, so write the split down and enforce it in the UI:
   **`order_notes` = internal ops annotations** ("box arrived damaged", "packer forgot the cable");
   **threads = customer/support conversation**. If that line blurs in practice, collapse to threads —
   do not let the same note be writable in two places.

### Week 4 — keyspace bridge

The decision is D5; this is the part the research skipped.

1. **Measure before migrating.** Read-only report: what fraction of `orders.order_id` matches
   `sales_orders.reference_number` (exact, then normalized `UPPER(REGEXP_REPLACE(…,'[^A-Za-z0-9]',''))`
   — the same normalization `2026-04-15_backfill_receiving_shipment_id.sql` already uses for this
   family of joins). Report per `account_source`.
2. **Gate on the result.** High match → proceed. Low or channel-skewed → stop and re-open D5; a bridge
   that resolves for a minority of orders is worse than none, because the Financials section would
   appear and be blank for most records.
3. Migration: nullable `sales_order_id UUID REFERENCES sales_orders(id) ON DELETE SET NULL` on `orders`,
   org-led index, backfill by the matcher above, model in Drizzle in the same PR (polymorphic-tables
   contract). Non-matches stay NULL and render a teaching empty, never a zero.
4. Financials section reads through the bridge, fetched separately so it never blocks first paint.

### Week 5+ — line items

Only after Week 4 reports a healthy match rate, since `sales_orders.line_items JSONB` is the seed.
Schema and the allocation cutover are in §6.

### Week 6 — Financials on real data

With the bridge (Week 4) and lines (Week 5) in place, replace the D11 fallback with the full
breakdown: gross, tax, shipping collected, fees, net payout — read through `sales_order_id`, hydrated
asynchronously so it never blocks first paint. The fallback path stays as the permanent
unlinked-order behavior.

---

## 6. `order_line_items` — schema and cutover

```sql
CREATE TABLE IF NOT EXISTS order_line_items (
  id                     BIGSERIAL PRIMARY KEY,
  organization_id        UUID NOT NULL,              -- no DEFAULT; enforce_tenant_isolation installs it
  order_id               INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  external_line_item_id  TEXT,                       -- channel/mirror reconciliation key
  sku                    TEXT,
  product_title          TEXT,
  quantity               INTEGER NOT NULL DEFAULT 1,
  sale_amount            NUMERIC(12,2),              -- matches orders.sale_amount
  currency               TEXT DEFAULT 'USD',
  status                 TEXT NOT NULL DEFAULT 'pending',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Four amendments to the spec as given, to match house contracts:

- **`BIGSERIAL` id, not INTEGER-or-UUID.** The polymorphic-tables contract sets BIGINT as the default
  so the column never needs widening. `order_id` stays `INTEGER` because `orders.id` is `SERIAL`.
- **`status` as a named CHECK, not a pg ENUM** — `ALTER TYPE … ADD VALUE` is awkward and CHECK
  redefinition has bitten this schema before. `order_line_items_status_chk CHECK (status IN
  ('pending','allocated','fulfilled','refunded'))`, in the idempotent `DO $$ … duplicate_object` guard.
- **`sale_amount NUMERIC(12,2)`**, not INTEGER — matches the existing `orders.sale_amount` so the two
  never disagree on rounding.
- **Tenant-from-birth** — `organization_id UUID NOT NULL` with no DEFAULT plus
  `enforce_tenant_isolation('order_line_items')` in the same migration; org-led indexes
  (`(organization_id, order_id)`); Drizzle model in the same PR.

### The allocation cutover is the real work

Repointing `order_unit_allocations` from `orders.id` to `order_line_items.id` (D9) is correct — it is
the only way to know which serial fulfilled which paid line — but it makes this a **spine change**, not
an additive child table. It reaches the timeline query (which resolves units via allocations), the
packout flow, and every serial-for-an-order lookup. Stage it:

1. Ship `order_line_items`; backfill one line per existing order from `orders` (and from
   `sales_orders.line_items` where the bridge resolved).
2. Add nullable `order_line_item_id` to `order_unit_allocations`. **Dual-write** both keys.
3. Backfill the new key; verify every allocation resolves to exactly one line.
4. Flip readers one at a time. Drop the old path last, once none remain.

Do not collapse steps 2–4 into one migration. The single-line fields on `orders` stay as a
denormalized cache until every reader is off them.

---

---

## 4. What gets cut

| Cut | Where it goes |
|---|---|
| The 8-tab strip | Single scroll + rail |
| `PackoutChecklistCard` on the record | Station surface (D7) |
| `/dashboard?mode=search` as an order destination | Fuzzy/multi-result queries only |
| The dashboard-search fork (`SearchOrderDetailShell` + its fact-row primitives) | Deleted once `OrderRecordBody` lands |
| Pipeline stepper as hero | Status chip + timeline; the Tested→Packed→Scanned Out detail stays as a compact strip in Fulfillment |

---

## 5. Open questions

Resolved 2026-07-27: line-items shape → D9 + §6 · order notes → D10 · Financials fallback → D11 ·
coupling principle → §1.

Still open:

1. **Citations artifact** (§0) — `order_details_research_briefing.md` exists outside this repo; land it
   in `docs/todo/` and fold the sources into the brief.
2. ~~**`order_notes` vs. threads boundary** (Week 3)~~ — **resolved 2026-07-31.** The boundary that
   actually leaked was not notes-vs-threads but `order_notes` vs. the legacy scalar `orders.notes`,
   which the inspector made writable side by side. All operator writers were migrated onto
   `POST /api/orders/[id]/notes` (record trail + the grid's in-cell "Add note"), the scalar is now
   read-only legacy — `PATCH /api/orders/[id]` and `POST /api/orders/assign` reject `{ notes }` —
   and the split is pinned by `src/lib/orders/order-note-grain.guard.test.ts`. Law:
   `.claude/rules/source-of-truth.md` → Order note grain. The notes-vs-threads line (internal
   annotation vs. customer conversation) still stands and still wants revisiting if it blurs.
3. **Allocation cutover sequencing** (§6) — the staged path is defined, but step 4 (flip readers) needs
   a reader inventory before it can be scheduled.
