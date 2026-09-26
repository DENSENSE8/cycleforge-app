/** Slot-track FACES — how a bound fact's resolved text paints, keyed to the field's display type. */

import type { FieldDisplayType } from '@/lib/tables/field-catalog/types';

/** Compact age for an instant — `just now` · `16m ago` · `3h ago` · `2d ago`, and the civil day once a week has passed (past that, "9d ago"… */
export function compoundSlotAgeFace(instant: string, now: number = Date.now()): string | null {
  const at = new Date(instant).getTime();
  if (Number.isNaN(at)) return null;
  const diffMin = Math.floor((now - at) / 60_000);
  if (diffMin < 0) return compoundSlotInstantFace(instant);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
  if (diffMin < 10080) return `${Math.floor(diffMin / 1440)}d ago`;
  return new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** The full civil stamp — the hover detail behind {@link compoundSlotAgeFace}. */
export function compoundSlotInstantFace(instant: string): string | null {
  const at = new Date(instant);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Which face a slot track paints, from the field's display type alone.
 *
 * `plain` is the default and the honest answer for most facts — the header
 * already says what the fact IS, so the cell only has to say what it says.
 */
export type CompoundSlotFace = 'age' | 'tag' | 'code' | 'person' | 'plain';

export function compoundSlotFaceFor(displayType: FieldDisplayType | undefined): CompoundSlotFace {
  switch (displayType) {
    case 'date':
      return 'age';
    case 'tag':
      return 'tag';
    case 'id':
    case 'tracking':
      return 'code';
    case 'person':
      return 'person';
    default:
      return 'plain';
  }
}
