-- Picking permissions: grant picking.* to every role / staff override that
-- already holds the tech.* permission that gated the same Picker-desk path.
--
-- Why: owner ruling 2026-09-27 — Picking and Quality Control are separate
-- stations. `tech.*` now means Quality Control (the `/test` bench); the Picker
-- desk (`/pick`, `/api/picking/*`, pack-placement moves, fulfilment
-- substitution) gates on its own ids, added to src/lib/auth/permission-registry.ts:
--   picking.view             ← tech.view             (desk page, logs, substitution policy read)
--   picking.scan             ← tech.scan_serial      (desk scan / serial / sku / delete writes,
--                                                     pack-placement moves — all were tech.scan_serial)
--   picking.substitute_unit  ← tech.substitute_unit  (POST /api/orders/[id]/substitute; the tech id
--                                                     is retired from the registry)
-- picking.scan is anchored on tech.scan_serial, not tech.view, so nobody gains
-- write access they lacked (the seeded `viewer` role holds tech.view but not
-- tech.scan_serial). A new registry id is never retroactively present in stored
-- `permissions` text[] — without this backfill every current picker 403s.
--
-- Scope: `roles.permissions` (per-org rows) and the per-staff overrides
-- `staff.permissions_added` / `staff.permissions_removed`. A revoked tech id is
-- mirrored into permissions_removed so a staff member whose desk access was
-- taken away by override does not regain it through the new id.
--
-- Safety / idempotency: grant-only. No tech.* id is removed (QC access is
-- unchanged; the retired tech.substitute_unit string stays in stored arrays and
-- is dropped at read time by computeEffectivePermissions as an unknown id).
-- Every UPDATE appends only when the source id is present AND the target id is
-- absent, so a re-run — or a run after a hand grant via the Roles editor — is a
-- no-op. No DDL; no new tables. Runs as the migration owner (BYPASSRLS), so the
-- FORCE RLS on roles does not hide other orgs' rows.
--
-- Rollback: for rows where this migration was the only source of the grant,
--   UPDATE roles SET permissions = array_remove(array_remove(array_remove(permissions,
--     'picking.view'), 'picking.scan'), 'picking.substitute_unit');
--   (likewise staff.permissions_added / permissions_removed). Not scripted: it
--   would also strip a legitimate hand grant made after this ran.
--
-- Verify:
--   SELECT key, count(*) FROM roles
--    WHERE ('tech.view' = ANY(permissions) AND NOT 'picking.view' = ANY(permissions))
--       OR ('tech.scan_serial' = ANY(permissions) AND NOT 'picking.scan' = ANY(permissions))
--       OR ('tech.substitute_unit' = ANY(permissions) AND NOT 'picking.substitute_unit' = ANY(permissions))
--    GROUP BY key;   -- expect 0 rows

-- ─── roles.permissions ──────────────────────────────────────────────────────

UPDATE roles
   SET permissions = permissions || ARRAY['picking.view']::text[],
       updated_at = now()
 WHERE 'tech.view' = ANY(permissions)
   AND NOT ('picking.view' = ANY(permissions));

UPDATE roles
   SET permissions = permissions || ARRAY['picking.scan']::text[],
       updated_at = now()
 WHERE 'tech.scan_serial' = ANY(permissions)
   AND NOT ('picking.scan' = ANY(permissions));

UPDATE roles
   SET permissions = permissions || ARRAY['picking.substitute_unit']::text[],
       updated_at = now()
 WHERE 'tech.substitute_unit' = ANY(permissions)
   AND NOT ('picking.substitute_unit' = ANY(permissions));

-- ─── staff.permissions_added (per-staff grants) ─────────────────────────────

UPDATE staff
   SET permissions_added = permissions_added || ARRAY['picking.view']::text[]
 WHERE 'tech.view' = ANY(permissions_added)
   AND NOT ('picking.view' = ANY(permissions_added));

UPDATE staff
   SET permissions_added = permissions_added || ARRAY['picking.scan']::text[]
 WHERE 'tech.scan_serial' = ANY(permissions_added)
   AND NOT ('picking.scan' = ANY(permissions_added));

UPDATE staff
   SET permissions_added = permissions_added || ARRAY['picking.substitute_unit']::text[]
 WHERE 'tech.substitute_unit' = ANY(permissions_added)
   AND NOT ('picking.substitute_unit' = ANY(permissions_added));

-- ─── staff.permissions_removed (per-staff revokes, mirrored) ────────────────

UPDATE staff
   SET permissions_removed = permissions_removed || ARRAY['picking.view']::text[]
 WHERE 'tech.view' = ANY(permissions_removed)
   AND NOT ('picking.view' = ANY(permissions_removed));

UPDATE staff
   SET permissions_removed = permissions_removed || ARRAY['picking.scan']::text[]
 WHERE 'tech.scan_serial' = ANY(permissions_removed)
   AND NOT ('picking.scan' = ANY(permissions_removed));

UPDATE staff
   SET permissions_removed = permissions_removed || ARRAY['picking.substitute_unit']::text[]
 WHERE 'tech.substitute_unit' = ANY(permissions_removed)
   AND NOT ('picking.substitute_unit' = ANY(permissions_removed));
