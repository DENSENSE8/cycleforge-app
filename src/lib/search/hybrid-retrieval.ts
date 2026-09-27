/** hybrid-retrieval — the single retrieval engine behind AI search (docs/ai-search-modernization-plan.md, locked decision 4). */

import { tenantQueryOneTrip } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { embedText } from '@/lib/ai/embed';
import { EMBEDDING_DIMS } from '@/lib/ai/provider';
import { resolveOrgAiConfig } from '@/lib/ai/org-provider';
import { recordAiUsage } from '@/lib/ai/usage';
import { buildRankedSearchSql, type RankedSearchVariant } from '@/lib/search/sql-ranked-search';
import { searchAllEntities, type GlobalSearchResult } from '@/lib/search/global-entity-search';
import type { SearchEntityType } from '@/lib/search/build-search-text';
import {
  facetChips,
  looksLikeIdentifier,
  searchHitHref,
  toUiEntityType,
  type SearchHit,
} from '@/lib/search/search-hit';
import { orderIdFromSubtitle } from '@/lib/search/search-result-identity';

export { looksLikeIdentifier };

/** One row off entity_search_docs, as both SQL arms return it. */
export interface DocHitRow {
  entity_type: SearchEntityType;
  entity_id: number;
  title: string;
  subtitle: string | null;
  status: string | null;
  condition_grade: string | null;
  source_platform: string | null;
  tracking_number: string | null;
  carrier: string | null;
  serial_number: string | null;
  happened_at: Date | string | null;
}

export interface HybridSearchDeps {
  exactSearch(orgId: OrgId, query: string, limit: number): Promise<GlobalSearchResult[]>;
  keywordSearch(
    orgId: OrgId,
    query: string,
    entityTypes: SearchEntityType[] | undefined,
    limit: number,
  ): Promise<DocHitRow[]>;
  /** Resolves null when embeddings are unconfigured, failing, or over budget.
   *  Org-aware: the org's connected provider (BYOK) wins over the platform
   *  default; no provider at all = keyword-only search (the tenant fallback). */
  embedQuery(orgId: OrgId, query: string): Promise<number[] | null>;
  vectorSearch(
    orgId: OrgId,
    embedding: number[],
    entityTypes: SearchEntityType[] | undefined,
    limit: number,
  ): Promise<DocHitRow[]>;
}

interface HybridSearchOpts {
  /** HARD filter — only these entity types are searched (tool-call scoping). */
  entityTypes?: SearchEntityType[];
  /**
   * SOFT boost — page-context scope (src/lib/search/page-context.ts). Hits of
   * these types rank ahead of equal-scored others; nothing is excluded. The
   * global ⌘K palette uses this, never the hard filter.
   */
  boostEntityTypes?: SearchEntityType[];
  limit?: number;
}

export interface HybridSearchResult {
  hits: SearchHit[];
  /** True when the vector arm contributed (embed call succeeded). */
  usedSemantic: boolean;
}

/** Per-keystroke embed budget — miss it and the search ships keyword-only. */
const QUERY_EMBED_TIMEOUT_MS = 300;
/** Candidates fetched per arm before the RRF merge. */
const ARM_LIMIT = 30;
/** Standard reciprocal-rank-fusion constant. */
const RRF_K = 60;

// ── Real dep implementations ────────────────────────────────────────────────

async function keywordSearchImpl(
  orgId: OrgId,
  query: string,
  entityTypes: SearchEntityType[] | undefined,
  limit: number,
): Promise<DocHitRow[]> {
  // Every OR branch is hand-built against the EXACT indexed expression `lower(search_text)` (idx_entity_search_docs_search_trgm) using only…
  const variants: RankedSearchVariant[] = [
    { predicate: `lower(search_text) = LOWER($2)`, score: 400 },
    { predicate: `lower(search_text) LIKE LOWER($3)`, score: 300 },
    { predicate: `lower(search_text) LIKE LOWER($4)`, score: 200 },
    {
      predicate: `LOWER($2) <% lower(search_text)`,
      score: `word_similarity(LOWER($2), lower(search_text)) * 100`,
    },
  ];
  const { whereClause, rankClause } = buildRankedSearchSql(variants);

  const params: unknown[] = [orgId, query, `${query}%`, `%${query}%`];
  let entityFilter = '';
  if (entityTypes && entityTypes.length > 0) {
    params.push(entityTypes);
    entityFilter = ` AND entity_type = ANY($${params.length}::text[])`;
  }
  params.push(limit);

  const res = await tenantQueryOneTrip(
    orgId,
    `SELECT entity_type, entity_id, title, subtitle, status, condition_grade,
            source_platform, tracking_number, carrier, serial_number, happened_at,
            ${rankClause} AS rank
     FROM entity_search_docs
     WHERE organization_id = $1${entityFilter}
       AND (${whereClause})
     ORDER BY rank DESC, happened_at DESC NULLS LAST, entity_type ASC, entity_id ASC
     LIMIT $${params.length}`,
    params,
  );
  return res.rows.map(normalizeDocRow);
}

