/** `VelocityReportRow → CompoundRowView` — the SKU-velocity adapter. */

import { format } from 'date-fns';
import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import type { VelocityReportRow } from '@/lib/reports/report-rows';
import { compoundIdentityFace } from '@/components/tables/compound/compound-row-model';

/**
 * A velocity row is a measurement of what already happened, not work waiting
 * on a human. Tone is never the fact; the pill's word is.
 */
const VELOCITY_TONE: CompoundStateTone = 'neutral';

/** Compact civil face for the Dates Hash line — no year (DataTable date law). */
function civilFace(iso: string | null): { label: string; dateKey: string } | null {
  if (!iso) return null;
  const moment = new Date(iso);
  if (Number.isNaN(moment.getTime())) return null;
  return { label: format(moment, 'MMM d'), dateKey: format(moment, 'yyyy-MM-dd') };
}

export function reportVelocityCompoundView(row: VelocityReportRow): CompoundRowView {
  const moved = civilFace(row.last_move_at);

  return {
    id: row.sku,
    thumbUrl: null,
    title: row.product_title ?? row.sku,
    titleHref: `/inventory/health/sku/${encodeURIComponent(row.sku)}`,
    // Nothing under the title: the layout binds no subtitle, and the three
    // magnitudes are tracks. A fallback note here would repeat a column.
    note: null,
    // The Id track carries THIS family's handle, not an order:
    // the open-on-platform menu `orderId` brings (operator 2026-09-14 — the
    identityFace: compoundIdentityFace(row.sku, 'SKU'),
    orderId: null,
    tracking: null,
    // No marketplace and no carrier behind a movement total.
    platformValue: null,
    carrier: null,
    stateLabel: row.velocity_tier,
    stateTone: VELOCITY_TONE,
    stateTip: `Tier ${row.velocity_tier} — ${row.out_qty} out in the last 30 days`,
    orderedAt: moved
      ? { label: moved.label, tip: `Last move ${moved.label}`, dateKey: moved.dateKey }
      : null,
    // Explicit Hash hover SoT — this family names the chip, so the engine must
    // not prefix "Start date" onto a line that is a movement stamp.
    ...(moved ? { startedHover: `Last move ${moved.label}` } : null),
    // A velocity row has no deadline; the Calendar line stays the honest empty
    // face rather than repeating the stamp above it.
    delay: null,
    amount: null,
  };
}
