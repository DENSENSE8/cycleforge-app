/**
 * Order payments on Stripe — the tenant's OWN Stripe account only.
 *
 * Money routing: an order payment is the tenant's sales revenue, so it may
 * only ever be created on the tenant's vault credential. The platform's
 * STRIPE_SECRET_KEY (what `billing/stripe.ts` falls back to) bills tenants for
 * CycleForge itself; charging a tenant's customer on it would land their
 * revenue in the platform's account. `getIntegrationCredentials` also serves
 * that env key to the dogfood org as a transitional bridge — so a credential
 * equal to the platform key is refused here too.
 */

import 'server-only';
import { getIntegrationCredentials, type StripeCredentials } from '@/lib/integrations/credentials';
import type { OrgId } from '@/lib/tenancy/constants';

const STRIPE_BASE = 'https://api.stripe.com/v1';
const STRIPE_VERSION = '2024-06-20';

/** The org's own Stripe credential, or null (none, or it is the platform's billing key). */
export async function resolveOrderStripeCredentials(orgId: OrgId): Promise<StripeCredentials | null> {
  const creds = await getIntegrationCredentials<StripeCredentials>(orgId, 'stripe');
  const secretKey = creds?.secretKey?.trim();
  if (!creds || !secretKey) return null;
  const platformKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (platformKey && secretKey === platformKey) return null;
  return creds;
}

export interface StripeResult<T> {
  ok: boolean;
  status: number;
  data: T;
  error: string | null;
}

async function stripeFetch<T>(
  creds: StripeCredentials,
  path: string,
  init: { method?: 'GET' | 'POST'; form?: Record<string, string>; idempotencyKey?: string } = {},
): Promise<StripeResult<T>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${creds.secretKey.trim()}`,
    'Stripe-Version': STRIPE_VERSION,
  };
  if (init.form) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  if (init.idempotencyKey) headers['Idempotency-Key'] = init.idempotencyKey;
  const res = await fetch(`${STRIPE_BASE}${path}`, {
    method: init.method ?? (init.form ? 'POST' : 'GET'),
    headers,
    body: init.form ? new URLSearchParams(init.form).toString() : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: string } };
  return {
    ok: res.ok,
    status: res.status,
    data: json,
    error: res.ok ? null : `Stripe ${path.split('/').slice(0, 3).join('/')} failed (${res.status}): ${json.error?.message || json.error?.code || 'request failed'}`,
  };
}

export interface StripeCheckoutSession {
  id?: string;
  url?: string | null;
  status?: 'open' | 'complete' | 'expired' | string;
  payment_status?: 'paid' | 'unpaid' | 'no_payment_required' | string;
  payment_intent?: string | { id?: string } | null;
  metadata?: Record<string, string>;
}

export function createCheckoutSession(creds: StripeCredentials, form: Record<string, string>, idempotencyKey: string) {
  return stripeFetch<StripeCheckoutSession>(creds, '/checkout/sessions', { form, idempotencyKey });
}

export function getCheckoutSession(creds: StripeCredentials, sessionId: string) {
  return stripeFetch<StripeCheckoutSession>(creds, `/checkout/sessions/${encodeURIComponent(sessionId)}`);
}

export function expireCheckoutSession(creds: StripeCredentials, sessionId: string, idempotencyKey: string) {
  return stripeFetch<StripeCheckoutSession>(creds, `/checkout/sessions/${encodeURIComponent(sessionId)}/expire`, {
    method: 'POST',
    form: {},
    idempotencyKey,
  });
}
