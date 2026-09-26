'use client';

/** Commit an inline note edit on a receiving line. */

import type { QueryClient } from '@tanstack/react-query';
import { patchReceivingLineCache } from '@/lib/queries/station-cache-patch';

interface CommitReceivingLineNoteArgs {
  queryClient: QueryClient;
  lineId: number;
  /** The value BEFORE the edit — used to roll back a failed write. */
  previous: string | null;
  next: string;
}

export async function commitReceivingLineNote({
  queryClient,
  lineId,
  previous,
  next,
}: CommitReceivingLineNoteArgs): Promise<void> {
  const value = next.trim();
  // A no-op edit must not cost a request; `LedgerCellEditor` already guards
  // this, but the write path cannot assume its only caller is that editor.
  if (value === (previous ?? '').trim()) return;

  patchReceivingLineCache(queryClient, lineId, { notes: value || null });

  try {
    const res = await fetch('/api/receiving-lines', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: lineId, notes: value }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error || `Failed to save note (${res.status})`);
    }
  } catch (err) {
    // Put the row back the way the server still sees it.
    patchReceivingLineCache(queryClient, lineId, { notes: previous });
    throw err instanceof Error ? err : new Error('Failed to save note');
  }
}
