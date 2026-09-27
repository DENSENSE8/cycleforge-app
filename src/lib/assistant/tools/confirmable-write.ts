/**
 * The confirm-before-write shape the chat's order-status and task writes share
 * (the same contract `link_manual_to_sku` spells out by hand):
 *
 *   1. `propose` resolves what the operator named (org-scoped reads), files
 *      ONE agent mutation in `proposed` state for this chat session, and shows
 *      a preview of exactly what will change. Nothing is written yet.
 *   2. On a LATER turn, `confirm` approves this session's newest pending
 *      proposal of the kind through `reviewAgentMutation` (the kind's own
 *      permission, one transaction, audited, revertable when the kind has an
 *      inverse); `cancel` rejects it. A proposal filed in the current turn
 *      cannot be confirmed — the model cannot ask and answer its own question.
 *
 * Ask-only turns never reach these (dispatch refuses writes); `run` refuses
 * again so the tool is safe wherever it is mounted.
 */

import { z } from 'zod';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { askOnlyRefusal } from '@/lib/assistant/access-mode';
import { applyAgentMutation, reviewAgentMutation } from '@/lib/assistant/mutations/apply-agent-mutation';
import { serveFindRecords } from '@/lib/search/serve-find-records';
import type { PermissionString } from '@/lib/auth/permissions-shared';
import type { MutationKind } from '@/lib/surfaces/registry';
import type { ToolArtifactEnvelope } from '@/lib/assistant/tool-artifact';
import type { AssistantToolCtx, AssistantToolDef } from './types';

type Rows = Array<Record<string, unknown>>;

export interface ConfirmableWriteDeps {
  query: (orgId: OrgId, text: string, params: ReadonlyArray<unknown>) => Promise<{ rows: Rows }>;
  apply: typeof applyAgentMutation;
  review: typeof reviewAgentMutation;
  /** The find_records door — how pasted order #s / item #s resolve. */
  find: typeof serveFindRecords;
}

export const realConfirmableDeps: ConfirmableWriteDeps = {
  query: async (orgId, text, params) => ({ rows: (await tenantQuery(orgId, text, [...params])).rows as Rows }),
  apply: applyAgentMutation,
  review: reviewAgentMutation,
  find: serveFindRecords,
};

type Fail = { ok: false; error: string };

/** What `propose` hands back: a no-op answer, or the payload to file plus its preview. */
export type ProposeOutcome<P> =
  | Fail
  | { ok: true; answer: ToolArtifactEnvelope | Record<string, unknown> }
  | {
      ok: true;
      payload: P;
      /** The preview (usually a table of every row that will change, plus "Couldn't match"). */
      preview: (mutationId: number) => ToolArtifactEnvelope;
    };

export interface ConfirmableWriteSpec<S extends z.ZodObject<z.ZodRawShape>, P> {
  name: string;
  kind: MutationKind;
  permission: PermissionString;
  description: string;
  /** Tool-specific fields; `action` is added here. */
  fields: S;
  propose: (ctx: AssistantToolCtx, input: z.infer<S>, deps: ConfirmableWriteDeps) => Promise<ProposeOutcome<P>>;
  /** The result after approval — read back from the database, never echoed from the payload alone. */
  settled: (
    ctx: AssistantToolCtx,
    payload: P,
    mutationId: number,
    targetRef: string | null,
    deps: ConfirmableWriteDeps,
  ) => Promise<ToolArtifactEnvelope | Record<string, unknown>>;
  /** One clause naming the pending change, for the next turn's prompt note: "set Hold on 3 orders". */
  pendingPhrase: (payload: P) => string;
}

const pendingSql = (kind: string) => `SELECT id, payload, created_at
  FROM agent_mutations
 WHERE organization_id = $1 AND ai_chat_session_id = $2
   AND mutation_kind = '${kind}' AND status = 'proposed'
 ORDER BY id DESC
 LIMIT 1`;

