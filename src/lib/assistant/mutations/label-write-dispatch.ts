/**
 * Apply paths for the chat's shipping-label writes — reached only through the
 * operator's confirmation of a `buy_label` / `void_label` proposal. The payload
 * was built server-side from a fresh ShipStation quote / the purchase ledger;
 * the purchase and the void run on their own connections (the carrier call is
 * external), idempotent under the payload's key, so the review transaction
 * only records the decision.
 */

import type { z } from 'zod';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  buyChatLabel,
  chatLabelBuyPayload,
  chatLabelVoidPayload,
  voidChatLabel,
} from '@/lib/shipping/order-label-chat';

export const LABEL_WRITE_KINDS = ['shipping.buy_label', 'shipping.void_label'] as const;
export type LabelWriteKind = (typeof LABEL_WRITE_KINDS)[number];

type DispatchResult =
  | { ok: true; inverse: null; targetRef: string | null }
  | { ok: false; status: 400 | 404 | 409; error: string };

function invalid(kind: LabelWriteKind, error: z.ZodError): DispatchResult {
  const detail = error.issues.map((i) => `${i.path.map(String).join('.') || '(payload)'}: ${i.message}`).join('; ');
  return { ok: false, status: 400, error: `invalid ${kind} payload — ${detail}` };
}

export async function dispatchLabelWrite(
  orgId: OrgId,
  kind: LabelWriteKind,
  payload: Record<string, unknown>,
): Promise<DispatchResult> {
  let orderId: number;
  if (kind === 'shipping.buy_label') {
    const p = chatLabelBuyPayload.safeParse(payload);
    if (!p.success) return invalid(kind, p.error);
    const result = await buyChatLabel(orgId, p.data);
    if (!result.ok) return result;
    orderId = p.data.orderId;
  } else {
    const p = chatLabelVoidPayload.safeParse(payload);
    if (!p.success) return invalid(kind, p.error);
    const result = await voidChatLabel(orgId, p.data);
    if (!result.ok) return result;
    orderId = p.data.orderId;
  }
  // A bought label is undone by void_label (its own confirmation), never by a revert.
  return { ok: true, inverse: null, targetRef: String(orderId) };
}
