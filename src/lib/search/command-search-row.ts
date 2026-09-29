import type { AiSearchHit } from './ai-search-client';

/** The recognition line beneath Command Search's durable identifier. */
export function commandSearchSecondLine(
  hit: Pick<AiSearchHit, 'entityType' | 'subtitle' | 'title'>,
  primaryTitle: string,
  primaryIsIdentifier: boolean,
): string {
  if (!primaryIsIdentifier) return '';

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
