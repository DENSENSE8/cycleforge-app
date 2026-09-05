'use client';

/**
 * Receiving-line got / OS&D leftover writes. Carton Print · Receive stays on
 * the mouth; these only stamp the line. Unreceive stays on the mouth split.
 */

import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { requestConfirm } from '@/design-system/components/confirm';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import {
  damagedConfirmCopy,
  leftoverRemaining,
  lineOsdMouthHeadline,
  overageConfirmCopy,
  shortRemainingConfirmCopy,
  wrongItemConfirmCopy,
} from '@/lib/item-record/receive-state';
import type { LineLeftoverOsdCode } from '@/lib/receiving/line-leftover-osd';

async function patchReceivingLine(
  lineId: number,
  fields: Record<string, unknown>,
): Promise<ReceivingLineRow | null> {
  const res = await fetch('/api/receiving-lines', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: lineId, ...fields }),
  });
  const data = (await res.json().catch(() => null)) as
    | { success?: boolean; receiving_line?: ReceivingLineRow }
    | null;
  if (!res.ok || !data?.success || !data.receiving_line) return null;
  dispatchLineUpdated(data.receiving_line);
  return data.receiving_line;
}

function emitLineOsd(code: LineLeftoverOsdCode, qty?: number) {
  emitReceiving('receiving-line-osd', {
    headline: lineOsdMouthHeadline(code, qty),
    tone: 'warning',
  });
}

export async function applyLineGot(lineId: number, got: number): Promise<boolean> {
  const line = await patchReceivingLine(lineId, { quantity_received: Math.max(0, Math.floor(got)) });
  return Boolean(line);
}

export async function markLineReceived(line: ReceivingLineRow): Promise<boolean> {
  const listed = Number(line.quantity_expected) || 0;
  const ok = await applyLineGot(line.id, listed);
  if (!ok) return false;
  emitReceiving('receiving-line-osd', { headline: 'Line · received', tone: 'success' });
  return true;
}

export async function markLineShortRemaining(
  line: Pick<ReceivingLineRow, 'id'> & { quantity_expected?: number | null },
  got: number,
): Promise<boolean> {
  const listed =
    typeof line.quantity_expected === 'number' && Number.isFinite(line.quantity_expected)
      ? line.quantity_expected
      : 0;
  const remaining = leftoverRemaining(got, listed);
  if (remaining <= 0) return false;
  const ok = await requestConfirm({
    title: 'Not received',
    description: shortRemainingConfirmCopy(remaining),
    confirmLabel: 'Write SHORT',
    tone: 'danger',
  });
  if (!ok) return false;
  const patched = await patchReceivingLine(line.id, {
    quantity_received: Math.max(0, Math.floor(got)),
    exception_code: 'SHORT',
  });
  if (!patched) return false;
  emitLineOsd('SHORT', remaining);
  return true;
}

export async function markLineOverage(line: ReceivingLineRow): Promise<boolean> {
  const listed = Number(line.quantity_expected) || 0;
  const got = Number(line.quantity_received) || 0;
  const over = Math.max(0, got - listed);
  if (over <= 0) return false;
  const ok = await requestConfirm({
    title: 'Over',
    description: overageConfirmCopy(over),
    confirmLabel: 'Write OVER',
    tone: 'danger',
  });
  if (!ok) return false;
  const patched = await patchReceivingLine(line.id, { exception_code: 'OVER' });
  if (!patched) return false;
  emitLineOsd('OVER', over);
  return true;
}

export async function markLineDamaged(line: ReceivingLineRow): Promise<boolean> {
  const ok = await requestConfirm({
    title: 'Damaged',
    description: damagedConfirmCopy(),
    confirmLabel: 'Write DAMAGED',
    tone: 'danger',
  });
  if (!ok) return false;
  const patched = await patchReceivingLine(line.id, { exception_code: 'DAMAGED' });
  if (!patched) return false;
  emitLineOsd('DAMAGED');
  return true;
}

export async function markLineWrongItem(line: ReceivingLineRow): Promise<boolean> {
  const ok = await requestConfirm({
    title: 'Wrong item',
    description: wrongItemConfirmCopy(),
    confirmLabel: 'Write WRONG_ITEM',
    tone: 'danger',
  });
  if (!ok) return false;
  const patched = await patchReceivingLine(line.id, { exception_code: 'WRONG_ITEM' });
  if (!patched) return false;
  emitLineOsd('WRONG_ITEM');
  return true;
}
