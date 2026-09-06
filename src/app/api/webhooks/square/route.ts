import { createHmac } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { squareFetch } from '@/lib/square/client';
import { reconcileCounterPayment } from '@/lib/counter/reconcile-payment';
import { resolveTerminalCheckout } from '@/lib/counter/session-store';
import { paymentStateForTerminalStatus } from '@/lib/counter/terminal-checkout';
import { insertSquareTransaction } from '@/lib/neon/square-transaction-queries';
import { publishSaleCompleted } from '@/lib/realtime/walkin-events';
import { resolveWebhookOrgForSquareMerchant } from '@/lib/shipping/webhook-org-resolver';
import { checkRateLimitAsync } from '@/lib/api-guard';
import { safeStrEqual } from '@/lib/security/safe-compare';
import { isRepairSku } from '@/utils/sku';

const WEBHOOK_SIGNATURE_KEY = () =>
  (process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || '').trim();

const WEBHOOK_NOTIFICATION_URL = () =>
  (process.env.SQUARE_WEBHOOK_NOTIFICATION_URL || '').trim();

/**
 * Verify Square's `x-square-hmacsha256-signature` over (notificationUrl + body).
 *
 * An UNSET signing key does NOT open the endpoint: this receiver reconciles
 * counter payments and writes transactions, and NODE_ENV is not a security
 * boundary (preview and self-hosted deploys run without it set). Unsigned posts
 * require the explicit ALLOW_UNSIGNED_WEBHOOKS=1 opt-in; unset ⇒ closed.
 */
function verifySquareSignature(
  body: string,
  signature: string,
  notificationUrl: string,
): boolean {
  const key = WEBHOOK_SIGNATURE_KEY();
  if (!key) {
    if (process.env.ALLOW_UNSIGNED_WEBHOOKS === '1') {
      console.warn(
        '[webhooks/square] SQUARE_WEBHOOK_SIGNATURE_KEY unset — skipping verification (ALLOW_UNSIGNED_WEBHOOKS=1)',
      );
      return true;
    }
    console.error('[webhooks/square] SQUARE_WEBHOOK_SIGNATURE_KEY unset — rejecting webhook');
    return false;
  }

  const combined = notificationUrl + body;
  const expectedSignature = createHmac('sha256', key)
    .update(combined)
    .digest('base64');

  // Constant-time — a `===` here leaks the matching prefix of the HMAC.
  return safeStrEqual(signature, expectedSignature);
}

interface SquareWebhookEvent {
  type: string;
  merchant_id?: string;
  data?: {
    type?: string;
    id?: string;
    object?: {
      payment?: {
        id?: string;
        order_id?: string;
        receipt_url?: string;
        source_type?: string;
        total_money?: { amount?: number; currency?: string };
        customer_id?: string;
      };
    };
  };
}

/**
 * POST /api/webhooks/square
 * Receives Square webhook events (e.g. payment.completed).
 */
