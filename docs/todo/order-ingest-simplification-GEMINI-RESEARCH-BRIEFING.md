# Research briefing — order ingest & multi-platform sync: simplifying the path, and moving line items onto the SKU catalog hub

**For:** Gemini Pro (deep research) — **you have read access to this repository.** Paths below are pointers, not excerpts; read the real files.
**From:** Cycle Forge engineering
**Date:** 2026-07-29
**Scope:** the order **ingest / import / sync** path and the **orders ↔ product identity** relationship. Not the display layer (see `pending-grid-display-language-GEMINI-RESEARCH-BRIEFING.md`), not fulfilment state machines.

**This brief asks you to REMOVE things, not add them.** Every recommendation must reduce the number of ingest paths, row formats, or duplicated columns. A proposal that introduces a new service, queue, abstraction layer, or feature is out of scope unless it *deletes* at least as much as it adds — say what it deletes.

**Deliverable:** three separate answers.

1. **Industry answer.** What is the 2026 standard architecture for importing and continuously syncing orders from several marketplaces at once (eBay, Amazon, Shopify, Walmart, a self-hosted store, a spreadsheet)? Named systems and cited sources. Cover the *normalization boundary* specifically: where does a vendor payload stop being vendor-shaped and become the domain's own shape?
2. **Codebase answer.** Reconcile that against §3–§6 here. Produce the target shape for *this* repo and a deletion-ordered path to it.
3. **The catalog-hub question.** Should an order line item stop carrying its own `product_title` / `sku` / `condition` and instead reference `sku_catalog`? Answer with the migration and the failure modes, given §5's measured link rate.

---

## 0. Method — read this before answering

### 0.1 Verify in the repo before you assert. This is not optional.

**Run 1 of this brief produced a plan whose two central phases targeted files that do not exist**, and attributed a justification to notes that never contained it. You have repo access; use it. Specifically:

- **Every file path you name must be one you opened.** Before writing "rewrite `src/lib/x/y.ts`", list that directory and confirm. If you are inferring a path from a naming convention, say so explicitly and mark it `[UNVERIFIED]`.
- **Every claim about what a module does must come from reading it**, not from its name. `orders-transfer.ts` is not what its name suggests (see §4).
- **Never attribute a rationale to this brief that is not written in it.** If you are supplying your own justification, say "my reasoning:" — do not phrase it as a citation.
- **Quote the evidence** for load-bearing claims: a line number, a function signature, a schema column. A plan built on inferred structure is worse than no plan, because it looks executable.

### 0.2 Search the web for the industry half. Also not optional.

Part 1 of the deliverable is a **current** industry comparison. Do not answer it from memory:

- Search for and cite **named systems** and primary sources — OMS/commerce platform docs (Shopify, Medusa, Saleor, commercetools), unified-API vendors (Nango, Merge, Codat), and integration-pattern literature.
- Prefer sources dated **2024–2026**. Where practice changed since ~2022, say what changed and why.
- Where the industry genuinely splits (order-line immutability vs catalog normalization is one such split), give **both** positions, the conditions each wins under, and then pick one for this codebase.
- Distinguish "what large marketplaces do at scale" from "what a small multi-tenant reseller SaaS should do." They diverge, and this repo is the latter.

### 0.3 Corrections from run 1 — treat these as established facts

| Run-1 claim | Actual |
|---|---|
| "Orders must **become** a native Capability (`orders.sync`)" | **It already is one.** See §4. The work is finishing a migration, not starting one. |
| Phase 2: rewrite `src/lib/integrations/connectors/ecwid.ts` | **No such file.** |
| Phase 3: rewrite `src/lib/integrations/connectors/google-sheets.ts` | **No such file.** |
| Both adapters live in separate modules | Both live in **`src/lib/integrations/connectors/orders-transfer.ts`** — closer to one phase than two. |
| `orders.shipment_id` is "an explicit read cache, called out in schema drift notes" | **This brief never said that.** Unverified; rule on it from the code. |

Run 1 was right about: order-line immutability (keep the snapshot), deleting the positional-array format, the `order_line_items` split, moving `deadline_at` onto orders, and refusing a message bus. Build on those; re-derive the rest.

