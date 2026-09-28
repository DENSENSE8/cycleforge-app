/**
 * `/pay/thanks` — where Square's or Stripe's hosted checkout sends a customer after they
 * pay an order payment link (`redirect_url` in `order-payments/service.ts`).
 *
 * Public and data-free on purpose: no session, no lookup. The order number is
 * echoed from the query string only as a courtesy; the payment itself is
 * confirmed to staff by the provider (webhook / status refresh), never by this page.
 */

export const metadata = { title: 'Payment received' };

export default async function PaymentThanksPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string | string[]; provider?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = params.order;
  const order = (Array.isArray(raw) ? raw[0] : raw)?.replace(/[^A-Za-z0-9 #._-]/g, '').slice(0, 40) || null;
  const provider = (Array.isArray(params.provider) ? params.provider[0] : params.provider) === 'stripe' ? 'Stripe' : 'Square';
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-canvas px-6 text-center">
      <div className="max-w-sm space-y-3">
        <h1 className="text-xl font-semibold text-text-default">Thank you — your payment went through</h1>
        <p className="text-sm leading-snug text-text-muted">
          {order ? <>We have your payment for order {order}. </> : null}
          Your receipt comes from {provider}. You can close this page.
        </p>
      </div>
    </div>
  );
}
