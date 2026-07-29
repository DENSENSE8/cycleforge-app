-- ============================================================================
-- 2026-07-28_photo_entity_links_order_type.sql
--
-- WHAT: allow `photo_entity_links.entity_type = 'ORDER'`, and wire the matching
--       parent-delete trigger on `orders`.
--
-- WHY:  the order record page (docs/todo/order-details-page-EXECUTION-PLAN.md,
--       Week 3) has no item image. Every other order surface fakes it with
--       *packing* photos (`packer_logs`) or SKU integrity photos; an order-scoped
--       photo was structurally impossible because the discriminator CHECK
--       enumerated nine types and `'ORDER'` was not one of them.
--
-- CHECK-REDEFINITION HAZARD: this constraint has been touched by exactly ONE
--       prior migration (2026-06-18_photos_platform_side_tables.sql), so the
--       union below is that file's nine values plus 'ORDER'. Re-affirming the
--       FULL list is deliberate — the `reason_codes_flow_context_chk` regression
--       (five migrations, several silently dropping values a previous one added)
--       is the failure mode this comment exists to prevent. If you add a value
--       later, copy the whole list forward again; never assume the live
--       constraint matches the last file you happened to read.
--
-- PARENT-DELETE INTEGRITY: `.claude/rules/polymorphic-tables.md` requires a new
--       discriminator value to ship its delete trigger in the SAME migration —
--       `work_assignments` shipped five enum values and only two triggers, and
--       the other three had no delete-time behavior for months. The generic
--       dispatch function `fn_delete_photos_on_parent_delete()` (current form
--       set by 2026-06-21_photos_phase_e_drop_legacy_columns.sql, which routes
--       through `photo_entity_links`) takes the type as TG_ARGV[0], so this is
--       one CREATE TRIGGER, no new function.
--
-- SAFETY: additive. Widening a CHECK cannot reject an existing row, and the new
--       trigger only fires on `orders` DELETE, which previously orphaned nothing
--       because no ORDER-linked photos could exist.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_delete_photos_on_order_delete ON orders;
--   ALTER TABLE photo_entity_links DROP CONSTRAINT chk_photo_entity_links_entity_type;
--   ALTER TABLE photo_entity_links ADD CONSTRAINT chk_photo_entity_links_entity_type
--     CHECK (entity_type IN ('RECEIVING','RECEIVING_LINE','PACKER_LOG','SERIAL_UNIT',
--                            'SKU','SKU_STOCK','BIN_ADJUSTMENT','SHARE_PACK','ZENDESK_TICKET'));
--   -- (safe only while zero ORDER rows exist; check first:
--   --   SELECT count(*) FROM photo_entity_links WHERE entity_type = 'ORDER';)
--
-- VERIFY:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'chk_photo_entity_links_entity_type';
--   SELECT tgname FROM pg_trigger WHERE tgname = 'trg_delete_photos_on_order_delete';
-- ============================================================================

BEGIN;

-- Widen the discriminator. Drop-then-add (not ADD ... NOT VALID) so the
-- constraint name stays canonical and the definition is unambiguous.
ALTER TABLE photo_entity_links
  DROP CONSTRAINT IF EXISTS chk_photo_entity_links_entity_type;

DO $$ BEGIN
  ALTER TABLE photo_entity_links
    ADD CONSTRAINT chk_photo_entity_links_entity_type
    CHECK (entity_type IN (
      'RECEIVING', 'RECEIVING_LINE', 'PACKER_LOG', 'SERIAL_UNIT',
      'SKU', 'SKU_STOCK', 'BIN_ADJUSTMENT',
      'SHARE_PACK', 'ZENDESK_TICKET',
      'ORDER'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Parent-delete integrity for the new value. Shares the existing generic
-- dispatch function; the type is passed as TG_ARGV[0].
DROP TRIGGER IF EXISTS trg_delete_photos_on_order_delete ON orders;
CREATE TRIGGER trg_delete_photos_on_order_delete
AFTER DELETE ON orders
FOR EACH ROW EXECUTE FUNCTION fn_delete_photos_on_parent_delete('ORDER');

COMMIT;
