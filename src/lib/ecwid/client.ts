/**
 * Shared Ecwid REST client — vault-first credentials + dogfood env fallback.
 * Document adapters and sync jobs should call through here instead of
 * forking storeId/token resolution or raw `app.ecwid.com` fetches.
 */

import 'server-only';

import {
  getIntegrationCredentials,
  type EcwidCredentials,
} from '@/lib/integrations/credentials';
import { DOGFOOD_ORG_ID, type OrgId } from '@/lib/tenancy/constants';

export type { EcwidCredentials };

const ECWID_BASE_URL = 'https://app.ecwid.com/api/v3';

function envValue(primary: string, aliases: string[] = []): string | null {
  for (const key of [primary, ...aliases]) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return null;
}

/** Dogfood-only env bridge (USAV). Other orgs must have a vault row. */
function dogfoodEnvCreds(): EcwidCredentials | null {
  const storeId = envValue('ECWID_STORE_ID', [
    'ECWID_STOREID',
    'ECWID_STORE',
    'NEXT_PUBLIC_ECWID_STORE_ID',
  ]);
  const apiToken = envValue('ECWID_API_TOKEN', [
    'ECWID_TOKEN',
    'ECWID_ACCESS_TOKEN',
    'NEXT_PUBLIC_ECWID_API_TOKEN',
  ]);
  if (!storeId || !apiToken) return null;
  return { storeId, apiToken };
}

/**
 * Resolve Ecwid store + token for an org.
 * Vault first; dogfood org may fall back to ECWID_* env vars.
 */
export async function resolveEcwidCreds(orgId: OrgId): Promise<EcwidCredentials | null> {
  const vault = await getIntegrationCredentials<EcwidCredentials>(orgId, 'ecwid');
  if (vault?.storeId && vault?.apiToken) return vault;
  if (orgId === DOGFOOD_ORG_ID) return dogfoodEnvCreds();
  return null;
}

export class EcwidApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'EcwidApiError';
  }
}

/** Trailing N digits of a phone, formatting-insensitive. */
function lastDigits(value: string | null | undefined, n = 10): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length <= n ? digits : digits.slice(-n);
}

/** Confirm that an order number belongs to a phone, and return its public order number. */
export async function confirmOrderNumberForPhone(args: {
  orgId: OrgId;
  orderNumber: string;
  phone: string;
}): Promise<string | null> {
  const orderNumber = args.orderNumber.trim();
  const phoneKey = lastDigits(args.phone);
  // A short phone tail would match far too many orders to be an identity check.
  if (!orderNumber || phoneKey.length < 7) return null;

  const creds = await resolveEcwidCreds(args.orgId);
  if (!creds) return null;

  try {
    const url =
      `${ECWID_BASE_URL}/${encodeURIComponent(creds.storeId)}/orders` +
      `?keywords=${encodeURIComponent(orderNumber)}&limit=20`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${creds.apiToken}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return null;

    const body = (await res.json()) as { items?: unknown[] };
    for (const raw of body.items ?? []) {
      const order = raw as Record<string, unknown>;
      const publicNumber = String(
        order.orderNumber ?? order.vendorOrderNumber ?? order.id ?? '',
      ).trim();
      // Exact order-number agreement only — a keyword hit is not a match.
      if (!publicNumber) continue;
      const normalizedPublic = publicNumber.replace(/^#/, '');
      if (
        normalizedPublic !== orderNumber.replace(/^#/, '') &&
        String(order.id ?? '').trim() !== orderNumber
      ) {
        continue;
      }

      const billing = (order.billingPerson ?? {}) as Record<string, unknown>;
      const shipping = (order.shippingPerson ?? {}) as Record<string, unknown>;
      const candidatePhones = [order.phone, billing.phone, shipping.phone];
      if (candidatePhones.some((p) => lastDigits(p as string | null) === phoneKey)) {
        return normalizedPublic;
      }
    }
    return null;
  } catch {
    // A prior-order reveal is a convenience. A vendor outage must never fail the
    // counter transaction it decorates.
    return null;
  }
}

/** The buyer on one Ecwid order, by public order number. */
export async function fetchEcwidOrderContact(
  orgId: OrgId,
  orderNumber: string,
): Promise<{ name: string; phone: string; email: string } | null> {
  const ref = orderNumber.trim().replace(/^#/, '');
  if (!ref) return null;

  const creds = await resolveEcwidCreds(orgId);
  if (!creds) return null;

  try {
    const url =
      `${ECWID_BASE_URL}/${encodeURIComponent(creds.storeId)}/orders` +
      `?keywords=${encodeURIComponent(ref)}&limit=20`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${creds.apiToken}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return null;

    const body = (await res.json()) as { items?: unknown[] };
    for (const raw of body.items ?? []) {
      const order = (raw ?? {}) as Record<string, unknown>;
      // Exact order-number agreement only — a keyword hit is not a match.
      const publicNumber = String(order.orderNumber ?? order.id ?? '')
        .trim()
        .replace(/^#/, '');
      if (publicNumber !== ref && String(order.id ?? '').trim() !== ref) continue;

      const billing = (order.billingPerson ?? {}) as Record<string, unknown>;
      const shipping = (order.shippingPerson ?? {}) as Record<string, unknown>;
      const text = (value: unknown) => String(value ?? '').trim();
      const contact = {
        name: text(shipping.name || billing.name),
        phone: text(shipping.phone || billing.phone || order.phone),
        email: text(order.email),
      };
      // A name with neither phone nor email is a LABEL, not an identity:
      // `resolveProviderCustomerId` would refuse it anyway, and returning it
      // would only write a contact_info string that no future pass can match.
      return contact.phone || contact.email ? contact : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch the Ecwid order invoice PDF (packing-slip / receipt stand-in).
 * `orderRef` is the public order number (e.g. `4787`) or Ecwid internal id.
 */
export async function fetchInvoicePdf(
  storeId: string,
  apiToken: string,
  orderRef: string,
): Promise<Buffer> {
  const ref = orderRef.trim();
  if (!ref) throw new EcwidApiError('Missing Ecwid order reference', 400);

  const url = `${ECWID_BASE_URL}/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(ref)}/invoice-pdf`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      Accept: 'application/pdf',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new EcwidApiError(
      `Ecwid invoice-pdf failed (${res.status})${body ? `: ${body.slice(0, 200)}` : ''}`,
      res.status,
    );
  }

  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}
