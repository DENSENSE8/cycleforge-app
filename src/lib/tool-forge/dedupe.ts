/** searchToolRegistry — the measurement half of the duplicate gate. */

import { tenantQuery } from '@/lib/tenancy/db';
import { embedText } from '@/lib/ai/embed';
import type { OrgId } from '@/lib/tenancy/constants';
import type { DedupeOutcome, ToolMatch } from './triage';

export interface ToolDedupeDeps {
  /** Injectable so the unit tests run with no env, no network and no DB. */
  embed: (texts: string[]) => Promise<number[][]>;
  query: (
    orgId: OrgId,
    text: string,
    params?: ReadonlyArray<unknown>,
  ) => Promise<{ rows: Array<Record<string, unknown>> }>;
  /** How many neighbours to pull back. Only the top one decides, the rest are context. */
  limit: number;
}

const defaultDeps: ToolDedupeDeps = {
  embed: (texts) => embedText(texts),
  query: async (orgId, text, params) => {
    const r = await tenantQuery(orgId, text, params);
    return { rows: r.rows as Array<Record<string, unknown>> };
  },
  limit: 5,
};

/**
 * Coverage probe: how many active tools exist, and how many are embedded.
 * Runs first so an unembedded corpus is reported as unmeasurable rather than
 * as an empty one.
 */
const COVERAGE_SQL = `
  SELECT count(*)::int AS active_count,
         count(embedding)::int AS embedded_count
    FROM tool_registry
   WHERE organization_id = $1
     AND status = 'active'
`;

/** Nearest-neighbour probe. */
const NEAREST_SQL = `
  SELECT id,
         tool_key,
         name,
         source_path,
         1 - (embedding <=> $1::vector) AS similarity
    FROM tool_registry
   WHERE organization_id = $2
     AND status = 'active'
     AND embedding IS NOT NULL
   ORDER BY embedding <=> $1::vector
   LIMIT $3
`;

export async function searchToolRegistry(
  orgId: OrgId,
  prompt: string,
  deps: Partial<ToolDedupeDeps> = {},
): Promise<DedupeOutcome> {
  const { embed, query, limit } = { ...defaultDeps, ...deps };

  const trimmed = prompt.trim();
  if (!trimmed) {
    return { measured: false, reason: 'the request prompt was empty' };
  }

  // ── 1. Corpus coverage ───────────────────────────────────────────────────
  let activeCount: number;
  let embeddedCount: number;
  try {
    const { rows } = await query(orgId, COVERAGE_SQL, [orgId]);
    const row = rows[0] ?? {};
    activeCount = Number(row.active_count ?? 0);
    embeddedCount = Number(row.embedded_count ?? 0);
  } catch (err) {
    return {
      measured: false,
      reason: `the tool registry could not be read (${errText(err)})`,
    };
  }

  // Genuinely empty registry — a real measurement. Nothing exists to duplicate.
  if (activeCount === 0) {
    return { measured: true, best: null, candidatesConsidered: 0 };
  }

  // Tools exist but none carry a vector: we cannot compare, so we must not
  // pretend the comparison came back clean.
  if (embeddedCount === 0) {
    return {
      measured: false,
      reason: `${activeCount} active tool${activeCount === 1 ? ' is' : 's are'} registered but none are embedded yet`,
    };
  }

  // ── 2. Embed the prompt ──────────────────────────────────────────────────
  let vector: number[];
  try {
    const [first] = await embed([trimmed]);
    if (!Array.isArray(first) || first.length === 0) {
      return { measured: false, reason: 'the embedding provider returned no vector' };
    }
    vector = first;
  } catch (err) {
    return {
      measured: false,
      reason: `the embedding provider failed (${errText(err)})`,
    };
  }

  // ── 3. Nearest neighbour ─────────────────────────────────────────────────
  let rows: Array<Record<string, unknown>>;
  try {
    const literal = `[${vector.join(',')}]`;
    const res = await query(orgId, NEAREST_SQL, [literal, orgId, limit]);
    rows = res.rows;
  } catch (err) {
    return {
      measured: false,
      reason: `the similarity search failed (${errText(err)})`,
    };
  }

  const matches: ToolMatch[] = rows
    .map((r) => ({
      toolId: Number(r.id),
      toolKey: String(r.tool_key ?? ''),
      name: String(r.name ?? ''),
      sourcePath: r.source_path == null ? null : String(r.source_path),
      similarity: Number(r.similarity),
    }))
    // A NaN similarity would compare false against the threshold and silently
    // approve. Drop it here rather than letting it reach the gate.
    .filter((m) => Number.isFinite(m.similarity));

  if (matches.length === 0) {
    return {
      measured: false,
      reason: 'the similarity search returned no usable scores',
    };
  }

  const best = matches.reduce((a, b) => (b.similarity > a.similarity ? b : a));
  return { measured: true, best, candidatesConsidered: embeddedCount };
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
