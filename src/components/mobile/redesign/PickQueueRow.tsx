'use client';

/**
 * One line of the `/m/pick` queue — a thin `PickListRow` adapter over the
 * shared {@link ItemCardRow}.
 *
 * Operator rulings, all 2026-09-15:
 *   - Picks and to-ship render the SAME item card, so a picker and a packer
 *     recognize the item from either screen.
 *   - No sale price or marketplace-link tile on the pick face. The picker
 *     receives only physical verification facts; listing documentation stays
 *     in the administrative order sheet.
 *   - LOCATION paints after the condition, as the EXACT bin barcode — the
 *     same code the bin label carries. **Text only**: the screen-scannable
 *     DataMatrix that briefly rendered beside it was removed the same day
 *     ("never mount the QR code for the location of the item within the
 *     row itself"). (This supersedes this row's old location-lead layout.)
 *   - A **Pair** CTA sits right-most, carrying a CHAIN glyph: opens the
 *     tote-pair sheet for the row's order (order ↔ handling unit). The icon
 *     is the verb — two links joined — so the button reads as a coupling
 *     rather than one more blue commit.
 *
 * The card body still taps through to the pick session. A unit with no
 * `current_location` is a real, actionable state (stocked but unshelved),
 * so it reads warning ink rather than dashing out.
 */

import { Link2 } from '@/components/Icons';
import { ItemCardRow } from '@/components/mobile/redesign/ItemCardRow';
import {
  conditionGradeTableLabel,
  EMPTY_META_DASH,
} from '@/lib/conditions';
import { conditionGradeTextClass } from '@/lib/condition-tone';
import { formatSalePrice } from '@/lib/dashboard/orders-queue-helpers';
import type { PickListRow } from '@/components/mobile/redesign/pick-list-payload';

function pickConditionParts(row: PickListRow): { label: string; tone: string } | null {
  const label = conditionGradeTableLabel(row.grade);
  if (!label || label === EMPTY_META_DASH) return null;
  return { label, tone: conditionGradeTextClass(row.grade) };
}

export function PickQueueRow({
  row,
  onOpen,
  onPair,
}: {
  row: PickListRow;
  onOpen: (row: PickListRow) => void;
  /** Opens the tote-pair sheet for this row's order. */
  onPair: (row: PickListRow) => void;
}) {
  return (
    <div data-testid="pick-queue-row">
      <ItemCardRow
        title={row.productTitle ?? row.serialNumber}
        imageUrl={row.imageUrl}
        qty={row.qty}
        price={formatSalePrice(row.saleAmount, row.currency) || null}
        condition={pickConditionParts(row)}
        deadlineAt={row.deadlineAt}
        location={row.locationBarcode ?? row.location ?? 'No location'}
        locationTone={row.location ? undefined : 'text-text-warning'}
        onOpen={() => onOpen(row)}
        ariaLabel={`Pick ${row.serialNumber} from ${row.location ?? 'no location'}`}
        primary={{
          label: 'Pair',
          icon: <Link2 className="h-3.5 w-3.5" />,
          onCommit: () => onPair(row),
        }}
      />
    </div>
  );
}
