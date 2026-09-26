/** Contents confirmation — the fact that a human read this carton's line list before working it, and the gate for the `contents` procedure… */

import type { PoolClient } from 'pg';
import { upsertReceivingUnbox } from '@/lib/receiving/streets/carton-street-write';

type UnboxClient = Pick<PoolClient, 'query'>;

export interface ConfirmContentsDeps {
  upsertUnbox: typeof upsertReceivingUnbox;
}

const defaultDeps: ConfirmContentsDeps = { upsertUnbox: upsertReceivingUnbox };

interface ConfirmContentsInput {
  orgId: string;
  receivingId: number;
  staffId: number | null | undefined;
  /** `true` stamps the confirmation, `false` retracts it (reopen). */
  confirmed: boolean;
}

/** Stamp or retract the carton's contents confirmation. */
export async function confirmContents(
  client: UnboxClient,
  input: ConfirmContentsInput,
  deps: ConfirmContentsDeps = defaultDeps,
): Promise<void> {
  await deps.upsertUnbox(client, input.orgId, input.receivingId, {
    contentsConfirmedAt: input.confirmed ? 'now' : null,
    contentsConfirmedBy: input.confirmed ? (input.staffId ?? null) : null,
  });
}
