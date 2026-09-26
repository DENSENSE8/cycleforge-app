/** Purchase sources operators add inbound orders from most often lead the picker. */
const INBOUND_PLATFORM_PRIORITY = ['amazon', 'goodwill', 'ebay', 'walmart', 'shopify'] as const;

function inboundPlatformRank(value: string): number {
  const index = INBOUND_PLATFORM_PRIORITY.indexOf(
    value.toLowerCase() as (typeof INBOUND_PLATFORM_PRIORITY)[number],
  );
  return index === -1 ? INBOUND_PLATFORM_PRIORITY.length : index;
}

/** The org platform catalog in inbound-intake order: priority sources, then A–Z. */
export function rankInboundPlatformOptions<T extends { value: string; label: string }>(
  options: readonly T[],
): T[] {
  return [...options].sort(
    (a, b) => inboundPlatformRank(a.value) - inboundPlatformRank(b.value) || a.label.localeCompare(b.label),
  );
}
