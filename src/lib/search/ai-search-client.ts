/**
 * ai-search-client — the CLIENT-side bridge to /api/ai/retrieve (AI search
 * Phase 2, plan §12: "all other search inputs become thin wrappers that
 * inject their page context + call the central retrieve endpoint").
 *
 * Client-safe: no pool/tenancy imports. Three things live here so every
 * consumer (CommandBar, workbench quick-jumps) shares one implementation:
 *
 *   1. fetchAiSearchEnabled() — the rollout-flag probe (GET /api/ai/retrieve
 *      → { enabled }), memoized per session. A 403 (no ai.search permission)
 *      or any failure reads as disabled, so consumers fall back to their
 *      classic search path untouched.
 *   2. postAiRetrieve() — one POST wrapper with abort support.
 *   3. The client-facing AiSearchHit shape (SearchHit as serialized).
 */

export interface AiSearchHitChip {
  label: string;
  tone?: string;
}

/** SearchHit as it arrives over the wire (src/lib/search/search-hit.ts). */
export interface AiSearchHit {
  id: number;
  entityType: string;
  title: string;
  subtitle: string;
  href: string;
  /**
   * Ranking inputs — RANKING happens server-side, so `/api/ai/retrieve` strips
   * both from the wire (see its `toWireHit`). Optional here because other
   * producers of this shape (CommandBar's local mapping, support-ticket
   * search) still set them.
   */
  matchField?: string;
  score?: number;
  chips?: AiSearchHitChip[];
  facets?: Record<string, string | null>;
}

export interface AiRetrieveResponse {
  hits: AiSearchHit[];
  usedSemantic: boolean;
  /** mode:'ask' only — the LLM-distilled search args (query + entity scope). */
  toolArgs?: { query: string; entityTypes?: string[]; limit?: number };
}

let enabledPromise: Promise<boolean> | null = null;

/** Memoized per session — one probe, ever. Failure/403 = disabled. */
export function fetchAiSearchEnabled(): Promise<boolean> {
  if (!enabledPromise) {
    enabledPromise = fetch('/api/ai/retrieve')
      .then((res) => (res.ok ? res.json() : { enabled: false }))
      .then((data) => Boolean(data?.enabled))
      .catch(() => false);
  }
  return enabledPromise;
}

/** Test-only escape hatch (module state would otherwise leak across tests). */
export function resetAiSearchEnabledCache(): void {
  enabledPromise = null;
}

export interface PostAiRetrieveOpts {
  entityTypes?: string[];
  limit?: number;
  pageContext?: string;
  mode?: 'retrieve' | 'ask';
  signal?: AbortSignal;
}

/**
 * Outcome of a retrieve. The STATUS is carried on failure, because "your role
 * has no `ai.search` permission" (403) and "retrieval broke" are different
 * things to say to an operator — a caller that only sees `null` has to print
 * "Search failed" for a permission answer, which sends them to look for an
 * outage instead of an admin. A network throw is `status: 0`.
 */
export type PostAiRetrieveResult =
  | { ok: true; data: AiRetrieveResponse }
  | { ok: false; status: number };

/**
 * POST /api/ai/retrieve. Never throws EXCEPT on abort, which re-throws so
 * callers can distinguish "stale request" from "degrade".
 */
export async function postAiRetrieve(
  query: string,
  opts: PostAiRetrieveOpts = {},
): Promise<PostAiRetrieveResult> {
  try {
    const res = await fetch('/api/ai/retrieve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query,
        entityTypes: opts.entityTypes,
        limit: opts.limit,
        pageContext: opts.pageContext,
        mode: opts.mode,
      }),
      signal: opts.signal,
    });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: (await res.json()) as AiRetrieveResponse };
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') throw err;
    return { ok: false, status: 0 };
  }
}
