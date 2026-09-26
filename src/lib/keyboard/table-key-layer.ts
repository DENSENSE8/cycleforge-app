/** Table key layer — the ONE suppressor every table keybinding runs first. */

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
  /** Does the surface own keyboard focus right now? */
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

/** A binding that a scanner could impersonate: */
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
