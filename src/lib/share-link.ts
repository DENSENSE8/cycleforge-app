'use client';

import { toast } from '@/lib/toast';
import { copyToClipboard } from '@/utils/_dom';

/**
 * Hand out a link to a record — the platform share sheet where there is one
 * (phone / kiosk), the clipboard everywhere else.
 *
 * A cancelled share sheet is a decision, not a failure: `AbortError` returns
 * quietly rather than falling through to a clipboard write the operator did not
 * ask for.
 */
export async function shareRecordLink(url: string, title: string): Promise<void> {
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
