/**
 * Assistant WRITE tools (universal-feed plan §3 / Phase 3).
 * per-automation Auto-approve setting does (operator ruling 2026-09-26:
 */

import { z } from 'zod';
import { applyAgentMutation, revertAgentMutation } from '@/lib/assistant/mutations/apply-agent-mutation';
import {
  MUTATION_KINDS,
  MUTATION_KIND_LIST,
  isMutationKind,
  mutationTrustClass,
} from '@/lib/surfaces/registry';
import type { AssistantToolCtx, AssistantToolDef } from './types';

export interface AssistantWriteDeps {
  apply: typeof applyAgentMutation;
  revert: typeof revertAgentMutation;
}

const realWriteDeps: AssistantWriteDeps = { apply: applyAgentMutation, revert: revertAgentMutation };

/** The session id is threaded per-request so mutations link to the chat. */
export function buildWriteTools(
  sessionId: string | null,
  deps: AssistantWriteDeps = realWriteDeps,
  /**
   * The actor's permissions, used ONLY to narrow the advertised kind list in the tool description.
   * chokepoint) — a description is a hint to the model, never a security
   */
  permissions?: ReadonlySet<string>,
) {
  const allowedKinds = permissions
    ? MUTATION_KIND_LIST.filter((k) => permissions.has(MUTATION_KINDS[k].permission))
    : MUTATION_KIND_LIST;
  const proposeMutation: AssistantToolDef<
    z.ZodObject<{ mutationKind: z.ZodString; payload: z.ZodRecord<z.ZodString, z.ZodUnknown> }>,
    unknown
  > = {
    name: 'propose_mutation',
    description:
      'Make ONE change to the operation, described as a mutation_kind + payload. The system decides how it lands by trust class: view-layer changes (dismiss/restore a rail item, set a feed item\'s state, record a signal, tune a node surface) apply immediately; workflow DRAFT edits (add/remove/wire/config a node in a draft graph) apply to the draft you can preview and revert; changes to masters (create staff, add a reason code, change a setting) are QUEUED FOR REVIEW — a human applies them. Tell the user which outcome happened using the returned status. ' +
      `Valid mutation_kind values you may use: ${allowedKinds.join(', ') || '(none — you lack permission for every change kind)'}. ` +
      'workflow_draft.* kinds need { definitionId } in the payload (a DRAFT definition — create/switch to one first via the Studio if none exists).',
    // The FLOOR to see the tool at all.
    permission: 'assistant.chat',
    inputSchema: z.object({
      mutationKind: z.string().max(64),
      payload: z.record(z.string(), z.unknown()),
    }),
    run: async (input, ctx: AssistantToolCtx) => {
      if (!isMutationKind(input.mutationKind)) {
        return {
          ok: false as const,
          error: `unknown mutation_kind "${input.mutationKind}"`,
          httpStatus: 400 as const,
        };
      }
      const need = MUTATION_KINDS[input.mutationKind].permission;
      if (!ctx.permissions.has(need)) {
        // A denial the model can relay honestly — not a silent no-op, and not
        // a generic failure that reads like the system is broken.
        return {
          ok: false as const,
          error: `You do not have permission to make this change (${MUTATION_KINDS[input.mutationKind].label} requires ${need}). Tell the user which permission is missing.`,
          httpStatus: 403 as const,
        };
      }
      const result = await deps.apply({
        organizationId: ctx.organizationId,
        mutationKind: input.mutationKind,
        payload: input.payload,
        proposedByStaffId: ctx.staffId,
        aiChatSessionId: sessionId,
      });
      if (!result.ok) return { ok: false as const, error: result.error, httpStatus: result.status };
      return {
        ok: true as const,
        status: result.status, // 'applied' | 'proposed'
        mutationId: result.mutationId,
        trust: result.trust,
        targetRef: result.targetRef,
        explanation:
          result.status === 'applied'
            ? mutationTrustClass(input.mutationKind as never) === 'draft_scoped'
              ? 'Applied to your draft — preview it in the Studio; you can revert it.'
              : 'Applied now.'
            : 'Queued for review — a human needs to apply this change.',
      };
    },
  };

  const revertMutation: AssistantToolDef<z.ZodObject<{ mutationId: z.ZodNumber }>, unknown> = {
    name: 'revert_mutation',
    description:
      'Undo a previously applied, revertable mutation by its id (from propose_mutation or get_mutation_history). Draft graph edits and view-layer changes are revertable; append-only signals and review-gated proposals are not.',
    // Floor only; the per-kind check happens inside revertAgentMutation, which
    // is where the reverted kind becomes known. Anyone able to APPLY a change
    // must be able to undo it.
    permission: 'assistant.chat',
    inputSchema: z.object({ mutationId: z.number().int().positive() }),
    run: async (input, ctx: AssistantToolCtx) => {
      const result = await deps.revert(
        input.mutationId,
        ctx.organizationId,
        ctx.staffId,
        undefined,
        ctx.permissions,
      );
      return result.ok
        ? { ok: true as const, reverted: true, mutationId: input.mutationId }
        : { ok: false as const, error: result.error, httpStatus: result.status };
    },
  };

  return [proposeMutation, revertMutation] as ReadonlyArray<AssistantToolDef<z.ZodTypeAny, unknown>>;
}
