/** Pure gating logic for showing the fulfillment-substitution section on the `/tech` shipping station… */

/** Response shape of GET /api/fulfillment/substitution-policy. */
export interface SubstitutionPolicy {
  /** FULFILLMENT_SUBSTITUTION env flag (isFulfillmentSubstitution()). */
  enabled: boolean;
  enforcement: 'advisory' | 'block_until_approved';
  allowedNodes: Array<'pick' | 'test' | 'pack'>;
  /** enabled && allowedNodes includes 'test' && caller holds a substitute permission. */
  canSubstitute: boolean;
}

/** The slice of ActiveStationOrder the eligibility check reads. */
export interface SubstitutionEligibilityOrder {
  id: number | null;
  orderId: string;
  tracking: string;
  fnsku?: string | null;
  sourceType?: 'order' | 'fba' | 'repair' | 'exception';
  orderFound?: boolean;
}

export interface TechSubstitutionEligibilityInput {
  policy: SubstitutionPolicy | undefined;
  activeOrder: SubstitutionEligibilityOrder;
  mode: 'active' | 'preview';
  /** Numeric row id backing an Up Next preview (ActiveStationOrder lacks it). */
  previewOrderId?: number | null;
}

interface TechSubstitutionEligibility {
  show: boolean;
  /** The order id the SubstituteUnitCard should target (null when hidden). */
  orderId: number | null;
  /** Human label for the card header ("#A-1047" style order id, or tracking). */
  orderLabel: string;
}

const HIDDEN: TechSubstitutionEligibility = { show: false, orderId: null, orderLabel: '' };

function isValidId(id: unknown): id is number {
  return typeof id === 'number' && Number.isFinite(id) && id > 0;
}

export function canShowTechSubstitution(
  input: TechSubstitutionEligibilityInput,
): TechSubstitutionEligibility {
  const { policy, activeOrder, mode, previewOrderId } = input;

  if (!policy?.canSubstitute) return HIDDEN;

  const source = activeOrder.sourceType;
  if (source === 'exception') return HIDDEN;

  // FBA / FNSKU session — no order allocation to amend.
  if (source === 'fba' || String(activeOrder.fnsku ?? '').trim().length > 0) return HIDDEN;

  // Repair session — RS-# tracking routes to the repair flow, not an order.
  if (source === 'repair' || (activeOrder.tracking ?? '').trim().toUpperCase().startsWith('RS-')) {
    return HIDDEN;
  }

  if (activeOrder.orderFound === false) return HIDDEN;

  const orderId =
    mode === 'preview'
      ? isValidId(previewOrderId) ? previewOrderId : null
      : isValidId(activeOrder.id) ? activeOrder.id : null;
  if (orderId === null) return HIDDEN;

  const orderLabel =
    (activeOrder.orderId ?? '').trim() || (activeOrder.tracking ?? '').trim() || `#${orderId}`;

  return { show: true, orderId, orderLabel };
}
