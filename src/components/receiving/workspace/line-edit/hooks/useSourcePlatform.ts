'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useEventBridge } from '@/hooks';
import { receivingSiblingsQueryKey } from '@/lib/queries/receiving-queries';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import {
  detectPlatformFromUrl,
  parseReceivingPackage,
} from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { returnPlatformForSource } from '@/lib/receiving/return-platform-for-source';
import { storedOrInferredSourcePlatform } from '@/lib/marketplace-order-id';

function inferredPlatformFromRow(row: ReceivingLineRow): string {
  return storedOrInferredSourcePlatform(
    null,
    row.zoho_purchaseorder_number,
    row.zoho_purchaseorder_id,
    row.source_order_id,
  );
}

function seedPlatform(row: ReceivingLineRow): string {
  return storedOrInferredSourcePlatform(
    row.source_platform,
    row.zoho_purchaseorder_number,
    row.zoho_purchaseorder_id,
    row.source_order_id,
  );
}

/** Source-platform state for a carton (platform is per-carton, not per-line). */
export function useSourcePlatform(row: ReceivingLineRow, { listingLink }: { listingLink: string }) {
  // Seed from the row the table already loaded (`receiving_lines.source_platform`)
  // so the platform pill paints its real value immediately instead of flashing
  // the 'Unknown'/'Unfound' fallback while the reconcile fetch below is in flight.
  const [sourcePlatform, setSourcePlatform] = useState<string>(
    () => seedPlatform(row),
  );
  const [platformSaving, setPlatformSaving] = useState(false);
  const queryClient = useQueryClient();
  const autoSavedKey = useRef<string | null>(null);

  // Load the parent receiving row's source_platform so the dropdown reflects the current shipment-level override.
  useEffect(() => {
    if (row.receiving_id == null) {
      setSourcePlatform(seedPlatform(row));
      return;
    }
    // Re-seed synchronously from the row on every line change — no empty frame.
    // Order-id shape fills the pill when the carton has no stored platform.
    setSourcePlatform(seedPlatform(row));
    if ((row.source_platform || '').trim()) return;

    // The accordion's siblings query fetches this exact URL and keeps the whole envelope, `receiving_package` included.
    const cached = queryClient.getQueryData<{
      receiving_package?: unknown;
    }>(receivingSiblingsQueryKey(row.receiving_id));
    const cachedPlatform = (
      parseReceivingPackage(cached?.receiving_package)?.source_platform || ''
    ).toLowerCase();
    if (cachedPlatform) {
      setSourcePlatform(cachedPlatform);
      return;
    }

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
  }, [
    row.receiving_id,
    row.source_platform,
    row.zoho_purchaseorder_number,
    row.zoho_purchaseorder_id,
    row.source_order_id,
    queryClient,
  ]);

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
      setSourcePlatform(
        (detail.source_platform || '').toLowerCase() || inferredPlatformFromRow(row),
      );
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

  // Auto-detect platform from the order-number shape (same SoT as the `#` chip) or the listing URL when the operator hasn't set one yet.
  useEffect(() => {
    if (row.receiving_id == null) return;
    if ((row.source_platform || '').trim()) return;
    const detected = inferredPlatformFromRow(row) || detectPlatformFromUrl(listingLink);
    if (!detected) return;
    const key = `${row.receiving_id}:${detected}`;
    if (autoSavedKey.current === key) return;
    const t = window.setTimeout(() => {
      autoSavedKey.current = key;
      setSourcePlatform(detected);
      void savePlatform(detected);
    }, 350);
    return () => window.clearTimeout(t);
  }, [
    listingLink,
    row.source_platform,
    row.zoho_purchaseorder_number,
    row.zoho_purchaseorder_id,
    row.source_order_id,
    row.receiving_id,
    savePlatform,
  ]);

  return { sourcePlatform, setSourcePlatform, platformSaving, savePlatform };
}
