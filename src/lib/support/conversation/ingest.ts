import 'server-only';

/**
 * `ingestSupportMessage` — the ONE writer waist, bound to Postgres and the real after-commit effects (rules: ./ingest-core).
 * Every write runs inside `withTenantTransaction(orgId, …)` (`supportTransaction`, ./store-db) — the org comes from the draft.
 */
import { ingestSupportMessageCore, type IngestDeps } from './ingest-core';
import type { IngestSupportMessageResult, SupportMessageDraft } from './ingest-types';
import { supportPostCommit } from './post-commit';
import { supportTransaction } from './store-db';

export type { IngestDeps, SupportPostCommit } from './ingest-core';

export const supportIngestDeps: IngestDeps = {
  transaction: supportTransaction,
  postCommit: supportPostCommit,
  now: Date.now,
};

/**
 * Store one Support message and apply the loop's rules. Routes pass
 * `{ ...supportIngestDeps, runAfterCommit: after }` so alerts and the draft
 * worker run after the response; scripts and crons omit deps (awaited inline).
 */
export function ingestSupportMessage(
  draft: SupportMessageDraft,
  deps: IngestDeps = supportIngestDeps,
): Promise<IngestSupportMessageResult> {
  return ingestSupportMessageCore(draft, deps);
}
