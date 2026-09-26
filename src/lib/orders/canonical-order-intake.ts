/** `CanonicalOrderIntake` — ONE schema for order intake, two densities. */

import { inferMarketplaceFromOrderId } from '@/lib/marketplace-order-id';
import type { CsvOrderCanonicalKey } from './csv-order-import';

/** How the row entered the system. Set by the entry path, never typed. */
export type IntakeImportOrigin = 'synced' | 'csv' | 'manual' | 'shipstation';
export type IntakeLabelMode = 'link' | 'buy';
/**
 * Which connected engine buys/prints the label when the row was NOT imported
 * from the selling platform. v1: ShipStation when connected, else link-only.
 */
export type IntakeFulfillmentChannel = 'shipstation' | 'link_only';

export interface CanonicalOrderIntake {
  orderNumber: string;
  platformInferred: 'amazon' | 'ebay' | null;
  platformChosen: string; // account_source when inferred is null
  importOrigin: IntakeImportOrigin;
  fulfillmentChannel: IntakeFulfillmentChannel | null;
  itemNumber: string;
  sku: string;
  quantity: string; // orders.quantity is text-ish today; default '1'
  productTitle: string;
  condition: string; // CONDITION_GRADES
  trackingNumbers: string[];
  docsNotRequired: boolean;
  weightOz: number | null;
  dimL: number | null;
  dimW: number | null;
  dimH: number | null;
  dimUnit: 'inch' | 'centimeter';
  labelMode: IntakeLabelMode;
  assignedTechId: number | null;
  assignedPackerId: number | null;
}

/** A blank manual-entry draft — the single form's initial state. */
export function emptyCanonicalOrderIntake(
  importOrigin: IntakeImportOrigin = 'manual',
): CanonicalOrderIntake {
  return {
    orderNumber: '',
    platformInferred: null,
    platformChosen: '',
    importOrigin,
    fulfillmentChannel: null,
    itemNumber: '',
    sku: '',
    quantity: '1',
    productTitle: '',
    condition: '',
    trackingNumbers: [],
    docsNotRequired: false,
    weightOz: null,
    dimL: null,
    dimW: null,
    dimH: null,
    dimUnit: 'inch',
    labelMode: 'link',
    assignedTechId: null,
    assignedPackerId: null,
  };
}

/** The Identity section's platform acknowledgment, derived from the order number alone. */
export function intakePlatformState(orderNumber: string | null | undefined): {
  inferred: 'amazon' | 'ebay' | null;
  requiresChoice: boolean;
} {
  const inferred = inferMarketplaceFromOrderId(orderNumber);
  const hasNumber = String(orderNumber ?? '').trim().length > 0;
  return { inferred, requiresChoice: hasNumber && inferred === null };
}

/**
 * The channel label written to `orders.account_source` on create: the
 * inferred slug wins (the number itself names the platform), then the
 * operator's explicit pick, then the manual default.
 */
export function resolveIntakeAccountSource(intake: {
  platformInferred: 'amazon' | 'ebay' | null;
  platformChosen: string;
}): string {
  if (intake.platformInferred) return intake.platformInferred;
  return intake.platformChosen.trim() || 'Manual';
}

function numericOrNull(raw: string | null | undefined): number | null {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Project one staged CSV row (already projected through the header mapping) onto the canonical intake — the bulk density becoming the same… */
export function projectCsvRowToCanonicalIntake(
  projected: Record<CsvOrderCanonicalKey, string>,
): CanonicalOrderIntake {
  const { inferred } = intakePlatformState(projected.order_number);
  const tracking = String(projected.tracking_number ?? '').trim();
  return {
    ...emptyCanonicalOrderIntake('csv'),
    orderNumber: String(projected.order_number ?? '').trim(),
    platformInferred: inferred,
    platformChosen: String(projected.platform ?? '').trim(),
    itemNumber: String(projected.item_number ?? '').trim(),
    sku: String(projected.sku ?? '').trim(),
    quantity: String(projected.quantity ?? '').trim() || '1',
    productTitle: String(projected.item_title ?? '').trim(),
    condition: String(projected.condition ?? '').trim(),
    trackingNumbers: tracking ? [tracking] : [],
    weightOz: numericOrNull(projected.weight_oz),
    dimL: numericOrNull(projected.dim_l),
    dimW: numericOrNull(projected.dim_w),
    dimH: numericOrNull(projected.dim_h),
  };
}

/** The inverse projection: */
export function canonicalIntakeToCsvEdits(
  intake: CanonicalOrderIntake,
): Partial<Record<CsvOrderCanonicalKey, string>> {
  return {
    order_number: intake.orderNumber,
    item_title: intake.productTitle,
    sku: intake.sku,
    item_number: intake.itemNumber,
    quantity: intake.quantity,
    condition: intake.condition,
    tracking_number: intake.trackingNumbers[0] ?? '',
    platform: intake.platformChosen,
    weight_oz: intake.weightOz == null ? '' : String(intake.weightOz),
    dim_l: intake.dimL == null ? '' : String(intake.dimL),
    dim_w: intake.dimW == null ? '' : String(intake.dimW),
    dim_h: intake.dimH == null ? '' : String(intake.dimH),
  };
}

/**
 * Platform combobox ranking for order intake — the marketplaces an order list
 * actually comes from, first. Same rank `ShippedIntakeForm` uses; hoisted here
 * so the triage form does not grow a second copy.
 */
export const ORDER_INTAKE_PLATFORM_PRIORITY = [
  'amazon',
  'ebay',
  'walmart',
  'shopify',
  'ecwid',
] as const;

export function rankOrderIntakePlatforms<T extends { value: string; label: string }>(
  options: readonly T[],
): T[] {
  const rank = (value: string) => {
    const i = ORDER_INTAKE_PLATFORM_PRIORITY.indexOf(
      value.toLowerCase() as (typeof ORDER_INTAKE_PLATFORM_PRIORITY)[number],
    );
    return i === -1 ? 99 : i;
  };
  return [...options].sort(
    (a, b) => rank(a.value) - rank(b.value) || a.label.localeCompare(b.label),
  );
}
