/**
 * Real deps for {@link runReturnsBackfillPipeline}. Kept off the pure module
 * so unit tests never import the pool or a platform client.
 */
import type { OrgId } from '@/lib/tenancy/constants';
import { runReturnsSync } from '@/lib/returns/returns-sync';
import { returnsSyncDeps } from '@/lib/returns/returns-sync-load';
import {
  runReturnsBackfillPipeline,
  type ReturnsBackfillDeps,
  type ReturnsBackfillOpts,
} from './returns-backfill-pipeline';

const deps: ReturnsBackfillDeps = {
  sync: (orgId, opts) => runReturnsSync(orgId, opts, returnsSyncDeps),
  getCursor: returnsSyncDeps.getCursor,
  updateCursor: returnsSyncDeps.updateCursor,
  now: () => new Date(),
};

export function loadReturnsBackfillPipeline(orgId: OrgId, opts?: ReturnsBackfillOpts) {
  return runReturnsBackfillPipeline(orgId, deps, opts);
}