/** The prompt line for this kind's proposal awaiting the operator's answer (null when none). */
export async function pendingConfirmableNote(
  spec: { name: string; kind: MutationKind; pendingPhrase: (payload: never) => string },
  orgId: OrgId,
  sessionId: string,
  query: ConfirmableWriteDeps['query'] = realConfirmableDeps.query,
): Promise<string | null> {
  const pending = (await query(orgId, pendingSql(spec.kind), [orgId, sessionId])).rows[0];
  if (!pending) return null;
  return `PENDING CONFIRMATION: you proposed to ${spec.pendingPhrase(pending.payload as never)} and asked the user to confirm. If this message says yes / confirm / go ahead, call ${spec.name} with {"action":"confirm"} (no other arguments — the change is remembered). If it says no / cancel, call it with {"action":"cancel"}.`;
}

export function buildConfirmableWriteTool<S extends z.ZodObject<z.ZodRawShape>, P>(
  spec: ConfirmableWriteSpec<S, P>,
  sessionId: string | null,
  /** When this turn began — a proposal at or after it is unconfirmable this turn. */
  turnStartedAt: Date,
  deps: ConfirmableWriteDeps = realConfirmableDeps,
): AssistantToolDef<z.ZodTypeAny, unknown> {
  const fail = (error: string): Fail => ({ ok: false, error });
  const inputSchema = spec.fields.extend({
    action: z
      .enum(['propose', 'confirm', 'cancel'])
      .default('propose')
      .describe('propose (default) previews the change for confirmation; confirm / cancel answer the pending one on a LATER turn.'),
  });

  const propose = async (ctx: AssistantToolCtx, input: z.infer<S>) => {
    const outcome = await spec.propose(ctx, input, deps);
    if (!outcome.ok) return outcome;
    if ('answer' in outcome) return outcome.answer;
    const filed = await deps.apply({
      organizationId: ctx.organizationId,
      mutationKind: spec.kind,
      payload: outcome.payload as Record<string, unknown>,
      proposedByStaffId: ctx.staffId,
      aiChatSessionId: sessionId,
    });
    if (!filed.ok) return fail(filed.error);
    return outcome.preview(filed.mutationId);
  };

  const decide = async (ctx: AssistantToolCtx, decision: 'approve' | 'reject') => {
    if (!sessionId) return fail('No conversation to confirm in.');
    const pending = (await deps.query(ctx.organizationId, pendingSql(spec.kind), [ctx.organizationId, sessionId])).rows[0];
    if (!pending) return fail('There is nothing pending to confirm in this conversation. Propose the change first.');
    const mutationId = Number(pending.id);
    if (new Date(String(pending.created_at)).getTime() >= turnStartedAt.getTime()) {
      return fail('The user has not confirmed yet — this was proposed in this same turn. Ask them to confirm and wait for their reply. Nothing was changed.');
    }
    const result = await deps.review({
      organizationId: ctx.organizationId,
      mutationId,
      decision,
      actorStaffId: ctx.staffId,
      actorPermissions: ctx.permissions,
      kinds: [spec.kind],
    });
    if (!result.ok) return fail(result.error);
    const payload = pending.payload as P;
    if (decision === 'reject') {
      return { ok: true as const, status: 'cancelled', mutationId, summary: `Cancelled — nothing was changed (did not ${spec.pendingPhrase(payload)}).` };
    }
    return spec.settled(ctx, payload, mutationId, result.targetRef, deps);
  };

  return {
    name: spec.name,
    description: spec.description,
    permission: spec.permission,
    inputSchema,
    run: async (input, ctx) => {
      if (ctx.accessMode === 'ask') return fail(askOnlyRefusal(spec.name));
      const { action, ...rest } = input as { action: 'propose' | 'confirm' | 'cancel' };
      if (action === 'propose') return propose(ctx, rest as z.infer<S>);
      return decide(ctx, action === 'confirm' ? 'approve' : 'reject');
    },
  };
}
