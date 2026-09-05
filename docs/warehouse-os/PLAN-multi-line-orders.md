# PLAN — multi-line orders (one order, many items, grouped tracking)

**Status:** Layer 1 landed 2026-09-04. Layers 2–4 open.
**Operator ask:** "one person, one order, ordered five different items" — display them
inline under one order-number parent, expand/collapse, with tracking numbers grouped so
one tracking can cover two products.

---

## Diagnosis

`orders` is a LINE table wearing an order's name. Its columns — `product_title`, `sku`,
`condition`, `quantity`, `item_number`, `sale_amount`, `sku_catalog_id` — are per-line
facts, and `order_id` is the marketplace order number, meant to repeat across siblings.

Three layers independently asserted one line per order:

| Layer | What asserted it | State |
|---|---|---|
| 1. Schema | `UNIQUE (order_id, account_source)` | **Fixed** — see below |
| 2. Ingest | `groupCanonicalOrderLines` folds all lines onto one row | Open |
| 3. Display | `QueueGroupRow` parent chrome exists but never receives >1 row | Open (needs 1+2) |

Fixing only one changes nothing observable. They must land in order.

---

## Layer 1 — schema identity ✅ landed 2026-09-04

`src/lib/migrations/2026-09-04_orders_multi_line_identity.sql`

- `orders.external_line_id text NOT NULL DEFAULT ''` — the marketplace's own line id
  (Amazon `OrderItemId`, eBay `lineItemId`/`transactionId`, Shopify `line_item.id`).
  NOT NULL on purpose: a nullable column would make every row distinct from every other
  and the index would stop deduplicating, turning an idempotent sync into a row multiplier.
- New key `idx_orders_unique_org_account_order_line (organization_id, order_id,
  account_source, external_line_id)`, replacing `idx_orders_unique_account_order`.

Two bugs fixed in passing:

1. **Tenancy.** The old index omitted `organization_id`, so two orgs on the same channel
   with the same order number collided globally.
2. **A broken upsert.** `idx_orders_unique_account_order` was a bare unique INDEX, never
   promoted to a CONSTRAINT, so every
   `ON CONFLICT ON CONSTRAINT idx_orders_unique_account_order` in the connectors threw at
   runtime (`constraint … does not exist`). Verified against the live dev DB. All call
   sites now use the column-inference form, which Postgres accepts for a plain unique index:
   `src/lib/amazon/order-sync.ts`, `src/lib/ebay/sync.ts` (×2).

Pre-flight against the dev DB: 0 rows violate the new index, 0 rows have a NULL
`organization_id`. The new key is strictly weaker on existing data — it adds two columns
to a unique tuple, so it can only split groups apart, never merge them.

**Not yet applied.** Run via `/db-migrate` (dry-run → confirm → apply).

---

## Layer 2 — ingest stops collapsing (next)

`groupCanonicalOrderLines` (`src/lib/orders/canonical-order.ts:154`) keys a Map by
`externalOrderId` and merges: *"Last line wins the scalars; trackings accumulate."* Five
items in, one row out. `lineCount` is already counted and then thrown away.

Work:

1. Add `externalLineId: string` to `CanonicalOrderLine`; adapters populate it where the
   source carries one, `''` where it does not.
2. Re-key the fold to `(externalOrderId, externalLineId)` so distinct lines survive, and
   keep the order-level accumulation (trackings, customer) as a separate pass rather than
   a side effect of the merge.
3. Audit the three order-scoped behaviours downstream that currently assume one row per
   order and would eat siblings:
   - `collapseDuplicates` — folds "duplicate" rows onto the richest and **deletes** the
     rest. Must become line-aware or it will delete four of five lines.
   - customer matching by `externalOrderId`
   - the canonical `work_assignments` deadline row (one per order, not per line)

`impact_analysis` on `ingestCanonicalOrders`: **11 files, 13 symbols** — every connector
(`square`, `shopify`, `shipstation`, `ecwid`, `googleSheets`), the CSV import route, and
the cron transfer routes. This is the largest layer and the one that needs its own session.

---

## Layer 3 — display

Already built, currently unreachable:

- `QueueGroupRow` — parent chrome: order chip, "N lines", "N tracking", tri-state group
  checkbox. Paints when `group.rows.length > 1`.
