/**
 * Shared LCPU create client — the staff `/pickup` CTA calls this. UI chrome
 * stays in each surface; the POST contract lives here.
 */

interface CreateLocalPickupOrderInput {
  customerName?: string | null;
  notes?: string | null;
  pickupDate?: string | null;
  items?: ReadonlyArray<{
    sku?: string;
    productTitle?: string;
    product_title?: string;
    quantity?: number;
    conditionGrade?: string;
    condition_grade?: string;
    partsStatus?: string;
    parts_status?: string;
    totalPrice?: number;
    total_price?: number;
  }>;
}

interface CreatedLocalPickupOrder {
  id: number;
  status: string;
  customer_name: string | null;
  pickup_date: string;
  items?: unknown[];
}

export async function createLocalPickupOrder(
  input: CreateLocalPickupOrderInput = {},
): Promise<CreatedLocalPickupOrder> {
  const res = await fetch('/api/local-pickup-orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerName: input.customerName ?? null,
      notes: input.notes ?? null,
      pickupDate: input.pickupDate ?? undefined,
      items: input.items ?? [],
    }),
  });
  const data = (await res.json()) as {
    success?: boolean;
    error?: string;
    order?: CreatedLocalPickupOrder;
  };
  if (!res.ok || !data.success || !data.order?.id) {
    throw new Error(data.error || `Create pickup failed (HTTP ${res.status})`);
  }
  return data.order;
}
