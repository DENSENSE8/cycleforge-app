/** Claim ticket SUBJECT — one composer, server and client. */

export interface ClaimSubjectParts {
  /** Classify identity segment — `resolveClaimSubjectIdentity` output. */
  identity: string;
  /** Human claim-type label ("Damage", "Missing", …). */
  claimTypeLabel: string;
  /** Real purchase-order number when the carton has one. */
  poNumber?: string | null;
  /**
   * Operator-linked ORDER id for a carton with no PO — a marketplace order
   * number, RMA or supplier reference (`link-carton-identifier.ts`). Rendered
   * as `Order <id>`, never `PO <id>`: it is not a purchase order.
   */
  orderId?: string | null;
  /** Carton tracking number; `n/a` when unknown. */
  tracking?: string | null;
}

/** The whole title, from parts. The only composer. */
export function buildClaimSubject(parts: ClaimSubjectParts): string {
  const po = (parts.poNumber || '').trim();
  const orderId = (parts.orderId || '').trim();
  const tracking = (parts.tracking || '').trim() || 'n/a';
  // PO wins: a carton that resolved to a purchase order is titled by it, and
  // its pending order id (if any) is history at that point.
  const handle = po ? ` // PO ${po}` : orderId ? ` // Order ${orderId}` : '';
  return `${parts.identity} // ${parts.claimTypeLabel}${handle} // TRK#${tracking}`;
}
