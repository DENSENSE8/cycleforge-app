import type { AiSearchHit } from './ai-search-client';

/**
 * Kinds whose title is a name, not the handle: a SKU's title is its product
 * (the SKU code rides the second line); a tote's is its plate code (its state
 * — status · bin · order · units — rides the second line).
 */
const SUBTITLE_ALWAYS: Record<string, true> = { sku: true, tote: true };

/** The recognition line beneath Command Search's durable identifier. */
export function commandSearchSecondLine(
  hit: Pick<AiSearchHit, 'entityType' | 'subtitle' | 'title'>,
  primaryTitle: string,
  primaryIsIdentifier: boolean,
): string {
  if (!primaryIsIdentifier && !SUBTITLE_ALWAYS[hit.entityType]) return '';

  if (hit.entityType === 'order') {
    const productTitle = String(hit.title ?? '').trim();
    return productTitle === primaryTitle ? '' : productTitle;
  }

  return String(hit.subtitle ?? '')
    .split(' · ')
    .map((part) => part.trim())
    .filter((part) => part && part !== primaryTitle)
    .join(' · ');
}