---

## 1. Product context

**Cycle Forge** is multi-tenant reseller-operations SaaS for used-goods resellers; USAV is the dogfood tenant. Inventory is **serialized** — individual physical units with serials, condition grades, test verdicts, photo evidence. Orders arrive from eBay, Amazon/FBA, Walmart, an Ecwid storefront, walk-in/local pickup, and a Google Sheet that a human maintains.

Two house laws govern everything below and are non-negotiable:

- **Vendor integrations are tenant connectors behind capability facades** — never the product itself. Product surfaces speak capability nouns or a runtime provider label, never a hardcoded vendor sentence. See `AGENTS.md` → Product, and `.claude/rules/source-of-truth.md` → Integrations.
- **Tenant-from-birth.** Every table carries `organization_id UUID NOT NULL`, org-led indexes, and `enforce_tenant_isolation()` in its birth migration. See `.claude/rules/polymorphic-tables.md`.

---

## 2. What triggered this brief — a real incident, as evidence

While fixing a display bug we traced why the outbound Pending queue showed **zero on-time orders**, ever. Three independent causes, all in the ingest path:

1. **`src/lib/jobs/google-sheets-transfer-orders.ts`** — when the sheet's optional "Ship by date" cell was blank, the importer fell back to `getTodayDate()`, stamping the *import day* as the deadline. An order was born already at its due date. (Fixed. Blast radius on live data turned out to be 2 rows.)
2. **The same line** parsed date-only cells with `new Date('YYYY-MM-DD')` → UTC midnight → **the previous day** in the warehouse zone (`America/Los_Angeles`). Every date-only ship-by landed a day early. (Fixed, now routed through `toPSTDateKey` + `warehouseDayUtcBounds`.)
3. **`src/lib/ecwid/fetch-transfer-rows.ts:150`** — the Ecwid adapter wrote the customer's **order placement timestamp into the ship-by column slot**, so every Ecwid order was due the instant it was placed. Ecwid consequently showed the worst average lateness of any channel (15 days vs eBay 9.6, Amazon 7.8) despite nothing being wrong with its fulfilment. (Adapter fixed; a 243-row data migration is staged.)

**Read cause 3 as an architectural symptom, not a typo.** It happened because the Ecwid adapter **synthesizes positional array rows shaped like a Google Sheet** so it can ride the sheet importer:

```
Ecwid REST API → array[] indexed by the SHEET's resolved column positions → sheet importer
```

`row[colIndices.shipByDate] = orderDate` is a perfectly reasonable line to write when your target is an untyped positional array whose slots are named after a spreadsheet. There is no type, no field name, and no validation between the vendor payload and the database. **The central question of this brief is whether that intermediate format should exist at all.**

---

## 3. The current ingest map — read these

There are at least eight writers of orders. Please build the authoritative list yourself; this is what we know:

| Path | File | Source | Notes |
|---|---|---|---|
| Sheet transfer job | `src/lib/jobs/google-sheets-transfer-orders.ts` | Google Sheet, **daily tabs** `Sheet_MM_DD_YYYY` | ~1,300 lines. The de-facto hub. |
| Ecwid adapter | `src/lib/ecwid/fetch-transfer-rows.ts` | Ecwid REST | Emits sheet-shaped arrays into the job above |
| ShipStation sync | `src/app/api/google-sheets/sync-shipstation-orders/route.ts` | Sheet | Own `parseShipDate`, own upsert |
| Sheet sync | `src/app/api/sync-sheets/route.ts` | Sheet | |
| Import orders | `src/app/api/import-orders/route.ts` | ? | |
| CSV import | `src/app/api/orders/import-csv/route.ts` | CSV | |
| Manual add | `src/app/api/orders/add/route.ts` | UI | |
| eBay backfill | `src/app/api/orders/backfill/ebay/route.ts` | eBay API | |
| Ecwid backfill | `src/app/api/orders/backfill/ecwid/route.ts` | Ecwid API | |
| FBA shipments | `src/app/api/fba/shipments/**` | Amazon | Writes deadlines too |
| Domain helper | `src/lib/neon/orders-queries.ts` → `createOrder` | — | |

