/**
 * Map a carton `source_platform` value → `return_platform` enum when the
 * operator classifies a return. Shared by the platform pill save path and
 * claim-subject tests so FBA / Amazon / eBay returns stamp both columns.
 */
export function returnPlatformForSource(sourcePlatform: string): string | null {
  switch (String(sourcePlatform).trim().toLowerCase()) {
    case 'fba':
      return 'FBA';
    case 'amazon':
      return 'AMZ';
    case 'ebay':
      return 'EBAY_USAV';
    case 'walmart':
      return 'WALMART';
    case 'ecwid':
      return 'ECWID';
    default:
      return null;
  }
}
