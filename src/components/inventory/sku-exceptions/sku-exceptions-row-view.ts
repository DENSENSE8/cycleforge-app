/**
 * `ProvisionalSku → CompoundRowView` — pure, strings and enums, no JSX.
 *
 * - IDS — the placeholder SKU over the scanned barcode, both plain copyable
 *   handles (no marketplace dot, no carrier ring).
 * - TITLE — the name typed on the phone; the description is the note under it.
 * - THUMB — the cover photo, when one exists.
 * - STATE — {@link skuExceptionState}; `Needs photo` carries the alert tone.
 * - DATES — Hash line = the civil day it was created (no year), Calendar line
 *   = the clock.
 */

import { format } from 'date-fns';
import {
  compoundIdentityFace,
  type CompoundRowView,
} from '@/components/tables/compound/compound-row-model';
import type { ProvisionalSku } from '@/lib/neon/provisional-sku-queries';
import { photoContentUrl } from '@/lib/photos/display-url';
import {
  skuExceptionState,
  skuExceptionTitle,
} from '@/lib/tables/field-catalog/sku-exceptions-resolve';

export function skuExceptionsCompoundView(row: ProvisionalSku): CompoundRowView {
  const state = skuExceptionState(row);
  const created = row.createdAt ? new Date(row.createdAt) : null;
  const instant = created && !Number.isNaN(created.getTime()) ? created : null;
  const day = instant
    ? { label: format(instant, 'MMM d'), dateKey: format(instant, 'yyyy-MM-dd') }
    : null;
  const clock = instant ? format(instant, 'h:mm a') : null;
  const stamp = day && clock ? `Created ${day.label} · ${clock}` : null;
  const description = (row.description ?? '').trim();

  return {
    id: row.sku,
    thumbUrl: row.coverPhotoId != null ? photoContentUrl(row.coverPhotoId, 'thumb') : null,
    title: skuExceptionTitle(row),
    note: description || null,
    identityFace: compoundIdentityFace(row.sku, 'Temporary SKU'),
    identitySubFace: compoundIdentityFace(row.barcode, 'Barcode'),
    orderId: null,
    tracking: null,
    platformValue: null,
    carrier: null,
    stateLabel: state,
    stateTone: state === 'Needs photo' ? 'alert' : 'neutral',
    orderedAt: day ? { label: day.label, tip: stamp ?? day.label, dateKey: day.dateKey } : null,
    startedHover: stamp ?? 'Created',
    delay: clock ? { days: 0, overdue: false, faceLabel: clock } : null,
    delayTip: stamp ?? undefined,
    amount: null,
  };
}
