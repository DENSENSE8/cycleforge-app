/**
 * Exclusive receiving-line state for the shared item face.
 *
 * Other domains omit `receiveState`; the face must not invent receive chrome
 * when the field is absent. Search / pack / shipped never set this.
 */

import type { ItemRecordReceiveState } from '@/design-system/components/item-record/item-record-types';
import {
  isLineLeftoverOsdCode,
  type LineLeftoverOsdCode,
} from '@/lib/receiving/line-leftover-osd';

export function deriveReceiveState(input: {
  counted?: number | null;
  expected?: number | null;
  exceptionCode?: string | null;
}): ItemRecordReceiveState | undefined {
  const code = input.exceptionCode;
  if (code === 'SHORT') return 'short';
  if (code === 'OVER') return 'over';
  if (code === 'WRONG_ITEM') return 'wrong_item';
  if (code === 'DAMAGED') return 'damaged';

  const listed =
    typeof input.expected === 'number' && Number.isFinite(input.expected) && input.expected > 0
      ? input.expected
      : null;
  if (listed == null) return undefined;

  const got =
    typeof input.counted === 'number' && Number.isFinite(input.counted) ? input.counted : 0;
  if (got <= 0) return 'open';
  if (got < listed) return 'partial';
  if (got > listed) return 'over';
  return 'received';
}

/** PLAN §3 Short confirm — exact copy. */
export function shortRemainingConfirmCopy(remaining: number): string {
  return `Mark ${remaining} not received — write SHORT?`;
}

export function overageConfirmCopy(over: number): string {
  return `Mark overage of ${over} — write OVER?`;
}

export function damagedConfirmCopy(): string {
  return 'Mark this line damaged — write DAMAGED?';
}

export function wrongItemConfirmCopy(): string {
  return 'Mark this line as the wrong item — write WRONG_ITEM?';
}

/** Mouth hinge on WeldedFeedbackPanel — PLAN §3. */
export function lineOsdMouthHeadline(code: LineLeftoverOsdCode, qty?: number): string {
  if (code === 'SHORT') return `Line · short ${qty ?? 0}`;
  if (code === 'OVER') return `Line · over ${qty ?? 0}`;
  if (code === 'DAMAGED') return 'Line · damaged';
  return 'Line · wrong item';
}

export function leftoverRemaining(counted: number, expected: number | null): number {
  if (expected == null || !Number.isFinite(expected)) return 0;
  return Math.max(0, expected - counted);
}

export { isLineLeftoverOsdCode };
