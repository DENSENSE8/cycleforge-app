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

/**
 * Legacy `execCommand('copy')` fallback for non-secure contexts. The async
 * Clipboard API (`navigator.clipboard`) is only defined on HTTPS / localhost —
 * over a plain-HTTP LAN IP (how the warehouse stations reach the dev/preview
 * box) it is `undefined`, so without this fallback every Copy/Share silently
 * failed. A hidden, focused textarea + `document.execCommand('copy')` still
 * works there.
 */
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

/**
 * Copies text to the clipboard. Returns true on success.
 *
 * Prefers the async Clipboard API; falls back to `execCommand('copy')` when it
 * is unavailable (non-secure context / LAN IP) or throws (permission, no focus).
 *
 * Also logs to the device clipboard history (the header clipboard popover) so
 * ad-hoc / bulk "copy all" copies show up alongside CopyChip copies. Pass
 * `recordHistory: false` for programmatic copies that shouldn't surface there.
 */
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

