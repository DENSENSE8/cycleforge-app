/** `PackingReportRow → CompoundRowView` — the packer-day adapter. */

import { format } from 'date-fns';
import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import { compoundIdentityFace } from '@/components/tables/compound/compound-row-model';
import type { PackingReportRow } from '@/lib/packing/packing-report-shared';
import { packBasisLabel } from '@/lib/tables/field-catalog/report-packer-day-resolve';

const UNPAIRED_TITLE = 'Not paired to a SKU';

/** Clock-time face for the Dates Hash line — the day is the page's, the time is the row's. */
function clockFace(iso: string | null): { label: string; dateKey: string } | null {
  if (!iso) return null;
  const moment = new Date(iso);
  if (Number.isNaN(moment.getTime())) return null;
  return { label: format(moment, 'h:mm a'), dateKey: format(moment, 'yyyy-MM-dd') };
}

/** The tone the basis earns. Only an unpaired pack asks for a human. */
function basisTone(source: PackingReportRow['tierSource']): CompoundStateTone {
  if (source === 'profile' || source === 'clean') return 'done';
  if (source === 'default') return 'alert';
  return 'neutral';
}

const BASIS_TIP: Record<PackingReportRow['tierSource'], string> = {
  profile: 'An operator set this SKU’s time to pack on its product record',
  clean: 'An operator set this SKU’s time to pack on its product record',
  rules: 'Guessed from the product title — nobody has confirmed it',
  default: 'This pack never resolved to a catalog SKU; it carries the fallback standard',
};

export function reportPackerDayCompoundView(row: PackingReportRow): CompoundRowView {
  const at = clockFace(row.packedAt);

  return {
    id: String(row.salId),
    thumbUrl: null,
    title: row.productTitle || row.sku || row.itemNumber || UNPAIRED_TITLE,
    /* A paired pack opens its PRODUCT RECORD — the one place its time to pack is editable, and the answer to "this standard is wrong". */
    titleHref: row.sku ? `/products/sku/${encodeURIComponent(row.sku)}` : null,
    // Nothing under the title: item number, SKU and minutes are status tracks,
    // and a note repeating them would double a column.
    note: null,
    /* The Id chip is TWO lines and they are two different facts: */
    identityFace: compoundIdentityFace(row.orderNumber, 'Order'),
    orderId: row.orderNumber,
    tracking: row.trackingOrScanRef,
    /* PARITY with `ordersCompoundView` (src/lib/orders/orders-compound-view.ts), which is the canonical adapter every slot table follows: */
    platformValue: row.platform,
    carrier: null,
    stateLabel: packBasisLabel(row.tierSource),
    stateTone: basisTone(row.tierSource),
    stateTip: BASIS_TIP[row.tierSource],
    orderedAt: at ? { label: at.label, tip: `Packed ${at.label}`, dateKey: at.dateKey } : null,
    ...(at ? { startedHover: `Packed ${at.label}` } : null),
    delay: null,
    amount: null,
  };
}