- `group-rows.ts` — the full fold API, written for this and never consumed by the queue:
  `FoldState` (polarity carried in the value), `foldKey` (band-qualified), `isFoldOpen`,
  `flattenRenderOrder` (fold-blind, for the cursor and `aria-rowindex`),
  `flattenVisibleRenderOrder` (visible-only, for scroll and roving focus),
  `CollapsedFoldRendering`.
- `shipment_links (owner_type='ORDER', owner_id=<line id>, shipment_id, box_seq,
  is_primary)` — already a real N:M. One tracking, two products = two rows sharing
  `shipment_id`. Two trackings, one product = two rows sharing `owner_id`. `box_seq` is
  the physical box.

To build:

```
▾ 20-51978 · 5 lines · 2 shipments                    ☑
   ┌─ 1Z··4821  UPS · in transit
   │    Bose CineMate II              1    $85
   │    Bose SoundDock                1   $120
   └─
   ┌─ 1Z··9903  UPS · delivered
   │    Sony STR-DH190                2   $240
   └─
        Marantz PM6007                1   $499   no tracking
```

**The bracket is the shipment, not the order.** That is the inversion: today the desk is a
flat list with an order column; here the order is a band and the shipment is the fold.
Lines nest inside the tracking that carries them, and unbracketed lines are visibly
unshipped — "which of these five hasn't gone out" becomes a shape, not a column.

### The chevron is a recorded reversal

`QueueGroupRow.tsx:48` currently reads:

> "no chevron — collapse is how a 3-line order vanishes under a key the operator cannot see."

The operator asked for expand/collapse on 2026-09-04. The counter-argument was real, so
the mitigation is part of the instruction:

- `FoldState.mode: 'default-expanded'` (track *collapsed* keys, not expanded ones) — a
  fold only hides because someone chose to hide it.
- The parent keeps printing "5 lines" while closed, so nothing vanishes silently.

Record the reversal in the docblock, dated, naming the argument it overturns — the way the
2026-09-04 faded-check reversal was recorded in `GridRowCheckbox.tsx`.

### Gate note

`ds_adjudicate` currently returns **allowed** for a disclosure control in the select
gutter — the router's `slot-table.orders-row-dots-menu` rule matches a ⋮ actions column,
not a chevron. The gutter's law lives only in a docblock. Whichever way this lands, the
router needs a rule so the next agent cannot get it wrong by accident.

---

### Related prior art — read before Layer 2

`src/lib/orders/order-grain-sql.ts` (CF-03 / CF-04) already solves the **converse**
relationship: many orders sharing one carton. Its opening note —

> "Serial↔order and pack-queue membership must not be inferred solely from `shipment_id`
> — sibling orders that share a carton would smear / vanish."

— is the same failure mode this plan hits from the other side, and `SQL_SHIPMENT_IS_SOLE_ORDER`
is an existing guard for exactly the ambiguity multi-line orders make common. Once one
order carries several lines that share a shipment, every place that reasons from
`shipment_id` alone needs the same treatment. Audit those call sites in Layer 2 rather
than discovering them in Layer 3.

---

## Vocabulary

The current naming is what let this drift. Fix it in code as each layer lands:

| Term | Means | Today |
|---|---|---|
| **Order** | marketplace order number — a *band*, not a row | `orders.order_id` |
| **Line** | one item on it | an `orders` row |
| **Shipment** | one tracking number, spans 1..N lines | `shipping_tracking_numbers` via `shipment_links` |
| **Box** | physical carton within a shipment | `shipment_links.box_seq` |

No order-header table is needed. Order-level facts (`order_date`, `customer_id`,
`account_source`, `buyer_note`) already repeat per line and the parent row derives from
`group.rows[0]`. Add a header table only when there are order-level facts the lines can
legitimately disagree about.

---

## Sequence

1. ✅ Layer 1 written — apply via `/db-migrate`
2. Seed one real 5-line order and confirm `QueueGroupRow` parent chrome paints
3. Layer 2 — ingest de-collapse (own session; 11 downstream files)
4. Layer 3a — shipment bracket sub-band
5. Layer 3b — chevron + `FoldState`, plus the router rule

Each step is visible before the next lands.
