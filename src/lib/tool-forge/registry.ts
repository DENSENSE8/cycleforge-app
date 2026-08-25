/**
 * registerTool — the writer for tool_registry.
 *
 * Without this the table stays empty, and an empty registry is a MEASURABLE
 * "nothing to duplicate", which approves every request. That is correct
 * behaviour for a genuinely new org and a silent hole for an established one,
 * so seeding the registry is part of standing the pipeline up, not a follow-up.
 *
 * ─── EMBEDS INLINE, AND SAYS SO WHEN IT CANNOT ─────────────────────────────
 * Registry writes are rare (a handful per org, ever), so there is no outbox:
 * the description is embedded in the same call. When the provider is down the
 * row is still written with a NULL embedding and `embedded_at` left unset —
 * losing the tool entirely would be worse. A NULL embedding is not "matches
 * nothing": dedupe.ts reads an unembedded corpus as unmeasurable and denies,
 * which is why backfillEmbeddings exists and why it is worth running.
 */

import { withTenantTransaction } from '@/lib/tenancy/db';
import { embedText } from '@/lib/ai/embed';
import type { OrgId } from '@/lib/tenancy/constants';
import type { PoolClient } from 'pg';
import type { ToolRegistryStatus } from './constants';

export interface RegisterToolInput {
  toolKey: string;
  name: string;
  /** What the tool DOES — this is the match text, so write it for a reader. */
  description: string;
  sourcePath?: string | null;
  status?: ToolRegistryStatus;
  createdByStaffId?: number | null;
}

export interface ToolRegistryDeps {
  embed: (texts: string[]) => Promise<number[][]>;
  tx: <T>(orgId: OrgId, fn: (client: PoolClient) => Promise<T>) => Promise<T>;
}

const defaultDeps: ToolRegistryDeps = {
  embed: (texts) => embedText(texts),
  tx: withTenantTransaction,
};

export interface RegisterToolResult {
  id: number;
  embedded: boolean;
  /** Why the embedding is missing, when it is. */
  embedError?: string;
}

export async function registerTool(
  orgId: OrgId,
  input: RegisterToolInput,
  deps: Partial<ToolRegistryDeps> = {},
): Promise<RegisterToolResult> {
  const { embed, tx } = { ...defaultDeps, ...deps };

  // Embedded BEFORE the transaction opens — a provider round trip must not
  // hold a connection from the pool every other tenant shares.
  let vector: number[] | null = null;
  let embedError: string | undefined;
  try {
    const [v] = await embed([input.description]);
    if (Array.isArray(v) && v.length > 0) vector = v;
    else embedError = 'provider returned no vector';
  } catch (err) {
    embedError = err instanceof Error ? err.message : String(err);
  }

  const literal = vector ? `[${vector.join(',')}]` : null;

  const id = await tx(orgId, async (client) => {
    const { rows } = await client.query(
      `INSERT INTO tool_registry
         (organization_id, tool_key, name, description, source_path, status,
          embedding, embedded_at, created_by_staff_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7::vector, CASE WHEN $7 IS NULL THEN NULL ELSE now() END, $8)
       ON CONFLICT (organization_id, tool_key) DO UPDATE
         SET name        = EXCLUDED.name,
             description = EXCLUDED.description,
             source_path = EXCLUDED.source_path,
             status      = EXCLUDED.status,
             -- Keep the existing vector when this write could not produce one,
             -- so a provider blip during a rename does not blind the gate to a
             -- tool it could already match.
             embedding   = COALESCE(EXCLUDED.embedding, tool_registry.embedding),
             embedded_at = CASE WHEN EXCLUDED.embedding IS NULL
                                THEN tool_registry.embedded_at ELSE now() END,
             updated_at  = now()
       RETURNING id`,
      [
        orgId,
        input.toolKey,
        input.name,
        input.description,
        input.sourcePath ?? null,
        input.status ?? 'active',
        literal,
        input.createdByStaffId ?? null,
      ],
    );
    return Number(rows[0].id);
  });

  return { id, embedded: vector !== null, ...(embedError ? { embedError } : {}) };
}

/**
 * Fill in vectors for rows that have none — the repair path for anything
 * registered while the provider was down. Returns how many were healed.
 */
export async function backfillEmbeddings(
  orgId: OrgId,
  limit = 50,
  deps: Partial<ToolRegistryDeps> = {},
): Promise<{ healed: number; remaining: number }> {
  const { embed, tx } = { ...defaultDeps, ...deps };

  const pending = await tx(orgId, async (client) => {
    const { rows } = await client.query(
      `SELECT id, description FROM tool_registry
        WHERE organization_id = $1 AND embedding IS NULL AND status = 'active'
        ORDER BY id LIMIT $2`,
      [orgId, limit],
    );
    return rows as Array<{ id: number; description: string }>;
  });

  if (pending.length === 0) return { healed: 0, remaining: 0 };

  const vectors = await embed(pending.map((r) => r.description));

  const healed = await tx(orgId, async (client) => {
    let n = 0;
    for (let i = 0; i < pending.length; i += 1) {
      const v = vectors[i];
      if (!Array.isArray(v) || v.length === 0) continue;
      await client.query(
        `UPDATE tool_registry
            SET embedding = $1::vector, embedded_at = now(), updated_at = now()
          WHERE organization_id = $2 AND id = $3`,
        [`[${v.join(',')}]`, orgId, pending[i].id],
      );
      n += 1;
    }
    return n;
  });

  const remaining = await tx(orgId, async (client) => {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM tool_registry
        WHERE organization_id = $1 AND embedding IS NULL AND status = 'active'`,
      [orgId],
    );
    return Number(rows[0].n);
  });

  return { healed, remaining };
}
