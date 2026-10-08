/**
 * DOM / browser environment helpers.
 * All functions guard against SSR — safe to call in server components.
 */

/**
 * Returns true when running in a browser (window is defined).
 */
function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/** Legacy `execCommand('copy')` fallback for non-secure contexts. */
function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    const sel = document.getSelection();
    const prevRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    // Restore any prior selection so the copy doesn't disturb the page.
    if (prevRange && sel) {
      sel.removeAllRanges();
      sel.addRange(prevRange);
    }
    return ok;
  } catch {
    return false;
  }
}

/** Copies text to the clipboard. */
export async function copyToClipboard(
  text: string,
  opts?: {
    recordHistory?: boolean;
    historyKind?: string;
    historyDisplay?: string;
    historySellerMessageId?: number;
  },
): Promise<boolean> {
  if (!isBrowser()) return false;
  let ok = false;
  try {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      ok = true;
    }
  } catch {
    ok = false;
  }
  // Fall back to the legacy path on a non-secure context or a clipboard throw.
  if (!ok) ok = legacyCopy(text);
  if (!ok) return false;
  if (opts?.recordHistory !== false) {
    // Lazy import keeps this SSR-safe helper free of a static React dep.
    const { recordCopy } = await import('@/lib/clipboard-history');
    recordCopy(text, {
      kind: opts?.historyKind,
      display: opts?.historyDisplay,
      sellerMessageId: opts?.historySellerMessageId,
    });
  }
  return true;
}

/**
 * Copy text that is still being fetched, from inside the click that asked for
 * it. Browsers trust a clipboard write only during the user's gesture; a write
 * made after `await fetch(…)` is refused (always in Safari, in Chrome once focus
 * has moved). Call this BEFORE the first `await`: a `ClipboardItem` holding the
 * pending text claims the gesture now and fills in when the text lands. Where
 * that API is missing, it falls back to {@link copyToClipboard} once ready.
 * Resolves false when the text rejects or every path is refused.
 */
export async function copyToClipboardWhenReady(
  text: Promise<string>,
  opts?: Parameters<typeof copyToClipboard>[1],
): Promise<boolean> {
  if (!isBrowser()) return false;
  if (window.isSecureContext && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'text/plain': text.then((t) => new Blob([t], { type: 'text/plain' })) }),
      ]);
      if (opts?.recordHistory !== false) {
        // Lazy import keeps this SSR-safe helper free of a static React dep (same as copyToClipboard).
        const { recordCopy } = await import('@/lib/clipboard-history');
        recordCopy(await text, {
          kind: opts?.historyKind,
          display: opts?.historyDisplay,
          sellerMessageId: opts?.historySellerMessageId,
        });
      }
      return true;
    } catch {
      // Refused or unsupported payload — try the plain path with the settled text.
    }
  }
  try {
    return await copyToClipboard(await text, opts);
  } catch {
    return false;
  }
}

