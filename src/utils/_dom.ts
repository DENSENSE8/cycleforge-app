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