**Column binding is a two-tier guess.** `FIXED_COL_INDICES_DEFAULT` gives positional defaults; `REQUIRED_SHEET_HEADER_BINDINGS` / `OPTIONAL_SHEET_COLUMN_BINDINGS` try to resolve by header text with candidate lists (`['Ship by date', 'Ship Date', 'Due Date']`). A missing optional header silently leaves `-1`.

**Questions.** How many of these are genuinely different *jobs* versus the same job with different front-ends? Which should be deleted outright? Is "one importer, many adapters" right, or has that exact shape produced the coupling in §2 and should the adapters instead each own their own typed write?

---

## 4. The seam already exists — this is a half-finished migration, not a greenfield build

**This is the most important section, and run 1 got it wrong.** The target architecture is already scaffolded. Verify all of this yourself:

- **`orders` is already a declared Capability.** `src/lib/integrations/connectors/types.ts` — the `Capability` union includes `'orders'`, documented as *"sales-order ingestion (marketplaces / storefronts / POS)"*. The same file has a `sync()` contract and a comment describing *"connection-driven ingestion (replaces the transfer-orders buttons)"*.
- **Sheets and Ecwid already have connector adapters** — `src/lib/integrations/connectors/orders-transfer.ts` exports `googleSheetsSync(orgId)` and `ecwidSync(orgId)`, routed through `POST /api/integrations/[provider]/sync`.
- **But those adapters are thin wrappers around the old job.** `orders-transfer.ts` imports `runGoogleSheetsTransferOrders` from the 1,300-line job and reshapes its result into a `SyncOutcome`. Its own header states the legacy NDJSON routes (`/api/google-sheets/transfer-orders`, `/api/ecwid/transfer-orders`) stay live because the cron fan-out and a legacy importer panel still stream through them.
- **Sibling connectors exist for `amazon`, `ebay`, `shipstation`, `shopify`, `square`, `zoho`, `nextiva`,** plus `orchestrator.ts` and `registry.ts`. A Nango-backed Shopify orders-in path is reportedly code-complete — a second, newer ingest philosophy already sits beside the sheet one.
- The capability-facade precedent is `getInventoryProvider` / `getHelpdeskProvider` (`integrations/inventory/`, `integrations/helpdesk/`), with credentials in the `organization_integrations` vault via `integrations/credentials.ts`.

**So the real question is not "should orders become a capability" — it is: given that the seam exists and is wrapping the legacy job rather than replacing it, what is the shortest path to pushing normalization *down through* that seam and deleting the job?** Specifically:

- Where should the `CanonicalOrder` shape live so both the existing connectors (amazon/ebay/shopify) and the wrapper adapters can converge on it?
- What still depends on the legacy NDJSON routes and the cron fan-out, and in what order can those be cut over?
- What does a **human-maintained Google Sheet** — no API contract, daily `Sheet_MM_DD_YYYY` tabs, header-guessed columns — look like as a first-class connector? Is it a connector at all, or an import surface that produces `CanonicalOrder` and is not on the sync schedule?
- `orders-transfer.ts` also contains a hardcoded absolute debug-log path and `appendFileSync` in production code. Note it; it is in-flight debugging cruft in the ingest path.

---

## 5. The catalog-hub question — measured

`orders` carries product identity **inline** *and* a link:

```
orders: id, order_id, product_title, condition, sku, item_number, quantity,
        sku_catalog_id, account_source, order_date, created_at, customer_id,
        shipment_id, sale_amount, currency, is_out_of_stock, …

sku_catalog: id, sku, product_title, category, upc, ean, gtin, image_url,
             sku_type, lifecycle_status, provider_item_id, …
```

**Measured link rate: 323 of 1,204 orders in the last 45 days carry a `sku_catalog_id` — 27%.** For the other 73%, the denormalized `product_title` is the *only* product identity that exists. So "just drop the columns and join" is not available today; the brief needs a path that survives the unlinked majority.

### 5.1 The identifier-link question, measured (added after run 1)

The product owner's position is that an order should not be admitted on a **product title alone** — it should carry a provider **item number** that links it to the catalog hub. Directionally that is the only join the house permits, since joining on the SKU *string* is banned (see the landmine below). But the data says the mechanism is not there yet:

