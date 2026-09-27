/**
 * link_manual_to_sku — pair a manual (usually a file the operator just dropped
 * on the composer) with a catalog SKU, so it resolves on that SKU's orders and
 * prints with their paperwork (`order-manuals.ts` resolution).
 *
 * YELLOW: a write that needs the operator's say-so, and the say-so is
 * enforced here, not left to the model's manners.
 *
 *   1. `propose` validates the manual and the SKU (org-scoped reads) and files
 *      a `product_manual.link_sku` agent mutation in `proposed` state — the
 *      existing review queue, audit and ops-event path.
 *   2. The operator answers on the NEXT turn. `confirm` approves this
 *      session's pending proposal through `reviewAgentMutation` (the kind's
 *      own permission, applied in one transaction, audited, revertable);
 *      `cancel` rejects it. A proposal filed in the CURRENT turn cannot be
 *      confirmed: the model cannot ask and answer its own question.
 *
 * Ask-only turns never reach this (dispatch refuses it); `run` refuses again
 * so the tool is safe wherever it is mounted.
 */

import { z } from 'zod';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { askOnlyRefusal } from '@/lib/assistant/access-mode';
import { applyAgentMutation, reviewAgentMutation } from '@/lib/assistant/mutations/apply-agent-mutation';
import { brandReportEnvelope } from '@/lib/assistant/tool-artifact';
import { settleManualRepair } from '@/lib/manuals/order-manuals';
import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';
import type { AssistantToolCtx, AssistantToolDef } from './types';

const KIND = 'product_manual.link_sku' as const;
export const LINK_MANUAL_TOOL_NAME = 'link_manual_to_sku';

type Rows = Array<Record<string, unknown>>;

export interface ManualLinkDeps {
  query: (orgId: OrgId, text: string, params: ReadonlyArray<unknown>) => Promise<{ rows: Rows }>;
  apply: typeof applyAgentMutation;
  review: typeof reviewAgentMutation;
  settle: typeof settleManualRepair;
}

const realDeps: ManualLinkDeps = {
  query: async (orgId, text, params) => ({ rows: (await tenantQuery(orgId, text, [...params])).rows as Rows }),
  apply: applyAgentMutation,
  review: reviewAgentMutation,
  settle: settleManualRepair,
};

const inputSchema = z.object({
  action: z
    .enum(['propose', 'confirm', 'cancel'])
    .default('propose')
    .describe('propose (default) files the link for confirmation; confirm / cancel answer the pending one on a LATER turn.'),
  manualId: z.number().int().positive().optional().describe('The manual id — an attached file\'s "manual id".'),
  sku: z.string().trim().min(1).max(100).optional().describe('The catalog SKU exactly as typed, e.g. 00066-P-2.'),
});

const MANUAL_SQL = `SELECT id, display_name, file_name, sku, sku_catalog_id, item_number, order_id
  FROM product_manuals
 WHERE id = $1 AND organization_id = $2 AND is_active = TRUE`;

/** Exact catalog SKU (punctuation-insensitive, the paperwork SKU key) with its identity title. */
const SKU_SQL = `SELECT sc.id, sc.sku, i.name AS zoho_item_title, sc.product_title AS catalog_product_title
  FROM sku_catalog sc
  LEFT JOIN items i ON i.zoho_item_id = sc.provider_item_id
                   AND i.organization_id = sc.organization_id AND i.status = 'active'
 WHERE sc.organization_id = $1
   AND regexp_replace(UPPER(TRIM(sc.sku)), '[^A-Z0-9]', '', 'g') = regexp_replace(UPPER(TRIM($2::text)), '[^A-Z0-9]', '', 'g')
 ORDER BY sc.id
 LIMIT 1`;

const PENDING_SQL = `SELECT id, payload, created_at
  FROM agent_mutations
 WHERE organization_id = $1 AND ai_chat_session_id = $2
   AND mutation_kind = '${KIND}' AND status = 'proposed'
 ORDER BY id DESC
 LIMIT 1`;

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

function manualName(row: Record<string, unknown>, id: number): string {
  return text(row.display_name) || text(row.file_name) || `Manual ${id}`;
}

/**
 * The prompt line for a link awaiting the operator's answer in this thread —
 * the transcript the model re-reads holds only prose, so without it a "yes"
 * on the next turn has nothing to attach to.
 */
export async function pendingManualLinkNote(
  orgId: OrgId,
  sessionId: string,
  query: ManualLinkDeps['query'] = realDeps.query,
): Promise<string | null> {
  const pending = (await query(orgId, PENDING_SQL, [orgId, sessionId])).rows[0];
  if (!pending) return null;
  const payload = (pending.payload ?? {}) as { manualId?: number; sku?: string };
  return `PENDING CONFIRMATION: you proposed linking manual id ${Number(payload.manualId)} to SKU ${text(payload.sku)} and asked the user to confirm. If this message says yes / confirm / go ahead, call ${LINK_MANUAL_TOOL_NAME} with {"action":"confirm"} (no other arguments — the link is remembered). If it says no / cancel, call it with {"action":"cancel"}.`;
}

/**
 * A bare yes / no answering a pending proposal (a manual link, a phone order) — the operator's reply to the
 * server's own question. The route settles it directly through this tool
 * (same dispatch gate, same review path) instead of hoping a small model maps
 * "yes" onto a call; anything longer or mixed goes to the model as usual.
 */
