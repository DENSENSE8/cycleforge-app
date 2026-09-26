/** Write text to the clipboard — the ONE path, and it survives an insecure origin. */

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

/** Copy `text`, returning whether a working path was taken. */
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
