import type { CanonicalOrderIntake } from '@/lib/orders/canonical-order-intake';
import { parseTrackingPaste } from '@/lib/receiving/tracking-paste';
import { CONDITION_GRADES } from '@/lib/conditions';

export class MobileOrderSubmissionError extends Error {
  constructor(
    message: string,
    public readonly orderId: number | null,
    public readonly stage: string,
  ) {
    super(message);
    this.name = 'MobileOrderSubmissionError';
  }
}

export interface MobileOrderSubmissionInput {
  draft: CanonicalOrderIntake;
  saleAmount: string;
  currency: string;
  isUrgent: boolean;
  clientEventId: string;
  files: {
    shipping_label?: File;
    packing_slip?: File;
  };
  existingOrderId?: number;
}

export interface MobileOrderSubmissionResult {
  orderId: number;
  orderNumber: string;
}

export function validateMobileOrderInput(input: MobileOrderSubmissionInput): void {
  const { draft } = input;
  if (!input.clientEventId.trim()) throw new MobileOrderSubmissionError('A submission key is required.', null, 'validation');
  if (!draft.orderNumber.trim()) throw new MobileOrderSubmissionError('Order number is required.', null, 'validation');
  if (!draft.productTitle.trim()) throw new MobileOrderSubmissionError('Product title is required.', null, 'validation');
  if (!draft.platformChosen.trim() && !draft.platformInferred) {
    throw new MobileOrderSubmissionError('Choose the selling channel.', null, 'validation');
  }
  const quantity = Number(draft.quantity.trim());
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new MobileOrderSubmissionError('Quantity must be a whole number of at least 1.', null, 'validation');
  }
  if (draft.condition.trim() && !(CONDITION_GRADES as readonly string[]).includes(draft.condition.trim().toUpperCase())) {
    throw new MobileOrderSubmissionError('Choose a valid condition grade.', null, 'validation');
  }
  if (input.saleAmount.trim() && (!Number.isFinite(Number(input.saleAmount)) || Number(input.saleAmount) < 0)) {
    throw new MobileOrderSubmissionError('Sale amount must be a non-negative number.', null, 'validation');
  }
  const parcel = [draft.weightOz, draft.dimL, draft.dimW, draft.dimH];
  if (parcel.some((value) => value != null) && parcel.some((value) => value == null || !Number.isFinite(value) || value <= 0)) {
    throw new MobileOrderSubmissionError('Enter all parcel measurements, or leave them blank.', null, 'validation');
  }
  if (draft.trackingNumbers.length > 0) {
    const parsed = parseTrackingPaste(draft.trackingNumbers);
    if (!parsed.ok) throw new MobileOrderSubmissionError(parsed.error, null, 'validation');
  }
  for (const [type, file] of Object.entries(input.files)) {
    if (file && file.size <= 0) throw new MobileOrderSubmissionError(`${type} is empty.`, input.existingOrderId ?? null, 'documents');
  }
}

async function responseBody(response: Response): Promise<Record<string, any>> {
  return (await response.json().catch(() => ({}))) as Record<string, any>;
}

async function request(fetcher: typeof fetch, url: string, init: RequestInit, orderId: number | null, stage: string) {
  let response: Response;
  try {
    response = await fetcher(url, init);
  } catch {
    throw new MobileOrderSubmissionError('Network error. Retry with the same submission.', orderId, stage);
  }
  const body = await responseBody(response);
  if (!response.ok || body.success === false) {
    throw new MobileOrderSubmissionError(String(body.error ?? `Could not complete ${stage}.`), orderId, stage);
  }
  return body;
}

export async function submitMobileOrder(
  input: MobileOrderSubmissionInput,
  options: { fetcher?: typeof fetch; onCreated?: (orderId: number) => void } = {},
): Promise<MobileOrderSubmissionResult> {
  validateMobileOrderInput(input);
  const fetcher = options.fetcher ?? fetch;
  const draft = input.draft;
  let orderId = input.existingOrderId ?? null;
  let orderNumber = draft.orderNumber.trim();

  if (orderId == null) {
    const body = await request(fetcher, '/api/orders/add', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': input.clientEventId.trim() },
      body: JSON.stringify({
        orderId: orderNumber,
        productTitle: draft.productTitle.trim(),
        sku: draft.sku.trim() || null,
        quantity: draft.quantity.trim(),
        shippingTrackingNumbers: draft.trackingNumbers,
        condition: draft.condition.trim() || null,
        accountSource: draft.platformInferred || draft.platformChosen.trim(),
        saleAmount: input.saleAmount.trim() ? Number(input.saleAmount) : null,
        currency: input.currency.trim() || 'USD',
        isUrgent: input.isUrgent,
        clientEventId: input.clientEventId.trim(),
      }),
    }, null, 'create');
    orderId = Number(body.order?.id);
    orderNumber = String(body.order?.order_id ?? orderNumber);
    if (!Number.isFinite(orderId) || orderId <= 0) {
      throw new MobileOrderSubmissionError('Order was not returned by the server.', null, 'create');
    }
    options.onCreated?.(orderId);
  }

  if (draft.itemNumber.trim()) {
    await request(fetcher, '/api/orders/set-item-number', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: orderId, itemNumber: draft.itemNumber.trim() }),
    }, orderId, 'item-number');
  }

  if (draft.weightOz != null) {
    await request(fetcher, `/api/orders/${orderId}/cage-release`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set-parcel', weightOz: draft.weightOz, lengthIn: draft.dimL, widthIn: draft.dimW, heightIn: draft.dimH }),
    }, orderId, 'parcel');
  }

  if (draft.docsNotRequired) {
    await request(fetcher, `/api/orders/${orderId}/cage-release`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'docs-not-required', value: true }),
    }, orderId, 'documents-exemption');
  }

  for (const [documentType, file] of Object.entries(input.files) as Array<['shipping_label' | 'packing_slip', File | undefined]>) {
    if (!file) continue;
    const form = new FormData();
    form.set('file', file);
    form.set('documentType', documentType);
    form.set('orderRef', orderNumber);
    await request(fetcher, `/api/orders/${orderId}/documents/upload`, {
      method: 'POST', credentials: 'same-origin', body: form,
    }, orderId, `document:${documentType}`);
  }

  return { orderId, orderNumber };
}
