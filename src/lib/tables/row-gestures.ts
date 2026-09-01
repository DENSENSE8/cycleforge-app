/**
 * The row model's gesture table — as DATA, so the code and the docs cannot
 * disagree about what a row does.
 *
 * `docs/todo/seller-table-program-PLAN.md` §04 opens with the instruction:
 * "Build the gesture table **first** and make the code match it." §11 then adds
 * the obligation this file discharges: "The gesture table gains a keyboard
 * column."
 *
 * ## Why data and not a markdown table
 *
 * The plan's own table is prose, and prose is how the repo ended up asserting
 * things that were not true — a docblock claiming three ruled surfaces when
 * there were two, another citing a `useIsColumnHidden` that did not exist. A
 * gesture list has the same failure mode and a worse consequence, because
 * "what does Enter do here" is answered by whichever of 53 window listeners
 * mounted last.
 *
 * So the table is declared once, here, and:
 *   * {@link useRowGestures} binds from it — a verb with no entry cannot be
 *     bound, and an entry with no handler is a compile error;
 *   * `row-gestures.test.ts` asserts the LAW, not the list: every verb the
 *     pointer can reach, the keyboard can reach.
 *
 * ## The law the test enforces
 *
 * > Every verb the pointer can reach, the keyboard can reach.
 *
 * That is the plan's §11 heading, and it is the one property a gesture table
 * can actually be checked against. A `pointer` with no `keys` is a mouse-only
 * verb; the test fails on it by name.
 */

/** The precedence layer a binding belongs to — see `table-key-layer.ts`. */
export type RowGestureLayer = 'table' | 'form';

export interface RowGesture {
  /** Stable identity — what {@link useRowGestures} switches on. */
  id: RowGestureId;
  /** What the operator understands it to do. One clause, present tense. */
  does: string;
  /**
   * The pointer gesture, or null for keyboard-only.
   *
   * `null` is legitimate (there is no mouse gesture for "move the cursor down
   * one row"); the reverse is not, and the guard says so.
   */
  pointer: string | null;
  /**
   * The keys that reach it. **Never empty** while `pointer` is non-null.
   *
   * Written the way the operator would say them, and matched
   * case-insensitively against `KeyboardEvent.key` plus the modifier prefixes
   * `shift+` / `mod+` (⌘ on macOS, Ctrl elsewhere).
   */
  keys: readonly string[];
  layer: RowGestureLayer;
  /**
   * Why this gesture is shaped the way it is, when the shape is not obvious.
   * Rendered into the keyboard sheet as the "why", and read by the next porter.
   */
  note?: string;
}

export type RowGestureId =
  | 'cursor-next'
  | 'cursor-prev'
  | 'cursor-first'
  | 'cursor-last'
  | 'toggle-select'
  | 'extend-next'
  | 'extend-prev'
  | 'select-all'
  | 'open-record'
  | 'dismiss';

/**
 * The table, in the plan's order.
 *
 * Right-click is deliberately ABSENT rather than present-and-disabled. The plan
 * reads "Reserved. No per-row menu without a ruling", and an entry here would
 * be a binding — the honest way to record a reservation is a comment, not a row
 * that resolves to nothing.
 */
export const ROW_GESTURES: readonly RowGesture[] = [
  {
    id: 'cursor-next',
    does: 'Move the record cursor down one row',
    pointer: null,
    keys: ['j', 'ArrowDown'],
    layer: 'table',
    note:
      'Clamps at the last row. An operator holding ↓ through a 900-row queue ' +
      'must stop at the bottom, not reappear at the top having lost their place.',
  },
  {
    id: 'cursor-prev',
    does: 'Move the record cursor up one row',
    pointer: null,
    keys: ['k', 'ArrowUp'],
    layer: 'table',
  },
  { id: 'cursor-first', does: 'Jump to the first row', pointer: null, keys: ['Home'], layer: 'table' },
  { id: 'cursor-last', does: 'Jump to the last row', pointer: null, keys: ['End'], layer: 'table' },
  {
    id: 'toggle-select',
    does: 'Toggle selection on the focused row',
    pointer: 'Click',
    keys: ['x', ' '],
    layer: 'table',
  },
  {
    id: 'extend-next',
    does: 'Extend the selection down from the anchor',
    pointer: 'Shift+click',
    keys: ['shift+ArrowDown'],
    layer: 'table',
    note:
      'Shift+click and Shift+↓ are the same gesture with two input devices, so ' +
      'they resolve through one function (`selection-anchor.extendTo`). The ' +
      'span takes the TARGET row’s new state, which is what makes a ' +
      'range-DESELECT expressible.',
  },
  {
    id: 'extend-prev',
    does: 'Extend the selection up from the anchor',
    pointer: 'Shift+click',
    keys: ['shift+ArrowUp'],
    layer: 'table',
  },
  {
    id: 'select-all',
    does: 'Select every row in the current view',
    pointer: 'Header checkbox',
    keys: ['mod+a'],
    layer: 'table',
    note: 'The CURRENT view — what a filter has narrowed to, never the collection.',
  },
  {
    id: 'open-record',
    does: 'Open the record',
    pointer: 'Double-click',
    keys: ['Enter', 'o'],
    layer: 'table',
    note:
      'Enter is never wired to a destructive verb anywhere in this layer: a ' +
      'wedge scanner ends its payload with Enter.',
  },
  {
    id: 'dismiss',
    does: 'Close the open record; if none is open, clear the selection',
    pointer: null,
    keys: ['Escape'],
    layer: 'table',
    note:
      'Escape has exactly one meaning at a time — the innermost layer’s. Two ' +
      'effects in one binding is the ordering, not two meanings: it never ' +
      'clears a selection the operator can still see a form in front of.',
  },
];

const BY_ID = new Map<RowGestureId, RowGesture>(ROW_GESTURES.map((g) => [g.id, g]));

export function rowGesture(id: RowGestureId): RowGesture {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`row gesture ${id} is not declared`);
  return found;
}

/**
 * Normalize a keyboard event into this table's key spelling.
 *
 * `mod+` is ⌘ on Apple platforms and Ctrl elsewhere — one spelling in the
 * table, so a binding cannot be right on one platform and missing on the other.
 */
export function rowGestureKeyOf(event: {
  key: string;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
}): string {
  const mod = event.metaKey || event.ctrlKey ? 'mod+' : '';
  // Shift is part of the spelling only for non-character keys: `shift+x` is
  // just `X` to a scanner and to a caps-lock user, and the table binds `x`.
  const shift = event.shiftKey && event.key.length > 1 ? 'shift+' : '';
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  return `${mod}${shift}${key}`;
}

/** The gesture a key spelling resolves to in `layer`, or null. */
export function rowGestureForKey(
  spelling: string,
  layer: RowGestureLayer = 'table',
): RowGesture | null {
  const wanted = spelling.toLowerCase();
  for (const gesture of ROW_GESTURES) {
    if (gesture.layer !== layer) continue;
    if (gesture.keys.some((k) => k.toLowerCase() === wanted)) return gesture;
  }
  return null;
}
