/**
 * Claim ticket SUBJECT — one composer, server and client.
 *
 * The title used to be built twice: the server concatenated it inside
 * `buildReceivingClaimTemplate`, and the claim modal kept it live by
 * regex-replacing individual segments (`replaceClaimSubjectIdentitySegment` /
 * `…ClaimTypeSegment`). Two implementations of one string is a drift machine —
 * the moment the server learned to title an order-linked carton
 * `… // Order 111-8911758-3549041 // TRK#…`, the client's segment replacers
 * knew nothing about that segment, so reclassifying Platform or Type mid-draft
 * rewrote the title from a shape that no longer existed.
 *
 * So the subject is PARTS plus this function, and nothing else composes it:
 *
 *   <identity> // <claim type>[ // PO <po> | // Order <id>] // TRK#<tracking>
 *
 * The server renders the parts once and ships them with the preview; the modal
 * holds them and re-renders the whole title whenever the operator changes
 * platform, type or claim type. Changing a fact changes the title in real time
 * because there is only one place the title is made.
 */

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
