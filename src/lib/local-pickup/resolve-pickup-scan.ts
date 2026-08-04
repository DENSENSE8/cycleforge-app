/**
 * Resolve a station scan string to a local-pickup order id.
 * Pure — no fetch. Callers pass the loaded lines/groups feed.
 */

interface PickupScanMatchable {
  orderId: number;
  poNumber: string;
  customer: string | null;
  referenceNumber?: string | null;
}

/** Normalize for case-insensitive compare (trim + collapse internal space). */
function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Match scan text to an LCPU order. Preference:
 * 1. Exact numeric order id
 * 2. Exact PO / reference number
 * 3. Exact customer name
 * 4. Unique PO/customer substring
 *
 * Returns null when zero or ambiguous matches.
 */
export function resolvePickupScan(
  raw: string,
  orders: readonly PickupScanMatchable[],
): number | null {
  const q = norm(raw);
  if (!q || orders.length === 0) return null;

  if (/^\d+$/.test(q)) {
    const id = Number(q);
    const byId = orders.find((o) => o.orderId === id);
    if (byId) return byId.orderId;
  }

  const exactPo = orders.filter((o) => {
    const po = norm(o.poNumber);
    const ref = o.referenceNumber ? norm(o.referenceNumber) : '';
    return po === q || (ref && ref === q);
  });
  if (exactPo.length === 1) return exactPo[0].orderId;
  if (exactPo.length > 1) return null;

  const exactCustomer = orders.filter((o) => o.customer && norm(o.customer) === q);
  if (exactCustomer.length === 1) return exactCustomer[0].orderId;
  if (exactCustomer.length > 1) return null;

  const partial = orders.filter((o) => {
    const po = norm(o.poNumber);
    const ref = o.referenceNumber ? norm(o.referenceNumber) : '';
    const customer = o.customer ? norm(o.customer) : '';
    return (
      (po && po.includes(q)) ||
      (ref && ref.includes(q)) ||
      (customer && customer.includes(q))
    );
  });
  if (partial.length === 1) return partial[0].orderId;
  return null;
}
