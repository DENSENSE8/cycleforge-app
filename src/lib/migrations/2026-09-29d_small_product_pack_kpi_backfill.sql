-- Backfill high-confidence pack-and-label products to the SMALL / 5-minute
-- standard. Manual/imported pack profiles are authoritative and are never
-- changed. Historical KPI enrichment is corrected only when it came from
-- rules (including the 2026-07-08g rule-seeded profile baseline).

BEGIN;

CREATE TEMP TABLE small_pack_targets (
  organization_id uuid NOT NULL,
  sku_catalog_id bigint NOT NULL,
  PRIMARY KEY (organization_id, sku_catalog_id)
) ON COMMIT DROP;

INSERT INTO small_pack_targets (organization_id, sku_catalog_id)
SELECT sc.organization_id, sc.id
FROM sku_catalog sc
WHERE sc.organization_id IS NOT NULL
  AND concat_ws(' ', sc.product_title, sc.category, sc.sku) ~*
      '\m(bluetooth|bt[[:space:]]*adapter|adapter|dongle|cable|cord|wire|connector|harness|ribbon|accessory|accessories|small[[:space:]]*part|spare|replacement|module|chip|component[[:space:]]*board|bracket|mount|knob|fuse|battery|power[[:space:]]*supply|psu|remote|ir[[:space:]]*blaster|antenna|hdmi|rca)\M'
  AND concat_ws(' ', sc.product_title, sc.category, sc.sku) !~*
      '\m(lifestyle|home[[:space:]]*theater|home[[:space:]]*cinema|cinemate|acoustimass|surround[[:space:]]*sound|speaker[[:space:]]*system|subwoofer[[:space:]]*system|wave|sounddock|soundtouch|media[[:space:]]*center|entertainment[[:space:]]*center|console|receiver|equalizer|amplifier|bookshelf[[:space:]]*speaker|component[[:space:]]*system|mini[[:space:]]*system)\M';

-- Correct the old blanket rules baseline while leaving operator/import
-- choices untouched.
UPDATE pack_profiles profile
SET pack_tier = 'SMALL', estimated_minutes = 5, updated_at = now()
FROM pack_profile_links link
JOIN small_pack_targets target
  ON target.organization_id = link.organization_id
 AND target.sku_catalog_id = link.owner_id
WHERE link.owner_type = 'SKU_CATALOG'
  AND link.pack_profile_id = profile.id
  AND profile.organization_id = target.organization_id
  AND profile.source = 'rules'
  AND (profile.pack_tier <> 'SMALL' OR profile.estimated_minutes IS DISTINCT FROM 5);

-- Products added before profile seeding still receive the same rules profile.
WITH missing AS (
  SELECT target.organization_id, target.sku_catalog_id,
         row_number() OVER (PARTITION BY target.organization_id ORDER BY target.sku_catalog_id) AS rn
  FROM small_pack_targets target
  WHERE NOT EXISTS (
    SELECT 1
    FROM pack_profile_links link
    WHERE link.organization_id = target.organization_id
      AND link.owner_type = 'SKU_CATALOG'
      AND link.owner_id = target.sku_catalog_id
  )
), inserted AS (
  INSERT INTO pack_profiles (organization_id, pack_tier, estimated_minutes, source)
  SELECT missing.organization_id, 'SMALL', 5, 'rules'
  FROM missing
  ORDER BY missing.organization_id, missing.rn
  RETURNING id, organization_id
), ranked_profiles AS (
  SELECT inserted.id, inserted.organization_id,
         row_number() OVER (PARTITION BY inserted.organization_id ORDER BY inserted.id) AS rn
  FROM inserted
)
INSERT INTO pack_profile_links (organization_id, owner_type, owner_id, pack_profile_id)
SELECT missing.organization_id, 'SKU_CATALOG', missing.sku_catalog_id, ranked_profiles.id
FROM missing
JOIN ranked_profiles
  ON ranked_profiles.organization_id = missing.organization_id
 AND ranked_profiles.rn = missing.rn
ON CONFLICT (organization_id, owner_type, owner_id) DO NOTHING;

-- Make the reports truthful for packs completed before this correction.
UPDATE packer_log_enrichment enrichment
SET pack_tier = 'SMALL',
    estimated_pack_minutes = 5,
    tier_source = 'rules',
    computed_at = now()
FROM small_pack_targets target
LEFT JOIN pack_profile_links link
  ON link.organization_id = target.organization_id
 AND link.owner_type = 'SKU_CATALOG'
 AND link.owner_id = target.sku_catalog_id
LEFT JOIN pack_profiles profile
  ON profile.id = link.pack_profile_id
 AND profile.organization_id = target.organization_id
WHERE enrichment.organization_id = target.organization_id
  AND enrichment.sku_catalog_id = target.sku_catalog_id
  AND (
    enrichment.pack_tier IS NULL
    OR enrichment.tier_source = 'rules'
    OR (enrichment.tier_source = 'profile' AND profile.source = 'rules')
  )
  AND (
    enrichment.pack_tier IS DISTINCT FROM 'SMALL'
    OR enrichment.estimated_pack_minutes IS DISTINCT FROM 5
    OR enrichment.tier_source IS DISTINCT FROM 'rules'
  );

COMMIT;
