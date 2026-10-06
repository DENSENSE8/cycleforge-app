/**
 * PO ↔ outbound order link from chat — "this PO is for order 1125".
 *
 *  - `resolvePoOrderRefs`: the order refs the operator said, each resolved
 *    through the find_records door identity-first (`resolveOrderTokens`) to
 *    exactly one order, or left unresolved with the reason.
 *  - `link_po_to_order` (YELLOW, confirm-before-write): link or unlink an
 *    EXISTING PO — named by PO number or tracking, else the PO this
 *    conversation last linked — to outbound orders. Files a
 *    `receiving.link_order` agent mutation (`po-order-link.ts`) the operator's
 *    next-turn yes applies; revertable.
 */

import { z } from 'zod';
import type { OrgId } from '@/lib/tenancy/constants';
import { brandReportEnvelope } from '@/lib/assistant/tool-artifact';
import type { ArtifactRecord } from '@/lib/assistant/ui-artifacts';
import {
  PO_ORDER_LINK_KIND,
  orderLinkTargets,
  readPoOrderLinks,
  resolvePoAnchor,
  type LinkedOrder,
  type PoOrderLinkPayload,
  type ResolvedPo,
} from '@/lib/orders/po-order-link';
import { invalidateAllOrdersApiCaches } from '@/lib/orders/invalidation';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { searchHitHref } from '@/lib/search/search-hit';
import { extractCanonicalTracking } from '@/lib/tracking-format';
import {
  buildConfirmableWriteTool,
  realConfirmableDeps,
  type ConfirmableWriteDeps,
  type ConfirmableWriteSpec,
} from './confirmable-write';
import { resolveOrderTokens } from './order-status-tools';
import type { AssistantToolCtx } from './types';

/** An order ref as said, resolved to one order or left unresolved with the reason. */
export interface PoOrderRef {
  /** As the operator said it. */
  ref: string;
  /** The resolved order number (`orders.order_id`); '' when unresolved. */
  orderNumber: string;
  /** The order's first line row (`orders.id`); `null` = unresolved. */
  orderId: number | null;
  channel: string;
  title: string;
  /** Why it did not resolve ("no order matches", "matches 2 orders"). */
  why: string;
}

export const LINK_PO_TO_ORDER_TOOL = 'link_po_to_order';

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

// ─── the message → PO number, order refs, unlink intent ──────────────────────