async function vectorSearchImpl(
  orgId: OrgId,
  embedding: number[],
  entityTypes: SearchEntityType[] | undefined,
  limit: number,
): Promise<DocHitRow[]> {
  const params: unknown[] = [orgId, `[${embedding.join(',')}]`];
  let entityFilter = '';
  if (entityTypes && entityTypes.length > 0) {
    params.push(entityTypes);
    entityFilter = ` AND entity_type = ANY($${params.length}::text[])`;
  }
  params.push(limit);

  const res = await tenantQueryOneTrip(
    orgId,
    `SELECT entity_type, entity_id, title, subtitle, status, condition_grade,
            source_platform, tracking_number, carrier, serial_number, happened_at
     FROM entity_search_docs
     WHERE organization_id = $1${entityFilter}
       AND embedding IS NOT NULL
     ORDER BY embedding <=> $2::vector(${EMBEDDING_DIMS})
     LIMIT $${params.length}`,
    params,
  );
  return res.rows.map(normalizeDocRow);
}

/** Subtitle SoT for SERIAL_UNIT is `serial · sku · status` — fallback when the
 *  facet column is null (pre-backfill docs). */
function serialFromSubtitle(subtitle: string | null): string | null {
  if (!subtitle) return null;
  const first = subtitle.split(' · ')[0]?.trim();
  return first || null;
}

export function normalizeDocRow(row: Record<string, unknown>): DocHitRow {
  const subtitle = row.subtitle == null ? null : String(row.subtitle);
  const entityType = String(row.entity_type) as SearchEntityType;
  const serialCol = row.serial_number == null ? null : String(row.serial_number);
  return {
    entity_type: entityType,
    entity_id: Number(row.entity_id),
    title: String(row.title ?? ''),
    subtitle,
    status: row.status == null ? null : String(row.status),
    condition_grade: row.condition_grade == null ? null : String(row.condition_grade),
    source_platform: row.source_platform == null ? null : String(row.source_platform),
    tracking_number: row.tracking_number == null ? null : String(row.tracking_number),
    carrier: row.carrier == null ? null : String(row.carrier),
    serial_number:
      serialCol || (entityType === 'SERIAL_UNIT' ? serialFromSubtitle(subtitle) : null),
    happened_at:
      row.happened_at instanceof Date || typeof row.happened_at === 'string'
        ? row.happened_at
        : null,
  };
}

async function embedQueryImpl(orgId: OrgId, query: string): Promise<number[] | null> {
  const config = await resolveOrgAiConfig(orgId, 'embed');
  if (!config) return null; // unlinked tenant + no platform default → keyword-only
  try {
    const [vec] = await embedText([query], {
      timeoutMs: QUERY_EMBED_TIMEOUT_MS,
      config,
      onUsage: ({ promptTokens, model }) =>
        recordAiUsage({
          orgId,
          capability: 'embed',
          source: config.source,
          model,
          context: 'query_embed',
          inputTokens: promptTokens,
        }),
    });
    return vec ?? null;
  } catch {
    return null; // latency contract: degrade to keyword-only, never error
  }
}

const defaultDeps: HybridSearchDeps = {
  exactSearch: searchAllEntities,
  keywordSearch: keywordSearchImpl,
  embedQuery: embedQueryImpl,
  vectorSearch: vectorSearchImpl,
};

// ── Merge + mapping ─────────────────────────────────────────────────────────

function docKey(row: DocHitRow): string {
  return `${row.entity_type}:${row.entity_id}`;
}

export function docRowToHit(row: DocHitRow, score: number, matchField: string): SearchHit {
  const facets = {
    status: row.status,
    conditionGrade: row.condition_grade,
    sourcePlatform: row.source_platform,
  };
  const entityType = toUiEntityType(row.entity_type);
  const orderId =
    entityType === 'order' || entityType === 'receiving'
      ? orderIdFromSubtitle(row.subtitle)
      : null;
  return {
    id: row.entity_id,
    entityType,
    title: row.title,
    subtitle: row.subtitle ?? '',
    href: searchHitHref(row.entity_type, row.entity_id),
    matchField,
    score,
    chips: facetChips(facets),
    facets: {
      status: row.status,
      condition_grade: row.condition_grade,
      source_platform: row.source_platform,
      tracking_number: row.tracking_number,
      carrier: row.carrier,
      serial_number: row.serial_number,
      order_id: orderId,
      // ISO string so the row can render a relative date (formatRelativeTime).
      happened_at: row.happened_at ? new Date(row.happened_at).toISOString() : null,
    },
  };
}

