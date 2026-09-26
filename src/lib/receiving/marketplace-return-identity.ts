/** Marketplace-return identity face for receiving rails / search. */

import { getLast8 } from '@/lib/copy-chip-format';
import {
  classificationShort,
  columnsToClassification,
} from '@/lib/receiving/intake-classification';

/** En dash join — operator-facing return identity (`AMZ – return – 4552201`). */
const MARKETPLACE_RETURN_IDENTITY_SEP = ' – ';

type MarketplaceReturnIdentityInput = {
  orderId: string | null | undefined;
  sourcePlatform?: string | null;
  returnPlatform?: string | null;
  isReturn?: boolean | null;
  receivingType?: string | null;
  cartonIntakeType?: string | null;
  intakeType?: string | null;
};

function upperType(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase();
}

/** True when carton/line intake is a return (not a marketplace purchase). */
export function isMarketplaceReturnIntake(input: MarketplaceReturnIdentityInput): boolean {
  if (input.isReturn === true) return true;
  const types = [input.receivingType, input.cartonIntakeType, input.intakeType].map(upperType);
  return types.some(
    (t) =>
      t === 'RETURN' ||
      t.endsWith('_RETURN') ||
      t === 'AMAZON_RETURN' ||
      t === 'FBA_RETURN' ||
      t === 'WALMART_RETURN',
  );
}

/**
 * Compact return identity, or null when this is not a return / has no order id.
 * Copy-value stays the full order id on chips; this is display-only.
 */
export function formatMarketplaceReturnIdentityTitle(
  input: MarketplaceReturnIdentityInput,
): string | null {
  if (!isMarketplaceReturnIntake(input)) return null;
  const orderId = String(input.orderId ?? '').trim();
  if (!orderId) return null;
  const cls = columnsToClassification({
    is_return: true,
    return_platform: input.returnPlatform,
    source_platform: input.sourcePlatform,
    receiving_type: 'RETURN',
  });
  const short = classificationShort(cls);
  // Amazon ids are hyphenated (114-1234567-5969038), so a blind last-8 drags the
  // segment's own hyphen in and renders as a double dash after the en-dash join.
  const last8 = getLast8(orderId).replace(/^[-_]+/, '');
  return [short, 'return', last8].join(MARKETPLACE_RETURN_IDENTITY_SEP);
}
