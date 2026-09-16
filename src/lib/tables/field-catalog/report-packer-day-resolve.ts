/**
 * Packer-day slot resolvers — pure.
 *
 * Same law as the sibling reports: dates resolve to the ABSOLUTE INSTANT and
 * numbers to their DIGITS, never a formatted face — a resolver whose text
 * carried " min" would sort lexically (10 before 5) and one that depended on
 * `now` would sort differently every minute.
 *
 * `basis` and `tier` resolve to the WORD the operator reads (`Set` / `Rules` /
 * `Default`, `Small` / `Medium` / `Large`) rather than the raw enum, because
 * these are text facts and search must match what a lead types.
 */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { PackingReportRow } from '@/lib/packing/packing-report-shared';

/** `tierSource` → the word on the pill and in search. */
export function packBasisLabel(source: PackingReportRow['tierSource']): string {
  switch (source) {
    case 'profile':
    case 'clean':
      return 'Set';
    case 'rules':
      return 'Rules';
    default:
      return 'Default';
  }
}

/** `packTier` → title case. Unknown values pass through rather than vanish. */
export function packTierLabel(tier: string): string {
  const t = String(tier || '').toUpperCase();
  if (t === 'SMALL') return 'Small';
  if (t === 'MEDIUM') return 'Medium';
  if (t === 'LARGE') return 'Large';
  return tier || '—';
}

export function resolveReportPackerDaySlotValue(
  row: PackingReportRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'report-packer-day.packer':
      /*
       * A PERSON value, not a string: the face reads `staffId` + `name`, so a
       * `{ kind: 'value' }` text rendered "—" on every row.
       *
       * `staffId` is what makes this family paint like its peers instead of
       * forking: `StaffAvatar` resolves `staff.color_hex` from the ID, so a
       * null drew the same default bubble for every packer (operator
       * 2026-09-16). Same shape as `audit-log.actor` / `auth-sessions.staff`.
       */
      return { kind: 'person', staffId: row.packerStaffId, name: row.packerName };
    case 'report-packer-day.product':
      return { kind: 'value', text: row.productTitle };
    case 'report-packer-day.packed_at':
      return { kind: 'value', text: row.packedAt };
    case 'report-packer-day.item_number':
      // null TEXT on an unpaired pack: the engine's blank rule sinks it under
      // both directions, which puts the packs that still need pairing together
      // at one end of the sort rather than scattering an invented '—'.
      return { kind: 'value', text: row.itemNumber };
    case 'report-packer-day.sku':
      return { kind: 'value', text: row.sku };
    case 'report-packer-day.minutes':
      return { kind: 'value', text: String(row.estimatedMinutes) };
    case 'report-packer-day.tier':
      return { kind: 'value', text: packTierLabel(row.packTier) };
    case 'report-packer-day.basis':
      return { kind: 'value', text: packBasisLabel(row.tierSource) };
    case 'report-packer-day.order_number':
      // null, never the tracking: an unpaired scan has no order number and the
      // Id chip's first line is meant to be empty for it.
      return { kind: 'value', text: row.orderNumber };
    case 'report-packer-day.order_ref':
      return { kind: 'value', text: row.trackingOrScanRef };
    default:
      return null;
  }
}
