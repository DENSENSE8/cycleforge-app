/** inbound_followups — durable staff tags on pasted inbound numbers (migration `2026-10-03_inbound_followups`). */

import type { PoolClient } from 'pg';
import type { OrgId } from '@/lib/tenancy/constants';
import type { InboundFollowup, InboundFollowupTag } from '@/lib/receiving/inbound-followups';
import type { InboundFollowupsWriteInput } from '@/lib/schemas/inbound-followups';

type Executor = Pick<PoolClient, 'query'>;

export interface InboundFollowupsDeps {
  runTransaction: <T>(orgId: OrgId, fn: (db: Executor) => Promise<T>) => Promise<T>;
}

// Lazy so DB-free tests can inject deps without loading the server-only pool.
const defaultDeps: InboundFollowupsDeps = {
  runTransaction: async (orgId, fn) => {
    const { withTenantTransaction } = await import('@/lib/tenancy/db');
    return withTenantTransaction(orgId, (client) => fn(client));
  },
};

interface Row {
  ref_key: string;
  tag: InboundFollowupTag;
  note: string | null;
  set_by: number | null;
  set_by_name: string | null;
  set_at: string | Date;
}

function toFollowup(row: Row): InboundFollowup {
  return {
    key: row.ref_key,
    tag: row.tag,
    note: row.note,
    setBy: row.set_by,
    setByName: row.set_by_name,
    setAt: row.set_at instanceof Date ? row.set_at.toISOString() : row.set_at,
  };
}

const SELECT_WITH_NAME = `
  SELECT f.ref_key, f.tag, f.note, f.set_by, s.name AS set_by_name, f.set_at
    FROM inbound_followups f
    LEFT JOIN staff s ON s.id = f.set_by
   WHERE f.organization_id = $1 AND f.ref_key = ANY($2::text[])
   ORDER BY f.ref_key`;

/** The follow-ups currently set on `keys` (unset keys are simply absent). */
export async function readInboundFollowups(
  orgId: OrgId,
  keys: string[],
  deps: InboundFollowupsDeps = defaultDeps,
): Promise<InboundFollowup[]> {
  if (keys.length === 0) return [];
  return deps.runTransaction(orgId, async (db) => {
    const { rows } = await db.query<Row>(SELECT_WITH_NAME, [orgId, keys]);
    return rows.map(toFollowup);
  });
}

/**
 * Set (`tag` non-null → upsert, restamping who/when) or clear (`tag: null` →
 * delete) the follow-up on every key in one transaction. Returns the rows as
 * they now stand — empty after a clear.
 */
export async function writeInboundFollowups(
  orgId: OrgId,
  staffId: number,
  input: InboundFollowupsWriteInput,
  deps: InboundFollowupsDeps = defaultDeps,
): Promise<InboundFollowup[]> {
  const keys = [...new Set(input.keys)];
  return deps.runTransaction(orgId, async (db) => {
    if (input.tag === null) {
      await db.query(
        `DELETE FROM inbound_followups WHERE organization_id = $1 AND ref_key = ANY($2::text[])`,
        [orgId, keys],
      );
      return [];
    }
    const note = input.note?.trim() || null;
    await db.query(
      `INSERT INTO inbound_followups (organization_id, ref_key, tag, note, set_by, set_at)
       SELECT $1, k, $3, $4, $5, now() FROM unnest($2::text[]) AS k
       ON CONFLICT (organization_id, ref_key)
       DO UPDATE SET tag = EXCLUDED.tag, note = EXCLUDED.note,
                     set_by = EXCLUDED.set_by, set_at = EXCLUDED.set_at`,
      [orgId, keys, input.tag, note, staffId],
    );
    const { rows } = await db.query<Row>(SELECT_WITH_NAME, [orgId, keys]);
    return rows.map(toFollowup);
  });
}
