/**
 * Write text to the clipboard — the ONE path, and it survives an insecure
 * origin.
 *
 * ## Why this exists
 *
 * `navigator.clipboard` is gated on a SECURE CONTEXT. On `https://` and on
 * `http://localhost` the object is there; on a plain LAN origin it is
 * `undefined` — not "present and rejecting", *undefined*. So
 * `navigator.clipboard.writeText(…)` is not a copy that fails, it is a
 * `TypeError` that unmounts whatever rendered the chip.
 *
 * That is exactly the dogfood case for this product: a bench gun and a floor
 * tablet reach the dev/staging lane over the LAN (`dev:tunnel`, `dev:phone`,
 * the kiosk browsers), and every copyable handle in the slot-table row is a
 * copy chip. Reported 2026-09-15 from the Inventory › Stock row:
 *
 *     Cannot read properties of undefined (reading 'writeText')
 *     src/hooks/useCopyChip.ts (213:30) @ performCopy
 *
 * ## Why a FALLBACK and not a guard
 *
 * `navigator.clipboard?.writeText(…)` stops the crash and silently does
 * nothing, which is worse than it sounds: the chip still flashes "Copied", the
 * copy-history rail still records the value, and the operator pastes whatever
 * was in the buffer before. A copy affordance that lies is a data-entry bug one
 * step removed.
 *
 * `document.execCommand('copy')` is deprecated and works on insecure origins,
 * which is the whole reason to keep it: it is the only path available where the
 * async API is not. Callers get a BOOLEAN so the "Copied" feedback and the
 * history write stay attached to a copy that actually happened.
 */

/**
 * The pre-Clipboard-API path: a throwaway `<textarea>`, selected and copied
 * through the synchronous command. Off-screen rather than `display: none` —
 * a hidden element cannot hold a selection.
 */
function copyViaSelection(text: string): boolean {
  if (typeof document === 'undefined') return false;
  const area = document.createElement('textarea');
  area.value = text;
  // `readOnly` keeps a mobile keyboard from opening; `fixed` + `opacity:0`
  // keeps the page from scrolling to it. Both are load-bearing on the floor
  // tablets this path exists for.
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.left = '0';
  area.style.opacity = '0';
  area.style.pointerEvents = 'none';
  document.body.appendChild(area);
  try {
    area.select();
    area.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(area);
  }
}

/**
 * Copy `text`, returning whether a working path was taken.
 *
 * `true` means the caller may flash "Copied" and record the value. `false`
 * means neither path was available — say nothing rather than claim a copy.
 *
 * The async API is fired and not awaited (the callers are click handlers and
 * the chip's feedback is optimistic), but its rejection is caught and retried
 * through the selection path: a secure origin can still refuse on a permission
 * policy, and that is the same failure shape as an insecure one.
 */
export function writeClipboardText(text: string): boolean {
  if (!text) return false;
  const api = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
  if (typeof api?.writeText === 'function') {
    void api.writeText(text).catch(() => {
      copyViaSelection(text);
    });
    return true;
  }
  return copyViaSelection(text);
}
