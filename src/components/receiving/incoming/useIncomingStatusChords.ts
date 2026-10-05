'use client';

/**
 * ⌥1–⌥N over Inbound's statuses — the sidebar paints them (ruling A4), the
 * keys stay with the ledger. One at a time; pressing the lit one clears it.
 *
 * - No pasted list: the delivery states (`?state=`), in the
 *   `incoming.pipeline` facet's order (`INCOMING_STATE_FACET`).
 * - A pasted list (`?ref_in=`): its buckets (`?recon=`, `RECON_STATUSES`
 *   order — the sidebar's `pastedListBuckets` row); a press drops the
 *   bucket's reason (`?recon_reason=`).
 */

import { useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { INCOMING_STATE_FACET } from '@/lib/receiving/incoming-delivery-state-face';
import { RECON_PARAM, RECON_REASON_PARAM, RECON_STATUSES } from '@/lib/receiving/reconcile';
import { receivingSurfaceBasePath } from '@/lib/receiving/surface-path';
import { useSegmentChords } from '@/lib/keyboard/useSegmentChords';

const STATE_PARAM = 'state';
const STATE_IDS: readonly string[] = INCOMING_STATE_FACET.map(({ state }) => state);

export function useIncomingStatusChords({
  enabled,
  reconciling,
  disabled,
}: {
  /** False where no Incoming ledger is mounted (and on the Exceptions lane). */
  enabled: boolean;
  /** A pasted list is up (`?ref_in=`). */
  reconciling: boolean;
  /** The statuses cannot filter honestly (e.g. a capped pasted list). */
  disabled: boolean;
}): void {
  const router = useRouter();
  const pathname = usePathname() || '/';

  const onToggle = useCallback(
    (id: string) => {
      // Live query string: a chord can land before `useSearchParams` re-renders.
      const params = new URLSearchParams(window.location.search);
      const param = reconciling ? RECON_PARAM : STATE_PARAM;
      if (params.get(param) === id) params.delete(param);
      else params.set(param, id);
      // A reason belongs to its status: pressing off or switching drops it.
      params.delete(RECON_REASON_PARAM);
      params.delete('page');
      const base = receivingSurfaceBasePath(pathname);
      const qs = params.toString();
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    },
    [pathname, reconciling, router],
  );

  useSegmentChords({ enabled: enabled && !disabled, tabIds: reconciling ? RECON_STATUSES : STATE_IDS, onTabChange: onToggle });
}
