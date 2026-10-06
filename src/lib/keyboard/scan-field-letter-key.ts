/**
 * A bare-letter station verb that still fires while the station's scan field
 * holds focus (Quality control's `P` = pass and print). The field is focused
 * nearly always, so the letter is taken only when the field is EMPTY, and it
 * is held for one wedge gap first: a barcode that happens to begin with that
 * letter sends its next character inside {@link WEDGE_MAX_INTER_KEY_MS}, so
 * the held letter is handed back to the field and the scan reads whole.
 * Any other editable target (notes, serial adder, search) keeps the letter.
 */

import { isEditableKeyTarget } from './is-editable-key-target';
import { WEDGE_MAX_INTER_KEY_MS } from './wedge-scan-machine';

export interface ScanFieldLetterKeyEvent {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  repeat: boolean;
  defaultPrevented: boolean;
  target: EventTarget | null;
  preventDefault(): void;
}

/** The text-holding side of the station scan field. */
export interface ScanFieldLike {
  value: string;
}

export interface ScanFieldLetterKeyOptions<Field extends ScanFieldLike> {
  /** Lowercase letter; Shift / caps (a scanner's capitals) never fire it. */
  letter: string;
  /** The station's scan field when the key landed in it, else null. */
  scanField: (target: EventTarget | null) => Field | null;
  /** Read at press time — a disabled verb lets the letter type normally. */
  enabled: () => boolean;
  onPress: () => void;
  /** Put the held letter back into the field: it opened a scanned code. */
  giveBack: (field: Field, letter: string) => void;
  gapMs?: number;
  /** Any other text field keeps the letter. Defaults to {@link isEditableKeyTarget}. */
  isEditable?: (target: EventTarget | null) => boolean;
  /** Run `run` after `ms`; returns its canceller. Injected by tests. */
  schedule?: (run: () => void, ms: number) => () => void;
}

export interface ScanFieldLetterKey {
  onKeyDown(event: ScanFieldLetterKeyEvent): void;
  dispose(): void;
}

function scheduleTimeout(run: () => void, ms: number): () => void {
  const timer = setTimeout(run, ms);
  return () => clearTimeout(timer);
}

export function createScanFieldLetterKey<Field extends ScanFieldLike>(
  opts: ScanFieldLetterKeyOptions<Field>,
): ScanFieldLetterKey {
  const gapMs = opts.gapMs ?? WEDGE_MAX_INTER_KEY_MS;
  const schedule = opts.schedule ?? scheduleTimeout;
  const isEditable = opts.isEditable ?? isEditableKeyTarget;
  let held: { field: Field | null; cancel: () => void } | null = null;

  function onKeyDown(event: ScanFieldLetterKeyEvent): void {
    if (held) {
      // Anything inside the gap means the letter began a burst, not a press.
      const { field, cancel } = held;
      held = null;
      cancel();
      if (field) opts.giveBack(field, opts.letter);
      return;
    }
    if (event.key !== opts.letter || event.repeat || event.defaultPrevented) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const field = opts.scanField(event.target);
    if (field ? field.value !== '' : isEditable(event.target)) return;
    if (!opts.enabled()) return;
    event.preventDefault();
    held = {
      field,
      cancel: schedule(() => {
        held = null;
        opts.onPress();
      }, gapMs),
    };
  }

  return {
    onKeyDown,
    dispose() {
      held?.cancel();
      held = null;
    },
  };
}
