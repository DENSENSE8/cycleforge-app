/**
 * Esc priority for the station scan bar (module singleton — one focused bar).
 *
 *   1. Preview card open → dismiss card (do not un-arm)
 *   2. Display-edit, value unchanged → leave edit (do not un-arm)
 *   3. Else Phase 1: armed type → release to Auto
 */

type ScanEscBlock = 'none' | 'preview-card' | 'display-edit';

let block: ScanEscBlock = 'none';
let handler: (() => void) | null = null;

export function setScanEscBlock(
  next: ScanEscBlock,
  onBlock?: () => void,
): void {
  block = next;
  handler = next === 'none' ? null : (onBlock ?? null);
}

/** If a block is armed, run its handler and return true (Esc consumed). */
export function consumeScanEscBlock(): boolean {
  if (block === 'none' || !handler) return false;
  const run = handler;
  run();
  return true;
}
