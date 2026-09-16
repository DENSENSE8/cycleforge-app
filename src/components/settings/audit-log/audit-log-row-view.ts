/**
 * `AuditLogRow → CompoundRowView` — the audit desk adapter.
 *
 * Pure, strings and enums, no JSX: "the moment a family can pass a node, the
 * fork walks back in wearing a view model." Every fact not named here is a
 * bound SLOT resolved through `audit-log-resolve.ts`.
 *
 * ## What the compound row says about one audited write
 *
 * - TITLE — the ACTION. The retired cell stacked action over source under a
 *   header that read "Source · Action"; the render order won, so the bold line
 *   is still what happened and `source` is bound as the subtitle beneath it.
 * - IDS — the ENTITY ID, the handle of the thing that was written. No tracking
 *   line: an audit row has no carrier, and inventing one would paint a chip
 *   over a fact this feed does not have.
 * - STATE — the ENTITY TYPE. A closed vocabulary (`order`, `staff`, …) is a
 *   pill, which is what the retired cell's first line already was in prose.
 * - DATES — the stamp, on BOTH lines: the civil day on the Hash line and the
 *   clock face (with seconds) on the Calendar line. The retired `fmtTs` cell
 *   printed date AND time to the second, and on an audit log the second is the
 *   point — two writes a heartbeat apart are a different story from two writes
 *   an hour apart. Putting the clock in the Hash tip and leaving the Calendar
 *   line `--` would lose it (the kiosk dwell rule).
 *
 * There is no money, no photo and no deadline on an audit row; all three stay
 * null and the shared cells paint the honest empty face.
 */

import { format } from 'date-fns';
import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import type { AuditLogRow } from '@/lib/audit/audit-log-row';
import { compoundIdentityFace } from '@/components/tables/compound/compound-row-model';

/**
 * An audit row is a record of something that already happened — it is never
 * work waiting on a human, and nothing on this desk can act on it. Tone is
 * never the fact; the pill's word is.
 */
const AUDIT_TONE: CompoundStateTone = 'neutral';

/** What the state pill says when the row names no entity type. */
const UNKNOWN_ENTITY_LABEL = 'Unknown entity';

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
 * The Calendar (secondary) line of the DATES cell — time of day to the second.
 *
 * Exported because it IS the fact the retired `fmtTs` cell carried and the
 * test pins it: a face that quietly dropped the seconds would read as a
 * formatting choice rather than as the regression it is.
 */
export function auditClockFace(iso: string | null | undefined): string | null {
  const d = parseInstant(iso);
  return d ? format(d, 'h:mm:ss a') : null;
}

/** Compact civil face for the Dates Hash line — no year (slot-table date law). */
function civilFace(iso: string | null | undefined): { label: string; dateKey: string } | null {
  const d = parseInstant(iso);
  return d ? { label: format(d, 'MMM d'), dateKey: format(d, 'yyyy-MM-dd') } : null;
}

export function auditLogCompoundView(row: AuditLogRow): CompoundRowView {
  const action = str(row.action);
  const entityType = str(row.entity_type);
  const day = civilFace(row.created_at);
  const clock = auditClockFace(row.created_at);
  const stamp = day && clock ? `${day.label} · ${clock}` : (day?.label ?? clock);

  return {
    id: String(row.id),
    thumbUrl: null,
    // A row with no action is a malformed audit write; name it by its own id
    // rather than painting "Untitled" over the one fact it definitely has.
    title: action ?? `Audit #${row.id}`,
    // Fallback line only — the layout binds `source` + `actor_role` as
    // subtitles and a bound subtitle replaces this. Says where the write came
    // from when an org unbinds both.
    note: str(row.source),
    // The Id track carries THIS family's handle, not an order: `identityFace`
    // paints it plainly and copyably, without the marketplace brand dot and
    // the open-on-platform menu `orderId` brings (operator 2026-09-14 — the
    // column is Id product-wide).
    identityFace: compoundIdentityFace(str(row.entity_id), 'Entity id'),
    orderId: null,
    tracking: null,
    // No marketplace and no carrier behind an audit row: the identity chip
    // must not borrow a brand dot from another family's vocabulary.
    platformValue: null,
    carrier: null,
    stateLabel: entityType ?? UNKNOWN_ENTITY_LABEL,
    stateTone: AUDIT_TONE,
    orderedAt: day
      ? { label: day.label, tip: stamp ?? day.label, dateKey: day.dateKey }
      : null,
    // Explicit Hash hover SoT — this family names the chip, so the engine must
    // not prefix "Start date" onto a line that is a write stamp.
    ...(stamp ? { startedHover: stamp } : null),
    // Calendar line = the clock face. Not a deadline: `days: 0` / not overdue
    // is the honest answer for a desk with no due dates at all.
    delay: clock ? { days: 0, overdue: false, faceLabel: clock } : null,
    delayTip: stamp ?? undefined,
    amount: null,
  };
}
