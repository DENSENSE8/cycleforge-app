/** A buyer's order history in one line — order count, realised spend, first / last order. Client-safe (no DB). */

import { customerFullName, type CustomerRecord } from './customer-display';

export interface CustomerOrderStats {
  /** Distinct order numbers (a multi-line order counts once). */
  orderCount: number;
  /** Sum of realised line sales (`orders.sale_amount`) in {@link currency}. */
  totalSpent: number;
  currency: string;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  /** To-ship search text that lists this buyer's orders ({@link customerOrdersSearchNeedle}). */
  search: string;
}

export interface CustomerSpendByCurrency {
  currency: string | null;
  /** NUMERIC as text (node-postgres keeps NUMERIC a string). */
  total: string | number | null;
  orders: number;
}

const DEFAULT_CURRENCY = 'USD';

/**
 * The spend to show when a buyer paid in more than one currency: the currency
 * most of their orders were in (ties → the larger total), never a cross-currency sum.
 */
export function pickCustomerSpend(rows: readonly CustomerSpendByCurrency[]): { totalSpent: number; currency: string } {
  let best: { totalSpent: number; currency: string; orders: number } | null = null;
  for (const row of rows) {
    const code = String(row.currency ?? '').trim().toUpperCase();
    const currency = /^[A-Z]{3}$/.test(code) ? code : DEFAULT_CURRENCY;
    const total = Number(row.total);
    if (!Number.isFinite(total)) continue;
    const orders = Number(row.orders) || 0;
    if (!best || orders > best.orders || (orders === best.orders && total > best.totalSpent)) {
      best = { totalSpent: Math.round(total * 100) / 100, currency, orders };
    }
  }
  return best ? { totalSpent: best.totalSpent, currency: best.currency } : { totalSpent: 0, currency: DEFAULT_CURRENCY };
}

/**
 * The To-ship search text that finds this buyer's orders: the email when the
 * book has one (unique per buyer), else the display name. A bare customer id
 * would also match order row ids, so it is only the last resort.
 */
export function customerOrdersSearchNeedle(customer: Pick<CustomerRecord, 'id' | 'email' | 'display_name' | 'customer_name' | 'first_name' | 'last_name'>): string {
  const email = String(customer.email ?? '').trim();
  if (email) return email;
  const name = customerFullName(customer as CustomerRecord);
  if (name) return name;
  return String(customer.id);
}
