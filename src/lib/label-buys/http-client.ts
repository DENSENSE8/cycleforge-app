/**
 * Browser transport for `/api/v1/label-buys` (the `/shipping/buy-label` page).
 * Same-origin, session cookie only; it never sends a tenant or an actor.
 * Failures throw `V1RequestError` carrying the server's `code`
 * (`LABEL_BUY_ERROR_CODES` + the v1 base codes).
 */
import { v1Request } from '@/lib/api/v1-client';
import {
  labelBuyProductsSchema,
  labelBuyRatesSchema,
  labelBuyResultSchema,
  type LabelBuyBody,
  type LabelBuyProduct,
  type LabelBuyRates,
  type LabelBuyRatesBody,
  type LabelBuyResult,
} from './contracts';

const ENDPOINT = '/api/v1/label-buys';

export function fetchLabelBuyRates(body: LabelBuyRatesBody): Promise<LabelBuyRates> {
  return v1Request(`${ENDPOINT}/rates`, labelBuyRatesSchema, { method: 'POST', body, fallbackMessage: 'Could not get rates' });
}

/** Buy the chosen rate. Resend the SAME `clientEventId` to retry: a retry never buys twice. */
export function buyLabel(body: LabelBuyBody): Promise<LabelBuyResult> {
  return v1Request(ENDPOINT, labelBuyResultSchema, { method: 'POST', body, fallbackMessage: 'Could not buy the label' });
}

export async function searchLabelBuyProducts(q: string, signal?: AbortSignal): Promise<LabelBuyProduct[]> {
  const { products } = await v1Request(`${ENDPOINT}/products?${new URLSearchParams({ q: q.trim() })}`, labelBuyProductsSchema, {
    signal,
    fallbackMessage: 'Could not search products',
  });
  return products;
}
