import 'server-only';

import { buildSourceHash } from '@/lib/documents/fetch-idempotency';
import {
  EcwidApiError,
  fetchInvoicePdf,
  resolveEcwidCreds,
  type EcwidCredentials,
} from '@/lib/ecwid/client';
import type { OrgId } from '@/lib/tenancy/constants';
import type { OutboundOrderContext } from './order-context';
import type { MarketplaceDocumentAdapter, MarketplaceFetchOutcome } from './types';

function sourceIncludes(order: OutboundOrderContext, token: string): boolean {
  return (order.accountSource ?? '').toLowerCase().includes(token);
}

/** Injectable for DB-free unit tests. */
export interface EcwidPackingSlipDeps {
  resolveCreds?: (orgId: OrgId) => Promise<EcwidCredentials | null>;
  fetchPdf?: (storeId: string, apiToken: string, orderRef: string) => Promise<Buffer>;
}

/**
 * Fetch Ecwid invoice-pdf and map to a marketplace packing-slip outcome.
 * Exported for unit tests with injected deps.
 */
export async function fetchEcwidPackingSlip(
  order: OutboundOrderContext,
  orgId: string,
  deps: EcwidPackingSlipDeps = {},
): Promise<MarketplaceFetchOutcome> {
  const resolve = deps.resolveCreds ?? resolveEcwidCreds;
  const fetchPdf = deps.fetchPdf ?? fetchInvoicePdf;

  const creds = await resolve(orgId as OrgId);
  if (!creds) {
    return {
      ok: false,
      error: 'Ecwid is not connected for this organization.',
    };
  }

  try {
    const buffer = await fetchPdf(creds.storeId, creds.apiToken, order.orderRef);
    const sourceHash = buildSourceHash({
      platform: 'ecwid',
      orderRef: order.orderRef,
      documentType: 'packing_slip',
      shipmentId: order.shipmentId,
    });

    return {
      ok: true,
      buffer,
      contentType: 'application/pdf',
      extension: 'pdf',
      filename: `ecwid-invoice-${order.orderRef}.pdf`,
      platform: 'ecwid',
      source: 'marketplace_api',
      tracking: order.tracking,
      carrier: order.carrier,
      sourceHash,
    };
  } catch (error) {
    const message =
      error instanceof EcwidApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Ecwid invoice-pdf fetch failed';
    return { ok: false, error: message };
  }
}

export const ecwidDocumentAdapter: MarketplaceDocumentAdapter = {
  platform: 'ecwid',

  canFetch(order) {
    return sourceIncludes(order, 'ecwid');
  },

  async fetchDocument(order, type, orgId): Promise<MarketplaceFetchOutcome> {
    if (type !== 'packing_slip') {
      return {
        ok: false,
        error:
          'Shipping labels must be uploaded manually or fetched from your carrier integration.',
      };
    }
    return fetchEcwidPackingSlip(order, orgId);
  },
};
