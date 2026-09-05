'use client';

import { PlatformMark } from '@/components/ui/PlatformMark';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { sourcePlatformMeta } from '@/lib/source-platform';
import { ExternalLinkActionIcon } from '@/design-system/components/ExternalLinkActionIcon';
import { resolveListingLink } from './product-detail-faces';
import type { ProductDetailPayload } from './types';

interface ProductPlatformRowProps {
    platform: ProductDetailPayload['platforms'][number];
}

/**
 * One channel on the product detail page: platform mark · account · channel
 * SKU on the left, listing title + open-listing action on the right.
 *
 * The action is `ExternalLinkActionIcon` (the same face ItemRecordFactList
 * gives a marketplace link) and its title comes from {@link resolveListingLink},
 * so a row whose channel only reaches storefront search says so instead of
 * promising a product page.
 */
export function ProductPlatformRow({ platform }: ProductPlatformRowProps) {
    const meta = sourcePlatformMeta(platform.platform);
    const platformLabel = meta.label || platform.platform;
    const listing = resolveListingLink(platform);

    return (
        <li className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="flex flex-wrap items-baseline gap-2">
                <HoverTooltip label={platformLabel} asChild focusable={false}>
                    <span className="inline-flex shrink-0" aria-label={platformLabel}>
                        <PlatformMark
                            platformValue={meta.value || platform.platform}
                            meta={meta.value ? meta : undefined}
                        />
                    </span>
                </HoverTooltip>
                {platform.account_name ? (
                    <span className="text-xs text-text-soft">{platform.account_name}</span>
                ) : null}
                <span className="font-mono text-xs text-text-muted">
                    {platform.platform_sku || platform.platform_item_id || '—'}
                </span>
            </div>
            <div className="flex min-w-0 items-center gap-2">
                {platform.display_name ? (
                    <span className="truncate text-xs text-text-soft">{platform.display_name}</span>
                ) : null}
                <ExternalLinkActionIcon
                    href={listing.href}
                    ariaLabel={`${listing.label} on ${platformLabel}`}
                    title={listing.label}
                    disabled={!listing.href}
                />
            </div>
        </li>
    );
}
