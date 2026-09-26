/** `CycleCountLineRow → CompoundRowView` — pure, strings and enums, no JSX. */

import { format } from 'date-fns';
import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import {
  cycleCountLineBinLabel,
  cycleCountLineStatusLabel,
  cycleCountLineVarianceFace,
  type CycleCountLineRow,
} from '@/lib/inventory/cycle-count-line-row';
import { compoundIdentityFace } from '@/components/tables/compound/compound-row-model';

/** Compact civil face + the full stamp, or null when the instant is absent. */
function stamp(iso: string | null): { face: string; dateKey: string; full: string } | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return {
    face: format(at, 'MMM d'),
    dateKey: format(at, 'yyyy-MM-dd'),
    full: format(at, 'MMM d, h:mm a'),
  };
}

/** The pill's TONE. */
function stateToneFor(row: CycleCountLineRow): CompoundStateTone {
  if (row.status === 'pending_review' || row.status === 'rejected') return 'alert';
  if (row.overTolerance) return 'alert';
  if (row.status === 'approved') return 'done';
  return 'neutral';
}

export function cycleCountLinesCompoundView(row: CycleCountLineRow): CompoundRowView {
  const sku = String(row.sku ?? '').trim();
  const counted = stamp(row.countedAt);
  const decided = stamp(row.approvedAt);

  const statusWord = cycleCountLineStatusLabel(row.status) || row.status;
  const varianceFace = cycleCountLineVarianceFace(row.variance);
  const tolFace = String(row.varianceTol ?? '').trim();

  return {
    id: String(row.id),
    thumbUrl: null,
    title: sku || `Line #${row.id}`,
    ...(sku ? { titleHref: `/inventory/health/sku/${encodeURIComponent(sku)}` } : null),
    note: null,
    // The Id track carries THIS family's handle, not an order:
    // the open-on-platform menu `orderId` brings (operator 2026-09-14 — the
    identityFace: compoundIdentityFace(cycleCountLineBinLabel(row), 'Bin'),
    orderId: null,
    tracking: null,
    platformValue: null,
    carrier: null,
    orderedAt: counted
      ? { label: counted.face, tip: `Counted ${counted.full}`, dateKey: counted.dateKey }
      : null,
    stateLabel: row.overTolerance ? `${statusWord} · over tol` : statusWord,
    stateTone: stateToneFor(row),
    ...(row.overTolerance && varianceFace
      ? {
          stateTip: `Δ ${varianceFace} on ${row.expectedQty} expected exceeds tol ${tolFace}`,
        }
      : null),
    delay: decided ? { days: 0, overdue: false, faceLabel: decided.face } : null,
    ...(decided ? { delayTip: `${statusWord} ${decided.full}` } : null),
    amount: null,
  };
}
