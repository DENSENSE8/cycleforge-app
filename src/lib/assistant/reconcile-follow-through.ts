/**
 * The reconcile follow-up chip that ACTS — "Add the missing ones as new
 * orders" (`follow-ups.ts`).
 *
 * The chip's text carries no numbers, and the model must not retype them: the
 * refs come server-side from this thread's last `reconcile_refs` table as it
 * was persisted (its "Not in system" rows), and the route runs the draft tool
 * itself — the order card prefilled with the order number — with no model
 * round. The card's own "Still needed" asks for the rest.
 */

import type { OrgId } from '@/lib/tenancy/constants';
import { detectCarrier, extractCanonicalTracking } from '@/lib/tracking-format';
import { REF_GROUP_LABELS } from '@/lib/assistant/tools/reconcile-refs-tool';
import { RECONCILE_ADD_ORDERS_CHIP } from './follow-ups';
import { tenantQuery } from '@/lib/tenancy/db';
import type { AssistantToolRunResult } from '@/lib/assistant/tools/types';
import type { SessionArtifact } from './ui-artifacts';

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Whether this message is the chip (typed or clicked). */
export function isReconcileFollowThrough(message: string): boolean {
  return squash(message) === squash(RECONCILE_ADD_ORDERS_CHIP);
}

/** The "Not in system" refs of this thread's newest reconcile table, in paste order. */
const MISSING_REFS_SQL = `WITH last AS (
  SELECT a.value->'artifact'->'rows' AS rows
    FROM ai_chat_messages m
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(m.analysis->'artifacts') = 'array' THEN m.analysis->'artifacts' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS a(value, ord)
   WHERE m.organization_id = $1 AND m.session_id = $2 AND m.role = 'assistant' AND m.superseded_at IS NULL
     AND a.value->>'producedBy' = 'reconcile_refs'
   ORDER BY m.id DESC, a.ord DESC
   LIMIT 1
)
SELECT r.value->>'Ref' AS ref
  FROM last
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(last.rows) = 'array' THEN last.rows ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS r(value, ord)
 WHERE r.value->>'Group' = $3
 ORDER BY r.ord`;

type Query = (orgId: OrgId, text: string, params: ReadonlyArray<unknown>) => Promise<{ rows: Array<Record<string, unknown>> }>;

export async function loadReconcileMissingRefs(query: Query, orgId: OrgId, sessionId: string): Promise<string[]> {
  const rows = (await query(orgId, MISSING_REFS_SQL, [orgId, sessionId, REF_GROUP_LABELS.not_in_system])).rows;
  return rows.map((r) => (typeof r.ref === 'string' ? r.ref.trim() : '')).filter(Boolean);
}

export interface FollowThroughPlan {
  tool: 'draft_manual_order';
  input: Record<string, unknown>;
  /** The refs the draft carries. */
  used: string[];
  /** Missing refs this draft does not carry (the next orders). */
  rest: string[];
}

/**
 * The draft the chip opens: ONE order number — the first ref that is not a
 * tracking number (else the first) — naming the rest for the next order.
 */
export function planFollowThrough(refs: readonly string[]): FollowThroughPlan | null {
  const orderLike = refs.filter((r) => detectCarrier(extractCanonicalTracking(r)) === 'Unknown');
  const pool = orderLike.length ? orderLike : refs;
  const first = pool[0];
  if (!first) return null;
  return {
    tool: 'draft_manual_order',
    input: { newOrder: true, orderNumber: first },
    used: [first],
    rest: pool.filter((r) => r !== first),
  };
}

/** The operator's sentence for the opened draft, from its card's own "Still needed". */
export function followThroughAnswer(plan: FollowThroughPlan, missing: readonly string[]): string {
  const rest = plan.rest.length ? ` Next after this one: ${plan.rest.join(', ')}.` : '';
  const needs = missing.length ? ` Still needed: ${missing.join(', ')}.` : '';
  return `Opened an order draft for ${plan.used[0]}.${rest}${needs}`;
}

export interface FollowThroughTurn {
  tool: FollowThroughPlan['tool'];
  input: Record<string, unknown>;
  result: AssistantToolRunResult;
  text: string;
}

/**
 * Open the chip's draft: null when the thread has no reconcile table with
 * missing refs (the model answers the message as usual).
 */
export async function runReconcileFollowThrough(
  orgId: OrgId,
  sessionId: string,
  run: (tool: string, input: Record<string, unknown>) => Promise<AssistantToolRunResult>,
  query: Query = async (o, text, params) => ({ rows: (await tenantQuery(o, text, [...params])).rows as Array<Record<string, unknown>> }),
): Promise<FollowThroughTurn | null> {
  const plan = planFollowThrough(await loadReconcileMissingRefs(query, orgId, sessionId));
  if (!plan) return null;
  const result = await run(plan.tool, plan.input);
  if (!result.ok) return { tool: plan.tool, input: plan.input, result, text: `Could not open the draft — ${result.error}` };
  const artifact = (result.data as { artifact?: SessionArtifact } | null)?.artifact;
  const missing = artifact?.kind === 'order_draft' ? artifact.missing : [];
  return { tool: plan.tool, input: plan.input, result, text: followThroughAnswer(plan, missing) };
}
