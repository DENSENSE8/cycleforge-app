import { sourcePlatformMeta, UNKNOWN_PLATFORM } from '@/lib/source-platform';

/** Purchase sources operators add inbound orders from most often lead the picker. */
const INBOUND_PLATFORM_PRIORITY = ['amazon', 'goodwill', 'ebay', 'walmart', 'shopify'] as const;

function inboundPlatformRank(value: string): number {
  const index = INBOUND_PLATFORM_PRIORITY.indexOf(
    value.toLowerCase() as (typeof INBOUND_PLATFORM_PRIORITY)[number],
  );
  return index === -1 ? INBOUND_PLATFORM_PRIORITY.length : index;
}

/**
 * The org platform catalog as inbound pickers show it: full names (owner law —
 * never the catalog's dense label like "GW" or "AMZ"; a platform the canonical
 * list knows wears its canonical name, two that share one keep the catalog
 * label beside it, e.g. "Amazon (FBA)"), in inbound-intake order: priority
 * sources, then A–Z.
 */
export function inboundPlatformOptions(
  options: ReadonlyArray<{ value: string; label: string }>,
): Array<{ value: string; label: string }> {
  const canonical = (value: string) => {
    const meta = sourcePlatformMeta(value);
    return meta === UNKNOWN_PLATFORM ? null : meta.label;
  };
  const shared = new Map<string, number>();
  for (const { value } of options) {
    const name = canonical(value);
    if (name) shared.set(name, (shared.get(name) ?? 0) + 1);
  }
  return options
    .map(({ value, label }) => {
      const name = canonical(value);
      if (!name) return { value, label };
      return { value, label: (shared.get(name) ?? 0) > 1 && name.toLowerCase() !== value.toLowerCase() ? `${name} (${label})` : name };
    })
    .sort((a, b) => inboundPlatformRank(a.value) - inboundPlatformRank(b.value) || a.label.localeCompare(b.label));
}
