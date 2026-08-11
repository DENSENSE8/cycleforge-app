/**
 * Vendor session partitions for N5 VendorView.
 * SoT: source-of-truth.md → Station desktop VendorView
 *
 * Partitions are vendor-keyed — never org-mixed without an explicit
 * multi-account design. Zendesk is the floor-proven dogfood key; the
 * marketplace keys below are the Listings port that reuses the same waist
 * (Unbox Listings display, anchored inside the Displays column).
 */

export const VENDOR_PARTITION_ZENDESK = 'persist:zendesk' as const;
export const VENDOR_PARTITION_EBAY = 'persist:ebay' as const;

export type VendorPartition =
  | typeof VENDOR_PARTITION_ZENDESK
  | typeof VENDOR_PARTITION_EBAY;

/** Chrome strip height (px) left for the React Close bar above a takeover view. */
export const VENDOR_VIEW_CHROME_PX = 48;

/**
 * Marketplace host → partition. ONE place knows that an ebay.com URL belongs in
 * the ebay session — a call site that picks a partition from its own hostname
 * check is the fork this table exists to prevent, and it is what would let a
 * signed-in vendor session be handed a URL it does not own.
 *
 * Leading dot = suffix match (mirrors the Main-side allowlist in
 * `electron/vendor-view.js`, which is the security boundary — this map only
 * decides which session a URL is *offered* to).
 */
const MARKETPLACE_PARTITION_SUFFIXES: ReadonlyArray<
  readonly [suffix: string, partition: VendorPartition]
> = [['.ebay.com', VENDOR_PARTITION_EBAY]];

/**
 * The partition a listing URL may open in, or `null` when no vendor session
 * covers that host (caller falls back to a deep link — honest absence, never a
 * guessed partition).
 */
export function vendorPartitionForListingUrl(url: string): VendorPartition | null {
  let host: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    host = parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const [suffix, partition] of MARKETPLACE_PARTITION_SUFFIXES) {
    if (host === suffix.slice(1) || host.endsWith(suffix)) return partition;
  }
  return null;
}
