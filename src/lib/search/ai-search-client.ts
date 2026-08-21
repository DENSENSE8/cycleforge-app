/**
 * Shared client-facing SearchHit wire shape for operator find rows
 * (header dropdown, CommandBar, `/search` browse).
 *
 * Ranking fields (`matchField` / `score`) are optional — classic
 * `/api/global-search` rows often omit them; row renderers do not need them.
 */

export interface AiSearchHitChip {
  label: string;
  tone?: string;
}

/** SearchHit as painted by SearchResultRow / groupHitsForPreview. */
export interface AiSearchHit {
  id: number;
  entityType: string;
  title: string;
  subtitle: string;
  href: string;
  matchField?: string;
  score?: number;
  chips?: AiSearchHitChip[];
  facets?: Record<string, string | null>;
}