```
orders.item_number  →  sku_catalog.provider_item_id
    0 matches, out of 709 orders that have an item_number
    provider_item_id is populated on 109 of 1,366 catalog rows (8%)
```

Per-source `item_number` coverage is also wildly uneven, and inverted against the current link rate:

| Source | Orders (45d) | Has `item_number` | Has `sku_catalog_id` |
|---|---|---|---|
| Amazon | 552 | 479 (87%) | 64 |
| eBay | 417 | **75 (18%)** | 186 |
| ecwid | 107 | 107 (100%) | 7 |
| Walmart | 55 | 19 (35%) | 23 |

eBay has the *worst* identifier coverage and the *best* catalog link rate — because linking today runs on **title matching** (`batchResolveSkuCatalogByTitles` in `src/lib/neon/sku-catalog-queries.ts`, plus the chore queue in `src/lib/inventory/order-catalog-link-chores.ts`), not on identifiers.

**Questions.**
- Is "reject an order that has no resolvable catalog identifier" ever the right ingest gate for a used-goods reseller, or does it fail the moment a marketplace omits the field (82% of eBay today)? What do comparable systems do — hard reject, quarantine, or accept-and-reconcile?
- What is the correct **identity ladder** at ingest — `provider_item_id` → GTIN/UPC/EAN → normalized title — and which rungs belong at ingest vs a background reconcile chore?
- Is `provider_item_id` even the right column, given it is 8% populated and matches nothing? Should the link be a **polymorphic `entity_type`/`entity_id` link table** per `.claude/rules/polymorphic-tables.md` (one row per order-line↔catalog association, org-led index, named CHECK) rather than a scalar FK — and does that earn its complexity here, or is a plain FK correct?
- Title matching is currently load-bearing. If identifiers become primary, what happens to it — deleted, or demoted to a fallback rung?

**A landmine you must respect** (`.claude/rules/source-of-truth.md` → SKU identity): `items` (a Zoho mirror) and `sku_catalog` are **two independent SKU numbering schemes that collide**. **Never join on the SKU string.** `items.name` is the title-display SoT — `get-title-by-sku` deliberately prefers `items.name` over `sku_catalog`. Any proposal that resolves product identity by SKU text is wrong here; explain how yours avoids it.

**Questions.**
- Is the 2026 standard for a commerce/OMS schema to keep a **denormalized snapshot** of product identity on the order line (because the catalog mutates and an order must remember what was *actually sold*), or to reference the catalog and resolve at read time? This is a genuine industry split — order-line immutability vs. catalog normalization. Give the dominant pattern and the conditions each wins under, with sources.
- If a snapshot is correct, what is the minimal snapshot, and how does it coexist with `sku_catalog_id` without the two disagreeing?
- What raises the 27% link rate — and is that a *matching* problem (`src/lib/neon/sku-catalog-queries.ts` `batchResolveSkuCatalogByTitles`, the catalog-link chore queue in `src/lib/inventory/order-catalog-link-chores.ts`) or an *ingest* problem (the adapters never supply a resolvable identifier)?
- Should there be an explicit **order line item** table at all? Today an "order" row *is* a line — multi-line orders are several `orders` rows sharing an `order_id`, folded in the UI. Is order↔line the missing normalization, and does it subsume the catalog question?

---

## 6. Polymorphic linking — the house contract and where orders sit

Contract: `.claude/rules/polymorphic-tables.md`. Discriminator with a named CHECK, `entity_type`/`entity_id` naming, BIGINT ids, **org-led** unique indexes, parent-delete integrity via a real FK *or* a trigger family, tenant-from-birth, modeled in Drizzle in the same PR.

Live examples to study: `photo_entity_links` (the normalized reference), `part_links`, `shipment_links` (legacy `owner_type`/`owner_id` — kept, not a pattern to copy), `documents`, `entity_notes`, `work_assignments` (pg ENUM discriminator).

Two specific oddities to rule on:

