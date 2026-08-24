/**
 * The operator entry point to the chokepoint.
 *
 * `applyAgentMutation` accepts an operator actor directly; this is the shape a
 * route handler should call, because it makes the two things a route must get
 * right unmissable:
 *
 *   • `staffId` is REQUIRED and non-nullable. An "operator action" with no
 *     operator is a contradiction, and letting it default to null would put
 *     anonymous rows in a ledger whose entire purpose is attribution.
 *   • `organizationId` is a parameter, so it comes from `ctx.organizationId`
 *     at the call site and never from a request body.
 *
 * Everything else — the transaction, the inverse capture, the audit / ops_event
 * / Ably fan-out — is `applyAgentMutation`'s, unchanged. This adds no second
 * path; it is a correctly-shaped door onto the only one.
 */

import type { OrgId } from '@/lib/tenancy/constants';
import {
  applyAgentMutation,
  type ApplyAgentMutationDeps,
  type ApplyAgentMutationResult,
} from '@/lib/assistant/mutations/apply-agent-mutation';
import type { SessionActionKind } from './action-kinds';
import type { SessionRef } from './types';

export interface ApplySessionActionInput {
  /** From `ctx.organizationId`. Never the request body. */
  organizationId: OrgId;
  /** The person. Required — see the module docblock. */
  staffId: number;
  /**
   * The work session this happened inside.
   *
   * Nullable because two of these kinds legitimately have no session yet:
   * `work_session.start` is what CREATES one, and an action taken outside any
   * session (an operator fixing something from a table view) is a real case. A
   * null here means the row lands in the ledger with no session anchor and the
   * Process tool will not list it under any session — which is correct, not a
   * bug, and is why it is an explicit null rather than an omitted field.
   */
  session: SessionRef | null;
  kind: SessionActionKind;
  payload: Record<string, unknown>;
}

export function applySessionAction(
  input: ApplySessionActionInput,
  deps?: ApplyAgentMutationDeps,
): Promise<ApplyAgentMutationResult> {
  return applyAgentMutation(
    {
      organizationId: input.organizationId,
      mutationKind: input.kind,
      payload: input.payload,
      actor: { kind: 'operator', staffId: input.staffId, session: input.session },
    },
    deps,
  );
}
