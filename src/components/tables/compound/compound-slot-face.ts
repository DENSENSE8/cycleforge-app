/**
 * Slot-track FACES — how a bound fact's resolved text paints, keyed to the
 * field's display type.
 *
 * ## Why this is engine code and not a family cell map
 *
 * The inventory-events port (2026-09-04) shipped a per-family cell map so its
 * ledger could paint a relative age, a mono event tag and a copyable code.
 * Invariant 1 of `table-engine-law.ts` forbids exactly that — "a family
 * contributes an adapter and a column array, never a cell" — and invariant 3
 * names the remedy: *the engine gains the capability for everyone, or the mount
 * does without.* None of those three faces is about inventory events. A `date`
 * fact reads as an age on every family; a `tag` fact is a short enum everywhere;
 * an `id` fact is a code somebody will want to copy wherever it is bound.
 *
 * So the faces move HERE, chosen by {@link FieldDisplayType}, and every family
 * that binds a date into a slot inherits the age face without writing a cell.
 *
 * Kept pure and leaf (no React, no imports from the cell layer) so the tripwire
 * and the unit test can both load it, same contract as `compound-row-model.ts`.
 *
 * The RESOLVER still hands over the absolute instant — a resolver must not read
 * the clock (one row's answer would depend on when it was called). Turning that
 * instant into "16m ago" is a paint decision, and paint is allowed to know what
 * time it is.
 */

import type { FieldDisplayType } from '@/lib/tables/field-catalog/types';

/**
 * Compact age for an instant — `just now` · `16m ago` · `3h ago` · `2d ago`,
 * and the civil day once a week has passed (past that, "9d ago" stops being
 * something anyone triages on and the date is the more useful fact).
 *
 * `now` is a parameter rather than a `Date.now()` call so the function is
 * testable and so one render stamps every row from the same instant.
 */
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
