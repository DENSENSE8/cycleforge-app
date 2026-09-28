/**
 * The reconcile follow-up chips that ACT — "Import the missing ones as
 * purchase orders" / "Add the missing ones as new orders" (`follow-ups.ts`).
 *
 * The chip's text carries no numbers, and the model must not retype them: the
 * refs come server-side from this thread's last `reconcile_refs` table as it
 * was persisted (its "Not in system" rows), and the route runs the draft tool
 * itself — the PO card prefilled with the tracking numbers, or the order card
 * prefilled with the order number — with no model round. The card's own
 * "Still needed" asks for the rest.
 */

import type { OrgId } from '@/lib/tenancy/constants';
import { trackingEntry } from '@/lib/inbound/po-import-draft';
import { detectCarrier, extractCanonicalTracking } from '@/lib/tracking-format';
import { REF_GROUP_LABELS } from '@/lib/assistant/tools/reconcile-refs-tool';
import { RECONCILE_ADD_ORDERS_CHIP, RECONCILE_IMPORT_PO_CHIP } from './follow-ups';
import { tenantQuery } from '@/lib/tenancy/db';
import type { AssistantToolRunResult } from '@/lib/assistant/tools/types';
import type { SessionArtifact } from './ui-artifacts';

export type ReconcileFollowThrough = 'po' | 'orders';

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Which chip this message is (typed or clicked), or null. */
export function reconcileFollowThroughKind(message: string): ReconcileFollowThrough | null {
  const said = squash(message);
  if (said === squash(RECONCILE_IMPORT_PO_CHIP)) return 'po';
  if (said === squash(RECONCILE_ADD_ORDERS_CHIP)) return 'orders';
  return null;
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
  tool: 'draft_po_import' | 'draft_manual_order';
  input: Record<string, unknown>;
  /** The refs the draft carries. */
  used: string[];
  /** Missing refs this draft does not carry (another order, not a tracking number). */
  rest: string[];
}

/**
 * The draft each chip opens. A PO carries the refs a carrier recognizes as
 * tracking (all number-shaped refs when none is); an order carries ONE order
 * number — the first ref that is not a tracking number (else the first) — and
 * names the rest for the next order.
 */
export function planFollowThrough(kind: ReconcileFollowThrough, refs: readonly string[]): FollowThroughPlan | null {
  const isTracking = (ref: string) => detectCarrier(extractCanonicalTracking(ref)) !== 'Unknown';
  if (kind === 'po') {
    const carrierKnown = refs.filter(isTracking);
    const used = (carrierKnown.length ? carrierKnown : refs.filter((r) => trackingEntry(r) != null)).slice(0, 10);
    if (used.length === 0) return null;
    return {
      tool: 'draft_po_import',
      input: { newPo: true, trackingNumbers: used },
      used,
      rest: refs.filter((r) => !used.includes(r)),
    };
  }
  const orderLike = refs.filter((r) => !isTracking(r));
  const first = (orderLike.length ? orderLike : refs)[0];
  if (!first) return null;
  return {
    tool: 'draft_manual_order',
    input: { newOrder: true, orderNumber: first },
    used: [first],
    rest: (orderLike.length ? orderLike : refs).filter((r) => r !== first),
  };
}

/** The operator's sentence for the opened draft, from its card's own "Still needed". */
export function followThroughAnswer(plan: FollowThroughPlan, missing: readonly string[]): string {
  const n = plan.used.length;
  const head =
    plan.tool === 'draft_po_import'
      ? `Opened a purchase order draft with the ${n === 1 ? 'missing tracking number' : `${n} missing tracking numbers`} (${plan.used.join(', ')}).`
      : `Opened an order draft for ${plan.used[0]}.`;
  const rest = plan.rest.length
    ? plan.tool === 'draft_po_import'
      ? ` Not added (not tracking numbers): ${plan.rest.join(', ')}.`
      : ` Next after this one: ${plan.rest.join(', ')}.`
    : '';
  const needs = missing.length ? ` Still needed: ${missing.join(', ')}.` : '';
  return `${head}${rest}${needs}`;
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
  kind: ReconcileFollowThrough,
  orgId: OrgId,
  sessionId: string,
  run: (tool: string, input: Record<string, unknown>) => Promise<AssistantToolRunResult>,
  query: Query = async (o, text, params) => ({ rows: (await tenantQuery(o, text, [...params])).rows as Array<Record<string, unknown>> }),
): Promise<FollowThroughTurn | null> {
  const plan = planFollowThrough(kind, await loadReconcileMissingRefs(query, orgId, sessionId));
  if (!plan) return null;
  const result = await run(plan.tool, plan.input);
  if (!result.ok) return { tool: plan.tool, input: plan.input, result, text: `Could not open the draft — ${result.error}` };
  const artifact = (result.data as { artifact?: SessionArtifact } | null)?.artifact;
  const missing =
    artifact?.kind === 'po_draft' ? artifact.missing.map((m) => m.label) : artifact?.kind === 'order_draft' ? artifact.missing : [];
  return { tool: plan.tool, input: plan.input, result, text: followThroughAnswer(plan, missing) };
}