function exactResultToHit(result: GlobalSearchResult, rank: number): SearchHit {
  const facets = result.facets ?? {};
  return {
    id: result.id,
    entityType: result.entityType as SearchHit['entityType'],
    title: result.title,
    subtitle: result.subtitle,
    href: result.href,
    matchField: result.matchField,
    // Exact hits outrank anything the fuzzy arms can produce.
    score: 1000 - rank,
    chips: facetChips({
      status: facets.status ?? null,
      conditionGrade: facets.condition_grade ?? null,
      sourcePlatform: facets.source_platform ?? null,
    }),
    facets: {
      status: facets.status ?? null,
      condition_grade: facets.condition_grade ?? null,
      source_platform: facets.source_platform ?? null,
      tracking_number: facets.tracking_number ?? null,
      carrier: facets.carrier ?? null,
      serial_number: facets.serial_number ?? null,
      order_id: facets.order_id ?? null,
      po_number: facets.po_number ?? null,
      source_order_id: facets.source_order_id ?? null,
      happened_at: facets.happened_at ?? null,
    },
  };
}

/** Reciprocal-rank fusion across the keyword and vector arms. */
export function rrfMerge(
  arms: DocHitRow[][],
  limit: number,
  boostTypes?: SearchEntityType[],
): Array<{ row: DocHitRow; score: number; arms: number }> {
  const boosted = new Set(boostTypes ?? []);
  const fused = new Map<string, { row: DocHitRow; score: number; arms: number }>();
  for (const arm of arms) {
    arm.forEach((row, rank) => {
      const key = docKey(row);
      const entry = fused.get(key);
      const increment = 1 / (RRF_K + rank + 1);
      if (entry) {
        entry.score += increment;
        entry.arms += 1;
      } else {
        fused.set(key, { row, score: increment, arms: 1 });
      }
    });
  }
  const entries = [...fused.values()];
  if (boosted.size > 0) {
    for (const entry of entries) {
      if (boosted.has(entry.row.entity_type)) entry.score *= 1.3;
    }
  }
  return entries
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.row.entity_type.localeCompare(b.row.entity_type) ||
        a.row.entity_id - b.row.entity_id,
    )
    .slice(0, limit);
}

// ── Entry point ─────────────────────────────────────────────────────────────

export async function hybridSearch(
  orgId: OrgId,
  query: string,
  opts: HybridSearchOpts = {},
  deps: HybridSearchDeps = defaultDeps,
): Promise<HybridSearchResult> {
  const q = query.trim();
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  if (!q) return { hits: [], usedSemantic: false };

  // 1) Exact/ID/serial bypass — deterministic parent-table truth.
  //    Identifier queries skip keyword + embed: a miss is a miss (no pg_trgm
  //    / contains fuzzy). Natural-language queries use keyword + vector.
  const isIdentifier = !opts.entityTypes && looksLikeIdentifier(q);

  const [exact, keywordRows, queryVec] = await Promise.all([
    isIdentifier
      ? deps.exactSearch(orgId, q, limit).catch(() => [] as GlobalSearchResult[])
      : Promise.resolve([] as GlobalSearchResult[]),
    isIdentifier
      ? Promise.resolve([] as DocHitRow[])
      : deps.keywordSearch(orgId, q, opts.entityTypes, ARM_LIMIT).catch(() => [] as DocHitRow[]),
    isIdentifier ? Promise.resolve(null) : deps.embedQuery(orgId, q),
  ]);

  if (exact.length > 0) {
    const exactHits = exact.map(exactResultToHit);
    const seen = new Set(exactHits.map((h) => `${h.entityType}:${h.id}`));
    // Keyword rows the exact arm already covered are dropped; the remainder
    // (serial units + any doc the parent searchers miss) fills in below the
    // exact hits, ranked under them but above nothing.
    const extra = keywordRows
      .filter((row) => !seen.has(`${toUiEntityType(row.entity_type)}:${row.entity_id}`))
      .map((row, i) => docRowToHit(row, 500 - i, 'keyword'));
    return { hits: [...exactHits, ...extra].slice(0, limit), usedSemantic: false };
  }
  const vectorRows = queryVec
    ? await deps
        .vectorSearch(orgId, queryVec, opts.entityTypes, ARM_LIMIT)
        .catch(() => [] as DocHitRow[])
    : [];

  const usedSemantic = vectorRows.length > 0;
  const inKeyword = new Set(keywordRows.map(docKey));
  const inVector = new Set(vectorRows.map(docKey));

  const merged = rrfMerge([keywordRows, vectorRows], limit, opts.boostEntityTypes);
  const hits = merged.map(({ row, score }) => {
    const key = docKey(row);
    const matchField =
      inKeyword.has(key) && inVector.has(key)
        ? 'hybrid'
        : inVector.has(key)
          ? 'semantic'
          : 'keyword';
    // Scale fused RRF scores (max ~2/61) into a readable 0..100 band.
    return docRowToHit(row, Math.round(score * 3050), matchField);
  });

  return { hits, usedSemantic };
}
