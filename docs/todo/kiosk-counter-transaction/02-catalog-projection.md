# Phase 02 — local priced catalog projection

**Lane:** `kiosk-catalog` · `topic/kiosk-catalog` · port 3150
**Wave:** A — dispatch immediately, parallel with 01 and 03
**Depends on:** nothing
**Blocks:** Phase 05 (the kiosk cart cannot total without local prices)
**Parent:** [`../kiosk-counter-transaction-PLAN.md`](../kiosk-counter-transaction-PLAN.md) §5 Phase 2 · [`00-INDEX.md`](./00-INDEX.md)

---

## Goal

Give the counter a **local, priced, category-navigable** product catalog so the kiosk can total a mixed cart without a live vendor round trip.

## Why this exists

There is **no sell price anywhere in Postgres** for these SKUs. `src/lib/repair/ecwid-repair-catalog.ts` says so in its own header, and the schema agrees: `sku_catalog` carries only `last_known_cost_cents` (acquisition) and `replenish_target_cents` (reorder trigger) — neither is a sell price.

Consequences live today: a cold repair-catalog read walks the entire Ecwid storefront (~16s, documented in that module, which fights it with a two-tier L1 `Map` + Redis cache and bounded-concurrency category fetches), and the repair form ships a hardcoded `price: '130'` default in `buildInitialFormData` (`src/components/repair/repair-intake-logic.ts`).

## Decision already made — do not relitigate

**Price home is `platform_listings`, not `sku_catalog`.** Sell price is per-channel; `platform_listings` already carries `organizationId` + `listingPriceCents` + `platform` + `externalRefId` and its schema comment declares it the forward-prep home for exactly this ("currently 0 rows / 0 writers by design"). `sku_catalog` stays product **identity**. Putting a channel-specific sell price on the identity hub is the fork this decision avoids.

## Scope

### 1. The projection must carry CATEGORIES, not just price

This is the part most likely to be under-built. `src/components/repair/ProductSelector.tsx` drills a **category hierarchy** (breadcrumbs, parent/child, leaf detection) — see `resolveRepairCategoryLevel` in `ecwid-repair-catalog.ts`. A price-only projection leaves the live Ecwid walk in place and this phase delivers nothing.

Project both: per-listing price **and** the category tree the selector navigates. Decide and document whether the tree lands as its own table or as structured columns/jsonb on the listing — justify it against `.claude/rules/polymorphic-tables.md` (queryable business facts become real columns; only true variant config stays jsonb).

### 2. Writer

Extend the **existing** `src/lib/ecwid-square/sync.ts` plus a webhook/cron refresh. **Do not add a new service or queue.** Migration `2026-07-29b_platform_listings_price_projection.sql`.

### 3. Repoint the readers

`ecwid-repair-catalog.ts` reads the projection; the live Ecwid walk becomes the cold-start/backfill path only. Keep `/api/repair/ecwid-products` and `/api/kiosk/repair/ecwid-products` response shapes **byte-identical** — `ProductSelector` consumes both via `apiBasePath` and must not change in this phase.

### 4. Fix the stale `skuCatalog` Drizzle model — in this PR

`src/lib/drizzle/schema.ts` ~L2316 is **wrong**: it shows `sku: text('sku').notNull().unique()` and carries no `organizationId`. The live table has `organization_id NOT NULL` **and** a per-org composite unique `sku_catalog_org_sku_key UNIQUE (organization_id, sku)` (`2026-06-28j`), coexisting with the legacy global unique until a `.gated` phase-2 drop.

Correct the model to match reality. House rule: model it in Drizzle in the same PR. This is a documentation-accuracy fix — **no behavior change, no data migration.**

## Staleness contract — write it down in the module

The local projection is authoritative for **display**; the terminal charge is authoritative for **money**. A charge rejected on catalog drift triggers a background refresh. State this explicitly in the module header so the next reader does not "fix" it into a live read.

## File ownership

**Yours:** `src/lib/ecwid-square/sync.ts`, `src/lib/repair/ecwid-repair-catalog.ts`, the migration, and **only the `skuCatalog` + `platformListings` regions** of `src/lib/drizzle/schema.ts`.

**Phase 03 is appending a new block to the end of that same file.** Do not touch anything outside those two existing blocks or Wave A ends in a conflict.

## Do NOT

- Put a sell price on `sku_catalog`.
- Change `ProductSelector` or any API response shape.
- Touch `src/app/api/kiosk/**` or `square_transactions`.
- Drop the legacy global `UNIQUE(sku)` — separate `.gated` lane.

## Acceptance

- [ ] Price + category tree readable from Postgres with no Ecwid call
- [ ] Writer extends `ecwid-square/sync.ts`; no new service
- [ ] Repair catalog routes return identical shapes; `ProductSelector` unchanged
- [ ] `skuCatalog` Drizzle model matches the live table
- [ ] Staleness contract documented in the module header
- [ ] `npm run verify` green

## Verify

```bash
npm run verify
```

Add DB-free unit tests for the projection/normalization logic (`node:test` + `tsx`, `Deps`-injection per `.claude/rules/backend-patterns.md`). Measure the cold catalog read before and after — report both numbers. **Applying the migration is ask-first.**
