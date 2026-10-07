-- ============================================================================
-- Link PENDING pending_skus rows whose canonical key already names a catalog row
-- ============================================================================
-- What + why: pending_skus.normalized_sku is fn_normalize_sku(raw), so a
-- zero-stripped scan such as `89-P-1` is queued under `00089-P-1`. The
-- trg_resolve_pending_sku trigger only links a queue row when a catalog row is
-- INSERTED afterwards; when sku_catalog already held `00089-P-1` (id 348) the
-- row stayed PENDING forever and every failed label print bumped occurrences.
-- resolveSkuCatalogRow now resolves the canonical padding before queueing, so
-- no new rows of this shape are written; this links the ones already queued.
--
-- Safety gating: no INSERT into sku_catalog. A row is stamped only when exactly
-- one sku_catalog row carries that exact sku (no cross-org ambiguity); PENDING
-- rows with no catalog match are left untouched. Idempotent: a re-run matches
-- nothing (status is no longer PENDING / sku_catalog_id is set).
--
-- Rollback: the affected rows carry status 'CREATED' with resolved_at at the
-- apply time; reset them with
--   UPDATE pending_skus SET status = 'PENDING', sku_catalog_id = NULL,
--          resolved_at = NULL WHERE resolved_at = '<apply timestamp>';
--
-- Verify: SELECT status, sku_catalog_id FROM pending_skus WHERE id = 238;
--   → CREATED, 348.
-- ============================================================================

UPDATE pending_skus ps
   SET sku_catalog_id = sc.id,
       status = 'CREATED',
       resolved_at = now(),
       updated_at = now()
  FROM sku_catalog sc
 WHERE ps.status = 'PENDING'
   AND ps.sku_catalog_id IS NULL
   AND sc.sku = ps.normalized_sku
   AND (SELECT count(*) FROM sku_catalog sc2 WHERE sc2.sku = ps.normalized_sku) = 1;
