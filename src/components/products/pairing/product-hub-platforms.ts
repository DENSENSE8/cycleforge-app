/**
 * Product Hub channel tabs — ordered list of marketplace keys the hub edits.
 * Labels / marks / tones come from {@link SOURCE_PLATFORMS}; never a page-local
 * chip color map.
 */

export const PRODUCT_HUB_PLATFORMS = [
  'amazon',
  'fba',
  'ebay',
  'ecwid',
  'walmart',
  'mercari',
  'shopify',
] as const;

type ProductHubPlatform = (typeof PRODUCT_HUB_PLATFORMS)[number];
