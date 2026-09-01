/**
 * Table key layer — the ONE suppressor every table keybinding runs first.
 *
 * `docs/todo/seller-table-program-PLAN.md` §11 draws this as a flowchart and
 * the repo never built it. The finding in that section is the reason:
 *
 * > **53 files register their own window keydown listener.** The ownership
 * > *model* is already right; nothing composes it. Every feature adds listener
 * > 54 with its own copy of the guards, so precedence is decided by mount order
 * > and no file can answer "what does `x` do right now".
 *
 * This module is not the registry that fixes that (that is a bigger build). It
 * is the half that has to be shared FIRST, because the guards are where the
 * copies actually differ — and where the difference is a bug rather than a
 * style. A listener that forgets one of these does not look broken; it looks
 * fine until a scanner is used.
 *
 * ## The order, and why each step is where it is
 *
 * 1. **A typing target has focus** → yield. Reuses
 *    {@link isEditableKeyTarget}, the house predicate; never re-implement it.
 *    First because it is the only check that is true for the *user's* intent
 *    rather than the app's state.
 * 2. **An overlay is open** → yield. A dialog owns everything including Escape.
 * 3. **A scanner is armed and no modifier is held** → yield for SINGLE-KEY
 *    bindings. See {@link hasScanTarget}: a wedge scan of `SKU-1129` is
 *    otherwise ship-by, cursor-up, digits, then Enter.
 * 4. **The table owns focus** → run.
 *
 * ## Why step 4 is an accessibility obligation, not a preference
 *
 * **WCAG 2.1 SC 2.1.4** requires single-character shortcuts to be remappable,
 * switchable off, **or active only on focus**. This repo satisfies it with the
 * third option, and that is the whole reason the focus check is not optional —
 * a future "simplification" that binds these globally regresses conformance,
 * not just taste. Say so in any listener that calls this.
 *
 * Pure and DOM-light on purpose: it reads an event and two module stores, so it
 * runs under `node --test` with a hand-made event object and no jsdom.
 */

import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { hasScanTarget } from '@/lib/scan-hotkey/store';

/** The precedence stack from the plan. Innermost layer wins. */
export type TableKeyLayer = 'overlay' | 'editor' | 'form' | 'table' | 'global';

/** Ranked innermost → outermost; a lower index yields to nothing above it. */
const LAYER_RANK: Readonly<Record<TableKeyLayer, number>> = {
  overlay: 0,
  editor: 1,
  form: 2,
  table: 3,
  global: 4,
};

/** True when `a` is the same layer as `b` or nested inside it. */
export function layerWins(a: TableKeyLayer, b: TableKeyLayer): boolean {
  return LAYER_RANK[a] <= LAYER_RANK[b];
}

/** The event shape this reads — a real `KeyboardEvent` satisfies it. */
export interface TableKeyEvent {
  key: string;
  target: EventTarget | null;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  defaultPrevented?: boolean;
}

export interface TableKeyContext {
  /** Which layer the binding belongs to. */
  layer: TableKeyLayer;
  /**
   * Does the surface own keyboard focus right now?
   *
   * The caller answers — usually "focus is inside my region root". Passing a
   * constant `true` is how a binding becomes global, so it is a parameter
   * rather than something this module guesses.
   */
  ownsFocus: boolean;
  /** Is a modal / popover open above the table? Defaults to the house store. */
  overlayOpen?: boolean;
  /** Is a wedge scanner armed? Defaults to the house store. */
  scannerArmed?: boolean;
}

/** Why a key was dropped — returned so a caller can log or test the reason. */
export type TableKeySuppression =
  | 'editable-target'
  | 'overlay-open'
  | 'scanner-armed'
  | 'not-focused'
  | 'already-handled';

/** A chord is anything held with a modifier — never a bare scanner character. */
export function isModifiedKey(event: TableKeyEvent): boolean {
  return Boolean(event.metaKey || event.ctrlKey || event.altKey);
}

/**
 * A binding that a scanner could impersonate: one printable character, no
 * modifier.
 *
 * Shift does NOT count as a modifier here — a scanner emits shifted characters
 * for uppercase, so treating Shift as protection would let `SKU` through as
 * three verbs. `Shift+↑` is safe for the opposite reason: `ArrowUp` is not a
 * character a wedge can type.
 */
export function isSingleCharKey(event: TableKeyEvent): boolean {
  return !isModifiedKey(event) && event.key.length === 1;
}

/**
 * Should this binding run? Returns `null` to run, or the reason it was dropped.
 *
 * Callers read it as `if (suppressTableKey(e, ctx)) return;` — the reason is
 * there for tests and for a listener that wants to say why it did nothing.
 */
export function suppressTableKey(
  event: TableKeyEvent,
  context: TableKeyContext,
): TableKeySuppression | null {
  if (event.defaultPrevented) return 'already-handled';

  // 1. Typing wins over every binding, in every layer.
  if (isEditableKeyTarget(event.target)) return 'editable-target';

  // 2. An overlay owns everything, including Escape — unless this IS the
  //    overlay's own binding.
  const overlayOpen = context.overlayOpen ?? readOverlayOpen();
  if (overlayOpen && context.layer !== 'overlay') return 'overlay-open';

  // 3. A wedge scan must write NOTHING. Only single characters are at risk;
  //    arrows and chords are not things a scanner can type.
  const scannerArmed = context.scannerArmed ?? readScannerArmed();
  if (scannerArmed && isSingleCharKey(event)) return 'scanner-armed';

  // 4. WCAG 2.1.4 — single-character shortcuts are active only on focus.
  if (!context.ownsFocus) return 'not-focused';

  return null;
}

// The two store reads are isolated behind these so the pure predicate above can
// be exercised with explicit context and no module state.
function readOverlayOpen(): boolean {
  return hasOpenOverlay();
}

function readScannerArmed(): boolean {
  return hasScanTarget();
}
