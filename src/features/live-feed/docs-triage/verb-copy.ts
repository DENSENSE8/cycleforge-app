/**
 * What the docs sheet's label Unpair / Remove confirm says — built from the
 * server's preflight (`GET /api/v1/label-ingestions/[id]/unpair-check`), so
 * the operator reads exactly which tracking comes off and whether the order
 * already left on this label (operator 2026-10-06: allowed, with a warning;
 * the scan record stays). Pure.
 */

import type { LabelUnpairCheck } from '@/lib/label-ingestions/http-client';

export interface ConfirmCopy {
  title: string;
  description: string;
  confirmLabel: string;
  tone: 'primary' | 'danger';
}

export function labelUnpairCopy(
  check: Pick<LabelUnpairCheck, 'trackingComesOff' | 'scannedOut'>,
  remove: boolean,
  orderRef: string,
  formatWhen: (iso: string) => string,
): ConfirmCopy {
  const tracking = check.trackingComesOff;
  const parts = [
    remove ? `The label comes off ${orderRef} and its file is deleted.` : `The label comes off ${orderRef} and waits with the unpaired labels.`,
    tracking.length === 0
      ? 'No tracking comes off — the order’s tracking stays as it is.'
      : `Tracking ${tracking.join(', ')} comes off the order.`,
    check.scannedOut
      ? `Scanned out ${formatWhen(check.scannedOut.at)} by ${check.scannedOut.by ?? 'an unknown station'} — the scan record stays.`
      : null,
    remove ? 'Undo uploads the same file onto the order again.' : 'Undo files it back on this order.',
  ];
  return {
    title: remove ? 'Remove this label?' : 'Unpair this label?',
    description: parts.filter(Boolean).join(' '),
    confirmLabel: remove ? 'Remove label' : 'Unpair label',
    tone: remove || check.scannedOut ? 'danger' : 'primary',
  };
}
