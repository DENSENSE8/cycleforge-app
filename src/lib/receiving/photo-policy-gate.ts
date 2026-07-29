/**
 * mark-received photo-policy gate — server-side count assembly for the pure
 * evaluator (WS-PHOTO Plan 5,
 * docs/todo/photo-evidence-policy-claims-insurance-plan.md).
 *
 * `evaluateReceivingPhotoPolicy` (./photo-policy.ts) judges already-typed
 * evidence counts; this module owns HOW a receive route assembles them:
 *
 * - Carton stage counts come from `sqlCartonStagePhotoCount` (entity AND
 *   photo_type pinned per stage) — never the entity-only po-level count,
 *   which over-reports arrival evidence.
 * - Line item counts are entity-only per the identity law
 *   (`sqlLinePhotoCount`).
 * - "Non-cancelled lines" = every `receiving_line` row under the carton.
 *   The schema has no cancelled state for lines (removal is a hard DELETE),
 *   and both the unbox accordion and mark-received-po's carton-line loads
 *   read all rows under `receiving_id` unfiltered — the gate judges the same
 *   set the operator sees.
 *
 * Fast paths run ZERO queries (deps untouched):
 * - policy `optional` (or any unrecognized value) — the default must stay
 *   byte-identical to the ungated route;
 * - `alreadyReceived` — a re-receive/retry of a line that already advanced
 *   past the pre-receive stages must never newly 409 (Zoho-pending replays,
 *   testing bounce-backs, idempotent client retries);
 * - no resolvable carton id — nothing to scope evidence to (degrade-not-block;
 *   such a line has no unbox photo surface either).
 *
 * Deps-injected (default = real tenant-scoped query) so unit tests run
 * DB-free per `.claude/rules/backend-patterns.md`.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import {
  sqlCartonStagePhotoCount,
  sqlLinePhotoCount,
} from '@/lib/photos/queries/receiving-list';
import type { ReceivingPhotoPolicy } from '@/lib/settings/accessors';
import {
  evaluateReceivingPhotoPolicy,
  type ReceivingCartonPhotoCounts,
  type ReceivingLinePhotoCount,
  type ReceivingPhotoPolicyResult,
} from './photo-policy';

export interface ReceivingPhotoEvidenceCounts {
  cartonPhotoCounts: ReceivingCartonPhotoCounts;
  linePhotoCounts: ReceivingLinePhotoCount[];
}

export interface ReceivingPhotoPolicyGateDeps {
  loadEvidenceCounts: (input: {
    organizationId: string;
    receivingId: number;
  }) => Promise<ReceivingPhotoEvidenceCounts>;
}

/**
 * One statement, one row: both carton stage counts as scalar subqueries plus
 * the per-line item counts aggregated to json. The FROM-less SELECT always
 * returns exactly one row, so a carton with zero lines still reports its
 * carton counts (an empty `line_counts` array is vacuously ok under
 * `require_per_item`). Bind `[organizationId, receivingId]`.
 */
export function receivingPhotoEvidenceCountsSql(): string {
  return `SELECT
  ${sqlCartonStagePhotoCount('$2::int', '$1', 'package')}::int AS package_count,
  ${sqlCartonStagePhotoCount('$2::int', '$1', 'unbox_carton')}::int AS unbox_carton_count,
  COALESCE((
    SELECT json_agg(json_build_object(
      'lineId', rl.id,
      'sku', rl.sku,
      'itemCount', ${sqlLinePhotoCount('rl.id', 'rl.organization_id')}::int
    ) ORDER BY rl.id)
      FROM receiving_line rl
     WHERE rl.receiving_id = $2::int
       AND rl.organization_id = $1
  ), '[]'::json) AS line_counts`;
}

function asCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

async function loadEvidenceCountsFromDb(input: {
  organizationId: string;
  receivingId: number;
}): Promise<ReceivingPhotoEvidenceCounts> {
  const res = await tenantQuery<{
    package_count: number | string | null;
    unbox_carton_count: number | string | null;
    line_counts: Array<{ lineId: unknown; sku: unknown; itemCount: unknown }> | null;
  }>(input.organizationId, receivingPhotoEvidenceCountsSql(), [
    input.organizationId,
    input.receivingId,
  ]);
  const row = res.rows[0];
  const lines = Array.isArray(row?.line_counts) ? row.line_counts : [];
  return {
    cartonPhotoCounts: {
      package: asCount(row?.package_count),
      unboxCarton: asCount(row?.unbox_carton_count),
    },
    linePhotoCounts: lines
      .map((line) => ({
        lineId: asCount(line?.lineId),
        sku: typeof line?.sku === 'string' ? line.sku : null,
        itemCount: asCount(line?.itemCount),
      }))
      .filter((line) => line.lineId > 0),
  };
}

const defaultReceivingPhotoPolicyGateDeps: ReceivingPhotoPolicyGateDeps = {
  loadEvidenceCounts: loadEvidenceCountsFromDb,
};

/**
 * `inbound_workflow_status_enum` values a line holds BEFORE its first receive.
 * Everything else (UNBOXED, DONE, and the testing/disposition states) means
 * the physical receive already happened once — a repeat mark-received call is
 * a replay/bounce-back the photo gate must not newly block. Blank/unknown
 * counts as pre-receive: an untouched line is exactly what the gate insures.
 */
const PRE_RECEIVE_WORKFLOW_STATUSES: ReadonlySet<string> = new Set([
  '',
  'EXPECTED',
  'ARRIVED',
  'MATCHED',
]);

export function isPreReceiveWorkflowStatus(status: string | null | undefined): boolean {
  return PRE_RECEIVE_WORKFLOW_STATUSES.has(String(status ?? '').trim().toUpperCase());
}

/**
 * Assemble evidence counts (when the policy demands them) and judge them.
 * Returns the evaluator verdict; `!ok` maps to the route's 409
 * `{ error: 'PHOTO_POLICY', blockers }` BEFORE any mutation.
 */
export async function evaluateReceivingPhotoPolicyGate(
  input: {
    organizationId: string;
    /** Carton id — body value or resolved from the line row; null degrades to ok. */
    receivingId: number | null;
    policy: ReceivingPhotoPolicy;
    /** True when the line already advanced past the pre-receive stages. */
    alreadyReceived?: boolean;
  },
  deps: ReceivingPhotoPolicyGateDeps = defaultReceivingPhotoPolicyGateDeps,
): Promise<ReceivingPhotoPolicyResult> {
  const gated = input.policy === 'require_one' || input.policy === 'require_per_item';
  if (!gated || input.alreadyReceived) return { ok: true, blockers: [] };
  const receivingId =
    input.receivingId != null && Number.isFinite(input.receivingId) && input.receivingId > 0
      ? Math.floor(input.receivingId)
      : null;
  if (receivingId == null) return { ok: true, blockers: [] };

  const counts = await deps.loadEvidenceCounts({
    organizationId: input.organizationId,
    receivingId,
  });
  return evaluateReceivingPhotoPolicy({ policy: input.policy, ...counts });
}