export function confirmationReply(message: string): 'confirm' | 'cancel' | null {
  const t = message.trim().toLowerCase().replace(/[.!\s]+$/, '');
  if (!t || t.length > 60) return null;
  if (/^(no|nope|n|cancel|don'?t|do not|stop|never ?mind)\b/.test(t)) return 'cancel';
  if (/\b(no|not|don'?t|cancel|wait)\b/.test(t)) return null;
  if (/^(yes|yep|yeah|yup|y|ok|okay|sure|confirm(ed)?|go ahead|do it|link it|create it|please do)\b/.test(t)) return 'confirm';
  return null;
}

export function buildManualLinkTool(
  sessionId: string | null,
  /** When this turn began — a proposal at or after it is unconfirmable this turn. */
  turnStartedAt: Date,
  deps: ManualLinkDeps = realDeps,
): AssistantToolDef<typeof inputSchema, unknown> {
  const fail = (error: string) => ({ ok: false as const, error });

  const propose = async (ctx: AssistantToolCtx, manualId: number | undefined, sku: string | undefined) => {
    if (!manualId || !sku) return fail('propose needs manualId and sku.');
    const [manual, catalog] = await Promise.all([
      deps.query(ctx.organizationId, MANUAL_SQL, [manualId, ctx.organizationId]),
      deps.query(ctx.organizationId, SKU_SQL, [ctx.organizationId, sku]),
    ]);
    const m = manual.rows[0];
    if (!m) return fail(`Manual ${manualId} was not found in this organization. Nothing was changed.`);
    const c = catalog.rows[0];
    if (!c) return fail(`SKU ${sku} is not in the catalog. Nothing was changed — ask the user to check the SKU.`);
    const catalogSku = text(c.sku);
    const title = resolveSkuIdentityTitle(c as never) || catalogSku;
    const name = manualName(m, manualId);
    if (Number(m.sku_catalog_id) === Number(c.id)) {
      return { ok: true as const, status: 'already_linked', manualId, sku: catalogSku, summary: `"${name}" is already linked to SKU ${catalogSku}. Nothing to change.` };
    }
    const filed = await deps.apply({
      organizationId: ctx.organizationId,
      mutationKind: KIND,
      payload: { manualId, sku: catalogSku },
      proposedByStaffId: ctx.staffId,
      aiChatSessionId: sessionId,
    });
    if (!filed.ok) return fail(filed.error);
    return {
      ok: true as const,
      status: 'needs_confirmation',
      mutationId: filed.mutationId,
      manual: name,
      sku: catalogSku,
      product: title,
      summary: `Ready to link "${name}" to SKU ${catalogSku} (${title}) so it prints with every order of that SKU. NOT linked yet: ask the user to confirm, and call this tool with action "confirm" only after they reply yes (or "cancel" if they decline).`,
    };
  };

  const decide = async (ctx: AssistantToolCtx, decision: 'approve' | 'reject') => {
    if (!sessionId) return fail('No conversation to confirm in.');
    const pending = (await deps.query(ctx.organizationId, PENDING_SQL, [ctx.organizationId, sessionId])).rows[0];
    if (!pending) return fail('There is no pending manual link in this conversation. Propose one first.');
    const mutationId = Number(pending.id);
    if (new Date(String(pending.created_at)).getTime() >= turnStartedAt.getTime()) {
      return fail('The user has not confirmed yet — this link was proposed in this same turn. Ask them to confirm and wait for their reply. Nothing was changed.');
    }
    const result = await deps.review({
      organizationId: ctx.organizationId,
      mutationId,
      decision,
      actorStaffId: ctx.staffId,
      actorPermissions: ctx.permissions,
      kinds: [KIND],
    });
    if (!result.ok) return fail(result.error);
    const payload = (pending.payload ?? {}) as { manualId?: number; sku?: string };
    const manualId = Number(payload.manualId);
    const sku = text(payload.sku);
    if (decision === 'reject') {
      return { ok: true as const, status: 'cancelled', mutationId, summary: `Cancelled — manual ${manualId} was not linked to SKU ${sku}.` };
    }

    const [manual, catalog] = await Promise.all([
      deps.query(ctx.organizationId, MANUAL_SQL, [manualId, ctx.organizationId]),
      deps.query(ctx.organizationId, SKU_SQL, [ctx.organizationId, sku]),
    ]);
    const m = manual.rows[0] ?? {};
    const c = catalog.rows[0] ?? {};
    await deps.settle(ctx.organizationId, manualId, null, c.id != null ? Number(c.id) : null);
    const name = manualName(m, manualId);
    const title = resolveSkuIdentityTitle(c as never) || sku;
    return brandReportEnvelope(
      {
        artifact: {
          kind: 'record',
          title: `Manual linked to SKU ${sku}`,
          path: `/products/sku/${encodeURIComponent(sku)}`,
          fields: [
            { label: 'Manual', value: name },
            { label: 'SKU', value: sku },
            { label: 'Product', value: title },
            { label: 'Prints with', value: `Every order of SKU ${sku} (pack paperwork)` },
            { label: 'Change', value: `#${mutationId} · revertable` },
          ],
        },
        summary: `Linked "${name}" to SKU ${sku} (change #${mutationId}). It now prints with that SKU's orders.`,
      },
      LINK_MANUAL_TOOL_NAME,
    );
  };

  return {
    name: LINK_MANUAL_TOOL_NAME,
    description:
      'Link a product manual (e.g. a file the user attached — its "manual id") to a catalog SKU so it shows with that SKU and prints with its orders. Two steps: action "propose" with manualId + sku files it and returns needs_confirmation — then ASK the user to confirm and stop. On their next message, "confirm" (yes) or "cancel" (no) with no other arguments. Never confirm in the same turn you proposed.',
    permission: 'product_manuals.manage',
    inputSchema,
    run: async (input, ctx) => {
      if (ctx.accessMode === 'ask') return fail(askOnlyRefusal(LINK_MANUAL_TOOL_NAME));
      if (input.action === 'propose') return propose(ctx, input.manualId, input.sku);
      return decide(ctx, input.action === 'confirm' ? 'approve' : 'reject');
    },
  };
}
