'use client';

/**
 * Registers the To-ship desk with the assistant context store while mounted
 * (plan §-2.2: context is a registry hook, not prop-drilling).
 *
 * Until this existed the desk sent `context: null`, so the composer beside the
 * table had no page identity and no skill — "create a rule for this product"
 * was answered as a generic question. Mount-only; paints nothing.
 */

import { useAssistantContext } from '@/hooks/useAssistantContext';
import { SHIPPING_ORDERS_SKILL } from '@/lib/assistant/page-skills';

export const SHIPPING_ORDERS_ASSISTANT_PAGE = 'shipping-to-ship';

export function ShippingOrdersAssistantContext({ mode }: { mode?: string | null }) {
  useAssistantContext({
    page: SHIPPING_ORDERS_ASSISTANT_PAGE,
    mode: mode ?? null,
    skill: SHIPPING_ORDERS_SKILL,
  });
  return null;
}
