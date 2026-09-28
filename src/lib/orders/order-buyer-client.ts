'use client';

import { refreshDomain } from '@/lib/refresh/bus';
import type { z } from 'zod';
import type { OrderBuyerPatchBody } from '@/lib/schemas/customers';

/** What the order record sends to `PATCH /api/orders/[id]/buyer` (see `OrderBuyerPatchBody`). */
export type OrderBuyerPatchInput = z.input<typeof OrderBuyerPatchBody>;

/** Correct an order's buyer (contact and/or complete ship-to); repaints the outbound order views on success. */
export async function patchOrderBuyer(
  orderId: number,
  body: OrderBuyerPatchInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/orders/${orderId}/buyer`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as {
      error?: string;
      issues?: { message?: string }[];
    } | null;
    if (!res.ok) {
      return { ok: false, error: data?.issues?.[0]?.message || data?.error || `Save failed (${res.status})` };
    }
    refreshDomain('orders.outbound');
    return { ok: true };
  } catch {
    return { ok: false, error: 'Network error — the buyer was not saved' };
  }
}
