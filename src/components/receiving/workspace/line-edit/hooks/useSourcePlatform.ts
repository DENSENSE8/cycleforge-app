'use client';

import { useCallback, useEffect, useState } from 'react';
import { useEventBridge } from '@/hooks';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import {
  detectPlatformFromUrl,
  parseReceivingPackage,
} from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { returnPlatformForSource } from '@/lib/receiving/return-platform-for-source';

/**
 * Source-platform state for a carton (platform is per-carton, not per-line).
 * Seeds synchronously from the row so the pill never flashes the fallback,
 * reconciles against the parent receiving row, auto-detects from the listing
 * URL when unset, and persists via PATCH (broadcasting
 * `receiving-package-updated` so sibling surfaces stay in sync).
 *
 * `setSourcePlatform` is returned so the panel's shared
 * `receiving-package-updated` listener can keep this in sync with edits made
 * elsewhere.
 */
export function useSourcePlatform(row: ReceivingLineRow, { listingLink }: { listingLink: string }) {
  // Seed from the row the table already loaded (`receiving_lines.source_platform`)
  // so the platform pill paints its real value immediately instead of flashing
  // the 'Unknown'/'Unfound' fallback while the reconcile fetch below is in flight.
  const [sourcePlatform, setSourcePlatform] = useState<string>(
    () => (row.source_platform || '').toLowerCase(),
  );
  const [platformSaving, setPlatformSaving] = useState(false);

  // Load the parent receiving row's source_platform so the dropdown reflects
  // the current shipment-level override. Skip the GET when the list/rail row
  // already carries a platform — opens share the siblings metadata cache and
  // must not add a third receiving_id round-trip on every line click.
  useEffect(() => {
    if (row.receiving_id == null) {
      setSourcePlatform('');
      return;
    }
    // Re-seed synchronously from the row on every line change — no empty frame.
    setSourcePlatform((row.source_platform || '').toLowerCase());
    if ((row.source_platform || '').trim()) return;
    let cancelled = false;
    fetch(`/api/receiving-lines?receiving_id=${row.receiving_id}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const pkg = parseReceivingPackage(data?.receiving_package);
        const fetched = (pkg?.source_platform || '').toLowerCase();
        // Only override with a non-empty reconcile value so we never blank the
        // already-correct seeded platform (which would re-introduce the flash).
        if (fetched) setSourcePlatform(fetched);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [row.receiving_id, row.source_platform]);

  // Mirror platform edits from Classify / claim compose (same carton).
  useEventBridge({
    'receiving-package-updated': (e) => {
      if (row.receiving_id == null) return;
      const detail = (
        e as CustomEvent<{
          receiving_id?: number;
          source_platform?: string | null;
        }>
      ).detail;
      if (!detail || detail.receiving_id !== row.receiving_id) return;
      if (detail.source_platform === undefined) return;
      setSourcePlatform((detail.source_platform || '').toLowerCase());
    },
  });

  const savePlatform = useCallback(async (
    next: string,
    opts?: { /** When the carton type is Return, also stamp return_platform / is_return. */ isReturn?: boolean },
  ) => {
    if (row.receiving_id == null) return;
    setPlatformSaving(true);
    try {
      const payload: Record<string, unknown> = { source_platform: next || null };
      if (opts?.isReturn && next) {
        const rp = returnPlatformForSource(next);
        if (rp) {
          payload.return_platform = rp;
          payload.is_return = true;
        }
      }
      const res = await fetch(`/api/receiving/${row.receiving_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      // Do not broadcast a fake success — claim subject was staying
      // "Unknown - Return" while the pill showed FBA after a 400 allowlist miss.
      if (!res.ok) return;
      window.dispatchEvent(new CustomEvent('receiving-package-updated', {
        detail: { receiving_id: row.receiving_id, ...payload },
      }));
    } catch {
      /* silent */
    } finally {
      setPlatformSaving(false);
    }
  }, [row.receiving_id]);

  // Auto-detect platform from the listing URL when the operator hasn't set one
  // yet. Only fires when sourcePlatform is empty so we never clobber a manual
  // choice. Debounced lightly so paste-then-type doesn't thrash the PATCH.
  useEffect(() => {
    if (row.receiving_id == null) return;
    if (sourcePlatform) return;
    const detected = detectPlatformFromUrl(listingLink);
    if (!detected) return;
    const t = window.setTimeout(() => {
      setSourcePlatform(detected);
      void savePlatform(detected);
    }, 350);
    return () => window.clearTimeout(t);
  }, [listingLink, sourcePlatform, row.receiving_id, savePlatform]);

  return { sourcePlatform, setSourcePlatform, platformSaving, savePlatform };
}
