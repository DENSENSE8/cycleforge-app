/**
 * Pure display faces for the product detail page — condition-grade chips and
 * the per-channel listing link.
 *
 * Extracted from ProductDetail.tsx (2026-09-02) so the two rules worth arguing
 * with are testable without rendering: which hue an ungraded unit takes, and
 * whether a channel's link lands on the product or in a storefront search box.
 *
 * No React, no `'use client'` — import from the component, test directly.
 */

import { conditionLabel } from '@/lib/conditions';
import { conditionGradeTone } from '@/lib/condition-tone';
import { getExternalUrlByPlatform } from '@/utils/external-item-url';
import type { ProductDetailPayload } from './types';

/** The `condition_grade IS NULL` bucket returned by /api/products/[sku]. */
export const UNGRADED = 'UNGRADED';

/**
 * Grade chip copy. Detail panels take the verbose `full` variant
 * (Brand New · Used — A · For Parts) per @/lib/conditions.
 */
export function gradeChipLabel(grade: string): string {
  return grade === UNGRADED ? 'Ungraded' : conditionLabel(grade, 'full');
}

/**
 * Grade chip face.
 *
 * Ungraded is the ABSENCE of a grade, so it takes a neutral chip rather than
 * `conditionGradeTone`'s fallback — that fallback is the USED_C tone, and
 * painting unsorted units as a C grade claims a grade nobody assigned. Real
 * grades use the tone SoT so a grade reads the same hue here as everywhere else.
 */
export function gradeChipClass(grade: string): string {
  return grade === UNGRADED
    ? 'bg-surface-sunken text-text-muted'
    : `ring-1 ${conditionGradeTone(grade).badge}`;
}

export interface ListingLink {
  href: string | null;
  /** Says where the click lands, so the operator knows before clicking. */
  label: string;
}

/**
 * A channel row's listing href, plus a label that says where the click lands.
 *
 * `listing_url` is the channel's real product page, captured from the channel
 * at sync time. Without one, the only href derivable from an id is the
 * platform's own search — which is exactly the hand-off this page exists to
 * avoid — so the label admits that rather than promising a product page it
 * cannot deliver.
 */
export function resolveListingLink(
  platform: ProductDetailPayload['platforms'][number],
): ListingLink {
  if (platform.listing_url) return { href: platform.listing_url, label: 'Open listing' };
  const derived = getExternalUrlByPlatform(
    platform.platform,
    platform.platform_item_id || platform.platform_sku,
  );
  if (!derived) return { href: null, label: 'No listing link' };
  return {
    href: derived,
    label: derived.includes('/products/search?') ? 'Open storefront search' : 'Open listing',
  };
}
