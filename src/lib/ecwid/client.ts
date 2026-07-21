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
