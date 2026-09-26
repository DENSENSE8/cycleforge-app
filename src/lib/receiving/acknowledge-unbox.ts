/** Unbox acknowledgement — the "operator handled it" → stamp the Unboxed milestone rule. */

import type { PoolClient } from 'pg';
import { upsertReceivingUnbox } from '@/lib/receiving/streets/carton-street-write';

type UnboxClient = Pick<PoolClient, 'query'>;

export interface AcknowledgeUnboxDeps {
  upsertUnbox: typeof upsertReceivingUnbox;
}

const defaultDeps: AcknowledgeUnboxDeps = { upsertUnbox: upsertReceivingUnbox };

/**
 * Set-once stamp of the carton's Unboxed milestone from an operator acknowledgement.
 * No-op when `receivingId` is missing (a line not attached to a carton).
 */
export async function acknowledgeUnbox(
  client: UnboxClient,
  orgId: string,
  receivingId: number | null | undefined,
  staffId: number | null | undefined,
  deps: AcknowledgeUnboxDeps = defaultDeps,
): Promise<void> {
  if (receivingId == null) return;
  await deps.upsertUnbox(client, orgId, receivingId, {
    unboxedAt: 'now',
    unboxedBy: staffId ?? null,
    deriveIntakePath: true,
  });
}
