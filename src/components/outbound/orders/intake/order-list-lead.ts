'use client';

/**
 * The order list's LEAD slot — one entry painted above the first card, inside
 * the list's own scroll (same width as the cards; the list scrolls on below
 * it). The desk provides it (the inline new-order entry); `OrderCardList`
 * renders it. No provider → nothing.
 */

import { createContext, createElement, useContext, type ReactNode } from 'react';

const OrderListLeadContext = createContext<ReactNode>(null);

export function OrderListLeadProvider({ lead, children }: { lead: ReactNode; children: ReactNode }) {
  return createElement(OrderListLeadContext.Provider, { value: lead }, children);
}

export function OrderListLeadSlot() {
  const lead = useContext(OrderListLeadContext);
  return lead ? createElement('div', { className: 'pb-3' }, lead) : null;
}
