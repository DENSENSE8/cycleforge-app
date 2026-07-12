/**
 * Per-workstation "silent printing" switch.
 *
 * ON (default): label prints go straight to the paired WebUSB / Web Serial
 * printer with no dialog when a profile is configured.
 *
 * OFF: those silent paths are skipped and the label is handed to the browser's
 * normal print dialog (via the hidden iframe + `window.print()`), so an operator
 * can pick a printer / preview. Stored per-origin-per-device in localStorage,
 * which makes it inherently per-workstation (the same place printer profiles
 * live — see {@link ./browserPrint}).
 */

import { readMigratedItem } from '@/lib/storage/migrate-key';

const KEY = 'cf.silentPrint';
const LEGACY_KEY = 'usav.silentPrint';

/** Event dispatched on the window when the flag changes, so open settings
 *  panels / other surfaces can react without a reload. */
export const SILENT_PRINT_CHANGED_EVENT = 'cf:silent-print-changed';

export function isSilentPrintEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const v = readMigratedItem(window.localStorage, KEY, LEGACY_KEY);
    // Default ON — only an explicit "0"/"false" turns it off.
    return !(v === '0' || v === 'false');
  } catch {
    return true;
  }
}

export function setSilentPrintEnabled(on: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, on ? '1' : '0');
    window.dispatchEvent(
      new CustomEvent(SILENT_PRINT_CHANGED_EVENT, { detail: { enabled: on } }),
    );
  } catch {
    /* private mode / quota — non-fatal */
  }
}
