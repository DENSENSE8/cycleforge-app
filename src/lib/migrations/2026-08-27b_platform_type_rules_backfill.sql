-- Backfill the platform → type dependency onto cartons that predate it.
--
-- Runs AFTER 2026-08-27_platform_type_rules.sql (hence the `b`): it reads that
-- table, so the rules must exist first.
--
-- ## Why a backfill at all
--
-- The rule table alone only governs WRITES. An FBA carton already in the system
-- with a null `intake_type` still reads as a purchase order, because the
-- effective-line-type fallback is literally `receiving_type ?? carton_intake_type
-- ?? 'PO'` — spelled that way in six separate modules. Chasing those six
-- fallbacks would be six chances to miss one; storing the true value is right in
-- all of them at once, and leaves the resolvers alone.
--
-- An FBA carton at the dock is a customer return. A stored NULL that renders as
-- "PO" is not a neutral absence, it is a wrong answer on the carton bar.
--
-- ## Driven by the rules, not by 'fba'
--
-- Every statement below joins `platform_type_rules`, so this converges whatever
-- rules exist when it runs, and an org with no rules is untouched. No platform
-- slug is hardcoded.
--
-- ## Scope of the change
--
-- Only cartons whose platform HAS a default rule, and only where the current
-- value is absent or forbidden. A carton already holding a legal type is never
-- rewritten — this fixes wrong data, it does not impose a house opinion on rows
-- that already say something valid.
--
-- Idempotent: re-running converges to the same state and updates zero rows.
--
-- ROLLBACK: none automatic — this repairs data, and the prior state was a NULL
-- or a value the org's own rules forbid. Restore from a snapshot if truly
-- needed; `updated_at` marks every row this touched.
--
-- VERIFY (expect no rows):
--   select r.id, r.source_platform, r.intake_type
--     from receiving_carton r
--     join platform_type_rules rr on rr.organization_id = r.organization_id
--     join platforms p on p.id = rr.platform_id and p.slug = r.source_platform
--    where r.intake_type is null
--    group by r.id, r.source_platform, r.intake_type;

-- 1. Carton default: fill an absent type, and correct one the rules forbid.
UPDATE receiving_carton r
   SET intake_type = d.type_slug,
       updated_at  = now()
  FROM (
        SELECT rr.organization_id,
               p.slug         AS platform_slug,
               upper(t.slug)  AS type_slug
          FROM platform_type_rules rr
          JOIN platforms p ON p.id = rr.platform_id
          JOIN types     t ON t.id = rr.type_id
         WHERE rr.is_default
       ) d
 WHERE d.organization_id = r.organization_id
   AND r.source_platform = d.platform_slug
   AND r.intake_type IS DISTINCT FROM d.type_slug
   AND (
         r.intake_type IS NULL
         OR btrim(r.intake_type) = ''
         OR NOT EXISTS (
              SELECT 1
                FROM platform_type_rules rr2
                JOIN platforms p2 ON p2.id = rr2.platform_id
                JOIN types     t2 ON t2.id = rr2.type_id
               WHERE rr2.organization_id = r.organization_id
                 AND p2.slug = r.source_platform
                 AND upper(t2.slug) = upper(btrim(r.intake_type))
            )
       );

-- 2. Per-line overrides that contradict the carton's platform.
--
-- CLEARED, not rewritten. A line override exists to DIFFER from the carton
-- default; on a platform whose rules allow one type there is nothing to differ
-- to, so the honest value is "no override" and the carton's type shows through.
-- Writing the allowed type here instead would leave a redundant override that
-- silently outranks any future correction to the carton.
UPDATE receiving_lines l
   SET receiving_type = NULL,
       updated_at     = now()
  FROM receiving_carton r
 WHERE r.id = l.receiving_id
   AND r.organization_id = l.organization_id
   AND l.receiving_type IS NOT NULL
   AND btrim(l.receiving_type) <> ''
   -- only on platforms that are actually constrained
   AND EXISTS (
        SELECT 1
          FROM platform_type_rules rr
          JOIN platforms p ON p.id = rr.platform_id
         WHERE rr.organization_id = r.organization_id
           AND p.slug = r.source_platform
       )
   -- and only when this override is not one of the allowed answers
   AND NOT EXISTS (
        SELECT 1
          FROM platform_type_rules rr
          JOIN platforms p ON p.id = rr.platform_id
          JOIN types     t ON t.id = rr.type_id
         WHERE rr.organization_id = r.organization_id
           AND p.slug = r.source_platform
           AND upper(t.slug) = upper(btrim(l.receiving_type))
       );
