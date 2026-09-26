/** search-context — feeds the hybrid search engine's hits into the AI chat's prompt-enrichment pipeline (AI search Phase 2c: */

import { hybridSearch, type HybridSearchResult } from '@/lib/search/hybrid-retrieval';
import type { OrgId } from '@/lib/tenancy/constants';
import type { SearchHit } from '@/lib/search/search-hit';
import { looksLikeRetrievalQuestion } from '@/lib/ai/retrieval-question';

export { looksLikeRetrievalQuestion } from '@/lib/ai/retrieval-question';

export interface SearchContextDeps {
  search: (orgId: OrgId, query: string) => Promise<HybridSearchResult>;
}

const defaultDeps: SearchContextDeps = {
  search: (orgId, query) => hybridSearch(orgId, query, { limit: 8 }),
};

function formatHit(hit: SearchHit): string {
  const facets = [
    hit.facets?.status ? `status=${hit.facets.status}` : null,
    hit.facets?.condition_grade ? `condition=${hit.facets.condition_grade}` : null,
    hit.facets?.source_platform ? `platform=${hit.facets.source_platform}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  return [
    `- [${hit.entityType}] ${hit.title}`,
    hit.subtitle ? ` — ${hit.subtitle}` : '',
    facets ? ` (${facets})` : '',
    ` → ${hit.href}`,
  ].join('');
}

/** Build the "=== ENTITY SEARCH ===" prompt block for a chat message, or null when the message isn't retrieval-shaped / nothing matched. */
export async function buildSearchContextBlock(
  orgId: OrgId,
  message: string,
  deps: SearchContextDeps = defaultDeps,
): Promise<string | null> {
  const q = message.trim().slice(0, 300);
  if (!q || !looksLikeRetrievalQuestion(q)) return null;
  try {
    const { hits, usedSemantic } = await deps.search(orgId, q);
    if (hits.length === 0) return null;
    return [
      `=== ENTITY SEARCH (hybrid${usedSemantic ? ' + semantic' : ''}, top ${hits.length}) ===`,
      ...hits.map(formatHit),
      `(Cite the matching record's link when answering; say so plainly if none of these match.)`,
    ].join('\n');
  } catch {
    return null;
  }
}
