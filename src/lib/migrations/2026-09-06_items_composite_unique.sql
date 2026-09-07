-- 2026-09-06: items / item_stock_cache — composite (organization_id, zoho_item_id)
-- uniqueness, replacing the GLOBAL zoho_item_id UNIQUE.
--
-- The global UNIQUE made a Zoho item id a cross-tenant key: a colliding id
-- synced by org B hijacked org A's mirror row (itemRepository.upsertMany
-- conflicted on the global column), and item_stock_cache upserts keyed the
-- same way. Repository lookups are org-scoped in the same commit (audit
-- 2026-09-06, handoff item 6). Verified live before writing: zero duplicate
-- (organization_id, zoho_item_id) pairs and zero NULL-org rows on both
-- tables, so the constraint swap cannot fail on existing data.

BEGIN;

ALTER TABLE items DROP CONSTRAINT items_zoho_item_id_key;
CREATE UNIQUE INDEX items_org_zoho_item_key ON items (organization_id, zoho_item_id);

ALTER TABLE item_stock_cache DROP CONSTRAINT item_stock_cache_zoho_item_id_key;
CREATE UNIQUE INDEX item_stock_cache_org_zoho_key ON item_stock_cache (organization_id, zoho_item_id);

COMMIT;
