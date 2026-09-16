/**
 * `VelocityReportRow → CompoundRowView` — the SKU-velocity adapter.
 *
 * Pure, strings and enums, no JSX: "the moment a family can pass a node, the
 * fork walks back in wearing a view model." Every fact not named here is a
 * bound SLOT resolved through `report-velocity-resolve.ts`.
 *
 * ## What the compound row says about one SKU's 30 days
 *
 * - TITLE — the PRODUCT, linked to its catalog page (the engine's title href,
 *   never JSX inside a family cell). A row with no product title is named by
 *   the SKU it definitely has.
 * - IDS — the SKU. No tracking line: a velocity row has no carrier, and
 *   inventing one would paint a chip over a fact this feed does not have.
 * - STATE — the velocity TIER, a closed `A`/`B`/`C`/`D` vocabulary. The tip
 *   says what earned it, from this row's own out quantity rather than from a
 *   copy of the route's `CASE` thresholds — two declarations of those numbers
 *   is how the pill starts disagreeing with the SQL.
 * - DATES — the last-move stamp on the Hash line. Leaving it null would paint
 *   a column of `--` under a live header.
 *
 * The retired `text-rose-600` / `text-emerald-600` on Out and In are gone: the
 * numbers are the facts and the hues were decoration. Tone on this desk would
 * have to mean "needs a human", and nothing on a velocity report does.
 *
 * There is no money, no deadline and no photo on a velocity row; all three
 * stay null and the shared cells paint the honest empty face.
 */

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

/** Compact civil face for the Dates Hash line — no year (slot-table date law). */
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
    // The Id track carries THIS family's handle, not an order: `identityFace`
    // paints it plainly and copyably, without the marketplace brand dot and
    // the open-on-platform menu `orderId` brings (operator 2026-09-14 — the
    // column is Id product-wide).
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
