'use client';

/**
 * Clipboard side of a rail row's Copy verbs. Split from `rail-row-verbs`
 * (which decides WHICH items a row offers) so that module stays pure and
 * unit-testable — importing it must not drag the toaster and the DOM clipboard
 * shim into a node test.
 */

import { toast } from '@/lib/toast';
import { copyToClipboard } from '@/utils/_dom';

/** Copy one identity value, naming it in the confirmation. */
export function copyRailValue(value: string, label: string): void {
  void copyToClipboard(value, { historyKind: label }).then((ok) =>
    ok ? toast.success(`Copied ${label}`) : toast.error(`Could not copy ${label}`),
  );
}

/**
 * Hand out a link to a row's record — the platform share sheet where there is
 * one (phone / kiosk), the clipboard everywhere else.
 *
 * A cancelled share sheet is a decision, not a failure: `AbortError` returns
 * quietly rather than falling through to a clipboard write the operator did not
 * ask for. Same contract as the workspace header's own Share.
 */
export async function shareRailLink(url: string, title: string): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ title, url });
      return;
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return;
  }
  const ok = await copyToClipboard(url, { historyKind: 'link' });
  if (ok) toast.success('Link copied');
  else toast.error('Could not copy link');
}