export async function POST(req: NextRequest) {
  try {
    // IP rate limit before any body/crypto work — caps abuse of a public route.
    const rl = await checkRateLimitAsync({
      headers: req.headers,
      routeKey: 'webhooks-square',
      limit: 120,
      windowMs: 60_000,
    });
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'RATE_LIMITED', retryAfterSec: rl.retryAfterSec },
        { status: 429 },
      );
    }

    const rawBody = await req.text();
    const signature = req.headers.get('x-square-hmacsha256-signature') || '';
    const notificationUrl = WEBHOOK_NOTIFICATION_URL() || req.url;

    if (!verifySquareSignature(rawBody, signature, notificationUrl)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const event: SquareWebhookEvent = JSON.parse(rawBody);

    if (event.type === 'payment.completed') {
      const payment = event.data?.object?.payment;
      if (!payment?.order_id) {
        return NextResponse.json({ received: true });
      }

      // Session-less callback: map the payload's merchant_id to an org via
      // organization_integrations (provider='square'). FAIL-CLOSED — no
      // mapping means we ignore the event (200 so Square doesn't retry)
      // rather than write under a guessed org.
      const merchantId = typeof event.merchant_id === 'string' ? event.merchant_id : '';
      const orgId = merchantId
        ? await resolveWebhookOrgForSquareMerchant(merchantId)
        : null;
      if (!orgId) {
        console.warn('[webhook-org] unresolved square merchant — ignoring event', {
          merchantId: merchantId || null,
          eventType: event.type,
        });
        return NextResponse.json({ ignored: true });
      }

      // Fetch the full order to get line items
      const orderResult = await squareFetch<{ order?: Record<string, unknown> }>(
        `/orders/${payment.order_id}`,
      );

      const order = orderResult.data?.order as any;
      const lineItems = (order?.line_items || []).map((li: any) => ({
        name: li.name || li.catalog_object_id || 'Item',
        sku: li.catalog_object_id || null,
        quantity: li.quantity || '1',
        price: li.total_money?.amount || 0,
      }));

      // Determine order source from SKU convention
      const hasRepairSku = lineItems.some((li: any) => isRepairSku(li.sku));
      const orderSource = hasRepairSku ? 'repair_payment' : 'walk_in_sale';

      // Thread the resolved org into the insert + the realtime publish. This is
      // a session-less callback, so `orgId` here is the ONLY thing that decides
      // which tenant owns the row: insertSquareTransaction stamps it into
      // organization_id and conflicts on (organization_id, square_order_id),
      // and the table's FORCE RLS policy binds to the same value via the GUC.
      await insertSquareTransaction({
        square_order_id: payment.order_id,
        square_payment_id: payment.id || null,
        square_customer_id: payment.customer_id || order?.customer_id || null,
        customer_name: null, // Populated from customer lookup if needed
        customer_email: null,
        customer_phone: null,
        line_items: lineItems,
        subtotal: order?.total_money?.amount
          ? (order.total_money.amount - (order.total_tax_money?.amount || 0))
          : null,
        tax: order?.total_tax_money?.amount || null,
        total: order?.total_money?.amount || payment.total_money?.amount || null,
        discount: order?.total_discount_money?.amount || 0,
        status: 'completed',
        payment_method: payment.source_type || 'CARD',
        receipt_url: payment.receipt_url || null,
        order_source: orderSource,
      }, orgId);

      // Close the counter loop (SQ1). The `square_transactions` row exists by
      // now; this stamps `counter_transaction_id` onto it and settles the
      // header that staged this order.
      //
      // AFTER the insert, deliberately: the row must exist to be linked, and a
      // walk-in sale rung up directly on the stand has no counter visit at all
      // — that is `no_staged_header`, a normal outcome, not a failure. Guarded
      // anyway so a reconciliation fault can never cost us the sale record or
      // the realtime publish below.
      const paidCents =
        (typeof payment.total_money?.amount === 'number' ? payment.total_money.amount : null) ??
        (typeof order?.total_money?.amount === 'number' ? order.total_money.amount : 0);

      try {
        const reconciled = await reconcileCounterPayment(orgId, {
          squareOrderId: payment.order_id,
          paidCents,
        });
        if (reconciled.linked) {
          console.warn('[square-webhook] counter visit reconciled', {
            counterTransactionId: reconciled.counterTransactionId,
            status: reconciled.status,
            idempotent: reconciled.idempotent,
          });
        }
      } catch (err) {
        console.error('[square-webhook] counter reconciliation failed', err);
      }

      await publishSaleCompleted({
        orgId,
        squareOrderId: payment.order_id,
        source: 'square-webhook',
      }).catch((err) => console.error('Failed to publish sale event:', err));
    }

    /*
     * Terminal outcome → the counter session (SQ2).
     *
     * A DIFFERENT fact from `payment.completed` above, arriving on its own
     * webhook: this is the STAND saying the card was taken, cancelled, or the
     * customer walked away. It moves the session's card prompt; it never
     * settles the money, which is `payment.completed`'s job (SQ1). Keeping them
     * apart is what stops a visit reading as paid because a device said OK.
     */
    if (event.type === 'terminal.checkout.updated') {
      const checkout = (event.data?.object as { checkout?: { id?: string; status?: string } } | undefined)
        ?.checkout;
      const merchantId = typeof event.merchant_id === 'string' ? event.merchant_id : '';
      const orgId = merchantId ? await resolveWebhookOrgForSquareMerchant(merchantId) : null;

      if (orgId && checkout?.id) {
        try {
          await resolveTerminalCheckout(orgId, {
            checkoutId: checkout.id,
            paymentState: paymentStateForTerminalStatus(checkout.status ?? ''),
          });
        } catch (err) {
          console.error('[square-webhook] terminal checkout resolve failed', err);
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    console.error('POST /api/webhooks/square error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

/**
 * GET /api/webhooks/square — health check for Square webhook config.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    callbackPath: '/api/webhooks/square',
    signatureKeyConfigured: !!WEBHOOK_SIGNATURE_KEY(),
  });
}
