-- A Bluetooth speaker is a unit, not a Bluetooth adapter. Correct rule-owned
-- profiles/enrichment while retaining five-minute adapters, receivers, mounts,
-- brackets, cables, and other small accessories.

BEGIN;

CREATE TEMP TABLE bluetooth_speaker_targets (
  organization_id uuid NOT NULL,
  sku_catalog_id bigint NOT NULL,
  PRIMARY KEY (organization_id, sku_catalog_id)
) ON COMMIT DROP;

INSERT INTO bluetooth_speaker_targets (organization_id, sku_catalog_id)
SELECT organization_id, id
FROM sku_catalog
WHERE concat_ws(' ', product_title, category, sku) ~* '\m(bluetooth[[:space:]]*speaker|smart[[:space:]]*speaker)\M'
  AND concat_ws(' ', product_title, category, sku) !~* '\m(adapter|receiver|dongle|mount|bracket|cable|cord|wire|part|accessory|replacement|module|board|power[[:space:]]*supply|remote)\M';

UPDATE pack_profiles profile
SET pack_tier = 'MEDIUM', estimated_minutes = 14, updated_at = now()
FROM pack_profile_links link
JOIN bluetooth_speaker_targets target
  ON target.organization_id = link.organization_id
 AND target.sku_catalog_id = link.owner_id
WHERE link.owner_type = 'SKU_CATALOG'
  AND link.pack_profile_id = profile.id
  AND profile.organization_id = target.organization_id
  AND profile.source = 'rules'
  AND (profile.pack_tier <> 'MEDIUM' OR profile.estimated_minutes IS DISTINCT FROM 14);

UPDATE packer_log_enrichment enrichment
SET pack_tier = 'MEDIUM', estimated_pack_minutes = 14,
    tier_source = 'rules', computed_at = now()
FROM bluetooth_speaker_targets target
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
  );

COMMIT;
