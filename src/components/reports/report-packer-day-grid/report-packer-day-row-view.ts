/**
 * `PackingReportRow → CompoundRowView` — the packer-day adapter.
 *
 * Pure, strings and enums, no JSX. Every fact not named here is a bound SLOT
 * resolved through `report-packer-day-resolve.ts`.
 *
 * ## What the compound row says about one pack
 *
 * - TITLE — the PRODUCT, because the manager scanning this table is asking
 *   "what went in the box". An unpaired pack says so in words
 *   (`Not paired to a SKU`) rather than showing a blank title: the phone sheet
 *   uses the same sentence, and a blank would read as a rendering bug instead
 *   of the pairing gap it is.
 * - IDS — the PACKER, on the identity face: it is the handle a lead quotes
 *   ("what did Tuan pack"), and it repeats down that packer's block of rows
 *   exactly like an order id repeats down its lines.
 * - STATE — the BASIS of the minute count: `Set` / `Rules` / `Default`.
 *   `done` tone only on `Set` (a human confirmed it); `alert` on `Default`,
 *   because that pack never resolved to a catalog SKU and a human must pair it
 *   — which is the stated meaning of the tone ("needs a human: hold,
 *   exception, mismatch"), not decoration. `Rules` is neutral: a guess that is
 *   probably fine and definitely unconfirmed.
 * - DATES — WHEN the pack scan landed, on the Hash line, as the clock time:
 *   every row on one report shares a civil day.
 * - TRACKING — the order / tracking ref, the handle for chasing one pack.
 *
 * No photo, no money, no carrier, no platform on a pack scan; all stay null
 * and the shared cells paint the honest empty face.
 */

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
    /*
     * A paired pack opens its PRODUCT RECORD — the one place its time to pack
     * is editable, and the answer to "this standard is wrong". An unpaired pack
     * has nothing to open, so the title stays inert rather than linking to a
     * SKU page that would 404.
     */
    titleHref: row.sku ? `/products/sku/${encodeURIComponent(row.sku)}` : null,
    // Nothing under the title: item number, SKU and minutes are status tracks,
    // and a note repeating them would double a column.
    note: null,
    /*
     * The Id chip is TWO lines and they are two different facts: the ORDER
     * NUMBER on top, the tracking's last-8 under it. Both used to be fed
     * `trackingOrScanRef`, so the chip printed the tracking twice (operator
     * 2026-09-16: *"the tracking number is already in the second row … the
     * first row should be the order number only, and if the order number is
     * not present it should be empty"*).
     *
     * `compoundIdentityFace` returns null for a blank handle, so an unpaired
     * scan leaves the first line genuinely empty instead of borrowing the
     * tracking — which is the ruling, and also the honest shape: a tracking
     * scan with no order row HAS no order number.
     */
    identityFace: compoundIdentityFace(row.orderNumber, 'Order'),
    orderId: row.orderNumber,
    tracking: row.trackingOrScanRef,
    /*
     * PARITY with `ordersCompoundView` (src/lib/orders/orders-compound-view.ts),
     * which is the canonical adapter every slot table follows: the Id chip
     * resolves its marketplace mark from `platformValue`
     * (`resolveMarketplacePlatformMeta(view.orderId, view.platformValue)` in
     * `CompoundCells`), so a null here costs the order number its channel dot
     * and makes this family look hand-rolled. `carrier` stays null because the
     * projection has no carrier fact — an honest absence, not a forgotten one.
     */
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
