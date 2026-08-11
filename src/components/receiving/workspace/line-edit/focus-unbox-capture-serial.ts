/**
 * Focus the Unbox centre capture serial input (Tags + SerialScanField row).
 *
 * Prefer the controller-active line (`data-active-step`), then the empty
 * unfound stub (`data-return-scan-capture`), then any open capture serial.
 * Optimistic — no await; call after paint / soft-replace.
 *
 * Arrow ↑/↓ while typing in a serial field steps between every mounted
 * capture serial in document order (PO lines + unfound stub). Ambient
 * `useRecordCursorKeyboard` refuses-in-input, so this owns that chord.
 */

import { getRecordCursorTop } from '@/lib/record-cursor/store';
import { setActiveSinkId } from '@/lib/station-scan-sink';

const SERIAL_INPUT_SELECTOR =
  '[data-unbox-serial-input]:not([disabled])';

const CAPTURE_SERIAL_SELECTOR =
  `[data-capture-row][data-capture-serial-open] ${SERIAL_INPUT_SELECTOR}, [data-return-scan-capture] ${SERIAL_INPUT_SELECTOR}`;

function listUnboxCaptureSerialInputs(): HTMLInputElement[] {
  if (typeof document === 'undefined') return [];
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(CAPTURE_SERIAL_SELECTOR),
  );
}

function focusInput(el: HTMLInputElement): boolean {
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return true;
}

/**
 * Select the PO line that owns this serial input (active face + sink) via the
 * sibling record cursor — same open path as ambient ↑/↓ outside inputs.
 */
function selectLineOwningSerial(el: HTMLInputElement): void {
  const row = el.closest<HTMLElement>(
    '[data-po-line-row][data-receiving-line-id]',
  );
  if (!row) return;
  const raw = row.getAttribute('data-receiving-line-id');
  const lineId = raw ? Number(raw) : NaN;
  if (!Number.isFinite(lineId) || lineId <= 0) return;
  setActiveSinkId(`po-line:${lineId}`);
  const top = getRecordCursorTop('sibling');
  // Always open — sibling publisher selects the line + schedules serial focus.
  // Intent `step` so we do not clear scanMatchedRows the way a row click does.
  top?.open(lineId, { intent: 'step', revealFoldKey: null });
}

export function focusUnboxCaptureSerial(): boolean {
  if (typeof document === 'undefined') return false;
  const el =
    document.querySelector<HTMLInputElement>(
      `[data-capture-row][data-active-step] ${SERIAL_INPUT_SELECTOR}`,
    ) ??
    document.querySelector<HTMLInputElement>(
      `[data-return-scan-capture] ${SERIAL_INPUT_SELECTOR}`,
    ) ??
    document.querySelector<HTMLInputElement>(
      `[data-capture-row][data-capture-serial-open] ${SERIAL_INPUT_SELECTOR}`,
    );
  if (!el) return false;
  return focusInput(el);
}

/** Focus the open capture serial inside a specific PO line row. */
function focusUnboxCaptureSerialInLine(lineId: number): boolean {
  if (typeof document === 'undefined' || !Number.isFinite(lineId) || lineId <= 0) {
    return false;
  }
  const row = document.querySelector<HTMLElement>(
    `[data-po-line-row][data-receiving-line-id="${lineId}"]`,
  );
  const el =
    row?.querySelector<HTMLInputElement>(
      `[data-capture-serial-open] ${SERIAL_INPUT_SELECTOR}`,
    ) ??
    row?.querySelector<HTMLInputElement>(SERIAL_INPUT_SELECTOR);
  if (!el) return false;
  return focusInput(el);
}

/**
 * Step ↑/↓ across every open capture serial. Used from SerialScanField while
 * the ambient record cursor stands down (typing target).
 */
export function focusUnboxCaptureSerialRelative(delta: -1 | 1): boolean {
  const inputs = listUnboxCaptureSerialInputs();
  if (inputs.length === 0) return false;
  const active = document.activeElement;
  const idx = inputs.findIndex((el) => el === active);
  const nextIdx =
    idx < 0
      ? delta > 0
        ? 0
        : inputs.length - 1
      : Math.max(0, Math.min(inputs.length - 1, idx + delta));
  if (nextIdx === idx) return false;
  const next = inputs[nextIdx];
  if (!next) return false;
  selectLineOwningSerial(next);
  return focusInput(next);
}

/** Soft delay so mount / soft-replace paint can land before focus. */
export function scheduleFocusUnboxCaptureSerial(delayMs = 60): void {
  window.setTimeout(() => {
    focusUnboxCaptureSerial();
  }, delayMs);
}

export function scheduleFocusUnboxCaptureSerialInLine(
  lineId: number,
  delayMs = 60,
): void {
  window.setTimeout(() => {
    if (!focusUnboxCaptureSerialInLine(lineId)) {
      focusUnboxCaptureSerial();
    }
  }, delayMs);
}
