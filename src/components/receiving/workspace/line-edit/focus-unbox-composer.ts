/**
 * Focus the station Unbox composer (item note). Same textarea as Ticket mode —
 * callers must switch {@link useStationComposerMode} to `unbox` first.
 */

const COMPOSER_TEXTAREA =
  '[data-testid="station-composer-host"] textarea:not([disabled])';

export function focusUnboxComposer(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.querySelector<HTMLTextAreaElement>(COMPOSER_TEXTAREA);
  if (!el) return false;
  el.focus({ preventScroll: false });
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const len = el.value.length;
  try {
    el.setSelectionRange(len, len);
  } catch {
    /* some browsers refuse setSelectionRange on a just-shown field */
  }
  return true;
}

export function scheduleFocusUnboxComposer(delayMs = 40): void {
  window.setTimeout(() => {
    focusUnboxComposer();
  }, delayMs);
}