const ORDER_REF = String.raw`#?[A-Za-z0-9][A-Za-z0-9-]{1,40}`;
/** "for order 1125", "is for orders 1125 and 1136", "linked to customer order #1125", "For order: 1125". */
const FOR_ORDER = new RegExp(
  String.raw`\b(?:for|fulfil+(?:s|ing)?|fill(?:s|ing)?|link(?:ed)?\s+(?:it\s+)?to|against|goes\s+(?:with|to))\s+(?:(?:our|customer'?s?|sales|outbound)\s+)*orders?\s*(?:#|no\.?|number|num)?\s*[:#=]?\s*(${ORDER_REF}(?:\s*(?:,|and|&|\/)\s*${ORDER_REF})*)`,
  'gi',
);
/** An order named on its own: "customer order #1125". Never "purchase order". */
const NOTE_ORDER = new RegExp(String.raw`(?<!purchase\s)\borders?\s*(?:#|no\.?|number|num)?\s*[:#=]?\s*(${ORDER_REF})`, 'gi');
const ORDER_LIST = new RegExp(String.raw`(?<!purchase\s)\borders?\s*(?:#|no\.?|number|num)?\s*[:#=]?\s*${ORDER_REF}((?:\s*(?:,|and|&|\/)\s*${ORDER_REF})+)`, 'gi');
const NO_ORDER = /\b(?:not\s+for\s+(?:an?\s+|any\s+)?orders?|no\s+(?:linked\s+)?orders?|(?:remove|clear|drop)\s+(?:the\s+)?orders?(?:\s+link)?|unlink\s+(?:the\s+)?orders?)\b/i;
const PO_NUMBER = /\b(?:p\.?\s?o\.?|purchase\s+order)(?:\s*(?:#|no\.?|number|num))?\s*(?:is\s+|[:#=]\s*|\s)\s*#?\s*([A-Za-z0-9][A-Za-z0-9\-_/]{1,40})/i;

const withoutUrls = (text: string) => text.replace(/\bhttps?:\/\/[^\s<>"')]+|\bwww\.[^\s<>"')]+/gi, ' ');

/** The PO number the message names ("PO 55123", "purchase order #A-7"), or null. */
function saidPoNumber(text: string): string | null {
  const po = withoutUrls(text).match(PO_NUMBER);
  return po && /\d/.test(po[1]) ? po[1].toUpperCase() : null;
}

/** Every order # a message names ("link PO 7 to order 1125", "orders 1125 and 1136"). */
function mentionedOrderRefs(text: string, poNumber: string | null): string[] {
  const po = poNumber?.toUpperCase() ?? null;
  const out: string[] = [];
  const add = (token: string) => {
    const ref = token.replace(/^#/, '').trim();
    if (!/\d/.test(ref) || ref.length < 2 || ref.toUpperCase() === po) return;
    if (!out.some((r) => r.toUpperCase() === ref.toUpperCase())) out.push(ref);
  };
  const split = (list: string) => list.split(/\s*(?:,|\band\b|&|\/)\s*/i).forEach(add);
  for (const m of text.matchAll(FOR_ORDER)) split(m[1]);
  for (const m of text.matchAll(NOTE_ORDER)) add(m[1]);
  for (const m of text.matchAll(ORDER_LIST)) split(m[1]);
  return out.slice(0, 10);
}

// ─── order refs → orders (identity-first) ────────────────────────────────────

/** Each ref on its own, so a miss names the ref it belongs to. */
export async function resolvePoOrderRefs(
  ctx: Pick<AssistantToolCtx, 'organizationId' | 'staffId'>,
  refs: readonly string[],
  deps: Pick<ConfirmableWriteDeps, 'find' | 'query'> = realConfirmableDeps,
): Promise<PoOrderRef[]> {
  const out: PoOrderRef[] = [];
  for (const ref of refs.slice(0, 10)) {
    const { lines, unmatched } = await resolveOrderTokens(ctx, [ref], deps, false);
    const first = lines[0];
    if (!first) {
      out.push({ ref, orderNumber: '', orderId: null, channel: '', title: '', why: unmatched[0]?.why ?? 'no order matches' });
      continue;
    }
    const [target] = await orderLinkTargets(deps.query, ctx.organizationId, [first.orderNumber]);
    out.push({
      ref,
      orderNumber: first.orderNumber,
      orderId: target?.localOrderId ?? Math.min(...lines.map((l) => l.id)),
      channel: target?.channel ?? '',
      title: first.title.slice(0, 300),
      why: '',
    });
  }
  return out;
}

// ─── link_po_to_order ────────────────────────────────────────────────────────

/** The PO this conversation last linked (its record card). */
const THREAD_PO_SQL = `SELECT (SELECT x->>'value' FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(a.value->'artifact'->'identity'->'ids') = 'array'
                 THEN a.value->'artifact'->'identity'->'ids' ELSE '[]'::jsonb END) x
           WHERE x->>'label' = 'PO' LIMIT 1) AS po_number
  FROM ai_chat_messages m
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(m.analysis->'artifacts') = 'array' THEN m.analysis->'artifacts' ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS a(value, ord)
 WHERE m.organization_id = $1 AND m.session_id = $2 AND m.role = 'assistant' AND m.superseded_at IS NULL
   AND a.value->>'producedBy' = '${LINK_PO_TO_ORDER_TOOL}'
 ORDER BY m.id DESC, a.ord DESC
 LIMIT 1`;

const fields = z.object({
  po: z
    .string()
    .trim()
    .max(120)
    .optional()
    .describe('The PO number (or a tracking number on it). Omit for the PO linked last in this conversation.'),
  orders: z
    .array(z.string().trim().min(1).max(120))
    .max(10)
    .optional()
    .describe('The outbound order #s as the user said them. Omit to read them from the message.'),
  unlink: z.boolean().optional().describe('true to REMOVE the link (unlink / remove / detach / not for that order).'),
});

const orderWord = (orders: readonly LinkedOrder[]) =>
  `order${orders.length === 1 ? '' : 's'} ${orders.map((o) => o.orderNumber).join(', ')}`;

function linkRecord(title: string, po: ResolvedPo, orders: readonly LinkedOrder[], extra: ArtifactRecord['fields']): ArtifactRecord {
  const cartonHref = po.receivingId != null ? searchHitHref('RECEIVING', po.receivingId) : undefined;
  return {
    kind: 'record',
    title: title.slice(0, 120),
    path: cartonHref ?? '/receiving',
    fields: [
      { label: 'PO', value: po.poNumber, ...(cartonHref ? { href: cartonHref } : {}) },
      ...(po.vendor ? [{ label: 'Vendor', value: po.vendor }] : []),
      ...orders.slice(0, 10).map((o) => ({
        label: 'For order',
        value: `${o.orderNumber}${o.channel ? ` · ${o.channel}` : ''}`.slice(0, 300),
        ...(o.localOrderId != null ? { href: searchHitHref('ORDER', o.localOrderId) } : {}),
      })),
      ...extra,
    ].slice(0, 20),
    identity: {
      title: `PO ${po.poNumber}`.slice(0, 120),
      ...(po.vendor ? { subtitle: po.vendor.slice(0, 160) } : {}),
      ids: [{ label: 'PO', value: po.poNumber.slice(0, 80) }],
      ...(cartonHref ? { href: cartonHref } : {}),
    },
  };
}

async function threadPo(deps: ConfirmableWriteDeps, orgId: OrgId, sessionId: string | null | undefined): Promise<string | null> {
  if (!sessionId) return null;
  const row = (await deps.query(orgId, THREAD_PO_SQL, [orgId, sessionId])).rows[0];
  const poNumber = typeof row?.po_number === 'string' ? row.po_number.trim() : '';
  return poNumber || null;
}

export const linkPoToOrderSpec: ConfirmableWriteSpec<typeof fields, PoOrderLinkPayload> = {
  name: LINK_PO_TO_ORDER_TOOL,
  kind: PO_ORDER_LINK_KIND,
  permission: 'receiving.scan_po',
  description:
    'Link an ALREADY-IMPORTED purchase order to the outbound order(s) it was bought for ("PO 55123 is for order 1125"), or unlink it (unlink: true). po = the PO number or its tracking (omit for the PO linked last in this conversation); orders are read from the message. Two steps: action "propose" shows the change and returns needs_confirmation — ASK the user to confirm and stop. On their next message, "confirm" (yes) or "cancel" (no) with no other arguments.',
  fields,
  propose: async (ctx, input, deps) => {
    const message = String(ctx.userMessage ?? '');
    const saidPo = saidPoNumber(message);
    const poRef = input.po?.trim() || saidPo || (await threadPo(deps, ctx.organizationId, ctx.sessionId));
    if (!poRef) return { ok: false, error: 'Which purchase order? Ask for the PO number. Nothing was changed.' };
    const po = await resolvePoAnchor(deps.query, ctx.organizationId, poRef, extractCanonicalTracking(poRef));
    if (!po) {
      return {
        ok: false,
        error: `No imported purchase order matches ${poRef}. Ask the user for the PO number or its tracking. Nothing was changed.`,
      };
    }
    const refs = input.orders?.length ? input.orders : mentionedOrderRefs(message, po.poNumber);
    const existing = await readPoOrderLinks(deps.query, ctx.organizationId, po);
    const unlink = input.unlink === true || (NO_ORDER.test(withoutUrls(message)) && !input.orders?.length);

    let orders: LinkedOrder[];
    let unmatched: PoOrderRef[] = [];
    if (unlink) {
      const wanted = refs.map(norm);
      orders = refs.length ? existing.filter((e) => wanted.includes(norm(e.orderNumber))) : existing;
      if (orders.length === 0) {
        const summary = existing.length
          ? `PO ${po.poNumber} is not linked to ${refs.join(', ')} — it is linked to ${orderWord(existing)}. Nothing was changed.`
          : `PO ${po.poNumber} is not linked to any order. Nothing was changed.`;
        return { ok: true, answer: { ok: true, status: 'no_change', summary, answer: summary } };
      }
    } else {
      if (refs.length === 0) return { ok: false, error: `Which order is PO ${po.poNumber} for? Ask for the order number. Nothing was changed.` };
      const resolved = await resolvePoOrderRefs(ctx, refs, deps);
      unmatched = resolved.filter((r) => r.orderId == null);
      const have = existing.map((e) => norm(e.orderNumber));
      orders = resolved
        .filter((r) => r.orderId != null && !have.includes(norm(r.orderNumber)))
        .map((r) => ({ orderNumber: r.orderNumber, localOrderId: r.orderId, channel: r.channel || null }));
      if (orders.length === 0) {
        const already = resolved.filter((r) => r.orderId != null).map((r) => r.orderNumber);
        const summary = [
          already.length ? `PO ${po.poNumber} is already linked to order${already.length === 1 ? '' : 's'} ${already.join(', ')}.` : '',
          unmatched.length ? `Couldn't match ${unmatched.map((u) => `${u.ref} (${u.why})`).join(', ')} — ask which order the user means.` : '',
          'Nothing was changed.',
        ]
          .filter(Boolean)
          .join(' ');
        return { ok: true, answer: { ok: true, status: 'no_change', summary, answer: summary } };
      }
    }

    const payload: PoOrderLinkPayload = {
      op: unlink ? 'unlink' : 'link',
      po: { poNumber: po.poNumber, inboundOrderId: po.inboundOrderId, receivingId: po.receivingId },
      orders,
      staffId: ctx.staffId,
    };
    const question = unlink
      ? `Unlink PO ${po.poNumber} from ${orderWord(orders)}? Reply yes or no.`
      : `Link PO ${po.poNumber}${po.vendor ? ` from ${po.vendor}` : ''} to ${orderWord(orders)}? Reply yes or no.`;
    const couldnt = unmatched.length ? ` Couldn't match ${unmatched.map((u) => `${u.ref} (${u.why})`).join(', ')} — not linked.` : '';
    return {
      ok: true,
      payload,
      preview: (mutationId) =>
        brandReportEnvelope(
          {
            artifact: linkRecord(`${unlink ? 'Unlink' : 'Link'} PO ${po.poNumber} → ${orderWord(orders)}`, po, orders, [
              { label: 'Change', value: `#${mutationId} · waiting for yes` },
            ]),
            summary: `NOT changed yet.${couldnt} Reply with exactly this question and stop: "${question}" — call ${LINK_PO_TO_ORDER_TOOL} with action "confirm" only after the user replies yes ("cancel" if they decline).`,
          },
          LINK_PO_TO_ORDER_TOOL,
        ),
    };
  },
  settled: async (ctx, payload, mutationId, _targetRef, deps) => {
    const linked = await readPoOrderLinks(deps.query, ctx.organizationId, payload.po);
    const vendorRow = payload.po.inboundOrderId != null
      ? (await deps.query(ctx.organizationId, `SELECT vendor_name FROM inbound_order WHERE id = $2 AND organization_id = $1`, [ctx.organizationId, payload.po.inboundOrderId])).rows[0]
      : undefined;
    const po: ResolvedPo = { ...payload.po, vendor: typeof vendorRow?.vendor_name === 'string' ? vendorRow.vendor_name : null };
    try {
      await Promise.all([invalidateReceivingViews(ctx.organizationId), invalidateAllOrdersApiCaches([], ctx.organizationId)]);
    } catch (err) {
      console.warn('[link_po_to_order] view invalidation failed (link saved):', err);
    }
    const verb = payload.op === 'link' ? 'Linked' : 'Unlinked';
    const summary =
      payload.op === 'link'
        ? `Linked PO ${po.poNumber} to ${orderWord(payload.orders)} — the order's record and the PO's carton now show each other.`
        : `Unlinked PO ${po.poNumber} from ${orderWord(payload.orders)}.${linked.length ? ` Still linked to ${orderWord(linked)}.` : ''}`;
    return brandReportEnvelope(
      {
        artifact: linkRecord(`${verb} PO ${po.poNumber} · ${orderWord(payload.orders)}`, po, linked, [
          { label: 'Change', value: `#${mutationId} · revertable` },
        ]),
        summary,
        answer: summary,
      },
      LINK_PO_TO_ORDER_TOOL,
    );
  },
  pendingPhrase: (payload) =>
    `${payload.op} PO ${payload.po.poNumber} ${payload.op === 'link' ? 'to' : 'from'} ${orderWord(payload.orders)}`,
};

export function buildLinkPoToOrderTool(sessionId: string | null, turnStartedAt: Date, deps?: ConfirmableWriteDeps) {
  return buildConfirmableWriteTool(linkPoToOrderSpec, sessionId, turnStartedAt, deps);
}
