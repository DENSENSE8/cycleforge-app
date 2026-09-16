/**
 * `DriftAlertRow → CompoundRowView` — the open-drift-alerts adapter.
 *
 * Pure, strings and enums, no JSX: "the moment a family can pass a node, the
 * fork walks back in wearing a view model." Every fact not named here is a
 * bound SLOT resolved through `admin-drift-alerts-resolve.ts`.
 *
 * ## What the compound row says about one open drift alert
 *
 * - IDS — the SKU, the row's handle. The retired cell wrapped it in an
 *   `<a href="/inventory/health/sku/…">`; that reach-through is now the row's
 *   `navigate` record plane, declared once on the binding.
 * - TITLE — the cron's own prose (`drift: warehouse stored=3 ledger=5 (Δ=-2) ;
 *   boxed …`). It is the only fact on the row that says what happened, and the
 *   item track is the widest in the skeleton.
 * - STATE — the MAGNITUDE. `qty_at_trigger` is
 *   `GREATEST(ABS(warehouse_drift), ABS(boxed_drift))`, which is how far out of
 *   sync the SKU was when the alert opened — this desk's answer to "where is
 *   this row at". There is no lifecycle word to paint: the query pins
 *   `resolved_at IS NULL`, so "Open" would be the same constant on every row.
 * - DATES — the trigger stamp, on BOTH lines: the civil day on the Hash line
 *   and the clock face (to the minute) on the Calendar line. The retired cell
 *   printed `toLocaleString()`, and on an alert feed the time of day is the
 *   point — two alerts in one run are a different story from two a day apart.
 *
 * There is no money, no photo and no deadline on a stock alert; all three stay
 * null and the shared cells paint the honest empty face.
 */

import { format } from 'date-fns';
import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import type { DriftAlertRow } from '@/lib/inventory/drift-rows';
import { compoundIdentityFace } from '@/components/tables/compound/compound-row-model';

/** What the state pill says when the alert recorded no magnitude. */
const UNKNOWN_DELTA_LABEL = 'Δ unknown';

/** A counter is provably wrong and somebody has to reconcile it. */
const ALERT_TONE: CompoundStateTone = 'alert';

/** The alert row carries no magnitude — nothing to escalate on. */
const UNEXPLAINED_TONE: CompoundStateTone = 'neutral';

function str(value: string | number | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

function parseInstant(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The Calendar (secondary) line of the DATES cell — time of day.
 *
 * Exported because it IS the fact the retired `toLocaleString()` cell carried
 * and the test pins it: a face that quietly dropped the clock would read as a
 * formatting choice rather than as the regression it is.
 */
export function driftAlertClockFace(iso: string | null | undefined): string | null {
  const d = parseInstant(iso);
  return d ? format(d, 'h:mm a') : null;
}

export function adminDriftAlertsCompoundView(row: DriftAlertRow): CompoundRowView {
  const detail = str(row.notes);
  const day = parseInstant(row.triggered_at);
  const dayFace = day ? { label: format(day, 'MMM d'), dateKey: format(day, 'yyyy-MM-dd') } : null;
  const clock = driftAlertClockFace(row.triggered_at);
  const stamp = dayFace && clock ? `${dayFace.label} · ${clock}` : (dayFace?.label ?? clock);
  const delta = row.qty_at_trigger;

  return {
    id: String(row.id),
    thumbUrl: null,
    // An alert the cron wrote with no prose is malformed; name it by its own id
    // rather than painting "Untitled" over the one fact it definitely has.
    title: detail ?? `Drift alert #${row.id}`,
    note: null,
    // The Id track carries THIS family's handle, not an order: `identityFace`
    // paints it plainly and copyably, without the marketplace brand dot and
    // the open-on-platform menu `orderId` brings (operator 2026-09-14 — the
    // column is Id product-wide).
    identityFace: compoundIdentityFace(str(row.sku), 'SKU'),
    orderId: null,
    tracking: null,
    // No marketplace and no carrier behind a stock alert: the identity chip
    // must not borrow a brand dot from another family's vocabulary.
    platformValue: null,
    carrier: null,
    // The pill's WORD is the fact — the magnitude, spelled with its symbol so
    // the number reads as a delta rather than as a quantity on hand.
    stateLabel: delta == null ? UNKNOWN_DELTA_LABEL : `Δ ${delta}`,
    // Tone is an accelerator on a word that already says it, never the fact:
    // a magnitude the cron recorded means a counter is provably wrong and
    // somebody has to reconcile it; a missing one means the row predates the
    // column being written and there is nothing to escalate on.
    stateTone: delta != null && delta !== 0 ? ALERT_TONE : UNEXPLAINED_TONE,
    orderedAt: dayFace
      ? { label: dayFace.label, tip: stamp ?? dayFace.label, dateKey: dayFace.dateKey }
      : null,
    // Explicit Hash hover SoT — this family names the chip, so the engine must
    // not prefix "Start date" onto a line that is a trigger stamp.
    ...(stamp ? { startedHover: stamp } : null),
    // Calendar line = the clock face. Not a deadline: `days: 0` / not overdue is
    // the honest answer for a desk with no due dates at all.
    delay: clock ? { days: 0, overdue: false, faceLabel: clock } : null,
    delayTip: stamp ?? undefined,
    amount: null,
  };
}