1. **The order's ship-by deadline lives in `work_assignments`**, not on the order — `entity_type='ORDER'`, `work_type='TEST'`, resolved through a lateral join with a status-priority ordering (`WA_DEADLINE_LATERAL` in `src/lib/neon/orders-queries.ts`). Every reader re-derives it through that lateral. Is a polymorphic *work assignment* the right home for a commercial commitment, or is the deadline an order fact that got put in the work table because that table already had a `deadline_at` column?
2. **`shipment_links`** is the polymorphic owner↔tracking SoT, while `orders.shipment_id` also exists. Two linkage mechanisms for one relationship.

**Question:** which of the ingest path's couplings are actually *schema* problems wearing an ingest costume?

---

## 7. Hard constraints

1. **Never join `items` and `sku_catalog` on the SKU string** (§5).
2. **Tenant-from-birth**, org-led indexes, `enforce_tenant_isolation()` in the birth migration; `withTenantTransaction(orgId, …)` for org-scoped writes.
3. **Status changes only via `transition()` / `applyTransition()`** — never a raw `UPDATE … current_status` (`.claude/rules/backend-patterns.md`).
4. **Route skeleton:** `withAuth` → validate → domain helper → status map → `recordAudit` → `after()` side-effects. Business logic in `src/lib/**`, not handlers.
5. **Idempotency** via `clientEventId` threaded into `inventory_events` (`UNIQUE(client_event_id)`).
6. **One search engine.** `hybridSearch` over `entity_search_docs`; a new searchable entity extends `build-search-text.ts` + adds triggers in a migration. Never a per-surface search.
7. **Dates:** three separate types — instant / civil date / zoned wall-clock. `src/utils/date.ts` is the SoT; host-local "today" is banned. Civil-date tests must pass under `TZ=UTC`.
8. **Migrations are hand-written SQL** in `src/lib/migrations/` and immutable once dated; `db:push` is hook-blocked. Drizzle is modeled in the same PR but SQL is the source of truth.
9. **Ask-first** on migrations, tenant scoping, status-machine and audit changes — say clearly when your proposal crosses that line.

---

## 8. Known drift worth confirming while you are in there

- `orders.order_date` is declared `timestamp('order_date', { withTimezone: true })` in `src/lib/drizzle/schema.ts` but the live column is **`timestamp without time zone`**. It has also been **NULL on every one of the last 1,204 orders** — a column that existed unused until this week.
- `orders.tracking_added_at` is NULL across the live Pending set.
- `getDaysLateTone` tops out at "≥8 days", collapsing a wide real range into one tone.

---

## 9. Deliverable format

0. **Verification log** — a short table of every file path and module behaviour your plan depends on, with what you confirmed and how (directory listing, line number, signature). Anything you could not confirm is marked `[UNVERIFIED]` and may not carry a phase. Put this FIRST; a plan whose paths are wrong is not reviewable.
1. **Executive verdict**, ≤10 lines: the single biggest simplification available, named. Given §4, it is probably not "build a capability."
2. **Industry survey** per §3/§4/§5, **with live web citations** (§0.2) — named systems, dated sources, dominant-pattern calls; flag what changed since ~2022 (notably: has "normalize into a canonical order schema at the connector edge" won, and how do unified-API vendors shape it?).
3. **Target architecture** for this repo — one diagram plus a table of *what gets deleted*. Every row must name a **verified** file or table that goes away or merges.
4. **Catalog-hub ruling** (§5 + §5.1): snapshot vs reference; the identity ladder; whether an identifier gate at ingest is viable; the migration, the backfill for the unlinked 73%, and the failure modes.
5. **Sequenced deletion plan** — phases, each independently shippable and revertible, ordered by *lines and paths removed per unit of risk*. Mark anything ask-first per §7.9. Account for what still depends on the legacy NDJSON routes and the cron fan-out (§4).
6. **What you would NOT change**, and why. Include anything that looks redundant but is load-bearing.

**Two standing instructions.** Where a recommendation collides with a house law in §7, cite it by number and argue the case — the laws are evolvable against a stated argument, not silently. And do not propose a message bus, a new microservice, an event-sourcing rewrite, or a vendor iPaaS unless you can show it deletes more than it adds; the goal is fewer moving parts than exist today, not a better-architected larger system.
