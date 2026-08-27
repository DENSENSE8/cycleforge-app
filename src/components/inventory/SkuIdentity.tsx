/**
 * SkuIdentity — shared dual-SKU display block.
 * ────────────────────────────────────────────────────────────────────
 * Renders the internal Zoho/catalog SKU as the primary identifier with
 * each connected marketplace SKU (Ecwid, Amazon, eBay, etc.) shown as
 * a labeled secondary chip below.
 *
 * Why: warehouse units carry the internal canonical SKU on the shelf,
 * but customers reference the marketplace SKU on their orders. Showing
 * both makes the link explicit so pickers and CS share one mental model.
 *
 * Usage:
 *   <SkuIdentity
 *     canonicalSku="00001-BK"
 *     productTitle="Bose VCS-10 Center Channel Speaker Black"
 *     platforms={[
 *       { platform: 'ecwid',  platformSku: '01279-B' },
 *       { platform: 'amazon', platformSku: 'ZB-AFHB-Y58D' },
 *     ]}
 *   />
 *
 * Variants:
 *   default — full block with product title, large canonical SKU, chip row.
 *   compact — single line, smaller canonical SKU, tight chip row.
 *             For dense lists (pick queue rows, table cells, etc.).
 */

import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { sourcePlatformLabel, sourcePlatformMeta } from '@/lib/source-platform';

export interface SkuPlatformMapping {
  platform: string;             // 'amazon' | 'ecwid' | 'ebay' | 'fba' | …
  platformSku: string | null;   // marketplace SKU/MSKU (or null when only an item id exists)
  platformItemId?: string | null; // e.g. Amazon ASIN, ebay item id — shown as fallback when SKU is null
  accountName?: string | null;  // e.g. "ebay-us-main" vs "ebay-us-warehouse2" — disambiguates duplicates
  listingUrl?: string | null;   // stored marketplace listing URL from sku_platform_ids
}

interface SkuIdentityProps {
  canonicalSku: string;
  productTitle?: string | null;
  platforms?: SkuPlatformMapping[];
  variant?: 'default' | 'compact';
  className?: string;
}

export function SkuIdentity({
  canonicalSku,
  productTitle,
  platforms,
  variant = 'default',
  className = '',
}: SkuIdentityProps) {
  const visiblePlatforms = (platforms ?? []).filter(
    (p) => (p.platformSku && p.platformSku.trim()) || (p.platformItemId && p.platformItemId.trim()),
  );

  if (variant === 'compact') {
    return (
      <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
        <span className="font-mono text-sm font-semibold tabular-nums text-text-default">{canonicalSku}</span>
        <HoverTooltip label={sourcePlatformLabel('zoho')} asChild focusable={false}>
          <span className="inline-flex shrink-0" aria-label={sourcePlatformLabel('zoho')}>
            <PlatformMark platformValue="zoho" />
          </span>
        </HoverTooltip>
        {visiblePlatforms.map((p, i) => (
          <PlatformSkuChip key={`${p.platform}-${i}`} mapping={p} dense />
        ))}
      </div>
    );
  }

  return (
    <div className={className}>
      {productTitle && (
        <p className="text-sm font-semibold leading-snug text-text-default">{productTitle}</p>
      )}
      <div className={`flex items-baseline gap-2 ${productTitle ? 'mt-1.5' : ''}`}>
        <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-text-default">
          {canonicalSku}
        </span>
        <HoverTooltip label={sourcePlatformLabel('zoho')} asChild focusable={false}>
          <span className="inline-flex shrink-0" aria-label={sourcePlatformLabel('zoho')}>
            <PlatformMark platformValue="zoho" />
          </span>
        </HoverTooltip>
      </div>
      {visiblePlatforms.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {visiblePlatforms.map((p, i) => (
            <PlatformSkuChip key={`${p.platform}-${i}`} mapping={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function PlatformSkuChip({ mapping, dense = false }: { mapping: SkuPlatformMapping; dense?: boolean }) {
  const value = (mapping.platformSku && mapping.platformSku.trim()) || mapping.platformItemId || '';
  const meta = sourcePlatformMeta(mapping.platform);
  const label = sourcePlatformLabel(mapping.platform);
  const sizing = dense ? 'px-1.5 py-0.5 text-role-micro' : 'px-2 py-0.5 text-xs';
  return (
    <HoverTooltip
      label={`${label} · ${value}${mapping.platformItemId ? ` · ${mapping.platformItemId}` : ''}`}
      asChild
    >
      <span
        className={`inline-flex items-center gap-1 rounded-md border border-border-soft bg-surface-canvas font-medium text-text-default ${sizing}`}
      >
        <PlatformMark platformValue={mapping.platform} meta={meta} />
        <span className="font-mono tabular-nums">{value}</span>
      </span>
    </HoverTooltip>
  );
}
