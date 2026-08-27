/**
 * Pure helpers for the station scan-type rail (Auto + Esc release).
 * No React — unit-tested from node:test.
 */

/** Next armed type after a rail click. `'auto'` always releases to null. */
export function nextArmedMode<T extends string>(
  current: T | null,
  clicked: T | 'auto',
): T | null {
  if (clicked === 'auto') return null;
  return current === clicked ? null : clicked;
}

export function isStationScanInputFocused(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (
    target.closest('[data-station-scan-input]') != null ||
    target.hasAttribute('data-station-scan-input')
  );
}

/**
 * Esc un-arms the type rail only when:
 *   - the station scan input is focused
 *   - no overlay owns Esc
 *   - the hotkey-rebind capture is not live
 *   - a type is actually armed (Auto already → let Esc bubble)
 */
export function shouldHandleScanModeEsc(opts: {
  key: string;
  armed: boolean;
  overlayOpen: boolean;
  capturing: boolean;
  scanInputFocused: boolean;
}): boolean {
  if (opts.key !== 'Escape') return false;
  if (opts.overlayOpen || opts.capturing) return false;
  if (!opts.scanInputFocused) return false;
  return opts.armed;
}
