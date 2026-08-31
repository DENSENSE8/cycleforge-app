-- ============================================================================
-- 2026-08-30b_retire_persistent_session_policy.sql
--
-- Hand "stay signed in" to the CHECKBOX, and stop shadowing it with per-staff
-- admin config. Runs AFTER 2026-08-30_session_persistent_flag.sql (hence the
-- `b`) because it writes the column that file adds.
--
-- WHY. Persistence was decided in two places that OR together:
--
--   staff.session_policy = 'persistent'   per PERSON, every device, admin UI
--   staff_sessions.persistent             per SESSION, this device, the checkbox
--
-- On the USAV database the entire real warehouse roster (12 staff, ids 2-18)
-- sat on the per-staff policy: `auth_audit` records exactly 12 `staff.updated`
-- events carrying session_policy, all by staff #1, between 2026-05-26 and
-- 2026-06-09 — a hand-rolled workaround for the very bug the checkbox now
-- fixes. For those 12 the checkbox was INERT: the sign-in label reads "Uncheck
-- on shared computers", they are the people actually standing at shared
-- stations, and unchecking did nothing. That is the original dishonesty
-- pointed the other way, so the fix is not finished until it is gone.
--
-- WHAT. Two statements, order-critical, in this file's single transaction:
--
--   1. BACKFILL every LIVE session belonging to a persistent-policy staff to
--      persistent = true. Without this, step 2 would silently sign all of them
--      out at their next long gap: their session rows were created before the
--      column existed and carry the false default. With it, nobody notices.
--   2. RESET those staff to 'default', so the next sign-in is decided by the
--      checkbox alone.
--
-- Deliberately predicate-based, never an id list: staff ids are meaningless in
-- another database, and `WHERE id IN (2,3,…)` would maim unrelated people
-- elsewhere. It therefore applies to EVERY org uniformly, which is the point —
-- one source of truth is not one source of truth per tenant.
--
-- NOT a schema change and NOT a removal: `session_policy` keeps its column, its
-- 'extended' value, and its admin dropdown (CredentialsCard). It stops being
-- the silent company-wide default; it stays available as a deliberate override.
--
-- IDEMPOTENT by construction: after it runs no staff match
-- session_policy = 'persistent', so a second run is a no-op.
--
-- ROLLBACK. There is no automatic inverse — step 2 discards which staff were on
-- the policy. Recover the list from auth_audit if ever needed:
--   SELECT DISTINCT (detail->>'targetStaffId')::int FROM auth_audit
--    WHERE event = 'staff.updated' AND detail::text ILIKE '%session_policy%';
-- Nobody is signed out by applying this, so a rollback is a policy decision,
-- not an incident.
--
-- VERIFY.
--   SELECT COALESCE(session_policy,'default'), COUNT(*) FROM staff GROUP BY 1;
--     -- expect no 'persistent' row
--   SELECT COUNT(*) FROM staff_sessions WHERE persistent AND revoked_at IS NULL;
--     -- expect the backfilled live sessions
-- ============================================================================

-- 1. Preserve today's behaviour for everyone currently relying on the policy.
UPDATE staff_sessions s
   SET persistent = true
  FROM staff st
 WHERE st.id = s.staff_id
   AND COALESCE(st.session_policy, 'default') = 'persistent'
   AND s.revoked_at IS NULL
   AND s.expires_at > NOW()
   AND s.persistent = false;

-- 2. Hand the decision back to the sign-in checkbox.
UPDATE staff
   SET session_policy = 'default'
 WHERE COALESCE(session_policy, 'default') = 'persistent';
