/**
 * request_payment — take payment for an order through Square, from the chat.
 *
 * YELLOW: a write (it creates a Square payment link or invoice), so it is
 * never in the GREEN read registry and Ask only refuses it — at dispatch and
 * again here. It moves no money: the customer (or staff keying for them) pays
 * on Square's hosted page.
 *
 * The model supplies only the order number and the method. The amount comes
 * from the order's rows (`computeOrderCharge`), and the tool returns a branded
 * `payment` artifact that carries neither money nor a URL — the right-rail
 * panel reads both from the server. The model gets a one-line summary.
 */

import { z } from 'zod';
import { askOnlyRefusal } from '@/lib/assistant/access-mode';
import { brandReportEnvelope } from '@/lib/assistant/tool-artifact';
import type { ArtifactPayment } from '@/lib/assistant/ui-artifacts';
import type { requestOrderPayment } from '@/lib/order-payments/service';
import type { OrgId } from '@/lib/tenancy/constants';
import type { AssistantToolDef } from './types';

export const REQUEST_PAYMENT_TOOL_NAME = 'request_payment';

type RequestFn = typeof requestOrderPayment;

export interface RequestPaymentDeps {
  request: RequestFn;
}

// The service is `server-only` (throws outside the Next server) — a static import would make
// write-tools unimportable from node:test, so the real dependency loads lazily.
const realDeps: RequestPaymentDeps = {
  request: async (...args) => (await import('@/lib/order-payments/service')).requestOrderPayment(...args),
};

const inputSchema = z.object({
  orderNumber: z.string().trim().min(1).max(120).describe('The order number exactly as the user gave it, e.g. PH-000123.'),
  method: z
    .enum(['payment_link', 'invoice'])
    .default('payment_link')
    .describe('payment_link (default): a Square checkout link to text/email/show as a QR, or to open for keying the card on Square. invoice: a Square invoice addressed to the order\'s customer.'),
});

const METHOD = { payment_link: 'square_link', invoice: 'square_invoice' } as const;
const METHOD_FACE = { square_link: 'payment link', square_invoice: 'invoice', square_terminal: 'Terminal checkout' } as const;

export function buildRequestPaymentTool(
  deps: RequestPaymentDeps = realDeps,
): AssistantToolDef<typeof inputSchema, unknown> {
  return {
    name: REQUEST_PAYMENT_TOOL_NAME,
    description:
      'Take payment for an order through Square: "take payment for order PH-000123", "send a payment link for …", "invoice order …". Creates a Square payment link (default) or a Square invoice for the order\'s own total and opens the payment panel beside the chat, where staff copy the link, show a QR code or open Square\'s secure checkout, and watch it turn paid. Pass only the order number and method — never an amount, never card details. Do not call render_artifact for it.',
    permission: 'orders.create',
    inputSchema,
    run: async (input, ctx) => {
      if (ctx.accessMode === 'ask') return { ok: false, error: askOnlyRefusal(REQUEST_PAYMENT_TOOL_NAME) };
      const orderNumber = input.orderNumber.replace(/^(?:order\s*)?#?\s*/i, '').trim() || input.orderNumber;
      const result = await deps.request(ctx.organizationId as OrgId, {
        orderNumber,
        method: METHOD[input.method],
        staffId: ctx.staffId,
      });
      if (!result.ok) return { ok: false, error: result.error };

      const p = result.payment;
      const face = METHOD_FACE[p.method];
      const artifact: ArtifactPayment = {
        kind: 'payment',
        title: `Take payment · Order ${p.orderNumber}`.slice(0, 120),
        orderNumber: p.orderNumber,
        ...(p.method === 'square_link' || p.method === 'square_invoice' ? { method: p.method } : {}),
      };
      const summary = result.existing
        ? p.status === 'paid'
          ? `Order ${p.orderNumber} is already paid through Square; the payment panel beside the chat shows it. Nothing new was created.`
          : `Order ${p.orderNumber} already has an open ${face} that has not been paid yet; it is open in the payment panel beside the chat. To switch method, cancel it there first. Card details are only ever entered on Square's page, never in chat.`
        : p.method === 'square_invoice'
          ? `A Square invoice for order ${p.orderNumber} is ${p.status === 'sent' ? 'published and ready to share' : 'drafted'}; the payment panel beside the chat shows the order total, the invoice link and its live status. Card details are only ever entered on Square's page, never in chat.`
          : `A Square payment link for order ${p.orderNumber} is open in the payment panel beside the chat: staff can copy it, show the QR code, or open Square's secure checkout to key the card there. Its status updates live. Card details are only ever entered on Square's page, never in chat.`;
      return brandReportEnvelope({ artifact, summary }, REQUEST_PAYMENT_TOOL_NAME);
    },
  };
}
